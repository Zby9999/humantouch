/**
 * Dragging a layer on the canvas: where it would go if let go now, and how the
 * layers around it make room. Nothing changes structure until the drop; while
 * the layer is dragged, layers are only shifted.
 */
import type { Destination, Editor } from "./edits";
import type { Layer } from "./layers";

export interface Drop {
  /** The Stack or Frame the layer would go into. */
  container: Layer;
  to: Destination;
  /** Where in a Stack the layer would go, drawn as a line, in canvas px. None for an absolute place. */
  line: { x: number; y: number; width: number; height: number } | null;
  /** How far layers move aside to make room, in canvas px. */
  shifts: Map<Element, { x: number; y: number }>;
}

/**
 * Where a dragged layer would go: into the Stack or Frame under the pointer
 * that can take it, outside the layer itself. A Stack beside the layer is
 * entered from its middle only; near its edges, the pointer is still in the
 * layout around it, so the layer goes beside it. `box`: the layer where it is
 * dragged to; `rectOf`: where a layer was laid out before anything shifted.
 */
export function findDrop(editor: Editor, layer: Layer, point: { x: number; y: number }, box: DOMRect, rectOf: (layer: Layer) => DOMRect): Drop | null {
  const home = layer.parent!;
  let container = editor.tree().layerAt(point.x, point.y, layer.text ? undefined : layer.el);
  for (; container; container = container.parent) {
    if (!editor.canDrop(layer, container)) continue;
    if (container.parent === home && !inMiddle(rectOf(container), point)) continue;
    break;
  }
  if (!container) return null;

  const area = rectOf(container);
  if (container.kind === "frame") {
    // Placed where it is let go: its left and top in the container, margins aside.
    const margins = layer.text ? { marginLeft: "0", marginTop: "0" } : getComputedStyle(layer.el);
    const x = box.left - area.left - container.el.clientLeft - parseFloat(margins.marginLeft);
    const y = box.top - area.top - container.el.clientTop - parseFloat(margins.marginTop);
    return { container, to: { parent: container, x: Math.round(x), y: Math.round(y) }, line: null, shifts: new Map() };
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
  const room = (stack: Layer) => (stack.direction === "horizontal" ? box.width : box.height) + gapOf(stack);
  const shift = (children: Layer[], stack: Layer, by: number) => {
    for (const child of children) {
      if (!child.text) shifts.set(child.el, stack.direction === "horizontal" ? { x: by, y: 0 } : { x: 0, y: by });
    }
  };
  const homeFlow = home.children.filter((child) => !child.absolute);
  const was = homeFlow.indexOf(layer);
  if (container === home && was >= 0) {
    if (n < was) shift(flow.slice(n, was), container, room(container));
    else shift(flow.slice(was, n), container, -room(container));
  } else {
    shift(flow.slice(n), container, room(container));
    if (was >= 0 && home.kind === "stack") shift(homeFlow.slice(was + 1), home, -room(home));
  }

  const gap = gapOf(container);
  const style = getComputedStyle(container.el);
  const main =
    n < flow.length
      ? span(rectOf(flow[n]))[0] - gap / 2
      : n > 0
        ? span(rectOf(flow[n - 1]))[1] + gap / 2
        : horizontal
          ? area.left + parseFloat(style.paddingLeft)
          : area.top + parseFloat(style.paddingTop);
  const line = horizontal ? { x: main - 1, y: area.top, width: 2, height: area.height } : { x: area.left, y: main - 1, width: area.width, height: 2 };
  return { container, to: { parent: container, index }, line, shifts };
}

/** The space between a Stack's layers, along it. */
function gapOf(stack: Layer): number {
  return parseFloat(getComputedStyle(stack.el).getPropertyValue(stack.direction === "horizontal" ? "column-gap" : "row-gap")) || 0;
}

/** Within the middle half of a box, both ways. */
function inMiddle(r: DOMRect, { x, y }: { x: number; y: number }): boolean {
  return x > r.left + r.width / 4 && x < r.right - r.width / 4 && y > r.top + r.height / 4 && y < r.bottom - r.height / 4;
}
