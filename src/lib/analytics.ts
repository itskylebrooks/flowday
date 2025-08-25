/* Tiny privacy-first analytics wrapper for Telegram Mini Apps
   - Initializes @telegram-apps/analytics only when inside Telegram and env vars present
   - Exposes initAnalytics, track, getSessionId
   - Swallows errors and is a no-op when not initialized
*/

let initialized = false;
let sdkClient: any = null;
let sessionId: string | null = null;
let userId: number | undefined = undefined;

function safeGetEnv(name: string): string | undefined {
  try { return (import.meta as any).env?.[name]; } catch { return undefined; }
}

export async function initAnalytics({ isTG }: { isTG: boolean }): Promise<void> {
  try {
    if (initialized) return;
    if (!isTG) return;
    const token = safeGetEnv('VITE_TG_ANALYTICS_TOKEN');
    const appName = safeGetEnv('VITE_TG_ANALYTICS_APP');
    if (!token || !appName) return;

    // generate session id
    try { sessionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? (crypto as any).randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2,9); } catch { sessionId = String(Date.now()); }

    try { const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user; if (tgUser && typeof tgUser.id === 'number') userId = tgUser.id as number; } catch {}

    // dynamic import so SDK is only pulled when used
    try {
      const sdkModule: any = await import('@telegram-apps/analytics');
      try {
        // Support several export shapes: sdk.init, default.init, or default function
        const maybeInit = sdkModule.init ?? sdkModule.default?.init ?? sdkModule.default ?? sdkModule;
        if (typeof maybeInit === 'function') {
          // If it's a factory that returns a client
          sdkClient = maybeInit({ token, appName });
        } else {
          // If import returned a client directly
          sdkClient = sdkModule;
        }
        initialized = true;
        // expose session in dev for debugging
        try { if ((import.meta as any).env?.MODE !== 'production') { (window as any).__FLOWDAY_ANALYTICS__ = { sessionId }; } } catch {}
        // emit app-init
        try {
          const locale = navigator?.language ?? 'en';
          const platform = 'telegram';
          const payload: Record<string, unknown> = { sessionId, platform, locale };
          if (userId) payload.userId = userId;
          sdkClient?.track?.('app-init', payload);
        } catch { /* swallow */ }
      } catch { /* swallow */ }
    } catch { /* swallow import errors */ }
  } catch { /* never throw */ }
}

export function track(name: string, data?: Record<string, unknown>): void {
  try {
    if (!initialized || !sdkClient) return;
    const payload: Record<string, unknown> = { sessionId };
    if (userId) payload.userId = userId;
    if (data) Object.assign(payload, data);
    try { sdkClient.track?.(name, payload); } catch { /* swallow */ }
  } catch { /* swallow */ }
}

export function getSessionId(): string | null { return sessionId; }
