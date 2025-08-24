import { createClient } from '@supabase/supabase-js';
import { decryptStr } from './_enc';
import { allow } from './_rate';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as any; }
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  client.from('users').select('auth_user_id', { head:true, count:'exact' }).limit(1)
    .then(()=>console.log('[email-sync-pull] Supabase OK'), e=>{ supabaseInitError='supabase-connect-failed'; console.error('[email-sync-pull] connectivity failed', e?.message); });
  return client;
})();

interface Req { method?: string; headers?: Record<string,string>; body?: any }
interface Res { status:(n:number)=>Res; json:(v:any)=>void }

export default async function handler(req: Req, res: Res){
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    if (supabaseInitError) return res.status(500).json({ ok:false, error: supabaseInitError });
    const auth = req.headers?.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok:false, error:'missing-token' });
    const token = auth.slice('Bearer '.length);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ ok:false, error:'invalid-token' });
    const body = (req.body as { since?: string } | undefined) || {};
    const { since } = body;
    const { data: userRow, error: uErr } = await supabase.from('users').select('telegram_id, username, updated_at').eq('auth_user_id', user.id).limit(1).maybeSingle();
    if (uErr) return res.status(500).json({ ok:false, error:'user-check-failed' });
    if (!userRow) return res.status(410).json({ ok:false, error:'user-missing' });
    const tgid = userRow.telegram_id as number;
    if (!allow('pull:'+user.id, 2000)) return res.status(429).json({ ok:false, error:'rate-limited' });
    let query = supabase.from('entries').select('date, emojis_enc, hue_enc, song_title_enc, song_artist_enc, updated_at').eq('telegram_id', tgid);
    if (since && typeof since === 'string') query = query.gt('updated_at', since);
    const { data, error } = await query.order('date', { ascending:true });
    if (error) return res.status(500).json({ ok:false, error:'db-error' });
    const rows = (data || []) as { date:string|Date; emojis_enc:string|null; hue_enc:string|null; song_title_enc:string|null; song_artist_enc:string|null; updated_at:string }[];
    const entries = rows.map(r => {
      let emojis:string[] = [];
      let hue:number|undefined;
      let songTitle:string|undefined;
      let songArtist:string|undefined;
      try { const dec = r.emojis_enc ? decryptStr(r.emojis_enc) : ''; const arr = dec?JSON.parse(dec):[]; if (Array.isArray(arr)) emojis = arr.filter(x=>typeof x==='string').slice(0,3); } catch{}
      if (r.hue_enc) { const h = parseInt(decryptStr(r.hue_enc),10); if(!isNaN(h) && h>=0 && h<=360) hue = h; }
      if (r.song_title_enc) songTitle = decryptStr(r.song_title_enc) || undefined;
      if (r.song_artist_enc) songArtist = decryptStr(r.song_artist_enc) || undefined;
      return { date: String(r.date), emojis, hue, song: (songTitle||songArtist)?{ title:songTitle, artist:songArtist }:undefined, updatedAt: new Date(r.updated_at).getTime() };
    });
    return res.json({ ok:true, entries, username: userRow.username, userUpdatedAt: userRow.updated_at });
  } catch (e) {
    console.error('[email-sync-pull] unexpected', (e as Error)?.message);
    return res.status(500).json({ ok:false, error:'server-error' });
  }
}
