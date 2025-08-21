import { useMemo, useState, useEffect } from 'react';
import type { Entry } from '../lib/types';
import { emojiStats, clamp } from '../lib/utils';

export default function ConstellationsPage({ entries }: { entries: Entry[] }) {
  const { freq, pair } = useMemo(() => emojiStats(entries), [entries]);

  const MAX_NODES = 14;
  const topEmojis = useMemo(
    () => [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_NODES),
    [freq]
  );

  const nodePositions = useMemo(() => {
    const width = 360, height = 360;
    const cx = width / 2, cy = height / 2, R = 110;
    return topEmojis.map(([emo], i) => {
      const angle = (i / Math.max(1, topEmojis.length)) * Math.PI * 2;
      return { emo, x: Math.round(cx + R * Math.cos(angle)), y: Math.round(cy + R * Math.sin(angle)) };
    });
  }, [topEmojis]);

  const edges = useMemo(() => {
    const acc: { a: string; b: string; w: number }[] = [];
    for (const [key, w] of pair.entries()) {
      if (w < 1) continue; // include any co-mention at least once
      const [a, b] = key.split('__');
      const A = nodePositions.find(n => n.emo === a);
      const B = nodePositions.find(n => n.emo === b);
      if (A && B) acc.push({ a, b, w });
    }
    return acc;
  }, [pair, nodePositions]);

  const [focus, setFocus] = useState<string | null>(null);
  // Reset focus when dataset changes (e.g., year navigation)
  useEffect(()=>{ setFocus(null); }, [entries]);
  function edgeStyle(a: string, b: string, w: number) {
    // Only show edges when focused; weight subtly affects thickness
    const connected = focus != null && (focus === a || focus === b);
    return { op: connected ? 0.5 : 0, sw: connected ? clamp(1 + w * 0.6, 1, 4) : 0 };
  }

  const width = 360, height = 360;

  return (
    <div className="mx-auto max-w-sm px-4 h-full overflow-y-auto overscroll-contain touch-pan-y">
      <div className="mt-4 text-center text-sm text-white/80">Emoji Constellations</div>
      <div className="text-center text-xs text-white/50">Tap an emoji to highlight connections</div>

      <div className="relative mx-auto mt-3 rounded-xl border border-white/5 bg-black/30 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
             shapeRendering="geometricPrecision" textRendering="geometricPrecision">
          {/* Edges: only render when focused, and only those connected to focus */}
          {edges.map((e, idx) => {
            const A = nodePositions.find(n => n.emo === e.a)!;
            const B = nodePositions.find(n => n.emo === e.b)!;
            const { op, sw } = edgeStyle(e.a, e.b, e.w);
            if (op === 0) return null;
            return <line key={idx} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="white" strokeWidth={sw} opacity={op} />;
          })}

          {nodePositions.map((n) => {
            const count = freq.get(n.emo) || 1;
            const size = clamp(24 + count * 6, 24, 64); // visibly bigger and scales with mentions
            const active = focus === n.emo;
            return (
              <g key={n.emo} transform={`translate(${n.x}, ${n.y})`} onClick={() => setFocus(active ? null : n.emo)}
                 style={{ cursor: 'pointer' }}>
                {/* Remove gray circle; render emoji larger with subtle outline for contrast */}
                <text textAnchor="middle" dominantBaseline="central" fontSize={size}
                      stroke="black" strokeWidth={0.6} strokeOpacity={0.25}>{n.emo}</text>
                <text textAnchor="middle" dominantBaseline="central" fontSize={size}>{n.emo}</text>
              </g>
            );
          })}
        </svg>

        {focus && (
          <div className="mt-2 text-center text-xs text-white/70">
            <span className="mr-1">{focus}</span>
            <span>×{freq.get(focus) || 0}</span>
          </div>
        )}
      </div>
    </div>
  );
}