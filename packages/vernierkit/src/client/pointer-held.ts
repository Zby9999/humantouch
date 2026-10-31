/**
 * Whether the pointer is held down on something that edits as it moves: a
 * layer pressed on the canvas (dragged, or not yet), a value's icon, a
 * gradient's stop, a layer drawn with a tool. Meanwhile no key changes the
 * canvas, the changes or the history (`heldKey`, ADR 0012), so nothing is
 * undone or edited from under the press, and nothing it shows for the while
 * is carried off. One for the whole page: the keys are read in the Shell,
 * the presses made on the canvas and in the Design panel.
 */

/** The presses held, each by the pointer holding it. */
const held = new Map<symbol, number>();

/** A pointer let go or cancelled, wherever it is: the presses it held are over. */
const lift = (event: PointerEvent) => {
  for (const [press, pointerId] of held) if (pointerId === event.pointerId) held.delete(press);
  if (!held.size) stopWatching();
};

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
  if (!held.size) watchLifts();
  held.set(press, pointerId);
  return () => {
    if (held.delete(press) && !held.size) stopWatching();
  };
}

/** Whether a press is held now. */
export function pointerHeld(): boolean {
  return held.size > 0;
}

/**
 * Runs `then` once no press is held: at once when none is, else in the task
 * after the pointer is let go, so what the press does as it ends (a drop, say) is done first.
 */
export function whenLetGo(then: () => void) {
  if (!pointerHeld()) return then();
  const go = () => {
    window.removeEventListener("pointerup", go, true);
    window.removeEventListener("pointercancel", go, true);
    setTimeout(() => whenLetGo(then));
  };
  window.addEventListener("pointerup", go, true);
  window.addEventListener("pointercancel", go, true);
}
