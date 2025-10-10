import { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { loadUser } from '@shared/lib/services/storage';
import { sharePoster } from '@shared/lib/services/sharing';
import type { Entry } from '@shared/lib/types/global';
import { todayISO } from '@shared/lib/utils';
import { MonthFlow, WeekTimeline } from '@shared/ui';

export default function FlowsPage({ recent7, monthHues, monthEmpty, mode, onToggleMode, animKey }:
  { recent7: Entry[]; monthHues: number[]; monthEmpty: boolean; mode: 'week' | 'month'; onToggleMode: () => void; animKey: string }) {

  const user = loadUser();
  const [posterMode, setPosterMode] = useState(false); // controls meta / instruction visibility
  const posterRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  // Environment detection (memoized to avoid recompute)
  const { isTelegram, isAndroidTelegram } = useMemo(() => {
    if (typeof window === 'undefined') return { isTelegram:false, isAndroidTelegram:false };
    const tgWebApp = (window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp;
    const ua = (navigator.userAgent || navigator.vendor || '').toLowerCase();
    const isAndroid = ua.includes('android');
    return { isTelegram: !!tgWebApp, isAndroidTelegram: !!tgWebApp && isAndroid };
  }, []);
  function formatToday(): string {
    const iso = todayISO();
    const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function handlePosterButton() {
    // Android Telegram: just toggle instructional text (screenshot flow)
    if (isAndroidTelegram) { setPosterMode(p => !p); return; }
    if (exporting) return;
    setExporting(true);
    setPosterMode(true); // show meta before capture
    const FADE_IN_MS = 420;
    setTimeout(async () => {
      try {
        const node = posterRef.current; if (!node) throw new Error('poster node missing');
        const width = node.offsetWidth;
        const dataUrl = await toPng(node, { width, height: width, cacheBust: true, pixelRatio: 2, backgroundColor: '#0E0E0E' });
        const stamp = todayISO();
        let shared = false;
        if (isTelegram) {
          // Attempt Telegram native share via prepared message API wrapper
            try {
              const result = await sharePoster(dataUrl, 'Flowday');
              if (result.ok && result.method === 'telegram') shared = true;
            } catch { /* ignore */ }
          if (!shared) {
            // Attempt Web Share API (outside / inside Telegram if available)
            try {
              const resp = await fetch(dataUrl); const blob = await resp.blob();
              const file = new File([blob], `flowday-${mode}-${stamp}.png`, { type: 'image/png' });
              const navShare = navigator as Navigator & { share?: (d: ShareData)=>Promise<void>; canShare?: (d: ShareData)=>boolean };
              const shareData: ShareData & { files?: File[] } = { files:[file], title:'Flowday', text:'My Flowday poster' };
              if (navShare.share) {
                if (!navShare.canShare || navShare.canShare(shareData)) {
                  await navShare.share(shareData);
                  shared = true;
                }
              }
            } catch { /* ignore */ }
          }
          if (!shared) {
            // Fallback to download inside Telegram
            const a = document.createElement('a');
            a.download = `flowday-${mode}-${stamp}.png`;
            a.href = dataUrl; a.click();
          }
        } else {
          // Non-Telegram browser: direct download
          const a = document.createElement('a');
          a.download = `flowday-${mode}-${stamp}.png`;
          a.href = dataUrl; a.click();
        }
      } catch (e) {
        console.error('poster share failed', e);
      } finally {
        setPosterMode(false);
        setExporting(false);
      }
    }, FADE_IN_MS);
  }

  return (
    <div className="flex h-full flex-col gap-8">
      <div className="text-sm uppercase tracking-[0.4em] text-white/45">Flow posters</div>
      <div className="flex flex-col items-center gap-6 select-none" ref={posterRef}>
        <div className={(posterMode ? 'active ' : '') + 'poster-meta mb-1'}>
          <div className="text-center poster-label text-[30px] leading-[1.05] text-white/95">{formatToday()}</div>
          <div className="mt-1 text-center poster-sub text-white/70 tracking-wider">My flowday</div>
        </div>
        <div className="relative w-full max-w-xl">
          <div key={animKey + '-' + mode} className="flow-anim flex items-center justify-center">
            {mode === 'week' ? (
              <WeekTimeline entries={recent7} />
            ) : (
              <MonthFlow hues={monthHues} empty={monthEmpty} />
            )}
          </div>
        </div>
        <div className={(posterMode ? 'active ' : '') + 'poster-meta'}>
          <div className={(mode==='week' ? 'mt-6' : 'mt-2') + ' text-center poster-label text-[22px] leading-[1.05] text-white/80'}>
            @{user.username}
          </div>
        </div>
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-2">
        <button
          onClick={onToggleMode}
          className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white/90 transition hover:border-white/25 hover:bg-white/[0.12]"
        >
          {mode === 'week' ? 'Switch to month view' : 'Switch to week view'}
        </button>
        <button
          onClick={handlePosterButton}
          disabled={!isAndroidTelegram && exporting}
          className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white/90 transition hover:border-white/25 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isAndroidTelegram
            ? (posterMode ? 'Hide poster text' : 'Show poster text')
            : isTelegram
              ? (exporting ? 'Exporting…' : 'Share poster')
              : (exporting ? 'Exporting…' : 'Save as poster')}
        </button>
      </div>
      {/* Android Telegram screenshot instruction overlay (no layout shift) */}
      {isAndroidTelegram && (
        <div
          className={
            'pointer-events-none absolute left-0 right-0 bottom-[130px] flex justify-center transition-all duration-300 text-center text-[13px] leading-snug ' +
            (posterMode ? 'opacity-100 translate-y-0 text-white/80' : 'opacity-0 translate-y-2 text-white/80')
          }
          aria-hidden={!posterMode}
        >
          <span className="px-2">
            Take a screenshot to share this poster. This is the simplest solution for Android Telegram right now.
          </span>
        </div>
      )}
    </div>
  );
}