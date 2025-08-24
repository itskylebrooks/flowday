import type { Entry } from '../lib/types';
import WeekTimeline from '../components/WeekTimeline';
import MonthFlow from '../components/MonthFlow';
import { loadUser } from '../lib/storage';
import { todayISO } from '../lib/utils';
import { useRef, useState, useMemo } from 'react';
import { sharePoster } from '../lib/sharePoster';
import { toPng } from 'html-to-image';

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
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
  <div className="mx-auto flex h-full max-w-sm flex-col px-4 pb-45 relative">
      {/* Center block: labels always mounted for smooth transitions */}
      <div className="flex flex-col flex-grow items-center justify-center select-none" ref={posterRef}>
        <div className={(posterMode ? 'active ' : '') + 'poster-meta mb-2'}>
          <div className="text-center poster-label text-[26px] leading-[1.05] text-white/95">{formatToday()}</div>
          <div className="mt-1 text-center poster-sub text-white/70 tracking-wider">My flowday</div>
        </div>
        <div className="relative">
          <div key={animKey + '-' + mode} className="flow-anim w-full flex items-center justify-center">
            {mode === 'week' ? (
              <WeekTimeline entries={recent7} />
            ) : (
              <MonthFlow hues={monthHues} empty={monthEmpty} />
            )}
          </div>
        </div>
        <div className={(posterMode ? 'active ' : '') + 'poster-meta'}>
          <div className={(mode==='week' ? 'mt-6' : 'mt-2') + ' text-center poster-label text-[20px] leading-[1.05] text-white/80'}>
            @{user.username}
          </div>
        </div>
      </div>

      {/* Bottom actions */}
        <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onToggleMode}
          className="rounded-md px-3 py-2 text-sm text-white/90 bg-white/5 hover:bg-white/10 active:bg-white/15 ring-1 ring-white/10 transition"
        >
          {mode === 'week' ? 'Switch to month' : 'Switch to week'}
        </button>
        <button
          onClick={handlePosterButton}
          disabled={!isAndroidTelegram && exporting}
          className="rounded-md px-3 py-2 text-sm text-white/90 bg-white/5 hover:bg-white/10 active:bg-white/15 ring-1 ring-white/10 transition disabled:opacity-40"
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