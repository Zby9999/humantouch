/**
 * Resizing a layer by one of its handles, as Figma does: where its box goes
 * as the handle is dragged, in one view's px. A corner's handle sets its
 * width and height, an edge's one of them; ⇧ keeps its proportions, ⌥
 * resizes it from its middle. It stops at its minimum and maximum sizes.
 */
import { round } from "./property-table";
import { anchors, EPSILON, lines, type Axis, type Box, type Mark } from "./snap";

/** A handle on the selection box: a corner or the middle of an edge, by the compass. */
export type Handle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/** Every handle, corners first: an edge's handle is drawn under the corners'. */
export const HANDLES: Handle[] = ["nw", "ne", "se", "sw", "n", "e", "s", "w"];

/** The sizes a layer is kept within, outer sizes in px; Infinity: no maximum. */
export interface Limits {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

/** A resize by a handle as far as it has gone: what `resizeBox` works out where the layer goes from. */
export interface ResizeInput {
  handle: Handle;
  /** The layer's box as it was pressed, in the view's px. */
  start: Box;
  /** How far the pointer has gone since, in the view's px. */
  by: { x: number; y: number };
  /** ⇧: its width and height stay in proportion. */
  keepRatio: boolean;
  /** ⌥: its middle stays where it is, the edge across from the one dragged moving as far the other way. */
  fromCenter: boolean;
  /**
   * The ways it is centred on where it is placed (`translate: -50%`, ticket
   * 75): that way its middle stays, ⌥ held or not, so it stays centred.
   */
  centered?: Middles;
  limits: Limits;
  /** Snapping, the edges dragged line up with the edges and middles of `targets` within `within` px; null: not at all. */
  snap: { targets: Box[]; within: number } | null;
}

/** Along each axis, whether a layer's middle stays where it is as it is resized. */
export interface Middles {
  x: boolean;
  y: boolean;
}

/** Where a layer resized by a handle goes, and what is set of it. */
export interface Resized {
  /** Where the layer goes, in the view's px. */
  box: Box;
  /** Whether its width is set, and its height: those the handle sets, or keeping its proportions changes. */
  width: boolean;
  height: boolean;
  /** The lines the edges dragged line up on, snapping. */
  marks: Mark[];
}

/** Which way a handle moves an edge along each axis: -1 the start one, 1 the end one, 0 none. A corner's moves one each way. */
export function sides(handle: Handle): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  return {
    x: handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0,
    y: handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0,
  };
}

/**
 * Where the layer goes as `input` has it resized. Its sizes are whole px, but
 * where an edge snaps: exactly where it lines up, to the hundredth of a px.
 */
export function resizeBox({ handle, start, by, keepRatio, fromCenter, centered, limits, snap }: ResizeInput): Resized {
  const side = sides(handle);
  const middles = middlesOf(fromCenter, centered);
  const snapped = { x: false, y: false };
  const travel = { ...by };
  if (snap) {
    for (const axis of ["x", "y"] as const) {
      const offset = side[axis] && snapOffset(start, axis, side[axis], travel[axis], middles[axis], snap.targets, snap.within);
      if (offset === null || !side[axis]) continue;
      travel[axis] += offset;
      snapped[axis] = true;
    }
  }
  // From the middle, the edge across moves as far: the size changes twice as much.
  const twice = (axis: Axis) => (middles[axis] ? 2 : 1);
  let width = start.width + side.x * travel.x * twice("x");
  let height = start.height + side.y * travel.y * twice("y");
  if (keepRatio && start.width > 0 && start.height > 0) {
    // By the size changed most, as a share of what it was; an edge's, the only one it changes.
    const [sx, sy] = [width / start.width, height / start.height];
    const byWidth = !side.y || (!!side.x && Math.abs(sx - 1) >= Math.abs(sy - 1));
    // Within the limits both ways: the scale stops where the first size reaches one.
    const lowest = Math.max(limits.minWidth / start.width, limits.minHeight / start.height, 0);
    const highest = Math.min(limits.maxWidth / start.width, limits.maxHeight / start.height);
    const kept = Math.min(Math.max(byWidth ? sx : sy, lowest), highest);
    [width, height] = [start.width * kept, start.height * kept];
    // The size it follows is no longer where it snapped to.
    if (byWidth) snapped.y = false;
    else snapped.x = false;
  }
  width = rounded(within(width, limits.minWidth, limits.maxWidth), snapped.x);
  height = rounded(within(height, limits.minHeight, limits.maxHeight), snapped.y);
  // Kept in proportion, the size it follows is set too, unless there was none to keep.
  const ratio = keepRatio && start.width > 0 && start.height > 0;
  const sets = { x: side.x !== 0 || (ratio && side.y !== 0), y: side.y !== 0 || (ratio && side.x !== 0) };
  const box = { x: placed(start.x, start.width, width, side.x, middles.x), y: placed(start.y, start.height, height, side.y, middles.y), width, height };
  const marks = snap ? marksOf(box, handle, middles, snap.targets) : [];
  return { box, width: sets.x, height: sets.y, marks };
}

/** The ways a layer's middle stays as it is resized: every way with ⌥ held (`fromCenter`), else those it is centred along. */
export function middlesOf(fromCenter: boolean, centered: Middles = { x: false, y: false }): Middles {
  return { x: fromCenter || centered.x, y: fromCenter || centered.y };
}

/**
 * The lines the edges of `box` dragged by `handle` (from the middle, both
 * edges that way, along those `middles` says) line up on, among the edges and
 * middles of `targets`: as the layer is laid out, which its container may
 * place otherwise than where it was dragged to.
 */
export function marksOf(box: Box, handle: Handle, middles: Middles, targets: Box[]): Mark[] {
  const side = sides(handle);
  return (["x", "y"] as const).flatMap((axis) => (side[axis] ? linesOn(box, axis, side[axis], middles[axis], targets) : []));
}

/** The edges of `box` dragged along `axis`: the one on `side`, and from the middle the one across too. */
function draggedEdges(box: Box, axis: Axis, side: -1 | 1, fromCenter: boolean): number[] {
  const [first, , last] = anchors(box, axis);
  return fromCenter ? [first, last] : [side < 0 ? first : last];
}

/**
 * How much further the pointer goes along `axis` for an edge dragged to line
 * up with an edge or middle of a target: the least within `within`; null when none is.
 */
function snapOffset(start: Box, axis: Axis, side: -1 | 1, travel: number, fromCenter: boolean, targets: Box[], within: number): number | null {
  const [first, , last] = anchors(start, axis);
  // Each edge dragged, where it is now, and which way it goes as the pointer goes on.
  const edges = fromCenter ? [{ at: first - side * travel, sign: -side }, { at: last + side * travel, sign: side }] : [{ at: (side < 0 ? first : last) + travel, sign: 1 }];
  let best: number | null = null;
  for (const target of targets) {
    for (const there of anchors(target, axis)) {
      for (const edge of edges) {
        const by = (there - edge.at) * edge.sign;
        if (Math.abs(by) <= within && (best === null || Math.abs(by) < Math.abs(best))) best = by;
      }
    }
  }
  return best;
}

/** The lines the edges dragged along `axis` line up on, across the box and what they line up with. */
function linesOn(box: Box, axis: Axis, side: -1 | 1, fromCenter: boolean, targets: Box[]): Mark[] {
  const dragged = draggedEdges(box, axis, side, fromCenter);
  return lines(box, axis, targets).filter((mark) => dragged.some((at) => Math.abs((axis === "x" ? mark.x1 : mark.y1) - at) < EPSILON));
}

/** A size as set: whole px, or, where it snapped, to the hundredth. */
function rounded(size: number, exact: boolean): number {
  return exact ? round(size) : Math.round(size);
}

/** `size` within a minimum and a maximum, and never below none: past the edge across, it does not turn over. */
function within(size: number, min: number, max: number): number {
  return Math.max(Math.min(size, max), min, 0);
}

/**
 * Where a box `size` long starts along an axis, resized from one `was` long
 * at `at`: the edge across from the one dragged stays, or, from the middle or
 * with no edge dragged that way (kept in proportion), its middle.
 */
function placed(at: number, was: number, size: number, side: -1 | 0 | 1, fromCenter: boolean): number {
  if (fromCenter || side === 0) return at + (was - size) / 2;
  return side < 0 ? at + was - size : at;
}
