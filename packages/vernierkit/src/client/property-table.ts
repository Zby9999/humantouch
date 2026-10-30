/**
 * The property table: what the Design panel edits, by property, in design
 * language, and how each is read from an element as it is laid out, which CSS
 * shows it, and which CSS sets it in the page's styles. It knows nothing of
 * the editor or the views, and of the ChangeSet only which changes are to
 * text: the editor reads and writes through it.
 */
import { asShown, declaredByEdit } from "./canvas-style";
import type { Change, Fragment } from "./changeset";
import { blur, readShadows, readTextShadows, textCanDraw, writeShadows, writeTextShadows, type Blur, type Shadow } from "./effects";
import { equalColumns, trackCount } from "./grid-tracks";
import type { Layer, LayerKind } from "./layers";
import { colorReader, fillApplies, fillSets, readFill, STROKE_SETS, writeFill, writeStroke, type ColorReader, type Fill, type Stroke } from "./paint";
import { readWrittenStroke, strokeReference } from "./stroke-weight";
import { pinOffsetOf, sourcesOf } from "./style-source";
import { TYPOGRAPHY, type TypographyValues } from "./typography";

export type { ColorStop, Fill, Gradient, Stroke } from "./paint";
export type { Shadow } from "./effects";

/** Corner radius in px: one for all corners, or top-left, top-right, bottom-right, bottom-left. */
export type Radius = number | [number, number, number, number];

/**
 * How a layer is sized along one axis: Fixed at a size in px (border and
 * padding included), Hug its content, or Fill the room its Stack gives it.
 */
export type Size = { type: "fixed"; value: number } | { type: "hug" } | { type: "fill" };

/** Padding in px: top, right, bottom, left. */
export type Padding = [number, number, number, number];

export type Alignment = "start" | "center" | "end";

/**
 * Where a Stack puts its children, on the nine-point grid: `x` left to right,
 * `y` top to bottom. `distribute`: spread evenly along the Stack's direction,
 * first and last at the ends.
 */
export interface Align {
  x: Alignment;
  y: Alignment;
  distribute: boolean;
}

/** What the Design panel edits, by property. A fill of null: no fill. A minimum or maximum of null: none. */
export interface PropertyValues extends TypographyValues {
  fill: Fill | null;
  /** A stroke of null: no stroke. */
  stroke: Stroke | null;
  radius: Radius;
  /** Drop and inner shadows, first on top; none when empty. */
  shadows: Shadow[];
  /** A text layer's drop shadows, first on top, drawn as text-shadow: no inner shadow, no spread. */
  textShadows: Shadow[];
  /** A blur on the layer, and on what is behind it, in px; null for none. */
  layerBlur: Blur;
  backgroundBlur: Blur;
  /** An absolute layer's place in its parent, in px. */
  x: number;
  y: number;
  /**
   * Placed freely in its container, at X and Y from its top left, in px, at
   * its size; null: in its container's layout. Not offered in the panel: a
   * layer in a Frame's flow dragged or nudged in a narrower view is placed
   * freely at that view's breakpoint only, as this (ADR 0008); its X and Y there change it too.
   */
  absolute: { x: number; y: number } | null;
  width: Size;
  height: Size;
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  direction: "horizontal" | "vertical";
  /** Space between a Stack's children, in px. */
  gap: number;
  padding: Padding;
  align: Align;
  wrap: boolean;
  /** How many columns a Grid lays its layers out in: as many equal columns, set. */
  columns: number;
  /** Space between a Grid's rows, in px. */
  rowGap: number;
  /** Space between a Grid's columns, in px. */
  columnGap: number;
  /** From 0 to 1. */
  opacity: number;
  visible: boolean;
  /** Content outside the layer is cut off. */
  clip: boolean;
}

export type Property = keyof PropertyValues;

export interface Definition<V> {
  /** Layers the property applies to. */
  kinds: LayerKind[];
  /** Further, whether the layer as it is now can take the property: `el`, its element as shown. */
  applies?(el: Element, layer: Layer): boolean;
  /** Further still, whether the layer can take this value. */
  accepts?(el: Element, value: V): boolean;
  read(el: Element, colors: ColorReader): V;
  /**
   * CSS declarations that show the value, on the canvas and on the page: the
   * same properties whatever the value, so each edit overrides the one before.
   * `el` is the layer's element, for values that depend on its box or its parent.
   */
  write(value: V, el: Element): Record<string, string>;
  /** Every CSS property `write` may declare: what an undo takes off again. */
  writes: string[];
  /** The CSS properties the value is read from, to find what sets them now. */
  sets: string[];
  /** Of `sets`, those the value is read from on the layer as it is now, when not all of them. */
  setsOn?(el: Element): string[];
  /** A Stack's own property: on a plain top-to-bottom flow, writing it makes the flow a real Stack. */
  stack?: true;
  /** An inherited style: the element whose styles set the value, the layer's own or one above it. */
  setOn?(el: Element): Element;
  /** A text style: the layer's inline fragments that keep a value of their own, as it is now. */
  keeps?(el: Element, colors: ColorReader): Fragment[];
  /** The reference style, from the CSS `write` declares, when not all of it: `before` is where the change started. */
  reference?(style: Record<string, string>, before: V, after: V): Record<string, string>;
}

const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
const SIDES = ["top", "right", "bottom", "left"];
const EVERY_KIND: LayerKind[] = ["stack", "grid", "frame", "text", "image", "still", "locked"];
/** Locked layers are moved and resized as a whole, and nothing else. */
const UNLOCKED: LayerKind[] = EVERY_KIND.filter((kind) => kind !== "locked");
export const CONTAINERS: LayerKind[] = ["stack", "grid", "frame"];
/** Layers drawn as a box, with a stroke, corners, shadows and blur of their own: all but text and locked ones. */
const BOXES: LayerKind[] = [...CONTAINERS, "image", "still"];
/**
 * Whether the property is of text alone: one a Frame's only text has, written
 * on the Frame's element, which its words inherit.
 */
export function isTextProperty(property: Property): boolean {
  const { kinds } = PROPERTIES[property];
  return kinds.length > 0 && kinds.every((kind) => kind === "text");
}
/** A change to text styles or to words: on a Frame drawn around its text, its text's. */
export const ofText = (change: Pick<Change, "kind" | "property">) => (change.kind === "style" ? isTextProperty(change.property as Property) : change.kind === "text");

/** Width and height do not apply to inline boxes. */
const sized = (el: Element) => !/^(inline|contents)$/.test(getComputedStyle(el).display);
/** Placed freely: out of its container's layout. */
export const absolute = (el: Element) => /^(absolute|fixed)$/.test(getComputedStyle(el).position);

const PROPERTIES: { [P in Property]: Definition<PropertyValues[P]> } = {
  fill: {
    kinds: CONTAINERS,
    // An image, or layers of background, cannot be read as a fill. A conic gradient is shown, not edited.
    applies: fillApplies,
    accepts: (_, fill) => fill?.type !== "conic",
    read: readFill,
    write: writeFill,
    writes: ["background-color", "background-image"],
    sets: ["background-color", "background-image"],
    setsOn: fillSets,
  },
  stroke: {
    kinds: BOXES,
    read: readWrittenStroke,
    write: writeStroke,
    reference: strokeReference,
    writes: ["border-width", "border-style", "border-color"],
    sets: STROKE_SETS,
  },
  radius: {
    kinds: BOXES,
    read: readRadius,
    write: (radius) => ({ "border-radius": typeof radius === "number" ? `${radius}px` : radius.map((r) => `${r}px`).join(" ") }),
    writes: ["border-radius"],
    sets: CORNERS.map((corner) => `border-${corner}-radius`),
  },
  shadows: {
    kinds: BOXES,
    read: readShadows,
    write: writeShadows,
    writes: ["box-shadow"],
    sets: ["box-shadow"],
  },
  textShadows: {
    kinds: ["text"],
    accepts: (_, shadows) => textCanDraw(shadows),
    read: readTextShadows,
    write: writeTextShadows,
    writes: ["text-shadow"],
    sets: ["text-shadow"],
  },
  layerBlur: { kinds: BOXES, ...blur("filter") },
  backgroundBlur: { kinds: BOXES, ...blur("backdrop-filter") },
  x: position("left", "right", 0),
  y: position("top", "bottom", 1),
  absolute: {
    kinds: [],
    read: (el) => (absolute(el) ? { x: offsetOf(el, "left", 0), y: offsetOf(el, "top", 1) } : null),
    // Taken out of the layout at its size; back in it, nothing of it is left once the change is gone.
    write: (place, el) => (place ? { ...absoluteAt(place), ...sizeOf(el) } : { position: "static", left: "auto", top: "auto", right: "auto", bottom: "auto" }),
    writes: ["position", "left", "top", "right", "bottom", "width", "height"],
    sets: ["position", "left", "top"],
  },
  width: size("width"),
  height: size("height"),
  minWidth: limit("min-width", "width"),
  maxWidth: limit("max-width", "width"),
  minHeight: limit("min-height", "height"),
  maxHeight: limit("max-height", "height"),
  direction: {
    kinds: ["stack"],
    stack: true,
    read: (el) => stackOf(el).direction,
    write: (direction) => ({ "flex-direction": direction === "horizontal" ? "row" : "column" }),
    writes: ["flex-direction"],
    sets: ["flex-direction"],
  },
  gap: {
    kinds: ["stack"],
    stack: true,
    read(el) {
      const stack = stackOf(el);
      if (!stack.flex) return 0;
      return px(getComputedStyle(el).getPropertyValue(stack.direction === "horizontal" ? "column-gap" : "row-gap"));
    },
    write: (gap) => ({ gap: `${gap}px` }),
    writes: ["gap"],
    sets: ["row-gap", "column-gap"],
  },
  padding: {
    // And a Frame around its text alone, as a button is, its words given an element of their own to edit or not.
    kinds: ["stack", "frame"],
    applies: (_, layer) => layer.kind === "stack" || layer.framesText,
    read: (el) => SIDES.map((side) => px(getComputedStyle(el).getPropertyValue(`padding-${side}`))) as Padding,
    write: (padding) => ({ padding: padding.map((p) => `${p}px`).join(" ") }),
    writes: ["padding"],
    sets: SIDES.map((side) => `padding-${side}`),
  },
  align: {
    kinds: ["stack"],
    stack: true,
    read: readAlign,
    write: writeAlign,
    writes: ["justify-content", "align-items"],
    sets: ["justify-content", "align-items"],
  },
  wrap: {
    kinds: ["stack"],
    stack: true,
    read: (el) => stackOf(el).flex && getComputedStyle(el).flexWrap !== "nowrap",
    write: (wrap) => ({ "flex-wrap": wrap ? "wrap" : "nowrap" }),
    writes: ["flex-wrap"],
    sets: ["flex-wrap"],
  },
  columns: {
    kinds: ["grid"],
    read: (el) => trackCount(getComputedStyle(el).gridTemplateColumns),
    // As Tailwind's `grid-cols-*` writes them: equal columns, which shrink below their content as the Grid does.
    accepts: (_, columns) => Number.isInteger(columns) && columns >= 1,
    write: (columns) => ({ "grid-template-columns": equalColumns(columns) }),
    writes: ["grid-template-columns"],
    sets: ["grid-template-columns"],
  },
  rowGap: gridGap("row-gap"),
  columnGap: gridGap("column-gap"),
  opacity: {
    kinds: UNLOCKED,
    read: (el) => round(parseFloat(getComputedStyle(el).opacity)),
    write: (opacity) => ({ opacity: String(opacity) }),
    writes: ["opacity"],
    sets: ["opacity"],
  },
  visible: {
    kinds: UNLOCKED,
    read: (el) => getComputedStyle(el).display !== "none",
    // Shown again, the layer is back where it started: its own display comes back with its style.
    write: (visible) => ({ display: visible ? "" : "none" }),
    writes: ["display"],
    sets: ["display"],
  },
  clip: {
    kinds: CONTAINERS,
    read(el) {
      const style = getComputedStyle(el);
      return style.overflowX !== "visible" || style.overflowY !== "visible";
    },
    write: (clip) => ({ overflow: clip ? "hidden" : "visible" }),
    writes: ["overflow"],
    sets: ["overflow-x", "overflow-y"],
  },
  ...TYPOGRAPHY,
};

/** `property` of an element as it is now, in design language: on the canvas, or on the live page. */
/** How `property` is read, written and set: what the editor applies an edit to it by. */
export function definitionOf<P extends Property>(property: P): Definition<PropertyValues[P]> {
  return PROPERTIES[property];
}

export function readValue<P extends Property>(el: Element, property: P): PropertyValues[P] {
  return PROPERTIES[property].read(el, colorReader(el.ownerDocument));
}

/** A property of an element as the editor reads it: as if shown, apart from whether it is shown. */
export function readAsShown<P extends Property>(el: Element, property: P, colors: ColorReader): PropertyValues[P] {
  return property === "visible" ? PROPERTIES[property].read(el, colors) : asShown(el, () => PROPERTIES[property].read(el, colors));
}

/** The properties that place a layer by its X and Y: its `left` and `top`, past which its margins draw it (`Change.margins`). */
export const PLACING: readonly Property[] = ["x", "y", "absolute"];

/** The CSS that places a layer absolute at `x` and `y`, in px, from its container's top left. */
export function absoluteAt({ x, y }: { x: number; y: number }): Record<string, string> {
  return { position: "absolute", left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" };
}

/** An element's size as CSS sets it now: what keeps it as large once it is absolute. */
export function sizeOf(el: Element): Record<string, string> {
  const style = getComputedStyle(el);
  return { width: `${round(parseFloat(style.width))}px`, height: `${round(parseFloat(style.height))}px` };
}

/** The CSS properties a property may declare, and the ones it is read from: what taking it off the canvas puts back. */
export function cssOf(property: Property): string[] {
  const { writes, sets, stack }: Definition<PropertyValues[typeof property]> = PROPERTIES[property];
  return [...writes, ...sets, ...(stack ? ["display", "flex-direction"] : [])];
}

/** How a Stack lays its layers out: in which direction, and whether as flex (or as a plain flow). */
interface StackLayout {
  direction: "horizontal" | "vertical";
  flex: boolean;
}

/**
 * The automatic layout an element lays its children out in, as the layer
 * model has it: a flex container, or a plain flow, top to bottom.
 */
export function stackOf(el: Element): StackLayout {
  const style = getComputedStyle(el);
  if (/flex$/.test(style.display)) return { direction: style.flexDirection.startsWith("row") ? "horizontal" : "vertical", flex: true };
  return { direction: "vertical", flex: false };
}

/**
 * Whether a Grid, as `el` lays it out, places its layers otherwise than in
 * the order they are written: one of them in a cell or area of its own
 * (a line of `grid-row`, `grid-column`, `grid-area`, not a span alone) or in another order (`order`), or
 * holes filled out of order (`dense`). Putting a layer at another place among
 * the others does not take it to another cell there, so it offers no cells to
 * reorder by (ticket 18).
 */
export function placesItself(el: Element): boolean {
  if (/dense/.test(getComputedStyle(el).gridAutoFlow)) return true;
  return [...el.children].some((child) => {
    const style = getComputedStyle(child);
    if (/^(absolute|fixed)$/.test(style.position) || style.display === "none") return false;
    // Spanning tracks (`span 2`) it is still placed in order: only a line of its own places it.
    const lines = [style.gridColumnStart, style.gridColumnEnd, style.gridRowStart, style.gridRowEnd];
    return lines.some((line) => line !== "auto" && !/^span\b/.test(line)) || style.order !== "0";
  });
}

/** A Grid's space between its rows or its columns: one of the two, apart from the other. */
function gridGap(name: "row-gap" | "column-gap"): Definition<number> {
  return {
    kinds: ["grid"],
    read: (el) => px(getComputedStyle(el).getPropertyValue(name)),
    accepts: (_, gap) => gap >= 0,
    write: (gap) => ({ [name]: `${gap}px` }),
    writes: [name],
    sets: [name],
  };
}

/** Block-level displays a plain flow lays out top to bottom. */
const FLOW = /^(block|flow-root|list-item)$/;

/** The Stack `el` is laid out in, if it is: in its parent's flex layout, or down its plain flow. Absolute layers are in none. */
function stackAround(el: Element): StackLayout | null {
  const style = getComputedStyle(el);
  if (absolute(el)) return null;
  let parent = el.parentElement;
  while (parent && getComputedStyle(parent).display === "contents") parent = parent.parentElement;
  if (!parent) return null;
  const outer = getComputedStyle(parent);
  if (/flex$/.test(outer.display)) return stackOf(parent);
  if (FLOW.test(outer.display) && !style.display.startsWith("inline") && style.float === "none") return { direction: "vertical", flex: false };
  return null;
}

/** Whether the axis runs along the Stack (its main axis), rather than across it. */
function onMainAxis(stack: { direction: "horizontal" | "vertical" }, axis: "width" | "height"): boolean {
  return (stack.direction === "horizontal") === (axis === "width");
}

/** Sizes that follow the content: Hug, unless the layer is stretched across its Stack. */
const CONTENT_SIZED = /^(auto|fit-content|max-content|min-content|-webkit-fit-content)?$/;

function size(axis: "width" | "height"): Definition<Size> {
  return {
    kinds: EVERY_KIND,
    applies: sized,
    // Fill takes the room a Stack gives: along a flex Stack, or across any. Down a plain flow there is none.
    accepts(el, value) {
      if (value.type !== "fill") return true;
      const stack = stackAround(el);
      return !!stack && (stack.flex || !onMainAxis(stack, axis));
    },
    read(el) {
      const style = getComputedStyle(el);
      const stack = stackAround(el);
      const main = !!stack && onMainAxis(stack, axis);
      if (stack?.flex && main && parseFloat(style.flexGrow) > 0) return { type: "fill" };
      // The computed size is always in px: whether it is set, and how, is in what the page declares.
      const declared = declaredValue(el, axis);
      if (CONTENT_SIZED.test(declared)) {
        const stretched = declared === "auto" && !!stack && !main && (stack.flex ? stretches(el) : axis === "width");
        return { type: stretched ? "fill" : "hug" };
      }
      if (stack && declared === "100%") return { type: "fill" };
      return { type: "fixed", value: round(parseFloat(style.getPropertyValue(axis)) + extra(el, axis)) };
    },
    write(value, el) {
      const stack = stackAround(el);
      const fill = value.type === "fill";
      const css = value.type === "fixed" ? `${round(Math.max(0, value.value - extra(el, axis)))}px` : fill ? "auto" : "fit-content";
      if (stack?.flex && onMainAxis(stack, axis)) {
        return { [axis]: css, "flex-grow": fill ? "1" : "0", "flex-shrink": fill ? "1" : "0", "flex-basis": fill ? "0%" : "auto" };
      }
      if (stack?.flex) return { [axis]: css, "align-self": fill ? "stretch" : "auto" };
      return { [axis]: css };
    },
    writes: [axis, "flex-grow", "flex-shrink", "flex-basis", "align-self"],
    sets: [axis, "flex-grow", "align-self"],
  };
}

/** A minimum or maximum size, as the layer's outer size: none when not set. */
function limit(name: string, axis: "width" | "height"): Definition<number | null> {
  const none = name.startsWith("min") ? "auto" : "none";
  return {
    kinds: UNLOCKED,
    applies: sized,
    read(el) {
      const value = getComputedStyle(el).getPropertyValue(name);
      if (value.endsWith("%")) {
        const parent = el.parentElement;
        return parent ? round((parseFloat(value) / 100) * parseFloat(getComputedStyle(parent).getPropertyValue(axis)) + extra(el, axis)) : null;
      }
      // Of a minimum, 0 is none too.
      if (!value.endsWith("px") || (none === "auto" && parseFloat(value) === 0)) return null;
      return round(parseFloat(value) + extra(el, axis));
    },
    write: (value, el) => ({ [name]: value === null ? none : `${round(Math.max(0, value - extra(el, axis)))}px` }),
    writes: [name],
    sets: [name],
  };
}

/** Padding and border a size in CSS leaves out (with `box-sizing: content-box`), and design sizes count in. */
function extra(el: Element, axis: "width" | "height"): number {
  const style = getComputedStyle(el);
  if (style.boxSizing !== "content-box") return 0;
  const sides = axis === "width" ? ["left", "right"] : ["top", "bottom"];
  return sides.reduce((sum, side) => sum + px(style.getPropertyValue(`padding-${side}`)) + px(style.getPropertyValue(`border-${side}-width`)), 0);
}

/** Whether a flex child's cross size, left to the layout, stretches across its Stack. */
function stretches(el: Element): boolean {
  const self = getComputedStyle(el).alignSelf;
  if (self !== "auto" && self !== "normal") return self === "stretch";
  const items = getComputedStyle(el.parentElement!).alignItems;
  return items === "stretch" || items === "normal";
}

/** The value the page (or an edit) declares for `property` of `el`, as written: `auto` when nothing does. */
function declaredValue(el: Element, property: string): string {
  return declaredByEdit(el, property) || pageValue(el, property) || "auto";
}

/**
 * An absolute layer's place along one axis, as CSS sets it. Where the freezer
 * pinned it, it was shifted with the page's scroll: shifted back, it reads as the page has it.
 */
function offsetOf(el: Element, start: "left" | "top", axis: 0 | 1): number {
  return round(parseFloat(getComputedStyle(el).getPropertyValue(start)) - pinOffsetOf(el)[axis]);
}

/** An absolute layer's place along one axis: where its edge is from its parent's, as CSS sets it. */
function position(start: "left" | "top", end: "right" | "bottom", axis: 0 | 1): Definition<number> {
  return {
    kinds: EVERY_KIND,
    applies: absolute,
    read: (el) => offsetOf(el, start, axis),
    write: (value) => ({ [start]: `${value}px`, [end]: "auto" }),
    writes: [start, end],
    sets: [start],
  };
}

const ALIGNMENTS: Record<string, Alignment> = { center: "center", end: "end", "flex-end": "end", right: "end", "safe center": "center" };
const DISTRIBUTED = /^space-/;

function readAlign(el: Element): Align {
  const stack = stackOf(el);
  if (!stack.flex) return { x: "start", y: "start", distribute: false };
  const style = getComputedStyle(el);
  const main = ALIGNMENTS[style.justifyContent] ?? "start";
  const cross = ALIGNMENTS[style.alignItems] ?? "start";
  const distribute = DISTRIBUTED.test(style.justifyContent);
  return stack.direction === "horizontal" ? { x: main, y: cross, distribute } : { x: cross, y: main, distribute };
}

/**
 * Along the Stack, justify; across it, align. At the start across, children
 * left to stretch keep stretching where the page had them stretch.
 */
function writeAlign(align: Align, el: Element): Record<string, string> {
  const horizontal = stackOf(el).direction === "horizontal";
  const [main, cross] = horizontal ? [align.x, align.y] : [align.y, align.x];
  const css = (a: Alignment) => (a === "center" ? "center" : a === "end" ? "flex-end" : "flex-start");
  const page = pageValue(el, "align-items");
  const start = /^(normal|stretch|auto)?$/.test(page) ? "stretch" : "flex-start";
  return {
    "justify-content": align.distribute ? "space-between" : css(main),
    "align-items": cross === "start" ? start : css(cross),
  };
}

/** The value the page itself declares for `property`, as written, edits aside: empty when nothing does. */
function pageValue(el: Element, property: string): string {
  const [source] = sourcesOf(el, [property]);
  return source.declaration ? source.declaration.slice(source.declaration.indexOf(":") + 1).trim() : "";
}

function px(value: string): number {
  return parseFloat(value) || 0;
}

/** To two places, as design values are shown. */
export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Larger radii (Tailwind v4's rounded-full is infinite) read as this: still a pill, and still a number. */
const MAX_RADIUS = 9999;

/**
 * The radius set on each corner, in px, as Figma shows it: past half the
 * shorter side it draws no rounder, but it reads as set. A percentage is
 * resolved against each side, and an elliptical corner reads as its smaller radius.
 */
function readRadius(el: Element): Radius {
  const style = getComputedStyle(el);
  const { width, height } = el.getBoundingClientRect();
  const resolve = (value: string, side: number) => (value.endsWith("%") ? (parseFloat(value) / 100) * side : parseFloat(value) || 0);
  const corners = CORNERS.map((corner) => {
    const [x, y = x] = style.getPropertyValue(`border-${corner}-radius`).split(" ");
    const px = Math.min(resolve(x, width), resolve(y, height), MAX_RADIUS);
    return Math.round(px * 100) / 100;
  }) as [number, number, number, number];
  return corners.every((r) => r === corners[0]) ? corners[0] : corners;
}

/** Values in design language, and places, are plain data: the same when they are written the same. */
export function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
