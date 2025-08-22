import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { Entry, Page, Song } from './lib/types';
import FlowsPage from './pages/FlowsPage';
import ConstellationsPage from './pages/ConstellationsPage';
import EchoesPage from './pages/EchoesPage';
import SettingsModal from './components/SettingsModal';
import GuideModal from './components/GuideModal';
import { todayISO, addDays, canEdit, clamp, rainbowGradientCSS, last7, monthlyTop3 } from './lib/utils';
import { setBackButton, hapticLight, disableVerticalSwipes, enableVerticalSwipes, isTelegram } from './lib/telegram';
import { loadEntries, saveEntries, upsertEntry, getRecents, pushRecent } from './lib/storage';
import IconButton from './components/IconButton';
import EmojiTriangle from './components/EmojiTriangle';
import EmojiPickerModal from './components/EmojiPickerModal';
import AuraBlock from './components/AuraBlock';

export default function App() {
  const [isTG, setIsTG] = useState<boolean>(false);
  useEffect(()=> {
    function poll(){ setIsTG(isTelegram()); }
    poll();
    const id = setInterval(poll, 500);
    return ()=> clearInterval(id);
  }, []);
  // Dynamic spacing tweaks for Telegram (raise bottom nav, lower top header slightly)
  const HEADER_H = 56; // tailwind h-14
  const FOOTER_H = 56; // tailwind h-14
  const headerTopOffset = isTG ? 8 : 0;      // px push-down for top nav
  const footerBottomOffset = isTG ? 20 : 0;  // px raise-up for bottom nav
  const contentTop = HEADER_H + headerTopOffset;
  const contentBottom = FOOTER_H + footerBottomOffset;
  // Song length constraints
  const MAX_TITLE = 48;
  const MAX_ARTIST = 40;
  const [page, setPage] = useState<Page>('today');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(()=> {
    try { return localStorage.getItem('flowday_seen_guide_v1') ? false : true; } catch { return true; }
  });
  useEffect(()=>{
    if (guideOpen === false) {
      try { localStorage.setItem('flowday_seen_guide_v1','1'); } catch { /* ignore */ }
    }
  }, [guideOpen]);
  const [activeDate, setActiveDate] = useState<string>(todayISO());

  const [entries, setEntries] = useState<Entry[]>(loadEntries());
  useEffect(() => { saveEntries(entries); }, [entries]);

  const entry = useMemo<Entry>(() => {
    const found = entries.find(e => e.date === activeDate);
  return found || { date: activeDate, emojis: [], updatedAt: Date.now() };
  }, [entries, activeDate]);

  const editable = canEdit(activeDate);
  // Song inputs reveal state
  const [showSong, setShowSong] = useState(false);
  // Reset song inputs collapsed when changing the active date
  useEffect(()=> { setShowSong(false); }, [activeDate]);

  // Color slider & aura state
  interface SliderEl extends HTMLDivElement { _wheelTO?: ReturnType<typeof setTimeout>; }
  const sliderRef = useRef<SliderEl | null>(null);
  const lastHapticRef = useRef<{t:number; hue:number}>({ t:0, hue: -999 });
  const [showAura, setShowAura] = useState<boolean>(!!entry.hue && entry.emojis.length > 0);
  useEffect(() => {
    setShowAura(!!entry.hue && entry.emojis.length > 0);
  }, [entry.hue, entry.emojis.length]);


  // Offsets for contextual navigation
  const [weekOffset, setWeekOffset] = useState(0); // 0=this week, 1=last week, etc.
  const [monthOffset, setMonthOffset] = useState(0); // 0=this month
  const [yearOffset, setYearOffset] = useState(0); // 0=this year
  const [flowsMode, setFlowsMode] = useState<'week'|'month'>('month');


  // (Removed Telegram MainButton 'Done' — no longer shown)

  // Reset offsets when switching to today page
  useEffect(()=>{ if(page==='today'){ setWeekOffset(0); setMonthOffset(0); setYearOffset(0);} }, [page]);

  // Derive week date range for weekOffset (Monday reference)
  function weekDates(offset: number): string[] {
    const today = new Date(todayISO() + 'T00:00:00');
    today.setDate(today.getDate() - offset * 7); // go back offset weeks
    const dowSun0 = today.getDay();
    const monOffset = (dowSun0 + 6) % 7;
    const monday = addDays(todayISO(), -(monOffset + offset*7));
    return Array.from({length:7}, (_,i)=> addDays(monday, i));
  }
  const recent7 = useMemo(()=> {
    if (weekOffset===0) return last7(entries);
    const dates = weekDates(weekOffset);
    const map = new Map(entries.map(e=>[e.date,e] as const));
    return dates.map(d=> map.get(d) || { date:d, emojis:[], updatedAt:0 });
  }, [entries, weekOffset]);

  // Month hues for monthOffset
  const { monthHues, monthEmpty } = useMemo(()=> {
    const base = todayISO().slice(0,7); // YYYY-MM
    const year = parseInt(base.slice(0,4),10);
    const m = parseInt(base.slice(5,7),10);
    const targetDate = new Date(year, m-1, 1); // first of current month
    targetDate.setMonth(targetDate.getMonth() - monthOffset);
    const ym = targetDate.getFullYear() + '-' + String(targetDate.getMonth()+1).padStart(2,'0');
    const has = entries.some(e => e.date.startsWith(ym) && typeof e.hue === 'number');
    const hues = has ? monthlyTop3(entries, ym) : [];
    return { monthHues: hues, monthEmpty: !has };
  }, [entries, monthOffset]);

  // Entries filtered by year for constellations (respect yearOffset)
  const constellationEntries = useMemo(()=>{
    if (yearOffset===0) return entries;
    const baseYear = parseInt(todayISO().slice(0,4),10);
    const targetYear = baseYear - yearOffset;
    return entries.filter(e => parseInt(e.date.slice(0,4),10) === targetYear);
  }, [entries, yearOffset]);

  // Title logic
  function relativeLabel(unit: 'week'|'month'|'year', offset: number): string {
    if (offset===0) return unit==='week' ? 'This week' : unit==='month' ? 'This month' : 'This year';
    if (offset===1) return unit==='week' ? 'Last week' : unit==='month' ? 'Last month' : 'Last year';
    return `${offset} ${unit}s ago`;
  }

  function headerCenterText(): string {
    if (page==='today') return formatActiveDate();
    if (page==='flows') return flowsMode==='week' ? relativeLabel('week', weekOffset) : relativeLabel('month', monthOffset);
    if (page==='constellations') return relativeLabel('year', yearOffset);
  if (page==='echoes') return relativeLabel('year', yearOffset);
    return '';
  }

  const handleBack = useCallback(() => {
    if (page==='today') {
      setActiveDate(addDays(activeDate, -1));
      return;
    }
    if (page==='flows') {
      if (flowsMode==='week') { setWeekOffset(o=>o+1); return; }
      setMonthOffset(o=>o+1); return;
    }
  if (page==='constellations' || page==='echoes') { setYearOffset(o=>o+1); return; }
  }, [page, activeDate, flowsMode]);
  // Telegram BackButton disabled per requirement (always hidden)
  useEffect(()=> { if (isTG) setBackButton(false); }, [isTG]);

  // Prevent Telegram swipe-to-close while interacting with Constellations (pan/zoom)
  useEffect(()=> {
    if (!isTG) return;
    if (page === 'constellations') {
      disableVerticalSwipes();
      return () => { enableVerticalSwipes(); };
    } else {
      enableVerticalSwipes();
    }
  }, [isTG, page]);

  function canReset(): boolean {
    if (page==='today') return activeDate !== todayISO();
    if (page==='flows') return flowsMode==='week' ? weekOffset>0 : monthOffset>0;
  if (page==='constellations' || page==='echoes') return yearOffset>0;
    return false;
  }
  function handleReset() {
    if (!canReset()) return;
    if (page==='today') { setActiveDate(todayISO()); return; }
    if (page==='flows') { 
      if (flowsMode==='week') setWeekOffset(0); else setMonthOffset(0); 
      return; 
    }
  if (page==='constellations' || page==='echoes') { setYearOffset(0); return; }
  }

  function handleSliderPointer(e: React.PointerEvent) {
    if (!editable) return; if (!sliderRef.current) return;
    if (entry.emojis.length === 0) return; // require at least one emoji
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const hue = Math.round((x / rect.width) * 360);
    const next = { ...entry, hue, updatedAt: Date.now() } as Entry;
    setShowAura(true);
    setEntries((old) => upsertEntry(old, next));
    if (isTG) {
      // Throttle haptics: only fire if >140ms since last or hue moved >=12 degrees
      const now = performance.now();
      const last = lastHapticRef.current;
      if (now - last.t > 140 || Math.abs(hue - last.hue) >= 12) {
        hapticLight();
        lastHapticRef.current = { t: now, hue };
      }
    }
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

  function updateSong(partial: Partial<Song>) {
    if (!editable) return;
    const next = { ...entry } as Entry;
    const prev = next.song || {}; 
    const merged: Song = { ...prev, ...partial };
    // If empty remove song
    if (!merged.title && !merged.artist) {
      if ('song' in next) { delete (next as { song?: Song }).song; }
    } else {
      next.song = merged;
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

  // Dynamic center title based on page and (internal) flows mode (week/month) -> we read localStorage flowsMode? Simpler: show weekOffset or monthOffset not accessible here; keep flows page title inside flows component? We'll compute here for header.
  // We store flows mode locally in child; replicate via lifting if needed. For now we expose via a ref pattern not present. Simpler: manage flows mode here instead of FlowsPage internal state.

  return (
    <div className="app-viewport fixed inset-0 w-full bg-[#0E0E0E] text-white overflow-hidden">
      {/* Header (fixed) */}
  <div className="fixed left-0 right-0 z-20 box-border h-14 text-sm text-white/90" style={{ top: headerTopOffset }}>
        <div className="mx-auto w-full max-w-[425px] grid grid-cols-3 items-center px-4">
          <div className="justify-self-start flex items-center gap-1">
            <button aria-label="Navigate back" onClick={handleBack}
              className="rounded-full p-2 text-white/70 hover:text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M10.8284 12.0007L15.7782 16.9504L14.364 18.3646L8 12.0007L14.364 5.63672L15.7782 7.05093L10.8284 12.0007Z"></path>
              </svg>
            </button>
            {canReset() && (
              <button aria-label="Go to current" onClick={handleReset} className="rounded-full p-2 text-white/70 hover:text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M15.874 13C15.4299 14.7252 13.8638 16 12 16C10.1362 16 8.57006 14.7252 8.12602 13H3V11H8.12602C8.57006 9.27477 10.1362 8 12 8C13.8638 8 15.4299 9.27477 15.874 11H21V13H15.874ZM12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z"></path>
                </svg>
              </button>
            )}
          </div>
          <div className="justify-self-center font-medium text-center px-2 whitespace-nowrap">
            <span
              key={page==='constellations' ? 'constellations-static' : headerCenterText()}
              className={page==='constellations' ? 'inline-block' : 'inline-block animate-fadeSwap'}
            >{headerCenterText()}</span>
          </div>
          <button aria-label="Open settings" onClick={() => setSettingsOpen(true)} className="justify-self-end rounded-full p-2 text-white/70 hover:text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M8.68637 4.00008L11.293 1.39348C11.6835 1.00295 12.3167 1.00295 12.7072 1.39348L15.3138 4.00008H19.0001C19.5524 4.00008 20.0001 4.4478 20.0001 5.00008V8.68637L22.6067 11.293C22.9972 11.6835 22.9972 12.3167 22.6067 12.7072L20.0001 15.3138V19.0001C20.0001 19.5524 19.5524 20.0001 19.0001 20.0001H15.3138L12.7072 22.6067C12.3167 22.9972 11.6835 22.9972 11.293 22.6067L8.68637 20.0001H5.00008C4.4478 20.0001 4.00008 19.5524 4.00008 19.0001V15.3138L1.39348 12.7072C1.00295 12.3167 1.00295 11.6835 1.39348 11.293L4.00008 8.68637V5.00008C4.00008 4.4478 4.4478 4.00008 5.00008 4.00008H8.68637ZM6.00008 6.00008V9.5148L3.5148 12.0001L6.00008 14.4854V18.0001H9.5148L12.0001 20.4854L14.4854 18.0001H18.0001V14.4854L20.4854 12.0001L18.0001 9.5148V6.00008H14.4854L12.0001 3.5148L9.5148 6.00008H6.00008ZM12.0001 16.0001C9.79094 16.0001 8.00008 14.2092 8.00008 12.0001C8.00008 9.79094 9.79094 8.00008 12.0001 8.00008C14.2092 8.00008 16.0001 9.79094 16.0001 12.0001C16.0001 14.2092 14.2092 16.0001 12.0001 16.0001ZM12.0001 14.0001C13.1047 14.0001 14.0001 13.1047 14.0001 12.0001C14.0001 10.8955 13.1047 10.0001 12.0001 10.0001C10.8955 10.0001 10.0001 10.8955 10.0001 12.0001C10.0001 13.1047 10.8955 14.0001 12.0001 14.0001Z"></path>
            </svg>
          </button>
        </div>
      </div>

  {/* Content area sized between fixed bars (no scroll) */}
  <div className="absolute inset-x-0 overflow-hidden page-stack" style={{ top: contentTop, bottom: contentBottom }}>
      <div className="page-view" data-active={page==='today'}>
        <div className="mx-auto flex h-full max-w-sm flex-col px-4">
          {/* Fixed visual area so slider never jumps */}
          <div className="h-[320px] w-full flex items-center justify-center">
            <div className={"emoji-trans-container w-full flex items-center justify-center " + (showAura ? 'aura-active':'')}
                 style={{maxWidth:280}}>
              <div className="triangle-view flex items-center justify-center w-full" onClick={()=>{ if(entry.emojis.length>0 && editable){ /* maybe future */ }}}>
                <EmojiTriangle
                  emojis={entry.emojis}
                  onPick={(slot) => openPicker(slot)}
                  onRemove={removeEmojiAt}
                  editable={editable}
                />
              </div>
              <div className="aura-view cursor-pointer" onClick={() => setShowAura(false)}>
                <AuraBlock emojis={entry.emojis} hue={entry.hue ?? 200} />
              </div>
            </div>
          </div>

          {/* Label above slider */}
          <div className="mt-2 text-center text-sm text-white/75 min-h-[20px] flex items-center justify-center">
            {showAura ? 'Saved 🌈' : 'Pick your vibe'}
          </div>

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
                if (isTG) {
                  const now = performance.now();
                  const last = lastHapticRef.current;
                  if (now - last.t > 140 || Math.abs(hue - last.hue) >= 12) {
                    hapticLight();
                    lastHapticRef.current = { t: now, hue };
                  }
                }
                e.preventDefault();
              }
            }}
            onPointerDown={(e)=>{ if(!editable || entry.emojis.length===0) return; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); if(isTG) disableVerticalSwipes(); handleSliderPointer(e); }}
            onPointerMove={(e)=>{ if(e.buttons!==1) return; if(!editable || entry.emojis.length===0) return; handleSliderPointer(e); }}
            onPointerUp={()=>{ if(isTG) { enableVerticalSwipes(); } }}
            onPointerCancel={()=>{ if(isTG) { enableVerticalSwipes(); } }}
            onWheel={()=> { if(isTG && sliderRef.current) { disableVerticalSwipes(); if (sliderRef.current._wheelTO) clearTimeout(sliderRef.current._wheelTO); sliderRef.current._wheelTO = setTimeout(()=> enableVerticalSwipes(), 260); } }}
            className={
              'mx-auto mt-6 w-full max-w-xs cursor-pointer rounded-full h-8 transition-[box-shadow,transform] duration-300 ' +
              (editable && entry.emojis.length>0 ? 'ring-1 ring-white/10 hover:shadow-[0_0_0_3px_rgba(255,255,255,0.07)] active:scale-[0.98]' : 'bg-white/10 cursor-not-allowed')
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

          {/* Song of the day reveal */}
          {!showSong && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={()=> setShowSong(true)}
                className="w-full max-w-xs mx-auto px-5 py-2 rounded-full bg-white/10 hover:bg-white/15 active:bg-white/20 text-sm font-medium text-white/90 transition-colors focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                Song of the day
              </button>
            </div>
          )}
          {showSong && (
      <div className="mt-6 space-y-3 song-inputs">
              <input
                type="text"
                className="song-input"
                placeholder="Artist"
                disabled={!editable}
        value={entry.song?.artist || ''}
        maxLength={MAX_ARTIST}
        onChange={(e)=> updateSong({ artist: e.target.value.slice(0, MAX_ARTIST) })}
        onBlur={(e)=> updateSong({ artist: e.target.value.trim().slice(0, MAX_ARTIST) })}
              />
              <input
                type="text"
                className="song-input"
                placeholder="Song title"
                disabled={!editable}
        value={entry.song?.title || ''}
        maxLength={MAX_TITLE}
        onChange={(e)=> updateSong({ title: e.target.value.slice(0, MAX_TITLE) })}
        onBlur={(e)=> updateSong({ title: e.target.value.trim().slice(0, MAX_TITLE) })}
              />
            </div>
          )}
        </div>
      </div>

      <div className="page-view" data-active={page==='flows'}>
        {page==='flows' && (
          <div className="h-full animate-fadeSwap">
            <FlowsPage
              recent7={recent7}
              monthHues={monthHues}
              monthEmpty={monthEmpty}
              mode={flowsMode}
              animKey={flowsMode==='week' ? 'w'+weekOffset : 'm'+monthOffset}
              onToggleMode={()=> setFlowsMode(m=> m==='week' ? 'month':'week')}
            />
          </div>
        )}
      </div>
      <div className="page-view" data-active={page==='constellations'}>
        {page==='constellations' && (
          <div className="h-full">
            <ConstellationsPage entries={constellationEntries} yearKey={String(yearOffset)} />
          </div>
        )}
      </div>
      <div className="page-view" data-active={page==='echoes'}>
        {page==='echoes' && (
          <div className="h-full animate-fadeSwap">
            <EchoesPage entries={entries} yearOffset={yearOffset} />
          </div>
        )}
      </div>
    </div>

  {/* Bottom nav (fixed) */}
  <nav className="fixed left-0 right-0 z-20 box-border h-14 border-t border-white/5 bg-black/40 backdrop-blur-md" style={{ bottom: footerBottomOffset }}>
  <div className="mx-auto w-full max-w-sm flex items-center justify-center gap-10 px-4 text-white/80 h-full">
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
          <IconButton label="Echoes" active={page==='echoes'} onClick={() => setPage('echoes')}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M15 4.58152V12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C12.3506 9 12.6872 9.06016 13 9.17071V2.04938C18.0533 2.5511 22 6.81465 22 12C22 17.5229 17.5228 22 12 22C6.47715 22 2 17.5229 2 12C2 6.81465 5.94668 2.5511 11 2.04938V4.0619C7.05369 4.55399 4 7.92038 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 8.64262 17.9318 5.76829 15 4.58152Z"/></svg>
          </IconButton>
  </div>
      </nav>
      {isTG && footerBottomOffset > 0 && (
        <div
          aria-hidden="true"
          className="fixed left-0 right-0 bg-black/40 backdrop-blur-md pointer-events-none z-10"
          style={{ height: footerBottomOffset, bottom: 0 }}
        />
      )}
  <EmojiPickerModal
        open={pickerOpen}
        recents={recents}
        onClose={closePicker}
        onPick={handlePick}
      />
  <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} entries={entries} onShowGuide={()=> { setGuideOpen(true); }} isTG={isTG} />
  <GuideModal open={guideOpen} onClose={()=> setGuideOpen(false)} />
    </div>
  );
}