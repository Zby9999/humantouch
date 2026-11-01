/**
 * Whether the Agent applying a claimed round seems to have stopped (ticket 67):
 * for a while, nothing the page can see has moved. What moves is the dev
 * server bringing code into the page (as for ticket 66), which this watches
 * itself, and what the editor layer hears of the round and tells it with
 * `moved()`: the page's progress (a change newly shown, or no longer) and a
 * `done` (its ask, and `finish`'s). The while runs from the claim as the page
 * hears of it (or from when the page opens on a claimed round): an Agent may
 * think a long time before its first edit.
 */
import { watchCodeChanges } from "./code-changes";

/**
 * How long nothing moves before the Agent counts as stopped: 1.5 times the
 * longest the bench saw real Agents sit still mid-round on the code as it is
 * (ticket 67: Cursor with no Skill, 367 s, thinking from its claim to its first edit).
 */
export const STALL_MS = 551_000;

export interface StallWatch {
  /** The Agent moved, or the designer chose to keep waiting: a notice goes, and the while starts again. */
  moved(): void;
  /** No more watching: the round has ended, or the page no longer checks it. */
  stop(): void;
}

/**
 * Watches `win`'s page from now on: `onStalled(true)` once nothing has moved
 * for `ms`, `onStalled(false)` as something moves again. Looks again as the
 * page comes back into view: a background tab's timers may run late.
 */
export function watchStall(win: Window, onStalled: (stalled: boolean) => void, { ms = STALL_MS } = {}): StallWatch {
  let stalled = false;
  let since = win.performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const say = (now: boolean) => {
    if (now === stalled) return;
    stalled = now;
    onStalled(now);
  };
  const look = () => {
    clearTimeout(timer);
    const left = since + ms - win.performance.now();
    if (left <= 0) say(true);
    else timer = setTimeout(look, left);
  };
  const moved = () => {
    since = win.performance.now();
    say(false);
    look();
  };
  // Every update, however close to the one before: each is the Agent at work.
  const stopCode = watchCodeChanges(win, moved, { quietMs: 0 });
  const onVisible = () => {
    if (win.document.visibilityState === "visible") look();
  };
  win.document.addEventListener("visibilitychange", onVisible);
  look();
  return {
    moved,
    stop() {
      clearTimeout(timer);
      stopCode();
      win.document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
