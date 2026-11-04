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
 * its size (`translate: -50%` from the start, `50%` from the end); or, with
 * `margins`, centered between both its sides by its margins there, both
 * `auto`, which take up the room its size leaves (`inset-x-0 mx-auto w-12`,
 * ticket 96): placed from its start then, as X and Y go, and centered;
 * `held`, so with its size `auto`, held by a maximum (`inset-x-0 mx-auto
 * max-w-md`, ticket 97), filling the room its sides leave where less.
 */
export interface PlacedFrom {
  edge: Edge;
  centered: boolean;
  margins?: true;
  held?: true;
}

/**
 * A length as a share of a container's size along one axis and px past that:
 * `calc(50% + 20px)` is 50 and 20. How a layer centered is placed: what its
 * side gives it, the share kept as it moves (ticket 79), which is where its
 * middle is; centered by its auto margins, where its middle is too, which its
 * sides give it between them (ticket 96).
 */
export interface Share {
  percent: number;
  px: number;
}

/**
 * Along one axis, how a layer placed absolute is placed otherwise than from
 * its container's left or top edge, and what the side that places it so gives
 * it (ticket 79): from the right or bottom edge, px (the share none); centered, a share.
 */
export interface PlacedAlong extends PlacedFrom, Share {}

/** A share in px, of a size `of` px. */
export const pxIn = ({ percent, px }: Share, of: number) => (percent / 100) * of + px;

/** A share as CSS writes it: `50%`, `20px`, `calc(50% + 20px)`, `calc(50% - 20px)`, to two places. */
export function shareCss({ percent, px }: Share): string {
  const [p, n] = [Math.round(percent * 100) / 100, Math.round(px * 100) / 100];
  if (!p) return `${n}px`;
  if (!n) return `${p}%`;
  return `calc(${p}% ${n < 0 ? "-" : "+"} ${Math.abs(n)}px)`;
}

/**
 * The sides of a layer centered by its auto margins (ticket 96), placed
 * afresh with its middle at `middle`, a share of its container: both from 0,
 * as much past it one way as the other (`left: 20px; right: -20px` for 50%
 * and 20px). `0 - px`: no `-0px` for none.
 */
export const centeringSides = ({ percent, px }: Share): Record<Edge, Share> => ({ start: { percent: percent - 50, px }, end: { percent: 50 - percent, px: 0 - px } });

/** Where the middle of a layer centered by its auto margins between its sides is (ticket 96), its sides given as `sides`: what `centeringSides` gives them. */
export const middleOf = ({ start, end }: Record<Edge, Share>): Share => ({ percent: (100 + start.percent - end.percent) / 2, px: (start.px - end.px) / 2 });

/** A layer's margins along each axis both `auto`, as CSS writes them: what centers it between its sides (ticket 96). Tailwind's are `AUTO_MARGINS_CLASS`. */
export const AUTO_MARGINS = { x: "margin-inline: auto", y: "margin-block: auto" } as const satisfies Record<Axis, string>;

/** `AUTO_MARGINS` as Tailwind writes them. */
export const AUTO_MARGINS_CLASS = { x: "mx-auto", y: "my-auto" } as const satisfies Record<Axis, string>;

/** Along each axis, the CSS side that places a layer from its container's start edge and from its end edge (ticket 75). */
export const SIDES = {
  x: { start: "left", end: "right" },
  y: { start: "top", end: "bottom" },
} as const satisfies Record<Axis, Record<Edge, string>>;

/** The size along each axis: width across, height down. */
export const AXIS_SIZE = { x: "width", y: "height" } as const satisfies Record<Axis, string>;

/** Which way each axis goes, in words: across, down. */
export const AXIS_WAY = { x: "across", y: "down" } as const satisfies Record<Axis, string>;

/** The other edge along an axis: what a side placing a layer from one edge leaves `auto`. */
export const OTHER_EDGE = { start: "end", end: "start" } as const satisfies Record<Edge, Edge>;

/**
 * The sign of the translate that centers a layer on where its side from each
 * edge places it (ticket 75): back half its size from the start (`-50%`, Tailwind's
 * `-translate-x-1/2`), forward from the end (`50%`, `translate-x-1/2`).
 */
export const CENTERING_SIGN = { start: "-", end: "" } as const satisfies Record<Edge, string>;

/** The axis each size is along: width across, height down. */
export const SIZE_AXIS: Readonly<Partial<Record<string, Axis>>> = { width: "x", height: "y" };

/** The axis each maximum size is along: what a resize sets of a layer centered by its auto margins, held by one (ticket 97). */
export const MAX_AXIS: Readonly<Partial<Record<string, Axis>>> = { maxWidth: "x", maxHeight: "y" };

/** The CSS maximum along each axis. */
export const AXIS_MAX = { x: "max-width", y: "max-height" } as const satisfies Record<Axis, string>;

/**
 * How a layer still in its container's layout is moved by its `left`, `top`,
 * `right` or `bottom` (ticket 84): placed `relative`, moved that far from
 * where its container lays it out; placed `sticky`, kept that far in from the
 * edge of what it scrolls in, as far as its container lets it.
 */
export type InLayout = "relative" | "sticky";

/** How a layer is placed, as the browser computes its `position`. */
export type Position = "static" | InLayout | "absolute" | "fixed";

/**
 * How far a value given to a layer's side from `edge` moves it, placed
 * relative, across or down (ticket 84): a `left` or `top` as far, a `right`
 * or `bottom` as far the other way; and so the value, of how far it is moved.
 */
export const movedBy = (edge: Edge, value: number) => (edge === "start" ? value : 0 - value);

/** One CSS side of a layer: along `axis`, the one that places it from its container's `edge` (`SIDES`). */
export interface Side {
  axis: Axis;
  edge: Edge;
}

/**
 * Of `PLACING`, those that place a layer along one axis by the CSS of one
 * side (`SIDES`): X by its `left`, Y by its `top`, and, for a layer placed
 * from its container's right or bottom edge, its offsets from that edge,
 * `right` and `bottom` (ticket 75).
 */
export const PLACED_BY: Readonly<Partial<Record<string, Side>>> = {
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
 * style, the layer made itself, a deletion, new words (ticket 90), a reorder
 * in the same container (unless text runs on among its layers), a placement
 * absolute in the same container, that container found on the page too; not
 * when one of a loop's instances is changed alone, which the page cannot tell
 * apart. New words of a layer made this round are its maker's, checked with
 * it. `round`: the changes of its round, where those that make layers are.
 */
export function checkable(change: Change, round: Change[]): boolean {
  const { target } = change;
  if (change.kind === "create") return !!madeLayer(change.layer, round);
  if (target.made) return change.kind === "style" && !!madeLayer(target.made, round);
  if (!foundByMarker(target)) return false;
  if (change.kind === "style") return true;
  if (change.data) return false;
  if (change.kind === "delete" || change.kind === "text") return true;
  if (change.kind !== "move" || change.wrap) return false;
  const [before, after] = [change.before, change.after] as Place[];
  const container = after.container.target;
  if (before.container.layer !== after.container.layer || !container.loc || container.made) return false;
  return after.absolute ? true : !before.absolute && !!change.order;
}

/**
 * Whether the change moves a Frame's only text, as a button's words are
 * (`Target.onlyText`), in the same container: placed freely in that Frame
 * (ticket 95). It has no element of its own: the canvas wraps it in a
 * `<span>` to move it, which the page does not have, so it cannot find it,
 * as it cannot a run of text.
 */
export function textMovedInPlace(change: Change): boolean {
  if (change.kind !== "move" || !change.target.onlyText) return false;
  const [before, after] = [change.before, change.after] as Place[];
  return before.container.layer === after.container.layer;
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
 * Whether the page finds a layer by its source marker (`Target.loc`): one
 * with an element of its own, not a run of text, and not made this round
 * (found where its change puts it instead, `whereMade`).
 */
export function foundByMarker(target: Target): boolean {
  return !target.made && !!target.loc && target.run === undefined;
}

/**
 * Why the page cannot find a layer made this round, or a container one is
 * made in: made in a round before, so the canvas has no source marker for it
 * (`before`); made otherwise than as new text or a Frame, as a copy, a layer
 * put back or a new Stack (`otherwise`); a container with no source marker
 * (`unmarked`).
 */
export type Unfound = "before" | "otherwise" | "unmarked";

/**
 * Of a layer made this round, the change that made it, new text or a Frame,
 * and where it is: in a container the page finds by its source marker, or in
 * one made this round the same way, as deep as they go (ticket 76). Else why
 * the page cannot find it: the layer itself (`layer`), or its container or
 * one that is in, in turn (`container`). Whether the page can check a change
 * (`checkable`) and why it cannot (`check.ts`) both go by this.
 */
export function whereMade<C extends Change>(id: string, round: C[]): { maker: C; place: Place } | { layer: Exclude<Unfound, "unmarked"> } | { container: Unfound } {
  const maker = makerOf(id, round);
  if (!maker) return { layer: "before" };
  if (maker.kind !== "create") return { layer: "otherwise" };
  const place = placeOfMade(maker, round);
  const { target } = place.container;
  if (!target.made) return foundByMarker(target) ? { maker, place } : { container: "unmarked" };
  const outer = whereMade(target.made, round);
  if ("maker" in outer) return { maker, place };
  return { container: "layer" in outer ? outer.layer : outer.container };
}

/** Of a layer made this round, the change that made it and where it is, as `whereMade` finds it; null when the page cannot find it. */
export function madeLayer<C extends Change>(id: string, round: C[]): { maker: C; place: Place } | null {
  const where = whereMade(id, round);
  return "maker" in where ? where : null;
}
