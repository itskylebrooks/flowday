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

-- Entries (unique per day per user)
create table if not exists public.entries (
  telegram_id bigint references public.users(telegram_id) on delete cascade,
  date date not null,
  emojis text[] not null default array[]::text[],
  hue int,
  song_title text,
  song_artist text,
  updated_at timestamptz not null,
  primary key (telegram_id, date),
  check (array_length(emojis,1) <= 3),
  check (hue is null or (hue >= 0 and hue <= 360))
);

create index if not exists entries_user_updated_idx on public.entries(telegram_id, updated_at desc);

-- Reminders placeholder
create table if not exists public.reminders (
  telegram_id bigint primary key references public.users(telegram_id) on delete cascade,
  payload jsonb,
  updated_at timestamptz default now()
);

-- Newer-wins upsert function
create or replace function public.flowday_upsert_entries(p_user bigint, p_rows jsonb)
returns void language plpgsql as $$
declare r jsonb; begin
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.entries(telegram_id, date, emojis, hue, song_title, song_artist, updated_at)
    values (
      p_user,
      (r->>'date')::date,
      coalesce((select array(select jsonb_array_elements_text(r->'emojis'))), array[]::text[]),
      case when (r ? 'hue') then (r->>'hue')::int else null end,
      nullif(r->>'song_title',''),
      nullif(r->>'song_artist',''),
      (r->>'updated_at')::timestamptz
    )
    on conflict (telegram_id, date) do update set
      emojis = excluded.emojis,
      hue = excluded.hue,
      song_title = excluded.song_title,
      song_artist = excluded.song_artist,
      updated_at = excluded.updated_at
    where excluded.updated_at > public.entries.updated_at;
  end loop;
end; $$;

-- (Optional) revoke public access if using RLS; then write RLS policies.