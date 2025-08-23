import { describe, it, expect } from 'vitest';
import { mergeByNewer } from '../src/lib/sync';
import type { Entry } from '../src/lib/types';

describe('mergeByNewer', () => {
  it('prefers newer updatedAt for same date', () => {
    const local: Entry[] = [ { date: '2025-01-01', emojis:['😀'], updatedAt: 1 } ];
    const incoming: Entry[] = [ { date: '2025-01-01', emojis:['🔥'], updatedAt: 2 } ];
    const merged = mergeByNewer(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].emojis).toEqual(['🔥']);
  });
  it('keeps newer local when incoming older', () => {
    const local: Entry[] = [ { date: '2025-01-01', emojis:['😀'], updatedAt: 5 } ];
    const incoming: Entry[] = [ { date: '2025-01-01', emojis:['🔥'], updatedAt: 2 } ];
    const merged = mergeByNewer(local, incoming);
    expect(merged[0].emojis).toEqual(['😀']);
  });
  it('sorts by date ascending', () => {
    const local: Entry[] = [ { date: '2025-01-02', emojis:['😀'], updatedAt:1 } ];
    const incoming: Entry[] = [ { date: '2025-01-01', emojis:['🔥'], updatedAt:1 } ];
    const merged = mergeByNewer(local, incoming);
    expect(merged.map(e=>e.date)).toEqual(['2025-01-01','2025-01-02']);
  });
});
