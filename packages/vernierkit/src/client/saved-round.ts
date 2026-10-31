/**
 * The round as saved, edited with no canvas open: in preview mode, or after a
 * reload. The saved canvas is parsed, changed and written back as it is.
 */
import type { SavedRound } from "../service-protocol";
import { createChangeSet, withDependents, type Composed, type Created, type Dissolved, type Place, type PutBack, type RangePart } from "./changeset";
import { BRIEF_ATTR, changesOn, elementsOf, restoreStyle, upgradeEditStyles } from "./canvas-style";
import { cssOf, type Property } from "./property-table";
import { removeMade, unhide, writeText } from "./layer-changes";
import { relocate, syncOrders } from "./moves";
import { componentBrief, showComponent } from "./promote";
import { decompose, undissolve } from "./stacks";

/** The round with what the page shows in each part of change `id`'s range, read (ticket 65); null: it could not be, and the change is as one with no parts. */
export function withPartsRead(round: SavedRound, id: number, parts: RangePart[] | null): SavedRound {
  const changes = round.changeSet.changes.map((change) => {
    if (change.id !== id) return change;
    const { parts: _unread, ...rest } = change;
    return parts ? { ...rest, parts } : rest;
  });
  return { ...round, changeSet: { ...round.changeSet, changes } };
}

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
  upgradeEditStyles(doc);
  for (const change of taken) {
    changes.remove(change.id);
    const rest = changes.list();
    // A change to a component itself: on every element it writes.
    if (change.scope === "component") showComponent(doc, change.target.loc!, rest);
    else if (change.kind === "move") relocate(doc, change.layer, change.property, change.after as Place, change.before as Place, {}, rest);
    else if (change.kind === "stack") decompose(doc, change.layer, change.after as Composed, rest);
    else if (change.kind === "unstack") undissolve(doc, change.layer, change.after as Dissolved, rest);
    else if (change.kind === "create") removeMade(doc, change.layer, (change.after as Created).place.container.layer, rest);
    else if (change.kind === "duplicate") removeMade(doc, change.layer, (change.after as Place).container.layer, rest);
    else if (change.kind === "putBack") removeMade(doc, change.layer, (change.after as PutBack).place.container.layer, rest);
    else if (change.kind === "delete") unhide(doc, change.layer, change.property, rest);
    else if (change.kind === "text") writeText(doc, change.layer, change.property, null);
    else if (change.kind === "brief") {
      // Back to none, or to the brief a copy was copied with, or its component's.
      for (const el of elementsOf(doc, change.layer)) {
        const brief = (change.before as string | null) || componentBrief(el, rest);
        if (brief) el.setAttribute(BRIEF_ATTR, brief);
        else el.removeAttribute(BRIEF_ATTR);
      }
    }
    else {
      restoreStyle(elementsOf(doc, change.layer), cssOf(change.property as Property), changesOn(change.layer, rest), change.breakpoint ?? null);
      // Placed freely at a breakpoint no more: its container is no positioning reference there for it.
      if (change.within) restoreStyle(elementsOf(doc, change.within), ["position"], changesOn(change.within, rest), change.breakpoint ?? null);
    }
  }
  syncOrders(doc, changes);
  if (!changes.list().length) return null;
  const doctype = /^<!DOCTYPE html>/i.test(round.canvas) ? "<!DOCTYPE html>" : "";
  return { canvas: doctype + doc.documentElement.outerHTML, changeSet: changes.save() };
}
