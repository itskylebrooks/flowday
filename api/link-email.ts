import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

interface Req { method?: string; headers?: Record<string,string>; body?: any }
interface Res { status:(n:number)=>Res; json:(v:any)=>void }

export default async function handler(req: Req, res: Res){
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
  try {
    const auth = req.headers?.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok:false, error:'missing-token' });
    const token = auth.slice('Bearer '.length);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ ok:false, error:'invalid-token' });
    const tgid = (req.body && req.body.tgid) ? Number(req.body.tgid) : NaN;
    if (!tgid) return res.status(400).json({ ok:false, error:'missing-tgid' });
    const { error } = await supabase.from('users').update({ auth_user_id: user.id, email: user.email }).eq('telegram_id', tgid);
    if (error) return res.status(500).json({ ok:false, error:'link-failed' });
    return res.json({ ok:true });
  } catch {
    return res.status(500).json({ ok:false, error:'server-error' });
  }
}
