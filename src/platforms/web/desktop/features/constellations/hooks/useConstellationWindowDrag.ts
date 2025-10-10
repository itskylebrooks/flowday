import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp } from '@shared/lib/utils';

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startTx: number;
  startTy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type WindowPosition = { x: number; y: number };

function getViewportSize(rect: DOMRect) {
  if (typeof window === 'undefined') {
    return { width: rect.width, height: rect.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function scheduleTransform(
  element: HTMLDivElement | null,
  rafRef: React.MutableRefObject<number | null>,
  position: WindowPosition
) {
  if (!element) return;
  const apply = () => {
    element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
  };
  if (typeof window === 'undefined') {
    apply();
    return;
  }
  if (rafRef.current != null) {
    window.cancelAnimationFrame(rafRef.current);
  }
  rafRef.current = window.requestAnimationFrame(apply);
}

export function useConstellationWindowDrag() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const positionRef = useRef<WindowPosition>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const applyPosition = useCallback((next: WindowPosition) => {
    positionRef.current = next;
    scheduleTransform(frameRef.current, rafRef, next);
  }, []);

  const recalcBounds = useCallback(() => {
    const el = frameRef.current;
    if (!el) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    const rect = el.getBoundingClientRect();
    const viewport = getViewportSize(rect);
    const marginX = Math.min(120, Math.max(24, rect.width * 0.22));
    const marginY = Math.min(120, Math.max(24, rect.height * 0.22));
    const minX = marginX - rect.left;
    const maxX = viewport.width - marginX - rect.right;
    const minY = marginY - rect.top;
    const maxY = viewport.height - marginY - rect.bottom;
    return { minX, maxX, minY, maxY };
  }, []);

  const resetWindow = useCallback(() => {
    applyPosition({ x: 0, y: 0 });
  }, [applyPosition]);

  const nudgeWindow = useCallback(
    (dx: number, dy: number) => {
      const bounds = recalcBounds();
      let nx = positionRef.current.x + dx;
      let ny = positionRef.current.y + dy;
      if (bounds.minX <= bounds.maxX) {
        nx = clamp(nx, bounds.minX, bounds.maxX);
      } else {
        nx = positionRef.current.x;
      }
      if (bounds.minY <= bounds.maxY) {
        ny = clamp(ny, bounds.minY, bounds.maxY);
      } else {
        ny = positionRef.current.y;
      }
      applyPosition({ x: nx, y: ny });
    },
    [applyPosition, recalcBounds]
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current) return;
    const el = frameRef.current;
    if (!el) return;
    if (event.button !== undefined && event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      return;
    }
    const rect = el.getBoundingClientRect();
    const viewport = getViewportSize(rect);
    const marginX = Math.min(120, Math.max(24, rect.width * 0.22));
    const marginY = Math.min(120, Math.max(24, rect.height * 0.22));
    const minX = marginX - rect.left;
    const maxX = viewport.width - marginX - rect.right;
    const minY = marginY - rect.top;
    const maxY = viewport.height - marginY - rect.bottom;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTx: positionRef.current.x,
      startTy: positionRef.current.y,
      minX,
      maxX,
      minY,
      maxY,
    };
    setDragging(true);
    event.preventDefault();
    event.stopPropagation();
    if (typeof (event.currentTarget as HTMLElement).setPointerCapture === 'function') {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    let nx = drag.startTx + dx;
    let ny = drag.startTy + dy;
    if (drag.minX <= drag.maxX) {
      nx = clamp(nx, drag.minX, drag.maxX);
    } else {
      nx = drag.startTx;
    }
    if (drag.minY <= drag.maxY) {
      ny = clamp(ny, drag.minY, drag.maxY);
    } else {
      ny = drag.startTy;
    }
    applyPosition({ x: nx, y: ny });
  }, [applyPosition]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (typeof (event.currentTarget as HTMLElement).releasePointerCapture === 'function') {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    resetWindow();
    return () => {
      if (rafRef.current != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [resetWindow]);

  return {
    windowRef: frameRef,
    dragHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onPointerLeave: endDrag,
    } as const,
    resetWindow,
    nudgeWindow,
    dragging,
  };
}
