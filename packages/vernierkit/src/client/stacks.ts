/**
 * Making Stacks of layers and dissolving them. What Stack holds layers where
 * they are is worked out from where they are drawn; the canvas is changed by
 * layer ids and the change's values only, so the same works on the canvas
 * being edited and on a saved one.
 */
import { changesOn, declare, elementsOf, keepOriginal, LAYER_ID_ATTR, MADE_ATTR, memberStyle, restoreStyle } from "./canvas-style";
import type { Change, Composed, Dissolved, StackSettings } from "./changeset";
import type { Alignment } from "./edits";
import { MOVE_CSS, slotsOf } from "./moves";
import { CHAIN_ATTR } from "./usage-chain";

/** Every CSS property making a Stack may declare on it: what taking it apart takes off. */
export const STACK_CSS = ["display", "flex-direction", "gap", "padding", "justify-content", "align-items", "position", "left", "top", "right", "bottom"];
/** Every CSS property dissolving a Stack may declare on it. */
export const DISSOLVED_CSS = ["display", "position", "width", "height"];

/** A box on the canvas, in canvas px. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The Stack that holds layers where they are, and the order they go in it. */
export interface Inferred {
  settings: StackSettings;
  /** Indexes of the boxes, in their order along the Stack. */
  order: number[];
  /** Every layer is as wide across the Stack as all of them: across, they stretch with it. */
  stretch: boolean;
}

/** How far apart two edges may be and still line up, in px. */
const LINED_UP = 0.5;

/**
 * The Stack that holds layers, at `boxes`, where they are: horizontal when
 * they spread out further across than down (beyond the widest and the
 * tallest of them), vertical otherwise; in their order along it;
 * its gap the median of the spaces between them (none where they overlap);
 * aligned across where they line up most closely: their starts, their
 * centers or their ends. `frame`: the box inside the border of a Frame that
 * becomes the Stack, whose padding is then the room between its edges and the
 * layers; a new Stack fits round them, with none.
 */
export function inferStack(boxes: Box[], frame: Box | null): Inferred {
  const all: Box = {
    left: Math.min(...boxes.map((b) => b.left)),
    top: Math.min(...boxes.map((b) => b.top)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
  const across = all.right - all.left - Math.max(...boxes.map((b) => b.right - b.left));
  const down = all.bottom - all.top - Math.max(...boxes.map((b) => b.bottom - b.top));
  const horizontal = across > down;
  const [start, end, crossStart, crossEnd] = (horizontal ? ["left", "right", "top", "bottom"] : ["top", "bottom", "left", "right"]) as (keyof Box)[];
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a][start] - boxes[b][start]);
  const spaces = order.slice(1).map((i, n) => Math.max(0, boxes[i][start] - boxes[order[n]][end]));

  const middle = (b: Box) => (b[crossStart] + b[crossEnd]) / 2;
  const off = {
    start: Math.max(...boxes.map((b) => b[crossStart] - all[crossStart])),
    center: Math.max(...boxes.map((b) => Math.abs(middle(b) - middle(all)))),
    end: Math.max(...boxes.map((b) => all[crossEnd] - b[crossEnd])),
  };
  // On a tie, the start: it is what a Stack does unless told otherwise.
  const cross = (["start", "center", "end"] as Alignment[]).reduce((best, a) => (off[a] < off[best] ? a : best));
  const stretch = off.start <= LINED_UP && off.end <= LINED_UP;

  const padding = frame
    ? ([all.top - frame.top, frame.right - all.right, frame.bottom - all.bottom, all.left - frame.left].map((p) => round(Math.max(0, p))) as StackSettings["padding"])
    : ([0, 0, 0, 0] as StackSettings["padding"]);
  return {
    settings: {
      direction: horizontal ? "horizontal" : "vertical",
      gap: round(median(spaces)),
      padding,
      align: { x: horizontal ? "start" : cross, y: horizontal ? cross : "start", distribute: false },
    },
    order,
    stretch,
  };
}

/** The CSS that lays a Stack's layers out as `settings` say. `stretch`: across, at the start, the layers stretch with the Stack. */
export function stackStyle({ direction, gap, padding, align }: StackSettings, stretch: boolean): Record<string, string> {
  const across = direction === "horizontal" ? align.y : align.x;
  const css = (a: Alignment) => (a === "center" ? "center" : a === "end" ? "flex-end" : "flex-start");
  return {
    display: "flex",
    "flex-direction": direction === "horizontal" ? "row" : "column",
    gap: `${gap}px`,
    ...(padding.some((p) => p) && { padding: padding.map((p) => `${p}px`).join(" ") }),
    "align-items": across === "start" && stretch ? "stretch" : css(across),
  };
}

/** An element's box with its margins, as it takes up room in a layout. */
export function marginBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const margin = (side: string) => parseFloat(style.getPropertyValue(`margin-${side}`)) || 0;
  return { left: r.left - margin("left"), top: r.top - margin("top"), right: r.right + margin("right"), bottom: r.bottom + margin("bottom") };
}

/** The box absolute layers are placed in: inside the element's border. */
export function paddingBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  const left = r.left + el.clientLeft;
  const top = r.top + el.clientTop;
  return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight };
}

/**
 * Puts the layers `composed` takes in into the Stack with id `id`, in each
 * instance: a new one, in the place `composed` gives, or the Frame with that
 * id. `style`: what lays them out.
 */
export function compose(doc: Document, id: string, composed: Composed, style: Record<string, string>) {
  for (const container of elementsOf(doc, composed.place?.container.layer ?? id)) {
    const members = composed.layers.map(({ layer }) => childOf(container, layer));
    if (members.some((el) => !el)) continue;
    for (const el of members) el!.remove();
    let stack = container;
    if (composed.place) {
      stack = doc.createElement("div");
      stack.setAttribute(LAYER_ID_ATTR, id);
      stack.setAttribute(MADE_ATTR, id);
      // Written in the JSX its container is written in.
      const chain = container.getAttribute(CHAIN_ATTR);
      if (chain) stack.setAttribute(CHAIN_ATTR, chain);
      container.insertBefore(stack, slotsOf(container)[composed.place.slot] ?? null);
    }
    keepOriginal(stack);
    declare(stack, style);
    stack.append(...(members as Element[]));
    composed.layers.forEach(({ from }, i) => {
      if (!from.absolute) return;
      keepOriginal(members[i]!);
      declare(members[i]!, memberStyle(true));
    });
  }
}

/**
 * Takes the Stack with id `id` apart, in each instance: its layers go back
 * where they were, as they were, and a new Stack goes; a Frame made a Stack
 * is a Frame again. `changes`: the ChangeSet once the Stack is no longer in it.
 */
export function decompose(doc: Document, id: string, composed: Composed, changes: Change[]) {
  for (const container of elementsOf(doc, composed.place?.container.layer ?? id)) {
    const stack = composed.place ? childOf(container, id) : container;
    if (!stack) continue;
    const members = composed.layers.map((member) => ({ ...member, el: childOf(stack, member.layer) })).filter((member) => member.el);
    for (const { el } of members) el!.remove();
    if (composed.place) stack.remove();
    // Each back at its place among the others, from the first: those before it are back by then.
    for (const { el, from } of [...members].sort((a, b) => a.from.slot - b.from.slot)) container.insertBefore(el!, slotsOf(container)[from.slot] ?? null);
    for (const { el, from, layer } of members) if (from.absolute) restoreStyle(el!, ["position"], changesOn(layer, changes));
    if (!composed.place) restoreStyle(container, STACK_CSS, changesOn(id, changes));
  }
}

/** Dissolves the Stack with id `id`, in each instance: it takes `style`, its layers are placed absolute as `dissolved` has them. */
export function dissolve(doc: Document, id: string, dissolved: Dissolved, style: Record<string, string>) {
  for (const stack of elementsOf(doc, id)) {
    keepOriginal(stack);
    declare(stack, style);
    for (const member of dissolved.layers) {
      const el = childOf(stack, member.layer);
      if (!el) continue;
      keepOriginal(el);
      declare(el, member.style);
    }
  }
}

/** Makes the Stack with id `id` a Stack again, its layers in its layout. `changes`: the ChangeSet once the dissolving is no longer in it. */
export function undissolve(doc: Document, id: string, dissolved: Dissolved, changes: Change[]) {
  for (const stack of elementsOf(doc, id)) {
    restoreStyle(stack, DISSOLVED_CSS, changesOn(id, changes));
    for (const member of dissolved.layers) {
      const el = childOf(stack, member.layer);
      if (el) restoreStyle(el, MOVE_CSS, changesOn(member.layer, changes));
    }
  }
}

/** The child of `parent` that is the layer with id `layer`. */
function childOf(parent: Element, layer: string): Element | null {
  return [...parent.children].find((el) => el.getAttribute(LAYER_ID_ATTR) === layer) ?? null;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
