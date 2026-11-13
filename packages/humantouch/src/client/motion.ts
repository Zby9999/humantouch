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
 * A number scrubbed (designer, 2026-11-08): the whole grip sways left and right with the drag's speed, up to `GRIP_SWAY_MAX_PX`,
 * upright, and settles back over `FIELD_SETTLE_MS`; with reduced motion, it stays still.
 */
export const GRIP_SWAY_MAX_PX = 3;

/**
 * A number's digits rolling as it is scrubbed, or taken back by its reset, as a counter's drum turns (designer, 2026-11-08): each digit
 * that changes slides out up and fades and blurs away, its new one coming up from below, out of a blur, as the value grows; the other way
 * as it falls. Quick, as a scrub changes it many times a second; a change mid-roll takes each digit on from where it is. With reduced
 * motion, the digits only fade, quicker (80ms: the agent's, to confirm). Typed, stepped with the keys or undone, a number changes at once.
 */
export const DIGIT_ROLL_MS = 100;
export const DIGIT_FADE_MS = 80;
/** How far a digit rolls, in em of its own size, and how blurred it starts and ends (designer, 2026-11-08, tuned with DialKit). */
export const DIGIT_ROLL_EM = 0.25;
export const DIGIT_BLUR_PX = 1;

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
 * motion it closes at once. An effect folded in the Design panel goes the same way, what comes after it rising (designer, 2026-11-08).
 */
export const LAYERS_FOLD_MS = 200;
export const LAYERS_FOLD_RISE_PX = 8;

/**
 * A change the Agent has applied, in the list open while it applies the round (designer, 2026-11-09): its row goes back,
 * to `APPLIED_SCALE` and fading, over `APPLIED_LEAVE_MS`, while the rows after it rise into its place over `APPLIED_RISE_MS`.
 * With reduced motion it only fades, the others in their places at once.
 */
export const APPLIED_LEAVE_MS = 200;
export const APPLIED_SCALE = 0.94;
export const APPLIED_RISE_MS = 240;

/**
 * A change in the list clicked (designer, 2026-11-10): the camera glides over `CHANGE_GLIDE_MS` on `EASE_IN_OUT` to its
 * layer, in the view it applies in, then the layer's outline and the fields it changed each blink lighter twice over
 * `CHANGE_PING_MS`, the whole of each (designer, 2026-11-10). With reduced motion the camera is there at once; the
 * blinks, a color alone, stay.
 */
export const CHANGE_GLIDE_MS = 300;
export const CHANGE_PING_MS = 1200;

/**
 * A palette ramp's second line opening or folding (ticket 143, prototype A): its height over `SECOND_LINE_MS` on
 * `EASE_OUT`, its swatches fading in over `SECOND_LINE_FADE_MS` as they drop 3px into place, `SECOND_LINE_STAGGER_MS`
 * after one another; the chevron turns over `CHEVRON_TURN_MS`. With reduced motion, none of it moves.
 */
export const SECOND_LINE_MS = 200;
export const SECOND_LINE_FADE_MS = 160;
export const SECOND_LINE_STAGGER_MS = 25;
export const CHEVRON_TURN_MS = 160;

/** Blinks `el` lighter (`.ht-ping`), started afresh if it is blinking still. */
export function ping(el: Element): void {
  el.classList.remove("ht-ping");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("ht-ping");
  const end = (event: Event) => {
    if (event.target !== el) return;
    el.classList.remove("ht-ping");
    el.removeEventListener("animationend", end);
  };
  el.addEventListener("animationend", end);
}

/** `EASE_IN_OUT` as a function of time, 0 to 1, for what a script moves frame by frame: the camera. */
export const easeInOut = cubicBezier(0.77, 0, 0.175, 1);

/** A CSS `cubic-bezier()` easing as a function of time, solved for x by Newton's method, then halving. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  const slope = (a: number, b: number, s: number) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s ** 2;
  return (t) => {
    if (t <= 0 || t >= 1) return Math.min(1, Math.max(0, t));
    let s = t;
    for (let i = 0; i < 8; i++) {
      const d = slope(x1, x2, s);
      if (Math.abs(d) < 1e-6) break;
      s -= (at(x1, x2, s) - t) / d;
    }
    if (s < 0 || s > 1 || Math.abs(at(x1, x2, s) - t) > 1e-4) {
      let [lo, hi] = [0, 1];
      s = t;
      for (let i = 0; i < 30; i++) {
        if (at(x1, x2, s) < t) lo = s;
        else hi = s;
        s = (lo + hi) / 2;
      }
    }
    return at(y1, y2, s);
  };
}
