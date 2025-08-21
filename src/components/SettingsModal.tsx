import { useEffect, useState, useRef } from 'react';
import { APP_VERSION_LABEL } from '../lib/version';
import { loadUser, saveUser } from '../lib/storage';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  if (!open && !closing) return null;
  return (
    <div className={"fixed inset-0 z-50 flex items-end justify-center settings-overlay backdrop-blur-sm sm:items-center " + (closing? 'closing':'')} onClick={beginClose}>
  <div className={"w-full max-w-sm rounded-t-2xl bg-[#111] p-6 pt-7 ring-1 ring-white/10 sm:rounded-2xl settings-panel " + (closing? 'closing':'')}
       onClick={(e)=>e.stopPropagation()}>
        <div className="mb-4 text-center">
          <div className="text-lg font-semibold tracking-wide bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Settings
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
              </div>
            </form>
          </div>
          <div className="py-3">
            <div className="text-sm font-medium">Memories</div>
            <div className="text-xs text-white/60">Export monthly/weekly/yearly posters</div>
          </div>
          <div className="py-3">
            <div className="text-sm font-medium">Reminders</div>
            <div className="text-xs text-white/60">Daily reminder time, weekly recap</div>
          </div>
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