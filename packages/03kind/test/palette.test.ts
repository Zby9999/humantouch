import { describe, expect, it } from "vitest";
import type { Resolved } from "../src/client/variables";
import { palette, paletteLines } from "../src/client/VariantsPanel";

/** Colors named so, as a project defines them, in order; their values do not matter to the palette. */
const colors = (...names: string[]): Resolved[] =>
  names.map((name) => ({ variable: { name, group: "color", value: "#000000", from: "css", own: true }, drawn: { color: "#000000", opacity: 1 } }));

const TAILWIND = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const ramp = (prefix: string, steps: (string | number)[]) => steps.map((step) => `${prefix}-${step}`);

/** A palette as names: each scale's steps and its ramps' cells (null for a placeholder), then the named colors' groups. */
function names(entries: Resolved[]) {
  const { scales, named } = palette(entries);
  return {
    scales: scales.map(({ steps, ramps }) => ({ steps, ramps: ramps.map(([name, cells]) => [name, cells.map((cell) => cell?.variable.name ?? null)] as const) })),
    named: named.map((group) => group.map((entry) => entry.variable.name)),
  };
}

describe("palette", () => {
  it("puts Tailwind ramps on its 11 steps, a placeholder where one has no color, as before", () => {
    const { scales, named } = names(colors(...ramp("brand", [50, 100, 500, 700]), ...ramp("red", TAILWIND)));
    expect(named).toEqual([]);
    expect(scales).toEqual([
      {
        steps: TAILWIND,
        ramps: [
          ["brand", ["brand-50", "brand-100", null, null, null, "brand-500", null, "brand-700", null, null, null]],
          ["red", ramp("red", TAILWIND)],
        ],
      },
    ]);
  });

  it("names shadcn's colors, the words of a name together, none of them a ramp", () => {
    const shadcn = ["background", "foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "destructive", "border", "ring"];
    const { scales, named } = names(colors(...shadcn.map((name) => `--${name}`)));
    expect(scales).toEqual([]);
    expect(named).toEqual([
      ["--background"],
      ["--foreground"],
      ["--primary", "--primary-foreground"],
      ["--secondary", "--secondary-foreground"],
      ["--muted", "--muted-foreground"],
      ["--accent"],
      ["--destructive"],
      ["--border"],
      ["--ring"],
    ]);
  });

  it("puts Radix's 1–12 ramps on their own 12 steps, by number, not on Tailwind's", () => {
    // Defined out of order: the steps are sorted by number.
    const { scales, named } = names(colors("--gray-10", ...ramp("--gray", [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]), ...ramp("--blue", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])));
    expect(named).toEqual([]);
    expect(scales).toHaveLength(1);
    expect(scales[0].steps).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(scales[0].ramps[0][1]).toEqual(ramp("--gray", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(scales[0].ramps[1][1]).toEqual([...ramp("--blue", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), null]);
  });

  it("keeps a 10–90 scale apart from a 1–12 one", () => {
    const { scales } = names(colors(...ramp("gray", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), ...ramp("blue", [10, 20, 30, 40, 50, 60, 70, 80, 90])));
    expect(scales.map(({ steps }) => steps.length)).toEqual([12, 9]);
  });

  it("names a ramp's states and a step without siblings, after the ramps", () => {
    const { scales, named } = names(colors(...ramp("brand", TAILWIND), "brand-hover", "brand-light", "accent-500", "ink"));
    expect(scales).toEqual([{ steps: TAILWIND, ramps: [["brand", ramp("brand", TAILWIND)]] }]);
    expect(named).toEqual([["brand-hover", "brand-light"], ["accent-500"], ["ink"]]);
  });

  it("puts Untitled UI's 25 before Tailwind's steps, and gray-1000 after them, on columns of their own", () => {
    const { scales } = names(colors(...ramp("gray", [25, ...TAILWIND]), ...ramp("slate", [...TAILWIND, 1000])));
    expect(scales.map(({ steps }) => steps)).toEqual([["25", ...TAILWIND, "1000"]]);
    expect(scales[0].ramps.map(([name, cells]) => [name, cells[0], cells[12]])).toEqual([
      ["gray", "gray-25", null],
      ["slate", null, "slate-1000"],
    ]);
  });
});

describe("palette, names twice or near", () => {
  it("names a step named twice, not losing it, and a ramp's state of a two-word name under the ramp's name", () => {
    const { scales, named } = names(colors(...ramp("--gray", [1, 2, 3]), "--color-gray-1", "gray-01", ...ramp("blue-gray", [100, 200, 300]), "blue-gray-hover", "blue-500"));
    expect(scales[0].ramps.map(([name, cells]) => [name, cells.filter(Boolean)])).toEqual([["gray", ramp("--gray", [1, 2, 3])]]);
    expect(scales[1].ramps[0][0]).toBe("blue-gray");
    expect(named).toEqual([["--color-gray-1", "gray-01"], ["blue-gray-hover"], ["blue-500"]]);
  });
});

describe("paletteLines", () => {
  it("keeps a ramp of up to 16 steps on one line, and shares a longer one's steps between lines, the first named", () => {
    const short = palette(colors(...ramp("gray", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])));
    expect(paletteLines(short.scales[0]).map(([name, cells]) => [name, cells.length])).toEqual([["gray", 16]]);
    const long = palette(colors(...ramp("gray", Array.from({ length: 20 }, (_, i) => i + 1))));
    expect(paletteLines(long.scales[0]).map(([name, cells]) => [name, cells.length])).toEqual([
      ["gray", 10],
      ["", 10],
    ]);
  });
});
