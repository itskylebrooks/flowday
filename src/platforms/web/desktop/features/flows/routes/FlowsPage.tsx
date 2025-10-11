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

  const shareLabel = isAndroidTelegram
    ? (posterMode ? 'Hide poster text' : 'Show poster text')
    : isTelegram
      ? (exporting ? 'Exporting…' : 'Share poster')
      : (exporting ? 'Exporting…' : 'Save as poster');

  const isWeek = mode === 'week';
  const isMonth = mode === 'month';

  function setMode(target: 'week' | 'month') {
    if (mode !== target) onToggleMode();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden text-white">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.55em] text-white/35">Flow posters</p>
          <h1 className="mt-3 text-4xl font-semibold leading-none tracking-tight text-white">Flows</h1>
          <p className="mt-4 max-w-xl text-base text-white/70">
            Build a native-sized flow poster designed for large screens. Swap between your weekly rhythm and the full month palette,
            then share the moment in a single click.
          </p>
        </div>
        <div className="flex h-12 items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 text-xs font-semibold uppercase tracking-[0.3em] text-white/55">
          <span className="rounded-full border border-white/25 bg-white px-3 py-[6px] text-[11px] font-semibold tracking-[0.32em] text-slate-950">Desktop</span>
          <span>Experience</span>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]">
        <div className="relative isolate flex items-center justify-center">
          <div className="pointer-events-none absolute -inset-20 hidden rounded-[48px] bg-[radial-gradient(circle_at_top,#6954ff33,transparent_65%)] blur-3xl lg:block" aria-hidden="true" />
          <div className="relative w-full max-w-3xl">
            <div className="relative overflow-hidden rounded-[40px] border border-white/12 bg-white/[0.04] px-10 py-12 shadow-[0_48px_120px_-60px_rgba(8,8,12,0.85)] backdrop-blur">
              <div className="absolute -top-48 left-1/2 hidden h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#6ef5ff15,transparent_60%)] blur-3xl md:block" aria-hidden="true" />
              <div className="relative flex flex-col items-center gap-10">
                <div className="relative w-full select-none" ref={posterRef}>
                  <div className={(posterMode ? 'active ' : '') + 'poster-meta mb-2 flex flex-col items-center gap-1'}>
                    <div className="poster-label text-[34px] font-semibold leading-[1.08] text-white/95">{formatToday()}</div>
                    <div className="poster-sub text-sm uppercase tracking-[0.38em] text-white/60">My flowday</div>
                  </div>
                  <div
                    key={animKey + '-' + mode}
                    className="flow-anim flex w-full items-center justify-center rounded-[28px] border border-white/10 bg-black/20 px-10 py-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    {isWeek ? (
                      <WeekTimeline entries={recent7} />
                    ) : (
                      <MonthFlow hues={monthHues} empty={monthEmpty} />
                    )}
                  </div>
                  <div className={(posterMode ? 'active ' : '') + 'poster-meta flex flex-col items-center'}>
                    <div className={(isWeek ? 'mt-7' : 'mt-4') + ' poster-label text-[24px] font-medium leading-[1.05] text-white/85'}>
                      @{user.username}
                    </div>
                  </div>
                </div>
                {isAndroidTelegram && (
                  <div
                    className={'pointer-events-none absolute inset-x-12 bottom-10 mx-auto max-w-[420px] rounded-full border border-white/15 bg-black/40 px-6 py-3 text-center text-[13px] leading-snug backdrop-blur transition-all duration-300 ' + (posterMode ? 'translate-y-0 opacity-100 text-white/80' : 'translate-y-2 opacity-0 text-white/80')}
                    aria-hidden={!posterMode}
                  >
                    Take a screenshot to share this poster. This is the simplest solution for Android Telegram right now.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className="flex w-full flex-col gap-6">
          <div className="rounded-[32px] border border-white/12 bg-white/[0.05] p-6 shadow-[0_24px_80px_rgba(6,7,11,0.62)] backdrop-blur">
            <div className="text-sm font-semibold uppercase tracking-[0.32em] text-white/45">View mode</div>
            <p className="mt-3 text-sm text-white/70">
              Toggle between the condensed week timeline and the immersive month canvas. Each view adapts the poster layout for large screens.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-white/[0.05] p-1">
              <button
                type="button"
                onClick={() => setMode('week')}
                className={(isWeek ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(15,20,35,0.35)] ' : 'text-white/65 hover:text-white ') + 'rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40'}
              >
                Week timeline
              </button>
              <button
                type="button"
                onClick={() => setMode('month')}
                className={(isMonth ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(15,20,35,0.35)] ' : 'text-white/65 hover:text-white ') + 'rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40'}
              >
                Month canvas
              </button>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/12 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(6,7,11,0.55)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Poster actions</h2>
                <p className="mt-1 text-sm text-white/65">Export or fine-tune the meta details before sharing.</p>
              </div>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.28em] text-white/65">{isWeek ? 'Week' : 'Month'}</span>
            </div>
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={onToggleMode}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white/90 transition hover:border-white/25 hover:bg-white/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                {mode === 'week' ? 'Switch to month view' : 'Switch to week view'}
              </button>
              <button
                type="button"
                onClick={handlePosterButton}
                disabled={!isAndroidTelegram && exporting}
                className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {shareLabel}
              </button>
            </div>
            <div className="mt-6 space-y-2 text-xs leading-relaxed text-white/50">
              <p>
                Poster mode reveals supplemental labels and username so your export mirrors the Flowday mobile share but scaled for desktop clarity.
              </p>
              {!isAndroidTelegram && (
                <p>
                  Exports use a 2× pixel ratio for crisp results. Share directly if Telegram or the Web Share API is available, otherwise we download the PNG for you.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
