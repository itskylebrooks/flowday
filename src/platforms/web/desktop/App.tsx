import { useEffect, useMemo, useState } from 'react';
import DesktopApp from './DesktopApp';
import LegacyApp from './LegacyApp';
import { isTelegram, tg } from '@shared/lib/services/telegram';

type PlatformVariant = 'web-desktop' | 'web-mobile' | 'telegram-ios' | 'telegram-android' | 'telegram-desktop';

type EnvLike = { VITE_PLATFORM?: string };

function normalizeTelegramPlatform(raw: string | undefined): PlatformVariant {
  const value = (raw || '').toLowerCase();
  if (value.includes('ios')) return 'telegram-ios';
  if (value.includes('android')) return 'telegram-android';
  if (value.includes('mac') || value.includes('tdesktop') || value.includes('desktop') || value.includes('win')) {
    return 'telegram-desktop';
  }
  if (value.includes('web')) return 'telegram-desktop';
  return 'telegram-desktop';
}

const PLATFORM_OVERRIDES: Record<string, PlatformVariant> = {
  'web-desktop': 'web-desktop',
  'desktop': 'web-desktop',
  'web/mobile': 'web-mobile',
  'web-mobile': 'web-mobile',
  'mobile': 'web-mobile',
  'telegram': 'telegram-android',
  'telegram-android': 'telegram-android',
  'telegram/ios': 'telegram-ios',
  'telegram-ios': 'telegram-ios',
  'telegram-desktop': 'telegram-desktop',
  'telegram/web': 'telegram-desktop',
};

function readEnvPlatform(): PlatformVariant | null {
  if (typeof import.meta === 'undefined') return null;
  const env = (import.meta as unknown as { env?: EnvLike }).env;
  const raw = env?.VITE_PLATFORM;
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key in PLATFORM_OVERRIDES) return PLATFORM_OVERRIDES[key];
  if (key.startsWith('telegram')) return normalizeTelegramPlatform(raw);
  if (key === 'web' || key === 'web/desktop') return 'web-desktop';
  return null;
}

const FORCED_PLATFORM = readEnvPlatform();

function detectTelegramVariant(): PlatformVariant {
  try {
    const platform = (tg() as { platform?: string } | undefined)?.platform;
    return normalizeTelegramPlatform(platform);
  } catch {
    return 'telegram-desktop';
  }
}

function isProbablyMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const narrow = typeof window.innerWidth === 'number' && window.innerWidth < 960;
  return coarse || narrow;
}

function detectRuntimePlatform(): PlatformVariant {
  if (FORCED_PLATFORM) return FORCED_PLATFORM;
  if (typeof window === 'undefined') return 'web-desktop';
  if (isTelegram()) {
    return detectTelegramVariant();
  }
  const navigatorLike = window.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const ua = (navigatorLike.userAgent || navigatorLike.vendor || '').toLowerCase();
  const isMobileUA = /iphone|ipod|android|blackberry|bb10|windows phone|mobile/.test(ua);
  const isTabletUA = /ipad|tablet/.test(ua);
  if (navigatorLike.userAgentData?.mobile) return 'web-mobile';
  if (isMobileUA || isTabletUA) return 'web-mobile';
  if (isProbablyMobileViewport()) return 'web-mobile';
  return 'web-desktop';
}

export default function App() {
  const [platform, setPlatform] = useState<PlatformVariant>(() => detectRuntimePlatform());
  const isDesktopExperience = useMemo(() => platform === 'web-desktop' && !platform.startsWith('telegram'), [platform]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.platformVariant = platform;
    }
  }, [platform]);

  useEffect(() => {
    if (FORCED_PLATFORM) return;
    if (typeof window === 'undefined') return;
    let frame = 0;
    const update = () => {
      setPlatform(prev => {
        const next = detectRuntimePlatform();
        return prev === next ? prev : next;
      });
    };
    const handleResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener('resize', handleResize);
    const interval = window.setInterval(update, 1200);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.clearInterval(interval);
      cancelAnimationFrame(frame);
    };
  }, []);

  if (isDesktopExperience) {
    return <DesktopApp />;
  }
  return <LegacyApp />;
}
