-- ================================
-- Flowday final schema (Telegram + Email)
-- Idempotent: safe to run multiple times
-- ================================

-- 0) UUID generator (usually present on Supabase)
create extension if not exists pgcrypto;

-- 1) Common helper to bump updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- 2) USERS
create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  telegram_id    bigint unique,      -- nullable: email-only users won't have it
  auth_user_id   uuid   unique,      -- Supabase Auth user.id
  email          text   unique,      -- convenience for queries
  username       text,
  first_name     text,
  last_name      text,
  language_code  text,
  tz             text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint users_identity_check check (telegram_id is not null or auth_user_id is not null)
);

-- Case-insensitive unique username (when present)
create unique index if not exists users_username_unique
  on public.users (lower(username))
  where username is not null;

-- Auto-updated timestamp
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_users_touch_updated_at') then
    create trigger trg_users_touch_updated_at
      before update on public.users
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- 3) ENTRIES (encrypted-only payload)
create table if not exists public.entries (
  id              uuid primary key default gen_random_uuid(),

  -- Either identity may own a row:
  telegram_id     bigint,
  auth_user_id    uuid,

  "date"          date not null,

  -- encrypted fields
  emojis_enc      text,
  hue_enc         text,
  song_title_enc  text,
  song_artist_enc text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- FK to users (nullable FKs; cascade deletes user’s data)
  constraint entries_telegram_fk
    foreign key (telegram_id)  references public.users(telegram_id) on delete cascade,
  constraint entries_auth_fk
    foreign key (auth_user_id) references public.users(auth_user_id) on delete cascade,

  constraint entries_identity_check check (telegram_id is not null or auth_user_id is not null)
);

-- Back-compat for your existing ON CONFLICT path (Telegram)
create unique index if not exists entries_telegram_date_unique
  on public.entries (telegram_id, "date")
  where telegram_id is not null;

-- Email users get their own uniqueness per day
create unique index if not exists entries_auth_date_unique
  on public.entries (auth_user_id, "date")
  where auth_user_id is not null;

-- Fast sync queries
create index if not exists entries_user_updated_idx
  on public.entries (telegram_id, updated_at desc);
create index if not exists entries_auth_updated_idx
  on public.entries (auth_user_id, updated_at desc);

-- Auto-updated timestamp
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_entries_touch_updated_at') then
    create trigger trg_entries_touch_updated_at
      before update on public.entries
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- 4) REMINDERS (one row per identity)
create table if not exists public.reminders (
  id              uuid primary key default gen_random_uuid(),

  telegram_id     bigint,
  auth_user_id    uuid,

  daily_enabled   boolean not null default false,
  daily_time      text    not null default '20:00',   -- HH:MM 24h (local handling is app-side)

  last_sent_at    timestamptz,
  last_daily_sent date,
  last_weekly_sent date,

  updated_at      timestamptz default now(),

  constraint reminders_telegram_fk
    foreign key (telegram_id)  references public.users(telegram_id) on delete cascade,
  constraint reminders_auth_fk
    foreign key (auth_user_id) references public.users(auth_user_id) on delete cascade,

  constraint reminders_identity_check check (telegram_id is not null or auth_user_id is not null)
);

-- Enforce single config per identity
create unique index if not exists reminders_telegram_unique
  on public.reminders (telegram_id)
  where telegram_id is not null;

create unique index if not exists reminders_auth_unique
  on public.reminders (auth_user_id)
  where auth_user_id is not null;

create index if not exists reminders_daily_enabled_idx
  on public.reminders (daily_enabled);

-- Auto-updated timestamp
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_reminders_touch_updated_at') then
    create trigger trg_reminders_touch_updated_at
      before update on public.reminders
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- ================================
-- (Optional) RLS scaffolding - enable when you’re ready
-- alter table public.users     enable row level security;
-- alter table public.entries   enable row level security;
-- alter table public.reminders enable row level security;
--
-- Policies would then use auth.uid() for email users and your
-- verified Telegram gateway for telegram_id access.
-- ================================