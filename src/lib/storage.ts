import type { Entry, UserProfile, RemindersSettings } from './types';
import { clamp } from './utils';

// ---------------- Versioned Entry Storage ----------------
// Historical formats:
//  - v0 (implicit): raw Entry[] stored at legacy key (same shape as Entry, no wrapper)
//  - v1: JSON string of raw Entry[] under key 'flowday_entries_v1'
//  - v2 (current): { version:2, entries: Entry[] } under key 'flowday_entries_v2'
// Future versions can add fields; extend migrate() accordingly.

export const CURRENT_VERSION = 2 as const;
export const STORAGE_KEY = 'flowday_entries_v2';
const LEGACY_KEYS = ['flowday_entries_v1']; // oldest last

interface PersistedV2 { version: 2; entries: unknown; }
type PersistedAny = PersistedV2 | Entry[] | unknown;
type UnknownRecord = Record<string, unknown>;

function isISO(s: unknown): s is string { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

function sanitizeEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as UnknownRecord;
  if (!isISO(rec.date)) return null;
  let emojis: string[] = Array.isArray(rec.emojis) ? (rec.emojis as unknown[]) as string[] : [];
  emojis = emojis.filter(e => typeof e === 'string').map(e=>e.trim()).filter(Boolean);
  emojis = Array.from(new Set(emojis)).slice(0,3);
  let hue: number | undefined;
  if (typeof rec.hue === 'number' && emojis.length>0) {
    hue = ((clamp(Math.round(rec.hue as number), -720, 720) % 360) + 360) % 360;
  }
  const updatedAt = typeof rec.updatedAt === 'number' ? (rec.updatedAt as number) : Date.now();
  const entry: Entry = { date: rec.date as string, emojis, updatedAt };
  if (hue != null && emojis.length>0) entry.hue = hue;
  if (rec.song && typeof rec.song === 'object') {
    const songRec = rec.song as UnknownRecord;
    const t = typeof songRec.title === 'string' ? songRec.title : undefined;
    const a = typeof songRec.artist === 'string' ? songRec.artist : undefined;
    if ((t && t.length) || (a && a.length)) entry.song = { title: t, artist: a };
  }
  return entry;
}

function migrate(persisted: PersistedAny): Entry[] {
  // Detect wrapper version
  if (persisted && typeof persisted === 'object' && 'version' in (persisted as UnknownRecord)) {
    const v = (persisted as UnknownRecord).version as number | undefined;
    if (v === 2) {
      const listRaw = (persisted as UnknownRecord).entries;
      const list = Array.isArray(listRaw) ? listRaw : [];
      return (list as unknown[]).map(sanitizeEntry).filter(Boolean) as Entry[];
    }
    // Unknown newer version: best-effort entries extraction
    const ent = (persisted as UnknownRecord).entries;
    if (Array.isArray(ent)) {
      return (ent as unknown[]).map(sanitizeEntry).filter(Boolean) as Entry[];
    }
    return [];
  }
  // Legacy raw array (v0/v1)
  if (Array.isArray(persisted)) {
    return persisted.map(sanitizeEntry).filter(Boolean) as Entry[];
  }
  return [];
}

function persist(entries: Entry[]) {
  const payload: PersistedV2 = { version: CURRENT_VERSION, entries: [...entries].sort((a,b)=>a.date.localeCompare(b.date)) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadEntries(): Entry[] {
  // Try current
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedAny;
      const migrated = migrate(parsed);
      persist(migrated); // self-heal formatting
      return migrated;
    }
  } catch { /* ignore */ }
  // Legacy keys
  for (const k of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as PersistedAny;
      const migrated = migrate(parsed);
      persist(migrated);
      try { localStorage.removeItem(k); } catch { /* ignore */ }
      return migrated;
    } catch { /* keep trying */ }
  }
  return [];
}

export function saveEntries(list: Entry[]) {
  persist(list);
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('flowday:entries-updated', { detail: { entries: list } }));
    }
  } catch { /* ignore */ }
}
export const RECENTS_KEY = 'flowday_recent_emojis_v1';
export const USER_KEY = 'flowday_user_v1';
export const REMINDERS_KEY = 'flowday_reminders_v1';

// ---------------------------------------------------------

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

// --- User profile persistence ---
export function loadUser(): UserProfile {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return createDefaultUser();
  const obj: unknown = JSON.parse(raw);
  if (!obj || typeof obj !== 'object') return createDefaultUser();
  const rec = obj as Partial<UserProfile> & Record<string, unknown>;
  const username = sanitizeUsername(typeof rec.username === 'string' ? rec.username : '');
  const createdAt = typeof rec.createdAt === 'number' ? rec.createdAt : Date.now();
  const updatedAt = typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now();
    return { username, createdAt, updatedAt };
  } catch {
    return createDefaultUser();
  }
}

export function saveUser(profile: UserProfile) {
  const safe: UserProfile = {
    username: sanitizeUsername(profile.username),
    createdAt: profile.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  localStorage.setItem(USER_KEY, JSON.stringify(safe));
  return safe;
}

function createDefaultUser(): UserProfile {
  const now = Date.now();
  // Attempt to derive username from Telegram WebApp context if present
  let base = 'user';
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { username?: string } } } } }).Telegram?.WebApp;
    const tgUser = tg?.initDataUnsafe?.user;
    if (tgUser && tgUser.username) {
      base = sanitizeUsername(tgUser.username);
    }
  } catch { /* ignore */ }
  const user: UserProfile = { username: base, createdAt: now, updatedAt: now };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

function sanitizeUsername(name: string): string {
  if (typeof name !== 'string') return 'user';
  // allow letters, numbers, underscore, dash; collapse spaces to dash
  let cleaned = name.trim().replace(/\s+/g, '-').toLowerCase();
  cleaned = cleaned.replace(/[^a-z0-9_-]/g, '');
  if (!cleaned) cleaned = 'user';
  return cleaned.slice(0, 24);
}

// --- Reminders persistence ---
function defaultReminders(): RemindersSettings {
  return {
    dailyEnabled: false,
    dailyTime: '20:00',
    timeFormat: '24',
    updatedAt: Date.now(),
  };
}

export function loadReminders(): RemindersSettings {
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    if (!raw) return defaultReminders();
    const obj = JSON.parse(raw) as Partial<RemindersSettings>;
    const base = defaultReminders();
    const merged: RemindersSettings = {
      dailyEnabled: typeof obj.dailyEnabled === 'boolean' ? obj.dailyEnabled : base.dailyEnabled,
      dailyTime: typeof obj.dailyTime === 'string' ? obj.dailyTime : base.dailyTime,
      timeFormat: obj.timeFormat === '12' ? '12' : '24',
      updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
    };
    return merged;
  } catch { return defaultReminders(); }
}

export function saveReminders(prefs: RemindersSettings) {
  const safe: RemindersSettings = {
    dailyEnabled: !!prefs.dailyEnabled,
    dailyTime: prefs.dailyTime || '20:00',
    timeFormat: prefs.timeFormat === '12' ? '12' : '24',
    updatedAt: Date.now(),
  };
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(safe));
  return safe;
}

// --- Full data wipe (local-only) ---
export function clearAllData() {
  try {
    // Current & legacy entry keys
    localStorage.removeItem(STORAGE_KEY);
    for (const k of LEGACY_KEYS) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
    // Related feature keys
    localStorage.removeItem(RECENTS_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REMINDERS_KEY);
  } catch { /* ignore */ }
}