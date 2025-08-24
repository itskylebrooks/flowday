import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SERVICE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as unknown as ReturnType<typeof createClient>; }
  return createClient(SUPABASE_URL, SERVICE_KEY);
})();

interface Req { method?: string; headers?: { [k: string]: string | undefined }; }
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    if (supabaseInitError) return res.status(500).json({ ok:false, error: supabaseInitError });
    const auth = req.headers?.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ ok:false, error:'missing-auth' });
    const token = auth.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ ok:false, error:'invalid-token' });
    const id = user.id;
    await supabase.from('entries').delete().eq('auth_user_id', id);
    await supabase.from('reminders').delete().eq('auth_user_id', id);
    await supabase.from('users').delete().eq('auth_user_id', id);
    await supabase.auth.admin.deleteUser(id);
    res.json({ ok:true });
  } catch (e) {
    console.error('[web-delete-account] unexpected', (e as Error)?.message);
    res.status(500).json({ ok:false, error:'server-error' });
  }
}
