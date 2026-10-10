import { adminClient, authenticatedUser, corsHeaders, isAdminEmail, isAdminUser, json, requiredEnv } from "../_shared/billing.ts";

function stripeDashboardPath() {
  const key = Deno.env.get("STRIPE_SECRET_KEY") || "";
  return key.startsWith("sk_test_") ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com";
}

function stripeLinks(account: Record<string, any> | null) {
  // CRM access and account lists must keep working when Stripe links are not configured.
  if (!account || !Deno.env.get("STRIPE_SECRET_KEY")) return { customer_url: null, subscription_url: null };
  const base = stripeDashboardPath();
  return {
    customer_url: account.stripe_customer_id ? `${base}/customers/${encodeURIComponent(account.stripe_customer_id)}` : null,
    subscription_url: account.stripe_subscription_id ? `${base}/subscriptions/${encodeURIComponent(account.stripe_subscription_id)}` : null,
  };
}

async function overview(admin: ReturnType<typeof adminClient>, body: Record<string, any>) {
  const page = Math.max(1, Math.floor(Number(body.page) || 1));
  const perPage = 50;
  const { data: userPage, error: userError } = await admin.auth.admin.listUsers({ page, perPage });
  if (userError) throw userError;
  const users = userPage.users || [];
  const ids = users.map((user) => user.id);

  const last7Days = new Date(Date.now() - 7 * 86400000).toISOString();
  const last30Days = new Date(Date.now() - 30 * 86400000).toISOString();
  const [accountResult, referredResult, userCountResult, premiumCountResult, pendingRewardResult, appliedRewardResult, paidPremiumResult, manualPremiumResult, signups7Result, signups30Result, consentCountResult, funnelEventsResult] = await Promise.all([
    ids.length ? admin.from("billing_accounts").select("user_id,plan,role,role_source,role_updated_at,role_updated_by,subscription_status,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id,referral_code,referred_by_user_id,referral_qualified_at,analytics_consent").in("user_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("billing_accounts").select("user_id,referred_by_user_id").in("referred_by_user_id", ids) : Promise.resolve({ data: [], error: null }),
    admin.from("billing_accounts").select("user_id", { count: "exact", head: true }),
    admin.from("billing_accounts").select("user_id", { count: "exact", head: true }).eq("role", "premium"),
    admin.from("referral_rewards").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("referral_rewards").select("id", { count: "exact", head: true }).eq("status", "applied"),
    admin.from("billing_accounts").select("user_id", { count: "exact", head: true }).eq("role", "premium").eq("role_source", "stripe").in("subscription_status", ["active", "trialing", "past_due"]),
    admin.from("billing_accounts").select("user_id", { count: "exact", head: true }).eq("role", "premium").eq("role_source", "manual"),
    admin.from("billing_accounts").select("user_id", { count: "exact", head: true }).gte("created_at", last7Days),
    admin.from("billing_accounts").select("user_id", { count: "exact", head: true }).gte("created_at", last30Days),
    admin.from("billing_accounts").select("user_id", { count: "exact", head: true }).eq("analytics_consent", true),
    admin.from("user_activity_events").select("user_id,event_type,created_at").gte("created_at", last30Days).in("event_type", ["page_billing", "premium_cta_clicked", "premium_gate_opened", "checkout_started"]).limit(10000),
  ]);
  for (const result of [accountResult, referredResult, userCountResult, premiumCountResult, pendingRewardResult, appliedRewardResult, paidPremiumResult, manualPremiumResult, signups7Result, signups30Result, consentCountResult, funnelEventsResult]) {
    if (result.error) throw result.error;
  }

  const accounts = new Map((accountResult.data || []).map((row: Record<string, any>) => [row.user_id, row]));
  const referralCounts = new Map<string, number>();
  for (const row of referredResult.data || []) {
    referralCounts.set(row.referred_by_user_id, (referralCounts.get(row.referred_by_user_id) || 0) + 1);
  }
  const funnel = new Map<string, Set<string>>();
  for (const row of funnelEventsResult.data || []) {
    if (!funnel.has(row.event_type)) funnel.set(row.event_type, new Set());
    funnel.get(row.event_type)!.add(row.user_id);
  }
  const funnelUsers = {
    billing_views: funnel.get("page_billing")?.size || 0,
    premium_intent: new Set([
      ...(funnel.get("premium_cta_clicked") || []),
      ...(funnel.get("premium_gate_opened") || []),
    ]).size,
    checkout_started: funnel.get("checkout_started")?.size || 0,
  };
  const rows = users.map((user) => {
    const account = accounts.get(user.id) || null;
    return {
      id: user.id,
      email: user.email || "",
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      email_confirmed_at: user.email_confirmed_at,
      account,
      referral_count: referralCounts.get(user.id) || 0,
      ...stripeLinks(account),
    };
  });

  return json({
    is_admin: true,
    page,
    per_page: perPage,
    has_more: users.length === perPage,
    summary: {
      users: userCountResult.count || 0,
      premium: premiumCountResult.count || 0,
      premium_paid: paidPremiumResult.count || 0,
      premium_manual: manualPremiumResult.count || 0,
      referrals_pending: pendingRewardResult.count || 0,
      months_applied: appliedRewardResult.count || 0,
      signups_7d: signups7Result.count || 0,
      signups_30d: signups30Result.count || 0,
      analytics_opt_in: consentCountResult.count || 0,
      funnel_users: funnelUsers,
      funnel_window_days: 30,
    },
    users: rows,
  });
}

async function userDetail(admin: ReturnType<typeof adminClient>, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Identifiant utilisateur invalide." }, 400);
  const [{ data: authResult, error: authError }, { data: account, error: accountError }, { data: rewards, error: rewardsError }, { data: referrals, error: referralsError }, { data: events, error: eventsError }, { data: audits, error: auditError }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("billing_accounts").select("user_id,plan,role,role_source,role_updated_at,role_updated_by,subscription_status,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id,stripe_price_id,referral_code,referred_by_user_id,referral_qualified_at,analytics_consent,created_at,updated_at").eq("user_id", userId).maybeSingle(),
    admin.from("referral_rewards").select("id,referred_user_id,qualifying_invoice_id,status,created_at,applied_at").eq("referrer_user_id", userId).order("created_at", { ascending: false }).limit(100),
    admin.from("billing_accounts").select("user_id,plan,role,subscription_status,referred_by_user_id,referral_qualified_at,created_at").eq("referred_by_user_id", userId).order("created_at", { ascending: false }).limit(100),
    admin.from("user_activity_events").select("event_type,created_at").eq("user_id", userId).gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString()).order("created_at", { ascending: false }).limit(100),
    admin.from("admin_audit_events").select("actor_user_id,action,details,created_at").eq("target_user_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);
  for (const error of [authError, accountError, rewardsError, referralsError, eventsError, auditError]) if (error) throw error;
  if (!authResult.user) return json({ error: "Compte introuvable." }, 404);
  return json({
    user: {
      id: authResult.user.id,
      email: authResult.user.email || "",
      created_at: authResult.user.created_at,
      last_sign_in_at: authResult.user.last_sign_in_at,
      email_confirmed_at: authResult.user.email_confirmed_at,
    },
    protected_admin: isAdminEmail(authResult.user.email),
    account,
    ...stripeLinks(account),
    rewards: rewards || [],
    referrals: referrals || [],
    activity: events || [],
    admin_actions: audits || [],
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const user = await authenticatedUser(request);
  if (!user) return json({ error: "Connectez-vous à votre compte administrateur." }, 401);
  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
    if (!await isAdminUser(user, admin)) return json({ error: "Accès administrateur refusé." }, 403);
  } catch (error) {
    console.error("admin-crm authorization", error);
    return json({ error: "Impossible de vérifier les droits administrateur." }, 500);
  }

  let body: Record<string, any> = {};
  try { body = await request.json(); } catch { return json({ error: "Requête invalide." }, 400); }
  if (body.mode === "check") return json({ is_admin: true });

  try {
    if (body.mode === "user") return await userDetail(admin, String(body.user_id || ""));
    return await overview(admin, body);
  } catch (error) {
    console.error("admin-crm", error);
    const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const message = error instanceof Error ? error.message : typeof details.message === "string" ? details.message : "";
    const extra = [details.details, details.hint].filter((value): value is string => typeof value === "string" && !!value.trim());
    const code = typeof details.code === "string" ? ` [${details.code}]` : "";
    return json({ error: message ? `${message}${code}${extra.length ? ` — ${extra.join(" — ")}` : ""}` : "Impossible de charger le CRM. Consulte les journaux Supabase de admin-crm." }, 500);
  }
});
