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

// Basic HH:MM extraction
const nowUTC = () => new Date();

// Convert a stored HH:MM + user tz to current UTC day/time match decision.
// We avoid heavy deps: create a Date at user's timezone by using Intl.DateTimeFormat.
function isDue(tz: string | null, target: string, now: Date) {
  // We map now to the user's tz components and compare HH:MM.
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { hour12:false, hour:'2-digit', minute:'2-digit', timeZone: tz || 'UTC' });
    const parts = fmt.format(now); // "HH:MM"
    return parts === target;
  } catch { return false; }
}

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    if (supabaseInitError) return res.status(500).json({ ok:false, error:supabaseInitError });
    if (!process.env.CRON_SECRET) return res.status(500).json({ ok:false, error:'missing-cron-secret' });
    const auth = req.headers?.['authorization'] || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ ok:false, error:'unauthorized' });
    if (!process.env.BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
    const botToken = process.env.BOT_TOKEN;
    const now = nowUTC();
    const todayUTC = now.toISOString().slice(0,10);

    // Fetch candidate rows (limit to enabled to reduce work)
    const { data, error } = await supabase.from('reminders')
      .select('telegram_id,daily_enabled,daily_time,weekly_enabled,weekly_day,weekly_time,last_daily_sent,last_weekly_sent, users!inner(tz,username)')
      .eq('daily_enabled', true)
      .limit(1000);
    if (error) return res.status(500).json({ ok:false, error:'db-error' });
  interface RRow { telegram_id: number; daily_enabled: boolean; daily_time: string; weekly_enabled: boolean; weekly_day: number; weekly_time: string; last_daily_sent: string | null; last_weekly_sent: string | null; users?: { tz?: string | null; username?: string | null } }
  const rows: RRow[] = (data as unknown as RRow[]) || [];

    let dailySent = 0; let weeklySent = 0; const updates: { telegram_id:number; last_daily_sent?: string; last_weekly_sent?: string }[] = [];

    for (const r of rows) {
      const tz = r.users?.tz || 'UTC';
      if (r.daily_enabled && r.daily_time && isDue(tz, r.daily_time, now)) {
        if (r.last_daily_sent !== todayUTC) {
          // send daily
          const text = 'How are you feeling today? Tap to add your Flowday entry.';
          try {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ chat_id: r.telegram_id, text })
            });
            dailySent++;
            updates.push({ telegram_id: r.telegram_id, last_daily_sent: todayUTC });
          } catch { /* ignore individual failure */ }
        }
      }
      if (r.weekly_enabled && r.weekly_time) {
        // Compare weekday in user's tz (0=Sun..6=Sat) with stored weekly_day (same convention)
        let userWeekday = 0;
        try {
          const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday:'short' });
          const short = wdFmt.format(now); // e.g., Mon
          const map: Record<string,number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
          userWeekday = map[short] ?? now.getUTCDay();
        } catch { userWeekday = now.getUTCDay(); }
        if (userWeekday === r.weekly_day && isDue(tz, r.weekly_time, now)) {
          if (r.last_weekly_sent !== todayUTC) {
            const text = 'Weekly recap time! Open Flowday to reflect on your week.';
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ chat_id: r.telegram_id, text })
              });
              weeklySent++;
              updates.push({ telegram_id: r.telegram_id, last_weekly_sent: todayUTC });
            } catch { /* ignore */ }
          }
        }
      }
    }

    // Persist updates (best-effort)
    for (const u of updates) {
      try { await supabase.from('reminders').update({ last_daily_sent: u.last_daily_sent, last_weekly_sent: u.last_weekly_sent, updated_at: new Date().toISOString() }).eq('telegram_id', u.telegram_id); } catch { /* ignore */ }
    }

    res.json({ ok:true, dailySent, weeklySent, checked: rows.length });
  } catch (e) {
    console.error('[cron-reminders] unexpected', (e as Error)?.message);
    res.status(500).json({ ok:false, error:'server-error' });
  }
}
