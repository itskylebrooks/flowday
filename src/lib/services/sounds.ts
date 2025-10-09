// Lightweight audio pooling helper for short UI sounds.
// Creates small pools of HTMLAudioElement instances so repeated plays can start immediately
// (avoids decode/unlock latency when reusing a single <audio> element).

type Pool = { els: HTMLAudioElement[]; idx: number };

const pools: { insert?: Pool; eject?: Pool } = {};

export function createCassettePool(insertSrc: string, ejectSrc: string, size = 5, volume = 0.55) {
  if (!pools.insert) {
    const p: Pool = { els: [], idx: 0 };
    for (let i = 0; i < size; i++) {
      const a = new Audio(insertSrc);
      a.preload = 'auto';
      a.volume = volume;
      // Some platforms require explicit load to begin decoding early
  try { a.load(); } catch { /* ignore load errors */ }
      p.els.push(a);
    }
    pools.insert = p;
  }
  if (!pools.eject) {
    const p: Pool = { els: [], idx: 0 };
    for (let i = 0; i < size; i++) {
      const a = new Audio(ejectSrc);
      a.preload = 'auto';
      a.volume = volume;
  try { a.load(); } catch { /* ignore load errors */ }
      p.els.push(a);
    }
    pools.eject = p;
  }
}

function playFrom(pool?: Pool) {
  if (!pool || pool.els.length === 0) return;
  const el = pool.els[pool.idx % pool.els.length];
  pool.idx = (pool.idx + 1) % pool.els.length;
  try {
    // Reset time and play. If play() returns a promise, catch rejections.
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.then === 'function') p.catch(() => { /* ignore */ });
  } catch {
    // Ignore playback errors
  }
}

export function playCassetteInsert() { playFrom(pools.insert); }
export function playCassetteEject() { playFrom(pools.eject); }
