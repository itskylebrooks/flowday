import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from '@app/App.tsx';
import { initTelegram, tg } from '@lib/telegram';

// Attempt immediate init; if not yet present (script may load async), retry a few times.
function tryInitTG(attempt = 0) {
  if (tg()) {
    initTelegram();
    return;
  }
  if (attempt < 10) setTimeout(() => tryInitTG(attempt + 1), 150);
}
tryInitTG();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
