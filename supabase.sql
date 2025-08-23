-- Supabase schema & function essentials for Flowday Telegram sync

-- Users
create table if not exists public.users (
  telegram_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  language_code text,
  tz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  auth_user_id uuid
);

-- Entries (encrypted-only). Plaintext columns removed; new deployments create encrypted columns only.
create table if not exists public.entries (
  telegram_id bigint references public.users(telegram_id) on delete cascade,
  date date not null,
  emojis_enc text,
  hue_enc text,
  song_title_enc text,
  song_artist_enc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (telegram_id, date)
);

create index if not exists entries_user_updated_idx on public.entries(telegram_id, updated_at desc);

-- Ensure usernames are unique case-insensitively when present
create unique index if not exists users_username_unique on public.users (lower(username)) where username is not null;

-- Reminders (daily + weekly) configuration
-- If migrating from earlier placeholder table, run manual ALTERs:
--   alter table public.reminders add column if not exists daily_enabled boolean not null default false;
--   alter table public.reminders add column if not exists daily_time text not null default '20:00';
--   alter table public.reminders add column if not exists weekly_enabled boolean not null default false;
--   alter table public.reminders add column if not exists weekly_day int not null default 1; -- 1=Mon (ISO)
--   alter table public.reminders add column if not exists weekly_time text not null default '18:00';
--   alter table public.reminders add column if not exists last_daily_sent date;
--   alter table public.reminders add column if not exists last_weekly_sent date;
--   alter table public.reminders drop column if exists payload;
create table if not exists public.reminders (
  telegram_id bigint primary key references public.users(telegram_id) on delete cascade,
  daily_enabled boolean not null default false,
  daily_time text not null default '20:00',      -- HH:MM 24h
  last_sent_at timestamptz,                      -- last time a reminder was sent (timestamp with timezone)
  last_daily_sent date,                          -- date (UTC) last daily reminder sent (legacy / convenience)
  last_weekly_sent date,                         -- date (UTC) last weekly recap sent
  updated_at timestamptz default now()
);
create index if not exists reminders_daily_enabled_idx on public.reminders(daily_enabled);

-- Legacy plaintext upsert function removed (encryption-only now).

-- (Optional) revoke public access if using RLS; then write RLS policies.