export type PlatformId =
  | 'web/desktop'
  | 'web/mobile'
  | 'telegram/ios'
  | 'telegram/android'
  | 'telegram/desktop';

export const DEFAULT_PLATFORM: PlatformId = 'web/desktop';

export interface PlatformSelectionContext {
  envPlatform?: string;
  userAgent?: string;
  userAgentDataMobile?: boolean;
  maxTouchPoints?: number;
  innerWidth?: number;
  searchParams?: string;
  isTelegram?: boolean;
  telegramPlatformHint?: string;
}

const TELEGRAM_SEARCH_PARAM = /tgwebappplatform=([^&]+)/i;

function extractTelegramPlatformFromSearch(search?: string): string | undefined {
  if (!search) return undefined;
  const match = search.match(TELEGRAM_SEARCH_PARAM);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1] ?? '').trim();
  } catch {
    return (match[1] ?? '').trim();
  }
}

function isLikelyMobile(context: PlatformSelectionContext): boolean {
  if (context.userAgentDataMobile) return true;

  const ua = context.userAgent?.toLowerCase() ?? '';
  if (ua) {
    if (/android/.test(ua) && /mobile/.test(ua)) return true;
    if (/iphone|ipod/.test(ua)) return true;
    if (/ipad/.test(ua)) return true;
    if (/windows phone|iemobile|wpdesktop/.test(ua)) return true;
    if (/blackberry|bb10/.test(ua)) return true;
    if (/opera mini/.test(ua)) return true;
  }

  if (typeof context.maxTouchPoints === 'number' && context.maxTouchPoints > 1) {
    const width = context.innerWidth ?? Number.POSITIVE_INFINITY;
    if (width <= 1024) return true;
  }

  return false;
}

function normalizeParts(parts: string[]): PlatformId | undefined {
  if (parts.length === 0) return undefined;
  const [first, second = ''] = parts;

  if (first === 'web') {
    if (second === 'mobile') return 'web/mobile';
    return 'web/desktop';
  }

  if (first === 'mobile' || first === 'phone') {
    return 'web/mobile';
  }

  if (first === 'desktop' || first === 'pc') {
    return 'web/desktop';
  }

  if (first === 'telegram' || first === 'tg') {
    const variant = second || 'desktop';
    if (variant === 'android') return 'telegram/android';
    if (variant === 'ios' || variant === 'iphone' || variant === 'ipad') return 'telegram/ios';
    if (variant === 'web' || variant === 'tdesktop' || variant === 'macos' || variant === 'windows' || variant === 'linux') {
      return 'telegram/desktop';
    }
    return 'telegram/desktop';
  }

  if (first === 'ios' || first === 'iphone' || first === 'ipad') {
    return 'telegram/ios';
  }

  if (first === 'android') {
    return 'telegram/android';
  }

  if (first === 'tdesktop' || first === 'macos' || first === 'windows' || first === 'linux') {
    return 'telegram/desktop';
  }

  return undefined;
}

export function normalizePlatform(raw: string | undefined | null): PlatformId | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  const parts = lowered.split(/[-_/\s]+/g).filter(Boolean);
  return normalizeParts(parts);
}

function resolveTelegramPlatform(context: PlatformSelectionContext): PlatformId {
  const hints: Array<string | undefined> = [
    context.telegramPlatformHint,
    extractTelegramPlatformFromSearch(context.searchParams),
  ];

  for (const hint of hints) {
    if (!hint) continue;
    const direct = normalizePlatform(hint);
    if (direct && direct.startsWith('telegram/')) {
      return direct;
    }
    const prefixed = normalizePlatform(`telegram ${hint}`);
    if (prefixed && prefixed.startsWith('telegram/')) {
      return prefixed;
    }
  }

  return 'telegram/desktop';
}

export function resolvePlatform(context: PlatformSelectionContext = {}): PlatformId {
  const envResolved = normalizePlatform(context.envPlatform);
  if (envResolved) {
    return envResolved;
  }

  if (context.isTelegram) {
    return resolveTelegramPlatform(context);
  }

  if (isLikelyMobile(context)) {
    return 'web/mobile';
  }

  return DEFAULT_PLATFORM;
}
