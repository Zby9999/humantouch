import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { boundsOf, fitCamera, onceStill, scrolled, STILL_MS, wheelZoom } from "../src/client/camera";

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

  test("playing, a canvas narrower than the viewport is in the middle, and scrolling stops at its top and at its bottom", () => {
    const area = viewport(1000, 800);
    const played = { width: 800, height: 2000 };
    expect(scrolled({ x: -300, y: 100, zoom: 0.5 }, played, area)).toEqual({ zoom: 1, x: 100, y: 0 });
    expect(scrolled({ x: 0, y: -5000, zoom: 1 }, played, area)).toEqual({ zoom: 1, x: 100, y: -1200 });
  });
});

describe("drawing only what shows once the camera stands still", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  test("moved again and again, as by the wheel, it is drawn once, STILL_MS after the camera last moved", () => {
    const draw = vi.fn();
    const still = onceStill(draw, () => false);
    for (let i = 0; i < 20; i++) {
      still.moved();
      vi.advanceTimersByTime(16);
    }
    expect(draw).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STILL_MS - 16 - 1);
    expect(draw).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(draw).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10 * STILL_MS);
    expect(draw).toHaveBeenCalledOnce();
  });

  test("held off while a drag, typing or a mode switch is under way, it is drawn once, within STILL_MS after that ends", () => {
    const draw = vi.fn();
    let held = true;
    const still = onceStill(draw, () => held);
    still.moved();
    vi.advanceTimersByTime(5 * STILL_MS);
    expect(draw).not.toHaveBeenCalled();
    held = false;
    vi.advanceTimersByTime(STILL_MS);
    expect(draw).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10 * STILL_MS);
    expect(draw).toHaveBeenCalledOnce();
  });

  test("an animated camera move ending draws it at once, and once only: the moves before it are done with", () => {
    const draw = vi.fn();
    let animating = true;
    const still = onceStill(draw, () => animating);
    // The camera is set where the animation ends as it starts.
    still.moved();
    vi.advanceTimersByTime(2 * STILL_MS);
    animating = false;
    still.drawNow();
    expect(draw).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10 * STILL_MS);
    expect(draw).toHaveBeenCalledOnce();
  });

  test("once the stage is gone, nothing is drawn", () => {
    const draw = vi.fn();
    const still = onceStill(draw, () => false);
    still.moved();
    still.cancel();
    vi.advanceTimersByTime(10 * STILL_MS);
    expect(draw).not.toHaveBeenCalled();
  });
});
