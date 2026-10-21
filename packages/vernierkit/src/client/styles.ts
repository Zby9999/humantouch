export const FONT_STACK = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Editor layer styles. They live inside the Shadow DOM and never touch the page. */
export const styles = /* css */ `
:host {
  /* Cut off everything the page could pass down by inheritance. */
  all: initial !important;
}

.vk-dock {
  --vk-gap: 16px;
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

/* Edit mode shell. Figma-like; follows the system light / dark setting. */
.vk-shell {
  --vk-panel: #ffffff;
  --vk-canvas: #f5f5f5;
  --vk-border: #e6e6e6;
  --vk-text: #1e1e1e;
  --vk-text-muted: #757575;
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
    color-scheme: dark;
  }
}

.vk-panel {
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--vk-panel);
}
.vk-panel:first-child { border-right: 1px solid var(--vk-border); }
.vk-panel:last-child { border-left: 1px solid var(--vk-border); }
.vk-panel-title {
  margin: 0;
  padding: 12px 16px;
  font: inherit;
  font-weight: 600;
  border-bottom: 1px solid var(--vk-border);
}
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

.vk-viewport {
  position: relative;
  overflow: hidden;
  outline: none;
  touch-action: none;
  background: var(--vk-canvas);
}
.vk-viewport.is-pan-ready { cursor: grab; }
.vk-viewport-message {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: var(--vk-text-muted);
}
.vk-viewport.is-panning { cursor: grabbing; }
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

.vk-selection {
  --vk-selection: var(--vk-accent);
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--vk-selection);
  pointer-events: none;
}
.vk-selection[data-kind="instance"] { --vk-selection: var(--vk-instance); }
.vk-selection[data-kind="locked"] { --vk-selection: var(--vk-locked); }
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

@media (prefers-reduced-motion: reduce) {
  .vk-dock, .vk-toggle { transition: none; }
}
`;
