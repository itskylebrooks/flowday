export const config = { runtime: 'nodejs' };

const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = (method: string) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

async function api(method: string, payload: Record<string, unknown>) {
  if (!BOT_TOKEN) throw new Error('missing-bot-token');
  const res = await fetch(TELEGRAM_API(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export default async function handler(req: { method?: string }, res: { status: (n:number)=>any; json: (v:unknown)=>void }) {
  try {
    // Allow GET or POST for convenience
    if (!BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
    const commands = [
      { command: 'start', description: 'Open Flowday' }
    ];
    const resp = await api('setMyCommands', { commands });
    return res.json(resp);
  } catch (e) {
    console.error('[tg-set-commands] failed', (e as Error).message);
    try { return res.status(500).json({ ok:false, error: 'failed' }); } catch { /* noop */ }
  }
}
