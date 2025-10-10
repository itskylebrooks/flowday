import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import '@app/styles/index.css';
import { initTelegram, tg } from '@shared/lib/services/telegram';
import type { PlatformId } from './platformDetection';

declare global {
  interface Window {
    __APP_PLATFORM__?: PlatformId;
  }
}

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

function setPlatformIndicators(platform: PlatformId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-app-platform', platform);
    document.body?.setAttribute('data-app-platform', platform);
  }
  if (typeof window !== 'undefined') {
    window.__APP_PLATFORM__ = platform;
  }
}

export function bootstrapReactApp(AppComponent: ComponentType, platform: PlatformId): void {
  setPlatformIndicators(platform);
  tryInitTelegram();

  const rootElement = ensureRootElement();
  createRoot(rootElement).render(
    <StrictMode>
      <AppComponent />
    </StrictMode>,
  );
}
