import { useEffect, useMemo, useRef, useState, useId } from 'react';
import type { Entry } from '@shared/lib/types/global';
import { clamp, emojiStats, hsl, last7, todayISO } from '@shared/lib/utils';
import { useConstellationWindowDrag } from '../hooks/useConstellationWindowDrag';

export default function ConstellationsPage({ entries, yearKey }: { entries: Entry[]; yearKey?: string }) {
  const { freq, pair } = useMemo(() => emojiStats(entries), [entries]);

  // Show all emojis (sorted by frequency). Performance improvements below reduce O(n^2) cost.
  const topEmojis = useMemo(() => [...freq.entries()].sort((a, b) => b[1] - a[1]), [freq]);

  // Force-directed layout state (kept outside React state for perf)
  interface SimNode { emo: string; x: number; y: number; vx: number; vy: number; r: number; }
  interface SimEdge { a: number; b: number; w: number; }
  // Rendered (visible) canvas size in px (must NOT change per UI constraint)
  const RENDER_SIZE = 325;
  const renderWidth = RENDER_SIZE, renderHeight = RENDER_SIZE;

  // Internal world dimensions (much larger area where emojis can move).
  // This expands the draggable/physics area while the visible SVG remains the same.
  const WORLD_SIZE = 1200; // much larger logical canvas
  const worldWidth = WORLD_SIZE, worldHeight = WORLD_SIZE;

  // Default initial zoom level (world units -> rendered zoom). >1 = zoomed in
  const DEFAULT_SCALE = 2.5;

  const NODE_PADDING = 24; // desired padding from edge (in world units)
  // Allow nodes to be dragged slightly beyond the visible canvas (world units)
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
  const {
    windowRef,
    dragHandlers: windowDragHandlers,
    resetWindow,
    nudgeWindow,
    dragging: windowDragging,
  } = useConstellationWindowDrag();
  const instructionsId = useId();
  const windowTitleId = useId();

  useEffect(() => {
    resetWindow();
  }, [resetWindow, yearKey]);

  // Throttle renders to ~30fps to avoid React churn when many nodes move
  const lastRenderRef = useRef<number>(0);
  function triggerRender() {
    const now = performance.now();
    if (now - lastRenderRef.current >= 33) {
      lastRenderRef.current = now;
      setTick(t => t + 1);
    }
  }

  function handleWindowKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 80 : 40;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Home' || e.key === 'Escape') {
      e.preventDefault();
      resetWindow();
      return;
    }
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        nudgeWindow(-step, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        nudgeWindow(step, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        nudgeWindow(0, -step);
        break;
      case 'ArrowDown':
        e.preventDefault();
        nudgeWindow(0, step);
        break;
      default:
        break;
    }
  }

  // (Re)initialize simulation when top emojis change
  useEffect(() => {
    // Precompute sizes (frequency -> size) so we can respect bounds fully (size/2 + padding)
    const sized = topEmojis.map(([emo]) => {
      const count = freq.get(emo) || 1;
      const size = clamp(24 + count * 6, 24, 64); // keep logic in sync w/ render
      return { emo, size };
    });
    const maxRadius = sized.reduce((m, s) => Math.max(m, s.size / 2), 0);
    const cx = worldWidth / 2, cy = worldHeight / 2;
  // Determine which emojis are from today so we place them near center
  const todaySet = new Set<string>();
  const todayStr = todayISO();
  for (const e of entries) if (e.date === todayStr) for (const emo of Array.from(new Set(e.emojis))) todaySet.add(emo);

    const centerRadius = Math.min(120, Math.min(worldWidth, worldHeight) / 6);
    const pad = NODE_PADDING + maxRadius;
    const nodes: SimNode[] = sized.map((s) => {
      let x: number, y: number;
      if (todaySet.has(s.emo)) {
        // place today's emojis near the center with small random offset
        x = cx + (Math.random() - 0.5) * centerRadius;
        y = cy + (Math.random() - 0.5) * centerRadius;
      } else {
        // scatter across the whole world while respecting padding
        x = pad + Math.random() * (worldWidth - pad * 2);
        y = pad + Math.random() * (worldHeight - pad * 2);
      }
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
    triggerRender();
  }, [topEmojis, pair, freq, entries]);

  // Reset view transform when entries dataset changes (year navigation)
  useEffect(()=> {
    const v = viewRef.current;
    // Center the world in svg user units. For the world center to appear at svg center:
    // svgUser_center = worldCenter * scale + tx  => tx = svgUser_center - worldCenter*scale
    // svgUser_center is worldWidth/2 (since viewBox maps worldWidth->svg width)
    v.scale = DEFAULT_SCALE;
    v.tx = (worldWidth / 2) - (worldWidth / 2) * v.scale;
    v.ty = (worldHeight / 2) - (worldHeight / 2) * v.scale;
    v.targetScale = v.scale;
    v.targetTx = v.tx; v.targetTy = v.ty;
    momentumRef.current.active = false;
  }, [entries]);

  // Drag handling
  const draggingRef = useRef<{ index: number; px: number; py: number; moved: boolean; group: {index:number; startX:number; startY:number}[] } | null>(null);
  // Disable inter-node forces so emojis don't gravitate to each other
  const FORCES_ENABLED = false;

  function svgToWorld(clientX: number, clientY: number, svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect();
  // Map client (pixel) -> svg user units (world units) using viewBox -> rect scaling
  const svgX = (clientX - rect.left) * (worldWidth / rect.width);
  const svgY = (clientY - rect.top) * (worldHeight / rect.height);
  const { tx, ty, scale } = viewRef.current; // tx/ty/scale are in world units
  // Inverse of transform: world = (svgUser - tx) / scale
  const x = (svgX - tx) / scale;
  const y = (svgY - ty) / scale;
  return { x, y };
  }

  function onPointerDown(e: React.PointerEvent<SVGGElement>, index: number) {
    e.stopPropagation();
    // If a pinch is in progress or a second touch begins, disable node dragging
    if (e.pointerType === 'touch' && touchesRef.current.size > 0) return;
    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
    const { x, y } = svgToWorld(e.clientX, e.clientY, svg);
    // Build dragging group: if this node is focused, include directly connected nodes
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const node = nodes[index];
    const group: {index:number; startX:number; startY:number}[] = [];
    if (typeof node !== 'undefined' && node && node.emo && node.emo === (focus || node.emo) && focus === node.emo) {
      // include this node
      group.push({ index, startX: node.x, startY: node.y });
      // include directly connected nodes
      for (const ed of edges) {
        if (ed.a === index) {
          const other = nodes[ed.b];
          group.push({ index: ed.b, startX: other.x, startY: other.y });
        } else if (ed.b === index) {
          const other = nodes[ed.a];
          group.push({ index: ed.a, startX: other.x, startY: other.y });
        }
      }
    } else {
      group.push({ index, startX: node.x, startY: node.y });
    }
    // dedupe group indices
    const seen = new Set<number>();
    const uniq = group.filter(g => { if (seen.has(g.index)) return false; seen.add(g.index); return true; });
    draggingRef.current = { index, px: x, py: y, moved: false, group: uniq };
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
    const nodes = nodesRef.current;
    const primaryIndex = d.index;
    // primary node snaps to pointer
    const primary = nodes[primaryIndex];
    if (primary) {
      primary.x = clamp(nx, primary.r + NODE_PADDING - CANVAS_OVERFLOW, worldWidth - (primary.r + NODE_PADDING) + CANVAS_OVERFLOW);
      primary.y = clamp(ny, primary.r + NODE_PADDING - CANVAS_OVERFLOW, worldHeight - (primary.r + NODE_PADDING) + CANVAS_OVERFLOW);
      primary.vx = 0; primary.vy = 0;
    }
    // soft-follow for other group members: give controlled velocity impulse toward the primary node
    for (const g of d.group) {
      if (g.index === primaryIndex) continue;
      const node = nodes[g.index];
      if (!node) continue;
      // vector from node -> primary
      const fx = (primary.x - node.x);
      const fy = (primary.y - node.y);
      const dist = Math.hypot(fx, fy) || 0.0001;
      // reduce strength and cap impulses so followers don't snap or fly across canvas
      const followStrength = 0.08; // lower -> looser, less chaotic
      const maxImpulse = 8; // world-units per update
      // compute impulse proportional to distance but capped
      const impulseMag = Math.min(dist * followStrength, maxImpulse);
      const impulseX = (fx / dist) * impulseMag;
      const impulseY = (fy / dist) * impulseMag;
      // apply impulse with gentle damping
      node.vx = node.vx * 0.75 + impulseX;
      node.vy = node.vy * 0.75 + impulseY;
      // clamp velocity to avoid runaway
      const maxVel = 80;
      const vmag = Math.hypot(node.vx, node.vy);
      if (vmag > maxVel) { node.vx = (node.vx / vmag) * maxVel; node.vy = (node.vy / vmag) * maxVel; }
    }
    triggerRender();
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
      triggerRender();
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
        // Repulsion using spatial hashing (approx O(n)) for better performance with many nodes
        if (FORCES_ENABLED) {
          const cellSize = 120; // tuning param: neighborhood radius
          const grid = new Map<string, number[]>();
          function keyFor(x:number,y:number){ return Math.floor(x/cellSize)+','+Math.floor(y/cellSize); }
          for (let i=0;i<nodes.length;i++){ const n=nodes[i]; const k=keyFor(n.x,n.y); const arr=grid.get(k)||[]; arr.push(i); grid.set(k,arr); }
          const neighborOffsets = [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];
          for (let i=0;i<nodes.length;i++){
            const a = nodes[i];
            const baseX = Math.floor(a.x/cellSize), baseY = Math.floor(a.y/cellSize);
            for (const off of neighborOffsets){
              const k = (baseX+off[0])+','+(baseY+off[1]);
              const bucket = grid.get(k); if (!bucket) continue;
              for (const j of bucket){ if (j <= i) continue; const b = nodes[j];
                let dx = a.x - b.x; let dy = a.y - b.y; let dist2 = dx*dx + dy*dy;
                if (dist2 < 1e-4) { dx = (Math.random()-0.5); dy = (Math.random()-0.5); dist2 = dx*dx + dy*dy; }
                const dist = Math.sqrt(dist2);
                const rep = 2200 / dist2;
                const fx = (dx / dist) * rep;
                const fy = (dy / dist) * rep;
                a.vx += fx * dt; a.vy += fy * dt;
                b.vx -= fx * dt; b.vy -= fy * dt;
              }
            }
          }
        }
        // Spring attraction for co-usage
        if (FORCES_ENABLED) {
          for (const e of edges) {
            const a = nodes[e.a], b = nodes[e.b];
              const dx = b.x - a.x; const dy = b.y - a.y; const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
              // Increase baseline separation between connected nodes so groups are more spread out.
              const base = 260; const factor = 6; const minL = 80;
              const target = clamp(base - e.w * factor, minL, base);
              const k = 0.12; // spring stiffness (softer springs)
              const f = k * (dist - target);
              const fx = (dx / dist) * f;
              const fy = (dy / dist) * f;
              a.vx += fx * dt; a.vy += fy * dt;
              b.vx -= fx * dt; b.vy -= fy * dt;
          }
        }
        // Integrate
        for (const n of nodes) {
          n.vx *= 0.9; n.vy *= 0.9; // friction
          n.x += n.vx * 60 * dt; // scale velocities for visual speed
          n.y += n.vy * 60 * dt;
          // bounds in world coordinates
          const minX = n.r + NODE_PADDING - CANVAS_OVERFLOW;
          const maxX = worldWidth - (n.r + NODE_PADDING) + CANVAS_OVERFLOW;
          const minY = n.r + NODE_PADDING - CANVAS_OVERFLOW;
          const maxY = worldHeight - (n.r + NODE_PADDING) + CANVAS_OVERFLOW;
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

  // Update view (throttle renders)
  triggerRender();
      frameRef.current = requestAnimationFrame(step);
    }
  frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [topEmojis]);

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

  // Compute circular mean hue across all entries per emoji (used when emoji not chosen today)
  const mixedHueByEmoji = useMemo(() => {
    const buckets = new Map<string, number[]>();
    for (const e of entries) {
      if (typeof e.hue !== 'number') continue;
      const huesForEntry = (e.hue + 360) % 360;
      for (const emo of Array.from(new Set(e.emojis))) {
        const arr = buckets.get(emo) || [];
        arr.push(huesForEntry);
        buckets.set(emo, arr);
      }
    }
    function circMean(hues: number[]) {
      if (!hues.length) return undefined;
      let x = 0, y = 0;
      for (const h of hues) {
        const r = (h * Math.PI) / 180;
        x += Math.cos(r);
        y += Math.sin(r);
      }
      const ang = Math.atan2(y, x) * (180 / Math.PI);
      return (ang + 360) % 360;
    }
    const out = new Map<string, number>();
    for (const [emo, hs] of buckets.entries()) {
      const m = circMean(hs);
      if (typeof m === 'number' && !Number.isNaN(m)) out.set(emo, m);
    }
    return out;
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
  const newScale = clamp(v.scale * zoomFactor, 0.55, 3.5);
    // Keep point (x,y) under cursor stable.
  // Compute svg user coords (in world units) of cursor, then set tx so that
  // svgUser = world.x * newScale + tx
  const world = svgToWorld(e.clientX, e.clientY, svg);
  const rect = svg.getBoundingClientRect();
  const svgUserX = (e.clientX - rect.left) * (worldWidth / rect.width);
  const svgUserY = (e.clientY - rect.top) * (worldHeight / rect.height);
  v.tx = svgUserX - world.x * newScale;
  v.ty = svgUserY - world.y * newScale;
    v.scale = newScale;
  // Keep targets in sync so animation loop doesn't fight wheel zoom
  v.targetScale = v.scale;
  v.targetTx = v.tx;
  v.targetTy = v.ty;
  triggerRender();
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
  const scale = clamp(pinch.initialScale * (dist / pinch.initialDist), 0.55, 3.5);
      v.scale = scale;
      // Keep anchor world point fixed at original screen midpoint.
      const rect = svg.getBoundingClientRect();
      const svgUserX = (pinch.anchorScreen.x - rect.left) * (worldWidth / rect.width);
      const svgUserY = (pinch.anchorScreen.y - rect.top) * (worldHeight / rect.height);
      v.tx = svgUserX - pinch.anchorWorld.x * scale;
      v.ty = svgUserY - pinch.anchorWorld.y * scale;
  // Sync targets to avoid interpolation snapping back
  v.targetScale = v.scale;
  v.targetTx = v.tx;
  v.targetTy = v.ty;
    triggerRender();
      return; // don't also pan
    }
    // Pan (single pointer, no pinch, no node drag)
    const d = panDragRef.current; if (d && d.active && !pinch.active) {
      const v = viewRef.current;
      const rect = svg.getBoundingClientRect();
      // convert screen delta (px) -> world units
      const dxWorld = (e.clientX - d.startX) * (worldWidth / rect.width);
      const dyWorld = (e.clientY - d.startY) * (worldHeight / rect.height);
      const nx = d.startTx + dxWorld;
      const ny = d.startTy + dyWorld;
      v.tx = v.targetTx = nx;
      v.ty = v.targetTy = ny;
      const now = performance.now();
      const last = lastPanSampleRef.current;
      if (last && now - last.t > 12) {
        // compute velocity in world-units/ms
        momentumRef.current.vx = ((e.clientX - last.x) * (worldWidth / rect.width)) / (now - last.t);
        momentumRef.current.vy = ((e.clientY - last.y) * (worldHeight / rect.height)) / (now - last.t);
        lastPanSampleRef.current = { x: e.clientX, y: e.clientY, t: now };
      }
    triggerRender();
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
    <div
      className="mx-auto flex h-full w-full max-w-sm flex-col items-center gap-5 px-4 select-none"
      style={{overflow:'hidden', touchAction:'none'}}
    >
      <div className="text-center text-sm text-white/80">Emoji constellations</div>
      <div
        id={instructionsId}
        className="text-center text-xs text-white/55"
      >
        Tap stars to highlight connections. Drag the window header to reposition.
      </div>
      <div className="flex w-full justify-center">
        <div
          key={yearKey}
          ref={windowRef}
          className={`fd-constellation-window animate-fadeSwap${windowDragging ? ' is-dragging' : ''}`}
          style={{ touchAction:'none' }}
        >
          <div className="fd-constellation-window__chrome">
            <div
              className="fd-constellation-window__drag"
              {...windowDragHandlers}
              tabIndex={0}
              role="button"
              aria-labelledby={`${windowTitleId} ${instructionsId}`}
              aria-describedby={instructionsId}
              data-dragging={windowDragging ? 'true' : 'false'}
              onKeyDown={handleWindowKeyDown}
              onDoubleClick={resetWindow}
            >
              <div className="fd-constellation-window__grab" aria-hidden />
              <div className="min-w-0">
                <div id={windowTitleId} className="fd-constellation-window__title">
                  Constellation window
                </div>
                <div className="fd-constellation-window__subtitle">
                  Drag to move. Double-tap or press Enter to center.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="fd-constellation-window__reset"
              onClick={resetWindow}
            >
              Center window
            </button>
          </div>
          <div className="fd-constellation-window__canvas">
        <svg
          viewBox={`0 0 ${worldWidth} ${worldHeight}`}
          width={renderWidth}
          height={renderHeight}
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
  const isRecent7 = recent7Emojis.has(n.emo);
  const isTodayStar = last?.date === todayIso;
  // If this emoji wasn't chosen today, mix all historical hues for it; else use today's hue
  const mixed = mixedHueByEmoji.get(n.emo);
  const fillHue = (isTodayStar ? last?.hue : (typeof mixed === 'number' ? mixed : last?.hue));
  const fill = hueToFill(fillHue, 0.95);
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
          <div className="fd-constellation-window__empty" aria-label="No data yet">
            <div className="font-poster text-white/18" style={{ fontSize: 170, lineHeight: 1 }}>?</div>
          </div>
        )}
          </div>
          <div className="fd-constellation-window__footer">
            <div className="fd-constellation-window__focus">
              {focus ? (
                <span className="fd-constellation-window__focusBadge">
                  <span>{focus}</span>
                  <span>×{freq.get(focus) || 0}</span>
                </span>
              ) : (
                <span className="fd-constellation-window__focusBadge fd-constellation-window__focusPlaceholder">placeholder</span>
              )}
            </div>
            <ConstellationControls onAction={(action)=>{
        const v = viewRef.current;
        const svg = svgElRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const centerScreenX = rect.left + rect.width/2;
        const centerScreenY = rect.top + rect.height/2;
        if (action === 'reset') {
          v.targetScale = DEFAULT_SCALE;
          v.targetTx = (worldWidth / 2) - (worldWidth / 2) * DEFAULT_SCALE;
          v.targetTy = (worldHeight / 2) - (worldHeight / 2) * DEFAULT_SCALE;
          triggerRender();
          return;
        }
        const factor = action === 'in' ? 1.25 : 1/1.25;
  const targetScale = clamp(v.scale * factor, 0.55, 3.5);
        // Maintain center anchor
        const worldCx = (centerScreenX - rect.left - v.tx) / v.scale;
        const worldCy = (centerScreenY - rect.top - v.ty) / v.scale;
  v.targetScale = targetScale;
  v.targetTx = (centerScreenX - rect.left) - worldCx * targetScale;
  v.targetTy = (centerScreenY - rect.top) - worldCy * targetScale;
  triggerRender();
      }} size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConstellationControls({ onAction, size = 'md' }: { onAction: (a:'in'|'out'|'reset')=>void; size?: 'sm' | 'md' }) {
  return (
    <div className="fd-constellation-controls" data-size={size}>
      <button type="button" aria-label="Zoom out" onClick={() => onAction('out')}>
        <span className="sr-only">Zoom out</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 11V13H19V11H5Z" />
        </svg>
      </button>
      <button type="button" aria-label="Reset view" onClick={() => onAction('reset')}>
        <span className="sr-only">Reset view</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Zm0-2c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8Zm3.446-10.032L9.968 15.446c-.582-.344-1.07-.832-1.414-1.414L14.032 8.554c.582.344 1.07.832 1.414 1.414Z" />
        </svg>
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => onAction('in')}>
        <span className="sr-only">Zoom in</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" />
        </svg>
      </button>
    </div>
  );
}