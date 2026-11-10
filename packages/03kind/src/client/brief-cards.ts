/**
 * Where the cards of the briefs go on the stage (ticket 121): each in the
 * blank space beside the view it was written in, or beside the layer made in
 * the blank space it is on, with a dashed line to the middle of the side of
 * its layer nearest it. As Figma's annotations on the canvas: the cards of a
 * view in a column at its free side, in the order of their layers from top to
 * bottom, each as level with its layer as the cards above it leave room for;
 * a view with no free side (one between two others) has them in a row above
 * it, in the order of their layers from left to right. No card covers
 * another, a view, its label, or a layer off the canvas: one that would is
 * moved on, down the column or along the row, till it is clear. Pure: what
 * is where on the stage, in canvas px, in; where each card goes, out.
 */

/** A box on the stage, in canvas px. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A card to place. */
export interface CardToPlace {
  key: string;
  /** What it is beside: the view it was written in, or the layer off the canvas its layer is in. */
  host: Box;
  /** Whether the host has blank space at its left and at its right: a view between two others has neither. */
  free: { left: boolean; right: boolean };
  /** Its layer, where it is on the stage; null when it is not drawn there (hidden at that width). */
  layer: Box | null;
  /** How tall the card is, in canvas px. */
  height: number;
  /**
   * How tall it was when it was set, if it is taller now: a card set before, opened again to be changed, is placed as
   * tall as it was, so it grows down from where it is, and the cards below it move down to make room (designer, 2026-11-10).
   */
  restHeight?: number;
}

/** A point on the stage, in canvas px. */
export interface Point {
  x: number;
  y: number;
}

/** A card's line to its layer: from the card, to the middle of the layer's side, by `path`, across and down only. */
export interface Line {
  from: Point;
  to: Point;
  /** Every corner of it, `from` first and `to` last. */
  path: Point[];
}

/** A card placed: where it is, and its line from the card to its layer, if the layer is drawn. */
export interface PlacedCard extends Box {
  key: string;
  side: "left" | "right" | "top";
  line: Line | null;
}

/** How wide a card is, in canvas px: it scales with the canvas, as a note on it does. */
export const CARD_WIDTH = 220;
/** Between a card and its host, in canvas px: half the gap between views (`VIEW_GAP`), close to it as Figma's notes are (designer, 2026-11-10). */
export const CARD_OFFSET = 40;
/** Between the bends of lines side by side, in canvas px, at most. */
const BEND_STEP = 8;
/** Between one card and the next, and between a card and anything else, in canvas px. */
export const CARD_GAP = 16;
/** Above a view, the room its label takes, in canvas px: a card in a row above it stays clear of it. */
export const LABEL_ROOM = 64;

/**
 * Where each of `cards` goes, kept clear of `obstacles` (the views, with the
 * room for their labels, and the layers off the canvas) and of one another;
 * but for the one being written in, `writing`, which is beside its layer
 * (`besideLayer`) till it is set, and moves nothing else meanwhile.
 */
export function placeCards(cards: CardToPlace[], obstacles: Box[], writing: string | null = null): PlacedCard[] {
  const taken: Box[] = [...obstacles];
  const sided = cards.map((card, i) => ({ card, i, side: sideOf(card) })).filter(({ card }) => card.key !== writing || !card.layer);
  // Down a column, top to bottom; along a row, left to right; by the layer, then as written.
  const along = (c: CardToPlace, side: PlacedCard["side"]) => {
    const at = c.layer ?? { ...c.host, height: 0, width: 0 };
    return side === "top" ? [at.x + at.width / 2, at.y] : [at.y + at.height / 2, at.x];
  };
  const order = sided
    .map((s) => ({ ...s, by: along(s.card, s.side) }))
    .sort((a, b) => a.by[0] - b.by[0] || a.by[1] - b.by[1] || a.i - b.i);
  const placed = new Map<number, PlacedCard>();
  for (const { card, side, i } of order) {
    const { host, layer, height } = card;
    const sits = card.restHeight ?? height;
    const width = CARD_WIDTH;
    let x: number;
    let y: number;
    if (side === "top") {
      const middle = layer ? layer.x + layer.width / 2 : host.x + width / 2;
      x = Math.max(host.x, middle - width / 2);
      y = host.y - LABEL_ROOM - CARD_OFFSET / 2 - sits;
    } else {
      x = side === "left" ? host.x - CARD_OFFSET - width : host.x + host.width + CARD_OFFSET;
      const middle = layer ? layer.y + layer.height / 2 : host.y + sits / 2;
      y = Math.max(host.y, middle - sits / 2);
    }
    // Moved on till it is clear of everything placed so far.
    for (let tries = 0; tries < 1000; tries++) {
      const box = { x, y, width, height: sits };
      const hit = taken.find((other) => overlaps(box, other, CARD_GAP));
      if (!hit) break;
      if (side === "top") x = hit.x + hit.width + CARD_GAP;
      else y = hit.y + hit.height + CARD_GAP;
    }
    const box = { x, y, width, height };
    taken.push(box);
    placed.set(i, { key: card.key, side, ...box, line: null });
  }
  // Their lines, in the same order: each clear of the other layers with briefs and of the lines drawn before it.
  const layers = cards.flatMap((c) => (c.layer ? [c.layer] : []));
  const drawn: Segment[] = [];
  for (const { card, side, i } of order) {
    if (!card.layer) continue;
    const at = placed.get(i)!;
    // From where its side's middle was before it grew, so the line does not move as it is written in.
    const line = lineOf({ ...at, height: card.restHeight ?? at.height }, card.layer, side === "top" ? "down" : "across", CARD_OFFSET / 2, { layers, lines: drawn });
    drawn.push(...segmentsOf(line.path));
    placed.set(i, { ...at, line });
  }
  spreadBends(cards, placed);
  cards.forEach((card, i) => {
    if (!placed.has(i)) placed.set(i, besideLayer(card));
  });
  return cards.map((_, i) => placed.get(i)!);
}

/**
 * The card being written in, beside its layer in its view, so it is written where the layer is rather than out
 * beside the view (designer, 2026-11-10): right of it, level with it; else left of it; else, the layer as wide as the
 * view, inside its top right corner. Its line to the layer, unless it is over it.
 */
function besideLayer(card: CardToPlace): PlacedCard {
  const { host, height } = card;
  const layer = card.layer!;
  const width = CARD_WIDTH;
  // Level with a layer shorter than it, its line straight; at the top of a taller one.
  const y = layer.height < height ? layer.y + layer.height / 2 - height / 2 : layer.y;
  let box: Box;
  let side: PlacedCard["side"];
  if (layer.x + layer.width + CARD_GAP + width <= host.x + host.width) {
    box = { x: layer.x + layer.width + CARD_GAP, y, width, height };
    side = "left";
  } else if (layer.x - CARD_GAP - width >= host.x) {
    box = { x: layer.x - CARD_GAP - width, y, width, height };
    side = "right";
  } else {
    box = { x: Math.max(host.x, layer.x + layer.width - CARD_GAP - width), y: layer.y + CARD_GAP, width, height };
    side = "right";
  }
  const over = box.x < layer.x + layer.width && layer.x < box.x + width && box.y < layer.y + layer.height && layer.y < box.y + height;
  return { key: card.key, side, ...box, line: over ? null : lineOf(box, layer, "across") };
}

/**
 * The lines of a column (or a row) of cards bent twice at the same place would run on one another: each is bent a little
 * further from its card than the one before, in the order that keeps them from crossing (the line of the card further
 * from its layer, further out), about the middle of the space between the cards and their view.
 */
function spreadBends(cards: CardToPlace[], placed: Map<number, PlacedCard>) {
  const groups = new Map<string, { i: number; card: PlacedCard }[]>();
  placed.forEach((card, i) => {
    const path = card.line?.path;
    if (!path || path.length < 4) return;
    const across = card.side !== "top";
    // Bent in the space beside the card: its second and third corners there, one above the other.
    if (across ? path[1].x !== path[2].x : path[1].y !== path[2].y) return;
    const back = across ? path[2].y < path[1].y : path[2].x < path[1].x;
    const { host } = cards[i];
    const key = `${host.x},${host.y},${card.side},${back}`;
    groups.set(key, [...(groups.get(key) ?? []), { i, card }]);
  });
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const across = group[0].card.side !== "top";
    const at = (c: PlacedCard) => (across ? c.line!.from.y : c.line!.from.x);
    const [p1, p2] = [group[0].card.line!.path[1], group[0].card.line!.path[2]];
    const back = across ? p2.y < p1.y : p2.x < p1.x;
    group.sort((a, b) => (back ? at(a.card) - at(b.card) : at(b.card) - at(a.card)));
    const step = Math.min(BEND_STEP, (CARD_OFFSET - 2 * BEND_STEP) / (group.length - 1));
    group.forEach(({ i, card }, k) => {
      const line = card.line!;
      const away = CARD_OFFSET / 2 + (k - (group.length - 1) / 2) * step;
      const [from, beyond] = [line.from, line.path[3]];
      const path = line.path.map((p) => ({ ...p }));
      if (across) {
        const sign = Math.sign(path[1].x - from.x) || 1;
        const room = Math.abs(beyond.x - from.x);
        path[1].x = path[2].x = from.x + sign * Math.min(away, room / 2 || away);
      } else {
        const sign = Math.sign(path[1].y - from.y) || 1;
        const room = Math.abs(beyond.y - from.y);
        path[1].y = path[2].y = from.y + sign * Math.min(away, room / 2 || away);
      }
      placed.set(i, { ...card, line: { ...line, path } });
    });
  }
}

/** The free side of the host nearest the layer, the left on a tie; with neither free, above it. */
function sideOf({ host, free, layer }: CardToPlace): PlacedCard["side"] {
  if (free.left && free.right) {
    if (!layer) return "left";
    return layer.x + layer.width / 2 > host.x + host.width / 2 ? "right" : "left";
  }
  if (free.left) return "left";
  if (free.right) return "right";
  return "top";
}

/** Whether two boxes come within `gap` of each other. */
function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

/** The middle of each side of a box: left, right, top, bottom. */
function middles(box: Box): Point[] {
  const { x, y, width, height } = box;
  return [
    { x, y: y + height / 2 },
    { x: x + width, y: y + height / 2 },
    { x: x + width / 2, y },
    { x: x + width / 2, y: y + height },
  ];
}

/** A straight piece of a line: from, to. */
type Segment = [Point, Point];

/** What a line keeps clear of, as it can: the other layers with briefs, and the lines drawn before it. */
export interface InTheWay {
  layers: Box[];
  lines: Segment[];
}

const NOTHING_IN_THE_WAY: InTheWay = { layers: [], lines: [] };

/** How far out from a layer's top or bottom a line goes round to come into it, in canvas px. */
const ROUND = 8;

function segmentsOf(path: Point[]): Segment[] {
  return path.slice(1).map((to, i) => [path[i], to]);
}

const swap = (p: Point): Point => ({ x: p.y, y: p.x });
const swapBox = (b: Box): Box => ({ x: b.y, y: b.x, width: b.height, height: b.width });

/** How far a piece of a line, across or down, goes through the inside of `box`: 0 if it does not. */
function lengthThrough([a, b]: Segment, box: Box): number {
  const e = 0.5;
  const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  if (!(x2 > box.x + e && x1 < box.x + box.width - e && y2 > box.y + e && y1 < box.y + box.height - e)) return 0;
  return Math.max(Math.min(x2, box.x + box.width) - Math.max(x1, box.x), 0) + Math.max(Math.min(y2, box.y + box.height) - Math.max(y1, box.y), 0);
}

/** What running on another line costs a way, against going through layers: more than going through any. */
const RUNS_ON = 1e6;

/** Whether two pieces of lines run on one another, along the same line. */
function along([a1, a2]: Segment, [b1, b2]: Segment): boolean {
  const aDown = a1.x === a2.x;
  if (aDown !== (b1.x === b2.x)) return false;
  if (aDown ? a1.x !== b1.x : a1.y !== b1.y) return false;
  const [p1, p2] = aDown ? [Math.min(a1.y, a2.y), Math.max(a1.y, a2.y)] : [Math.min(a1.x, a2.x), Math.max(a1.x, a2.x)];
  const [q1, q2] = aDown ? [Math.min(b1.y, b2.y), Math.max(b1.y, b2.y)] : [Math.min(b1.x, b2.x), Math.max(b1.x, b2.x)];
  return Math.min(p2, q2) - Math.max(p1, q1) > 0.5;
}

const contains = (outer: Box, inner: Box) =>
  outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;

/**
 * The line from a card to its layer, as Figma draws a note's (designer, 2026-11-10): across and down only, from the
 * middle of the card's side to the middle of one of the layer's. Into the middle of the layer's side facing the card
 * when it can: straight if the card is level with it, else bent twice, `bendAt` out from the card. If that would run
 * on a line drawn before it, or through another layer with a brief (`inTheWay`), into the middle of its top or bottom,
 * the nearer first: across and then down into it if the card is clear of it, else round to it, `ROUND` out from it.
 * `"down"`, the same turned a quarter: from the card's bottom, into the layer's top. By default, the way the layer's
 * side nearest the card faces.
 */
export function lineOf(card: Box, layer: Box, way?: "across" | "down", bendAt = CARD_OFFSET / 2, inTheWay = NOTHING_IN_THE_WAY): Line {
  if (!way) {
    const center = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
    const [left, right, top, bottom] = middles(layer);
    const facing = nearest([left, right, top, bottom], center);
    way = facing === left || facing === right ? "across" : "down";
  }
  if (way === "across") return routeAcross(card, layer, bendAt, inTheWay);
  const turned = routeAcross(swapBox(card), swapBox(layer), bendAt, {
    layers: inTheWay.layers.map(swapBox),
    lines: inTheWay.lines.map(([a, b]) => [swap(a), swap(b)]),
  });
  return { from: swap(turned.from), to: swap(turned.to), path: turned.path.map(swap) };
}

function routeAcross(card: Box, layer: Box, bendAt: number, inTheWay: InTheWay): Line {
  const [left, right, top, bottom] = middles(layer);
  const middleY = layer.y + layer.height / 2;
  const side = card.x + card.width / 2 < layer.x + layer.width / 2 ? left : right;
  const from = { x: side === left ? card.x + card.width : card.x, y: card.y + card.height / 2 };
  const bend = from.x + Math.sign(side.x - from.x) * Math.min(bendAt, Math.abs(side.x - from.x) / 2);
  const ways: Point[][] = [Math.abs(from.y - side.y) < 0.5 ? [from, side] : [from, { x: bend, y: from.y }, { x: bend, y: side.y }, side]];
  for (const end of from.y < middleY ? [top, bottom] : [bottom, top]) {
    const above = end === top;
    if (above ? from.y <= layer.y : from.y >= layer.y + layer.height) ways.push([from, { x: end.x, y: from.y }, end]);
    const out = above ? layer.y - ROUND : layer.y + layer.height + ROUND;
    ways.push([from, { x: bend, y: from.y }, { x: bend, y: out }, { x: end.x, y: out }, end]);
  }
  // The other layers it may not go through: not the layer's own, nor those it is in.
  const others = inTheWay.layers.filter((b) => !contains(b, layer));
  // Its bend in the space beside the card may run on another's there: those are moved apart once all are drawn (`spreadBends`).
  const inGutter = ([a, b]: Segment) => a.x === bend && b.x === bend;
  // What a way costs: running on another line most, then how far it goes through other layers. The first clear one,
  // else the one that costs least.
  const cost = (path: Point[]) =>
    segmentsOf(path)
      .filter(([a, b]) => a.x !== b.x || a.y !== b.y)
      .reduce((sum, piece) => sum + others.reduce((n, b) => n + lengthThrough(piece, b), 0) + (!inGutter(piece) && inTheWay.lines.some((l) => along(piece, l)) ? RUNS_ON : 0), 0);
  const costs = ways.map(cost);
  const best = ways[costs.indexOf(Math.min(...costs))];
  const path = best.filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
  return { from, to: path[path.length - 1], path };
}

/** How round a line's corners are, in canvas px, at most: as Figma's connectors. */
const LINE_CORNER = 8;

/** A line's path as SVG draws it, its corners rounded, none more than half its shorter leg. */
export function pathOf(path: Point[]): string {
  let d = `M${path[0].x},${path[0].y}`;
  for (let i = 1; i < path.length - 1; i++) {
    const [a, at, b] = [path[i - 1], path[i], path[i + 1]];
    const r = Math.min(LINE_CORNER, Math.hypot(at.x - a.x, at.y - a.y) / 2, Math.hypot(b.x - at.x, b.y - at.y) / 2);
    const toward = (p: Point) => {
      const length = Math.hypot(p.x - at.x, p.y - at.y) || 1;
      return { x: at.x + ((p.x - at.x) / length) * r, y: at.y + ((p.y - at.y) / length) * r };
    };
    const [enter, leave] = [toward(a), toward(b)];
    d += ` L${enter.x},${enter.y} Q${at.x},${at.y} ${leave.x},${leave.y}`;
  }
  const end = path[path.length - 1];
  return `${d} L${end.x},${end.y}`;
}

/** The one of `points` nearest `to`, the first on a tie. */
function nearest(points: Point[], to: Point): Point {
  let best = points[0];
  for (const p of points) if (Math.hypot(p.x - to.x, p.y - to.y) < Math.hypot(best.x - to.x, best.y - to.y)) best = p;
  return best;
}
