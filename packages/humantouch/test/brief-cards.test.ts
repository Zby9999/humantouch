import { describe, expect, test } from "vitest";
import { CARD_GAP, CARD_OFFSET, CARD_WIDTH, FULL_SIZE_FROM, LABEL_ROOM, lineOf, pathOf, placeCards, type Box, type CardToPlace } from "../src/client/brief-cards";
import { VIEW_GAP_WITH_BRIEFS } from "../src/client/view-layout";

const desktop: Box = { x: 0, y: 0, width: 1440, height: 3000 };
const tablet: Box = { x: 1520, y: 0, width: 768, height: 3600 };
const phone: Box = { x: 2368, y: 0, width: 390, height: 5000 };
const views = [desktop, tablet, phone];

const card = (key: string, host: Box, layer: Box | null, height = 120, free = { left: host === desktop, right: host === phone }): CardToPlace => ({ key, host, free, layer, height });

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("the cards of the briefs, beside their views", () => {
  test("a card of the desktop view goes left of it, level with its layer, its line from its right side to the middle of the layer's left side", () => {
    const [placed] = placeCards([card("a", desktop, { x: 200, y: 400, width: 300, height: 100 })], views);
    expect(placed).toMatchObject({ side: "left", x: -CARD_OFFSET - CARD_WIDTH, y: 450 - 60, width: CARD_WIDTH, height: 120 });
    expect(placed.line).toEqual({ from: { x: -CARD_OFFSET, y: 450 }, to: { x: 200, y: 450 }, path: [{ x: -CARD_OFFSET, y: 450 }, { x: 200, y: 450 }] });
  });

  test("the last view's cards go right of it; one between two others has them in a row above it, clear of its label", () => {
    const [onPhone, onTablet] = placeCards([card("p", phone, { x: 2400, y: 100, width: 100, height: 40 }), card("t", tablet, { x: 1600, y: 200, width: 200, height: 40 })], views);
    expect(onPhone).toMatchObject({ side: "right", x: phone.x + phone.width + CARD_OFFSET });
    expect(onTablet.side).toBe("top");
    expect(onTablet.y + onTablet.height).toBeLessThanOrEqual(-LABEL_ROOM);
    // Its line goes down to the middle of the layer's top.
    expect(onTablet.line!.to).toEqual({ x: 1700, y: 200 });
  });

  test("a view alone has cards on the side nearer the layer", () => {
    const alone = { left: true, right: true };
    const [left, right] = placeCards(
      [
        { key: "l", host: desktop, free: alone, layer: { x: 100, y: 0, width: 100, height: 100 }, height: 80 },
        { key: "r", host: desktop, free: alone, layer: { x: 1200, y: 0, width: 100, height: 100 }, height: 80 },
      ],
      [desktop],
    );
    expect(left.side).toBe("left");
    expect(right.side).toBe("right");
  });

  test("cards of layers close together stack down the column in the layers' order, none over another, and their lines do not cross", () => {
    const layers = [500, 520, 480, 510].map((y, i) => ({ x: 100 + i * 10, y, width: 50, height: 20 }));
    const placed = placeCards(layers.map((layer, i) => card(String(i), desktop, layer)), views);
    const byY = [...placed].sort((a, b) => a.y - b.y).map((p) => p.key);
    expect(byY).toEqual(["2", "0", "3", "1"]);
    for (const a of placed) for (const b of placed) if (a !== b) expect(overlaps(a, b)).toBe(false);
    const sorted = [...placed].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].y).toBeGreaterThanOrEqual(sorted[i - 1].y + sorted[i - 1].height + CARD_GAP);
    // Lines in order at both ends: none crosses another.
    const froms = sorted.map((p) => p.line!.from.y);
    const tos = sorted.map((p) => p.line!.to.y);
    expect(froms).toEqual([...froms].sort((a, b) => a - b));
    expect(tos).toEqual([...tos].sort((a, b) => a - b));
  });

  test("a card is kept clear of a layer off the canvas where it would go, and of the views", () => {
    const off = { x: -500, y: 300, width: 300, height: 400 };
    const [placed] = placeCards([card("a", desktop, { x: 0, y: 400, width: 100, height: 100 })], [...views, off]);
    expect(overlaps(placed, off)).toBe(false);
    expect(placed.y).toBe(off.y + off.height + CARD_GAP);
    for (const view of views) expect(overlaps(placed, view)).toBe(false);
  });

  test("dozens of cards lay out, none over another or a view", () => {
    const cards = Array.from({ length: 60 }, (_, i) => card(String(i), views[i % 3], { x: views[i % 3].x + 10, y: (i * 37) % 2000, width: 40, height: 40 }, 80 + (i % 4) * 20));
    const placed = placeCards(cards, views);
    for (const p of placed) for (const view of views) expect(overlaps(p, view)).toBe(false);
    for (const a of placed) for (const b of placed) if (a !== b) expect(overlaps(a, b)).toBe(false);
  });

  test("a card whose layer is not drawn has no line, and stays at its view's top", () => {
    const [placed] = placeCards([card("a", desktop, null)], views);
    expect(placed.line).toBeNull();
    expect(placed.y).toBe(0);
  });

  test("the line goes to the middle of the layer's side nearest the card", () => {
    const layer = { x: 0, y: 0, width: 100, height: 100 };
    expect(lineOf({ x: 300, y: 20, width: 100, height: 60 }, layer)).toMatchObject({ from: { x: 300, y: 50 }, to: { x: 100, y: 50 } });
    expect(lineOf({ x: 0, y: -300, width: 100, height: 60 }, layer)).toMatchObject({ from: { x: 50, y: -240 }, to: { x: 50, y: 0 } });
  });

  test("the lines of cards stacked down a column come to the middles of their layers' sides, bent apart, none on another, none crossing another", () => {
    const layers = [500, 505, 510, 515].map((y, i) => ({ x: 100 + i * 10, y, width: 50, height: 4 }));
    const placed = placeCards(layers.map((layer, i) => card(String(i), desktop, layer, 66)), views);
    for (const p of placed) {
      const layer = layers[Number(p.key)];
      expect(p.line!.to).toEqual({ x: layer.x, y: layer.y + layer.height / 2 });
    }
    const bends = placed.filter((p) => p.line!.path.length === 4).map((p) => p.line!.path[1].x);
    expect(bends.length).toBeGreaterThan(1);
    expect(new Set(bends).size).toBe(bends.length);
    const ends = placed.map((p) => `${p.line!.to.x},${p.line!.to.y}`);
    expect(new Set(ends).size).toBe(ends.length);
    const segments = placed.flatMap((p) => p.line!.path.slice(1).map((to, j) => [p.key, p.line!.path[j], to] as const));
    type Segment = (typeof segments)[number];
    const meet = (a: Segment, b: Segment) => {
      if (a[0] === b[0]) return false;
      const [, a1, a2] = a;
      const [, b1, b2] = b;
      const av = a1.x === a2.x;
      const bv = b1.x === b2.x;
      const span = (p: number, q: number) => [Math.min(p, q), Math.max(p, q)];
      if (av === bv) {
        // Along one another: on the same line, overlapping.
        if (av ? a1.x !== b1.x : a1.y !== b1.y) return false;
        const [p1, p2] = av ? span(a1.y, a2.y) : span(a1.x, a2.x);
        const [q1, q2] = av ? span(b1.y, b2.y) : span(b1.x, b2.x);
        return Math.min(p2, q2) - Math.max(p1, q1) > 0;
      }
      const [v1, v2, h1, h2] = av ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
      return v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) && h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y);
    };
    for (const a of segments) for (const b of segments) expect(meet(a, b)).toBe(false);
  });

  test("the line goes from the middle of the card's side to the middle of the layer's facing it, across and down only, as Figma draws a note's (designer, 2026-11-10)", () => {
    const layer = { x: 0, y: 0, width: 100, height: 100 };
    // Level: straight.
    expect(lineOf({ x: -260, y: 17, width: 220, height: 66 }, layer, "across").path).toEqual([{ x: -40, y: 50 }, { x: 0, y: 50 }]);
    // Not level: bent twice, halfway into the space beside the card.
    expect(lineOf({ x: -260, y: 200, width: 220, height: 66 }, layer, "across").path).toEqual([{ x: -40, y: 233 }, { x: -20, y: 233 }, { x: -20, y: 50 }, { x: 0, y: 50 }]);
    // A card above it, off to its right: down, across, down into the middle of its top.
    expect(lineOf({ x: 300, y: -200, width: 220, height: 66 }, layer, "down").path).toEqual([{ x: 410, y: -134 }, { x: 410, y: -114 }, { x: 50, y: -114 }, { x: 50, y: 0 }]);
    for (const line of [lineOf({ x: -900, y: 700, width: 220, height: 66 }, layer), lineOf({ x: 500, y: -500, width: 220, height: 90 }, layer, "down")])
      for (let i = 1; i < line.path.length; i++) expect(line.path[i].x === line.path[i - 1].x || line.path[i].y === line.path[i - 1].y).toBe(true);
  });

  test("a line that would go through another layer with a brief, or run on another line, comes into the middle of its layer's top or bottom instead (designer, 2026-11-10)", () => {
    // Two layers in a row, level, as a heading and its badge.
    const heading = { x: 100, y: 100, width: 200, height: 40 };
    const badge = { x: 320, y: 105, width: 60, height: 30 };
    const [toHeading, toBadge] = placeCards([card("h", desktop, heading, 66), card("b", desktop, badge, 66)], views);
    expect(toHeading.line!.path).toEqual([{ x: -CARD_OFFSET, y: 120 }, { x: 100, y: 120 }]);
    // Below them both: across under the heading, up into the badge's bottom.
    expect(toBadge.line!.to).toEqual({ x: 350, y: 135 });
    expect(toBadge.line!.path).toHaveLength(3);
    // The card level with the heading but its line in the way of the badge's: round, into the badge's top.
    const line = lineOf({ x: -260, y: 60, width: 220, height: 66 }, badge, "across", CARD_OFFSET / 2, { layers: [heading, badge], lines: [] });
    expect(line.to).toEqual({ x: 350, y: 105 });
    expect(line.path).toEqual([{ x: -40, y: 93 }, { x: 350, y: 93 }, { x: 350, y: 105 }]);
    // A layer it is in is not in its way.
    const page = { x: 0, y: 0, width: 1440, height: 3000 };
    expect(lineOf({ x: -260, y: 87, width: 220, height: 66 }, heading, "across", CARD_OFFSET / 2, { layers: [page, heading], lines: [] }).path).toHaveLength(2);
  });

  test("a card set before, opened again and grown, stays where it was and moves the cards below it down, its line where it was (designer, 2026-11-10)", () => {
    const layers = [{ x: 100, y: 500, width: 50, height: 20 }, { x: 100, y: 540, width: 50, height: 20 }];
    const [was, below] = placeCards(layers.map((layer, i) => card(String(i), desktop, layer, 36)), views);
    const [now, pushed] = placeCards([{ ...card("0", desktop, layers[0], 96), restHeight: 36 }, card("1", desktop, layers[1], 36)], views);
    expect(now).toMatchObject({ x: was.x, y: was.y, height: 96 });
    expect(now.line).toEqual(was.line);
    expect(pushed.y).toBe(now.y + 96 + CARD_GAP);
    expect(pushed.y).toBeGreaterThan(below.y);
  });

  test("a line's corners are rounded, 8px at most and never more than half a leg", () => {
    expect(pathOf([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toBe("M0,0 L92,0 Q100,0 100,8 L100,100");
    expect(pathOf([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 100 }])).toBe("M0,0 L3,0 Q6,0 6,3 L6,100");
  });
});

describe("the cards of the briefs at any zoom (ticket 134)", () => {
  // With briefs, the gaps between the views are wide: each view has its cards in the gap at its right.
  const gap = VIEW_GAP_WITH_BRIEFS;
  const wDesktop: Box = { x: 0, y: 0, width: 1440, height: 3000 };
  const wTablet: Box = { x: 1440 + gap, y: 0, width: 768, height: 6000 };
  const wPhone: Box = { x: 1440 + gap + 768 + gap, y: 0, width: 390, height: 9000 };
  const wide = [wDesktop, wTablet, wPhone];
  const both = { left: true, right: true };
  // A layer in the right half of the tablet view.
  const onTablet = (key: string, y: number, height = 120, x = wTablet.x + 400): CardToPlace => ({ key, host: wTablet, free: both, layer: { x, y, width: 300, height: 80 }, height });

  test("a view between two others has its cards beside it, on the side nearer the layer, level with it, not in a row above it (designer, 2026-11-11)", () => {
    const [right, left] = placeCards([onTablet("r", 4000), onTablet("l", 4000, 120, wTablet.x + 20)], wide);
    expect(right.side).toBe("right");
    expect(right.x).toBe(wTablet.x + wTablet.width + CARD_OFFSET);
    expect(right.y + right.height / 2).toBe(4040);
    expect(left.side).toBe("left");
    expect(left.x + left.width).toBe(wTablet.x - CARD_OFFSET);
    expect(left.y + left.height / 2).toBe(4040);
    for (const p of [right, left]) for (const view of wide) expect(overlaps(p, view)).toBe(false);
  });

  test("in a gap with cards of the views on both sides, they take turns down it, in the order of their layers, none over another (designer, 2026-11-11)", () => {
    for (const zoom of [0.3, FULL_SIZE_FROM, 1]) {
      const cards: CardToPlace[] = [
        { key: "d1", host: wDesktop, free: both, layer: { x: 1300, y: 1000, width: 100, height: 40 }, height: 60 },
        onTablet("t1", 1005, 60, wTablet.x + 20),
        { key: "d2", host: wDesktop, free: both, layer: { x: 1300, y: 1030, width: 100, height: 40 }, height: 60 },
        onTablet("t2", 1040, 60, wTablet.x + 20),
      ];
      const placed = placeCards(cards, wide, null, { zoom });
      expect(placed.map((p) => p.side)).toEqual(["right", "left", "right", "left"]);
      const down = [...placed].sort((a, b) => a.y - b.y).map((p) => p.key);
      expect(down).toEqual(["d1", "t1", "d2", "t2"]);
      for (const a of placed) for (const b of placed) if (a !== b) expect(overlaps(a, b)).toBe(false);
      for (const p of placed) for (const view of wide) expect(overlaps(p, view)).toBe(false);
    }
  });

  test("from FULL_SIZE_FROM up, a card is as large on the screen at any zoom: 220 screen px wide, as far from its view, and it fits in the gap", () => {
    for (const zoom of [FULL_SIZE_FROM, 0.75, 1, 2]) {
      const [placed] = placeCards([onTablet("t", 4000)], wide, null, { zoom });
      expect(placed.scale).toBe(1);
      expect(placed.width * zoom).toBeCloseTo(CARD_WIDTH);
      expect(placed.height * zoom).toBeCloseTo(120);
      expect((placed.x - wTablet.x - wTablet.width) * zoom).toBeCloseTo(CARD_OFFSET);
      expect(overlaps(placed, wPhone)).toBe(false);
    }
  });

  test("below FULL_SIZE_FROM, a card shrinks with the canvas, as large in canvas px as at FULL_SIZE_FROM, still in the gap (designer, 2026-11-11)", () => {
    const [at] = placeCards([onTablet("t", 4000)], wide, null, { zoom: FULL_SIZE_FROM });
    for (const zoom of [0.4, 0.25, 0.1]) {
      const [placed] = placeCards([onTablet("t", 4000)], wide, null, { zoom });
      expect(placed.scale).toBeCloseTo(zoom / FULL_SIZE_FROM);
      expect(placed).toMatchObject({ x: at.x, y: at.y, width: at.width, height: at.height });
      expect(overlaps(placed, wPhone)).toBe(false);
    }
  });

  test("opened below FULL_SIZE_FROM, a card is full size, from its edge nearest its view, and the cards below it move down to make room", () => {
    const zoom = 0.25;
    const [was, below] = placeCards([onTablet("a", 4000, 36), onTablet("b", 4060, 36)], wide, null, { zoom });
    const [open, pushed] = placeCards([{ ...onTablet("a", 4000, 96), restHeight: 36 }, onTablet("b", 4060, 36)], wide, null, { zoom, open: "a" });
    expect(open).toMatchObject({ x: was.x, scale: 1 });
    // Its middle as it was set where the closed card's was: its line comes to the middle of its side.
    expect(open.y + (36 / zoom) / 2).toBeCloseTo(was.line!.from.y);
    expect(open.width).toBeCloseTo(CARD_WIDTH / zoom);
    expect(open.height).toBeCloseTo(96 / zoom);
    expect(open.line).toEqual(was.line);
    expect(pushed.y).toBeGreaterThanOrEqual(open.y + open.height);
    expect(pushed.y).toBeGreaterThan(below.y);
    // Left of the desktop view, it grows away from the view.
    const left: CardToPlace = { key: "d", host: wDesktop, free: { left: true, right: true }, layer: { x: 100, y: 500, width: 100, height: 40 }, height: 60 };
    const [closed] = placeCards([left], wide, null, { zoom });
    const [opened] = placeCards([left], wide, null, { zoom, open: "d" });
    expect(opened.x + opened.width).toBeCloseTo(closed.x + closed.width);
  });

  test("a new card, written beside its layer, is full size at any zoom", () => {
    const zoom = 0.25;
    const [placed] = placeCards([onTablet("new", 4000, 60)], wide, "new", { zoom });
    expect(placed.scale).toBe(1);
    expect(placed.width).toBeCloseTo(CARD_WIDTH / zoom);
  });

  test("dozens of cards at a zoom out lay out, none over another or a view", () => {
    for (const zoom of [0.15, 0.3, 0.6, 1]) {
      const cards = Array.from({ length: 45 }, (_, i): CardToPlace => {
        const host = wide[i % 3];
        return { key: String(i), host, free: both, layer: { x: host.x + (i % 2 ? 10 : host.width - 50), y: (i * 137) % 2800, width: 40, height: 40 }, height: 60 + (i % 4) * 20 };
      });
      const placed = placeCards(cards, wide, null, { zoom });
      for (const p of placed) for (const view of wide) expect(overlaps(p, view)).toBe(false);
      for (const a of placed) for (const b of placed) if (a !== b) expect(overlaps(a, b)).toBe(false);
    }
  });
});
