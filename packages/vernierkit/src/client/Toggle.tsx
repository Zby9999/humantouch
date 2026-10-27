/** @jsxImportSource preact */
import type { ComponentChildren, TargetedKeyboardEvent, TargetedPointerEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { UNLOCK_HOLD_MS } from "./motion";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CORNER_KEY = "vernierkit:toggle-corner";
const CORNERS: Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
/** Pointer travel (px) before a press counts as a drag instead of a click. */
const DRAG_THRESHOLD = 4;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/**
 * The single control in preview mode; edit mode has its own way back, beside
 * the Design panel's title. Drag it to any corner; click it to enter edit mode
 * (or, while the canvas grows back over the page, to turn back to it). While the Agent applies the round
 * it is locked, its ring fills as changes are done, and pressing and holding
 * it unlocks it.
 */
interface Props {
  /** Changes not yet applied, shown as a badge, which opens the change list. */
  changeCount: number;
  /** The change list is open. */
  changesOpen: boolean;
  onShowChanges(): void;
  /** The Agent is applying the round: how many of its changes are done. */
  applying: { done: number; total: number } | null;
  onUnlock(): void;
  /** `animate` is false when the toggle was pressed from the keyboard: then the switch is instant. */
  onToggle(animate: boolean): void;
  /** Shown beside the toggle, and the change list above or below it. */
  children?: ComponentChildren;
}

export function Toggle({ changeCount, changesOpen, onShowChanges, applying, onUnlock, onToggle, children }: Props) {
  const [corner, setCorner] = useState<Corner>(readCorner);
  const [dragging, setDragging] = useState(false);
  const [settles, setSettles] = useState(0);
  const dock = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const dropFrom = useRef<DOMRect | null>(null);
  const suppressClick = useRef(false);
  const [holding, setHolding] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Enter or Space is down: a held Enter repeats clicks, none of which is a switch. */
  const keyHeld = useRef(false);
  const latestOnUnlock = useRef(onUnlock);
  latestOnUnlock.current = onUnlock;
  const startHold = () => {
    clearTimeout(hold.current);
    setHolding(true);
    hold.current = setTimeout(() => {
      setHolding(false);
      // Letting go clicks, and by then the toggle may be unlocked: that click is not a switch.
      suppressClick.current = true;
      latestOnUnlock.current();
    }, UNLOCK_HOLD_MS);
  };
  const endHold = () => {
    clearTimeout(hold.current);
    setHolding(false);
  };
  useEffect(() => endHold, []);
  // Unlocked some other way while held: nothing left to unlock.
  useEffect(() => {
    if (!applying) endHold();
  }, [!applying]);

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

  const onPointerDown = (event: TargetedPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    if (applying) startHold();
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
      endHold(); // A drag, not a hold.
    }
    dock.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const endDrag = (event: TargetedPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    endHold();
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

  const onClick = (event: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (applying || keyHeld.current) return;
    // A click from Enter or Space carries no click count.
    onToggle(event.detail > 0);
  };

  // Held from the keyboard too.
  const onKeyDown = (event: TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
    suppressClick.current = false;
    if (!applying) return;
    keyHeld.current = true;
    startHold();
  };
  const onKeyUp = (event: TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    keyHeld.current = false;
    endHold();
  };

  const label = applying ? "Vernier Kit: applying design changes. Press and hold to unlock." : "Vernier Kit: enter edit mode";

  return (
    <div ref={dock} class={dragging ? "vk-dock is-dragging" : "vk-dock"} data-corner={corner}>
      <div class={holding ? "vk-toggle-wrap is-holding" : "vk-toggle-wrap"}>
        <button
          type="button"
          class="vk-toggle"
          aria-label={label}
          title={applying ? "Applying design changes. Press and hold to unlock." : undefined}
          aria-disabled={applying ? "true" : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={() => {
            keyHeld.current = false;
            endHold();
          }}
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
        {applying && <ProgressRing {...applying} />}
        {changeCount > 0 && (
          <button
            type="button"
            class="vk-badge"
            data-vk-changes-opener=""
            aria-label={`${changeCount} ${changeCount === 1 ? "change" : "changes"} not applied yet`}
            aria-haspopup="dialog"
            aria-expanded={changesOpen}
            onClick={onShowChanges}
          >
            {changeCount}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Around the locked toggle: fills as the Agent applies the round, and with a hold, shows how long is left to hold. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  return (
    <svg
      class="vk-progress"
      viewBox="0 0 48 48"
      role="progressbar"
      aria-label="Applying design changes"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <circle class="vk-progress-track" cx="24" cy="24" r="22" pathLength={1} />
      <circle class="vk-progress-done" cx="24" cy="24" r="22" pathLength={1} style={{ strokeDashoffset: total ? 1 - done / total : 1 }} />
      <circle class="vk-progress-hold" cx="24" cy="24" r="22" pathLength={1} />
    </svg>
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
