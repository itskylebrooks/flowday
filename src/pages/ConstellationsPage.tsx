import { useMemo, useState } from 'react';
import type { Entry } from '../lib/types';
import { emojiStats } from '../lib/utils';

export default function ConstellationsPage({ entries }: { entries: Entry[] }) {
  const { freq, pair } = useMemo(() => emojiStats(entries), [entries]);

  const topEmojis = useMemo(
    () => [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
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
      if (w < 2) continue;
      const [a, b] = key.split('__');
      const A = nodePositions.find(n => n.emo === a);
      const B = nodePositions.find(n => n.emo === b);
      if (A && B) acc.push({ a, b, w });
    }
    return acc;
  }, [pair, nodePositions]);

  const [focus, setFocus] = useState<string | null>(null);
  function edgeStyle(a: string, b: string) {
    if (!focus) return { op: 0.18, sw: 0.8 };
    const connected = focus === a || focus === b;
    return { op: connected ? 0.45 : 0.06, sw: connected ? 1.6 : 0.6 };
  }

  const width = 360, height = 360;

  return (
    <div className="mx-auto max-w-sm px-4">
      <div className="mt-4 text-center text-sm text-white/80">Emoji Constellations</div>
      <div className="text-center text-xs text-white/50">Tap an emoji to highlight connections</div>

      <div className="relative mx-auto mt-3 rounded-xl border border-white/5 bg-black/30 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
             shapeRendering="geometricPrecision" textRendering="geometricPrecision">
          {edges.map((e, idx) => {
            const A = nodePositions.find(n => n.emo === e.a)!;
            const B = nodePositions.find(n => n.emo === e.b)!;
            const { op, sw } = edgeStyle(e.a, e.b);
            return <line key={idx} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="white" strokeWidth={sw} opacity={op} />;
          })}

          {nodePositions.map((n) => {
            const count = freq.get(n.emo) || 1;
            const size = 18 + count * 2;
            const active = focus === n.emo;
            return (
              <g key={n.emo} transform={`translate(${n.x}, ${n.y})`} onClick={() => setFocus(active ? null : n.emo)}
                 style={{ cursor: 'pointer' }}>
                <circle r={size / 2} fill="white" opacity={active ? 0.12 : 0.06} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={size}
                      stroke="white" strokeWidth={0.4} strokeOpacity={0.12}>{n.emo}</text>
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