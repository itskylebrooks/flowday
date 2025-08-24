import { supabase } from './supabase';
import type { Entry, RemindersSettings } from './types';
import { loadEntries, saveEntries } from './storage';
import { mergeByNewer } from './sync';
import { encryptStr, decryptStr } from './enc';

const SYNC_KEY = 'flowday_web_last_sync_iso_v1';

function maxIso(ts: string, cur?: string): string {
  return cur && cur > ts ? cur : ts;
}

export async function webPullSince(lastIso?: string): Promise<Entry[]> {
  const query = supabase
    .from('entries')
    .select('date, emojis_enc, hue_enc, song_title_enc, song_artist_enc, updated_at')
    .order('updated_at', { ascending: true })
    .limit(500);
  if (lastIso) query.gt('updated_at', lastIso);
  const { data, error } = await query;
  if (error || !data) return [];
  interface Row { date: string | Date; emojis_enc: string | null; hue_enc: string | null; song_title_enc: string | null; song_artist_enc: string | null; updated_at: string; }
  const rows = data as Row[];
  const out: Entry[] = [];
  for (const r of rows) {
    const emojisRaw = r.emojis_enc ? await decryptStr(r.emojis_enc) : '[]';
    const hueRaw = r.hue_enc ? await decryptStr(r.hue_enc) : '';
    const songTitleRaw = r.song_title_enc ? await decryptStr(r.song_title_enc) : '';
    const songArtistRaw = r.song_artist_enc ? await decryptStr(r.song_artist_enc) : '';
    out.push({
      date: typeof r.date === 'string' ? r.date : '',
      emojis: JSON.parse(emojisRaw || '[]'),
      hue: hueRaw ? parseInt(hueRaw, 10) : undefined,
      song: songTitleRaw || songArtistRaw ? { title: songTitleRaw || undefined, artist: songArtistRaw || undefined } : undefined,
      updatedAt: new Date(r.updated_at).getTime(),
    });
  }
  if (out.length) {
    let last = lastIso || '1970-01-01T00:00:00Z';
    for (const e of out) last = maxIso(last, new Date(e.updatedAt).toISOString());
    try { localStorage.setItem(SYNC_KEY, last); } catch { /* ignore */ }
  }
  return out;
}

export async function webPushEntry(entry: Entry): Promise<void> {
  await webPushMany([entry]);
}

export async function webPushMany(entries: Entry[]): Promise<void> {
  if (!entries.length) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return;
  const rows = await Promise.all(
    entries.map(async e => ({
      date: e.date,
      emojis_enc: await encryptStr(JSON.stringify(e.emojis)),
      hue_enc: typeof e.hue === 'number' ? await encryptStr(String(e.hue)) : null,
      song_title_enc: e.song?.title ? await encryptStr(e.song.title) : null,
      song_artist_enc: e.song?.artist ? await encryptStr(e.song.artist) : null,
    }))
  );
  const rowsWithUid = rows.map(r => ({ ...r, auth_user_id: uid }));
  await supabase
    .from('entries')
    .upsert(rowsWithUid, { onConflict: 'auth_user_id,date' })
    .select('updated_at');
  try { localStorage.setItem(SYNC_KEY, new Date().toISOString()); } catch { /* ignore */ }
}

export async function webInitialFullSyncIfNeeded(localEntries: Entry[]): Promise<void> {
  const pulled = await webPullSince();
  if (!pulled.length && localEntries.length) {
    await webPushMany(localEntries);
    return;
  }
  if (pulled.length) {
    const merged = mergeByNewer(localEntries, pulled);
    saveEntries(merged);
  }
}

export function startWebPeriodicPull(intervalMs = 60000): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = async () => {
    let last: string | undefined;
    try { last = localStorage.getItem(SYNC_KEY) || undefined; } catch { /* ignore */ }
    const pulled = await webPullSince(last);
    if (pulled.length) {
      const local = loadEntries();
      const merged = mergeByNewer(local, pulled);
      saveEntries(merged);
    }
  };
  timer = setInterval(tick, intervalMs);
  void tick();
  return () => { if (timer) clearInterval(timer); };
}

export async function webLoadReminders(): Promise<RemindersSettings | null> {
  const { data, error } = await supabase.from('reminders').select('daily_enabled,daily_time,updated_at').single();
  if (error || !data) return null;
  return {
    dailyEnabled: !!data.daily_enabled,
    dailyTime: data.daily_time || '09:00',
    updatedAt: new Date(data.updated_at).getTime(),
  };
}

export async function webSaveReminders(prefs: RemindersSettings): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return;
  await supabase.from('reminders').upsert(
    {
      auth_user_id: uid,
      daily_enabled: prefs.dailyEnabled,
      daily_time: prefs.dailyTime,
    },
    { onConflict: 'auth_user_id' }
  );
}
