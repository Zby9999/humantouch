/**
 * The round as saved, edited with no canvas open: in preview mode, or after a
 * reload. The saved canvas is parsed, changed and written back as it is.
 */
import type { SavedRound } from "../service-protocol";
import { createChangeSet, placedAt, withDependents, type Change, type SavedChangeSet, type Composed, type Created, type Dissolved, type Place, type PutBack, type RangePart } from "./changeset";
import { BRIEF_ATTR, changesOn, DELETED_ATTR, elementsOf, LAYER_ID_ATTR, MOVE_ATTR, ORIGINAL_TEXT_ATTR, REFERENCE_ATTR, restoreStyle, takeInEdits, TEXT_ATTR, upgradeEditStyles } from "./canvas-style";
import { cssOf, type Property } from "./property-table";
import { removeMade, unhide, writeText } from "./layer-changes";
import { relocate, syncOrders } from "./moves";
import { componentBrief, componentElements, showComponent } from "./promote";
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
  takeInApplied(doc, round.changeSet);
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
      // A gap that took over its layers' margins between them (ticket 122): theirs again.
      for (const { layer, margins } of change.marginsDropped ?? []) restoreStyle(elementsOf(doc, layer), Object.keys(margins), changesOn(layer, rest), change.breakpoint ?? null);
    }
  }
  syncOrders(doc, changes);
  if (!changes.list().length) return null;
  const doctype = /^<!DOCTYPE html>/i.test(round.canvas) ? "<!DOCTYPE html>" : "";
  return { canvas: doctype + doc.documentElement.outerHTML, changeSet: changes.save() };
}

/**
 * Takes into a saved canvas, put back in `doc`, the changes of the rounds
 * before that were applied (`changeSet.applied`, ticket 68), while the
 * changes left were carried over: their edits go under those left, as the
 * page's own, which no undo takes back off (`takeInEdits`); the words
 * applied are the words the page has, which new words go from. It looks as
 * it did. A ChangeSet with none applied changes nothing. The ChangeSet
 * saved from then on has none: the canvas has them.
 */
export function takeInApplied(doc: Document, changeSet: SavedChangeSet) {
  const applied = changeSet.applied ?? [];
  if (!applied.length) return;
  const left = changeSet.changes;
  const on = (changes: Change[]) => (el: Element) => {
    const id = el.getAttribute(LAYER_ID_ATTR);
    if (!id) return [];
    // A move or a deletion of one of a loop's instances alone is not on the others: those elements are marked with it.
    const own = changesOn(id, changes).filter((change) => {
      const mark = change.kind === "move" ? MOVE_ATTR : change.kind === "delete" ? DELETED_ATTR : null;
      return !change.data || !mark || el.getAttribute(mark) === change.property;
    });
    // A container made the positioning reference of what they place absolute in it (`holdAbsolute`): its `position` is theirs.
    const holding = el.hasAttribute(REFERENCE_ATTR) ? changes.filter((change) => placedAt(change)?.absolute && placedAt(change)!.container.layer === id) : [];
    return [...own, ...holding.map((change) => ({ ...change, style: { position: "relative" } }))];
  };
  // The elements each component's changes are written on, those applied and those left.
  const written = new Map<Element, { applied: Change[]; left: Change[] }>();
  for (const [changes, which] of [[applied, "applied"], [left, "left"]] as const) {
    for (const change of changes) {
      if (change.scope !== "component" || change.kind !== "style" || !change.target.loc) continue;
      for (const el of componentElements(doc, change.target.loc)) {
        const both = written.get(el) ?? { applied: [], left: [] };
        both[which].push(change);
        written.set(el, both);
      }
    }
  }
  const appliedOn = on(applied);
  const touched = new Set([...doc.querySelectorAll(`[${LAYER_ID_ATTR}]`)].filter((el) => appliedOn(el).length || written.get(el)?.applied.length));
  takeInEdits(touched, appliedOn, on(left), (el) => written.get(el) ?? { applied: [], left: [] });
  for (const change of applied) {
    if (change.kind !== "text") continue;
    for (const el of elementsOf(doc, change.layer)) {
      if (el.getAttribute(TEXT_ATTR) !== change.property) continue;
      el.removeAttribute(TEXT_ATTR);
      el.removeAttribute(ORIGINAL_TEXT_ATTR);
    }
  }
}
