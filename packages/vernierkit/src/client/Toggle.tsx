/** @jsxImportSource preact */
import type { TargetedPointerEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CORNER_KEY = "vernierkit:toggle-corner";
const CORNERS: Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
/** Pointer travel (px) before a press counts as a drag instead of a click. */
const DRAG_THRESHOLD = 4;
const HINT_MS = 2000;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/** The single control in preview mode. Drag it to any corner; click it to toggle modes. */
export function Toggle({ onToggle }: { onToggle: () => void }) {
  const [corner, setCorner] = useState<Corner>(readCorner);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState(false);
  const [settles, setSettles] = useState(0);
  const dock = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const dropFrom = useRef<DOMRect | null>(null);
  const suppressClick = useRef(false);

  // After a drop, slide from where the pointer let go into the new corner.
  useLayoutEffect(() => {
    const el = dock.current;
    const from = dropFrom.current;
    if (!el || !from) return;
    dropFrom.current = null;
    const to = el.getBoundingClientRect();
    el.style.transition = "none";
    el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
    el.getBoundingClientRect();
    el.style.transition = "";
    el.style.transform = "";
  }, [settles]);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  const onPointerDown = (event: TargetedPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const onPointerMove = (event: TargetedPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId || !dock.current) return;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      setHint(false);
    }
    dock.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const endDrag = (event: TargetedPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!d.moved || !dock.current) return;
    suppressClick.current = true;
    const rect = dock.current.getBoundingClientRect();
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const next = nearestCorner(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2);
    dropFrom.current = rect;
    dock.current.style.transform = "";
    setDragging(false);
    setCorner(next);
    setSettles((n) => n + 1);
    writeCorner(next);
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onToggle();
    // Placeholder until edit mode exists.
    setHint(true);
  };

  return (
    <div ref={dock} class={dragging ? "vk-dock is-dragging" : "vk-dock"} data-corner={corner}>
      <button
        type="button"
        class="vk-toggle"
        aria-label="Vernier Kit: enter edit mode"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onClick}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
          />
          <path d="M9.5 9.5 15 11.5l-2.25.75L12 14.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="vk-hint" role="status" hidden={!hint}>
        Edit mode is coming soon
      </div>
    </div>
  );
}

function nearestCorner(x: number, y: number): Corner {
  const vertical = y < window.innerHeight / 2 ? "top" : "bottom";
  const horizontal = x < window.innerWidth / 2 ? "left" : "right";
  return `${vertical}-${horizontal}`;
}

function readCorner(): Corner {
  try {
    const stored = localStorage.getItem(CORNER_KEY);
    if (CORNERS.includes(stored as Corner)) return stored as Corner;
  } catch {}
  return "bottom-right";
}

function writeCorner(corner: Corner) {
  try {
    localStorage.setItem(CORNER_KEY, corner);
  } catch {}
}
