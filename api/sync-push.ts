import { createClient } from '@supabase/supabase-js';
import { isValidInitData, parseTGUser, devReason } from './_tg';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface IncomingEntry { date: string; emojis: string[]; hue?: number; song?: { title?: string; artist?: string }; updatedAt: number; }

interface Req { method?: string; body?: unknown; }
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false });
  const body = (req.body as { initData?: string; entries?: unknown } | undefined) || {};
  const { initData, entries } = body;
    if (!initData || !Array.isArray(entries) || !process.env.BOT_TOKEN) return res.status(400).json({ ok:false, ...devReason('initData/entries') });
    if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, ...devReason('hmac') });
    const u = parseTGUser(initData);
    if (!u?.id) return res.status(400).json({ ok:false, ...devReason('user') });

    // Sanitize & limit payload (defense-in-depth)
    const clean: IncomingEntry[] = (entries as unknown[]).slice(0, 50).map(r => {
      const obj = r as Partial<IncomingEntry>;
      const date = typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date) ? obj.date : 'invalid';
      const emojis = Array.isArray(obj.emojis) ? obj.emojis.filter(e => typeof e === 'string').slice(0,3) : [];
      const hue = typeof obj.hue === 'number' && emojis.length>0 ? Math.round(obj.hue) : undefined;
      const song = obj.song && typeof obj.song === 'object' ? {
        title: typeof obj.song.title === 'string' ? obj.song.title.slice(0,48) : undefined,
        artist: typeof obj.song.artist === 'string' ? obj.song.artist.slice(0,40) : undefined,
      } : undefined;
      const updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now();
      return { date, emojis, hue, song, updatedAt };
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
      return prev == null || c.updatedAt > prev; // newer-wins
    }).map(e => ({
      telegram_id: u.id,
      date: e.date,
      emojis: e.emojis,
      hue: typeof e.hue === 'number' ? e.hue : null,
      song_title: e.song?.title ?? null,
      song_artist: e.song?.artist ?? null,
      updated_at: new Date(e.updatedAt).toISOString()
    }));

    if (toUpsert.length) {
      const { error } = await supabase.from('entries').upsert(toUpsert, { onConflict: 'telegram_id,date' });
      if (error) return res.status(500).json({ ok:false });
    }

    res.json({ ok:true, count: toUpsert.length });
  } catch {
    res.status(500).json({ ok:false });
  }
}
