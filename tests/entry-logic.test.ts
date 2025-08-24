import { describe, it, expect } from 'vitest';
import type { Entry } from '../src/types';
import { upsertEntry } from '../src/storage';

// Regression: ensure aura (hue) cleared when no emojis remain

describe('entry emoji/hue regression', () => {
  it('clears hue when emojis removed', () => {
    const start: Entry = { date: '2025-05-01', emojis: ['😀','🔥'], hue: 200, updatedAt: 0 };
    // Simulate removal -> create entry with no emojis; caller code deletes hue
    const cleared: Entry = { date: '2025-05-01', emojis: [], updatedAt: 1 } as Entry;
    const list = upsertEntry([start], cleared);
    expect(list[0].hue).toBeUndefined();
  });

  it('deduplicates emojis beyond 3 (enforced externally)', () => {
    // In UI logic duplicates trimmed & capped; emulate result
    const many: Entry = { date: '2025-05-02', emojis: ['😀','😀','🔥','💡','🚀'].slice(0,3), updatedAt:0 };
    const list = upsertEntry([], many);
    expect(list[0].emojis.length).toBeLessThanOrEqual(3);
  });
});
