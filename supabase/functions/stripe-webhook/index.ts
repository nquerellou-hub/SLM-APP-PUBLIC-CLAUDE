import { adminClient, corsHeaders, json, requiredEnv, stripeId, stripeRequest } from "../_shared/billing.ts";

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalSignature(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyStripeSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const parts = signature.split(",").map((item) => item.trim().split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredEnv("STRIPE_WEBHOOK_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new TextEncoder().encode(`${timestamp}.${rawBody}`);
  const expected = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, signed)));
  return signatures.some((candidate) => equalSignature(candidate, expected));
}

async function userIdForCustomer(admin: ReturnType<typeof adminClient>, customerId: string | null, metadataUserId?: string | null) {
  if (metadataUserId) return metadataUserId;
  if (!customerId) return null;
  const { data } = await admin.from("billing_accounts").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.user_id || null;
}

async function applyOnePendingReward(admin: ReturnType<typeof adminClient>, userId: string) {
  const coupon = Deno.env.get("STRIPE_REFERRAL_COUPON_ID");
  if (!coupon) return;
  const { data: account } = await admin
    .from("billing_accounts")
    .select("stripe_subscription_id, subscription_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!account?.stripe_subscription_id || account.subscription_status !== "active") return;

  const { data: reward } = await admin
    .from("referral_rewards")
    .select("id")
    .eq("referrer_user_id", userId)
    .eq("status", "pending")
    .is("checkout_session_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!reward) return;

  const subscription = await stripeRequest(`subscriptions/${account.stripe_subscription_id}`);
  const discounts = Array.isArray(subscription.discounts) ? subscription.discounts : [];
  if (discounts.length || subscription.discount) return;

  const form = new URLSearchParams();
  form.set("discounts[0][coupon]", coupon);
  form.set("proration_behavior", "none");
  await stripeRequest(`subscriptions/${account.stripe_subscription_id}`, "POST", form, `slm-referral-${reward.id}`);
  const { error } = await admin
    .from("referral_rewards")
    .update({ status: "applied", stripe_subscription_id: account.stripe_subscription_id, applied_at: new Date().toISOString() })
    .eq("id", reward.id)
    .eq("status", "pending");
  if (error) throw error;
}

async function processEvent(admin: ReturnType<typeof adminClient>, event: Record<string, any>) {
  const object = event.data?.object || {};

  if (event.type === "checkout.session.completed") {
    const userId = object.metadata?.slm_user_id || object.client_reference_id;
    const customerId = stripeId(object.customer);
    const subscriptionId = stripeId(object.subscription) || stripeId(object.parent?.subscription_details?.subscription);
    if (userId) {
      const { error } = await admin.from("billing_accounts").update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      if (error) throw error;
    }
    const rewardId = object.metadata?.slm_referral_reward_id;
    if (rewardId && object.payment_status !== "unpaid") {
      const { error } = await admin.from("referral_rewards").update({
        status: "applied",
        checkout_session_id: object.id,
        stripe_subscription_id: subscriptionId,
        applied_at: new Date().toISOString(),
      }).eq("id", rewardId).eq("status", "pending");
      if (error) throw error;
    }
    return;
  }

  if (event.type === "checkout.session.expired") {
    const rewardId = object.metadata?.slm_referral_reward_id;
    if (rewardId) {
      const { error } = await admin.from("referral_rewards").update({ checkout_session_id: null })
        .eq("id", rewardId).eq("checkout_session_id", object.id).eq("status", "pending");
      if (error) throw error;
    }
    return;
  }

  if (event.type.startsWith("customer.subscription.")) {
    const customerId = stripeId(object.customer);
    const userId = await userIdForCustomer(admin, customerId, object.metadata?.slm_user_id);
    if (!userId) return;
    const status = String(object.status || "unknown");
    const priceId = object.items?.data?.[0]?.price?.id || null;
    const periodEnd = object.current_period_end || object.items?.data?.[0]?.current_period_end || null;
    const premium = ["active", "trialing", "past_due"].includes(status);
    const { error } = await admin.from("billing_accounts").update({
      stripe_customer_id: customerId,
      stripe_subscription_id: status === "canceled" ? null : object.id,
      stripe_price_id: priceId,
      subscription_status: status,
      plan: premium ? "premium" : "free",
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: !!object.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (error) throw error;
    const { error: roleError } = await admin.from("billing_accounts").update({
      role: premium ? "premium" : "free",
      role_updated_at: new Date().toISOString(),
      role_updated_by: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("role_source", "stripe");
    if (roleError) throw roleError;
    if (status === "active") await applyOnePendingReward(admin, userId);
    return;
  }

  if (event.type === "invoice.paid") {
    const customerId = stripeId(object.customer);
    const subscriptionId = stripeId(object.subscription) || stripeId(object.parent?.subscription_details?.subscription);
    if (!subscriptionId) return;
    let userId = await userIdForCustomer(admin, customerId);
    if (!userId && subscriptionId) {
      const subscription = await stripeRequest(`subscriptions/${subscriptionId}`);
      userId = subscription.metadata?.slm_user_id || null;
      if (userId) {
        const { error } = await admin.from("billing_accounts").update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          updated_at: new Date().toISOString(),
        }).eq("user_id", userId);
        if (error) throw error;
      }
    }
    if (!userId) return;

    const result = await admin.rpc("grant_referral_reward_for_first_paid_invoice", {
      p_user_id: userId,
      p_invoice_id: String(object.id),
      p_subscription_id: subscriptionId,
      p_amount_paid: Number(object.amount_paid || 0),
    });
    if (result.error) throw result.error;
    const reward = result.data as { granted?: boolean; referrer_user_id?: string } | null;
    if (reward?.granted && reward.referrer_user_id) {
      await applyOnePendingReward(admin, reward.referrer_user_id);
    }
    await applyOnePendingReward(admin, userId);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const rawBody = await request.text();
  if (!await verifyStripeSignature(rawBody, request.headers.get("Stripe-Signature"))) {
    return json({ error: "Signature Stripe invalide." }, 400);
  }

  let event: Record<string, any>;
  try { event = JSON.parse(rawBody); } catch { return json({ error: "Événement Stripe invalide." }, 400); }

  const admin = adminClient();
  const { error: insertError } = await admin.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    status: "processing",
  });
  if (insertError?.code === "23505") {
    const { data: existing } = await admin.from("stripe_webhook_events").select("status,updated_at").eq("event_id", event.id).maybeSingle();
    if (existing?.status === "processed") return json({ received: true, duplicate: true });
    const processingAge = existing?.updated_at ? Date.now() - new Date(existing.updated_at).getTime() : Infinity;
    if (existing?.status === "processing" && processingAge < 5 * 60 * 1000) return json({ received: true, duplicate: true });
    const { error } = await admin.from("stripe_webhook_events").update({ status: "processing", updated_at: new Date().toISOString() }).eq("event_id", event.id);
    if (error) return json({ error: "Impossible de reprendre le traitement de l’événement." }, 500);
  } else if (insertError) {
    console.error("stripe event insert", insertError);
    return json({ error: "Impossible d’enregistrer l’événement Stripe." }, 500);
  }

  try {
    await processEvent(admin, event);
    const { error } = await admin.from("stripe_webhook_events").update({ status: "processed", updated_at: new Date().toISOString() }).eq("event_id", event.id);
    if (error) throw error;
    return json({ received: true });
  } catch (error) {
    console.error("stripe-webhook", event.id, error);
    await admin.from("stripe_webhook_events").update({ status: "failed", updated_at: new Date().toISOString() }).eq("event_id", event.id);
    return json({ error: "Le traitement de l’événement a échoué et sera retenté." }, 500);
  }
});
