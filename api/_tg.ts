// Shared Telegram WebApp initData verification utilities (server-side only)
// Implements HMAC validation per Telegram spec:
// https://core.telegram.org/bots/webapps#initializing-mini-apps
import * as crypto from 'crypto';

export interface TGUser { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string }

export function isValidInitData(initData: string, botToken: string): boolean {
  try {
    if (!initData || !botToken) return false;
    const url = new URLSearchParams(initData);
    const hash = url.get('hash') || '';
    if (!hash) return false;
    url.delete('hash');
    const dataCheckString = [...url.entries()]
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([k,v]) => `${k}=${v}`)
      .join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    return hmac === hash;
  } catch {
    return false;
  }
}

export function parseTGUser(initData: string): TGUser | null {
  try {
    const params = new URLSearchParams(initData);
    const raw = params.get('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'number') return null;
    return parsed as TGUser;
  } catch {
    return null;
  }
}

export function devReason(reason: string) {
  if (process.env.NODE_ENV !== 'production') return { reason };
  return {}; // hide reasons in prod
}
