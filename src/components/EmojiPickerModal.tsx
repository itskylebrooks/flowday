import { useMemo, useState } from 'react';
import { getEmojiCategories, searchEmojis } from '../lib/emojiAll';

export default function EmojiPickerModal({
  open, onClose, onPick, recents,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (e: string) => void;
  recents: string[];
}) {
  const [tab, setTab] = useState<string>('Recent');
  const [q, setQ] = useState('');
  const full = useMemo(() => getEmojiCategories(), []);
  const categories = useMemo(() => {
    const firstGroup = Object.keys(full)[0] ?? 'Smileys & Emotion';
    const fallbackList = full[firstGroup]?.slice(0, 24) ?? [];
    const base = { Recent: recents.length ? recents : fallbackList } as Record<string, string[]>;
    // Insert Search as the second category label, will be virtual (uses q to compute list)
    // We'll render Search separately when tab === 'Search'
    return { ...base, Search: [], ...full } as Record<string, string[]>;
  }, [recents, full]);

  if (!open) return null;
  const list = tab === 'Search' ? (q ? searchEmojis(q, 300) : []) : (categories[tab] || []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-[#111] p-3 ring-1 ring-white/10 sm:rounded-2xl" onClick={(e)=>e.stopPropagation()}>
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {Object.keys(categories).map((name) => (
            <button key={name} onClick={()=>setTab(name)} className={'rounded-full px-3 py-1 text-sm ' + (tab===name? 'bg-white/10 text-white' : 'text-white/70 hover:text-white')}>
              {name}
            </button>
          ))}
        </div>
        {tab === 'Search' && (
          <div className="mb-2 p-1">
            <input
              autoFocus
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              placeholder="Search emojis (e.g. happy, heart, cat)"
              className="w-full rounded-md bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 ring-1 ring-white/10 outline-none focus:ring-white/20"
            />
            {!q && <div className="mt-1 text-xs text-white/50">Type keywords to search by name, shortcode, or category</div>}
          </div>
        )}
        <div className="max-h-72 grid grid-cols-8 gap-2 overflow-y-auto p-1">
          {list.map((emo, i) => (
            <button key={emo+i} onClick={()=>onPick(emo)} className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-2xl hover:bg-white/10">
              {emo}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={onClose} className="rounded-md px-3 py-1 text-sm text-white/80 ring-1 ring-white/15 hover:bg-white/5">Close</button>
        </div>
      </div>
    </div>
  );
}