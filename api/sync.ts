import { syncPullHandler } from '../src/server/syncPull';
import { syncPushHandler } from '../src/server/syncPush';

export const config = { runtime: 'nodejs' };

interface Req { url?: string; method?: string; body?: unknown; headers?: Record<string,string|undefined> }
interface Res { status:(c:number)=>Res; json:(v:unknown)=>void }

export default async function handler(req: Req, res: Res) {
  const path = req.url || '';
  if (path.endsWith('/pull')) return syncPullHandler(req, res);
  if (path.endsWith('/push')) return syncPushHandler(req, res);
  return res.status(404).json({ ok:false, error:'not-found' });
}
