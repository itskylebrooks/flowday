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

export async function syncPull() {
  if (!isTG()) return;
  const initData = getInitData();
  const since = localStorage.getItem(SYNC_KEY) || '';
  try {
    const data = await postJSON('/api/sync-pull', { initData, since });
    if (!data?.ok || !Array.isArray(data.entries)) return;
    const local = loadEntries();
    const merged = mergeByNewer(local, data.entries as Entry[]);
    saveEntries(merged);
    localStorage.setItem(SYNC_KEY, new Date().toISOString());
  } catch { /* silent */ }
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
  pushTimer = setTimeout(flushPush, 1200); // debounce burst edits
}
