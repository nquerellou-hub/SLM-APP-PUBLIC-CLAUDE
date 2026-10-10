import { adminClient, authenticatedUser, corsHeaders, isAdminEmail, isAdminUser, json, requiredEnv, stripeRequest } from "../_shared/billing.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const actor = await authenticatedUser(request);
  if (!actor) return json({ error: "Connectez-vous à votre compte administrateur." }, 401);

  try {
    const body = await request.json();
    const targetId = String(body.user_id || "");
    const action = String(body.action || "");
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: "Identifiant utilisateur invalide." }, 400);
    const admin = adminClient();
    if (!await isAdminUser(actor, admin)) return json({ error: "Accès administrateur refusé." }, 403);

    if (action === "delete_user") {
      if (targetId === actor.id) return json({ error: "Vous ne pouvez pas supprimer le compte de votre session." }, 409);

      const [{ data: targetResult, error: targetError }, { data: account, error: accountError }] = await Promise.all([
        admin.auth.admin.getUserById(targetId),
        admin.from("billing_accounts").select("role,role_source,plan,subscription_status,stripe_subscription_id").eq("user_id", targetId).maybeSingle(),
      ]);
      if (targetError) throw targetError;
      if (accountError) throw accountError;
      const target = targetResult.user;
      if (!target) return json({ error: "Compte introuvable." }, 404);
      if (isAdminEmail(target.email)) return json({ error: "Le compte administrateur principal est protégé." }, 409);

      const targetEmail = target.email || "";
      const confirmationEmail = String(body.confirmation_email || "").trim().toLowerCase();
      if (!targetEmail || confirmationEmail !== targetEmail.trim().toLowerCase()) {
        return json({ error: "Saisissez exactement l’adresse e-mail du compte pour confirmer sa suppression." }, 409);
      }

      const billableStatuses = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
      const localStatus = String(account?.subscription_status || "");
      const subscriptionId = account?.stripe_subscription_id || "";
      let subscriptionCancelled = false;

      if (!subscriptionId && billableStatuses.has(localStatus)) {
        return json({ error: "Un abonnement apparaît actif mais son identifiant Stripe manque. Le compte n’a pas été supprimé : vérifiez et résiliez l’abonnement dans Stripe." }, 409);
      }

      if (subscriptionId) {
        let subscription: Record<string, any> | null = null;
        try {
          subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`);
        } catch (stripeError) {
          const message = stripeError instanceof Error ? stripeError.message : "Vérification Stripe impossible.";
          if (!/no such subscription|resource_missing/i.test(message)) {
            return json({ error: `Impossible de vérifier l’abonnement Stripe ; le compte n’a pas été supprimé. ${message}` }, 502);
          }
          if (billableStatuses.has(localStatus)) {
            return json({ error: "L’abonnement semble actif dans le CRM mais est introuvable dans Stripe. Le compte n’a pas été supprimé : vérifiez Stripe avant de réessayer." }, 409);
          }
        }

        if (subscription && billableStatuses.has(String(subscription.status || ""))) {
          try {
            await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, "DELETE", undefined, `slm-admin-delete-${targetId}`);
            subscriptionCancelled = true;
          } catch (stripeError) {
            const message = stripeError instanceof Error ? stripeError.message : "Résiliation Stripe impossible.";
            return json({ error: `La résiliation Stripe a échoué ; le compte n’a pas été supprimé. ${message}` }, 502);
          }
        }
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(targetId, false);
      if (deleteError) {
        return json({
          error: `${subscriptionCancelled ? "L’abonnement Stripe a été résilié immédiatement, mais " : ""}la suppression du compte a échoué : ${deleteError.message}`,
          subscription_cancelled: subscriptionCancelled,
        }, 500);
      }

      const { error: auditError } = await admin.from("admin_audit_events").insert({
        actor_user_id: actor.id,
        target_user_id: null,
        action: "user_deleted",
        details: {
          deleted_role: account?.role || (account?.plan === "premium" ? "premium" : "free"),
          role_source: account?.role_source || null,
          stripe_subscription_cancelled: subscriptionCancelled,
        },
      });
      if (auditError) console.error("admin-user-action deletion audit", auditError);
      return json({ deleted: true, subscription_cancelled: subscriptionCancelled, audit_logged: !auditError });
    }

    if (action === "set_role") {
      const role = String(body.role || "");
      if (!["free", "premium", "admin"].includes(role)) return json({ error: "Rôle non autorisé." }, 400);
      if (targetId === actor.id) return json({ error: "Vous ne pouvez pas modifier votre propre rôle." }, 409);

      const [{ data: targetResult, error: targetError }, { data: account, error: accountError }] = await Promise.all([
        admin.auth.admin.getUserById(targetId),
        admin.from("billing_accounts").select("role,role_source,subscription_status,plan").eq("user_id", targetId).maybeSingle(),
      ]);
      if (targetError) throw targetError;
      if (accountError) throw accountError;
      if (!targetResult.user || !account) return json({ error: "Compte introuvable." }, 404);
      if (isAdminEmail(targetResult.user.email)) return json({ error: "Le compte administrateur principal est protégé." }, 409);

      const previousRole = account.role || (account.plan === "premium" ? "premium" : "free");
      const changedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await admin.from("billing_accounts").update({
        role,
        role_source: "manual",
        role_updated_at: changedAt,
        role_updated_by: actor.id,
        updated_at: changedAt,
      }).eq("user_id", targetId).select("role,role_source,role_updated_at,role_updated_by").single();
      if (updateError) throw updateError;

      const { error: auditError } = await admin.from("admin_audit_events").insert({
        actor_user_id: actor.id,
        target_user_id: targetId,
        action: "user_role_changed",
        details: { from_role: previousRole, to_role: role, from_source: account.role_source || "stripe", to_source: "manual" },
      });
      if (auditError) throw auditError;
      return json({ role: updated.role, role_source: updated.role_source, role_updated_at: updated.role_updated_at });
    }

    if (!["cancel_subscription", "uncancel_subscription"].includes(action)) return json({ error: "Action non autorisée." }, 400);
    const { data: account, error: accountError } = await admin.from("billing_accounts")
      .select("stripe_subscription_id,subscription_status,cancel_at_period_end")
      .eq("user_id", targetId).maybeSingle();
    if (accountError) throw accountError;
    if (!account?.stripe_subscription_id || !["active", "trialing", "past_due"].includes(account.subscription_status)) {
      return json({ error: "Aucun abonnement Stripe actif à modifier." }, 409);
    }

    const cancelAtPeriodEnd = action === "cancel_subscription";
    const form = new URLSearchParams({ cancel_at_period_end: String(cancelAtPeriodEnd) });
    const subscription = await stripeRequest(`subscriptions/${account.stripe_subscription_id}`, "POST", form, `slm-admin-${targetId}-${action}`);
    const { error: updateError } = await admin.from("billing_accounts").update({
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : subscription.items?.data?.[0]?.current_period_end
          ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
          : null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", targetId);
    if (updateError) throw updateError;

    const auditAction = cancelAtPeriodEnd ? "subscription_cancel_scheduled" : "subscription_cancel_revoked";
    const { error: auditError } = await admin.from("admin_audit_events").insert({
      actor_user_id: actor.id,
      target_user_id: targetId,
      action: auditAction,
      details: { subscription_id: account.stripe_subscription_id },
    });
    if (auditError) throw auditError;

    const isTest = requiredEnv("STRIPE_SECRET_KEY").startsWith("sk_test_");
    const stripeBase = isTest ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com";
    return json({
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      current_period_end: subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end || null,
      subscription_url: `${stripeBase}/subscriptions/${encodeURIComponent(account.stripe_subscription_id)}`,
    });
  } catch (error) {
    console.error("admin-user-action", error);
    return json({ error: error instanceof Error ? error.message : "Action administrateur impossible." }, 500);
  }
});
