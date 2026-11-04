import { EASE_OUT, TOAST_FADE_MS } from "./motion";
import { FONT_STACK } from "./toggle-styles";

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
  border-radius: 9px;
  background: #0d99ff;
  box-shadow: 0 0 0 2px #fff;
  color: #fff;
  font: 600 11px/18px ${FONT_STACK};
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
  font: 400 11px/16px ${FONT_STACK};
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
  font: 500 11px/24px ${FONT_STACK};
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
  font: 400 11px/16px ${FONT_STACK};
}
.tk-notice-title { margin: 0; padding: 8px 12px 4px; font: inherit; font-weight: 600; }
.tk-notice-text { margin: 0; padding: 0 12px 4px; color: rgb(255 255 255 / 0.7); }
/* The Agent seems to have stopped (ticket 67): on the toggle, where its change list opens. */
.tk-stalled { position: absolute; width: 300px; }
.tk-dock[data-corner^="bottom"] .tk-stalled { bottom: calc(100% + 8px); }
.tk-dock[data-corner^="top"] .tk-stalled { top: calc(100% + 8px); }
.tk-dock[data-corner$="right"] .tk-stalled { right: 0; }
.tk-dock[data-corner$="left"] .tk-stalled { left: 0; }

/* Edit mode shell. Figma-like; follows the system light / dark setting. */
.tk-shell {
  --tk-panel: #ffffff;
  --tk-canvas: #f5f5f5;
  --tk-border: #e6e6e6;
  --tk-text: #1e1e1e;
  --tk-text-muted: #757575;
  --tk-field: #f5f5f5;
  color-scheme: light;
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 240px;
  font: 400 11px/16px ${FONT_STACK};
  letter-spacing: 0.005em;
  color: var(--tk-text);
}
@media (prefers-color-scheme: dark) {
  .tk-shell {
    --tk-panel: #2c2c2c;
    --tk-canvas: #1e1e1e;
    --tk-border: #444444;
    --tk-text: #ffffff;
    --tk-text-muted: #a6a6a6;
    --tk-field: #383838;
    color-scheme: dark;
  }
}

.tk-panel {
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--tk-panel);
}
.tk-panel.is-layers { border-right: 1px solid var(--tk-border); }
.tk-panel.is-design { border-left: 1px solid var(--tk-border); }
/* The Layers panel starts hidden: the canvas takes its column, and a button at its top left brings it back. */
.tk-shell.is-layers-hidden { grid-template-columns: minmax(0, 1fr) 240px; }
.tk-show-layers, .tk-stop-playing {
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
:is(.tk-show-layers, .tk-stop-playing):hover { background: var(--tk-field); }
:is(.tk-show-layers, .tk-stop-playing):focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 2px; }
/* Playing: the canvas alone, at full size; a button at the top right goes back to editing. */
.tk-shell.is-playing { grid-template-columns: minmax(0, 1fr); }
.tk-shell.is-playing > :is(.tk-panel, .tk-show-layers) { display: none; }
.tk-shell.is-playing .tk-canvas { box-shadow: none; }
.tk-stop-playing { left: auto; right: 8px; }

/* The tools, at the top right of the canvas, by the Design panel. */
.tk-tools {
  position: absolute;
  top: 8px;
  right: 248px;
  z-index: 1;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--tk-panel);
  box-shadow: 0 0 0 1px var(--tk-border), 0 2px 6px rgb(0 0 0 / 0.08);
}
.tk-tools .tk-icon-button[aria-pressed="true"] { background: var(--tk-accent); color: #fff; }
.tk-shell.is-playing > .tk-tools { display: none; }
/* A toast, as in Figma: a dark pill of one line, at the bottom middle of the canvas, over it. */
.tk-toasts {
  position: absolute;
  bottom: 16px;
  left: 240px;
  right: 240px;
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
  left: 256px;
  z-index: 1;
  display: flex;
  max-width: calc(100% - 512px);
  pointer-events: none;
}
.tk-shell:is(.is-layers-hidden, .is-playing) > .tk-page-toasts { left: 16px; max-width: calc(100% - 272px); }
.tk-toast.is-page { display: flex; align-items: center; gap: 8px; }
.tk-toast.is-page > span { overflow: hidden; text-overflow: ellipsis; }
.tk-toast.is-page:has(.tk-button) { padding-block: 4px; padding-right: 4px; }
.tk-toast.is-page .tk-button { flex: none; }
@keyframes tk-toast-fade-in { from { opacity: 0; } }

.tk-panel-title {
  margin: 0;
  padding: 12px 16px;
  font: inherit;
  font-weight: 600;
  border-bottom: 1px solid var(--tk-border);
}
/* The Design panel's title, with the changes so far and the way back to preview mode beside it. */
.tk-panel-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
  border-bottom: 1px solid var(--tk-border);
}
.tk-panel-header .tk-panel-title { flex: 1; border-bottom: 0; }
/* Play sits right by the Design title; the changes and the way back stay at the right. */
.tk-panel-header .tk-panel-title:has(+ .tk-play) { flex: none; padding-right: 4px; }
.tk-panel-header .tk-play { margin-right: auto; }
.tk-count {
  all: unset;
  box-sizing: border-box;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--tk-accent);
  color: #fff;
  font: 600 11px/20px ${FONT_STACK};
  font-variant-numeric: tabular-nums;
  text-align: center;
  cursor: pointer;
}
.tk-count:hover { background: #0b85de; }
.tk-count:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 2px; }
/* Opened from the count: below the panel's title, over the panel, which would clip it. */
.tk-panel-header .tk-changes { position: fixed; top: 44px; right: 8px; z-index: 1; }

.tk-panel-empty {
  margin: 0;
  padding: 12px 16px;
  color: var(--tk-text-muted);
}

.tk-shell {
  --tk-accent: #0d99ff;
  --tk-accent-soft: rgb(13 153 255 / 0.16);
  --tk-instance: #9747ff;
  --tk-locked: #8c8c8c;
}

.tk-tree { padding: 4px 0; }
.tk-tree-row {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding-right: 8px;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
.tk-tree-row:hover { box-shadow: inset 0 0 0 1px var(--tk-accent); }
.tk-tree-row.is-selected { background: var(--tk-accent-soft); }
/* The canvas's layers after those off it. */
.tk-tree-row.is-first-on-canvas { margin-top: 4px; border-top: 1px solid var(--tk-border); }
.tk-tree-row.is-instance .tk-icon { color: var(--tk-instance); }
.tk-tree-row .tk-icon { flex: none; color: var(--tk-text-muted); }
.tk-tree-name { overflow: hidden; text-overflow: ellipsis; }
.tk-tree-brief { display: flex; margin-left: auto; color: var(--tk-text-muted); }
.tk-tree-chevron {
  flex: none;
  width: 12px;
  height: 16px;
}
.tk-tree-chevron[data-open]::before {
  content: "";
  display: block;
  width: 0;
  height: 0;
  margin: 5px 0 0 3px;
  border-left: 4px solid var(--tk-text-muted);
  border-top: 3px solid transparent;
  border-bottom: 3px solid transparent;
}
.tk-tree-chevron[data-open="true"]::before { rotate: 90deg; }

.tk-layer-info {
  padding: 12px 16px;
  border-bottom: 1px solid var(--tk-border);
}
.tk-layer-name {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 8px -4px;
  font: inherit;
  font-weight: 600;
}
.tk-layer-name .tk-icon { flex: none; color: var(--tk-text-muted); }
.tk-layer-name.is-instance { color: var(--tk-instance); }
.tk-layer-name.is-instance .tk-icon { color: inherit; }
.tk-layer-info dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
}
.tk-layer-info dt { color: var(--tk-text-muted); }
.tk-layer-info dd { margin: 0; overflow-wrap: anywhere; }
.tk-layer-note { margin: 8px 0 0; color: var(--tk-text-muted); }
/* The breakpoint the view worked in stands for, and the properties changed there on their own (ADR 0008). */
.tk-breakpoint, .tk-row-mark { --tk-breakpoint: #8a38f5; }
@media (prefers-color-scheme: dark) { .tk-breakpoint, .tk-row-mark { --tk-breakpoint: #b48aff; } }
.tk-breakpoint-range { color: var(--tk-breakpoint); font-variant-numeric: tabular-nums; }
.tk-breakpoint-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
.tk-breakpoint .tk-layer-note { margin: 0; }
.tk-breakpoint-changes { list-style: none; margin: 4px 0 0; padding: 0; }
.tk-breakpoint-change { display: flex; align-items: center; gap: 8px; height: 24px; }
.tk-breakpoint-mark { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--tk-breakpoint); }
.tk-breakpoint-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tk-breakpoint); }
.tk-change-breakpoint { color: #b48aff; }
/* A row of the Design panel whose properties the breakpoint changed on its own: a bar in the section's left margin, all along the row; clicked, they inherit again. */
.tk-markable { position: relative; }
.tk-row-mark {
  all: unset;
  position: absolute;
  top: 0;
  bottom: 0;
  left: -14px;
  width: 12px;
  display: grid;
  place-items: center;
  border-radius: 3px;
  cursor: pointer;
}
.tk-row-mark::before { content: ""; width: 3px; height: calc(100% - 6px); min-height: 12px; border-radius: 2px; background: var(--tk-breakpoint); }
.tk-row-mark:hover { background: var(--tk-field); }
.tk-row-mark:hover::before { width: 4px; }
.tk-row-mark:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
.tk-source { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
.tk-unlocated { color: var(--tk-text-muted); font-style: italic; }

.tk-section {
  margin: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--tk-border);
}
.tk-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  margin: -4px 0 4px;
}
.tk-section-header .tk-section-title { margin: 0; }
.tk-section-title {
  margin: 0 0 8px;
  font: inherit;
  font-weight: 600;
}
.tk-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tk-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 24px;
  padding: 0 4px;
  border-radius: 5px;
  background: var(--tk-field);
  box-shadow: inset 0 0 0 1px transparent;
}
.tk-field:hover { box-shadow: inset 0 0 0 1px var(--tk-border); }
.tk-field:focus-within { box-shadow: inset 0 0 0 1px var(--tk-accent); }
.tk-field .tk-icon { flex: none; color: var(--tk-text-muted); }
.tk-scrub {
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
  padding: 4px 8px;
  border-radius: 5px;
  background: var(--tk-field);
  color: var(--tk-text);
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: inset 0 0 0 1px transparent;
}
.tk-textarea:hover { box-shadow: inset 0 0 0 1px var(--tk-border); }
.tk-textarea:focus { box-shadow: inset 0 0 0 1px var(--tk-accent); cursor: text; }
.tk-textarea::placeholder { color: var(--tk-text-muted); }
.tk-opacity {
  flex: none;
  width: 36px;
  padding-left: 8px;
  border-left: 1px solid var(--tk-border);
}
.tk-swatch {
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: none;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
  cursor: default;
}
.tk-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.tk-swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.tk-swatch::-moz-color-swatch { border: 0; border-radius: 3px; }
.tk-section-header .tk-row { gap: 2px; }
.tk-section-header .tk-select { height: 22px; }
.tk-subtitle { color: var(--tk-text-muted); font-weight: 400; }
.tk-read-only { color: var(--tk-text-muted); }
.tk-stop-position { flex: none; width: 44px; }
.tk-effect > * + * { margin-top: 8px; }
.tk-select.tk-effect-type { flex: 1; width: auto; min-width: 0; }
/* A see-through color shows over a checkerboard, as in Figma. */
.tk-gradient-bar, .tk-gradient-swatch {
  --tk-checker: repeating-conic-gradient(#e6e6e6 0% 25%, #ffffff 0% 50%) 0 0 / 8px 8px;
}
.tk-gradient-bar {
  position: relative;
  height: 16px;
  margin-inline: 6px;
  border-radius: 3px;
  background: var(--tk-gradient), var(--tk-checker);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
  cursor: copy;
}
.tk-stop-handle {
  position: absolute;
  top: 50%;
  box-sizing: border-box;
  width: 12px;
  height: 22px;
  border: 2px solid #ffffff;
  border-radius: 3px;
  background: linear-gradient(var(--tk-stop), var(--tk-stop)), var(--tk-checker);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25), 0 1px 3px rgb(0 0 0 / 0.2);
  transform: translate(-50%, -50%);
  cursor: ew-resize;
  touch-action: none;
}
.tk-stop-handle:focus-visible, .tk-stop-handle:focus { outline: none; box-shadow: 0 0 0 2px var(--tk-accent), 0 1px 3px rgb(0 0 0 / 0.2); }
.tk-gradient-swatch {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
}
.tk-icon-button {
  all: unset;
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  color: var(--tk-text);
}
.tk-icon-button:hover { background: var(--tk-field); }
.tk-icon-button:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
/* A button that stays on in the panel (Independent corners): shown pressed, as in Figma. */
.tk-section .tk-icon-button[aria-pressed="true"] { background: var(--tk-field); box-shadow: inset 0 0 0 1px var(--tk-border); }

.tk-section > * + * { margin-top: 8px; }
.tk-section > .tk-section-title + * { margin-top: 0; }
.tk-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.tk-glyph {
  display: grid;
  place-items: center;
  min-width: 16px;
  color: var(--tk-text-muted);
  font-size: 10px;
}
.tk-mixed { color: var(--tk-text-muted); }
.tk-size-row .tk-field { flex: 1; }
.tk-select {
  flex: none;
  width: 72px;
  height: 24px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: var(--tk-field);
  color: var(--tk-text);
  font: inherit;
}
.tk-select:focus-visible { outline: 1px solid var(--tk-accent); }
.tk-segmented-field {
  display: flex;
  flex: none;
  padding: 0 2px;
  border-radius: 5px;
  background: var(--tk-field);
}
.tk-segmented-field .tk-icon-button { width: 22px; color: var(--tk-text-muted); }
.tk-segmented-field .tk-icon-button[aria-checked="true"] { color: var(--tk-text); background: var(--tk-panel); box-shadow: 0 0 0 1px var(--tk-border); }
.tk-select.tk-font, .tk-grid-2 > .tk-select { width: 100%; }
.tk-text-glyph { font-size: 11px; font-weight: 500; }
.tk-text-glyph.tk-underline { text-decoration: underline; }
.tk-text-glyph.tk-strikethrough { text-decoration: line-through; }
.tk-align-row { align-items: flex-start; gap: 12px; }
.tk-align {
  display: grid;
  flex: none;
  grid-template-columns: repeat(3, 16px);
  grid-auto-rows: 16px;
  padding: 4px;
  border-radius: 5px;
  background: var(--tk-field);
}
.tk-align-point {
  all: unset;
  display: grid;
  place-items: center;
}
.tk-align-point::before {
  content: "";
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--tk-text-muted);
}
.tk-align-point:hover::before { background: var(--tk-text); }
.tk-align-point[aria-checked="true"]::before { width: 8px; height: 8px; border-radius: 2px; background: var(--tk-accent); }
.tk-align-point:focus-visible { outline: 1px solid var(--tk-accent); }
.tk-align-options { display: grid; gap: 4px; }
.tk-check {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
}
.tk-check input { margin: 0; accent-color: var(--tk-accent); }

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
/* Above each view, as a Frame's name in Figma: what it is, and that it shows only what CSS does at its width. */
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
.tk-view-name { color: var(--tk-text); font-weight: 500; }
.tk-view-note { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tk-view-breakpoint { flex: none; color: var(--tk-breakpoint, #8a38f5); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
.tk-view-delete { width: 20px; height: 20px; margin-left: auto; }
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
.tk-variable-button { width: 20px; color: var(--tk-text-muted); }
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
  background: var(--tk-panel);
  box-shadow: inset 0 0 0 1px var(--tk-border);
  line-height: 18px;
  cursor: default;
}
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
.tk-popover {
  position: fixed;
  z-index: 2;
  box-sizing: border-box;
  max-height: min(480px, calc(100vh - 16px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 12px;
  border-radius: 12px;
  background: var(--tk-panel);
  box-shadow:
    inset 0 0 0 1px var(--tk-border),
    0 1px 2px rgb(0 0 0 / 0.12),
    0 8px 24px rgb(0 0 0 / 0.16);
  color: var(--tk-text);
  outline: none;
}
.tk-popover-header { display: flex; align-items: center; justify-content: space-between; }
.tk-popover-header .tk-section-title { margin: 0; }
.tk-tabs { display: flex; gap: 4px; }
.tk-tab {
  all: unset;
  padding: 0 8px;
  border-radius: 5px;
  line-height: 24px;
  color: var(--tk-text-muted);
}
.tk-tab[aria-selected="true"] { background: var(--tk-field); color: var(--tk-text); font-weight: 600; }
.tk-tab:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
.tk-variable-search {
  flex: none;
  height: 24px;
  padding: 0 8px;
  border-radius: 5px;
  background: var(--tk-field);
}
.tk-variable-list { overflow: auto; min-height: 0; margin: 0 -12px; padding: 0 12px; }
.tk-variable-list .tk-subtitle { margin: 8px 0 4px; }
.tk-variable-option {
  all: unset;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 6px;
  border-radius: 5px;
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

@media (prefers-reduced-motion: reduce) {
  .tk-segment, .tk-selection, .tk-progress-done { transition: none; }
  /* A toast only fades: it does not rise or sink. */
  .tk-toast { animation-name: tk-toast-fade-in; transition-property: opacity; }
  .tk-toast.is-fading { translate: none; }
}
`;
