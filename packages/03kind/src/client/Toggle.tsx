/** @jsxImportSource preact */
import type { ComponentChildren, TargetedKeyboardEvent, TargetedPointerEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { UNLOCK_HOLD_MS } from "./toggle-motion";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CORNER_KEY = "03kind:toggle-corner";
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
  // Until the rest of the editor layer has loaded there is no round to show: the count, the list and the lock come with it.
  /** Changes not yet applied, counted on a button beside the toggle, which opens the change list. */
  changeCount?: number;
  /** The change list is open. */
  changesOpen?: boolean;
  onShowChanges?(): void;
  /** The Agent is applying the round: how many of its changes are done. */
  applying?: { done: number; total: number } | null;
  onUnlock?(): void;
  /** `animate` is false when the toggle was pressed from the keyboard: then the switch is instant. */
  onToggle(animate: boolean): void;
  /** Edit mode has been asked for and is on its way: the editor layer is loading, or the canvas getting ready. Pressing it again does nothing. */
  busy?: boolean;
  /** The pointer is over the toggle, or it has focus: edit mode may well be asked for next. */
  onReady?(): void;
  /** The change list, above or below the toggle. */
  children?: ComponentChildren;
}

export function Toggle({ changeCount = 0, changesOpen, onShowChanges, applying, onUnlock, onToggle, busy = false, onReady, children }: Props) {
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
      latestOnUnlock.current?.();
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
    if (applying || busy || keyHeld.current) return;
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

  const label = applying ? "03Kind: applying design changes. Press and hold to unlock." : "03Kind: enter edit mode";

  return (
    <div ref={dock} class={dragging ? "tk-dock is-dragging" : "tk-dock"} data-corner={corner}>
      <div class={holding ? "tk-toggle-wrap is-holding" : "tk-toggle-wrap"}>
        <button
          type="button"
          class="tk-toggle"
          aria-label={label}
          data-tk-tip={applying ? "Applying design changes. Press and hold to unlock." : undefined}
          aria-disabled={applying ? "true" : undefined}
          aria-busy={busy && !applying ? "true" : undefined}
          onPointerEnter={onReady}
          onFocus={onReady}
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
          {/*
           * A pencil, for editing (designer, 2026-11-09), as the editor's icons are drawn: 13.5px, its line 1.05px on screen
           * (1.24 of its 16), round at its ends and corners.
           */}
          <svg width="13.5" height="13.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M13.05 5.15a.55.55 0 0 0-2.19-2.19L3.51 10.3a1.1 1.1 0 0 0-.27.46l-.73 2.39a.28.28 0 0 0 .34.34l2.39-.73a1.1 1.1 0 0 0 .46-.27zM9.65 4.15l2.2 2.2" />
          </svg>
        </button>
        {/* Not a badge on the toggle's corner, too easily pressed for it, but a button of its own after it, the two as one (designer, 2026-11-08). */}
        {changeCount > 0 && (
          <button
            type="button"
            class="tk-toggle-count"
            data-tk-changes-opener=""
            aria-label={`${changeCount} ${changeCount === 1 ? "change" : "changes"} not applied yet`}
            aria-haspopup="dialog"
            aria-expanded={changesOpen}
            onClick={onShowChanges}
          >
            {changeCount}
          </button>
        )}
        {applying && <ProgressRing {...applying} />}
      </div>
      {children}
    </div>
  );
}

/** Around the locked toggle: fills as the Agent applies the round, and with a hold, shows how long is left to hold. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  return (
    <svg
      class="tk-progress"
      viewBox="0 0 36 36"
      role="progressbar"
      aria-label="Applying design changes"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      {/* Around the toggle's rounded square (designer, 2026-11-08): where and how round, the styles' (`.tk-progress rect`). */}
      <rect class="tk-progress-track" pathLength={1} />
      <rect class="tk-progress-done" pathLength={1} style={{ strokeDashoffset: total ? 1 - done / total : 1 }} />
      <rect class="tk-progress-hold" pathLength={1} />
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
