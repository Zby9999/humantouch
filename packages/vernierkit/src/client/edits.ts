/**
 * Edit commands: changes in design language, made to the canvas at once and
 * recorded in the ChangeSet. An edit to a layer is an edit to its usage, so
 * it shows up in every instance of that usage, and in every view of the
 * canvas. Every edit can be undone.
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import type { OffCanvasOrigin, SavedOffCanvasLayer } from "../service-protocol";
import { breakpointOf, clearOf, contains, widestFirst, writtenWith, type Breakpoint, type ProjectBreakpoints } from "./breakpoints";
import {
  AS_STACK_ATTR,
  asShown,
  BRIEF_ATTR,
  changesOn,
  declare,
  declaredByEdit,
  DELETED_ATTR,
  elementsOf,
  keepOriginal,
  LAYER_ID_ATTR,
  MADE_ATTR,
  MOVE_ATTR,
  NEW_ATTR,
  REFERENCE_ATTR,
  restoreStyle,
  TEXT_ATTR,
  WRAP_ATTR,
} from "./canvas-style";
import {
  BRIEF,
  changeKey,
  createChangeSet,
  madeBy,
  MOVE,
  movedOffBy,
  withDependents,
  type Change,
  type ChangeSet,
  type Composed,
  type Created,
  type Dissolved,
  type Bindings,
  type Fragment,
  type Picked,
  type Place,
  type PutBack,
  type StackSettings,
  type Target,
} from "./changeset";
import { PAGE_ATTR } from "./freezer";
import { blur, readShadows, readTextShadows, textCanDraw, writeShadows, writeTextShadows, type Blur, type Shadow } from "./effects";
import { colorReader, fillApplies, fillSets, readFill, STROKE_SETS, writeFill, writeStroke, type ColorReader, type Fill, type Stroke } from "./paint";
import { readWrittenStroke, strokeReference } from "./stroke-weight";
import { TYPOGRAPHY, type TypographyValues } from "./typography";
import { pickedIn } from "./variables";
import { equalColumns, trackCount } from "./grid-tracks";
import { copiedBreakpointsOf, hide, insertCopies, insertNew, insertPutBack, removeMade, unhide, wordsOf, writeText } from "./layer-changes";
import { boxOf, buildLayerTree, holdsLayers, isWholeText, nodeOf, SIGN_WORDS, textOfBox, wordsAsPage, type Layer, type LayerKind, type LayerTree } from "./layers";
import { relocate, slotsOf, syncOrders } from "./moves";
import { componentBrief, componentElements, componentKey, inComponent, promotable, promoteIn, showComponent } from "./promote";
import { borderBox, compose, decompose, dissolve, inferStack, marginsOf, paddingBox, spotIn, stackStyle, undissolve } from "./stacks";
import { PIN_OFFSET_ATTR, pinOffsetOf, sourcesOf } from "./style-source";
import { CHAIN_ATTR } from "./usage-chain";
import type { View, Views } from "./views";

export { LAYER_ID_ATTR };
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

/** Where a layer is moved to: a place among a Stack's layers, or absolute, at `left` and `top` in px, in a Frame. */
export type Destination = { parent: Layer; index: number } | { parent: Layer; x: number; y: number };

export interface SetOptions {
  /** One more step of an adjustment under way (a drag on a number, a color being picked): undone with the steps before it. */
  continues?: boolean;
  /** The Variables the designer chose for the value, by part (see `Bindings`); null for a part: detached from its Variable. */
  variables?: Picked;
}

/**
 * Which Variables a property's value is, by part, given those the designer
 * picked now and those the change had before; undefined when no part can be one.
 */
export type Binder = (property: Property, value: unknown, picked: Picked | undefined, previous: Bindings | undefined) => Bindings | undefined;

export interface Editor {
  /**
   * Works in `view` from now on, the one the designer works in: values are read
   * as it shows them, and style and layout edits apply at its breakpoint only
   * (ADR 0008); in the desktop view (or null), at every width. Changes to the
   * structure apply in every view, wherever they are made.
   */
  at(view: View | null): void;
  /** The breakpoint of the view worked in; null in the desktop view: every width. */
  breakpoint(): Breakpoint | null;
  /** The breakpoint of a view `width` px wide, as the views are now; null: the desktop view's, every width. */
  breakpointAt(width: number): Breakpoint | null;
  /**
   * Whether `property` of the layer is changed on its own at a breakpoint
   * that holds in the view worked in: its own, or any other range of widths
   * its width is in, as one recorded before the views changed; never in the desktop view.
   */
  changedHere(layer: Layer, property: Property): boolean;
  /** The properties of the layer changed on their own at a breakpoint that holds in the view worked in, in the order they were first changed. */
  changesHere(layer: Layer): Property[];
  /**
   * Takes the value of `property` the layer has of its own at the
   * breakpoints that hold in the view worked in off it, as an edit that can
   * be undone: it inherits the value at every width there again.
   */
  inherit(layer: Layer, property: Property): void;
  /** Whether `property` can be edited on the layer; with `value`, whether the layer can take that value. */
  can<P extends Property>(layer: Layer, property: P, value?: PropertyValues[P]): boolean;
  /** The layer's current value, as the view worked in shows it. */
  read<P extends Property>(layer: Layer, property: P): PropertyValues[P];
  /** Changes the layer, across the instances of its usage, at the breakpoint worked in, and records the change. It can be undone. */
  set<P extends Property>(layer: Layer, property: P, value: PropertyValues[P], options?: SetOptions): void;
  /** Makes the edits `edits` makes one step, undone and redone together: the same change to several layers. */
  batch(edits: () => void, options?: SetOptions): void;
  /** Which Variables the layer's value of `property` is, as changed this round and shown in the view worked in; undefined when unchanged or none. */
  variables(layer: Layer, property: Property): Bindings | undefined;
  /** Where the layer is in the view worked in, in its px; for a hidden layer, where it is when shown. */
  measure(layer: Layer): DOMRect;
  /** Takes back the latest edit not yet undone. Returns the layers it was made to; none when there is nothing to undo. */
  undo(): Layer[];
  /** Makes again the latest edit undone. Returns the layers it was made to; none when there is nothing to redo. */
  redo(): Layer[];
  /** Takes change `id` back out of the ChangeSet, its layer back to where it started, as an edit that can be undone. */
  revert(id: number): Layer | null;
  /** The canvas's layers as they are now: a move builds them anew. */
  tree(): LayerTree;
  /** Whether the layer can be moved at all. The page cannot. */
  canMove(layer: Layer): boolean;
  /**
   * Whether the layer can go into `container`: a Stack, a Grid or a Frame, outside
   * the layer itself, that repeats with the layer's own container (each
   * instance of the layer has a container to go to).
   */
  canDrop(layer: Layer, container: Layer): boolean;
  /**
   * Moves the layer, across the instances of its container, and records the
   * move: one per layer, from where it was to where it is. Loose text first
   * gets an element of its own. Placed freely in its own container beside the
   * desktop view, it is placed so at that view's breakpoint only (ADR 0008);
   * moved into another container, it loses such placements. Returns the layer where it is now.
   */
  move(layer: Layer, to: Destination): Layer;
  /**
   * Nudges the layers `dx` and `dy` px, as the arrow keys do. A layer placed
   * freely in the view worked in moves that far, as dragging it there would
   * place it (at its breakpoint, beside the desktop view); a layer in a
   * Frame's flow is placed freely where it is, and moved on from there (beside
   * the desktop view, at its breakpoint only: the `absolute` property). A
   * layer in a Stack's layout swaps places with the next one along the Stack
   * that way, in every view, and stays at its end or nudged across it; layers
   * side by side move together. One in a Grid goes a cell along it (← →),
   * or a row (↑ ↓: as many cells as the Grid has columns in the view worked
   * in), the layers between moving a cell along, as dragging it there does,
   * in every view; it stays at the Grid's ends, and in a Grid that places its
   * layers itself (`placesItself`). `continues`: one more nudge of a run, undone
   * with the nudges before it. Returns the layers where they are now.
   */
  nudge(layers: Layer[], dx: number, dy: number, options?: SetOptions): Layer[];
  /**
   * Whether the layers can be made a Stack: layers side by side in one
   * container, each in every instance of it; or a Frame alone, of its layers.
   */
  canStack(layers: Layer[]): boolean;
  /**
   * Makes the layers a Stack that holds them where they are (⇧A): a new one
   * around them, or the Frame selected alone. Returns the Stack.
   */
  stack(layers: Layer[]): Layer;
  /** Whether the layer is a Stack that can be dissolved: its layers are elements, each in every instance of it. */
  canUnstack(layer: Layer): boolean;
  /** Dissolves the Stack: it becomes a Frame of its size, its layers absolute where they are. Returns the Frame. */
  unstack(layer: Layer): Layer;
  /**
   * Whether the layer can be ungrouped: a Stack or a Frame, not the page nor
   * a component's own, whose layers are elements that can all go into its container.
   */
  canUngroup(layer: Layer): boolean;
  /**
   * Takes the Stack or Frame away, its layers left where they are (⌘⇧G): in
   * its container's layout, in its place and in order, or absolute where they
   * are. A Stack made this round is taken back instead. Returns its layers.
   */
  ungroup(layer: Layer): Layer[];
  /** Whether new layers can go in the layer: a Stack, a Grid or a Frame that holds layers. */
  canHold(layer: Layer): boolean;
  /**
   * Makes new text (in the page's body text style) or a new Frame (with no
   * fill) at `to`, in each instance of its container. `size`: as drawn, in px;
   * without it, text fits its words and a Frame is 100 × 100. Returns the new layer, in the container `to` names.
   */
  create(type: Created["type"], to: Destination, size?: { width: number; height: number }): Layer;
  /**
   * The layer's brief: what the designer wants achieved in it, which the
   * Design panel cannot set; for a new Frame, what the Agent is to make in it. "" when it has none.
   */
  brief(layer: Layer): string;
  /** Whether the layer is a new Frame, whose brief says what to make in it: it is written beside it on the canvas, and kept in the change that makes it. */
  isNewFrame(layer: Layer): boolean;
  /**
   * Gives the layer a brief, or takes it off (""), as one edit that can be
   * undone: a new Frame's in the change that makes it; any other layer's as
   * a change of its own, for its usage (every instance), at every width.
   * Loose text gets an element of its own first. Returns the layer the brief is on.
   */
  setBrief(layer: Layer, brief: string): Layer;
  /** The layer as text with an element of its own, to type in: loose text gets one first. */
  ownElement(layer: Layer): Layer;
  /**
   * Changes the words of a text layer, in every instance; one of the
   * instances a loop renders with words of its own changes alone, as data.
   */
  setText(layer: Layer, text: string): void;
  /** Whether the layer can be deleted. The page cannot. */
  canRemove(layer: Layer): boolean;
  /**
   * Deletes the layer, in every instance; one of the instances a loop renders
   * goes alone, as data. A layer made this round is taken back instead.
   * `offCanvas`: it is moved off the canvas (ADR 0009), and is there now as
   * the layer with this id; the deletion says so.
   */
  remove(layer: Layer, options?: { offCanvas?: string }): void;
  /**
   * How the Agent finds the layer in the source, where it is, and the JSX that
   * writes it (an instance's: its usage; none for a layer made this round):
   * the origin a layer moved off the canvas keeps, all but when it was moved
   * out. A layer put back from off the canvas new is where it came from still, its source as written then with it.
   */
  originOf(layer: Layer): Omit<OffCanvasOrigin, "at">;
  /**
   * Makes `make`, a change to something besides the canvas (a layer off it),
   * one step with the edits, undone by `unmake`: taken back and made again
   * in their order. `layers`: what undoing or redoing it leaves to select.
   */
  along(make: () => void, unmake: () => void, layers?: () => Layer[]): void;
  /** Whether the layer can be copied: not the page, not text with no element of its own. */
  canDuplicate(layer: Layer): boolean;
  /**
   * Copies the layer, in every instance: right after it, or at `to` (as a move
   * goes, among the other layers). One of the instances a loop renders is
   * copied alone, as data. Returns the copy.
   */
  duplicate(layer: Layer, to?: Destination): Layer;
  /**
   * Puts a layer off the canvas back onto it, at `to` (ADR 0009), as a move
   * goes, in every view; returns it there. Moved off this round and not
   * edited off the canvas since, it is the layer that was deleted, back: put
   * back where it was, neither change is left; elsewhere, it moves there.
   * Otherwise it is new on the canvas, looking as it does off it, and the
   * change puts it in with where it came from, its source as written then,
   * its look and its edits there, for the Agent to put it back by.
   */
  putBack(from: LayerToPutBack, to: Destination): Layer;
  /**
   * Whether the layer has changes for its usage alone that can be promoted
   * to its component: it is in a component used inside another, and has
   * changes to its styles or its brief not promoted yet.
   */
  canPromote(layer: Layer): boolean;
  /**
   * Promotes the layer's changes to its styles (at every width and at each
   * breakpoint) and its brief to the component that writes it, the nearest
   * on its usage chain, as one edit that can be undone: they become changes
   * to the component itself, which every usage of it shows, in every view.
   * Its other changes stay with its usage; edited again, it starts from its usage again.
   * Returns the changes promoted, as they were, and those that stay with its usage.
   */
  promote(layer: Layer): { promoted: Change[]; stays: Change[] };
}

/** An Off-canvas Layer being put back onto the canvas: its element off the canvas, as it looks now, and it as kept. */
export interface LayerToPutBack {
  el: Element;
  kept: SavedOffCanvasLayer;
}

/**
 * The edits made, in order, to undo and redo, shared by editors that work
 * side by side (the canvas's, and those of the layers off it): undo goes
 * back through all of them, in the order they were made.
 */
export interface History {
  readonly past: Entry[];
  readonly future: Entry[];
}

/** A step in a history, with the editor's own ways to find its layers and show it. */
interface Entry {
  step: Step;
  found(ids: string[]): Layer[];
  show(): void;
}

export function createHistory(): History {
  return { past: [], future: [] };
}

export interface EditorOptions {
  /** The history its edits go into: one of its own when none is given. */
  history?: History;
  /** Whether a change records what set the value before, in the page's styles: not where there are none (off the canvas). */
  sources?: boolean;
  /** Which Variables a change's value is: none are told when not given. */
  bind?: Binder;
}

/**
 * One edit, as undo and redo replay it: the layers it was made to, by id, so
 * they are found again however the layer tree changes meanwhile.
 */
interface Step {
  layers: string[];
  /** The layers undoing it leaves, when not the same: those a Stack was made of, say. */
  back?: string[];
  /** Steps of one adjustment are one step: the same edit to the same layers, as this tells. */
  key: string;
  /** One of a run of steps that may each change something else (nudges): one step with those before it, undone back through each. */
  run?: boolean;
  /** Of `layers`, those whose text it was made to: the text a box draws and nothing else, which has the box's id. */
  texts?: string[];
  undo(): void;
  redo(): void;
}


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
const CONTAINERS: LayerKind[] = ["stack", "grid", "frame"];
/** Layers drawn as a box, with a stroke, corners, shadows and blur of their own: all but text and locked ones. */
const BOXES: LayerKind[] = [...CONTAINERS, "image", "still"];
/**
 * Properties of text alone, not of a box: those the text a box draws and
 * nothing else has, written on the box's element, which its words inherit.
 */
const textOnly = (kinds: LayerKind[]) => !kinds.some((kind) => CONTAINERS.includes(kind));
/** Width and height do not apply to inline boxes. */
const sized = (el: Element) => !/^(inline|contents)$/.test(getComputedStyle(el).display);
const absolute = (el: Element) => /^(absolute|fixed)$/.test(getComputedStyle(el).position);

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
    // And a Frame that is a box around its text and nothing else, as a button is, its words given an element of their own or not.
    kinds: ["stack", "frame"],
    applies: (_, layer) => layer.kind === "stack" || (layer.children.length === 1 && layer.children[0].kind === "text"),
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
export function readValue<P extends Property>(el: Element, property: P): PropertyValues[P] {
  return PROPERTIES[property].read(el, colorReader(el.ownerDocument));
}

/**
 * Edits the canvas `views` show, every view alike, recording each change in
 * `changes`. `project`: the project's own breakpoints, which the views' ranges
 * line up with; none, they follow the views' widths.
 */
export function createEditor(
  views: Views,
  changes: ChangeSet,
  project: ProjectBreakpoints | null = null,
  { history = createHistory(), sources: readSources = true, bind }: EditorOptions = {},
): Editor {
  /** What sets `properties` of `el` in the page's styles, where the editor reads them. */
  const sourcesFor = (el: Element, properties: string[]) => (readSources ? sourcesOf(el, properties) : []);
  const doc = views.canvas.document;
  let tree = buildLayerTree(doc);
  const colors = colorReader(doc);
  let lastId = 0;
  for (const el of doc.querySelectorAll(`[${LAYER_ID_ATTR}]`)) lastId = Math.max(lastId, Number(el.getAttribute(LAYER_ID_ATTR)) || 0);
  let lastMove = 0;
  for (const el of doc.querySelectorAll(`[${MOVE_ATTR}]`)) lastMove = Math.max(lastMove, Number(el.getAttribute(MOVE_ATTR)!.split(" ")[1]) || 0);
  /** Changes made to one of a loop's instances alone are numbered: `delete-2`, `text-3`. */
  let lastAlone = 0;
  for (const el of doc.querySelectorAll(`[${DELETED_ATTR}], [${TEXT_ATTR}]`)) {
    for (const attr of [DELETED_ATTR, TEXT_ATTR]) lastAlone = Math.max(lastAlone, Number(/-(\d+)$/.exec(el.getAttribute(attr) ?? "")?.[1]) || 0);
  }

  const idOf = (layer: Layer, instances: Layer[]) => {
    let id = layer.el.getAttribute(LAYER_ID_ATTR);
    if (!id) {
      id = String(++lastId);
      for (const instance of instances) instance.el.setAttribute(LAYER_ID_ATTR, id);
    }
    return id;
  };

  const layerById = (id: string) => find(tree.root, (layer) => !layer.text && layer.el.getAttribute(LAYER_ID_ATTR) === id);
  /** The layer with id `id` that `property` is of: for the text a box draws and nothing else, which has the box's id, the text's own properties are the text's. */
  const layerFor = (id: string, property: Property) => {
    const layer = layerById(id);
    const text = layer && textOfBox(layer);
    return text && textOnly(PROPERTIES[property].kinds) ? text : layer;
  };
  /** The id of the element the layer's styles are written on, once it has one: none for text with no element of its own, but the text a box draws, whose are the box's. */
  const styledId = (layer: Layer) => (layer.text && !isWholeText(layer) ? null : layer.el.getAttribute(LAYER_ID_ATTR));
  /** Of the properties written on the layer's element, whether `property` is the layer's: a box's text has the text's own, the box the rest. */
  const ownProperty = (layer: Layer, property: Property) => {
    const text = textOnly(PROPERTIES[property].kinds);
    return isWholeText(layer) ? text : textOfBox(layer) ? !text : true;
  };
  /** Of the changes recorded on the layer's element, whether `change` is the layer's: a box's text has the changes to its styles and words, the box the rest. */
  const ofLayer = (layer: Layer, change: Change) => {
    if (change.kind === "style") return ownProperty(layer, change.property as Property);
    const words = change.kind === "text";
    return isWholeText(layer) ? words : textOfBox(layer) ? !words : true;
  };

  /** The view worked in; null: the desktop view. */
  let current: View | null = null;
  /** The views beside the desktop view. */
  const others = () => views.list().slice(1);
  /** The view worked in when it is not the desktop view: null in the desktop view. */
  const beside = () => (current && others().includes(current) ? current : null);
  /** The breakpoint of a view `width` px wide, beside the views there are now. */
  const breakpointAt = (width: number) =>
    breakpointOf(
      width,
      views.canvas.width,
      others().map((v) => v.width),
      project,
    );
  /** The breakpoint of a view; null for the desktop view. */
  const breakpointIn = (view: View | null): Breakpoint | null => (view && others().includes(view) ? breakpointAt(view.width) : null);
  // Changes at breakpoints recorded with no word of the project's (before its breakpoints were read) are written as it writes them, where they can be.
  for (const change of changes.list()) if (change.breakpoint && !change.breakpoint.project) Object.assign(change.breakpoint, writtenWith(change.breakpoint, project));
  /** A view that shows `breakpoint` now, if one does: the view worked in first. */
  const viewAt = (breakpoint: Breakpoint | null): View | null => {
    if (!breakpoint) return null;
    const view = beside();
    if (view && contains(breakpoint, view.width)) return view;
    return others().find((v) => contains(breakpoint, v.width)) ?? null;
  };
  /** The style changes of the layer with id `id` at a breakpoint, to `property` or to any. */
  const changesAtBreakpoints = (id: string, property?: string) =>
    changes.list().filter((change) => change.kind === "style" && change.layer === id && change.breakpoint && (!property || change.property === property));
  /** Of those, the ones at a breakpoint that holds at `width`: the narrowest, which wins, first. */
  const changesAt = (id: string, width: number, property?: string) =>
    changesAtBreakpoints(id, property)
      .filter((change) => contains(change.breakpoint, width))
      .sort((a, b) => widestFirst(b.breakpoint!, a.breakpoint!));
  /**
   * Where an edit to `property` of the layer made in the view worked in goes.
   * In the desktop view, every width. In another, the breakpoint the layer
   * has the property changed at already, of its own, that holds there,
   * whether the view's own or one recorded before the views changed; else the
   * view's (every width for a view in the desktop view's range), as far as no
   * other range the property has of its own reaches into it, so no two of them overlap.
   */
  const breakpointFor = (layer: Layer, property: Property): Breakpoint | null => {
    const view = beside();
    const id = layer.el.getAttribute(LAYER_ID_ATTR);
    const breakpoint = breakpointIn(view);
    if (!view || !id) return breakpoint;
    const [own] = changesAt(id, view.width, property);
    if (own) return own.breakpoint!;
    if (!breakpoint) return null;
    const taken = changesAtBreakpoints(id, property).map((change) => change.breakpoint!);
    const clear = clearOf(breakpoint, view.width, taken);
    return clear === breakpoint ? breakpoint : { ...clear, ...writtenWith(clear, project) };
  };
  /** The element that shows a canvas element in `view`, as it is now; the canvas's own for the desktop view, or a view that shows none of it. */
  const shownIn = (view: View | null, el: Element): Element => {
    if (!view || view === views.list()[0]) return el;
    views.sync();
    return view.elementOf(el) ?? el;
  };

  /** The edit itself, at every width or at `breakpoint`: on the canvas and in the ChangeSet. `picked`: Variables the designer chose for the value. */
  const apply = <P extends Property>(layer: Layer, property: P, value: PropertyValues[P], breakpoint: Breakpoint | null, picked?: Picked) => {
    const definition: Definition<PropertyValues[P]> = PROPERTIES[property];
    // Read, and written, as laid out at the breakpoint, in the view that stands for it.
    const el = shownIn(viewAt(breakpoint), layer.el);
    const before = readAsShown(el, property, colors);
    // A change keeps the source it started from: the cascade is walked once, not on each step of a drag.
    const known = layer.el.getAttribute(LAYER_ID_ATTR);
    const earlier = known ? changes.find(known, property, breakpoint) : null;
    const started = definition.reference ? earlier : null;
    // A layer made this round has no style of the page's to change.
    const sources = layer.made || earlier ? [] : sourcesFor(definition.setOn?.(el) ?? el, definition.setsOn?.(el) ?? definition.sets);
    const instances = tree.acrossInstances(layer);
    // A plain flow shown as a vertical Stack takes a Stack's property as a real Stack, laid out as it is now.
    const flowing = () => !asShown(el, () => stackOf(el).flex);
    // At a breakpoint, it is made a real Stack there too: an edit at every width that made it one may be taken back.
    const asStack = definition.stack && ((!!breakpoint && !!earlier?.asStack) || layer.el.hasAttribute(AS_STACK_ATTR) || flowing());
    const declarations = asShown(el, () => ({
      ...(asStack && { display: "flex", "flex-direction": stackOf(el).direction === "horizontal" ? "row" : "column" }),
      ...definition.write(value, el),
      // Placed freely at a breakpoint and placed anew there: as large as it was when first taken out of the layout.
      ...(property === "absolute" && value && earlier?.style.width && { width: earlier.style.width, height: earlier.style.height }),
    }));
    // Placed freely at a breakpoint, in a container not positioned there: the container becomes its positioning reference there.
    const within =
      property === "absolute" && breakpoint && layer.parent
        ? earlier
          ? earlier.within
          : getComputedStyle(shownIn(viewAt(breakpoint), layer.parent.el)).position === "static"
            ? idOf(layer.parent, tree.acrossInstances(layer.parent))
            : undefined
        : undefined;
    for (const instance of instances) {
      if (asStack && !breakpoint) instance.el.setAttribute(AS_STACK_ATTR, "");
      declare(instance.el, declarations, breakpoint);
    }
    const id = idOf(layer, instances);
    const keeps = definition.keeps?.(el, colors);
    const variables = bind?.(property, value, picked, earlier?.variables);
    changes.record(id, {
      target: targetOf(layer, instances.length),
      scope: "usage",
      ...(breakpoint && { breakpoint }),
      property,
      before,
      after: value,
      style: definition.reference?.(declarations, started ? (started.before as PropertyValues[P]) : before, value) ?? declarations,
      sources,
      ...(asStack && { asStack: true }),
      ...(keeps?.length ? { keeps } : {}),
      ...(variables && { variables }),
      ...(within && { within }),
      // Loose text given an element of its own to be placed freely: the code wraps it too, unless a move of it says so already.
      ...(property === "absolute" && layer.el.hasAttribute(WRAP_ATTR) && !changes.list().some((change) => change.layer === id && change.wrap) && { wrap: true }),
    });
    // Back where it started: the page's own style again, the layer's other changes kept on.
    if (!changes.has(id, property, breakpoint)) {
      const others = changesOn(id, changes.list());
      for (const instance of instances) restoreStyle(instance.el, cssOf(property), others, breakpoint);
    }
    referenceAt(within, breakpoint);
    // A Stack now laid out the other way: the layers are built anew, so a drag into it reads the way it runs now.
    if (layer.kind === "stack" && stackOf(layer.el).direction !== layer.direction) tree = buildLayerTree(doc);
    return id;
  };

  /**
   * The container `within` a layer is placed freely in at `breakpoint` (ADR
   * 0008): its positioning reference there, while a change places a layer so;
   * else as it was. Nothing changes at any other width.
   */
  const referenceAt = (within: string | undefined, breakpoint: Breakpoint | null) => {
    if (!within || !breakpoint) return;
    const others = changesOn(within, changes.list());
    const held = others.some((change) => change.within === within && same(change.breakpoint, breakpoint));
    for (const el of elementsOf(doc, within)) {
      if (held) {
        keepOriginal(el);
        declare(el, { position: "relative" }, breakpoint);
      } else restoreStyle(el, ["position"], others, breakpoint);
    }
  };

  /** Steps of the batch under way, if any. */
  let batching: Step[] | null = null;
  /**
   * Makes the edits `edits` makes one step. `run`: one of a run of such steps
   * (nudges) that may each change something else of the same layers, made one step with those before it.
   */
  const group = (edits: () => void, continues: boolean, run = false) => {
    if (batching) return edits();
    const steps: Step[] = [];
    batching = steps;
    try {
      edits();
    } finally {
      batching = null;
    }
    if (!steps.length) return;
    push(
      {
        layers: steps.flatMap((step) => step.layers),
        back: steps.flatMap((step) => step.back ?? step.layers),
        texts: steps.flatMap((step) => step.texts ?? []),
        key: run ? `run ${[...new Set(steps.flatMap((step) => step.layers))].sort().join(" ")}` : steps.map((step) => step.key).join(", "),
        ...(run && { run: true }),
        undo: () => [...steps].reverse().forEach((step) => step.undo()),
        redo: () => steps.forEach((step) => step.redo()),
      },
      continues,
    );
  };
  /** What the canvas has now, shown in every view at once: once an edit is made, not at each step of a batch. */
  const show = () => {
    if (!batching) views.sync();
  };
  /** `found`: what undoing or redoing it leaves, as the layers are then; by default, those of the step's layer ids. */
  const push = (step: Step, continues: boolean, found: (ids: string[]) => Layer[] = layersOf) => {
    if (batching) {
      batching.push(step);
      return;
    }
    history.future.length = 0;
    const last = history.past.at(-1);
    // One adjustment is one step: the same edit to the same layers, in this editor.
    if (continues && last?.show === show && last.step.key === step.key) {
      if (step.run) {
        const { undo, redo } = last.step;
        last.step.undo = () => {
          step.undo();
          undo();
        };
        last.step.redo = () => {
          redo();
          step.redo();
        };
        // Undone, the run leaves the layers as they were before it; redone, as they are after its last step.
        last.step.back ??= last.step.layers;
        last.step.layers = step.layers;
      } else last.step.redo = step.redo;
    } else history.past.push({ step, found, show });
    show();
  };
  /** The layers a step was made to, as they are now. */
  const layersOf = (ids: string[]) => [...new Set(ids)].map(layerById).filter((layer) => layer !== null);
  /** A step to `property` of the layer `id` is made to its text, if the layer is a box of text. */
  const textsOf = (id: string, property: Property) => (textOnly(PROPERTIES[property].kinds) ? { texts: [id] } : {});
  /** Those of `layers` whose text the step was made to, as that text. */
  const textsIn = (step: Step, layers: Layer[]) => layers.map((layer) => (step.texts?.includes(layer.el.getAttribute(LAYER_ID_ATTR)!) && textOfBox(layer)) || layer);

  /**
   * An edit that can be undone, at every width or at `breakpoint`. `from`: the
   * value it changes, when the canvas cannot tell (on a hidden layer, say).
   * `picked`: Variables chosen for the value, which make it an edit even when
   * the value stays as it is (detached).
   */
  const edit = <P extends Property>(
    layer: Layer,
    property: P,
    value: PropertyValues[P],
    continues: boolean,
    breakpoint: Breakpoint | null,
    from?: PropertyValues[P],
    picked?: Picked,
  ) => {
    const before = from === undefined ? readAsShown(shownIn(viewAt(breakpoint), layer.el), property, colors) : from;
    if (same(before, value) && !picked) return;
    const known = layer.el.getAttribute(LAYER_ID_ATTR);
    const wasPicked = pickedIn((known ? changes.find(known, property, breakpoint) : null)?.variables);
    const id = apply(layer, property, value, breakpoint, picked);
    // A Variable picked for the value the layer has already, with nothing to change: no step.
    if (same(before, value) && !wasPicked && !changes.has(id, property, breakpoint)) return;
    const to = (v: PropertyValues[P], chosen: Picked | undefined) => () => {
      const target = layerFor(id, property);
      if (target) apply(target, property, v, breakpoint, chosen);
    };
    push({ layers: [id], key: changeKey(id, property, breakpoint), undo: to(before, wasPicked), redo: to(value, picked), ...textsOf(id, property) }, continues);
  };

  /** A container as a place names it: a Grid's places are its cells. */
  const containerOf = (container: Layer): Place["container"] => {
    const instances = tree.acrossInstances(container);
    // A Grid that places its layers itself has no cell to name by their order.
    const cells = container.kind === "grid" && !placesItself(shownIn(current, container.el));
    return { layer: idOf(container, instances), target: targetOf(container, instances.length), ...(cells && { grid: true as const }) };
  };

  /**
   * The layer's place now. Its `slot` is where it would go back to with the
   * layer itself taken out first, as a move takes it out before putting it in.
   */
  const placeOf = (layer: Layer): Place => {
    const parent = layer.parent!;
    const container = containerOf(parent);
    const absolute = layer.absolute ? { x: PROPERTIES.x.read(layer.el, colors), y: PROPERTIES.y.read(layer.el, colors) } : null;
    return { container, nth: parent.children.indexOf(layer) + 1, slot: slotsOf(parent.el).indexOf(layer.el), absolute };
  };

  /** The place of a layer new on the canvas at `to`. */
  const placeNew = (to: Destination): Place => {
    const container = to.parent;
    const where = containerOf(container);
    const slots = slotsOf(container.el);
    if ("x" in to) return { container: where, nth: container.children.length + 1, slot: slots.length, absolute: { x: round(to.x), y: round(to.y) } };
    const next = container.children[to.index];
    return { container: where, nth: to.index + 1, slot: next ? slots.indexOf(nodeOf(next)) : slots.length, absolute: null };
  };

  /**
   * What a layer new on the canvas at `to` goes into, as its change records
   * it: the container, which must be able to hold it, with its id and how the
   * Agent finds it, and the place the layer takes there.
   */
  const newAt = (to: Destination) => {
    const container = to.parent;
    if (!editor.canHold(container)) throw new Error(`Vernier Kit: nothing can go into ${container.name}`);
    const count = tree.acrossInstances(container).length;
    const containerId = idOf(container, tree.acrossInstances(container));
    const place = placeNew(to);
    return { container, containerId, place, target: targetOf(container, count) };
  };

  /** The layer's place at `to`, worked out before it moves. */
  const placeAt = (layer: Layer, to: Destination): Place => {
    const parent = to.parent;
    const container = containerOf(parent);
    const others = parent.children.filter((child) => child !== layer);
    const nodes = slotsOf(parent.el).filter((node) => node !== layer.el);
    if ("x" in to) return { container, nth: others.length + 1, slot: nodes.length, absolute: { x: round(to.x), y: round(to.y) } };
    const next = others[to.index];
    const slot = next ? nodes.indexOf(nodeOf(next)) : nodes.length;
    return { container, nth: to.index + 1, slot, absolute: null };
  };

  /**
   * Where a layer is in its container, in the view worked in, as a drop
   * there places it freely: placed freely already, where its CSS has it;
   * otherwise from inside the container's border, its margins aside.
   */
  const freePlaceOf = (layer: Layer): { x: number; y: number } => {
    const container = shownIn(current, layer.parent!.el);
    if (layer.text) {
      const box = editor.measure(layer);
      const inside = paddingBox(container);
      return { x: round(box.left - inside.left), y: round(box.top - inside.top) };
    }
    const el = shownIn(current, layer.el);
    if (!absolute(el)) return spotIn(el, container);
    const style = getComputedStyle(el);
    return { x: parseFloat(style.left) || 0, y: parseFloat(style.top) || 0 };
  };

  /**
   * Gives loose text an element of its own, in each instance: a `<span>`,
   * carrying its container's markers, as the text is written there. Returns the layer it now is.
   */
  const wrap = (layer: Layer): Layer => {
    const runs = tree.acrossInstances(layer);
    const run = layer.parent!.children.filter((child) => child.text).indexOf(layer);
    const spans = runs.map((text) => {
      const span = doc.createElement("span");
      for (const attr of [LOC_ATTR, USAGE_ATTR, CHAIN_ATTR, MADE_ATTR]) {
        const value = text.el.getAttribute(attr);
        if (value !== null) span.setAttribute(attr, value);
      }
      span.setAttribute(WRAP_ATTR, String(run));
      // The text of a box runs on in its inline fragments: they go in with it.
      const nodes = [...new Set(text.text!.map((node) => childIn(text.el, node)))];
      nodes[0].before(span);
      span.append(...nodes);
      return span;
    });
    const id = String(++lastId);
    for (const span of spans) span.setAttribute(LAYER_ID_ATTR, id);
    show();
    tree = buildLayerTree(doc);
    return tree.layerOf(spans[runs.indexOf(layer)])!;
  };

  /** A move that can be undone. `start`: where the layer was before any move, where its own style is enough. */
  const moveStep = (id: string, from: Place, to: Place, start: Place, size: Record<string, string>, record: MoveRecord) => {
    const styleAt = (place: Place): Record<string, string> => {
      if (same(place, start)) return {};
      if (place.absolute) return { ...absoluteAt(place.absolute), ...size };
      // An absolute layer put into a layout leaves its own position.
      return start.absolute ? { position: "static" } : {};
    };
    moveTo(id, from, to, styleAt(to), record);
    push(
      {
        layers: [id],
        key: `${id} ${record.property}`,
        undo: () => moveTo(id, to, from, styleAt(from), record),
        redo: () => moveTo(id, from, to, styleAt(to), record),
      },
      false,
    );
  };

  /**
   * A change to the structure that can be undone: `make` makes it, `unmake`
   * takes it back, each on the canvas and in the ChangeSet; the layers are
   * built anew after each. `layers`: what it is made to; `back`: what taking it back leaves.
   */
  const structural = (layers: string[], back: string[], make: () => void, unmake: () => void) => {
    const run = (f: () => void) => () => {
      f();
      syncOrders(doc, changes);
      tree = buildLayerTree(doc);
    };
    run(make)();
    push({ layers, back, key: layers.join(" "), undo: run(unmake), redo: run(make) }, false);
  };
  /** Making a Stack, or dissolving one, as recorded in `record`, with the layer `id`. */
  const stackOn = (id: string, record: StructureRecord) => () => {
    changes.record(id, record);
    if (record.kind === "stack") compose(doc, id, record.after as Composed, record.style);
    else dissolve(doc, id, record.after as Dissolved, record.style);
  };
  /** Taking that back. */
  const stackOff = (id: string, record: StructureRecord) => () => {
    drop(id, record.property);
    if (record.kind === "stack") decompose(doc, id, record.after as Composed, changes.list());
    else undissolve(doc, id, record.after as Dissolved, changes.list());
  };
  /** Takes the change to the layer `id` under `property` out of the ChangeSet. */
  const drop = (id: string, property: string) => {
    const change = changes.list().find((c) => c.layer === id && c.property === property);
    if (change) changes.remove(change.id);
  };
  /**
   * Taking a layer made this round off the canvas, as recorded in `record`;
   * once taken off, making it again puts the same elements back where they were.
   */
  const madeLayer = (id: string, record: StructureRecord, make: () => void) => {
    let taken: [Element, Element, Node | null][] = [];
    const container = (record.kind === "create" || record.kind === "putBack" ? (record.after as Created | PutBack).place : (record.after as Place)).container.layer;
    return {
      make: () => {
        if (!taken.length) return make();
        changes.record(id, record);
        for (const [el, parent, next] of taken) parent.insertBefore(el, next);
        taken = [];
      },
      takeOff: () => {
        drop(id, record.property);
        taken = elementsOf(doc, id)
          .filter((el) => el.getAttribute(MADE_ATTR) === id)
          .map((el) => [el, el.parentElement!, el.nextSibling]);
        removeMade(doc, id, container, changes.list());
      },
    };
  };
  /** New words, `text`, for the layer `id` under `record`; null: the words it had. */
  const words = (id: string, record: StructureRecord, text: string | null) => () => {
    if (text === null) drop(id, record.property);
    else changes.record(id, { ...record, after: text });
    writeText(doc, id, record.property, changes.has(id, record.property) ? text : null);
  };
  /** Marks every instance of the layer `id` with the brief `text`, the Layers panel and the canvas showing it; "": none. */
  const markBrief = (id: string, text: string) => {
    // With no brief of its usage's own, the component's, if it has one, shows.
    const own = !!changes.find(id, BRIEF);
    for (const el of elementsOf(doc, id)) {
      const shown = text || (own ? "" : componentBrief(el, changes.list()));
      if (shown) el.setAttribute(BRIEF_ATTR, shown);
      else el.removeAttribute(BRIEF_ATTR);
    }
  };
  /**
   * The brief `text` on the layer `id`, as recorded in `record`, a change of
   * its own; "": none. The brief the layer was copied with, if any, is the
   * record's `before`: back to it, there is no change.
   */
  const briefing = (id: string, record: StructureRecord, text: string) => () => {
    if (text === ((record.before as string | null) ?? "")) drop(id, record.property);
    else changes.record(id, { ...record, after: text });
    markBrief(id, text);
  };
  /** Deleting `els`, the layer `id`, as recorded in `record`. */
  const deleting = (id: string, record: StructureRecord, els: Element[]) => ({
    make: () => {
      changes.record(id, record);
      hide(els, record.property, record.style);
    },
    bringBack: () => {
      drop(id, record.property);
      unhide(doc, id, record.property, changes.list());
    },
  });
  /**
   * The elements of the layer in every instance of its usage on the page:
   * those deleted on the canvas, no layers any more, count too, as the page
   * still has them.
   */
  const onPage = (layer: Layer): Element[] => {
    const id = layer.text ? null : layer.el.getAttribute(LAYER_ID_ATTR);
    const shown = tree.acrossInstances(layer).map((instance) => instance.el);
    const all = id ? elementsOf(doc, id) : [];
    return all.length > shown.length ? all : shown;
  };
  /** One of the instances a loop renders, those deleted included. */
  const inLoop = (layer: Layer) => isLoop(onPage(layer));
  /** A layer made this round by the change `id` is the one with: the change that made it, if there is one. */
  const makerOf = (id: string) => changes.list().find((change) => change.layer === id && madeBy(change) === id) ?? null;

  /** Laid out in its container's own element, there to be placed: not text with no element of its own, nor pinned to the window. */
  const placeable = (layer: Layer) => !layer.text && layer.el.parentElement === layer.parent?.el && !layer.el.hasAttribute(PIN_OFFSET_ATTR);
  /** The layer is in every instance of `container`: not one of the instances a loop renders there. */
  const repeatsWith = (layer: Layer, container: Layer) => tree.acrossInstances(layer).length === tree.acrossInstances(container).length;
  /** A Frame that can become a Stack of its layers. */
  const isFrameOfLayers = (layer: Layer) =>
    layer.kind === "frame" && !!layer.parent && layer.children.length > 0 && layer.children.every((child) => placeable(child) && repeatsWith(child, layer));

  /** The layer's id and the width of the view worked in, when it is not the desktop view and the layer has changes of its own. */
  const workedHere = (layer: Layer) => {
    const id = styledId(layer);
    const view = beside();
    return view && id ? { id, width: view.width } : null;
  };

  /**
   * Takes a change made at a breakpoint back out, as an edit that can be
   * undone: the layer inherits what it shows at every width there again, as
   * that is now, and undone, the change is back as it was.
   */
  const inheritStep = (change: Change) => {
    const { layer: id, property, breakpoint } = change;
    const instances = () => {
      const layer = layerById(id);
      return layer ? tree.acrossInstances(layer).map((instance) => instance.el) : [];
    };
    const off = () => {
      changes.remove(change.id);
      const others = changesOn(id, changes.list());
      for (const el of instances()) restoreStyle(el, cssOf(property as Property), others, breakpoint!);
      referenceAt(change.within, breakpoint!);
    };
    const on = () => {
      changes.restore(change);
      for (const el of instances()) declare(el, change.style, breakpoint!);
      referenceAt(change.within, breakpoint!);
    };
    off();
    push({ layers: [id], key: `${id} ${property} inherit`, undo: on, redo: off, ...textsOf(id, property as Property) }, false);
  };

  /**
   * The changes of the layer `id` promoted to the component that writes it at
   * `loc`, or back with its usage, shown as `changes` has them now: the
   * usage's own edits on its elements, the component's on all it writes.
   */
  const showPromoted = (id: string, loc: string, taken: Change[]) => {
    const others = changesOn(id, changes.list());
    for (const el of elementsOf(doc, id)) {
      for (const change of taken) if (change.kind === "style") restoreStyle(el, cssOf(change.property as Property), others, change.breakpoint ?? null);
      if (others.some((change) => change.asStack && !change.breakpoint)) el.setAttribute(AS_STACK_ATTR, "");
    }
    showComponent(doc, loc, changes.list());
  };

  /** Takes one change back out, as an edit that can be undone. Returns its layer as it is then. */
  const revertOne = (change: Change): Layer | null => {
    if (change.scope === "component") {
      // On every element the component writes.
      const loc = change.target.loc!;
      const to = (on: boolean) => () => {
        if (on) changes.restore(structuredClone(change));
        else changes.remove(change.id);
        showComponent(doc, loc, changes.list());
      };
      structural([], [], to(false), to(true));
      const [el] = componentElements(doc, loc);
      return el ? tree.layerOf(el) : null;
    }
    if (change.kind === "delete") {
      // Deleted, it is no layer: its elements are found by the change.
      const { id: _, layer: id, ...record } = change;
      const els = elementsOf(doc, id).filter((el) => el.getAttribute(DELETED_ATTR) === change.property);
      const { make, bringBack } = deleting(id, record, els);
      structural([id], [id], bringBack, make);
      return layerById(id);
    }
    if (change.kind === "brief") {
      // Found by its id: a layer deleted since keeps its brief to take off.
      const { id: _, layer: id, ...record } = change;
      structural([id], [id], briefing(id, record, (change.before as string | null) ?? ""), briefing(id, record, change.after as string));
      return layerById(id);
    }
    const layer = layerById(change.layer);
    if (!layer) return null;
    if (change.kind === "move") {
      const { kind, target, scope, property, data, wrap, reference } = change;
      const record: MoveRecord = { kind, target, scope, property, sources: [], ...(data && { data }), ...(wrap && { wrap }), ...(reference && { reference }) };
      const el = elementsOf(doc, change.layer).find((e) => e.getAttribute(MOVE_ATTR) === property) ?? layer.el;
      moveStep(change.layer, change.after as Place, change.before as Place, change.before as Place, sizeOf(el), record);
      return tree.layerOf(el);
    }
    const { id: _, layer: id, ...record } = change;
    if (change.kind === "stack" || change.kind === "unstack") {
      const members = (change.after as Composed | Dissolved).layers.map((member) => member.layer);
      const kept = change.kind === "stack" && (change.after as Composed).place ? members : [id];
      structural(kept, [id], stackOff(id, record), stackOn(id, record));
      return layerById(kept[0]);
    }
    if (change.kind === "create" || change.kind === "duplicate" || change.kind === "putBack") {
      const container = layer.parent!;
      const { make, takeOff } = madeLayer(id, record, () => {});
      structural([container.el.getAttribute(LAYER_ID_ATTR) ?? id], [id], takeOff, make);
      return tree.layerOf(container.el);
    }
    if (change.kind === "text") {
      structural([id], [id], words(id, record, null), words(id, record, change.after as string));
      return layerById(id);
    }
    // A style of the text a box draws is the text's.
    const styled = layerFor(change.layer, change.property as Property) ?? layer;
    if (change.breakpoint) {
      inheritStep(change);
      return styled;
    }
    // Whatever the layer offers now (a hidden one offers only Visible), a change of its own can always go.
    edit(styled, change.property as Property, change.before as PropertyValues[Property], false, change.breakpoint ?? null, change.after as PropertyValues[Property]);
    return styled;
  };

  /**
   * The layers made this round in the layer `id` and moved out of it since,
   * made where they are now instead, each move taken into its making: taking
   * back what made `id` then leaves them. Nothing moves on the canvas.
   */
  const rehome = (id: string) => {
    const moved = changes.list().filter((change) => {
      const maker = change.kind === "move" && (change.before as Place).container.layer === id ? makerOf(change.layer) : null;
      return maker?.kind === "create" && (maker.after as Created).place.container.layer === id;
    });
    if (!moved.length) return;
    const layers = moved.map((move) => {
      const made = makerOf(move.layer)!;
      const place = move.after as Place;
      const style = Object.fromEntries(Object.entries(made.style).filter(([name]) => !["position", "left", "top", "right", "bottom"].includes(name)));
      const where: Change = { ...made, target: place.container.target, after: { ...(made.after as Created), place }, style: { ...style, ...(place.absolute && absoluteAt(place.absolute)) } };
      return { made, where, move };
    });
    const marks = (layer: string, move: string | null) => {
      for (const el of elementsOf(doc, layer)) {
        if (el.getAttribute(MADE_ATTR) !== layer) continue;
        if (move) el.setAttribute(MOVE_ATTR, move);
        else el.removeAttribute(MOVE_ATTR);
      }
    };
    const ids = layers.map(({ made }) => made.layer);
    structural(
      ids,
      ids,
      () => {
        for (const { where, move } of layers) {
          drop(move.layer, move.property);
          changes.restore(where);
          marks(where.layer, null);
        }
      },
      () => {
        for (const { made, move } of layers) {
          changes.restore(made);
          changes.restore(move);
          marks(made.layer, move.property);
        }
      },
    );
  };

  /**
   * Whether the layer deleted by `deletion`, its element `el`, can come back
   * into `container` as it was: into a container in as many instances as the
   * one it was in, where it is not pinned to stay where it was.
   */
  const canReturn = (deletion: Change, el: Element, container: Layer) => {
    const home = layerById((deletion.before as Place).container.layer);
    if (!home || tree.acrossInstances(home).length !== tree.acrossInstances(container).length) return false;
    // One of a loop's instances, or pinned against a window: only back into its own container.
    return container === home || !(deletion.data || el.hasAttribute(PIN_OFFSET_ATTR));
  };

  /** Puts a moved layer at `to`, on the canvas and in the ChangeSet, and builds the layers anew. */
  const moveTo = (id: string, from: Place, to: Place, style: Record<string, string>, record: MoveRecord) => {
    changes.record(id, { ...record, before: from, after: to, style });
    relocate(doc, id, record.property, from, to, style, changes.list());
    syncOrders(doc, changes);
    tree = buildLayerTree(doc);
  };

  const editor: Editor = {
    at(view) {
      current = view;
    },
    breakpoint: () => breakpointIn(current),
    breakpointAt,
    changedHere: (layer, property) => editor.changesHere(layer).includes(property),
    changesHere(layer) {
      const here = workedHere(layer);
      if (!here) return [];
      const holding = new Set(changesAt(here.id, here.width));
      // In the order they were first changed, each once.
      return [
        ...new Set(
          changesAtBreakpoints(here.id)
            .filter((change) => holding.has(change) && ownProperty(layer, change.property as Property))
            .map((change) => change.property as Property),
        ),
      ];
    },
    inherit(layer, property) {
      const here = workedHere(layer);
      if (!here) return;
      // Two ranges of its own that both hold here, as recorded before the views changed: both go, one step.
      editor.batch(() => {
        for (const change of changesAt(here.id, here.width, property)) inheritStep(change);
      });
    },
    tree: () => tree,
    canMove: (layer) => layer.parent !== null,
    canDrop(layer, container) {
      if (!editor.canMove(layer) || !CONTAINERS.includes(container.kind)) return false;
      // Pinned where the designer saw it, against a window the canvas has none of: it stays in its container.
      if (!layer.text && layer.el.hasAttribute(PIN_OFFSET_ATTR) && container !== layer.parent) return false;
      for (let c: Layer | null = container; c; c = c.parent) if (c === layer) return false;
      return tree.acrossInstances(container).length === tree.acrossInstances(layer.parent!).length;
    },
    move(layer, to) {
      if (!editor.canDrop(layer, to.parent)) throw new Error(`Vernier Kit: ${layer.name} cannot go into ${to.parent.name}`);
      // Absolute as the page has it, and staying in its container: only its position changes, as X and Y do.
      // At a breakpoint, so does that of any absolute layer: where it is placed there is its X and Y there.
      const moved = !layer.text && layer.el.hasAttribute(MOVE_ATTR);
      if ("x" in to && to.parent === layer.parent && (breakpointIn(current) || (layer.absolute && !layer.text && !moved))) {
        // At a breakpoint, loose text gets an element of its own, to be placed freely there.
        if (layer.text) layer = wrap(layer);
        const [dx, dy] = pinOffsetOf(layer.el);
        const at = { x: round(to.x - dx), y: round(to.y - dy) };
        // At a breakpoint, a layer in its container's flow there is placed freely there only (ADR 0008).
        if (breakpointIn(current) && !absolute(shownIn(current, layer.el))) edit(layer, "absolute", at, false, breakpointFor(layer, "absolute"));
        else {
          // Placed freely already: only its position changes, as X and Y do; at a breakpoint, there.
          const placed = layer;
          editor.batch(() => {
            editor.set(placed, "x", at.x);
            editor.set(placed, "y", at.y);
          });
        }
        return layer;
      }
      // Into another container, a change to the structure in every view: where it was placed freely at a breakpoint goes with what it leaves.
      const placings = layer.text ? [] : changes.list().filter((change) => change.layer === layer.el.getAttribute(LAYER_ID_ATTR) && change.property === "absolute");
      if (placings.length && to.parent !== layer.parent) {
        let there = layer;
        editor.batch(() => {
          for (const change of placings) inheritStep(change);
          there = editor.move(layer, to);
        });
        return there;
      }
      const target = targetOf(layer, tree.acrossInstances(layer).length);
      const loop = isLoop(tree.acrossInstances(layer).map((instance) => instance.el));
      const text = !!layer.text;
      if (text) layer = wrap(layer);
      const id = idOf(layer, tree.acrossInstances(layer));
      const from = placeOf(layer);
      const after = placeAt(layer, to);
      if (same(from, after)) return layer;
      // The elements that move, marked with the change they move under: a loop's instance alone, under one of its own.
      let property = layer.el.getAttribute(MOVE_ATTR);
      if (!property) {
        property = loop ? `${MOVE} ${++lastMove}` : MOVE;
        for (const el of loop ? [layer.el] : elementsOf(doc, id)) el.setAttribute(MOVE_ATTR, property);
      }
      const el = layer.el;
      const earlier = changes.list().find((change) => change.layer === id && change.property === property);
      // Placed absolute in a container the page does not position: it becomes the positioning reference.
      const container = to.parent.el;
      const reference = !!after.absolute && (getComputedStyle(container).position === "static" || container.hasAttribute(REFERENCE_ATTR));
      const record: MoveRecord = {
        kind: "move",
        target,
        scope: "usage",
        property,
        sources: [],
        ...(loop && { data: true }),
        ...(text && { wrap: true }),
        ...(reference && { reference: true }),
      };
      moveStep(id, from, after, (earlier?.before as Place | undefined) ?? from, sizeOf(el), record);
      return tree.layerOf(el) ?? layer;
    },
    nudge(layers, dx, dy, { continues = false } = {}) {
      /** Each layer by its node, found again as each move builds the layers anew; loose text gets an element on its first. */
      const nodes = layers.map(nodeOf);
      const found = (i: number) => tree.layerOf(nodes[i]);
      const moved = (i: number, layer: Layer) => (nodes[i] = nodeOf(layer));
      /** Placed freely in the view worked in. */
      const free = (layer: Layer) => !layer.text && (layer.absolute || absolute(shownIn(current, layer.el)));
      group(
        () => {
          // Placed freely, or in a Frame: moved that far, from where they are.
          layers.forEach((_, i) => {
            const layer = found(i);
            const parent = layer?.parent;
            if (!layer || !parent || (!dx && !dy) || !(free(layer) || parent.kind === "frame") || !editor.canDrop(layer, parent)) return;
            const { x, y } = freePlaceOf(layer);
            moved(i, editor.move(layer, { parent, x: x + dx, y: y + dy }));
          });
          // In a Stack's or a Grid's layout: each a place along it, the furthest that way first, so side by side they go together.
          const stacked = layers.map((_, i) => i).filter((i) => {
            const layer = found(i);
            const parent = layer?.parent;
            // A Grid that places its layers itself has no cell along to take: they stay, as they do in a Frame's flow.
            const along = parent?.kind === "stack" || (parent?.kind === "grid" && !placesItself(shownIn(current, parent.el)));
            return along && !free(layer!) && editor.canDrop(layer!, parent!);
          });
          const stuck = new Set<Node>();
          for (const parentNode of new Set(stacked.map((i) => nodeOf(found(i)!.parent!)))) {
            const container = tree.layerOf(parentNode)!;
            // A Grid's cells run along its rows: a row on is as many cells on as it has columns.
            const along =
              container.kind === "grid"
                ? Math.sign(dx) || Math.sign(dy) * PROPERTIES.columns.read(shownIn(current, container.el), colors)
                : Math.sign(container.direction === "horizontal" ? dx : dy);
            if (!along) continue;
            const flowOf = (i: number) => {
              const parent = found(i)!.parent!;
              return { parent, flow: parent.children.filter((child) => !free(child)) };
            };
            const mine = stacked
              .filter((i) => nodeOf(found(i)!.parent!) === parentNode)
              .sort((a, b) => along * (flowOf(b).flow.indexOf(found(b)!) - flowOf(a).flow.indexOf(found(a)!)));
            for (const i of mine) {
              const layer = found(i)!;
              const { parent, flow } = flowOf(i);
              const to = flow.indexOf(layer) + along;
              if (to < 0 || to >= flow.length || stuck.has(nodeOf(flow[to]))) {
                stuck.add(nodes[i]);
                continue;
              }
              // Before the layer that will come after it, the layer itself taken out, as a drop places it.
              const rest = flow.filter((child) => child !== layer);
              const others = parent.children.filter((child) => child !== layer);
              moved(i, editor.move(layer, { parent, index: to < rest.length ? others.indexOf(rest[to]) : others.length }));
            }
          }
        },
        continues,
        true,
      );
      return layers.map((layer, i) => found(i) ?? layer);
    },
    can(layer, property, value) {
      const { kinds, applies, accepts }: Definition<PropertyValues[typeof property]> = PROPERTIES[property];
      // Text with no element of its own has no styles, but for the text a box draws and nothing else: those of the box's element.
      if ((layer.text && !(isWholeText(layer) && textOnly(kinds))) || !kinds.includes(layer.kind)) return false;
      // A hidden layer offers what it does when shown, so the panel stays as it was.
      const el = shownIn(current, layer.el);
      return asShown(el, () => (!applies || applies(el, layer)) && (value === undefined || !accepts || accepts(el, value)));
    },
    read: (layer, property) => readAsShown(shownIn(current, layer.el), property, colors),
    measure(layer) {
      const el = layer.text ? layer.el : shownIn(current, layer.el);
      if (el === layer.el) return asShown(layer.el, () => boxOf(layer));
      return asShown(el, () => el.getBoundingClientRect());
    },
    variables(layer, property) {
      const id = styledId(layer);
      if (!id) return undefined;
      // As the view worked in shows it: the layer's own value at a breakpoint that holds there, else that at every width.
      const view = beside();
      const [here] = view ? changesAt(id, view.width, property) : [];
      return (here ?? changes.find(id, property, null))?.variables;
    },
    set(layer, property, value, { continues = false, variables } = {}) {
      if (!editor.can(layer, property, value)) throw new Error(`Vernier Kit: ${property} cannot be set to ${JSON.stringify(value)} on a ${layer.kind} layer`);
      // Placed freely at the breakpoint worked in, its X and Y there are where it is placed: the one change.
      if ((property === "x" || property === "y") && editor.changedHere(layer, "absolute")) {
        const place = { ...editor.read(layer, "absolute")!, [property]: value };
        edit(layer, "absolute", place, continues, breakpointFor(layer, "absolute"));
        return;
      }
      edit(layer, property, value, continues, breakpointFor(layer, property), undefined, variables);
    },
    batch(edits, { continues = false } = {}) {
      group(edits, continues);
    },
    undo() {
      const entry = history.past.pop();
      if (!entry) return [];
      history.future.push(entry);
      entry.step.undo();
      entry.show();
      return textsIn(entry.step, entry.found(entry.step.back ?? entry.step.layers));
    },
    redo() {
      const entry = history.future.pop();
      if (!entry) return [];
      history.past.push(entry);
      entry.step.redo();
      entry.show();
      return textsIn(entry.step, entry.found(entry.step.layers));
    },
    along(make, unmake, layers) {
      make();
      push({ layers: [], key: "along", undo: unmake, redo: make }, false, layers && (() => layers()));
    },
    revert(id) {
      // What builds on it goes first, newest first, all one step.
      let layer: Layer | null = null;
      editor.batch(() => {
        for (const change of withDependents(changes.list(), id)) {
          const reverted = revertOne(change);
          if (change.id === id) layer = reverted;
        }
      });
      return layer && tree.layerOf(nodeOf(layer));
    },
    canPromote(layer) {
      const id = styledId(layer);
      return !!id && inComponent(layer) && promotable(changes.list(), id).some((change) => ofLayer(layer, change));
    },
    promote(layer) {
      if (!editor.canPromote(layer)) throw new Error(`Vernier Kit: ${layer.name} has no changes to promote to its component`);
      const id = layer.el.getAttribute(LAYER_ID_ATTR)!;
      const loc = layer.loc!;
      const component = componentKey(loc);
      const taken = structuredClone(promotable(changes.list(), id).filter((change) => ofLayer(layer, change)));
      const before = structuredClone(changes.list().filter((change) => change.layer === component));
      // The component's changes once promoted, worked out apart.
      const after = promoteIn(createChangeSet(changes.save()), taken, loc, componentElements(doc, loc).length);
      const swap = (out: Change[], back: Change[]) => () => {
        for (const change of out) changes.remove(change.id);
        for (const change of back) changes.restore(structuredClone(change));
        showPromoted(id, loc, taken);
      };
      structural([id], [id], swap([...taken, ...before], after), swap(after, [...before, ...taken]));
      return { promoted: taken, stays: changes.list().filter((change) => change.layer === id && change.scope === "usage" && ofLayer(layer, change)) };
    },
    canStack(layers) {
      if (layers.length === 1 && isFrameOfLayers(layers[0])) return true;
      const parent = layers[0]?.parent;
      return !!parent && layers.every((layer) => layer.parent === parent && placeable(layer) && repeatsWith(layer, parent));
    },
    stack(layers) {
      if (!editor.canStack(layers)) throw new Error(`Vernier Kit: ${layers.map((layer) => layer.name).join(", ")} cannot be made a Stack`);
      const frame = layers.length === 1 && isFrameOfLayers(layers[0]) ? layers[0] : null;
      const members = frame ? frame.children : layers;
      const container = frame ?? layers[0].parent!;
      const count = tree.acrossInstances(container).length;
      // Measured as they show, margins left out: in the Stack, the room between them is its gap. The Stack has no
      // margin of its own either, which no one could see or set: the room the margins made around them goes.
      // Placed freely in a Frame, they are placed again, by the Stack.
      const inferred = inferStack(
        members.map((member) => borderBox(member.el)),
        frame && paddingBox(frame.el),
        !!frame && members.every((member) => member.absolute),
      );
      const ordered = inferred.order.map((i) => members[i]);
      const margins = ordered.map((member) => marginsOf(member.el));
      const composed: Composed = {
        ...inferred.settings,
        place: null,
        layers: ordered.map((member, i) => ({
          layer: idOf(member, tree.acrossInstances(member)),
          target: targetOf(member, count),
          from: placeOf(member),
          ...(margins[i].some((m) => m) && { unmargined: true as const }),
        })),
      };
      let style = stackStyle(inferred.settings, inferred.stretch);
      let id: string;
      if (frame) id = idOf(frame, tree.acrossInstances(frame));
      else {
        id = String(++lastId);
        // Where the first of them is; absolute where they are, if they all are.
        const slots = slotsOf(container.el);
        let absolute: Place["absolute"] = null;
        if (members.every((member) => member.absolute)) {
          const reference = paddingBox((members[0].el as HTMLElement).offsetParent ?? container.el);
          const boxes = members.map((member) => borderBox(member.el));
          absolute = { x: round(Math.min(...boxes.map((b) => b.left)) - reference.left), y: round(Math.min(...boxes.map((b) => b.top)) - reference.top) };
          style = { ...style, ...absoluteAt(absolute) };
        }
        composed.place = {
          container: { layer: idOf(container, tree.acrossInstances(container)), target: targetOf(container, count) },
          nth: container.children.findIndex((child) => members.includes(child)) + 1,
          slot: Math.min(...members.map((member) => slots.indexOf(member.el))),
          absolute,
        };
      }
      // What sets the margins the layers lose, for the Agent to take off.
      const sources = ordered.flatMap((member, i) => (margins[i].some((m) => m) ? sourcesFor(member.el, MARGIN_CSS) : []));
      const record: StructureRecord = { kind: "stack", target: targetOf(container, count), scope: "usage", property: "stack", before: null, after: composed, style, sources };
      const kept = frame ? [id] : composed.layers.map((member) => member.layer);
      structural([id], kept, stackOn(id, record), stackOff(id, record));
      return layerById(id)!;
    },
    canUnstack: (layer) => layer.kind === "stack" && !!layer.parent && layer.children.every((child) => placeable(child) && repeatsWith(child, layer)),
    canUngroup: (layer) =>
      !!layer.parent &&
      ["stack", "frame"].includes(layer.kind) &&
      !layer.isInstance &&
      layer.children.length > 0 &&
      layer.children.every((child) => placeable(child) && editor.canDrop(child, layer.parent!)),
    ungroup(layer) {
      if (!editor.canUngroup(layer)) throw new Error(`Vernier Kit: ${layer.name} cannot be ungrouped`);
      const els = layer.children.map((child) => child.el);
      const found = () => els.map((el) => tree.layerOf(el)).filter((l) => l !== null);
      const maker = makerOf(idOf(layer, tree.acrossInstances(layer)));
      if (maker?.kind === "stack") {
        editor.revert(maker.id);
        return found();
      }
      const ungrouped = layer.el;
      const container = layer.parent!.el;
      // In its container's layout, its layers in its layout take its place; any other stays where it is, absolute.
      const inLayout = layer.children.map((child) => layer.parent!.kind !== "frame" && !layer.absolute && !child.absolute);
      const index = layer.parent!.children.indexOf(layer);
      const spots = els.map((el) => spotIn(el, container));
      editor.batch(() => {
        let n = 0;
        els.forEach((el, i) => {
          const parent = tree.layerOf(container)!;
          editor.move(tree.layerOf(el)!, inLayout[i] ? { parent, index: index + n++ } : { parent, ...spots[i] });
        });
        editor.remove(tree.layerOf(ungrouped)!);
      });
      return found();
    },
    canHold: (layer) => holdsLayers(layer),
    create(type, to, size) {
      const { container, containerId, place, target } = newAt(to);
      // Text drawn wider than a click keeps the width it was drawn at; its height follows its words.
      const frame = type === "frame";
      const width = size ? round(size.width) : frame ? NEW_FRAME_SIZE : null;
      const height = frame ? (size ? round(size.height) : NEW_FRAME_SIZE) : null;
      const created: Created = { type, place, width, height, ...(frame ? {} : { text: NEW_TEXT }) };
      const style = {
        ...(frame ? {} : bodyText(doc)),
        ...(width !== null && { width: `${width}px` }),
        ...(height !== null && { height: `${height}px` }),
        ...(place.absolute && absoluteAt(place.absolute)),
      };
      const id = String(++lastId);
      const record: StructureRecord = { kind: "create", target, scope: "usage", property: "new", before: null, after: created, style, sources: [] };
      const { make, takeOff } = madeLayer(id, record, () => {
        changes.record(id, record);
        insertNew(doc, id, created, style);
      });
      structural([id], [containerId], make, takeOff);
      return tree.layerOf([...container.el.children].find((el) => el.getAttribute(LAYER_ID_ATTR) === id)!)!;
    },
    brief(layer) {
      if (layer.text) return "";
      const id = layer.el.getAttribute(LAYER_ID_ATTR);
      // Not changed this round: its component's brief, if one is promoted to it.
      if (!id) return layer.el.getAttribute(BRIEF_ATTR) ?? "";
      if (editor.isNewFrame(layer)) return (makerOf(id)!.after as Created).brief ?? "";
      // A copy of a new Frame has the brief it was copied with, until one is written on it.
      return (changes.find(id, BRIEF)?.after as string | undefined) ?? layer.el.getAttribute(BRIEF_ATTR) ?? "";
    },
    isNewFrame(layer) {
      const maker = layer.text ? null : makerOf(layer.el.getAttribute(LAYER_ID_ATTR) ?? "");
      return maker?.kind === "create" && (maker.after as Created).type === "frame";
    },
    setBrief(layer, brief) {
      const before = editor.brief(layer);
      if (before === brief) return layer;
      if (editor.isNewFrame(layer)) {
        // In the change that makes it.
        const id = layer.el.getAttribute(LAYER_ID_ATTR)!;
        const maker = makerOf(id)!;
        const { id: _, layer: __, ...record } = maker;
        const to = (text: string) => () => {
          changes.record(id, { ...record, after: { ...(maker.after as Created), brief: text || undefined } });
          markBrief(id, text);
        };
        structural([id], [id], to(brief), to(before));
        return tree.layerOf(layer.el)!;
      }
      const own = editor.ownElement(layer);
      const id = idOf(own, tree.acrossInstances(own));
      // Before: what the layer shows otherwise, which writing one on it takes the place of: the brief a copy of a new Frame was copied with, or its component's.
      const written = changes.find(id, BRIEF);
      const copiedWith = written ? written.before : before || null;
      const record: StructureRecord = { kind: "brief", target: targetOf(own, onPage(own).length), scope: "usage", property: BRIEF, before: copiedWith, after: brief, style: {}, sources: [] };
      structural([id], [id], briefing(id, record, brief), briefing(id, record, before));
      return tree.layerOf(own.el)!;
    },
    ownElement: (layer) => (layer.text ? wrap(layer) : layer),
    setText(layer, text) {
      // The text a box draws and nothing else has its words in the box's element.
      const own = isWholeText(layer) ? layer : editor.ownElement(layer);
      const instances = tree.acrossInstances(own);
      const id = idOf(own, instances);
      const maker = makerOf(id);
      // The words of new text are those of the change that makes it.
      if (maker?.kind === "create") {
        const created = maker.after as Created;
        if (created.text === undefined || created.text === text) return;
        const { id: _, layer: __, ...record } = maker;
        const to = (words: string) => () => {
          changes.record(id, { ...record, after: { ...created, text: words } });
          for (const el of elementsOf(doc, id)) el.textContent = words;
        };
        structural([id], [id], to(text), to(created.text));
        return;
      }
      const now = wordsOf(own.el);
      if (now === text) return;
      // Words that differ across the instances of a usage come from data: those a loop renders.
      let property = own.el.getAttribute(TEXT_ATTR);
      if (!property) {
        const alone = new Set(instances.map((instance) => wordsOf(instance.el))).size > 1;
        property = alone ? `text-${++lastAlone}` : "text";
        for (const instance of alone ? [own] : instances) instance.el.setAttribute(TEXT_ATTR, property);
      }
      const earlier = changes.list().find((change) => change.layer === id && change.property === property);
      const record: StructureRecord = {
        kind: "text",
        target: targetOf(own, onPage(own).length),
        scope: "usage",
        property,
        before: earlier ? earlier.before : now,
        after: text,
        style: {},
        sources: [],
        ...(property !== "text" && { data: true }),
      };
      structural([id], [id], words(id, record, text), words(id, record, now));
    },
    canRemove: (layer) => layer.parent !== null,
    originOf(layer) {
      const made = layer.made !== null && layer.el.getAttribute(LAYER_ID_ATTR) === layer.made;
      const maker = made ? makerOf(layer.made!) : null;
      if (maker?.kind === "putBack") {
        const { target, written, snippet, copy } = (maker.after as PutBack).layer.origin;
        return { target, place: placeOf(layer), written, ...(snippet !== undefined && { snippet }), ...(copy && { copy }) };
      }
      return {
        target: targetOf(layer, onPage(layer).length),
        place: layer.parent ? placeOf(layer) : null,
        written: made ? null : layer.isInstance ? layer.usageLoc : layer.loc,
      };
    },
    remove(layer, { offCanvas } = {}) {
      if (!editor.canRemove(layer)) throw new Error(`Vernier Kit: ${layer.name} cannot be deleted`);
      const own = editor.ownElement(layer);
      const instances = tree.acrossInstances(own);
      const id = idOf(own, instances);
      // Made this round, it is not in the source: taking it back is deleting it. A new Stack goes with its layers.
      const maker = makerOf(id);
      if (maker) {
        const members = maker.kind === "stack" ? (maker.after as Composed).layers.map((member) => member.layer) : [];
        editor.batch(() => {
          rehome(id);
          editor.revert(maker.id);
          for (const member of members) {
            const found = layerById(member);
            if (found) editor.remove(found);
          }
        });
        return;
      }
      const loop = inLoop(own);
      const property = loop ? `delete-${++lastAlone}` : "delete";
      const parent = own.parent!;
      const record: StructureRecord = {
        kind: "delete",
        target: targetOf(own, onPage(own).length),
        scope: "usage",
        property,
        before: placeOf(own),
        after: null,
        style: { display: "none" },
        sources: [],
        ...(loop && { data: true }),
        ...(offCanvas && { offCanvas }),
      };
      const { make, bringBack } = deleting(id, record, loop ? [own.el] : instances.map((instance) => instance.el));
      structural([idOf(parent, tree.acrossInstances(parent))], [id], make, bringBack);
    },
    canDuplicate: (layer) => layer.parent !== null && !layer.text,
    duplicate(layer, to) {
      if (!editor.canDuplicate(layer) || (to && !editor.canDrop(layer, to.parent))) throw new Error(`Vernier Kit: ${layer.name} cannot be copied there`);
      const instances = tree.acrossInstances(layer);
      const loop = inLoop(layer);
      const parent = to?.parent ?? layer.parent!;
      const containers = loop ? [parent] : tree.acrossInstances(parent);
      // The original needs an id of its own, for its changes to stay apart from the copy's.
      idOf(layer, instances);
      const from = placeOf(layer);
      const where = { layer: idOf(parent, tree.acrossInstances(parent)), target: targetOf(parent, tree.acrossInstances(parent).length) };
      const slots = slotsOf(parent.el);
      let place: Place;
      let style: Record<string, string> = {};
      if (!to) place = { container: where, nth: parent.children.indexOf(layer) + 2, slot: slots.indexOf(layer.el) + 1, absolute: from.absolute };
      else if ("x" in to) {
        place = { container: where, nth: parent.children.length + 1, slot: slots.length, absolute: { x: round(to.x), y: round(to.y) } };
        style = { ...absoluteAt(place.absolute!), ...sizeOf(layer.el) };
      } else {
        const next = parent.children.filter((child) => child !== layer)[to.index];
        const nth = next ? parent.children.indexOf(next) : parent.children.length;
        place = { container: where, nth: nth + 1, slot: next ? slots.indexOf(nodeOf(next)) : slots.length, absolute: null };
        // An absolute layer's copy put into a layout leaves its position.
        if (layer.absolute) style = { position: "static" };
      }
      const id = String(++lastId);
      // It keeps what the layer has at breakpoints of its own, as it is now.
      const copied = copiedBreakpointsOf(layer.el, changes.list());
      const record: StructureRecord = {
        kind: "duplicate",
        target: targetOf(layer, onPage(layer).length),
        scope: "usage",
        property: "copy",
        before: from,
        after: place,
        style,
        sources: [],
        ...(loop && { data: true }),
        ...(copied.length > 0 && { copiedBreakpoints: copied }),
        // A new Frame's copy is made by its brief too.
        ...(layer.el.getAttribute(NEW_ATTR) === "frame" && layer.el.hasAttribute(BRIEF_ATTR) && { brief: layer.el.getAttribute(BRIEF_ATTR)! }),
      };
      const originals = (loop ? [layer] : instances).map((instance) => instance.el);
      const { make, takeOff } = madeLayer(id, record, () => {
        changes.record(id, record);
        insertCopies(originals, containers.map((container) => container.el), id, place, style);
      });
      structural([id], [layer.el.getAttribute(LAYER_ID_ATTR)!], make, takeOff);
      const at = containers[loop ? 0 : instances.indexOf(layer)].el;
      return tree.layerOf([...at.children].find((el) => el.getAttribute(LAYER_ID_ATTR) === id)!)!;
    },
    putBack(from, to) {
      const deletion = movedOffBy(changes.list(), from.kept.id);
      const deleted = deletion ? elementsOf(doc, deletion.layer).filter((el) => el.getAttribute(DELETED_ATTR) === deletion.property) : [];
      // Moved off this round, as it was: the deletion is taken back, and it moves to where it is let go, if anywhere.
      if (deletion && deleted.length && !from.kept.edits.changes.length && canReturn(deletion, deleted[0], to.parent)) {
        let back: Layer | null = null;
        // A change to the structure: at every width, whatever view it is let go in (ADR 0008).
        const worked = current;
        current = null;
        try {
          editor.batch(() => {
            editor.revert(deletion.id);
            const layer = tree.layerOf(deleted[0])!;
            const parent = tree.layerOf(to.parent.el)!;
            // Let go by its border box: placed by its margin box.
            const [x, y] = "x" in to ? [to.x - parseFloat(getComputedStyle(layer.el).marginLeft), to.y - parseFloat(getComputedStyle(layer.el).marginTop)] : [0, 0];
            back = editor.move(layer, "x" in to ? { parent, x: round(x), y: round(y) } : { parent, index: to.index });
          });
        } finally {
          current = worked;
        }
        return back!;
      }
      // Otherwise new on the canvas, as it looks off it.
      const { container, containerId, place, target } = newAt(to);
      const style = place.absolute ? absoluteAt(place.absolute) : {};
      const id = String(++lastId);
      const putBack: PutBack = { place, layer: structuredClone(from.kept) };
      const record: StructureRecord = { kind: "putBack", target, scope: "usage", property: "put back", before: null, after: putBack, style, sources: [] };
      const { make, takeOff } = madeLayer(id, record, () => {
        changes.record(id, record);
        insertPutBack(doc, id, from.el, place, style);
      });
      structural([id], [containerId], make, takeOff);
      return tree.layerOf(elementsOf(doc, id).find((el) => el.parentElement === container.el) ?? elementsOf(doc, id)[0])!;
    },
    unstack(layer) {
      if (!editor.canUnstack(layer)) throw new Error(`Vernier Kit: ${layer.name} cannot be dissolved`);
      const count = tree.acrossInstances(layer).length;
      const id = idOf(layer, tree.acrossInstances(layer));
      const before: StackSettings = {
        direction: readAsShown(layer.el, "direction", colors),
        gap: readAsShown(layer.el, "gap", colors),
        padding: readAsShown(layer.el, "padding", colors),
        align: readAsShown(layer.el, "align", colors),
      };
      // Each layer where it is now, from inside the Frame's border, its margins aside.
      const frame = paddingBox(layer.el);
      const dissolved: Dissolved = {
        width: round(layer.el.getBoundingClientRect().width),
        height: round(layer.el.getBoundingClientRect().height),
        layers: layer.children.map((child) => {
          const r = child.el.getBoundingClientRect();
          const margins = getComputedStyle(child.el);
          const x = round(r.left - frame.left - (parseFloat(margins.marginLeft) || 0));
          const y = round(r.top - frame.top - (parseFloat(margins.marginTop) || 0));
          const style = { ...absoluteAt({ x, y }), ...sizeOf(child.el) };
          return { layer: idOf(child, tree.acrossInstances(child)), target: targetOf(child, count), x, y, width: round(r.width), height: round(r.height), style };
        }),
      };
      const own = getComputedStyle(layer.el);
      const style = {
        ...(/flex$/.test(own.display) && { display: own.display === "inline-flex" ? "inline-block" : "block" }),
        ...sizeOf(layer.el),
        // The positioning reference of its layers.
        ...(own.position === "static" && { position: "relative" }),
      };
      const record: StructureRecord = {
        kind: "unstack",
        target: targetOf(layer, count),
        scope: "usage",
        property: "unstack",
        before,
        after: dissolved,
        style,
        sources: sourcesFor(layer.el, ["display", "flex-direction"]),
      };
      structural([id], [id], stackOn(id, record), stackOff(id, record));
      return layerById(id)!;
    },
  };
  return editor;
}

/** A property of an element as the editor reads it: as if shown, apart from whether it is shown. */
function readAsShown<P extends Property>(el: Element, property: P, colors: ColorReader): PropertyValues[P] {
  return property === "visible" ? PROPERTIES[property].read(el, colors) : asShown(el, () => PROPERTIES[property].read(el, colors));
}

/** What a move records besides where the layer was and is. */
type MoveRecord = Omit<Parameters<ChangeSet["record"]>[1], "before" | "after" | "style">;
/** What a change to the structure records (making or dissolving a Stack, a new layer, a copy, deleting, new words). */
type StructureRecord = Omit<Change, "id" | "layer">;

/** New text reads this, to be typed over. */
const NEW_TEXT = "Text";
/** A new Frame clicked rather than drawn is this size, in px. */
const NEW_FRAME_SIZE = 100;

/** The page's body text style: what new text takes, wherever it goes. */
function bodyText(doc: Document): Record<string, string> {
  const body = getComputedStyle(doc.body);
  return {
    "font-family": body.fontFamily,
    "font-size": body.fontSize,
    "font-weight": body.fontWeight,
    "line-height": body.lineHeight,
    "letter-spacing": body.letterSpacing,
    color: body.color,
    margin: "0px",
  };
}

/** The CSS that places a layer absolute at `x` and `y`, in px, from its container's top left. */
function absoluteAt({ x, y }: { x: number; y: number }): Record<string, string> {
  return { position: "absolute", left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" };
}

/** An element's size as CSS sets it now: what keeps it as large once it is absolute. */
function sizeOf(el: Element): Record<string, string> {
  const style = getComputedStyle(el);
  return { width: `${round(parseFloat(style.width))}px`, height: `${round(parseFloat(style.height))}px` };
}

/** Instances a loop renders: several, side by side in one container. */
function isLoop(els: Element[]): boolean {
  return els.length > 1 && els.every((el) => el.parentElement === els[0].parentElement);
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
function stackOf(el: Element): StackLayout {
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

/** The margins a layer joining a Stack loses. */
const MARGIN_CSS = ["margin-top", "margin-right", "margin-bottom", "margin-left"];

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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | null {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
  return null;
}

/** Values are plain data in design language. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The child of `el` that `node` is, or is in. */
function childIn(el: Element, node: Node): ChildNode {
  while (node.parentNode !== el) node = node.parentNode!;
  return node as ChildNode;
}

function targetOf(layer: Layer, instances: number): Target {
  const { loc, chain, component } = layer;
  const path: string[] = [];
  for (let l: Layer | null = layer; l; l = l.parent) path.unshift(l.name);
  // Text given an element of its own is written in its container.
  const written = layer.el.hasAttribute(WRAP_ATTR) && layer.el.parentElement ? layer.el.parentElement : layer.el;
  // Its words, to tell it apart once its markers move: text has them, containers do not count theirs, but a box of text, as a button is.
  const words = layer.kind === "text" ? (layer.text ? layer.name : wordsAsPage(layer.el)) : textOfBox(layer) ? wordsAsPage(layer.el) : "";
  const page = layer.el.ownerDocument.documentElement.getAttribute(PAGE_ATTR);
  const context = { path, element: openingTag(written), ...(words && { text: words.slice(0, SIGN_WORDS) }), ...(page && { page }) };
  // Text with no element of its own is found by which run of text of its container it is; all the text of a box, by the box's element.
  const wrapped = written !== layer.el ? Number(layer.el.getAttribute(WRAP_ATTR)) : null;
  const run = layer.text && !isWholeText(layer) ? layer.parent!.children.filter((child) => child.text).indexOf(layer) : layer.text ? null : wrapped;
  // A layer made this round is not in the source yet: the change that made it says where it goes.
  return {
    loc,
    chain,
    component,
    instances,
    locked: layer.kind === "locked",
    unlocated: !loc && !layer.made,
    ...(layer.made && { made: layer.made }),
    ...(run !== null && { run }),
    ...(layer.text && isWholeText(layer) && { boxText: true as const }),
    context,
  };
}

const MAX_CLASSES = 200;

/** `<div id="root" class="…">`: what of the element the Agent can search the source for. */
export function openingTag(el: Element): string {
  let tag = `<${el.localName}`;
  if (el.id) tag += ` id="${el.id}"`;
  const classes = el.getAttribute("class")?.trim();
  if (classes) tag += ` class="${classes.length > MAX_CLASSES ? `${classes.slice(0, MAX_CLASSES - 1)}…` : classes}"`;
  return `${tag}>`;
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
