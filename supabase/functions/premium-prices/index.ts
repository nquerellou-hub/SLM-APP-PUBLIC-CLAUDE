// SLM Transfert V8 — prix Premium publics, lus directement dans Stripe.
// Permet à l’application et à la landing d’afficher exactement le prix qui sera facturé.
// À déployer avec --no-verify-jwt (aucune donnée personnelle n’est renvoyée).
import { corsHeaders, json, requiredEnv, stripeRequest } from "../_shared/billing.ts";

let cache: { at: number; body: Record<string, unknown> } | null = null;

async function priceAmount(id: string | undefined) {
  if (!id) return null;
  const price = await stripeRequest(`prices/${encodeURIComponent(id)}`);
  if (!price?.active || typeof price.unit_amount !== "number") return null;
  return { amount: price.unit_amount / 100, currency: String(price.currency || "eur").toUpperCase(), interval: price.recurring?.interval || "" };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  try {
    if (cache && Date.now() - cache.at < 10 * 60 * 1000) return json(cache.body);
    const [monthly, annual] = await Promise.all([
      priceAmount(requiredEnv("STRIPE_PREMIUM_PRICE_ID")),
      priceAmount(Deno.env.get("STRIPE_PREMIUM_ANNUAL_PRICE_ID") || undefined),
    ]);
    if (!monthly) return json({ error: "Prix mensuel indisponible." }, 503);
    const trialDays = Math.max(0, Math.min(60, Number(Deno.env.get("STRIPE_TRIAL_DAYS") ?? "14") || 0));
    const body = { monthly: monthly.amount, annual: annual?.amount || 0, currency: monthly.currency, trial_days: trialDays };
    cache = { at: Date.now(), body };
    return json(body);
  } catch (error) {
    console.error("premium-prices", error);
    return json({ error: "Prix indisponibles." }, 500);
  }
});
