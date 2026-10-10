-- SLM Transfert — repair referral links and make consent writes explicit.
-- Run this migration in Supabase before publishing the matching frontend.

create or replace function public.ensure_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then
    raise exception 'Connexion requise';
  end if;

  -- The defaults generate the code; the conflict clause never changes an
  -- existing role, subscription, consent or referral relationship.
  insert into public.billing_accounts (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select referral_code into v_code
    from public.billing_accounts
   where user_id = v_user
   for update;

  if v_code is null then
    update public.billing_accounts
       set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
           updated_at = now()
     where user_id = v_user
       and referral_code is null
    returning referral_code into v_code;
  end if;

  if v_code is null then
    raise exception 'Impossible de créer le code de parrainage';
  end if;
  return v_code;
end;
$$;

revoke all on function public.ensure_my_referral_code() from public, anon;
grant execute on function public.ensure_my_referral_code() to authenticated;

create or replace function public.set_usage_analytics_consent(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_enabled boolean := coalesce(p_enabled, false);
begin
  if v_user is null then
    raise exception 'Connexion requise';
  end if;

  -- Upsert so a missing legacy billing row cannot silently discard the choice.
  insert into public.billing_accounts (user_id, analytics_consent)
  values (v_user, v_enabled)
  on conflict (user_id) do update
    set analytics_consent = excluded.analytics_consent,
        updated_at = now();

  if not v_enabled then
    delete from public.user_activity_events where user_id = v_user;
  end if;
  return v_enabled;
end;
$$;

revoke all on function public.set_usage_analytics_consent(boolean) from public, anon;
grant execute on function public.set_usage_analytics_consent(boolean) to authenticated;
