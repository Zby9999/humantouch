/** Motion tokens for the editor layer, shared by its CSS and its scripted animations. */

/** Something entering or leaving: starts fast, settles gently. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Something moving or resizing on screen. */
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

/** The page shrinking into the canvas when edit mode starts, and growing back when it ends. */
export const MODE_SWITCH_MS = 280;
/** With reduced motion, the editor fades in and out instead. */
export const MODE_FADE_MS = 150;

export function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
