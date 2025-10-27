import { useMemo, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Entry, Song } from '@shared/lib/types/global';
import { APP_ROUTES, type AppPage } from '@shared/lib/constants/routes';
import ConstellationsPage from '@platforms/web/desktop/features/constellations/routes/ConstellationsPage';
import EchoesPage from '@platforms/web/desktop/features/echoes/routes/EchoesPage';
import FlowsPage from '@platforms/web/desktop/features/flows/routes/FlowsPage';
import GuideModal from '@platforms/web/desktop/features/journal/components/GuideModal';
import ReleaseOverlay from '@platforms/web/desktop/features/journal/components/ReleaseOverlay';
import SettingsModal from '@platforms/web/desktop/features/journal/components/SettingsModal';
import AuraBlock from '@platforms/web/desktop/features/journal/components/AuraBlock';
import EmojiTriangle from '@platforms/web/desktop/features/journal/components/EmojiTriangle';
import { EmojiPickerModal } from '@shared/ui';
import { APP_VERSION } from '@shared/lib/constants/version';
import {
  todayISO,
  addDays,
  canEdit,
  clamp,
  rainbowGradientCSS,
  last7,
  monthlyTop3,
  isToday,
  isYesterday,
  hsl,
  emojiStats,
  monthlyStops,
} from '@shared/lib/utils';
import { disableVerticalSwipes, enableVerticalSwipes, hapticLight, isTelegram, setBackButton } from '@shared/lib/services/telegram';
import { getRecents, loadEntries, pushRecent, saveEntries, upsertEntry } from '@shared/lib/services/storage';
import { APP_TABS_DESKTOP } from './routes';

const PAGE_EASE = [0.4, 0, 0.2, 1] as const;
const PAGE_TRANSITION = { duration: 0.38, ease: PAGE_EASE } as const;

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
  const tabOrder = useMemo(() => APP_TABS_DESKTOP.map((tab) => tab.id), []);
  const [pageDirection, setPageDirection] = useState<1 | -1>(1);
  const hasMounted = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(()=> {
    try { return localStorage.getItem('flowday_seen_guide_v1') ? false : true; } catch { return true; }
  });
  useEffect(()=>{
    if (guideOpen === false) {
      try { localStorage.setItem('flowday_seen_guide_v1','1'); } catch { /* ignore */ }
    }
  }, [guideOpen]);
  useEffect(() => {
    hasMounted.current = true;
  }, []);
  const [activeDate, setActiveDate] = useState<string>(todayISO());

  const [entries, setEntries] = useState<Entry[]>(loadEntries());
  useEffect(() => { saveEntries(entries); }, [entries]);

  const { avatarEmoji, avatarGradient } = useMemo(() => {
    const monthKey = today.slice(0, 7);
    const monthEntries = entries.filter((e) => e.date.startsWith(monthKey));
    if (!monthEntries.length) {
      return {
        avatarEmoji: '🙂',
        avatarGradient: 'radial-gradient(circle at 50% 50%, hsl(220 10% 28%) 0%, hsl(220 10% 18%) 75%)',
      } as const;
    }
    const { freq } = emojiStats(monthEntries);
    let top = '🙂';
    let count = -1;
    for (const [emoji, c] of freq.entries()) {
      if (c > count) {
        top = emoji;
        count = c;
      }
    }
    const rawStops = monthlyStops(monthEntries).slice(0, 3);
    const stops = rawStops.length ? rawStops : [220, 300, 40];
    let gradient: string;
    if (stops.length === 1) {
      const [h0] = stops;
      gradient = `radial-gradient(circle at 45% 40%, ${hsl(h0, 75, 60)} 0%, ${hsl(h0, 70, 45)} 55%, ${hsl(h0, 65, 28)} 100%)`;
    } else if (stops.length === 2) {
      const [h1, h2] = stops;
      gradient = `linear-gradient(135deg, ${hsl(h1, 80, 58)} 0%, ${hsl(h2, 75, 48)} 100%)`;
      gradient += `, radial-gradient(circle at 50% 60%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 70%)`;
    } else {
      const [h1, h2, h3] = stops;
      gradient = `linear-gradient(135deg, ${hsl(h1, 85, 60)} 0%, ${hsl(h1, 80, 55)} 15%, ${hsl(h2, 80, 55)} 50%, ${hsl(h3, 78, 52)} 85%, ${hsl(h3, 72, 45)} 100%)`;
      gradient += `, radial-gradient(circle at 50% 55%, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0.45) 75%)`;
    }
    return { avatarEmoji: top, avatarGradient: gradient } as const;
  }, [entries, today]);

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
      const shortDate = new Date(date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
      return {
        key: date,
        title: page === TODAY ? shortDate : timelineTitle(date),
        caption: timelineCaption(date),
        detail: timelineEmojis(entry),
        secondary: timelineSong(entry),
        swatch,
        active: date === activeDate,
        onSelect: () => setActiveDate(date),
      };
    });
  }, [timelineDays, activeDate, page, TODAY]);

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
      const range = `${start.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;
      const relative = relativeLabel('week', offset);
      const special = offset === 0 || offset === 1;
      return {
        key: `week-${offset}`,
        title: special ? relative : range,
        caption: special ? range : relative,
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
      const monthLabel = cursor.toLocaleDateString('en', { month: 'long', year: 'numeric' });
      const relative = relativeLabel('month', offset);
      const special = offset === 0 || offset === 1;
      return {
        key: `month-${ym}`,
        title: special ? relative : monthLabel,
        caption: special ? monthLabel : relative,
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
      const yearLabel = String(year);
      const relative = relativeLabel('year', offset);
      const special = offset === 0 || offset === 1;
      return {
        key: `year-${year}`,
        title: special ? relative : yearLabel,
        caption: special ? yearLabel : relative,
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
    if (next === page) return;
    if (next === TODAY) {
      setActiveDate(today);
    }
    const currentIndex = tabOrder.indexOf(page);
    const nextIndex = tabOrder.indexOf(next);
    if (currentIndex !== -1 && nextIndex !== -1) {
      setPageDirection(nextIndex > currentIndex ? 1 : -1);
    } else {
      setPageDirection(1);
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
    return timelineCaption(date);
  }

  function timelineCaption(date: string): string {
    const d = new Date(date + 'T00:00:00');
    if (isToday(date) || isYesterday(date)) {
      return d.toLocaleDateString('en', { month: 'short', day: '2-digit', year: 'numeric' });
    }
    return d.toLocaleDateString('en', { weekday: 'long' });
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
          <motion.div
            key={activeDate}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, ease: PAGE_EASE }}
            className="flex flex-wrap items-baseline justify-between gap-4 border-b border-white/10 pb-6"
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-white/45">Daily journal</p>
              <h1 className="mt-2 text-4xl font-semibold text-white">{formatActiveDate()}</h1>
              <p className="mt-2 max-w-xl text-sm text-white/60">
                Choose up to three emotions and lock today&apos;s aura palette.
              </p>
            </div>
          </motion.div>
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
            />
          </div>
        </div>
      );
    }
    if (page === CONSTELLATIONS) {
      return (
        <div className="flex h-full flex-col px-8 py-8 lg:px-12">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-y-auto pr-1">
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
        <div className="mt-auto pt-8">
          <div className="flex items-end justify-between">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] text-white/70 transition hover:text-white hover:bg-white/[0.08]"
            >
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.68637 4.00008L11.293 1.39348C11.6835 1.00295 12.3167 1.00295 12.7072 1.39348L15.3138 4.00008H19.0001C19.5524 4.00008 20.0001 4.4478 20.0001 5.00008V8.68637L22.6067 11.293C22.9972 11.6835 22.9972 12.3167 22.6067 12.7072L20.0001 15.3138V19.0001C20.0001 19.5524 19.5524 20.0001 19.0001 20.0001H15.3138L12.7072 22.6067C12.3167 22.9972 11.6835 22.9972 11.293 22.6067L8.68637 20.0001H5.00008C4.4478 20.0001 4.00008 19.5524 4.00008 19.0001V15.3138L1.39348 12.7072C1.00295 12.3167 1.00295 11.6835 1.39348 11.293L4.00008 8.68637V5.00008C4.00008 4.4478 4.4478 4.00008 5.00008 4.00008H8.68637ZM6.00008 6.00008V9.5148L3.5148 12.0001L6.00008 14.4854V18.0001H9.5148L12.0001 20.4854L14.4854 18.0001H18.0001V14.4854L20.4854 12.0001L18.0001 9.5148V6.00008H14.4854L12.0001 3.5148L9.5148 6.00008H6.00008ZM12.0001 16.0001C9.79094 16.0001 8.00008 14.2092 8.00008 12.0001C8.00008 9.79094 9.79094 8.00008 12.0001 8.00008C14.2092 8.00008 16.0001 9.79094 16.0001 12.0001C16.0001 14.2092 14.2092 16.0001 12.0001 16.0001ZM12.0001 14.0001C13.1047 14.0001 14.0001 13.1047 14.0001 12.0001C14.0001 10.8955 13.1047 10.0001 12.0001 10.0001C10.8955 10.0001 10.0001 10.8955 10.0001 12.0001C10.0001 13.1047 10.8955 14.0001 12.0001 14.0001Z" />
              </svg>
            </button>
            <div className="group relative h-12 w-12" title="Your month">
              <div
                className="flex h-full w-full items-center justify-center rounded-2xl ring-1 ring-white/15 shadow-inner transition"
                style={{ backgroundImage: avatarGradient, backgroundSize: 'cover', backgroundPosition: 'center' }}
              >
                <span className="text-xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]">{avatarEmoji}</span>
              </div>
            </div>
          </div>
          {/* version label removed for desktop menu bar */}
        </div>
      </aside>
      <div className="flex flex-1">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={pageDirection}>
              <motion.div
                key={page}
                custom={pageDirection}
                variants={{
                  enter: (direction: number) => ({ opacity: 0, x: direction * 26, filter: 'blur(8px)' }),
                  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
                  exit: (direction: number) => ({ opacity: 0, x: direction * -26, filter: 'blur(8px)' }),
                }}
                initial={hasMounted.current ? 'enter' : 'center'}
                animate="center"
                exit="exit"
                transition={PAGE_TRANSITION}
                className="h-full overflow-y-auto"
              >
                {pageContent}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
          <div className="hidden lg:flex w-[260px] flex-col border-l border-white/10 px-6 py-8">
          <div className="flex items-start justify-between gap-3">
            <motion.div
              key={timelineScope}
              // Fade + blur matching page transitions; skip entrance motion on full reload.
              initial={hasMounted.current ? { opacity: 0, filter: 'blur(8px)' } : { opacity: 1, filter: 'blur(0px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={PAGE_TRANSITION}
            >
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/40">{timelineScope}</div>
              <div className="mt-2 text-lg font-semibold text-white">Journal timeline</div>
            </motion.div>
            <AnimatePresence>
              {timelineResetLabel && (
                <motion.button
                  key="timeline-reset"
                  type="button"
                  onClick={handleReset}
                  className="flex h-9 w-9 items-center justify-center self-start rounded-full border border-white/12 text-white/65 transition hover:border-white/30 hover:text-white"
                  // Fade + blur like pages; skip entrance animation on full reload.
                  initial={hasMounted.current ? { opacity: 0, filter: 'blur(8px)' } : { opacity: 1, filter: 'blur(0px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(8px)' }}
                  transition={PAGE_TRANSITION}
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
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          {page === FLOWS && (
            <motion.div
              key={`flows-mode-${flowsMode}`}
              // Fade + blur to match page transitions; no slide.
              initial={hasMounted.current ? { opacity: 0, filter: 'blur(8px)' } : { opacity: 1, filter: 'blur(0px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={PAGE_TRANSITION}
              className="mt-5 flex gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/45"
            >
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
            </motion.div>
          )}
          <div className="mt-5 flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
              <AnimatePresence mode="popLayout">
                {activeTimelineItems.map((item) => (
                  <motion.div
                    key={item.key}
                    layout
                    // Fade + blur to match page transitions; no stagger. Skip entrance on full reload.
                    initial={hasMounted.current ? { opacity: 0, filter: 'blur(8px)' } : { opacity: 1, filter: 'blur(0px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(8px)' }}
                    transition={PAGE_TRANSITION}
                  >
                    <button
                      type="button"
                      onClick={item.onSelect}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${item.active ? 'bg-white/[0.14] text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]' : 'text-white/70 hover:bg-white/[0.08]'}`}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02]">
                        {item.swatch ? <span className="h-6 w-6 rounded-md" style={{ background: item.swatch }} /> : <span className="text-xs text-white/35">—</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-white">{item.title}</div>
                        </div>
                        <div className="mt-1 truncate text-xs text-white/70">{item.detail}</div>
                        {item.secondary && (
                          <div className="mt-0.5 truncate text-[11px] text-white/45">{item.secondary}</div>
                        )}
                      </div>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
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