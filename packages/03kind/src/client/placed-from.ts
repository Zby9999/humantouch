/**
 * How a layer placed freely is placed along each axis (GLOSSARY: Placement,
 * ticket 75): from its container's left or top edge, from its right or bottom
 * edge (`right`, `bottom`), or centered on where it is placed from either
 * (`translate: -50%` from its left, as Tailwind's `-translate-x-1/2` writes
 * it, in v3 through `transform`, in v4 through `translate`; `50%` from its
 * right). Resized or moved, it stays placed so (ADR 0014): what changes is the
 * value that places it from the edge it is placed from, or, centered, its
 * size alone, or how far past the share of its container it is centered on
 * (`calc(50% + 20px)`, ticket 79).
 */
import { AXIS_SIZE, pxIn, SIDES, type Edge, type InLayout, type PlacedAlong, type PlacedFrom, type Share, type Side } from "./checkable";
import { absolute, declaredValue, round } from "./property-table";
import { split } from "./paint";
import { insideBorder, marginsOf } from "./stacks";
import type { Axis } from "./snap";
import { pinnedOf } from "./style-source";

/**
 * How `el` is placed along `axis`, as it is laid out in its document (the
 * view worked in): by what the page and the edits declare. Placed by both
 * edges, or by neither, it is taken to be placed from its start (left, top),
 * as the browser places it; so is a layer the freezer pinned that way, which
 * the canvas places from its top whatever the page does. Not placed freely:
 * from its start. Centered from either edge, it is resized alike, on both sides.
 */
export function placedFrom(el: Element, axis: Axis): PlacedFrom {
  const { start, end } = SIDES[axis];
  if (!absolute(el) || pinnedOf(el).includes(start)) return { edge: "start", centered: false };
  const edge: Edge = declared(el, end) && !declared(el, start) ? "end" : "start";
  // Moved back half its size from where it is placed (forward, placed from the end): centered there.
  const { width, height } = el.getBoundingClientRect();
  const half = (axis === "x" ? width : height) / 2;
  const moved = half > 0 ? shiftOf(el, { width, height })?.[axis] : undefined;
  return { edge, centered: moved !== undefined && Math.abs(moved + (edge === "end" ? -half : half)) <= 0.5 };
}

/**
 * Whether a value given to `el`'s offset from its container's end edge along
 * `axis` (`right`, `bottom`) places it, as its document lays it out: placed
 * freely there, and not by its `left` or `top` too, which the browser goes by
 * then, nor pinned so by the freezer. Read from its computed `position` and
 * what is declared, with nothing laid out.
 */
export function endOffsetPlaces(el: Element, axis: Axis): boolean {
  const { start } = SIDES[axis];
  return absolute(el) && !pinnedOf(el).includes(start) && !declared(el, start);
}

/**
 * How a value given to `el`'s `side` moves it, as its document lays it out:
 * placed absolute by it (`placed`); still in its container's layout, but
 * moved from where that lays it out, placed `relative`, or kept that far in
 * as the page scrolls, placed `sticky` (ticket 84); not at all (null). Its
 * `left` or `top` moves it wherever it is not static (ticket 83, review). Its
 * `right` or `bottom` places it as `endOffsetPlaces` has it; relative, moves
 * it with no `left` or `top` declared, which the browser goes by instead;
 * sticky, keeps it in from that edge as well as from the other. Read from
 * its computed `position` and what is declared, with nothing laid out.
 */
export function sideMoves(el: Element, { axis, edge }: Side): "placed" | InLayout | null {
  const { position } = getComputedStyle(el);
  if (position === "relative" || position === "sticky") return edge === "start" || position === "sticky" || !declared(el, SIDES[axis].start) ? position : null;
  if (edge === "end") return endOffsetPlaces(el, axis) ? "placed" : null;
  return position === "static" ? null : "placed";
}

/** Whether the page or an edit gives `el` a value for `property` other than `auto`. */
const declared = (el: Element, property: string) => !/^(auto)?$/.test(declaredValue(el, property));

/**
 * How far `transform` and `translate` move `el` across and down, in px, its
 * border box `size`; null when they do more than move it (turn it, scale it),
 * or move it in a way not read here.
 */
function shiftOf(el: Element, size: { width: number; height: number }): Record<Axis, number> | null {
  const style = getComputedStyle(el);
  if (style.rotate !== "none" || style.scale !== "none") return null;
  let x = 0;
  let y = 0;
  if (style.transform !== "none") {
    const m = new DOMMatrixReadOnly(style.transform);
    if (!m.is2D || m.a !== 1 || m.b !== 0 || m.c !== 0 || m.d !== 1) return null;
    x += m.e;
    y += m.f;
  }
  if (style.translate !== "none") {
    const [across = "0px", down = "0px"] = split(style.translate, " ");
    const [dx, dy] = [shareOf(across), shareOf(down)];
    if (!dx || !dy) return null;
    x += pxIn(dx, size.width);
    y += pxIn(dy, size.height);
  }
  return { x, y };
}

/**
 * A length as a share of a size and px past it (`Share`): in px, a
 * percentage, or `calc()` of such, added, taken away, and multiplied or
 * divided by plain numbers, as the browser computes `translate` and as
 * Tailwind writes `left-1/2` (`calc(1/2 * 100%)`); null for any other (a
 * `var()`, an `em`).
 */
export function shareOf(value: string): Share | null {
  const tokens = value.trim().match(/calc\(|\d*\.?\d+(?:e[+-]?\d+)?(?:px|%)?|[-+*/()]|\S+/gi) ?? [];
  let at = 0;
  type Term = Share & { plain: boolean };
  const sum = (): Term | null => {
    let left = product();
    while (left && (tokens[at] === "+" || tokens[at] === "-")) {
      const sign = tokens[at++] === "-" ? -1 : 1;
      const right = product();
      if (!right || right.plain !== left.plain) return null;
      left = { percent: left.percent + sign * right.percent, px: left.px + sign * right.px, plain: left.plain };
    }
    return left;
  };
  const product = (): Term | null => {
    let left = factor();
    while (left && (tokens[at] === "*" || tokens[at] === "/")) {
      const divide = tokens[at++] === "/";
      const right = factor();
      if (!right || (divide && (!right.plain || !right.px)) || (!left.plain && !right.plain)) return null;
      const [length, by] = left.plain && !divide ? [right, left.px] : [left, divide ? 1 / right.px : right.px];
      left = { percent: length.percent * by, px: length.px * by, plain: left.plain && right.plain };
    }
    return left;
  };
  const factor = (): Term | null => {
    const token = tokens[at++];
    if (token === "-" || token === "+") {
      const term = factor();
      return term && (token === "-" ? { percent: -term.percent, px: -term.px, plain: term.plain } : term);
    }
    if (token === "(" || token?.toLowerCase() === "calc(") {
      const term = sum();
      return tokens[at++] === ")" ? term : null;
    }
    const match = /^(\d*\.?\d+(?:e[+-]?\d+)?)(px|%)?$/i.exec(token ?? "");
    if (!match) return null;
    const n = parseFloat(match[1]);
    return match[2] === "%" ? { percent: n, px: 0, plain: false } : { percent: 0, px: n, plain: !match[2] };
  };
  const term = sum();
  // A plain number is no length, but 0.
  if (!term || at !== tokens.length || (term.plain && term.px !== 0)) return null;
  return { percent: term.percent, px: term.px };
}

/** How far `transform` and `translate` move `el` across and down, in px: none when they do more than move it, or move it in a way not read here. */
export function shiftIn(el: Element): Record<Axis, number> {
  const { width, height } = el.getBoundingClientRect();
  return shiftOf(el, { width, height }) ?? { x: 0, y: 0 };
}

/**
 * How much room `el`'s container gives it along `axis`, as its document lays
 * it out: what its `left` and `right` (`top`, `bottom`) are shares of, its
 * containing block's size. Read from the browser's values for those, its
 * margins and its size, which add up to it when it is placed freely: its
 * size as laid out, not as a `transform` or `rotate` draws it.
 */
export function roomOf(el: Element, axis: Axis): number {
  const style = getComputedStyle(el);
  const { start, end } = SIDES[axis];
  const px = (property: string) => parseFloat(style.getPropertyValue(property)) || 0;
  const sides = [start, end].map((side) => px(`padding-${side}`) + px(`border-${side}-width`));
  const size = px(AXIS_SIZE[axis]) + (style.boxSizing === "border-box" ? 0 : sides[0] + sides[1]);
  return px(start) + px(end) + px(`margin-${start}`) + px(`margin-${end}`) + size;
}

/**
 * How much room `container` gives a layer placed absolute in it, as its
 * positioning reference, along each axis: its size inside its border, to the
 * fraction of a px (`insideBorder`). What the share and the px a layer is
 * placed by from its right or bottom edge, or centered, are of (ticket 79).
 */
export function roomIn(container: Element): Record<Axis, number> {
  const { width, height } = insideBorder(container, container.getBoundingClientRect());
  return { x: width, y: height };
}

/**
 * Where `el`, centered along `axis` on where its side from `edge` places it,
 * is centered: the value it gives that side now, as a share of its
 * container's size and px past it (ticket 79); null when it is not one read here.
 */
export function sideShareOf(el: Element, axis: Axis, edge: Edge): Share | null {
  return shareOf(declaredValue(el, SIDES[axis][edge]));
}

/** How far past `percent` of `room` px `at` px is, to two places: what a side gives a layer centered past its share. */
export const pastShare = (at: number, percent: number, room: number) => round(at - pxIn({ percent, px: 0 }, room));

/**
 * Along each axis `el` is placed otherwise than from its container's left or
 * top edge, as its document lays it out (`placedFrom`): how, and what the side
 * that places it so is to give it for its left and top edges to be at `at`
 * (its X and Y, its `left` and `top` were it placed by them) in a container
 * that gives it `room` (ticket 79, ADR 0014). From the right or bottom edge,
 * px, as X and Y are; centered, the share of its container it is centered on
 * now, and px past it. None along an axis it is placed from the start, or
 * centered on a side whose value is not read here (placed by its X and Y then).
 */
export function placedAlong(el: Element, at: Record<Axis, number>, room: Record<Axis, number>): Partial<Record<Axis, PlacedAlong>> | undefined {
  const placed: Partial<Record<Axis, PlacedAlong>> = {};
  const r = el.getBoundingClientRect();
  const [top, right, bottom, left] = marginsOf(el);
  for (const axis of ["x", "y"] as const) {
    const from = placedFrom(el, axis);
    if (from.edge === "start" && !from.centered) continue;
    const share = from.centered ? sideShareOf(el, axis, from.edge) : { percent: 0, px: 0 };
    if (!share) continue;
    // From the end edge: what is left of its container's room past it and its margins.
    const size = axis === "x" ? r.width + left + right : r.height + top + bottom;
    const value = from.edge === "start" ? at[axis] : room[axis] - at[axis] - size;
    placed[axis] = { ...from, percent: share.percent, px: pastShare(value, share.percent, room[axis]) };
  }
  return Object.keys(placed).length ? placed : undefined;
}
