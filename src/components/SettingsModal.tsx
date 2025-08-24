import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { APP_VERSION_LABEL } from '../lib/version';
import { loadUser, saveUser, loadReminders, saveReminders, clearAllData } from '../lib/storage';
import { hasCloudAccount, signInToCloud, deleteCloudAccount, updateCloudUsername, initialFullSyncIfNeeded, startPeriodicPull } from '../lib/sync';
import { signInWithEmail, signOutEmail, currentUserEmail, deleteEmailAccount } from '../lib/emailAuth';
import { supabase } from '../lib/supabase';
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
  // simple language state stored locally as a placeholder
  const [language, setLanguage] = useState<string>(() => {
    try { return (localStorage.getItem('flowday_lang') || 'English'); } catch { return 'English'; }
  });
  const [langModalOpen, setLangModalOpen] = useState(false);
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

  useEffect(() => {
    if (isTG) return;
    if (!hasCloudAccount()) return;
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('reminders').select('daily_enabled,daily_time').eq('auth_user_id', user.id).maybeSingle();
        if (data) {
          const next = { ...loadReminders(), dailyEnabled: data.daily_enabled, dailyTime: data.daily_time };
          setReminders(next); saveReminders(next);
        }
      } catch { /* ignore */ }
    })();
  }, [open, isTG]);

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
    if (hasCloudAccount()) {
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
    if (!hasCloudAccount()) return;
    try {
      if (isTG) {
        interface TGWin { Telegram?: { WebApp?: { initData?: string } } }
        const tg = (window as unknown as TGWin).Telegram?.WebApp; const initData: string | undefined = tg?.initData;
        if (!initData) return;
        const body = {
          initData,
          daily_enabled: updated.dailyEnabled,
          daily_time: updated.dailyTime
        };
        await fetch('/api/reminders-set', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('reminders').upsert(
          {
            auth_user_id: user.id,
            daily_enabled: updated.dailyEnabled,
            daily_time: updated.dailyTime,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'auth_user_id' }
        );
      }
    } catch { /* ignore */ }
  }, [reminders, isTG]);

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
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-400 text-white font-semibold tracking-wide">TG Version</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Account card */}
          <div className="bg-white/3 p-4 rounded-lg ring-1 ring-white/6 shadow-sm">
            <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium mb-1">Account</div>
                  <p className="text-[11px] text-white/40">Manage your username and sync preferences.</p>
                </div>
              </div>
            <form onSubmit={handleSave} className="mt-3 space-y-3">
              {(isTG || hasCloudAccount()) && (
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
                  <p className="mt-1 text-[11px] text-white/40">Lowercase, 24 chars max. Global uniqueness.</p>
                </div>
              )}

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
                  className="text-xs text-red-300 hover:underline"
                >
                  Delete all local data
                </button>
              </div>
            </form>
          </div>

          {/* Reminders card */}
          <div className="bg-white/3 p-4 rounded-lg ring-1 ring-white/6 shadow-sm">
            <div className="text-sm font-medium mb-2">Reminders</div>
            <p className="text-[11px] text-white/40 mb-3">Control daily reminders for your Flowday entries.</p>
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Daily reminder</div>
                  <div className="text-xs text-white/40 mt-1">Arrives in the evening 🌆</div>
                </div>
                <div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dailyEnabled}
                    aria-disabled={!hasCloudAccount()}
                    onClick={()=> {
                      if (!hasCloudAccount()) return; // only cloud users may enable daily reminders
                      const v={...reminders,dailyEnabled: !dailyEnabled}; setReminders(v); remindersDirtyRef.current=true; saveReminders(v); pushRemindersToCloud(v);
                    }}
                    disabled={!hasCloudAccount()}
                    className={
                      "inline-flex items-center px-3 py-2 rounded-full transition-colors text-sm font-medium " +
                      (dailyEnabled
                        ? 'bg-emerald-600/15 ring-emerald-400/25 text-white'
                        : 'bg-white/5 ring-white/10 text-white/70 hover:bg-white/8')
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
              {!hasCloudAccount() && (
                <div className="text-[11px] text-white/40 mt-3">Only users with a cloud account can enable reminders. Sign in above to enable.</div>
              )}
            </div>
          </div>

          {/* Language card */}
          <div className="bg-white/3 p-4 rounded-lg ring-1 ring-white/6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Language</div>
                <div className="text-[11px] text-white/40">App language and regional settings (placeholder)</div>
              </div>
              <button onClick={()=> setLangModalOpen(true)} className="rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-white/15 hover:bg-white/5">
                {language}
              </button>
            </div>
          </div>
    </div>

  <LanguageModal open={langModalOpen} onClose={()=>setLangModalOpen(false)} current={language} onChoose={(l)=>{ setLanguage(l); try{ localStorage.setItem('flowday_lang', l); } catch(e){ console.debug('lang write failed', e); } }} />

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

// Small inline modal to select language (placeholder)
function LanguageModal({ open, onClose, current, onChoose }: { open: boolean; onClose: () => void; current: string; onChoose: (lang: string) => void }) {
  if (!open) return null;
  const options = ['English', 'Русский', 'Deutsch', 'Español', 'Français'];
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0e0e0e] rounded-xl p-4 w-80 ring-1 ring-white/10" onClick={(e)=>e.stopPropagation()}>
        <div className="text-sm font-medium mb-3">Choose language</div>
        <div className="space-y-2">
          {options.map(o=> (
            <button key={o} onClick={()=>{ onChoose(o); onClose(); }} className={"w-full text-left px-3 py-2 rounded-md " + (o===current ? 'bg-white/5 text-white' : 'hover:bg-white/3 text-white/70')}>
              {o}
            </button>
          ))}
        </div>
        <div className="mt-4 text-right">
          <button onClick={onClose} className="text-xs text-white/40">Close</button>
        </div>
      </div>
    </div>
  );
}

// Subcomponent to handle cloud account actions for Telegram or email-based sign-in
function CloudAccountSection({ isTG }: { isTG?: boolean }) {
  const [enabled, setEnabled] = useState(hasCloudAccount());
  const [working, setWorking] = useState(false);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    if (enabled) {
      void (async () => {
        await initialFullSyncIfNeeded();
        startPeriodicPull();
      })();
    }
  }, [enabled]);

  useEffect(() => {
    if (!isTG && enabled) {
      void currentUserEmail().then(e => { if (e) setEmail(e); });
    }
  }, [isTG, enabled]);

  // Telegram Mini App branch ------------------------------------------
  async function handleSignInTG() {
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
  async function handleDeleteTG() {
    if (!enabled) return;
    if (!window.confirm('Delete cloud account and all synced data? This cannot be undone. Local data will remain.')) return;
    setWorking(true);
    const ok = await deleteCloudAccount();
    setWorking(false);
    if (ok) setEnabled(false);
  }

  // Email web branch ---------------------------------------------------
  async function handleSendLink() {
    if (!email) return;
    setWorking(true);
    sessionStorage.setItem('flowday_post_auth_redirect', window.location.href);
    const { error } = await signInWithEmail(email);
    setWorking(false);
    if (!error) setLinkSent(true);
    else alert('Couldn\u2019t send link. Try again.');
  }
  async function handleLogoutEmail() {
    setWorking(true);
    await signOutEmail();
    setWorking(false);
    setEnabled(false);
    setEmail('');
    setLinkSent(false);
  }
  async function handleDeleteEmail() {
    if (!enabled) return;
    if (!window.confirm('Delete your cloud account? Local entries stay on this device.')) return;
    setWorking(true);
    const { error } = await deleteEmailAccount();
    setWorking(false);
    if (!error) {
      setEnabled(false); setEmail(''); setLinkSent(false);
    } else {
      alert('Delete failed. Try again.');
    }
  }

  if (!isTG) {
    return (
      <div className="space-y-2">
        {!enabled && (
          <>
            <input
              type="email"
              aria-label="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md bg-white/5 px-3 py-1.5 text-sm outline-none ring-1 ring-white/15 focus:ring-white/30 placeholder:text-white/30"
              placeholder="you@example.com"
            />
            <button
              type="button"
              disabled={working || !email}
              onClick={handleSendLink}
              className="w-full rounded-md bg-emerald-600/15 px-3 py-1.5 text-xs font-medium ring-1 ring-emerald-500/25 text-emerald-300 hover:bg-emerald-600/25 disabled:opacity-50"
            >
              {working ? 'Sending…' : 'Sign in / Log in'}
            </button>
            <p className="text-[10px] leading-relaxed text-white/35">
              Sign in creates a cloud account so entries sync across devices. Magic link will be sent to your email address.
            </p>
            {linkSent && (
              <p className="text-[10px] text-emerald-300">Check your email for the link.</p>
            )}
          </>
        )}
        {enabled && (
          <>
            <input
              value={email}
              readOnly
              aria-label="Email"
              className="w-full rounded-md bg-white/5 px-3 py-1.5 text-sm outline-none ring-1 ring-white/15 text-white/60"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={working}
                onClick={handleLogoutEmail}
                className="flex-1 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 hover:bg-white/10"
              >
                {working ? 'Working…' : 'Log out'}
              </button>
              <button
                type="button"
                disabled={working}
                onClick={handleDeleteEmail}
                className="flex-1 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 text-red-300 hover:bg-red-600/25 disabled:opacity-50"
              >
                {working ? 'Working…' : 'Delete account'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Telegram branch UI -------------------------------------------------
  return (
    <div className="space-y-2">
      {!enabled && (
        <button type="button" disabled={working} onClick={handleSignInTG}
          className="w-full rounded-md bg-emerald-600/15 px-3 py-1.5 text-xs font-medium ring-1 ring-emerald-500/25 text-emerald-300 hover:bg-emerald-600/25 disabled:opacity-50">
          {working ? 'Signing in…' : 'Sign in & enable sync'}
        </button>
      )}
      {enabled && (
        <button type="button" disabled={working} onClick={handleDeleteTG}
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