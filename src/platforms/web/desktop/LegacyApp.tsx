import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { Entry, Song } from '@shared/lib/types/global';
import { APP_ROUTES, type AppPage } from '@shared/lib/constants/routes';
import ConstellationsPage from '@platforms/web/desktop/features/constellations/routes/ConstellationsPageLegacy';
import EchoesPage from '@platforms/web/desktop/features/echoes/routes/EchoesPageLegacy';
import FlowsPage from '@platforms/web/desktop/features/flows/routes/FlowsPageLegacy';
import GuideModal from '@platforms/web/desktop/features/journal/components/GuideModal';
import ReleaseOverlay from '@platforms/web/desktop/features/journal/components/ReleaseOverlay';
import SettingsModal from '@platforms/web/desktop/features/journal/components/SettingsModal';
import AuraBlock from '@platforms/web/desktop/features/journal/components/AuraBlock';
import EmojiTriangle from '@platforms/web/desktop/features/journal/components/EmojiTriangle';
import { EmojiPickerModal, IconButton } from '@shared/ui';
import { APP_VERSION } from '@shared/lib/constants/version';
import { todayISO, addDays, canEdit, clamp, rainbowGradientCSS, last7, monthlyTop3 } from '@shared/lib/utils';
import { disableVerticalSwipes, enableVerticalSwipes, hapticLight, isTelegram, setBackButton, telegramAccentColor } from '@shared/lib/services/telegram';
import { getRecents, loadEntries, pushRecent, saveEntries, upsertEntry } from '@shared/lib/services/storage';
import { APP_TABS_MOBILE } from './routes';

export default function LegacyApp() {
  const [isTG, setIsTG] = useState<boolean>(false);
  const [tgAccent, setTgAccent] = useState<string | undefined>(undefined);
  const [tgPlatform, setTgPlatform] = useState<string | undefined>(undefined);
  const { TODAY, FLOWS, CONSTELLATIONS, ECHOES } = APP_ROUTES;
  useEffect(()=> {
    function poll(){
      const flag = isTelegram();
      setIsTG(flag);
      if (flag) {
        setTgAccent(prev => prev || telegramAccentColor());
        try {
          const platform = (window as unknown as { Telegram?: { WebApp?: { platform?: string } } }).Telegram?.WebApp?.platform;
          if (platform && platform !== tgPlatform) setTgPlatform(platform);
        } catch { /* ignore */ }
      }
    }
    poll();
    const id = setInterval(poll, 500);
    return ()=> clearInterval(id);
  }, [tgPlatform]);
  // Dynamic spacing tweaks for Telegram (raise bottom nav, lower top header slightly)
  const HEADER_H = 56; // tailwind h-14
  const FOOTER_H = 56; // tailwind h-14
  const headerTopOffset = isTG ? 8 : 0;      // px push-down for top nav
  const footerBottomOffset = (isTG && tgPlatform === 'ios') ? 20 : 0;  // raise only on iOS Telegram
  const contentTop = HEADER_H + headerTopOffset;
  const contentBottom = FOOTER_H + footerBottomOffset;
  // Song length constraints
  const MAX_TITLE = 48;
  const MAX_ARTIST = 40;
  const [page, setPage] = useState<AppPage>(TODAY);
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
  // Banner / release overlay: whether the release overlay is still blocking the slider
  // The overlay component itself handles its own internal ghost/fade/haptic lifecycle.
  // Block release until user celebrates the current APP_VERSION.
  // Use the same storage key used by ReleaseOverlay ('flowday_last_version').
  // Match ReleaseOverlay: only block when the current app patch version is 0
  // and the user hasn't seen the release yet (stored in localStorage).
  const [releaseBlocked, setReleaseBlocked] = useState<boolean>(() => {
    try {
      const LAST_VERSION_KEY = 'flowday_last_version';
      const last = localStorage.getItem(LAST_VERSION_KEY);
      if (last === APP_VERSION) return false; // already seen
      const parts = String(APP_VERSION).split('.');
      const patch = parts.length > 2 ? parseInt(parts[2] || '0', 10) : 0;
      if (Number.isNaN(patch)) return false;
      return patch === 0;
    } catch {
      return false;
    }
  });

  // no-op cleanup placeholder (release overlay manages its own timers)
  useEffect(() => {
    return () => {};
  }, []);
  // Telegram full-screen song editor state
  const [songEditorOpen, setSongEditorOpen] = useState(false);
  // Reset song inputs collapsed when changing the active date
  useEffect(()=> { setShowSong(false); setSongEditorOpen(false); }, [activeDate]);
  // Song editor prerequisite: at least one emoji and a saved hue
  const canEditSongMeta = editable && entry.emojis.length>0 && typeof entry.hue === 'number';
  // Close editors if prerequisites disappear
  useEffect(()=> { if(!canEditSongMeta){ setShowSong(false); setSongEditorOpen(false); } }, [canEditSongMeta]);

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
  useEffect(()=>{ if(page===TODAY){ setWeekOffset(0); setMonthOffset(0); setYearOffset(0);} }, [page]);

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
    if (page===TODAY) return formatActiveDate();
    if (page===FLOWS) return flowsMode==='week' ? relativeLabel('week', weekOffset) : relativeLabel('month', monthOffset);
    if (page===CONSTELLATIONS) return relativeLabel('year', yearOffset);
    if (page===ECHOES) return relativeLabel('year', yearOffset);
    return '';
  }

  function handleTabSelect(next: AppPage) {
    if (next === TODAY) {
      setActiveDate(todayISO());
    }
    setPage(next);
  }

  const handleBack = useCallback(() => {
    if (page===TODAY) {
      setActiveDate(addDays(activeDate, -1));
      return;
    }
    if (page===FLOWS) {
      if (flowsMode==='week') { setWeekOffset(o=>o+1); return; }
      setMonthOffset(o=>o+1); return;
    }
    if (page===CONSTELLATIONS || page===ECHOES) { setYearOffset(o=>o+1); return; }
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
    if (page===TODAY) return activeDate !== todayISO();
    if (page===FLOWS) return flowsMode==='week' ? weekOffset>0 : monthOffset>0;
    if (page===CONSTELLATIONS || page===ECHOES) return yearOffset>0;
    return false;
  }
  function handleReset() {
    if (!canReset()) return;
    if (page===TODAY) { setActiveDate(todayISO()); return; }
    if (page===FLOWS) {
      if (flowsMode==='week') setWeekOffset(0); else setMonthOffset(0);
      return;
    }
    if (page===CONSTELLATIONS || page===ECHOES) { setYearOffset(0); return; }
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
      .toLocaleDateString('en', { weekday: 'long', day: '2-digit', month: 'short' })
      .replace(',', ' ·');
  }

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
              key={page===CONSTELLATIONS ? 'constellations-static' : headerCenterText()}
              className={'inline-block animate-fadeFromTop'}
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
        <div className="page-view from-left" data-active={page===TODAY}>
          <div className="mx-auto flex h-full max-w-sm flex-col px-4">
            {/* Fixed visual area so slider never jumps */}
            <div className="h-[320px] w-full flex items-center justify-center">
                <div key={activeDate} className={"emoji-trans-container w-full flex items-center justify-center animate-emoji-day-swap " + (showAura ? 'aura-active':'')}
                style={{maxWidth:280}}>
                <div className="flex flex-col items-center justify-center w-full" onClick={()=>{ if(entry.emojis.length>0 && editable){ /* maybe future */ }}}>
                  <div className="triangle-view flex items-center justify-center w-full">
                    <EmojiTriangle
                      emojis={entry.emojis}
                      onPick={(slot) => openPicker(slot)}
                      onRemove={removeEmojiAt}
                      editable={editable}
                      variant="compact"
                    />
                  </div>
                  <div className="mt-3 aura-view cursor-pointer flex flex-col items-center" onClick={() => setShowAura(false)}>
                    <AuraBlock emojis={entry.emojis} hue={entry.hue ?? 200} variant="compact" />
                    <div className="mt-2 text-xs text-white/60 text-center">Tap aura to edit emojis</div>
                  </div>
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
                'mx-auto mt-6 w-full max-w-xs cursor-pointer rounded-full h-8 transition-[box-shadow,transform] duration-300 relative overflow-hidden ' +
                (editable && entry.emojis.length>0 ? 'ring-1 ring-white/10 hover:shadow-[0_0_0_3px_rgba(255,255,255,0.07)] active:scale-[0.98]' : 'bg-white/10 cursor-not-allowed') +
                (releaseBlocked ? ' pointer-events-none' : '')
              }
              style={{ boxShadow: (editable && entry.emojis.length>0 && !releaseBlocked) ? '0 0 20px 2px rgba(255,255,255,0.07)' : undefined }}
              aria-disabled={releaseBlocked || !(editable && entry.emojis.length>0)}
            >
              {/* Gradient overlay: animate opacity+scale when activated (at least one emoji present) */}
              <div
                aria-hidden
                className={"absolute inset-0 rounded-full transition-opacity duration-400 ease-out transform-gpu"}
                style={{
                  background: rainbowGradientCSS(),
                  opacity: releaseBlocked ? 0 : ((editable && entry.emojis.length>0) ? 1 : 0),
                  transform: (editable && entry.emojis.length>0) ? 'scale(1)' : 'scale(0.985)'
                }}
              />
              {/* Externalized release overlay component (blocks slider until celebrated) */}
              {releaseBlocked && (
                <ReleaseOverlay enabled={true} onCelebrate={() => setReleaseBlocked(false)} />
              )}
            </div>
            {!editable && (
              <div className="mt-1 text-center text-xs text-white/40">
                Read-only · you can edit today or yesterday
              </div>
            )}

            {/* Song of the day (inline web / overlay in Telegram) */}
            {(!isTG && !showSong) && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={()=> { if(canEditSongMeta) setShowSong(true); }}
                  disabled={!canEditSongMeta}
                  className="w-full max-w-xs mx-auto px-5 py-2 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 disabled:opacity-35 disabled:cursor-not-allowed text-sm font-medium text-white/90 transition ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  {entry.song ? 'Edit song' : 'Song of the day'}
                </button>
              </div>
            )}
            {(!isTG && showSong) && (
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
            {isTG && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={()=> { if (canEditSongMeta) setSongEditorOpen(true); }}
                  className="w-full max-w-xs mx-auto px-5 py-2 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 text-sm font-medium text-white/90 transition ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!canEditSongMeta}
                >
                  {entry.song ? 'Edit song' : 'Song of the day'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="page-view from-left" data-active={page===FLOWS}>
          {page===FLOWS && (
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
        <div className="page-view from-right" data-active={page===CONSTELLATIONS}>
          {page===CONSTELLATIONS && (
            <div className="h-full">
              <ConstellationsPage entries={constellationEntries} yearKey={String(yearOffset)} />
            </div>
          )}
        </div>
        <div className="page-view from-right" data-active={page===ECHOES}>
          {page===ECHOES && (
            <div className="h-full animate-fadeSwap">
              <EchoesPage entries={entries} yearOffset={yearOffset} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav (fixed) */}
      {!songEditorOpen && (
        <nav
          className="fixed left-0 right-0 z-20 box-border h-14 border-t border-white/5 bg-black/40 backdrop-blur-md"
          style={{ bottom: footerBottomOffset }}
        >
          <div className="mx-auto w-full max-w-sm flex items-center justify-center gap-10 px-4 text-white/80 h-full">
            {APP_TABS_MOBILE.map((tab) => (
              <IconButton
                key={tab.id}
                label={tab.label}
                active={page === tab.id}
                onClick={() => handleTabSelect(tab.id)}
                accent={isTG ? tgAccent : undefined}
              >
                {tab.icon}
              </IconButton>
            ))}
          </div>
        </nav>
      )}
      {isTG && footerBottomOffset > 0 && !songEditorOpen && (
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
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        entries={entries}
        onShowGuide={() => {
          setGuideOpen(true);
        }}
        isTG={isTG}
      />
      <GuideModal open={guideOpen} onClose={()=> setGuideOpen(false)} />
      {/* Telegram full-screen song editor overlay */}
      {isTG && songEditorOpen && (
        <SongEditorOverlay
          artist={entry.song?.artist || ''}
          title={entry.song?.title || ''}
          maxArtist={MAX_ARTIST}
          maxTitle={MAX_TITLE}
          onChange={(p)=> updateSong(p)}
          onClose={()=> setSongEditorOpen(false)}
          editable={editable}
        />
      )}
    </div>
  );
}

interface SongEditorOverlayProps {
  artist: string; title: string; maxArtist: number; maxTitle: number;
  onChange: (p: Partial<Song>) => void;
  onClose: () => void;
  editable: boolean;
}

function SongEditorOverlay({ artist, title, maxArtist, maxTitle, onChange, onClose, editable }: SongEditorOverlayProps) {
  const artistRef = useRef<HTMLInputElement | null>(null);
  const [closing, setClosing] = useState(false);
  useEffect(()=> { artistRef.current?.focus(); }, []);
  function handleDone() {
    if (closing) return;
    setClosing(true);
    // match songEditorOut duration (.32s) + small buffer
    setTimeout(()=> onClose(), 340);
  }
  return (
    <div className={"fixed inset-0 z-[200] bg-[#0b0b0b] flex flex-col px-6 pt-12 pb-10 song-editor-overlay " + (closing ? 'closing':'') }>
      <div className="flex items-center justify-between mb-8">
        <button onClick={handleDone} className="px-4 py-2 rounded-full bg-white/10 text-sm font-medium text-white/85 hover:bg-white/15 active:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30">Done</button>
        <div className="text-sm text-white/50 tracking-wide">Song of the day</div>
        <div className="w-[72px]" />
      </div>
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-start gap-5">
        <input
          ref={artistRef}
          type="text"
          placeholder="Artist"
          className="song-input text-base"
          disabled={!editable}
          value={artist}
          maxLength={maxArtist}
          onChange={(e)=> onChange({ artist: e.target.value.slice(0, maxArtist) })}
          onBlur={(e)=> onChange({ artist: e.target.value.trim().slice(0, maxArtist) })}
        />
        <input
          type="text"
          placeholder="Song title"
          className="song-input text-base"
          disabled={!editable}
          value={title}
          maxLength={maxTitle}
          onChange={(e)=> onChange({ title: e.target.value.slice(0, maxTitle) })}
          onBlur={(e)=> onChange({ title: e.target.value.trim().slice(0, maxTitle) })}
        />
        <div className="mt-4 text-xs text-white/35 leading-relaxed">
          Saved automatically. Leave fields blank to clear.
        </div>
      </div>
    </div>
  );
}
