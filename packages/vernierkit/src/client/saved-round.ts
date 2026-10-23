/**
 * The round as saved, edited with no canvas open: in preview mode, or after a
 * reload. The saved canvas is parsed, changed and written back as it is.
 */
import type { SavedRound } from "../service-protocol";
import { createChangeSet, type Place } from "./changeset";
import { elementsOf, restoreStyle } from "./canvas-style";
import { cssOf, type Property } from "./edits";
import { relocate } from "./moves";

/**
 * The round with change `id` taken back out, its layer back to where it
 * started on the saved canvas: as the page styled it, in the place it had. Null when no change is left: the round is then dropped.
 */
export function revertSaved(round: SavedRound, id: number): SavedRound | null {
  const changes = createChangeSet(round.changeSet);
  const change = changes.list().find((c) => c.id === id);
  if (!change) return round;
  changes.remove(id);
  const doc = new DOMParser().parseFromString(round.canvas, "text/html");
  if (change.kind === "move") relocate(doc, change.layer, change.after as Place, change.before as Place, {}, changes.list());
  else {
    const others = changes.list().filter((c) => c.layer === change.layer);
    for (const el of elementsOf(doc, change.layer)) restoreStyle(el, cssOf(change.property as Property), others);
  }
  if (!changes.list().length) return null;
  const doctype = /^<!DOCTYPE html>/i.test(round.canvas) ? "<!DOCTYPE html>" : "";
  return { canvas: doctype + doc.documentElement.outerHTML, changeSet: changes.save() };
}
