import { describe, it, expect, beforeEach } from 'vitest';
import { loadEntries, STORAGE_KEY } from '../src/lib/storage';

describe('storage migration', () => {
  beforeEach(() => {
    // Clear jsdom localStorage before each test
    localStorage.clear();
  });

  it('migrates legacy raw array (v1/v0) into current v2 key and removes legacy key', () => {
    const legacyKey = 'flowday_entries_v1';
    const payload = [
      { date: '2025-02-01', emojis: ['😀'], updatedAt: 123 },
      { date: 'not-a-date', emojis: ['x'], updatedAt: 1 }, // invalid and should be ignored
    ];
    localStorage.setItem(legacyKey, JSON.stringify(payload));

    const migrated = loadEntries();
    // Only the valid entry remains
    expect(migrated).toHaveLength(1);
    expect(migrated[0].date).toBe('2025-02-01');

    // The current storage key should now exist and be versioned
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.version).toBe(2);
    expect(Array.isArray(parsed.entries)).toBe(true);

    // Legacy key should have been removed
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });
});
