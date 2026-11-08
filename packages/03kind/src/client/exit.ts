import { useEffect, useRef, useState } from "preact/hooks";
import { POPOVER_EXIT_MS } from "./motion";

/** Whether the last input was a key: a key's closing is at once, a pointer's leaves (designer, 2026-11-08). */
let byKey = false;
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  // On the document, capturing: before any handler, the editor layer's (in its shadow root) included, acts on them.
  document.addEventListener("keydown", () => (byKey = true), true);
  document.addEventListener("pointerdown", () => (byKey = false), true);
}

export interface Exit<T> {
  /** What to draw: `value`, or while it leaves, the value it had. */
  shown: T | null;
  /** It was closed with the pointer and is leaving: draw it with `leavingProps`. */
  leaving: boolean;
  /** Its key: changes when it opens again while leaving, so it shows whole at once, afresh. */
  key: number;
}

/**
 * A popover kept a moment after it closes (designer, 2026-11-08): opened, it
 * shows at once; closed with the pointer (a choice clicked, a press outside,
 * its trigger clicked again), it is kept `POPOVER_EXIT_MS` while it fades and
 * moves down (`.is-leaving`), out of the accessibility tree and taking no
 * clicks; closed with a key (Esc, Enter, Tab), it is gone at once. Opened again
 * while it leaves, it is back at once.
 */
export function useExit<T>(value: T | null | false | undefined): Exit<T> {
  const [, redraw] = useState(0);
  const state = useRef({ shown: null as T | null, leaving: false, key: 0, timer: 0 }).current;
  useEffect(listen, []);
  useEffect(() => () => clearTimeout(state.timer), []);
  if (value) {
    if (state.leaving) {
      clearTimeout(state.timer);
      state.leaving = false;
      state.key++;
    }
    state.shown = value;
  } else if (state.shown !== null && !state.leaving) {
    if (byKey) state.shown = null;
    else {
      state.leaving = true;
      state.timer = window.setTimeout(() => {
        state.shown = null;
        state.leaving = false;
        redraw((n) => n + 1);
      }, POPOVER_EXIT_MS);
    }
  }
  return { shown: state.shown, leaving: state.leaving, key: state.key };
}

/** A leaving popover's: out of the accessibility tree and the focus order at once, its look `.is-leaving`'s. */
export function leavingProps(leaving: boolean) {
  return leaving ? { "aria-hidden": "true" as const, inert: true } : {};
}
