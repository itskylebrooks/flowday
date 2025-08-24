import { createClient } from '@supabase/supabase-js';
import { encryptStr } from './_enc';
import { allow } from './_rate';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as any; }
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  client.from('users').select('auth_user_id', { head:true, count:'exact' }).limit(1)
    .then(()=>console.log('[email-sync-push] Supabase OK'), e=>{ supabaseInitError='supabase-connect-failed'; console.error('[email-sync-push] connectivity failed', e?.message); });
  return client;
})();

interface IncomingEntry { date: string; emojis: string[]; hue?: number; song?: { title?: string; artist?: string }; updatedAt: number; }
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
    const body = (req.body as { entries?: unknown } | undefined) || {};
    const { entries } = body;
    if (!Array.isArray(entries)) return res.status(400).json({ ok:false, error:'entries-not-array' });
    const { data: userRow, error: uErr } = await supabase.from('users').select('telegram_id').eq('auth_user_id', user.id).limit(1).maybeSingle();
    if (uErr) return res.status(500).json({ ok:false, error:'user-check-failed' });
    if (!userRow) return res.status(410).json({ ok:false, error:'user-missing' });
    const tgid = userRow.telegram_id as number;
    if (!allow('push:'+user.id, 400)) return res.status(429).json({ ok:false, error:'rate-limited' });

    const todayPlus = Date.now() + 2*86400000;
    const minDate = new Date('2023-01-01T00:00:00Z').getTime();
    const clean: IncomingEntry[] = (entries as unknown[]).slice(0,50).map(r => {
      const obj = r as Partial<IncomingEntry>;
      const dateValid = typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date);
      const dateStr = dateValid ? obj.date as string : 'invalid';
      const dateMs = dateValid ? Date.parse(dateStr+'T00:00:00Z') : NaN;
      if (!dateValid || isNaN(dateMs) || dateMs < minDate || dateMs > todayPlus) return { date:'invalid', emojis:[], updatedAt:0 } as IncomingEntry;
      let emojis = Array.isArray(obj.emojis) ? obj.emojis.filter(e=>typeof e==='string').map(e=>e.trim()).filter(Boolean) : [];
      emojis = Array.from(new Set(emojis)).slice(0,3);
      const hue = typeof obj.hue === 'number' && emojis.length>0 ? Math.min(360, Math.max(0, Math.round(obj.hue))) : undefined;
      const song = obj.song && typeof obj.song === 'object' ? {
        title: typeof obj.song.title === 'string' ? obj.song.title.slice(0,48).trim() : undefined,
        artist: typeof obj.song.artist === 'string' ? obj.song.artist.slice(0,40).trim() : undefined,
      } : undefined;
      const normalizedSong = (song && !(song.title || song.artist)) ? undefined : song;
      const updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now();
      return { date: dateStr, emojis, hue, song: normalizedSong, updatedAt };
    }).filter(e => e.date !== 'invalid');
    if (!clean.length) return res.json({ ok:true, count:0 });

    const dates = clean.map(c=>c.date);
    const { data: existing } = await supabase.from('entries').select('date, updated_at').eq('telegram_id', tgid).in('date', dates);
    const existingMap = new Map<string, number>();
    for (const row of existing || []) { try { existingMap.set(String(row.date), new Date(row.updated_at as string).getTime()); } catch{} }

    const toUpsert = clean.filter(c => { const prev = existingMap.get(c.date); return prev==null || c.updatedAt>prev; }).map(e => ({
      date: e.date,
      emojis_enc: encryptStr(JSON.stringify(e.emojis)),
      hue_enc: typeof e.hue==='number' ? encryptStr(String(e.hue)) : null,
      song_title_enc: e.song?.title ? encryptStr(e.song.title) : null,
      song_artist_enc: e.song?.artist ? encryptStr(e.song.artist) : null,
      updated_at: new Date(e.updatedAt).toISOString()
    }));

    if (toUpsert.length) {
      try {
        const { error: upErr } = await supabase.from('entries').upsert(toUpsert.map(e=>({ telegram_id: tgid, ...e })), { onConflict:'telegram_id,date' });
        if (upErr) throw upErr;
      } catch (err) {
        const inserts: any[] = [];
        const updates: { date:string; fields:any }[] = [];
        for (const r of toUpsert) {
          const prev = existingMap.get(r.date);
          const fields = { emojis_enc: r.emojis_enc, hue_enc: r.hue_enc, song_title_enc: r.song_title_enc, song_artist_enc: r.song_artist_enc, updated_at: r.updated_at };
          if (prev==null) inserts.push({ telegram_id: tgid, date: r.date, ...fields }); else updates.push({ date: r.date, fields });
        }
        if (inserts.length) {
          const { error: insErr } = await supabase.from('entries').insert(inserts);
          if (insErr) return res.status(500).json({ ok:false, error:'db-insert-failed' });
        }
        for (const u of updates) {
          const { error: updErr } = await supabase.from('entries').update(u.fields).eq('telegram_id', tgid).eq('date', u.date);
          if (updErr) return res.status(500).json({ ok:false, error:'db-update-failed' });
        }
      }
    }
    return res.json({ ok:true, count: toUpsert.length });
  } catch (e) {
    console.error('[email-sync-push] unexpected', (e as Error)?.message);
    return res.status(500).json({ ok:false, error:'server-error' });
  }
}
