import { useEffect, useMemo, useRef } from 'react';
import { hsl } from '../lib/utils';

export default function MonthFlow({ hues, empty=false, className = '' }: { hues: number[]; empty?: boolean; className?: string }) {
  const width = 320, height = 150;
  const pathRef = useRef<SVGPathElement | null>(null);
  const glowRef = useRef<SVGPathElement | null>(null);
  const maskPathRef = useRef<SVGPathElement | null>(null);
  const glitterRefs = useRef<SVGCircleElement[]>([]);

  // Build up to three gradients from hues
  const main = hues.slice(0, 3).map((h, i) => ({ color: hsl(h), offset: i / Math.max(1, hues.slice(0, 3).length - 1) }));
  // If single hue, add slight neighboring hues for subtle depth
  const stops = ((): Array<{ offset: number; color: string }> => {
    if (main.length >= 2) return main;
    const h = hues[0] ?? 220;
    return [hsl((h + 350) % 360), hsl(h), hsl((h + 10) % 360)].map((c, i) => ({ color: c, offset: i / 2 }));
  })();

  // Simple animation: horizontal phase shift to create flowing look
  const hueKey = useMemo(() => hues.join(','), [hues]);
  // Stable seeds for glitter
  const seedsRef = useRef<Array<{ y: number; r: number; phase: number; speed: number }>>([]);
  if (!seedsRef.current) {
    const N = 20;
    seedsRef.current = Array.from({ length: N }, () => ({
      y: Math.random(),
      r: 1 + Math.random() * 1.8,
      phase: Math.random(),
      speed: 0.02 + Math.random() * 0.05,
    }));
  }

  useEffect(() => {
    let raf = 0;
    let t = 0;
    const node = pathRef.current;
    const glow = glowRef.current;
    const maskNode = maskPathRef.current;
    if (!node || !maskNode) return;
  const W = width;
  const A = 22; // amplitude (consistent)
  const base = 72; // vertical base
  const N = 26; // segments
    const step = W / (N - 1);

    const draw = () => {
      t += 0.02;
      const top: string[] = [];
      for (let i = 0; i < N; i++) {
        const x = i * step;
        const p = (i / (N - 1)) * Math.PI * 2;
        const y = base + Math.sin(p + t) * A; // single harmonic for consistent wave
        top.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
      }
      const bottom = [...top].reverse().map((cmd) => {
        const [MOrL, rest] = [cmd[0], cmd.slice(1)];
        const [xStr, yStr] = rest.split(',');
        const x = Number(xStr);
        const y = Number(yStr);
        return `${MOrL}${x},${y + 44}`;
      });
      const dStr = [...top, ...bottom, 'Z'].join(' ');
      node.setAttribute('d', dStr);
      maskNode.setAttribute('d', dStr);
      glow?.setAttribute('d', dStr);

      // Glitter movement
      const seeds = seedsRef.current!;
      for (let i = 0; i < seeds.length; i++) {
        const el = glitterRefs.current[i];
        if (!el) continue;
        const s = seeds[i];
        const frac = (s.phase + t * s.speed) % 1;
        const x = 10 + frac * (W - 20);
        const y = base + (s.y - 0.5) * (A * 1.8) + Math.sin(t * 1.3 + i) * 2;
        el.setAttribute('cx', String(x));
        el.setAttribute('cy', String(y));
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [hueKey]);

  return (
    <svg className={'mx-auto block ' + className} viewBox={`0 0 ${width} ${height}`} width={width} height={height}
         shapeRendering="geometricPrecision">
      <defs>
        <linearGradient id="monthFlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          {empty ? (
            <>
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffffff" />
            </>
          ) : (
            stops.map((s, i) => (
              <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
            ))
          )}
        </linearGradient>
        {/* Soft glow to avoid strict borders */}
        <filter id="flowGlow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="10" result="blur" />
        </filter>
        {/* Glitter appearance */}
        <radialGradient id="glitterGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* Mask to clip glitter inside the wave */}
        <mask id="monthMask">
          <rect x="0" y="0" width={width} height={height} fill="black" />
          <path ref={maskPathRef} fill="white" />
        </mask>
      </defs>
      {/* Glow underlay */}
  <path ref={glowRef} fill={empty ? '#ffffff' : 'url(#monthFlowGrad)'} opacity={empty ? 0.15 : 0.35} filter="url(#flowGlow)" />
      {/* Main band */}
  <path ref={pathRef} fill={empty ? '#ffffff' : 'url(#monthFlowGrad)'} opacity={empty ? 0.9 : 0.96} />
      {/* Glitter layer */}
  <g style={{ mixBlendMode: 'screen' }} mask="url(#monthMask)">
        {Array.from({ length: seedsRef.current!.length }).map((_, i) => (
          <circle
            key={i}
            ref={(el) => { if (el) glitterRefs.current[i] = el; }}
            r={seedsRef.current![i].r}
    fill={empty ? '#ffffff' : 'url(#glitterGrad)'}
    opacity={empty ? 0.25 : 0.5}
          />
        ))}
      </g>
    </svg>
  );
}
