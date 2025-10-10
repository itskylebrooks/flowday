import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Entry } from '@shared/lib/types/global';
import { clamp, emojiStats, hsl, last7, todayISO } from '@shared/lib/utils';

const MAX_VISIBLE_EMOJIS = 80;
const TIMEFRAME_OPTIONS = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  all: 'All time',
} as const;
type TimeframeKey = keyof typeof TIMEFRAME_OPTIONS;

export default function ConstellationsPage({ entries, yearKey }: { entries: Entry[]; yearKey?: string }) {
  const [timeframe, setTimeframe] = useState<TimeframeKey>('30d');
  const [searchTerm, setSearchTerm] = useState('');
  const [focus, setFocus] = useState<string | null>(null);

  const todayIso = todayISO();
  const filteredEntries = useMemo(() => {
    if (timeframe === 'all') return entries;
    if (timeframe === 'today') return entries.filter((e) => e.date === todayIso);
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const anchor = new Date(`${todayIso}T00:00:00`);
    const cutoff = new Date(anchor.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return entries.filter((e) => e.date >= cutoffIso);
  }, [entries, timeframe, todayIso]);

  const { freq, pair } = useMemo(() => emojiStats(filteredEntries), [filteredEntries]);

  // Show all emojis (sorted by frequency). Limit visible nodes for performance.
  const topEmojis = useMemo(
    () => [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_VISIBLE_EMOJIS),
    [freq],
  );
  const hiddenEmojiCount = Math.max(0, freq.size - topEmojis.length);

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

  // Throttle renders to ~30fps to avoid React churn when many nodes move
  const lastRenderRef = useRef<number>(0);
  function triggerRender() {
    const now = performance.now();
    if (now - lastRenderRef.current >= 33) {
      lastRenderRef.current = now;
      setTick(t => t + 1);
    }
  }

  const toggleFocus = useCallback((emoji: string) => {
    setFocus((prev) => (prev === emoji ? null : emoji));
  }, []);

  const timeframeLabel = TIMEFRAME_OPTIONS[timeframe];
  const totalEntriesCount = filteredEntries.length;
  const activeDays = useMemo(() => {
    const unique = new Set<string>();
    for (const entry of filteredEntries) unique.add(entry.date);
    return unique.size;
  }, [filteredEntries]);
  const totalEmojiUses = useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + entry.emojis.length, 0),
    [filteredEntries],
  );
  const averagePerEntry = totalEntriesCount ? totalEmojiUses / totalEntriesCount : 0;

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const searchableEmojis = useMemo(() => {
    if (!normalizedSearch) return topEmojis;
    return topEmojis.filter(([emo]) => emo.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, topEmojis]);
  const quickEmojiList = useMemo(() => searchableEmojis.slice(0, 12), [searchableEmojis]);
  const summaryStats = useMemo(
    () => [
      { label: 'Unique emoji', value: freq.size.toString() },
      { label: 'Entries', value: totalEntriesCount.toString() },
      { label: 'Active days', value: activeDays.toString() },
      {
        label: 'Avg emoji / entry',
        value: Number.isFinite(averagePerEntry) ? averagePerEntry.toFixed(1) : '0.0',
      },
    ],
    [freq.size, totalEntriesCount, activeDays, averagePerEntry],
  );
  const searchActive = normalizedSearch.length > 0;

  const handleTimeframeChange = useCallback((key: TimeframeKey) => {
    setTimeframe(key);
  }, []);

  useEffect(() => {
    if (!normalizedSearch) return;
    const first = searchableEmojis[0]?.[0];
    if (first) {
      setFocus((prev) => (prev === first ? prev : first));
    }
  }, [normalizedSearch, searchableEmojis]);

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
  for (const e of filteredEntries) if (e.date === todayIso) for (const emo of Array.from(new Set(e.emojis))) todaySet.add(emo);

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
  }, [topEmojis, pair, freq, filteredEntries, todayIso]);

  // Reset view transform when the dataset changes (year navigation or timeframe switch)
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
  }, [filteredEntries, timeframe, yearKey]);

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
      toggleFocus(emo);
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

  const topPairsList = useMemo(() => {
    return [...pair.entries()]
      .map(([key, weight]) => {
        const [a, b] = key.split('__');
        return { a, b, weight };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);
  }, [pair]);

  const focusConnections = useMemo(() => {
    if (!focus) return [] as { emoji: string; weight: number }[];
    const next: { emoji: string; weight: number }[] = [];
    for (const [key, weight] of pair.entries()) {
      const [a, b] = key.split('__');
      if (a === focus) next.push({ emoji: b, weight });
      else if (b === focus) next.push({ emoji: a, weight });
    }
    next.sort((a, b) => b.weight - a.weight);
    return next.slice(0, 8);
  }, [focus, pair]);
  const focusCount = focus ? freq.get(focus) || 0 : 0;
  const focusLastSeen = focus ? lastUsed.get(focus) : undefined;
  const focusDaysAgo = focusLastSeen ? daysBetween(todayIso, focusLastSeen.date) : null;
  const focusRecencyLabel = focusLastSeen
    ? focusDaysAgo === 0
      ? 'Today'
      : `${focusDaysAgo} day${focusDaysAgo === 1 ? '' : 's'} ago`
    : null;
  const datasetEmpty = nodes.length === 0;

  // Reset focus when dataset changes (e.g., year navigation or timeframe switch)
  useEffect(()=>{ setFocus(null); }, [filteredEntries, timeframe]);
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
    for (const e of filteredEntries) {
      for (const emo of Array.from(new Set(e.emojis))) {
        const cur = map.get(emo);
        if (!cur || e.date > cur.date) map.set(emo, { date: e.date, hue: e.hue });
      }
    }
    return map;
  }, [filteredEntries]);

  // Compute circular mean hue across all entries per emoji (used when emoji not chosen today)
  const mixedHueByEmoji = useMemo(() => {
    const buckets = new Map<string, number[]>();
    for (const e of filteredEntries) {
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
  }, [filteredEntries]);

  // Which emojis appeared in the most recent 7 days (for soft teal glow)
  const recent7Emojis = useMemo(() => new Set<string>(last7(filteredEntries).flatMap(e => e.emojis)), [filteredEntries]);

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
    <div className="flex h-full flex-col gap-6 text-white select-none" style={{ touchAction: 'none' }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.4em] text-white/45">Emoji constellations</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Explore your emoji universe</h1>
          <p className="mt-2 max-w-xl text-sm text-white/65">
            Drag, zoom, and focus to see how your most-used emoji connect across {timeframeLabel.toLowerCase()}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(TIMEFRAME_OPTIONS) as [TimeframeKey, string][]).map(([key, label]) => {
            const active = timeframe === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleTimeframeChange(key)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
                  active ? 'bg-white/20 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.25)]' : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <section className="flex-1 space-y-4">
          <div
            key={yearKey}
            className="relative overflow-hidden rounded-2xl border border-white/5 bg-black/30 p-4 shadow-inner shadow-black/30 backdrop-blur"
            style={{ touchAction: 'none' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
              <span>
                {datasetEmpty
                  ? 'No emoji activity in this range yet. Try a wider timeframe.'
                  : 'Drag to pan, click to focus, and use your trackpad or mouse wheel to zoom.'}
              </span>
              {hiddenEmojiCount > 0 && (
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
                  Showing top {topEmojis.length} · +{hiddenEmojiCount} hidden
                </span>
              )}
            </div>
            <div className="mt-3 flex justify-center">
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
                        stroke="rgba(230,230,230,0.95)"
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
                          <circle r={circleR + 1} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={1.1} />
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
                          <circle r={circleR + 2} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.2} className="fd-pulse-once" />
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
            {datasetEmpty && (
              <div className="absolute inset-0 flex items-center justify-center text-[7rem] text-white/15" aria-label="No data yet">
                ?
              </div>
            )}
            {focus && (
              <div className="pointer-events-none absolute inset-x-4 bottom-3 flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
                  <span className="text-base">{focus}</span>
                  <span className="text-white/60">×{focusCount}</span>
                </span>
              </div>
            )}
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
        </section>

        <aside className="w-full space-y-4 xl:w-80 xl:flex-shrink-0">
          <div className="rounded-2xl border border-white/5 bg-black/30 p-4 shadow-inner shadow-black/25 backdrop-blur">
            <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-white/45">Activity at a glance</div>
            <div className="grid grid-cols-2 gap-3">
              {summaryStats.map((stat) => (
                <div key={stat.label} className="rounded-lg bg-white/5 px-3 py-2">
                  <div className="text-[11px] uppercase text-white/45">{stat.label}</div>
                  <div className="mt-1 text-lg font-semibold text-white">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/30 p-4 shadow-inner shadow-black/25 backdrop-blur space-y-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Search & spotlight</div>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Type an emoji or paste from clipboard"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            {searchActive && quickEmojiList.length === 0 ? (
              <p className="text-xs text-white/55">No emoji match this search within the selected timeframe.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {quickEmojiList.map(([emo, count]) => {
                  const active = focus === emo;
                  return (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => toggleFocus(emo)}
                      className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                        active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'
                      }`}
                    >
                      <span>{emo}</span>
                      <span className="text-xs text-white/60">×{count}</span>
                    </button>
                  );
                })}
                {!quickEmojiList.length && (
                  <span className="text-xs text-white/50">No emoji to show yet.</span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/30 p-4 shadow-inner shadow-black/25 backdrop-blur space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Focused emoji</div>
              {focus && (
                <button
                  type="button"
                  onClick={() => setFocus(null)}
                  className="text-xs text-white/60 transition hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            {focus ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{focus}</span>
                  <div>
                    <div className="text-sm font-semibold text-white">×{focusCount}</div>
                    <div className="text-xs text-white/55">
                      {focusRecencyLabel ? `Last used ${focusRecencyLabel}` : 'No usage recorded in this range'}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/45">Strongest links</div>
                  {focusConnections.length ? (
                    <div className="space-y-2">
                      {focusConnections.map(({ emoji, weight }) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => toggleFocus(emoji)}
                          className="flex w-full items-center justify-between rounded-xl bg-white/5 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                        >
                          <span>{emoji}</span>
                          <span className="text-xs text-white/55">×{weight}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/55">No co-occurring emoji in this range yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/60">Select an emoji from the constellation or quick list to inspect its network.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/30 p-4 shadow-inner shadow-black/25 backdrop-blur">
            <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-white/45">Top pairings</div>
            {topPairsList.length ? (
              <ul className="space-y-2 text-sm text-white/80">
                {topPairsList.map(({ a, b, weight }) => (
                  <li key={`${a}-${b}`} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFocus(a)}
                        className={`rounded-full px-2 py-0.5 text-base transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                          focus === a ? 'bg-white text-black' : 'bg-black/30 text-white'
                        }`}
                      >
                        {a}
                      </button>
                      <span className="text-white/50">+</span>
                      <button
                        type="button"
                        onClick={() => toggleFocus(b)}
                        className={`rounded-full px-2 py-0.5 text-base transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                          focus === b ? 'bg-white text-black' : 'bg-black/30 text-white'
                        }`}
                      >
                        {b}
                      </button>
                    </div>
                    <span className="text-xs text-white/55">×{weight}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-white/60">We need more data in this range to surface pair insights.</p>
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