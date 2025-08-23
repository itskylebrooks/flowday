// Tiny in-memory rate limiter (best-effort; per-instance only)
// Not a security boundary — just dampens abuse bursts.
const lastCall = new Map<string, number>();

export function allow(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const prev = lastCall.get(key) || 0;
  if (now - prev < minIntervalMs) return false;
  lastCall.set(key, now);
  return true;
}
