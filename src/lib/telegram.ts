// Lightweight Telegram WebApp SDK adapter (guarded; no identity/theme logic)
// All calls are no-ops outside Telegram Mini App context.

// Minimal structural typing so we don't depend on full SDK types
interface TelegramWebAppButton { show?:()=>void; hide?:()=>void; onClick?:(cb:()=>void)=>void; setText?:(t:string)=>void; }
interface TelegramHaptics { impactOccurred?:(style:string)=>void; }
interface TelegramWebAppLike {
  ready: () => void;
  expand?: () => void;
  BackButton?: TelegramWebAppButton;
  MainButton?: TelegramWebAppButton;
  HapticFeedback?: TelegramHaptics;
  disableVerticalSwipes?: () => void; // optional newer API
  enableVerticalSwipes?: () => void;  // complementary (if provided)
  themeParams?: { button_color?: string; button_text_color?: string; accent_text_color?: string; hint_color?: string };
}
export const tg = (): TelegramWebAppLike | undefined => (window as unknown as { Telegram?: { WebApp?: TelegramWebAppLike }}).Telegram?.WebApp;

export function initTelegram(){
  const t = tg();
  if (!t) return;
  try {
    t.ready();
    t.expand?.();
  } catch { /* ignore */ }
}

export function setBackButton(visible: boolean, onClick?: () => void){
  const t = tg(); if(!t) return;
  try {
    const btn = t.BackButton;
    if (btn) {
      if (visible) {
        if (btn.show) btn.show();
      } else {
        if (btn.hide) btn.hide();
      }
      if (onClick && btn.onClick) btn.onClick(onClick);
    }
  } catch { /* ignore */ }
}

export function setMainButton(text: string, onClick: () => void, visible = true){
  const t = tg(); if(!t) return;
  try {
  const mb = t.MainButton;
  if (!mb) return;
  if (mb.setText) mb.setText(text);
  if (mb.onClick) mb.onClick(onClick);
    if (visible) {
      if (mb.show) mb.show();
    } else {
      if (mb.hide) mb.hide();
    }
  } catch { /* ignore */ }
}

export function hapticLight(){
  try { tg()?.HapticFeedback?.impactOccurred?.('light'); } catch { /* ignore */ }
}

export function disableVerticalSwipes(){
  try { tg()?.disableVerticalSwipes?.(); } catch { /* ignore */ }
}

export function enableVerticalSwipes(){
  try { tg()?.enableVerticalSwipes?.(); } catch { /* ignore */ }
}

// Robust environment detection: ensures we're actually inside Telegram mini app
// rather than just having the SDK script loaded in a normal browser tab.
export function isTelegram(): boolean {
  try {
    const w = tg();
    if (!w) return false;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const hasQuery = /tgWebAppPlatform=/.test(search) || /tgWebAppVersion=/.test(search);
    const anyW = w as unknown as { initDataUnsafe?: { user?: { id?: number|string } } };
    const hasUser = !!anyW.initDataUnsafe?.user?.id;
    return hasQuery || hasUser;
  } catch { return false; }
}

export function telegramAccentColor(): string | undefined {
  try {
    const w = tg();
    if (!w) return undefined;
    const tp: { accent_text_color?: string; button_color?: string } | undefined = (w as { themeParams?: { accent_text_color?: string; button_color?: string } }).themeParams;
    if (!tp) return undefined;
    return tp.accent_text_color || tp.button_color || undefined;
  } catch { return undefined; }
}

// Prepared inline message share helper (Bot API 8.0+)
export function sharePreparedMessage(id: string) {
  try {
    (window as unknown as { Telegram?: { WebApp?: { shareMessage?: (id:string)=>void } } }).Telegram?.WebApp?.shareMessage?.(id);
  } catch { /* ignore */ }
}
