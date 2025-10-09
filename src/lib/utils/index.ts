import type { CSSProperties } from 'react';
import type { Entry } from '../types/global';
import { isToday, isYesterday, todayISO } from './date';

export * from './date';

export function canEdit(iso: string): boolean {
  return isToday(iso) || isYesterday(iso);
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function hsl(h: number, s = 80, l = 55, a?: number) {
  return a == null ? `hsl(${h} ${s}% ${l}%)`
                   : `hsl(${h} ${s}% ${l}% / ${a})`;
}

export function rainbowGradientCSS(): string {
  const stops: string[] = [];
  for (let i = 0; i <= 6; i++) {
    const h = Math.round((i * 360) / 6);
    const pct = Math.round((i * 100) / 6);
    stops.push(`${hsl(h)} ${pct}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function auraBackground(hue: number): CSSProperties {
  const h1 = hue, h2 = (hue + 30) % 360, h3 = (hue + 320) % 360;
  return {
    backgroundImage:
      `radial-gradient(120px 120px at 60% 40%, ${hsl(h1,90,60,0.9)}, transparent 60%),
       radial-gradient(160px 160px at 35% 65%, ${hsl(h2,85,52,0.6)}, transparent 60%),
       radial-gradient(220px 220px at 50% 50%, ${hsl(h3,80,48,0.5)}, transparent 60%)`,
  };
}


export function last7(entries: Entry[]): Entry[] {
  const sorted = [...entries].sort((a,b)=>b.date.localeCompare(a.date));
  return sorted.slice(0,7).reverse();
}
export function monthlyStops(entries: Entry[]): number[] {
  const ym = todayISO().slice(0,7);
  const byMonth = entries.filter((e)=>e.date.slice(0,7)===ym);
  if (!byMonth.length) return [220,300,40];
  const freq = new Map<number,number>();
  for (const e of byMonth) {
    if (typeof e.hue!=='number') continue;
    const bucket = Math.round(e.hue/15)*15;
    freq.set(bucket, (freq.get(bucket)||0)+1);
  }
  const top = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([h])=>h);
  return top.length ? top : [220,300,40];
}

// Cluster monthly hues into up to 3 color families and return representative hues (circular mean).
export function monthlyTop3(entries: Entry[], ym?: string): number[] {
  const month = ym ?? todayISO().slice(0,7);
  const byMonth = entries.filter((e)=>e.date.slice(0,7)===month && typeof e.hue === 'number');
  if (!byMonth.length) return [220,300,40];

  // Coarse bins to merge nearby hues (12 bins ~30° each)
  const BIN_SIZE = 30;
  const bins: { count: number; hues: number[] }[] = Array.from({ length: Math.floor(360 / BIN_SIZE) }, () => ({ count: 0, hues: [] }));
  for (const e of byMonth) {
    const h = (e.hue as number + 360) % 360;
    const idx = Math.floor(h / BIN_SIZE) % bins.length;
    bins[idx].count++;
    bins[idx].hues.push(h);
  }
  // Pick top 3 bins by count
  const ranked = bins
    .map((b, i) => ({ i, count: b.count, hues: b.hues }))
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  if (!ranked.length) return [220,300,40];

  // Circular mean per selected bin
  function circMean(hues: number[]): number {
    if (hues.length === 1) return hues[0];
    let x = 0, y = 0;
    for (const h of hues) {
      const r = (h * Math.PI) / 180;
      x += Math.cos(r);
      y += Math.sin(r);
    }
    const ang = Math.atan2(y, x) * (180 / Math.PI);
    return (ang + 360) % 360;
  }

  const reps = ranked.map(b => ({ hue: circMean(b.hues), count: b.count }));
  reps.sort((a, b) => b.count - a.count);
  return reps.map(r => r.hue);
}

export function emojiStats(entries: Entry[]) {
  const freq = new Map<string, number>();
  const pair = new Map<string, number>();
  for (const e of entries) {
    const set = Array.from(new Set(e.emojis));
    for (const emo of set) freq.set(emo, (freq.get(emo) || 0) + 1);
    for (let i = 0; i < set.length; i++) {
      for (let j = i + 1; j < set.length; j++) {
        const key = `${set[i]}__${set[j]}`;
        pair.set(key, (pair.get(key) || 0) + 1);
      }
    }
  }
  return { freq, pair };
}