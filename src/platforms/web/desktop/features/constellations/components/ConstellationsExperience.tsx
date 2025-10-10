import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entry } from '@shared/lib/types/global';
import { clamp, emojiStats, hsl, last7, todayISO } from '@shared/lib/utils';

export type ConstellationsExperienceProps = {
  entries: Entry[];
  yearKey?: string;
  layout: 'wide' | 'compact';
};

export default function ConstellationsExperience({ entries, yearKey, layout }: ConstellationsExperienceProps) {
  const { freq, pair } = useMemo(() => emojiStats(entries), [entries]);

  // Show all emojis (sorted by frequency). Performance improvements below reduce O(n^2) cost.
  const topEmojis = useMemo(() => [...freq.entries()].sort((a, b) => b[1] - a[1]), [freq]);

  const todayIso = todayISO();

  const todayEmojiSet = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      if (entry.date !== todayIso) continue;
      for (const emo of Array.from(new Set(entry.emojis))) set.add(emo);
    }
    return set;
  }, [entries, todayIso]);

  const recent7Emojis = useMemo(() => new Set<string>(last7(entries).flatMap((e) => e.emojis)), [entries]);

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

  const mixedHueByEmoji = useMemo(() => {
    const buckets = new Map<string, number[]>();
    for (const e of entries) {
      if (typeof e.hue !== 'number') continue;
      const hue = (e.hue + 360) % 360;
      for (const emo of Array.from(new Set(e.emojis))) {
        const arr = buckets.get(emo) || [];
        arr.push(hue);
        buckets.set(emo, arr);
      }
    }

    function circularMean(hues: number[]) {
      if (!hues.length) return undefined;
      let x = 0;
      let y = 0;
      for (const h of hues) {
        const rad = (h * Math.PI) / 180;
        x += Math.cos(rad);
        y += Math.sin(rad);
      }
      const ang = Math.atan2(y, x) * (180 / Math.PI);
      return (ang + 360) % 360;
    }

    const out = new Map<string, number>();
    for (const [emo, hues] of buckets.entries()) {
      const mean = circularMean(hues);
      if (typeof mean === 'number' && !Number.isNaN(mean)) out.set(emo, mean);
    }
    return out;
  }, [entries]);

  const MIN_NODE_LIMIT = 24;
  const MAX_NODE_LIMIT = 200;
  const estimatedDefaultLimit = topEmojis.length
    ? clamp(Math.round(topEmojis.length * 0.65), MIN_NODE_LIMIT, Math.min(MAX_NODE_LIMIT, topEmojis.length))
    : 0;
  const [nodeLimit, setNodeLimit] = useState(estimatedDefaultLimit);
  const filterOptions: { id: 'all' | 'recent' | 'today'; label: string; hint: string }[] = [
    { id: 'all', label: 'All time', hint: 'Entire dataset' },
    { id: 'recent', label: 'Last 7 days', hint: 'Highlights recent clusters' },
    { id: 'today', label: 'Today', hint: 'Only emojis logged today' },
  ];
  const [filter, setFilter] = useState<'all' | 'recent' | 'today'>('all');
  const [search, setSearch] = useState('');
  const [forcesEnabled, setForcesEnabled] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    setFocus(null);
  }, [entries]);

  useEffect(() => {
    if (!topEmojis.length) {
      setNodeLimit(0);
      return;
    }
    const fallback = clamp(
      Math.round(topEmojis.length * 0.65),
      MIN_NODE_LIMIT,
      Math.min(MAX_NODE_LIMIT, topEmojis.length)
    );
    setNodeLimit((prev) => {
      if (!prev) return fallback;
      const clamped = clamp(prev, MIN_NODE_LIMIT, Math.min(MAX_NODE_LIMIT, topEmojis.length));
      return clamped;
    });
  }, [topEmojis.length]);

  const sceneEmojis = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = topEmojis.filter(([emo]) => {
      if (query && !emo.toLowerCase().includes(query)) return false;
      if (filter === 'today' && !todayEmojiSet.has(emo)) return false;
      if (filter === 'recent' && !recent7Emojis.has(emo)) return false;
      return true;
    });
    if (!filtered.length) return filtered;
    if (query) return filtered.slice(0, Math.min(MAX_NODE_LIMIT, filtered.length));
    const limit = nodeLimit ? clamp(nodeLimit, MIN_NODE_LIMIT, MAX_NODE_LIMIT) : filtered.length;
    return filtered.slice(0, Math.min(limit, filtered.length));
  }, [topEmojis, filter, search, todayEmojiSet, recent7Emojis, nodeLimit]);

  const visibleEmojiSet = useMemo(() => new Set(sceneEmojis.map(([emo]) => emo)), [sceneEmojis]);

  useEffect(() => {
    if (focus && !visibleEmojiSet.has(focus)) setFocus(null);
  }, [focus, visibleEmojiSet]);

  // Force-directed layout state (kept outside React state for perf)
  interface SimNode { emo: string; x: number; y: number; vx: number; vy: number; r: number; }
  interface SimEdge { a: number; b: number; w: number; }
  // Rendered (visible) canvas size in px (must NOT change per UI constraint)
  const RENDER_SIZE = layout === 'wide' ? 360 : 325;
  const renderWidth = RENDER_SIZE, renderHeight = RENDER_SIZE;

  // Internal world dimensions (much larger area where emojis can move).
  // This expands the draggable/physics area while the visible SVG remains the same.
  const WORLD_SIZE = layout === 'wide' ? 1400 : 1200; // larger logical canvas for wide layout
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

  // Throttle renders to ~30fps to avoid React churn when many nodes move
  const lastRenderRef = useRef<number>(0);
  function triggerRender() {
    const now = performance.now();
    if (now - lastRenderRef.current >= 33) {
      lastRenderRef.current = now;
      setTick(t => t + 1);
    }
  }

  // (Re)initialize simulation when filtered emoji set changes
  useEffect(() => {
    const sized = sceneEmojis.map(([emo]) => {
      const count = freq.get(emo) || 1;
      const size = clamp(24 + count * 6, 24, 64);
      return { emo, size };
    });

    const maxRadius = sized.reduce((m, s) => Math.max(m, s.size / 2), 0);
    const cx = worldWidth / 2;
    const cy = worldHeight / 2;
    const centerRadius = Math.min(120, Math.min(worldWidth, worldHeight) / 6);
    const pad = NODE_PADDING + maxRadius;
    const nodes: SimNode[] = sized.map((s) => {
      let x: number;
      let y: number;
      if (todayEmojiSet.has(s.emo)) {
        x = cx + (Math.random() - 0.5) * centerRadius;
        y = cy + (Math.random() - 0.5) * centerRadius;
      } else {
        x = pad + Math.random() * (worldWidth - pad * 2);
        y = pad + Math.random() * (worldHeight - pad * 2);
      }
      return { emo: s.emo, x, y, vx: 0, vy: 0, r: s.size / 2 };
    });

    const indexByEmoji = new Map(nodes.map((n, i) => [n.emo, i] as const));
    const edges: SimEdge[] = [];
    for (const [key, w] of pair.entries()) {
      if (w < 1) continue;
      const [a, b] = key.split('__');
      const ia = indexByEmoji.get(a);
      const ib = indexByEmoji.get(b);
      if (ia != null && ib != null) edges.push({ a: ia, b: ib, w });
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
    triggerRender();
  }, [sceneEmojis, pair, freq, todayEmojiSet]);

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
  const forcesEnabledRef = useRef(forcesEnabled);
  useEffect(() => {
    forcesEnabledRef.current = forcesEnabled;
  }, [forcesEnabled]);

  const draggingRef = useRef<{
    index: number;
    startPx: number;
    startPy: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    group: { index: number; startX: number; startY: number }[];
  } | null>(null);
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
    if (!node) return;
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
    const offsetX = x - node.x;
    const offsetY = y - node.y;
    draggingRef.current = { index, startPx: x, startPy: y, offsetX, offsetY, moved: false, group: uniq };
    (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
  // Cancel momentum when grabbing a node
  momentumRef.current.active = false;
  }
  function onPointerMove(e: React.PointerEvent<SVGGElement>) {
    if (!draggingRef.current) return;
    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
    const { x: nx, y: ny } = svgToWorld(e.clientX, e.clientY, svg);
    const d = draggingRef.current;
    if (Math.abs(nx - d.startPx) + Math.abs(ny - d.startPy) > 1.5) d.moved = true;
    const nodes = nodesRef.current;
    const primaryIndex = d.index;
    // primary node snaps to pointer
    const primary = nodes[primaryIndex];
    if (primary) {
      const targetX = nx - d.offsetX;
      const targetY = ny - d.offsetY;
      primary.x = clamp(targetX, primary.r + NODE_PADDING - CANVAS_OVERFLOW, worldWidth - (primary.r + NODE_PADDING) + CANVAS_OVERFLOW);
      primary.y = clamp(targetY, primary.r + NODE_PADDING - CANVAS_OVERFLOW, worldHeight - (primary.r + NODE_PADDING) + CANVAS_OVERFLOW);
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
        if (forcesEnabledRef.current) {
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
        if (forcesEnabledRef.current) {
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
  }, [sceneEmojis.length]);

  function edgeStyle(a: string, b: string, w: number) {
    const connected = focus != null && (focus === a || focus === b);
    return { op: connected ? 0.5 : 0, sw: connected ? clamp(1 + w * 0.6, 1, 4) : 0 };
  }

  function daysBetween(aIso: string, bIso: string) {
    const a = new Date(aIso + 'T00:00:00');
    const b = new Date(bIso + 'T00:00:00');
    const ms = Math.abs(a.getTime() - b.getTime());
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }
  function recencyToScaleOpacity(daysAgo: number) {
    const scale = clamp(1.15 - daysAgo * 0.01, 0.6, 1.15);
    const opacity = clamp(1 - daysAgo * 0.03, 0.25, 1);
    return { scale, opacity };
  }
  function hueToFill(h?: number, alpha = 1) {
    if (typeof h !== 'number') return hsl(220, 14, 60, alpha * 0.9);
    return hsl(Math.round(h), 85, 58, alpha);
  }

  const nodes = nodesRef.current;
  const edges = edgesRef.current;

  const focusConnections = useMemo(() => {
    if (!focus) return [] as { emoji: string; count: number; visible: boolean }[];
    const results: { emoji: string; count: number; visible: boolean }[] = [];
    for (const [key, count] of pair.entries()) {
      const [a, b] = key.split('__');
      if (a === focus) {
        results.push({ emoji: b, count, visible: visibleEmojiSet.has(b) });
      } else if (b === focus) {
        results.push({ emoji: a, count, visible: visibleEmojiSet.has(a) });
      }
    }
    return results.sort((a, b) => b.count - a.count).slice(0, 8);
  }, [focus, pair, visibleEmojiSet]);

  const focusUsage = focus ? freq.get(focus) ?? 0 : 0;
  const focusLastUsed = focus ? lastUsed.get(focus) : undefined;
  const focusDaysAgo = focusLastUsed ? daysBetween(todayIso, focusLastUsed.date) : null;

  const uniqueDaysLogged = useMemo(() => new Set(entries.map((e) => e.date)).size, [entries]);
  const totalEmojiUses = useMemo(() => entries.reduce((acc, entry) => acc + entry.emojis.length, 0), [entries]);

  const trendingEmojis = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of last7(entries)) {
      for (const emo of entry.emojis) counts.set(emo, (counts.get(emo) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [entries]);

  const hiddenCount = Math.max(0, topEmojis.length - sceneEmojis.length);
  const sliderMax = Math.min(MAX_NODE_LIMIT, Math.max(MIN_NODE_LIMIT, topEmojis.length || MIN_NODE_LIMIT));
  const sliderDisabled = sliderMax <= MIN_NODE_LIMIT;
  const limitLabel = sceneEmojis.length && topEmojis.length
    ? `${sceneEmojis.length.toLocaleString()}/${topEmojis.length.toLocaleString()}`
    : `${sceneEmojis.length}`;
  const sliderValue = sliderDisabled ? sliderMax : clamp(nodeLimit || sliderMax, MIN_NODE_LIMIT, sliderMax);

  const strongestPair = useMemo(() => {
    let best: { a: string; b: string; count: number } | null = null;
    for (const [key, count] of pair.entries()) {
      if (!best || count > best.count) {
        const [a, b] = key.split('__');
        best = { a, b, count };
      }
    }
    return best;
  }, [pair]);

  const summaryCards = useMemo(
    () => [
      { label: 'Unique emojis', value: freq.size.toLocaleString() },
      { label: 'Entries logged', value: entries.length.toLocaleString() },
      { label: 'Days recorded', value: uniqueDaysLogged.toLocaleString() },
      { label: 'Emoji uses', value: totalEmojiUses.toLocaleString() },
    ],
    [freq.size, entries.length, uniqueDaysLogged, totalEmojiUses]
  );

  const containerClasses =
    layout === 'wide'
      ? 'mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 pt-6 text-white'
      : 'mx-auto flex w-full max-w-sm flex-col gap-4 px-4 pb-8 pt-4 text-white';

  const stageLayoutClasses = layout === 'wide' ? 'flex flex-col gap-6 lg:flex-row' : 'flex flex-col gap-4';

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
    <div className={containerClasses} style={{ overflow: 'hidden' }}>
      <header className="flex flex-col gap-2">
        <div className="text-xs uppercase tracking-[0.4em] text-white/45">Emoji constellations</div>
        <div className="text-lg font-semibold text-white/90">Explore how your reactions cluster together</div>
        <div className="text-sm text-white/60">
          Drag, pinch, or use the zoom controls to navigate. Tap an emoji to spotlight the connections it relies on.
        </div>
      </header>

      <section className={layout === 'wide' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid grid-cols-2 gap-3'}>
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white backdrop-blur-sm"
          >
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold text-white">{card.value}</div>
          </div>
        ))}
      </section>

      <div className={stageLayoutClasses}>
        <div className="flex-1">
          <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/35 text-white shadow-xl backdrop-blur-lg">
            <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white/85">Emoji window</div>
                  <div className="text-xs text-white/55">
                    Showing <span className="font-medium text-white/80">{limitLabel}</span>
                    {hiddenCount > 0 && (
                      <span className="ml-2 text-white/45">(+{hiddenCount.toLocaleString()} hidden for speed)</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search emoji or keyword"
                    className="w-full min-w-[160px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {filterOptions.map((opt) => {
                  const active = filter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setFilter(opt.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        active
                          ? 'bg-white/20 text-white shadow-inner'
                          : 'bg-white/5 text-white/65 hover:bg-white/10 hover:text-white/85'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-white/55">
                  <span>Window density</span>
                  <span className="font-medium text-white/80">{limitLabel}</span>
                </div>
                <input
                  type="range"
                  min={MIN_NODE_LIMIT}
                  max={sliderMax}
                  value={sliderValue}
                  onChange={(e) => setNodeLimit(Number(e.target.value))}
                  disabled={sliderDisabled}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-white"
                />
                {sliderDisabled && (
                  <span className="text-xs text-white/45">All emojis are already shown.</span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={forcesEnabled}
                    onChange={(e) => setForcesEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-white/30 bg-black/30 text-white focus:outline-none focus:ring-1 focus:ring-white/40"
                  />
                  <span>Enable gentle gravity (experimental)</span>
                </label>
                <div className="flex items-center gap-2">
                  {strongestPair ? (
                    <span>
                      Strongest link:{' '}
                      <span className="font-medium text-white/80">
                        {strongestPair.a} + {strongestPair.b} ({strongestPair.count})
                      </span>
                    </span>
                  ) : (
                    <span>No pair data yet.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 px-4 pb-5 pt-5">
              <div className="text-center text-xs text-white/60">
                Drag, pinch, or use the zoom controls below. Tap an emoji to inspect its network.
              </div>
              <div
                key={yearKey}
                className="relative mx-auto rounded-xl border border-white/5 bg-black/30 p-3 animate-fadeSwap fd-constellation-backdrop"
                style={{ touchAction: 'none' }}
              >
                <svg
                  viewBox={`0 0 ${worldWidth} ${worldHeight}`}
                  width={renderWidth}
                  height={renderHeight}
                  shapeRendering="geometricPrecision"
                  textRendering="geometricPrecision"
                  style={{ userSelect: 'none', touchAction: 'none', cursor: panDragRef.current ? 'grabbing' : 'grab' }}
                  onWheel={onWheel}
                  onPointerDown={onBgPointerDown}
                  onPointerMove={onBgPointerMove}
                  onPointerUp={onBgPointerUp}
                  ref={(el) => {
                    svgElRef.current = el;
                  }}
                >
                  <defs>
                    <filter id="fd-blur" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="6" />
                    </filter>
                  </defs>
                  <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
                    {edges.map((e, idx) => {
                      const A = nodes[e.a];
                      const B = nodes[e.b];
                      const { op, sw } = edgeStyle(A.emo, B.emo, e.w);
                      return (
                        <line
                          key={idx}
                          x1={A.x}
                          y1={A.y}
                          x2={B.x}
                          y2={B.y}
                          stroke={'rgba(230,230,230,0.95)'}
                          strokeWidth={sw || 0.8}
                          opacity={op}
                          className="edge-line"
                          data-connected={op > 0}
                        />
                      );
                    })}

                    {nodes.map((n, idx) => {
                      const count = freq.get(n.emo) || 1;
                      const size = clamp(24 + count * 6, 24, 64);
                      const last = lastUsed.get(n.emo);
                      const daysAgo = last ? daysBetween(todayIso, last.date) : 999;
                      const { scale: recScale, opacity: recOp } = recencyToScaleOpacity(daysAgo);
                      const isRecent7 = recent7Emojis.has(n.emo);
                      const isTodayStar = last?.date === todayIso;
                      const mixed = mixedHueByEmoji.get(n.emo);
                      const fillHue = isTodayStar ? last?.hue : typeof mixed === 'number' ? mixed : last?.hue;
                      const fill = hueToFill(fillHue, 0.95);
                      const circleR = Math.max(12, (size / 2) * recScale * 1.22);
                      return (
                        <g
                          key={n.emo}
                          transform={`translate(${n.x}, ${n.y})`}
                          onPointerDown={(e) => onPointerDown(e, idx)}
                          onPointerMove={onPointerMove}
                          onPointerUp={(e) => onPointerUp(e, n.emo)}
                          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                        >
                          <circle r={circleR * 1.33} fill={fill} opacity={recOp * 0.36} filter="url(#fd-blur)" />
                          <circle
                            r={circleR}
                            fill={fill}
                            opacity={recOp * 0.6}
                            style={{
                              mixBlendMode: 'screen',
                              filter: isRecent7 ? 'drop-shadow(0 0 8px rgba(64,201,186,0.45))' : undefined,
                            }}
                          />
                          {isTodayStar && (
                            <circle r={circleR + 1} fill="none" stroke={'rgba(255,255,255,0.95)'} strokeWidth={1.1} />
                          )}
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={size}
                            stroke="black"
                            strokeWidth={0.6}
                            strokeOpacity={0.25}
                            style={{ opacity: recOp }}
                          >
                            {n.emo}
                          </text>
                          <text textAnchor="middle" dominantBaseline="central" fontSize={size} style={{ opacity: recOp }}>
                            {n.emo}
                          </text>
                          {isTodayStar && (
                            <circle
                              r={circleR + 2}
                              fill="none"
                              stroke={'rgba(255,255,255,0.9)'}
                              strokeWidth={1.2}
                              className="fd-pulse-once"
                            />
                          )}
                        </g>
                      );
                    })}
                  </g>
                </svg>
                {nodes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center" aria-label="No matching data">
                    <div className="text-sm text-white/65">
                      {search || filter !== 'all'
                        ? 'No emojis match the current filters yet.'
                        : 'No emoji data for this period yet. Log a few entries to light up the sky!'}
                    </div>
                  </div>
                )}

                <div
                  className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-xs font-medium select-none"
                  style={{ minHeight: '14px' }}
                >
                  {focus ? (
                    <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-white/80 backdrop-blur-sm">
                      <span className="mr-1">{focus}</span>
                      <span>×{freq.get(focus) || 0}</span>
                    </span>
                  ) : (
                    <span className="opacity-0">placeholder</span>
                  )}
                </div>
              </div>

              <ConstellationControls
                width={renderWidth}
                onAction={(action) => {
                  const v = viewRef.current;
                  const svg = svgElRef.current;
                  if (!svg) return;
                  const rect = svg.getBoundingClientRect();
                  const centerScreenX = rect.left + rect.width / 2;
                  const centerScreenY = rect.top + rect.height / 2;
                  if (action === 'reset') {
                    v.targetScale = DEFAULT_SCALE;
                    v.targetTx = worldWidth / 2 - (worldWidth / 2) * DEFAULT_SCALE;
                    v.targetTy = worldHeight / 2 - (worldHeight / 2) * DEFAULT_SCALE;
                    triggerRender();
                    return;
                  }
                  const factor = action === 'in' ? 1.25 : 1 / 1.25;
                  const targetScale = clamp(v.scale * factor, 0.55, 3.5);
                  const worldCx = (centerScreenX - rect.left - v.tx) / v.scale;
                  const worldCy = (centerScreenY - rect.top - v.ty) / v.scale;
                  v.targetScale = targetScale;
                  v.targetTx = centerScreenX - rect.left - worldCx * targetScale;
                  v.targetTy = centerScreenY - rect.top - worldCy * targetScale;
                  triggerRender();
                }}
              />
            </div>
          </div>
        </div>

        <aside className={layout === 'wide' ? 'flex-shrink-0 space-y-4 lg:w-80' : 'mt-4 space-y-4'}>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white/85">Focus details</div>
              {focus && (
                <button
                  onClick={() => setFocus(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 transition hover:bg-white/10"
                >
                  Clear
                </button>
              )}
            </div>
            {focus ? (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>{focus}</span>
                  <span className="text-sm text-white/65">×{focusUsage}</span>
                </div>
                <div className="text-xs text-white/60">
                  {focusDaysAgo === null
                    ? 'No recency data yet.'
                    : focusDaysAgo === 0
                      ? 'Last used today'
                      : `Last used ${focusDaysAgo} day${focusDaysAgo === 1 ? '' : 's'} ago`}
                </div>
                {focusConnections.length ? (
                  <ul className="space-y-2 text-sm">
                    {focusConnections.map((conn) => (
                      <li
                        key={conn.emoji}
                        className={`flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 ${
                          conn.visible ? 'bg-white/5 text-white/85' : 'bg-black/20 text-white/45'
                        }`}
                      >
                        <span>{conn.emoji}</span>
                        <span className="text-xs">×{conn.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-white/55">No linked emojis yet.</div>
                )}
              </div>
            ) : (
              <div className="mt-3 text-xs text-white/60">
                Tap an emoji in the constellation to see its strongest companions and recency information.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white backdrop-blur-sm">
            <div className="text-sm font-semibold text-white/85">Last 7 days</div>
            {trendingEmojis.length ? (
              <ul className="mt-3 grid grid-cols-2 gap-2 text-base">
                {trendingEmojis.map(([emo, count]) => (
                  <li
                    key={emo}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-black/25 px-3 py-2 text-white/85"
                  >
                    <span>{emo}</span>
                    <span className="text-xs">×{count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 text-xs text-white/55">Add more entries to see trending emojis.</div>
            )}
          </div>
        </aside>
      </div>
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