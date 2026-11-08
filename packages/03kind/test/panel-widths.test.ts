import { describe, expect, test } from "vitest";
import { CANVAS_MIN, DESIGN, LAYERS, fitWidths, maxWidth, parseWidth } from "../src/client/panel-widths";

describe("the panels' widths", () => {
  test("the limits: Layers 200–400, Design from its default to 480, the canvas never under 400", () => {
    expect([LAYERS.min, LAYERS.initial, LAYERS.max]).toEqual([200, 320, 400]);
    expect([DESIGN.min, DESIGN.initial, DESIGN.max]).toEqual([320, 320, 480]);
    expect(CANVAS_MIN).toBe(400);
  });

  test("in a wide window, each kept as set, within its own limits", () => {
    expect(fitWidths({ layers: 360, design: 420 }, 1600, true)).toEqual({ layers: 360, design: 420 });
    expect(fitWidths({ layers: 100, design: 900 }, 1600, true)).toEqual({ layers: 200, design: 480 });
  });

  test("too wide for the window, the Layers give way first, then the Design panel, each down to its least", () => {
    // 400 + 480 + 400 = 1280: at 1200, 80 too many, and the Layers take it.
    expect(fitWidths({ layers: 400, design: 480 }, 1200, true)).toEqual({ layers: 320, design: 480 });
    // At 1000, the Layers at 200 still leave 120 too many: the Design panel goes to 400.
    expect(fitWidths({ layers: 400, design: 480 }, 1000, true)).toEqual({ layers: 200, design: 400 });
    // Narrower than both least widths and the canvas's: the panels stay at their least, the canvas gets what is left.
    expect(fitWidths({ layers: 400, design: 480 }, 800, true)).toEqual({ layers: 200, design: 320 });
  });

  test("the Layers hidden take no room", () => {
    expect(fitWidths({ layers: 400, design: 480 }, 900, false)).toEqual({ layers: 400, design: 480 });
  });

  test("dragged, a panel goes no wider than leaves the canvas 400 beside the other", () => {
    expect(maxWidth("layers", { layers: 320, design: 320 }, 1440, true)).toBe(400);
    expect(maxWidth("layers", { layers: 320, design: 480 }, 1200, true)).toBe(320);
    expect(maxWidth("design", { layers: 320, design: 320 }, 1440, true)).toBe(480);
    expect(maxWidth("design", { layers: 400, design: 320 }, 1200, true)).toBe(400);
    expect(maxWidth("design", { layers: 400, design: 320 }, 1200, false)).toBe(480);
    // Never under its least.
    expect(maxWidth("layers", { layers: 200, design: 480 }, 900, true)).toBe(200);
  });

  test("a width read back from storage: a whole number of pixels, or none", () => {
    expect(parseWidth("312")).toBe(312);
    expect(parseWidth(null)).toBe(null);
    expect(parseWidth("wide")).toBe(null);
    expect(parseWidth("-4")).toBe(null);
  });
});
