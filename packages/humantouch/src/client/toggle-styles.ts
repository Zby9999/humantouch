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
  --ht-icon-size: 13.5px;
  --ht-icon-stroke: 1.05px;
}

.ht-dock {
  --ht-gap: 16px;
  --ht-hold: ${UNLOCK_HOLD_MS}ms;
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
.ht-dock[data-corner="top-left"] { top: var(--ht-gap); left: var(--ht-gap); }
.ht-dock[data-corner="top-right"] { top: var(--ht-gap); right: var(--ht-gap); flex-direction: row-reverse; }
.ht-dock[data-corner="bottom-left"] { bottom: var(--ht-gap); left: var(--ht-gap); }
.ht-dock[data-corner="bottom-right"] { bottom: var(--ht-gap); right: var(--ht-gap); flex-direction: row-reverse; }
.ht-dock.is-dragging { transition: none; }

/*
 * As the canvas's tools (designer, 2026-11-09): in a column on the panels' gray, a hairline round it, 4px in, its corners
 * 10px round the buttons' 6px; the toggle nearest its corner, the count after it.
 */
.ht-toggle-wrap {
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
.ht-dock[data-corner^="bottom"] .ht-toggle-wrap { flex-direction: column-reverse; }

/* 28px, a button with an edge: the chosen tool's white and shadow (designer, 2026-11-09). */
.ht-toggle {
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
.ht-toggle:hover { color: #0a0a09; }
.ht-toggle:active { scale: 0.96; }
.ht-dock.is-dragging .ht-toggle { cursor: grabbing; scale: 1.04; }
.ht-toggle:focus-visible { outline: 2px solid #0d99ff; outline-offset: 2px; }

/* Locked while the Agent applies the round; dimmed the same while edit mode is on its way. */
.ht-toggle:is([aria-disabled="true"], [aria-busy="true"]) { cursor: progress; color: rgb(82 83 81 / 0.5); }

@media (prefers-reduced-motion: reduce) {
  .ht-dock, .ht-toggle { transition: none; }
}
`;
