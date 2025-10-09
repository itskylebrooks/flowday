import { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import MonthFlow from '@components/MonthFlow';
import WeekTimeline from '@components/WeekTimeline';
import { sharePoster } from '@lib/sharePoster';
import { loadUser } from '@lib/storage';
import { todayISO } from '@lib/utils';
import type { Entry } from '@lib/types';

type FlowsPageProps = {
  recent7: Entry[];
  monthHues: number[];
  monthEmpty: boolean;
  mode: 'week' | 'month';
  onToggleMode: () => void;
  animKey: string;
};

type SharePosterResult = {
  ok: boolean;
  method: 'telegram' | 'share-api' | 'download';
};

function detectTelegramEnvironment() {
  if (typeof window === 'undefined') {
    return { isTelegram: false, isAndroidTelegram: false } as const;
  }
  const tgWebApp = (window as { Telegram?: { WebApp?: object } }).Telegram?.WebApp;
  const ua = (navigator.userAgent || navigator.vendor || '').toLowerCase();
  const isAndroid = ua.includes('android');
  return {
    isTelegram: Boolean(tgWebApp),
    isAndroidTelegram: Boolean(tgWebApp && isAndroid),
  } as const;
}

function formatTodayLabel(): string {
  const iso = todayISO();
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function attemptWebShare(dataUrl: string, mode: 'week' | 'month'): Promise<boolean> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const stamp = todayISO();
    const file = new File([blob], `flowday-${mode}-${stamp}.png`, { type: 'image/png' });
    const navShare = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      canShare?: (data: ShareData & { files?: File[] }) => boolean;
    };
    const shareData: ShareData & { files?: File[] } = {
      files: [file],
      title: 'Flowday',
      text: 'My Flowday poster',
    };
    if (navShare.share && (!navShare.canShare || navShare.canShare(shareData))) {
      await navShare.share(shareData);
      return true;
    }
  } catch (error) {
    console.error('web share failed', error);
  }
  return false;
}

async function sharePosterFromTelegram(dataUrl: string): Promise<SharePosterResult> {
  try {
    const result = await sharePoster(dataUrl, 'Flowday');
    if (result.ok && result.method === 'telegram') {
      return { ok: true, method: 'telegram' };
    }
  } catch (error) {
    console.error('telegram share failed', error);
  }
  return { ok: false, method: 'download' };
}

function downloadPoster(dataUrl: string, mode: 'week' | 'month') {
  const stamp = todayISO();
  const anchor = document.createElement('a');
  anchor.download = `flowday-${mode}-${stamp}.png`;
  anchor.href = dataUrl;
  anchor.click();
}

export default function FlowsPage({
  recent7,
  monthHues,
  monthEmpty,
  mode,
  onToggleMode,
  animKey,
}: FlowsPageProps) {
  const user = loadUser();
  const [posterMode, setPosterMode] = useState(false);
  const posterRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const { isTelegram, isAndroidTelegram } = useMemo(detectTelegramEnvironment, []);

  const todayLabel = useMemo(formatTodayLabel, []);

  async function handlePosterButton() {
    if (isAndroidTelegram) {
      setPosterMode((current) => !current);
      return;
    }
    if (exporting) return;

    setExporting(true);
    setPosterMode(true);
    const FADE_IN_MS = 420;

    setTimeout(async () => {
      try {
        const node = posterRef.current;
        if (!node) throw new Error('poster node missing');
        const width = node.offsetWidth;
        const dataUrl = await toPng(node, {
          width,
          height: width,
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: '#0E0E0E',
        });

        let shared = false;
        if (isTelegram) {
          const telegramResult = await sharePosterFromTelegram(dataUrl);
          shared = telegramResult.ok;
          if (!shared) {
            shared = await attemptWebShare(dataUrl, mode);
          }
          if (!shared) {
            downloadPoster(dataUrl, mode);
          }
        } else {
          downloadPoster(dataUrl, mode);
          shared = true;
        }

        if (shared) {
          // no-op placeholder for future analytics
        }
      } catch (error) {
        console.error('poster share failed', error);
      } finally {
        setPosterMode(false);
        setExporting(false);
      }
    }, FADE_IN_MS);
  }

  return (
    <div className="relative mx-auto flex h-full max-w-sm flex-col px-4 pb-[45px]">
      <div className="flex grow select-none flex-col items-center justify-center" ref={posterRef}>
        <div className={`poster-meta mb-2 ${posterMode ? 'active' : ''}`}>
          <div className="poster-label text-center text-[26px] leading-[1.05] text-white/95">
            {todayLabel}
          </div>
          <div className="poster-sub mt-1 text-center tracking-wider text-white/70">My flowday</div>
        </div>
        <div className="relative">
          <div
            key={`${animKey}-${mode}`}
            className="flow-anim flex w-full items-center justify-center"
          >
            {mode === 'week' ? (
              <WeekTimeline entries={recent7} />
            ) : (
              <MonthFlow hues={monthHues} empty={monthEmpty} />
            )}
          </div>
        </div>
        <div className={`poster-meta ${posterMode ? 'active' : ''}`}>
          <div
            className={`poster-label text-center text-[20px] leading-[1.05] text-white/80 ${mode === 'week' ? 'mt-6' : 'mt-2'}`}
          >
            @{user.username}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onToggleMode}
          className="rounded-md bg-white/5 px-3 py-2 text-sm text-white/90 ring-1 ring-white/10 transition hover:bg-white/10 active:bg-white/15"
        >
          {mode === 'week' ? 'Switch to month' : 'Switch to week'}
        </button>
        <button
          onClick={handlePosterButton}
          disabled={!isAndroidTelegram && exporting}
          className="rounded-md bg-white/5 px-3 py-2 text-sm text-white/90 ring-1 ring-white/10 transition hover:bg-white/10 active:bg-white/15 disabled:opacity-40"
        >
          {isAndroidTelegram
            ? posterMode
              ? 'Hide poster text'
              : 'Show poster text'
            : isTelegram
              ? exporting
                ? 'Exporting…'
                : 'Share poster'
              : exporting
                ? 'Exporting…'
                : 'Save as poster'}
        </button>
      </div>

      {isAndroidTelegram && (
        <div
          className={`pointer-events-none absolute left-0 right-0 bottom-[130px] flex justify-center text-center text-[13px] leading-snug transition-all duration-300 ${posterMode ? 'translate-y-0 opacity-100 text-white/80' : 'translate-y-2 opacity-0 text-white/80'}`}
          aria-hidden={!posterMode}
        >
          <span className="px-2">
            Take a screenshot to share this poster. This is the simplest solution for Android
            Telegram right now.
          </span>
        </div>
      )}
    </div>
  );
}
