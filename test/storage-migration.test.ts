import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadEntries, saveEntries, STORAGE_KEY, CURRENT_VERSION } from '../src/lib/storage';

class LS { store: Record<string,string>={}; getItem(k:string){ return this.store[k]??null;} setItem(k:string,v:string){ this.store[k]=v;} removeItem(k:string){ delete this.store[k]; } }

// Attach mock global localStorage each test
beforeEach(()=> { // @ts-expect-error mock
  global.localStorage = new LS(); vi.useFakeTimers(); vi.setSystemTime(new Date('2025-08-22')); });

describe('versioned storage migration', () => {
  it('persists with wrapper & version', () => {
    saveEntries([{ date: '2025-08-20', emojis:['😀'], updatedAt: 1 }]);
    const raw = localStorage.getItem(STORAGE_KEY)!;
    const obj = JSON.parse(raw);
    expect(obj.version).toBe(CURRENT_VERSION);
    expect(Array.isArray(obj.entries)).toBe(true);
  });

  it('migrates legacy raw array (v0/v1) and self-heals', () => {
    const legacyKey = 'flowday_entries_v1';
    const legacy = [
      { date: '2025-08-21', emojis: ['😀','😀','🔥','🔥'], hue: 420, updatedAt: 0 },
      { date: 'bad-date', emojis:['😎'], updatedAt: 0 },
      { date: '2025-08-19', emojis: [], hue: 120, updatedAt: 0 },
      { date: '2025-08-18', emojis: [''], updatedAt: 0 },
    ];
    localStorage.setItem(legacyKey, JSON.stringify(legacy));
    const entries = loadEntries();
    // Should sanitize: first entry dedup emojis -> ['😀','🔥']; hue wrapped
    const first = entries.find(e=>e.date==='2025-08-21')!;
    expect(first.emojis).toEqual(['😀','🔥']);
    expect(first.hue).toBeGreaterThanOrEqual(0);
    expect(first.hue).toBeLessThan(360);
    // Entry with bad date removed
    expect(entries.some(e=>e.date==='bad-date')).toBe(false);
    // Entry with empty emojis & hue should have hue cleared
    const empty = entries.find(e=>e.date==='2025-08-19')!;
    expect(empty.emojis.length).toBe(0);
    expect(empty.hue).toBeUndefined();
    // Re-persisted in v2 wrapper
    const repairedRaw = localStorage.getItem(STORAGE_KEY)!;
    const repairedObj = JSON.parse(repairedRaw);
    expect(repairedObj.version).toBe(CURRENT_VERSION);
  });

  it('handles corrupt JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid');
    const list = loadEntries();
    expect(list).toEqual([]);
  });
});
