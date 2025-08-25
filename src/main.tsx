import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTelegram, tg, isTelegram } from './lib/telegram';
import { initAnalytics } from './lib/analytics';

// Attempt immediate init; if not yet present (script may load async), retry a few times.
function tryInitTG(attempt=0){
  if (tg()) { initTelegram(); return; }
  if (attempt < 10) setTimeout(()=> tryInitTG(attempt+1), 150);
}
tryInitTG();

// Initialize analytics for Telegram builds (best-effort, non-blocking)
try {
  const inside = isTelegram();
  // Try to initialize but don't block render for more than ~300ms
  try {
    const p = initAnalytics({ isTG: !!inside });
    if (p && typeof (p as Promise<void>).then === 'function') {
      const race = Promise.race([p, new Promise((res) => setTimeout(res, 300))]);
      void race.catch(()=>{});
    }
  } catch { /* ignore */ }
} catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
