import type { Entry, UserProfile, RemindersSettings } from './types';
import { clamp } from './utils';
import { track } from './analytics';

// ---------------- Versioned Entry Storage ----------------
// Historical formats:
//  - v0 (implicit): raw Entry[] stored at legacy key (same shape as Entry, no wrapper)
//  - v1: JSON string of raw Entry[] under key 'flowday_entries_v1'
//  - v2 (current): { version:2, entries: Entry[] } under key 'flowday_entries_v2'
// Future versions can add fields; extend migrate() accordingly.

export const CURRENT_VERSION = 2 as const;
export const STORAGE_KEY = 'flowday_entries_v2';
// Any localStorage key that starts with this prefix is considered an entry store.
const STORAGE_PREFIX = 'flowday_entries';

function cleanupOldEntryKeys() {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(STORAGE_PREFIX) && key !== STORAGE_KEY) toRemove.push(key);
    }
    for (const k of toRemove) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}
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
  // After writing the canonical storage key, remove any older entry keys so only
  // the latest version exists in localStorage.
  try { cleanupOldEntryKeys(); } catch { /* ignore */ }
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
  // No current payload found — try to migrate any older entry keys.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(STORAGE_PREFIX) || key === STORAGE_KEY) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as PersistedAny;
        const migrated = migrate(parsed);
        persist(migrated);
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        return migrated;
      } catch { /* keep trying other keys */ }
    }
  } catch { /* ignore */ }
  return [];
}

export function saveEntries(list: Entry[]) {
  persist(list);
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('flowday:entries-updated', { detail: { entries: list } }));
    }
  } catch { /* ignore */ }
  try { emitEntryUpsertedDebounced(list); } catch { /* ignore */ }
}

// Debounced emission for entry-upserted: pick the most-recently-updated entry
let __entryUpsertTimer: number | null = null;
export function emitEntryUpsertedDebounced(list: Entry[]) {
  try {
    if (typeof window === 'undefined') return;
    if (!Array.isArray(list) || list.length === 0) return;
    // find most recently updated entry
    let latest = list[0];
    for (let i = 1; i < list.length; i++) {
      const cur = list[i];
      if (cur.updatedAt > latest.updatedAt) latest = cur;
    }
    if (!latest) return;
    const payload = { date: latest.date, emojisCount: Array.isArray(latest.emojis) ? latest.emojis.length : 0, hasSong: !!latest.song };
    if (__entryUpsertTimer) window.clearTimeout(__entryUpsertTimer);
    __entryUpsertTimer = window.setTimeout(() => {
      try { track('entry-upserted', payload); } catch {}
      __entryUpsertTimer = null;
    }, 500);
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
  try { cleanupOldEntryKeys(); } catch { /* ignore */ }
    // Related feature keys
    localStorage.removeItem(RECENTS_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REMINDERS_KEY);
  } catch { /* ignore */ }
}

// ---------------- Export / Import helpers ----------------
export interface ExportPayload {
  exportedAt: string; // ISO
  versioned?: unknown;
  entries: Entry[];
  user?: UserProfile;
  reminders?: RemindersSettings;
  recents?: string[];
}

export function exportAllData(): ExportPayload {
  try { track('export-started'); } catch {}
  const entries = loadEntries();
  const user = loadUser();
  const reminders = loadReminders();
  const recents = getRecents();
  const payload: ExportPayload = {
    exportedAt: new Date().toISOString(),
    versioned: { storage_key: STORAGE_KEY, version: CURRENT_VERSION },
    entries,
    user,
    reminders,
    recents,
  };
  try { track('export-finished', { count: entries.length }); } catch {}
  return payload;
}

// Merge incoming entries with local by taking the entry with the newest updatedAt for each date.
function mergeEntriesByNewer(local: Entry[], incoming: Entry[]): Entry[] {
  const map = new Map<string, Entry>(local.map(e => [e.date, e]));
  for (const r of incoming) {
    const cur = map.get(r.date);
    if (!cur || (r.updatedAt > cur.updatedAt)) map.set(r.date, r);
  }
  return [...map.values()].sort((a,b)=> a.date.localeCompare(b.date));
}

export function importAllData(raw: unknown, opts?: { merge?: boolean }): { ok: boolean; message?: string; added?: number; merged?: number; total?: number } {
  try {
    try { track('import-started'); } catch {}
    // Accept both already-parsed objects and JSON strings
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed) return { ok:false, message: 'Invalid payload' };
    // Extract entries
    let incomingEntries: Entry[] = [];
    try {
      if (Array.isArray(parsed)) {
        incomingEntries = (parsed as unknown[]).map(sanitizeEntry).filter(Boolean) as Entry[];
      } else if (typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>;
        if (Array.isArray(p.entries)) incomingEntries = (p.entries as unknown[]).map(sanitizeEntry).filter(Boolean) as Entry[];
        else {
          // Maybe it's a raw entries array in a wrapper property with a different name
          for (const v of Object.values(p)) {
            if (Array.isArray(v)) {
              const candidate = (v as unknown[]).map(sanitizeEntry).filter(Boolean) as Entry[];
              if (candidate.length) { incomingEntries = candidate; break; }
            }
          }
        }
      }
    } catch (e) { return { ok:false, message: 'Invalid entries format' }; }

    const local = loadEntries();
    let final: Entry[];
    let added = 0;
    let merged = 0;
    if (opts?.merge ?? true) {
      // compute statistics
      const localMap = new Map(local.map(e=>[e.date, e] as const));
      for (const ie of incomingEntries) {
        const cur = localMap.get(ie.date);
        if (!cur) added++;
        else if (ie.updatedAt > cur.updatedAt) merged++;
      }
      final = mergeEntriesByNewer(local, incomingEntries);
    } else {
      // replace local completely
      final = incomingEntries.slice().sort((a,b)=> a.date.localeCompare(b.date));
      added = final.length;
      merged = 0;
    }
    saveEntries(final);

    // Optionally import user/reminders/recents if present
    try {
      const p = typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {};
      if (p.user && typeof p.user === 'object') {
        // best-effort shape check
        const userObj = p.user as Record<string, unknown>;
        if (typeof userObj.username === 'string') {
          saveUser({ username: userObj.username as string, createdAt: typeof userObj.createdAt === 'number' ? userObj.createdAt as number : Date.now(), updatedAt: Date.now() });
        }
      }
      if (p.reminders && typeof p.reminders === 'object') {
        const rem = p.reminders as Partial<RemindersSettings>;
        saveReminders({ dailyEnabled: !!rem.dailyEnabled, dailyTime: typeof rem.dailyTime === 'string' ? rem.dailyTime : '20:00', timeFormat: rem.timeFormat === '12' ? '12' : '24', updatedAt: Date.now() });
      }
      if (Array.isArray((parsed as Record<string, unknown>).recents)) {
        try { localStorage.setItem(RECENTS_KEY, JSON.stringify((parsed as Record<string, unknown>).recents)); } catch { /* ignore */ }
      }
    } catch { /* best-effort only */ }

  const result = { ok:true, added, merged, total: loadEntries().length };
  try { track('import-finished', { mode: opts?.merge ? 'merge' : 'replace', added, merged, total: result.total }); } catch {}
  return result;
  } catch (e) {
  try { track('import-finished', { mode: opts?.merge ? 'merge' : 'replace', added: 0, merged: 0, total: 0 }); } catch {}
  return { ok:false, message: (e instanceof Error) ? e.message : 'Import failed' };
  }
}
