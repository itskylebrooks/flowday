import type { Entry } from '../lib/types';
import WeekTimeline from '../components/WeekTimeline';
import MonthFlow from '../components/MonthFlow';
import { loadUser } from '../lib/storage';
import { todayISO } from '../lib/utils';
import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';

export default function FlowsPage({ recent7, monthHues, monthEmpty, mode, onToggleMode }:
  { recent7: Entry[]; monthHues: number[]; monthEmpty: boolean; mode: 'week' | 'month'; onToggleMode: () => void }) {

  const user = loadUser();
  const [posterMode, setPosterMode] = useState(false); // controls meta visibility
  const posterRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  function formatToday(): string {
    const iso = todayISO();
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function handleSavePoster() {
    if (exporting) return;
    setExporting(true);
    setPosterMode(true); // start fade in
    const FADE_IN_MS = 420; // keep in sync with CSS durations (max .45s)
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
          backgroundColor: '#0E0E0E'
        });
        const a = document.createElement('a');
        const stamp = todayISO();
        a.download = `flowday-${mode}-${stamp}.png`;
        a.href = dataUrl;
        a.click();
  // Hide meta immediately after capture
  setPosterMode(false);
      } catch (err) {
        console.error(err);
        setPosterMode(false);
      } finally {
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
          <div key={mode} className="flow-anim w-full flex items-center justify-center">
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
          className="rounded-md px-3 py-2 text-sm text-white/90 ring-1 ring-white/15 hover:bg-white/5"
        >
          {mode === 'week' ? 'Switch to month' : 'Switch to week'}
        </button>
        <button
          onClick={handleSavePoster}
          disabled={exporting}
          className="rounded-md px-3 py-2 text-sm text-white/90 ring-1 ring-white/15 hover:bg-white/5 disabled:opacity-40"
        >
          {exporting ? 'Exporting…' : 'Save as poster'}
        </button>
      </div>
    </div>
  );
}