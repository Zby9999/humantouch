/*
 * What the editor layer puts on the live page. None of it ever goes into a canvas.
 */

/** Tag of the element that hosts the editor layer's Shadow DOM. */
export const HOST_TAG = "third-kind";

/** On the hidden iframe the live page is loaded in, at another width, for `done` to check a change there: no editor layer is mounted in it. */
export const CHECK_FRAME_ATTR = "data-tk-check";

/** Performance entries: a mark when the designer asks for edit mode, a measure once the canvas is on screen. */
export const ENTER_MARK = "03kind:enter-edit-mode";

/** Performance entries: a measure for each stretch of the page checking a claimed round (ticket 64), which must never make a long task. */
export const CHECK_MEASURE = "03kind:check";
