import { useMemo, useState, useEffect, useRef } from 'react';
import type { Entry, Page } from './lib/types';
import FlowsPage from './pages/FlowsPage';
import { todayISO, addDays, canEdit, clamp, rainbowGradientCSS, last7, monthlyStops, hsl } from './lib/utils';
import { loadEntries, saveEntries, upsertEntry, getRecents, pushRecent } from './lib/storage';
import IconButton from './components/IconButton';
import EmojiTriangle from './components/EmojiTriangle';
import EmojiPickerModal from './components/EmojiPickerModal';
import AuraBlock from './components/AuraBlock';

export default function App() {
  const [page, setPage] = useState<Page>('today');
  const [activeDate, setActiveDate] = useState<string>(todayISO());

  const [entries, setEntries] = useState<Entry[]>(loadEntries());
  useEffect(() => { saveEntries(entries); }, [entries]);

  const entry = useMemo<Entry>(() => {
    const found = entries.find(e => e.date === activeDate);
    return found || { date: activeDate, emojis: [], updatedAt: Date.now() };
  }, [entries, activeDate]);

  const editable = canEdit(activeDate);

  // Color slider & aura state
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [showAura, setShowAura] = useState<boolean>(!!entry.hue);
  useEffect(() => { setShowAura(!!entry.hue); }, [entry.hue]);

  // Flow page
  const recent7 = useMemo(()=> last7(entries), [entries]);
  const monthHues = useMemo(()=> monthlyStops(entries), [entries]);

  function handleSliderPointer(e: React.PointerEvent) {
    if (!editable) return; if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const hue = Math.round((x / rect.width) * 360);
    const next = { ...entry, hue, updatedAt: Date.now() } as Entry;
    setShowAura(true); // touching slider enables aura
    setEntries((old) => upsertEntry(old, next));
  }

  // which slot is being edited
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [recents, setRecents] = useState<string[]>(getRecents());
  const pickerOpen = pickerSlot != null;

  function openPicker(slot: number) { if (!editable) return; setPickerSlot(slot); }
  function closePicker() { setPickerSlot(null); }
  function handlePick(emoji: string) {
    if (pickerSlot == null) return;
    setEmojiAt(pickerSlot, emoji);
    pushRecent(emoji);
    setRecents(getRecents());
    setPickerSlot(null);
  }

  function setEmojiAt(index: number, emoji: string) {
    if (!editable) return;
    const clean = emoji.trim(); if (!clean) return;
    const next = { ...entry } as Entry;
    const arr = [...next.emojis]; arr[index] = clean;
    next.emojis = Array.from(new Set(arr.filter(Boolean))).slice(0, 3);
    next.updatedAt = Date.now();
    setEntries(old => upsertEntry(old, next));
  }

  function removeEmojiAt(index: number) {
    if (!editable) return;
    const next = { ...entry } as Entry;
    const arr = [...next.emojis];
    arr.splice(index, 1);
    next.emojis = arr;
    next.updatedAt = Date.now();
    setEntries(old => upsertEntry(old, next));
  }

  function formatActiveDate(): string {
    const d = new Date(activeDate + 'T00:00:00');
    return d
      .toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short' })
      .replace(',', ' ·');
  }

  return (
    <div className="w-full min-h-screen bg-[#0E0E0E] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 grid grid-cols-3 items-center px-3 py-3 text-sm text-white/90">
        <button aria-label="Go to yesterday" onClick={() => setActiveDate(addDays(activeDate, -1))}
          className="justify-self-start rounded-full p-2 text-white/70 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div className="justify-self-center font-medium">{formatActiveDate()}</div>
        <button aria-label="Open settings" onClick={() => {}} className="justify-self-end rounded-full p-2 text-white/70 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5-3.5a7.5 7.5 0 0 1-.18 1.62l2.06 1.6-2 3.46-2.46-1a7.6 7.6 0 0 1-2.8 1.62l-.38 2.6H10.3l-.38-2.6a7.6 7.6 0 0 1-2.8-1.62l-2.46 1-2-3.46 2.06-1.6c.12.53.18 1.07.18 1.62Z" />
          </svg>
        </button>
      </div>

      {/* TODAY page with triangle & quick picker */}
      {page === 'today' && (
        <div className="mx-auto flex max-w-sm flex-col px-4 pb-28">
          {/* Fixed visual area so slider never jumps */}
          <div className="h-[320px] w-full flex items-center justify-center">
            {!showAura ? (
              <EmojiTriangle
                emojis={entry.emojis}
                onPick={(slot) => openPicker(slot)}
                onRemove={removeEmojiAt}
                editable={editable}
              />
            ) : (
              <div onClick={() => setShowAura(false)} className="cursor-pointer">
                <AuraBlock emojis={entry.emojis} hue={entry.hue ?? 200} />
              </div>
            )}
          </div>

          {/* Label above slider */}
          <div className="mt-2 text-center text-sm text-white/75">{showAura ? 'Saved 🌈' : 'Pick your vibe'}</div>

          {/* Thicker color slider (stays in place) */}
          <div
            ref={sliderRef}
            onPointerDown={(e) => {
              if (entry.emojis.length === 0) return;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              handleSliderPointer(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons !== 1) return;
              if (entry.emojis.length === 0) return;
              handleSliderPointer(e);
            }}
            className={
              'mx-auto mt-6 w-full max-w-xs cursor-pointer rounded-full ' +
              (entry.emojis.length === 0 ? 'h-8 bg-white/10' : 'h-8 ring-1 ring-white/10')
            }
            style={{
              background: entry.emojis.length === 0 ? undefined : rainbowGradientCSS(),
              boxShadow: entry.emojis.length === 0 ? undefined : '0 0 20px 2px rgba(255,255,255,0.07)',
            }}
            aria-disabled={entry.emojis.length === 0}
          />
        </div>
      )}

      {/* Placeholders for other pages (I'll build later) */}
      
      {page==='flows' && (<FlowsPage recent7={recent7} monthHues={monthHues} />)}
      {page === 'constellations' && (
        <div className="mx-auto max-w-sm px-4 pb-28">
          <div className="mt-10 text-center text-white/70">Constellations page (later)</div>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/5 bg-black/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-sm items-center justify-between px-10 py-3 text-white/80">
          <IconButton label="Flows" active={page==='flows'} onClick={() => setPage('flows')}>
            <svg viewBox="0 0 24 24" className="h-6 w-6"><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M4 5h16M4 12h16M4 19h16"/></svg>
          </IconButton>

          <IconButton label="Today" active={page==='today'} onClick={() => { setActiveDate(todayISO()); setPage('today'); }}>
            <svg viewBox="0 0 24 24" className="h-6 w-6"><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M4.5 9.5l7.5-6 7.5 6v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/></svg>
          </IconButton>

          <IconButton label="Constellations" active={page==='constellations'} onClick={() => setPage('constellations')}>
            <svg viewBox="0 0 24 24" className="h-6 w-6"><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M12 3l2.5 4.5L20 9l-4.5 2.5L12 16l-2.5-4.5L5 9l4.5-1.5z"/></svg>
          </IconButton>
        </div>
      </nav>
      <EmojiPickerModal
        open={pickerOpen}
        recents={recents}
        onClose={closePicker}
        onPick={handlePick}
      />
    </div>
  );
}