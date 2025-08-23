import { createClient } from '@supabase/supabase-js';
import { isValidInitData, parseTGUser, devReason } from './_tg';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as unknown as ReturnType<typeof createClient>; }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
})();

interface Req { method?: string; body?: unknown; }
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    if (supabaseInitError) return res.status(500).json({ ok:false, error: supabaseInitError });
  const body = (req.body as { initData?: string; tz?: string; username?: string } | undefined) || {};
  const { initData, tz, username } = body;
    if (!initData) return res.status(400).json({ ok:false, error:'missing-initData', ...devReason('initData') });
    if (!process.env.BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
    if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, error:'invalid-hmac', ...devReason('hmac') });
    const u = parseTGUser(initData);
    if (!u?.id) return res.status(400).json({ ok:false, error:'invalid-user', ...devReason('user') });

    // Determine desired username: explicit > Telegram handle > null
    const desired = typeof username === 'string' && username.trim().length ? username.trim().toLowerCase() : (u.username ? u.username.toLowerCase() : null);
    if (desired) {
      const { data: existing } = await supabase.from('users').select('telegram_id').ilike('username', desired).limit(1);
      if (existing && existing.length) {
        return res.status(409).json({ ok:false, error:'username-taken' });
      }
    }
    const { error: upErr } = await supabase.from('users').insert({
      telegram_id: u.id,
      username: desired,
      first_name: u.first_name ?? null,
      last_name: u.last_name ?? null,
      language_code: u.language_code ?? null,
      tz: typeof tz === 'string' ? tz : 'UTC',
      updated_at: new Date().toISOString()
    });
    if (upErr) return res.status(500).json({ ok:false, error:'user-insert-failed' });
    try { await supabase.from('reminders').insert({ telegram_id: u.id }); } catch { /* ignore duplicate */ }
    res.json({ ok:true, telegram_id: u.id });
  } catch (e) {
    console.error('[telegram-signin] unexpected', (e as Error)?.message);
    res.status(500).json({ ok:false, error:'server-error' });
  }
}
