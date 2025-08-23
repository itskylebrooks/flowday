// Telegram-aware sync helpers (client-side)
import type { Entry } from './types';
import { loadEntries, saveEntries, loadReminders, saveReminders } from './storage';

const SYNC_KEY = 'flowday_last_sync_iso_v1';
const CLOUD_FLAG_KEY = 'flowday_cloud_enabled_v1';
const RETRY_MS = 6_000;

// Narrow window typing for Telegram detection without using any
interface TGWin { Telegram?: { WebApp?: { initData?: string } } }
function isTG(): boolean { return !!(window as unknown as TGWin).Telegram?.WebApp; }
function getInitData(): string { return (window as unknown as TGWin).Telegram?.WebApp?.initData || ''; }

// Some environments expose Telegram.WebApp before initData is populated; we lazily
// wait (poll) for a non-empty initData (up to a timeout) before first network calls.
let initDataValue = '';
let initDataInflight: Promise<string> | null = null;
async function waitForInitData(maxMs = 10_000): Promise<string> {
  if (!isTG()) return '';
  if (initDataValue) return initDataValue;
  if (!initDataInflight) {
    initDataInflight = new Promise<string>(resolve => {
      const started = Date.now();
      const tick = () => {
        const cur = getInitData();
        if (cur) { initDataValue = cur; resolve(cur); return; }
        if (Date.now() - started > maxMs) { resolve(''); return; }
        setTimeout(tick, 150);
      };
      tick();
    });
  }
  const val = await initDataInflight;
  if (!val) { // did not get it this round; allow future retries
    initDataInflight = null;
  }
  return val;
}

export function mergeByNewer(local: Entry[], incoming: Entry[]): Entry[] {
  const map = new Map(local.map(e => [e.date, e] as const));
  for (const r of incoming) {
    const cur = map.get(r.date);
    if (!cur || (r.updatedAt > cur.updatedAt)) map.set(r.date, r);
  }
  return [...map.values()].sort((a,b)=> a.date.localeCompare(b.date));
}

interface JsonResponse { ok?: boolean; [k:string]: unknown }

async function postJSON(path: string, body: unknown): Promise<{ res: Response; data: JsonResponse | null }> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  let data: JsonResponse | null = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { res, data };
}

let verifyDone = false;
export async function verifyTelegram(tz?: string) {
  if (!isTG() || verifyDone) return;
  const initData = await waitForInitData();
  if (!initData) return; // wait until a later attempt when initData appears
  try {
    const { data } = await postJSON('/api/verify-telegram', { initData, tz: tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
    verifyDone = true;
    if (data && typeof data === 'object' && 'exists' in data) {
      const existsVal = (data as { exists?: unknown }).exists;
      if (existsVal === true) localStorage.setItem(CLOUD_FLAG_KEY,'1');
      const serverUsername = (data as { username?: unknown }).username;
      if (typeof serverUsername === 'string') {
        try {
          const raw = localStorage.getItem('flowday_user_v1');
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj && typeof obj === 'object' && obj.username !== serverUsername) {
              obj.username = serverUsername;
              localStorage.setItem('flowday_user_v1', JSON.stringify(obj));
            }
          }
        } catch { /* ignore */ }
      }
      // Attempt to fetch reminders preferences once on verify (best-effort)
      try {
        const { data: rData } = await postJSON('/api/reminders-get', { initData });
        if (rData?.ok && rData.prefs) {
          const prefs = rData.prefs as { daily_enabled?: boolean; daily_time?: string; weekly_enabled?: boolean; weekly_day?: number; weekly_time?: string };
          const local = loadReminders();
          const merged = { ...local };
            if (typeof prefs.daily_enabled === 'boolean') merged.dailyEnabled = prefs.daily_enabled;
            if (typeof prefs.daily_time === 'string') merged.dailyTime = prefs.daily_time;
            if (typeof prefs.weekly_enabled === 'boolean') merged.weeklyEnabled = prefs.weekly_enabled;
            if (typeof prefs.weekly_day === 'number') merged.weeklyDay = prefs.weekly_day;
            if (typeof prefs.weekly_time === 'string') merged.weeklyTime = prefs.weekly_time;
          saveReminders(merged);
        }
      } catch { /* ignore */ }
    }
  } catch { /* silent */ }
}
export async function syncPull(): Promise<number | null> {
  if (!isTG()) return null;
  if (!isCloudEnabled()) return null;
  const initData = await waitForInitData();
  if (!initData) return null;
  const since = localStorage.getItem(SYNC_KEY) || '';
  try {
    const { res, data } = await postJSON('/api/sync-pull', { initData, since });
    if (res.status === 410) { disableCloud(); stopPeriodicPull(); return null; }
    if (res.status === 429) {
      periodicIntervalMs = Math.min(120000, Math.round(periodicIntervalMs * 1.5));
      if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = setInterval(()=> { syncPull(); }, periodicIntervalMs); }
      return null;
    } else if (res.ok && periodicIntervalMs !== 60000) {
      periodicIntervalMs = 60000;
      if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = setInterval(()=> { syncPull(); }, periodicIntervalMs); }
    }
    if (!res.ok || !data?.ok || !Array.isArray(data.entries)) return null;
    if (typeof data.username === 'string') {
      try {
        const raw = localStorage.getItem('flowday_user_v1');
        if (raw) { const obj = JSON.parse(raw); if (obj && typeof obj === 'object' && obj.username !== data.username) { obj.username = data.username; localStorage.setItem('flowday_user_v1', JSON.stringify(obj)); } }
      } catch { /* ignore */ }
    }
    const pulled = data.entries as Entry[];
    const local = loadEntries();
    const merged = mergeByNewer(local, pulled);
    saveEntries(merged);
    localStorage.setItem(SYNC_KEY, new Date().toISOString());
    return pulled.length;
  } catch { return null; }
}

type PendingPush = { entry: Entry; attempts: number };
let pushQueue: PendingPush[] = [];
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let nextPullAfterPushTO: ReturnType<typeof setTimeout> | null = null;

function flushPush() {
  if (!pushQueue.length) return;
  const batch = [...pushQueue];
  pushQueue = [];
  void rawSyncPush(batch);
}

async function rawSyncPush(pending: PendingPush[]) {
  if (!isTG() || !pending.length) return;
  if (!isCloudEnabled()) { pushQueue = []; return; }
  const initData = await waitForInitData();
  if (!initData) { pushQueue.push(...pending); setTimeout(flushPush, 500); return; }
  const entries = pending.map(p => p.entry);
  try {
    const { res } = await postJSON('/api/sync-push', { initData, entries });
    if (res.status === 410) { disableCloud(); stopPeriodicPull(); return; }
    if (!res.ok) {
      if ([429,500,502,503,504].includes(res.status)) {
        for (const p of pending) {
          if (p.attempts < 5) {
            const delay = Math.min(30000, 1000 * Math.pow(2, p.attempts));
            pushQueue.push({ entry: p.entry, attempts: p.attempts + 1 });
            setTimeout(flushPush, delay);
          }
        }
      }
      return;
    }
    if (nextPullAfterPushTO) clearTimeout(nextPullAfterPushTO);
    nextPullAfterPushTO = setTimeout(()=> { syncPull(); }, 5000);
  } catch {
    for (const p of pending) { if (p.attempts < 3) pushQueue.push({ entry: p.entry, attempts: p.attempts + 1 }); }
    setTimeout(flushPush, RETRY_MS);
  }
}

export function queueSyncPush(entry: Entry) {
  if (!isTG()) return;
  pushQueue = pushQueue.filter(e => e.entry.date !== entry.date); // dedupe
  pushQueue.push({ entry, attempts: 0 });
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, 700);
}

export function queueSyncPushMany(entries: Entry[]) {
  if (!isTG() || !entries.length) return;
  const setDates = new Set(entries.map(e=>e.date));
  pushQueue = pushQueue.filter(e => !setDates.has(e.entry.date));
  for (const e of entries) pushQueue.push({ entry: e, attempts: 0 });
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, 700);
}

export async function initialFullSyncIfNeeded() {
  if (!isTG()) return;
  if (!isCloudEnabled()) return;
  await waitForInitData();
  const FLAG = 'flowday_initial_sync_done_v1';
  if (localStorage.getItem(FLAG)) return; // already performed
  // Perform pull first to avoid overwriting cloud data
  const pulled = await syncPull(); // returns count or null
  const local = loadEntries();
  if ((pulled === 0 || pulled === null) && local.length) {
    // Cloud empty (or unknown) but we have local entries -> push all
  queueSyncPushMany(local);
  flushPush();
  }
  localStorage.setItem(FLAG, '1');
}

// Optional periodic pull to keep multiple devices in sync (every 60s idle)
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let periodicIntervalMs = 60000;
export function startPeriodicPull() {
  if (!isTG()) return;
  if (!isCloudEnabled()) return;
  if (periodicTimer) return;
  periodicTimer = setInterval(()=> { syncPull(); }, periodicIntervalMs);
}
export function stopPeriodicPull() { if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null; } }

// Startup helper: attempt verify + initial pull multiple times in case initData arrives late
let startupLoopRan = false;
export function startStartupSyncLoop() {
  if (!isTG() || startupLoopRan) return;
  startupLoopRan = true;
  let attempts = 0;
  const loop = async () => {
    if (verifyDone) return; // already verified; loop naturally stops
    attempts++;
    await verifyTelegram();
    if (verifyDone) { void syncPull(); return; }
    if (attempts < 8) setTimeout(loop, 1000 * Math.min(5, attempts));
  };
  loop();
}

// Cloud enable/disable -------------------------------------------------
export function isCloudEnabled(): boolean { return !!localStorage.getItem(CLOUD_FLAG_KEY); }
export function enableCloud() { localStorage.setItem(CLOUD_FLAG_KEY,'1'); localStorage.removeItem('flowday_initial_sync_done_v1'); }
export function disableCloud() { localStorage.removeItem(CLOUD_FLAG_KEY); localStorage.removeItem(SYNC_KEY); localStorage.removeItem('flowday_initial_sync_done_v1'); }

export async function signInToCloud(username?: string): Promise<{ ok: boolean; error?: string }> {
  if (!isTG()) return { ok:false, error:'not-telegram' };
  const initData = await waitForInitData();
  if (!initData) return { ok:false, error:'no-initData' };
  if (username && username.trim().length < 4) return { ok:false, error:'username-too-short' };
  try {
    const { res, data } = await postJSON('/api/telegram-signin', { initData, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', username });
    if (res.status === 409) return { ok:false, error:'username-taken' };
    if (res.status === 400 && data?.error === 'username-too-short') return { ok:false, error:'username-too-short' };
    if (res.ok && data?.ok) {
      enableCloud();
      await initialFullSyncIfNeeded();
      startPeriodicPull();
      return { ok:true };
    }
  } catch { /* ignore */ }
  return { ok:false, error:'unknown' };
}

export async function deleteCloudAccount(): Promise<boolean> {
  if (!isTG() || !isCloudEnabled()) return false;
  const initData = await waitForInitData(); if (!initData) return false;
  try {
    const { res, data } = await postJSON('/api/telegram-delete', { initData });
    if (res.ok && data?.ok) { disableCloud(); stopPeriodicPull(); return true; }
  } catch { /* ignore */ }
  return false;
}

export async function updateCloudUsername(username: string): Promise<{ ok:boolean; error?:string }> {
  if (!isTG() || !isCloudEnabled()) return { ok:false, error:'not-enabled' };
  const initData = await waitForInitData(); if (!initData) return { ok:false, error:'no-initData' };
  if (username.trim().length < 4) return { ok:false, error:'username-too-short' };
  try {
    const { res, data } = await postJSON('/api/telegram-update-username', { initData, username });
    if (res.status === 409) return { ok:false, error:'username-taken' };
    if (res.status === 400 && data?.error === 'username-too-short') return { ok:false, error:'username-too-short' };
    if (res.ok && data?.ok) return { ok:true };
  } catch { /* ignore */ }
  return { ok:false, error:'unknown' };
}
