import { describe, expect, test } from "vitest";
import { rangeOfEdit } from "../src/client/breakpoint-edits";
import type { Breakpoint, ProjectBreakpoints } from "../src/client/breakpoints";

const TAILWIND: ProjectBreakpoints = {
  from: "tailwind",
  list: [
    { width: 640, name: "sm" },
    { width: 768, name: "md" },
    { width: 1024, name: "lg" },
    { width: 1280, name: "xl" },
  ],
};

/** A change of the layer's to the property at `breakpoint`. */
const at = (min: number | null, max: number | null, project?: Breakpoint["project"]) => ({ breakpoint: { min, max, ...(project && { project }) } });

describe("the range an edit made in a view beside the desktop view takes", () => {
  test("with no change of its own there, the view's range", () => {
    const phone: Breakpoint = { min: null, max: 768, project: { tailwind: "max-md:" } };
    expect(rangeOfEdit([], 390, phone, TAILWIND)).toEqual({ breakpoint: phone, cut: null });
  });

  test("the range of a change of its own already there, within the view's: recorded before the views changed, it is kept", () => {
    const older = at(null, 640);
    expect(rangeOfEdit([older], 390, { min: null, max: 768 }, TAILWIND)).toEqual({ breakpoint: older.breakpoint, cut: null });
  });

  test("of two that hold there, the narrowest", () => {
    const wide = at(null, 768);
    const narrow = at(320, 640);
    expect(rangeOfEdit([wide, narrow], 390, { min: null, max: 1024 }, null).breakpoint).toBe(narrow.breakpoint);
  });

  test("a change reaching past the view's range is cut back to make way, and the edit takes the view's range", () => {
    const reaching = at(null, 1280);
    expect(rangeOfEdit([reaching], 800, { min: 768, max: 1024 }, TAILWIND)).toEqual({ breakpoint: { min: 768, max: 1024 }, cut: reaching });
  });

  test("a range of its own the view's reaches into is left alone: the edit takes the rest, written as the project writes it where it can be", () => {
    const below = at(null, 640, { tailwind: "max-sm:" });
    // Made at 700 px in a view standing for every width under 1024.
    expect(rangeOfEdit([below], 700, { min: null, max: 1024 }, TAILWIND)).toEqual({ breakpoint: { min: 640, max: 1024, project: { tailwind: "sm:max-lg:" } }, cut: null });
  });

  test("in the desktop view, every width, but where a change of its own holds there already", () => {
    expect(rangeOfEdit([], 1440, null, TAILWIND)).toEqual({ breakpoint: null, cut: null });
    const above = at(1280, null);
    expect(rangeOfEdit([above], 1440, null, TAILWIND)).toEqual({ breakpoint: above.breakpoint, cut: null });
  });
});
