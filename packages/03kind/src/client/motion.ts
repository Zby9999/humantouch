/** Motion tokens for the editor layer, shared by its CSS and its scripted animations. */

/** Something entering or leaving: starts fast, settles gently. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Something moving or resizing on screen. */
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

/** The page shrinking into the canvas when edit mode starts, and growing back when it ends. */
export const MODE_SWITCH_MS = 240;
/** How long the locked toggle is pressed and held to unlock it; a ring runs out meanwhile. */
export const UNLOCK_HOLD_MS = 1000;
/**
 * Leaving edit mode, the panels and the tools fade out, 8px outward, at once and quicker than the page grows
 * (designer, 2026-11-08): gone before the page's edge reaches them (about 80ms in), so no panel shows beside a
 * page that already seems to fill the window.
 */
export const PANEL_EXIT_MS = 100;
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

/** A segmented group's reset popping out at its right end once a click changes the group, and fading as it goes (designer, 2026-11-08); a key, or reduced motion, drops the pop. */
export const RESET_POP_MS = 150;

/**
 * A number scrubbed (designer, 2026-11-08): the ruler under its field fading and sliding 4px down into place as the drag starts,
 * and fading out once let go; with reduced motion, it only fades. Its grip tilts with the drag's speed, up to `GRIP_TILT_MAX_DEG`,
 * and settles upright over `FIELD_SETTLE_MS`; with reduced motion, it stays upright.
 */
export const SCRUB_RULER_IN_MS = 150;
export const SCRUB_RULER_OUT_MS = 120;
export const GRIP_TILT_MAX_DEG = 12;

/** The line under a panel's header running to the panel's edges once the panel is scrolled, and back at its top (designer, 2026-11-08); with reduced motion, at once. */
export const HEADER_LINE_MS = 200;

/**
 * A panel edge's grip appearing where the pointer rests on its edge: fading in and growing from half its height
 * about its middle, at the pointer (designer, 2026-11-08). With reduced motion it only fades.
 */
export const GRIP_ENTER_MS = 150;
/** The grip leaving as the pointer does, fading alone, a little faster than it came (designer, 2026-11-08). */
export const GRIP_EXIT_MS = 120;

/**
 * A tool's tip (designer, 2026-11-08): the pointer rests on a tool `TIP_DELAY_MS` before it shows, fading in and growing from
 * 0.97 toward the toolbar over `TIP_IN_MS`. Once one shows, the other tools' tips show at once, without motion, and so for
 * `TIP_GRACE_MS` after the pointer leaves the toolbar. Focus from the keyboard shows it at once; with reduced motion, it only fades.
 */
export const TIP_DELAY_MS = 500;
export const TIP_IN_MS = 125;
export const TIP_GRACE_MS = 300;
