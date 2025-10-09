import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadEntries, saveEntries, upsertEntry } from '@lib/storage';
import type { Entry } from '@lib/types';
import { todayISO } from '@lib/utils';

type UseEntriesStateResult = {
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  entry: Entry;
  replaceEntry: (next: Entry) => void;
};

export function useEntriesState(activeDate: string): UseEntriesStateResult {
  const [entries, setEntries] = useState<Entry[]>(() => loadEntries());

  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

  const entry = useMemo(() => {
    const found = entries.find((e) => e.date === activeDate);
    if (found) return found;
    return { date: activeDate || todayISO(), emojis: [], updatedAt: Date.now() } satisfies Entry;
  }, [entries, activeDate]);

  const replaceEntry = useCallback(
    (next: Entry) => {
      setEntries((prev) => upsertEntry(prev, next));
    },
    [setEntries],
  );

  return { entries, setEntries, entry, replaceEntry };
}
