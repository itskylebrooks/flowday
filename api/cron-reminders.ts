import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabaseInitError: string | null = null;
const supabase = (function init(){
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { supabaseInitError = 'missing-supabase-env'; return null as unknown as ReturnType<typeof createClient>; }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
})();

interface Req { method?: string; headers?: Record<string,string|undefined>; body?: unknown }
interface Res { status:(c:number)=>Res; json:(v:unknown)=>void }

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

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
      .select('telegram_id,daily_enabled,last_sent_on')
      .eq('daily_enabled', true)
      .limit(1000);
    if (error) return res.status(500).json({ ok:false, error:'db-error' });

  type Row = { telegram_id: number; daily_enabled: boolean; last_sent_on: string | null };
  const rows: Row[] = (data as unknown as Row[]) || [];

    const today = new Date().toISOString().slice(0,10); // UTC date YYYY-MM-DD
    let sent = 0;
    const errors: Array<{ id: number; message: string }> = [];

    for (const r of rows) {
      const lastSent = r.last_sent_on || null; // 'YYYY-MM-DD' or null
      if (lastSent === today) continue; // already sent today
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
        if (resp.status === 429) {
          // Respect rate limit and retry once
          const ra = Number(resp.headers.get('retry-after') || '1');
          await sleep(Math.min(ra * 1000, 5000));
          const retry = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
          });
          if (!retry.ok) {
            const body = await retry.text().catch(()=>'<no-body>');
            errors.push({ id: chatId, message: `telegram-send-failed-429-retry ${retry.status} ${body}` });
            continue;
          }
        } else if (!resp.ok) {
          const body = await resp.text().catch(()=>'<no-body>');
          // If user blocked the bot or chat not found, auto-disable reminders for this id
          if (resp.status === 403 || (resp.status === 400 && /chat not found/i.test(body))) {
            await supabase.from('reminders').update({ daily_enabled: false }).eq('telegram_id', chatId);
          }
          errors.push({ id: chatId, message: `telegram-send-failed ${resp.status} ${body}` });
          continue;
        }
        // Mark as sent for today. Guard so we don't overwrite if another worker updated.
        const { error: upErr } = await supabase
          .from('reminders')
          .update({ last_sent_on: today })
          .eq('telegram_id', chatId)
          .or(`last_sent_on.is.null,last_sent_on.lt.${today}`);
        if (upErr) {
          errors.push({ id: chatId, message: 'db-update-failed' });
          continue;
        }
        sent++;
        // Gentle pace to avoid bursts
        await sleep(35);
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
