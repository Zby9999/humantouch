import { describe, expect, test } from "vitest";
import { equalColumns, trackCount } from "../src/client/grid-tracks";

describe("a Grid's tracks", () => {
  test("counts the tracks of a computed track list, line names left out; none is one", () => {
    expect(trackCount("none")).toBe(1);
    expect(trackCount("120px 120px 120px")).toBe(3);
    expect(trackCount("[full-start] 100px [main-start] 200px [main-end full-end]")).toBe(2);
  });

  test("writes equal columns as Tailwind's grid-cols-* does", () => {
    expect(equalColumns(3)).toBe("repeat(3, minmax(0, 1fr))");
  });
});
