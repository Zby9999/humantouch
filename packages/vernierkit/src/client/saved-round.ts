/**
 * The round as saved, edited with no canvas open: in preview mode, or after a
 * reload. The saved canvas is parsed, changed and written back as it is.
 */
import type { SavedRound } from "../service-protocol";
import { createChangeSet } from "./changeset";
import { LAYER_ID_ATTR, restoreStyle, type Property } from "./edits";

/**
 * The round with change `id` taken back out, its layer back to where it
 * started on the saved canvas. Null when no change is left: the round is then dropped.
 */
export function revertSaved(round: SavedRound, id: number): SavedRound | null {
  const changes = createChangeSet(round.changeSet);
  const change = changes.list().find((c) => c.id === id);
  if (!change) return round;
  changes.remove(id);
  const doc = new DOMParser().parseFromString(round.canvas, "text/html");
  const others = changes.list().filter((c) => c.layer === change.layer);
  for (const el of doc.querySelectorAll(`[${LAYER_ID_ATTR}="${CSS.escape(change.layer)}"]`)) restoreStyle(el, change.property as Property, others);
  if (!changes.list().length) return null;
  const doctype = /^<!DOCTYPE html>/i.test(round.canvas) ? "<!DOCTYPE html>" : "";
  return { canvas: doctype + doc.documentElement.outerHTML, changeSet: changes.save() };
}
