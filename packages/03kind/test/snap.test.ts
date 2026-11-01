import { describe, expect, test } from "vitest";
import { distances, snap } from "../src/client/snap";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("snapping a layer dragged freely", () => {
  test("to a sibling's edge within reach: its left edge lines up, and a line runs along both", () => {
    const sibling = box(100, 0, 50, 40);
    const moved = snap(box(103, 80, 30, 20), [sibling], null, 5);

    expect([moved.x, moved.y]).toEqual([100, 80]);
    expect(moved.marks).toEqual([{ type: "line", x1: 100, y1: 0, x2: 100, y2: 100 }]);
  });

  test("to the middle of its Frame, both ways: the marks cross the Frame", () => {
    const frame = box(0, 0, 200, 100);
    const moved = snap(box(84, 42, 30, 20), [], frame, 5);

    expect([moved.x, moved.y]).toEqual([85, 40]);
    expect(moved.marks).toEqual([
      { type: "line", x1: 100, y1: 0, x2: 100, y2: 100 },
      { type: "line", x1: 0, y1: 50, x2: 200, y2: 50 },
    ]);
  });

  test("to whichever is nearest: a sibling's end, its right edge on it, rather than an edge further off", () => {
    const moved = snap(box(64, 200, 30, 20), [box(0, 0, 97, 20), box(0, 50, 60, 10)], null, 5);

    expect(moved.x).toBe(67);
    expect(moved.marks).toEqual([{ type: "line", x1: 97, y1: 0, x2: 97, y2: 220 }]);
  });

  test("after two layers in a row, as far from the last as they are from each other: both spaces are marked", () => {
    const moved = snap(box(118, 0, 40, 20), [box(0, 0, 40, 20), box(60, 0, 40, 20)], null, 5);

    expect(moved.x).toBe(120);
    expect(moved.marks.filter((mark) => mark.type === "gap")).toEqual([
      { type: "gap", x1: 40, y1: 10, x2: 60, y2: 10, size: 20 },
      { type: "gap", x1: 100, y1: 10, x2: 120, y2: 10, size: 20 },
    ]);
  });

  test("before two layers in a column, as far from the first as they are from each other", () => {
    const moved = snap(box(0, -33, 30, 20), [box(0, 0, 30, 20), box(0, 30, 30, 20)], null, 5);

    expect(moved.y).toBe(-30);
    expect(moved.marks.filter((mark) => mark.type === "gap")).toEqual([
      { type: "gap", x1: 15, y1: -10, x2: 15, y2: 0, size: 10 },
      { type: "gap", x1: 15, y1: 20, x2: 15, y2: 30, size: 10 },
    ]);
  });

  test("between two layers, in the middle: the same space on each side", () => {
    const moved = snap(box(57, 0, 20, 20), [box(0, 0, 40, 20), box(100, 0, 40, 20)], null, 5);

    expect(moved.x).toBe(60);
    expect(moved.marks.filter((mark) => mark.type === "gap")).toEqual([
      { type: "gap", x1: 40, y1: 10, x2: 60, y2: 10, size: 20 },
      { type: "gap", x1: 80, y1: 10, x2: 100, y2: 10, size: 20 },
    ]);
  });

  test("layers not beside it, across the other way, set no spacing", () => {
    const moved = snap(box(118, 100, 40, 20), [box(0, 0, 40, 20), box(60, 0, 40, 20)], null, 1);

    expect(moved.x).toBe(118);
    expect(moved.marks).toEqual([]);
  });

  test("boxes as the browser measures them, their sizes read through getters as a DOMRect has them, snap alike", () => {
    class Rect {
      constructor(
        readonly x: number,
        readonly y: number,
        private readonly size: [number, number],
      ) {}
      get width() {
        return this.size[0];
      }
      get height() {
        return this.size[1];
      }
    }
    const moved = snap(new Rect(103, 80, [30, 20]), [new Rect(100, 0, [50, 40])], null, 5);

    expect(moved.marks).toEqual([{ type: "line", x1: 100, y1: 0, x2: 100, y2: 100 }]);
  });

  test("out of reach of everything, it stays where it is dragged, with no marks", () => {
    const moved = snap(box(23, 31, 30, 20), [box(100, 100, 50, 50)], box(0, 0, 300, 300), 5);

    expect(moved).toEqual({ x: 23, y: 31, marks: [] });
  });
});

describe("distances from the layer selected to another, as ⌥ shows them", () => {
  test("to a layer beside it: the space between, where they face each other", () => {
    expect(distances(box(0, 0, 40, 40), box(60, 20, 40, 40))).toEqual([{ type: "distance", x1: 40, y1: 30, x2: 60, y2: 30, size: 20 }]);
  });

  test("to its container: from each of its edges to the container's, from its middle", () => {
    expect(distances(box(10, 20, 40, 40), box(0, 0, 100, 80))).toEqual([
      { type: "distance", x1: 0, y1: 40, x2: 10, y2: 40, size: 10 },
      { type: "distance", x1: 50, y1: 40, x2: 100, y2: 40, size: 50 },
      { type: "distance", x1: 30, y1: 0, x2: 30, y2: 20, size: 20 },
      { type: "distance", x1: 30, y1: 60, x2: 30, y2: 80, size: 20 },
    ]);
  });

  test("to a layer inside it: from that layer's edges to its own, from that layer's middle; an edge they share, none", () => {
    expect(distances(box(0, 0, 100, 80), box(0, 20, 40, 40))).toEqual([
      { type: "distance", x1: 40, y1: 40, x2: 100, y2: 40, size: 60 },
      { type: "distance", x1: 20, y1: 0, x2: 20, y2: 20, size: 20 },
      { type: "distance", x1: 20, y1: 60, x2: 20, y2: 80, size: 20 },
    ]);
  });

  test("to a layer off to one corner: across and down from its middle, the other's edges taken on to there", () => {
    expect(distances(box(0, 0, 20, 20), box(50, 60, 20, 20))).toEqual([
      { type: "distance", x1: 20, y1: 10, x2: 50, y2: 10, size: 30 },
      { type: "extension", x1: 50, y1: 10, x2: 50, y2: 60 },
      { type: "distance", x1: 10, y1: 20, x2: 10, y2: 60, size: 40 },
      { type: "extension", x1: 10, y1: 60, x2: 50, y2: 60 },
    ]);
  });

  test("to a layer it overlaps: between their edges on each side, in the middle of where they overlap", () => {
    expect(distances(box(0, 0, 60, 60), box(40, 20, 60, 60))).toEqual([
      { type: "distance", x1: 0, y1: 40, x2: 40, y2: 40, size: 40 },
      { type: "distance", x1: 60, y1: 40, x2: 100, y2: 40, size: 40 },
      { type: "distance", x1: 50, y1: 0, x2: 50, y2: 20, size: 20 },
      { type: "distance", x1: 50, y1: 60, x2: 50, y2: 80, size: 20 },
    ]);
  });
});
