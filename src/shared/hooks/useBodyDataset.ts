import { useEffect } from 'react';

export function useBodyDataset(name: string, value: string): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const { body } = document;
    if (!body) return;

    const dataset = body.dataset as Record<string, string | undefined>;
    const previous = dataset[name];
    dataset[name] = value;

    return () => {
      if (dataset[name] === value) {
        if (previous !== undefined) {
          dataset[name] = previous;
        } else {
          delete dataset[name];
        }
      }
    };
  }, [name, value]);
}

export default useBodyDataset;
