import { EASE_OUT, UNLOCK_HOLD_MS } from "./motion";

export const FONT_STACK = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Editor layer styles. They live inside the Shadow DOM and never touch the page. */
export const styles = /* css */ `
:host {
  /* Cut off everything the page could pass down by inheritance. */
  all: initial !important;
  /* The editor's icons: how large, and how thick their lines are on screen, whatever their size. */
  --vk-icon-size: 14px;
  --vk-icon-stroke: 1px;
}

.vk-icon { flex: none; width: var(--vk-icon-size); height: var(--vk-icon-size); }
.vk-icon * { stroke-width: var(--vk-icon-stroke); vector-effect: non-scaling-stroke; }

.vk-dock {
  --vk-gap: 16px;
  --vk-hold: ${UNLOCK_HOLD_MS}ms;
  position: fixed;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 8px;
  font: 500 12px/16px ${FONT_STACK};
  letter-spacing: normal;
  color: #fff;
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.vk-dock[data-corner="top-left"] { top: var(--vk-gap); left: var(--vk-gap); }
.vk-dock[data-corner="top-right"] { top: var(--vk-gap); right: var(--vk-gap); flex-direction: row-reverse; }
.vk-dock[data-corner="bottom-left"] { bottom: var(--vk-gap); left: var(--vk-gap); }
.vk-dock[data-corner="bottom-right"] { bottom: var(--vk-gap); right: var(--vk-gap); flex-direction: row-reverse; }
.vk-dock.is-dragging { transition: none; }

.vk-toggle {
  all: unset;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #1e1e1e;
  color: #fff;
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 0.08),
    0 1px 2px rgb(0 0 0 / 0.2),
    0 4px 12px rgb(0 0 0 / 0.18);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: background-color 120ms ease, scale 120ms ease;
}
.vk-toggle:hover { background: #2c2c2c; }
.vk-toggle:active { scale: 0.96; }
.vk-dock.is-dragging .vk-toggle { cursor: grabbing; scale: 1.04; }
.vk-toggle:focus-visible { outline: 2px solid #0d99ff; outline-offset: 2px; }

.vk-toggle-wrap { position: relative; }

/* Locked while the Agent applies the round: a ring fills as changes are done. */
.vk-toggle[aria-disabled="true"] { cursor: progress; color: rgb(255 255 255 / 0.5); }
.vk-toggle[aria-disabled="true"]:hover { background: #1e1e1e; }
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

@media (prefers-reduced-motion: reduce) {
  .vk-dock, .vk-toggle, .vk-segment, .vk-selection, .vk-progress-done { transition: none; }
}
`;
