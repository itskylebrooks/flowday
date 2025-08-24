import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { APP_VERSION_LABEL } from '../lib/version';
import { loadUser, saveUser, loadReminders, saveReminders, clearAllData, exportAllData, importAllData } from '../lib/storage';
import { isCloudEnabled, signInToCloud, deleteCloudAccount, updateCloudUsername } from '../lib/sync';
import { monthlyStops, emojiStats, hsl, todayISO } from '../lib/utils';
import type { Entry } from '../lib/types';

export default function SettingsModal({ open, onClose, entries, onShowGuide, isTG }: { open: boolean; onClose: () => void; entries: Entry[]; onShowGuide?: () => void; isTG?: boolean }) {
  const [closing, setClosing] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const [username, setUsername] = useState(() => loadUser().username);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [reminders, setReminders] = useState(()=> loadReminders());
  // Data transfer UI state (export/import)
  const [mode, setMode] = useState<'merge'|'replace'>('merge');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // simple language state stored locally as a placeholder
  // language selection removed — app is English-only for Telegram deployment
  const remindersDirtyRef = useRef(false);
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
  // refresh reminders
  setReminders(loadReminders());
  remindersDirtyRef.current = false;
    }
  }, [open]);

  // Data transfer handlers
  async function handleExport() {
    try {
      setExporting(true);
      const payload = exportAllData();
      const json = JSON.stringify(payload, null, 2);
      setPreview(json);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date().toISOString().slice(0,10);
      a.href = url; a.download = `flowday-export-${now}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
    finally { setExporting(false); }
  }
  function triggerFilePick() { fileRef.current?.click(); }
  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const txt = await f.text();
    setImporting(true);
    try {
      const res = importAllData(txt, { merge: mode === 'merge' });
      if (!res.ok) alert('Import failed: ' + (res.message || 'unknown'));
      else {
        const parts: string[] = [];
        if (res.added) parts.push(`${res.added} added`);
        if (res.merged) parts.push(`${res.merged} merged`);
        parts.push(`${res.total ?? '??'} total locally`);
        alert('Import completed: ' + parts.join(', '));
        window.location.reload();
      }
    } catch { alert('Import failed'); }
    finally { setImporting(false); try { e.target.value = ''; } catch {} }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUsername(e.target.value);
    setDirty(true);
  }
  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
  if (username.trim().length < 4) { setSaving(false); alert('Username must be at least 4 characters.'); return; }
  const stored = saveUser({ username, createdAt: Date.now(), updatedAt: Date.now() });
    // If cloud enabled, attempt remote username update
    if (isCloudEnabled()) {
      const r = await updateCloudUsername(stored.username);
      if (!r.ok && r.error === 'username-taken') {
        setSaving(false);
        alert('Username already taken. Please choose another.');
        return;
      }
    }
    setUsername(stored.username);
    setSaving(false); setDirty(false); setSavedFlash(true);
    setTimeout(()=> setSavedFlash(false), 1400);
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

  const pushRemindersToCloud = useCallback(async (updated = reminders) => {
    if (!isCloudEnabled()) return;
    try {
      interface TGWin { Telegram?: { WebApp?: { initData?: string } } }
      const tg = (window as unknown as TGWin).Telegram?.WebApp; const initData: string | undefined = tg?.initData;
      if (!initData) return;
      const body = {
        initData,
        daily_enabled: updated.dailyEnabled,
        daily_time: updated.dailyTime
      };
      await fetch('/api/reminders-set', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    } catch { /* ignore */ }
  }, [reminders]);

  // Persist reminders when modal closes if changed
  useEffect(()=>{
    if (!open && remindersDirtyRef.current) {
      saveReminders(reminders);
      void pushRemindersToCloud();
      remindersDirtyRef.current = false;
    }
  }, [open, reminders, pushRemindersToCloud]);

  // Reminder execution logic removed (placeholder) — only settings & persistence remain for now.

  // ---- Time helpers (stored internally always as 24h HH:MM) ----
  
  // Local helper for UI state
  const dailyEnabled = reminders.dailyEnabled;

  if (!open && !closing) return null;
  return (
    <div className={"fixed inset-0 z-50 flex items-stretch sm:items-center justify-center settings-overlay backdrop-blur-sm " + (closing? 'closing':'')} onClick={beginClose}>
  <div className={"w-full h-full sm:h-auto max-w-none sm:max-w-sm rounded-none sm:rounded-2xl bg-[#111] p-6 pt-7 pb-8 ring-1 ring-white/10 overflow-y-auto settings-panel " + (closing? 'closing':'')}
       style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
       onClick={(e)=>e.stopPropagation()}>
        <div className="mb-8">
          <div className="relative h-12 flex items-center justify-center">
            {onShowGuide && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2" style={{ width:48, height:48 }}>
                <button
                  type="button"
                  aria-label="Open guide"
                  onClick={onShowGuide}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10 text-white/60 hover:text-white hover:bg-white/10 transition"
                >
                  <span className="text-xl font-semibold">?</span>
                </button>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full text-[10px] text-white/40 font-medium whitespace-nowrap pointer-events-none select-none">App guide</div>
              </div>
            )}
            <span className="text-lg font-semibold tracking-wide bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Settings</span>
            {/* Avatar */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2" title="Your Flowday avatar (auto-generated)">
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
            {isTG && (
            <div className="mt-2 flex justify-center">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/30 text-white/85 ring-1 ring-sky-500/60 font-semibold tracking-wide hover:bg-sky-500/50 transition">TG Version</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Account card */}
          <div className="bg-white/4 p-4 sm:p-5 rounded-2xl ring-1 ring-white/6 shadow-sm text-sm">
            <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold mb-0.5">Account</div>

                
              </div>
            </div>
            <hr className="border-t border-white/6 my-3" />
            <form onSubmit={handleSave} className="mt-1 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-white/45 mb-2">Username</label>
                <div className="flex items-center gap-3">
                  <input
                    value={username}
                    onChange={handleChange}
                    maxLength={24}
                    className="flex-1 rounded-md bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/12 focus:ring-2 focus:ring-emerald-500 placeholder:text-white/30"
                    placeholder="user"
                  />
                  <button
                    type="submit"
                    disabled={!dirty || saving || !username.trim()}
                    className="rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white/6 text-white/90 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    {saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-white/40">Lowercase, 24 chars max. Global uniqueness.</p>
              </div>

                  <div className="pt-1 grid gap-2">
                    <CloudAccountSection isTG={isTG} />
                  </div>

              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm('Delete all Flowday local data? This cannot be undone.')) return;
                    clearAllData();
                    alert('Local data cleared. App will reload.');
                    window.location.reload();
                  }}
                  className="text-xs text-red-400 hover:underline"
                >
                  Delete all local data
                </button>
              </div>
            </form>
          </div>
          {/* Data transfer card (Export / Import) - web-only */}
          {!isTG && (
          <div className="bg-white/4 p-4 sm:p-5 rounded-2xl ring-1 ring-white/6 shadow-sm text-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold mb-0.5">Data transfer</div>
                <hr className="border-t border-white/6 my-3" />
                <div className="text-[11px] text-center text-white/40 mt-1">This is a local import/export only feature for the web build. Use JSON files to move data between devices.</div>
              </div>
            </div>
            <div className="w-full">
              <div className="w-full grid gap-2 mt-2">
                <button onClick={handleExport} disabled={exporting}
                  className="w-full rounded-md bg-white/6 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 text-white/70 hover:bg-white/8">
                  {exporting ? 'Exporting…' : 'Export all data (JSON)'}
                </button>

                <div className="flex gap-2">
                  <button type="button" onClick={triggerFilePick}
                    className="flex-1 rounded-md bg-white/6 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 text-white/70 hover:bg-white/8">
                    {importing ? 'Importing…' : 'Import from file'}
                  </button>
                  <input ref={fileRef} type="file" accept="application/json" onChange={handleFileChosen} className="hidden" />
                </div>

                <div className="flex items-center justify-center gap-2 text-[11px] text-white/45">
                  <label onClick={() => setMode('merge')} className={"px-2 py-1 rounded-md ring-1 cursor-pointer select-none " + (mode==='merge' ? 'ring-emerald-500/30 bg-emerald-600/8' : 'ring-white/8') }>
                    <input aria-hidden className="sr-only" type="radio" checked={mode==='merge'} readOnly />
                    <span>Merge (keep newest per day)</span>
                  </label>
                  <label onClick={() => setMode('replace')} className={"px-2 py-1 rounded-md ring-1 cursor-pointer select-none " + (mode==='replace' ? 'ring-red-400/25 bg-red-600/6' : 'ring-white/8') }>
                    <input aria-hidden className="sr-only" type="radio" checked={mode==='replace'} readOnly />
                    <span>Replace local</span>
                  </label>
                </div>

              </div>
              {preview && (
                <details className="mt-2 text-left text-[11px] text-white/40">
                  <summary className="cursor-pointer">Preview exported JSON (click to expand)</summary>
                  <pre className="mt-2 max-h-60 overflow-auto text-[11px] text-white/60 p-2 bg-black/20 rounded">{preview}</pre>
                </details>
              )}
            </div>
          </div>
          )}

          {/* Reminders card (only Daily reminder shown) */}
          <div className="bg-white/4 p-4 sm:p-5 rounded-2xl ring-1 ring-white/6 shadow-sm text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Daily reminder</div>
                  <div className="text-[12px] text-white/40 mt-1">Arrives in the evening 🌆</div>
              </div>
              <div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dailyEnabled}
                  aria-disabled={!isCloudEnabled()}
                  onClick={()=> {
                    if (!isCloudEnabled()) return; // only cloud (Supabase) users may enable daily reminders
                    const v={...reminders,dailyEnabled: !dailyEnabled}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); pushRemindersToCloud(v);
                  }}
                  disabled={!isCloudEnabled()}
                  className={
                      "inline-flex items-center px-3 py-2 rounded-full transition-colors text-sm font-medium " +
                      (dailyEnabled
                        ? 'bg-emerald-600/8 text-white/90 ring-1 ring-emerald-500/30'
                        : 'bg-red-600/6 text-white/85 ring-1 ring-red-400/25 hover:bg-red-600/12')
                    }
                >
                  <span className="mr-3 text-sm">{dailyEnabled ? 'On' : 'Off'}</span>
                  <span className={"relative inline-block w-11 h-6 rounded-full transition-colors " + (dailyEnabled ? 'bg-emerald-500/80' : 'bg-white/12') }>
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform"
                      style={{ transform: dailyEnabled ? 'translateX(1.4rem)' : 'translateX(0)' }}
                    />
                  </span>
                </button>
              </div>
            </div>
            {!isCloudEnabled() && (
              <div className="text-[11px] text-white/40 mt-3">Only users with a cloud account can enable reminders.</div>
            )}
          </div>

          {/* Language selection removed */}
    </div>

  {/* LanguageModal removed */}

  <div className="mt-5">
    <button onClick={beginClose} className="w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white/90 bg-emerald-500/30 ring-1 ring-emerald-500/60 hover:bg-emerald-500/50 transition">Done</button>
  </div>
        <div className="mt-6 text-center text-[10px] leading-relaxed text-white/45 relative">
          <a
            href="https://www.linkedin.com/in/itskylebrooks/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Kyle Brooks on LinkedIn"
            className="absolute left-4 top-1/2 -translate-y-1/2 opacity-90 hover:opacity-75 transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="rgba(255,255,255,1)" width="18" height="18"><path d="M4.00098 3H20.001C20.5533 3 21.001 3.44772 21.001 4V20C21.001 20.5523 20.5533 21 20.001 21H4.00098C3.44869 21 3.00098 20.5523 3.00098 20V4C3.00098 3.44772 3.44869 3 4.00098 3ZM5.00098 5V19H19.001V5H5.00098ZM7.50098 9C6.67255 9 6.00098 8.32843 6.00098 7.5C6.00098 6.67157 6.67255 6 7.50098 6C8.3294 6 9.00098 6.67157 9.00098 7.5C9.00098 8.32843 8.3294 9 7.50098 9ZM6.50098 10H8.50098V17.5H6.50098V10ZM12.001 10.4295C12.5854 9.86534 13.2665 9.5 14.001 9.5C16.072 9.5 17.501 11.1789 17.501 13.25V17.5H15.501V13.25C15.501 12.2835 14.7175 11.5 13.751 11.5C12.7845 11.5 12.001 12.2835 12.001 13.25V17.5H10.001V10H12.001V10.4295Z"></path></svg>
          </a>

          <a
            href="https://github.com/itskylebrooks"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Kyle Brooks on GitHub"
            className="absolute right-4 top-1/2 -translate-y-1/2 opacity-90 hover:opacity-75 transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="rgba(255,255,255,1)" width="18" height="18"><path d="M12.001 2C6.47598 2 2.00098 6.475 2.00098 12C2.00098 16.425 4.86348 20.1625 8.83848 21.4875C9.33848 21.575 9.52598 21.275 9.52598 21.0125C9.52598 20.775 9.51348 19.9875 9.51348 19.15C7.00098 19.6125 6.35098 18.5375 6.15098 17.975C6.03848 17.6875 5.55098 16.8 5.12598 16.5625C4.77598 16.375 4.27598 15.9125 5.11348 15.9C5.90098 15.8875 6.46348 16.625 6.65098 16.925C7.55098 18.4375 8.98848 18.0125 9.56348 17.75C9.65098 17.1 9.91348 16.6625 10.201 16.4125C7.97598 16.1625 5.65098 15.3 5.65098 11.475C5.65098 10.3875 6.03848 9.4875 6.67598 8.7875C6.57598 8.5375 6.22598 7.5125 6.77598 6.1375C6.77598 6.1375 7.61348 5.875 9.52598 7.1625C10.326 6.9375 11.176 6.825 12.026 6.825C12.876 6.825 13.726 6.9375 14.526 7.1625C16.4385 5.8625 17.276 6.1375 17.276 6.1375C17.826 7.5125 17.476 8.5375 17.376 8.7875C18.0135 9.4875 18.401 10.375 18.401 11.475C18.401 15.3125 16.0635 16.1625 13.8385 16.4125C14.201 16.725 14.5135 17.325 14.5135 18.2625C14.5135 19.6 14.501 20.675 14.501 21.0125C14.501 21.275 14.6885 21.5875 15.1885 21.4875C19.259 20.1133 21.9999 16.2963 22.001 12C22.001 6.475 17.526 2 12.001 2Z"></path></svg>
          </a>

          <div className="font-medium text-white/55">{APP_VERSION_LABEL}</div>
          <div className="mt-1">© {new Date().getFullYear()} Kyle Brooks. All rights reserved.</div>
          <div className="mt-0.5">Icons by Remix Design.</div>
        </div>
      </div>
    </div>
  );
}

// Language selection UI removed

// Subcomponent to handle cloud account actions
function CloudAccountSection({ isTG }: { isTG?: boolean }) {
  const [enabled, setEnabled] = useState(isCloudEnabled());
  const [working, setWorking] = useState(false);
  // Web-only import/export state & handlers (hooks must be top-level)
  // Cloud account sign-in UI is below for Telegram builds. Web-only import/export is provided
  // by the Data transfer card in the parent SettingsModal.

  // If this is not the Telegram build, don't expose cloud sign-in UI.
  // Show a short informational notice instead.
  if (!isTG) {
    return (
      <div className="space-y-2">
        <div className="w-full">
          <div className="w-full flex justify-center">
            <div className="text-[12px] text-center px-3 py-1.5 rounded-md bg-sky-500/30 text-white/85 ring-1 ring-sky-500/60 tracking-wide hover:bg-sky-500/50 transition">
              Cloud sync is only available in the Telegram version.
            </div>
          </div>
        </div>
      </div>
    );
  }
  async function handleSignIn() {
    setWorking(true);
    const desired = loadUser().username;
    if (desired.trim().length < 4) { setWorking(false); alert('Username must be at least 4 characters.'); return; }
    const r = await signInToCloud(desired);
    setWorking(false);
    if (r.ok) { setEnabled(true); }
    else {
      if (r.error === 'username-taken') alert('Username already taken. Choose another.');
      else if (r.error === 'username-too-short') alert('Username must be at least 4 characters.');
      else alert('Sign in failed. Try again.');
    }
  }
  async function handleDelete() {
    if (!enabled) return;
    if (!window.confirm('Delete cloud account and all synced data? This cannot be undone. Local data will remain.')) return;
    setWorking(true);
    const ok = await deleteCloudAccount();
    setWorking(false);
    if (ok) setEnabled(false);
  }
  return (
    <div className="space-y-2">
      {!enabled && (
        <button type="button" disabled={working} onClick={handleSignIn}
          className="w-full rounded-md bg-emerald-600/15 px-3 py-1.5 text-xs font-medium ring-1 ring-emerald-500/25 text-emerald-300 hover:bg-emerald-600/25 disabled:opacity-50">
          {working ? 'Signing in…' : 'Sign in & enable sync'}
        </button>
      )}
      {enabled && (
        <button type="button" disabled={working} onClick={handleDelete}
          className="w-full rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 text-red-300 hover:bg-red-600/25 disabled:opacity-50">
          {working ? 'Deleting…' : 'Delete cloud account'}
        </button>
      )}
      <p className="text-[10px] leading-relaxed text-white/35">
        {enabled ? 'Cloud sync enabled. Your entries sync across Telegram devices.' : 'Sign in creates a cloud account (Telegram ID) so entries sync across devices. No account is created until you tap Sign in.'}
      </p>
    </div>
  );
}