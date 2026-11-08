/** @jsxImportSource preact */
/**
 * What is drawn over the canvas, above the views, so its lines stay 1px and
 * its labels one size at any zoom: the selection box and the outline of the
 * layer pointed at, the marks a dragged layer snaps to and the distances
 * measured, and, beside the layer selected, its brief and the selection toolbar,
 * and on it, its handles.
 */
import type { TargetedPointerEvent } from "preact";
import { useState } from "preact/hooks";
import type { Camera } from "./camera";
import { Icon } from "./icons";
import { role, type Layer } from "./layers";
import { HANDLES, sides, type Handle } from "./resize";
import type { Mark } from "./snap";
import type { View } from "./views";

interface BriefProps {
  layer: Layer;
  brief: string;
  /** The view it sits beside the layer in. */
  view: View;
  camera: Camera;
  onSetBrief(layer: Layer, brief: string): void;
}

/**
 * Beside a new Frame selected: the button that opens its brief, what the
 * Agent is to make in it. Typed in freely, set once left or on Enter; Esc
 * leaves it as it was.
 */
export function Brief({ layer, brief, view, camera, onSetBrief }: BriefProps) {
  const [open, setOpen] = useState(false);
  const r = view.boxOf(layer);
  const close = (text: string | null) => {
    setOpen(false);
    if (text !== null && text.trim() !== brief) onSetBrief(layer, text.trim());
  };
  if (!r) return null;
  return (
    <div
      class="tk-brief"
      style={{ left: `${camera.x + r.right * camera.zoom + 8}px`, top: `${camera.y + r.top * camera.zoom}px` }}
      // A press here is not on the canvas.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" class="tk-brief-button" aria-expanded={open} data-tk-tip={brief || undefined} onClick={() => setOpen(!open)}>
        <Icon name="brief" />
        {brief ? "Brief" : "Add brief"}
      </button>
      {open && (
        <textarea
          class="tk-textarea tk-brief-text"
          aria-label="Brief"
          placeholder="What should the Agent make here?"
          defaultValue={brief}
          ref={(el) => el?.focus()}
          onBlur={(event) => close(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close(null);
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      )}
    </div>
  );
}

interface SelectionToolbarProps {
  layer: Layer;
  /** The view it sits on the layer in. */
  view: View;
  camera: Camera;
  /** The layer has changes for its usage it can promote to its component. */
  promote: boolean;
  onPromote(layer: Layer): void;
}

/**
 * On the top right of the layer selected alone, always there: the buttons
 * for that layer, in one row, so none covers another. Promote, while it has
 * changes for its usage to promote to its component. The second version
 * puts States first, into the component's Sandbox (ADR 0007); not shown yet.
 * With no button to show, there is nothing.
 */
export function SelectionToolbar({ layer, view, camera, promote, onPromote }: SelectionToolbarProps) {
  const r = view.boxOf(layer);
  if (!r || !promote) return null;
  const component = layer.chain[0]?.component;
  return (
    <div
      class="tk-selection-toolbar"
      role="toolbar"
      aria-label="Selection"
      style={{ left: `${camera.x + r.right * camera.zoom}px`, top: `${camera.y + r.top * camera.zoom}px` }}
      // A press here is not on the canvas.
      onPointerDown={(event) => event.stopPropagation()}
    >
      {/* States (second version, ADR 0007): first in the row, for a component. */}
      <button type="button" class="tk-selection-tool" data-tk-tip={`Make these changes to ${component} itself, for every usage of it`} onClick={() => onPromote(layer)}>
        <Icon name="promote" />
        Promote
      </button>
    </div>
  );
}

interface MarksProps {
  marks: Mark[];
  /** What the view they are in is called. */
  view: string;
  camera: Camera;
}

/**
 * Marks over a view, as Figma draws its guides: red lines a dragged layer lines
 * up on, magenta spaces it is spaced as, red distances measured, each with
 * its length. Drawn above the canvas, so lines stay 1px and labels one size at any zoom.
 */
export function Marks({ marks, view, camera }: MarksProps) {
  const at = (x: number, y: number) => ({ x: camera.x + x * camera.zoom, y: camera.y + y * camera.zoom });
  return (
    <div class="tk-marks" data-view={view} aria-hidden="true">
      {marks.map((mark, i) => {
        const a = at(mark.x1, mark.y1);
        const b = at(mark.x2, mark.y2);
        const across = mark.y1 === mark.y2;
        const style = across
          ? { left: `${a.x}px`, top: `${a.y}px`, width: `${b.x - a.x}px` }
          : { left: `${a.x}px`, top: `${a.y}px`, height: `${b.y - a.y}px` };
        const size = mark.type === "gap" || mark.type === "distance" ? mark.size : null;
        return (
          <div key={i} class="tk-mark" data-type={mark.type} data-across={across || undefined} style={style}>
            {size !== null && <span class="tk-mark-label">{formatPx(size)}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** A length as a mark labels it: whole px, or to two places. */
function formatPx(n: number): string {
  return String(Math.round(n * 100) / 100);
}

interface OutlineProps {
  layer: Layer;
  /** The view it outlines the layer in, and what that view is called. */
  view: View;
  name: string;
  camera: Camera;
  /** The layer under the pointer rather than the selected one. */
  hover?: boolean;
  /** The text being typed in: blue, whatever the layer is. */
  typing?: boolean;
  hidden?: boolean;
}

/**
 * The selection box, or the outline of the layer a click would select. Drawn
 * above the canvas, so its lines stay 1px at any zoom. Blue, purple for an
 * instance, gray for a locked layer.
 */
export function Outline({ layer, view, name, camera, hover, hidden, typing }: OutlineProps) {
  const r = view.boxOf(layer);
  if (!r) return null;
  const kind = typing ? "typing" : role(layer);
  return (
    <div
      class={hover ? "tk-hover" : "tk-selection"}
      data-kind={kind}
      data-view={name}
      data-hidden={hidden || undefined}
      aria-hidden="true"
      style={{
        left: `${camera.x + r.left * camera.zoom}px`,
        top: `${camera.y + r.top * camera.zoom}px`,
        width: `${r.width * camera.zoom}px`,
        height: `${r.height * camera.zoom}px`,
      }}
    >
      {kind === "locked" && !hover && (
        <span class="tk-selection-lock">
          <Icon name="lock" />
        </span>
      )}
    </div>
  );
}

/** Each handle's cursor, as Figma's. */
const CURSORS: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

/** The cursor while a handle is pressed or dragged, wherever the pointer goes. */
export const handleCursor = (handle: Handle) => CURSORS[handle];

/** A corner's handle, on screen px: its square, centered on the corner. */
const CORNER = 8;
/**
 * On screen px: a layer smaller than this either way has its corners' handles
 * no larger to press than they look, and an edge shorter than this its handle
 * over theirs in its middle third, so its edges' can still be pressed.
 */
const SMALL = 24;
/** How far an edge's handle reaches out from the edge and, at most, into the layer, on screen px. */
const EDGE_REACH = 4;

interface HandlesProps {
  layer: Layer;
  view: View;
  /** What the view is called. */
  name: string;
  camera: Camera;
  /** A handle pressed: true when it is taken, to resize; false, the press is the canvas's (Space held: it pans). */
  onPress(handle: Handle, event: TargetedPointerEvent<HTMLDivElement>): boolean;
}

/**
 * On the layer selected alone, as Figma has them: a white square on each
 * corner, and along each edge a handle that shows only as the cursor, all
 * dragged to resize it. An edge's runs its whole length, under the corners',
 * and reaches a little way out of the layer and, no further than a quarter
 * of its size, into it, so a small layer can still be dragged by its middle;
 * shorter on screen than `SMALL`, its middle third is over the corners'.
 */
export function Handles({ layer, view, name, camera, onPress }: HandlesProps) {
  const r = view.boxOf(layer);
  if (!r) return null;
  const [left, top, width, height] = [camera.x + r.left * camera.zoom, camera.y + r.top * camera.zoom, r.width * camera.zoom, r.height * camera.zoom];
  const zoneOf = (handle: Handle): Record<string, string> => {
    const side = sides(handle);
    if (side.x && side.y) {
      const x = side.x < 0 ? left : left + width;
      const y = side.y < 0 ? top : top + height;
      return { left: `${x - CORNER / 2}px`, top: `${y - CORNER / 2}px`, width: `${CORNER}px`, height: `${CORNER}px` };
    }
    // An edge across the top or bottom, or down a side.
    const across = !side.x;
    const whole = across ? width : height;
    // Too short for the corners' squares to leave room between them: its middle third goes over them.
    const short = whole < SMALL;
    const length = short ? whole / 3 : whole;
    const along = (across ? left : top) + (short ? whole / 3 : 0);
    const inward = Math.min(EDGE_REACH, (across ? height : width) / 4);
    const facing = across ? side.y : side.x;
    const edge = across ? (facing < 0 ? top : top + height) : facing < 0 ? left : left + width;
    const from = facing < 0 ? edge - EDGE_REACH : edge - inward;
    const over: Record<string, string> = short ? { "z-index": "1" } : {};
    return across
      ? { left: `${along}px`, top: `${from}px`, width: `${length}px`, height: `${EDGE_REACH + inward}px`, ...over }
      : { left: `${from}px`, top: `${along}px`, width: `${EDGE_REACH + inward}px`, height: `${length}px`, ...over };
  };
  return (
    <div class="tk-handles" data-kind={role(layer)} data-view={name} data-small={Math.min(width, height) < SMALL || undefined} aria-hidden="true">
      {/* The edges' first, under the corners'. */}
      {[...HANDLES].reverse().map((handle) => {
        return (
          <div
            key={handle}
            class="tk-handle"
            data-handle={handle}
            data-corner={(sides(handle).x && sides(handle).y) || undefined}
            style={{ ...zoneOf(handle), cursor: CURSORS[handle] }}
            onPointerDown={(event) => {
              if (onPress(handle, event)) event.stopPropagation();
            }}
          />
        );
      })}
    </div>
  );
}

/** Below the layer being resized, in the view it is resized in: its size, as Figma shows it, W × H. */
export function SizeLabel({ layer, view, name, camera }: { layer: Layer; view: View; name: string; camera: Camera }) {
  const r = view.boxOf(layer);
  if (!r) return null;
  return (
    <div
      class="tk-size-label"
      data-view={name}
      aria-hidden="true"
      style={{ left: `${camera.x + (r.left + r.width / 2) * camera.zoom}px`, top: `${camera.y + r.bottom * camera.zoom + 8}px` }}
    >
      {formatPx(r.width)} × {formatPx(r.height)}
    </div>
  );
}
