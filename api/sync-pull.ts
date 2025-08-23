import { createClient } from '@supabase/supabase-js';
import { isValidInitData, parseTGUser, devReason } from './_tg';
import { allow } from './_rate';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Req { method?: string; body?: unknown; }
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false });
  const body = (req.body as { initData?: string; since?: string } | undefined) || {};
  const { initData, since } = body;
    if (!initData || !process.env.BOT_TOKEN) return res.status(400).json({ ok:false, ...devReason('initData/botToken') });
    if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, ...devReason('hmac') });
    const u = parseTGUser(initData);
    if (!u?.id) return res.status(400).json({ ok:false, ...devReason('user') });

  // Rate limit pulls: one every 2s per user id
  // We'll know ID only after validation, so delay rate check until after parsing user.
  let query = supabase.from('entries')
      .select('date, emojis, hue, song_title, song_artist, updated_at')
      .eq('telegram_id', u.id);

  if (!allow('pull:'+u.id, 2000)) return res.status(429).json({ ok:false, ...devReason('rate') });

    if (since && typeof since === 'string') query = query.gt('updated_at', since);

    const { data, error } = await query.order('date', { ascending: true });
    if (error) return res.status(500).json({ ok:false });

    const entries = (data || []).map(r => ({
      date: String(r.date),
      emojis: Array.isArray(r.emojis) ? (r.emojis as string[]).slice(0,3) : [],
      hue: typeof r.hue === 'number' ? r.hue : undefined,
      song: (r.song_title || r.song_artist) ? { title: r.song_title || undefined, artist: r.song_artist || undefined } : undefined,
      updatedAt: new Date(r.updated_at).getTime()
    }));

    res.json({ ok:true, entries });
  } catch {
    res.status(500).json({ ok:false });
  }
}
