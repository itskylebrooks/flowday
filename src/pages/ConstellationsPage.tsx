import { useMemo, useState, useEffect, useRef } from 'react';
import type { Entry } from '../lib/types';
import { emojiStats, clamp, last7, isToday, todayISO, hsl } from '../lib/utils';

export default function ConstellationsPage({ entries, yearKey }: { entries: Entry[]; yearKey?: string }) {
  const { freq, pair } = useMemo(() => emojiStats(entries), [entries]);

  const MAX_NODES = 14;
  const topEmojis = useMemo(
    () => [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_NODES),
    [freq]
  );

  // Force-directed layout state (kept outside React state for perf)
  interface SimNode { emo: string; x: number; y: number; vx: number; vy: number; r: number; }
  interface SimEdge { a: number; b: number; w: number; }
  // Canvas dimensions (slightly smaller to reduce footprint)
  const CANVAS_SIZE = 325;
  const width = CANVAS_SIZE, height = CANVAS_SIZE;
  const NODE_PADDING = 24; // desired padding from edge (in px)
  // Allow nodes to be dragged slightly beyond the visible canvas (px)
  const CANVAS_OVERFLOW = 48;
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const frameRef = useRef<number | null>(null);
  const [, setTick] = useState(0); // trigger rerender without reading value
  // View transform (pan + zoom)
  // View transform + animation targets
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1, targetTx: 0, targetTy: 0, targetScale: 1 });
  const panDragRef = useRef<{startX:number; startY:number; startTx:number; startTy:number; active:boolean} | null>(null);
  const momentumRef = useRef<{vx:number; vy:number; active:boolean}>({ vx:0, vy:0, active:false });
  const lastPanSampleRef = useRef<{x:number; y:number; t:number} | null>(null);
  const svgElRef = useRef<SVGSVGElement | null>(null);
  // Multi-touch pinch state
  const touchesRef = useRef<Map<number, {x:number; y:number}>>(new Map());
  const pinchRef = useRef<{
    active: boolean;
    initialDist: number;
    initialScale: number;
    anchorWorld: { x: number; y: number };
    anchorScreen: { x: number; y: number };
  }>({ active: false, initialDist: 0, initialScale: 1, anchorWorld: { x:0, y:0 }, anchorScreen: { x:0, y:0 } });

  // (Re)initialize simulation when top emojis change
  useEffect(() => {
    // Precompute sizes (frequency -> size) so we can respect bounds fully (size/2 + padding)
    const sized = topEmojis.map(([emo]) => {
      const count = freq.get(emo) || 1;
      const size = clamp(24 + count * 6, 24, 64); // keep logic in sync w/ render
      return { emo, size };
    });
    const maxRadius = sized.reduce((m, s) => Math.max(m, s.size / 2), 0);
    const R = Math.max(10, Math.min(width, height) / 2 - maxRadius - NODE_PADDING);
    const cx = width / 2, cy = height / 2;
    const nodes: SimNode[] = sized.map((s, i, arr) => {
      const angle = (i / Math.max(1, arr.length)) * Math.PI * 2; // protect divide by 0
      const x = cx + R * Math.cos(angle);
      const y = cy + R * Math.sin(angle);
      return { emo: s.emo, x, y, vx: 0, vy: 0, r: s.size / 2 };
    });
    // Build edges from pair counts referencing node indices
    const indexByEmoji = new Map(nodes.map((n, i) => [n.emo, i] as const));
    const edges: SimEdge[] = [];
    for (const [key, w] of pair.entries()) {
      if (w < 1) continue;
      const [a, b] = key.split('__');
      const ia = indexByEmoji.get(a); const ib = indexByEmoji.get(b);
      if (ia != null && ib != null) edges.push({ a: ia, b: ib, w });
    }
    nodesRef.current = nodes;
    edgesRef.current = edges;
    // Force immediate render so stale nodes disappear (important when becoming empty)
    setTick(t=>t+1);
  }, [topEmojis, pair, freq, width, height]);

  // Reset view transform when entries dataset changes (year navigation)
  useEffect(()=> {
    const v = viewRef.current;
    v.tx = 0; v.ty = 0; v.scale = 1;
    v.targetTx = 0; v.targetTy = 0; v.targetScale = 1;
    momentumRef.current.active = false;
  }, [entries]);

  // Drag handling
  const draggingRef = useRef<{ index: number; px: number; py: number; moved: boolean } | null>(null);

  function svgToWorld(clientX: number, clientY: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const { tx, ty, scale } = viewRef.current;
    const x = (clientX - rect.left - tx) / scale;
    const y = (clientY - rect.top - ty) / scale;
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent<SVGGElement>, index: number) {
    e.stopPropagation();
    // If a pinch is in progress or a second touch begins, disable node dragging
    if (e.pointerType === 'touch' && touchesRef.current.size > 0) return;
    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
    const { x, y } = svgToWorld(e.clientX, e.clientY, svg);
    draggingRef.current = { index, px: x, py: y, moved: false };
    (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
  // Cancel momentum when grabbing a node
  momentumRef.current.active = false;
  }
  function onPointerMove(e: React.PointerEvent<SVGGElement>) {
    if (!draggingRef.current) return;
    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
    const { x: nx, y: ny } = svgToWorld(e.clientX, e.clientY, svg);
    const d = draggingRef.current;
    if (Math.abs(nx - d.px) + Math.abs(ny - d.py) > 2) d.moved = true;
    const node = nodesRef.current[d.index];
    // allow dragging slightly beyond the visible canvas using CANVAS_OVERFLOW
    node.x = clamp(nx, node.r + NODE_PADDING - CANVAS_OVERFLOW, width - (node.r + NODE_PADDING) + CANVAS_OVERFLOW);
  node.y = clamp(ny, node.r + NODE_PADDING - CANVAS_OVERFLOW, height - (node.r + NODE_PADDING) + CANVAS_OVERFLOW);
    node.vx = 0; node.vy = 0;
    setTick(t => t + 1);
  }
  function onPointerUp(_: React.PointerEvent<SVGGElement>, emo: string) {
    if (!draggingRef.current) return;
    const d = draggingRef.current;
    draggingRef.current = null;
    if (!d.moved) {
      setFocus(f => f === emo ? null : emo);
    }
  }

  // Physics simulation loop
  useEffect(() => {
    let last = performance.now();
    const nodes = nodesRef.current;
    if (!nodes.length) { // still trigger a repaint for empty state, but no loop
      setTick(t=>t+1);
      return;
    }
    function step(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const view = viewRef.current;
      // Skip physics while dragging to keep node under pointer
      if (!draggingRef.current) {
        // Reset small accumulative force (implicit in velocity updates)
        // Repulsion (naive O(n^2), fine for <=14 nodes)
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            let dx = a.x - b.x; let dy = a.y - b.y; let dist2 = dx*dx + dy*dy;
            if (dist2 < 1) { dx = (Math.random()-0.5); dy = (Math.random()-0.5); dist2 = dx*dx + dy*dy; }
            const dist = Math.sqrt(dist2);
            const rep = 2200 / dist2; // repulsion constant
            const fx = (dx / dist) * rep;
            const fy = (dy / dist) * rep;
            a.vx += fx * dt; a.vy += fy * dt;
            b.vx -= fx * dt; b.vy -= fy * dt;
          }
        }
        // Spring attraction for co-usage
        for (const e of edges) {
          const a = nodes[e.a], b = nodes[e.b];
            const dx = b.x - a.x; const dy = b.y - a.y; const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
            const base = 150; const factor = 18; const minL = 40;
            const target = clamp(base - e.w * factor, minL, base);
            const k = 0.15; // spring stiffness
            const f = k * (dist - target);
            const fx = (dx / dist) * f;
            const fy = (dy / dist) * f;
            a.vx += fx * dt; a.vy += fy * dt;
            b.vx -= fx * dt; b.vy -= fy * dt;
        }
        // Integrate
        for (const n of nodes) {
          n.vx *= 0.9; n.vy *= 0.9; // friction
          n.x += n.vx * 60 * dt; // scale velocities for visual speed
          n.y += n.vy * 60 * dt;
          // bounds
          const minX = n.r + NODE_PADDING - CANVAS_OVERFLOW;
          const maxX = width - (n.r + NODE_PADDING) + CANVAS_OVERFLOW;
          const minY = n.r + NODE_PADDING - CANVAS_OVERFLOW;
          const maxY = height - (n.r + NODE_PADDING) + CANVAS_OVERFLOW;
          if (n.x < minX) { n.x = minX; n.vx *= -0.4; }
          if (n.x > maxX) { n.x = maxX; n.vx *= -0.4; }
          if (n.y < minY) { n.y = minY; n.vy *= -0.4; }
          if (n.y > maxY) { n.y = maxY; n.vy *= -0.4; }
        }
      }
      // View interpolation for smooth zoom / pan
      const lerp = (a:number,b:number,t:number)=> a + (b-a)*t;
      // If user directly changed scale/tx/ty (wheel/pinch), sync targets
      if (Math.abs(view.scale - view.targetScale) < 0.0001) view.targetScale = view.scale;
      if (Math.abs(view.tx - view.targetTx) < 0.0001) view.targetTx = view.tx;
      if (Math.abs(view.ty - view.targetTy) < 0.0001) view.targetTy = view.ty;

      // Momentum (in px/ms) -> integrate to target positions
      if (momentumRef.current.active) {
        // convert px/ms to px/frame using dt (sec) *1000
        view.targetTx += momentumRef.current.vx * dt * 1000;
        view.targetTy += momentumRef.current.vy * dt * 1000;
        // Decay velocity
        const decay = Math.pow(0.05, dt); // fast-ish decay
        momentumRef.current.vx *= decay;
        momentumRef.current.vy *= decay;
        if (Math.hypot(momentumRef.current.vx, momentumRef.current.vy) < 0.005) {
          momentumRef.current.active = false;
        }
      }

      // Smooth approach
      const ease = 1 - Math.pow(0.001, dt); // time-scale invariant smoothing
      view.scale = lerp(view.scale, view.targetScale, ease*0.9);
      view.tx = lerp(view.tx, view.targetTx, ease);
      view.ty = lerp(view.ty, view.targetTy, ease);

      // Update view (throttle - every frame for smoothness with small node count)
      setTick(t => t + 1);
      frameRef.current = requestAnimationFrame(step);
    }
    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [topEmojis, width, height]);

  const nodes = nodesRef.current;
  const edges = edgesRef.current;

  const [focus, setFocus] = useState<string | null>(null);
  // Reset focus when dataset changes (e.g., year navigation)
  useEffect(()=>{ setFocus(null); }, [entries]);
  function edgeStyle(a: string, b: string, w: number) {
    // Only show edges when focused; weight subtly affects thickness
    const connected = focus != null && (focus === a || focus === b);
    return { op: connected ? 0.5 : 0, sw: connected ? clamp(1 + w * 0.6, 1, 4) : 0 };
  }

  // Visual helpers: recency -> radius/opacity, hue -> fill
  function daysBetween(aIso: string, bIso: string) {
    const a = new Date(aIso + 'T00:00:00');
    const b = new Date(bIso + 'T00:00:00');
    const ms = Math.abs(a.getTime() - b.getTime());
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }
  function recencyToScaleOpacity(daysAgo: number) {
    // newer -> slightly bigger & brighter; older -> smaller & faded
    const scale = clamp(1.15 - daysAgo * 0.01, 0.6, 1.15);
    const opacity = clamp(1 - daysAgo * 0.03, 0.25, 1);
    return { scale, opacity };
  }
  function hueToFill(h?: number, alpha = 1) {
    if (typeof h !== 'number') return hsl(220, 14, 60, alpha * 0.9); // fallback bluish
    return hsl(Math.round(h), 85, 58, alpha);
  }

  // Build helper maps: last used date & representative hue per emoji
  const lastUsed = useMemo(() => {
    const map = new Map<string, { date: string; hue?: number }>();
    for (const e of entries) {
      for (const emo of Array.from(new Set(e.emojis))) {
        const cur = map.get(emo);
        if (!cur || e.date > cur.date) map.set(emo, { date: e.date, hue: e.hue });
      }
    }
    return map;
  }, [entries]);

  // Which emojis appeared in the most recent 7 days (for soft teal glow)
  const recent7Emojis = useMemo(() => new Set<string>(last7(entries).flatMap(e => e.emojis)), [entries]);
  const todayIso = todayISO();

  // width/height defined earlier

  // Wheel zoom handler
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const svg = e.currentTarget;
  // Determine world coords at cursor to anchor zoom
  const v = viewRef.current;
  const zoomFactor = Math.exp(-e.deltaY * 0.0015); // smooth exponential zoom
  const newScale = clamp(v.scale * zoomFactor, 0.55, 2.75);
    // Keep point (x,y) under cursor stable: tx' = cx - x*scale'
  // We only used x above; recalc world y to avoid extra variable warning
  const world = svgToWorld(e.clientX, e.clientY, svg);
  v.tx = e.clientX - svg.getBoundingClientRect().left - world.x * newScale;
  v.ty = e.clientY - svg.getBoundingClientRect().top - world.y * newScale;
    v.scale = newScale;
  // Keep targets in sync so animation loop doesn't fight wheel zoom
  v.targetScale = v.scale;
  v.targetTx = v.tx;
  v.targetTy = v.ty;
    setTick(t=>t+1);
  }

  // Background pan handlers on outer svg (not on nodes)
  function onBgPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    // Track touches for pinch
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchesRef.current.size === 2) {
      // Initiate pinch
      const arr = [...touchesRef.current.values()];
      const dx = arr[0].x - arr[1].x; const dy = arr[0].y - arr[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const midpoint = { x: (arr[0].x + arr[1].x)/2, y: (arr[0].y + arr[1].y)/2 };
      const world = svgToWorld(midpoint.x, midpoint.y, svg);
      const v = viewRef.current;
      pinchRef.current = {
        active: true,
        initialDist: dist,
        initialScale: v.scale,
        anchorWorld: world,
        anchorScreen: midpoint
      };
      panDragRef.current = null; // cancel any pan
    } else if (touchesRef.current.size === 1) {
      // Start panning only if single pointer and not dragging a node
      if (draggingRef.current) return;
      const v = viewRef.current;
      panDragRef.current = { startX: e.clientX, startY: e.clientY, startTx: v.tx, startTy: v.ty, active: true };
      momentumRef.current.active = false; // cancel existing inertia
      lastPanSampleRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
    svg.setPointerCapture(e.pointerId);
  }
  function onBgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    if (touchesRef.current.has(e.pointerId)) {
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // Pinch handling
    const pinch = pinchRef.current;
    if (pinch.active && touchesRef.current.size >= 2) {
      const arr = [...touchesRef.current.values()].slice(0,2);
      const dx = arr[0].x - arr[1].x; const dy = arr[0].y - arr[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const v = viewRef.current;
      const scale = clamp(pinch.initialScale * (dist / pinch.initialDist), 0.55, 2.75);
      v.scale = scale;
      // Keep anchor world point fixed at original screen midpoint.
      const rect = svg.getBoundingClientRect();
      v.tx = pinch.anchorScreen.x - rect.left - pinch.anchorWorld.x * scale;
      v.ty = pinch.anchorScreen.y - rect.top - pinch.anchorWorld.y * scale;
  // Sync targets to avoid interpolation snapping back
  v.targetScale = v.scale;
  v.targetTx = v.tx;
  v.targetTy = v.ty;
      setTick(t=>t+1);
      return; // don't also pan
    }
    // Pan (single pointer, no pinch, no node drag)
    const d = panDragRef.current; if (d && d.active && !pinch.active) {
      const v = viewRef.current;
      const nx = d.startTx + (e.clientX - d.startX);
      const ny = d.startTy + (e.clientY - d.startY);
      v.tx = v.targetTx = nx;
      v.ty = v.targetTy = ny;
      const now = performance.now();
      const last = lastPanSampleRef.current;
      if (last && now - last.t > 12) {
        // compute velocity in px/ms
        momentumRef.current.vx = (e.clientX - last.x) / (now - last.t);
        momentumRef.current.vy = (e.clientY - last.y) / (now - last.t);
        lastPanSampleRef.current = { x: e.clientX, y: e.clientY, t: now };
      }
      setTick(t=>t+1);
    }
  }
  function onBgPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    touchesRef.current.delete(e.pointerId);
    if (touchesRef.current.size < 2 && pinchRef.current.active) {
      pinchRef.current.active = false; // end pinch
    }
    if (panDragRef.current) {
      // Launch inertia if velocity significant
      const last = lastPanSampleRef.current;
      const now = performance.now();
      if (last) {
        const dt = now - last.t;
        if (dt < 80) {
          const vx = momentumRef.current.vx;
          const vy = momentumRef.current.vy;
          const speed = Math.hypot(vx, vy);
          if (speed > 0.02) { // threshold px/ms
            momentumRef.current.active = true;
          }
        }
      }
      panDragRef.current.active = false;
      lastPanSampleRef.current = null;
    }
  }

  const { tx, ty, scale } = viewRef.current;

  return (
    <div className="mx-auto max-w-sm px-4 h-full select-none" style={{overflow:'hidden', touchAction:'none'}}>
      <div className="mt-4 text-center text-sm text-white/80">Emoji Constellations</div>
      <div className="text-center text-xs text-white/50">Tap an emoji to highlight connections</div>
      {/* Animated canvas wrapper only */}
  <div key={yearKey} className="relative mx-auto mt-3 rounded-xl border border-white/5 bg-black/30 p-3 animate-fadeSwap fd-constellation-backdrop" style={{touchAction:'none'}}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
          style={{ userSelect:'none', touchAction:'none', cursor: panDragRef.current? 'grabbing':'grab' }}
          onWheel={onWheel}
          onPointerDown={onBgPointerDown}
          onPointerMove={onBgPointerMove}
          onPointerUp={onBgPointerUp}
          ref={el=> { svgElRef.current = el; }}
        >
          <defs>
            <filter id="fd-blur" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          {/* Edges: only render when focused, and only those connected to focus */}
          {edges.map((e, idx) => {
            const A = nodes[e.a]; const B = nodes[e.b];
            const { op, sw } = edgeStyle(A.emo, B.emo, e.w);
            // bright grey connecting lines, thin stroke; opacity controlled by focus
            return <line key={idx} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke={'rgba(230,230,230,0.95)'} strokeWidth={sw || 0.8} opacity={op}
              className="edge-line" data-connected={op>0} />;
          })}

  {nodes.map((n, idx) => {
        const count = freq.get(n.emo) || 1;
        const size = clamp(24 + count * 6, 24, 64);
        const last = lastUsed.get(n.emo);
        const daysAgo = last ? daysBetween(todayIso, last.date) : 999;
        const { scale: recScale, opacity: recOp } = recencyToScaleOpacity(daysAgo);
        const fill = hueToFill(last?.hue, 0.95);
        const isRecent7 = recent7Emojis.has(n.emo);
        const isTodayStar = last?.date === todayIso;
  const circleR = Math.max(12, (size / 2) * recScale * 1.22);
        return (
          <g key={n.emo} transform={`translate(${n.x}, ${n.y})`}
             onPointerDown={(e) => onPointerDown(e, idx)}
             onPointerMove={onPointerMove}
             onPointerUp={(e) => onPointerUp(e, n.emo)}
             style={{ cursor: 'pointer', pointerEvents:'auto' }}>
            {/* soft blurred backdrop for star (larger, blurred for smooth edges) */}
            <circle r={circleR * 1.33} fill={fill} opacity={recOp * 0.36} filter="url(#fd-blur)" />
            {/* crisp colored circle on top */}
            <circle r={circleR} fill={fill} opacity={recOp * 0.6}
              style={{ mixBlendMode: 'screen', filter: isRecent7 ? 'drop-shadow(0 0 8px rgba(64,201,186,0.45))' : undefined }} />
            {/* subtle outline only for today's star (white) */}
            {isTodayStar && (
              <circle r={circleR + 1} fill="none" stroke={'rgba(255,255,255,0.95)'} strokeWidth={1.1} />
            )}
            {/* Emoji text on top */}
            <text textAnchor="middle" dominantBaseline="central" fontSize={size}
                  stroke="black" strokeWidth={0.6} strokeOpacity={0.25} style={{ opacity: recOp }}>{n.emo}</text>
            <text textAnchor="middle" dominantBaseline="central" fontSize={size} style={{ opacity: recOp }}>{n.emo}</text>
            {/* one-shot pulse for today */}
            {isTodayStar && (
              <circle r={circleR + 2} fill="none" stroke={'rgba(255,255,255,0.9)'} strokeWidth={1.2}
                className="fd-pulse-once" />
            )}
          </g>
        );
      })}
      </g>
        </svg>
        {nodes.length===0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-label="No data yet">
            <div className="font-poster text-white/18" style={{ fontSize: 170, lineHeight: 1 }}>?</div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-xs font-medium select-none" style={{minHeight:'14px'}}>
          {focus ? (
            <span className="inline-flex items-center justify-center rounded-full bg-black/40 px-2 py-0.5 text-white/80 backdrop-blur-sm border border-white/10">
              <span className="mr-1">{focus}</span>
              <span>×{freq.get(focus) || 0}</span>
            </span>
          ) : (
            // Invisible placeholder to keep height stable
            <span className="opacity-0">placeholder</span>
          )}
        </div>
      </div>

      {/* Zoom Controls */}
  <ConstellationControls width={width} onAction={(action)=>{
        const v = viewRef.current;
        const svg = svgElRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const centerScreenX = rect.left + rect.width/2;
        const centerScreenY = rect.top + rect.height/2;
        if (action === 'reset') {
          v.targetScale = 1;
          v.targetTx = 0;
          v.targetTy = 0;
          setTick(t=>t+1);
          return;
        }
        const factor = action === 'in' ? 1.25 : 1/1.25;
        const targetScale = clamp(v.scale * factor, 0.55, 2.75);
        // Maintain center anchor
        const worldCx = (centerScreenX - rect.left - v.tx) / v.scale;
        const worldCy = (centerScreenY - rect.top - v.ty) / v.scale;
        v.targetScale = targetScale;
        v.targetTx = (centerScreenX - rect.left) - worldCx * targetScale;
        v.targetTy = (centerScreenY - rect.top) - worldCy * targetScale;
        setTick(t=>t+1);
      }} />
    </div>
  );
}

function ConstellationControls({ width, onAction }: { width: number; onAction: (a:'in'|'out'|'reset')=>void }) {
  // Buttons sized to 1/3 of provided canvas width
  const btnStyle: React.CSSProperties = { height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  return (
    <div className="mt-3 flex justify-center text-white select-none">
      <div style={{ width }} className="flex gap-3">
        <button aria-label="Zoom out" onClick={()=>onAction('out')} className="flex-1 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 ring-1 ring-white/10 transition" style={btnStyle}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M5 11V13H19V11H5Z"/></svg>
        </button>
        <button aria-label="Reset view" onClick={()=>onAction('reset')} className="flex-1 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 ring-1 ring-white/10 transition" style={btnStyle}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM15.4462 9.96803L9.96803 15.4462C9.38559 15.102 8.89798 14.6144 8.55382 14.032L14.032 8.55382C14.6144 8.89798 15.102 9.38559 15.4462 9.96803Z"/></svg>
        </button>
        <button aria-label="Zoom in" onClick={()=>onAction('in')} className="flex-1 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 ring-1 ring-white/10 transition" style={btnStyle}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z"/></svg>
        </button>
      </div>
    </div>
  );
}