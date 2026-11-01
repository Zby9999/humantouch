import { UNLOCK_HOLD_MS } from "./motion";

export const FONT_STACK = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * The toggle's styles: all the page loads with it. The rest of the editor
 * layer brings its own (`styles`) as it loads, the toggle's badge and ring
 * among them: until then, there is no round for them to show. Inside the
 * Shadow DOM, they never touch the page.
 */
export const toggleStyles = /* css */ `
:host {
  /* Cut off everything the page could pass down by inheritance. */
  all: initial !important;
  /* The editor's icons: how large, and how thick their lines are on screen, whatever their size. */
  --tk-icon-size: 14px;
  --tk-icon-stroke: 1px;
}

.tk-dock {
  --tk-gap: 16px;
  --tk-hold: ${UNLOCK_HOLD_MS}ms;
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
.tk-dock[data-corner="top-left"] { top: var(--tk-gap); left: var(--tk-gap); }
.tk-dock[data-corner="top-right"] { top: var(--tk-gap); right: var(--tk-gap); flex-direction: row-reverse; }
.tk-dock[data-corner="bottom-left"] { bottom: var(--tk-gap); left: var(--tk-gap); }
.tk-dock[data-corner="bottom-right"] { bottom: var(--tk-gap); right: var(--tk-gap); flex-direction: row-reverse; }
.tk-dock.is-dragging { transition: none; }

.tk-toggle {
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
.tk-toggle:hover { background: #2c2c2c; }
.tk-toggle:active { scale: 0.96; }
.tk-dock.is-dragging .tk-toggle { cursor: grabbing; scale: 1.04; }
.tk-toggle:focus-visible { outline: 2px solid #0d99ff; outline-offset: 2px; }

.tk-toggle-wrap { position: relative; }

/* Locked while the Agent applies the round; dimmed the same while edit mode is on its way. */
.tk-toggle:is([aria-disabled="true"], [aria-busy="true"]) { cursor: progress; color: rgb(255 255 255 / 0.5); }
.tk-toggle:is([aria-disabled="true"], [aria-busy="true"]):hover { background: #1e1e1e; }

@media (prefers-reduced-motion: reduce) {
  .tk-dock, .tk-toggle { transition: none; }
}
`;
