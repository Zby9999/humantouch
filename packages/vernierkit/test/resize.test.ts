import { describe, expect, test } from "vitest";
import { resizeBox, type ResizeInput } from "../src/client/resize";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const NO_LIMITS = { minWidth: 0, maxWidth: Infinity, minHeight: 0, maxHeight: Infinity };
/** A 100 × 50 layer at (10, 20), resized by a handle, nothing held, not snapping. */
const input = (handle: ResizeInput["handle"], by: { x: number; y: number }, more: Partial<ResizeInput> = {}): ResizeInput => ({
  handle,
  start: box(10, 20, 100, 50),
  by,
  keepRatio: false,
  fromCenter: false,
  limits: NO_LIMITS,
  snap: null,
  ...more,
});

describe("resizing a layer by a handle", () => {
  test("the right edge dragged: wider by as much, its left edge where it was; only the width is set", () => {
    const resized = resizeBox(input("e", { x: 30, y: 12 }));

    expect(resized.box).toEqual(box(10, 20, 130, 50));
    expect([resized.width, resized.height]).toEqual([true, false]);
  });

  test("the top left corner dragged: both sizes change, the bottom right corner stays where it was", () => {
    const resized = resizeBox(input("nw", { x: 10, y: -5 }));

    expect(resized.box).toEqual(box(20, 15, 90, 55));
    expect([resized.width, resized.height]).toEqual([true, true]);
  });

  test("a corner with ⇧ held: the sizes keep their proportion, by the one changed most; the corner across stays", () => {
    // 100 × 50 dragged 100 right and 5 down: twice as wide most, so twice as tall too.
    expect(resizeBox(input("se", { x: 100, y: 5 }, { keepRatio: true })).box).toEqual(box(10, 20, 200, 100));
    expect(resizeBox(input("nw", { x: 50, y: 0 }, { keepRatio: true })).box).toEqual(box(60, 45, 50, 25));
  });

  test("an edge with ⇧ held: the other size keeps the proportion, about the middle that way; both are set", () => {
    const resized = resizeBox(input("e", { x: 100, y: 0 }, { keepRatio: true }));

    expect(resized.box).toEqual(box(10, -5, 200, 100));
    expect([resized.width, resized.height]).toEqual([true, true]);
  });

  test("with ⌥ held: from the middle, the edge across moving as far the other way", () => {
    expect(resizeBox(input("e", { x: 10, y: 0 }, { fromCenter: true })).box).toEqual(box(0, 20, 120, 50));
    expect(resizeBox(input("n", { x: 0, y: 5 }, { fromCenter: true })).box).toEqual(box(10, 25, 100, 40));
    expect(resizeBox(input("se", { x: 50, y: 0 }, { fromCenter: true, keepRatio: true })).box).toEqual(box(-40, -5, 200, 100));
  });

  test("dragged past its minimum or maximum size, it stops there, the edge across where it was", () => {
    const limits = { minWidth: 60, maxWidth: 120, minHeight: 0, maxHeight: Infinity };
    expect(resizeBox(input("e", { x: -80, y: 0 }, { limits })).box).toEqual(box(10, 20, 60, 50));
    expect(resizeBox(input("e", { x: 50, y: 0 }, { limits })).box).toEqual(box(10, 20, 120, 50));
    expect(resizeBox(input("w", { x: -50, y: 0 }, { limits })).box).toEqual(box(-10, 20, 120, 50));
  });

  test("dragged past the edge across, it stops at no size there: it does not turn over", () => {
    expect(resizeBox(input("w", { x: 150, y: 0 })).box).toEqual(box(110, 20, 0, 50));
    expect(resizeBox(input("s", { x: 0, y: -80 })).box).toEqual(box(10, 20, 100, 0));
  });

  test("kept in proportion up to a maximum: both stop where the one that reaches it does", () => {
    const limits = { ...NO_LIMITS, maxWidth: 150 };
    expect(resizeBox(input("se", { x: 100, y: 0 }, { keepRatio: true, limits })).box).toEqual(box(10, 20, 150, 75));
  });

  test("its size is whole px, as a layer dragged is placed", () => {
    expect(resizeBox(input("e", { x: 30.4, y: 0 })).box).toEqual(box(10, 20, 130, 50));
  });

  test("snapping, the edge dragged lines up with a sibling's edge within reach, exactly, a line along both", () => {
    const sibling = box(143.25, 100, 40, 30);
    const resized = resizeBox(input("e", { x: 30, y: 0 }, { snap: { targets: [sibling], within: 5 } }));

    expect(resized.box).toEqual(box(10, 20, 133.25, 50));
    expect(resized.marks).toEqual([{ type: "line", x1: 143.25, y1: 20, x2: 143.25, y2: 130 }]);
  });

  test("snapping, only the edges dragged line up and are marked; one left where it was is not, though it lines up", () => {
    // Its left edge is on the Frame's already; its bottom is dragged 2px short of the Frame's middle.
    const frame = box(10, 0, 300, 136);
    const resized = resizeBox(input("s", { x: 0, y: -2 }, { snap: { targets: [frame], within: 5 } }));

    expect(resized.box).toEqual(box(10, 20, 100, 48));
    expect(resized.marks).toEqual([{ type: "line", x1: 10, y1: 68, x2: 310, y2: 68 }]);
  });

  test("snapping from the middle, either edge dragged lines up, the other as far the other way", () => {
    const target = box(-12, 200, 10, 10);
    expect(resizeBox(input("e", { x: 9, y: 0 }, { fromCenter: true, snap: { targets: [target], within: 5 } })).box).toEqual(box(-2, 20, 124, 50));
    expect(resizeBox(input("w", { x: -9, y: 0 }, { fromCenter: true, snap: { targets: [target], within: 5 } })).box).toEqual(box(-2, 20, 124, 50));
  });

  test("nothing within reach: no snapping, no marks", () => {
    const resized = resizeBox(input("e", { x: 30, y: 0 }, { snap: { targets: [box(150, 0, 10, 10)], within: 5 } }));

    expect(resized.box.width).toBe(130);
    expect(resized.marks).toEqual([]);
  });
});
