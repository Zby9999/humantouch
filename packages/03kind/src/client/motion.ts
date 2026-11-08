/** Motion tokens for the editor layer, shared by its CSS and its scripted animations. */

/** Something entering or leaving: starts fast, settles gently. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Something moving or resizing on screen. */
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

/** The page shrinking into the canvas when edit mode starts, and growing back when it ends. */
export const MODE_SWITCH_MS = 240;
/** How long the locked toggle is pressed and held to unlock it; a ring runs out meanwhile. */
export const UNLOCK_HOLD_MS = 1000;
/** With reduced motion, the editor fades in and out instead. */
export const MODE_FADE_MS = 150;
/** A toast fading in and out; with reduced motion, it only fades. */
export const TOAST_FADE_MS = 180;
/** A field darkening while hovered, and taking the accent once changed: a color alone, kept with reduced motion. */
export const FIELD_STATE_MS = 120;
/** A field dragged taking the accent once let go (designer, 2026-11-08): a color alone, kept with reduced motion. */
export const FIELD_SETTLE_MS = 200;

export function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The chosen tool's backing sliding to a tool clicked (designer, 2026-11-08); a key picking one, or reduced motion, jumps it. */
export const TOOL_SLIDE_MS = 200;

/**
 * A popover (a select's or a button's menu, the color picker, a Variable's list) closed with the pointer leaving:
 * fading and moving 4px down (designer, 2026-11-08). It opens at once, and a key closing it closes it at once.
 */
export const POPOVER_EXIT_MS = 150;

/**
 * A panel edge's grip appearing where the pointer rests on its edge: fading in and growing from half its height
 * about its middle, at the pointer (designer, 2026-11-08). With reduced motion it only fades.
 */
export const GRIP_ENTER_MS = 150;
/** The grip leaving as the pointer does, fading alone, a little faster than it came (designer, 2026-11-08). */
export const GRIP_EXIT_MS = 120;
