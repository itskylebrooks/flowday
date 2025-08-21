import { useMemo, useState, useEffect, useRef } from 'react';
import type { Entry, Page } from './lib/types';
import FlowsPage from './pages/FlowsPage';
import ConstellationsPage from './pages/ConstellationsPage';
import SettingsModal from './components/SettingsModal';
import { todayISO, addDays, canEdit, clamp, rainbowGradientCSS, last7, monthlyStops } from './lib/utils';
import { loadEntries, saveEntries, upsertEntry, getRecents, pushRecent } from './lib/storage';
import IconButton from './components/IconButton';
import EmojiTriangle from './components/EmojiTriangle';
import EmojiPickerModal from './components/EmojiPickerModal';
import AuraBlock from './components/AuraBlock';

export default function App() {
  const [page, setPage] = useState<Page>('today');
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [showAura, setShowAura] = useState<boolean>(!!entry.hue && entry.emojis.length > 0);
  useEffect(() => {
    setShowAura(!!entry.hue && entry.emojis.length > 0);
  }, [entry.hue, entry.emojis.length]);

  // Flow page
  const recent7 = useMemo(()=> last7(entries), [entries]);
  const monthHues = useMemo(()=> monthlyStops(entries), [entries]);

  function handleSliderPointer(e: React.PointerEvent) {
    if (!editable) return; if (!sliderRef.current) return;
    if (entry.emojis.length === 0) return; // require at least one emoji
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const hue = Math.round((x / rect.width) * 360);
    const next = { ...entry, hue, updatedAt: Date.now() } as Entry;
    setShowAura(true);
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
    const unique = Array.from(new Set(arr.filter(Boolean))).slice(0, 3);
    next.emojis = unique;
    if (unique.length === 0) {
      delete (next as Partial<Entry>).hue;
      setShowAura(false);
    }
    next.updatedAt = Date.now();
    setEntries(old => upsertEntry(old, next));
  }

  function removeEmojiAt(index: number) {
    if (!editable) return;
    const next = { ...entry } as Entry;
    const arr = [...next.emojis];
    arr.splice(index, 1);
    next.emojis = arr;
    if (arr.length === 0) {
      delete (next as Partial<Entry>).hue; // clear saved hue when no emojis
      setShowAura(false);
    }
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
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M10.8284 12.0007L15.7782 16.9504L14.364 18.3646L8 12.0007L14.364 5.63672L15.7782 7.05093L10.8284 12.0007Z"></path>
          </svg>
        </button>
        <div className="justify-self-center font-medium">{formatActiveDate()}</div>
        <button aria-label="Open settings" onClick={() => setSettingsOpen(true)} className="justify-self-end rounded-full p-2 text-white/70 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M8.68637 4.00008L11.293 1.39348C11.6835 1.00295 12.3167 1.00295 12.7072 1.39348L15.3138 4.00008H19.0001C19.5524 4.00008 20.0001 4.4478 20.0001 5.00008V8.68637L22.6067 11.293C22.9972 11.6835 22.9972 12.3167 22.6067 12.7072L20.0001 15.3138V19.0001C20.0001 19.5524 19.5524 20.0001 19.0001 20.0001H15.3138L12.7072 22.6067C12.3167 22.9972 11.6835 22.9972 11.293 22.6067L8.68637 20.0001H5.00008C4.4478 20.0001 4.00008 19.5524 4.00008 19.0001V15.3138L1.39348 12.7072C1.00295 12.3167 1.00295 11.6835 1.39348 11.293L4.00008 8.68637V5.00008C4.00008 4.4478 4.4478 4.00008 5.00008 4.00008H8.68637ZM6.00008 6.00008V9.5148L3.5148 12.0001L6.00008 14.4854V18.0001H9.5148L12.0001 20.4854L14.4854 18.0001H18.0001V14.4854L20.4854 12.0001L18.0001 9.5148V6.00008H14.4854L12.0001 3.5148L9.5148 6.00008H6.00008ZM12.0001 16.0001C9.79094 16.0001 8.00008 14.2092 8.00008 12.0001C8.00008 9.79094 9.79094 8.00008 12.0001 8.00008C14.2092 8.00008 16.0001 9.79094 16.0001 12.0001C16.0001 14.2092 14.2092 16.0001 12.0001 16.0001ZM12.0001 14.0001C13.1047 14.0001 14.0001 13.1047 14.0001 12.0001C14.0001 10.8955 13.1047 10.0001 12.0001 10.0001C10.8955 10.0001 10.0001 10.8955 10.0001 12.0001C10.0001 13.1047 10.8955 14.0001 12.0001 14.0001Z"></path>
          </svg>
        </button>
      </div>

      {/* TODAY PAGE */}
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
            tabIndex={editable && entry.emojis.length>0 ? 0 : -1}
            onKeyDown={(e) => {
              if (!editable || entry.emojis.length===0) return;
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const delta = e.key === 'ArrowLeft' ? -5 : 5;
                const hue = (((entry.hue ?? 0) + delta + 360) % 360);
                const next = { ...entry, hue, updatedAt: Date.now() };
                setShowAura(true);
                setEntries(old => upsertEntry(old, next));
                e.preventDefault();
              }
            }}
            onPointerDown={(e)=>{ if(!editable || entry.emojis.length===0) return; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); handleSliderPointer(e); }}
            onPointerMove={(e)=>{ if(e.buttons!==1) return; if(!editable || entry.emojis.length===0) return; handleSliderPointer(e); }}
            className={
              'mx-auto mt-6 w-full max-w-xs cursor-pointer rounded-full h-8 ' +
              (editable && entry.emojis.length>0 ? 'ring-1 ring-white/10' : 'bg-white/10 cursor-not-allowed')
            }
            style={{ background: (editable && entry.emojis.length>0) ? rainbowGradientCSS() : undefined,
                    boxShadow: (editable && entry.emojis.length>0) ? '0 0 20px 2px rgba(255,255,255,0.07)' : undefined }}
            aria-disabled={!(editable && entry.emojis.length>0)}
          />
          {!editable && (
            <div className="mt-1 text-center text-xs text-white/40">
              Read-only · you can edit today or yesterday
            </div>
          )}
        </div>
      )}

      {/* FLOWS PAGE */}
      {page==='flows' && (<FlowsPage recent7={recent7} monthHues={monthHues} />)}

      {/* CONSTELLATIONS PAGE */}
      {page === 'constellations' && (<ConstellationsPage entries={entries} />)}

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/5 bg-black/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-sm items-center justify-between px-10 py-3 text-white/80">
          <IconButton label="Flows" active={page==='flows'} onClick={() => setPage('flows')}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M9 7.53861L15 21.5386L18.6594 13H23V11H17.3406L15 16.4614L9 2.46143L5.3406 11H1V13H6.6594L9 7.53861Z"></path>
            </svg>
          </IconButton>

          <IconButton label="Today" active={page==='today'} onClick={() => { setActiveDate(todayISO()); setPage('today'); }}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M21 20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.48907C3 9.18048 3.14247 8.88917 3.38606 8.69972L11.3861 2.47749C11.7472 2.19663 12.2528 2.19663 12.6139 2.47749L20.6139 8.69972C20.8575 8.88917 21 9.18048 21 9.48907V20ZM19 19V9.97815L12 4.53371L5 9.97815V19H19ZM7 15H17V17H7V15Z"></path>
            </svg>
          </IconButton>

          <IconButton label="Constellations" active={page==='constellations'} onClick={() => setPage('constellations')}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M10.6144 17.7956C10.277 18.5682 9.20776 18.5682 8.8704 17.7956L7.99275 15.7854C7.21171 13.9966 5.80589 12.5726 4.0523 11.7942L1.63658 10.7219C.868536 10.381.868537 9.26368 1.63658 8.92276L3.97685 7.88394C5.77553 7.08552 7.20657 5.60881 7.97427 3.75892L8.8633 1.61673C9.19319 .821767 10.2916 .821765 10.6215 1.61673L11.5105 3.75894C12.2782 5.60881 13.7092 7.08552 15.5079 7.88394L17.8482 8.92276C18.6162 9.26368 18.6162 10.381 17.8482 10.7219L15.4325 11.7942C13.6789 12.5726 12.2731 13.9966 11.492 15.7854L10.6144 17.7956ZM4.53956 9.82234C6.8254 10.837 8.68402 12.5048 9.74238 14.7996 10.8008 12.5048 12.6594 10.837 14.9452 9.82234 12.6321 8.79557 10.7676 7.04647 9.74239 4.71088 8.71719 7.04648 6.85267 8.79557 4.53956 9.82234ZM19.4014 22.6899 19.6482 22.1242C20.0882 21.1156 20.8807 20.3125 21.8695 19.8732L22.6299 19.5353C23.0412 19.3526 23.0412 18.7549 22.6299 18.5722L21.9121 18.2532C20.8978 17.8026 20.0911 16.9698 19.6586 15.9269L19.4052 15.3156C19.2285 14.8896 18.6395 14.8896 18.4628 15.3156L18.2094 15.9269C17.777 16.9698 16.9703 17.8026 15.956 18.2532L15.2381 18.5722C14.8269 18.7549 14.8269 19.3526 15.2381 19.5353L15.9985 19.8732C16.9874 20.3125 17.7798 21.1156 18.2198 22.1242L18.4667 22.6899C18.6473 23.104 19.2207 23.104 19.4014 22.6899ZM18.3745 19.0469 18.937 18.4883 19.4878 19.0469 18.937 19.5898 18.3745 19.0469Z"></path>
            </svg>
          </IconButton>
        </div>
      </nav>
      <EmojiPickerModal
        open={pickerOpen}
        recents={recents}
        onClose={closePicker}
        onPick={handlePick}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}