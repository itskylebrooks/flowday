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
