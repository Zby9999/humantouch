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

@media (prefers-reduced-motion: reduce) {
  .vk-dock, .vk-toggle { transition: none; }
}
`;
