import { createClient } from '@supabase/supabase-js';
import { isValidInitData, parseTGUser, devReason } from './_tg';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Minimal request/response typing compatible with Vercel & generic Node runtimes.
interface Req { method?: string; body?: unknown; }
// Basic response shim; json accepts unknown payload
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, ...devReason('method') });
  const body = (req.body as { initData?: string; tz?: string } | undefined) || {};
  const { initData, tz } = body;
    if (!initData || !process.env.BOT_TOKEN) return res.status(400).json({ ok:false, ...devReason('initData/botToken') });
    if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, ...devReason('hmac') });
    const u = parseTGUser(initData);
    if (!u?.id) return res.status(400).json({ ok:false, ...devReason('user') });

    // Upsert user profile (idempotent)
    await supabase.from('users').upsert({
      telegram_id: u.id,
      username: u.username ?? null,
      first_name: u.first_name ?? null,
      last_name: u.last_name ?? null,
      language_code: u.language_code ?? null,
      tz: typeof tz === 'string' ? tz : 'UTC',
      updated_at: new Date().toISOString()
    });
    // Ensure reminders row exists (ignore conflicts)
  // Ignore conflict manually: attempt insert; if duplicate key error just continue
  try { await supabase.from('reminders').insert({ telegram_id: u.id }); } catch { /* ignore */ }

    res.json({ ok:true, telegram_id: u.id });
  } catch { res.status(500).json({ ok:false }); }
}
