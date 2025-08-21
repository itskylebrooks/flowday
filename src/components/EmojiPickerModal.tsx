import { useMemo, useState } from 'react';
import { EMOJI_SETS } from '../lib/emojiData';

export default function EmojiPickerModal({
  open, onClose, onPick, recents,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (e: string) => void;
  recents: string[];
}) {
  const [tab, setTab] = useState<string>('Recent');
  const categories = useMemo(() => {
    return { ...EMOJI_SETS, Recent: recents.length ? recents : EMOJI_SETS.Faces.slice(0, 18) } as Record<string,string[]>;
  }, [recents]);

  if (!open) return null;
  const list = categories[tab] || [];

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