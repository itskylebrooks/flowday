<div align="center">
  <img src="public/Flowday.png" alt="Flowday" width="120" />
  <h1>Flowday</h1>
  <p><strong>Your day distilled into color, emojis, and a vibe.</strong></p>
  <p>A 20-second ritual that turns feelings into flowing visuals worth keeping and sharing.</p>
</div>

## Why Flowday?

Most journals want essays. Habit trackers reduce mood to numbers.  
**Flowday captures a visual memory thread in seconds:**

- Pick up to three emojis  
- Slide to a color  
- (Optional) Add a song title + artist  

From these tiny inputs, Flowday creates:

- Weekly flowing ribbons  
- Monthly continuous color mixes  
- Emoji constellations (your emotional sky)  
- Song Echoes (cassette-style snapshots)

No calendars. No streaks. Just ambient reflection.

## Principles

1. **Frictionless** – quicker than replying to a text.  
2. **Feels like art** – outputs look poster-ready by default.  
3. **Local-first** – entries stay on your device unless you opt in later.  
4. **Human tone** – playful, not clinical or gamified.

## Daily Flow

| Step | Action | Feedback |
|------|--------|----------|
| 1 | Tap 1–3 emojis (triangle layout) | Empty slots invite filling |
| 2 | Drag rainbow slider (unlocked after first emoji) | Aura appears; label flips to “Saved 🌈” |
| 3 | (Optional) Add song | Becomes part of Echoes as a cassette |

Edits allowed for today & yesterday only. Earlier entries are snapshots.

## Visual Surfaces

**Today** – Emoji triangle + aura gradient, calm when saved, inviting when empty.  
**Flows** –  
- Week Flow: 7 blended bands in a soft wave  
- Month Mix: a luminous ribbon, continuous color without ticks  
Both exportable as minimal posters.  

**Constellations** – Top emojis become nodes; co-occurrences connect them. Motion suggests a night sky.  

**Echoes** – Days with songs show as cassette cards. Open one for spinning reels, date stamp, title & artist.

## Sharing & Posters

Export weekly or monthly flows (PNG).  
In Telegram: share directly.  
Future: collaborative “blends” with friends — never a scrolling feed.

## Settings

- Username (auto from Telegram when inside mini app)  
- Reminders (placeholder for now)  
- Local data wipe  

## Privacy

- Entries stored locally with versioned schema  
- Invalid data sanitized  
- No network required for core use  
- Future sync (e.g. Supabase) will be optional  

```ts
// Entry structure (v2)
{
  date: 'YYYY-MM-DD',
  emojis: string[],       // max 3
  hue?: number,           // only if emojis present
  song?: { title?: string; artist?: string },
  updatedAt: number
}
```


## Tech Stack

* React + TypeScript + Vite
* Tailwind CSS
* LocalStorage with migrations
* Vitest + Testing Library
* html-to-image for exports
* Telegram Mini App wrappers (haptics, safe area, share)

## Telegram Mini App

Inside Telegram:

* SDK detection + init
* Haptics on slider hue changes
* Share posters through Telegram sheet

Outside Telegram: all enhancements no-op.

## Development

Run tests:

```bash
npm test
```

Dev server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

## Roadmap

* More poster themes
* Optional cloud sync
* Collaborative blends
* Lightweight reactions
* PWA packaging

Always under 20 seconds to capture.

## Contributing

PRs welcome — keep UI minimal, add tests for changes, avoid heavy deps.

## License

This code is provided for **personal viewing and inspiration only**.  
All rights reserved © 2025 Kyle Brooks.  

You may **not** copy, modify, redistribute, or use this project for commercial purposes without explicit permission.  

> Flowday is a daily glance inward — memory carried forward in color.
