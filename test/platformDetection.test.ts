import { describe, it, expect } from 'vitest';
import { DEFAULT_PLATFORM, normalizePlatform, resolvePlatform } from '../src/app/platformDetection';

describe('normalizePlatform', () => {
  it('normalizes web desktop variants', () => {
    expect(normalizePlatform('web-desktop')).toBe('web/desktop');
    expect(normalizePlatform('Web/desktop')).toBe('web/desktop');
    expect(normalizePlatform('desktop')).toBe('web/desktop');
  });

  it('normalizes web mobile variants', () => {
    expect(normalizePlatform('web-mobile')).toBe('web/mobile');
    expect(normalizePlatform('mobile')).toBe('web/mobile');
  });

  it('normalizes telegram variants', () => {
    expect(normalizePlatform('telegram-ios')).toBe('telegram/ios');
    expect(normalizePlatform('tg android')).toBe('telegram/android');
    expect(normalizePlatform('telegram')).toBe('telegram/desktop');
  });
});

describe('resolvePlatform', () => {
  it('prefers explicit env override', () => {
    const result = resolvePlatform({ envPlatform: 'telegram-android' });
    expect(result).toBe('telegram/android');
  });

  it('detects telegram platform via hint', () => {
    const result = resolvePlatform({
      isTelegram: true,
      telegramPlatformHint: 'ios',
    });
    expect(result).toBe('telegram/ios');
  });

  it('detects telegram platform via search params', () => {
    const result = resolvePlatform({
      isTelegram: true,
      searchParams: '?tgWebAppPlatform=android',
    });
    expect(result).toBe('telegram/android');
  });

  it('falls back to telegram desktop when unknown', () => {
    const result = resolvePlatform({ isTelegram: true });
    expect(result).toBe('telegram/desktop');
  });

  it('detects mobile via userAgentData', () => {
    const result = resolvePlatform({ userAgentDataMobile: true });
    expect(result).toBe('web/mobile');
  });

  it('detects mobile via user agent string', () => {
    const result = resolvePlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X)' });
    expect(result).toBe('web/mobile');
  });

  it('detects mobile via touch points and width', () => {
    const result = resolvePlatform({ maxTouchPoints: 5, innerWidth: 768 });
    expect(result).toBe('web/mobile');
  });

  it('defaults to desktop web', () => {
    const result = resolvePlatform();
    expect(result).toBe(DEFAULT_PLATFORM);
  });
});
