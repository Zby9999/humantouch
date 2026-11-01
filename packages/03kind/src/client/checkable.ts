/**
 * Which changes the page checks (ADR 0006, 0013), from what the changes of
 * the round record alone: the page's check (`check.ts`) and what the change
 * notes tell the Agent of it (`writing-rules.ts`) both go by this, so they
 * cannot differ (ticket 65). With them, the properties that place a layer,
 * which the page checks by where it is drawn, and which the editor
 * (`edits.ts`, `range-parts.ts`) and the bench go by too; and where a layer
 * made this round is to be found (ticket 76). It imports types only, so the
 * bench, run by Node itself, imports it too.
 */
import type { Change, Created, Place, Target } from "./changeset";
import type { Property } from "./property-table";

/** The properties that place a layer by its X and Y: its `left` and `top`, past which its margins draw it (`Change.margins`). */
export const PLACING: readonly Property[] = ["x", "y", "absolute"];

/** The element the editor makes a new layer of, by its type, as the Agent is told it is found by (ticket 76). */
export const NEW_TAGS: Record<Created["type"], string> = { text: "p", frame: "div" };

/**
 * Whether the page can check the change: it must find the layer by its
 * source marker (not a run of text), or, made this round as new text or a
 * Frame, at its place (`madeLayer`), and tell what the change does there: a
 * style, the layer made itself, a deletion, a reorder in the same container
 * (unless text runs on among its layers), a placement absolute in the same
 * container, that container found on the page too; not when one of a loop's
 * instances is changed alone, which the page cannot tell apart. `round`: the
 * changes of its round, where those that make layers are.
 */
export function checkable(change: Change, round: Change[]): boolean {
  const { target } = change;
  if (change.kind === "create") return !!madeLayer(change.layer, round);
  if (target.made) return change.kind === "style" && !!madeLayer(target.made, round);
  if (target.run !== undefined || !target.loc) return false;
  if (change.kind === "style") return true;
  if (change.data) return false;
  if (change.kind === "delete") return true;
  if (change.kind !== "move" || change.wrap) return false;
  const [before, after] = [change.before, change.after] as Place[];
  const container = after.container.target;
  if (before.container.layer !== after.container.layer || !container.loc || container.made) return false;
  return after.absolute ? true : !before.absolute && !!change.order;
}

/** The change that makes the layer `id` this round, if one of `round` does: new text or a Frame, a copy, a layer put back, a new Stack. */
export function makerOf(id: string, round: Change[]): Change | null {
  const makes = (change: Change) =>
    ["create", "duplicate", "putBack"].includes(change.kind) || (change.kind === "stack" && !!(change.after as { place: Place | null }).place);
  return round.find((change) => change.layer === id && makes(change)) ?? null;
}

/** Where the layer made this round by `maker` is now: where the designer last moved it, else where it was made. */
export function placeOfMade(maker: Change, round: Change[]): Place {
  const moved = round.filter((change) => change.kind === "move" && change.layer === maker.layer).at(-1);
  return moved ? (moved.after as Place) : (maker.after as Created).place;
}

/**
 * Of a layer made this round, the change that made it, new text or a Frame,
 * and where it is: in a container the page finds by its source marker, or in
 * one made this round the same way, as deep as they go (ticket 76). Null
 * when the page cannot find it: made otherwise (a copy, a layer put back, a
 * new Stack), made in a round before, or in such a container, or one with no marker.
 */
export function madeLayer(id: string, round: Change[]): { maker: Change; place: Place } | null {
  const maker = makerOf(id, round);
  if (maker?.kind !== "create") return null;
  const place = placeOfMade(maker, round);
  return findable(place.container.target, round) ? { maker, place } : null;
}

/** Whether the page can find a container: by its source marker, or made this round as a Frame it can find. */
function findable(target: Target, round: Change[]): boolean {
  if (target.made) return !!madeLayer(target.made, round);
  return !!target.loc && target.run === undefined;
}
