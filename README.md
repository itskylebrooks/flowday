<div align="center">
  <img src="public/Flowday.png" alt="Flowday" width="120" />
  <h1>Flowday</h1>
  <p><strong>Your day distilled into color, emojis, and a vibe.</strong></p>
  <p>A 20‑second ritual that turns feelings into flowing visuals worth keeping and sharing.</p>
</div>

## Why Flowday?

Most journals want essays. Habit trackers reduce mood to numbers.  
**Flowday captures a visual memory thread in seconds:**

- Pick up to three emojis  
- Slide to a color  
- (Optional) Add a song title + artist  

From these tiny inputs, Flowday creates:

- **Weekly flowing ribbons** (7‑day wave)  
- **Monthly continuous mixes** (a single ribbon that reflects dominant hues)  
- **Emoji constellations** (your emotional sky)  
- **Song Echoes** (cassette‑style snapshots)

No calendars. No streaks. Just ambient reflection.

## Principles

1. **Frictionless** – quicker than replying to a text.  
2. **Feels like art** – outputs look poster‑ready by default.  
3. **Local‑first** – entries stay on your device unless you opt in.  
4. **Human tone** – playful, not clinical or gamified.

## Features

- **Today** – Emoji triangle + aura; calm when saved, inviting when empty.  
- **Flows** –  
  - *Week Flow*: 7 blended bands in a soft wave.  
  - *Month Mix*: luminous ribbon weighted by hue frequency (not a timeline).  
- **Constellations** – Top emojis become nodes; co‑occurrences connect them. Opacity tracks recency.  
- **Echoes** – Days with songs show as cassette cards (title + artist).  
- **Sync (Telegram)** – Optional cloud sync keyed by Telegram ID.  
- **Reminders (Telegram)** – Server‑side daily reminder (opt‑in).  
- **Export / Import** – JSON file with all entries, user, recents, and reminder prefs.

## Privacy at a glance

- **Local‑first by default.** Cloud sync is opt‑in (Telegram only).  
- **Telegram Analytics** is anonymous and event‑only (launches, basic flows) to meet App Center requirements.  
- **You control your data.** Export anytime. Delete cloud account from Settings; local data stays unless you wipe it.

## Quickstart (development)

**Prereqs:** Node 18+, npm or pnpm, a Supabase project (free tier is fine).

1) **Clone & install**
```bash
git clone https://github.com/itskylebrooks/flowday
cd flowday
npm i
```

2) **Apply database schema (Supabase)**
- Open your Supabase SQL editor and run `supabase.sql`.  
- Row Level Security is enabled; tables: `users`, `entries`, `reminders`.

3) **Create `.env.local` (examples)**
```bash
# Supabase (client)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Telegram Mini App
BOT_TOKEN=123456:ABC...        # @BotFather token
MINIAPP_URL=https://your-app.vercel.app   # deployed URL used in the /start button
PRIVACY_URL=https://your-privacy-page     # optional

# Telegram Mini Apps Analytics (anonymous)
ANALYTICS_TOKEN=your_analytics_token
ANALYTICS_APP=your_analytics_identifier   # the app name you registered
```

4) **Run dev**
```bash
npm run dev
```

5) **Run tests**
```bash
npm test
```

## Deploy (Vercel)

1) **Add the same environment variables** in your Vercel Project → *Settings → Environment Variables*.  
2) **Deploy** (main or a preview branch).  
3) **Set Telegram webhook** to your deployed URL:
```bash
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=https://your-app.vercel.app/api/telegram/tg-webhook"
```
4) *(Optional)* **Set bot commands** (served by `api/telegram/tg-set-commands.ts` if present) or via @BotFather.  
5) **Reminders cron** – Vercel Scheduler should hit `api/reminders/cron-reminders` daily.
Example `vercel.json` entry:
```json
{
  "crons": [
    { "path": "/api/reminders/cron-reminders", "schedule": "0 18 * * *" }
  ]
}
```

## API surface (serverless)

- `POST /api/telegram/tg-webhook` – Bot webhook; replies to `/start` with “Open Flowday” button.  
- `GET/POST /api/reminders/reminders-get|reminders-set` – Read/update reminder prefs.  
- `POST /api/reminders/cron-reminders` – Sends daily reminders to opted‑in users.  
- `POST /api/sync/sync-push` – Push entries to Supabase (Telegram users).  
- `POST /api/sync/sync-pull` – Pull entries from Supabase.  
- `POST /api/share/share-poster` – Generate minimal poster from flows.

## Tech stack

- **Client:** React + TypeScript + Vite, TailwindCSS.  
- **Telegram Mini App:** WebApp integration + Bot API.  
- **Backend:** Vercel Serverless Functions.  
- **DB:** Supabase (Postgres + RLS).  
- **Analytics:** Telegram Mini Apps Analytics SDK (anonymous).

## Roadmap

- **Blends with friends** – lightweight social layer (invite, view friends’ activity, emoji reactions).  
- **Month Mix v2** – palette extraction & weighting tweaks for an even more true “mood ribbon”.  
- **Reminder upgrade** – user‑selectable reminder time instead of a fixed “evening.”  
- **Localization** – RU, DE, ES, FR.  
- **Telegram integrations** – share to Stories, quick invite links.  
- **TON exploration** – collectible visuals (Month Mix / avatar / constellations) and **blockchain‑backed backups** *(likely hashes, not full data)*.  
- **Web sync (maybe)** – evaluate simple email or OAuth in a separate web build.

Always under **20 seconds** to capture.

## Contributing

PRs welcome — keep UI minimal, add tests for changes, avoid heavy deps.  
If adding features, prefer platform‑specific folders (`components/tg`, `components/web`) over runtime `if/else`.

## License

This code is for **personal viewing and inspiration only**.  
All rights reserved © 2025 Kyle Brooks.  
No commercial use or redistribution without permission.

> Flowday is a daily glance inward — memory carried forward in color.
