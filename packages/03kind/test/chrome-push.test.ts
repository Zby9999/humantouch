import { describe, expect, test } from "vitest";
import { chromePush } from "../src/client/motion";

describe("the panels pushed out by the frame growing over the page, and back in as it shrinks", () => {
  test("each side moves as far as the frame's edge on it travels, so the gap between them stays", () => {
    const push = chromePush({ atRest: { left: 400, right: 900 }, overPage: { left: 0, right: 1440 } }, { layersRight: 320, designLeft: 1120 }, 1440);
    expect(push).toEqual({ left: -400, right: 540 });
  });

  test("a side the frame's edge would not push off the screen still goes off it, on the same curve", () => {
    // The frame's left edge under the Layers panel, its right edge past the Design panel's left.
    const push = chromePush({ atRest: { left: 200, right: 1300 }, overPage: { left: 0, right: 1440 } }, { layersRight: 320, designLeft: 1120 }, 1440);
    expect(push).toEqual({ left: -320, right: 320 });
  });

  test("a frame left of where the page is, coming right, still pushes the Layers off to the left", () => {
    const push = chromePush({ atRest: { left: -300, right: 900 }, overPage: { left: 0, right: 1440 } }, { layersRight: 320, designLeft: 1120 }, 1440);
    expect(push.left).toBe(-320);
  });
});
