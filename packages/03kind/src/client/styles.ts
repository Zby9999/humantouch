import { APPLIED_LEAVE_MS, APPLIED_SCALE, EASE_IN_OUT, EASE_OUT, FIELD_SETTLE_MS, FIELD_STATE_MS, GRIP_ENTER_MS, GRIP_EXIT_MS, HEADER_LINE_MS, POPOVER_EXIT_MS, RESET_POP_MS, TIP_IN_MS, TOAST_FADE_MS, TOOL_SLIDE_MS } from "./motion";
import { EDITOR_FONT_FAMILY } from "./editor-font";
import { FONT_STACK } from "./toggle-styles";

/** The editor's typeface first (`registerEditorFont`), the toggle's after it, for what it lacks. */
const EDITOR_FONT = `"${EDITOR_FONT_FAMILY}", ${FONT_STACK}`;

/** The editor layer's styles, but for the toggle's (`toggleStyles`), which come before them. They live inside the Shadow DOM and never touch the page. */
export const styles = /* css */ `
.tk-icon { flex: none; width: var(--tk-icon-size); height: var(--tk-icon-size); }
.tk-icon * { stroke-width: var(--tk-icon-stroke); vector-effect: non-scaling-stroke; }

/* The toggle while the Agent applies the round: a ring fills as changes are done. */
.tk-progress {
  position: absolute;
  /* Round the toggle, in its column's 4px padding: at its top, or at its foot in a bottom corner, the toggle there. */
  top: 0;
  left: calc(50% - 18px);
  width: 36px;
  height: 36px;
  pointer-events: none;
}
.tk-dock[data-corner^="bottom"] .tk-progress { top: auto; bottom: 0; }
/* Its 1.5px line right round the toggle, nothing between, its corners round the toggle's 6px (designer, 2026-11-09). */
.tk-progress rect { x: 3.25px; y: 3.25px; width: 29.5px; height: 29.5px; rx: 6.75px; fill: none; stroke-width: 1.5; stroke-dasharray: 1; }
.tk-progress-track { stroke: rgb(30 30 30 / 0.16); }
.tk-progress-done {
  stroke: #0d99ff;
  stroke-linecap: round;
  transition: stroke-dashoffset 240ms ${EASE_OUT};
}
/* Pressed and held: the ring that runs out when the toggle unlocks. */
.tk-progress-hold { stroke: #525351; stroke-dashoffset: 1; opacity: 0; }
.is-holding .tk-progress-hold { opacity: 1; animation: tk-hold var(--tk-hold) linear forwards; }
@keyframes tk-hold { to { stroke-dashoffset: 0; } }

/*
 * Changes not yet applied, counted on a button of their own after the toggle in its column: not a badge on its corner, too
 * easily pressed for the toggle. As the count beside the Design title in edit mode, so it reads as a count and not as a
 * second toggle (designer, 2026-11-08), and 28px as the toggle (designer, 2026-11-09). It opens the change list.
 */
.tk-toggle-count {
  all: unset;
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  color: #daecff;
  font: 500 12px/28px ${EDITOR_FONT};
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  text-align: center;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}
/* Drawn 24px, 2px in from its 28px, which it is clicked in still: the panel's count, as it is drawn (designer, 2026-11-09). */
.tk-toggle-count::before {
  content: "";
  position: absolute;
  inset: 2px;
  z-index: -1;
  border-radius: 6px;
  background: linear-gradient(#3fa5fe, #008ff0);
  box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.15), 0 1px 1px rgb(0 0 0 / 0.15);
}
.tk-toggle-count:hover::before { background: linear-gradient(#008ff0, #007dd2); }
.tk-toggle-count:focus-visible { outline: 2px solid #008ff0; outline-offset: 0; }

/*
 * The change list: light as the editor's menus and popovers, in their colors, opening toward the middle of the window
 * (designer, 2026-11-08). In edit mode it is in the shell and takes its colors; on the toggle, outside it, the same ones.
 */
.tk-dock .tk-changes {
  --tk-panel: #f5f5f5;
  --tk-border: #d4d4d3;
  --tk-text: #0a0a09;
  --tk-text-muted: #737472;
  --tk-field: #ededec;
  --tk-button: #e5e5e4;
  --tk-accent: #008ff0;
}
@media (prefers-color-scheme: dark) {
  .tk-dock .tk-changes {
    --tk-panel: #2c2c2c;
    --tk-border: #444444;
    --tk-text: #ffffff;
    --tk-text-muted: #a6a6a6;
    --tk-field: #383838;
    --tk-button: #383838;
  }
}
.tk-changes {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 280px;
  max-height: min(400px, calc(100vh - 96px));
  overflow: hidden;
  padding: 4px;
  border-radius: 12px;
  background: var(--tk-panel);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  color: var(--tk-text);
  font: 400 11px/16px ${EDITOR_FONT};
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  outline: none;
}
.tk-dock[data-corner^="bottom"] .tk-changes { bottom: calc(100% + 8px); }
.tk-dock[data-corner^="top"] .tk-changes { top: calc(100% + 8px); }
.tk-dock[data-corner$="right"] .tk-changes { right: 0; }
.tk-dock[data-corner$="left"] .tk-changes { left: 0; }
.tk-changes > * { flex: none; }
.tk-changes-title { margin: 0; padding: 8px; font: inherit; font-weight: 600; }
.tk-changes-note { margin: 0; padding: 0 8px 8px; color: var(--tk-text-muted); }
/*
 * Too long for the list's height, the rows alone scroll, between its title and Discard all (designer, 2026-11-09). An edge with
 * rows past it fades out over 24px, telling there are more.
 */
.tk-changes > .tk-changes-list {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  --tk-fade-above: 0px;
  --tk-fade-below: 0px;
  mask-image: linear-gradient(transparent, #000 var(--tk-fade-above), #000 calc(100% - var(--tk-fade-below)), transparent);
}
.tk-changes-list.is-above { --tk-fade-above: 24px; }
.tk-changes-list.is-below { --tk-fade-below: 24px; }
/* A row as a menu's option, two lines high: light grey under the pointer; its undo muted, darker under the pointer. */
.tk-change {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 4px 0 8px;
  border-radius: 8px;
}
.tk-change:hover { background: var(--tk-field); }
.tk-change .tk-icon-button { color: var(--tk-text-muted); }
.tk-change .tk-icon-button:hover { background: var(--tk-button); color: var(--tk-text); }
/* The change the Agent is at, as it applies the round: darker, turning at its right where undo is otherwise (designer, 2026-11-09). */
.tk-change.is-current { background: var(--tk-button); transition: background-color ${APPLIED_LEAVE_MS}ms ease; }
.tk-change-spinner {
  flex: none;
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  margin: 0 6px;
  border: 1.5px solid var(--tk-border);
  border-top-color: var(--tk-text-muted);
  border-radius: 50%;
  animation: tk-spin 800ms linear infinite;
}
@keyframes tk-spin { to { rotate: 1turn; } }
/* Applied: kept where it was, out of the rows' flow, it goes back and fades; with reduced motion it only fades (designer, 2026-11-09). */
.tk-change.is-applied {
  position: absolute;
  left: 0;
  right: 0;
  /* Under the rows rising into its place. */
  z-index: -1;
  pointer-events: none;
  animation: tk-change-applied ${APPLIED_LEAVE_MS}ms ${EASE_OUT} forwards;
}
@keyframes tk-change-applied { to { opacity: 0; scale: ${APPLIED_SCALE}; } }
@media (prefers-reduced-motion: reduce) {
  .tk-change.is-applied { animation-name: tk-change-applied-fade; }
}
@keyframes tk-change-applied-fade { to { opacity: 0; } }
.tk-change-text { display: grid; flex: 1; min-width: 0; }
.tk-change-name, .tk-change-values { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-change-values { color: var(--tk-text-muted); }
.tk-changes-confirm { margin-top: 4px; padding: 8px 8px 0; border-top: 1px solid var(--tk-border); }
.tk-changes-confirm p { margin: 0; }
.tk-changes-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 8px 4px; }
/* Its buttons as the panels' top ones, on the light panel; Discard stays red. */
.tk-changes .tk-button:not(.is-danger) { background: var(--tk-button); color: var(--tk-text); }
.tk-changes .tk-button:not(.is-danger):hover { background: var(--tk-border); }
.tk-button {
  all: unset;
  height: 24px;
  padding: 0 8px;
  border-radius: 5px;
  background: #383838;
  font: 500 11px/24px ${EDITOR_FONT};
  cursor: default;
}
.tk-button:hover { background: #444444; }
.tk-button:focus-visible { outline: 2px solid #0d99ff; outline-offset: 1px; }
.tk-button.is-danger { background: #f24822; color: #fff; }
.tk-button.is-danger:hover { background: #dc3412; }
.tk-button.is-primary { background: #0d99ff; color: #fff; }
.tk-button.is-primary:hover { background: #007be5; }

/* A notice, dark like the toggle: the Agent seems to have stopped (ticket 67). */
.tk-notice {
  box-sizing: border-box;
  width: min(360px, 100%);
  padding: 4px 0;
  border-radius: 12px;
  background: #1e1e1e;
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 0.08),
    0 1px 2px rgb(0 0 0 / 0.2),
    0 8px 24px rgb(0 0 0 / 0.24);
  color: #fff;
  font: 400 11px/16px ${EDITOR_FONT};
}
.tk-notice-title { margin: 0; padding: 8px 12px 4px; font: inherit; font-weight: 600; }
.tk-notice-text { margin: 0; padding: 0 12px 4px; color: rgb(255 255 255 / 0.7); }
/* The Agent seems to have stopped (ticket 67): on the toggle, where its change list opens. */
.tk-stalled { position: absolute; width: 300px; }
.tk-dock[data-corner^="bottom"] .tk-stalled { bottom: calc(100% + 8px); }
.tk-dock[data-corner^="top"] .tk-stalled { top: calc(100% + 8px); }
.tk-dock[data-corner$="right"] .tk-stalled { right: 0; }
.tk-dock[data-corner$="left"] .tk-stalled { left: 0; }

/*
 * Edit mode shell, in the designer's palette (Figma: Palette, 2026-11-07): neutral steps of OKLCH hue 132, blue and
 * purple to stand out. Light only for now; the dark one keeps the earlier greys until the designer has drawn it.
 */
.tk-shell {
  --tk-panel: #f5f5f5; /* neutral 100 */
  --tk-canvas: #e5e5e4; /* neutral 200 */
  --tk-border: #d4d4d3; /* neutral 300: rules and borders */
  --tk-guide: #e5e5e4; /* neutral 200: the Layers' guides */
  --tk-text: #0a0a09; /* neutral 950 */
  --tk-text-muted: #737472; /* neutral 500 */
  --tk-title: #3f403f; /* neutral 700: a section's title */
  --tk-field: #ededec; /* neutral 150 */
  --tk-button: #e5e5e4; /* neutral 200: the buttons at the panels' tops */
  --tk-raised: #fafafa; /* neutral 50: the choice of a segmented control, the Layers' disclosures */
  /*
   * A field, a choice, the alignment's grid (Figma: 03 Kind, 86:557; designer, 2026-11-08): raised on neutral 50, a hairline and a soft
   * shadow under it; pointed at or chosen, on neutral 100. Every edge drawn inward (designer, 2026-11-08). Each shadow is three, the
   * chosen edge, the shadow, the hairline, so one eases into the next.
   */
  --tk-input: #fafafa;
  --tk-input-hover: #f5f5f5;
  --tk-input-shadow: inset 0 0 0 1px transparent, 0 1px 1px rgb(0 0 0 / 0.15), inset 0 0 0 0.5px rgb(0 0 0 / 0.1);
  --tk-input-focus-shadow: inset 0 0 0 1px var(--tk-accent-strong), 0 1px 1px rgb(0 143 240 / 0.6), inset 0 0 0 0.5px rgb(0 0 0 / 0.1);
  /* Changed, on the accent: a darker hairline, the same shadow under it. */
  --tk-changed-shadow: inset 0 0 0 1px transparent, 0 1px 1px rgb(0 0 0 / 0.15), inset 0 0 0 0.5px rgb(0 0 0 / 0.15);
  --tk-changed-focus-shadow: inset 0 0 0 1px var(--tk-accent-strong), 0 1px 1px rgb(0 0 0 / 0.15), inset 0 0 0 0.5px rgb(0 0 0 / 0.15);
  /* The choice of a segmented control, raised: its hairline inward too. */
  --tk-chosen-shadow: 0 1px 1px rgb(0 0 0 / 0.15), inset 0 0 0 0.5px rgb(0 0 0 / 0.15);
  --tk-tool-chosen: #ffffff; /* neutral 0: the tool chosen */
  /* The editor's prominent button, on the tool chosen's white: the chosen tool's backing, the Show layers button (designer, 2026-11-08). */
  --tk-prominent-shadow: 0 1px 1px rgb(0 0 0 / 0.15), 0 0 0 0.5px rgb(0 0 0 / 0.15);
  --tk-panel-label: #525351; /* neutral 600: the tools' icons */
  --tk-raised-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 1px 1px rgb(0 0 0 / 0.15);
  --tk-tab-track: #d4d4d3; /* neutral 300: the Design and Variants tabs */
  /* The panels' widths: each set by its edge (designer, 2026-11-08), on the shell's style, as panel-widths.ts fits them. */
  --tk-layers-width: 320px;
  --tk-design-width: 320px;
  color-scheme: light;
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: grid;
  grid-template-columns: var(--tk-layers-width) minmax(0, 1fr) var(--tk-design-width);
  /* The canvas's gray under the panels: as they move out with the frame on leaving, and in as it starts, the canvas shows where they were, not the page under the editor (designer, 2026-11-08). */
  background: var(--tk-canvas);
  font: 400 11px/16px ${EDITOR_FONT};
  color: var(--tk-text);
  /* Grayscale smoothing for the editor's UI, its muted labels kept at 500 (designer, 2026-11-08); the page on the canvas is in iframes, so it doesn't inherit this. */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
@media (prefers-color-scheme: dark) {
  .tk-shell {
    --tk-panel: #2c2c2c;
    --tk-canvas: #1e1e1e;
    --tk-border: #444444;
    --tk-guide: #444444;
    --tk-text: #ffffff;
    --tk-text-muted: #a6a6a6;
    --tk-title: #e6e6e6;
    --tk-field: #383838;
    --tk-button: #383838;
    --tk-raised: #4a4a4a;
    /* The dark fields as they were, flat, till the designer draws them. */
    --tk-input: #383838;
    --tk-input-hover: #383838;
    --tk-input-shadow: inset 0 0 0 1px transparent, 0 0 0 0 transparent, inset 0 0 0 0 transparent;
    --tk-input-focus-shadow: inset 0 0 0 1px var(--tk-accent), 0 0 0 0 transparent, inset 0 0 0 0 transparent;
    --tk-changed-shadow: inset 0 0 0 1px transparent, 0 0 0 0 transparent, inset 0 0 0 0 transparent;
    --tk-changed-focus-shadow: inset 0 0 0 1px var(--tk-accent-strong), 0 0 0 0 transparent, inset 0 0 0 0 transparent;
    --tk-chosen-shadow: 0 1px 1px rgb(0 0 0 / 0.3), inset 0 0 0 0.5px rgb(0 0 0 / 0.4);
    --tk-tool-chosen: #4a4a4a;
    --tk-panel-label: #e6e6e6;
    --tk-raised-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.4), 0 1px 1px rgb(0 0 0 / 0.3);
    --tk-tab-track: #1e1e1e;
    color-scheme: dark;
  }
}

/* A panel: a column of its parts, 16px apart and from its edges. */
.tk-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  min-width: 0;
  padding: 16px;
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--tk-panel);
}
.tk-panel > * { flex: none; }
/* The Design panel's sections 20px apart (designer, 2026-11-08). */
.tk-panel.is-design { gap: 20px; }
/* Its words are the editor's own, not to be selected (designer, 2026-11-07); what is typed in its fields is. */
.tk-panel { user-select: none; -webkit-user-select: none; }
.tk-panel :is(input, textarea, [contenteditable="true"]) { user-select: text; -webkit-user-select: text; }
/* The Layers panel starts hidden: the canvas takes its column, and a button at its top left brings it back. */
.tk-shell.is-layers-hidden { grid-template-columns: minmax(0, 1fr) var(--tk-design-width); }
/*
 * Its size, corners and place on the screen those of the button in the Layers panel's top that hid them, so
 * showing and hiding the panel leaves it where it is (designer, 2026-11-08): 28px as the Design panel's ×, 6px corners, the panel's padding
 * from the left, centred on the 28px header from the top. Alone over the canvas, it is the editor's prominent button,
 * the chosen tool's white and shadow (designer, 2026-11-08).
 */
.tk-show-layers {
  all: unset;
  position: absolute;
  top: 12px;
  left: 16px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--tk-tool-chosen);
  box-shadow: var(--tk-prominent-shadow);
  color: var(--tk-text);
}
.tk-show-layers:hover { background: var(--tk-raised); }
.tk-show-layers:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
.tk-stop-playing {
  all: unset;
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--tk-panel);
  box-shadow: 0 0 0 1px var(--tk-border), 0 2px 6px rgb(0 0 0 / 0.08);
  color: var(--tk-text);
}
.tk-stop-playing:hover { background: var(--tk-field); }
.tk-stop-playing:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 2px; }
/* Playing: the canvas alone, at full size; a button at the top right goes back to editing. */
.tk-shell.is-playing { grid-template-columns: minmax(0, 1fr); }
.tk-shell.is-playing > :is(.tk-panel, .tk-show-layers) { display: none; }
.tk-shell.is-playing .tk-canvas { box-shadow: none; }
.tk-stop-playing { left: auto; right: 8px; }

/*
 * A panel's inner edge, to resize it (designer, 2026-11-08): 6px straddling the edge, over the panel and the canvas.
 * The pointer resting on it, the grip drawn in Figma (03 Kind, node 169:1379) shows at the pointer: a 10 × 48 pill
 * of the accent, a 0.5px white outline. It fades in and grows from half its height about its middle, where the pointer
 * is, and leaves by fading alone; with reduced motion it only fades. Pressed, the panel's whole edge takes the accent
 * at once (Figma: node 169:958's left border), and lets it go over a field's state change.
 */
.tk-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  /* Over the panels' sticky headers (z-index 2; the Design panel's comes after its edge in the page, so at an equal z-index it covered the edge's top): the edge, its grip and its line run the panels' whole height (designer, 2026-11-08). */
  z-index: 3;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
  outline: none;
}
.tk-resizer.is-layers { left: calc(var(--tk-layers-width) - 3px); }
.tk-resizer.is-design { right: calc(var(--tk-design-width) - 3px); }
/* The edge's line, inside the panel: the Layers' last pixel, the Design panel's first. */
.tk-resizer::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 1px;
  background: var(--tk-accent);
  opacity: 0;
  transition: opacity ${FIELD_STATE_MS}ms ${EASE_OUT};
}
.tk-resizer.is-layers::before { left: 2px; }
.tk-resizer.is-pressed::before { opacity: 1; transition: none; }
.tk-resizer-grip {
  position: absolute;
  top: 50%;
  left: 50%;
  box-sizing: border-box;
  width: 10px;
  height: 48px;
  margin: -24px 0 0 -5px;
  border: 0.5px solid #ffffff; /* neutral 0 */
  border-radius: 99px;
  background: var(--tk-accent);
  pointer-events: none;
  opacity: 0;
  transform: scaleY(0.5);
  /* Leaving: a fade; at half its height again only once gone, so shown again meanwhile it doesn't grow twice. */
  transition: opacity ${GRIP_EXIT_MS}ms ${EASE_OUT}, transform 0s linear ${GRIP_EXIT_MS}ms;
}
.tk-resizer.is-shown .tk-resizer-grip {
  opacity: 1;
  transform: none;
  transition: opacity ${GRIP_ENTER_MS}ms ${EASE_OUT}, transform ${GRIP_ENTER_MS}ms ${EASE_OUT};
}
/* Focused from the keyboard: the grip there at once, no motion for a key. */
.tk-resizer:focus-visible .tk-resizer-grip { opacity: 1; transform: none; transition: none; }
@media (prefers-reduced-motion: reduce) {
  .tk-resizer-grip { transform: none; }
}

/* The tools, at the top right of the canvas, 8px from the Design panel: one above another, the one chosen raised in white (designer, 2026-11-08). As high as the views' tops, under their labels: higher, they would cover the last view's label and its +. */
/* Figma (03 Kind, node 169:1359): 4px around the tools, 3px between, a 0.5px neutral 300 outline; the icons neutral 600, the chosen one's neutral 500 (designer, 2026-11-08). */
.tk-tools {
  position: absolute;
  top: 72px;
  right: calc(var(--tk-design-width) + 8px);
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px;
  /* Its tools' 6px corners and its 4px padding, nested (designer, 2026-11-08). */
  border-radius: 10px;
  background: var(--tk-panel);
  box-shadow: 0 0 0 0.5px var(--tk-border);
}
/* 28px, as the panel's buttons, with their 6px corners (designer, 2026-11-08). */
.tk-tools .tk-icon-button { position: relative; width: 28px; height: 28px; border-radius: 6px; color: var(--tk-panel-label); }
.tk-tools .tk-icon-button[aria-pressed="true"] { background: none; color: var(--tk-text-muted); }
/* The white under the chosen tool, one for all three: it moves by transform alone, a tool (28px) and a gap (3px) a step (designer, 2026-11-08). */
.tk-tools-backing {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--tk-tool-chosen);
  box-shadow: var(--tk-prominent-shadow);
  transform: translateY(calc(var(--tk-tool-index, 0) * 31px));
}
.tk-tools-backing.is-sliding { transition: transform ${TOOL_SLIDE_MS}ms ${EASE_IN_OUT}; }
@media (prefers-reduced-motion: reduce) {
  .tk-tools-backing.is-sliding { transition: none; }
}
.tk-shell.is-playing > .tk-tools { display: none; }
/* A tool's tip: the Variables' dark one, at the toolbar's left, 8px off it, level with the tool (designer, 2026-11-08). */
.tk-variants-tip.tk-tools-tip { position: absolute; right: calc(100% + 8px); transform: translateY(-50%); transform-origin: right center; }
/* Shown after the pointer rests on a tool, it fades in growing from 0.97 toward the toolbar; warm, or by focus, it is there at once; with reduced motion, it only fades (designer, 2026-11-08). */
@media (hover: hover) and (pointer: fine) {
  .tk-variants-tip.tk-tools-tip.is-easing { transition: opacity ${TIP_IN_MS}ms ${EASE_OUT}, transform ${TIP_IN_MS}ms ${EASE_OUT}; }
  @starting-style { .tk-variants-tip.tk-tools-tip.is-easing { opacity: 0; transform: translateY(-50%) scale(0.97); } }
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: reduce) {
  @starting-style { .tk-variants-tip.tk-tools-tip.is-easing { transform: translateY(-50%); } }
}
/* A toast, as in Figma: a dark pill of one line, at the bottom middle of the canvas, over it. */
.tk-toasts {
  position: absolute;
  bottom: 16px;
  left: var(--tk-layers-width);
  right: var(--tk-design-width);
  z-index: 1;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.tk-shell.is-layers-hidden > .tk-toasts { left: 0; }
.tk-shell.is-playing > .tk-toasts { left: 0; right: 0; }
.tk-toast {
  max-width: calc(100% - 32px);
  margin: 0;
  padding: 8px 12px;
  overflow: hidden;
  border-radius: 8px;
  background: #1e1e1e;
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 0.08),
    0 1px 2px rgb(0 0 0 / 0.2),
    0 4px 12px rgb(0 0 0 / 0.18);
  color: #fff;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: auto;
  animation: tk-toast-in ${TOAST_FADE_MS}ms ${EASE_OUT};
  transition: opacity ${TOAST_FADE_MS}ms ${EASE_OUT}, translate ${TOAST_FADE_MS}ms ${EASE_OUT};
}
.tk-toast.is-fading { opacity: 0; translate: 0 8px; }
@keyframes tk-toast-in { from { opacity: 0; translate: 0 8px; } }
/* What happened outside, as the code changed (ticket 78): at the canvas's bottom left, apart from the toast answering the designer's own doing. */
.tk-page-toasts {
  position: absolute;
  bottom: 16px;
  left: calc(var(--tk-layers-width) + 16px);
  z-index: 1;
  display: flex;
  max-width: calc(100% - var(--tk-layers-width) - var(--tk-design-width) - 32px);
  pointer-events: none;
}
.tk-shell:is(.is-layers-hidden, .is-playing) > .tk-page-toasts { left: 16px; max-width: calc(100% - var(--tk-design-width) - 32px); }
.tk-toast.is-page { display: flex; align-items: center; gap: 8px; }
.tk-toast.is-page > span { overflow: hidden; text-overflow: ellipsis; }
.tk-toast.is-page:has(.tk-button) { padding-block: 4px; padding-right: 4px; }
.tk-toast.is-page .tk-button { flex: none; }
@keyframes tk-toast-fade-in { from { opacity: 0; } }

/*
 * A panel's top, one style for both (designer, 2026-11-08). The Layers': a button that hides them, and their title.
 * The Design panel's: what it shows (Design, or Variants with nothing selected) at the left, the changes so far and the
 * way back at the right. Under both, the line the Design panel's had, inset by the panel's padding.
 * Sticky, on the panel's own color: what scrolls up goes under it. It reaches over the panel's padding (16px) to the
 * panel's edges, so nothing shows above or beside it; sticky keeps to the panel's padding, so it sticks 16px up.
 * Scrolled, the line runs to the panel's edges, by its clip alone (designer, 2026-11-08).
 */
.tk-panel-header {
  position: sticky;
  top: -16px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  margin: -16px -16px 0;
  /* 12px from the panel's top to its buttons (designer, 2026-11-08). */
  padding: 12px 16px 7px;
  background: var(--tk-panel);
}
.tk-panel-header::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--tk-border);
  clip-path: inset(0 16px);
  transition: clip-path ${HEADER_LINE_MS}ms ${EASE_OUT};
  pointer-events: none;
}
.tk-panel[data-scrolled] > .tk-panel-header::after { clip-path: inset(0); }
@media (prefers-reduced-motion: reduce) {
  .tk-panel-header::after { transition: none; }
}
/* The Layers' title's type for both (designer, 2026-11-08); it takes the room left, which puts the Design panel's count and way back at the right. */
.tk-panel-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0 0 0 4px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--tk-title);
}
.tk-panel.is-design .tk-panel-title { padding-left: 2px; }
.tk-panel-header > .tk-icon-button { width: 28px; height: 28px; border-radius: 6px; background: var(--tk-button); }
.tk-panel-header > .tk-icon-button:hover { background: var(--tk-border); }
.tk-count {
  all: unset;
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  color: #daecff;
  font: 500 12px/28px ${EDITOR_FONT};
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  text-align: center;
  cursor: pointer;
}
/*
 * Drawn 24px, 2px in from its 28px, which it is clicked in still, as large as the buttons beside it (designer, 2026-11-08): blue 400 into
 * blue 500, a hairline and a soft shadow (Figma: 03 Kind, 86:567; designer, 2026-11-08).
 */
.tk-count::before {
  content: "";
  position: absolute;
  inset: 2px;
  z-index: -1;
  border-radius: 6px;
  background: linear-gradient(var(--tk-accent-on), var(--tk-accent));
  box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.15), 0 1px 1px rgb(0 0 0 / 0.15);
}
.tk-count:hover::before { background: linear-gradient(var(--tk-accent), var(--tk-accent-strong)); }
.tk-count:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 0; }
/* Opened from the count: below the panel's top, over the panel, which would clip it. */
.tk-panel-header .tk-changes { position: fixed; top: 48px; right: 16px; z-index: 1; }

.tk-panel-empty { margin: 0; color: var(--tk-text-muted); }

.tk-shell {
  --tk-accent: #008ff0; /* blue 500 */
  --tk-accent-strong: #007dd2; /* blue 600 */
  --tk-accent-on: #3fa5fe; /* blue 400: a button on the accent */
  --tk-accent-soft: rgb(0 143 240 / 0.16);
  --tk-instance: #9a3cee; /* purple 600 */
  --tk-instance-soft: #efe4ff; /* purple 100 */
  --tk-locked: #8c8c8c;
}

/*
 * The Layers, as the designer drew them (2026-11-07): rows 28px high and 2px apart, a level 26px in, a white
 * disclosure before a layer with layers in it, and guides from each layer down to those in it.
 */
/*
 * The list, not the panel, scrolls up and down, under the panel's top, which stays as the Design panel's does: the
 * list starts right under the header's line, its padding in the gap, so rows scroll up under the line, not 16px short
 * of it (designer, 2026-11-08). Long names in full, as in Figma: the list scrolls sideways, the tree with the names,
 * its rows as wide as the widest, the panel's padding after it (designer, 2026-11-08).
 */
.tk-panel.is-layers { overflow: hidden; }
.tk-panel.is-layers > .tk-tree { flex: 1 1 auto; min-height: 0; }
.tk-tree { position: relative; margin: -16px -16px -16px; padding: 16px 0; overflow: auto; overscroll-behavior: contain; }
.tk-tree-rows { display: flex; flex-direction: column; gap: 2px; width: max-content; min-width: 100%; }
/* A level closed: its rows' copies going a little way up and fading, clipped at its foot and above the rows rising after them (designer, 2026-11-08; LayerTreeView). */
.tk-tree-fold { position: absolute; left: 0; overflow: hidden; pointer-events: none; }
.tk-tree-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding-right: 16px;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
.tk-tree-row:hover { background: rgb(237 237 236 / 0.6); }
.tk-tree-row.is-selected { background: var(--tk-field); }
/* The canvas's layers after those off it. */
.tk-tree-row.is-first-on-canvas { margin-top: 4px; }
.tk-tree-row.is-first-on-canvas::after { content: ""; position: absolute; top: -4px; left: 16px; right: 16px; height: 1px; background: var(--tk-border); }
/* An instance's icons purple; its disclosure as every other row's (designer, 2026-11-08). */
.tk-tree-row.is-instance .tk-icon:not(.tk-tree-chevron > .tk-icon) { color: var(--tk-instance); }
.tk-tree-row .tk-icon { flex: none; color: var(--tk-text-muted); }
.tk-tree-name { flex: none; }
.tk-tree-brief { display: flex; margin-left: auto; color: var(--tk-text-muted); }
/* An effect's fold (Properties: FoldButton) is a layer's chevron, as a button (designer, 2026-11-08): the same look from these rules, 28px as the panel's other buttons. */
.tk-fold { all: unset; position: relative; }
.tk-tree-chevron { position: relative; z-index: 1; }
:is(.tk-tree-chevron, .tk-fold) { display: grid; flex: none; place-items: center; width: 22px; height: 22px; border-radius: 6px; }
.tk-fold { width: 28px; height: 28px; }
:is(.tk-tree-chevron[data-open], .tk-fold) { background: #ffffff; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 1px 1.5px rgb(0 0 0 / 0.15); color: #717171; }
:is(.tk-tree-chevron[data-open="false"], .tk-fold[aria-expanded="false"]) .tk-icon { rotate: -90deg; }
.tk-fold:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 1px; }
/* Before an effect's type, 5px from it, as things side by side in a row are: its row's own gap is 2px, the type and its − joined. */
.tk-paint-row > .tk-fold { margin-right: 3px; }
/* A guide: down from the layer this one is in, and in to this one; or down past it, to a later one there. */
.tk-tree-guide { position: absolute; top: -16px; width: 15px; height: 30px; box-sizing: border-box; border-left: 1px solid var(--tk-guide); pointer-events: none; }
.tk-tree-guide.is-in { border-bottom: 1px solid var(--tk-guide); border-bottom-left-radius: 4px; }
.tk-tree-guide.is-in.is-leaf { width: 37px; }
.tk-tree-guide.is-past { top: 14px; height: 16px; }
.tk-tree-guide.is-through { top: -2px; height: 30px; }

.tk-layer-info { display: flex; flex-direction: column; gap: 0; }
/* The layer's name, and at its right the breakpoint worked at, if any (designer, 2026-11-08). */
.tk-layer-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.tk-layer-name {
  display: flex;
  align-self: flex-start;
  min-width: 0;
  align-items: center;
  gap: 4px;
  height: 24px;
  margin: 0;
  padding: 0 8px 0 6px;
  border-radius: 6px;
  background: var(--tk-field);
  font: inherit;
  font-weight: 500;
  letter-spacing: -0.02em;
  max-width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
}
.tk-layer-name > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tk-layer-name .tk-icon { flex: none; color: var(--tk-text-muted); }
.tk-layer-name.is-instance { background: var(--tk-instance-soft); color: var(--tk-instance); }
.tk-layer-name.is-instance .tk-icon { color: inherit; }
/* Rows 24px high, 4px apart, no rules between them; the label 68px wide (designer, 2026-11-07). */
.tk-layer-info dl { display: grid; grid-template-columns: minmax(68px, auto) minmax(0, 1fr); gap: 4px 0; margin: 0; padding: 6px 8px; letter-spacing: -0.02em; }
.tk-layer-info :is(dt, dd) { display: flex; align-items: center; min-height: 24px; }
.tk-layer-info dt { padding-right: 12px; color: var(--tk-text-muted); }
.tk-layer-info dd { justify-content: flex-end; margin: 0; overflow-wrap: anywhere; text-align: right; }
.tk-layer-note { margin: 0; color: var(--tk-text-muted); }
/* The breakpoint the view worked in stands for, and the properties changed there on their own (ADR 0008). */
:is(.tk-breakpoint-badge, .tk-changes) { --tk-breakpoint: #8a38f5; }
@media (prefers-color-scheme: dark) { :is(.tk-breakpoint-badge, .tk-changes) { --tk-breakpoint: #b48aff; } }
/* As the layer's name is shown, in the breakpoint's purple, as an instance's name is in its own (designer, 2026-11-08). */
.tk-breakpoint-badge {
  display: flex;
  flex: none;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tk-breakpoint) 10%, transparent);
  color: var(--tk-breakpoint);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  white-space: nowrap;
}
.tk-change-breakpoint { color: var(--tk-breakpoint); }
.tk-source { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.tk-unlocated { color: var(--tk-text-muted); }

/* A section: its title, 24px high, with a rule to the edge (to its buttons, 4px short of them), then its rows, 4px apart (designer, 2026-11-08). */
.tk-section { margin: 0; padding: 0; border: 0; }
.tk-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  min-height: 24px;
  margin: 0 0 4px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--tk-title);
}
.tk-section-title::after { content: ""; flex: 1; min-width: 8px; height: 1px; background: var(--tk-border); }
.tk-section-header { display: flex; align-items: center; gap: 4px; box-sizing: border-box; height: 24px; margin: 0 0 4px; }
.tk-section-header .tk-section-title { flex: 1; min-height: 0; margin: 0 4px 0 0; padding: 0; }
/* A section's rows 6px apart, one under the next; things side by side in a row, 5px (designer, 2026-11-08). */
.tk-section > * + * { margin-top: 6px; }
.tk-section > :is(.tk-section-title, .tk-section-header) + * { margin-top: 0; }
/* A section with nothing under its title yet (Fill, Stroke): its title alone, 24px. */
.tk-section > :is(.tk-section-title, .tk-section-header):last-child { margin-bottom: 0; }
.tk-row { display: flex; align-items: center; gap: 5px; }
/* A field: 28px high (Figma: 03 Kind, 86:557; designer, 2026-11-08), raised on neutral 50 (--tk-input), its label (an icon or a word) before what it holds. */
/* Its corners 6px, as every field, choice and button in the panel (designer, 2026-11-08). */
.tk-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  min-width: 0;
  height: 28px;
  padding: 0 6px 0 8px;
  border-radius: 6px;
  background: var(--tk-input);
  box-shadow: var(--tk-input-shadow);
}
.tk-field:focus-within { background-color: var(--tk-input-hover); box-shadow: var(--tk-input-focus-shadow); }
/* Hovered, as it can be adjusted, a field darkens; chosen, it has the accent's edge; adjusted, it takes the accent (designer, 2026-11-08). The color eases between them. */
.tk-field, .tk-select, .tk-check { transition: background-color ${FIELD_STATE_MS}ms ease, box-shadow ${FIELD_STATE_MS}ms ease, color ${FIELD_STATE_MS}ms ease; }
/* Adjusted, it takes the accent at once, the click answered; reset, it eases back (designer, 2026-11-08). */
.tk-field.is-changed, .tk-check.is-changed, .tk-select-field.is-changed > .tk-select { transition: none; }
/* Dragged, it stays as it was until let go, then eases into the accent, its words with it (designer, 2026-11-08). */
.is-settling :is(.tk-field.is-changed, .tk-check.is-changed, .tk-select-field.is-changed > .tk-select),
.is-settling .tk-field.is-changed :is(.tk-icon, .tk-glyph, .tk-input, .tk-read-only, .tk-roll):not(.tk-popover *) { transition: background-color ${FIELD_SETTLE_MS}ms ease, color ${FIELD_SETTLE_MS}ms ease; }
@media (hover: hover) and (pointer: fine) {
  .tk-field:not(.is-changed, :focus-within):hover,
  .tk-select:not(:disabled, :focus-visible, [aria-expanded="true"], .tk-gap-mode, .is-changed > *):hover { background-color: var(--tk-input-hover); }
  /* A check, on the panel, takes the ground the buttons beside it take. */
  .tk-check:not(.is-changed):hover { background-color: var(--tk-field); }
}
.tk-field .tk-icon { flex: none; color: var(--tk-text-muted); }
/* Changed in this round (designer, 2026-11-07): the accent, reversed; its reset at its right end. */
.tk-field.is-changed { background: var(--tk-accent); box-shadow: var(--tk-changed-shadow); color: #fafafa; padding-right: 2px; }
/* Not in a picker open from the field: it is inside it, with its own colors. */
.tk-field.is-changed :is(.tk-icon, .tk-glyph, .tk-input, .tk-roll):not(.tk-popover *) { color: #fafafa; }
.tk-field.is-changed:focus-within { background-color: var(--tk-accent); box-shadow: var(--tk-changed-focus-shadow); }
.tk-reset {
  all: unset;
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: inherit;
}
/* In a changed field, 24px, 2px in from its end, on the field's own blue; pointed at, on blue 400 (designer, 2026-11-08). */
.tk-field.is-changed .tk-reset:not(.tk-popover *), .tk-select-field > .tk-reset { width: 24px; height: 24px; border-radius: 4px; background: var(--tk-accent); }
.tk-field.is-changed .tk-reset:not(.tk-popover *):hover, .tk-select-field > .tk-reset:hover { background: var(--tk-accent-on); }
/* At the field's right end, after a gradient's name too. */
.tk-color-field > .tk-reset { margin-left: auto; }
/* A Variable's name, a gradient's, and their buttons, in a changed field: light on the accent too. */
.tk-field.is-changed .tk-read-only:not(.tk-popover *) { color: #fafafa; }
.tk-field.is-changed :is(.tk-variable-chip-name, .tk-icon-button):not(.tk-popover *):hover { background: var(--tk-accent-on); }
.tk-section-header .tk-reset { color: var(--tk-accent); }
.tk-section-header .tk-reset:hover { background: var(--tk-field); }
.tk-reset:focus-visible { outline: 2px solid var(--tk-accent-strong); outline-offset: -2px; }
/*
 * One reset taking several fields back (a size with its sizing, a color with its opacity): a button of the row's own, at its left, outside
 * the fields, which make room for it, 5px from the fields as unjoined things in a row are. It looks as a button that stays on (Wrap, on)
 * does, from the same rules below: 28px as the fields, 6px corners, white on the accent, blue 600 hovered (designer, 2026-11-08).
 */
:is(.tk-size-row, .tk-color-row) > .tk-reset { align-self: center; margin-right: 3px; }
/*
 * A changed field inside a picker (a gradient's angle, a stop): light on the accent, with no reset, keeping its right inset and its width:
 * the color's row has the one reset, for all of it (designer, 2026-11-08).
 */
.tk-popover .tk-field.is-changed :is(.tk-icon, .tk-glyph, .tk-input, .tk-read-only, .tk-roll) { color: #fafafa; }
.tk-popover .tk-field.is-changed { padding-right: 6px; }
/*
 * A shadow's type fills its row up to its −, which stands at the right end, as a blur's does; changed, its reset at its right end
 * (designer, 2026-11-08). With .tk-select-field, so it wins over that rule's flex: none further down: on its own class it lost, and hugged its text.
 */
.tk-select-field.tk-effect-type-field { flex: 1; min-width: 0; }
.tk-select-field.tk-effect-type-field > .tk-select { flex: 1; width: auto; min-width: 0; }
/*
 * Clicked again to go back (Wrap), a toggle has no reset of its own: changed, it is marked in the accent (designer, 2026-11-08).
 * Wrap on is in the accent already; changed to off, its icon in the accent on the accent's tint.
 */
.tk-section .tk-icon-button.is-changed[aria-pressed="false"] { background: var(--tk-accent-soft); color: var(--tk-accent); }
/* Its fields, marked with no reset of their own, keep their right inset; the sizing its width, its chevron where it was. */
:is(.tk-size-row .tk-field:not(.tk-variable-chip), .tk-color-row > .tk-color-field).is-changed:not(.tk-popover *) { padding-right: 6px; }
.tk-size-row > .tk-select-field.is-changed > .tk-select { width: 64px; padding-right: 24px; background-position: right 6px center; }
.tk-scrub, .tk-scrub-grip {
  display: grid;
  flex: none;
  place-items: center;
  align-self: stretch;
  cursor: ew-resize;
  touch-action: none;
}
.tk-input {
  all: unset;
  flex: 1;
  min-width: 0;
  height: 100%;
  font: inherit;
  color: var(--tk-text);
  cursor: default;
}
.tk-input:focus { cursor: text; }
/* A number: its figures all as wide, so a digit rolling in takes the room the one before had (designer, 2026-11-08). */
.tk-input.tk-number { font-variant-numeric: tabular-nums; }
/*
 * A number rolling (DigitRoll; designer, 2026-11-08): its digits over its own text, in the same type and place, the input's text clear
 * beneath; the overlay goes once they settle, or as the field is focused. Placed by DigitRoll, over the input, from the field's own box.
 */
.tk-input.is-rolled { -webkit-text-fill-color: transparent; }
.tk-field:has(> .tk-roll) { position: relative; }
.tk-roll {
  position: absolute;
  display: flex;
  align-items: center;
  font: inherit;
  font-variant-numeric: tabular-nums;
  white-space: pre;
  color: var(--tk-text);
  pointer-events: none;
}
.tk-roll-cell { position: relative; display: flex; }
.tk-roll-glyph { display: block; }
/* Rolling out, over the digit rolling in, in the same place. */
.tk-roll-glyph.is-leaving { position: absolute; top: 0; left: 0; }
.tk-textarea {
  all: unset;
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--tk-input);
  color: var(--tk-text);
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: var(--tk-input-shadow);
}
.tk-textarea:focus { background-color: var(--tk-input-hover); box-shadow: var(--tk-input-focus-shadow); cursor: text; }
.tk-textarea::placeholder { color: var(--tk-text-muted); }
/* A color, as the designer drew it (2026-11-07): its swatch 5.5px in from the field's edge (designer, 2026-11-08), its hex, then its opacity in a field of its own joined to it. */
.tk-color-row { display: flex; flex: 1; gap: 2px; min-width: 0; }
.tk-color-field { padding-left: 5.5px; }
.tk-color-field.is-joined { border-radius: 6px 2px 2px 6px; }
.tk-color-opacity { flex: none; width: 64px; border-radius: 2px 6px 6px 2px; }
/*
 * Every number that can be dragged: a short upright bar at its right end, dragged left and right as its icon is; changed, just left of its
 * reset (designer, 2026-11-08). Its 12px reach takes 4px of the gap before it and of the inset after it, so the value keeps its room.
 */
.tk-scrub-grip { width: 12px; margin: 0 -4px; }
/* Before a reset, just left of it: the bar 7px from it. */
.tk-scrub-grip:has(+ .tk-reset) { margin-right: -6px; }
/* Changed, an opacity keeps its right inset: it has no reset of its own, so its bar stays where it was. */
.tk-field.is-changed.tk-color-opacity { padding-right: 6px; }
/* Swaying left and right as it is dragged, the whole bar, upright, set on it directly (Scrub; designer, 2026-11-08). */
.tk-grip { width: 2px; height: 12px; border-radius: 1px; background: currentColor; opacity: 0.3; }
.tk-scrub-grip:hover > .tk-grip, .tk-field[data-scrubbing] .tk-grip { opacity: 0.6; }
/* On the accent, white: brighter, as white at 0.3 is lost on blue (designer, 2026-11-08: "white-ish"; 0.55 and 0.85 are the agent's, to confirm). */
.tk-field.is-changed .tk-grip:not(.tk-popover *) { opacity: 0.55; }
.tk-field.is-changed:is(:has(> .tk-scrub-grip:hover), [data-scrubbing]) .tk-grip:not(.tk-popover *) { opacity: 0.85; }
/* Dragged on its icon, label or grip, a field is the one chosen: the hover's darker ground and the 1px accent edge it has focused, till let go (designer, 2026-11-08). */
.tk-field[data-scrubbing] { box-shadow: var(--tk-input-focus-shadow); }
.tk-field[data-scrubbing]:not(.is-changed) { background-color: var(--tk-input-hover); }
.tk-field.is-changed[data-scrubbing] { box-shadow: var(--tk-changed-focus-shadow); }
/* A paint's row: its field, then its remove button, 2px apart. */
.tk-row.tk-paint-row { gap: 2px; }
/* 17px with its 0.5px line, 5.5px in from the field's top, bottom and left (designer, 2026-11-08). */
.tk-swatch {
  flex: none;
  width: 17px;
  height: 17px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  box-shadow: inset 0 0 0 0.5px #a0a19f;
  cursor: default;
}
.tk-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.tk-swatch::-webkit-color-swatch { border: 0; border-radius: 4px; }
.tk-swatch::-moz-color-swatch { border: 0; border-radius: 4px; }
.tk-section-header .tk-row { gap: 2px; }
.tk-subtitle { color: var(--tk-text-muted); font-weight: 400; }
/* A heading inside a section or popover (Stops, Project, Tailwind): small and quiet, no rule. */
.tk-section-title.tk-subtitle { min-height: 0; margin: 4px 0 2px; padding: 0; font-size: 11px; font-weight: 500; letter-spacing: -0.02em; color: var(--tk-text-muted); }
.tk-section-title.tk-subtitle::after { display: none; }
.tk-section-header:has(> .tk-subtitle) { height: 24px; padding: 0; }
.tk-read-only { color: var(--tk-text-muted); }
.tk-stop-position { flex: none; width: 48px; }
/* Several effects: a rule between them, 4px either side; an effect's own rows 4px apart (designer, 2026-11-08). */
/* Positioned: its details' copies fold up over it (Properties: EffectsSection). */
.tk-effect { position: relative; }
.tk-effect > * + * { margin-top: 4px; }
/* An effect's details folded away, copied as they were: they go up and fade, shown only above the rows rising after them (designer, 2026-11-08). */
.tk-effect-fold { position: absolute; left: 0; margin: 0; overflow: hidden; pointer-events: none; }
.tk-effect + .tk-effect { padding-top: 4px; border-top: 1px solid var(--tk-border); }
.tk-select.tk-effect-type { flex: 1; width: auto; min-width: 0; }
/* A see-through color shows over a checkerboard, as in Figma. */
.tk-gradient-bar, .tk-gradient-swatch {
  --tk-checker: repeating-conic-gradient(#e5e5e4 0% 25%, #ffffff 0% 50%) 0 0 / 8px 8px;
}
.tk-gradient-bar {
  position: relative;
  height: 24px;
  /* Room around it past its handles, 2px over it each way. */
  margin: 4px 6px;
  border-radius: 6px;
  background: var(--tk-gradient), var(--tk-checker);
  box-shadow: inset 0 0 0 0.5px var(--tk-border);
  cursor: copy;
}
.tk-stop-handle {
  position: absolute;
  top: 50%;
  box-sizing: border-box;
  width: 12px;
  height: 28px;
  border: 2px solid #ffffff;
  border-radius: 4px;
  background: linear-gradient(var(--tk-stop), var(--tk-stop)), var(--tk-checker);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.2), 0 1px 3px rgb(0 0 0 / 0.2);
  transform: translate(-50%, -50%);
  cursor: ew-resize;
  touch-action: none;
}
.tk-stop-handle:focus-visible, .tk-stop-handle:focus { outline: none; border-color: var(--tk-accent); }
.tk-gradient-swatch {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px #a0a19f;
}
.tk-icon-button {
  all: unset;
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--tk-text);
}
.tk-icon-button:hover { background: var(--tk-field); }
.tk-icon-button:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
/* A button that stays on in the panel (Independent corners, Wrap): the accent, as the tool chosen is (designer, 2026-11-07); a row's reset as it (designer, 2026-11-08). */
.tk-section .tk-icon-button[aria-pressed="true"], :is(.tk-size-row, .tk-color-row) > .tk-reset { background: var(--tk-accent); color: #ffffff; }
.tk-section .tk-icon-button[aria-pressed="true"]:hover, :is(.tk-size-row, .tk-color-row) > .tk-reset:hover { background: var(--tk-accent-strong); }
/* An item added in this round (a shadow, a fill, a Stack): its − alone marked, as a button that stays on (designer, 2026-11-08). */
.tk-icon-button.is-added { background: var(--tk-accent); color: #ffffff; }
.tk-icon-button.is-added:hover { background: var(--tk-accent-strong); }
/* A row's own button beside its fields (Independent corners, Wrap, a row's reset): as tall as they. */
.tk-row > .tk-icon-button, .tk-grid-2 > .tk-icon-button, :is(.tk-size-row, .tk-color-row) > .tk-reset { width: 28px; height: 28px; border-radius: 6px; }
.tk-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 5px;
}
/* A field's word label (Width, X, Blur): 32px wide at least, at its start (designer, 2026-11-08); a long one (Blur, Spread) at 9px. */
/* By a Variable's name too, as the field had it (designer, 2026-11-08). */
:is(.tk-scrub, .tk-variable-chip) > .tk-glyph { min-width: 32px; place-items: center start; }
:is(.tk-scrub, .tk-variable-chip) > .tk-glyph.is-small { font-size: 9px; letter-spacing: -0.02em; }
.tk-glyph {
  display: grid;
  place-items: center;
  min-width: 14px;
  color: var(--tk-text-muted);
  font-weight: 500;
  letter-spacing: -0.02em;
}
.tk-mixed { color: var(--tk-text-muted); }
.tk-size-row .tk-field { flex: 1; }
.tk-size-row { gap: 2px; }
/* The size and its sizing, joined: 2px corners where they meet, as a color and its opacity (designer, 2026-11-07). */
.tk-size-row > .tk-variable-slot > .tk-field { border-radius: 6px 2px 2px 6px; }
.tk-size-row > .tk-select-field { border-radius: 2px 6px 6px 2px; }
/* Parts side by side as one control (a stroke's weight, style and sides): 2px apart, 2px corners where they meet, 8px at the ends. */
.tk-row.tk-joined { gap: 2px; }
.tk-joined > :is(.tk-field, .tk-select, .tk-select-field) { border-radius: 2px; }
.tk-joined > :first-child { border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
.tk-joined > :is(.tk-select:last-of-type, .tk-select-field:last-child) { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }
/* A choice of part of a value (a stroke's line, its sides): changed in this round, in the accent with its reset at the right end, after the chevron, as a changed field (designer, 2026-11-07). */
/*
 * Its select takes the wrapper's corners, so the wrapper has a select's own 6px: without them, a choice on its own (the font, its weight)
 * came out square (designer, 2026-11-08). Where it is joined (the size's sizing, a stroke's parts), the joined corners above win.
 */
.tk-select-field { position: relative; display: flex; flex: none; border-radius: 6px; }
.tk-select-field > .tk-select { border-radius: inherit; }
.tk-select-field.is-changed > .tk-select {
  --tk-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23fafafa' stroke-width='1.67' stroke-linecap='round' stroke-linejoin='round' d='M12.25 5.875L8 10.125L3.75 5.875'/%3E%3C/svg%3E");
  width: 96px;
  padding-right: 48px;
  background-position: right 32px center;
  background-color: var(--tk-accent);
  box-shadow: var(--tk-changed-shadow);
  color: #fafafa;
}
.tk-select-field.is-changed > .tk-select:is([aria-expanded="true"], :focus-visible) { background-color: var(--tk-accent); box-shadow: var(--tk-changed-focus-shadow); }
.tk-select-field > .tk-reset { position: absolute; top: 2px; right: 2px; color: #fafafa; }
/* A choice: the select, with a chevron of its own (IconMCP's, its line as wide as the icons' at 12px); its options open in the menu below. */
.tk-select {
  --tk-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23737472' stroke-width='1.67' stroke-linecap='round' stroke-linejoin='round' d='M12.25 5.875L8 10.125L3.75 5.875'/%3E%3C/svg%3E");
  flex: none;
  box-sizing: border-box;
  width: 72px;
  height: 28px;
  padding: 0 24px 0 8px;
  border: 0;
  border-radius: 6px;
  background: var(--tk-chevron) no-repeat right 6px center / 12px 12px, var(--tk-input);
  box-shadow: var(--tk-input-shadow);
  color: var(--tk-text);
  font: inherit;
  text-align: left;
  text-overflow: ellipsis;
  appearance: none;
}
@media (prefers-color-scheme: dark) {
  .tk-select { --tk-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23a6a6a6' stroke-width='1.67' stroke-linecap='round' stroke-linejoin='round' d='M12.25 5.875L8 10.125L3.75 5.875'/%3E%3C/svg%3E"); }
}
.tk-select[aria-expanded="true"], .tk-select:focus-visible { background-color: var(--tk-input-hover); box-shadow: var(--tk-input-focus-shadow); outline: none; }
/* Inside the gap's field, at its end: its chevron alone, which chooses a number or Auto. */
.tk-select.tk-gap-mode { width: 20px; height: 20px; margin-left: auto; padding: 0; background: var(--tk-chevron) no-repeat center / 12px 12px; box-shadow: none; color: transparent; }
.tk-field.is-changed .tk-select.tk-gap-mode { filter: brightness(0) invert(1); }
.tk-auto { display: flex; align-items: center; }
/* A field's own button at its end (Min and max): 24px, on the field. */
.tk-field > .tk-field-action { margin-left: auto; margin-right: -4px; color: var(--tk-text-muted); }
.tk-field > .tk-field-action:hover { background: var(--tk-button); color: var(--tk-text); }
/* Shown while the field is hovered or focused, or its menu open (designer, 2026-11-07). */
.tk-field > .tk-field-action { opacity: 0; }
.tk-field:is(:hover, :focus-within) > .tk-field-action, .tk-field > .tk-field-action[aria-expanded="true"] { opacity: 1; }
/* How a layer is sized, quieter than its size (designer, 2026-11-07). */
.tk-size-row .tk-select { width: 64px; color: var(--tk-text-muted); font-weight: 500; letter-spacing: -0.02em; }
/* The options of a select, light as the Variables' popover, the one chosen over the select. */
.tk-menu {
  position: fixed;
  z-index: 3;
  box-sizing: border-box;
  max-height: var(--tk-menu-room, calc(100vh - 16px));
  overflow-y: auto;
  padding: 4px;
  border-radius: 12px;
  background: var(--tk-panel);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  color: var(--tk-text);
}
.tk-menu-option {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px 0 24px;
  border-radius: 8px;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
.tk-menu-option.is-active { background: var(--tk-field); }
.tk-menu-option[aria-disabled="true"] { color: var(--tk-text-muted); opacity: 0.6; }
.tk-menu-option .tk-icon { position: absolute; left: 6px; --tk-icon-size: 11px; }
/* A button's menu: no check marks, so no column for them; its choices under headings, a Variable's with its swatch. */
.tk-menu-list { outline: none; }
.tk-menu.is-plain .tk-menu-option { gap: 8px; padding-left: 8px; }
.tk-menu-heading { margin-top: 4px; padding: 8px 8px 4px; border-top: 1px solid var(--tk-border); color: var(--tk-text-muted); font-weight: 500; }
/* Two panels side by side, as Effects' + has its types, nearer the button, and to their left its shadow Variables: each a menu's
   panel of its own, 8px apart, tops aligned under the button, each scrolling on its own when long (designer, 2026-11-08). */
.tk-menu.is-split { padding: 0; overflow: visible; background: none; box-shadow: none; }
.tk-menu-list.is-columns { display: flex; align-items: flex-start; gap: 8px; }
/* Over its button, their feet level, by the button. */
.tk-menu.is-above .tk-menu-list.is-columns { align-items: flex-end; }
.tk-menu-column {
  box-sizing: border-box;
  /* At most 400px however tall the window, a long one scrolling: one as tall as the window looked out of place (designer, 2026-11-08). */
  max-height: min(var(--tk-menu-room, calc(100vh - 16px)), 400px);
  overflow-y: auto;
  padding: 4px;
  border-radius: 12px;
  background: var(--tk-panel);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
}
.tk-menu-column > .tk-menu-heading:first-child { margin-top: 0; border-top: 0; }
/* A segmented control: its choices on neutral 150, the one chosen raised on neutral 50. */
.tk-segmented-field {
  display: flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--tk-field);
}
.tk-segmented-field .tk-icon-button { width: 24px; height: 24px; border-radius: 4px; color: var(--tk-text-muted); }
.tk-segmented-field .tk-icon-button:hover { background: none; color: var(--tk-text); }
.tk-segmented-field .tk-icon-button[aria-checked="true"] { color: var(--tk-text); background: var(--tk-raised); box-shadow: var(--tk-chosen-shadow); }
/*
 * Changed in this round, the one chosen stays raised and white; the track behind the buttons takes the accent, the others' glyphs light on
 * it (white on blue 500 is 3.4:1), a light tint under one hovered; the group's reset pops out inside it at its right end, 24px on blue 400
 * as a changed field's, the group as wide as its buttons and the reset (designer, 2026-11-08).
 */
.tk-segmented-field.is-changed { background: var(--tk-accent); }
.tk-segmented-field.is-changed .tk-icon-button:not([aria-checked="true"]) { color: #fafafa; }
.tk-segmented-field.is-changed .tk-icon-button:not([aria-checked="true"]):hover { background: rgb(255 255 255 / 0.16); }
/* Clicked, the accent at once, the click answered; taken back (its reset, undo), it eases back to the track's grey, as a check does. */
.tk-segmented-field, .tk-segmented-field .tk-icon-button { transition: background-color ${FIELD_STATE_MS}ms ${EASE_OUT}, color ${FIELD_STATE_MS}ms ${EASE_OUT}; }
.tk-segmented-field.is-changed, .tk-segmented-field.is-changed .tk-icon-button { transition: none; }
.tk-segmented-field > .tk-reset { width: 24px; height: 24px; border-radius: 4px; background: var(--tk-accent); color: #fafafa; }
.tk-segmented-field > .tk-reset:hover { background: var(--tk-accent-on); }
/*
 * The reset coming: from 90% at its left, where it grows out of the buttons, and transparent; going: it fades where it is. Changed by a key,
 * it is there at once; with reduced motion, it only fades (designer, 2026-11-08).
 */
.tk-segmented-field > .tk-reset { transform-origin: left center; transition: opacity ${RESET_POP_MS}ms ${EASE_OUT}, transform ${RESET_POP_MS}ms ${EASE_OUT}; }
@starting-style { .tk-segmented-field > .tk-reset { opacity: 0; transform: scale(0.9); } }
.tk-segmented-field.is-leaving > .tk-reset { opacity: 0; pointer-events: none; }
.tk-segmented-field[data-keyed] > .tk-reset { transition: none; }
@media (prefers-reduced-motion: reduce) {
  @starting-style { .tk-segmented-field > .tk-reset { transform: none; } }
}
/* On a row of its own (a text's alignment): as wide as its buttons, at the left, not the row's width (designer, 2026-11-08). */
.tk-segmented-field.tk-hug { width: fit-content; }
.tk-select.tk-font, .tk-grid-2 > .tk-select { width: 100%; }
/* A choice as wide as its place (a font, a font's weight): changed, too, its reset at its right end (designer, 2026-11-08). */
.tk-select-field:is(.tk-font-field, .tk-wide) { flex: 1; min-width: 0; }
.tk-select-field:is(.tk-font-field, .tk-wide) > .tk-select { width: 100%; }
/* The font: "Aa" in it at its left, where a field has its icon, its name after, where a field's words are (designer, 2026-11-08). */
.tk-font-field > .tk-select { padding-left: 32px; }
.tk-font-sample {
  flex: none;
  width: 16px;
  color: var(--tk-text-muted);
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}
.tk-font-field > .tk-font-sample { position: absolute; z-index: 1; top: 50%; left: 8px; transform: translateY(-50%); pointer-events: none; }
.tk-font-field.is-changed > .tk-font-sample { color: #fafafa; }
/* In the font's menu, each font's "Aa" before its name, where the select has it. */
.tk-menu-option > .tk-font-sample { margin-right: 8px; }
.tk-text-glyph { font-size: 11px; font-weight: 500; }
.tk-text-glyph.tk-underline { text-decoration: underline; }
.tk-text-glyph.tk-strikethrough { text-decoration: line-through; }
/* A Stack's alignment, at the left of its rows, as large as the two rows beside it. */
/* Half the row each, the grid and the column beside it, in line with the padding fields' two columns below (designer, 2026-11-08). */
.tk-align-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 5px; }
.tk-align {
  position: relative;
  display: grid;
  /* Each point the whole of its third, across and down, to click on. The outer lines, at a sixth and five sixths, sat too far out: they come back half that way, to 5/24 and 19/24; the middle ones stay at half (designer, 2026-11-08). */
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  box-sizing: border-box;
  min-width: 0;
  min-height: 62px;
  border-radius: 6px;
  background: var(--tk-input);
  box-shadow: var(--tk-input-shadow);
}
/* The lines, 0.5px, 6px in from the field's edges. Inside that box 5/24 of the field is 5/24 of the box less 3.5px; 19/24, 19/24 of it and 3.5px. */
.tk-align::before {
  content: "";
  position: absolute;
  inset: 6px;
  --tk-line: linear-gradient(var(--tk-border), var(--tk-border));
  background:
    var(--tk-line) calc(500% / 24 - 3.5px) 0 / 0.5px 100% no-repeat,
    var(--tk-line) 50% 0 / 0.5px 100% no-repeat,
    var(--tk-line) calc(1900% / 24 + 3.5px) 0 / 0.5px 100% no-repeat,
    var(--tk-line) 0 calc(500% / 24 - 3.5px) / 100% 0.5px no-repeat,
    var(--tk-line) 0 50% / 100% 0.5px no-repeat,
    var(--tk-line) 0 calc(1900% / 24 + 3.5px) / 100% 0.5px no-repeat;
  pointer-events: none;
}
.tk-align-point {
  all: unset;
  position: relative;
  display: grid;
  place-items: center;
}
.tk-align-point::before {
  content: "";
  position: relative;
  width: 8px;
  height: 4px;
  border-radius: 1px;
  background: var(--tk-border);
}
/* Each mark where its lines cross, not at its third's middle: an outer third's mark a 24th of the grid, an eighth of the third, toward the middle (designer, 2026-11-08). */
.tk-align-point:nth-child(3n + 1)::before { left: 12.5%; }
.tk-align-point:nth-child(3n)::before { left: -12.5%; }
.tk-align-point:nth-child(-n + 3)::before { top: 12.5%; }
.tk-align-point:nth-child(n + 7)::before { top: -12.5%; }
.tk-align-point:hover::before { background: #a0a19f; }
/* Where it was before this round's change: a larger dash, muted (designer, 2026-11-08). */
.tk-align-point.is-before::before { width: 12px; height: 6px; border-radius: 2px; background: #a0a19f; }
/* The point chosen: dark, as a check ticked, till it changes in this round; then the accent (designer, 2026-11-08). */
.tk-align-point[aria-checked="true"]::before { width: 24px; height: 12px; border-radius: 4px; background: #262625; box-shadow: 0 1px 1.5px rgb(0 0 0 / 0.25); }
/* Its blue edge 1px, as every selected edge: 0.5px was hard to see (designer, 2026-11-08). */
.tk-align.is-changed .tk-align-point[aria-checked="true"]::before { background: var(--tk-accent); box-shadow: inset 0 0 0 1px var(--tk-accent-on), 0 1px 1.5px rgb(13 153 255 / 0.4); }
.tk-align-point:focus-visible { outline: 1px solid var(--tk-accent); }
.tk-align-options { display: grid; min-width: 0; gap: 6px; align-content: start; }
/* A check: its box, then its words, on the panel (designer, 2026-11-08). Half a row, beside a field or another check; alone in its row, the whole of it. */
.tk-grid-2 > .tk-check:last-child:nth-child(odd) { grid-column: 1 / -1; }
.tk-check {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 28px;
  /* Its 16px box 6px in from the left, as from the top and bottom of its 28px row (designer, 2026-11-08). */
  padding: 0 6px;
  border-radius: 6px;
  color: var(--tk-text-muted);
  font-weight: 500;
  letter-spacing: -0.02em;
}
/* Its box, as the designer drew its states (2026-11-07): 16px (designer, 2026-11-08), its check 13px, no line round it; a faint check on neutral 200 when off, a light one on neutral 800 when on. */
.tk-check input {
  --tk-check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='%23a0a19f' stroke-width='1.25' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.40625 7.4375L5.46875 10.5L11.5938 3.9375'/%3E%3C/svg%3E");
  appearance: none;
  flex: none;
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 0;
  border-radius: 4px;
  background: var(--tk-check) no-repeat center / 13px 13px, #e5e5e4;
}
.tk-check input:checked {
  --tk-check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='%23e5e5e4' stroke-width='1.25' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.40625 7.4375L5.46875 10.5L11.5938 3.9375'/%3E%3C/svg%3E");
  background-color: #262625;
}
.tk-check input:indeterminate { background: #e5e5e4; }
/* Changed, in the accent; checked again to go back, it has no reset of its own (designer, 2026-11-08). */
.tk-check.is-changed { background: var(--tk-accent); color: #fafafa; }
.tk-check input:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 1px; }

.tk-viewport {
  position: relative;
  overflow: hidden;
  outline: none;
  touch-action: none;
  /* Clicks here select layers, never the page's text. */
  user-select: none;
  -webkit-user-select: none;
  background: var(--tk-canvas);
}
.tk-viewport.is-pan-ready { cursor: grab; }
.tk-viewport.is-drawing { cursor: crosshair; }
.tk-viewport-message {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: var(--tk-text-muted);
}
.tk-viewport.is-panning { cursor: grabbing; }
/*
 * While the page shrinks into the canvas or grows back, it is drawn above all of the shell, the tools, the Layers'
 * chevrons and any menu open (z-index up to 3) too, so nothing of the editor shows on it (designer, 2026-11-08): the
 * panels move with its edges, but the tools and the toasts are over the canvas, and a panel the frame starts under
 * stays under it. Its own gray goes meanwhile, the shell's showing instead: drawn above them, it hid the tools from
 * the first frame of the move, as they still sat over the canvas.
 */
.tk-viewport.is-travelling { overflow: visible; z-index: 4; background: transparent; }
.tk-stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.tk-canvas {
  display: block;
  border: 0;
  /* Page background stays the page's own, not the shell's. */
  color-scheme: normal;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06), 0 2px 12px rgb(0 0 0 / 0.08);
  /* The interaction layer above the canvas will take all pointer input. */
  pointer-events: none;
}
/* The views beside the desktop view, on the stage to its right. */
.tk-canvas.is-beside { position: absolute; top: 0; }
/* The layers off the canvas (ADR 0009), where they were left on the stage, each as it looks, on nothing of its own. */
.tk-off-canvas-layers { position: absolute; top: 0; left: 0; }
.tk-off-canvas {
  position: absolute;
  display: block;
  border: 0;
  color-scheme: normal;
  background: transparent;
  pointer-events: none;
}
.tk-off-canvas[hidden] { display: none; }
/* Above each view, as a Frame's name in Figma: its name and the widths it covers; full screen and × at its right end. */
.tk-view-label {
  position: absolute;
  display: flex;
  align-items: center;
  /* Its buttons at its right end, its name and widths taking up the room before them, or gone. */
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  height: 20px;
  overflow: hidden;
  color: var(--tk-text-muted);
  white-space: nowrap;
}
/* Its name and widths: a button selecting the page in the view (designer, 2026-11-08). */
.tk-view-title { display: flex; flex: 0 1 auto; align-items: center; gap: 6px; min-width: 0; margin-right: auto; height: 20px; padding: 0; border: 0; border-radius: 4px; background: none; font: inherit; color: inherit; cursor: default; }
.tk-view-title:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 1px; }
.tk-view-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--tk-text); font-weight: 500; }
/*
 * Where there is too little room, what goes (ViewLabel): at rest, and pointed at or focused in (designer, 2026-11-08). Out of sight
 * but still there to be focused, as full screen is again once played: focused, the label is as pointed at, and shows it.
 */
.tk-view-label:not(:hover, :focus-within) .is-rest-hidden, .tk-view-label:is(:hover, :focus-within) .is-pointed-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  opacity: 0;
  pointer-events: none;
}
.tk-view-range { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.tk-view-play, .tk-view-delete { flex: none; width: 20px; height: 20px; }
.tk-add-view { position: absolute; display: flex; height: 20px; align-items: center; }
.tk-add-view .tk-icon-button { width: 20px; height: 20px; }
.tk-add-view-width {
  all: unset;
  box-sizing: border-box;
  width: 72px;
  height: 20px;
  padding: 0 6px;
  border-radius: 5px;
  background: var(--tk-panel);
  box-shadow: 0 0 0 1px var(--tk-accent);
  color: var(--tk-text);
}
.tk-add-view-width[aria-invalid] { box-shadow: 0 0 0 1px var(--tk-danger, #f24822); }

.tk-selection, .tk-hover {
  --tk-selection: var(--tk-accent);
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--tk-selection);
  pointer-events: none;
}
/* Gone at once while a value changes; fades back once it settles. */
.tk-selection { transition: opacity 150ms ${EASE_OUT}; }
.tk-selection[data-hidden] { opacity: 0; transition: none; }
:is(.tk-selection, .tk-hover)[data-kind="instance"] { --tk-selection: var(--tk-instance); }
:is(.tk-selection, .tk-hover)[data-kind="locked"] { --tk-selection: var(--tk-locked); }
/* Beside a new Frame selected: its brief, a button that opens a field. */
.tk-brief { position: absolute; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.tk-brief-button {
  all: unset;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px 0 4px;
  border-radius: 6px;
  background: var(--tk-accent);
  color: #fff;
  font-weight: 500;
  white-space: nowrap;
  cursor: default;
}
.tk-brief-button:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 2px; }
.tk-brief-text { width: 220px; min-height: 72px; background: var(--tk-panel); box-shadow: 0 0 0 1px var(--tk-border), 0 4px 12px rgb(0 0 0 / 0.12); }
/*
 * On the top right of the layer selected alone, above it and clear of its brief's mark: the selection toolbar,
 * its buttons in one row, its right edge on the layer's. Its buttons look as the brief button does.
 */
.tk-selection-toolbar {
  position: absolute;
  display: flex;
  gap: 4px;
  transform: translate(-100%, calc(-100% - 12px));
}
.tk-selection-tool {
  all: unset;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px 0 4px;
  border-radius: 6px;
  background: var(--tk-instance);
  color: #fff;
  font-weight: 500;
  white-space: nowrap;
  cursor: default;
}
.tk-selection-tool:focus-visible { outline: 2px solid var(--tk-instance); outline-offset: 2px; }
/* On a layer with a brief, in every view: the brief button's mark, small, centered on its top right corner. */
.tk-brief-mark {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 5px;
  background: var(--tk-accent);
  color: #fff;
  box-shadow: 0 0 0 1px #fff;
  pointer-events: none;
}
.tk-brief-mark svg { width: 12px; height: 12px; }

/* Typing in text, as in Figma: a thin blue box round the words, which grows as they do. */
.tk-selection[data-kind="typing"] { transition: none; }
.tk-selection-lock {
  position: absolute;
  bottom: 100%;
  left: -1px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  border-radius: 2px;
  background: var(--tk-selection);
  color: #fff;
}

/*
 * The handles of the layer selected alone, as Figma has them: white squares on the corners, the edges' unseen
 * but for the cursor. The square is larger to press than it looks.
 */
.tk-handles { --tk-selection: var(--tk-accent); }
.tk-handles[data-kind="instance"] { --tk-selection: var(--tk-instance); }
.tk-handles[data-kind="locked"] { --tk-selection: var(--tk-locked); }
.tk-handle { position: absolute; box-sizing: border-box; pointer-events: auto; touch-action: none; }
.tk-handle[data-corner] { border: 1px solid var(--tk-selection); background: #fff; }
.tk-handles:not([data-small]) .tk-handle[data-corner]::before { content: ""; position: absolute; inset: -3px; }
/* In the views other than the one worked in, the selection lighter, its handles' squares white still (designer, 2026-11-09). */
.tk-selection[data-away] { border-color: color-mix(in srgb, var(--tk-selection) 40%, transparent); }
.tk-handles[data-away] .tk-handle[data-corner] { border-color: color-mix(in srgb, var(--tk-selection) 40%, #fff); }
/* A gradient's handles on the layer, while its fill's picker is open: drawn by the editor layer alone. */
.tk-gradient-handles { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.tk-gradient-handles g { pointer-events: all; touch-action: none; }
.tk-gradient-line, .tk-gradient-shape { fill: none; stroke: #ffffff; stroke-width: 1.5; filter: drop-shadow(0 0 1px rgb(0 0 0 / 0.6)); }
.tk-gradient-shape { stroke-dasharray: 4 3; }
.tk-gradient-knob :is(circle, rect):last-child { fill: #ffffff; stroke: rgb(0 0 0 / 0.35); stroke-width: 1; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.25)); }
.tk-gradient-stop rect { stroke: #ffffff; stroke-width: 2; filter: drop-shadow(0 0 1px rgb(0 0 0 / 0.5)) drop-shadow(0 1px 2px rgb(0 0 0 / 0.2)); }
/* Below the layer being resized: its size. */
.tk-size-label {
  position: absolute;
  transform: translateX(-50%);
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--tk-accent);
  color: #fff;
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

/* Dragging: where the layer would go in a Stack, and loose text, which has no element to move, following the pointer. */
.tk-drop-line {
  position: absolute;
  border-radius: 1px;
  background: var(--tk-accent);
  pointer-events: none;
}
.tk-drag-ghost {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--tk-accent);
  background: var(--tk-accent-soft);
  pointer-events: none;
}

/* Variables, as in Figma: a button beside a field lists them; a field set to one shows its name. */
.tk-variable-slot {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.tk-variable-slot > .tk-field { min-width: 0; }
/* A field with no Variables to offer (yet): laid out as if it were where its slot is, so the slot stays around it as they come in. */
.tk-variable-slot.is-alone { display: contents; }
.tk-variable-chip { gap: 4px; padding-right: 0; }
/* Its detach and its reset side by side, with no room between (designer, 2026-11-08). */
.tk-variable-chip > .tk-icon-button + .tk-reset { margin-left: -4px; }
.tk-variable-chip-name {
  all: unset;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
  border-radius: 3px;
  line-height: 18px;
  cursor: default;
}
/* The name as the field's own words, with no box of its own (designer, 2026-11-05); pointed at, it shows it opens the Variables. */
.tk-variable-chip-name:hover { background: rgb(0 0 0 / 0.06); }
@media (prefers-color-scheme: dark) { .tk-variable-chip-name:hover { background: rgb(255 255 255 / 0.08); } }
.tk-variable-chip-name:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
/* A Variable close to the value typed: its name at the end of the field, quieter than a Variable's own. */
.tk-variable-hint {
  all: unset;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px var(--tk-border);
  color: var(--tk-text-muted);
  font-size: 10px;
  line-height: 16px;
  cursor: default;
}
.tk-variable-hint:hover { background: var(--tk-panel); color: var(--tk-text); }
.tk-variable-hint:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
.tk-field.is-changed .tk-variable-hint:not(.tk-popover *) { box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.5); color: #fafafa; }
.tk-field.is-changed .tk-variable-hint:not(.tk-popover *):hover { background: var(--tk-accent-on); }
/* The Variables whose names have what is typed: a list under the field. */
.tk-matches {
  position: fixed;
  z-index: 2;
  box-sizing: border-box;
  max-height: 224px;
  overflow: auto;
  padding: 4px;
  border-radius: 8px;
  background: var(--tk-panel);
  box-shadow:
    inset 0 0 0 1px var(--tk-border),
    0 1px 2px rgb(0 0 0 / 0.12),
    0 8px 24px rgb(0 0 0 / 0.16);
  color: var(--tk-text);
}
.tk-swatch-button {
  display: block;
  background: var(--tk-swatch);
}
.tk-swatch-button:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 1px; }
/* A color pointed at, wherever one is chosen: a white line inside it and a darker one round it, as the Variants tab's swatches have;
   in a color's field, pointing anywhere on the field does it, not over its open picker (designer, 2026-11-08). */
.tk-swatch-button:hover,
.tk-color-field:hover:not(:has(.tk-popover:hover)) > .tk-swatch-button,
.tk-variants-named-item:hover > .tk-variants-named-swatch,
.tk-variants-named-item:focus-visible > .tk-variants-named-swatch,
.tk-variable-option:hover > .tk-variable-preview:not(.is-shadow) { box-shadow: inset 0 0 0 1.5px #fff, 0 0 0 1px rgb(0 0 0 / 0.35); }
.tk-mixed-swatch { background: repeating-conic-gradient(#e6e6e6 0% 25%, #ffffff 0% 50%) 0 0 / 8px 8px; }

/* The color picker's own, as in Figma: a square of saturation and brightness, bars of hue and opacity, the color typed. */
.tk-color-panel {
  --tk-checker: repeating-conic-gradient(#e6e6e6 0% 25%, #ffffff 0% 50%) 0 0 / 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.tk-color-panel > * { flex: none; }
.tk-color-panel > .tk-color-area {
  position: relative;
  flex: 0 1 160px;
  min-height: 80px;
  cursor: crosshair;
  touch-action: none;
  outline: none;
}
/* Its corners rounded on what it shows only: pressed right in a corner, it still takes the corner's color. */
.tk-color-area::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, var(--tk-hue));
}
.tk-color-thumb {
  position: absolute;
  top: 50%;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: var(--tk-thumb);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.2), 0 1px 3px rgb(0 0 0 / 0.25);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.tk-color-area:focus-visible .tk-color-thumb, .tk-color-slider:focus-visible .tk-color-thumb { box-shadow: 0 0 0 2px var(--tk-accent), 0 1px 3px rgb(0 0 0 / 0.2); }
.tk-color-bars { display: flex; align-items: center; gap: 8px; }
/* The bars, 8px high, as the designer narrowed them (2026-11-07). */
.tk-color-sliders { display: flex; flex: 1; flex-direction: column; gap: 12px; min-width: 0; }
.tk-color-bars > .tk-icon-button { width: 28px; height: 28px; border-radius: 8px; background: var(--tk-field); color: var(--tk-text-muted); }
.tk-color-slider {
  position: relative;
  flex: none;
  height: 8px;
  margin-inline: 7px;
  border-radius: 4px;
  background: var(--tk-track);
  box-shadow: inset 0 0 0 0.5px var(--tk-border);
  touch-action: none;
  outline: none;
}
.tk-color-values { gap: 4px; }
.tk-color-values .tk-field { flex: 1; min-width: 0; }
.tk-select.tk-color-format { width: 64px; color: var(--tk-text-muted); font-weight: 500; }
.tk-color-values .tk-color-opacity { flex: none; width: 56px; }
.tk-color-oklch { display: flex; flex-direction: column; gap: 8px; }
.tk-color-oklch-row { display: flex; align-items: center; gap: 4px; }
.tk-color-oklch-row > .tk-color-slider { flex: 1; }
.tk-color-oklch-row > .tk-glyph { flex: none; width: 12px; color: var(--tk-text-muted); text-align: center; }
.tk-color-oklch-row > .tk-field { flex: none; width: 56px; }
/* The stop the picker sets. */
.tk-stop-row.is-chosen .tk-color-field { box-shadow: var(--tk-input-focus-shadow); }
.tk-stop-handle.is-chosen { border-color: var(--tk-accent); }
/* The popovers of the Design panel (the color picker, the Variables): floating at its left, in its colors (designer, 2026-11-07). */
.tk-popover {
  position: fixed;
  /* As high as the panels' edges, and after the Design panel's in the page: over it, where the popover reaches across it. */
  z-index: 3;
  box-sizing: border-box;
  max-height: min(520px, calc(100vh - 16px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: var(--tk-panel);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  color: var(--tk-text);
  outline: none;
  /* A gradient's stops and the picker under them can be taller than the window. */
  overflow-y: auto;
}
/*
 * A popover or menu closed with the pointer leaves: it fades and moves 4px down, interruptible, taking no clicks
 * meanwhile; opened, or closed with a key, it is there or gone at once (designer, 2026-11-08). With reduced motion it only fades.
 * So does the change list once the Agent has applied every change in it, its last row gone (designer, 2026-11-09).
 */
:is(.tk-menu, .tk-popover, .tk-changes).is-leaving {
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity ${POPOVER_EXIT_MS}ms ${EASE_OUT}, transform ${POPOVER_EXIT_MS}ms ${EASE_OUT};
}
@media (prefers-reduced-motion: reduce) {
  :is(.tk-menu, .tk-popover, .tk-changes).is-leaving { transform: none; }
}
.tk-popover-header { display: flex; align-items: center; justify-content: space-between; }
.tk-popover-header .tk-section-title { min-height: 0; margin: 0; padding: 0; }
.tk-popover-header .tk-section-title::after { display: none; }
/* Its tabs, as the Design panel's (Custom, Variables); a fill's types inside them, as a segmented control. */
.tk-tabs { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--tk-tab-track); }
.tk-tabs[role="radiogroup"] { background: var(--tk-field); }
/*
 * A column as the popover is: the search as wide as it, and the list under it scrolling within the popover.
 * In a window too short for the popover, the list scrolls, or the picker's square is shorter; shorter still, the popover scrolls.
 */
.tk-tab-panel { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.tk-tab-panel > .tk-field { flex: none; }
.tk-tab {
  all: unset;
  flex: 1;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 24px;
  text-align: center;
  color: var(--tk-title);
}
.tk-tabs[role="tablist"] .tk-tab { font-size: 12px; }
.tk-tab:is([aria-selected="true"], [aria-checked="true"]) { background: var(--tk-raised); box-shadow: var(--tk-raised-shadow); color: #525351; }
.tk-tab:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
.tk-variable-search {
  flex: none;
  box-sizing: border-box;
  height: 28px;
  padding: 0 8px 0 30px;
  border-radius: 6px;
  background: var(--tk-field) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23737472' stroke-width='1.43' stroke-linecap='round'%3E%3Ccircle cx='7.25' cy='7.25' r='4.5'/%3E%3Cline x1='10.5' y1='10.5' x2='13.25' y2='13.25'/%3E%3C/svg%3E") no-repeat 8px center / 14px 14px;
}
.tk-variable-search::placeholder { color: var(--tk-text-muted); font-weight: 500; }
/* The picker's colors: the palette of the Variants tab, without its ramps' names. */
.tk-variants-ramp.is-bare { grid-template-columns: repeat(var(--tk-steps, 11), minmax(0, 1fr)); }
.tk-variants-swatch[aria-selected="true"] { box-shadow: inset 0 0 0 1px #fff, 0 0 0 2px var(--tk-accent); }
.tk-variable-list { overflow: auto; min-height: 0; margin: 0 -12px; padding: 0 12px; }
.tk-variable-list .tk-subtitle { margin: 8px 0 4px; }
.tk-variable-list > [role="group"]:first-child .tk-subtitle { margin-top: 0; }
.tk-variable-option {
  all: unset;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 6px;
  border-radius: 8px;
}
.tk-variable-option:hover, .tk-variable-option[aria-selected="true"] { background: var(--tk-field); }
.tk-variable-option:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
.tk-variable-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-variable-value { color: var(--tk-text-muted); font-variant-numeric: tabular-nums; }
.tk-variable-preview {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: var(--tk-swatch);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
}
.tk-variable-preview.is-shadow { background: #fff; }
/* Marks over a view, as in Figma's guides: red where a layer lines up and for distances measured with ⌥, magenta for equal spacing. 1px, labels one size, at any zoom. */
.tk-marks { --tk-line: #f24822; --tk-spacing: #e81cc4; pointer-events: none; }
.tk-mark {
  --tk-mark-color: var(--tk-line);
  position: absolute;
  box-sizing: border-box;
  width: 0;
  height: 0;
  border-left: 1px solid var(--tk-mark-color);
  transform: translateX(-0.5px);
}
.tk-mark[data-across] { border-left: 0; border-top: 1px solid var(--tk-mark-color); transform: translateY(-0.5px); }
.tk-mark[data-type="gap"] { --tk-mark-color: var(--tk-spacing); }
.tk-mark[data-type="extension"] { border-left-style: dashed; border-top-style: dashed; }
.tk-mark-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--tk-mark-color);
  color: #fff;
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* A space between layers is labelled beside it, out of the way of the line. */
.tk-mark[data-type="gap"][data-across] .tk-mark-label { top: auto; bottom: 4px; transform: translateX(-50%); }
.tk-mark[data-type="gap"]:not([data-across]) .tk-mark-label { left: 4px; transform: translateY(-50%); }

/* The Variants tab: the project's Variables, by group (designer, 2026-11-07). */
.tk-variants { display: flex; flex-direction: column; gap: 16px; }
.tk-variants .tk-row > .tk-field { flex: 1; }
/* The Variables source (All): tracked as the other muted labels (designer, 2026-11-08). */
.tk-select.tk-variants-source { width: 76px; color: var(--tk-text-muted); font-weight: 500; letter-spacing: -0.02em; }
.tk-variants .tk-input[type="search"]::-webkit-search-cancel-button { display: none; }
.tk-variants .tk-input::placeholder { color: var(--tk-text-muted); font-weight: 500; letter-spacing: -0.02em; }
.tk-variants-count { flex: none; order: 1; font-size: 11px; font-weight: 400; color: #a0a19f; }
.tk-section-title > .tk-variants-count + * { order: 2; }
.tk-section-title:has(.tk-variants-count)::after { order: 2; }
.tk-section-header .tk-icon-button[aria-expanded="false"] .tk-icon { rotate: -90deg; }
.tk-variants-part { display: flex; flex-direction: column; gap: 2px; }
.tk-variants-part + .tk-variants-part { margin-top: 6px; }
.tk-variants-subtitle { margin: 0; padding: 4px 0 2px; color: var(--tk-text-muted); font-weight: 500; letter-spacing: -0.02em; }
.tk-variants-palette { display: flex; flex-direction: column; gap: 2px; }
/* A ramp's row on its scale's columns: Tailwind's 11, or its own steps (designer, 2026-11-08). A swatch is at most
   20px, its size in the 320px panel: the panel widened, only the room between the name and the swatches grows, the
   swatches at the right; narrower, as with 12 steps or more, they shrink to fit (designer, 2026-11-08). */
.tk-variants-ramp { display: grid; grid-template-columns: minmax(50px, 1fr) repeat(var(--tk-steps, 11), minmax(0, 20px)); gap: 2px; align-items: center; }
.tk-variants-ramp-name { overflow: hidden; color: #525351; text-overflow: ellipsis; white-space: nowrap; }
.tk-variants-swatch, .tk-variants-empty { aspect-ratio: 1; border-radius: 4px; }
/* A step the ramp has no color for: a placeholder in its column, the size of a swatch, outlined dashed and not
   filled, so it reads as no color here rather than a white one (designer, 2026-11-08). Not a control: nothing on hover. */
.tk-variants-empty { box-sizing: border-box; border: 1px dashed var(--tk-border); pointer-events: none; }
/* The named colors (designer, 2026-11-08): under the ramps, each its swatch and its name, two a row; a group of
   names, and the color after one, from a row's start. */
.tk-variants-named { display: flex; flex-direction: column; gap: 2px; }
.tk-variants-palette > .tk-variants-ramp + .tk-variants-named { margin-top: 6px; }
.tk-variants-named-title { margin: 0; padding: 2px 0; color: #525351; }
.tk-variants-names { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 4px; }
.tk-variants-named-item { all: unset; display: flex; align-items: center; gap: 6px; min-width: 0; box-sizing: border-box; height: 24px; padding: 0 4px; border-radius: 6px; }
.tk-variants-named-item.is-start { grid-column: 1; }
.tk-variants-named-item:hover, .tk-variants-named-item:focus-visible { background: var(--tk-field); outline: none; }
.tk-variants-named-item[aria-disabled="true"] { cursor: default; }
.tk-variants-named-swatch { flex: none; width: 16px; height: 16px; border-radius: 4px; background: var(--tk-swatch); box-shadow: inset 0 0 0 0.5px var(--tk-border); }
.tk-variants-named-item.is-in-use .tk-variants-named-swatch { box-shadow: inset 0 0 0 1px #fff, 0 0 0 2px var(--tk-accent); }
.tk-variants-named-name { overflow: hidden; color: #525351; text-overflow: ellipsis; white-space: nowrap; }
.tk-variants-swatch {
  all: unset;
  aspect-ratio: 1;
  border-radius: 4px;
  background: var(--tk-swatch);
  box-shadow: inset 0 0 0 0.5px var(--tk-border);
}
.tk-variants-swatch:hover, .tk-variants-swatch:focus-visible { box-shadow: inset 0 0 0 1.5px #fff, 0 0 0 1px rgb(0 0 0 / 0.35); outline: none; }
.tk-variants-swatch.is-in-use { box-shadow: inset 0 0 0 1px #fff, 0 0 0 2px var(--tk-accent); }
.tk-variants-row { display: flex; align-items: center; gap: 8px; box-sizing: border-box; min-height: 24px; padding: 0 8px; border-radius: 8px; }
.tk-variants-row.is-button { all: unset; display: flex; align-items: center; gap: 8px; box-sizing: border-box; min-height: 28px; padding: 2px 8px; border-radius: 8px; }
.tk-variants-row.is-button:hover, .tk-variants-row.is-button:focus-visible, .tk-variants-tile:hover, .tk-variants-tile:focus-visible { background: var(--tk-field); outline: none; }
:is(.tk-variants-row.is-button, .tk-variants-tile).is-in-use { background: #ffffff; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1); }
.tk-variants-name { flex: none; width: 60px; overflow: hidden; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.tk-variants-row.is-button .tk-variants-name { flex: 1; }
.tk-variants-track { flex: 1; min-width: 0; }
.tk-variants-bar { display: block; height: 6px; border-radius: 2px; background: #bcddff; }
.tk-variants-value { flex: none; margin-left: auto; color: var(--tk-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
/*
 * A length's bar is as long as it is, 1px a px (designer, 2026-11-08). One
 * longer than its track, by however much, runs on behind the value, which
 * sits on the panel's color, and shows past it up to the row's edge, the
 * panel's inner edge: (length - track) * 100000 is 0 or less for a bar that
 * fits, and past the row for one that does not, even by a hundredth of a px.
 * Clipped there, it does not scroll the panel sideways.
 */
.tk-variants-row.is-length { overflow: clip; }
.tk-variants-row.is-length .tk-variants-track { container-type: inline-size; }
.tk-variants-row.is-length .tk-variants-bar { width: max(1px, var(--tk-length), (var(--tk-length) - 100cqw) * 100000); }
.tk-variants-row.is-length .tk-variants-value { padding: 0 2px 0 4px; margin-right: -2px; background: var(--tk-panel); }
/* Pointed at, a bar too long for its row shows whole, on white, out over the canvas. */
.tk-variants-whole {
  position: fixed;
  z-index: 3;
  box-sizing: border-box;
  padding: 8px;
  overflow: hidden;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  transform: translateY(-100%);
  pointer-events: none;
}
.tk-variants-sample { flex: none; width: 48px; overflow: hidden; color: #171716; font-weight: 500; line-height: 1.15; white-space: nowrap; }
.tk-variants-tiles { display: grid; gap: 6px; }
.tk-variants-tiles.is-four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.tk-variants-tiles.is-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.tk-variants-tile {
  all: unset;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 10px 8px 8px;
  border-radius: 8px;
  background: var(--tk-field);
}
.tk-variants-radius { width: 40px; height: 40px; box-sizing: border-box; border: 1px solid #a0a19f; border-radius: 2px; background: #ffffff; }
.tk-variants-shadow { width: 48px; height: 28px; margin-top: 4px; border-radius: 6px; background: #ffffff; }
.tk-variants-label { display: flex; align-self: stretch; justify-content: space-between; gap: 4px; font-weight: 500; }
.tk-variants-label.is-center { justify-content: center; }
/*
 * A radius tile's name over its value, the name cut short when the tile is
 * too narrow for it (designer, 2026-11-08). Both centered under the corner
 * drawing (designer, 2026-11-08: at the left they looked out of place); a cut
 * name fills the tile, so its ellipsis stays at its end. The tile never grows
 * past its column.
 */
.tk-variants-tile { min-width: 0; }
.tk-variants-label.is-stacked { flex-direction: column; align-items: center; gap: 0; min-width: 0; font-weight: 400; }
.tk-variants-label.is-stacked > * { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-variants-label.is-stacked .tk-variants-value { margin-left: 0; }
.tk-variants-tile[aria-disabled="true"], .tk-variants-row.is-button[aria-disabled="true"] { cursor: default; }
.tk-variants-tip {
  position: fixed;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #171716;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
  color: #fafafa;
  white-space: nowrap;
  transform: translate(-50%, -100%);
  pointer-events: none;
}
/*
 * Any other tip (Tips): the same, over all of the editor layer, in the editor's type, placed by Tips; a long one wraps. Shown after the
 * pointer rests, it fades in growing from 0.97 toward what it tells of; warm, or by focus, it is there at once; with reduced motion, it
 * only fades (designer, 2026-11-08).
 */
.tk-variants-tip.tk-tip { z-index: 2147483647; display: block; max-width: 240px; font: 400 11px/16px ${EDITOR_FONT}; -webkit-font-smoothing: antialiased; white-space: normal; transform: none; }
@media (hover: hover) and (pointer: fine) {
  .tk-variants-tip.tk-tip.is-easing { transition: opacity ${TIP_IN_MS}ms ${EASE_OUT}, transform ${TIP_IN_MS}ms ${EASE_OUT}; }
  @starting-style { .tk-variants-tip.tk-tip.is-easing { opacity: 0; transform: scale(0.97); } }
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: reduce) {
  @starting-style { .tk-variants-tip.tk-tip.is-easing { transform: none; } }
}
.tk-variants-tip-name { font-weight: 500; }
.tk-variants-tip-value { color: #a0a19f; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.tk-variants-tip-hint { color: #a0a19f; }
/*
 * A shadow Variable's layers, pointed at: white, as the popovers' shape, out
 * over the canvas at the Design panel's left (designer, 2026-11-08). Its name,
 * then a block a shadow, a thin rule between; each value under a muted label,
 * four to a row, the color across the row below.
 */
.tk-variants-details {
  position: fixed;
  z-index: 3;
  box-sizing: border-box;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  color: #0a0a09;
  font-size: 11px;
  pointer-events: none;
}
.tk-variants-details-name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.tk-variants-details-layer { display: flex; flex-direction: column; gap: 6px; }
.tk-variants-details-layer + .tk-variants-details-layer { padding-top: 8px; border-top: 1px solid #ebebea; }
.tk-variants-details-head { display: flex; justify-content: space-between; gap: 8px; }
.tk-variants-details-title { font-weight: 500; }
.tk-variants-details-label { color: #737472; }
.tk-variants-details-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 8px; margin: 0; }
.tk-variants-details-pair { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.tk-variants-details-pair.is-color { grid-column: 1 / -1; }
.tk-variants-details-value { display: flex; align-items: center; gap: 6px; margin: 0; font-variant-numeric: tabular-nums; }
.tk-variants-details-swatch { flex: none; width: 12px; height: 12px; border-radius: 3px; background: var(--tk-swatch); box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.15); }
.tk-variants-details-opacity { margin-left: auto; }

@media (prefers-reduced-motion: reduce) {
  .tk-segment, .tk-selection, .tk-progress-done { transition: none; }
  /* A toast only fades: it does not rise or sink. */
  .tk-toast { animation-name: tk-toast-fade-in; transition-property: opacity; }
  .tk-toast.is-fading { translate: none; }
}
`;
