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
  font: 500 12px/16px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
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

.vk-hint {
  padding: 6px 10px;
  border-radius: 6px;
  background: #1e1e1e;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.18);
  white-space: nowrap;
}
.vk-hint[hidden] { display: none; }

@media (prefers-reduced-motion: reduce) {
  .vk-dock, .vk-toggle { transition: none; }
}
`;
