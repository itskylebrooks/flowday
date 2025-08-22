import type { Entry, UserProfile, RemindersSettings } from './types';

export const STORAGE_KEY = 'flowday_entries_v1';
export const RECENTS_KEY = 'flowday_recent_emojis_v1';
export const USER_KEY = 'flowday_user_v1';
export const REMINDERS_KEY = 'flowday_reminders_v1';

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
  const user: UserProfile = { username: 'user', createdAt: now, updatedAt: now };
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
    weeklyEnabled: false,
  weeklyDay: 1, // Monday
    weeklyTime: '18:00',
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
      weeklyEnabled: typeof obj.weeklyEnabled === 'boolean' ? obj.weeklyEnabled : base.weeklyEnabled,
      weeklyDay: typeof obj.weeklyDay === 'number' ? obj.weeklyDay : base.weeklyDay,
      weeklyTime: typeof obj.weeklyTime === 'string' ? obj.weeklyTime : base.weeklyTime,
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
    weeklyEnabled: !!prefs.weeklyEnabled,
  weeklyDay: typeof prefs.weeklyDay === 'number' ? prefs.weeklyDay : 1,
    weeklyTime: prefs.weeklyTime || '18:00',
  timeFormat: prefs.timeFormat === '12' ? '12' : '24',
    updatedAt: Date.now(),
  };
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(safe));
  return safe;
}