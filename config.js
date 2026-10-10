/* SLM Transfert V8 — réglages commerciaux.
   Ces prix servent de valeur de secours. Quand la fonction Supabase « premium-prices » est déployée,
   l’application et la landing affichent automatiquement les prix réels configurés dans Stripe.
   Gardez-les identiques à vos prix Stripe pour que le prix affiché corresponde toujours au prix payé. */
const SLM_CONFIG = {
  pricing: { monthly: 9.90, annual: 89, trialDays: 14, currency: "EUR" },
  appName: "SLM Transfert"
};
