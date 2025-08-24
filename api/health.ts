export const config = { runtime: 'nodejs' };

interface Res { status:(c:number)=>Res; json:(v:unknown)=>void }

export default function handler(req: unknown, res: Res) {
  res.status(200).json({ ok: true });
}
