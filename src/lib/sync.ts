// Telegram-aware sync helpers (client-side)
import type { Entry } from './types';
import { loadEntries, saveEntries } from './storage';

const SYNC_KEY = 'flowday_last_sync_iso_v1';
const RETRY_MS = 6_000;

// Narrow window typing for Telegram detection without using any
interface TGWin { Telegram?: { WebApp?: { initData?: string } } }
function isTG(): boolean { return !!(window as unknown as TGWin).Telegram?.WebApp; }
function getInitData(): string { return (window as unknown as TGWin).Telegram?.WebApp?.initData || ''; }

// Some environments expose Telegram.WebApp before initData is populated; we lazily
// wait (poll) for a non-empty initData (up to a timeout) before first network calls.
let initDataReady: Promise<string> | null = null;
async function waitForInitData(maxMs = 4000): Promise<string> {
  if (!isTG()) return '';
  if (initDataReady) return initDataReady;
  initDataReady = new Promise<string>(resolve => {
    const started = Date.now();
    const tick = () => {
      const cur = getInitData();
      if (cur) { resolve(cur); return; }
      if (Date.now() - started > maxMs) { resolve(''); return; }
      setTimeout(tick, 120);
    };
    tick();
  });
  return initDataReady;
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

export async function verifyTelegram(tz?: string) {
  if (!isTG()) return;
  const initData = await waitForInitData();
  if (!initData) return; // avoid spamming server with missing-initData
  try { await postJSON('/api/verify-telegram', { initData, tz: tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }); }
  catch { /* silent */ }
}

export async function syncPull(): Promise<number | null> {
  if (!isTG()) return null;
  const initData = await waitForInitData();
  if (!initData) return null;
  const since = localStorage.getItem(SYNC_KEY) || '';
  try {
    const { res, data } = await postJSON('/api/sync-pull', { initData, since });
    if (!res.ok || !data?.ok || !Array.isArray(data.entries)) return null;
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
  const initData = await waitForInitData();
  if (!initData) { // requeue all until initData available
    pushQueue.push(...pending);
    setTimeout(flushPush, 500);
    return;
  }
  const entries = pending.map(p => p.entry);
  try {
    const { res } = await postJSON('/api/sync-push', { initData, entries });
    if (!res.ok) {
      // Retry on 409/429/500-series with backoff
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
    // Successful push: schedule a near-future pull to pick up remote merges on other tabs/devices
    if (nextPullAfterPushTO) clearTimeout(nextPullAfterPushTO);
    nextPullAfterPushTO = setTimeout(()=> { syncPull(); }, 5000);
  } catch {
    for (const p of pending) {
      if (p.attempts < 3) {
        pushQueue.push({ entry: p.entry, attempts: p.attempts + 1 });
      }
    }
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
export function startPeriodicPull() {
  if (!isTG()) return;
  if (periodicTimer) return;
  periodicTimer = setInterval(()=> { syncPull(); }, 60000);
}
export function stopPeriodicPull() { if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null; } }
