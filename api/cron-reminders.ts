import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as unknown as ReturnType<typeof createClient>; }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
})();

interface Req { method?: string; headers?: Record<string,string|undefined>; body?: unknown }
interface Res { status:(c:number)=>Res; json:(v:unknown)=>void }

export default async function handler(req: Req, res: Res) {
  try {
    // Accept Vercel cron GET requests (user-agent contains vercel-cron) OR POST/GET with Bearer secret
    const ua = (req.headers?.['user-agent'] || '').toLowerCase();
    const auth = req.headers?.['authorization'] || '';
    const hasValidSecret = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;

    if (req.method === 'GET') {
      if (!ua.includes('vercel-cron') && !hasValidSecret) return res.status(401).json({ ok:false, error:'unauthorized' });
    } else if (req.method === 'POST') {
      if (!hasValidSecret) return res.status(401).json({ ok:false, error:'unauthorized' });
    } else {
      return res.status(405).json({ ok:false, error:'method-not-allowed' });
    }

    if (supabaseInitError) return res.status(500).json({ ok:false, error:supabaseInitError });
    if (!process.env.BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
    const botToken = process.env.BOT_TOKEN;

    // Fetch enabled daily reminders (minimal schema: no legacy last_sent fields)
    const { data, error } = await supabase.from('reminders')
      .select('telegram_id,daily_enabled,updated_at')
      .eq('daily_enabled', true)
      .limit(1000);
    if (error) return res.status(500).json({ ok:false, error:'db-error' });

  type Row = { telegram_id: number; daily_enabled: boolean; updated_at: string | null };
  const rows: Row[] = (data as unknown as Row[]) || [];

    let sent = 0;
    const errors: Array<{ id: number; message: string }> = [];
    const today = new Date().toISOString().slice(0,10); // UTC date

    for (const r of rows) {
  // Use updated_at as the last-sent marker (minimal schema). If updated today, skip.
  const lastSentDate = r.updated_at ? r.updated_at.slice(0,10) : null;
  if (lastSentDate === today) continue; // already sent today
      const chatId = r.telegram_id;
  const text = `✨ Your flow is waiting

Pick today’s colors & emojis — it only takes 20 seconds.
Every drop adds to your week’s ribbon, your month’s mix, your sky of constellations.

🎶 Tap below and let the day glow into memory.`;
      try {
        const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        });
        if (!resp.ok) {
          const body = await resp.text().catch(()=>'<no-body>');
          errors.push({ id: chatId, message: `telegram-send-failed ${resp.status} ${body}` });
          continue;
        }

        // Mark as sent for today
  const now = new Date().toISOString();
  // Only update columns present in the minimal schema. Use updated_at as the marker for last send.
  const { error: upErr } = await supabase.from('reminders').update({ updated_at: now }).eq('telegram_id', chatId);
        if (upErr) {
          errors.push({ id: chatId, message: 'db-update-failed' });
          continue;
        }

        sent++;
      } catch (e) {
        errors.push({ id: chatId, message: (e as Error)?.message || 'unknown' });
      }
    }

    return res.json({ ok:true, sent, errors });
  } catch (e) {
    console.error('[cron-reminders] unexpected', (e as Error)?.message);
    return res.status(500).json({ ok:false, error:'server-error' });
  }
}
