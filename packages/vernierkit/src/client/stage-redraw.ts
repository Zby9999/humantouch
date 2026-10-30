/**
 * The stage redrawn only as far as the camera shows it (ticket 22): the
 * browser is made to draw again only what shows of the stage, once the
 * camera is at rest or an animated camera move has ended. Unlike the camera
 * itself (`camera.ts`, pure), this touches the stage in the DOM and keeps a
 * timer.
 */

/**
 * Has the browser draw only what the camera shows of the stage again, once a
 * camera move animated on it has ended or the camera is at rest
 * (`onceAtRest`), with nothing on screen changed.
 *
 * Chromium draws all of what is under an animated transform. Once it has
 * drawn all of the stage, under an animation or with all of it in sight, it
 * goes on drawing all of it while the transform is set from script, as the
 * camera's is: on a large page, each change to a view then had the whole of
 * it drawn again, not just what shows, some 12ms a frame (ticket 22). Taking
 * the stage out of the layout and putting it back in the same task, before
 * anything is drawn, makes the browser start that over: the views keep their
 * documents, what has focus keeps it, and the stage is drawn the same.
 * Zoomed out till every view shows in full, the stage is drawn whole again,
 * and would stay so after zooming back in: that is why it is called again
 * once the camera is at rest, however it moved.
 */
export function drawOnlyWhatShows(stage: HTMLElement) {
  // Only `display` is touched: the style written again in full would be read back with fewer digits, the camera a little off.
  const display = stage.style.getPropertyValue("display");
  const priority = stage.style.getPropertyPriority("display");
  stage.style.setProperty("display", "none");
  stage.getBoundingClientRect();
  if (display) stage.style.setProperty("display", display, priority);
  else stage.style.removeProperty("display");
}

/**
 * How long the camera has to stay where it is before the stage is drawn only
 * as far as it shows again: longer than between the events of a wheel or a
 * pinch, so a camera on the move is left to it, and short enough to be done
 * before a value is changed after it.
 */
export const AT_REST_MS = 100;

/** The stage drawn only as far as it shows (`drawOnlyWhatShows`) once the camera is at rest. */
export interface OnceAtRest {
  /** The camera has moved: `redraw` once it has stayed where it is for `AT_REST_MS`. */
  moved(): void;
  /** An animated camera move has ended: `redraw` now, the moves before it with it, or, busy, as soon as it is not. */
  moveEnded(): void;
  /** The stage is gone: nothing more to redraw. */
  cancel(): void;
}

/**
 * Calls `redraw` once the camera has stayed where it is for `AT_REST_MS`
 * after it last moved, however it moved: by the wheel, a pinch, a pan, ⇧1.
 * While `busy` (a drag, typing, a mode switch under way), it waits on,
 * `AT_REST_MS` at a time, and redraws once that is over: nothing under way
 * is broken into.
 */
export function onceAtRest(redraw: () => void, busy: () => boolean): OnceAtRest {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (busy()) wait();
      else redraw();
    }, AT_REST_MS);
  };
  return {
    moved: wait,
    moveEnded() {
      clearTimeout(timer);
      if (busy()) wait();
      else redraw();
    },
    cancel: () => clearTimeout(timer),
  };
}
