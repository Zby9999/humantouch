/**
 * Edit commands: changes in design language, made to the canvas at once and
 * recorded in the ChangeSet. An edit to a layer is an edit to its usage, so
 * it shows up in every instance of that usage, and in every view of the
 * canvas. Every edit can be undone.
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import {
  AS_STACK_ATTR,
  BRIEF_ATTR,
  changesOn,
  declare,
  DELETED_ATTR,
  elementsOf,
  keepOriginal,
  LAYER_ID_ATTR,
  MADE_ATTR,
  MOVE_ATTR,
  REFERENCE_ATTR,
  restoreStyle,
  TEXT_ATTR,
  WRAP_ATTR,
} from "./canvas-style";
import {
  madeBy,
  MOVE,
  withDependents,
  type Change,
  type ChangeSet,
  type Composed,
  type Created,
  type Dissolved,
  type Place,
  type StackSettings,
  type Target,
} from "./changeset";
import { PAGE_ATTR } from "./freezer";
import { hide, insertCopies, insertNew, removeMade, unhide, wordsOf, writeText } from "./layer-changes";
import { boxOf, buildLayerTree, holdsLayers, nodeOf, SIGN_WORDS, wordsAsPage, type Layer, type LayerKind, type LayerTree } from "./layers";
import { relocate, slotsOf, syncOrders } from "./moves";
import { borderBox, compose, decompose, dissolve, inferStack, marginsOf, paddingBox, spotIn, stackStyle, undissolve } from "./stacks";
import { ORIGINAL_STYLE_ATTR, PIN_OFFSET_ATTR, pinnedOf, pinOffsetOf, sourcesOf } from "./style-source";
import { CHAIN_ATTR } from "./usage-chain";
import type { Views } from "./views";

export { LAYER_ID_ATTR };

/** A solid fill: a color as `#RRGGBB`, and its opacity from 0 to 1. */
export interface Fill {
  type: "solid";
  color: string;
  opacity: number;
}

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
export interface PropertyValues {
  fill: Fill | null;
  radius: Radius;
  /** An absolute layer's place in its parent, in px. */
  x: number;
  y: number;
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
}

export interface Editor {
  /** Whether `property` can be edited on the layer; with `value`, whether the layer can take that value. */
  can<P extends Property>(layer: Layer, property: P, value?: PropertyValues[P]): boolean;
  /** The layer's current value. */
  read<P extends Property>(layer: Layer, property: P): PropertyValues[P];
  /** Changes the layer, across the instances of its usage, and records the change. It can be undone. */
  set<P extends Property>(layer: Layer, property: P, value: PropertyValues[P], options?: SetOptions): void;
  /** Makes the edits `edits` makes one step, undone and redone together: the same change to several layers. */
  batch(edits: () => void, options?: SetOptions): void;
  /** Where the layer is on the canvas, in canvas px; for a hidden layer, where it is when shown. */
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
   * Whether the layer can go into `container`: a Stack or a Frame, outside
   * the layer itself, that repeats with the layer's own container (each
   * instance of the layer has a container to go to).
   */
  canDrop(layer: Layer, container: Layer): boolean;
  /**
   * Moves the layer, across the instances of its container, and records the
   * move: one per layer, from where it was to where it is. Loose text first
   * gets an element of its own. Returns the layer where it is now.
   */
  move(layer: Layer, to: Destination): Layer;
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
  /** Whether new layers can go in the layer: a Stack or a Frame that holds layers. */
  canHold(layer: Layer): boolean;
  /**
   * Makes new text (in the page's body text style) or a new Frame (with no
   * fill) at `to`, in each instance of its container. `size`: as drawn, in px;
   * without it, text fits its words and a Frame is 100 × 100. Returns the new layer, in the container `to` names.
   */
  create(type: Created["type"], to: Destination, size?: { width: number; height: number }): Layer;
  /** A new Frame's brief; null for any other layer. */
  brief(layer: Layer): string | null;
  /** Gives a new Frame a brief: what the Agent is to make in it. */
  setBrief(layer: Layer, brief: string): void;
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
   */
  remove(layer: Layer): void;
  /** Whether the layer can be copied: not the page, not text with no element of its own. */
  canDuplicate(layer: Layer): boolean;
  /**
   * Copies the layer, in every instance: right after it, or at `to` (as a move
   * goes, among the other layers). One of the instances a loop renders is
   * copied alone, as data. Returns the copy.
   */
  duplicate(layer: Layer, to?: Destination): Layer;
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
  undo(): void;
  redo(): void;
}


interface Definition<V> {
  /** Layers the property applies to. */
  kinds: LayerKind[];
  /** Further, whether the layer as it is now can take the property. */
  applies?(el: Element): boolean;
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
  /** A Stack's own property: on a plain top-to-bottom flow, writing it makes the flow a real Stack. */
  stack?: true;
}

const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
const SIDES = ["top", "right", "bottom", "left"];
const EVERY_KIND: LayerKind[] = ["stack", "grid", "frame", "text", "image", "still", "locked"];
/** Locked layers are moved and resized as a whole, and nothing else. */
const UNLOCKED: LayerKind[] = EVERY_KIND.filter((kind) => kind !== "locked");
const CONTAINERS: LayerKind[] = ["stack", "grid", "frame"];
/** Width and height do not apply to inline boxes. */
const sized = (el: Element) => !/^(inline|contents)$/.test(getComputedStyle(el).display);
const absolute = (el: Element) => /^(absolute|fixed)$/.test(getComputedStyle(el).position);

const PROPERTIES: { [P in Property]: Definition<PropertyValues[P]> } = {
  fill: {
    kinds: CONTAINERS,
    // A gradient or an image paints over the solid color. Those fills are edited elsewhere.
    applies: (el) => getComputedStyle(el).backgroundImage === "none",
    read: (el, colors) => colors.fill(getComputedStyle(el).backgroundColor),
    write: (fill) => ({ "background-color": fill ? cssColor(fill) : "transparent" }),
    writes: ["background-color"],
    sets: ["background-color"],
  },
  radius: {
    kinds: ["stack", "grid", "frame", "image", "still"],
    read: readRadius,
    write: (radius) => ({ "border-radius": typeof radius === "number" ? `${radius}px` : radius.map((r) => `${r}px`).join(" ") }),
    writes: ["border-radius"],
    sets: CORNERS.map((corner) => `border-${corner}-radius`),
  },
  x: position("left", "right", 0),
  y: position("top", "bottom", 1),
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
    kinds: ["stack"],
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
};

/** `property` of an element as it is now, in design language: on the canvas, or on the live page. */
export function readValue<P extends Property>(el: Element, property: P): PropertyValues[P] {
  return PROPERTIES[property].read(el, colorReader(el.ownerDocument));
}

/** Edits the canvas `views` show, every view alike, recording each change in `changes`. */
export function createEditor(views: Views, changes: ChangeSet): Editor {
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

  /** The edit itself: on the canvas and in the ChangeSet. */
  const apply = <P extends Property>(layer: Layer, property: P, value: PropertyValues[P]) => {
    const definition: Definition<PropertyValues[P]> = PROPERTIES[property];
    const before = readAsShown(layer.el, property, colors);
    // A change keeps the source it started from: the cascade is walked once, not on each step of a drag.
    const known = layer.el.getAttribute(LAYER_ID_ATTR);
    // A layer made this round has no style of the page's to change.
    const sources = layer.made || (known && changes.has(known, property)) ? [] : sourcesOf(layer.el, definition.sets);
    const instances = tree.acrossInstances(layer);
    // A plain flow shown as a vertical Stack takes a Stack's property as a real Stack, laid out as it is now.
    const asStack = definition.stack && (layer.el.hasAttribute(AS_STACK_ATTR) || !asShown(layer.el, () => stackOf(layer.el).flex));
    const declarations = asShown(layer.el, () => ({
      ...(asStack && { display: "flex", "flex-direction": stackOf(layer.el).direction === "horizontal" ? "row" : "column" }),
      ...definition.write(value, layer.el),
    }));
    for (const instance of instances) {
      keepOriginal(instance.el);
      if (asStack) instance.el.setAttribute(AS_STACK_ATTR, "");
      declare(instance.el, declarations);
      // Hidden by the designer, it stays hidden whatever else changes.
      if (property !== "visible" && known && changes.has(known, "visible")) declare(instance.el, { display: "none" });
    }
    const id = idOf(layer, instances);
    changes.record(id, {
      target: targetOf(layer, instances.length),
      scope: "usage",
      property,
      before,
      after: value,
      style: declarations,
      sources,
      ...(asStack && { asStack: true }),
    });
    // Back where it started: the page's own style again, the layer's other changes kept on.
    if (!changes.has(id, property)) {
      const others = changesOn(id, changes.list());
      for (const instance of instances) restoreStyle(instance.el, cssOf(property), others);
    }
    // A Stack now laid out the other way: the layers are built anew, so a drag into it reads the way it runs now.
    if (layer.kind === "stack" && stackOf(layer.el).direction !== layer.direction) tree = buildLayerTree(doc);
    return id;
  };

  const past: Step[] = [];
  const future: Step[] = [];
  /** Steps of the batch under way, if any. */
  let batching: Step[] | null = null;
  /** What the canvas has now, shown in every view at once: once an edit is made, not at each step of a batch. */
  const show = () => {
    if (!batching) views.sync();
  };
  const push = (step: Step, continues: boolean) => {
    if (batching) {
      batching.push(step);
      return;
    }
    future.length = 0;
    const last = past.at(-1);
    if (continues && last?.key === step.key) last.redo = step.redo;
    else past.push(step);
    show();
  };
  /** The layers a step was made to, as they are now. */
  const layersOf = (ids: string[]) => [...new Set(ids)].map(layerById).filter((layer) => layer !== null);

  /** An edit that can be undone. `from`: the value it changes, when the canvas cannot tell (on a hidden layer, say). */
  const edit = <P extends Property>(layer: Layer, property: P, value: PropertyValues[P], continues: boolean, from?: PropertyValues[P]) => {
    const before = from === undefined ? readAsShown(layer.el, property, colors) : from;
    if (same(before, value)) return;
    const id = apply(layer, property, value);
    const to = (v: PropertyValues[P]) => () => {
      const target = layerById(id);
      if (target) apply(target, property, v);
    };
    push({ layers: [id], key: `${id} ${property}`, undo: to(before), redo: to(value) }, continues);
  };

  /**
   * The layer's place now. Its `slot` is where it would go back to with the
   * layer itself taken out first, as a move takes it out before putting it in.
   */
  const placeOf = (layer: Layer): Place => {
    const parent = layer.parent!;
    const container = { layer: idOf(parent, tree.acrossInstances(parent)), target: targetOf(parent, tree.acrossInstances(parent).length) };
    const absolute = layer.absolute ? { x: PROPERTIES.x.read(layer.el, colors), y: PROPERTIES.y.read(layer.el, colors) } : null;
    return { container, nth: parent.children.indexOf(layer) + 1, slot: slotsOf(parent.el).indexOf(layer.el), absolute };
  };

  /** The layer's place at `to`, worked out before it moves. */
  const placeAt = (layer: Layer, to: Destination): Place => {
    const parent = to.parent;
    const container = { layer: idOf(parent, tree.acrossInstances(parent)), target: targetOf(parent, tree.acrossInstances(parent).length) };
    const others = parent.children.filter((child) => child !== layer);
    const nodes = slotsOf(parent.el).filter((node) => node !== layer.el);
    if ("x" in to) return { container, nth: others.length + 1, slot: nodes.length, absolute: { x: round(to.x), y: round(to.y) } };
    const next = others[to.index];
    const slot = next ? nodes.indexOf(nodeOf(next)) : nodes.length;
    return { container, nth: to.index + 1, slot, absolute: null };
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
      text.text![0].before(span);
      span.append(...text.text!);
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
    const container = (record.kind === "create" ? (record.after as Created).place : (record.after as Place)).container.layer;
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

  /** Takes one change back out, as an edit that can be undone. Returns its layer as it is then. */
  const revertOne = (change: Change): Layer | null => {
    if (change.kind === "delete") {
      // Deleted, it is no layer: its elements are found by the change.
      const { id: _, layer: id, ...record } = change;
      const els = elementsOf(doc, id).filter((el) => el.getAttribute(DELETED_ATTR) === change.property);
      const { make, bringBack } = deleting(id, record, els);
      structural([id], [id], bringBack, make);
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
    if (change.kind === "create" || change.kind === "duplicate") {
      const container = layer.parent!;
      const { make, takeOff } = madeLayer(id, record, () => {});
      structural([container.el.getAttribute(LAYER_ID_ATTR) ?? id], [id], takeOff, make);
      return tree.layerOf(container.el);
    }
    if (change.kind === "text") {
      structural([id], [id], words(id, record, null), words(id, record, change.after as string));
      return layerById(id);
    }
    // Whatever the layer offers now (a hidden one offers only Visible), a change of its own can always go.
    edit(layer, change.property as Property, change.before as PropertyValues[Property], false, change.after as PropertyValues[Property]);
    return layer;
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

  /** Puts a moved layer at `to`, on the canvas and in the ChangeSet, and builds the layers anew. */
  const moveTo = (id: string, from: Place, to: Place, style: Record<string, string>, record: MoveRecord) => {
    changes.record(id, { ...record, before: from, after: to, style });
    relocate(doc, id, record.property, from, to, style, changes.list());
    syncOrders(doc, changes);
    tree = buildLayerTree(doc);
  };

  const editor: Editor = {
    tree: () => tree,
    canMove: (layer) => layer.parent !== null,
    canDrop(layer, container) {
      if (!editor.canMove(layer) || !["stack", "frame"].includes(container.kind)) return false;
      // Pinned where the designer saw it, against a window the canvas has none of: it stays in its container.
      if (!layer.text && layer.el.hasAttribute(PIN_OFFSET_ATTR) && container !== layer.parent) return false;
      for (let c: Layer | null = container; c; c = c.parent) if (c === layer) return false;
      return tree.acrossInstances(container).length === tree.acrossInstances(layer.parent!).length;
    },
    move(layer, to) {
      if (!editor.canDrop(layer, to.parent)) throw new Error(`Vernier Kit: ${layer.name} cannot go into ${to.parent.name}`);
      // Absolute as the page has it, and staying in its container: only its position changes, as X and Y do.
      const moved = !layer.text && layer.el.hasAttribute(MOVE_ATTR);
      if ("x" in to && layer.absolute && !layer.text && !moved && to.parent === layer.parent) {
        const [dx, dy] = pinOffsetOf(layer.el);
        editor.batch(() => {
          editor.set(layer, "x", round(to.x - dx));
          editor.set(layer, "y", round(to.y - dy));
        });
        return layer;
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
    can(layer, property, value) {
      const { kinds, applies, accepts }: Definition<PropertyValues[typeof property]> = PROPERTIES[property];
      if (layer.text || !kinds.includes(layer.kind)) return false;
      // A hidden layer offers what it does when shown, so the panel stays as it was.
      return asShown(layer.el, () => (!applies || applies(layer.el)) && (value === undefined || !accepts || accepts(layer.el, value)));
    },
    read: (layer, property) => readAsShown(layer.el, property, colors),
    measure: (layer) => asShown(layer.el, () => boxOf(layer)),
    set(layer, property, value, { continues = false } = {}) {
      if (!editor.can(layer, property, value)) throw new Error(`Vernier Kit: ${property} cannot be set to ${JSON.stringify(value)} on a ${layer.kind} layer`);
      edit(layer, property, value, continues);
    },
    batch(edits, { continues = false } = {}) {
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
          key: steps.map((step) => step.key).join(", "),
          undo: () => [...steps].reverse().forEach((step) => step.undo()),
          redo: () => steps.forEach((step) => step.redo()),
        },
        continues,
      );
    },
    undo() {
      const step = past.pop();
      if (!step) return [];
      future.push(step);
      step.undo();
      show();
      return layersOf(step.back ?? step.layers);
    },
    redo() {
      const step = future.pop();
      if (!step) return [];
      past.push(step);
      step.redo();
      show();
      return layersOf(step.layers);
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
      const sources = ordered.flatMap((member, i) => (margins[i].some((m) => m) ? sourcesOf(member.el, MARGIN_CSS) : []));
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
      const group = layer.el;
      const container = layer.parent!.el;
      // In its container's layout, its layers in its layout take its place; any other stays where it is, absolute.
      const inLayout = layer.children.map((child) => layer.parent!.kind === "stack" && !layer.absolute && !child.absolute);
      const index = layer.parent!.children.indexOf(layer);
      const spots = els.map((el) => spotIn(el, container));
      editor.batch(() => {
        let n = 0;
        els.forEach((el, i) => {
          const parent = tree.layerOf(container)!;
          editor.move(tree.layerOf(el)!, inLayout[i] ? { parent, index: index + n++ } : { parent, ...spots[i] });
        });
        editor.remove(tree.layerOf(group)!);
      });
      return found();
    },
    canHold: (layer) => holdsLayers(layer),
    create(type, to, size) {
      const container = to.parent;
      if (!editor.canHold(container)) throw new Error(`Vernier Kit: nothing can go into ${container.name}`);
      const count = tree.acrossInstances(container).length;
      const containerId = idOf(container, tree.acrossInstances(container));
      const slots = slotsOf(container.el);
      const where = { layer: containerId, target: targetOf(container, count) };
      let place: Place;
      if ("x" in to) place = { container: where, nth: container.children.length + 1, slot: slots.length, absolute: { x: round(to.x), y: round(to.y) } };
      else {
        const next = container.children[to.index];
        place = { container: where, nth: to.index + 1, slot: next ? slots.indexOf(nodeOf(next)) : slots.length, absolute: null };
      }
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
      const record: StructureRecord = { kind: "create", target: targetOf(container, count), scope: "usage", property: "new", before: null, after: created, style, sources: [] };
      const { make, takeOff } = madeLayer(id, record, () => {
        changes.record(id, record);
        insertNew(doc, id, created, style);
      });
      structural([id], [containerId], make, takeOff);
      return tree.layerOf([...container.el.children].find((el) => el.getAttribute(LAYER_ID_ATTR) === id)!)!;
    },
    brief(layer) {
      const maker = makerOf(layer.el.getAttribute(LAYER_ID_ATTR) ?? "");
      return maker?.kind === "create" && (maker.after as Created).type === "frame" ? ((maker.after as Created).brief ?? "") : null;
    },
    setBrief(layer, brief) {
      const id = layer.el.getAttribute(LAYER_ID_ATTR)!;
      const maker = makerOf(id);
      const before = editor.brief(layer);
      if (!maker || before === null || before === brief) return;
      const { id: _, layer: __, ...record } = maker;
      const to = (text: string) => () => {
        changes.record(id, { ...record, after: { ...(maker.after as Created), brief: text || undefined } });
        for (const el of elementsOf(doc, id)) {
          if (text) el.setAttribute(BRIEF_ATTR, text);
          else el.removeAttribute(BRIEF_ATTR);
        }
      };
      structural([id], [id], to(brief), to(before));
    },
    ownElement: (layer) => (layer.text ? wrap(layer) : layer),
    setText(layer, text) {
      const own = editor.ownElement(layer);
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
    remove(layer) {
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
      const record: StructureRecord = { kind: "duplicate", target: targetOf(layer, onPage(layer).length), scope: "usage", property: "copy", before: from, after: place, style, sources: [], ...(loop && { data: true }) };
      const originals = (loop ? [layer] : instances).map((instance) => instance.el);
      const { make, takeOff } = madeLayer(id, record, () => {
        changes.record(id, record);
        insertCopies(originals, containers.map((container) => container.el), id, place, style);
      });
      structural([id], [layer.el.getAttribute(LAYER_ID_ATTR)!], make, takeOff);
      const at = containers[loop ? 0 : instances.indexOf(layer)].el;
      return tree.layerOf([...at.children].find((el) => el.getAttribute(LAYER_ID_ATTR) === id)!)!;
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
        sources: sourcesOf(layer.el, ["display", "flex-direction"]),
      };
      structural([id], [id], stackOn(id, record), stackOff(id, record));
      return layerById(id)!;
    },
  };
  return editor;
}

/**
 * Runs `look` on an element as if shown: a layer the designer hid is read and
 * measured as it is laid out when visible. It is shown and hidden again in one
 * go, so nothing of it is ever painted.
 */
function asShown<T>(el: Element, look: () => T): T {
  const style = (el as HTMLElement).style;
  if (style.getPropertyValue("display") !== "none" || style.getPropertyPriority("display") !== "important") return look();
  // Its display as it is when shown: a real Stack an edit made it, or the page's own.
  const page = el.ownerDocument.createElement("div").style;
  page.cssText = el.getAttribute(ORIGINAL_STYLE_ATTR) ?? "";
  const display = el.hasAttribute(AS_STACK_ATTR) ? "flex" : page.getPropertyValue("display");
  if (display) style.setProperty("display", display, "important");
  else style.removeProperty("display");
  try {
    return look();
  } finally {
    style.setProperty("display", "none", "important");
  }
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
function along(stack: { direction: "horizontal" | "vertical" }, axis: "width" | "height"): boolean {
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
      return !!stack && (stack.flex || !along(stack, axis));
    },
    read(el) {
      const style = getComputedStyle(el);
      const stack = stackAround(el);
      const main = !!stack && along(stack, axis);
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
      if (stack?.flex && along(stack, axis)) {
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
  const inline = (el as HTMLElement).style;
  // Edits are important declarations in the style attribute; what the freezer pinned is not the page's.
  if (inline.getPropertyPriority(property) === "important" && !pinnedOf(el).includes(property)) return inline.getPropertyValue(property);
  return pageValue(el, property) || "auto";
}

/** An absolute layer's place along one axis: where its edge is from its parent's, as CSS sets it. */
function position(start: "left" | "top", end: "right" | "bottom", axis: 0 | 1): Definition<number> {
  return {
    kinds: EVERY_KIND,
    applies: absolute,
    // Where the freezer pinned it, it was shifted with the page's scroll: shifted back, it reads as the page has it.
    read: (el) => round(parseFloat(getComputedStyle(el).getPropertyValue(start)) - pinOffsetOf(el)[axis]),
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

function targetOf(layer: Layer, instances: number): Target {
  const { loc, chain, component } = layer;
  const path: string[] = [];
  for (let l: Layer | null = layer; l; l = l.parent) path.unshift(l.name);
  // Text given an element of its own is written in its container.
  const written = layer.el.hasAttribute(WRAP_ATTR) && layer.el.parentElement ? layer.el.parentElement : layer.el;
  // Its words, to tell it apart once its markers move: text has them, containers do not count theirs.
  const words = layer.kind === "text" ? (layer.text ? layer.name : wordsAsPage(layer.el)) : "";
  const page = layer.el.ownerDocument.documentElement.getAttribute(PAGE_ATTR);
  const context = { path, element: openingTag(written), ...(words && { text: words.slice(0, SIGN_WORDS) }), ...(page && { page }) };
  // Text with no element of its own is found by which run of text of its container it is.
  const wrapped = written !== layer.el ? Number(layer.el.getAttribute(WRAP_ATTR)) : null;
  const run = layer.text ? layer.parent!.children.filter((child) => child.text).indexOf(layer) : wrapped;
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

interface ColorReader {
  /** Any CSS color (oklch included) as a fill in sRGB; null when fully transparent. */
  fill(css: string): Fill | null;
}

/** Reads colors back by painting them: the one way that handles every CSS color space. */
function colorReader(doc: Document): ColorReader {
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const paint = (css: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data;
  };
  return {
    fill(css) {
      const alpha = paint(css)[3];
      if (alpha === 0) return null;
      // Painted opaque: a see-through color loses precision to premultiplied alpha.
      const [r, g, b] = paint(`rgb(from ${css} r g b / 1)`);
      const color = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
      return { type: "solid", color, opacity: Math.round((alpha / 255) * 100) / 100 };
    },
  };
}

function cssColor({ color, opacity }: Fill): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / ${opacity})`;
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
