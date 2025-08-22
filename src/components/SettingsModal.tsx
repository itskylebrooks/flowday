import { useEffect, useState, useRef, useMemo } from 'react';
import { APP_VERSION_LABEL } from '../lib/version';
import { loadUser, saveUser, loadReminders, saveReminders, clearAllData } from '../lib/storage';
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

  // Persist reminders when modal closes if changed
  useEffect(()=>{
    if (!open && remindersDirtyRef.current) {
      saveReminders(reminders);
      remindersDirtyRef.current = false;
    }
  }, [open, reminders]);

  // Reminder execution logic removed (placeholder) — only settings & persistence remain for now.

  // ---- Time helpers (stored internally always as 24h HH:MM) ----
  function parse24(str: string): { h: number; m: number } {
    const m = /^([0-9]{2}):([0-9]{2})$/.exec(str);
    if (!m) return { h: 20, m: 0 };
    return { h: Math.min(23, parseInt(m[1],10)), m: Math.min(59, parseInt(m[2],10)) };
  }
  function to24(h: number, m: number) {
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  function split12(str: string): { h12: number; m: number; period: 'AM'|'PM' } {
    const { h, m } = parse24(str);
    const period: 'AM'|'PM' = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h % 12) || 12);
    return { h12, m, period };
  }
  function join12(h12: number, m: number, period: 'AM'|'PM') {
    let h24 = h12 % 12;
    if (period === 'PM') h24 += 12;
    if (period === 'AM' && h24 === 12) h24 = 0; // 12 AM -> 00
    if (period === 'PM' && h24 === 12) h24 = 12; // 12 PM stays 12
    return to24(h24, m);
  }
  const minuteOptions = Array.from({length:12}, (_,i)=> i*5); // 0..55 step 5

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
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-400 text-white font-semibold tracking-wide">TG Version</span>
            </div>
          )}
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
              <div className="pt-1 grid gap-2">
                <div className="opacity-50 cursor-not-allowed select-none space-y-2">
                  <button type="button" className="w-full rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 text-white/40">Sign in (soon)</button>
                  <button type="button" className="w-full rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 text-red-400/50">Delete account (soon)</button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm('Delete all Flowday local data? This cannot be undone.')) return;
                    clearAllData();
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
          <div className="py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Reminders</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={()=> { const nextFmt: '24' | '12' = reminders.timeFormat==='24' ? '12':'24'; const v={...reminders,timeFormat: nextFmt}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }}
                  className="text-[11px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-white/60"
                >{reminders.timeFormat==='24'?'24h':'12h'}</button>
                <button
                  type="button"
                  onClick={()=> { setReminders(loadReminders()); remindersDirtyRef.current=false; }}
                  className="text-[11px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-white/60"
                >Reset</button>
              </div>
            </div>
            <div className="space-y-3">
              {/* Daily row */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={()=> { const v={...reminders,dailyEnabled: !reminders.dailyEnabled}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }}
                  className={"flex-1 text-left px-3 py-2 rounded-md ring-1 transition text-sm font-medium " + (reminders.dailyEnabled? 'bg-white/12 ring-white/25 text-white':'bg-white/5 ring-white/10 text-white/70 hover:bg-white/8')}
                >Daily reminder</button>
                {/* Custom time selects */}
                {reminders.timeFormat !== '12' && (()=> { const {h,m}=parse24(reminders.dailyTime); return (
                  <div className="flex items-center gap-1" aria-label="Daily time 24h">
                    <select disabled={!reminders.dailyEnabled} value={h} onChange={e=> { const nh=parseInt(e.target.value,10); const v={...reminders,dailyTime: to24(nh,m)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[56px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      {Array.from({length:24},(_,i)=> <option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}
                    </select>
                    <span className="text-white/50 text-xs px-0.5">:</span>
                    <select disabled={!reminders.dailyEnabled} value={m} onChange={e=> { const nm=parseInt(e.target.value,10); const v={...reminders,dailyTime: to24(h,nm)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[56px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      {minuteOptions.map(mi=> <option key={mi} value={mi}>{String(mi).padStart(2,'0')}</option>)}
                    </select>
                  </div>
                )})()}
                {reminders.timeFormat === '12' && (()=> { const {h12,m,period}=split12(reminders.dailyTime); return (
                  <div className="flex items-center gap-1" aria-label="Daily time 12h">
                    <select disabled={!reminders.dailyEnabled} value={h12} onChange={e=> { const nh=parseInt(e.target.value,10); const v={...reminders,dailyTime: join12(nh,m,period)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[52px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      {Array.from({length:12},(_,i)=> i+1).map(hh=> <option key={hh} value={hh}>{hh}</option>)}
                    </select>
                    <span className="text-white/50 text-xs px-0.5">:</span>
                    <select disabled={!reminders.dailyEnabled} value={m} onChange={e=> { const nm=parseInt(e.target.value,10); const v={...reminders,dailyTime: join12(h12,nm,period)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[56px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      {minuteOptions.map(mi=> <option key={mi} value={mi}>{String(mi).padStart(2,'0')}</option>)}
                    </select>
                    <select disabled={!reminders.dailyEnabled} value={period} onChange={e=> { const p=e.target.value==='AM'?'AM':'PM'; const v={...reminders,dailyTime: join12(h12,m,p)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[60px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                )})()}
              </div>
              {/* Weekly row */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={()=> { const v={...reminders,weeklyEnabled: !reminders.weeklyEnabled}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }}
                  className={"flex-1 text-left px-3 py-2 rounded-md ring-1 transition text-sm font-medium " + (reminders.weeklyEnabled? 'bg-white/12 ring-white/25 text-white':'bg-white/5 ring-white/10 text-white/70 hover:bg-white/8')}
                >Weekly recap</button>
                <select
                  value={reminders.weeklyDay}
                  disabled={!reminders.weeklyEnabled}
                  onChange={(e)=> { const v = { ...reminders, weeklyDay: parseInt(e.target.value,10) }; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }}
                  className="rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30"
                >
                  {reminders.timeFormat==='24' ? (
                    <>
                      <option value={1}>Mon</option>
                      <option value={2}>Tue</option>
                      <option value={3}>Wed</option>
                      <option value={4}>Thu</option>
                      <option value={5}>Fri</option>
                      <option value={6}>Sat</option>
                      <option value={0}>Sun</option>
                    </>
                  ) : (
                    <>
                      <option value={0}>Sun</option>
                      <option value={1}>Mon</option>
                      <option value={2}>Tue</option>
                      <option value={3}>Wed</option>
                      <option value={4}>Thu</option>
                      <option value={5}>Fri</option>
                      <option value={6}>Sat</option>
                    </>
                  )}
                </select>
                {reminders.timeFormat !== '12' && (()=> { const {h,m}=parse24(reminders.weeklyTime); return (
                  <div className="flex items-center gap-1" aria-label="Weekly time 24h">
                    <select disabled={!reminders.weeklyEnabled} value={h} onChange={e=> { const nh=parseInt(e.target.value,10); const v={...reminders,weeklyTime: to24(nh,m)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[56px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      {Array.from({length:24},(_,i)=> <option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}
                    </select>
                    <span className="text-white/50 text-xs px-0.5">:</span>
                    <select disabled={!reminders.weeklyEnabled} value={m} onChange={e=> { const nm=parseInt(e.target.value,10); const v={...reminders,weeklyTime: to24(h,nm)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[56px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      {minuteOptions.map(mi=> <option key={mi} value={mi}>{String(mi).padStart(2,'0')}</option>)}
                    </select>
                  </div>
                )})()}
                {reminders.timeFormat === '12' && (()=> { const {h12,m,period}=split12(reminders.weeklyTime); return (
                  <div className="flex items-center gap-1" aria-label="Weekly time 12h">
                    <select disabled={!reminders.weeklyEnabled} value={h12} onChange={e=> { const nh=parseInt(e.target.value,10); const v={...reminders,weeklyTime: join12(nh,m,period)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[52px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      {Array.from({length:12},(_,i)=> i+1).map(hh=> <option key={hh} value={hh}>{hh}</option>)}
                    </select>
                    <span className="text-white/50 text-xs px-0.5">:</span>
                    <select disabled={!reminders.weeklyEnabled} value={m} onChange={e=> { const nm=parseInt(e.target.value,10); const v={...reminders,weeklyTime: join12(h12,nm,period)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[56px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      {minuteOptions.map(mi=> <option key={mi} value={mi}>{String(mi).padStart(2,'0')}</option>)}
                    </select>
                    <select disabled={!reminders.weeklyEnabled} value={period} onChange={e=> { const p=e.target.value==='AM'?'AM':'PM'; const v={...reminders,weeklyTime: join12(h12,m,p)}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); }} className="w-[60px] rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 text-white/90 disabled:opacity-30">
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                )})()}
              </div>
              <p className="text-[11px] text-white/35 leading-relaxed">
                Reminders don't work for now and will be implemented in a future update.
              </p>
            </div>
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