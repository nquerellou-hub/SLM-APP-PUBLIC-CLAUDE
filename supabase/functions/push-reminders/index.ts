import webpush from "npm:web-push@3.6.7";
import { adminClient, authenticatedUser, corsHeaders, json, requiredEnv } from "../_shared/billing.ts";

const safeText = (value: unknown, max: number, fallback = "") =>
  String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const admin = adminClient();

    if (action === "dispatch") {
      const expected = requiredEnv("PUSH_CRON_SECRET");
      const received = request.headers.get("x-push-cron-secret") || "";
      if (!received || received !== expected) return json({ error: "Accès refusé." }, 401);
      return await dispatchDueReminders(admin);
    }

    const user = await authenticatedUser(request);
    if (!user) return json({ error: "Connectez-vous pour gérer les notifications." }, 401);

    if (action === "public_key") {
      return json({ public_key: requiredEnv("VAPID_PUBLIC_KEY") });
    }

    if (action === "subscribe") {
      const subscription = body.subscription;
      const endpoint = safeText(subscription?.endpoint, 2048);
      const keys = subscription?.keys || {};
      if (!endpoint.startsWith("https://") || !keys.p256dh || !keys.auth) {
        return json({ error: "L’abonnement de notifications est invalide." }, 400);
      }
      const { error } = await admin.from("push_subscriptions").upsert({
        endpoint,
        user_id: user.id,
        subscription: { endpoint, keys: { p256dh: safeText(keys.p256dh, 256), auth: safeText(keys.auth, 256) } },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json({ subscribed: true });
    }

    if (action === "unsubscribe") {
      const endpoint = safeText(body.endpoint, 2048);
      if (!endpoint.startsWith("https://")) return json({ error: "Abonnement invalide." }, 400);
      const { error } = await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
      if (error) throw error;
      return json({ unsubscribed: true });
    }

    if (action === "schedule") {
      // Reject oversize schedules before altering existing reminders: never silently truncate.
      if (!Array.isArray(body.reminders)) return json({ error: "Liste des rappels invalide." }, 400);
      if (body.reminders.length > 24000) return json({ error: "Trop de rappels (maximum 24 000). Réduisez le nombre de délais ou de courses planifiées." }, 400);
      const source = body.reminders;
      const seen = new Set<string>();
      const now = Date.now();
      const reminders = source.flatMap((item: Record<string, unknown>) => {
        if (!item || typeof item !== "object") return [];
        const dueAt = new Date(String(item.due_at || "")).getTime();
        const courseId = safeText(item.course_id, 120);
        const minutes = Number(item.minutes_before);
        if (!courseId || !Number.isInteger(minutes) || minutes < 1 || minutes > 43200 || !Number.isFinite(dueAt) || dueAt <= now + 15000 || dueAt > now + 366 * 86400000) return [];
        const key = JSON.stringify([courseId, minutes]);
        if (seen.has(key)) return [];
        seen.add(key);
        return [{
          user_id: user.id,
          course_id: courseId,
          minutes_before: minutes,
          due_at: new Date(dueAt).toISOString(),
          title: safeText(item.title, 80, "Rappel SLM Transfert"),
          body: safeText(item.body, 180, "Une course approche. Ouvrez SLM Transfert pour consulter les détails."),
          tag: safeText(item.tag, 120, `slm-${courseId}-${minutes}`),
          next_attempt_at: new Date().toISOString(),
        }];
      });

      const { error: deleteError } = await admin.from("push_reminders").delete()
        .eq("user_id", user.id).gt("due_at", new Date().toISOString());
      if (deleteError) throw deleteError;
      for (let i = 0; i < reminders.length; i += 250) {
        const { error } = await admin.from("push_reminders").upsert(reminders.slice(i, i + 250), {
          onConflict: "user_id,course_id,minutes_before",
          ignoreDuplicates: false,
        });
        if (error) throw error;
      }
      return json({ scheduled: reminders.length });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (error) {
    console.error("push-reminders", error);
    return json({ error: error instanceof Error ? error.message : "Erreur de notifications." }, 500);
  }
});

async function dispatchDueReminders(admin: ReturnType<typeof adminClient>) {
  const now = new Date();
  const expiredClaim = new Date(now.getTime() - 10 * 60000).toISOString();
  const { data: dueRows, error: selectError } = await admin.from("push_reminders")
    .select("id,user_id,course_id,minutes_before,due_at,title,body,tag,attempts")
    .is("sent_at", null).lte("due_at", now.toISOString()).lte("next_attempt_at", now.toISOString())
    .lt("attempts", 8).or(`claimed_at.is.null,claimed_at.lt.${expiredClaim}`)
    .order("due_at", { ascending: true }).limit(100);
  if (selectError) throw selectError;
  if (!dueRows?.length) return json({ sent: 0, checked: 0 });

  const ids = dueRows.map((row: { id: string }) => row.id);
  const { data: claimed, error: claimError } = await admin.from("push_reminders")
    .update({ claimed_at: now.toISOString() }).in("id", ids).is("sent_at", null)
    .or(`claimed_at.is.null,claimed_at.lt.${expiredClaim}`)
    .select("id,user_id,course_id,minutes_before,due_at,title,body,tag,attempts");
  if (claimError) throw claimError;

  const publicKey = requiredEnv("VAPID_PUBLIC_KEY");
  webpush.setVapidDetails(requiredEnv("VAPID_SUBJECT"), publicKey, requiredEnv("VAPID_PRIVATE_KEY"));
  let sent = 0;
  for (const reminder of claimed || []) {
    const { data: subscriptions, error: subsError } = await admin.from("push_subscriptions")
      .select("endpoint,subscription").eq("user_id", reminder.user_id);
    if (subsError) throw subsError;
    let delivered = 0;
    let lastError = "Aucun appareil autorisé à recevoir les notifications.";
    for (const row of subscriptions || []) {
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify({
          title: reminder.title,
          body: reminder.body,
          tag: reminder.tag,
          url: "./#agenda",
        }), { TTL: 3600, urgency: "high" });
        delivered++;
      } catch (error) {
        const status = Number((error as { statusCode?: number })?.statusCode || 0);
        lastError = safeText((error as Error)?.message || "Envoi push impossible.", 500);
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
        }
      }
    }

    if (delivered) {
      const { error } = await admin.from("push_reminders").update({ sent_at: new Date().toISOString(), claimed_at: null })
        .eq("id", reminder.id);
      if (error) throw error;
      sent++;
    } else {
      const attempts = Number(reminder.attempts || 0) + 1;
      const delayMs = Math.min(30 * 60000 * (2 ** Math.max(0, attempts - 1)), 6 * 3600000);
      const { error } = await admin.from("push_reminders").update({
        attempts,
        next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
        claimed_at: null,
        body: attempts >= 8 ? lastError.slice(0, 180) : reminder.body,
      }).eq("id", reminder.id);
      if (error) throw error;
    }
  }
  return json({ sent, checked: claimed?.length || 0 });
}
