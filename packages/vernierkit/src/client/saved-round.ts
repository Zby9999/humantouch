/**
 * The round as saved, edited with no canvas open: in preview mode, or after a
 * reload. The saved canvas is parsed, changed and written back as it is.
 */
import type { SavedRound } from "../service-protocol";
import { createChangeSet, withDependents, type Composed, type Dissolved, type Place } from "./changeset";
import { changesOn, elementsOf, restoreStyle } from "./canvas-style";
import { cssOf, type Property } from "./edits";
import { relocate } from "./moves";
import { decompose, undissolve } from "./stacks";

/**
 * The round with change `id` taken back out, its layer back to where it
 * started on the saved canvas: as the page styled it, in the place it had.
 * What builds on it goes too, first. Null when no change is left: the round is then dropped.
 */
export function revertSaved(round: SavedRound, id: number): SavedRound | null {
  const changes = createChangeSet(round.changeSet);
  const taken = withDependents(changes.list(), id);
  if (!taken.length) return round;
  const doc = new DOMParser().parseFromString(round.canvas, "text/html");
  for (const change of taken) {
    changes.remove(change.id);
    const rest = changes.list();
    if (change.kind === "move") relocate(doc, change.layer, change.property, change.after as Place, change.before as Place, {}, rest);
    else if (change.kind === "stack") decompose(doc, change.layer, change.after as Composed, rest);
    else if (change.kind === "unstack") undissolve(doc, change.layer, change.after as Dissolved, rest);
    else for (const el of elementsOf(doc, change.layer)) restoreStyle(el, cssOf(change.property as Property), changesOn(change.layer, rest));
  }
  if (!changes.list().length) return null;
  const doctype = /^<!DOCTYPE html>/i.test(round.canvas) ? "<!DOCTYPE html>" : "";
  return { canvas: doctype + doc.documentElement.outerHTML, changeSet: changes.save() };
}
