-- Add conversion events to the opt-in usage journal. No event is stored unless
-- the user has enabled usage statistics through set_usage_analytics_consent.
alter table public.user_activity_events
  drop constraint if exists user_activity_events_event_type_check;

alter table public.user_activity_events
  add constraint user_activity_events_event_type_check check (event_type in (
    'app_opened','page_home','page_courses','page_history','page_clients','page_plus',
    'page_factures','page_compta','page_documents','page_billing','page_settings','page_tools',
    'course_created','client_created','invoice_created','expense_created',
    'premium_promo_shown','premium_cta_clicked','premium_gate_opened','checkout_started'
  ));

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
    'course_created','client_created','invoice_created','expense_created',
    'premium_promo_shown','premium_cta_clicked','premium_gate_opened','checkout_started'
  ) then return false; end if;
  if not exists (
    select 1 from public.billing_accounts
    where user_id = v_user and analytics_consent = true
  ) then return false; end if;
  insert into public.user_activity_events (user_id, event_type) values (v_user, p_event);
  delete from public.user_activity_events where created_at < now() - interval '90 days';
  return true;
end;
$$;

revoke all on function public.track_usage_event(text) from public, anon;
grant execute on function public.track_usage_event(text) to authenticated;
