import { adminClient, authenticatedUser, corsHeaders, json } from "../_shared/billing.ts";

type RideInput = Record<string, unknown>;

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function validMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function ride(row: RideInput, costKm: number) {
  const revenue = number(row.prix) + number(row.pourboire);
  const commission = number(row.commission);
  const distance = number(row.km) + number(row.kmVide);
  const variableCost = distance * costKm;
  return {
    id: String(row.id || "").slice(0, 100),
    date: String(row.date || "").slice(0, 10),
    heure: String(row.heure || "").slice(0, 20),
    client_id: String(row.client || "").slice(0, 100),
    client: String(row.clientName || "Client").slice(0, 180),
    depart: String(row.depart || "").slice(0, 220),
    arrivee: String(row.arrivee || "").slice(0, 220),
    revenue,
    commission,
    distance,
    variableCost,
    margin: revenue - commission - variableCost,
  };
}

function totals(rows: ReturnType<typeof ride>[]) {
  return rows.reduce((result, row) => ({
    rides: result.rides + 1,
    revenue: result.revenue + row.revenue,
    commission: result.commission + row.commission,
    distance: result.distance + row.distance,
    variableCost: result.variableCost + row.variableCost,
    margin: result.margin + row.margin,
  }), { rides: 0, revenue: 0, commission: 0, distance: 0, variableCost: 0, margin: 0 });
}

function previousMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(year, number - 2, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthSequence(month: string, count = 6) {
  const [year, number] = month.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, number - count + index, 1, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

async function hasPremiumAccess(user: { id: string; email?: string | null }, admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin.from("billing_accounts")
    .select("plan,role,role_source,subscription_status,current_period_end")
    .eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  if (data.role === "admin") return true;
  if (data.role_source === "manual") return data.role === "premium";
  if (data.plan !== "premium" || !["active", "trialing", "past_due"].includes(data.subscription_status)) return false;
  return !data.current_period_end || new Date(data.current_period_end).getTime() > Date.now();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const user = await authenticatedUser(request);
  if (!user) return json({ error: "Connectez-vous à votre compte SLM Transfert." }, 401);

  try {
    const admin = adminClient();
    if (!await hasPremiumAccess(user, admin)) {
      return json({ error: "Cette analyse est réservée aux abonnés Premium." }, 403);
    }
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    const costKm = number(body.costKm);
    if (costKm > 100) return json({ error: "Le coût au kilomètre indiqué est invalide." }, 400);

    if (action === "course") {
      if (!body.course || typeof body.course !== "object") return json({ error: "Course manquante." }, 400);
      return json({ authorized: true, action, result: ride(body.course as RideInput, costKm) });
    }

    if (action === "client") {
      if (!Array.isArray(body.courses) || body.courses.length > 5000) return json({ error: "Liste de courses invalide." }, 400);
      const rows = (body.courses as RideInput[]).filter((row) => row.statut === "terminée").map((row) => ride(row, costKm));
      return json({ authorized: true, action, rows: rows.length, totals: totals(rows) });
    }

    if (action === "monthly") {
      if (!validMonth(body.month)) return json({ error: "Période invalide." }, 400);
      if (!Array.isArray(body.courses) || body.courses.length > 5000) return json({ error: "Liste de courses invalide." }, 400);
      const month = body.month;
      const prior = previousMonth(month);
      const trendMonths = monthSequence(month);
      const rows = (body.courses as RideInput[])
        .filter((row) => row.statut === "terminée" && typeof row.date === "string" && trendMonths.includes(String(row.date).slice(0, 7)))
        .map((row) => ride(row, costKm));
      const currentRows = rows.filter((row) => row.date.slice(0, 7) === month).sort((a, b) => b.margin - a.margin);
      const priorRows = rows.filter((row) => row.date.slice(0, 7) === prior);
      const currentTotals = totals(currentRows);
      const priorTotals = totals(priorRows);
      const trend = trendMonths.map((period) => ({ month: period, ...totals(rows.filter((row) => row.date.slice(0, 7) === period)) }));
      const clientGroups = new Map<string, ReturnType<typeof ride>[]>();
      for (const row of currentRows) {
        const key = row.client_id || row.client;
        clientGroups.set(key, [...(clientGroups.get(key) || []), row]);
      }
      const clients = [...clientGroups.entries()].map(([id, clientRows]) => ({ id, name: clientRows[0].client, ...totals(clientRows) }))
        .sort((a, b) => b.margin - a.margin).slice(0, 5);
      return json({ authorized: true, action, month, previous_month: prior, totals: currentTotals, previous_totals: priorTotals, rows: currentRows, trend, clients });
    }

    return json({ error: "Analyse Premium inconnue." }, 400);
  } catch (error) {
    console.error("premium-report", error);
    return json({ error: error instanceof Error ? error.message : "Impossible de calculer le rapport Premium." }, 500);
  }
});
