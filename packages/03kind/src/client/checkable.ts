/**
 * Which changes the page checks (ADR 0006, 0013), from what the changes of
 * the round record alone: the page's check (`check.ts`) and what the change
 * notes tell the Agent of it (`writing-rules.ts`) both go by this, so they
 * cannot differ (ticket 65). With them, the properties that place a layer,
 * which the page checks by where it is drawn, and which the editor
 * (`edits.ts`, `range-parts.ts`) and the bench go by too, and the CSS sides
 * that place it along each axis; and where a layer made this round is to be
 * found (ticket 76). It imports types only, so the bench, run by Node itself,
 * imports it too.
 */
import type { Change, Created, Place, Target } from "./changeset";
import type { Property } from "./property-table";
import type { Axis } from "./snap";

/** The properties that place a layer by its X and Y: its `left` and `top`, past which its margins draw it (`Change.margins`); or from its container's right or bottom edge, by its `right` or `bottom` and its margins there (ticket 75). */
export const PLACING: readonly Property[] = ["x", "y", "absolute", "right", "bottom"];

/** A container's edge a layer placed freely is placed from along one axis: its start (left, top) or its end (right, bottom). */
export type Edge = "start" | "end";

/**
 * How a layer placed freely is placed along one axis (GLOSSARY: Placement,
 * ticket 75): from its container's `edge`, by the side that places it from
 * there (`SIDES`); `centered` on where that side places it, moved back half
 * its size (`translate: -50%` from the start, `50%` from the end).
 */
export interface PlacedFrom {
  edge: Edge;
  centered: boolean;
}

/** Along each axis, the CSS side that places a layer from its container's start edge and from its end edge (ticket 75). */
export const SIDES = {
  x: { start: "left", end: "right" },
  y: { start: "top", end: "bottom" },
} as const satisfies Record<Axis, Record<Edge, string>>;

/** The axis each size is along: width across, height down. */
export const SIZE_AXIS: Readonly<Partial<Record<string, Axis>>> = { width: "x", height: "y" };

/**
 * Of `PLACING`, those that place a layer along one axis by the CSS of one
 * side (`SIDES`): X by its `left`, Y by its `top`, and, for a layer placed
 * from its container's right or bottom edge, its offsets from that edge,
 * `right` and `bottom` (ticket 75).
 */
export const PLACED_BY: Readonly<Partial<Record<string, { axis: Axis; edge: Edge }>>> = {
  x: { axis: "x", edge: "start" },
  y: { axis: "y", edge: "start" },
  right: { axis: "x", edge: "end" },
  bottom: { axis: "y", edge: "end" },
};

/** Whether `property` is an offset from a container's end edge, `right` or `bottom`, which places a layer from that edge (ticket 75). */
export const isEndOffset = (property: string) => PLACED_BY[property]?.edge === "end";

/** The element the editor makes a new layer of on the canvas, by its type: the editor's, not the designer's, so the page finds the layer the Agent writes of any (ticket 76). */
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

/**
 * Whether the change is for one usage of a component, the others to stay as
 * they are: not one with no component, nor one written by a component used
 * outside any other (the notes' Scope line says it is changed where it is
 * written). The notes say so (`writing-rules.ts`), and the page looks at the
 * component's other usages for it (ticket 77).
 */
export function forOneUsage({ target: { chain } }: Pick<Change, "target">): boolean {
  const [own, ...outer] = chain;
  return !!own && !(own.usage && !outer.length);
}

/** The change that makes the layer `id` this round, if one of `round` does: new text or a Frame, a copy, a layer put back, a new Stack. */
export function makerOf<C extends Change>(id: string, round: C[]): C | null {
  const makes = (change: C) =>
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
export function madeLayer<C extends Change>(id: string, round: C[]): { maker: C; place: Place } | null {
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
