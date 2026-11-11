import { APPLIED_LEAVE_MS, APPLIED_SCALE, CHANGE_PING_MS, CHEVRON_TURN_MS, EASE_IN_OUT, EASE_OUT, FIELD_SETTLE_MS, FIELD_STATE_MS, GRIP_ENTER_MS, GRIP_EXIT_MS, HEADER_LINE_MS, POPOVER_EXIT_MS, RESET_POP_MS, SECOND_LINE_FADE_MS, SECOND_LINE_MS, SECOND_LINE_STAGGER_MS, TIP_IN_MS, TOAST_FADE_MS, TOOL_SLIDE_MS } from "./motion";
import { EDITOR_FONT_FAMILY } from "./editor-font";
import { FONT_STACK } from "./toggle-styles";

/** The editor's typeface first (`registerEditorFont`), the toggle's after it, for what it lacks. */
const EDITOR_FONT = `"${EDITOR_FONT_FAMILY}", ${FONT_STACK}`;

/** The editor layer's styles, but for the toggle's (`toggleStyles`), which come before them. They live inside the Shadow DOM and never touch the page. */
export const styles = /* css */ `
.ht-icon { flex: none; width: var(--ht-icon-size); height: var(--ht-icon-size); }
.ht-icon * { stroke-width: var(--ht-icon-stroke); vector-effect: non-scaling-stroke; }

/* The toggle while the Agent applies the round: a ring fills as changes are done. */
.ht-progress {
  position: absolute;
  /* Round the toggle, in its column's 4px padding: at its top, or at its foot in a bottom corner, the toggle there. */
  top: 0;
  left: calc(50% - 18px);
  width: 36px;
  height: 36px;
  pointer-events: none;
}
.ht-dock[data-corner^="bottom"] .ht-progress { top: auto; bottom: 0; }
/* Its 1.5px line right round the toggle, nothing between, its corners round the toggle's 6px (designer, 2026-11-09). */
.ht-progress rect { x: 3.25px; y: 3.25px; width: 29.5px; height: 29.5px; rx: 6.75px; fill: none; stroke-width: 1.5; stroke-dasharray: 1; }
.ht-progress-track { stroke: rgb(30 30 30 / 0.16); }
.ht-progress-done {
  stroke: #0d99ff;
  stroke-linecap: round;
  transition: stroke-dashoffset 240ms ${EASE_OUT};
}
/* Pressed and held: the ring that runs out when the toggle unlocks. */
.ht-progress-hold { stroke: #525351; stroke-dashoffset: 1; opacity: 0; }
.is-holding .ht-progress-hold { opacity: 1; animation: ht-hold var(--ht-hold) linear forwards; }
@keyframes ht-hold { to { stroke-dashoffset: 0; } }

/*
 * Changes not yet applied, counted on a button of their own after the toggle in its column: not a badge on its corner, too
 * easily pressed for the toggle. As the count beside the Design title in edit mode, so it reads as a count and not as a
 * second toggle (designer, 2026-11-08), and 28px as the toggle (designer, 2026-11-09). It opens the change list.
 */
.ht-toggle-count {
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
.ht-toggle-count::before {
  content: "";
  position: absolute;
  inset: 2px;
  z-index: -1;
  border-radius: 6px;
  background: linear-gradient(#3fa5fe, #008ff0);
  box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.15), 0 1px 1px rgb(0 0 0 / 0.15);
}
.ht-toggle-count:hover::before { background: linear-gradient(#008ff0, #007dd2); }
.ht-toggle-count:focus-visible { outline: 2px solid #008ff0; outline-offset: 0; }

/*
 * The change list: light as the editor's menus and popovers, in their colors, opening toward the middle of the window
 * (designer, 2026-11-08). In edit mode it is in the shell and takes its colors; on the toggle, outside it, the same ones.
 */
.ht-dock .ht-changes {
  --ht-panel: #f5f5f5;
  --ht-border: #d4d4d3;
  --ht-text: #0a0a09;
  --ht-text-muted: #737472;
  --ht-field: #ededec;
  --ht-button: #e5e5e4;
  --ht-accent: #008ff0;
}
@media (prefers-color-scheme: dark) {
  .ht-dock .ht-changes {
    --ht-panel: #2c2c2c;
    --ht-border: #444444;
    --ht-text: #ffffff;
    --ht-text-muted: #a6a6a6;
    --ht-field: #383838;
    --ht-button: #383838;
  }
}
.ht-changes {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 280px;
  max-height: min(400px, calc(100vh - 96px));
  overflow: hidden;
  padding: 4px;
  border-radius: 12px;
  background: var(--ht-panel);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  color: var(--ht-text);
  font: 400 11px/16px ${EDITOR_FONT};
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  outline: none;
}
.ht-dock[data-corner^="bottom"] .ht-changes { bottom: calc(100% + 8px); }
.ht-dock[data-corner^="top"] .ht-changes { top: calc(100% + 8px); }
.ht-dock[data-corner$="right"] .ht-changes { right: 0; }
.ht-dock[data-corner$="left"] .ht-changes { left: 0; }
.ht-changes > * { flex: none; }
/* The small headings, the change list's, the notice's and a shadow Variable's name, set alike (designer, 2026-11-09). */
.ht-changes-title { margin: 0; padding: 8px; font: inherit; font-weight: 500; font-size: 12px; line-height: 16px; }
.ht-changes-note { margin: 0; padding: 0 8px 8px; color: var(--ht-text-muted); }
/*
 * Too long for the list's height, the rows alone scroll, between its title and Discard all (designer, 2026-11-09). An edge with
 * rows past it fades out over 24px, telling there are more.
 */
.ht-changes > .ht-changes-list {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  --ht-fade-above: 0px;
  --ht-fade-below: 0px;
  mask-image: linear-gradient(transparent, #000 var(--ht-fade-above), #000 calc(100% - var(--ht-fade-below)), transparent);
}
.ht-changes-list.is-above { --ht-fade-above: 24px; }
.ht-changes-list.is-below { --ht-fade-below: 24px; }
/* A row as a menu's option, as high as two lines were, one line now (designer, 2026-11-10): light grey under the pointer; its undo muted, darker under the pointer. */
.ht-change {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 4px 0 8px;
  border-radius: 8px;
}
.ht-change:hover { background: var(--ht-field); }
.ht-change .ht-icon-button { color: var(--ht-text-muted); }
.ht-change .ht-icon-button:hover { background: var(--ht-button); color: var(--ht-text); }
/* The change the Agent is at, as it applies the round: darker, turning at its right where undo is otherwise (designer, 2026-11-09). */
.ht-change.is-current { background: var(--ht-button); transition: background-color ${APPLIED_LEAVE_MS}ms ease; }
.ht-change-spinner {
  flex: none;
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  margin: 0 6px;
  border: 1.5px solid var(--ht-border);
  border-top-color: var(--ht-text-muted);
  border-radius: 50%;
  animation: ht-spin 800ms linear infinite;
}
@keyframes ht-spin { to { rotate: 1turn; } }
/* Applied: kept where it was, out of the rows' flow, it goes back and fades; with reduced motion it only fades (designer, 2026-11-09). */
.ht-change.is-applied {
  position: absolute;
  left: 0;
  right: 0;
  /* Under the rows rising into its place. */
  z-index: -1;
  pointer-events: none;
  animation: ht-change-applied ${APPLIED_LEAVE_MS}ms ${EASE_OUT} forwards;
}
@keyframes ht-change-applied { to { opacity: 0; scale: ${APPLIED_SCALE}; } }
@media (prefers-reduced-motion: reduce) {
  .ht-change.is-applied { animation-name: ht-change-applied-fade; }
}
@keyframes ht-change-applied-fade { to { opacity: 0; } }
.ht-change-text { display: flex; flex: 1; align-items: center; align-self: stretch; min-width: 0; }
/* The whole row but its undo shows the change, clicked. */
button.ht-change-text { all: unset; display: flex; flex: 1; align-items: center; align-self: stretch; min-width: 0; }
button.ht-change-text:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: -2px; border-radius: 6px; }
.ht-change-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A change shown from the list: its layer's outline and each field it changed blink lighter twice, the whole of each; a color alone, kept with reduced motion (designer, 2026-11-10). */
/* Twice the class: over the buttons' all: unset, which comes later, as a − in the accent is one. */
.ht-ping.ht-ping { animation: ht-ping ${CHANGE_PING_MS}ms ${EASE_IN_OUT}; }
@keyframes ht-ping {
  25%, 75% { opacity: 0.35; }
  0%, 50%, 100% { opacity: 1; }
}
.ht-changes-confirm { margin-top: 4px; padding: 8px 8px 0; border-top: 1px solid var(--ht-border); }
.ht-changes-confirm p { margin: 0; }
.ht-changes-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 8px 4px; }
/* Discard all as far from the list's bottom as from its right (designer, 2026-11-09). */
.ht-changes > .ht-changes-actions { padding-bottom: 8px; }
/* Its buttons as the panels' top ones, on the light panel; Discard stays red. */
.ht-changes .ht-button:not(.is-danger) { background: var(--ht-button); color: var(--ht-text); }
.ht-changes .ht-button:not(.is-danger):hover { background: var(--ht-border); }
.ht-button {
  all: unset;
  height: 24px;
  padding: 0 8px;
  border-radius: 5px;
  background: #383838;
  font: 500 11px/24px ${EDITOR_FONT};
  cursor: default;
}
.ht-button:hover { background: #444444; }
.ht-button:focus-visible { outline: 2px solid #0d99ff; outline-offset: 1px; }
.ht-button.is-danger { background: #f24822; color: #fff; }
.ht-button.is-danger:hover { background: #dc3412; }
.ht-button.is-primary { background: #0d99ff; color: #fff; }
.ht-button.is-primary:hover { background: #007be5; }

/* A notice, dark like the toggle: the Agent seems to have stopped (ticket 67). */
.ht-notice {
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
.ht-notice-title { margin: 0; padding: 8px 12px 4px; font: inherit; font-weight: 500; font-size: 12px; line-height: 16px; }
.ht-notice-text { margin: 0; padding: 0 12px 4px; color: rgb(255 255 255 / 0.7); }
/* The Agent seems to have stopped (ticket 67): on the toggle, where its change list opens. */
.ht-stalled { position: absolute; width: 300px; }
.ht-dock[data-corner^="bottom"] .ht-stalled { bottom: calc(100% + 8px); }
.ht-dock[data-corner^="top"] .ht-stalled { top: calc(100% + 8px); }
.ht-dock[data-corner$="right"] .ht-stalled { right: 0; }
.ht-dock[data-corner$="left"] .ht-stalled { left: 0; }

/*
 * Edit mode shell, in the designer's palette (Figma: Palette, 2026-11-07): neutral steps of OKLCH hue 132, blue and
 * purple to stand out. Light only for now; the dark one keeps the earlier greys until the designer has drawn it.
 */
.ht-shell {
  --ht-panel: #f5f5f5; /* neutral 100 */
  --ht-canvas: #e5e5e4; /* neutral 200 */
  --ht-border: #d4d4d3; /* neutral 300: rules and borders */
  --ht-guide: #e5e5e4; /* neutral 200: the Layers' guides */
  --ht-text: #0a0a09; /* neutral 950 */
  --ht-text-muted: #737472; /* neutral 500 */
  --ht-title: #3f403f; /* neutral 700: a section's title */
  --ht-field: #ededec; /* neutral 150 */
  --ht-button: #e5e5e4; /* neutral 200: the buttons at the panels' tops */
  --ht-raised: #fafafa; /* neutral 50: the choice of a segmented control, the Layers' disclosures */
  /*
   * A field, a choice, the alignment's grid (Figma: 03 Kind, 86:557; designer, 2026-11-08): raised on neutral 50, a hairline and a soft
   * shadow under it; pointed at or chosen, on neutral 100. Every edge drawn inward (designer, 2026-11-08). Each shadow is three, the
   * chosen edge, the shadow, the hairline, so one eases into the next.
   */
  --ht-input: #fafafa;
  --ht-input-hover: #f5f5f5;
  --ht-input-shadow: inset 0 0 0 1px transparent, 0 1px 1px rgb(0 0 0 / 0.15), inset 0 0 0 0.5px rgb(0 0 0 / 0.1);
  --ht-input-focus-shadow: inset 0 0 0 1px var(--ht-accent-strong), 0 1px 1px rgb(0 143 240 / 0.6), inset 0 0 0 0.5px rgb(0 0 0 / 0.1);
  /* Changed, on the accent: a darker hairline, the same shadow under it. */
  --ht-changed-shadow: inset 0 0 0 1px transparent, 0 1px 1px rgb(0 0 0 / 0.15), inset 0 0 0 0.5px rgb(0 0 0 / 0.15);
  --ht-changed-focus-shadow: inset 0 0 0 1px var(--ht-accent-strong), 0 1px 1px rgb(0 0 0 / 0.15), inset 0 0 0 0.5px rgb(0 0 0 / 0.15);
  /* The choice of a segmented control, raised: its hairline inward too. */
  --ht-chosen-shadow: 0 1px 1px rgb(0 0 0 / 0.15), inset 0 0 0 0.5px rgb(0 0 0 / 0.15);
  --ht-tool-chosen: #ffffff; /* neutral 0: the tool chosen */
  /* The editor's prominent button, on the tool chosen's white: the chosen tool's backing, the Show layers button (designer, 2026-11-08). */
  --ht-prominent-shadow: 0 1px 1px rgb(0 0 0 / 0.15), 0 0 0 0.5px rgb(0 0 0 / 0.15);
  --ht-panel-label: #525351; /* neutral 600: the tools' icons */
  --ht-raised-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 1px 1px rgb(0 0 0 / 0.15);
  --ht-tab-track: #d4d4d3; /* neutral 300: the Design and Variables tabs */
  /* An open disclosure (the Layers' chevrons, an effect's fold): raised in white, its chevron grey. */
  --ht-disclosure: #717171;
  --ht-disclosure-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 1px 1.5px rgb(0 0 0 / 0.15);
  /* Neutral 800, the panel's darkest mark: a check ticked, the alignment's point chosen. */
  --ht-ink: #262625;
  /* A check's box, off: neutral 200. */
  --ht-check-off: #e5e5e4;
  /* Quieter than muted: a group's count, a radius tile's drawn corner. */
  --ht-text-faint: #a0a19f;
  /* A text Variable's sample, in its own type. */
  --ht-sample: #171716;
  /* What shows out over the canvas from the Variables (a bar whole, a shadow's layers): white, and a soft rule inside it. */
  --ht-popup: #ffffff;
  --ht-rule-soft: #ebebea;
  /* A spacing Variable's bar: blue 200 (OKLCH L 0.88), 1.29:1 on the panel. */
  --ht-bar: #bcddff;
  /* A radius tile's drawn corner, a step off the tile it is on. */
  --ht-radius-block: #ffffff;
  /* The chip a shadow is drawn on, so the shadow shows: white. */
  --ht-shadow-sample: #ffffff;
  /* The panels' widths: each set by its edge (designer, 2026-11-08), on the shell's style, as panel-widths.ts fits them. */
  --ht-layers-width: 320px;
  --ht-design-width: 320px;
  color-scheme: light;
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  /*
   * A wheel or a swipe where nothing of the editor scrolls (the Show layers button, the tools) ends here, not at the
   * page under the editor: the page scrolled behind it, and on a Mac its rubber band took the editor along, the page's
   * own background showing in the gap at the window's edge (designer, 2026-11-11). A scroller for that, with nothing
   * past its edges to scroll to.
   */
  overflow: hidden;
  overscroll-behavior: none;
  display: grid;
  grid-template-columns: var(--ht-layers-width) minmax(0, 1fr) var(--ht-design-width);
  /* The canvas's gray under the panels: as they come in with the frame as edit mode starts, the canvas shows where they will be, not the page under the editor (designer, 2026-11-08). */
  background: var(--ht-canvas);
  font: 400 11px/16px ${EDITOR_FONT};
  color: var(--ht-text);
  /* Grayscale smoothing for the editor's UI, its muted labels kept at 500 (designer, 2026-11-08); the page on the canvas is in iframes, so it doesn't inherit this. */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
@media (prefers-color-scheme: dark) {
  .ht-shell {
    --ht-panel: #2c2c2c;
    --ht-canvas: #1e1e1e;
    --ht-border: #444444;
    --ht-guide: #444444;
    --ht-text: #ffffff;
    --ht-text-muted: #a6a6a6;
    --ht-title: #e6e6e6;
    --ht-field: #383838;
    --ht-button: #383838;
    --ht-raised: #4a4a4a;
    /* The dark fields as they were, flat, till the designer draws them. */
    --ht-input: #383838;
    --ht-input-hover: #383838;
    --ht-input-shadow: inset 0 0 0 1px transparent, 0 0 0 0 transparent, inset 0 0 0 0 transparent;
    --ht-input-focus-shadow: inset 0 0 0 1px var(--ht-accent), 0 0 0 0 transparent, inset 0 0 0 0 transparent;
    --ht-changed-shadow: inset 0 0 0 1px transparent, 0 0 0 0 transparent, inset 0 0 0 0 transparent;
    --ht-changed-focus-shadow: inset 0 0 0 1px var(--ht-accent-strong), 0 0 0 0 transparent, inset 0 0 0 0 transparent;
    --ht-chosen-shadow: 0 1px 1px rgb(0 0 0 / 0.3), inset 0 0 0 0.5px rgb(0 0 0 / 0.4);
    --ht-tool-chosen: #4a4a4a;
    --ht-panel-label: #e6e6e6;
    --ht-raised-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.4), 0 1px 1px rgb(0 0 0 / 0.3);
    --ht-tab-track: #1e1e1e;
    --ht-disclosure: #e6e6e6;
    --ht-disclosure-shadow: var(--ht-raised-shadow);
    --ht-ink: #e6e6e6;
    --ht-check-off: #4a4a4a;
    --ht-text-faint: #8c8c8c;
    --ht-sample: #ffffff;
    --ht-popup: #2c2c2c;
    --ht-rule-soft: #444444;
    /* Blue 200's hue and chroma at OKLCH L 0.36, 1.30:1 on the dark panel, as light mode's bar on its panel (planner, 2026-11-11). */
    --ht-bar: #24405b;
    /* Lighter than the tile, in use (#4a4a4a) or not (#383838): its corner reads without its outline (planner, 2026-11-11). */
    --ht-radius-block: #5a5a5a;
    /* Light, not white, so a dark shadow shows on it; the tile round it stays dark (planner, 2026-11-11). */
    --ht-shadow-sample: #f2f2f2;
    color-scheme: dark;
  }
}

/* A panel: a column of its parts, 16px apart and from its edges. */
.ht-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  min-width: 0;
  padding: 16px;
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--ht-panel);
}
.ht-panel > * { flex: none; }
/* The Design panel's sections 20px apart (designer, 2026-11-08). */
.ht-panel.is-design { gap: 20px; }
/* Its words are the editor's own, not to be selected (designer, 2026-11-07); what is typed in its fields is. */
.ht-panel { user-select: none; -webkit-user-select: none; }
.ht-panel :is(input, textarea, [contenteditable="true"]) { user-select: text; -webkit-user-select: text; }
/* The Layers panel starts hidden: the canvas takes its column, and a button at its top left brings it back. */
.ht-shell.is-layers-hidden { grid-template-columns: minmax(0, 1fr) var(--ht-design-width); }
/*
 * Its size, corners and place on the screen those of the button in the Layers panel's top that hid them, so
 * showing and hiding the panel leaves it where it is (designer, 2026-11-08): 28px as the Design panel's ×, 6px corners, the panel's padding
 * from the left, centred on the 28px header from the top. Alone over the canvas, it is the editor's prominent button,
 * the chosen tool's white and shadow (designer, 2026-11-08).
 */
.ht-show-layers {
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
  background: var(--ht-tool-chosen);
  box-shadow: var(--ht-prominent-shadow);
  color: var(--ht-text);
}
.ht-show-layers:hover { background: var(--ht-raised); }
.ht-show-layers:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: -2px; }
.ht-stop-playing {
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
  background: var(--ht-panel);
  box-shadow: 0 0 0 1px var(--ht-border), 0 2px 6px rgb(0 0 0 / 0.08);
  color: var(--ht-text);
}
.ht-stop-playing:hover { background: var(--ht-field); }
.ht-stop-playing:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: 2px; }
/* Playing: the canvas alone, at full size; a button at the top right goes back to editing. */
.ht-shell.is-playing { grid-template-columns: minmax(0, 1fr); }
.ht-shell.is-playing > :is(.ht-panel, .ht-show-layers) { display: none; }
.ht-shell.is-playing .ht-canvas { box-shadow: none; }
.ht-stop-playing { left: auto; right: 8px; }

/*
 * A panel's inner edge, to resize it (designer, 2026-11-08): 6px straddling the edge, over the panel and the canvas.
 * The pointer resting on it, the grip drawn in Figma (03 Kind, node 169:1379) shows at the pointer: a 10 × 48 pill
 * of the accent, a 0.5px white outline. It fades in and grows from half its height about its middle, where the pointer
 * is, and leaves by fading alone; with reduced motion it only fades. Pressed, the panel's whole edge takes the accent
 * at once (Figma: node 169:958's left border), and lets it go over a field's state change.
 */
.ht-resizer {
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
.ht-resizer.is-layers { left: calc(var(--ht-layers-width) - 3px); }
.ht-resizer.is-design { right: calc(var(--ht-design-width) - 3px); }
/* The edge's line, inside the panel: the Layers' last pixel, the Design panel's first. */
.ht-resizer::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 1px;
  background: var(--ht-accent);
  opacity: 0;
  transition: opacity ${FIELD_STATE_MS}ms ${EASE_OUT};
}
.ht-resizer.is-layers::before { left: 2px; }
.ht-resizer.is-pressed::before { opacity: 1; transition: none; }
.ht-resizer-grip {
  position: absolute;
  top: 50%;
  left: 50%;
  box-sizing: border-box;
  width: 10px;
  height: 48px;
  margin: -24px 0 0 -5px;
  border: 0.5px solid #ffffff; /* neutral 0 */
  border-radius: 99px;
  background: var(--ht-accent);
  pointer-events: none;
  opacity: 0;
  transform: scaleY(0.5);
  /* Leaving: a fade; at half its height again only once gone, so shown again meanwhile it doesn't grow twice. */
  transition: opacity ${GRIP_EXIT_MS}ms ${EASE_OUT}, transform 0s linear ${GRIP_EXIT_MS}ms;
}
.ht-resizer.is-shown .ht-resizer-grip {
  opacity: 1;
  transform: none;
  transition: opacity ${GRIP_ENTER_MS}ms ${EASE_OUT}, transform ${GRIP_ENTER_MS}ms ${EASE_OUT};
}
/* Focused from the keyboard: the grip there at once, no motion for a key. */
.ht-resizer:focus-visible .ht-resizer-grip { opacity: 1; transform: none; transition: none; }
@media (prefers-reduced-motion: reduce) {
  .ht-resizer-grip { transform: none; }
}

/* The tools, at the top right of the canvas, 8px from the Design panel: one above another, the one chosen raised in white (designer, 2026-11-08). As high as the views' tops, under their labels: higher, they would cover the last view's label and its +. */
/* Figma (03 Kind, node 169:1359): 4px around the tools, 3px between, a 0.5px neutral 300 outline; the icons neutral 600, the chosen one's neutral 500 (designer, 2026-11-08). */
.ht-tools {
  position: absolute;
  top: 72px;
  right: calc(var(--ht-design-width) + 8px);
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px;
  /* Its tools' 6px corners and its 4px padding, nested (designer, 2026-11-08). */
  border-radius: 10px;
  background: var(--ht-panel);
  box-shadow: 0 0 0 0.5px var(--ht-border);
}
/* 28px, as the panel's buttons, with their 6px corners (designer, 2026-11-08). */
.ht-tools .ht-icon-button { position: relative; width: 28px; height: 28px; border-radius: 6px; color: var(--ht-panel-label); }
.ht-tools .ht-icon-button[aria-pressed="true"] { background: none; color: var(--ht-text-muted); }
/* The white under the chosen tool, one for all three: it moves by transform alone, a tool (28px) and a gap (3px) a step (designer, 2026-11-08). */
.ht-tools-backing {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--ht-tool-chosen);
  box-shadow: var(--ht-prominent-shadow);
  transform: translateY(calc(var(--ht-tool-index, 0) * 31px));
}
.ht-tools-backing.is-sliding { transition: transform ${TOOL_SLIDE_MS}ms ${EASE_IN_OUT}; }
@media (prefers-reduced-motion: reduce) {
  .ht-tools-backing.is-sliding { transition: none; }
}
.ht-shell.is-playing > .ht-tools { display: none; }
/* A tool's tip: the Variables' dark one, at the toolbar's left, 8px off it, level with the tool (designer, 2026-11-08). */
.ht-variants-tip.ht-tools-tip { position: absolute; right: calc(100% + 8px); transform: translateY(-50%); transform-origin: right center; }
/* Shown after the pointer rests on a tool, it fades in growing from 0.97 toward the toolbar; warm, or by focus, it is there at once; with reduced motion, it only fades (designer, 2026-11-08). */
@media (hover: hover) and (pointer: fine) {
  .ht-variants-tip.ht-tools-tip.is-easing { transition: opacity ${TIP_IN_MS}ms ${EASE_OUT}, transform ${TIP_IN_MS}ms ${EASE_OUT}; }
  @starting-style { .ht-variants-tip.ht-tools-tip.is-easing { opacity: 0; transform: translateY(-50%) scale(0.97); } }
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: reduce) {
  @starting-style { .ht-variants-tip.ht-tools-tip.is-easing { transform: translateY(-50%); } }
}
/* A toast, as in Figma: a dark pill of one line, at the bottom middle of the canvas, over it. */
.ht-toasts {
  position: absolute;
  bottom: 16px;
  left: var(--ht-layers-width);
  right: var(--ht-design-width);
  z-index: 1;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.ht-shell.is-layers-hidden > .ht-toasts { left: 0; }
.ht-shell.is-playing > .ht-toasts { left: 0; right: 0; }
.ht-toast {
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
  animation: ht-toast-in ${TOAST_FADE_MS}ms ${EASE_OUT};
  transition: opacity ${TOAST_FADE_MS}ms ${EASE_OUT}, translate ${TOAST_FADE_MS}ms ${EASE_OUT};
}
.ht-toast.is-fading { opacity: 0; translate: 0 8px; }
@keyframes ht-toast-in { from { opacity: 0; translate: 0 8px; } }
/* What happened outside, as the code changed (ticket 78): at the canvas's bottom left, apart from the toast answering the designer's own doing. */
.ht-page-toasts {
  position: absolute;
  bottom: 16px;
  left: calc(var(--ht-layers-width) + 16px);
  z-index: 1;
  display: flex;
  max-width: calc(100% - var(--ht-layers-width) - var(--ht-design-width) - 32px);
  pointer-events: none;
}
.ht-shell:is(.is-layers-hidden, .is-playing) > .ht-page-toasts { left: 16px; max-width: calc(100% - var(--ht-design-width) - 32px); }
.ht-toast.is-page { display: flex; align-items: center; gap: 8px; }
.ht-toast.is-page > span { overflow: hidden; text-overflow: ellipsis; }
.ht-toast.is-page:has(.ht-button) { padding-block: 4px; padding-right: 4px; }
.ht-toast.is-page .ht-button { flex: none; }
@keyframes ht-toast-fade-in { from { opacity: 0; } }

/*
 * A panel's top, one style for both (designer, 2026-11-08). The Layers': a button that hides them, and their title.
 * The Design panel's: what it shows (Design, or Variables with nothing selected) at the left, the changes so far and the
 * way back at the right. Under both, the line the Design panel's had, inset by the panel's padding.
 * Sticky, on the panel's own color: what scrolls up goes under it. It reaches over the panel's padding (16px) to the
 * panel's edges, so nothing shows above or beside it; sticky keeps to the panel's padding, so it sticks 16px up.
 * Scrolled, the line runs to the panel's edges, by its clip alone (designer, 2026-11-08).
 */
.ht-panel-header {
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
  background: var(--ht-panel);
}
.ht-panel-header::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--ht-border);
  clip-path: inset(0 16px);
  transition: clip-path ${HEADER_LINE_MS}ms ${EASE_OUT};
  pointer-events: none;
}
.ht-panel[data-scrolled] > .ht-panel-header::after { clip-path: inset(0); }
@media (prefers-reduced-motion: reduce) {
  .ht-panel-header::after { transition: none; }
}
/* The Layers' title's type for both (designer, 2026-11-08); it takes the room left, which puts the Design panel's count and way back at the right. */
.ht-panel-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0 0 0 4px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--ht-title);
}
.ht-panel.is-design .ht-panel-title { padding-left: 2px; }
.ht-panel-header > .ht-icon-button { width: 28px; height: 28px; border-radius: 6px; background: var(--ht-button); }
.ht-panel-header > .ht-icon-button:hover { background: var(--ht-border); }
.ht-count {
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
.ht-count::before {
  content: "";
  position: absolute;
  inset: 2px;
  z-index: -1;
  border-radius: 6px;
  background: linear-gradient(var(--ht-accent-on), var(--ht-accent));
  box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.15), 0 1px 1px rgb(0 0 0 / 0.15);
}
.ht-count:hover::before { background: linear-gradient(var(--ht-accent), var(--ht-accent-strong)); }
.ht-count:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: 0; }
/* Opened from the count: below the panel's top, over the panel, which would clip it. */
.ht-panel-header .ht-changes { position: fixed; top: 48px; right: 16px; z-index: 1; }

.ht-panel-empty { margin: 0; color: var(--ht-text-muted); }

.ht-shell {
  --ht-accent: #008ff0; /* blue 500 */
  --ht-accent-strong: #007dd2; /* blue 600 */
  --ht-accent-on: #3fa5fe; /* blue 400: a button on the accent */
  --ht-accent-soft: rgb(0 143 240 / 0.16);
  --ht-instance: #9a3cee; /* purple 600 */
  --ht-instance-soft: #efe4ff; /* purple 100 */
  /* An instance's name and icons in the panels; its outline and button on the canvas keep --ht-instance. */
  --ht-instance-ink: #9a3cee;
  --ht-locked: #8c8c8c;
}
/*
 * Dark: purple 600 is 2.8:1 on the dark panel, so in the panels an instance is purple 600's hue lighter (OKLCH L 0.72, 4.6:1 on its
 * ground), on purple 600 at 16%, as the accent's tint is. On the canvas, over the page, the outline and its white-lettered button stay purple 600.
 */
@media (prefers-color-scheme: dark) {
  .ht-shell {
    --ht-instance-soft: rgb(154 60 238 / 0.16);
    --ht-instance-ink: #bc85fe;
  }
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
.ht-panel.is-layers { overflow: hidden; }
.ht-panel.is-layers > .ht-tree { flex: 1 1 auto; min-height: 0; }
.ht-tree { position: relative; margin: -16px -16px -16px; padding: 16px 0; overflow: auto; overscroll-behavior: contain; }
.ht-tree-rows { display: flex; flex-direction: column; gap: 2px; width: max-content; min-width: 100%; }
/* A level closed: its rows' copies going a little way up and fading, clipped at its foot and above the rows rising after them (designer, 2026-11-08; LayerTreeView). */
.ht-tree-fold { position: absolute; left: 0; overflow: hidden; pointer-events: none; }
.ht-tree-row {
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
/* Pointed at: the selected row's ground at 60%, lighter than the row selected, in either mode. */
.ht-tree-row:hover { background: color-mix(in srgb, var(--ht-field) 60%, transparent); }
.ht-tree-row.is-selected { background: var(--ht-field); }
/* The canvas's layers after those off it. */
.ht-tree-row.is-first-on-canvas { margin-top: 4px; }
.ht-tree-row.is-first-on-canvas::after { content: ""; position: absolute; top: -4px; left: 16px; right: 16px; height: 1px; background: var(--ht-border); }
/* An instance's icons purple; its disclosure as every other row's (designer, 2026-11-08). */
.ht-tree-row.is-instance .ht-icon:not(.ht-tree-chevron > .ht-icon) { color: var(--ht-instance-ink); }
.ht-tree-row .ht-icon { flex: none; color: var(--ht-text-muted); }
.ht-tree-name { flex: none; }
.ht-tree-brief { display: flex; margin-left: auto; color: var(--ht-text-muted); }
/* An instance that edits alone (ticket 114): its mark in its own purple, after the brief's if it has one. */
.ht-tree-alone { display: flex; margin-left: auto; color: var(--ht-instance); }
.ht-tree-brief + .ht-tree-alone { margin-left: 4px; }
/* An effect's fold (Properties: FoldButton) is a layer's chevron, as a button (designer, 2026-11-08): the same look from these rules, 28px as the panel's other buttons. */
.ht-fold { all: unset; position: relative; }
.ht-tree-chevron { position: relative; z-index: 1; }
:is(.ht-tree-chevron, .ht-fold) { display: grid; flex: none; place-items: center; width: 22px; height: 22px; border-radius: 6px; }
.ht-fold { width: 28px; height: 28px; }
:is(.ht-tree-chevron[data-open], .ht-fold) { background: var(--ht-tool-chosen); box-shadow: var(--ht-disclosure-shadow); color: var(--ht-disclosure); }
:is(.ht-tree-chevron[data-open="false"], .ht-fold[aria-expanded="false"]) .ht-icon { rotate: -90deg; }
.ht-fold:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: 1px; }
/* A guide: down from the layer this one is in, and in to this one; or down past it, to a later one there. */
.ht-tree-guide { position: absolute; top: -16px; width: 15px; height: 30px; box-sizing: border-box; border-left: 1px solid var(--ht-guide); pointer-events: none; }
.ht-tree-guide.is-in { border-bottom: 1px solid var(--ht-guide); border-bottom-left-radius: 4px; }
.ht-tree-guide.is-in.is-leaf { width: 37px; }
.ht-tree-guide.is-past { top: 14px; height: 16px; }
.ht-tree-guide.is-through { top: -2px; height: 30px; }

.ht-layer-info { display: flex; flex-direction: column; gap: 0; }
/* The layer's name, and at its right the breakpoint worked at, if any (designer, 2026-11-08). */
.ht-layer-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.ht-layer-name {
  display: flex;
  align-self: flex-start;
  min-width: 0;
  align-items: center;
  gap: 4px;
  height: 24px;
  margin: 0;
  padding: 0 8px 0 6px;
  border-radius: 6px;
  background: var(--ht-field);
  font: inherit;
  font-weight: 500;
  letter-spacing: -0.02em;
  max-width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
}
.ht-layer-name > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ht-layer-name .ht-icon { flex: none; color: var(--ht-text-muted); }
.ht-layer-name.is-instance { background: var(--ht-instance-soft); color: var(--ht-instance-ink); }
.ht-layer-name.is-instance .ht-icon { color: inherit; }
/* Rows 24px high, 4px apart, no rules between them; the label 68px wide (designer, 2026-11-07). */
.ht-layer-info dl { display: grid; grid-template-columns: minmax(68px, auto) minmax(0, 1fr); gap: 4px 0; margin: 0; padding: 6px 8px; letter-spacing: -0.02em; }
.ht-layer-info :is(dt, dd) { display: flex; align-items: center; min-height: 24px; }
.ht-layer-info dt { padding-right: 12px; color: var(--ht-text-muted); }
.ht-layer-info dd { justify-content: flex-end; margin: 0; overflow-wrap: anywhere; text-align: right; }
.ht-layer-note { margin: 0; color: var(--ht-text-muted); }
/* The breakpoint the view worked in stands for, and the properties changed there on their own (ADR 0008). */
:is(.ht-breakpoint-badge, .ht-changes) { --ht-breakpoint: #8a38f5; }
@media (prefers-color-scheme: dark) { :is(.ht-breakpoint-badge, .ht-changes) { --ht-breakpoint: #b48aff; } }
/* As the layer's name is shown, in the breakpoint's purple, as an instance's name is in its own (designer, 2026-11-08). */
.ht-breakpoint-badge {
  display: flex;
  flex: none;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ht-breakpoint) 10%, transparent);
  color: var(--ht-breakpoint);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  white-space: nowrap;
}
.ht-change-breakpoint { color: var(--ht-breakpoint); }
.ht-source { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.ht-unlocated { color: var(--ht-text-muted); }

/* A section: its title, 24px high, with a rule to the edge (to its buttons, 4px short of them), then its rows, 4px apart (designer, 2026-11-08). */
.ht-section { margin: 0; padding: 0; border: 0; }
.ht-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  min-height: 24px;
  margin: 0 0 4px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--ht-title);
}
.ht-section-title::after { content: ""; flex: 1; min-width: 8px; height: 1px; background: var(--ht-border); }
.ht-section-header { display: flex; align-items: center; gap: 4px; box-sizing: border-box; height: 24px; margin: 0 0 4px; }
.ht-section-header .ht-section-title { flex: 1; min-height: 0; margin: 0 4px 0 0; padding: 0; }
/* A section's rows 6px apart, one under the next; things side by side in a row, 5px (designer, 2026-11-08). */
.ht-section > * + * { margin-top: 6px; }
.ht-section > :is(.ht-section-title, .ht-section-header) + * { margin-top: 0; }
/* A section with nothing under its title yet (Fill, Stroke): its title alone, 24px. */
.ht-section > :is(.ht-section-title, .ht-section-header):last-child { margin-bottom: 0; }
/* Things side by side in a row 5px apart: a paint's field and its −, as Independent corners and Wrap (designer, 2026-11-10). */
.ht-row { display: flex; align-items: center; gap: 5px; }
/* A field: 28px high (Figma: 03 Kind, 86:557; designer, 2026-11-08), raised on neutral 50 (--ht-input), its label (an icon or a word) before what it holds. */
/* Its corners 6px, as every field, choice and button in the panel (designer, 2026-11-08). */
.ht-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  min-width: 0;
  height: 28px;
  padding: 0 6px 0 8px;
  border-radius: 6px;
  background: var(--ht-input);
  box-shadow: var(--ht-input-shadow);
}
.ht-field:focus-within { background-color: var(--ht-input-hover); box-shadow: var(--ht-input-focus-shadow); }
/* Hovered, as it can be adjusted, a field darkens; chosen, it has the accent's edge; adjusted, it takes the accent (designer, 2026-11-08). The color eases between them. */
.ht-field, .ht-select, .ht-check { transition: background-color ${FIELD_STATE_MS}ms ease, box-shadow ${FIELD_STATE_MS}ms ease, color ${FIELD_STATE_MS}ms ease; }
/* Adjusted, it takes the accent at once, the click answered; reset, it eases back (designer, 2026-11-08). */
.ht-field.is-changed, .ht-check.is-changed, .ht-select-field.is-changed > .ht-select { transition: none; }
/* Dragged, it stays as it was until let go, then eases into the accent, its words with it (designer, 2026-11-08). */
.is-settling :is(.ht-field.is-changed, .ht-check.is-changed, .ht-select-field.is-changed > .ht-select),
.is-settling .ht-field.is-changed :is(.ht-icon, .ht-glyph, .ht-input, .ht-read-only, .ht-roll):not(.ht-popover *) { transition: background-color ${FIELD_SETTLE_MS}ms ease, color ${FIELD_SETTLE_MS}ms ease; }
@media (hover: hover) and (pointer: fine) {
  .ht-field:not(.is-changed, :focus-within):hover,
  .ht-select:not(:disabled, :focus-visible, [aria-expanded="true"], .ht-gap-mode, .is-changed > *):hover { background-color: var(--ht-input-hover); }
  /* A check, on the panel, takes the ground the buttons beside it take. */
  .ht-check:not(.is-changed):hover { background-color: var(--ht-field); }
}
.ht-field .ht-icon { flex: none; color: var(--ht-text-muted); }
/* Changed in this round (designer, 2026-11-07): the accent, reversed; its reset at its right end. */
.ht-field.is-changed { background: var(--ht-accent); box-shadow: var(--ht-changed-shadow); color: #fafafa; padding-right: 2px; }
/* Not in a picker open from the field: it is inside it, with its own colors. */
.ht-field.is-changed :is(.ht-icon, .ht-glyph, .ht-input, .ht-roll):not(.ht-popover *) { color: #fafafa; }
.ht-field.is-changed:focus-within { background-color: var(--ht-accent); box-shadow: var(--ht-changed-focus-shadow); }
.ht-reset {
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
.ht-field.is-changed .ht-reset:not(.ht-popover *), .ht-select-field > .ht-reset { width: 24px; height: 24px; border-radius: 4px; background: var(--ht-accent); }
.ht-field.is-changed .ht-reset:not(.ht-popover *):hover, .ht-select-field > .ht-reset:hover { background: var(--ht-accent-on); }
/* At the field's right end, after a gradient's name too. */
.ht-color-field > .ht-reset { margin-left: auto; }
/* A Variable's name, a gradient's, and their buttons, in a changed field: light on the accent too. */
.ht-field.is-changed .ht-read-only:not(.ht-popover *) { color: #fafafa; }
.ht-field.is-changed :is(.ht-variable-chip-name, .ht-icon-button):not(.ht-popover *):hover { background: var(--ht-accent-on); }
.ht-section-header .ht-reset { color: var(--ht-accent); }
.ht-section-header .ht-reset:hover { background: var(--ht-field); }
.ht-reset:focus-visible { outline: 2px solid var(--ht-accent-strong); outline-offset: -2px; }
/*
 * One reset taking several fields back (a size with its sizing, a color with its opacity): a button of the row's own, at its left, outside
 * the fields, which make room for it, 5px from the fields as unjoined things in a row are. It looks as a button that stays on (Wrap, on)
 * does, from the same rules below: 28px as the fields, 6px corners, white on the accent, blue 600 hovered (designer, 2026-11-08).
 */
:is(.ht-size-row, .ht-color-row) > .ht-reset { align-self: center; margin-right: 3px; }
/*
 * A changed field inside a picker (a gradient's angle, a stop): light on the accent, with no reset, keeping its right inset and its width:
 * the color's row has the one reset, for all of it (designer, 2026-11-08).
 */
.ht-popover .ht-field.is-changed :is(.ht-icon, .ht-glyph, .ht-input, .ht-read-only, .ht-roll) { color: #fafafa; }
.ht-popover .ht-field.is-changed { padding-right: 6px; }
/*
 * A shadow's type fills its row up to its −, which stands at the right end, as a blur's does; changed, its reset at its right end
 * (designer, 2026-11-08). With .ht-select-field, so it wins over that rule's flex: none further down: on its own class it lost, and hugged its text.
 */
.ht-select-field.ht-effect-type-field { flex: 1; min-width: 0; }
.ht-select-field.ht-effect-type-field > .ht-select { flex: 1; width: auto; min-width: 0; }
/*
 * Clicked again to go back (Wrap), a toggle has no reset of its own: changed, it is marked in the accent (designer, 2026-11-08).
 * Wrap on is in the accent already; changed to off, its icon in the accent on the accent's tint.
 */
.ht-section .ht-icon-button.is-changed[aria-pressed="false"] { background: var(--ht-accent-soft); color: var(--ht-accent); }
/* Its fields, marked with no reset of their own, keep their right inset; the sizing its width, its chevron where it was. */
:is(.ht-size-row .ht-field:not(.ht-variable-chip), .ht-color-row > .ht-color-field).is-changed:not(.ht-popover *) { padding-right: 6px; }
.ht-size-row > .ht-select-field.is-changed > .ht-select { width: 64px; padding-right: 24px; background-position: right 6px center; }
.ht-scrub, .ht-scrub-grip {
  display: grid;
  flex: none;
  place-items: center;
  align-self: stretch;
  cursor: ew-resize;
  touch-action: none;
}
.ht-input {
  all: unset;
  flex: 1;
  min-width: 0;
  height: 100%;
  font: inherit;
  color: var(--ht-text);
  cursor: default;
}
.ht-input:focus { cursor: text; }
/* A number: its figures all as wide, so a digit rolling in takes the room the one before had (designer, 2026-11-08). */
.ht-input.ht-number { font-variant-numeric: tabular-nums; }
/*
 * A number rolling (DigitRoll; designer, 2026-11-08): its digits over its own text, in the same type and place, the input's text clear
 * beneath; the overlay goes once they settle, or as the field is focused. Placed by DigitRoll, over the input, from the field's own box.
 */
.ht-input.is-rolled { -webkit-text-fill-color: transparent; }
.ht-field:has(> .ht-roll) { position: relative; }
.ht-roll {
  position: absolute;
  display: flex;
  align-items: center;
  font: inherit;
  font-variant-numeric: tabular-nums;
  white-space: pre;
  color: var(--ht-text);
  pointer-events: none;
}
.ht-roll-cell { position: relative; display: flex; }
.ht-roll-glyph { display: block; }
/* Rolling out, over the digit rolling in, in the same place. */
.ht-roll-glyph.is-leaving { position: absolute; top: 0; left: 0; }
.ht-textarea {
  all: unset;
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--ht-input);
  color: var(--ht-text);
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: var(--ht-input-shadow);
}
.ht-textarea:focus { background-color: var(--ht-input-hover); box-shadow: var(--ht-input-focus-shadow); cursor: text; }
.ht-textarea::placeholder { color: var(--ht-text-muted); }
/* A color, as the designer drew it (2026-11-07): its swatch 5.5px in from the field's edge (designer, 2026-11-08), its hex, then its opacity in a field of its own joined to it. */
.ht-color-row { display: flex; flex: 1; gap: 2px; min-width: 0; }
.ht-color-field { padding-left: 5.5px; }
.ht-color-field.is-joined { border-radius: 6px 2px 2px 6px; }
.ht-color-opacity { flex: none; width: 64px; border-radius: 2px 6px 6px 2px; }
/*
 * Every number that can be dragged: a short upright bar at its right end, dragged left and right as its icon is; changed, just left of its
 * reset (designer, 2026-11-08). Its 12px reach takes 4px of the gap before it and of the inset after it, so the value keeps its room.
 */
.ht-scrub-grip { width: 12px; margin: 0 -4px; }
/* Before a reset, just left of it: the bar 7px from it. */
.ht-scrub-grip:has(+ .ht-reset) { margin-right: -6px; }
/* Changed, an opacity keeps its right inset: it has no reset of its own, so its bar stays where it was. */
.ht-field.is-changed.ht-color-opacity { padding-right: 6px; }
/* Swaying left and right as it is dragged, the whole bar, upright, set on it directly (Scrub; designer, 2026-11-08). */
.ht-grip { width: 2px; height: 12px; border-radius: 1px; background: currentColor; opacity: 0.3; }
.ht-scrub-grip:hover > .ht-grip, .ht-field[data-scrubbing] .ht-grip { opacity: 0.6; }
/* On the accent, white: brighter, as white at 0.3 is lost on blue (designer, 2026-11-08: "white-ish"; 0.55 and 0.85 are the agent's, to confirm). */
.ht-field.is-changed .ht-grip:not(.ht-popover *) { opacity: 0.55; }
.ht-field.is-changed:is(:has(> .ht-scrub-grip:hover), [data-scrubbing]) .ht-grip:not(.ht-popover *) { opacity: 0.85; }
/* Dragged on its icon, label or grip, a field is the one chosen: the hover's darker ground and the 1px accent edge it has focused, till let go (designer, 2026-11-08). */
.ht-field[data-scrubbing] { box-shadow: var(--ht-input-focus-shadow); }
.ht-field[data-scrubbing]:not(.is-changed) { background-color: var(--ht-input-hover); }
.ht-field.is-changed[data-scrubbing] { box-shadow: var(--ht-changed-focus-shadow); }
/* 17px with its 0.5px line, 5.5px in from the field's top, bottom and left (designer, 2026-11-08). */
.ht-swatch {
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
.ht-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.ht-swatch::-webkit-color-swatch { border: 0; border-radius: 4px; }
.ht-swatch::-moz-color-swatch { border: 0; border-radius: 4px; }
.ht-section-header .ht-row { gap: 2px; }
.ht-subtitle { color: var(--ht-text-muted); font-weight: 400; }
/* A heading inside a section or popover (Stops, Project, Tailwind): small and quiet, no rule. */
.ht-section-title.ht-subtitle { min-height: 0; margin: 4px 0 2px; padding: 0; font-size: 11px; font-weight: 500; letter-spacing: -0.02em; color: var(--ht-text-muted); }
.ht-section-title.ht-subtitle::after { display: none; }
.ht-section-header:has(> .ht-subtitle) { height: 24px; padding: 0; }
.ht-read-only { color: var(--ht-text-muted); }
.ht-stop-position { flex: none; width: 48px; }
/* Several effects: a rule between them, 4px either side; an effect's own rows 4px apart (designer, 2026-11-08). */
/* Positioned: its details' copies fold up over it (Properties: EffectsSection). */
.ht-effect { position: relative; }
.ht-effect > * + * { margin-top: 4px; }
/* An effect's details folded away, copied as they were: they go up and fade, shown only above the rows rising after them (designer, 2026-11-08). */
.ht-effect-fold { position: absolute; left: 0; margin: 0; overflow: hidden; pointer-events: none; }
.ht-effect + .ht-effect { padding-top: 4px; border-top: 1px solid var(--ht-border); }
.ht-select.ht-effect-type { flex: 1; width: auto; min-width: 0; }
/* A see-through color shows over a checkerboard, as in Figma. */
.ht-gradient-bar, .ht-gradient-swatch {
  --ht-checker: repeating-conic-gradient(#e5e5e4 0% 25%, #ffffff 0% 50%) 0 0 / 8px 8px;
}
.ht-gradient-bar {
  position: relative;
  height: 24px;
  /* Room around it past its handles, 2px over it each way. */
  margin: 4px 6px;
  border-radius: 6px;
  background: var(--ht-gradient), var(--ht-checker);
  box-shadow: inset 0 0 0 0.5px var(--ht-border);
  cursor: copy;
}
.ht-stop-handle {
  position: absolute;
  top: 50%;
  box-sizing: border-box;
  width: 12px;
  height: 28px;
  border: 2px solid #ffffff;
  border-radius: 4px;
  background: linear-gradient(var(--ht-stop), var(--ht-stop)), var(--ht-checker);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.2), 0 1px 3px rgb(0 0 0 / 0.2);
  transform: translate(-50%, -50%);
  cursor: ew-resize;
  touch-action: none;
}
.ht-stop-handle:focus-visible, .ht-stop-handle:focus { outline: none; border-color: var(--ht-accent); }
.ht-gradient-swatch {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px #a0a19f;
}
.ht-icon-button {
  all: unset;
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--ht-text);
}
.ht-icon-button:hover { background: var(--ht-field); }
.ht-icon-button:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: -2px; }
/* A button that stays on in the panel (Independent corners, Wrap): the accent, as the tool chosen is (designer, 2026-11-07); a row's reset as it (designer, 2026-11-08). */
/* On the accent, the darker hairline and shadow a changed field has (designer, 2026-11-10); so too the − of an item added, a changed check and a changed segmented group. */
.ht-section .ht-icon-button[aria-pressed="true"], :is(.ht-size-row, .ht-color-row) > .ht-reset { background: var(--ht-accent); box-shadow: var(--ht-changed-shadow); color: #ffffff; }
.ht-section .ht-icon-button[aria-pressed="true"]:hover, :is(.ht-size-row, .ht-color-row) > .ht-reset:hover { background: var(--ht-accent-strong); }
/* An item added in this round (a shadow, a fill, a Stack): its − alone marked, as a button that stays on (designer, 2026-11-08). */
.ht-icon-button.is-added { background: var(--ht-accent); box-shadow: var(--ht-changed-shadow); color: #ffffff; }
.ht-icon-button.is-added:hover { background: var(--ht-accent-strong); }
/* A row's own button beside its fields (Independent corners, Wrap, a row's reset): as tall as they. */
.ht-row > .ht-icon-button, .ht-grid-2 > .ht-icon-button, :is(.ht-size-row, .ht-color-row) > .ht-reset { width: 28px; height: 28px; border-radius: 6px; }
.ht-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 5px;
}
/* A field's word label (Width, X, Blur): 32px wide at least, at its start (designer, 2026-11-08); a long one (Blur, Spread) at 9px. */
/* By a Variable's name too, as the field had it (designer, 2026-11-08). */
:is(.ht-scrub, .ht-variable-chip) > .ht-glyph { min-width: 32px; place-items: center start; }
:is(.ht-scrub, .ht-variable-chip) > .ht-glyph.is-small { font-size: 9px; letter-spacing: -0.02em; }
.ht-glyph {
  display: grid;
  place-items: center;
  min-width: 14px;
  color: var(--ht-text-muted);
  font-weight: 500;
  letter-spacing: -0.02em;
}
.ht-mixed { color: var(--ht-text-muted); }
.ht-size-row .ht-field { flex: 1; }
.ht-size-row { gap: 2px; }
/* The size and its sizing, joined: 2px corners where they meet, as a color and its opacity (designer, 2026-11-07). */
.ht-size-row > .ht-variable-slot > .ht-field { border-radius: 6px 2px 2px 6px; }
.ht-size-row > .ht-select-field { border-radius: 2px 6px 6px 2px; }
/* Parts side by side as one control (a stroke's weight, style and sides): 2px apart, 2px corners where they meet, 8px at the ends. */
.ht-row.ht-joined { gap: 2px; }
.ht-joined > :is(.ht-field, .ht-select, .ht-select-field) { border-radius: 2px; }
.ht-joined > :first-child { border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
.ht-joined > :is(.ht-select:last-of-type, .ht-select-field:last-child) { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }
/* A choice of part of a value (a stroke's line, its sides): changed in this round, in the accent with its reset at the right end, after the chevron, as a changed field (designer, 2026-11-07). */
/*
 * Its select takes the wrapper's corners, so the wrapper has a select's own 6px: without them, a choice on its own (the font, its weight)
 * came out square (designer, 2026-11-08). Where it is joined (the size's sizing, a stroke's parts), the joined corners above win.
 */
.ht-select-field { position: relative; display: flex; flex: none; border-radius: 6px; }
.ht-select-field > .ht-select { border-radius: inherit; }
.ht-select-field.is-changed > .ht-select {
  --ht-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23fafafa' stroke-width='1.67' stroke-linecap='round' stroke-linejoin='round' d='M12.25 5.875L8 10.125L3.75 5.875'/%3E%3C/svg%3E");
  width: 96px;
  padding-right: 48px;
  background-position: right 32px center;
  background-color: var(--ht-accent);
  box-shadow: var(--ht-changed-shadow);
  color: #fafafa;
}
.ht-select-field.is-changed > .ht-select:is([aria-expanded="true"], :focus-visible) { background-color: var(--ht-accent); box-shadow: var(--ht-changed-focus-shadow); }
.ht-select-field > .ht-reset { position: absolute; top: 2px; right: 2px; color: #fafafa; }
/* A choice: the select, with a chevron of its own (IconMCP's, its line as wide as the icons' at 12px); its options open in the menu below. */
.ht-select {
  --ht-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23737472' stroke-width='1.67' stroke-linecap='round' stroke-linejoin='round' d='M12.25 5.875L8 10.125L3.75 5.875'/%3E%3C/svg%3E");
  flex: none;
  box-sizing: border-box;
  width: 72px;
  height: 28px;
  padding: 0 24px 0 8px;
  border: 0;
  border-radius: 6px;
  background: var(--ht-chevron) no-repeat right 6px center / 12px 12px, var(--ht-input);
  box-shadow: var(--ht-input-shadow);
  color: var(--ht-text);
  font: inherit;
  text-align: left;
  text-overflow: ellipsis;
  appearance: none;
}
@media (prefers-color-scheme: dark) {
  .ht-select { --ht-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23a6a6a6' stroke-width='1.67' stroke-linecap='round' stroke-linejoin='round' d='M12.25 5.875L8 10.125L3.75 5.875'/%3E%3C/svg%3E"); }
}
.ht-select[aria-expanded="true"], .ht-select:focus-visible { background-color: var(--ht-input-hover); box-shadow: var(--ht-input-focus-shadow); outline: none; }
/* Inside the gap's field, at its end: its chevron alone, which chooses a number or Auto. */
.ht-select.ht-gap-mode { width: 20px; height: 20px; margin-left: auto; padding: 0; background: var(--ht-chevron) no-repeat center / 12px 12px; box-shadow: none; color: transparent; }
.ht-field.is-changed .ht-select.ht-gap-mode { filter: brightness(0) invert(1); }
.ht-auto { display: flex; align-items: center; }
/* A field's own button at its end (Min and max): 24px, on the field. */
.ht-field > .ht-field-action { margin-left: auto; margin-right: -4px; color: var(--ht-text-muted); }
.ht-field > .ht-field-action:hover { background: var(--ht-button); color: var(--ht-text); }
/* Shown while the field is hovered or focused, or its menu open (designer, 2026-11-07). */
.ht-field > .ht-field-action { opacity: 0; }
.ht-field:is(:hover, :focus-within) > .ht-field-action, .ht-field > .ht-field-action[aria-expanded="true"] { opacity: 1; }
/* How a layer is sized, quieter than its size (designer, 2026-11-07). */
.ht-size-row .ht-select { width: 64px; color: var(--ht-text-muted); font-weight: 500; letter-spacing: -0.02em; }
/* The options of a select, light as the Variables' popover, the one chosen over the select. */
.ht-menu {
  position: fixed;
  z-index: 3;
  box-sizing: border-box;
  max-height: var(--ht-menu-room, calc(100vh - 16px));
  overflow-y: auto;
  padding: 4px;
  border-radius: 12px;
  background: var(--ht-panel);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  color: var(--ht-text);
}
.ht-menu-option {
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
.ht-menu-option.is-active { background: var(--ht-field); }
.ht-menu-option[aria-disabled="true"] { color: var(--ht-text-muted); opacity: 0.6; }
.ht-menu-option .ht-icon { position: absolute; left: 6px; --ht-icon-size: 11px; }
/* A button's menu: no check marks, so no column for them; its choices under headings, a Variable's with its swatch. */
.ht-menu-list { outline: none; }
.ht-menu.is-plain .ht-menu-option { gap: 8px; padding-left: 8px; }
.ht-menu-heading { margin-top: 4px; padding: 8px 8px 4px; border-top: 1px solid var(--ht-border); color: var(--ht-text-muted); font-weight: 500; }
/* Two panels side by side, as Effects' + has its types, nearer the button, and to their left its shadow Variables: each a menu's
   panel of its own, 8px apart, tops aligned under the button, each scrolling on its own when long (designer, 2026-11-08). */
.ht-menu.is-split { padding: 0; overflow: visible; background: none; box-shadow: none; }
.ht-menu-list.is-columns { display: flex; align-items: flex-start; gap: 8px; }
/* Over its button, their feet level, by the button. */
.ht-menu.is-above .ht-menu-list.is-columns { align-items: flex-end; }
.ht-menu-column {
  box-sizing: border-box;
  /* At most 400px however tall the window, a long one scrolling: one as tall as the window looked out of place (designer, 2026-11-08). */
  max-height: min(var(--ht-menu-room, calc(100vh - 16px)), 400px);
  overflow-y: auto;
  padding: 4px;
  border-radius: 12px;
  background: var(--ht-panel);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
}
.ht-menu-column > .ht-menu-heading:first-child { margin-top: 0; border-top: 0; }
/* A segmented control: its choices on neutral 150, the one chosen raised on neutral 50. */
.ht-segmented-field {
  display: flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--ht-field);
}
.ht-segmented-field .ht-icon-button { width: 24px; height: 24px; border-radius: 4px; color: var(--ht-text-muted); }
.ht-segmented-field .ht-icon-button:hover { background: none; color: var(--ht-text); }
.ht-segmented-field .ht-icon-button[aria-checked="true"] { color: var(--ht-text); background: var(--ht-raised); box-shadow: var(--ht-chosen-shadow); }
/*
 * Changed in this round, the one chosen stays raised and white; the track behind the buttons takes the accent, the others' glyphs light on
 * it (white on blue 500 is 3.4:1), a light tint under one hovered; the group's reset pops out inside it at its right end, 24px on blue 400
 * as a changed field's, the group as wide as its buttons and the reset (designer, 2026-11-08).
 */
.ht-segmented-field.is-changed { background: var(--ht-accent); box-shadow: var(--ht-changed-shadow); }
.ht-segmented-field.is-changed .ht-icon-button:not([aria-checked="true"]) { color: #fafafa; }
.ht-segmented-field.is-changed .ht-icon-button:not([aria-checked="true"]):hover { background: rgb(255 255 255 / 0.16); }
/* Clicked, the accent at once, the click answered; taken back (its reset, undo), it eases back to the track's grey, as a check does. */
.ht-segmented-field, .ht-segmented-field .ht-icon-button { transition: background-color ${FIELD_STATE_MS}ms ${EASE_OUT}, color ${FIELD_STATE_MS}ms ${EASE_OUT}; }
.ht-segmented-field.is-changed, .ht-segmented-field.is-changed .ht-icon-button { transition: none; }
.ht-segmented-field > .ht-reset { width: 24px; height: 24px; border-radius: 4px; background: var(--ht-accent); color: #fafafa; }
.ht-segmented-field > .ht-reset:hover { background: var(--ht-accent-on); }
/*
 * The reset coming: from 90% at its left, where it grows out of the buttons, and transparent; going: it fades where it is. Changed by a key,
 * it is there at once; with reduced motion, it only fades (designer, 2026-11-08).
 */
.ht-segmented-field > .ht-reset { transform-origin: left center; transition: opacity ${RESET_POP_MS}ms ${EASE_OUT}, transform ${RESET_POP_MS}ms ${EASE_OUT}; }
@starting-style { .ht-segmented-field > .ht-reset { opacity: 0; transform: scale(0.9); } }
.ht-segmented-field.is-leaving > .ht-reset { opacity: 0; pointer-events: none; }
.ht-segmented-field[data-keyed] > .ht-reset { transition: none; }
@media (prefers-reduced-motion: reduce) {
  @starting-style { .ht-segmented-field > .ht-reset { transform: none; } }
}
/* On a row of its own (a text's alignment): as wide as its buttons, at the left, not the row's width (designer, 2026-11-08). */
.ht-segmented-field.ht-hug { width: fit-content; }
.ht-select.ht-font, .ht-grid-2 > .ht-select { width: 100%; }
/* A choice as wide as its place (a font, a font's weight): changed, too, its reset at its right end (designer, 2026-11-08). */
.ht-select-field:is(.ht-font-field, .ht-wide) { flex: 1; min-width: 0; }
.ht-select-field:is(.ht-font-field, .ht-wide) > .ht-select { width: 100%; }
/* The font: "Aa" in it at its left, where a field has its icon, its name after, where a field's words are (designer, 2026-11-08). */
.ht-font-field > .ht-select { padding-left: 32px; }
.ht-font-sample {
  flex: none;
  width: 16px;
  color: var(--ht-text-muted);
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}
.ht-font-field > .ht-font-sample { position: absolute; z-index: 1; top: 50%; left: 8px; transform: translateY(-50%); pointer-events: none; }
.ht-font-field.is-changed > .ht-font-sample { color: #fafafa; }
/* In the font's menu, each font's "Aa" before its name, where the select has it. */
.ht-menu-option > .ht-font-sample { margin-right: 8px; }
.ht-text-glyph { font-size: 11px; font-weight: 500; }
.ht-text-glyph.ht-underline { text-decoration: underline; }
.ht-text-glyph.ht-strikethrough { text-decoration: line-through; }
/* A Stack's alignment, at the left of its rows, as large as the two rows beside it. */
/* Half the row each, the grid and the column beside it, in line with the padding fields' two columns below (designer, 2026-11-08). */
.ht-align-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 5px; }
.ht-align {
  position: relative;
  display: grid;
  /* Each point the whole of its third, across and down, to click on. The outer lines, at a sixth and five sixths, sat too far out: they come back half that way, to 5/24 and 19/24; the middle ones stay at half (designer, 2026-11-08). */
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  box-sizing: border-box;
  min-width: 0;
  min-height: 62px;
  border-radius: 6px;
  background: var(--ht-input);
  box-shadow: var(--ht-input-shadow);
}
/* The lines, 0.5px, 6px in from the field's edges. Inside that box 5/24 of the field is 5/24 of the box less 3.5px; 19/24, 19/24 of it and 3.5px. */
.ht-align::before {
  content: "";
  position: absolute;
  inset: 6px;
  --ht-line: linear-gradient(var(--ht-border), var(--ht-border));
  background:
    var(--ht-line) calc(500% / 24 - 3.5px) 0 / 0.5px 100% no-repeat,
    var(--ht-line) 50% 0 / 0.5px 100% no-repeat,
    var(--ht-line) calc(1900% / 24 + 3.5px) 0 / 0.5px 100% no-repeat,
    var(--ht-line) 0 calc(500% / 24 - 3.5px) / 100% 0.5px no-repeat,
    var(--ht-line) 0 50% / 100% 0.5px no-repeat,
    var(--ht-line) 0 calc(1900% / 24 + 3.5px) / 100% 0.5px no-repeat;
  pointer-events: none;
}
.ht-align-point {
  all: unset;
  position: relative;
  display: grid;
  place-items: center;
}
.ht-align-point::before {
  content: "";
  position: relative;
  width: 8px;
  height: 4px;
  border-radius: 1px;
  background: var(--ht-border);
}
/* Each mark where its lines cross, not at its third's middle: an outer third's mark a 24th of the grid, an eighth of the third, toward the middle (designer, 2026-11-08). */
.ht-align-point:nth-child(3n + 1)::before { left: 12.5%; }
.ht-align-point:nth-child(3n)::before { left: -12.5%; }
.ht-align-point:nth-child(-n + 3)::before { top: 12.5%; }
.ht-align-point:nth-child(n + 7)::before { top: -12.5%; }
.ht-align-point:hover::before { background: #a0a19f; }
/* Where it was before this round's change: a larger dash, muted (designer, 2026-11-08). */
.ht-align-point.is-before::before { width: 12px; height: 6px; border-radius: 2px; background: #a0a19f; }
/* The point chosen: dark, as a check ticked, till it changes in this round; then the accent (designer, 2026-11-08). */
.ht-align-point[aria-checked="true"]::before { width: 24px; height: 12px; border-radius: 4px; background: var(--ht-ink); box-shadow: 0 1px 1.5px rgb(0 0 0 / 0.25); }
/* Its blue edge 1px, as every selected edge: 0.5px was hard to see (designer, 2026-11-08). */
.ht-align.is-changed .ht-align-point[aria-checked="true"]::before { background: var(--ht-accent); box-shadow: inset 0 0 0 1px var(--ht-accent-on), 0 1px 1.5px rgb(13 153 255 / 0.4); }
.ht-align-point:focus-visible { outline: 1px solid var(--ht-accent); }
.ht-align-options { display: grid; min-width: 0; gap: 6px; align-content: start; }
/* A check: its box, then its words, on the panel (designer, 2026-11-08). Half a row, beside a field or another check; alone in its row, the whole of it. */
.ht-grid-2 > .ht-check:last-child:nth-child(odd) { grid-column: 1 / -1; }
.ht-check {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 28px;
  /* Its 16px box 6px in from the left, as from the top and bottom of its 28px row (designer, 2026-11-08). */
  padding: 0 6px;
  border-radius: 6px;
  color: var(--ht-text-muted);
  font-weight: 500;
  letter-spacing: -0.02em;
}
/* Its box, as the designer drew its states (2026-11-07): 16px (designer, 2026-11-08), its check 13px, no line round it; a faint check on neutral 200 when off, a light one on neutral 800 when on. */
.ht-check input {
  --ht-check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='%23a0a19f' stroke-width='1.25' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.40625 7.4375L5.46875 10.5L11.5938 3.9375'/%3E%3C/svg%3E");
  appearance: none;
  flex: none;
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 0;
  border-radius: 4px;
  background: var(--ht-check) no-repeat center / 13px 13px, var(--ht-check-off);
}
.ht-check input:checked {
  --ht-check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='%23e5e5e4' stroke-width='1.25' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.40625 7.4375L5.46875 10.5L11.5938 3.9375'/%3E%3C/svg%3E");
  background-color: var(--ht-ink);
}
/* Dark, the box ticked is light: its check in the panel's grey. */
@media (prefers-color-scheme: dark) {
  .ht-check input:checked { --ht-check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='%232c2c2c' stroke-width='1.25' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.40625 7.4375L5.46875 10.5L11.5938 3.9375'/%3E%3C/svg%3E"); }
}
.ht-check input:indeterminate { background: var(--ht-check-off); }
/* Changed, in the accent; checked again to go back, it has no reset of its own (designer, 2026-11-08). */
.ht-check.is-changed { background: var(--ht-accent); box-shadow: var(--ht-changed-shadow); color: #fafafa; }
.ht-check input:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: 1px; }

.ht-viewport {
  position: relative;
  overflow: hidden;
  outline: none;
  touch-action: none;
  /* Clicks here select layers, never the page's text. */
  user-select: none;
  -webkit-user-select: none;
  background: var(--ht-canvas);
}
/* Over the words typed in, where a press places the caret (ticket 144). */
.ht-viewport.is-over-typed { cursor: text; }
.ht-viewport.is-pan-ready { cursor: grab; }
.ht-viewport.is-drawing { cursor: crosshair; }
.ht-viewport.is-briefing { cursor: copy; }
.ht-viewport-message {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 16px;
  color: var(--ht-text-muted);
  text-align: center;
  text-wrap: balance;
}
.ht-viewport.is-panning { cursor: grabbing; }
/*
 * While the page shrinks into the canvas or grows back, it is drawn above all of the shell, the tools, the Layers'
 * chevrons and any menu open (z-index up to 3) too, so nothing of the editor shows on it (designer, 2026-11-08): the
 * panels move with its edges, but the tools and the toasts are over the canvas, and a panel the frame starts under
 * stays under it. Its own gray goes meanwhile, the shell's showing instead: drawn above them, it hid the tools from
 * the first frame of the move, as they still sat over the canvas.
 */
.ht-viewport.is-travelling { overflow: visible; z-index: 4; background: transparent; }
.ht-stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.ht-canvas {
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
.ht-canvas.is-beside { position: absolute; top: 0; }
/* The layers off the canvas (ADR 0009), where they were left on the stage, each as it looks, on nothing of its own. */
.ht-off-canvas-layers { position: absolute; top: 0; left: 0; }
.ht-off-canvas {
  position: absolute;
  display: block;
  border: 0;
  color-scheme: normal;
  background: transparent;
  pointer-events: none;
}
.ht-off-canvas[hidden] { display: none; }
/* Above each view, as a Frame's name in Figma: its name and the widths it covers; full screen and × at its right end. */
.ht-view-label {
  position: absolute;
  display: flex;
  align-items: center;
  /* Its buttons at its right end, its name and widths taking up the room before them, or gone. */
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  height: 20px;
  overflow: hidden;
  color: var(--ht-text-muted);
  white-space: nowrap;
}
/* Its name and widths: a button selecting the page in the view (designer, 2026-11-08). */
.ht-view-title { display: flex; flex: 0 1 auto; align-items: center; gap: 6px; min-width: 0; margin-right: auto; height: 20px; padding: 0; border: 0; border-radius: 4px; background: none; font: inherit; color: inherit; cursor: default; }
.ht-view-title:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: 1px; }
.ht-view-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--ht-text); font-weight: 500; }
/*
 * Where there is too little room, what goes (ViewLabel): at rest, and pointed at or focused in (designer, 2026-11-08). Out of sight
 * but still there to be focused, as full screen is again once played: focused, the label is as pointed at, and shows it.
 */
.ht-view-label:not(:hover, :focus-within) .is-rest-hidden, .ht-view-label:is(:hover, :focus-within) .is-pointed-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  opacity: 0;
  pointer-events: none;
}
.ht-view-range { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.ht-view-play, .ht-view-delete { flex: none; width: 20px; height: 20px; }
.ht-add-view { position: absolute; display: flex; height: 20px; align-items: center; }
.ht-add-view .ht-icon-button { width: 20px; height: 20px; }
.ht-add-view-width {
  all: unset;
  box-sizing: border-box;
  width: 72px;
  height: 20px;
  padding: 0 6px;
  border-radius: 5px;
  background: var(--ht-panel);
  box-shadow: 0 0 0 1px var(--ht-accent);
  color: var(--ht-text);
}
.ht-add-view-width[aria-invalid] { box-shadow: 0 0 0 1px var(--ht-danger, #f24822); }

.ht-selection, .ht-hover {
  --ht-selection: var(--ht-accent);
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--ht-selection);
  pointer-events: none;
}
/* Gone at once while a value changes; fades back once it settles. */
.ht-selection { transition: opacity 150ms ${EASE_OUT}; }
.ht-selection[data-hidden] { opacity: 0; transition: none; }
:is(.ht-selection, .ht-hover)[data-kind="instance"] { --ht-selection: var(--ht-instance); }
:is(.ht-selection, .ht-hover)[data-kind="locked"] { --ht-selection: var(--ht-locked); }
/*
 * On the top right of the layer selected alone, above it: the selection toolbar,
 * its buttons in one row, its right edge on the layer's.
 */
.ht-selection-toolbar {
  position: absolute;
  display: flex;
  gap: 4px;
  transform: translate(-100%, calc(-100% - 12px));
}
.ht-selection-tool {
  all: unset;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px 0 4px;
  border-radius: 6px;
  background: var(--ht-instance);
  color: #fff;
  font-weight: 500;
  white-space: nowrap;
  cursor: default;
}
.ht-selection-tool:focus-visible { outline: 2px solid var(--ht-instance); outline-offset: 2px; }
/* Edit alone, pressed (ticket 114): the instance edits alone, no longer following the others. */
.ht-selection-tool[aria-pressed="true"] { background: #fff; color: var(--ht-instance); box-shadow: inset 0 0 0 1px var(--ht-instance); }
/* An instance that edits alone, and what is in it, outlined dashed on the canvas (ticket 114). */
:is(.ht-selection, .ht-hover)[data-alone] { border-style: dashed; }
/*
 * The briefs (ticket 121): cards beside the views, drawn on the screen where the stage has them, as large at any zoom
 * from FULL_SIZE_FROM up as Figma's comments, shrinking with the canvas below it till opened (ticket 134, designer,
 * 2026-11-11); a grey dashed line from each to its layer, across and down only, 1px at any zoom (designer, 2026-11-10).
 */
.ht-brief-cards { position: absolute; top: 0; left: 0; pointer-events: none; }
.ht-brief-stage { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.ht-brief-lines { position: absolute; top: 0; left: 0; overflow: visible; }
.ht-brief-lines path { fill: none; stroke: var(--ht-text-muted); stroke-width: 1; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; }
.ht-brief-lines circle { fill: var(--ht-text-muted); }
.ht-brief-lines g:not([data-selected]) { opacity: 0.6; }
/*
 * A card as the designer drew it in Figma (2026-11-10): the brief alone in the editor's small type, 220px wide, a
 * soft edge and shadow whether selected or written in, never the accent's; and, written in, the accent's arrow that
 * sets it under the brief on the right, as the count of changes is drawn.
 */
.ht-brief-card {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  padding: 6px;
  border-radius: 12px;
  background: var(--ht-input);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 1px 1px rgb(0 0 0 / 0.15);
  color: var(--ht-text);
  font: 400 11px/16px ${EDITOR_FONT};
  pointer-events: auto;
  cursor: text;
}
/* Written in, over the card under it: a card opened again grows down from where it is (designer, 2026-11-10). */
.ht-brief-card[data-writing] { z-index: 1; }
.ht-brief-card-text { align-self: stretch; box-sizing: border-box; margin: 0; padding: 4px; min-height: 24px; white-space: pre-wrap; overflow-wrap: anywhere; }
.ht-brief-card-field { all: unset; display: block; align-self: stretch; box-sizing: border-box; padding: 4px; min-height: 24px; font: inherit; color: inherit; white-space: pre-wrap; overflow-wrap: anywhere; resize: none; overflow: hidden; }
.ht-brief-card-field::placeholder { color: var(--ht-text-muted); }
.ht-brief-card-set { all: unset; position: relative; isolation: isolate; display: grid; flex: none; place-items: center; width: 24px; height: 24px; color: #daecff; cursor: pointer; --ht-icon-size: 14px; }
.ht-brief-card-set::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: 6px;
  background: linear-gradient(var(--ht-accent-on), var(--ht-accent));
  box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.15), 0 1px 1px rgb(0 0 0 / 0.15);
}
.ht-brief-card-set:hover::before { background: linear-gradient(var(--ht-accent), var(--ht-accent-strong)); }
.ht-brief-card-set:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: 0; border-radius: 6px; }

/* Typing in text, as in Figma: a thin blue box round the words, which grows as they do. */
.ht-selection[data-kind="typing"] { transition: none; }
.ht-selection-lock {
  position: absolute;
  bottom: 100%;
  left: -1px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  border-radius: 2px;
  background: var(--ht-selection);
  color: #fff;
}

/*
 * The handles of the layer selected alone, as Figma has them: white squares on the corners, the edges' unseen
 * but for the cursor. The square is larger to press than it looks.
 */
.ht-handles { --ht-selection: var(--ht-accent); }
.ht-handles[data-kind="instance"] { --ht-selection: var(--ht-instance); }
.ht-handles[data-kind="locked"] { --ht-selection: var(--ht-locked); }
.ht-handle { position: absolute; box-sizing: border-box; pointer-events: auto; touch-action: none; }
.ht-handle[data-corner] { border: 1px solid var(--ht-selection); background: #fff; }
.ht-handles:not([data-small]) .ht-handle[data-corner]::before { content: ""; position: absolute; inset: -3px; }
/*
 * In the views other than the one worked in, the selection lighter, with no handles: they are not resized there (designer, 2026-11-09,
 * 2026-11-10). So too the layer pointed at, in the views other than the one pointed in.
 */
:is(.ht-selection, .ht-hover)[data-away] { border-color: color-mix(in srgb, var(--ht-selection) 40%, transparent); }
/* A gradient's handles on the layer, while its fill's picker is open: drawn by the editor layer alone. */
.ht-gradient-handles { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.ht-gradient-handles g { pointer-events: all; touch-action: none; }
.ht-gradient-line, .ht-gradient-shape { fill: none; stroke: #ffffff; stroke-width: 1.5; filter: drop-shadow(0 0 1px rgb(0 0 0 / 0.6)); }
.ht-gradient-shape { stroke-dasharray: 4 3; }
.ht-gradient-knob :is(circle, rect):last-child { fill: #ffffff; stroke: rgb(0 0 0 / 0.35); stroke-width: 1; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.25)); }
.ht-gradient-stop rect { stroke: #ffffff; stroke-width: 2; filter: drop-shadow(0 0 1px rgb(0 0 0 / 0.5)) drop-shadow(0 1px 2px rgb(0 0 0 / 0.2)); }
/* Below the layer being resized: its size. */
.ht-size-label {
  position: absolute;
  transform: translateX(-50%);
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--ht-accent);
  color: #fff;
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

/* Dragging: where the layer would go in a Stack, and loose text, which has no element to move, following the pointer. */
.ht-drop-line {
  position: absolute;
  border-radius: 1px;
  background: var(--ht-accent);
  pointer-events: none;
}
.ht-drag-ghost {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--ht-accent);
  background: var(--ht-accent-soft);
  pointer-events: none;
}

/* Variables, as in Figma: a button beside a field lists them; a field set to one shows its name. */
.ht-variable-slot {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.ht-variable-slot > .ht-field { min-width: 0; }
/* A field with no Variables to offer (yet): laid out as if it were where its slot is, so the slot stays around it as they come in. */
.ht-variable-slot.is-alone { display: contents; }
.ht-variable-chip { gap: 4px; padding-right: 0; }
/* Its detach and its reset side by side, with no room between (designer, 2026-11-08). */
.ht-variable-chip > .ht-icon-button + .ht-reset { margin-left: -4px; }
.ht-variable-chip-name {
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
.ht-variable-chip-name:hover { background: rgb(0 0 0 / 0.06); }
@media (prefers-color-scheme: dark) { .ht-variable-chip-name:hover { background: rgb(255 255 255 / 0.08); } }
.ht-variable-chip-name:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: -2px; }
/* A Variable close to the value typed: its name at the end of the field, quieter than a Variable's own. */
.ht-variable-hint {
  all: unset;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px var(--ht-border);
  color: var(--ht-text-muted);
  font-size: 10px;
  line-height: 16px;
  cursor: default;
}
.ht-variable-hint:hover { background: var(--ht-panel); color: var(--ht-text); }
.ht-variable-hint:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: -2px; }
.ht-field.is-changed .ht-variable-hint:not(.ht-popover *) { box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.5); color: #fafafa; }
.ht-field.is-changed .ht-variable-hint:not(.ht-popover *):hover { background: var(--ht-accent-on); }
/* The Variables a field lists as it is focused and typed into: left of its panel, clear of the tools, else under or above the field (ticket 127). */
.ht-matches {
  position: fixed;
  z-index: 2;
  box-sizing: border-box;
  max-height: 224px;
  overflow: auto;
  padding: 4px;
  border-radius: 8px;
  background: var(--ht-panel);
  box-shadow:
    inset 0 0 0 1px var(--ht-border),
    0 1px 2px rgb(0 0 0 / 0.12),
    0 8px 24px rgb(0 0 0 / 0.16);
  color: var(--ht-text);
}
.ht-swatch-button {
  display: block;
  background: var(--ht-swatch);
}
.ht-swatch-button:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: 1px; }
/* A color pointed at, wherever one is chosen: a white line inside it and a darker one round it, as the Variables tab's swatches have;
   in a color's field, pointing anywhere on the field does it, not over its open picker (designer, 2026-11-08). */
.ht-swatch-button:hover,
.ht-color-field:hover:not(:has(.ht-popover:hover)) > .ht-swatch-button,
.ht-variants-named-item:hover > .ht-variants-named-swatch,
.ht-variants-named-item:focus-visible > .ht-variants-named-swatch,
.ht-variable-option:hover > .ht-variable-preview:not(.is-shadow) { box-shadow: inset 0 0 0 1.5px #fff, 0 0 0 1px rgb(0 0 0 / 0.35); }
.ht-mixed-swatch { background: repeating-conic-gradient(#e6e6e6 0% 25%, #ffffff 0% 50%) 0 0 / 8px 8px; }

/* The color picker's own, as in Figma: a square of saturation and brightness, bars of hue and opacity, the color typed. */
.ht-color-panel {
  --ht-checker: repeating-conic-gradient(#e6e6e6 0% 25%, #ffffff 0% 50%) 0 0 / 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.ht-color-panel > * { flex: none; }
.ht-color-panel > .ht-color-area {
  position: relative;
  flex: 0 1 160px;
  min-height: 80px;
  cursor: crosshair;
  touch-action: none;
  outline: none;
}
/* Its corners rounded on what it shows only: pressed right in a corner, it still takes the corner's color. */
.ht-color-area::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, var(--ht-hue));
}
.ht-color-thumb {
  position: absolute;
  top: 50%;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: var(--ht-thumb);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.2), 0 1px 3px rgb(0 0 0 / 0.25);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.ht-color-area:focus-visible .ht-color-thumb, .ht-color-slider:focus-visible .ht-color-thumb { box-shadow: 0 0 0 2px var(--ht-accent), 0 1px 3px rgb(0 0 0 / 0.2); }
.ht-color-bars { display: flex; align-items: center; gap: 8px; }
/* The bars, 8px high, as the designer narrowed them (2026-11-07). */
.ht-color-sliders { display: flex; flex: 1; flex-direction: column; gap: 12px; min-width: 0; }
.ht-color-bars > .ht-icon-button { width: 28px; height: 28px; border-radius: 8px; background: var(--ht-field); color: var(--ht-text-muted); }
.ht-color-slider {
  position: relative;
  flex: none;
  height: 8px;
  margin-inline: 7px;
  border-radius: 4px;
  background: var(--ht-track);
  box-shadow: inset 0 0 0 0.5px var(--ht-border);
  touch-action: none;
  outline: none;
}
.ht-color-values { gap: 4px; }
.ht-color-values .ht-field { flex: 1; min-width: 0; }
.ht-select.ht-color-format { width: 64px; color: var(--ht-text-muted); font-weight: 500; }
.ht-color-values .ht-color-opacity { flex: none; width: 56px; }
.ht-color-oklch { display: flex; flex-direction: column; gap: 8px; }
.ht-color-oklch-row { display: flex; align-items: center; gap: 4px; }
.ht-color-oklch-row > .ht-color-slider { flex: 1; }
.ht-color-oklch-row > .ht-glyph { flex: none; width: 12px; color: var(--ht-text-muted); text-align: center; }
.ht-color-oklch-row > .ht-field { flex: none; width: 56px; }
/* The stop the picker sets. */
.ht-stop-row.is-chosen .ht-color-field { box-shadow: var(--ht-input-focus-shadow); }
.ht-stop-handle.is-chosen { border-color: var(--ht-accent); }
/* The popovers of the Design panel (the color picker, the Variables): floating at its left, in its colors (designer, 2026-11-07). */
.ht-popover {
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
  background: var(--ht-panel);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  color: var(--ht-text);
  outline: none;
  /* A gradient's stops and the picker under them can be taller than the window. */
  overflow-y: auto;
}
/*
 * A popover or menu closed with the pointer leaves: it fades and moves 4px down, interruptible, taking no clicks
 * meanwhile; opened, or closed with a key, it is there or gone at once (designer, 2026-11-08). With reduced motion it only fades.
 */
:is(.ht-menu, .ht-popover).is-leaving {
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity ${POPOVER_EXIT_MS}ms ${EASE_OUT}, transform ${POPOVER_EXIT_MS}ms ${EASE_OUT};
}
@media (prefers-reduced-motion: reduce) {
  :is(.ht-menu, .ht-popover).is-leaving { transform: none; }
}
/* The change list, every change in it applied: it fades out at once, as it was, taking no clicks meanwhile (designer, 2026-11-09). */
.ht-changes.is-leaving { opacity: 0; pointer-events: none; transition: opacity ${POPOVER_EXIT_MS}ms ${EASE_OUT}; }
.ht-popover-header { display: flex; align-items: center; justify-content: space-between; }
.ht-popover-header .ht-section-title { min-height: 0; margin: 0; padding: 0; }
.ht-popover-header .ht-section-title::after { display: none; }
/* Its tabs, as the Design panel's (Custom, Variables); a fill's types inside them, as a segmented control. */
.ht-tabs { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--ht-tab-track); }
.ht-tabs[role="radiogroup"] { background: var(--ht-field); }
/*
 * A column as the popover is: the search as wide as it, and the list under it scrolling within the popover.
 * In a window too short for the popover, the list scrolls, or the picker's square is shorter; shorter still, the popover scrolls.
 */
.ht-tab-panel { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.ht-tab-panel > .ht-field { flex: none; }
.ht-tab {
  all: unset;
  flex: 1;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 24px;
  text-align: center;
  color: var(--ht-title);
}
.ht-tabs[role="tablist"] .ht-tab { font-size: 12px; }
.ht-tab:is([aria-selected="true"], [aria-checked="true"]) { background: var(--ht-raised); box-shadow: var(--ht-raised-shadow); color: var(--ht-panel-label); }
.ht-tab:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: -2px; }
.ht-variable-search {
  flex: none;
  box-sizing: border-box;
  height: 28px;
  padding: 0 8px 0 30px;
  border-radius: 6px;
  background: var(--ht-field) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23737472' stroke-width='1.43' stroke-linecap='round'%3E%3Ccircle cx='7.25' cy='7.25' r='4.5'/%3E%3Cline x1='10.5' y1='10.5' x2='13.25' y2='13.25'/%3E%3C/svg%3E") no-repeat 8px center / 14px 14px;
}
/* Dark, its magnifier the muted grey, as the select's chevron. */
@media (prefers-color-scheme: dark) {
  .ht-variable-search { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23a6a6a6' stroke-width='1.43' stroke-linecap='round'%3E%3Ccircle cx='7.25' cy='7.25' r='4.5'/%3E%3Cline x1='10.5' y1='10.5' x2='13.25' y2='13.25'/%3E%3C/svg%3E"); }
}
.ht-variable-search::placeholder { color: var(--ht-text-muted); font-weight: 500; }
/* The picker's colors: the palette of the Variables tab, without its ramps' names. */
.ht-variants-ramp.is-bare { position: relative; grid-template-columns: repeat(var(--ht-steps, 11), minmax(0, 1fr)); }
.ht-variants-swatch[aria-selected="true"] { box-shadow: inset 0 0 0 1px #fff, 0 0 0 2px var(--ht-accent); }
.ht-variable-list { overflow: auto; min-height: 0; margin: 0 -12px; padding: 0 12px; }
.ht-variable-list .ht-subtitle { margin: 8px 0 4px; }
.ht-variable-list > [role="group"]:first-child .ht-subtitle { margin-top: 0; }
.ht-variable-option {
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
.ht-variable-option:hover, .ht-variable-option[aria-selected="true"] { background: var(--ht-field); }
.ht-variable-option:focus-visible { outline: 2px solid var(--ht-accent); outline-offset: -2px; }
.ht-variable-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ht-variable-value { color: var(--ht-text-muted); font-variant-numeric: tabular-nums; }
.ht-variable-preview {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: var(--ht-swatch);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
}
.ht-variable-preview.is-shadow { background: var(--ht-shadow-sample); }
/* Marks over a view, as in Figma's guides: red where a layer lines up and for distances measured with ⌥, magenta for equal spacing. 1px, labels one size, at any zoom. */
.ht-marks { --ht-line: #f24822; --ht-spacing: #e81cc4; pointer-events: none; }
.ht-mark {
  --ht-mark-color: var(--ht-line);
  position: absolute;
  box-sizing: border-box;
  width: 0;
  height: 0;
  border-left: 1px solid var(--ht-mark-color);
  transform: translateX(-0.5px);
}
.ht-mark[data-across] { border-left: 0; border-top: 1px solid var(--ht-mark-color); transform: translateY(-0.5px); }
.ht-mark[data-type="gap"] { --ht-mark-color: var(--ht-spacing); }
.ht-mark[data-type="extension"] { border-left-style: dashed; border-top-style: dashed; }
.ht-mark-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--ht-mark-color);
  color: #fff;
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* A space between layers is labelled beside it, out of the way of the line. */
.ht-mark[data-type="gap"][data-across] .ht-mark-label { top: auto; bottom: 4px; transform: translateX(-50%); }
.ht-mark[data-type="gap"]:not([data-across]) .ht-mark-label { left: 4px; transform: translateY(-50%); }

/* The Variables tab: the project's Variables, by group (designer, 2026-11-07). */
.ht-variants { display: flex; flex-direction: column; gap: 16px; }
.ht-variants .ht-row > .ht-field { flex: 1; }
/* The Variables source (All): tracked as the other muted labels (designer, 2026-11-08). */
.ht-select.ht-variants-source { width: 76px; color: var(--ht-text-muted); font-weight: 500; letter-spacing: -0.02em; }
.ht-variants .ht-input[type="search"]::-webkit-search-cancel-button { display: none; }
.ht-variants .ht-input::placeholder { color: var(--ht-text-muted); font-weight: 500; letter-spacing: -0.02em; }
.ht-variants-count { flex: none; order: 1; font-size: 11px; font-weight: 400; color: var(--ht-text-faint); }
.ht-section-title > .ht-variants-count + * { order: 2; }
.ht-section-title:has(.ht-variants-count)::after { order: 2; }
.ht-section-header .ht-icon-button[aria-expanded="false"] .ht-icon { rotate: -90deg; }
.ht-variants-part { display: flex; flex-direction: column; gap: 2px; }
.ht-variants-part + .ht-variants-part { margin-top: 6px; }
.ht-variants-subtitle { margin: 0; padding: 4px 0 2px; color: var(--ht-text-muted); font-weight: 500; letter-spacing: -0.02em; }
.ht-variants-palette { display: flex; flex-direction: column; gap: 2px; }
/* A ramp's row on its scale's columns: Tailwind's 11, or its own steps (designer, 2026-11-08). A swatch is at most
   20px, its size in the 320px panel: the panel widened, only the room between the name and the swatches grows, the
   swatches at the right; narrower, as with 12 steps or more, they shrink to fit (designer, 2026-11-08). */
.ht-variants-ramp { display: grid; grid-template-columns: minmax(50px, 1fr) repeat(var(--ht-steps, 11), minmax(0, 20px)); gap: 2px; align-items: center; }
.ht-variants-ramp-name { overflow: hidden; color: var(--ht-panel-label); text-overflow: ellipsis; white-space: nowrap; }
.ht-variants-swatch, .ht-variants-empty { aspect-ratio: 1; border-radius: 4px; }
/* A step the ramp has no color for: a placeholder in its column, the size of a swatch, outlined dashed and not
   filled, so it reads as no color here rather than a white one (designer, 2026-11-08). Not a control: nothing on hover. */
.ht-variants-empty { box-sizing: border-box; border: 1px dashed var(--ht-border); pointer-events: none; }
/* The named colors (designer, 2026-11-08): under the ramps, each its swatch and its name, two a row; a group of
   names, and the color after one, from a row's start. */
.ht-variants-named { display: flex; flex-direction: column; gap: 2px; }
.ht-variants-palette > :is(.ht-variants-ramp, .ht-variants-more) + .ht-variants-named { margin-top: 6px; }
.ht-variants-named-title { margin: 0; padding: 2px 0; color: var(--ht-panel-label); }
.ht-variants-names { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 4px; }
.ht-variants-named-item { all: unset; display: flex; align-items: center; gap: 6px; min-width: 0; box-sizing: border-box; height: 24px; padding: 0 4px; border-radius: 6px; }
.ht-variants-named-item.is-start { grid-column: 1; }
.ht-variants-named-item:hover, .ht-variants-named-item:focus-visible { background: var(--ht-field); outline: none; }
.ht-variants-named-item[aria-disabled="true"] { cursor: default; }
.ht-variants-named-swatch { flex: none; width: 16px; height: 16px; border-radius: 4px; background: var(--ht-swatch); box-shadow: inset 0 0 0 0.5px var(--ht-border); }
.ht-variants-named-item.is-in-use .ht-variants-named-swatch { box-shadow: inset 0 0 0 1px #fff, 0 0 0 2px var(--ht-accent); }
.ht-variants-named-name { overflow: hidden; color: var(--ht-panel-label); text-overflow: ellipsis; white-space: nowrap; }
.ht-variants-swatch {
  all: unset;
  aspect-ratio: 1;
  border-radius: 4px;
  background: var(--ht-swatch);
  box-shadow: inset 0 0 0 0.5px var(--ht-border);
}
.ht-variants-swatch:hover, .ht-variants-swatch:focus-visible { box-shadow: inset 0 0 0 1.5px #fff, 0 0 0 1px rgb(0 0 0 / 0.35); outline: none; }
.ht-variants-swatch.is-in-use { box-shadow: inset 0 0 0 1px #fff, 0 0 0 2px var(--ht-accent); }
/* A ramp's name with its second line's fold (ticket 143, prototype A): a chevron in the panel's gutter left of the
   name, which keeps its width; right folded, down open, as a group's disclosure. The name and the gutter the button,
   its hover a field's ground behind both. In the picker, which shows no names, the chevron alone in its list's gutter. */
.ht-variants-more-button { all: unset; position: relative; isolation: isolate; display: flex; align-items: center; min-width: 0; height: 20px; border-radius: 4px; color: var(--ht-panel-label); }
.ht-variants-more-button::before { content: ""; position: absolute; inset: -2px -2px -2px -16px; z-index: -1; border-radius: 4px; }
.ht-variants-more-button:hover::before { background: var(--ht-field); }
.ht-variants-more-button:focus-visible::before { outline: 2px solid var(--ht-accent); outline-offset: -2px; }
.ht-variants-more-button:active { scale: 0.97; }
.ht-variants-more-button > .ht-icon { position: absolute; left: -14px; top: 4px; width: 12px; height: 12px; color: var(--ht-text-faint); rotate: -90deg; transition: rotate ${CHEVRON_TURN_MS}ms ${EASE_OUT}; }
.ht-variants-more-button[aria-expanded="true"] > .ht-icon { rotate: 0deg; }
.ht-variants-more-button:hover > .ht-icon { color: var(--ht-text); }
.ht-variants-more-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ht-variants-more-button.is-bare { position: absolute; top: 0; bottom: 0; left: -12px; width: 12px; height: auto; }
.ht-variants-more-button.is-bare::before { inset: 0 1px; }
.ht-variants-more-button.is-bare > .ht-icon { left: 1px; top: calc(50% - 5px); width: 10px; height: 10px; }
/* A ramp's second line, under its first: its height eased open and closed, the gap above it with it; folded, nothing
   of it shows or is reached. Open, a swatch's ring shows past its edges, as on the first line. */
.ht-variants-more { display: grid; grid-template-rows: 0fr; margin-top: -2px; transition: grid-template-rows ${SECOND_LINE_MS}ms ${EASE_OUT}; }
.ht-variants-more.is-open { grid-template-rows: 1fr; }
.ht-variants-more-lines { min-height: 0; clip-path: inset(-4px); visibility: hidden; transition: visibility 0s ${SECOND_LINE_MS}ms; }
.ht-variants-more.is-open > .ht-variants-more-lines { visibility: visible; transition: none; }
.ht-variants-more-lines > .ht-variants-ramp { margin-top: 2px; }
.ht-variants-more .ht-variants-swatch { opacity: 0; translate: 0 -3px; transition: opacity ${SECOND_LINE_FADE_MS}ms ${EASE_OUT}, translate ${SECOND_LINE_MS}ms ${EASE_OUT}; }
.ht-variants-more.is-open .ht-variants-swatch { opacity: 1; translate: none; transition-delay: calc(var(--ht-order, 0) * ${SECOND_LINE_STAGGER_MS}ms); }
@media (prefers-reduced-motion: reduce) {
  .ht-variants-more, .ht-variants-more-lines, .ht-variants-more .ht-variants-swatch, .ht-variants-more.is-open .ht-variants-swatch, .ht-variants-more-button > .ht-icon { transition: none; }
  .ht-variants-more .ht-variants-swatch { translate: none; }
}
.ht-variants-row { display: flex; align-items: center; gap: 8px; box-sizing: border-box; min-height: 24px; padding: 0 8px; border-radius: 8px; }
.ht-variants-row.is-button { all: unset; display: flex; align-items: center; gap: 8px; box-sizing: border-box; min-height: 28px; padding: 2px 8px; border-radius: 8px; }
.ht-variants-row.is-button:hover, .ht-variants-row.is-button:focus-visible, .ht-variants-tile:hover, .ht-variants-tile:focus-visible { background: var(--ht-field); outline: none; }
:is(.ht-variants-row.is-button, .ht-variants-tile).is-in-use { background: var(--ht-tool-chosen); box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1); }
.ht-variants-name { flex: none; width: 60px; overflow: hidden; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.ht-variants-row.is-button .ht-variants-name { flex: 1; }
.ht-variants-track { flex: 1; min-width: 0; }
.ht-variants-bar { display: block; height: 6px; border-radius: 2px; background: var(--ht-bar); }
.ht-variants-value { flex: none; margin-left: auto; color: var(--ht-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
/*
 * A length's bar is as long as it is, 1px a px (designer, 2026-11-08). One
 * longer than its track, by however much, runs on behind the value, which
 * sits on the panel's color, and shows past it up to the row's edge, the
 * panel's inner edge: (length - track) * 100000 is 0 or less for a bar that
 * fits, and past the row for one that does not, even by a hundredth of a px.
 * Clipped there, it does not scroll the panel sideways.
 */
.ht-variants-row.is-length { overflow: clip; }
.ht-variants-row.is-length .ht-variants-track { container-type: inline-size; }
.ht-variants-row.is-length .ht-variants-bar { width: max(1px, var(--ht-length), (var(--ht-length) - 100cqw) * 100000); }
.ht-variants-row.is-length .ht-variants-value { padding: 0 2px 0 4px; margin-right: -2px; background: var(--ht-panel); }
/* Pointed at, a bar too long for its row shows whole, on white, out over the canvas. */
.ht-variants-whole {
  position: fixed;
  z-index: 3;
  box-sizing: border-box;
  padding: 8px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--ht-popup);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  transform: translateY(-100%);
  pointer-events: none;
}
.ht-variants-sample { flex: none; width: 48px; overflow: hidden; color: var(--ht-sample); font-weight: 500; line-height: 1.15; white-space: nowrap; }
.ht-variants-tiles { display: grid; gap: 6px; }
.ht-variants-tiles.is-four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ht-variants-tiles.is-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ht-variants-tile {
  all: unset;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 10px 8px 8px;
  border-radius: 8px;
  background: var(--ht-field);
}
.ht-variants-radius { width: 40px; height: 40px; box-sizing: border-box; border: 1px solid var(--ht-text-faint); border-radius: 2px; background: var(--ht-radius-block); }
.ht-variants-shadow { width: 48px; height: 28px; margin-top: 4px; border-radius: 6px; background: var(--ht-shadow-sample); }
.ht-variants-label { display: flex; align-self: stretch; justify-content: space-between; gap: 4px; font-weight: 500; }
.ht-variants-label.is-center { justify-content: center; }
/*
 * A radius tile's name over its value, the name cut short when the tile is
 * too narrow for it (designer, 2026-11-08). Both centered under the corner
 * drawing (designer, 2026-11-08: at the left they looked out of place); a cut
 * name fills the tile, so its ellipsis stays at its end. The tile never grows
 * past its column.
 */
.ht-variants-tile { min-width: 0; }
.ht-variants-label.is-stacked { flex-direction: column; align-items: center; gap: 0; min-width: 0; font-weight: 400; }
.ht-variants-label.is-stacked > * { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ht-variants-label.is-stacked .ht-variants-value { margin-left: 0; }
.ht-variants-tile[aria-disabled="true"], .ht-variants-row.is-button[aria-disabled="true"] { cursor: default; }
.ht-variants-tip {
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
.ht-variants-tip.ht-tip { z-index: 2147483647; display: block; max-width: 240px; font: 400 11px/16px ${EDITOR_FONT}; -webkit-font-smoothing: antialiased; white-space: normal; transform: none; }
@media (hover: hover) and (pointer: fine) {
  .ht-variants-tip.ht-tip.is-easing { transition: opacity ${TIP_IN_MS}ms ${EASE_OUT}, transform ${TIP_IN_MS}ms ${EASE_OUT}; }
  @starting-style { .ht-variants-tip.ht-tip.is-easing { opacity: 0; transform: scale(0.97); } }
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: reduce) {
  @starting-style { .ht-variants-tip.ht-tip.is-easing { transform: none; } }
}
.ht-variants-tip-name { font-weight: 500; }
.ht-variants-tip-value { color: #a0a19f; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ht-variants-tip-hint { color: #a0a19f; }
/*
 * A shadow Variable's layers, pointed at: white, as the popovers' shape, out
 * over the canvas at the Design panel's left (designer, 2026-11-08). Its name,
 * then a block a shadow, a thin rule between; each value under a muted label,
 * four to a row, the color across the row below.
 */
.ht-variants-details {
  position: fixed;
  z-index: 3;
  box-sizing: border-box;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  border-radius: 12px;
  background: var(--ht-popup);
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12);
  color: var(--ht-text);
  font-size: 11px;
  pointer-events: none;
}
/* A line under the name, as between its layers (designer, 2026-11-09). */
.ht-variants-details-name { overflow: hidden; padding-bottom: 8px; border-bottom: 1px solid var(--ht-rule-soft); font-weight: 500; font-size: 12px; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.ht-variants-details-layer { display: flex; flex-direction: column; gap: 6px; }
.ht-variants-details-layer + .ht-variants-details-layer { padding-top: 8px; border-top: 1px solid var(--ht-rule-soft); }
.ht-variants-details-head { display: flex; justify-content: space-between; gap: 8px; }
.ht-variants-details-title { font-weight: 500; }
.ht-variants-details-label { color: var(--ht-text-muted); }
.ht-variants-details-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 8px; margin: 0; }
.ht-variants-details-pair { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ht-variants-details-pair.is-color { grid-column: 1 / -1; }
.ht-variants-details-value { display: flex; align-items: center; gap: 6px; margin: 0; font-variant-numeric: tabular-nums; }
.ht-variants-details-swatch { flex: none; width: 12px; height: 12px; border-radius: 3px; background: var(--ht-swatch); box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.15); }
.ht-variants-details-opacity { margin-left: auto; }

@media (prefers-reduced-motion: reduce) {
  .ht-segment, .ht-selection, .ht-progress-done { transition: none; }
  /* A toast only fades: it does not rise or sink. */
  .ht-toast { animation-name: ht-toast-fade-in; transition-property: opacity; }
  .ht-toast.is-fading { translate: none; }
}
`;
