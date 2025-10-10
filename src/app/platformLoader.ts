import { isTelegram } from '@shared/lib/services/telegram';
import { resolvePlatform, type PlatformId } from './platformDetection';

type BootstrapModule = { bootstrap: () => void | Promise<void> };

function getEnvPlatform(): string | undefined {
  const raw = import.meta.env.VITE_PLATFORM;
  return typeof raw === 'string' ? raw : undefined;
}

function getUserAgent(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.userAgent;
}

function getUserAgentDataMobile(): boolean | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const data = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof data?.mobile === 'boolean') {
    return data.mobile;
  }
  return undefined;
}

function getMaxTouchPoints(): number | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const value = navigator.maxTouchPoints;
  return typeof value === 'number' ? value : undefined;
}

function getInnerWidth(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = window.innerWidth;
  return typeof value === 'number' ? value : undefined;
}

function getSearchParams(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location?.search;
}

function getTelegramPlatformHint(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = (window as unknown as { Telegram?: { WebApp?: { platform?: string } } }).Telegram?.WebApp?.platform;
    return typeof raw === 'string' ? raw : undefined;
  } catch {
    return undefined;
  }
}

async function importPlatformBootstrap(platform: PlatformId): Promise<BootstrapModule> {
  switch (platform) {
    case 'web/mobile':
      return import('@platforms/web/mobile/bootstrap');
    case 'telegram/ios':
      return import('@platforms/telegram/ios/bootstrap');
    case 'telegram/android':
      return import('@platforms/telegram/android/bootstrap');
    case 'telegram/desktop':
      return import('@platforms/telegram/desktop/bootstrap');
    case 'web/desktop':
    default:
      return import('@platforms/web/desktop/bootstrap');
  }
}

function determinePlatform(): PlatformId {
  const context = {
    envPlatform: getEnvPlatform(),
    userAgent: getUserAgent(),
    userAgentDataMobile: getUserAgentDataMobile(),
    maxTouchPoints: getMaxTouchPoints(),
    innerWidth: getInnerWidth(),
    searchParams: getSearchParams(),
    isTelegram: typeof window !== 'undefined' ? isTelegram() : false,
    telegramPlatformHint: getTelegramPlatformHint(),
  };
  return resolvePlatform(context);
}

export async function loadPlatformApp(): Promise<void> {
  const targetPlatform = determinePlatform();
  const module = await importPlatformBootstrap(targetPlatform);
  await module.bootstrap();
}
