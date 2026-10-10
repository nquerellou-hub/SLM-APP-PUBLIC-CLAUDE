import { adminClient, authenticatedUser, corsHeaders, json, requiredEnv, stripeRequest } from "../_shared/billing.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const user = await authenticatedUser(request);
    if (!user) return json({ error: "Connectez-vous à votre compte Cabpilot." }, 401);
    const admin = adminClient();
    const { data: account, error } = await admin
      .from("billing_accounts")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!account?.stripe_customer_id) return json({ error: "Aucun abonnement Stripe n’est associé à ce compte." }, 404);

    const form = new URLSearchParams();
    form.set("customer", account.stripe_customer_id);
    form.set("return_url", `${new URL(requiredEnv("APP_BASE_URL")).origin}/#billing`);
    const session = await stripeRequest("billing_portal/sessions", "POST", form);
    return json({ url: session.url });
  } catch (error) {
    console.error("stripe-portal", error);
    return json({ error: error instanceof Error ? error.message : "Impossible d’ouvrir la gestion de l’abonnement." }, 500);
  }
});
