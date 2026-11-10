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
}

/** A point on the stage, in canvas px. */
export interface Point {
  x: number;
  y: number;
}

/** A card placed: where it is, and its line from the card to its layer, if the layer is drawn. */
export interface PlacedCard extends Box {
  key: string;
  side: "left" | "right" | "top";
  line: { from: Point; to: Point } | null;
}

/** How wide a card is, in canvas px: it scales with the canvas, as a note on it does. */
export const CARD_WIDTH = 220;
/** Between a card and its host, in canvas px: as far again as the gap between views (`VIEW_GAP`). */
export const CARD_OFFSET = 160;
/** Between one card and the next, and between a card and anything else, in canvas px. */
export const CARD_GAP = 16;
/** Above a view, the room its label takes, in canvas px: a card in a row above it stays clear of it. */
export const LABEL_ROOM = 64;

/**
 * Where each of `cards` goes, kept clear of `obstacles` (the views, with the
 * room for their labels, and the layers off the canvas) and of one another.
 */
export function placeCards(cards: CardToPlace[], obstacles: Box[]): PlacedCard[] {
  const taken: Box[] = [...obstacles];
  const sided = cards.map((card) => ({ card, side: sideOf(card) }));
  // Down a column, top to bottom; along a row, left to right; by the layer, then as written.
  const along = (c: CardToPlace, side: PlacedCard["side"]) => {
    const at = c.layer ?? { ...c.host, height: 0, width: 0 };
    return side === "top" ? [at.x + at.width / 2, at.y] : [at.y + at.height / 2, at.x];
  };
  const order = sided
    .map((s, i) => ({ ...s, i, by: along(s.card, s.side) }))
    .sort((a, b) => a.by[0] - b.by[0] || a.by[1] - b.by[1] || a.i - b.i);
  const placed = new Map<number, PlacedCard>();
  for (const { card, side, i } of order) {
    const { host, layer, height } = card;
    const width = CARD_WIDTH;
    let x: number;
    let y: number;
    if (side === "top") {
      const middle = layer ? layer.x + layer.width / 2 : host.x + width / 2;
      x = Math.max(host.x, middle - width / 2);
      y = host.y - LABEL_ROOM - CARD_OFFSET / 2 - height;
    } else {
      x = side === "left" ? host.x - CARD_OFFSET - width : host.x + host.width + CARD_OFFSET;
      const middle = layer ? layer.y + layer.height / 2 : host.y + height / 2;
      y = Math.max(host.y, middle - height / 2);
    }
    // Moved on till it is clear of everything placed so far.
    for (let tries = 0; tries < 1000; tries++) {
      const box = { x, y, width, height };
      const hit = taken.find((other) => overlaps(box, other, CARD_GAP));
      if (!hit) break;
      if (side === "top") x = hit.x + hit.width + CARD_GAP;
      else y = hit.y + hit.height + CARD_GAP;
    }
    const box = { x, y, width, height };
    taken.push(box);
    placed.set(i, { key: card.key, side, ...box, line: layer ? lineOf(box, layer) : null });
  }
  return cards.map((_, i) => placed.get(i)!);
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

/** The line from a card to its layer: from the middle of the card's side nearest the layer to the middle of the layer's side nearest the card. */
export function lineOf(card: Box, layer: Box): { from: Point; to: Point } {
  const center = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
  const to = nearest(middles(layer), center);
  return { from: nearest(middles(card), to), to };
}

/** The one of `points` nearest `to`, the first on a tie. */
function nearest(points: Point[], to: Point): Point {
  let best = points[0];
  for (const p of points) if (Math.hypot(p.x - to.x, p.y - to.y) < Math.hypot(best.x - to.x, best.y - to.y)) best = p;
  return best;
}
