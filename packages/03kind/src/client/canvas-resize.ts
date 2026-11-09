/**
 * A resize on the canvas under way: a handle of the layer selected, pressed in
 * a view and dragged (ticket 69). Each move of the pointer is a step of one
 * resize (`Editor.resize`): the layer is resized on the canvas as it goes, in
 * the view dragged in at once, in the views beside once the pointer pauses
 * (ADR 0011). Read in the view dragged in, in its px, as the layer was laid
 * out once the pointer had moved far enough to begin.
 */
import { DRAG_THRESHOLD, type At } from "./canvas-drag";
import type { Editor, ResizeTo } from "./edit-commands";
import type { Layer } from "./layers";
import type { Edge, PlacedFrom } from "./checkable";
import { heldCentered, placedFrom } from "./placed-from";
import { readValue, round } from "./property-table";
import { marksOf, middlesOf, resizeBox, type Handle, type Limits, type Middles } from "./resize";
import type { Axis, Box, Mark } from "./snap";
import { insideBorder } from "./stacks";
import type { Shown } from "./view-layout";

/** Where the pointer is, and the keys that change a resize: ⌘ (Ctrl) not snapping, ⇧ keeping proportions, ⌥ from the middle. */
export type ResizePointer = At & Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

/** What the resize began from, once the pointer had moved far enough. */
interface Begun {
  box: DOMRect;
  /**
   * Placed freely in the view dragged in: its X and Y, its `right` and
   * `bottom`, and how it is placed each way (ticket 75), which it stays; null:
   * in its container's layout, which places it.
   */
  place: { x: number; y: number; right: number; bottom: number; placedFrom: Record<Axis, PlacedFrom> } | null;
  limits: Limits;
  /** What its edges snap to: its container inside its border, and, placed freely, the layers beside it. */
  targets: Box[];
}

/** A handle pressed, and the resize it makes as it is dragged: from the press till it is let go or Esc cancels it. */
export interface ResizeSession {
  pointerId: number;
  layer: Layer;
  /** The view the handle was pressed in: the one worked in, whose breakpoint the resize is at. */
  in: Shown;
  handle: Handle;
  /** Where the pointer was pressed, in the window. */
  from: At;
  /**
   * The whole of a layer off the canvas, alone in the blank space (ticket
   * 107): where its top left was on the stage as pressed. Its edges snap to
   * nothing there; its top left goes as far as the box's does, so the edges
   * not dragged stay where they are.
   */
  whole?: { x: number; y: number };
  begun: Begun | null;
  /** Its first step has gone to the editor, though it may have changed nothing: Esc takes back what the resize has changed. */
  stepped: boolean;
  /** What a step has set so far: each step sets it again, as the handle has it then, though back where it began. */
  set: Set<keyof ResizeTo>;
  /** Where the pointer was last, to resize again there as a key is pressed or let go. */
  pointer?: ResizePointer;
  /** Ends the press: the keys edit again (ADR 0012). */
  release(): void;
}

/** One step of a resize: what the layer is resized to, in design language, and where its box goes and the marks it snapped to, in the view's px. */
export interface ResizeStep {
  to: ResizeTo;
  box: Box;
  marks: Mark[];
  /** The whole of a layer off the canvas resized: where its top left goes on the stage. */
  at?: { x: number; y: number };
}

/**
 * Where the resize is with the pointer at `pointer`, at `zoom` (screen px per
 * px of the view), snapping within `snapWithin` px on screen unless ⌘ (Ctrl)
 * is held; null while the pointer is still within `DRAG_THRESHOLD` of where
 * it was pressed. `editor` reads the layer as the view dragged in shows it.
 * Notes where the pointer is, and, the first time it has gone far enough,
 * what the resize begins from.
 */
export function resizeStep(session: ResizeSession, editor: Editor, pointer: ResizePointer, zoom: number, snapWithin: number): ResizeStep | null {
  session.pointer = { clientX: pointer.clientX, clientY: pointer.clientY, metaKey: pointer.metaKey, ctrlKey: pointer.ctrlKey, shiftKey: pointer.shiftKey, altKey: pointer.altKey };
  const dx = pointer.clientX - session.from.clientX;
  const dy = pointer.clientY - session.from.clientY;
  if (!session.begun && Math.hypot(dx, dy) < DRAG_THRESHOLD) return null;
  const begun = (session.begun ??= begin(session, editor));
  const snapping = !(pointer.metaKey || pointer.ctrlKey);
  const resized = resizeBox({
    handle: session.handle,
    start: begun.box,
    by: { x: dx / zoom, y: dy / zoom },
    keepRatio: pointer.shiftKey,
    fromCenter: pointer.altKey,
    centered: centeredOf(begun),
    limits: begun.limits,
    snap: snapping ? { targets: begun.targets, within: snapWithin / zoom } : null,
  });
  const { box } = resized;
  const { place, box: was } = begun;
  // Placed freely, it moves as far as its top left does, or, placed from its right or bottom, as far as its bottom right does: the edges not dragged stay.
  // Centered, it stays where it is placed, growing on both sides alike.
  const [right, bottom] = [box.x + box.width - (was.x + was.width), box.y + box.height - (was.y + was.height)];
  const now: Required<ResizeTo> = {
    width: box.width,
    height: box.height,
    x: place ? round(place.x + box.x - was.x) : NaN,
    y: place ? round(place.y + box.y - was.y) : NaN,
    right: place ? round(place.right - right) : NaN,
    bottom: place ? round(place.bottom - bottom) : NaN,
  };
  if (resized.width) session.set.add("width");
  if (resized.height) session.set.add("height");
  // Centered, neither: it stays where it is placed.
  const by = (axis: Axis, edge: Edge) => !!place && !place.placedFrom[axis].centered && place.placedFrom[axis].edge === edge;
  if (by("x", "start") && box.x !== was.x) session.set.add("x");
  if (by("y", "start") && box.y !== was.y) session.set.add("y");
  if (by("x", "end") && right) session.set.add("right");
  if (by("y", "end") && bottom) session.set.add("bottom");
  // Once set, each is set as the handle has it now: dragged back, or with ⌥ or ⇧ let go, it goes back too.
  const to: ResizeTo = Object.fromEntries([...session.set].map((key) => [key, now[key]]));
  const { whole } = session;
  return { to, box, marks: resized.marks, ...(whole && { at: { x: whole.x + box.x - was.x, y: whole.y + box.y - was.y } }) };
}

/**
 * The lines the edges dragged line up on, as the layer is laid out in the view
 * dragged in now that it is resized: where its container places it otherwise
 * than where it was dragged to (a Stack centering it, say), those it snapped to
 * are not drawn where its edges are not. None, not snapping.
 */
export function marksNow(session: ResizeSession): Mark[] {
  const { begun, pointer, layer, handle } = session;
  const box = session.in.view.boxOf(layer);
  if (!begun || !pointer || pointer.metaKey || pointer.ctrlKey || !box) return [];
  return marksOf(box, handle, middlesOf(pointer.altKey, centeredOf(begun)), begun.targets);
}

/** The ways the layer is centered on where it is placed, and stays so as it is resized. */
function centeredOf({ place }: Begun): Middles {
  return { x: !!place?.placedFrom.x.centered, y: !!place?.placedFrom.y.centered };
}

/** What the resize begins from: the layer as the view dragged in lays it out now, and what the editor reads of it there. */
function begin({ layer, in: { view }, whole }: ResizeSession, editor: Editor): Begun {
  const box = view.boxOf(layer) ?? new DOMRect();
  const free = editor.can(layer, "x");
  const el = view.elementOf(layer.el) ?? layer.el;
  const place = free ? { x: editor.read(layer, "x"), y: editor.read(layer, "y"), right: editor.read(layer, "right"), bottom: editor.read(layer, "bottom"), placedFrom: { x: placedFrom(el, "x"), y: placedFrom(el, "y") } } : null;
  const style = getComputedStyle(el);
  const px = (names: string[]) => names.reduce((sum, name) => sum + (parseFloat(style.getPropertyValue(name)) || 0), 0);
  /** A minimum or maximum as the layer has it in this view, a locked layer's from its own styles too; null: none. */
  const limit = (property: "minWidth" | "maxWidth" | "minHeight" | "maxHeight") => readValue(el, property);
  // Its padding and border it keeps however small: no smaller than those it goes.
  // Centered by its auto margins, held by a maximum: no maximum, what the resize sets (ticket 97).
  const limits: Limits = {
    minWidth: Math.max(limit("minWidth") ?? 0, px(["padding-left", "padding-right", "border-left-width", "border-right-width"])),
    maxWidth: heldCentered(el, "x") ? Infinity : (limit("maxWidth") ?? Infinity),
    minHeight: Math.max(limit("minHeight") ?? 0, px(["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"])),
    maxHeight: heldCentered(el, "y") ? Infinity : (limit("maxHeight") ?? Infinity),
  };
  const targets: Box[] = [];
  const parent = layer.parent;
  const around = parent && view.boxOf(parent);
  // Alone in the blank space, there is nothing to line up with.
  if (parent && around && !whole) {
    targets.push(insideBorder(view.elementOf(parent.el) ?? parent.el, around));
    // In a layout, the layers beside it move as it is resized: only those placed freely stay to line up with.
    if (free) {
      for (const sibling of parent.children) {
        const r = sibling !== layer && !sibling.text && view.boxOf(sibling);
        if (r && (r.width || r.height)) targets.push(r);
      }
    }
  }
  return { box, place, limits, targets };
}

