import { isValidInitData, parseTGUser, devReason } from './_tg';
import { allow } from './_rate';

export const config = { runtime: 'nodejs' };

interface ReqBody { initData?: string; posterDataURL?: string; caption?: string }
interface Req { method?: string; body?: unknown }
interface Res { status: (c:number)=>Res; json:(v:unknown)=>void }

// Telegraph upload helper: accepts a data URL (PNG) and returns public HTTPS URL
async function uploadToTelegraph(pngDataUrl: string): Promise<string> {
  if (!pngDataUrl.startsWith('data:image/png;base64,')) throw new Error('invalid-image');
  const base64 = pngDataUrl.split(',')[1] || '';
  // Cap size (~2MB) to avoid abuse (PNG base64 length *0.75 ≈ bytes)
  if (base64.length / 1.37 > 2_000_000) throw new Error('image-too-large');
  const bytes = Buffer.from(base64, 'base64');
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'image/png' }), 'poster.png');
  const resp = await fetch('https://telegra.ph/upload', { method: 'POST', body: form });
  if (!resp.ok) throw new Error('telegraph-upload-failed');
  let json: Array<{ src?: string }>;
  try { json = await resp.json(); } catch { throw new Error('telegraph-bad-json'); }
  if (!Array.isArray(json) || !json[0]?.src) throw new Error('telegraph-upload-failed');
  return 'https://telegra.ph' + json[0].src;
}

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    if (!process.env.BOT_TOKEN) return res.status(500).json({ ok:false, error:'missing-bot-token' });
  const { initData, posterDataURL, caption } = (req.body || {}) as ReqBody;
    if (!initData) return res.status(400).json({ ok:false, error:'missing-initData', ...devReason('initData') });
    if (!posterDataURL) return res.status(400).json({ ok:false, error:'missing-poster' });
    if (!isValidInitData(initData, process.env.BOT_TOKEN)) return res.status(401).json({ ok:false, error:'invalid-hmac', ...devReason('hmac') });
    const u = parseTGUser(initData);
    if (!u?.id) return res.status(400).json({ ok:false, error:'invalid-user', ...devReason('user') });

    // Basic per-user throttle (one every 5s)
    if (!allow('share:'+u.id, 5000)) return res.status(429).json({ ok:false, error:'rate-limited', ...devReason('rate') });

    let photoUrl: string;
    try { photoUrl = await uploadToTelegraph(posterDataURL); } catch (e) {
      const msg = (e as Error)?.message || 'telegraph-error';
      const mapped = ['invalid-image','image-too-large','telegraph-upload-failed','telegraph-bad-json'].includes(msg) ? msg : 'telegraph-upload-failed';
      return res.status(400).json({ ok:false, error: mapped });
    }

    const resultPayload = {
      user_id: u.id,
      result: {
        type: 'photo',
        id: '1',
        photo_url: photoUrl,
        thumbnail_url: photoUrl,
        title: caption || 'Flowday',
        caption: caption || 'My Flowday poster',
        parse_mode: 'HTML'
      },
      allow_user_chats: true,
      allow_bot_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true
    };

    const tgResp = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/savePreparedInlineMessage`, {
      method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(resultPayload)
    });
    interface TgResp { ok?: boolean; result?: { id?: string }; description?: string }
    let tgJson: TgResp | null = null;
    try { tgJson = await tgResp.json(); } catch { /* ignore */ }
    if (!tgResp.ok || !tgJson?.ok || !tgJson.result?.id) {
      return res.status(500).json({ ok:false, error:'tg-api-failed', detail: tgJson?.description });
    }
    res.json({ ok:true, id: tgJson.result.id });
  } catch (e) {
    console.error('[share-poster] unexpected', (e as Error)?.message);
    res.status(500).json({ ok:false, error:'server-error' });
  }
}
