import { isTelegram } from '@shared/lib/services/telegram';

type PlatformId =
  | 'web-desktop'
  | 'web-mobile'
  | 'telegram-ios'
  | 'telegram-android'
  | 'telegram-desktop';

type BootstrapModule = { bootstrap: () => void | Promise<void> };

const PLATFORM_IMPORTS: Record<PlatformId, () => Promise<BootstrapModule>> = {
  'web-desktop': () => import('@platforms/web/desktop/bootstrap'),
  'web-mobile': () => import('@platforms/web/mobile/bootstrap'),
  'telegram-ios': () => import('@platforms/telegram/ios/bootstrap'),
  'telegram-android': () => import('@platforms/telegram/android/bootstrap'),
  'telegram-desktop': () => import('@platforms/telegram/desktop/bootstrap'),
};

function normalizePlatform(raw: string | undefined | null): PlatformId | 'auto' | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  switch (value) {
    case 'auto':
      return 'auto';
    case 'web-desktop':
    case 'web/desktop':
    case 'desktop-web':
    case 'desktop':
    case 'web':
      return 'web-desktop';
    case 'web-mobile':
    case 'mobile-web':
    case 'mobile':
    case 'web/mobile':
      return 'web-mobile';
    case 'telegram-ios':
    case 'tg-ios':
    case 'telegram/ios':
      return 'telegram-ios';
    case 'telegram-android':
    case 'tg-android':
    case 'telegram/android':
      return 'telegram-android';
    case 'telegram-desktop':
    case 'tg-desktop':
    case 'telegram':
    case 'telegram/desktop':
    case 'tg':
      return 'telegram-desktop';
    default:
      return undefined;
  }
}

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera || '';
  const mobileRegex = /android|iphone|ipad|ipod|windows phone|mobile|blackberry|opera mini/i;
  if (mobileRegex.test(ua)) {
    return true;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(max-width: 768px)').matches;
    } catch {
      return false;
    }
  }
  return false;
}

function detectTelegramPlatform(): PlatformId {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const platformParam = params.get('tgWebAppPlatform')?.toLowerCase();
      switch (platformParam) {
        case 'ios':
          return 'telegram-ios';
        case 'android':
          return 'telegram-android';
        case 'macos':
        case 'windows':
        case 'linux':
        case 'tdesktop':
        case 'webk':
        case 'web':
          return 'telegram-desktop';
        default:
          break;
      }
    } catch {
      // ignore and fallback to user-agent detection
    }
  }

  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) {
      return 'telegram-android';
    }
    if (/iphone|ipad|ipod/i.test(ua)) {
      return 'telegram-ios';
    }
  }

  return 'telegram-desktop';
}

function detectPlatform(): PlatformId {
  if (typeof window !== 'undefined' && isTelegram()) {
    return detectTelegramPlatform();
  }
  return isMobileBrowser() ? 'web-mobile' : 'web-desktop';
}

export async function loadPlatformApp(): Promise<void> {
  const rawTarget = import.meta.env.VITE_PLATFORM;
  const normalized = normalizePlatform(typeof rawTarget === 'string' ? rawTarget : undefined);
  const target = normalized === 'auto' || normalized === undefined ? detectPlatform() : normalized;
  const moduleLoader = PLATFORM_IMPORTS[target];
  const module = await moduleLoader();
  await module.bootstrap();
}
