import { EASE_OUT, TOAST_FADE_MS } from "./motion";
import { FONT_STACK } from "./toggle-styles";

/** The editor layer's styles, but for the toggle's (`toggleStyles`), which come before them. They live inside the Shadow DOM and never touch the page. */
export const styles = /* css */ `
.vk-icon { flex: none; width: var(--vk-icon-size); height: var(--vk-icon-size); }
.vk-icon * { stroke-width: var(--vk-icon-stroke); vector-effect: non-scaling-stroke; }

/* The toggle while the Agent applies the round: a ring fills as changes are done. */
.vk-progress {
  position: absolute;
  inset: -4px;
  width: 48px;
  height: 48px;
  rotate: -90deg;
  pointer-events: none;
}
.vk-progress circle { fill: none; stroke-width: 2.5; stroke-dasharray: 1; }
.vk-progress-track { stroke: rgb(30 30 30 / 0.16); }
.vk-progress-done {
  stroke: #0d99ff;
  stroke-linecap: round;
  transition: stroke-dashoffset 240ms ${EASE_OUT};
}
/* Pressed and held: the ring that runs out when the toggle unlocks. */
.vk-progress-hold { stroke: #fff; stroke-dashoffset: 1; opacity: 0; }
.is-holding .vk-progress-hold { opacity: 1; animation: vk-hold var(--vk-hold) linear forwards; }
@keyframes vk-hold { to { stroke-dashoffset: 0; } }

/* Changes not yet applied, on the toggle's top-right edge. It opens the change list. */
.vk-badge {
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
.vk-badge::before { content: ""; position: absolute; inset: -6px; }
.vk-badge:focus-visible { outline: 2px solid #0d99ff; outline-offset: 2px; }

/* The change list: dark like the toggle, opening toward the middle of the window. */
.vk-changes {
  --vk-text: #fff;
  --vk-field: #383838;
  --vk-accent: #0d99ff;
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
.vk-dock[data-corner^="bottom"] .vk-changes { bottom: calc(100% + 8px); }
.vk-dock[data-corner^="top"] .vk-changes { top: calc(100% + 8px); }
.vk-dock[data-corner$="right"] .vk-changes { right: 0; }
.vk-dock[data-corner$="left"] .vk-changes { left: 0; }
.vk-changes-title { margin: 0; padding: 8px 12px; font: inherit; font-weight: 600; }
.vk-changes-note { margin: 0; padding: 0 12px 8px; color: rgb(255 255 255 / 0.6); }
.vk-changes-list { margin: 0; padding: 0; list-style: none; }
.vk-change {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 8px 0 12px;
}
.vk-change:hover { background: rgb(255 255 255 / 0.06); }
.vk-change-text { display: grid; flex: 1; min-width: 0; }
.vk-change-name, .vk-change-values { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vk-change-values { color: rgb(255 255 255 / 0.6); }
.vk-changes-confirm { padding: 8px 12px 0; border-top: 1px solid rgb(255 255 255 / 0.08); }
.vk-changes-confirm p { margin: 0; }
.vk-changes-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px; }
.vk-button {
  all: unset;
  height: 24px;
  padding: 0 8px;
  border-radius: 5px;
  background: #383838;
  font: 500 11px/24px ${FONT_STACK};
  cursor: default;
}
.vk-button:hover { background: #444444; }
.vk-button:focus-visible { outline: 2px solid #0d99ff; outline-offset: 1px; }
.vk-button.is-danger { background: #f24822; }
.vk-button.is-danger:hover { background: #dc3412; }
.vk-button.is-primary { background: #0d99ff; color: #fff; }
.vk-button.is-primary:hover { background: #007be5; }

/* Editing paused (ticket 66): over the whole shell, which takes no pointer meanwhile, a notice dark like the change list. */
.vk-paused {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.24);
}
.vk-notice {
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
.vk-notice-title { margin: 0; padding: 8px 12px 4px; font: inherit; font-weight: 600; }
.vk-notice-text { margin: 0; padding: 0 12px 4px; color: rgb(255 255 255 / 0.7); }
/* The Agent seems to have stopped (ticket 67): on the toggle, where its change list opens. */
.vk-stalled { position: absolute; width: 300px; }
.vk-dock[data-corner^="bottom"] .vk-stalled { bottom: calc(100% + 8px); }
.vk-dock[data-corner^="top"] .vk-stalled { top: calc(100% + 8px); }
.vk-dock[data-corner$="right"] .vk-stalled { right: 0; }
.vk-dock[data-corner$="left"] .vk-stalled { left: 0; }

/* Edit mode shell. Figma-like; follows the system light / dark setting. */
.vk-shell {
  --vk-panel: #ffffff;
  --vk-canvas: #f5f5f5;
  --vk-border: #e6e6e6;
  --vk-text: #1e1e1e;
  --vk-text-muted: #757575;
  --vk-field: #f5f5f5;
  color-scheme: light;
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 240px;
  font: 400 11px/16px ${FONT_STACK};
  letter-spacing: 0.005em;
  color: var(--vk-text);
}
@media (prefers-color-scheme: dark) {
  .vk-shell {
    --vk-panel: #2c2c2c;
    --vk-canvas: #1e1e1e;
    --vk-border: #444444;
    --vk-text: #ffffff;
    --vk-text-muted: #a6a6a6;
    --vk-field: #383838;
    color-scheme: dark;
  }
}

.vk-panel {
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--vk-panel);
}
.vk-panel.is-layers { border-right: 1px solid var(--vk-border); }
.vk-panel.is-design { border-left: 1px solid var(--vk-border); }
/* The Layers panel starts hidden: the canvas takes its column, and a button at its top left brings it back. */
.vk-shell.is-layers-hidden { grid-template-columns: minmax(0, 1fr) 240px; }
.vk-show-layers, .vk-stop-playing {
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
  background: var(--vk-panel);
  box-shadow: 0 0 0 1px var(--vk-border), 0 2px 6px rgb(0 0 0 / 0.08);
  color: var(--vk-text);
}
:is(.vk-show-layers, .vk-stop-playing):hover { background: var(--vk-field); }
:is(.vk-show-layers, .vk-stop-playing):focus-visible { outline: 2px solid var(--vk-accent); outline-offset: 2px; }
/* Playing: the canvas alone, at full size; a button at the top right goes back to editing. */
.vk-shell.is-playing { grid-template-columns: minmax(0, 1fr); }
.vk-shell.is-playing > :is(.vk-panel, .vk-show-layers) { display: none; }
.vk-shell.is-playing .vk-canvas { box-shadow: none; }
.vk-stop-playing { left: auto; right: 8px; }

/* The tools, at the top right of the canvas, by the Design panel. */
.vk-tools {
  position: absolute;
  top: 8px;
  right: 248px;
  z-index: 1;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--vk-panel);
  box-shadow: 0 0 0 1px var(--vk-border), 0 2px 6px rgb(0 0 0 / 0.08);
}
.vk-tools .vk-icon-button[aria-pressed="true"] { background: var(--vk-accent); color: #fff; }
.vk-shell.is-playing > .vk-tools { display: none; }
/* A toast, as in Figma: a dark pill of one line, at the bottom middle of the canvas, over it. */
.vk-toasts {
  position: absolute;
  bottom: 16px;
  left: 240px;
  right: 240px;
  z-index: 1;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.vk-shell.is-layers-hidden > .vk-toasts { left: 0; }
.vk-shell.is-playing > .vk-toasts { left: 0; right: 0; }
.vk-toast {
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
  animation: vk-toast-in ${TOAST_FADE_MS}ms ${EASE_OUT};
  transition: opacity ${TOAST_FADE_MS}ms ${EASE_OUT}, translate ${TOAST_FADE_MS}ms ${EASE_OUT};
}
.vk-toast.is-fading { opacity: 0; translate: 0 8px; }
@keyframes vk-toast-in { from { opacity: 0; translate: 0 8px; } }
@keyframes vk-toast-fade-in { from { opacity: 0; } }

.vk-panel-title {
  margin: 0;
  padding: 12px 16px;
  font: inherit;
  font-weight: 600;
  border-bottom: 1px solid var(--vk-border);
}
/* The Design panel's title, with the changes so far and the way back to preview mode beside it. */
.vk-panel-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
  border-bottom: 1px solid var(--vk-border);
}
.vk-panel-header .vk-panel-title { flex: 1; border-bottom: 0; }
/* Play sits right by the Design title; the changes and the way back stay at the right. */
.vk-panel-header .vk-panel-title:has(+ .vk-play) { flex: none; padding-right: 4px; }
.vk-panel-header .vk-play { margin-right: auto; }
.vk-count {
  all: unset;
  box-sizing: border-box;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--vk-accent);
  color: #fff;
  font: 600 11px/20px ${FONT_STACK};
  font-variant-numeric: tabular-nums;
  text-align: center;
  cursor: pointer;
}
.vk-count:hover { background: #0b85de; }
.vk-count:focus-visible { outline: 2px solid var(--vk-accent); outline-offset: 2px; }
/* Opened from the count: below the panel's title, over the panel, which would clip it. */
.vk-panel-header .vk-changes { position: fixed; top: 44px; right: 8px; z-index: 1; }

.vk-panel-empty {
  margin: 0;
  padding: 12px 16px;
  color: var(--vk-text-muted);
}

.vk-shell {
  --vk-accent: #0d99ff;
  --vk-accent-soft: rgb(13 153 255 / 0.16);
  --vk-instance: #9747ff;
  --vk-locked: #8c8c8c;
}

.vk-tree { padding: 4px 0; }
.vk-tree-row {
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
.vk-tree-row:hover { box-shadow: inset 0 0 0 1px var(--vk-accent); }
.vk-tree-row.is-selected { background: var(--vk-accent-soft); }
/* The canvas's layers after those off it. */
.vk-tree-row.is-first-on-canvas { margin-top: 4px; border-top: 1px solid var(--vk-border); }
.vk-tree-row.is-instance .vk-icon { color: var(--vk-instance); }
.vk-tree-row .vk-icon { flex: none; color: var(--vk-text-muted); }
.vk-tree-name { overflow: hidden; text-overflow: ellipsis; }
.vk-tree-brief { display: flex; margin-left: auto; color: var(--vk-text-muted); }
.vk-tree-chevron {
  flex: none;
  width: 12px;
  height: 16px;
}
.vk-tree-chevron[data-open]::before {
  content: "";
  display: block;
  width: 0;
  height: 0;
  margin: 5px 0 0 3px;
  border-left: 4px solid var(--vk-text-muted);
  border-top: 3px solid transparent;
  border-bottom: 3px solid transparent;
}
.vk-tree-chevron[data-open="true"]::before { rotate: 90deg; }

.vk-layer-info {
  padding: 12px 16px;
  border-bottom: 1px solid var(--vk-border);
}
.vk-layer-name {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 8px -4px;
  font: inherit;
  font-weight: 600;
}
.vk-layer-name .vk-icon { flex: none; color: var(--vk-text-muted); }
.vk-layer-name.is-instance { color: var(--vk-instance); }
.vk-layer-name.is-instance .vk-icon { color: inherit; }
.vk-layer-info dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
}
.vk-layer-info dt { color: var(--vk-text-muted); }
.vk-layer-info dd { margin: 0; overflow-wrap: anywhere; }
.vk-layer-note { margin: 8px 0 0; color: var(--vk-text-muted); }
/* The breakpoint the view worked in stands for, and the properties changed there on their own (ADR 0008). */
.vk-breakpoint, .vk-row-mark { --vk-breakpoint: #8a38f5; }
@media (prefers-color-scheme: dark) { .vk-breakpoint, .vk-row-mark { --vk-breakpoint: #b48aff; } }
.vk-breakpoint-range { color: var(--vk-breakpoint); font-variant-numeric: tabular-nums; }
.vk-breakpoint-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
.vk-breakpoint .vk-layer-note { margin: 0; }
.vk-breakpoint-changes { list-style: none; margin: 4px 0 0; padding: 0; }
.vk-breakpoint-change { display: flex; align-items: center; gap: 8px; height: 24px; }
.vk-breakpoint-mark { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--vk-breakpoint); }
.vk-breakpoint-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vk-breakpoint); }
.vk-change-breakpoint { color: #b48aff; }
/* A row of the Design panel whose properties the breakpoint changed on its own: a bar in the section's left margin, all along the row; clicked, they inherit again. */
.vk-markable { position: relative; }
.vk-row-mark {
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
.vk-row-mark::before { content: ""; width: 3px; height: calc(100% - 6px); min-height: 12px; border-radius: 2px; background: var(--vk-breakpoint); }
.vk-row-mark:hover { background: var(--vk-field); }
.vk-row-mark:hover::before { width: 4px; }
.vk-row-mark:focus-visible { outline: 2px solid var(--vk-accent); outline-offset: -2px; }
.vk-source { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
.vk-unlocated { color: var(--vk-text-muted); font-style: italic; }

.vk-section {
  margin: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vk-border);
}
.vk-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  margin: -4px 0 4px;
}
.vk-section-header .vk-section-title { margin: 0; }
.vk-section-title {
  margin: 0 0 8px;
  font: inherit;
  font-weight: 600;
}
.vk-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.vk-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 24px;
  padding: 0 4px;
  border-radius: 5px;
  background: var(--vk-field);
  box-shadow: inset 0 0 0 1px transparent;
}
.vk-field:hover { box-shadow: inset 0 0 0 1px var(--vk-border); }
.vk-field:focus-within { box-shadow: inset 0 0 0 1px var(--vk-accent); }
.vk-field .vk-icon { flex: none; color: var(--vk-text-muted); }
.vk-scrub {
  display: grid;
  flex: none;
  place-items: center;
  align-self: stretch;
  cursor: ew-resize;
  touch-action: none;
}
.vk-input {
  all: unset;
  flex: 1;
  min-width: 0;
  height: 100%;
  font: inherit;
  color: var(--vk-text);
  cursor: default;
}
.vk-input:focus { cursor: text; }
.vk-textarea {
  all: unset;
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  padding: 4px 8px;
  border-radius: 5px;
  background: var(--vk-field);
  color: var(--vk-text);
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: inset 0 0 0 1px transparent;
}
.vk-textarea:hover { box-shadow: inset 0 0 0 1px var(--vk-border); }
.vk-textarea:focus { box-shadow: inset 0 0 0 1px var(--vk-accent); cursor: text; }
.vk-textarea::placeholder { color: var(--vk-text-muted); }
.vk-opacity {
  flex: none;
  width: 36px;
  padding-left: 8px;
  border-left: 1px solid var(--vk-border);
}
.vk-swatch {
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
.vk-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.vk-swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.vk-swatch::-moz-color-swatch { border: 0; border-radius: 3px; }
.vk-section-header .vk-row { gap: 2px; }
.vk-section-header .vk-select { height: 22px; }
.vk-subtitle { color: var(--vk-text-muted); font-weight: 400; }
.vk-read-only { color: var(--vk-text-muted); }
.vk-stop-position { flex: none; width: 44px; }
.vk-effect > * + * { margin-top: 8px; }
.vk-select.vk-effect-type { flex: 1; width: auto; min-width: 0; }
/* A see-through color shows over a checkerboard, as in Figma. */
.vk-gradient-bar, .vk-gradient-swatch {
  --vk-checker: repeating-conic-gradient(#e6e6e6 0% 25%, #ffffff 0% 50%) 0 0 / 8px 8px;
}
.vk-gradient-bar {
  position: relative;
  height: 16px;
  margin-inline: 6px;
  border-radius: 3px;
  background: var(--vk-gradient), var(--vk-checker);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
  cursor: copy;
}
.vk-stop-handle {
  position: absolute;
  top: 50%;
  box-sizing: border-box;
  width: 12px;
  height: 22px;
  border: 2px solid #ffffff;
  border-radius: 3px;
  background: linear-gradient(var(--vk-stop), var(--vk-stop)), var(--vk-checker);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25), 0 1px 3px rgb(0 0 0 / 0.2);
  transform: translate(-50%, -50%);
  cursor: ew-resize;
  touch-action: none;
}
.vk-stop-handle:focus-visible, .vk-stop-handle:focus { outline: none; box-shadow: 0 0 0 2px var(--vk-accent), 0 1px 3px rgb(0 0 0 / 0.2); }
.vk-gradient-swatch {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
}
.vk-icon-button {
  all: unset;
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  color: var(--vk-text);
}
.vk-icon-button:hover { background: var(--vk-field); }
.vk-icon-button:focus-visible { outline: 2px solid var(--vk-accent); outline-offset: -2px; }
/* A button that stays on in the panel (Independent corners): shown pressed, as in Figma. */
.vk-section .vk-icon-button[aria-pressed="true"] { background: var(--vk-field); box-shadow: inset 0 0 0 1px var(--vk-border); }

.vk-section > * + * { margin-top: 8px; }
.vk-section > .vk-section-title + * { margin-top: 0; }
.vk-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.vk-glyph {
  display: grid;
  place-items: center;
  min-width: 16px;
  color: var(--vk-text-muted);
  font-size: 10px;
}
.vk-mixed { color: var(--vk-text-muted); }
.vk-size-row .vk-field { flex: 1; }
.vk-select {
  flex: none;
  width: 72px;
  height: 24px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: var(--vk-field);
  color: var(--vk-text);
  font: inherit;
}
.vk-select:focus-visible { outline: 1px solid var(--vk-accent); }
.vk-segmented-field {
  display: flex;
  flex: none;
  padding: 0 2px;
  border-radius: 5px;
  background: var(--vk-field);
}
.vk-segmented-field .vk-icon-button { width: 22px; color: var(--vk-text-muted); }
.vk-segmented-field .vk-icon-button[aria-checked="true"] { color: var(--vk-text); background: var(--vk-panel); box-shadow: 0 0 0 1px var(--vk-border); }
.vk-select.vk-font, .vk-grid-2 > .vk-select { width: 100%; }
.vk-text-glyph { font-size: 11px; font-weight: 500; }
.vk-text-glyph.vk-underline { text-decoration: underline; }
.vk-text-glyph.vk-strikethrough { text-decoration: line-through; }
.vk-align-row { align-items: flex-start; gap: 12px; }
.vk-align {
  display: grid;
  flex: none;
  grid-template-columns: repeat(3, 16px);
  grid-auto-rows: 16px;
  padding: 4px;
  border-radius: 5px;
  background: var(--vk-field);
}
.vk-align-point {
  all: unset;
  display: grid;
  place-items: center;
}
.vk-align-point::before {
  content: "";
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--vk-text-muted);
}
.vk-align-point:hover::before { background: var(--vk-text); }
.vk-align-point[aria-checked="true"]::before { width: 8px; height: 8px; border-radius: 2px; background: var(--vk-accent); }
.vk-align-point:focus-visible { outline: 1px solid var(--vk-accent); }
.vk-align-options { display: grid; gap: 4px; }
.vk-check {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
}
.vk-check input { margin: 0; accent-color: var(--vk-accent); }

.vk-viewport {
  position: relative;
  overflow: hidden;
  outline: none;
  touch-action: none;
  /* Clicks here select layers, never the page's text. */
  user-select: none;
  -webkit-user-select: none;
  background: var(--vk-canvas);
}
.vk-viewport.is-pan-ready { cursor: grab; }
.vk-viewport.is-drawing { cursor: crosshair; }
.vk-viewport-message {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: var(--vk-text-muted);
}
.vk-viewport.is-panning { cursor: grabbing; }
/* While the page shrinks into the canvas or grows back, it passes over the panels. */
.vk-viewport.is-travelling { overflow: visible; }
.vk-stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.vk-canvas {
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
.vk-canvas.is-beside { position: absolute; top: 0; }
/* The layers off the canvas (ADR 0009), where they were left on the stage, each as it looks, on nothing of its own. */
.vk-off-canvas-layers { position: absolute; top: 0; left: 0; }
.vk-off-canvas {
  position: absolute;
  display: block;
  border: 0;
  color-scheme: normal;
  background: transparent;
  pointer-events: none;
}
.vk-off-canvas[hidden] { display: none; }
/* Above each view, as a Frame's name in Figma: what it is, and that it shows only what CSS does at its width. */
.vk-view-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 20px;
  overflow: hidden;
  color: var(--vk-text-muted);
  white-space: nowrap;
}
.vk-view-name { color: var(--vk-text); font-weight: 500; }
.vk-view-note { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.vk-view-breakpoint { flex: none; color: var(--vk-breakpoint, #8a38f5); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
.vk-view-delete { width: 20px; height: 20px; margin-left: auto; }
.vk-add-view { position: absolute; display: flex; height: 20px; align-items: center; }
.vk-add-view .vk-icon-button { width: 20px; height: 20px; }
.vk-add-view-width {
  all: unset;
  box-sizing: border-box;
  width: 72px;
  height: 20px;
  padding: 0 6px;
  border-radius: 5px;
  background: var(--vk-panel);
  box-shadow: 0 0 0 1px var(--vk-accent);
  color: var(--vk-text);
}
.vk-add-view-width[aria-invalid] { box-shadow: 0 0 0 1px var(--vk-danger, #f24822); }

.vk-selection, .vk-hover {
  --vk-selection: var(--vk-accent);
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--vk-selection);
  pointer-events: none;
}
/* Gone at once while a value changes; fades back once it settles. */
.vk-selection { transition: opacity 150ms ${EASE_OUT}; }
.vk-selection[data-hidden] { opacity: 0; transition: none; }
:is(.vk-selection, .vk-hover)[data-kind="instance"] { --vk-selection: var(--vk-instance); }
:is(.vk-selection, .vk-hover)[data-kind="locked"] { --vk-selection: var(--vk-locked); }
/* Beside a new Frame selected: its brief, a button that opens a field. */
.vk-brief { position: absolute; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.vk-brief-button {
  all: unset;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px 0 4px;
  border-radius: 6px;
  background: var(--vk-accent);
  color: #fff;
  font-weight: 500;
  white-space: nowrap;
  cursor: default;
}
.vk-brief-button:focus-visible { outline: 2px solid var(--vk-accent); outline-offset: 2px; }
.vk-brief-text { width: 220px; min-height: 72px; background: var(--vk-panel); box-shadow: 0 0 0 1px var(--vk-border), 0 4px 12px rgb(0 0 0 / 0.12); }
/*
 * On the top right of the layer selected alone, above it and clear of its brief's mark: the selection toolbar,
 * its buttons in one row, its right edge on the layer's. Its buttons look as the brief button does.
 */
.vk-selection-toolbar {
  position: absolute;
  display: flex;
  gap: 4px;
  transform: translate(-100%, calc(-100% - 12px));
}
.vk-selection-tool {
  all: unset;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px 0 4px;
  border-radius: 6px;
  background: var(--vk-instance);
  color: #fff;
  font-weight: 500;
  white-space: nowrap;
  cursor: default;
}
.vk-selection-tool:focus-visible { outline: 2px solid var(--vk-instance); outline-offset: 2px; }
/* On a layer with a brief, in every view: the brief button's mark, small, centered on its top right corner. */
.vk-brief-mark {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 5px;
  background: var(--vk-accent);
  color: #fff;
  box-shadow: 0 0 0 1px #fff;
  pointer-events: none;
}
.vk-brief-mark svg { width: 12px; height: 12px; }

/* Typing in text, as in Figma: a thin blue box round the words, which grows as they do. */
.vk-selection[data-kind="typing"] { transition: none; }
.vk-selection-lock {
  position: absolute;
  bottom: 100%;
  left: -1px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  border-radius: 2px;
  background: var(--vk-selection);
  color: #fff;
}

/* Dragging: where the layer would go in a Stack, and loose text, which has no element to move, following the pointer. */
.vk-drop-line {
  position: absolute;
  border-radius: 1px;
  background: var(--vk-accent);
  pointer-events: none;
}
.vk-drag-ghost {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--vk-accent);
  background: var(--vk-accent-soft);
  pointer-events: none;
}

/* Variables, as in Figma: a button beside a field lists them; a field set to one shows its name. */
.vk-variable-slot {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.vk-variable-slot > .vk-field { min-width: 0; }
.vk-variable-button { width: 20px; color: var(--vk-text-muted); }
.vk-variable-chip { gap: 4px; padding-right: 0; }
.vk-variable-chip-name {
  all: unset;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--vk-panel);
  box-shadow: inset 0 0 0 1px var(--vk-border);
  line-height: 18px;
  cursor: default;
}
.vk-variable-chip-name:focus-visible { outline: 2px solid var(--vk-accent); outline-offset: -2px; }
/* A Variable close to the value typed: its name at the end of the field, quieter than a Variable's own. */
.vk-variable-hint {
  all: unset;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px var(--vk-border);
  color: var(--vk-text-muted);
  font-size: 10px;
  line-height: 16px;
  cursor: default;
}
.vk-variable-hint:hover { background: var(--vk-panel); color: var(--vk-text); }
.vk-variable-hint:focus-visible { outline: 2px solid var(--vk-accent); outline-offset: -2px; }
/* The Variables whose names have what is typed: a list under the field. */
.vk-matches {
  position: fixed;
  z-index: 2;
  box-sizing: border-box;
  max-height: 224px;
  overflow: auto;
  padding: 4px;
  border-radius: 8px;
  background: var(--vk-panel);
  box-shadow:
    inset 0 0 0 1px var(--vk-border),
    0 1px 2px rgb(0 0 0 / 0.12),
    0 8px 24px rgb(0 0 0 / 0.16);
  color: var(--vk-text);
}
.vk-swatch-button {
  display: block;
  background: var(--vk-swatch);
}
.vk-swatch-button:focus-visible { outline: 2px solid var(--vk-accent); outline-offset: 1px; }
.vk-popover {
  position: fixed;
  z-index: 2;
  box-sizing: border-box;
  max-height: min(480px, calc(100vh - 16px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 12px;
  border-radius: 12px;
  background: var(--vk-panel);
  box-shadow:
    inset 0 0 0 1px var(--vk-border),
    0 1px 2px rgb(0 0 0 / 0.12),
    0 8px 24px rgb(0 0 0 / 0.16);
  color: var(--vk-text);
  outline: none;
}
.vk-popover-header { display: flex; align-items: center; justify-content: space-between; }
.vk-popover-header .vk-section-title { margin: 0; }
.vk-tabs { display: flex; gap: 4px; }
.vk-tab {
  all: unset;
  padding: 0 8px;
  border-radius: 5px;
  line-height: 24px;
  color: var(--vk-text-muted);
}
.vk-tab[aria-selected="true"] { background: var(--vk-field); color: var(--vk-text); font-weight: 600; }
.vk-tab:focus-visible { outline: 2px solid var(--vk-accent); outline-offset: -2px; }
.vk-variable-search {
  flex: none;
  height: 24px;
  padding: 0 8px;
  border-radius: 5px;
  background: var(--vk-field);
}
.vk-variable-list { overflow: auto; min-height: 0; margin: 0 -12px; padding: 0 12px; }
.vk-variable-list .vk-subtitle { margin: 8px 0 4px; }
.vk-variable-option {
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
.vk-variable-option:hover, .vk-variable-option[aria-selected="true"] { background: var(--vk-field); }
.vk-variable-option:focus-visible { outline: 2px solid var(--vk-accent); outline-offset: -2px; }
.vk-variable-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vk-variable-value { color: var(--vk-text-muted); font-variant-numeric: tabular-nums; }
.vk-variable-preview {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: var(--vk-swatch);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
}
.vk-variable-preview.is-shadow { background: #fff; }
/* Marks over a view, as in Figma's guides: red where a layer lines up and for distances measured with ⌥, magenta for equal spacing. 1px, labels one size, at any zoom. */
.vk-marks { --vk-line: #f24822; --vk-spacing: #e81cc4; pointer-events: none; }
.vk-mark {
  --vk-mark-color: var(--vk-line);
  position: absolute;
  box-sizing: border-box;
  width: 0;
  height: 0;
  border-left: 1px solid var(--vk-mark-color);
  transform: translateX(-0.5px);
}
.vk-mark[data-across] { border-left: 0; border-top: 1px solid var(--vk-mark-color); transform: translateY(-0.5px); }
.vk-mark[data-type="gap"] { --vk-mark-color: var(--vk-spacing); }
.vk-mark[data-type="extension"] { border-left-style: dashed; border-top-style: dashed; }
.vk-mark-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--vk-mark-color);
  color: #fff;
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* A space between layers is labelled beside it, out of the way of the line. */
.vk-mark[data-type="gap"][data-across] .vk-mark-label { top: auto; bottom: 4px; transform: translateX(-50%); }
.vk-mark[data-type="gap"]:not([data-across]) .vk-mark-label { left: 4px; transform: translateY(-50%); }

@media (prefers-reduced-motion: reduce) {
  .vk-segment, .vk-selection, .vk-progress-done { transition: none; }
  /* A toast only fades: it does not rise or sink. */
  .vk-toast { animation-name: vk-toast-fade-in; transition-property: opacity; }
  .vk-toast.is-fading { translate: none; }
}
`;
