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
  - _Week Flow_: 7 blended bands in a soft wave.
  - _Month Mix_: luminous ribbon weighted by hue frequency (not a timeline).
- **Constellations** – Top emojis become nodes; co‑occurrences connect them. Opacity tracks recency.
- **Echoes** – Days with songs show as cassette cards (title + artist).
- **Manual transfer (Telegram)** – Copy/paste JSON between Telegram devices for manual sync.
- **Export / Import** – JSON file with all entries, user, recents, and reminder prefs.

## Privacy at a glance

- **Local‑first.** Entries and preferences stay on your device across both web and Telegram builds.
- **No analytics or trackers.** The Telegram build only talks to Telegram APIs when you share a poster.
- **You control your data.** Export or import JSON anytime, or wipe local storage from Settings.

## Quickstart (development)

**Prereqs:** Node 18+, npm or pnpm.

1. **Clone & install**

```bash
git clone https://github.com/itskylebrooks/flowday
cd flowday
npm i
```

2. **Create `.env.local` (examples)**

```bash
# Telegram Mini App
BOT_TOKEN=123456:ABC...        # @BotFather token
MINIAPP_URL=https://your-app.vercel.app   # deployed URL used in the /start button
PRIVACY_URL=https://your-privacy-page     # optional

```

3. **Run dev**

```bash
npm run dev
```

4. **Run tests**

```bash
npm test
```

5. **Validate code quality**

```bash
npm run typecheck
npm run lint
npm run format
```

## Deploy (Vercel)

1. **Add the same environment variables** in your Vercel Project → _Settings → Environment Variables_.
2. **Deploy** (main or a preview branch).
3. **Set Telegram webhook** to your deployed URL:

```bash
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=https://your-app.vercel.app/api/tg-webhook"
```

4. _(Optional)_ **Set bot commands** (served by `api/tg-set-commands.ts` if present) or via @BotFather.

## API surface (serverless)

- `POST /api/tg-webhook` – Bot webhook; replies to `/start` with “Open Flowday” button.
- `POST /api/share-poster` – Generates a Telegram-ready poster from your flows.
- `POST /api/tg-set-commands` – (Optional) helper to register basic bot commands.

## Tech stack

- **Client:** React + TypeScript + Vite, TailwindCSS.
- **Telegram Mini App:** WebApp integration + Bot API.
- **Backend:** Vercel Serverless Functions.

## Project structure

```
src/
  app/            # application shell & cross-feature hooks
  components/     # shared UI primitives
  features/       # flows, constellations, echoes, privacy
  lib/            # storage, services, utilities
  types/          # shared interfaces
```

Import helpers:

- `@/*` → `src/*`
- `@app/*`, `@features/*`, `@components/*`, `@lib/*`, `@types/*`

## Roadmap

- **Blends with friends** – lightweight social layer (invite, view friends’ activity, emoji reactions).
- **Month Mix v2** – palette extraction & weighting tweaks for an even more true “mood ribbon”.
- **Localization** – RU, DE, ES, FR.
- **Telegram integrations** – share to Stories, quick invite links.
- **TON exploration** – collectible visuals (Month Mix / avatar / constellations) and **blockchain‑backed backups** _(likely hashes, not full data)_.
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
