/**
 * Which changes the page checks (ADR 0006, 0013), from what the change
 * records alone: the page's check (`check.ts`) and what the change notes tell
 * the Agent of it (`writing-rules.ts`) both go by this, so they cannot differ
 * (ticket 65). With them, the properties that place a layer, which the page
 * checks by where it is drawn, and which the editor (`edits.ts`, `range-parts.ts`)
 * and the bench go by too. It imports types only, so the bench, run by Node
 * itself, imports it too.
 */
import type { Change, Place } from "./changeset";
import type { Property } from "./property-table";

/** The properties that place a layer by its X and Y: its `left` and `top`, past which its margins draw it (`Change.margins`); or from its container's right or bottom edge, by its `right` or `bottom` and its margins there (ticket 75). */
export const PLACING: readonly Property[] = ["x", "y", "absolute", "right", "bottom"];

/**
 * Whether the page can check the change: it must find the layer by its
 * source marker (not one made this round, nor a run of text), and tell what
 * the change does there: a style, a deletion, a reorder in the same container
 * (unless text runs on among its layers), a placement absolute in the same
 * container, that container found on the page too; not when one of a loop's
 * instances is changed alone, which the page cannot tell apart.
 */
export function checkable(change: Change): boolean {
  const { target } = change;
  if (target.made || target.run !== undefined || !target.loc) return false;
  if (change.kind === "style") return true;
  if (change.data) return false;
  if (change.kind === "delete") return true;
  if (change.kind !== "move" || change.wrap) return false;
  const [before, after] = [change.before, change.after] as Place[];
  const container = after.container.target;
  if (before.container.layer !== after.container.layer || !container.loc || container.made) return false;
  return after.absolute ? true : !before.absolute && !!change.order;
}
