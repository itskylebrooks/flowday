-- Minimal Supabase schema for Flowday (Telegram-only, RLS enabled)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- touch_updated_at(): sets NEW.updated_at = now() on UPDATE
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- USERS
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE,
  username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique username when present
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
  ON public.users (LOWER(username))
  WHERE username IS NOT NULL;

-- Updated-at trigger for users
DROP TRIGGER IF EXISTS trg_users_touch ON public.users;
CREATE TRIGGER trg_users_touch
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();


-- ENTRIES
CREATE TABLE IF NOT EXISTS public.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  date date NOT NULL,
  emojis_enc text,
  hue_enc text,
  song_title_enc text,
  song_artist_enc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entries_user_fk FOREIGN KEY (telegram_id)
    REFERENCES public.users (telegram_id)
    ON DELETE CASCADE,
  CONSTRAINT entries_user_date_unique UNIQUE (telegram_id, date)
);

CREATE INDEX IF NOT EXISTS entries_telegram_updated_idx
  ON public.entries (telegram_id, updated_at);

DROP TRIGGER IF EXISTS trg_entries_touch ON public.entries;
CREATE TRIGGER trg_entries_touch
BEFORE UPDATE ON public.entries
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();


-- REMINDERS
CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE,
  daily_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminders_user_fk FOREIGN KEY (telegram_id)
    REFERENCES public.users (telegram_id)
    ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_reminders_touch ON public.reminders;
CREATE TRIGGER trg_reminders_touch
BEFORE UPDATE ON public.reminders
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();


-- ================================
-- Enable Row Level Security
-- ================================
ALTER TABLE public.users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (Telegram-only):
-- In practice you’ll query with the service role (bypasses RLS).
-- These are here for safety if anon key is ever exposed.

CREATE POLICY users_no_access
  ON public.users
  USING (false);

CREATE POLICY entries_no_access
  ON public.entries
  USING (false);

CREATE POLICY reminders_no_access
  ON public.reminders
  USING (false);