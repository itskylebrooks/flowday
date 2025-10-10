import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { Entry, Song } from '@shared/lib/types/global';
import { APP_ROUTES, type AppPage } from '@shared/lib/constants/routes';
import ConstellationsPage from '@platforms/web/desktop/features/constellations/routes/ConstellationsPage';
import EchoesPage from '@platforms/web/desktop/features/echoes/routes/EchoesPage';
import FlowsPage from '@platforms/web/desktop/features/flows/routes/FlowsPage';
import GuideModal from '@platforms/web/desktop/features/journal/components/GuideModal';
import ReleaseOverlay from '@platforms/web/desktop/features/journal/components/ReleaseOverlay';
import SettingsModal from '@platforms/web/desktop/features/journal/components/SettingsModal';
import PrivacyTelegramPage from '@platforms/web/desktop/features/privacy/routes/PrivacyTelegramPage';
import PrivacyWebPage from '@platforms/web/desktop/features/privacy/routes/PrivacyWebPage';
import AuraBlock from '@platforms/web/desktop/features/journal/components/AuraBlock';
import EmojiTriangle from '@platforms/web/desktop/features/journal/components/EmojiTriangle';
import { EmojiPickerModal } from '@shared/ui';
import { APP_VERSION } from '@shared/lib/constants/version';
import { todayISO, addDays, canEdit, clamp, rainbowGradientCSS, last7, monthlyTop3, isToday, isYesterday, hsl } from '@shared/lib/utils';
import { disableVerticalSwipes, enableVerticalSwipes, hapticLight, isTelegram, setBackButton } from '@shared/lib/services/telegram';
import { getRecents, loadEntries, pushRecent, saveEntries, upsertEntry } from '@shared/lib/services/storage';
import { APP_TABS } from './routes';

export default function App() {
  const [isTG, setIsTG] = useState<boolean>(false);
  const { TODAY, FLOWS, CONSTELLATIONS, ECHOES } = APP_ROUTES;
  const today = todayISO();
  useEffect(()=> {
    function poll(){
      const flag = isTelegram();
      setIsTG(flag);
    }
    poll();
    const id = setInterval(poll, 500);
    return ()=> clearInterval(id);
  }, []);
  // Song length constraints
  const MAX_TITLE = 48;
  const MAX_ARTIST = 40;
  const [page, setPage] = useState<AppPage>(TODAY);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacyClosing, setPrivacyClosing] = useState(false);
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
    const baseDate = new Date(today + 'T00:00:00');
    baseDate.setDate(baseDate.getDate() - offset * 7); // go back offset weeks
    const dowSun0 = baseDate.getDay();
    const monOffset = (dowSun0 + 6) % 7;
    const monday = addDays(today, -(monOffset + offset*7));
    return Array.from({length:7}, (_,i)=> addDays(monday, i));
  }
  const recent7 = useMemo(()=> {
    if (weekOffset===0) return last7(entries);
    const dates = weekDates(weekOffset);
    const map = new Map(entries.map(e=>[e.date,e] as const));
    return dates.map(d=> map.get(d) || { date:d, emojis:[], updatedAt:0 });
  }, [entries, weekOffset, today]);

  // Month hues for monthOffset
  const { monthHues, monthEmpty } = useMemo(()=> {
    const base = today.slice(0,7); // YYYY-MM
    const year = parseInt(base.slice(0,4),10);
    const m = parseInt(base.slice(5,7),10);
    const targetDate = new Date(year, m-1, 1); // first of current month
    targetDate.setMonth(targetDate.getMonth() - monthOffset);
    const ym = targetDate.getFullYear() + '-' + String(targetDate.getMonth()+1).padStart(2,'0');
    const has = entries.some(e => e.date.startsWith(ym) && typeof e.hue === 'number');
    const hues = has ? monthlyTop3(entries, ym) : [];
    return { monthHues: hues, monthEmpty: !has };
  }, [entries, monthOffset, today]);

  // Entries filtered by year for constellations (respect yearOffset)
  const constellationEntries = useMemo(()=>{
    if (yearOffset===0) return entries;
    const baseYear = parseInt(today.slice(0,4),10);
    const targetYear = baseYear - yearOffset;
    return entries.filter(e => parseInt(e.date.slice(0,4),10) === targetYear);
  }, [entries, yearOffset, today]);

  const timelineDays = useMemo(() => {
    const map = new Map(entries.map(e => [e.date, e] as const));
    const windowStart = addDays(activeDate, -6);
    const windowEnd = addDays(activeDate, 6);
    const cappedEnd = windowEnd.localeCompare(today) > 0 ? today : windowEnd;

    const collected: { date: string; entry?: Entry }[] = [];
    let cursor = windowStart;
    function push(date: string) {
      collected.push({ date, entry: map.get(date) });
    }

    while (cursor.localeCompare(cappedEnd) <= 0) {
      push(cursor);
      if (cursor === cappedEnd) break;
      cursor = addDays(cursor, 1);
    }

    if (!collected.some(d => d.date === activeDate)) {
      collected.push({ date: activeDate, entry: map.get(activeDate) });
    }

    while (collected.length < 13) {
      const first = collected[0]?.date ?? activeDate;
      const prev = addDays(first, -1);
      collected.unshift({ date: prev, entry: map.get(prev) });
    }

    const seen = new Set<string>();
    const unique = collected.filter(item => {
      if (seen.has(item.date)) return false;
      seen.add(item.date);
      return true;
    });

    unique.sort((a, b) => b.date.localeCompare(a.date));
    return unique.slice(0, 14);
  }, [entries, activeDate, today]);

  const sliderStatus = showAura ? 'Saved 🌈' : editable ? 'Pick your vibe' : 'Read-only';
  const currentTab = useMemo(() => APP_TABS.find(tab => tab.id === page), [page]);

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
      setActiveDate(today);
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
    if (page===CONSTELLATIONS || page===ECHOES) {
      setYearOffset(o=>o+1);
      return;
    }
  }, [page, activeDate, flowsMode]);

  const handleForward = useCallback(() => {
    if (page===TODAY) {
      if (activeDate !== today) {
        setActiveDate(addDays(activeDate, 1));
      }
      return;
    }
    if (page===FLOWS) {
      if (flowsMode==='week') {
        setWeekOffset(o => Math.max(0, o - 1));
      } else {
        setMonthOffset(o => Math.max(0, o - 1));
      }
      return;
    }
    if (page===CONSTELLATIONS || page===ECHOES) {
      setYearOffset(o => Math.max(0, o - 1));
      return;
    }
  }, [page, activeDate, flowsMode, today]);

  const canGoBack = useMemo(() => {
    if (page === TODAY) return true;
    if (page === FLOWS) return true;
    if (page === CONSTELLATIONS || page === ECHOES) return true;
    return false;
  }, [page]);

  const canGoForward = useMemo(() => {
    if (page === TODAY) return activeDate !== today;
    if (page === FLOWS) return flowsMode === 'week' ? weekOffset > 0 : monthOffset > 0;
    if (page === CONSTELLATIONS || page === ECHOES) return yearOffset > 0;
    return false;
  }, [page, activeDate, today, flowsMode, weekOffset, monthOffset, yearOffset]);
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
    if (page===TODAY) return activeDate !== today;
    if (page===FLOWS) return flowsMode==='week' ? weekOffset>0 : monthOffset>0;
  if (page===CONSTELLATIONS || page===ECHOES) return yearOffset>0;
    return false;
  }
  function handleReset() {
    if (!canReset()) return;
    if (page===TODAY) { setActiveDate(today); return; }
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

  function timelineTitle(date: string): string {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('en', { weekday: 'long' });
  }

  function timelineCaption(date: string): string {
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('en', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  function timelineEmojis(entry?: Entry): string {
    if (!entry || entry.emojis.length === 0) return 'No entry saved';
    return entry.emojis.join(' ');
  }

  function timelineSong(entry?: Entry): string | null {
    if (!entry || !entry.song) return null;
    const title = entry.song.title?.trim();
    const artist = entry.song.artist?.trim();
    if (!title && !artist) return null;
    return [title, artist].filter(Boolean).join(' • ');
  }

  function tabDescription(id: AppPage): string {
    if (id === TODAY) return 'Daily journal';
    if (id === FLOWS) return 'Weekly & monthly posters';
    if (id === CONSTELLATIONS) return 'Emoji galaxy';
    if (id === ECHOES) return 'Mixtape memories';
    return '';
  }


  const pageContent = (() => {
  if (page === TODAY) {
    return (
      <div className="px-6 py-8 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <div className="grid gap-10 xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm lg:p-10">
              <div className="flex flex-col gap-8">
                <div>
                  <p className="text-xs uppercase tracking-[0.45em] text-white/45">Daily journal</p>
                  <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">{formatActiveDate()}</h1>
                  <p className="mt-2 text-sm text-white/60">Choose up to three emotions and lock today&apos;s aura palette.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 px-6 py-8 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
                  <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
                    <div className="flex flex-1 flex-col items-center gap-6">
                      <div
                        key={activeDate}
                        className={`emoji-trans-container flex w-full max-w-[360px] flex-col items-center justify-center ${showAura ? 'aura-active' : ''}`}
                      >
                        <div className="triangle-view flex w-full items-center justify-center" onClick={() => { if(entry.emojis.length>0 && editable) { /* placeholder for future interactions */ } }}>
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
                      <div className="text-xs text-white/50">Click the aura to return to the emoji selector.</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-6 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">Aura palette</div>
                      <div className="text-xs text-white/60">Drag across the spectrum to capture today&apos;s colour story.</div>
                    </div>
                    <div className={`text-xs font-medium ${showAura ? 'text-emerald-300' : editable ? 'text-white/65' : 'text-white/40'}`}>
                      {sliderStatus}
                    </div>
                  </div>
                  <div
                    ref={sliderRef}
                    tabIndex={editable && entry.emojis.length>0 ? 0 : -1}
                    onKeyDown={(e) => {
                      if (!editable || entry.emojis.length===0) return;
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        const delta = e.key === 'ArrowLeft' ? -5 : 5;
                        const hue = (((entry.hue ?? 0) + delta + 360) % 360);
                        const next = { ...entry, hue, updatedAt: Date.now() } as Entry;
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
                      'relative mt-6 h-12 w-full overflow-hidden rounded-full transition-[box-shadow,transform] duration-300 ' +
                      (editable && entry.emojis.length>0 ? 'cursor-pointer ring-1 ring-white/15 hover:ring-white/30 hover:shadow-[0_0_0_4px_rgba(255,255,255,0.08)] active:scale-[0.99]' : 'cursor-not-allowed bg-white/10 opacity-70') +
                      (releaseBlocked ? ' pointer-events-none' : '')
                    }
                    style={{ boxShadow: (editable && entry.emojis.length>0 && !releaseBlocked) ? '0 0 30px 6px rgba(99,132,255,0.08)' : undefined }}
                    aria-disabled={releaseBlocked || !(editable && entry.emojis.length>0)}
                  >
                    <div
                      aria-hidden
                      className="absolute inset-0 rounded-full transition-opacity duration-400 ease-out transform-gpu"
                      style={{
                        background: rainbowGradientCSS(),
                        opacity: releaseBlocked ? 0 : ((editable && entry.emojis.length>0) ? 1 : 0),
                        transform: (editable && entry.emojis.length>0) ? 'scale(1)' : 'scale(0.985)'
                      }}
                    />
                    {releaseBlocked && (
                      <ReleaseOverlay enabled={true} onCelebrate={() => setReleaseBlocked(false)} />
                    )}
                  </div>
                  {!editable && (
                    <div className="mt-3 text-xs text-white/45">
                      Read-only · you can edit today or yesterday.
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-6 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold text-white">Soundtrack</div>
                      <div className="text-xs text-white/60">Pair the day with the song looping in your head.</div>
                    </div>
                    {!isTG ? (
                      <button
                        type="button"
                        onClick={() => { if (canEditSongMeta) setShowSong((prev) => !prev); }}
                        disabled={!canEditSongMeta}
                        className="rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {showSong ? 'Hide fields' : entry.song ? 'Edit details' : 'Add song'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { if (canEditSongMeta) setSongEditorOpen(true); }}
                        disabled={!canEditSongMeta}
                        className="rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Open editor
                      </button>
                    )}
                  </div>
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-sm font-medium text-white/90">{entry.song?.title || 'No song saved'}</div>
                    <div className="text-xs text-white/55">{entry.song?.artist || (canEditSongMeta ? 'Add a track after saving your aura.' : 'Locked until you can edit this entry.')}</div>
                  </div>
                  {!isTG && showSong && (
                    <div className="mt-5 grid gap-4 song-inputs">
                      <input
                        type="text"
                        className="song-input text-base"
                        placeholder="Artist"
                        disabled={!editable}
                        value={entry.song?.artist || ''}
                        maxLength={MAX_ARTIST}
                        onChange={(e)=> updateSong({ artist: e.target.value.slice(0, MAX_ARTIST) })}
                        onBlur={(e)=> updateSong({ artist: e.target.value.trim().slice(0, MAX_ARTIST) })}
                      />
                      <input
                        type="text"
                        className="song-input text-base"
                        placeholder="Song title"
                        disabled={!editable}
                        value={entry.song?.title || ''}
                        maxLength={MAX_TITLE}
                        onChange={(e)=> updateSong({ title: e.target.value.slice(0, MAX_TITLE) })}
                        onBlur={(e)=> updateSong({ title: e.target.value.trim().slice(0, MAX_TITLE) })}
                      />
                      <div className="text-xs text-white/45">Saved automatically. Leave fields blank to clear.</div>
                    </div>
                  )}
                  {isTG && (
                    <div className="mt-4 text-xs text-white/55">Song editing opens in a focused sheet inside Telegram.</div>
                  )}
                </div>
              </div>
            </section>
            <section className="flex flex-col rounded-3xl border border-white/10 bg-black/30 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm lg:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.45em] text-white/45">Recent days</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Journal timeline</h2>
                  <p className="mt-2 text-sm text-white/60">Revisit entries and jump between moments.</p>
                </div>
                {activeDate !== today && (
                  <button
                    type="button"
                    onClick={() => setActiveDate(today)}
                    className="rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-medium text-white/80 transition hover:border-white/30 hover:bg-white/[0.12]"
                  >
                    Jump to today
                  </button>
                )}
              </div>
              <div className="mt-6 max-h-[520px] overflow-y-auto pr-1">
                <div className="space-y-3">
                  {timelineDays.map(({ date, entry }) => {
                    const active = date === activeDate;
                    const swatch = typeof entry?.hue === 'number' ? hsl(entry.hue, 80, 50) : null;
                    const songLine = timelineSong(entry);
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => setActiveDate(date)}
                        className={`group flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-white/40 bg-white/[0.12] shadow-[0_18px_48px_rgba(0,0,0,0.4)]' : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]'}`}
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black/40">
                          {swatch ? <span className="h-8 w-8 rounded-lg" style={{ background: swatch }} /> : <span className="text-lg text-white/30">—</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-white">{timelineTitle(date)}</div>
                            <div className="text-xs text-white/45">{timelineCaption(date)}</div>
                          </div>
                          <div className="mt-1 text-sm text-white/80 truncate">{timelineEmojis(entry)}</div>
                          {songLine && (
                            <div className="mt-1 text-xs text-white/55 truncate">{songLine}</div>
                          )}
                        </div>
                        {active && <span className="text-xs font-medium text-emerald-300">Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }
  if (page === FLOWS) {
    return (
      <div className="px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.4)] backdrop-blur-sm lg:p-10">
            <FlowsPage
              recent7={recent7}
              monthHues={monthHues}
              monthEmpty={monthEmpty}
              mode={flowsMode}
              animKey={flowsMode==='week' ? 'w'+weekOffset : 'm'+monthOffset}
              onToggleMode={()=> setFlowsMode(m=> m==='week' ? 'month':'week')}
            />
          </div>
        </div>
      </div>
    );
  }
  if (page === CONSTELLATIONS) {
    return (
      <div className="px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.4)] backdrop-blur-sm lg:p-10">
            <ConstellationsPage entries={constellationEntries} yearKey={String(yearOffset)} />
          </div>
        </div>
      </div>
    );
  }
  if (page === ECHOES) {
    return (
      <div className="px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.4)] backdrop-blur-sm lg:p-10">
            <EchoesPage entries={entries} yearOffset={yearOffset} />
          </div>
        </div>
      </div>
    );
  }
  return null;
  })();

  return (
    <div className="app-viewport flex h-full w-full bg-[#070708] text-white">
    <aside className="hidden h-full w-[260px] flex-col border-r border-white/10 bg-white/[0.02] px-6 py-8 backdrop-blur-lg lg:flex">
      <div>
        <div className="text-lg font-semibold text-white">Flowday</div>
        <div className="mt-1 text-xs text-white/50">Desktop studio</div>
      </div>
      <nav className="mt-10 space-y-2">
        {APP_TABS.map((tab) => {
          const active = tab.id === page;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabSelect(tab.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-white/25 bg-white/[0.12] text-white shadow-[0_12px_36px_rgba(0,0,0,0.35)]' : 'border-transparent text-white/70 hover:border-white/20 hover:bg-white/[0.08]'}`}
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-white/[0.18] text-white' : 'bg-white/[0.08] text-white/70'}`}>
                {tab.icon}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{tab.label}</div>
                <div className="text-xs text-white/45">{tabDescription(tab.id)}</div>
              </div>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 pt-8">
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left text-sm font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.1]"
        >
          Product tour
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left text-sm font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.1]"
        >
          Settings
        </button>
        <div className="text-xs text-white/35">v{APP_VERSION}</div>
      </div>
    </aside>
    <div className="flex flex-1 flex-col">
      <header className="flex h-20 items-center justify-between border-b border-white/10 bg-black/30 px-6 backdrop-blur-md lg:px-10">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={!canGoBack}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-white/80 transition hover:border-white/35 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M10.8284 12.0007L15.7782 16.9504L14.364 18.3646L8 12.0007L14.364 5.63672L15.7782 7.05093L10.8284 12.0007Z"></path>
            </svg>
          </button>
          <div>
            <div className="text-xs uppercase tracking-[0.45em] text-white/45">{currentTab?.label}</div>
            <div className="mt-1 text-xl font-semibold text-white md:text-2xl">{headerCenterText()}</div>
          </div>
          <button
            type="button"
            onClick={handleForward}
            disabled={!canGoForward}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-white/80 transition hover:border-white/35 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M13.1716 11.9993L8.22183 7.0496L9.63604 5.63538L16 11.9993L9.63604 18.3633L8.22183 16.9491L13.1716 11.9993Z"></path>
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {canReset() && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/35 hover:bg-white/[0.12]"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:bg-white/[0.12]"
          >
            Tour
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:bg-white/[0.12]"
          >
            Settings
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          {pageContent}
        </div>
      </div>
    </div>
    <EmojiPickerModal
      open={pickerOpen}
      recents={recents}
      onClose={closePicker}
      onPick={handlePick}
    />
    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} entries={entries} onShowGuide={()=> { setGuideOpen(true); }} isTG={isTG} onOpenPrivacy={() => { setPrivacyOpen(true); }} />
    <GuideModal open={guideOpen} onClose={()=> setGuideOpen(false)} />
    {privacyOpen && (
      <div className={`fixed inset-0 z-50 flex items-stretch sm:items-center justify-center settings-overlay backdrop-blur-sm${privacyClosing ? ' closing' : ''}`} onClick={() => {
          if (privacyClosing) return; setPrivacyClosing(true); setTimeout(()=> { setPrivacyOpen(false); setPrivacyClosing(false); }, 320);
        }}>
        <div className={`w-full h-full sm:h-auto max-w-none sm:max-w-sm rounded-none sm:rounded-2xl bg-[#111] p-6 pt-7 pb-8 ring-1 ring-white/10 overflow-y-auto settings-panel${privacyClosing ? ' closing' : ''}`}
             style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }} onClick={(e)=> e.stopPropagation()}>
          <div className="mb-2">
            {isTG ? (
              <PrivacyTelegramPage onBack={() => { if (privacyClosing) return; setPrivacyClosing(true); setTimeout(()=> { setPrivacyOpen(false); setPrivacyClosing(false); }, 320); }} />
            ) : (
              <PrivacyWebPage onBack={() => { if (privacyClosing) return; setPrivacyClosing(true); setTimeout(()=> { setPrivacyOpen(false); setPrivacyClosing(false); }, 320); }} />
            )}
          </div>
        </div>
      </div>
    )}
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