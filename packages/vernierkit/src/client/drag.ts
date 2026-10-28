/**
 * Dragging a layer on the canvas: where it would go if let go now, and how the
 * layers around it make room. Nothing changes structure until the drop; while
 * the layer is dragged, layers are only shifted.
 */
import type { Destination, Editor } from "./edits";
import type { Layer } from "./layers";
import { snap, type Mark } from "./snap";
import type { View } from "./views";

export interface Drop {
  /** The Stack or Frame the layer would go into, and where in it. */
  to: Destination;
  /** Where in a Stack the layer would go, drawn as a line, in the view's px. None for an absolute place. */
  line: { x: number; y: number; width: number; height: number } | null;
  /** How far layers move aside to make room, by their element on the canvas, in the view's px. */
  shifts: Map<Element, { x: number; y: number }>;
  /** Where the layer goes, in the view's px: where it is dragged to, or, placed freely, where it snaps to. */
  box: DOMRect;
  /** The marks that show what it snapped to, placed freely, in the view's px; none in a Stack, which places it. */
  marks: Mark[];
}

/**
 * Where a dragged layer would go: into the Stack or Frame under the pointer
 * that can take it, outside the layer itself. A Stack or Frame beside the
 * layer is entered from its middle only; near its edges, the pointer is still
 * in the layout around it, so the layer goes beside it. `layer` null: a layer
 * off the canvas, coming back onto it (ADR 0009), which goes into the deepest
 * that can hold it. All as `view` lays it out, in its px: `box`, the layer
 * where it is dragged to; `rectOf`, where a layer was laid out before anything shifted.
 * Placed freely in a Frame, it snaps (`snapWithin` px, in the view's px; null:
 * not at all) to the edges and middles of the layers beside it and of the
 * Frame, and to the spacing between those layers.
 */
export function findDrop(
  editor: Editor,
  view: View,
  layer: Layer | null,
  point: { x: number; y: number },
  box: DOMRect,
  rectOf: (layer: Layer) => DOMRect,
  snapWithin: number | null = null,
): Drop | null {
  const home = layer?.parent ?? null;
  const el = (layer: Layer) => view.elementOf(layer.el) ?? layer.el;
  let container = view.layerAt(editor.tree(), point.x, point.y, layer ?? undefined);
  for (; container; container = container.parent) {
    if (!layer) {
      if (editor.canHold(container)) break;
      continue;
    }
    if (!editor.canDrop(layer, container)) continue;
    if (container.parent === home && !inMiddle(rectOf(container), point)) continue;
    break;
  }
  if (!container) return null;

  const area = rectOf(container);
  if (container.kind === "frame") {
    // Inside its border, where absolute layers are placed: as wide as it is laid out, to the fraction of a px.
    const border = getComputedStyle(el(container));
    const [left, top, right, bottom] = ["left", "top", "right", "bottom"].map((side) => parseFloat(border.getPropertyValue(`border-${side}-width`)) || 0);
    const inside = new DOMRect(area.left + left, area.top + top, area.width - left - right, area.height - top - bottom);
    let marks: Mark[] = [];
    let snapped = { x: false, y: false };
    if (snapWithin !== null) {
      // Those shown here only: one not drawn at this width has no edges to snap to.
      const siblings = container.children.filter((child) => child !== layer).map(rectOf).filter((r) => r.width || r.height);
      const to = snap(box, siblings, inside, snapWithin);
      snapped = { x: to.x !== box.x, y: to.y !== box.y };
      box = new DOMRect(to.x, to.y, box.width, box.height);
      marks = to.marks;
    }
    // Placed where it is let go: its left and top in the Frame, margins aside; snapped, exactly where it lines up.
    const margins = !layer || layer.text ? { marginLeft: "0", marginTop: "0" } : getComputedStyle(el(layer));
    const x = box.left - inside.left - parseFloat(margins.marginLeft);
    const y = box.top - inside.top - parseFloat(margins.marginTop);
    const at = (n: number, exact: boolean) => (exact ? Math.round(n * 100) / 100 : Math.round(n));
    return { to: { parent: container, x: at(x, snapped.x), y: at(y, snapped.y) }, line: null, shifts: new Map(), box, marks };
  }

  const horizontal = container.direction === "horizontal";
  const span = (r: DOMRect) => (horizontal ? [r.left, r.right] : [r.top, r.bottom]);
  const flow = container.children.filter((child) => child !== layer && !child.absolute);
  const at = horizontal ? point.x : point.y;
  let n = flow.findIndex((child) => {
    const [start, end] = span(rectOf(child));
    return at < (start + end) / 2;
  });
  if (n < 0) n = flow.length;
  const others = container.children.filter((child) => child !== layer);
  const index = n < flow.length ? others.indexOf(flow[n]) : others.length;

  // The layers between where it was and where it goes make room for it.
  const shifts = new Map<Element, { x: number; y: number }>();
  const room = (stack: Layer) => (stack.direction === "horizontal" ? box.width : box.height) + gapOf(stack, el(stack));
  const shift = (children: Layer[], stack: Layer, by: number) => {
    for (const child of children) {
      if (!child.text) shifts.set(child.el, stack.direction === "horizontal" ? { x: by, y: 0 } : { x: 0, y: by });
    }
  };
  const homeFlow = home?.children.filter((child) => !child.absolute) ?? [];
  const was = layer ? homeFlow.indexOf(layer) : -1;
  if (container === home && was >= 0) {
    if (n < was) shift(flow.slice(n, was), container, room(container));
    else shift(flow.slice(was, n), container, -room(container));
  } else {
    shift(flow.slice(n), container, room(container));
    if (was >= 0 && home!.kind === "stack") shift(homeFlow.slice(was + 1), home!, -room(home!));
  }

  const gap = gapOf(container, el(container));
  const style = getComputedStyle(el(container));
  const main =
    n < flow.length
      ? span(rectOf(flow[n]))[0] - gap / 2
      : n > 0
        ? span(rectOf(flow[n - 1]))[1] + gap / 2
        : horizontal
          ? area.left + parseFloat(style.paddingLeft)
          : area.top + parseFloat(style.paddingTop);
  const line = horizontal ? { x: main - 1, y: area.top, width: 2, height: area.height } : { x: area.left, y: main - 1, width: area.width, height: 2 };
  return { to: { parent: container, index }, line, shifts, box, marks: [] };
}

/**
 * Where a layer drawn from `start` over `box` goes, as a dragged one would:
 * into the deepest Stack or Frame under where the drawing started that can
 * hold it; in a Stack, at the place along it nearest the start; in a Frame,
 * absolute where it is drawn. All as `view` lays it out, in its px.
 */
export function findPlace(editor: Editor, view: View, start: { x: number; y: number }, box: DOMRect): Destination | null {
  let container = view.layerAt(editor.tree(), start.x, start.y);
  while (container && !editor.canHold(container)) container = container.parent;
  if (!container) return null;
  if (container.kind === "frame") {
    const el = view.elementOf(container.el) ?? container.el;
    const area = el.getBoundingClientRect();
    return { parent: container, x: Math.round(box.left - area.left - el.clientLeft), y: Math.round(box.top - area.top - el.clientTop) };
  }
  const horizontal = container.direction === "horizontal";
  const at = horizontal ? start.x : start.y;
  const next = container.children.find((child) => {
    const r = !child.absolute && view.boxOf(child);
    return r && at < (horizontal ? r.left + r.right : r.top + r.bottom) / 2;
  });
  return { parent: container, index: next ? container.children.indexOf(next) : container.children.length };
}

/** The space between a Stack's layers, along it, as `el` shows it. */
function gapOf(stack: Layer, el: Element): number {
  return parseFloat(getComputedStyle(el).getPropertyValue(stack.direction === "horizontal" ? "column-gap" : "row-gap")) || 0;
}

/** Within the middle half of a box, both ways. */
function inMiddle(r: DOMRect, { x, y }: { x: number; y: number }): boolean {
  return x > r.left + r.width / 4 && x < r.right - r.width / 4 && y > r.top + r.height / 4 && y < r.bottom - r.height / 4;
}
