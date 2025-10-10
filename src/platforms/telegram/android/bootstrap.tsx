import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTelegram, tg } from '@shared/lib/services/telegram';

function ensureRootElement(): HTMLElement {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root element with id "root" was not found.');
  }
  return root;
}

function tryInitTelegram(attempt = 0): void {
  if (tg()) {
    initTelegram();
    return;
  }
  if (attempt < 10) {
    setTimeout(() => tryInitTelegram(attempt + 1), 150);
  }
}

export function bootstrap(): void {
  tryInitTelegram();

  const rootElement = ensureRootElement();
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
