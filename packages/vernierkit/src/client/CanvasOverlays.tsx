/** @jsxImportSource preact */
/**
 * What is drawn over the canvas, above the views, so its lines stay 1px and
 * its labels one size at any zoom: the selection box and the outline of the
 * layer pointed at, the marks a dragged layer snaps to and the distances
 * measured, and, beside the layer selected, its brief and the selection toolbar.
 */
import { useState } from "preact/hooks";
import type { Camera } from "./camera";
import { Icon } from "./icons";
import { role, type Layer } from "./layers";
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
      class="vk-brief"
      style={{ left: `${camera.x + r.right * camera.zoom + 8}px`, top: `${camera.y + r.top * camera.zoom}px` }}
      // A press here is not on the canvas.
      onPointerDown={(event) => event.stopPropagation()}
      onDblClick={(event) => event.stopPropagation()}
    >
      <button type="button" class="vk-brief-button" aria-expanded={open} title={brief || undefined} onClick={() => setOpen(!open)}>
        <Icon name="brief" />
        {brief ? "Brief" : "Add brief"}
      </button>
      {open && (
        <textarea
          class="vk-textarea vk-brief-text"
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
      class="vk-selection-toolbar"
      role="toolbar"
      aria-label="Selection"
      style={{ left: `${camera.x + r.right * camera.zoom}px`, top: `${camera.y + r.top * camera.zoom}px` }}
      // A press here is not on the canvas.
      onPointerDown={(event) => event.stopPropagation()}
      onDblClick={(event) => event.stopPropagation()}
    >
      {/* States (second version, ADR 0007): first in the row, for a component. */}
      <button type="button" class="vk-selection-tool" title={`Make these changes to ${component} itself, for every usage of it`} onClick={() => onPromote(layer)}>
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
    <div class="vk-marks" data-view={view} aria-hidden="true">
      {marks.map((mark, i) => {
        const a = at(mark.x1, mark.y1);
        const b = at(mark.x2, mark.y2);
        const across = mark.y1 === mark.y2;
        const style = across
          ? { left: `${a.x}px`, top: `${a.y}px`, width: `${b.x - a.x}px` }
          : { left: `${a.x}px`, top: `${a.y}px`, height: `${b.y - a.y}px` };
        const size = mark.type === "gap" || mark.type === "distance" ? mark.size : null;
        return (
          <div key={i} class="vk-mark" data-type={mark.type} data-across={across || undefined} style={style}>
            {size !== null && <span class="vk-mark-label">{formatPx(size)}</span>}
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
      class={hover ? "vk-hover" : "vk-selection"}
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
        <span class="vk-selection-lock">
          <Icon name="lock" />
        </span>
      )}
    </div>
  );
}
