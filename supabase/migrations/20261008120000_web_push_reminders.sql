-- Per-device Web Push subscriptions and server-scheduled course reminders.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

create table if not exists public.push_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  minutes_before integer not null check (minutes_before > 0),
  due_at timestamptz not null,
  title text not null,
  body text not null,
  tag text not null,
  sent_at timestamptz,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, course_id, minutes_before)
);

create index if not exists push_reminders_due_idx
  on public.push_reminders(due_at, next_attempt_at)
  where sent_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.push_reminders enable row level security;

-- These tables are read and written only by the authenticated Edge Function
-- using the service role; no browser policy is intentionally granted.
