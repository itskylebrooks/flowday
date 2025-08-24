import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTelegram, tg } from './lib/telegram';
import { completeEmailSignIn } from './lib/emailAuth';

// Attempt immediate init; if not yet present (script may load async), retry a few times.
function tryInitTG(attempt=0){
  if (tg()) { initTelegram(); return; }
  if (attempt < 10) setTimeout(()=> tryInitTG(attempt+1), 150);
}
tryInitTG();

if (window.location.pathname === '/auth/callback') {
  completeEmailSignIn().finally(() => {
    const dest = sessionStorage.getItem('flowday_post_auth_redirect') || '/';
    window.location.replace(dest);
  });
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
