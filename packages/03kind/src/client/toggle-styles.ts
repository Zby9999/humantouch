import { UNLOCK_HOLD_MS } from "./toggle-motion";

export const FONT_STACK = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * The toggle's styles: all the page loads with it. The rest of the editor
 * layer brings its own (`styles`) as it loads, the toggle's change count and ring
 * among them: until then, there is no round for them to show. Inside the
 * Shadow DOM, they never touch the page.
 */
export const toggleStyles = /* css */ `
:host {
  /* Cut off everything the page could pass down by inheritance. */
  all: initial !important;
  /* The editor's icons: how large, and how thick their lines are on screen, whatever their size (designer, 2026-11-08, tuned with DialKit). */
  --tk-icon-size: 13.5px;
  --tk-icon-stroke: 1.05px;
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

/*
 * As the canvas's tools (designer, 2026-11-09): in a column on the panels' gray, a hairline round it, 4px in, its corners
 * 10px round the buttons' 6px; the toggle nearest its corner, the count after it.
 */
.tk-toggle-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px;
  border-radius: 10px;
  background: #f5f5f5;
  box-shadow: 0 0 0 0.5px #d4d4d3;
}
.tk-dock[data-corner^="bottom"] .tk-toggle-wrap { flex-direction: column-reverse; }

/* 28px, a button with an edge: the chosen tool's white and shadow (designer, 2026-11-09). */
.tk-toggle {
  all: unset;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #fff;
  color: #525351;
  box-shadow: 0 1px 1px rgb(0 0 0 / 0.15), 0 0 0 0.5px rgb(0 0 0 / 0.15);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: color 120ms ease, scale 120ms ease;
}
.tk-toggle:hover { color: #0a0a09; }
.tk-toggle:active { scale: 0.96; }
.tk-dock.is-dragging .tk-toggle { cursor: grabbing; scale: 1.04; }
.tk-toggle:focus-visible { outline: 2px solid #0d99ff; outline-offset: 2px; }

/* Locked while the Agent applies the round; dimmed the same while edit mode is on its way. */
.tk-toggle:is([aria-disabled="true"], [aria-busy="true"]) { cursor: progress; color: rgb(82 83 81 / 0.5); }

@media (prefers-reduced-motion: reduce) {
  .tk-dock, .tk-toggle { transition: none; }
}
`;
