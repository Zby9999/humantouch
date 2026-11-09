import { afterEach, describe, expect, test } from "vitest";
import { inferGrid, insideBorder, paddingBox } from "../src/client/stacks";

const made: Element[] = [];
afterEach(() => {
  for (const el of made.splice(0)) el.remove();
});

function frame(style: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `position: absolute; left: 30px; top: 40px; width: 200px; height: 100px; border-style: solid; ${style}`;
  document.body.append(el);
  made.push(el);
  return el;
}

/** Where an absolute layer at 0, 0 in `el` is. */
function origin(el: Element): [number, number] {
  const layer = document.createElement("div");
  layer.style.cssText = "position: absolute; left: 0; top: 0; width: 1px; height: 1px";
  el.append(layer);
  const { left, top } = layer.getBoundingClientRect();
  layer.remove();
  return [left, top];
}

describe("a Frame's box inside its border, where its absolute layers are placed", () => {
  test("is where an absolute layer at 0, 0 is; measured either way, the same, with a border in whole px and no scrollbar", () => {
    const el = frame("border-width: 3px 7px 5px 11px; padding: 4px");
    const client = paddingBox(el);
    const exact = insideBorder(el, el.getBoundingClientRect());
    expect([client.left, client.top]).toEqual(origin(el));
    expect([exact.left, exact.top, exact.right, exact.bottom]).toEqual([client.left, client.top, client.right, client.bottom]);
  });

  test("goes by the border box it is given, as laid out before anything shifted, the same inside it", () => {
    const el = frame("border-width: 2px");
    const r = el.getBoundingClientRect();
    const now = insideBorder(el, r);
    const then = insideBorder(el, new DOMRect(r.left - 50, r.top + 20, r.width, r.height));
    expect([then.left - now.left, then.top - now.top, then.width, then.height]).toEqual([-50, 20, now.width, now.height]);
  });

  test("measured to snap to, keeps the fraction of a px a Frame is laid out at", () => {
    const el = frame("border-width: 1px; width: 200.5px; left: 30.25px");
    const r = el.getBoundingClientRect();
    const exact = insideBorder(el, r);
    expect(exact.left).toBeCloseTo(r.left + 1, 5);
    expect(exact.width).toBeCloseTo(r.width - 2, 5);
  });

  test("as the browser places layers, leaves out a scrollbar; measured to snap to, takes it in", () => {
    const el = frame("border-width: 2px; overflow: scroll");
    const client = paddingBox(el);
    const exact = insideBorder(el, el.getBoundingClientRect());
    expect([client.left, client.top]).toEqual([exact.left, exact.top]);
    expect(exact.right - client.right).toBe(el.offsetWidth - el.clientWidth - 4);
  });
});

describe("the Grid that holds free layers where they are (ticket 110)", () => {
  /** A box `w` × `h` at `left`, `top`. */
  const box = (left: number, top: number, w = 100, h = 40) => ({ left, top, right: left + w, bottom: top + h });
  /** Boxes 100 × 40 in rows of `columns`, gaps `columnGap` and `rowGap`, from 20, 30; `count` of them, `rows` rows full. */
  const tiles = (rows: number, columns: number, { columnGap = 24, rowGap = 16, count = rows * columns } = {}) =>
    Array.from({ length: count }, (_, i) => box(20 + (i % columns) * (100 + columnGap), 30 + Math.floor(i / columns) * (40 + rowGap)));

  test("two rows of two: two equal columns, the gaps between them, row by row, no padding", () => {
    const boxes = tiles(2, 2);
    // Given in any order: the Grid goes row by row.
    const grid = inferGrid([boxes[3], boxes[0], boxes[2], boxes[1]], null);
    expect(grid?.settings).toEqual({ grid: { type: "grid", columns: 2, rowGap: 16, columnGap: 24 }, padding: [0, 0, 0, 0] });
    expect(grid?.order).toEqual([1, 3, 2, 0]);
  });

  test("its last row filled from the left, short of the others; in a Frame, its padding the room round them", () => {
    const grid = inferGrid(tiles(2, 3, { count: 5 }), { left: 0, top: 0, right: 20 + 3 * 100 + 2 * 24 + 12, bottom: 30 + 2 * 40 + 16 + 8 });
    expect(grid?.settings).toEqual({ grid: { type: "grid", columns: 3, rowGap: 16, columnGap: 24 }, padding: [30, 12, 8, 20] });
  });

  test("within a px of their rows and columns, a Grid; further off, none", () => {
    const boxes = tiles(2, 2);
    boxes[3] = box(boxes[3].left + 0.6, boxes[3].top - 0.6);
    expect(inferGrid(boxes, null)?.settings.grid.columns).toBe(2);
    boxes[3] = box(boxes[3].left + 2, boxes[3].top);
    expect(inferGrid(boxes, null)).toBeNull();
  });

  test("one row, one column, too few, a hole, sizes that differ, gaps that differ, or overlapping: none, a Stack instead", () => {
    expect(inferGrid(tiles(1, 4), null)).toBeNull();
    expect(inferGrid(tiles(4, 1), null)).toBeNull();
    expect(inferGrid(tiles(2, 2).slice(0, 2), null)).toBeNull();
    // A hole: the second row's only layer in the second column.
    const hole = tiles(2, 2);
    expect(inferGrid([hole[0], hole[1], hole[3]], null)).toBeNull();
    const wider = tiles(2, 2);
    wider[1] = box(wider[1].left, wider[1].top, 130);
    expect(inferGrid(wider, null)).toBeNull();
    const taller = tiles(2, 2);
    taller[0] = box(taller[0].left, taller[0].top, 100, 60);
    expect(inferGrid(taller, null)).toBeNull();
    const second = tiles(1, 3, { columnGap: 40 }).map((b) => ({ ...b, top: b.top + 56, bottom: b.bottom + 56 }));
    expect(inferGrid([...tiles(1, 3), ...second], null)).toBeNull();
    expect(inferGrid(tiles(2, 2, { columnGap: -10 }), null)).toBeNull();
  });
});
