/**
 * Motion tokens for the editor layer, shared by its CSS and its scripted animations. Only the editor imports this
 * module, so it loads once edit mode is first entered; the toggle's tokens are in `toggle-motion.ts`, and nothing
 * the toggle loads may import from here, or every token below ships within the toggle's budget.
 */

/** Something entering or leaving: starts fast, settles gently. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Something moving or resizing on screen. */
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

/** The page shrinking into the canvas when edit mode starts, and growing back when it ends. */
export const MODE_SWITCH_MS = 240;
/** A frame's left and right edges, in the window's px. */
export interface Edges {
  left: number;
  right: number;
}

/**
 * How far each side's chrome moves as the page grows from the canvas over the window (designer, 2026-11-08: "跟着
 * Frame 一起走"): the Layers side (`left`, ≤ 0) as far as the frame's left edge, the Design side (`right`, ≥ 0) as
 * far as its right edge. The stage's transform interpolates its translate and its scale apart, so the frame's edges
 * move linearly in the eased progress: moved over `MODE_SWITCH_MS` on `EASE_IN_OUT` too, the chrome keeps its gap to
 * them all the way. A side the edge would not push off the window (the frame under a panel, or coming its way) goes
 * just off it instead, on the same curve: then the frame, drawn over it, covers its inner edge all the way, and they
 * meet at the window's edge. `chrome`: where the Layers side ends and the Design side starts, at rest.
 */
export function chromePush(frame: { atRest: Edges; overPage: Edges }, chrome: { layersRight: number; designLeft: number }, windowWidth: number): Edges {
  return {
    left: -Math.max(frame.atRest.left - frame.overPage.left, chrome.layersRight),
    right: Math.max(frame.overPage.right - frame.atRest.right, windowWidth - chrome.designLeft),
  };
}
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
 * A number scrubbed (designer, 2026-11-08): a short scale inside its field, under its grip, fading and rising 2px into place as the
 * drag starts, the grip lifting to make room; fading out once let go. With reduced motion, the scale only fades and the grip lifts at once.
 * The whole grip sways left and right with the drag's speed, up to `GRIP_SWAY_MAX_PX`, leaning up to `GRIP_SWAY_MAX_DEG` about its
 * centre, and settles back over `FIELD_SETTLE_MS`; with reduced motion, it stays still.
 */
export const SCRUB_RULER_IN_MS = 150;
export const SCRUB_RULER_OUT_MS = 120;
export const GRIP_SWAY_MAX_PX = 3;
export const GRIP_SWAY_MAX_DEG = 4;

/**
 * A number's digits rolling as it is scrubbed, or taken back by its reset, as a counter's drum turns (designer, 2026-11-08): each digit
 * that changes slides out up and fades and blurs away, its new one coming up from below, out of a blur, as the value grows; the other way
 * as it falls. Quick, as a scrub changes it many times a second; a change mid-roll takes each digit on from where it is. With reduced
 * motion, the digits only fade, quicker (80ms: the agent's, to confirm). Typed, stepped with the keys or undone, a number changes at once.
 */
export const DIGIT_ROLL_MS = 120;
export const DIGIT_FADE_MS = 80;
/** How far a digit rolls, in em of its own size (the agent's, to confirm), and how blurred it starts and ends (designer, 2026-11-08). */
export const DIGIT_ROLL_EM = 0.5;
export const DIGIT_BLUR_PX = 2;

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

/**
 * A level closed in the Layers (designer, 2026-11-08): its rows go `LAYERS_FOLD_RISE_PX` up and fade over
 * `LAYERS_FOLD_MS`, however many they are, while the rows after rise into their places with them. With reduced
 * motion it closes at once.
 */
export const LAYERS_FOLD_MS = 200;
export const LAYERS_FOLD_RISE_PX = 8;
