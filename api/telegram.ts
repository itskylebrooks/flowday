import { telegramVerifyHandler } from '../src/server/telegramVerify';
import { telegramSigninHandler } from '../src/server/telegramSignin';
import { telegramDeleteHandler } from '../src/server/telegramDelete';
import { telegramUpdateUsernameHandler } from '../src/server/telegramUpdateUsername';

export const config = { runtime: 'nodejs' };

interface Req { url?: string; method?: string; body?: unknown; headers?: Record<string,string|undefined> }
interface Res { status:(c:number)=>Res; json:(v:unknown)=>void }

export default async function handler(req: Req, res: Res) {
  const path = req.url || '';
  if (path.endsWith('/verify')) return telegramVerifyHandler(req, res);
  if (path.endsWith('/signin')) return telegramSigninHandler(req, res);
  if (path.endsWith('/delete')) return telegramDeleteHandler(req, res);
  if (path.endsWith('/update-username')) return telegramUpdateUsernameHandler(req, res);
  return res.status(404).json({ ok:false, error:'not-found' });
}
