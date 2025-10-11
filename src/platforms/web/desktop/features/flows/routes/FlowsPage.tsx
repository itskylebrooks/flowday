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

  const accentGradient = mode === 'week'
    ? 'from-sky-500/60 via-blue-400/10 to-indigo-500/20'
    : 'from-rose-500/60 via-purple-400/10 to-amber-500/20';

  return (
    <div className="flex h-full flex-col text-white">
      <header className="flex flex-col gap-3 border-b border-white/5 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.5em] text-white/45">Flowday Desktop</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Flows</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleMode}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              {mode === 'week' ? 'Show month poster' : 'Show week poster'}
            </button>
            <button
              onClick={handlePosterButton}
              disabled={!isAndroidTelegram && exporting}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isAndroidTelegram
                ? (posterMode ? 'Hide poster text' : 'Show poster text')
                : isTelegram
                  ? (exporting ? 'Exporting…' : 'Share poster')
                  : (exporting ? 'Exporting…' : 'Save as poster')}
            </button>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-white/60">
          A desktop-grade canvas for your weekly and monthly flows. Switch modes, capture a poster, and share the gradient that
          matches your current vibe.
        </p>
      </header>

      <div className="mt-8 flex flex-1 flex-col gap-8 lg:flex-row">
        <div className="relative flex flex-[1.7] select-none items-stretch">
          <div
            ref={posterRef}
            className={
              'relative flex w-full flex-col overflow-hidden rounded-[36px] border border-white/8 bg-gradient-to-br p-12 shadow-[0_30px_120px_rgba(0,0,0,0.6)] backdrop-blur-xl ' +
              accentGradient
            }
          >
            <div className="absolute left-12 top-12 flex gap-3 text-xs font-medium uppercase tracking-[0.4em] text-white/60">
              <span>Flow poster</span>
              <span className="text-white/30">·</span>
              <span>{mode === 'week' ? 'Week timeline' : 'Monthly ribbon'}</span>
            </div>

            <div className={(posterMode ? 'active ' : '') + 'poster-meta flex flex-col items-center pt-16'}>
              <div className="text-center font-poster text-[38px] leading-[1.05] text-white/95">{formatToday()}</div>
              <div className="mt-2 text-center text-sm uppercase tracking-[0.45em] text-white/70">My Flowday</div>
            </div>

            <div className="relative mt-10 flex flex-1 items-center justify-center">
              <div className="relative flex aspect-square w-full max-w-[520px] items-center justify-center rounded-[32px] border border-white/20 bg-black/50 p-10 shadow-[0_25px_100px_rgba(0,0,0,0.55)]">
                <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-white/15 via-white/5 to-transparent opacity-40" aria-hidden />
                <div className="relative flex items-center justify-center">
                  <div className="scale-[1.45] transform-gpu origin-center">
                    <div key={animKey + '-' + mode} className="flow-anim flex items-center justify-center">
                      {mode === 'week' ? (
                        <WeekTimeline entries={recent7} />
                      ) : (
                        <MonthFlow className="!mx-0" hues={monthHues} empty={monthEmpty} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={(posterMode ? 'active ' : '') + 'poster-meta mt-12 flex flex-col items-center pb-4'}>
              <div className="font-poster text-[24px] leading-[1.05] text-white/85">@{user.username}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.35em] text-white/55">Flowday • {mode === 'week' ? 'Week mode' : 'Month mode'}</div>
            </div>
          </div>

          {/* Android Telegram screenshot instruction overlay (no layout shift) */}
          {isAndroidTelegram && (
            <div
              className={
                'pointer-events-none absolute left-0 right-0 bottom-[120px] flex justify-center text-center text-[13px] leading-snug transition-all duration-300 ' +
                (posterMode ? 'translate-y-0 text-white/80 opacity-100' : 'translate-y-2 text-white/80 opacity-0')
              }
              aria-hidden={!posterMode}
            >
              <span className="rounded-full bg-black/40 px-4 py-2 shadow-lg backdrop-blur">Take a screenshot to share this poster. This is the simplest solution for Android Telegram right now.</span>
            </div>
          )}
        </div>

        <aside className="flex flex-1 flex-col justify-between rounded-[28px] border border-white/8 bg-white/[0.04] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">Poster controls</h2>
              <p className="mt-2 text-sm text-white/55">
                Choose the data window you want to spotlight and toggle helper text before exporting a PNG or sharing directly from
                the desktop app shell.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                <div className="text-xs uppercase tracking-[0.35em] text-white/45">Mode</div>
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={() => { if (mode !== 'week') onToggleMode(); }}
                    className={
                      'flex-1 rounded-2xl px-4 py-3 text-sm font-medium transition ' +
                      (mode === 'week'
                        ? 'bg-white/80 text-black shadow-[0_10px_30px_rgba(15,15,15,0.35)]'
                        : 'border border-white/15 bg-white/5 text-white/75 hover:border-white/25 hover:bg-white/10')
                    }
                  >
                    Week timeline
                  </button>
                  <button
                    onClick={() => { if (mode !== 'month') onToggleMode(); }}
                    className={
                      'flex-1 rounded-2xl px-4 py-3 text-sm font-medium transition ' +
                      (mode === 'month'
                        ? 'bg-white/80 text-black shadow-[0_10px_30px_rgba(15,15,15,0.35)]'
                        : 'border border-white/15 bg-white/5 text-white/75 hover:border-white/25 hover:bg-white/10')
                    }
                  >
                    Month ribbon
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <div className="text-xs uppercase tracking-[0.35em] text-white/45">Poster tips</div>
                <ul className="mt-4 space-y-3 text-sm text-white/65">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-white/70" aria-hidden />
                    <span>Use the toggle above to reveal the timestamp + username overlay before exporting.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-white/70" aria-hidden />
                    <span>Posters export as perfect squares—ideal for sharing on Telegram, Discord, or saving to your gallery.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-white/70" aria-hidden />
                    <span>
                      {isTelegram ? 'Telegram users can share natively right after capture.' : 'Downloads start instantly on desktop browsers.'}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Today&apos;s highlight</div>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-white/95">{formatToday()}</div>
            <div className="mt-2 text-sm text-white/60">
              {mode === 'week'
                ? 'Seven days of mood gradients stitched together as a clean timeline.'
                : 'A full-month hue ribbon showing how your colors evolve over time.'}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}