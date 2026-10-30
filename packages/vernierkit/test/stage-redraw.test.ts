import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AT_REST_MS, onceAtRest } from "../src/client/stage-redraw";

describe("drawing only what shows once the camera is at rest", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  test("moved again and again, as by the wheel, it is drawn once, AT_REST_MS after the camera last moved", () => {
    const redraw = vi.fn();
    const atRest = onceAtRest(redraw, () => false);
    for (let i = 0; i < 20; i++) {
      atRest.moved();
      vi.advanceTimersByTime(16);
    }
    expect(redraw).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AT_REST_MS - 16 - 1);
    expect(redraw).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(redraw).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10 * AT_REST_MS);
    expect(redraw).toHaveBeenCalledOnce();
  });

  test("put off while a drag, typing or a mode switch is under way, it is drawn once, within AT_REST_MS after that ends", () => {
    const redraw = vi.fn();
    let busy = true;
    const atRest = onceAtRest(redraw, () => busy);
    atRest.moved();
    vi.advanceTimersByTime(5 * AT_REST_MS);
    expect(redraw).not.toHaveBeenCalled();
    busy = false;
    vi.advanceTimersByTime(AT_REST_MS);
    expect(redraw).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10 * AT_REST_MS);
    expect(redraw).toHaveBeenCalledOnce();
  });

  test("an animated camera move ending draws it at once, and once only: the moves before it are done with", () => {
    const redraw = vi.fn();
    let animating = true;
    const atRest = onceAtRest(redraw, () => animating);
    // The camera is set where the animation ends as it starts.
    atRest.moved();
    vi.advanceTimersByTime(2 * AT_REST_MS);
    animating = false;
    atRest.moveEnded();
    expect(redraw).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10 * AT_REST_MS);
    expect(redraw).toHaveBeenCalledOnce();
  });

  test("once the stage is gone, nothing is drawn", () => {
    const redraw = vi.fn();
    const atRest = onceAtRest(redraw, () => false);
    atRest.moved();
    atRest.cancel();
    vi.advanceTimersByTime(10 * AT_REST_MS);
    expect(redraw).not.toHaveBeenCalled();
  });

  test("an animated camera move ending while a drag is under way waits for the drag, then draws once", () => {
    const redraw = vi.fn();
    let dragging = true;
    const atRest = onceAtRest(redraw, () => dragging);
    atRest.moveEnded();
    expect(redraw).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3 * AT_REST_MS);
    expect(redraw).not.toHaveBeenCalled();
    dragging = false;
    vi.advanceTimersByTime(AT_REST_MS);
    expect(redraw).toHaveBeenCalledOnce();
  });
});
