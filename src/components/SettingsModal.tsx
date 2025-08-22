import { useEffect, useState, useRef, useMemo } from 'react';
import { APP_VERSION_LABEL } from '../lib/version';
import { loadUser, saveUser } from '../lib/storage';
import { monthlyStops, emojiStats, hsl, todayISO } from '../lib/utils';
import type { Entry } from '../lib/types';

export default function SettingsModal({ open, onClose, entries, onShowGuide }: { open: boolean; onClose: () => void; entries: Entry[]; onShowGuide?: () => void }) {
  const [closing, setClosing] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const [username, setUsername] = useState(() => loadUser().username);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(()=>{ if(!open) setClosing(false); }, [open]);
  useEffect(()=>()=>{ if(timeoutRef.current) window.clearTimeout(timeoutRef.current); },[]);
  const CLOSE_DURATION = 280; // ms (match CSS .28s)
  function beginClose(){
    if (closing) return; // prevent double trigger
    setClosing(true);
    timeoutRef.current = window.setTimeout(()=> onClose(), CLOSE_DURATION + 40); // slight buffer to avoid cut-off
  }
  useEffect(()=>{
    if (open) {
      // refresh username in case changed elsewhere
      const current = loadUser();
      setUsername(current.username);
      setDirty(false); setSaving(false); setSavedFlash(false);
    }
  }, [open]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUsername(e.target.value);
    setDirty(true);
  }
  function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    // mimic async (future server) for visual feedback
    setTimeout(()=>{
      const stored = saveUser({ username, createdAt: Date.now(), updatedAt: Date.now() });
      setUsername(stored.username);
      setSaving(false); setDirty(false); setSavedFlash(true);
      setTimeout(()=> setSavedFlash(false), 1400);
    }, 120);
  }

  // Auto avatar derivation
  const { topEmoji, gradientCSS } = useMemo(()=>{
    const monthKey = todayISO().slice(0,7);
    const monthEntries = entries.filter(e=> e.date.startsWith(monthKey));
    if (!monthEntries.length) {
      return { topEmoji: '🙂', gradientCSS: 'radial-gradient(circle at 50% 50%, hsl(220 10% 28%) 0%, hsl(220 10% 18%) 75%)' };
    }
    const { freq } = emojiStats(monthEntries);
    let best: string | null = null; let bestC = -1;
    for (const [emo, c] of freq.entries()) { if (c > bestC) { best = emo; bestC = c; } }
    const emoji = best || '🙂';
    const rawStops = monthlyStops(monthEntries).slice(0,3);
    const stops = rawStops.length ? rawStops : [220,300,40];
    let gradient: string;
    if (stops.length === 1) {
      const h0 = stops[0];
      gradient = `radial-gradient(circle at 45% 40%, ${hsl(h0,75,60)} 0%, ${hsl(h0,70,45)} 55%, ${hsl(h0,65,28)} 100%)`;
    } else if (stops.length === 2) {
      const [h1,h2] = stops;
      gradient = `linear-gradient(135deg, ${hsl(h1,80,58)} 0%, ${hsl(h2,75,48)} 100%)`;
      gradient += `, radial-gradient(circle at 50% 60%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 70%)`;
    } else {
      const [h1,h2,h3] = stops;
      // Smooth blend: multi-stop linear gradient + radial vignette
      gradient = `linear-gradient(135deg,
        ${hsl(h1,85,60)} 0%,
        ${hsl(h1,80,55)} 15%,
        ${hsl(h2,80,55)} 50%,
        ${hsl(h3,78,52)} 85%,
        ${hsl(h3,72,45)} 100%)`;
      gradient += `, radial-gradient(circle at 50% 55%, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0.45) 75%)`;
    }
    return { topEmoji: emoji, gradientCSS: gradient };
  }, [entries]);

  if (!open && !closing) return null;
  return (
    <div className={"fixed inset-0 z-50 flex items-end justify-center settings-overlay backdrop-blur-sm sm:items-center " + (closing? 'closing':'')} onClick={beginClose}>
  <div className={"w-full max-w-sm rounded-t-2xl bg-[#111] p-6 pt-7 ring-1 ring-white/10 sm:rounded-2xl settings-panel " + (closing? 'closing':'')}
       onClick={(e)=>e.stopPropagation()}>
        <div className="mb-4 relative">
          {onShowGuide && (
            <button
              type="button"
              aria-label="Open guide"
              onClick={onShowGuide}
              className="absolute top-0 left-0 w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition"
            >
              <span className="text-lg font-semibold">?</span>
            </button>
          )}
          <div className="text-lg font-semibold tracking-wide bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent text-center">
            Settings
          </div>
          {/* Auto Avatar */}
          <div className="absolute top-0 right-0" title="Your Flowday avatar (auto-generated)">
            <div className="relative group" style={{ width:48, height:48 }}>
              <div
                className="w-full h-full rounded-full ring-1 ring-white/15 shadow-inner overflow-hidden"
                style={{ backgroundImage: gradientCSS, backgroundSize:'cover', backgroundPosition:'center', transition:'filter 0.6s', filter:'saturate(1.05)' }}
              >
                <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" style={{background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), rgba(255,255,255,0) 60%)'}} />
                <div className="flex items-center justify-center w-full h-full text-[24px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] select-none">
                  {topEmoji}
                </div>
              </div>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full text-[10px] text-white/40 font-medium whitespace-nowrap pointer-events-none select-none">Your month</div>
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          <div className="py-3">
            <div className="text-sm font-medium mb-2">Account</div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-white/45 mb-1">Username</label>
                <div className="flex items-center gap-2">
                  <input
                    value={username}
                    onChange={handleChange}
                    maxLength={24}
                    className="flex-1 rounded-md bg-white/5 px-3 py-1.5 text-sm outline-none ring-1 ring-white/15 focus:ring-white/30 placeholder:text-white/30"
                    placeholder="user"
                  />
                  <button
                    type="submit"
                    disabled={!dirty || saving || !username.trim()}
                    className="rounded-md px-3 py-1.5 text-xs font-medium ring-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ring-white/15 text-white/85 hover:bg-white/10"
                  >
                    {saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-white/40">Lowercase, 24 chars max. Future: global uniqueness.</p>
              </div>
              <div className="pt-1 grid gap-2 opacity-50 cursor-not-allowed select-none">
                <button type="button" className="w-full rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 text-white/40">Sign in (soon)</button>
                <button type="button" className="w-full rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 text-red-400/50">Delete account (soon)</button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm('Delete all Flowday local data? This cannot be undone.')) return;
                    try {
                      localStorage.removeItem('flowday_entries_v1');
                      localStorage.removeItem('flowday_recent_emojis_v1');
                      localStorage.removeItem('flowday_user_v1');
                    } catch { /* ignore */ }
                    alert('Local data cleared. App will reload.');
                    window.location.reload();
                  }}
                  className="w-full rounded-md bg-red-600/15 px-3 py-1.5 text-xs font-medium ring-1 ring-red-500/25 text-red-300 hover:bg-red-600/25 active:bg-red-600/30 transition"
                >
                  Delete all local data
                </button>
              </div>
            </form>
          </div>
          <div className="py-3">
            <div className="text-sm font-medium">Reminders</div>
            <div className="text-xs text-white/60">Daily reminder time, weekly recap</div>
          </div>
          {/* Removed Memories section */}
          {/* <div className="py-3">
            <div className="text-sm font-medium">Reminders</div>
            <div className="text-xs text-white/60">Daily reminder time, weekly recap</div>
          </div> */}
        </div>

  <div className="mt-5 flex justify-center">
          <button onClick={beginClose} className="rounded-md px-4 py-1.5 text-sm font-medium text-white/85 ring-1 ring-white/15 hover:bg-white/5">Done</button>
        </div>
        <div className="mt-6 text-center text-[10px] leading-relaxed text-white/45">
          <div className="font-medium text-white/55">{APP_VERSION_LABEL}</div>
          <div className="mt-1">© {new Date().getFullYear()} Kyle Brooks. All rights reserved.</div>
          <div className="mt-0.5">Icons by Remix Design.</div>
        </div>
      </div>
    </div>
  );
}