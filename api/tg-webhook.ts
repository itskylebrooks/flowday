import type { TGUser } from './_tg';

export const config = { runtime: 'nodejs' };

// Minimal subset of Update/Message types we need
type Chat = { id: number; type?: string };
type User = { id: number; is_bot?: boolean; username?: string; first_name?: string };
type Message = { message_id?: number; from?: User; chat?: Chat; text?: string; entities?: Array<{ type: string; offset: number; length: number }>; reply_to_message?: Message };
type Update = { update_id?: number; message?: Message; edited_message?: Message };

interface Req { method?: string; body?: unknown; }
interface Res { status: (c:number)=>Res; json: (v:unknown)=>void; }

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINIAPP_URL = process.env.MINIAPP_URL;

const TELEGRAM_API = (method: string) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

async function api(method: string, payload: Record<string, unknown>) {
  if (!BOT_TOKEN) throw new Error('missing-bot-token');
  const res = await fetch(TELEGRAM_API(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(()=>({ ok:false, error: 'invalid-json' }));
  if (!json || (json as any).ok === false) throw new Error('telegram-api-failed');
  return json;
}

async function sendMessage(chat_id: number, text: string, opts?: { parse_mode?: string; reply_markup?: unknown }){
  const payload: Record<string, unknown> = { chat_id, text };
  if (opts?.parse_mode) payload.parse_mode = opts.parse_mode;
  if (opts?.reply_markup) payload.reply_markup = opts.reply_markup;
  return api('sendMessage', payload);
}

function truncateKeepLink(text: string, link: string, max = 4000) {
  if (text.length <= max) return text;
  // Ensure link remains intact at the end. If link is inside text, prefer to keep it.
  if (text.includes(link)) {
    const before = text.split(link)[0];
    const allowed = Math.max(0, max - link.length - 3);
    return before.slice(0, allowed) + '...' + link;
  }
  // link not present; append it
  const allowed = Math.max(0, max - link.length - 3);
  return text.slice(0, allowed) + '...' + link;
}

export default async function handler(req: Req, res: Res) {
  try {
    // Only POST updates come from Telegram
    if (req.method !== 'POST') {
      return res.status(200).json({ ok: true });
    }

    const update = (req.body as Update) || {};
    const msg = update.message;
    if (!msg || !msg.text) {
      return res.status(200).json({ ok: true });
    }

    const chat = msg.chat;
    if (!chat || chat.type !== 'private') {
      return res.status(200).json({ ok: true });
    }
    if (!msg.from || msg.from.is_bot) {
      return res.status(200).json({ ok: true });
    }

    const text = msg.text.trim();
    const chat_id = chat.id;

    if (text.startsWith('/start')) {
      if (!MINIAPP_URL) {
        console.error('[tg-webhook] missing MINIAPP_URL');
        try { await sendMessage(chat_id, 'Service temporarily unavailable.'); } catch (e) {
          console.error('[tg-webhook] fallback-send-failed', (e as Error).message);
        }
        return res.status(200).json({ ok: true });
      }

      const welcome =
        `Flowday — your mood diary on Telegram.\n` +
        `Track each day with up to 3 emojis, a color, and an optional song. ` +
        `Your data syncs across Telegram devices.`;

      // Preferred: web_app button
      const preferred = {
        inline_keyboard: [[
          { text: 'Open Flowday', web_app: { url: MINIAPP_URL } }
        ]]
      };

      try {
        await sendMessage(chat_id, welcome, { reply_markup: preferred });
      } catch (e) {
        // Fallback: plain URL button (older clients)
        console.error('[tg-webhook] web_app send failed, retrying with url button', (e as Error).message);
        const fallback = {
          inline_keyboard: [[
            { text: 'Open Flowday', url: MINIAPP_URL }
          ]]
        };
        try {
          await sendMessage(chat_id, welcome, { reply_markup: fallback });
        } catch (err) {
          console.error('[tg-webhook] send fallback failed', (err as Error).message);
        }
      }

      return res.status(200).json({ ok: true });
    }

    // Ignore other commands/text for now
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[tg-webhook] unexpected', (e as Error).message);
    try { return res.status(200).json({ ok: true }); } catch { /* no-op */ }
  }
}
