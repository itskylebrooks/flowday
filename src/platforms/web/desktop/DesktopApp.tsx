import { useMemo, useState, useEffect, useRef } from 'react';
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
import { EmojiPickerModal, GlobalFooter } from '@shared/ui';
import { APP_VERSION } from '@shared/lib/constants/version';
import { todayISO, addDays, canEdit, clamp, rainbowGradientCSS, last7, monthlyTop3, isToday, isYesterday, hsl } from '@shared/lib/utils';
import { disableVerticalSwipes, enableVerticalSwipes, hapticLight, isTelegram, setBackButton } from '@shared/lib/services/telegram';
import { getRecents, loadEntries, pushRecent, saveEntries, upsertEntry } from '@shared/lib/services/storage';
import { APP_TABS_DESKTOP } from './routes';

export default function DesktopApp() {
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

  const entryMap = useMemo(() => new Map(entries.map((e) => [e.date, e] as const)), [entries]);

  const entriesByMonth = useMemo(() => {
    const grouped = new Map<string, Entry[]>();
    for (const item of entries) {
      const key = item.date.slice(0, 7);
      const existing = grouped.get(key);
      if (existing) {
        existing.push(item);
      } else {
        grouped.set(key, [item]);
      }
    }
    return grouped;
  }, [entries]);

  const entriesByYear = useMemo(() => {
    const grouped = new Map<number, Entry[]>();
    for (const item of entries) {
      const year = parseInt(item.date.slice(0, 4), 10);
      const existing = grouped.get(year);
      if (existing) {
        existing.push(item);
      } else {
        grouped.set(year, [item]);
      }
    }
    return grouped;
  }, [entries]);

  function summariseEmojis(list: Entry[]): string {
    const unique: string[] = [];
    for (const record of list) {
      for (const emoji of record.emojis) {
        if (!unique.includes(emoji)) {
          unique.push(emoji);
          if (unique.length >= 4) break;
        }
      }
      if (unique.length >= 4) break;
    }
    return unique.length > 0 ? unique.slice(0, 3).join(' ') : 'No entries saved';
  }

  function buildOffsets(current: number, baseCount: number, total: number): number[] {
    const seen = new Set<number>();
    const result: number[] = [];
    for (let i = 0; i < baseCount; i += 1) {
      if (!seen.has(i)) {
        seen.add(i);
        result.push(i);
      }
    }
    for (let i = baseCount; i <= current; i += 1) {
      if (result.length >= total) break;
      if (!seen.has(i)) {
        seen.add(i);
        result.push(i);
      }
    }
    let next = result.length ? result[result.length - 1] : -1;
    while (result.length < total) {
      next += 1;
      if (seen.has(next)) continue;
      seen.add(next);
      result.push(next);
    }
    return result;
  }

  interface TimelineRow {
    key: string;
    title: string;
    caption: string;
    detail: string;
    secondary?: string | null;
    swatch?: string | null;
    active: boolean;
    onSelect: () => void;
  }

  const timelineDayItems: TimelineRow[] = useMemo(() => {
    return timelineDays.map(({ date, entry }) => {
      const swatch = typeof entry?.hue === 'number' ? hsl(entry.hue, 80, 50) : null;
      return {
        key: date,
        title: timelineTitle(date),
        caption: timelineCaption(date),
        detail: timelineEmojis(entry),
        secondary: timelineSong(entry),
        swatch,
        active: date === activeDate,
        onSelect: () => setActiveDate(date),
      };
    });
  }, [timelineDays, activeDate]);

  const timelineWeekItems: TimelineRow[] = useMemo(() => {
    return buildOffsets(weekOffset, 6, 12).map((offset) => {
      const dates = weekDates(offset);
      const periodEntries = dates
        .map((d) => entryMap.get(d))
        .filter((e): e is Entry => Boolean(e));
      const start = new Date(dates[0] + 'T00:00:00');
      const end = new Date(dates[dates.length - 1] + 'T00:00:00');
      const hueEntry = periodEntries.find((e) => typeof e.hue === 'number');
      const swatch = hueEntry ? hsl(hueEntry.hue!, 80, 50) : null;
      return {
        key: `week-${offset}`,
        title: offset === 0 ? 'This week' : relativeLabel('week', offset),
        caption: `${start.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
        detail: summariseEmojis(periodEntries),
        swatch,
        active: flowsMode === 'week' && offset === weekOffset,
        onSelect: () => {
          setFlowsMode('week');
          setWeekOffset(offset);
        },
      };
    });
  }, [entryMap, flowsMode, weekOffset, today]);

  const timelineMonthItems: TimelineRow[] = useMemo(() => {
    const base = new Date(today + 'T00:00:00');
    base.setDate(1);
    return buildOffsets(monthOffset, 6, 12).map((offset) => {
      const cursor = new Date(base);
      cursor.setMonth(base.getMonth() - offset);
      const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const monthEntries = entriesByMonth.get(ym) ?? [];
      const hueEntry = monthEntries.find((e) => typeof e.hue === 'number');
      const swatch = hueEntry ? hsl(hueEntry.hue!, 80, 50) : null;
      return {
        key: `month-${ym}`,
        title: offset === 0 ? 'This month' : relativeLabel('month', offset),
        caption: cursor.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
        detail: summariseEmojis(monthEntries),
        swatch,
        active: flowsMode === 'month' && offset === monthOffset,
        onSelect: () => {
          setFlowsMode('month');
          setMonthOffset(offset);
        },
      };
    });
  }, [entriesByMonth, flowsMode, monthOffset, today]);

  const timelineYearItems: TimelineRow[] = useMemo(() => {
    const baseYear = parseInt(today.slice(0, 4), 10);
    return buildOffsets(yearOffset, 5, 10).map((offset) => {
      const year = baseYear - offset;
      const yearEntries = entriesByYear.get(year) ?? [];
      const hueEntry = yearEntries.find((e) => typeof e.hue === 'number');
      const swatch = hueEntry ? hsl(hueEntry.hue!, 80, 50) : null;
      return {
        key: `year-${year}`,
        title: offset === 0 ? 'This year' : relativeLabel('year', offset),
        caption: String(year),
        detail: summariseEmojis(yearEntries),
        swatch,
        active: offset === yearOffset,
        onSelect: () => setYearOffset(offset),
      };
    });
  }, [entriesByYear, yearOffset, today]);

  const sliderStatus = showAura ? 'Saved 🌈' : editable ? 'Pick your vibe' : 'Read-only';

  // Title logic
  function relativeLabel(unit: 'week'|'month'|'year', offset: number): string {
    if (offset===0) return unit==='week' ? 'This week' : unit==='month' ? 'This month' : 'This year';
    if (offset===1) return unit==='week' ? 'Last week' : unit==='month' ? 'Last month' : 'Last year';
    return `${offset} ${unit}s ago`;
  }

  function handleTabSelect(next: AppPage) {
    if (next === TODAY) {
      setActiveDate(today);
    }
    setPage(next);
  }
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
        <div className="flex h-full flex-col px-8 py-8 lg:px-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-white/45">Daily journal</p>
              <h1 className="mt-2 text-4xl font-semibold text-white">{formatActiveDate()}</h1>
              <p className="mt-2 max-w-xl text-sm text-white/60">
                Choose up to three emotions and lock today&apos;s aura palette.
              </p>
            </div>
            {activeDate !== today && (
              <button
                type="button"
                onClick={() => setActiveDate(today)}
                className="rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-white/70 transition hover:text-white"
              >
                Jump to today
              </button>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-8 overflow-hidden py-6 lg:flex-row">
            <div className="flex w-full max-w-[360px] flex-col items-center gap-5">
              <div
                key={activeDate}
                className={`emoji-trans-container flex w-full max-w-[320px] flex-col items-center gap-4 ${showAura ? 'aura-active' : ''}`}
              >
                <div className="triangle-view flex w-full items-center justify-center">
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
            <div className="flex flex-1 flex-col gap-8 overflow-hidden">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Aura palette</div>
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
                    'relative mt-4 h-11 w-full overflow-hidden rounded-full border border-white/12 bg-white/[0.04] transition-[box-shadow,transform] duration-300 ' +
                    (editable && entry.emojis.length>0 ? 'cursor-pointer hover:ring-1 hover:ring-white/30 active:scale-[0.99]' : 'cursor-not-allowed opacity-70') +
                    (releaseBlocked ? ' pointer-events-none' : '')
                  }
                  style={{ boxShadow: (editable && entry.emojis.length>0 && !releaseBlocked) ? '0 0 22px 4px rgba(99,132,255,0.18)' : undefined }}
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
              <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Soundtrack</div>
                    <div className="text-xs text-white/60">Pair the day with the song looping in your head.</div>
                  </div>
                  {!isTG ? (
                    <button
                      type="button"
                      onClick={() => { if (canEditSongMeta) setShowSong((prev) => !prev); }}
                      disabled={!canEditSongMeta}
                      className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/75 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {showSong ? 'Hide fields' : entry.song ? 'Edit details' : 'Add song'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { if (canEditSongMeta) setSongEditorOpen(true); }}
                      disabled={!canEditSongMeta}
                      className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/75 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Open editor
                    </button>
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-white/90">{entry.song?.title || 'No song saved'}</div>
                  <div className="text-xs text-white/55">{entry.song?.artist || (canEditSongMeta ? 'Add a track after saving your aura.' : 'Locked until you can edit this entry.')}</div>
                </div>
                {!isTG && showSong && (
                  <div className="grid gap-3 pt-1 text-sm sm:grid-cols-2">
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
                    <div className="text-xs text-white/45 sm:col-span-2">Saved automatically. Leave fields blank to clear.</div>
                  </div>
                )}
                {isTG && (
                  <div className="text-xs text-white/55">Song editing opens in a focused sheet inside Telegram.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }
    if (page === FLOWS) {
      return (
        <div className="flex h-full flex-col px-8 py-8 lg:px-12">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto pr-1">
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
      );
    }
    if (page === CONSTELLATIONS) {
      return (
        <div className="flex h-full flex-col px-8 py-8 lg:px-12">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto pr-1">
            <ConstellationsPage entries={constellationEntries} yearKey={String(yearOffset)} />
          </div>
        </div>
      );
    }
    if (page === ECHOES) {
      return (
        <div className="flex h-full flex-col px-8 py-8 lg:px-12">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto pr-1">
            <EchoesPage entries={entries} yearOffset={yearOffset} />
          </div>
        </div>
      );
    }
    return null;
  })();

  const timelineScope = page === TODAY ? 'Days' : page === FLOWS ? (flowsMode === 'week' ? 'Weeks' : 'Months') : 'Years';
  const activeTimelineItems = page === TODAY
    ? timelineDayItems
    : page === FLOWS
      ? (flowsMode === 'week' ? timelineWeekItems : timelineMonthItems)
      : timelineYearItems;
  let timelineResetLabel: string | null = null;
  if (page === TODAY && activeDate !== today) {
    timelineResetLabel = 'Back to today';
  } else if (page === FLOWS && (flowsMode === 'week' ? weekOffset > 0 : monthOffset > 0)) {
    timelineResetLabel = flowsMode === 'week' ? 'Back to this week' : 'Back to this month';
  } else if ((page === CONSTELLATIONS || page === ECHOES) && yearOffset > 0) {
    timelineResetLabel = 'Back to this year';
  }

  return (
    <div className="app-viewport flex h-full w-full bg-[#070708] text-white">
      <aside className="hidden h-full w-[240px] flex-col border-r border-white/10 px-6 py-8 lg:flex">
        <div>
          <div className="text-lg font-semibold text-white">Flowday</div>
          <div className="mt-1 text-xs text-white/50">Desktop studio</div>
        </div>
        <nav className="mt-10 space-y-2">
          {APP_TABS_DESKTOP.map((tab) => {
            const active = tab.id === page;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabSelect(tab.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2 text-left transition ${active ? 'bg-white/[0.14] text-white shadow-[0_12px_34px_rgba(0,0,0,0.35)]' : 'text-white/65 hover:bg-white/[0.08]'}`}
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-white/[0.2] text-black' : 'bg-white/[0.08] text-white/70'}`}>
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
            className="w-full rounded-xl border border-white/12 px-4 py-3 text-left text-sm font-medium text-white/80 transition hover:text-white"
          >
            Product tour
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="w-full rounded-xl border border-white/12 px-4 py-3 text-left text-sm font-medium text-white/80 transition hover:text-white"
          >
            Settings
          </button>
          <div className="text-xs text-white/35">v{APP_VERSION}</div>
        </div>
      </aside>
      <div className="flex flex-1">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto">
              {pageContent}
            </div>
          </div>
          <div className="px-8 pb-8 pt-6 lg:px-12">
            <GlobalFooter />
          </div>
        </div>
        <div className="hidden lg:flex w-[260px] flex-col border-l border-white/10 px-6 py-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/40">{timelineScope}</div>
              <div className="mt-2 text-lg font-semibold text-white">Journal timeline</div>
            </div>
            {timelineResetLabel && (
              <button
                type="button"
                onClick={handleReset}
                className="flex h-9 w-9 items-center justify-center self-start rounded-full border border-white/12 text-white/65 transition hover:border-white/30 hover:text-white"
              >
                <span className="sr-only">{timelineResetLabel}</span>
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M6.75 4.5L2.5 8l4.25 3.5M2.5 8h11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
          {page === FLOWS && (
            <div className="mt-5 flex gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/45">
              <button
                type="button"
                onClick={() => setFlowsMode('week')}
                className={`rounded-full px-3 py-1 transition ${flowsMode === 'week' ? 'bg-white/[0.18] text-black' : 'hover:text-white'}`}
              >
                Weeks
              </button>
              <button
                type="button"
                onClick={() => setFlowsMode('month')}
                className={`rounded-full px-3 py-1 transition ${flowsMode === 'month' ? 'bg-white/[0.18] text-black' : 'hover:text-white'}`}
              >
                Months
              </button>
            </div>
          )}
          <div className="mt-5 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              {activeTimelineItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onSelect}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${item.active ? 'bg-white/[0.14] text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]' : 'text-white/70 hover:bg-white/[0.08]'}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02]">
                    {item.swatch ? <span className="h-6 w-6 rounded-md" style={{ background: item.swatch }} /> : <span className="text-xs text-white/35">—</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white">{item.title}</div>
                      <div className="text-[11px] text-white/45">{item.caption}</div>
                    </div>
                    <div className="mt-1 truncate text-xs text-white/70">{item.detail}</div>
                    {item.secondary && (
                      <div className="mt-0.5 truncate text-[11px] text-white/45">{item.secondary}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
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