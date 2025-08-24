import { createClient } from '@supabase/supabase-js';
import { isValidInitData, parseTGUser } from '../../api/_tg';

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

interface Body { initData?: string; daily_enabled?: unknown; daily_time?: unknown }

export async function remindersSetHandler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    if (supabaseInitError) return res.status(500).json({ ok:false, error:supabaseInitError });
  const { initData, daily_enabled } = (req.body as Body) || {};
    if (!initData) return res.status(400).json({ ok:false, error:'missing-initData' });
    if (!process.env.BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
    if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, error:'invalid-hmac' });
    const u = parseTGUser(initData); if (!u?.id) return res.status(400).json({ ok:false, error:'invalid-user' });
    // sanitize
    const dailyEnabled = !!daily_enabled;
    // Upsert only columns present in DB
    const { error } = await supabase.from('reminders').upsert({
      telegram_id: u.id,
      daily_enabled: dailyEnabled,
      updated_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' });
    if (error) return res.status(500).json({ ok:false, error:'db-error' });
    res.json({ ok:true });
  } catch (e) {
    console.error('[reminders-set] unexpected', (e as Error)?.message);
    res.status(500).json({ ok:false, error:'server-error' });
  }
}
