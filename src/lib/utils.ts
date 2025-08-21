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