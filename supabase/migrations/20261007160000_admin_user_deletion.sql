-- SLM Transfert — supprimer un compte depuis le CRM tout en conservant un journal minimisé.
-- Exécuter cette migration dans Supabase avant de déployer admin-user-action.

alter table public.admin_audit_events
  alter column actor_user_id drop not null,
  alter column target_user_id drop not null;

alter table public.admin_audit_events
  drop constraint if exists admin_audit_events_actor_user_id_fkey,
  drop constraint if exists admin_audit_events_target_user_id_fkey;

alter table public.admin_audit_events
  add constraint admin_audit_events_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null,
  add constraint admin_audit_events_target_user_id_fkey
    foreign key (target_user_id) references auth.users(id) on delete set null;

alter table public.admin_audit_events
  drop constraint if exists admin_audit_events_action_check;
alter table public.admin_audit_events
  add constraint admin_audit_events_action_check check (action in (
    'subscription_cancel_scheduled',
    'subscription_cancel_revoked',
    'user_role_changed',
    'user_deleted'
  ));
