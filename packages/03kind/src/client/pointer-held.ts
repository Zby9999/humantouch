/**
 * Whether the pointer is held down on something that edits as it moves: a
 * layer pressed on the canvas (dragged, or not yet), a handle of the layer
 * selected (resizing it, or not yet), a value's icon, a gradient's stop, a
 * layer drawn with a tool. Meanwhile no key changes the
 * canvas, the changes or the history (`heldKey`, ADR 0012), so nothing is
 * undone or edited from under the press, and nothing it shows for the while
 * is carried off. One for the whole page: the keys are read in the Shell,
 * the presses made on the canvas and in the Design panel.
 */

/** The presses held, each by the pointer holding it. */
const held = new Map<symbol, number>();

/** Told when a press begins with none held, and when the last one held ends. */
const watchers = new Set<(held: boolean) => void>();

/** A pointer let go or cancelled, wherever it is: the presses it held are over. */
const lift = (event: PointerEvent) => {
  for (const [press, pointerId] of held) if (pointerId === event.pointerId) held.delete(press);
  if (!held.size) letGo();
};

function letGo() {
  stopWatching();
  for (const watcher of watchers) watcher(false);
}

/** Before anything on the page takes it: what ends with the press sees it over. */
function watchLifts() {
  window.addEventListener("pointerup", lift, true);
  window.addEventListener("pointercancel", lift, true);
}

function stopWatching() {
  window.removeEventListener("pointerup", lift, true);
  window.removeEventListener("pointercancel", lift, true);
}

/**
 * Holds from now until pointer `pointerId` is let go or cancelled. Returns
 * what ends it sooner, as Esc cancelling a drag does; called again, or once
 * the pointer is let go, it does nothing.
 */
export function holdPointer(pointerId: number): () => void {
  const press = Symbol("press");
  const first = !held.size;
  if (first) watchLifts();
  held.set(press, pointerId);
  if (first) for (const watcher of watchers) watcher(true);
  return () => {
    if (held.delete(press) && !held.size) letGo();
  };
}

/** Whether a press is held now. */
export function pointerHeld(): boolean {
  return held.size > 0;
}

/**
 * Calls `watcher` with true as a press begins with none held, and with false
 * as the last one held is let go, cancelled or ended sooner. Returns what
 * stops it.
 */
export function watchHolds(watcher: (held: boolean) => void): () => void {
  watchers.add(watcher);
  return () => void watchers.delete(watcher);
}
