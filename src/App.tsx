import { useMemo, useState, useEffect } from 'react';
import type { Entry, Page } from './lib/types';
import { todayISO, addDays, canEdit } from './lib/utils';
import { loadEntries, saveEntries, upsertEntry } from './lib/storage';
import IconButton from './components/IconButton';
import EmojiTriangle from './components/EmojiTriangle';

// A tiny inline picker for now
const QUICK_PICK = '😀 🙂 😍 😂 😎 🤔 😴 😡 😭 🥳 🫶 💫 🌈 🍕 ☕️ 🎶'.split(' ');

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

  // which slot is being edited
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

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
          <div className="h-[260px] w-full flex items-center justify-center">
            <EmojiTriangle
              emojis={entry.emojis}
              onPick={(slot) => setPickerSlot(slot)}
              onRemove={removeEmojiAt}
              editable={editable}
            />
          </div>

          {/* Quick inline picker (temporary) */}
          {pickerSlot != null && editable && (
            <div className="mx-auto mt-2 w-full max-w-xs rounded-xl border border-white/10 bg-black/30 p-2">
              <div className="mb-1 text-center text-xs text-white/60">Pick an emoji</div>
              <div className="grid grid-cols-8 gap-2">
                {QUICK_PICK.map((emo) => (
                  <button
                    key={emo}
                    onClick={() => { setEmojiAt(pickerSlot, emo); setPickerSlot(null); }}
                    className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-2xl hover:bg-white/10"
                  >
                    {emo}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-end">
                <button onClick={() => setPickerSlot(null)} className="rounded-md px-2 py-1 text-xs text-white/70 ring-1 ring-white/15 hover:bg-white/5">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Placeholders for other pages (I'll build later) */}
      {page === 'flows' && (
        <div className="mx-auto max-w-sm px-4 pb-28">
          <div className="mt-10 text-center text-white/70">Flows page (next steps)</div>
        </div>
      )}
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
    </div>
  );
}