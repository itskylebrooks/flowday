-- Migration: Ensure reminders table has daily columns and remove weekly columns
BEGIN;

-- Create table if missing (safe noop if exists)
CREATE TABLE IF NOT EXISTS public.reminders (
  telegram_id bigint PRIMARY KEY,
  daily_enabled boolean NOT NULL DEFAULT false,
  daily_time text NOT NULL DEFAULT '20:00',
  last_daily_sent date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add daily columns if missing
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS daily_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS daily_time text NOT NULL DEFAULT '20:00';
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS last_daily_sent date;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Drop weekly columns if they exist (user requested weekly removal)
ALTER TABLE public.reminders DROP COLUMN IF EXISTS weekly_enabled;
ALTER TABLE public.reminders DROP COLUMN IF EXISTS weekly_day;
ALTER TABLE public.reminders DROP COLUMN IF EXISTS weekly_time;
ALTER TABLE public.reminders DROP COLUMN IF EXISTS last_weekly_sent;

COMMIT;
