import type { Entry } from './types';

export const STORAGE_KEY = 'flowday_entries_v1';
export const RECENTS_KEY = 'flowday_recent_emojis_v1';

export function loadEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Entry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveEntries(list: Entry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function upsertEntry(list: Entry[], entry: Entry): Entry[] {
  const idx = list.findIndex((e) => e.date === entry.date);
  if (idx >= 0) {
    const updated = [...list];
    updated[idx] = entry;
    return updated;
  }
  return [...list, entry].sort((a, b) => a.date.localeCompare(b.date));
}

export function getRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function pushRecent(emoji: string) {
  const rec = getRecents();
  const next = [emoji, ...rec.filter((e) => e !== emoji)].slice(0, 24);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}