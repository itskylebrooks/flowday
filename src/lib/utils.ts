export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isToday(iso: string) { return iso === todayISO(); }
export function isYesterday(iso: string) { return iso === addDays(todayISO(), -1); }
export function canEdit(iso: string) { return isToday(iso) || isYesterday(iso); }

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

export function auraBackground(hue: number): React.CSSProperties {
  const h1 = hue, h2 = (hue + 30) % 360, h3 = (hue + 320) % 360;
  return {
    backgroundImage:
      `radial-gradient(120px 120px at 60% 40%, ${hsl(h1,90,60,0.9)}, transparent 60%),
       radial-gradient(160px 160px at 35% 65%, ${hsl(h2,85,52,0.6)}, transparent 60%),
       radial-gradient(220px 220px at 50% 50%, ${hsl(h3,80,48,0.5)}, transparent 60%)`,
  };
}