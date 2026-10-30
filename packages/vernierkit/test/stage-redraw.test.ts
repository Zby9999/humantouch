import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AT_REST_MS, onceAtRest } from "../src/client/stage-redraw";

describe("drawing only what shows once the camera is at rest", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  test("moved again and again, as by the wheel, it is drawn once, AT_REST_MS after the camera last moved", () => {
    const redraw = vi.fn();
    const atRest = onceAtRest(redraw, () => false, () => false);
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
    const atRest = onceAtRest(redraw, () => busy, () => false);
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
    const atRest = onceAtRest(redraw, () => animating, () => false);
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
    const atRest = onceAtRest(redraw, () => false, () => false);
    atRest.moved();
    atRest.cancel();
    vi.advanceTimersByTime(10 * AT_REST_MS);
    expect(redraw).not.toHaveBeenCalled();
  });

  test("an animated camera move ending while a drag is under way waits for the drag, then draws once", () => {
    const redraw = vi.fn();
    let dragging = true;
    const atRest = onceAtRest(redraw, () => dragging, () => false);
    atRest.moveEnded();
    expect(redraw).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3 * AT_REST_MS);
    expect(redraw).not.toHaveBeenCalled();
    dragging = false;
    vi.advanceTimersByTime(AT_REST_MS);
    expect(redraw).toHaveBeenCalledOnce();
  });

  test("the viewport or the views resized, the whole stage never in sight since it was last drawn: it is not drawn again", () => {
    const redraw = vi.fn();
    const atRest = onceAtRest(redraw, () => false, () => false);
    for (let i = 0; i < 5; i++) {
      atRest.reframed();
      vi.advanceTimersByTime(2 * AT_REST_MS);
    }
    expect(redraw).not.toHaveBeenCalled();
  });

  test("once the whole stage has been in sight, a change to the viewport or the views draws it once, AT_REST_MS after the last; drawn out of sight, changes no longer do", () => {
    const redraw = vi.fn();
    let whole = true;
    const atRest = onceAtRest(redraw, () => false, () => whole);
    // A view deleted, the rest all in sight.
    atRest.reframed();
    vi.advanceTimersByTime(AT_REST_MS);
    expect(redraw).toHaveBeenCalledOnce();
    // Drawn all in sight, it may be drawn whole still: the window made smaller, twice in a row, draws once more.
    whole = false;
    atRest.reframed();
    vi.advanceTimersByTime(AT_REST_MS / 2);
    atRest.reframed();
    vi.advanceTimersByTime(AT_REST_MS - 1);
    expect(redraw).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(redraw).toHaveBeenCalledTimes(2);
    // Drawn out of sight: a view growing taller no longer draws it.
    atRest.reframed();
    vi.advanceTimersByTime(10 * AT_REST_MS);
    expect(redraw).toHaveBeenCalledTimes(2);
  });

  test("the whole stage in sight after the camera moved, as by ⇧1 in a tall window, counts: the window made smaller then draws it", () => {
    const redraw = vi.fn();
    let whole = true;
    const atRest = onceAtRest(redraw, () => false, () => whole);
    atRest.moved();
    vi.advanceTimersByTime(AT_REST_MS);
    expect(redraw).toHaveBeenCalledOnce();
    whole = false;
    atRest.reframed();
    vi.advanceTimersByTime(AT_REST_MS);
    expect(redraw).toHaveBeenCalledTimes(2);
  });

  test("a change to the viewport or the views while a drag is under way waits for it, as a camera move does", () => {
    const redraw = vi.fn();
    let dragging = true;
    let whole = true;
    const atRest = onceAtRest(redraw, () => dragging, () => whole);
    atRest.reframed();
    whole = false;
    vi.advanceTimersByTime(3 * AT_REST_MS);
    expect(redraw).not.toHaveBeenCalled();
    dragging = false;
    vi.advanceTimersByTime(AT_REST_MS);
    expect(redraw).toHaveBeenCalledOnce();
  });
});
