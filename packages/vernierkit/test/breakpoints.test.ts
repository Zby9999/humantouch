import { describe, expect, test } from "vitest";
import { breakpointOf, type ProjectBreakpoints } from "../src/client/breakpoints";

/** Tailwind's own breakpoints, as the local service reads them from a theme that keeps them. */
const TAILWIND: ProjectBreakpoints = {
  from: "tailwind",
  list: [
    { width: 640, name: "sm" },
    { width: 768, name: "md" },
    { width: 1024, name: "lg" },
    { width: 1280, name: "xl" },
    { width: 1536, name: "2xl" },
  ],
};

describe("the range a view stands for, with the project's own breakpoints", () => {
  test("phone, tablet and desktop: each view's range reaches up to the next wider view's, the widest but the desktop up to the desktop view's; the narrowest from none at all", () => {
    const views = [390, 768];
    expect(breakpointOf(390, 1440, views, TAILWIND)).toEqual({ min: null, max: 768, project: { tailwind: "max-md:" } });
    expect(breakpointOf(768, 1440, views, TAILWIND)).toEqual({ min: 768, max: 1280, project: { tailwind: "md:max-xl:" } });
    expect(breakpointOf(1440, 1440, views, TAILWIND)).toBeNull();
  });

  test("with the desktop window narrower, the tablet view reaches up to the desktop view's range only", () => {
    expect(breakpointOf(768, 1200, [390, 768], TAILWIND)).toEqual({ min: 768, max: 1024, project: { tailwind: "md:max-lg:" } });
    expect(breakpointOf(390, 1200, [390, 768], TAILWIND)).toEqual({ min: null, max: 768, project: { tailwind: "max-md:" } });
  });

  test("a view added between takes the range its width is in, and those above it up to the next view's; the view below it gives them up", () => {
    const views = [390, 768, 1100];
    expect(breakpointOf(768, 1440, views, TAILWIND)).toEqual({ min: 768, max: 1024, project: { tailwind: "md:max-lg:" } });
    expect(breakpointOf(1100, 1440, views, TAILWIND)).toEqual({ min: 1024, max: 1280, project: { tailwind: "lg:max-xl:" } });
  });

  test("views in the same range share it; a view in the desktop view's range is the desktop view", () => {
    const views = [390, 500, 1300, 1500];
    expect(breakpointOf(390, 1440, views, TAILWIND)).toEqual({ min: null, max: 1280, project: { tailwind: "max-xl:" } });
    expect(breakpointOf(500, 1440, views, TAILWIND)).toEqual({ min: null, max: 1280, project: { tailwind: "max-xl:" } });
    expect(breakpointOf(1300, 1440, views, TAILWIND)).toBeNull();
    expect(breakpointOf(1500, 1440, views, TAILWIND)).toBeNull();
  });

  test("a view wider than the desktop view's range stands for the range its width is in, and every one above it", () => {
    expect(breakpointOf(1920, 1440, [390, 768, 1920], TAILWIND)).toEqual({ min: 1536, max: null, project: { tailwind: "2xl:" } });
  });

  test("the ranges between the desktop view's and the first wider view's are the desktop view's", () => {
    expect(breakpointOf(1920, 1200, [390, 768, 1920], TAILWIND)).toEqual({ min: 1536, max: null, project: { tailwind: "2xl:" } });
    expect(breakpointOf(768, 1200, [390, 768, 1920], TAILWIND)).toEqual({ min: 768, max: 1024, project: { tailwind: "md:max-lg:" } });
  });

  test("wider views each reach up to the next wider view's range; the widest has no upper bound", () => {
    const views = [390, 768, 1300, 1920];
    expect(breakpointOf(1300, 1200, views, TAILWIND)).toEqual({ min: 1280, max: 1536, project: { tailwind: "xl:max-2xl:" } });
    expect(breakpointOf(1920, 1200, views, TAILWIND)).toEqual({ min: 1536, max: null, project: { tailwind: "2xl:" } });
  });

  test("wider views in the same range share it", () => {
    const views = [390, 1300, 1400];
    expect(breakpointOf(1300, 1200, views, TAILWIND)).toEqual({ min: 1280, max: null, project: { tailwind: "xl:" } });
    expect(breakpointOf(1400, 1200, views, TAILWIND)).toEqual({ min: 1280, max: null, project: { tailwind: "xl:" } });
  });

  test("the narrowest view reaches down to no width at all, whichever range its width is in", () => {
    expect(breakpointOf(700, 1440, [700, 1100], TAILWIND)).toEqual({ min: null, max: 1024, project: { tailwind: "max-lg:" } });
    expect(breakpointOf(1100, 1440, [700, 1100], TAILWIND)).toEqual({ min: 1024, max: 1280, project: { tailwind: "lg:max-xl:" } });
  });
});

describe("the range a view stands for, with no breakpoints of the project's", () => {
  test("from its own width up to the next wider view's, the narrowest from none at all", () => {
    expect(breakpointOf(390, 1440, [390, 768])).toEqual({ min: null, max: 768 });
    expect(breakpointOf(768, 1440, [390, 768])).toEqual({ min: 768, max: 1440 });
    expect(breakpointOf(1440, 1440, [390, 768])).toBeNull();
  });
});
