import { describe, expect, test } from "vitest";
import { CARD_GAP, CARD_OFFSET, CARD_WIDTH, LABEL_ROOM, lineOf, placeCards, type Box, type CardToPlace } from "../src/client/brief-cards";

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

  test("the lines of cards stacked down a column are bent apart, none on another, and none crosses another", () => {
    const layers = [500, 505, 510, 515].map((y, i) => ({ x: 100 + i * 10, y, width: 50, height: 4 }));
    const placed = placeCards(layers.map((layer, i) => card(String(i), desktop, layer, 66)), views);
    const bent = placed.filter((p) => p.line!.path.length === 4);
    expect(bent.length).toBeGreaterThan(1);
    const bends = bent.map((p) => p.line!.path[1].x);
    expect(new Set(bends).size).toBe(bends.length);
    for (const x of bends) expect(x).toBeGreaterThan(-CARD_OFFSET);
    for (const x of bends) expect(x).toBeLessThan(0);
    // No segment of one line crosses a segment of another.
    const segments = placed.flatMap((p) => p.line!.path.slice(1).map((to, j) => [p.key, p.line!.path[j], to] as const));
    const cross = (a: readonly [string, { x: number; y: number }, { x: number; y: number }], b: typeof a) => {
      if (a[0] === b[0]) return false;
      const [, a1, a2] = a;
      const [, b1, b2] = b;
      const av = a1.x === a2.x;
      const bv = b1.x === b2.x;
      if (av === bv) return false;
      const [v1, v2, h1, h2] = av ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
      return v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) && h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y);
    };
    for (const a of segments) for (const b of segments) expect(cross(a, b)).toBe(false);
  });

  test("the line goes across and down only, as Figma draws a note's: straight when the card is level with the layer's side, else bent once, halfway into the space beside the card", () => {
    const layer = { x: 0, y: 0, width: 100, height: 100 };
    // Level: from the card at the layer's middle, though not the card's.
    expect(lineOf({ x: -260, y: 30, width: 220, height: 66 }, layer, "across").path).toEqual([{ x: -40, y: 50 }, { x: 0, y: 50 }]);
    // Below it: from as near as its corner lets it, bent halfway across the 40px between.
    expect(lineOf({ x: -260, y: 200, width: 220, height: 66 }, layer, "across").path).toEqual([
      { x: -40, y: 212 },
      { x: -20, y: 212 },
      { x: -20, y: 50 },
      { x: 0, y: 50 },
    ]);
    // A card above: down, across, down to the middle of the layer's top.
    expect(lineOf({ x: 300, y: -200, width: 220, height: 66 }, layer, "down").path).toEqual([
      { x: 312, y: -134 },
      { x: 312, y: -114 },
      { x: 50, y: -114 },
      { x: 50, y: 0 },
    ]);
    for (const line of [lineOf({ x: -900, y: 700, width: 220, height: 66 }, layer), lineOf({ x: 500, y: -500, width: 220, height: 90 }, layer, "down")])
      for (let i = 1; i < line.path.length; i++) expect(line.path[i].x === line.path[i - 1].x || line.path[i].y === line.path[i - 1].y).toBe(true);
  });
});
