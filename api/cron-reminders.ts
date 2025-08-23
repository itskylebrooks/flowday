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

// Check whether the current time in `tz` matches target "HH:MM"
function isDue(tz: string | null, targetHHMM: string, now: Date) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { hour12:false, hour:'2-digit', minute:'2-digit', timeZone: tz || 'UTC' });
    const hhmm = fmt.format(now); // "HH:MM"
    return hhmm === targetHHMM;
  } catch {
    return false;
  }
}

// Get ISO date YYYY-MM-DD in user's timezone
function dateForTz(tz: string | null, now: Date) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }); // en-CA -> YYYY-MM-DD
    return fmt.format(now);
  } catch {
    return now.toISOString().slice(0,10);
  }
}

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

    const now = new Date();

    // Fetch enabled daily reminders and user's timezone
    const { data, error } = await supabase.from('reminders')
      .select('telegram_id,daily_time,last_daily_sent,users!inner(tz,username)')
      .eq('daily_enabled', true)
      .limit(1000);
    if (error) return res.status(500).json({ ok:false, error:'db-error' });

    type Row = { telegram_id: number; daily_time: string | null; last_daily_sent: string | null; users?: { tz?: string | null; username?: string | null } };
    const rows: Row[] = (data as unknown as Row[]) || [];

    let sent = 0;
    const errors: Array<{ id: number; message: string }> = [];

    for (const r of rows) {
      const tz = r.users?.tz || 'UTC';
      const target = (r.daily_time || '').trim();
      if (!target) continue;

      // Check if it's the right minute in user's tz
      if (!isDue(tz, target, now)) continue;

      // Compute today's date in user's tz to avoid duplicate sends
      const todayLocal = dateForTz(tz, now);
      if (r.last_daily_sent === todayLocal) continue; // already sent today

      const chatId = r.telegram_id;
      const username = r.users?.username;
      const text = username ? `Hi ${username}! Daily Flowday reminder — take a moment to reflect and log your day.` : `Daily Flowday reminder — take a moment to reflect and log your day.`;

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

        // Mark as sent for today (use user's local date)
        const { error: upErr } = await supabase.from('reminders').update({ last_daily_sent: todayLocal, updated_at: new Date().toISOString() }).eq('telegram_id', chatId);
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
