import { createClient } from '@supabase/supabase-js';
import { isValidInitData, parseTGUser, devReason } from './_tg';
import { allow } from './_rate';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
let rpcAvailable = true; // will be disabled if function missing
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as unknown as ReturnType<typeof createClient>; }
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  client.from('users').select('telegram_id', { head:true, count:'exact' }).limit(1)
    .then(()=> console.log('[sync-push] Supabase connectivity OK'),
      e => { supabaseInitError = 'supabase-connect-failed'; console.error('[sync-push] connectivity failed', e?.message); });
  return client;
})();

interface IncomingEntry { date: string; emojis: string[]; hue?: number; song?: { title?: string; artist?: string }; updatedAt: number; }

interface Req { method?: string; body?: unknown; }
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

export default async function handler(req: Req, res: Res) {
  try {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
  if (supabaseInitError) return res.status(500).json({ ok:false, error: supabaseInitError });
  const body = (req.body as { initData?: string; entries?: unknown; debug?: boolean } | undefined) || {};
  const { initData, entries, debug } = body;
  if (debug) return res.json({ ok:false, debug:true, env:{ SUPABASE_URL: !!SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY, BOT_TOKEN: !!process.env.BOT_TOKEN }, supabaseInitError });
  if (!initData) return res.status(400).json({ ok:false, error:'missing-initData', ...devReason('initData') });
  if (!Array.isArray(entries)) return res.status(400).json({ ok:false, error:'entries-not-array' });
  if (!process.env.BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
  if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, error:'invalid-hmac', ...devReason('hmac') });
    const u = parseTGUser(initData);
  if (!u?.id) return res.status(400).json({ ok:false, error:'invalid-user', ...devReason('user') });

  // User may have been deleted remotely
  const { data: userRow, error: userErr } = await supabase.from('users').select('telegram_id').eq('telegram_id', u.id).limit(1).maybeSingle();
  if (userErr) return res.status(500).json({ ok:false, error:'user-check-failed' });
  if (!userRow) return res.status(410).json({ ok:false, error:'user-missing' });

    // Rate limit (per user) lightweight: at most 1 push every 400ms
  if (!allow('push:'+u.id, 400)) return res.status(429).json({ ok:false, error:'rate-limited', ...devReason('rate') });

    // Sanitize & limit payload (defense-in-depth)
    const todayPlus = Date.now() + 2*86400000; // allow up to +2 days future (clock drift)
    const minDate = new Date('2023-01-01T00:00:00Z').getTime();
    const clean: IncomingEntry[] = (entries as unknown[]).slice(0, 50).map(r => {
      const obj = r as Partial<IncomingEntry>;
      const dateValid = typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date);
      const dateStr = dateValid ? obj.date as string : 'invalid';
      const dateMs = dateValid ? Date.parse(dateStr+'T00:00:00Z') : NaN;
      if (!dateValid || isNaN(dateMs) || dateMs < minDate || dateMs > todayPlus) return { date:'invalid', emojis:[], updatedAt:0 } as IncomingEntry;
      let emojis = Array.isArray(obj.emojis) ? obj.emojis.filter(e => typeof e === 'string').map(e=>e.trim()).filter(Boolean) : [];
      // Deduplicate & cap
      emojis = Array.from(new Set(emojis)).slice(0,3);
      const hue = typeof obj.hue === 'number' && emojis.length>0 ? Math.min(360, Math.max(0, Math.round(obj.hue))) : undefined;
      const song = obj.song && typeof obj.song === 'object' ? {
        title: typeof obj.song.title === 'string' ? obj.song.title.slice(0,48).trim() : undefined,
        artist: typeof obj.song.artist === 'string' ? obj.song.artist.slice(0,40).trim() : undefined,
      } : undefined;
      // Treat empty song object as undefined
      const normalizedSong = (song && !(song.title || song.artist)) ? undefined : song;
      const updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now();
      return { date: dateStr, emojis, hue, song: normalizedSong, updatedAt };
    }).filter(e => e.date !== 'invalid');

  if (!clean.length) return res.json({ ok:true, count: 0 });

    // Fetch existing rows for these dates in one round-trip
    const dates = clean.map(c => c.date);
    const { data: existing } = await supabase.from('entries')
      .select('date, updated_at')
      .eq('telegram_id', u.id)
      .in('date', dates);

    const existingMap = new Map<string, number>();
    for (const row of existing || []) {
      try { existingMap.set(String(row.date), new Date(row.updated_at as string).getTime()); } catch { /* ignore */ }
    }

    const toUpsert = clean.filter(c => {
      const prev = existingMap.get(c.date);
      return prev == null || c.updatedAt > prev; // local pre-filter (saves bandwidth); DB still enforces newer-wins
    }).map(e => ({
      date: e.date,
      emojis: e.emojis,
      hue: (typeof e.hue === 'number') ? e.hue : null,
      song_title: e.song?.title ?? null,
      song_artist: e.song?.artist ?? null,
      updated_at: new Date(e.updatedAt).toISOString()
    }));

    if (toUpsert.length) {
      let used = 'upsert-fallback';
      if (rpcAvailable) {
        const { error } = await supabase.rpc('flowday_upsert_entries', { p_user: u.id, p_rows: toUpsert });
        if (!error) {
          used = 'rpc';
        } else {
          console.warn('[sync-push] RPC failed, fallback upsert', error.message);
          if (/Could not find the function/i.test(error.message || '')) {
            rpcAvailable = false; // disable further attempts this runtime
          }
        }
      }
      if (used !== 'rpc') {
        const { error: upErr } = await supabase.from('entries').upsert(toUpsert.map(e => ({
          telegram_id: u.id,
          ...e
        })), { onConflict: 'telegram_id,date' });
        if (upErr) {
          console.error('[sync-push] upsert failed', upErr.message);
          return res.status(500).json({ ok:false, error:'db-upsert-failed' });
        }
      }
      console.log('[sync-push] entries upserted', { telegram_id: u.id, count: toUpsert.length, method: used });
    }

    res.json({ ok:true, count: toUpsert.length });
  } catch (e) {
    console.error('[sync-push] unexpected', (e as Error)?.message);
    res.status(500).json({ ok:false, error:'server-error' });
  }
}
