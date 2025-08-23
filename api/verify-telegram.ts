import { createClient } from '@supabase/supabase-js';
import { isValidInitData, parseTGUser, devReason } from './_tg';

export const config = { runtime: 'nodejs' };

// Accept legacy VITE_ vars as fallback to ease migration if not yet set in Vercel UI
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    supabaseInitError = 'missing-supabase-env';
    return null as unknown as ReturnType<typeof createClient>;
  }
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Fast connectivity probe (fire & forget)
  client.from('users').select('telegram_id', { count: 'exact', head: true }).limit(1)
    .then(()=> console.log('[verify-telegram] Supabase connectivity OK'),
      e => { supabaseInitError = 'supabase-connect-failed'; console.error('[verify-telegram] Supabase connectivity failed', e?.message); });
  return client;
})();

// Minimal request/response typing compatible with Vercel & generic Node runtimes.
interface Req { method?: string; body?: unknown; }
// Basic response shim; json accepts unknown payload
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

export default async function handler(req: Req, res: Res) {
  try {
    console.log('[verify-telegram] env present', {
      SUPABASE_URL: !!SUPABASE_URL,
      SERVICE_ROLE: !!SUPABASE_SERVICE_ROLE_KEY,
      BOT_TOKEN: !!process.env.BOT_TOKEN
    });
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed', ...devReason('method') });
    if (supabaseInitError) return res.status(500).json({ ok:false, error: supabaseInitError });
  const body = (req.body as { initData?: string; tz?: string; debug?: boolean } | undefined) || {};
  const { initData, debug } = body;
    if (debug) {
      return res.json({
        ok:false,
        debug:true,
        env:{ SUPABASE_URL: !!SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY, BOT_TOKEN: !!process.env.BOT_TOKEN },
        supabaseInitError
      });
    }
    if (!initData) {
      console.warn('[verify-telegram] missing initData');
      return res.status(400).json({ ok:false, error:'missing-initData', ...devReason('initData') });
    }
    if (!process.env.BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
    if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, error:'invalid-hmac', ...devReason('hmac') });
    const u = parseTGUser(initData);
    if (!u?.id) return res.status(400).json({ ok:false, error:'invalid-user', ...devReason('user') });

  // Only check if user exists (no creation)
  const { data: existing, error: selErr } = await supabase.from('users').select('telegram_id').eq('telegram_id', u.id).limit(1).maybeSingle();
  if (selErr) return res.status(500).json({ ok:false, error:'user-check-failed' });
  res.json({ ok:true, telegram_id: u.id, exists: !!existing });
  } catch (e) {
    console.error('[verify-telegram] unexpected error', (e as Error)?.message, e);
    res.status(500).json({ ok:false, error:'server-error', ...(process.env.NODE_ENV!=='production' ? { message:(e as Error)?.message } : {}) });
  }
}
