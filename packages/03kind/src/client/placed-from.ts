/**
 * How a layer placed freely is placed along each axis (GLOSSARY: Placement,
 * ticket 75): from its container's left or top edge, from its right or bottom
 * edge (`right`, `bottom`), or centered on where it is placed from either
 * (`translate: -50%` from its left, as Tailwind's `-translate-x-1/2` writes
 * it, in v3 through `transform`, in v4 through `translate`; `50%` from its
 * right), or centered between both its sides by its margins there, both
 * `auto` (`inset-x-0 mx-auto w-12`, ticket 96). Resized or moved, it stays
 * placed so (ADR 0014): what changes is the value that places it from the
 * edge it is placed from, or, centered, its size alone, or how far past the
 * share of its container it is centered on (`calc(50% + 20px)`, ticket 79;
 * by its margins, its sides, as much one way as the other).
 */
import { AXIS_SIZE, middleOf, OTHER_EDGE, pxIn, SIDES, type Edge, type InLayout, type PlacedAlong, type PlacedFrom, type Share, type Side } from "./checkable";
import { declaredByEdit } from "./canvas-style";
import { containingBlockOf, directionPlacing } from "./containing-block";
import { absolute, declaredValue, round } from "./property-table";
import { split } from "./paint";
import { insideBorder, marginsOf } from "./stacks";
import type { Axis } from "./snap";
import { declarationsOf, pinnedOf } from "./style-source";

/**
 * How `el` is placed along `axis`, as it is laid out in its document (the
 * view worked in): by what the page and the edits declare. Placed by both
 * edges, or by neither, it is taken to be placed from its start (left, top),
 * as the browser places it; but by both, as large as it is set along `axis`,
 * from the edge the browser goes by (`edgeGoneBy`: its right, right to left,
 * ticket 89). A layer the freezer pinned is taken to be placed from its
 * start too, which the canvas places it from whatever the page does. Not
 * placed freely: from its start. Centered from either edge, it is resized
 * alike, on both sides. Its margins there both `auto`, taking up the room
 * between its sides (`autoMarginsPlacing`): centered by them, from its start
 * as X and Y go (ticket 96); one of them `auto`, from the other's edge.
 */
export function placedFrom(el: Element, axis: Axis): PlacedFrom {
  const { start } = SIDES[axis];
  if (!absolute(el) || pinnedOf(el).includes(start)) return { edge: "start", centered: false };
  if (autoMarginsPlacing(el, axis) === "both") return { edge: "start", centered: true, margins: true };
  const edge: Edge = sideDeclared(el, axis, "end") && endOffsetPlaces(el, axis) ? "end" : "start";
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
 * then, nor pinned so by the freezer; with its `left` too, where it is as
 * large as it is set across and the browser goes by its right (right to
 * left, ticket 89). Read from computed styles and what is declared, with
 * nothing laid out.
 */
export function endOffsetPlaces(el: Element, axis: Axis): boolean {
  const { start } = SIDES[axis];
  return absolute(el) && !pinnedOf(el).includes(start) && (!sideDeclared(el, axis, "start") || endWins(el, axis));
}

/**
 * The edge the browser places `el` from along `axis` where it is given a
 * value for the side from each, more than it can keep (ticket 89): down, its
 * top; across, as the box that places it runs (`directionPlacing`), its left
 * left to right, its right right to left (`direction: rtl`). That box's, not
 * its own: so the browser goes (CSS 2.1, 9.3.2, 10.3.7), for a layer placed
 * relative and one placed absolute alike. Read from computed styles alone.
 */
export function edgeGoneBy(el: Element, axis: Axis): Edge {
  return axis === "x" && directionPlacing(el) === "rtl" ? "end" : "start";
}

/**
 * Whether the browser goes by the side from the end edge along `axis` of
 * `el`, given both its sides there, as it is placed (ticket 89): relative, as
 * the box that places it runs (`edgeGoneBy`); absolute or fixed, so too, but
 * only as large as it is set there (`sized`), with nothing laid out (else
 * both sides place it, its size given by them); and with a margin there
 * `auto`, which takes up the room left, by the side whose margin is not
 * (`autoMarginsPlacing`): its end's with only its start's `auto` (`ml-auto`,
 * pushed to its end, ticket 96), and neither with both (`inset-x-0 mx-auto`:
 * centered, ticket 94, review). The one rule the canvas goes by.
 */
const endWins = (el: Element, axis: Axis) => {
  if (!absolute(el)) return edgeGoneBy(el, axis) === "end";
  const byMargins = autoMarginsPlacing(el, axis);
  if (byMargins) return byMargins === "end";
  return edgeGoneBy(el, axis) === "end" && sized(el, axis);
};

/** Whether `el` is as large along `axis` as it is set, as declared (ticket 89's 代定 2), or as large as it draws itself (an image, a `<canvas>`). */
const sized = (el: Element, axis: Axis) => declared(el, AXIS_SIZE[axis]) || REPLACED.has(el.localName);

/**
 * Along `axis`, how `el`'s margins there place it, placed absolute or fixed,
 * where one or both are `auto` and so take up the room its container gives
 * it past its sides and its size (CSS 2.1, 10.3.7, 10.6.4; ticket 96): both,
 * centered between its sides (`inset-x-0 mx-auto w-12`), "both"; only the one
 * at its start, from its end (`ml-auto`, pushed there), "end"; only the one
 * at its end, from its start. Null where neither is `auto`, or a side is, or
 * it is not as large as it is set there (`sized`), where the browser takes
 * them for none. As its style computes them (`computedStyleMap`, which keeps
 * the keyword where `getComputedStyle` gives the px it takes up), however
 * they are written (`margin`, `margin-inline`, `mx-auto`), with nothing laid
 * out (ADR 0011); left to right and right to left alike.
 */
export function autoMarginsPlacing(el: Element, axis: Axis): Edge | "both" | null {
  if (!absolute(el)) return null;
  const style = el.computedStyleMap();
  const auto = (property: string) => String(style.get(property)) === "auto";
  const { start, end } = SIDES[axis];
  const [before, after] = [auto(`margin-${start}`), auto(`margin-${end}`)];
  if ((!before && !after) || auto(start) || auto(end) || !sized(el, axis)) return null;
  return before && after ? "both" : before ? "end" : "start";
}

/**
 * How much room a margin of `el`'s before it along `axis` (its left, its
 * top) takes up, in px, as laid out, when it is `auto` (ticket 96): where
 * it is drawn past its side, which X and Y count, as they do not its other
 * margins. None when it is not `auto`, or `el` is not placed absolute or
 * fixed: in its container's layout, X and Y go as they always did.
 */
export function autoMarginBefore(el: Element, axis: Axis): number {
  const margin = `margin-${SIDES[axis].start}`;
  if (!absolute(el) || String(el.computedStyleMap().get(margin)) !== "auto") return 0;
  return parseFloat(getComputedStyle(el).getPropertyValue(margin)) || 0;
}

/**
 * Where `el`, placed absolute or fixed, is placed along `axis` from its
 * container's start edge, as its X and Y read it, in px: as the browser
 * places it by its side there (`offsetPlacing`), and past that by its
 * margin there when `auto` (`autoMarginBefore`, ticket 96).
 */
export function startOffsetOf(el: Element, axis: Axis): number {
  return offsetPlacing(el, axis, "start") + autoMarginBefore(el, axis);
}

/**
 * Where the middle of `el`, centered along `axis` by its auto margins between
 * its sides (ticket 96), is: halfway between where its sides place its edges,
 * as a share of its container and px past it, as its style computes them
 * (`left: 0; right: 0` is 50% and none; Tailwind v4's `inset-inline`, a
 * `var()`, read as they come to); in px, as laid out, where one is no share
 * read here.
 */
export function middleShareOf(el: Element, axis: Axis): Share {
  const [start, end] = (["start", "end"] as const).map((edge) => computedShareOf(el, SIDES[axis][edge]));
  return middleOf({ start, end });
}

/** A side of `el` as its style computes it, a share of its container and px past it; in px, as laid out, where it is no share read here. */
export function computedShareOf(el: Element, side: string): Share {
  return shareOf(String(el.computedStyleMap().get(side))) ?? { percent: 0, px: parseFloat(getComputedStyle(el).getPropertyValue(side)) || 0 };
}

/** Elements as large as what they draw, not as what they hold: their size set, though no CSS sets it. */
const REPLACED = new Set(["img", "canvas", "video", "iframe", "svg", "input", "object", "embed"]);

/**
 * Whether the page gives `el`, placed absolute or fixed, more than it can
 * keep along `axis` (ticket 89, review and re-review): both its sides, and
 * those, its margins and its size adding up to other than the room the box
 * that places it gives it (a size set, held by `max-width`, or its own, as a
 * `<canvas>`'s is). Laid out sizes alone, as `extentOf` and `roomPlacing`
 * read them: what draws a box otherwise than laid out (a `transform`, a
 * `rotate`) is no part of it.
 */
function overConstrained(el: Element, axis: Axis): boolean {
  // The layout read first: it is cheaper than walking the cascade for the sides, and mostly settles it.
  return Math.abs(roomPlacing(el)[axis] - extentOf(el, axis)) > 0.5 && sideDeclared(el, axis, "start") && sideDeclared(el, axis, "end");
}

/**
 * How far from the edge of the box that places it along `axis` the browser
 * places `el`, placed absolute or fixed, in px, as laid out: its side's
 * value, as the browser computes it; but given more than it can keep
 * (`overConstrained`), the side the browser does not go by (`edgeGoneBy`)
 * keeps its value as given and places nothing, so it is the room left past
 * the other side, its margins and its size (ticket 89, review).
 */
export function offsetPlacing(el: Element, axis: Axis, edge: Edge): number {
  const value = parseFloat(getComputedStyle(el).getPropertyValue(SIDES[axis][edge])) || 0;
  if (edgeGoneBy(el, axis) === edge || !overConstrained(el, axis)) return value;
  return roomPlacing(el)[axis] - (extentOf(el, axis) - value);
}

/**
 * What a share of `el`'s container along `axis` is a share of, placed
 * absolute or fixed: its sides, margins and size added up (`extentOf`),
 * which come to the room its container gives it; but given more than it can
 * keep (`overConstrained`), they do not, and it is that room (`roomPlacing`).
 */
export function roomAlong(el: Element, axis: Axis): number {
  return overConstrained(el, axis) ? roomPlacing(el)[axis] : extentOf(el, axis);
}

/**
 * How much room the box that places `el`, placed absolute or fixed, gives it
 * along each axis (`containingBlockOf`), as laid out, not as drawn: its
 * padding box, by its computed size, the padding and border its
 * `box-sizing` puts in or leaves out, and less any scrollbar; the window's,
 * what the page's root does not scroll.
 */
export function roomPlacing(el: Element): Record<Axis, number> {
  const block = containingBlockOf(el);
  const root = el.ownerDocument.documentElement;
  if (!block) return { x: root.clientWidth, y: root.clientHeight };
  const style = getComputedStyle(block);
  const px = (property: string) => parseFloat(style.getPropertyValue(property)) || 0;
  const room = (axis: Axis): number => {
    const { start, end } = SIDES[axis];
    const size = parseFloat(style.getPropertyValue(AXIS_SIZE[axis]));
    // An inline box has no size of its own to read: as drawn, then.
    if (Number.isNaN(size)) return roomIn(block)[axis];
    const borders = px(`border-${start}-width`) + px(`border-${end}-width`);
    const padding = style.boxSizing === "border-box" ? size - borders : size + px(`padding-${start}`) + px(`padding-${end}`);
    const [outer, inner] = axis === "x" ? [(block as HTMLElement).offsetWidth, block.clientWidth] : [(block as HTMLElement).offsetHeight, block.clientHeight];
    const scrollbar = Math.max(0, Math.round(outer - borders) - inner);
    return padding - scrollbar;
  };
  return { x: room("x"), y: room("y") };
}

/** The logical sides along each axis, as `inset-inline-*` and `inset-block-*` write them. */
const LOGICAL = { x: "inline", y: "block" } as const satisfies Record<Axis, string>;

/**
 * Whether the page or an edit gives `el` a value other than `auto` for its
 * side along `axis` from `edge` (ticket 89, review): the physical one
 * (`left`, `right`, `top`, `bottom`), or one that sets it, `inset`, or a
 * logical side that is it as `el`'s own text runs (`inset-inline-start` is
 * its `right` right to left, `inset-inline` both). An edit writes the
 * physical one, which stands; a logical one the page declares in the same
 * block as the physical one is not told apart.
 */
function sideDeclared(el: Element, axis: Axis, edge: Edge): boolean {
  const side = SIDES[axis][edge];
  const edit = declaredByEdit(el, side);
  if (edit) return edit !== "auto";
  const logical = axis === "x" && getComputedStyle(el).direction === "rtl" ? OTHER_EDGE[edge] : edge;
  const [physical, own, both, all] = declarationsOf(el, [side, `inset-${LOGICAL[axis]}-${logical}`, `inset-${LOGICAL[axis]}`, "inset"]);
  // Of a shorthand's values, written as few as the browser writes them, which one gives each side, by how many there are (`inset`: top, right, bottom, left).
  const set = (declaration: string | null, part: number, sides: number) => {
    if (!declaration) return false;
    const values = split(declaration.slice(declaration.indexOf(":") + 1).trim(), " ");
    const at = sides === 4 ? [[0, 0, 0, 0], [0, 1, 0, 1], [0, 1, 2, 1], [0, 1, 2, 3]][values.length - 1]?.[part] : part && values.length > 1 ? 1 : 0;
    return (values[at ?? 0] ?? "auto") !== "auto";
  };
  // Written as itself, else through a shorthand of its own, as the cascade has them.
  const name = physical?.slice(0, physical.indexOf(":")).trim();
  if (name === side) return set(physical, 0, 1);
  return set(own, 0, 1) || set(both, logical === "start" ? 0 : 1, 2) || set(all, { top: 0, right: 1, bottom: 2, left: 3 }[side], 4);
}

/**
 * How a value given to `el`'s `side` moves it, as its document lays it out:
 * placed absolute by it (`placed`); still in its container's layout, but
 * moved from where that lays it out, placed `relative`, or kept that far in
 * as the page scrolls, placed `sticky` (ticket 84); not at all (null). Its
 * `left` or `top` moves it wherever it is not static (ticket 83, review): an
 * X or Y writes the other side `auto`. Its `right` or `bottom` places it as
 * `endOffsetPlaces` has it; relative, moves it with no `left` or `top`
 * declared, which the browser goes by instead, but right to left, where it
 * goes by its `right` (`edgeGoneBy`, ticket 89); sticky, keeps it in from
 * that edge as well as from the other. Read from computed styles and what
 * is declared, with nothing laid out.
 */
export function sideMoves(el: Element, { axis, edge }: Side): "placed" | InLayout | null {
  const { position } = getComputedStyle(el);
  if (position === "relative" || position === "sticky")
    return edge === "start" || position === "sticky" || !sideDeclared(el, axis, "start") || endWins(el, axis) ? position : null;
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
 * What `el`'s sides, margins and size along `axis` add up to, as the browser
 * computes them, laid out, not as a `transform` or `rotate` draws it: the
 * room its container gives it, placed freely and not given more than it can
 * keep (`roomAlong` tells), so what its `left` and `right` (`top`, `bottom`)
 * are shares of.
 */
export function extentOf(el: Element, axis: Axis): number {
  const style = getComputedStyle(el);
  const { start, end } = SIDES[axis];
  const px = (property: string) => parseFloat(style.getPropertyValue(property)) || 0;
  return px(start) + px(end) + px(`margin-${start}`) + px(`margin-${end}`) + sizeAlong(el, axis);
}

/** How large `el`'s border box is along `axis`, as the browser computes it, laid out, not as a `transform` or `rotate` draws it. */
export function sizeAlong(el: Element, axis: Axis): number {
  const style = getComputedStyle(el);
  const { start, end } = SIDES[axis];
  const px = (property: string) => parseFloat(style.getPropertyValue(property)) || 0;
  const sides = [start, end].map((side) => px(`padding-${side}`) + px(`border-${side}-width`));
  return px(AXIS_SIZE[axis]) + (style.boxSizing === "border-box" ? 0 : sides[0] + sides[1]);
}

/**
 * How much room `container` gives a layer placed absolute in it, as its
 * positioning reference, along each axis, as drawn: its size inside its
 * border, to the fraction of a px (`insideBorder`). What the share and the px
 * a layer dropped in it is placed by from its right or bottom edge, or
 * centered, are of (ticket 79), on the canvas, where nothing is drawn otherwise.
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
 * now, and px past it (by its auto margins, where its middle is, ticket 96).
 * None along an axis it is placed from the start, or centered on a side whose
 * value is not read here (placed by its X and Y then).
 */
export function placedAlong(el: Element, at: Record<Axis, number>, room: Record<Axis, number>): Partial<Record<Axis, PlacedAlong>> | undefined {
  const placed: Partial<Record<Axis, PlacedAlong>> = {};
  const r = el.getBoundingClientRect();
  const [top, right, bottom, left] = marginsOf(el);
  for (const axis of ["x", "y"] as const) {
    const from = placedFrom(el, axis);
    if (from.edge === "start" && !from.centered) continue;
    const share = from.margins ? middleShareOf(el, axis) : from.centered ? sideShareOf(el, axis, from.edge) : { percent: 0, px: 0 };
    if (!share) continue;
    // From the end edge: what is left of its container's room past it and its margins, but one `auto` before it, which `at` counts (ticket 96). Centered by its auto margins: its middle.
    const size = (axis === "x" ? r.width + left + right : r.height + top + bottom) - autoMarginBefore(el, axis);
    const value = from.margins ? at[axis] + sizeAlong(el, axis) / 2 : from.edge === "start" ? at[axis] : room[axis] - at[axis] - size;
    placed[axis] = { ...from, percent: share.percent, px: pastShare(value, share.percent, room[axis]) };
  }
  return Object.keys(placed).length ? placed : undefined;
}
