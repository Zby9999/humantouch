/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import { LIMITS, clamp, type Panel } from "./panel-widths";

/** How long the pointer rests on a panel's edge before the grip shows (designer, 2026-11-08): passing over it, nothing. */
const HOVER_INTENT_MS = 200;
/** An arrow key moves the edge this far; with ⇧, `KEY_STEP_LARGE` (designer, 2026-11-08). */
const KEY_STEP = 8;
const KEY_STEP_LARGE = 32;
/** Half the grip's height (Figma: 03 Kind, node 169:1379): it stays on the screen, the pointer at its middle. */
const GRIP_HALF = 24;

const LABELS: Record<Panel, string> = { layers: "Resize the Layers panel", design: "Resize the Design panel" };

interface Props {
  panel: Panel;
  /** The panel's width now. */
  width: number;
  /** The widest it can go now: within its own limit, leaving the canvas its room. */
  max: number;
  /** While dragged: the width to show, at once, without rendering the shell anew. Null: let go where it began. */
  onDrag(width: number | null): void;
  /** Let go, or moved by a key: the width to keep. */
  onCommit(width: number): void;
}

/**
 * A panel's inner edge, 6px straddling it, that resizes the panel (designer, 2026-11-08): the pointer resting on it a
 * moment, the grip drawn in Figma (the designer's 手柄; not a Handle, which resizes a layer) shows at the pointer and follows it up and down; pressed, the grip and the panel's
 * whole edge take the accent, and the panel follows the pointer across. Focused from the keyboard, ← and → move the edge.
 */
export function PanelResizer({ panel, width, max, onDrag, onCommit }: Props) {
  const { min } = LIMITS[panel];
  /** Which way the panel widens as the edge moves right: the Layers' edge is their right one, the Design panel's its left. */
  const sign = panel === "layers" ? 1 : -1;
  const zone = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const [pressed, setPressed] = useState(false);
  const intent = useRef<ReturnType<typeof setTimeout>>(undefined);
  const drag = useRef<{ x: number; from: number; now: number } | null>(null);
  const latest = useRef({ width, max, min });
  latest.current = { width, max, min };
  useEffect(() => () => clearTimeout(intent.current), []);

  const within = (n: number) => Math.round(clamp(n, latest.current.min, latest.current.max));
  /** The grip at the pointer's height, kept whole on the screen. */
  const follow = (clientY: number) => {
    const el = grip.current;
    if (!el) return;
    el.style.top = `${Math.min(innerHeight - GRIP_HALF, Math.max(GRIP_HALF, clientY))}px`;
  };
  const end = (event: PointerEvent) => {
    const now = drag.current;
    if (!now) return;
    drag.current = null;
    if (zone.current?.hasPointerCapture(event.pointerId)) zone.current.releasePointerCapture(event.pointerId);
    setPressed(false);
    if (now.now !== now.from) onCommit(now.now);
    else onDrag(null);
  };

  return (
    <div
      ref={zone}
      class={`ht-resizer is-${panel}${shown || pressed ? " is-shown" : ""}${pressed ? " is-pressed" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={LABELS[panel]}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerEnter={(event) => {
        // A touch has no hover: there is no resting on the edge, only pressing it.
        if (event.pointerType === "touch" || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        follow(event.clientY);
        clearTimeout(intent.current);
        intent.current = setTimeout(() => setShown(true), HOVER_INTENT_MS);
      }}
      onPointerMove={(event) => {
        follow(event.clientY);
        const now = drag.current;
        if (!now) return;
        const next = within(now.from + sign * (event.clientX - now.x));
        if (next === now.now) return;
        now.now = next;
        zone.current?.setAttribute("aria-valuenow", String(next));
        onDrag(next);
      }}
      onPointerLeave={() => {
        clearTimeout(intent.current);
        if (!drag.current) setShown(false);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // No text selected across the panels as it drags; focus stays where it was.
        event.preventDefault();
        clearTimeout(intent.current);
        follow(event.clientY);
        zone.current?.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, from: latest.current.width, now: latest.current.width };
        setShown(true);
        setPressed(true);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        const step = (event.shiftKey ? KEY_STEP_LARGE : KEY_STEP) * (event.key === "ArrowRight" ? 1 : -1);
        const next = within(latest.current.width + sign * step);
        if (next !== latest.current.width) onCommit(next);
      }}
    >
      <span ref={grip} class="ht-resizer-grip" aria-hidden="true" />
    </div>
  );
}
