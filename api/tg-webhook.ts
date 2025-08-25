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
const PRIVACY_URL = process.env.PRIVACY_URL;

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
  // Always return 200 quickly to satisfy Telegram
  try { res.status(200).json({ ok: true }); } catch {/* best-effort */}

  // Process in background; don't throw from here. Log failures.
  (async () => {
    try {
      if (req.method !== 'POST') return;
      const update = (req.body as Update) || {};
      const msg = update.message;
      if (!msg || !msg.text) return; // ignore non-text
      const chat = msg.chat;
      if (!chat || chat.type !== 'private') return; // only private chats
      if (!msg.from || msg.from.is_bot) return;

      const text = msg.text.trim();
      const chat_id = chat.id;

      // Helper to send fallback service-unavailable message
      const serviceUnavailable = async () => {
        try { await sendMessage(chat_id, 'Service temporarily unavailable.'); } catch (e) { console.error('[tg-webhook] fallback-send-failed', (e as Error).message); }
      };

      if (text.startsWith('/start')) {
        if (!MINIAPP_URL) {
          console.error('[tg-webhook] missing MINIAPP_URL');
          await serviceUnavailable();
          return;
        }

        const welcome = `Flowday — your mood diary on Telegram.\nTrack each day with up to 3 emojis, a color, and an optional song. Your data syncs across Telegram devices.`;

        // Build preferred reply_markup with web_app; include Privacy button only if PRIVACY_URL is set
        const buttons: Array<Record<string, unknown>> = [];
        buttons.push({ text: 'Open Flowday', web_app: { url: MINIAPP_URL } });
        if (PRIVACY_URL) buttons.push({ text: 'Privacy', url: PRIVACY_URL });

        const preferred = { inline_keyboard: [[ ...buttons ]] };

        try {
          await sendMessage(chat_id, welcome, { reply_markup: preferred });
        } catch (e) {
          // Try fallback with plain URL button
          console.error('[tg-webhook] web_app send failed, retrying with url button', (e as Error).message);
          try {
            const fallbackButtons: Array<Record<string, unknown>> = [ { text: 'Open Flowday', url: MINIAPP_URL } ];
            if (PRIVACY_URL) fallbackButtons.push({ text: 'Privacy', url: PRIVACY_URL });
            const fallback = { inline_keyboard: [[ ...fallbackButtons ]] };
            await sendMessage(chat_id, welcome, { reply_markup: fallback });
          } catch (err) {
            console.error('[tg-webhook] send fallback failed', (err as Error).message);
          }
        }
        return;
      }

  // /privacy command removed — ignored

      // ignore other commands/text
      return;
    } catch (e) {
      console.error('[tg-webhook] unexpected', (e as Error).message);
    }
  })();
}
