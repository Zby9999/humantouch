/**
 * Making Stacks of layers and dissolving them. What Stack holds layers where
 * they are is worked out from where they are drawn; the canvas is changed by
 * layer ids and the change's values only, so the same works on the canvas
 * being edited and on a saved one.
 */
import { changesOn, declare, elementsOf, keepOriginal, LAYER_ID_ATTR, MADE_ATTR, memberStyle, relayOut, restoreStyle } from "./canvas-style";
import type { Change, Composed, Dissolved, Margins, StackSettings } from "./changeset";
import type { Edge } from "./checkable";
import type { Alignment } from "./property-table";
import { MOVE_CSS, slotsOf } from "./moves";
import { CHAIN_ATTR } from "./usage-chain";

/** Every CSS property making a Stack may declare on it: what taking it apart takes off. */
export const STACK_CSS = ["display", "flex-direction", "gap", "padding", "margin-top", "margin-right", "margin-bottom", "margin-left", "justify-content", "align-items", "position", "left", "top", "right", "bottom"];
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
 * layers; a new Stack fits round them, with none. `free`: the layers are
 * placed freely in that Frame, so its size is not theirs: on each axis its
 * padding is the room on the nearer side, the same on both, and the rest is
 * the alignment's, the one nearest where the layers are, along and across.
 */
export function inferStack(boxes: Box[], frame: Box | null, free = false): Inferred {
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

  const room = frame
    ? ([all.top - frame.top, frame.right - all.right, frame.bottom - all.bottom, all.left - frame.left].map((p) => round(Math.max(0, p))) as StackSettings["padding"])
    : null;
  const padding: StackSettings["padding"] = !room
    ? [0, 0, 0, 0]
    : free
      ? [Math.min(room[0], room[2]), Math.min(room[1], room[3]), Math.min(room[0], room[2]), Math.min(room[1], room[3])]
      : room;
  // Where they are aligned in: inside a free Frame's padding, or round them all.
  const inside: Box =
    frame && free ? { left: frame.left + padding[3], top: frame.top + padding[0], right: frame.right - padding[1], bottom: frame.bottom - padding[2] } : all;

  const middle = (b: Box) => (b[crossStart] + b[crossEnd]) / 2;
  const off = {
    start: Math.max(...boxes.map((b) => b[crossStart] - inside[crossStart])),
    center: Math.max(...boxes.map((b) => Math.abs(middle(b) - middle(inside)))),
    end: Math.max(...boxes.map((b) => inside[crossEnd] - b[crossEnd])),
  };
  const cross = nearest(off);
  const stretch = off.start <= LINED_UP && off.end <= LINED_UP;
  const along = free
    ? nearest({
        start: all[start] - inside[start],
        center: Math.abs((all[start] + all[end]) / 2 - (inside[start] + inside[end]) / 2),
        end: inside[end] - all[end],
      })
    : "start";

  return {
    settings: {
      direction: horizontal ? "horizontal" : "vertical",
      gap: round(median(spaces)),
      padding,
      align: { x: horizontal ? along : cross, y: horizontal ? cross : along, distribute: false },
    },
    order,
    stretch,
  };
}

/** The alignment off by the least, from how far off each is. On a tie, the start: it is what a Stack does unless told otherwise. */
function nearest(off: Record<Alignment, number>): Alignment {
  return (["start", "center", "end"] as Alignment[]).reduce((best, a) => (off[a] < off[best] ? a : best));
}

/** The CSS that lays a Stack's layers out as `settings` say. `stretch`: across, at the start, the layers stretch with the Stack. */
export function stackStyle({ direction, gap, padding, align }: StackSettings, stretch: boolean): Record<string, string> {
  const [along, across] = direction === "horizontal" ? [align.x, align.y] : [align.y, align.x];
  const css = (a: Alignment) => (a === "center" ? "center" : a === "end" ? "flex-end" : "flex-start");
  return {
    display: "flex",
    "flex-direction": direction === "horizontal" ? "row" : "column",
    gap: `${gap}px`,
    ...(padding.some((p) => p) && { padding: padding.map((p) => `${p}px`).join(" ") }),
    ...(along !== "start" && { "justify-content": css(along) }),
    "align-items": across === "start" && stretch ? "stretch" : css(across),
  };
}

/** An element's box, its border included: what shows of it. */
export function borderBox(el: Element): Box {
  const { left, top, right, bottom } = el.getBoundingClientRect();
  return { left, top, right, bottom };
}

/** Where an element is in `container`, as an absolute layer is placed there: from inside its border, margins left out. */
export function spotIn(el: Element, container: Element): { x: number; y: number } {
  const reference = paddingBox(container);
  const r = el.getBoundingClientRect();
  const [top, , , left] = marginsOf(el);
  return { x: round(r.left - left - reference.left), y: round(r.top - top - reference.top) };
}

/**
 * An element's margins on the sides it is placed from, in px (`Margins`): its
 * left and top ones, how far past its X and Y an absolute layer is drawn; from
 * its container's `end` edges, its right and bottom ones, past its `right`
 * and `bottom` (ticket 75).
 */
export function marginsAt(el: Element, from: Edge = "start"): Margins {
  const [top, right, bottom, left] = marginsOf(el);
  return from === "end" ? { x: right, y: bottom } : { x: left, y: top };
}

/** An element's margins, in px: top, right, bottom, left. */
export function marginsOf(el: Element): [number, number, number, number] {
  const style = getComputedStyle(el);
  return (["top", "right", "bottom", "left"] as const).map((side) => parseFloat(style.getPropertyValue(`margin-${side}`)) || 0) as [number, number, number, number];
}

/**
 * The box absolute layers are placed in, where the element is laid out now:
 * inside its border and any scrollbar, as the browser gives it, in whole px.
 */
export function paddingBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  const left = r.left + el.clientLeft;
  const top = r.top + el.clientTop;
  return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight };
}

/**
 * The same box as `paddingBox`, inside the border, but to the fraction of a px
 * and over `rect`, the element's border box as laid out at some other moment
 * (before a drag shifted anything, say): what a dragged layer snaps to. It
 * takes in any scrollbar; with none, and a border in whole px, the two agree.
 */
export function insideBorder(el: Element, rect: DOMRect): DOMRect {
  const style = getComputedStyle(el);
  const [top, right, bottom, left] = ["top", "right", "bottom", "left"].map((side) => parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0);
  return new DOMRect(rect.left + left, rect.top + top, rect.width - left - right, rect.height - top - bottom);
}

/**
 * Puts the layers `composed` takes in into the Stack with id `id`, in each
 * instance: a new one, in the place `composed` gives, or the Frame with that
 * id. `style`: what lays them out.
 */
export function compose(doc: Document, id: string, composed: Composed, style: Record<string, string>) {
  const stacks: Element[] = [];
  /** The elements of each layer joining it, in every instance. */
  const joining = composed.layers.map((): Element[] => []);
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
    stacks.push(stack);
    stack.append(...(members as Element[]));
    members.forEach((el, i) => joining[i].push(el!));
  }
  relayOut(stacks, style);
  composed.layers.forEach((member, i) => {
    const style = memberStyle(member);
    if (!Object.keys(style).length) return;
    for (const el of joining[i]) keepOriginal(el);
    declare(joining[i], style);
  });
}

/**
 * Takes the Stack with id `id` apart, in each instance: its layers go back
 * where they were, as they were, and a new Stack goes; a Frame made a Stack
 * is a Frame again. `changes`: the ChangeSet once the Stack is no longer in it.
 */
export function decompose(doc: Document, id: string, composed: Composed, changes: Change[]) {
  const frames: Element[] = [];
  /** The elements of each layer that was in it, in every instance. */
  const back = new Map(composed.layers.map((member) => [member.layer, [] as Element[]]));
  for (const container of elementsOf(doc, composed.place?.container.layer ?? id)) {
    const stack = composed.place ? childOf(container, id) : container;
    if (!stack) continue;
    const members = composed.layers.map((member) => ({ ...member, el: childOf(stack, member.layer) })).filter((member) => member.el);
    for (const { el } of members) el!.remove();
    if (composed.place) stack.remove();
    // Each back at its place among the others, from the first: those before it are back by then.
    for (const { el, from } of [...members].sort((a, b) => a.from.slot - b.from.slot)) container.insertBefore(el!, slotsOf(container)[from.slot] ?? null);
    for (const member of members) back.get(member.layer)!.push(member.el!);
    if (!composed.place) frames.push(container);
  }
  for (const member of composed.layers) {
    const joined = Object.keys(memberStyle(member));
    if (joined.length) restoreStyle(back.get(member.layer)!, joined, changesOn(member.layer, changes));
  }
  restoreStyle(frames, STACK_CSS, changesOn(id, changes));
}

/** Dissolves the Stack with id `id`, in each instance: it takes `style`, its layers are placed absolute as `dissolved` has them. */
export function dissolve(doc: Document, id: string, dissolved: Dissolved, style: Record<string, string>) {
  const stacks = elementsOf(doc, id);
  for (const stack of stacks) keepOriginal(stack);
  relayOut(stacks, style);
  for (const member of dissolved.layers) {
    const els = stacks.flatMap((stack) => childOf(stack, member.layer) ?? []);
    for (const el of els) keepOriginal(el);
    declare(els, member.style);
  }
}

/** Makes the Stack with id `id` a Stack again, its layers in its layout. `changes`: the ChangeSet once the dissolving is no longer in it. */
export function undissolve(doc: Document, id: string, dissolved: Dissolved, changes: Change[]) {
  const stacks = elementsOf(doc, id);
  restoreStyle(stacks, DISSOLVED_CSS, changesOn(id, changes));
  for (const member of dissolved.layers) restoreStyle(stacks.flatMap((stack) => childOf(stack, member.layer) ?? []), MOVE_CSS, changesOn(member.layer, changes));
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
