-- Require explicit acceptance of the current SLM Transfert terms at signup.
-- Apply after deploying the matching signup screen.

alter table public.billing_accounts
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

create or replace function public.create_billing_account_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_terms_version text := nullif(btrim(coalesce(new.raw_user_meta_data->>'terms_version', '')), '');
begin
  if lower(coalesce(new.raw_user_meta_data->>'terms_accepted', 'false')) <> 'true'
     or v_terms_version is distinct from '2026-10-07-v1' then
    raise exception 'Acceptation des conditions d’utilisation requise pour créer un compte.';
  end if;

  insert into public.billing_accounts (
    user_id,
    analytics_consent,
    terms_version,
    terms_accepted_at
  ) values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'usage_analytics_consent', 'false')) = 'true',
    v_terms_version,
    now()
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
