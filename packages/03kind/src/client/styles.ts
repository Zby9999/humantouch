import { EASE_IN_OUT, EASE_OUT, FIELD_SETTLE_MS, FIELD_STATE_MS, POPOVER_EXIT_MS, RESET_POP_MS, SCRUB_RULER_IN_MS, SCRUB_RULER_OUT_MS, TOAST_FADE_MS, TOOL_SLIDE_MS } from "./motion";
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
  inset: -4px;
  width: 48px;
  height: 48px;
  rotate: -90deg;
  pointer-events: none;
}
.tk-progress circle { fill: none; stroke-width: 2.5; stroke-dasharray: 1; }
.tk-progress-track { stroke: rgb(30 30 30 / 0.16); }
.tk-progress-done {
  stroke: #0d99ff;
  stroke-linecap: round;
  transition: stroke-dashoffset 240ms ${EASE_OUT};
}
/* Pressed and held: the ring that runs out when the toggle unlocks. */
.tk-progress-hold { stroke: #fff; stroke-dashoffset: 1; opacity: 0; }
.is-holding .tk-progress-hold { opacity: 1; animation: tk-hold var(--tk-hold) linear forwards; }
@keyframes tk-hold { to { stroke-dashoffset: 0; } }

/* Changes not yet applied, on the toggle's top-right edge. It opens the change list. */
.tk-badge {
  all: unset;
  position: absolute;
  top: -4px;
  right: -4px;
  box-sizing: border-box;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 5px;
  background: #0d99ff;
  box-shadow: 0 0 0 2px #fff;
  color: #fff;
  font: 600 11px/18px ${EDITOR_FONT};
  font-variant-numeric: tabular-nums;
  text-align: center;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}
/* A larger target than it looks. */
.tk-badge::before { content: ""; position: absolute; inset: -6px; }
.tk-badge:focus-visible { outline: 2px solid #0d99ff; outline-offset: 2px; }

/* The change list: dark like the toggle, opening toward the middle of the window. */
.tk-changes {
  --tk-text: #fff;
  --tk-field: #383838;
  --tk-accent: #0d99ff;
  position: absolute;
  box-sizing: border-box;
  width: 280px;
  max-height: min(400px, calc(100vh - 96px));
  overflow: auto;
  overscroll-behavior: contain;
  padding: 4px 0;
  border-radius: 12px;
  background: #1e1e1e;
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 0.08),
    0 1px 2px rgb(0 0 0 / 0.2),
    0 8px 24px rgb(0 0 0 / 0.24);
  color: #fff;
  font: 400 11px/16px ${EDITOR_FONT};
  outline: none;
}
.tk-dock[data-corner^="bottom"] .tk-changes { bottom: calc(100% + 8px); }
.tk-dock[data-corner^="top"] .tk-changes { top: calc(100% + 8px); }
.tk-dock[data-corner$="right"] .tk-changes { right: 0; }
.tk-dock[data-corner$="left"] .tk-changes { left: 0; }
.tk-changes-title { margin: 0; padding: 8px 12px; font: inherit; font-weight: 600; }
.tk-changes-note { margin: 0; padding: 0 12px 8px; color: rgb(255 255 255 / 0.6); }
.tk-changes-list { margin: 0; padding: 0; list-style: none; }
.tk-change {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 8px 0 12px;
}
.tk-change:hover { background: rgb(255 255 255 / 0.06); }
.tk-change-text { display: grid; flex: 1; min-width: 0; }
.tk-change-name, .tk-change-values { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-change-values { color: rgb(255 255 255 / 0.6); }
.tk-changes-confirm { padding: 8px 12px 0; border-top: 1px solid rgb(255 255 255 / 0.08); }
.tk-changes-confirm p { margin: 0; }
.tk-changes-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px; }
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
.tk-button.is-danger { background: #f24822; }
.tk-button.is-danger:hover { background: #dc3412; }
.tk-button.is-primary { background: #0d99ff; color: #fff; }
.tk-button.is-primary:hover { background: #007be5; }

/* A notice, dark like the change list: the Agent seems to have stopped (ticket 67). */
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
  --tk-tool-chosen: #ffffff; /* neutral 0: the tool chosen */
  --tk-panel-label: #525351; /* neutral 600: what the Design panel shows */
  --tk-raised-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 1px 1px rgb(0 0 0 / 0.15);
  --tk-tab-track: #d4d4d3; /* neutral 300: the Design and Variants tabs */
  color-scheme: light;
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 320px;
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
.tk-shell.is-layers-hidden { grid-template-columns: minmax(0, 1fr) 320px; }
/*
 * Its size, corners, color and place on the screen those of the button in the Layers panel's top that hid them, so
 * showing and hiding the panel leaves it where it is (designer, 2026-11-08): 24px, 6px corners, the panel's padding
 * from the left, centred on the 28px header from the top. Its gray is the canvas's own, so a hairline keeps it a button.
 */
.tk-show-layers {
  all: unset;
  position: absolute;
  top: 18px;
  left: 16px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--tk-button);
  box-shadow: inset 0 0 0 0.5px var(--tk-border);
  color: var(--tk-text);
}
.tk-show-layers:hover { background: var(--tk-border); }
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

/* The tools, at the top right of the canvas, 8px from the Design panel: one above another, the one chosen raised in white (designer, 2026-11-08). As high as the views' tops, under their labels: higher, they would cover the last view's label and its +. */
/* Figma (03 Kind, node 169:1359): 4px around the tools, 3px between, a 0.5px neutral 300 outline; the icons neutral 600, the chosen one's neutral 500 (designer, 2026-11-08). */
.tk-tools {
  position: absolute;
  top: 72px;
  right: 328px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px;
  border-radius: 12px;
  background: var(--tk-panel);
  box-shadow: 0 0 0 0.5px var(--tk-border);
}
.tk-tools .tk-icon-button { position: relative; width: 32px; height: 32px; border-radius: 8px; color: var(--tk-panel-label); }
.tk-tools .tk-icon-button[aria-pressed="true"] { background: none; color: var(--tk-text-muted); }
/* The white under the chosen tool, one for all three: it moves by transform alone, a tool (32px) and a gap (3px) a step (designer, 2026-11-08). */
.tk-tools-backing {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--tk-tool-chosen);
  box-shadow: 0 1px 1px rgb(0 0 0 / 0.15), 0 0 0 0.5px rgb(0 0 0 / 0.15);
  transform: translateY(calc(var(--tk-tool-index, 0) * 35px));
}
.tk-tools-backing.is-sliding { transition: transform ${TOOL_SLIDE_MS}ms ${EASE_IN_OUT}; }
@media (prefers-reduced-motion: reduce) {
  .tk-tools-backing.is-sliding { transition: none; }
}
.tk-shell.is-playing > .tk-tools { display: none; }
/* A tool's tip: the Variables' dark one, at the toolbar's left, 8px off it, level with the tool (designer, 2026-11-08). */
.tk-variants-tip.tk-tools-tip { position: absolute; right: calc(100% + 8px); transform: translateY(-50%); }
/* A toast, as in Figma: a dark pill of one line, at the bottom middle of the canvas, over it. */
.tk-toasts {
  position: absolute;
  bottom: 16px;
  left: 320px;
  right: 320px;
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
  left: 336px;
  z-index: 1;
  display: flex;
  max-width: calc(100% - 672px);
  pointer-events: none;
}
.tk-shell:is(.is-layers-hidden, .is-playing) > .tk-page-toasts { left: 16px; max-width: calc(100% - 352px); }
.tk-toast.is-page { display: flex; align-items: center; gap: 8px; }
.tk-toast.is-page > span { overflow: hidden; text-overflow: ellipsis; }
.tk-toast.is-page:has(.tk-button) { padding-block: 4px; padding-right: 4px; }
.tk-toast.is-page .tk-button { flex: none; }
@keyframes tk-toast-fade-in { from { opacity: 0; } }

/*
 * A panel's top. The Layers': a button that hides them, and their title with a rule to the edge, as a section's.
 * The Design panel's: what it shows (Design, or Variants with nothing selected) at the left, the changes so far and the way back at the right, a rule under them.
 */
.tk-panel-header { display: flex; align-items: center; gap: 4px; min-height: 28px; }
.tk-panel.is-design > .tk-panel-header { min-height: 30px; padding-bottom: 6px; border-bottom: 1px solid var(--tk-border); }
/* What the Design panel shows: Design, or Variants with nothing selected (designer, 2026-11-08). Its auto margin puts the count and the way back at the right. */
.tk-panel-label { margin: 0 auto 0 2px; font: inherit; font-size: 12px; font-weight: 500; letter-spacing: -0.02em; color: var(--tk-panel-label); }
.tk-panel-title {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0 0 0 4px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--tk-title);
}
.tk-panel-title::after { content: ""; flex: 1; height: 1px; background: var(--tk-border); }
.tk-panel-header > .tk-icon-button { width: 30px; height: 30px; border-radius: 8px; background: var(--tk-button); }
.tk-panel.is-layers .tk-panel-header > .tk-icon-button { width: 24px; height: 24px; border-radius: 6px; }
.tk-panel-header > .tk-icon-button:hover { background: var(--tk-border); }
.tk-count {
  all: unset;
  box-sizing: border-box;
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border-radius: 8px;
  background: var(--tk-accent);
  color: #daecff;
  font: 500 12px/30px ${EDITOR_FONT};
  font-variant-numeric: tabular-nums;
  text-align: center;
  cursor: pointer;
}
.tk-count:hover { background: var(--tk-accent-strong); }
.tk-count:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 2px; }
/* Opened from the count: below the panel's top, over the panel, which would clip it. */
.tk-panel-header .tk-changes { position: fixed; top: 52px; right: 16px; z-index: 1; }

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
.tk-tree { display: flex; flex-direction: column; gap: 2px; margin: 0 -16px; }
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
.tk-tree-name { overflow: hidden; text-overflow: ellipsis; }
.tk-tree-brief { display: flex; margin-left: auto; color: var(--tk-text-muted); }
.tk-tree-chevron { position: relative; z-index: 1; display: grid; flex: none; place-items: center; width: 22px; height: 22px; border-radius: 6px; }
.tk-tree-chevron[data-open] { background: #ffffff; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 1px 1.5px rgb(0 0 0 / 0.15); color: #717171; }
.tk-tree-chevron[data-open="false"] .tk-icon { rotate: -90deg; }
/* A guide: down from the layer this one is in, and in to this one; or down past it, to a later one there. */
.tk-tree-guide { position: absolute; top: -16px; width: 15px; height: 30px; box-sizing: border-box; border-left: 1px solid var(--tk-guide); pointer-events: none; }
.tk-tree-guide.is-in { border-bottom: 1px solid var(--tk-guide); border-bottom-left-radius: 4px; }
.tk-tree-guide.is-in.is-leaf { width: 37px; }
.tk-tree-guide.is-past { top: 14px; height: 16px; }
.tk-tree-guide.is-through { top: -2px; height: 30px; }

.tk-layer-info { display: flex; flex-direction: column; gap: 0; }
.tk-layer-name {
  display: flex;
  align-self: flex-start;
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
.tk-breakpoint { --tk-breakpoint: #8a38f5; }
@media (prefers-color-scheme: dark) { .tk-breakpoint { --tk-breakpoint: #b48aff; } }
.tk-breakpoint-range { color: var(--tk-breakpoint); font-variant-numeric: tabular-nums; }
.tk-breakpoint-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
.tk-breakpoint .tk-layer-note { margin: 0; }
.tk-change-breakpoint { color: #b48aff; }
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
.tk-section > * + * { margin-top: 4px; }
.tk-section > :is(.tk-section-title, .tk-section-header) + * { margin-top: 0; }
/* A section with nothing under its title yet (Fill, Stroke): its title alone, 24px. */
.tk-section > :is(.tk-section-title, .tk-section-header):last-child { margin-bottom: 0; }
.tk-row { display: flex; align-items: center; gap: 4px; }
/* A field: 30px high (designer, 2026-11-08), on neutral 150, its label (an icon or a word) before what it holds. */
.tk-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  min-width: 0;
  height: 30px;
  padding: 0 6px 0 8px;
  border-radius: 8px;
  background: var(--tk-field);
  box-shadow: inset 0 0 0 1px transparent;
}
.tk-field:focus-within { box-shadow: inset 0 0 0 1px var(--tk-accent); }
/* Hovered, as it can be adjusted, a field darkens; chosen, it has the accent's edge; adjusted, it takes the accent (designer, 2026-11-08). The color eases between them. */
.tk-field, .tk-select, .tk-check { transition: background-color ${FIELD_STATE_MS}ms ease, box-shadow ${FIELD_STATE_MS}ms ease, color ${FIELD_STATE_MS}ms ease; }
/* Adjusted, it takes the accent at once, the click answered; reset, it eases back (designer, 2026-11-08). */
.tk-field.is-changed, .tk-check.is-changed, .tk-select-field.is-changed > .tk-select { transition: none; }
/* Dragged, it stays as it was until let go, then eases into the accent, its words with it (designer, 2026-11-08). */
.is-settling :is(.tk-field.is-changed, .tk-check.is-changed, .tk-select-field.is-changed > .tk-select),
.is-settling .tk-field.is-changed :is(.tk-icon, .tk-glyph, .tk-input, .tk-read-only):not(.tk-popover *) { transition: background-color ${FIELD_SETTLE_MS}ms ease, color ${FIELD_SETTLE_MS}ms ease; }
@media (hover: hover) and (pointer: fine) {
  .tk-field:not(.is-changed, :focus-within):hover,
  .tk-select:not(:disabled, :focus-visible, [aria-expanded="true"], .tk-gap-mode, .is-changed > *):hover { background-color: var(--tk-button); }
  /* A check, on the panel, takes the ground the buttons beside it take. */
  .tk-check:not(.is-changed):hover { background-color: var(--tk-field); }
}
.tk-field .tk-icon { flex: none; color: var(--tk-text-muted); }
/* Changed in this round (designer, 2026-11-07): the accent, reversed; its reset at its right end. */
.tk-field.is-changed { background: var(--tk-accent); color: #fafafa; padding-right: 2px; }
/* Not in a picker open from the field: it is inside it, with its own colors. */
.tk-field.is-changed :is(.tk-icon, .tk-glyph, .tk-input):not(.tk-popover *) { color: #fafafa; }
.tk-field.is-changed:focus-within { box-shadow: inset 0 0 0 1px var(--tk-accent-strong); }
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
/* In a changed field, 26px on blue 400, 2px in from its end (designer, 2026-11-08). */
.tk-field.is-changed .tk-reset:not(.tk-popover *), .tk-select-field > .tk-reset { width: 26px; height: 26px; background: var(--tk-accent-on); }
.tk-field.is-changed .tk-reset:not(.tk-popover *):hover, .tk-select-field > .tk-reset:hover { background: var(--tk-accent-strong); }
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
 * the fields, which make room for it, 4px from the fields as unjoined things in a row are. It looks as a button that stays on (Wrap, on)
 * does, from the same rules below: 30px as the fields, 8px corners, white on the accent, blue 600 hovered (designer, 2026-11-08).
 */
:is(.tk-size-row, .tk-color-row) > .tk-reset { align-self: center; margin-right: 2px; }
/* A changed field inside a picker (a gradient's angle, a stop): light on the accent, its reset as any changed field's. */
.tk-popover .tk-field.is-changed :is(.tk-icon, .tk-glyph, .tk-input, .tk-read-only) { color: #fafafa; }
.tk-popover .tk-field.is-changed .tk-reset { width: 26px; height: 26px; background: var(--tk-accent-on); color: #fafafa; }
.tk-popover .tk-field.is-changed .tk-reset:hover { background: var(--tk-accent-strong); }
/* A stop's position, changed: room for its reset beside the number. */
.tk-stop-position.is-changed { width: 78px; }
/* A shadow's type, changed: as wide as it was, its reset at its right end. */
.tk-effect-type-field { flex: 1; min-width: 0; border-radius: 8px; }
.tk-effect-type-field.is-changed > .tk-select { flex: 1; width: auto; min-width: 0; }
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
.tk-textarea {
  all: unset;
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--tk-field);
  color: var(--tk-text);
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: inset 0 0 0 1px transparent;
}
.tk-textarea:focus { box-shadow: inset 0 0 0 1px var(--tk-accent); cursor: text; }
.tk-textarea::placeholder { color: var(--tk-text-muted); }
/* A color, as the designer drew it (2026-11-07): its swatch 3px in from the field's edge, its hex, then its opacity in a field of its own joined to it. */
.tk-color-row { display: flex; flex: 1; gap: 2px; min-width: 0; }
.tk-color-field { padding-left: 6px; }
.tk-color-field.is-joined { border-radius: 8px 2px 2px 8px; }
.tk-color-opacity { flex: none; width: 64px; border-radius: 2px 8px 8px 2px; }
/*
 * Every number that can be dragged: a short upright bar at its right end, dragged left and right as its icon is; changed, just left of its
 * reset (designer, 2026-11-08). Its 12px reach takes 4px of the gap before it and of the inset after it, so the value keeps its room.
 */
.tk-scrub-grip { width: 12px; margin: 0 -4px; }
/* Before a reset, just left of it: the bar 7px from it. */
.tk-scrub-grip:has(+ .tk-reset) { margin-right: -6px; }
/* Changed, an opacity keeps its right inset: it has no reset of its own, so its bar stays where it was. */
.tk-field.is-changed.tk-color-opacity { padding-right: 6px; }
/* Tilted from its foot as it is dragged, set on it directly (Scrub). */
.tk-grip { width: 2px; height: 12px; border-radius: 1px; background: currentColor; opacity: 0.3; transform-origin: 50% 100%; }
.tk-scrub-grip:hover > .tk-grip, .tk-field[data-scrubbing] .tk-grip { opacity: 0.6; }
/* On the accent, white: brighter, as white at 0.3 is lost on blue (designer, 2026-11-08: "white-ish"; 0.55 and 0.85 are the agent's, to confirm). */
.tk-field.is-changed .tk-grip:not(.tk-popover *) { opacity: 0.55; }
.tk-field.is-changed:is(:has(> .tk-scrub-grip:hover), [data-scrubbing]) .tk-grip:not(.tk-popover *) { opacity: 0.85; }
/*
 * Held, a ruler under the field, as wide as it, over what is below, its ticks moving with the value as a camera lens's ring, 2px per unit,
 * taller every 10, the centre marked in the accent; it fades out at both ends, so it reads as curving away (designer, 2026-11-08).
 * It fades and slides 4px down into place, and fades out once let go; with reduced motion, it only fades.
 */
.tk-field:has(> :is(.tk-scrub, .tk-scrub-grip) > .tk-ruler) { position: relative; }
.tk-ruler {
  position: absolute;
  z-index: 2;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  height: 10px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--tk-panel);
  color: var(--tk-text-muted);
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 30%, #000 70%, transparent);
  mask-image: linear-gradient(to right, transparent, #000 30%, #000 70%, transparent);
  transition: opacity ${SCRUB_RULER_IN_MS}ms ${EASE_OUT}, transform ${SCRUB_RULER_IN_MS}ms ${EASE_OUT};
}
@starting-style { .tk-ruler { opacity: 0; transform: translateY(-4px); } }
.tk-ruler.is-leaving { opacity: 0; transition: opacity ${SCRUB_RULER_OUT_MS}ms ${EASE_OUT}; }
.tk-ruler-strip {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -20px;
  right: -20px;
  background:
    linear-gradient(to right, currentColor 1px, transparent 1px) 0 0 / 20px 7px repeat-x,
    linear-gradient(to right, currentColor 1px, transparent 1px) 0 0 / 2px 4px repeat-x;
  opacity: 0.7;
}
/* The centre: where the value is read. */
.tk-ruler::after { content: ""; position: absolute; top: 0; left: calc(50% - 0.5px); width: 1px; height: 10px; background: var(--tk-accent); }
@media (prefers-reduced-motion: reduce) {
  @starting-style { .tk-ruler { transform: none; } }
}
/* Dragged on its icon, label or grip, a field is the one chosen: the hover's darker ground and the 1px accent edge it has focused, till let go (designer, 2026-11-08). */
.tk-field[data-scrubbing] { box-shadow: inset 0 0 0 1px var(--tk-accent); }
.tk-field[data-scrubbing]:not(.is-changed) { background-color: var(--tk-button); }
.tk-field.is-changed[data-scrubbing] { box-shadow: inset 0 0 0 1px var(--tk-accent-strong); }
/* A paint's row: its field, then its remove button, 2px apart. */
.tk-row.tk-paint-row { gap: 2px; }
/* 20px with its 0.5px line, 5px in from the field's top and bottom, 6px from its left (designer, 2026-11-08). */
.tk-swatch {
  flex: none;
  width: 20px;
  height: 20px;
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
.tk-effect > * + * { margin-top: 4px; }
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
/* A row's own button beside its fields (Independent corners, Wrap, a row's reset): as tall as they. */
.tk-row > .tk-icon-button, .tk-grid-2 > .tk-icon-button, :is(.tk-size-row, .tk-color-row) > .tk-reset { width: 30px; height: 30px; border-radius: 8px; }
.tk-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}
/* A field's word label (Width, X, Blur): 32px wide at least, at its start (designer, 2026-11-08); a long one (Blur, Spread) at 9px. */
.tk-scrub > .tk-glyph { min-width: 32px; place-items: center start; }
.tk-scrub > .tk-glyph.is-small { font-size: 9px; letter-spacing: -0.02em; }
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
.tk-size-row > .tk-variable-slot > .tk-field { border-radius: 8px 2px 2px 8px; }
.tk-size-row > .tk-select-field { border-radius: 2px 8px 8px 2px; }
/* Parts side by side as one control (a stroke's weight, style and sides): 2px apart, 2px corners where they meet, 8px at the ends. */
.tk-row.tk-joined { gap: 2px; }
.tk-joined > :is(.tk-field, .tk-select, .tk-select-field) { border-radius: 2px; }
.tk-joined > :first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
.tk-joined > :is(.tk-select:last-of-type, .tk-select-field:last-child) { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
/* A choice of part of a value (a stroke's line, its sides): changed in this round, in the accent with its reset at the right end, after the chevron, as a changed field (designer, 2026-11-07). */
/*
 * Its select takes the wrapper's corners, so the wrapper has a select's own 8px: without them, a choice on its own (the font, its weight)
 * came out square (designer, 2026-11-08). Where it is joined (the size's sizing, a stroke's parts), the joined corners above win.
 */
.tk-select-field { position: relative; display: flex; flex: none; border-radius: 8px; }
.tk-select-field > .tk-select { border-radius: inherit; }
.tk-select-field.is-changed > .tk-select {
  --tk-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23fafafa' stroke-width='1.67' stroke-linecap='round' stroke-linejoin='round' d='M12.25 5.875L8 10.125L3.75 5.875'/%3E%3C/svg%3E");
  width: 96px;
  padding-right: 48px;
  background-position: right 32px center;
  background-color: var(--tk-accent);
  color: #fafafa;
}
.tk-select-field.is-changed > .tk-select:is([aria-expanded="true"], :focus-visible) { box-shadow: inset 0 0 0 1px var(--tk-accent-strong); }
.tk-select-field > .tk-reset { position: absolute; top: 2px; right: 2px; color: #fafafa; }
/* A choice: the select, with a chevron of its own (IconMCP's, its line as wide as the icons' at 12px); its options open in the menu below. */
.tk-select {
  --tk-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23737472' stroke-width='1.67' stroke-linecap='round' stroke-linejoin='round' d='M12.25 5.875L8 10.125L3.75 5.875'/%3E%3C/svg%3E");
  flex: none;
  box-sizing: border-box;
  width: 72px;
  height: 30px;
  padding: 0 24px 0 8px;
  border: 0;
  border-radius: 8px;
  background: var(--tk-chevron) no-repeat right 6px center / 12px 12px, var(--tk-field);
  box-shadow: inset 0 0 0 1px transparent;
  color: var(--tk-text);
  font: inherit;
  text-align: left;
  text-overflow: ellipsis;
  appearance: none;
}
@media (prefers-color-scheme: dark) {
  .tk-select { --tk-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23a6a6a6' stroke-width='1.67' stroke-linecap='round' stroke-linejoin='round' d='M12.25 5.875L8 10.125L3.75 5.875'/%3E%3C/svg%3E"); }
}
.tk-select[aria-expanded="true"], .tk-select:focus-visible { box-shadow: inset 0 0 0 1px var(--tk-accent); outline: none; }
/* Inside the gap's field, at its end: its chevron alone, which chooses a number or Auto. */
.tk-select.tk-gap-mode { width: 20px; height: 20px; margin-left: auto; padding: 0; background: var(--tk-chevron) no-repeat center / 12px 12px; color: transparent; }
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
  max-height: calc(100vh - 16px);
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
.tk-menu-option .tk-icon { position: absolute; left: 6px; --tk-icon-size: 12px; }
/* A button's menu: no check marks, so no column for them; its choices under headings, a Variable's with its swatch. */
.tk-menu-list { outline: none; }
.tk-menu.is-plain .tk-menu-option { gap: 8px; padding-left: 8px; }
.tk-menu-heading { margin-top: 4px; padding: 8px 8px 4px; border-top: 1px solid var(--tk-border); color: var(--tk-text-muted); font-weight: 500; }
/* Two columns side by side, as Effects' + has its types and, to their right, its shadow Variables; tops aligned, a rule between
   them as between a menu's groups, each scrolling on its own when long (designer, 2026-11-08). */
.tk-menu-list.is-columns { display: flex; }
.tk-menu-column { max-height: calc(100vh - 24px); overflow-y: auto; }
.tk-menu-column + .tk-menu-column { margin-left: 4px; padding-left: 4px; border-left: 1px solid var(--tk-border); }
.tk-menu-column > .tk-menu-heading:first-child { margin-top: 0; border-top: 0; }
/* A segmented control: its choices on neutral 150, the one chosen raised on neutral 50. */
.tk-segmented-field {
  display: flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--tk-field);
}
.tk-segmented-field .tk-icon-button { width: 26px; height: 26px; color: var(--tk-text-muted); }
.tk-segmented-field .tk-icon-button:hover { background: none; color: var(--tk-text); }
.tk-segmented-field .tk-icon-button[aria-checked="true"] { color: var(--tk-text); background: var(--tk-raised); box-shadow: var(--tk-raised-shadow); }
/*
 * Changed in this round, the one chosen stays raised and white; the track behind the buttons takes the accent, the others' glyphs light on
 * it (white on blue 500 is 3.4:1), a light tint under one hovered; the group's reset pops out inside it at its right end, 26px on blue 400
 * as a changed field's, the group as wide as its buttons and the reset (designer, 2026-11-08).
 */
.tk-segmented-field.is-changed { background: var(--tk-accent); }
.tk-segmented-field.is-changed .tk-icon-button:not([aria-checked="true"]) { color: #fafafa; }
.tk-segmented-field.is-changed .tk-icon-button:not([aria-checked="true"]):hover { background: rgb(255 255 255 / 0.16); }
/* Clicked, the accent at once, the click answered; taken back (its reset, undo), it eases back to the track's grey, as a check does. */
.tk-segmented-field, .tk-segmented-field .tk-icon-button { transition: background-color ${FIELD_STATE_MS}ms ${EASE_OUT}, color ${FIELD_STATE_MS}ms ${EASE_OUT}; }
.tk-segmented-field.is-changed, .tk-segmented-field.is-changed .tk-icon-button { transition: none; }
.tk-segmented-field > .tk-reset { width: 26px; height: 26px; background: var(--tk-accent-on); color: #fafafa; }
.tk-segmented-field > .tk-reset:hover { background: var(--tk-accent-strong); }
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
.tk-align-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 4px; }
.tk-align {
  position: relative;
  display: grid;
  /* Each point the whole of its third, across and down, to click on. The outer lines, at a sixth and five sixths, sat too far out: they come back half that way, to 5/24 and 19/24; the middle ones stay at half (designer, 2026-11-08). */
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  box-sizing: border-box;
  min-width: 0;
  min-height: 64px;
  border-radius: 8px;
  background: var(--tk-field);
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
.tk-align-options { display: grid; min-width: 0; gap: 4px; align-content: start; }
/* A check: its box, then its words, on the panel (designer, 2026-11-08). Half a row, beside a field or another check; alone in its row, the whole of it. */
.tk-grid-2 > .tk-check:last-child:nth-child(odd) { grid-column: 1 / -1; }
.tk-check {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 30px;
  padding: 0 6px 0 5px;
  border-radius: 8px;
  color: var(--tk-text-muted);
  font-weight: 500;
  letter-spacing: -0.02em;
}
/* Its box, as the designer drew its states (2026-11-07): 20px, no line round it; a faint check on neutral 200 when off, a light one on neutral 800 when on. */
.tk-check input {
  --tk-check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='%23a0a19f' stroke-width='1.25' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.40625 7.4375L5.46875 10.5L11.5938 3.9375'/%3E%3C/svg%3E");
  appearance: none;
  flex: none;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  margin: 0;
  border: 0;
  border-radius: 4px;
  background: var(--tk-check) no-repeat center / 14px 14px, #e5e5e4;
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
/* While the page shrinks into the canvas or grows back, it passes over the panels. */
.tk-viewport.is-travelling { overflow: visible; }
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
  gap: 6px;
  min-width: 0;
  height: 20px;
  overflow: hidden;
  color: var(--tk-text-muted);
  white-space: nowrap;
}
.tk-view-name { flex: none; color: var(--tk-text); font-weight: 500; }
.tk-view-range { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.tk-view-play, .tk-view-delete { flex: none; width: 20px; height: 20px; }
.tk-view-play { margin-left: auto; }
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
.tk-stop-row.is-chosen .tk-color-field { box-shadow: inset 0 0 0 1px var(--tk-accent); }
.tk-stop-handle.is-chosen { border-color: var(--tk-accent); }
/* The popovers of the Design panel (the color picker, the Variables): floating at its left, in its colors (designer, 2026-11-07). */
.tk-popover {
  position: fixed;
  z-index: 2;
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
 */
:is(.tk-menu, .tk-popover).is-leaving {
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity ${POPOVER_EXIT_MS}ms ${EASE_OUT}, transform ${POPOVER_EXIT_MS}ms ${EASE_OUT};
}
@media (prefers-reduced-motion: reduce) {
  :is(.tk-menu, .tk-popover).is-leaving { transform: none; }
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
  border-radius: 8px;
  background: var(--tk-field) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23737472' stroke-width='1.43' stroke-linecap='round'%3E%3Ccircle cx='7.25' cy='7.25' r='4.5'/%3E%3Cline x1='10.5' y1='10.5' x2='13.25' y2='13.25'/%3E%3C/svg%3E") no-repeat 8px center / 14px 14px;
}
.tk-variable-search::placeholder { color: var(--tk-text-muted); font-weight: 500; }
/* The picker's colors: the palette of the Variants tab, without its ramps' names. */
.tk-variants-ramp.is-bare { grid-template-columns: repeat(11, minmax(0, 1fr)); }
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
.tk-variants-ramp { display: grid; grid-template-columns: 50px repeat(11, minmax(0, 1fr)); gap: 2px; align-items: center; }
.tk-variants-ramp-name { overflow: hidden; color: #525351; text-overflow: ellipsis; white-space: nowrap; }
.tk-variants-swatch, .tk-variants-empty { aspect-ratio: 1; border-radius: 4px; }
/* A step the ramp has no color for: a placeholder in its column, the size of a swatch, outlined dashed and not
   filled, so it reads as no color here rather than a white one (designer, 2026-11-08). Not a control: nothing on hover. */
.tk-variants-empty { box-sizing: border-box; border: 1px dashed var(--tk-border); pointer-events: none; }
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
