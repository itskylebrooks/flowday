import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { addDays, todayISO, emojiStats, monthlyTop3, monthlyStops } from '../src/utils';
import { upsertEntry } from '../src/storage';
import type { Entry } from '../src/types';

// Helper to freeze todayISO by mocking Date
function mockToday(date: string) {
  const [y,m,d] = date.split('-').map(n=>parseInt(n,10));
  const base = new Date(Date.UTC(y, m-1, d));
  vi.setSystemTime(base);
}

describe('date helpers', () => {
  beforeAll(()=> {
    vi.useFakeTimers();
  });
  beforeEach(()=> {
    mockToday('2025-01-01');
  });

  it('addDays crosses month boundary Dec->Jan', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('addDays crosses leap-year Feb boundary', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('todayISO uses mocked date', () => {
    expect(todayISO()).toBe('2025-01-01');
  });
});

describe('emoji stats', () => {
  it('counts unique emojis per day (dedup same-day duplicates)', () => {
    const entries: Entry[] = [
      { date: '2025-01-01', emojis: ['😀','😀','🔥'], updatedAt: 0 },
      { date: '2025-01-02', emojis: ['😀','🔥','🔥'], updatedAt: 0 },
      { date: '2025-01-03', emojis: ['🔥'], updatedAt: 0 },
    ];
    const { freq, pair } = emojiStats(entries);
    // Unique counts per day: 😀 appears day1, day2; 🔥 appears day1, day2, day3
    expect(freq.get('😀')).toBe(2);
    expect(freq.get('🔥')).toBe(3);
    // Pair (😀,🔥) occurs on days 1 and 2 only
    expect(pair.get('😀__🔥')).toBe(2);
  });
});

describe('monthly hue selection', () => {
  beforeAll(()=> vi.useFakeTimers());
  beforeEach(()=> mockToday('2025-03-15'));

  it('returns defaults when empty month', () => {
    expect(monthlyStops([])).toEqual([220,300,40]);
    expect(monthlyTop3([])).toEqual([220,300,40]);
  });

  it('returns top clustered hues for current month', () => {
    // Spread hues around 30, 40, 35 -> cluster ~35
    const entries: Entry[] = [];
    const baseDates = ['2025-03-01','2025-03-02','2025-03-03','2025-03-04','2025-03-05'];
    const hues = [32, 40, 34, 210, 215, 220, 90];
    for (let i=0;i<baseDates.length;i++) {
      entries.push({ date: baseDates[i], emojis: ['😀'], hue: hues[i] ?? 30, updatedAt: 0 });
    }
    // Add more in 210 bin
    entries.push({ date: '2025-03-06', emojis:['😀'], hue: 208, updatedAt:0 });
    const result = monthlyTop3(entries, '2025-03');
    expect(result.length).toBeGreaterThan(0);
    // Ensure predominant hue families appear (approx)
    // We'll assert they are numbers within 0..360 and include something near 210.
    expect(result.some(h => h > 190 && h < 230)).toBe(true);
  });
});

describe('storage & upsert behaviors', () => {
  it('upsert inserts sorted by date', () => {
    const a: Entry = { date: '2025-01-02', emojis: [], updatedAt: 0 };
    const b: Entry = { date: '2025-01-01', emojis: [], updatedAt: 0 };
    const list = upsertEntry([a], b);
    expect(list.map(e=>e.date)).toEqual(['2025-01-01','2025-01-02']);
  });

  it('upsert replaces existing entry', () => {
    const a: Entry = { date: '2025-01-01', emojis: ['😀'], updatedAt: 0 };
    const updated: Entry = { date: '2025-01-01', emojis: ['🔥'], hue: 120, updatedAt: 1 };
    const list = upsertEntry([a], updated);
    expect(list).toHaveLength(1);
    expect(list[0].emojis).toEqual(['🔥']);
    expect(list[0].hue).toBe(120);
  });
});
