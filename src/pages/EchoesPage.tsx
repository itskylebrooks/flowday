import { useMemo, useState, useRef, useEffect } from 'react';
import cassetteInsert from '../assets/audio/cassette-insert.mp3';
import cassetteEject from '../assets/audio/cassette-eject.mp3';
import type { Entry } from '../lib/types';
import { hsl } from '../lib/utils';

interface EchoesPageProps { entries: Entry[]; yearOffset: number; }

export default function EchoesPage({ entries, yearOffset }: EchoesPageProps) {
  // Only consider entries that have a song (title or artist)
  const withSongs = useMemo(()=> entries.filter(e => e.song && (e.song.title || e.song.artist)), [entries]);
  // Filter by target year based on offset (0 = current year, 1 = last year, etc.)
  const targetYear = useMemo(()=> {
    const baseYear = parseInt(new Date().toISOString().slice(0,4),10);
    return baseYear - yearOffset;
  }, [yearOffset]);

  // Group by YYYY-MM for that year only
  const byMonth = useMemo(()=> {
    const map = new Map<string, Entry[]>();
    for (const e of withSongs) {
      if (parseInt(e.date.slice(0,4),10) !== targetYear) continue;
      const ym = e.date.slice(0,7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(e);
    }
    // sort months descending (newest first)
    const months = [...map.entries()].sort((a,b)=> b[0].localeCompare(a[0]));
    // sort each month by date ascending
  for (const [, arr] of months) arr.sort((a,b)=> a.date.localeCompare(b.date));
    return months;
  }, [withSongs, targetYear]);

  const [active, setActive] = useState<Entry | null>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  // Audio elements managed imperatively (constructed once)
  const openAudioRef = useRef<HTMLAudioElement | null>(null);
  const closeAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(()=> {
    openAudioRef.current = new Audio(cassetteInsert);
    closeAudioRef.current = new Audio(cassetteEject);
    if (openAudioRef.current) openAudioRef.current.volume = 0.55;
    if (closeAudioRef.current) closeAudioRef.current.volume = 0.55;
  }, []);

  function openModal(e: Entry) {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    setClosing(false);
    setActive(e);
  // Play open (insert) sound
  const a = openAudioRef.current;
  if (a) { try { a.currentTime = 0; a.play(); } catch { /* ignore play interruption */ } }
  }

  function beginClose() {
    if (!active || closing) return;
    setClosing(true);
  // Play close (eject) sound
  const a = closeAudioRef.current;
  if (a) { try { a.currentTime = 0; a.play(); } catch { /* ignore play interruption */ } }
    // Match settingsOut duration (.28s) + small buffer
    closeTimer.current = window.setTimeout(()=>{ setActive(null); setClosing(false); }, 300);
  }

  function monthLabel(ym: string): string {
    const [,m] = ym.split('-').map(Number);
    const d = new Date(targetYear, m-1, 1);
    return d.toLocaleDateString(undefined, { month: 'long' });
  }

  return (
    <div className="h-full flex flex-col">
  {/* Audio handled via imported mp3 modules */}
      <div key={"year-"+yearOffset} className="flex-1 overflow-y-auto px-4 pb-10 space-y-10 echoes-year-anim">
        {byMonth.map(([ym, list]) => (
          <div key={ym} className="space-y-4">
            <div className="text-center text-sm text-white/70 font-medium">{monthLabel(ym)}</div>
            <div className="flex flex-wrap gap-4 justify-center">
              {list.map(e => {
                const title = e.song?.title || '';
                const artist = e.song?.artist || '';
                const bg = typeof e.hue==='number' ? hsl(e.hue,80,50) : 'hsl(0 0% 25% / 0.8)';
                return (
                  <button key={e.date} onClick={()=> openModal(e)}
                    className="relative w-[140px] h-[84px] rounded-lg ring-1 ring-white/10 shadow-sm flex flex-col items-center justify-center text-center px-2 hover:ring-white/25 transition"
                    style={{ background:bg }}>
                    <div className="relative z-10 w-full flex items-center justify-center">
                      <div className="cassette-sticker font-tape w-full mx-1 px-2 py-2 leading-snug flex flex-col items-center justify-center gap-1.5">
                        <div className="cassette-row title-row text-[11px] text-black/60 w-full overflow-hidden text-ellipsis whitespace-nowrap" title={title}>{title || '—'}</div>
                        <div className="cassette-row artist-row text-[10px] text-black/50 w-full overflow-hidden text-ellipsis whitespace-nowrap" title={artist}>{artist || ''}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!byMonth.length && (
          <div className="mt-10 text-center text-sm text-white/45">No songs for this year.</div>
        )}
      </div>

      {active && (
        <div className={"fixed inset-0 z-50 flex items-center justify-center settings-overlay " + (closing ? 'closing':'')} onClick={beginClose}>
          <div className={"settings-panel bg-[#111] w-full max-w-sm mx-auto rounded-2xl p-6 relative " + (closing ? 'closing':'')} onClick={e=>e.stopPropagation()}>
            <div className="text-center mb-3 text-sm font-medium tracking-wide text-white/85">{active.date}</div>
            <div className="rounded-xl mb-4 relative overflow-hidden h-[200px] px-6 py-4 flex flex-col cassette-preview" style={{
              background: typeof active.hue==='number'? hsl(active.hue,80,50): '#3a3a3a',
              ['--reel-color' as unknown as string]: typeof active.hue==='number'? hsl(active.hue,75,60): '#bbb'
            }}>
              {/* Animated SVG reels */}
              <div className="pointer-events-none absolute inset-0">
                <div className="reel-spin reel-left" aria-hidden="true"><ReelSVG /></div>
                <div className="reel-spin reel-right" aria-hidden="true"><ReelSVG /></div>
              </div>
              <div className="relative z-10 text-center px-2 font-tape h-full w-full flex flex-col">
                {(() => {
                  const title = active.song?.title || 'Untitled';
                  const len = title.length;
                  let cls = 'text-base md:text-lg';
                  if (len > 34) cls = 'text-sm md:text-base';
                  else if (len > 26) cls = 'text-[15px] md:text-[17px]';
                  // Heuristic: if length suggests wrap to 2 lines, nudge upward
                  const multiLine = len > 18; // width-based heuristic
                  const style = multiLine ? { marginTop: '-8px' } : undefined;
                  // Use same ink color intensity as small sticker (title row ~60%)
                  return <div className={cls + ' text-black/60 break-words leading-snug mb-1'} style={style}>{title}</div>;
                })()}
                <div className="flex-1" />
                {active.song?.artist && (()=>{
                  const artist = active.song?.artist || '';
                  const multiArtist = artist.length > 18; // heuristic
                  const style = multiArtist ? { marginBottom: '-6px' } : undefined;
                  // Match sticker artist row tint (~50%) for consistency
                  return <div className="text-xs md:text-sm text-black/50 break-words leading-snug mt-1" style={style}>{artist}</div>;
                })()}
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

// Reel SVG component with cutouts and hub
function ReelSVG() {
  const size = 96;
  const cutouts = 5; // 5 rectangular/triangular hybrid cutouts
  const rOuter = 44;
  const rInner = 14;
  const cx = size/2, cy = size/2;
  const spokes: string[] = [];
  for (let i=0;i<cutouts;i++) {
    const a0 = (i / cutouts) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2)/cutouts * 0.55; // width of cutout
    const ri = rInner + 4;
    const ro = rOuter - 4;
    const points = [
      [cx + ri*Math.cos(a0), cy + ri*Math.sin(a0)],
      [cx + ro*Math.cos(a0), cy + ro*Math.sin(a0)],
      [cx + ro*Math.cos(a1), cy + ro*Math.sin(a1)],
      [cx + ri*Math.cos(a1), cy + ri*Math.sin(a1)]
    ];
    spokes.push(points.map(p=>p[0]+','+p[1]).join(' '));
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="reel-svg">
      <defs>
        <radialGradient id="reelGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--reel-color)" stopOpacity={0.95} />
          <stop offset="70%" stopColor="var(--reel-color)" stopOpacity={0.85} />
          <stop offset="100%" stopColor="var(--reel-color)" stopOpacity={0.75} />
        </radialGradient>
        <mask id="reelMask">
          <rect width={size} height={size} fill="white" />
          {/* Cutouts */}
          {spokes.map((pts,i)=>(
            <polygon key={i} points={pts} fill="black" />
          ))}
          {/* Center hole */}
          <circle cx={cx} cy={cy} r={5} fill="black" />
        </mask>
      </defs>
      <circle cx={cx} cy={cy} r={rOuter} fill="url(#reelGrad)" mask="url(#reelMask)" />
      {/* Hub ring */}
  <circle cx={cx} cy={cy} r={rInner} fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}