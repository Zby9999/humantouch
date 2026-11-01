/**
 * Snapping a layer placed freely, as it is dragged: to the edges and middles
 * of the layers beside it and of its Frame, and to the spacing between the
 * layers beside it, with the marks that show what it snapped to. All in one
 * view's px, as it lays the layers out. What the canvas draws over a view to
 * show where a layer is are its marks.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A mark the canvas draws over a view to say where a layer is: a line it lines up on, a
 * space between layers as wide as another (snapped to equal spacing), or a
 * distance measured (⌥) with the length of it, and a dashed line taking an
 * edge on to where a distance is measured.
 */
export type Mark =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "gap" | "distance"; x1: number; y1: number; x2: number; y2: number; size: number }
  | { type: "extension"; x1: number; y1: number; x2: number; y2: number };

/** Where the layer goes, its top left, and the marks that show what it lined up with. */
export interface Snapped {
  x: number;
  y: number;
  marks: Mark[];
}

/** Across (x) or down (y). */
export type Axis = "x" | "y";
const SIZE = { x: "width", y: "height" } as const;
const OTHER = { x: "y", y: "x" } as const;
/** Lined up: as near as layout puts edges that are meant to meet. */
export const EPSILON = 0.01;

const start = (b: Box, a: Axis) => b[a];
const end = (b: Box, a: Axis) => b[a] + b[SIZE[a]];
/** A box's start, middle and end along an axis. */
export const anchors = (b: Box, a: Axis) => [start(b, a), start(b, a) + b[SIZE[a]] / 2, end(b, a)];

/**
 * Where a layer dragged to `box` goes: as near as `threshold` px, each way,
 * its start, middle or end on another's (a sibling's, or `frame`'s, the box
 * it is placed in), or as far from the layer before or after it as layers
 * beside it are from each other. Where nothing is that near, it stays where
 * it is dragged that way.
 */
export function snap(box: Box, siblings: Box[], frame: Box | null, threshold: number): Snapped {
  const targets = frame ? [...siblings, frame] : siblings;
  const x = start(box, "x") + offset(box, "x", targets, siblings, threshold);
  const y = start(box, "y") + offset(box, "y", targets, siblings, threshold);
  const at: Box = { x, y, width: box.width, height: box.height };
  return { x, y, marks: [...lines(at, "x", targets), ...lines(at, "y", targets), ...gaps(at, "x", siblings), ...gaps(at, "y", siblings)] };
}

/**
 * How far the box moves along `axis` to snap: the least that lines it up, or
 * spaces it as the layers beside it are spaced, within `threshold`; none when nothing does.
 */
function offset(box: Box, axis: Axis, targets: Box[], siblings: Box[], threshold: number): number {
  const at = start(box, axis);
  const size = box[SIZE[axis]];
  const wanted: number[] = [];
  for (const target of targets) {
    for (const there of anchors(target, axis)) for (const here of anchors(box, axis)) wanted.push(at + there - here);
  }
  const { before, after, spaces } = rowOf(box, axis, siblings);
  for (const { size: space } of spaces) {
    if (before) wanted.push(end(before, axis) + space);
    if (after) wanted.push(start(after, axis) - space - size);
  }
  if (before && after && start(after, axis) - end(before, axis) >= size) wanted.push((end(before, axis) + start(after, axis) - size) / 2);
  let best: number | null = null;
  for (const to of wanted) {
    const by = to - at;
    if (Math.abs(by) <= threshold && (best === null || Math.abs(by) < Math.abs(best))) best = by;
  }
  return best ?? 0;
}

/** A space between two layers side by side along an axis, from the end of `from` to the start of `to`. */
interface Space {
  from: Box;
  to: Box;
  size: number;
}

/**
 * The layers beside the box along `axis`: those across from it the other way,
 * in order. The nearest before its middle and after it, and the spaces
 * between the others, each next to the next (not the one the box is in).
 */
function rowOf(box: Box, axis: Axis, siblings: Box[]): { before: Box | null; after: Box | null; spaces: Space[] } {
  const across = OTHER[axis];
  const row = siblings
    .filter((b) => start(b, across) < end(box, across) && end(b, across) > start(box, across))
    .sort((a, b) => start(a, axis) - start(b, axis));
  const middle = start(box, axis) + box[SIZE[axis]] / 2;
  let before: Box | null = null;
  let after: Box | null = null;
  for (const b of row) {
    if (end(b, axis) <= middle && (!before || end(b, axis) > end(before, axis))) before = b;
    if (start(b, axis) >= middle && (!after || start(b, axis) < start(after, axis))) after = b;
  }
  const spaces: Space[] = [];
  for (let i = 0; i + 1 < row.length; i++) {
    const [from, to] = [row[i], row[i + 1]];
    if (end(from, axis) > start(to, axis) || (from === before && to === after)) continue;
    spaces.push({ from, to, size: start(to, axis) - end(from, axis) });
  }
  return { before, after, spaces };
}

/**
 * The spaces marked where the box is spaced as layers beside it are: on
 * either side of it, and between those layers, each where the two it is
 * between face each other.
 */
function gaps(box: Box, axis: Axis, siblings: Box[]): Mark[] {
  const { before, after, spaces } = rowOf(box, axis, siblings);
  const own: Space[] = [];
  if (before) own.push({ from: before, to: box, size: start(box, axis) - end(before, axis) });
  if (after) own.push({ from: box, to: after, size: start(after, axis) - end(box, axis) });
  const same = (a: number, b: number) => Math.abs(a - b) < EPSILON;
  const marked = new Set<Space>();
  for (const side of own) {
    if (side.size < 0) continue;
    const alike = [...spaces, ...own].filter((space) => space !== side && same(space.size, side.size));
    if (!alike.length) continue;
    marked.add(side);
    for (const space of alike) marked.add(space);
  }
  const across = OTHER[axis];
  return [...marked]
    .sort((a, b) => end(a.from, axis) - end(b.from, axis))
    .map(({ from, to, size }) => {
      // Where the two face each other, across: the middle of what they share that way.
      const mid = (Math.max(start(from, across), start(to, across)) + Math.min(end(from, across), end(to, across))) / 2;
      const [a, b] = [end(from, axis), start(to, axis)];
      return axis === "x" ? { type: "gap", x1: a, y1: mid, x2: b, y2: mid, size } : { type: "gap", x1: mid, y1: a, x2: mid, y2: b, size };
    });
}

/** The lines the box lines up on along `axis`, each across the box and all it lines up with there. */
export function lines(box: Box, axis: Axis, targets: Box[]): Mark[] {
  const across = OTHER[axis];
  const spans = new Map<number, [number, number]>();
  const own = anchors(box, axis);
  for (const target of targets) {
    for (const there of anchors(target, axis)) {
      const at = own.find((here) => Math.abs(here - there) < EPSILON);
      if (at === undefined) continue;
      const [from, to] = spans.get(at) ?? [start(box, across), end(box, across)];
      spans.set(at, [Math.min(from, start(target, across)), Math.max(to, end(target, across))]);
    }
  }
  return [...spans].map(([at, [from, to]]) =>
    axis === "x" ? { type: "line", x1: at, y1: from, x2: at, y2: to } : { type: "line", x1: from, y1: at, x2: to, y2: at },
  );
}

/**
 * The distances from the layer selected, `from`, to another, `to`, as ⌥
 * shows them, each way. Apart that way: the space between them, level with
 * the middle of what they share across (else with `from`'s middle, and the
 * edge of `to` facing it taken on to there). Overlapping both ways, one
 * inside the other or not: from edge to edge on each side, where they differ.
 */
export function distances(from: Box, to: Box): Mark[] {
  return [...distancesAlong("x", from, to), ...distancesAlong("y", from, to)];
}

function distancesAlong(axis: Axis, from: Box, to: Box): Mark[] {
  const across = OTHER[axis];
  const shared = [Math.max(start(from, across), start(to, across)), Math.min(end(from, across), end(to, across))];
  const overlapsAcross = shared[0] < shared[1];
  const level = overlapsAcross ? (shared[0] + shared[1]) / 2 : start(from, across) + from[SIZE[across]] / 2;
  const line = (a: number, b: number, at: number) => (axis === "x" ? { x1: a, y1: at, x2: b, y2: at } : { x1: at, y1: a, x2: at, y2: b });
  const measured = (a: number, b: number): Mark => ({ type: "distance", ...line(a, b, level), size: b - a });

  const toFirst = end(to, axis) <= start(from, axis);
  if (toFirst || end(from, axis) <= start(to, axis)) {
    const [a, b] = toFirst ? [end(to, axis), start(from, axis)] : [end(from, axis), start(to, axis)];
    if (b - a < EPSILON) return [];
    const marks = [measured(a, b)];
    if (!overlapsAcross) {
      // The edge of `to` facing `from`, taken on from its nearer corner to the level measured at.
      const edge = toFirst ? a : b;
      const corner = level < start(to, across) ? start(to, across) : end(to, across);
      const [p, q] = [Math.min(level, corner), Math.max(level, corner)];
      marks.push({ type: "extension", ...(axis === "x" ? { x1: edge, y1: p, x2: edge, y2: q } : { x1: p, y1: edge, x2: q, y2: edge }) });
    }
    return marks;
  }
  if (!overlapsAcross) return [];
  const marks: Mark[] = [];
  for (const [a, b] of [
    [start(from, axis), start(to, axis)],
    [end(from, axis), end(to, axis)],
  ]) {
    if (Math.abs(a - b) >= EPSILON) marks.push(measured(Math.min(a, b), Math.max(a, b)));
  }
  return marks;
}
