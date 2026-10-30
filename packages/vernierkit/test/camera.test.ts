import { describe, expect, test } from "vitest";
import { boundsOf, fitCamera, scrolled, showsWhole, wheelZoom } from "../src/client/camera";

/** The viewport, as the camera reads it: only its size. */
const viewport = (width: number, height: number) => ({ width, height }) as DOMRect;

describe("the camera over the canvas", () => {
  test("zooming with the wheel keeps the point under the pointer where it is", () => {
    const camera = { x: 100, y: 50, zoom: 1 };
    const zoomed = wheelZoom(camera, -100, 300, 250);
    expect(zoomed.zoom).toBeGreaterThan(1);
    // The canvas point under (300, 250) before is under it after.
    const before = { x: (300 - camera.x) / camera.zoom, y: (250 - camera.y) / camera.zoom };
    expect((300 - zoomed.x) / zoomed.zoom).toBeCloseTo(before.x);
    expect((250 - zoomed.y) / zoomed.zoom).toBeCloseTo(before.y);
  });

  test("one wheel notch is a modest step however far the wheel says it went, and the zoom stays within its limits", () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    expect(wheelZoom(camera, -1000, 0, 0).zoom).toBeCloseTo(Math.exp(0.3));
    let far = camera;
    for (let i = 0; i < 100; i++) far = wheelZoom(far, -1000, 0, 0);
    expect(far.zoom).toBe(32);
    for (let i = 0; i < 200; i++) far = wheelZoom(far, 1000, 0, 0);
    expect(far.zoom).toBe(0.02);
  });

  test("fitting every view in, the widest they fit, the views and the layers off the canvas left of them included", () => {
    const bounds = boundsOf([
      { x: 0, y: 0, width: 1440, height: 900 },
      { x: 1520, y: 0, width: 390, height: 1200 },
      { x: -600, y: 100, width: 200, height: 200 },
    ]);
    expect(bounds).toEqual({ x: -600, y: 0, width: 2510, height: 1200 });
    const camera = fitCamera(bounds, viewport(1000, 800));
    // 40 px around them across, and room for the labels above.
    expect(camera.zoom).toBeCloseTo(920 / 2510);
    expect(camera.x + -600 * camera.zoom).toBeCloseTo(40);
  });

  test("the views show whole only when every edge of them is within the viewport", () => {
    // 1000 by 2000 canvas px from (-100, 0), at half size: 500 by 1000 on screen.
    const views = { x: -100, y: 0, width: 1000, height: 2000 };
    expect(showsWhole({ x: 50, y: 0, zoom: 0.5 }, views, viewport(500, 1000))).toBe(true);
    expect(showsWhole({ x: 60, y: 10, zoom: 0.5 }, views, viewport(600, 1100))).toBe(true);
    // A px out at the right, the bottom, the left, the top.
    expect(showsWhole({ x: 51, y: 0, zoom: 0.5 }, views, viewport(500, 1000))).toBe(false);
    expect(showsWhole({ x: 50, y: 1, zoom: 0.5 }, views, viewport(500, 1000))).toBe(false);
    expect(showsWhole({ x: 49, y: 0, zoom: 0.5 }, views, viewport(600, 1000))).toBe(false);
    expect(showsWhole({ x: 50, y: -1, zoom: 0.5 }, views, viewport(500, 1100))).toBe(false);
  });

  test("playing, a canvas narrower than the viewport is in the middle, and scrolling stops at its top and at its bottom", () => {
    const area = viewport(1000, 800);
    const played = { width: 800, height: 2000 };
    expect(scrolled({ x: -300, y: 100, zoom: 0.5 }, played, area)).toEqual({ zoom: 1, x: 100, y: 0 });
    expect(scrolled({ x: 0, y: -5000, zoom: 1 }, played, area)).toEqual({ zoom: 1, x: 100, y: -1200 });
  });
});
