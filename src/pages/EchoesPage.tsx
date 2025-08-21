import { useMemo, useState, useRef } from 'react';
import type { Entry } from '../lib/types';
import { hsl } from '../lib/utils';

interface EchoesPageProps { entries: Entry[]; }

export default function EchoesPage({ entries }: EchoesPageProps) {
  // Only consider entries that have a song (title or artist)
  const withSongs = useMemo(()=> entries.filter(e => e.song && (e.song.title || e.song.artist)), [entries]);
  // Group by YYYY-MM
  const byMonth = useMemo(()=> {
    const map = new Map<string, Entry[]>();
    for (const e of withSongs) {
      const ym = e.date.slice(0,7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(e);
    }
    // sort months descending (newest first)
    const months = [...map.entries()].sort((a,b)=> b[0].localeCompare(a[0]));
    // sort each month by date ascending
  for (const [, arr] of months) arr.sort((a,b)=> a.date.localeCompare(b.date));
    return months;
  }, [withSongs]);

  const [active, setActive] = useState<Entry | null>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  function openModal(e: Entry) {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    setClosing(false);
    setActive(e);
  }

  function beginClose() {
    if (!active || closing) return;
    setClosing(true);
    // Match settingsOut duration (.28s) + small buffer
    closeTimer.current = window.setTimeout(()=>{ setActive(null); setClosing(false); }, 300);
  }

  function monthLabel(ym: string): string {
    const [y,m] = ym.split('-').map(Number);
    const d = new Date(y, m-1, 1);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-8">
        {byMonth.map(([ym, list]) => (
          <div key={ym} className="space-y-3">
            <div className="text-xs text-white/55 tracking-wide uppercase">{monthLabel(ym)}</div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{scrollSnapType:'x proximity'}}>
              {list.map(e => {
                const title = e.song?.title || '';
                const artist = e.song?.artist || '';
                const bg = typeof e.hue==='number' ? hsl(e.hue,80,50) : 'hsl(0 0% 25% / 0.8)';
                return (
                  <button key={e.date} onClick={()=> openModal(e)}
                    className="relative shrink-0 w-[140px] h-[84px] rounded-lg ring-1 ring-white/10 shadow-sm flex flex-col items-center justify-center text-center px-2 scroll-snap-align-start hover:ring-white/25 transition"
                    style={{ background:bg }}>
                    <div className="relative z-10 w-full flex items-center justify-center">
                      <div className="cassette-sticker font-tape w-full mx-1 px-2 py-1.5 leading-snug flex flex-col items-center justify-center">
                        <div className="text-[11px] text-black/80 w-full overflow-hidden text-ellipsis whitespace-nowrap" title={title}>{title || '—'}</div>
                        <div className="mt-0.5 text-[10px] text-black/65 w-full overflow-hidden text-ellipsis whitespace-nowrap" title={artist}>{artist || ''}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!byMonth.length && (
          <div className="mt-10 text-center text-sm text-white/45">No songs yet. Add artist & title on the Today page.</div>
        )}
      </div>

      {active && (
        <div className={"fixed inset-0 z-50 flex items-center justify-center settings-overlay " + (closing ? 'closing':'')} onClick={beginClose}>
          <div className={"settings-panel bg-[#111] w-full max-w-sm mx-auto rounded-2xl p-6 relative " + (closing ? 'closing':'')} onClick={e=>e.stopPropagation()}>
            <div className="text-center mb-3 text-sm font-medium tracking-wide text-white/85">{active.date}</div>
            <div className="rounded-xl mb-4 relative overflow-hidden h-[200px] px-6 py-8 flex flex-col justify-center" style={{background: typeof active.hue==='number'? hsl(active.hue,80,50): '#3a3a3a'}}>
              {/* Reels overlay (lighter, bigger, no border) */}
              {/* Reel circles spaced farther apart by reducing horizontal padding */}
              <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
                <div className="w-20 h-20 rounded-full bg-white/18" />
                <div className="w-20 h-20 rounded-full bg-white/18" />
              </div>
              <div className="relative z-10 text-center px-2 font-tape">
                <div className="text-base md:text-lg text-black/85 break-words leading-snug">{active.song?.title || 'Untitled'}</div>
                {active.song?.artist && (
                  <div className="mt-1 text-xs md:text-sm text-black/70 break-words leading-snug">{active.song?.artist}</div>
                )}
              </div>
            </div>
            <div className="flex justify-center">
              <button onClick={beginClose} className="rounded-md px-4 py-1.5 text-sm font-medium text-white/85 ring-1 ring-white/15 hover:bg-white/5">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}