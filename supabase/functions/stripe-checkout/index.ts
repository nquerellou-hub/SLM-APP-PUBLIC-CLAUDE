import { adminClient, authenticatedUser, corsHeaders, json, requiredEnv, stripeRequest } from "../_shared/billing.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const user = await authenticatedUser(request);
    if (!user) return json({ error: "Connectez-vous à votre compte Cabpilot." }, 401);

    const admin = adminClient();
    const { data: account, error: accountError } = await admin
      .from("billing_accounts")
      .select("user_id, plan, subscription_status, stripe_customer_id, stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return json({ error: "Compte de facturation introuvable. Réessayez après une nouvelle connexion." }, 409);
    if (account.stripe_subscription_id && ["active", "trialing", "past_due"].includes(account.subscription_status)) {
      return json({ error: "Un abonnement existe déjà. Utilisez le bouton de gestion de l’abonnement." }, 409);
    }

    // V8 : formule mensuelle ou annuelle, essai gratuit pour un premier abonnement.
    let requested: { plan?: string } = {};
    try { requested = await request.json(); } catch { requested = {}; }
    const annualPrice = Deno.env.get("STRIPE_PREMIUM_ANNUAL_PRICE_ID") || "";
    const priceId = requested?.plan === "annual" && annualPrice ? annualPrice : requiredEnv("STRIPE_PREMIUM_PRICE_ID");
    const trialDays = Math.max(0, Math.min(60, Number(Deno.env.get("STRIPE_TRIAL_DAYS") ?? "14") || 0));
    const firstSubscription = !account.stripe_customer_id && !account.stripe_subscription_id;

    const baseUrl = new URL(requiredEnv("APP_BASE_URL")).origin;
    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("line_items[0][price]", priceId);
    form.set("line_items[0][quantity]", "1");
    form.set("payment_method_types[0]", "card");
    form.set("success_url", `${baseUrl}/?billing=success#premium`);
    form.set("cancel_url", `${baseUrl}/?billing=cancelled#premium`);
    if (trialDays > 0 && firstSubscription) form.set("subscription_data[trial_period_days]", String(trialDays));
    form.set("subscription_data[metadata][slm_plan]", priceId === annualPrice && annualPrice ? "annual" : "monthly");
    form.set("client_reference_id", user.id);
    form.set("metadata[slm_user_id]", user.id);
    form.set("subscription_data[metadata][slm_user_id]", user.id);
    form.set("allow_promotion_codes", "false");
    if (account.stripe_customer_id) form.set("customer", account.stripe_customer_id);
    else if (user.email) form.set("customer_email", user.email);

    const { data: pendingReward, error: rewardError } = await admin
      .from("referral_rewards")
      .select("id, checkout_session_id")
      .eq("referrer_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (rewardError) throw rewardError;

    if (pendingReward?.checkout_session_id) {
      const previous = await stripeRequest(`checkout/sessions/${pendingReward.checkout_session_id}`);
      if (previous.status === "open" && previous.url) return json({ url: previous.url });
      if (previous.status === "complete") {
        return json({ error: "Le paiement est en cours de confirmation. Actualisez votre compte dans quelques secondes." }, 409);
      }
      if (previous.status === "expired") {
        const { error } = await admin.from("referral_rewards").update({ checkout_session_id: null })
          .eq("id", pendingReward.id).eq("status", "pending").eq("checkout_session_id", pendingReward.checkout_session_id);
        if (error) throw error;
      }
    }

    if (pendingReward) {
      const coupon = Deno.env.get("STRIPE_REFERRAL_COUPON_ID");
      if (coupon) {
        form.set("discounts[0][coupon]", coupon);
        form.set("metadata[slm_referral_reward_id]", pendingReward.id);
        form.set("subscription_data[metadata][slm_referral_reward_id]", pendingReward.id);
      }
    }

    const session = await stripeRequest("checkout/sessions", "POST", form);
    if (!session.url) throw new Error("Stripe n’a pas renvoyé le lien de paiement.");

    if (pendingReward && Deno.env.get("STRIPE_REFERRAL_COUPON_ID")) {
      const { error } = await admin
        .from("referral_rewards")
        .update({ checkout_session_id: session.id })
        .eq("id", pendingReward.id)
        .eq("status", "pending")
        .is("checkout_session_id", null);
      if (error) throw error;
    }
    return json({ url: session.url });
  } catch (error) {
    console.error("stripe-checkout", error);
    return json({ error: error instanceof Error ? error.message : "Impossible de préparer le paiement." }, 500);
  }
});
