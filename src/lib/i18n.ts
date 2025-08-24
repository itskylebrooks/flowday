import { useState, useEffect } from 'react';
import en from '../i18n/en.json';
import ru from '../i18n/ru.json';
import de from '../i18n/de.json';

export type Lang = 'en' | 'ru' | 'de';

const tables: Record<Lang, Record<string, string>> = { en, ru, de };

let current: Lang = 'en';
try {
  const stored = localStorage.getItem('flowday_lang');
  if (stored && (stored === 'en' || stored === 'ru' || stored === 'de')) {
    current = stored;
  }
} catch {
  /* ignore */
}

const listeners = new Set<() => void>();

export function t(key: string): string {
  return tables[current][key] ?? tables.en[key] ?? key;
}

export function setLanguage(lang: Lang) {
  current = lang;
  try { localStorage.setItem('flowday_lang', lang); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export function useLanguage(): [Lang, (lang: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(current);
  useEffect(() => {
    const fn = () => setLangState(current);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return [lang, setLanguage];
}
