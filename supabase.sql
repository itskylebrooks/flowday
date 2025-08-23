-- Supabase schema & function essentials for Flowday Telegram sync

-- Users
create table if not exists public.users (
  telegram_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  language_code text,
  tz text,
  updated_at timestamptz not null default now()
);

-- Entries (encrypted-only). Plaintext columns removed; new deployments create encrypted columns only.
create table if not exists public.entries (
  telegram_id bigint references public.users(telegram_id) on delete cascade,
  date date not null,
  emojis_enc text,
  hue_enc text,
  song_title_enc text,
  song_artist_enc text,
  updated_at timestamptz not null,
  primary key (telegram_id, date)
);

create index if not exists entries_user_updated_idx on public.entries(telegram_id, updated_at desc);

-- Ensure usernames are unique case-insensitively when present
create unique index if not exists users_username_unique on public.users (lower(username)) where username is not null;

-- Reminders placeholder
create table if not exists public.reminders (
  telegram_id bigint primary key references public.users(telegram_id) on delete cascade,
  payload jsonb,
  updated_at timestamptz default now()
);

-- Legacy plaintext upsert function removed (encryption-only now).

-- (Optional) revoke public access if using RLS; then write RLS policies.