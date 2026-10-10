-- SLM Transfert — Stripe subscriptions and referral rewards
-- Run once in the Supabase SQL editor before deploying the Edge Functions.

create table if not exists public.billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  subscription_status text not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  has_paid_subscription boolean not null default false,
  analytics_consent boolean not null default false,
  referral_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  referred_by_user_id uuid references public.billing_accounts(user_id) on delete set null,
  referral_qualified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_accounts add column if not exists has_paid_subscription boolean not null default false;
alter table public.billing_accounts add column if not exists analytics_consent boolean not null default false;

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.billing_accounts(user_id) on delete cascade,
  referred_user_id uuid not null unique references public.billing_accounts(user_id) on delete cascade,
  qualifying_invoice_id text not null unique,
  stripe_subscription_id text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled')),
  checkout_session_id text unique,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'app_opened','page_home','page_courses','page_history','page_clients','page_plus',
    'page_factures','page_compta','page_documents','page_billing','page_settings','page_tools',
    'course_created','client_created','invoice_created','expense_created'
  )),
  created_at timestamptz not null default now()
);

create index if not exists user_activity_events_user_created_idx
  on public.user_activity_events (user_id, created_at desc);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('subscription_cancel_scheduled','subscription_cancel_revoked')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.create_billing_account_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.billing_accounts (user_id, analytics_consent)
  values (new.id, lower(coalesce(new.raw_user_meta_data->>'usage_analytics_consent', 'false')) = 'true')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_billing_account_after_signup on auth.users;
create trigger create_billing_account_after_signup
  after insert on auth.users
  for each row execute procedure public.create_billing_account_for_user();

insert into public.billing_accounts (user_id)
select id from auth.users
on conflict (user_id) do nothing;

alter table public.billing_accounts enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.user_activity_events enable row level security;
alter table public.admin_audit_events enable row level security;

revoke all on public.billing_accounts from anon, authenticated;
revoke all on public.referral_rewards from anon, authenticated;
revoke all on public.stripe_webhook_events from anon, authenticated;
revoke all on public.user_activity_events from anon, authenticated;
revoke all on public.admin_audit_events from anon, authenticated;
grant select on public.billing_accounts to authenticated;
grant select on public.referral_rewards to authenticated;
grant all on public.billing_accounts, public.referral_rewards, public.stripe_webhook_events to service_role;
grant all on public.user_activity_events, public.admin_audit_events to service_role;

drop policy if exists "read own billing account" on public.billing_accounts;
create policy "read own billing account"
  on public.billing_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "read own referral rewards" on public.referral_rewards;
create policy "read own referral rewards"
  on public.referral_rewards for select to authenticated
  using ((select auth.uid()) = referrer_user_id);

create or replace function public.set_usage_analytics_consent(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  update public.billing_accounts
     set analytics_consent = coalesce(p_enabled, false), updated_at = now()
   where user_id = v_user;
  if not coalesce(p_enabled, false) then
    delete from public.user_activity_events where user_id = v_user;
  end if;
  return coalesce(p_enabled, false);
end;
$$;

revoke all on function public.set_usage_analytics_consent(boolean) from public, anon;
grant execute on function public.set_usage_analytics_consent(boolean) to authenticated;

create or replace function public.track_usage_event(p_event text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;
  if coalesce(p_event, '') not in (
    'app_opened','page_home','page_courses','page_history','page_clients','page_plus',
    'page_factures','page_compta','page_documents','page_billing','page_settings','page_tools',
    'course_created','client_created','invoice_created','expense_created'
  ) then return false; end if;
  if not exists (select 1 from public.billing_accounts where user_id = v_user and analytics_consent = true) then
    return false;
  end if;
  insert into public.user_activity_events (user_id, event_type) values (v_user, p_event);
  delete from public.user_activity_events where created_at < now() - interval '90 days';
  return true;
end;
$$;

revoke all on function public.track_usage_event(text) from public, anon;
grant execute on function public.track_usage_event(text) to authenticated;

create or replace function public.claim_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_referrer uuid;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'Connexion requise';
  end if;

  select user_id into v_referrer
    from public.billing_accounts
   where referral_code = upper(trim(coalesce(p_code, '')));

  if v_referrer is null then
    return jsonb_build_object('ok', false, 'message', 'Ce code de parrainage est introuvable.');
  end if;
  if v_referrer = v_user then
    return jsonb_build_object('ok', false, 'message', 'Vous ne pouvez pas utiliser votre propre code.');
  end if;

  select referred_by_user_id into v_existing
    from public.billing_accounts
   where user_id = v_user
   for update;

  if v_existing is not null then
    if v_existing = v_referrer then
      return jsonb_build_object('ok', true, 'message', 'Ce parrainage est déjà enregistré.');
    end if;
    return jsonb_build_object('ok', false, 'message', 'Un seul parrain peut être associé à un compte.');
  end if;

  update public.billing_accounts
     set referred_by_user_id = v_referrer, updated_at = now()
   where user_id = v_user
     and plan = 'free'
     and stripe_subscription_id is null
     and has_paid_subscription = false
     and referral_qualified_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Le parrainage doit être enregistré avant le premier abonnement.');
  end if;

  return jsonb_build_object('ok', true, 'message', 'Parrainage enregistré.');
end;
$$;

revoke all on function public.claim_referral_code(text) from public;
grant execute on function public.claim_referral_code(text) to authenticated;

create or replace function public.grant_referral_reward_for_first_paid_invoice(
  p_user_id uuid,
  p_invoice_id text,
  p_subscription_id text,
  p_amount_paid bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_referrer uuid;
  v_reward_id uuid;
begin
  if p_amount_paid is null or p_amount_paid <= 0 then
    return jsonb_build_object('granted', false, 'reason', 'invoice_not_paid');
  end if;

  update public.billing_accounts
     set has_paid_subscription = true, updated_at = now()
   where user_id = p_user_id;

  select referred_by_user_id into v_referrer
    from public.billing_accounts
   where user_id = p_user_id
   for update;

  if v_referrer is null then
    return jsonb_build_object('granted', false, 'reason', 'no_referrer');
  end if;

  if exists (select 1 from public.billing_accounts where user_id = p_user_id and referral_qualified_at is not null) then
    return jsonb_build_object('granted', false, 'reason', 'already_qualified');
  end if;

  insert into public.referral_rewards (
    referrer_user_id, referred_user_id, qualifying_invoice_id, stripe_subscription_id
  ) values (
    v_referrer, p_user_id, p_invoice_id, p_subscription_id
  ) on conflict (referred_user_id) do nothing
  returning id into v_reward_id;

  if v_reward_id is null then
    return jsonb_build_object('granted', false, 'reason', 'reward_exists');
  end if;

  update public.billing_accounts
     set referral_qualified_at = now(), updated_at = now()
   where user_id = p_user_id;

  return jsonb_build_object('granted', true, 'reward_id', v_reward_id, 'referrer_user_id', v_referrer);
end;
$$;

revoke all on function public.grant_referral_reward_for_first_paid_invoice(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.grant_referral_reward_for_first_paid_invoice(uuid, text, text, bigint) to service_role;
