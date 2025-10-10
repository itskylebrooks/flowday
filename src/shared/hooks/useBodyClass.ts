import { useEffect } from 'react';

export function useBodyClass(className: string): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const { body } = document;
    if (!body) return;

    body.classList.add(className);
    return () => {
      body.classList.remove(className);
    };
  }, [className]);
}

export default useBodyClass;
