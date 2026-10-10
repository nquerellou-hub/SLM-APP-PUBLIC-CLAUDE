-- SLM Transfert — user access roles and manual grants
-- Roles are changed only by authenticated, server-authorized Edge Functions.

alter table public.billing_accounts
  add column if not exists role text not null default 'free',
  add column if not exists role_source text not null default 'stripe',
  add column if not exists role_updated_at timestamptz,
  add column if not exists role_updated_by uuid references auth.users(id) on delete set null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_accounts'::regclass
      and conname = 'billing_accounts_role_check'
  ) then
    alter table public.billing_accounts
      add constraint billing_accounts_role_check check (role in ('free', 'premium', 'admin'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_accounts'::regclass
      and conname = 'billing_accounts_role_source_check'
  ) then
    alter table public.billing_accounts
      add constraint billing_accounts_role_source_check check (role_source in ('stripe', 'manual'));
  end if;
end;
$migration$;

-- Keep existing paid accounts in sync with their current Stripe entitlement.
update public.billing_accounts
set role = case
      when plan = 'premium'
       and subscription_status in ('active', 'trialing', 'past_due')
       and (current_period_end is null or current_period_end > now())
      then 'premium'
      else 'free'
    end
where role_source = 'stripe';

create index if not exists billing_accounts_role_idx on public.billing_accounts (role);

-- Preserve the account already configured as the project owner in SLM_ADMIN_EMAILS.
update public.billing_accounts as account
set role = 'admin', role_source = 'manual', role_updated_at = now()
from auth.users as auth_user
where account.user_id = auth_user.id
  and lower(auth_user.email) = 'nquerellou@gmail.com';

alter table public.admin_audit_events
  drop constraint if exists admin_audit_events_action_check;
alter table public.admin_audit_events
  add constraint admin_audit_events_action_check check (action in (
    'subscription_cancel_scheduled',
    'subscription_cancel_revoked',
    'user_role_changed'
  ));
