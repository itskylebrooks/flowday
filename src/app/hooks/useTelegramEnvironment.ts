import { useEffect, useMemo, useState } from 'react';
import {
  disableVerticalSwipes,
  enableVerticalSwipes,
  isTelegram,
  setBackButton,
  telegramAccentColor,
} from '@lib/telegram';

type TelegramEnvironment = {
  isTelegram: boolean;
  accentColor?: string;
  platform?: string;
  headerOffset: number;
  footerOffset: number;
};

export const HEADER_HEIGHT = 56;
export const FOOTER_HEIGHT = 56;

export function useTelegramEnvironment(page: string) {
  const [isTelegramApp, setIsTelegramApp] = useState(false);
  const [accentColor, setAccentColor] = useState<string | undefined>();
  const [platform, setPlatform] = useState<string | undefined>();

  useEffect(() => {
    function poll() {
      const flag = isTelegram();
      setIsTelegramApp(flag);
      if (flag) {
        setAccentColor((prev) => prev ?? telegramAccentColor());
        try {
          const nextPlatform = (window as { Telegram?: { WebApp?: { platform?: string } } })
            .Telegram?.WebApp?.platform;
          if (nextPlatform && nextPlatform !== platform) {
            setPlatform(nextPlatform);
          }
        } catch {
          // ignore platform detection errors
        }
      }
    }

    poll();
    const interval = window.setInterval(poll, 500);
    return () => window.clearInterval(interval);
  }, [platform]);

  useEffect(() => {
    if (!isTelegramApp) return;
    setBackButton(false);
  }, [isTelegramApp]);

  useEffect(() => {
    if (!isTelegramApp) return;
    if (page === 'constellations') {
      disableVerticalSwipes();
      return () => enableVerticalSwipes();
    }
    enableVerticalSwipes();
    return undefined;
  }, [isTelegramApp, page]);

  const offsets = useMemo(() => {
    const headerOffset = isTelegramApp ? 8 : 0;
    const footerOffset = isTelegramApp && platform === 'ios' ? 20 : 0;
    return { headerOffset, footerOffset };
  }, [isTelegramApp, platform]);

  return {
    isTelegram: isTelegramApp,
    accentColor,
    platform,
    headerOffset: offsets.headerOffset,
    footerOffset: offsets.footerOffset,
  } satisfies TelegramEnvironment;
}
