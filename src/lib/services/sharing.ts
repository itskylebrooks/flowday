// Client helper to share a poster image through Telegram's Mini App shareMessage flow (Android) with fallback.

interface TGWin { Telegram?: { WebApp?: { initData?: string; shareMessage?: (id:string)=>Promise<void> | void } } }
function getTG() { return (window as unknown as TGWin).Telegram?.WebApp; }

export async function sharePoster(pngDataURL: string, caption = 'Flowday'): Promise<{ ok:boolean; method?: string; error?: string }> {
  try {
    const tg = getTG();
    const initData = tg?.initData || '';
    const resp = await fetch('/api/share-poster', {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ initData, posterDataURL: pngDataURL, caption })
    });
    const json = await resp.json().catch(()=>null);
    if (!resp.ok || !json?.ok || !json.id) {
      // fallback path (web share API if available)
      return await fallbackShare(pngDataURL, json?.error || 'prepare-failed');
    }
    if (tg?.shareMessage) {
      await Promise.resolve(tg.shareMessage(json.id));
      return { ok:true, method:'telegram' };
    }
    return await fallbackShare(pngDataURL, 'no-shareMessage');
  } catch (e) {
    return await fallbackShare(pngDataURL, (e as Error)?.message || 'error');
  }
}

async function fallbackShare(pngDataURL: string, reason: string): Promise<{ ok:boolean; method?: string; error?: string }> {
  try {
    const nav = navigator as Navigator & { canShare?: (data?: ShareData)=>boolean; share?: (data: ShareData)=>Promise<void> };
    if (pngDataURL.startsWith('data:') && typeof nav.canShare === 'function') {
      const blob = await (await fetch(pngDataURL)).blob();
      const file = new File([blob], 'flowday.png', { type: 'image/png' });
      if (nav.canShare({ files: [file] as unknown as File[] })) {
        if (typeof nav.share === 'function') await nav.share({ files: [file], title: 'Flowday', text: 'My Flowday poster' });
        return { ok:true, method:'web-share' };
      }
    }
  } catch {/* ignore */}
  return { ok:false, error: reason };
}
