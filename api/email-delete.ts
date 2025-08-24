import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as unknown as ReturnType<typeof createClient>; }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
})();

interface Req { method?: string; headers?: Record<string, string | undefined>; }
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    if (supabaseInitError) return res.status(500).json({ ok:false, error: supabaseInitError });
    const auth = req.headers?.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok:false, error:'missing-token' });
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ ok:false, error:'invalid-token' });
    const uid = user.id;
    const { error: e1 } = await supabase.from('entries').delete().eq('auth_user_id', uid);
    const { error: e2 } = await supabase.from('reminders').delete().eq('auth_user_id', uid);
    const { error: e3 } = await supabase.from('users').delete().eq('auth_user_id', uid);
    const { error: e4 } = await supabase.auth.admin.deleteUser(uid);
    if (e1 || e2 || e3 || e4) return res.status(500).json({ ok:false, error:'delete-failed' });
    res.json({ ok:true });
  } catch (e) {
    console.error('[email-delete] unexpected', (e as Error)?.message);
    res.status(500).json({ ok:false, error:'server-error' });
  }
}
