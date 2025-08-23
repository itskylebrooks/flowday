// Telegram-aware sync helpers (client-side)
import type { Entry } from './types';
import { loadEntries, saveEntries } from './storage';

const SYNC_KEY = 'flowday_last_sync_iso_v1';
const RETRY_MS = 6_000;

// Narrow window typing for Telegram detection without using any
interface TGWin { Telegram?: { WebApp?: { initData?: string } } }
function isTG(): boolean { return !!(window as unknown as TGWin).Telegram?.WebApp; }
function getInitData(): string { return (window as unknown as TGWin).Telegram?.WebApp?.initData || ''; }

export function mergeByNewer(local: Entry[], incoming: Entry[]): Entry[] {
  const map = new Map(local.map(e => [e.date, e] as const));
  for (const r of incoming) {
    const cur = map.get(r.date);
    if (!cur || (r.updatedAt > cur.updatedAt)) map.set(r.date, r);
  }
  return [...map.values()].sort((a,b)=> a.date.localeCompare(b.date));
}

async function postJSON(path: string, body: unknown) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('HTTP '+res.status);
  return res.json().catch(()=> ({}));
}

export async function verifyTelegram(tz?: string) {
  if (!isTG()) return;
  const initData = getInitData();
  try {
    await postJSON('/api/verify-telegram', { initData, tz: tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  } catch { /* silent */ }
}

export async function syncPull(): Promise<number | null> {
  if (!isTG()) return null;
  const initData = getInitData();
  const since = localStorage.getItem(SYNC_KEY) || '';
  try {
    const data = await postJSON('/api/sync-pull', { initData, since });
    if (!data?.ok || !Array.isArray(data.entries)) return null;
    const pulled = data.entries as Entry[];
    const local = loadEntries();
    const merged = mergeByNewer(local, pulled);
    saveEntries(merged);
    localStorage.setItem(SYNC_KEY, new Date().toISOString());
    return pulled.length;
  } catch { return null; }
}

let pushQueue: Entry[] = [];
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function flushPush() {
  if (!pushQueue.length) return;
  const batch = [...pushQueue];
  pushQueue = [];
  void rawSyncPush(batch);
}

async function rawSyncPush(entries: Entry[]) {
  if (!isTG() || !entries.length) return;
  const initData = getInitData();
  try {
    await postJSON('/api/sync-push', { initData, entries });
  } catch {
    // Requeue once
    if (entries.length < 10) {
      setTimeout(()=> { pushQueue.push(...entries); flushPush(); }, RETRY_MS);
    }
  }
}

export function queueSyncPush(entry: Entry) {
  if (!isTG()) return;
  pushQueue = pushQueue.filter(e => e.date !== entry.date); // dedupe by date
  pushQueue.push(entry);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, 900); // slightly faster
}

export function queueSyncPushMany(entries: Entry[]) {
  if (!isTG() || !entries.length) return;
  const setDates = new Set(entries.map(e=>e.date));
  pushQueue = pushQueue.filter(e => !setDates.has(e.date));
  pushQueue.push(...entries);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, 900);
}

export async function initialFullSyncIfNeeded() {
  if (!isTG()) return;
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
export function startPeriodicPull() {
  if (!isTG()) return;
  if (periodicTimer) return;
  periodicTimer = setInterval(()=> { syncPull(); }, 60000);
}
export function stopPeriodicPull() { if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null; } }
