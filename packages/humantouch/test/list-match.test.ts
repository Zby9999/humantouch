import { describe, expect, it } from "vitest";
import { matchItems } from "../src/client/list-match";

/** Items of three fields, alike in as many as they share. */
type Item = [number, number, number];
const likeness = (a: Item, b: Item) => a.filter((v, i) => v === b[i]).length / a.length;
const match = (before: Item[], after: Item[]) => matchItems(before, after, likeness);

const A: Item = [1, 1, 1];
const B: Item = [2, 2, 2];
const C: Item = [3, 3, 3];
const NEW: Item = [0, 4, 4];

describe("matchItems", () => {
  it("matches each item kept to its own entry before", () => {
    expect(match([A, B, C], [A, B, C])).toEqual([0, 1, 2]);
  });

  it("an item taken off leaves the others matched to their own: none after it shows as changed", () => {
    expect(match([A, B, C], [B, C])).toEqual([1, 2]);
    expect(match([A, B, C], [A, C])).toEqual([0, 2]);
  });

  it("an item added, anywhere, is matched to none", () => {
    expect(match([A, B], [A, B, NEW])).toEqual([0, 1, null]);
    expect(match([A, B], [NEW, A, B])).toEqual([null, 0, 1]);
  });

  it("an item changed is matched to the entry it is most like", () => {
    expect(match([A, B], [[1, 9, 1], B])).toEqual([0, 1]);
    // B changed, A taken off: B's entry, not A's.
    expect(match([A, B], [[2, 9, 2]])).toEqual([1]);
  });

  it("an item changed, with one added after it, keeps its own entry", () => {
    expect(match([A], [[1, 9, 1], NEW])).toEqual([0, null]);
  });

  it("one taken off and one added: the one kept matched to its own, the new to none", () => {
    expect(match([A, B], [B, NEW])).toEqual([1, null]);
  });

  it("none before: all new; none now: nothing to match", () => {
    expect(match([], [A, B])).toEqual([null, null]);
    expect(match([A], [])).toEqual([]);
  });
});
