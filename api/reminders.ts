import { remindersGetHandler } from '../src/server/remindersGet';
import { remindersSetHandler } from '../src/server/remindersSet';
import { cronRemindersHandler } from '../src/server/cronReminders';

export const config = { runtime: 'nodejs' };

interface Req { url?: string; method?: string; body?: unknown; headers?: Record<string,string|undefined> }
interface Res { status:(c:number)=>Res; json:(v:unknown)=>void }

export default async function handler(req: Req, res: Res) {
  const path = req.url || '';
  if (path.endsWith('/cron-reminders')) return cronRemindersHandler(req, res);
  if (path.endsWith('/reminders/get')) return remindersGetHandler(req, res);
  if (path.endsWith('/reminders/set')) return remindersSetHandler(req, res);
  return res.status(404).json({ ok:false, error:'not-found' });
}
