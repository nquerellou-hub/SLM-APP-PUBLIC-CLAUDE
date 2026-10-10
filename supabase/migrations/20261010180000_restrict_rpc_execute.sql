-- SLM Transfert V8.5 — recommandations de l’analyseur de sécurité Supabase.
-- create_billing_account_for_user est une fonction de déclencheur (inscription) :
-- elle n’a pas à être appelable via /rest/v1/rpc. Le déclencheur continue de fonctionner.
revoke execute on function public.create_billing_account_for_user() from public, anon, authenticated;
-- claim_referral_code exige une connexion : on retire l’accès aux visiteurs non connectés.
revoke execute on function public.claim_referral_code(text) from public, anon;
grant execute on function public.claim_referral_code(text) to authenticated;
