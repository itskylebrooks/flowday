import { createClient } from '@supabase/supabase-js';
import { isValidInitData, parseTGUser } from './_tg';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as unknown as ReturnType<typeof createClient>; }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
})();

interface Req { method?: string; body?: unknown }
interface Res { status:(c:number)=>Res; json:(v:unknown)=>void }

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    if (supabaseInitError) return res.status(500).json({ ok:false, error:supabaseInitError });
    const { initData } = (req.body as { initData?: string } | undefined) || {};
    if (!initData) return res.status(400).json({ ok:false, error:'missing-initData' });
    if (!process.env.BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
    if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, error:'invalid-hmac' });
    const u = parseTGUser(initData); if (!u?.id) return res.status(400).json({ ok:false, error:'invalid-user' });
  const { data, error } = await supabase.from('reminders').select('daily_enabled,daily_time').eq('telegram_id', u.id).limit(1).maybeSingle();
    if (error) return res.status(500).json({ ok:false, error:'db-error' });
    if (!data) return res.json({ ok:true, exists:false });
    res.json({ ok:true, exists:true, prefs: data });
  } catch (e) {
    console.error('[reminders-get] unexpected', (e as Error)?.message);
    res.status(500).json({ ok:false, error:'server-error' });
  }
}
