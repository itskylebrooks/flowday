import { createClient } from '@supabase/supabase-js';
import { isValidInitData, parseTGUser, devReason } from '../../api/_tg';
import { decryptStr } from '../../api/_enc';
import { allow } from '../../api/_rate';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as unknown as ReturnType<typeof createClient>; }
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  client.from('users').select('telegram_id', { head:true, count:'exact' }).limit(1)
    .then(()=> console.log('[sync-pull] Supabase connectivity OK'),
      e => { supabaseInitError = 'supabase-connect-failed'; console.error('[sync-pull] connectivity failed', e?.message); });
  return client;
})();

interface Req { method?: string; body?: unknown; }
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

export async function syncPullHandler(req: Req, res: Res) {
  try {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
  if (supabaseInitError) return res.status(500).json({ ok:false, error: supabaseInitError });
  const body = (req.body as { initData?: string; since?: string; debug?: boolean } | undefined) || {};
  const { initData, since, debug } = body;
  if (debug) return res.json({ ok:false, debug:true, env:{ SUPABASE_URL: !!SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY, BOT_TOKEN: !!process.env.BOT_TOKEN }, supabaseInitError });
  if (!initData) return res.status(400).json({ ok:false, error:'missing-initData', ...devReason('initData') });
  if (!process.env.BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
  if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, error:'invalid-hmac', ...devReason('hmac') });
    const u = parseTGUser(initData);
  if (!u?.id) return res.status(400).json({ ok:false, error:'invalid-user', ...devReason('user') });

  // Ensure user still exists (may have been deleted from another device)
  const { data: userRow, error: userErr } = await supabase.from('users').select('telegram_id, username, updated_at').eq('telegram_id', u.id).limit(1).maybeSingle();
  if (userErr) return res.status(500).json({ ok:false, error:'user-check-failed' });
  if (!userRow) return res.status(410).json({ ok:false, error:'user-missing' });

  // Rate limit pulls: one every 2s per user id
  // We'll know ID only after validation, so delay rate check until after parsing user.
  let query = supabase.from('entries')
      .select('date, emojis_enc, hue_enc, song_title_enc, song_artist_enc, updated_at')
      .eq('telegram_id', u.id);

  if (!allow('pull:'+u.id, 2000)) return res.status(429).json({ ok:false, error:'rate-limited', ...devReason('rate') });

    if (since && typeof since === 'string') query = query.gt('updated_at', since);

    const { data, error } = await query.order('date', { ascending: true });
    if (error) {
      console.error('[sync-pull] query error', error.message);
      return res.status(500).json({ ok:false, error:'db-error' });
    }

    interface Row { date: string | Date; emojis_enc: string | null; hue_enc: string | null; song_title_enc: string | null; song_artist_enc: string | null; updated_at: string; }
    const rows: Row[] = (data as Row[]) || [];
    const entries = rows.map(r => {
      let emojis: string[] = [];
      let hue: number | undefined;
      let songTitle: string | undefined;
      let songArtist: string | undefined;
      try {
        const decE = r.emojis_enc ? decryptStr(r.emojis_enc) : '';
        const arr = decE ? JSON.parse(decE) : [];
        if (Array.isArray(arr)) emojis = arr.filter(x => typeof x === 'string').slice(0,3);
      } catch { /* ignore */ }
      if (r.hue_enc) {
        const hStr = decryptStr(r.hue_enc); const hNum = parseInt(hStr, 10); if (!isNaN(hNum) && hNum>=0 && hNum<=360) hue = hNum;
      }
      if (r.song_title_enc) songTitle = decryptStr(r.song_title_enc) || undefined;
      if (r.song_artist_enc) songArtist = decryptStr(r.song_artist_enc) || undefined;
      return { date: String(r.date), emojis, hue, song: (songTitle || songArtist) ? { title: songTitle, artist: songArtist } : undefined, updatedAt: new Date(r.updated_at).getTime() };
    });

  console.log('[sync-pull] entries returned', { telegram_id: u.id, count: entries.length, since: since || null });
  res.json({ ok:true, entries, username: userRow.username, userUpdatedAt: userRow.updated_at });
  } catch (e) {
    console.error('[sync-pull] unexpected', (e as Error)?.message);
    res.status(500).json({ ok:false, error:'server-error' });
  }
}
