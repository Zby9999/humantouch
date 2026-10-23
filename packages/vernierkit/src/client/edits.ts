/**
 * Edit commands: changes in design language, made to the canvas at once and
 * recorded in the ChangeSet. An edit to a layer is an edit to its usage, so
 * it shows up in every instance of that usage. Every edit can be undone.
 */
import { AS_STACK_ATTR, declare, keepOriginal, LAYER_ID_ATTR, restoreStyle } from "./canvas-style";
import { MOVE, type Change, type ChangeSet, type Place, type Target } from "./changeset";
import { buildLayerTree, type Layer, type LayerKind, type LayerTree } from "./layers";
import { relocate, slotsOf } from "./moves";
import { PIN_OFFSET_ATTR, pinnedOf, sourcesOf } from "./style-source";

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
}

/**
 * One edit, as undo and redo replay it: the layers it was made to, by id, so
 * they are found again however the layer tree changes meanwhile.
 */
interface Step {
  layers: string[];
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

export function createEditor(initialTree: LayerTree, changes: ChangeSet): Editor {
  let tree = initialTree;
  const doc = tree.root.el.ownerDocument;
  const colors = colorReader(doc);
  let lastId = 0;
  for (const el of doc.querySelectorAll(`[${LAYER_ID_ATTR}]`)) lastId = Math.max(lastId, Number(el.getAttribute(LAYER_ID_ATTR)) || 0);

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
    const before = definition.read(layer.el, colors);
    // A change keeps the source it started from: the cascade is walked once, not on each step of a drag.
    const known = layer.el.getAttribute(LAYER_ID_ATTR);
    const sources = known && changes.has(known, property) ? [] : sourcesOf(layer.el, definition.sets);
    const instances = tree.acrossInstances(layer);
    // A plain flow shown as a vertical Stack takes a Stack's property as a real Stack, laid out as it is now.
    const asStack = definition.stack && (layer.el.hasAttribute(AS_STACK_ATTR) || !stackOf(layer.el).flex);
    const declarations = {
      ...(asStack && { display: "flex", "flex-direction": stackOf(layer.el).direction === "horizontal" ? "row" : "column" }),
      ...definition.write(value, layer.el),
    };
    for (const instance of instances) {
      keepOriginal(instance.el);
      if (asStack) instance.el.setAttribute(AS_STACK_ATTR, "");
      declare(instance.el, declarations);
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
      const others = changes.list().filter((change) => change.layer === id);
      for (const instance of instances) restoreStyle(instance.el, cssOf(property), others);
    }
    return id;
  };

  const past: Step[] = [];
  const future: Step[] = [];
  /** Steps of the batch under way, if any. */
  let batching: Step[] | null = null;
  const push = (step: Step, continues: boolean) => {
    if (batching) {
      batching.push(step);
      return;
    }
    future.length = 0;
    const last = past.at(-1);
    if (continues && last?.key === step.key) last.redo = step.redo;
    else past.push(step);
  };
  /** The layers a step was made to, as they are now. */
  const layersOf = (step: Step) => [...new Set(step.layers)].map(layerById).filter((layer) => layer !== null);

  /** An edit that can be undone. `from`: the value it changes, when the canvas cannot tell (on a hidden layer, say). */
  const edit = <P extends Property>(layer: Layer, property: P, value: PropertyValues[P], continues: boolean, from?: PropertyValues[P]) => {
    const before = from === undefined ? PROPERTIES[property].read(layer.el, colors) : from;
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
    const slot = next ? nodes.indexOf(next.text ? next.text.find((node) => node.textContent!.trim())! : next.el) : nodes.length;
    return { container, nth: to.index + 1, slot, absolute: null };
  };

  /** Gives loose text an element of its own, in each instance: a `<span>`. Returns the layer it now is. */
  const wrap = (layer: Layer): Layer => {
    const runs = tree.acrossInstances(layer);
    const spans = runs.map((run) => {
      const span = doc.createElement("span");
      run.text![0].before(span);
      span.append(...run.text!);
      return span;
    });
    const id = String(++lastId);
    for (const span of spans) span.setAttribute(LAYER_ID_ATTR, id);
    tree = buildLayerTree(doc);
    return tree.layerOf(spans[runs.indexOf(layer)])!;
  };

  /** A move that can be undone. `start`: where the layer was before any move, where its own style is enough. */
  const moveStep = (id: string, from: Place, to: Place, start: Place, size: Record<string, string>, record: MoveRecord) => {
    const styleAt = (place: Place): Record<string, string> => {
      if (same(place, start)) return {};
      if (place.absolute) return { position: "absolute", left: `${place.absolute.x}px`, top: `${place.absolute.y}px`, right: "auto", bottom: "auto", ...size };
      // An absolute layer put into a layout leaves its own position.
      return start.absolute ? { position: "static" } : {};
    };
    moveTo(id, from, to, styleAt(to), record);
    push(
      {
        layers: [id],
        key: `${id} ${MOVE}`,
        undo: () => moveTo(id, to, from, styleAt(from), record),
        redo: () => moveTo(id, from, to, styleAt(to), record),
      },
      false,
    );
  };

  /** Puts a moved layer at `to`, on the canvas and in the ChangeSet, and builds the layers anew. */
  const moveTo = (id: string, from: Place, to: Place, style: Record<string, string>, record: MoveRecord) => {
    changes.record(id, { ...record, before: from, after: to, style });
    relocate(doc, id, from, to, style, changes.list());
    tree = buildLayerTree(doc);
  };

  const editor: Editor = {
    tree: () => tree,
    canMove: (layer) => layer.parent !== null,
    canDrop(layer, container) {
      if (!editor.canMove(layer) || !["stack", "frame"].includes(container.kind)) return false;
      for (let c: Layer | null = container; c; c = c.parent) if (c === layer) return false;
      return tree.acrossInstances(container).length === tree.acrossInstances(layer.parent!).length;
    },
    move(layer, to) {
      if (!editor.canDrop(layer, to.parent)) throw new Error(`Vernier Kit: ${layer.name} cannot go into ${to.parent.name}`);
      // Absolute already, and staying in its container: only its position changes, as X and Y do.
      if ("x" in to && layer.absolute && !layer.text && to.parent === layer.parent) {
        const [dx, dy] = (layer.el.getAttribute(PIN_OFFSET_ATTR) ?? "0 0").split(" ").map(Number);
        editor.batch(() => {
          editor.set(layer, "x", round(to.x - dx));
          editor.set(layer, "y", round(to.y - dy));
        });
        return layer;
      }
      const target = targetOf(layer, tree.acrossInstances(layer).length);
      const loop = isLoop(tree.acrossInstances(layer));
      const text = !!layer.text;
      if (text) layer = wrap(layer);
      const id = idOf(layer, tree.acrossInstances(layer));
      const from = placeOf(layer);
      const after = placeAt(layer, to);
      if (same(from, after)) return layer;
      const earlier = changes.list().find((change) => change.layer === id && change.property === MOVE);
      const record: MoveRecord = { kind: "move", target, scope: "usage", property: MOVE, sources: [], ...(loop && { data: true }), ...(text && { wrap: true }) };
      moveStep(id, from, after, (earlier?.before as Place | undefined) ?? from, sizeOf(layer.el), record);
      return layerById(id) ?? layer;
    },
    can(layer, property, value) {
      const { kinds, applies, accepts }: Definition<PropertyValues[typeof property]> = PROPERTIES[property];
      if (layer.text || !kinds.includes(layer.kind)) return false;
      // A hidden layer can only be shown again.
      if (property !== "visible" && getComputedStyle(layer.el).display === "none") return false;
      return (!applies || applies(layer.el)) && (value === undefined || !accepts || accepts(layer.el, value));
    },
    read: (layer, property) => PROPERTIES[property].read(layer.el, colors),
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
      return layersOf(step);
    },
    redo() {
      const step = future.pop();
      if (!step) return [];
      past.push(step);
      step.redo();
      return layersOf(step);
    },
    revert(id) {
      const change = changes.list().find((c) => c.id === id);
      const layer = change && layerById(change.layer);
      if (!change || !layer) return null;
      if (change.kind === "move") {
        const { kind, target, scope, property, data, wrap } = change;
        const record: MoveRecord = { kind, target, scope, property, sources: [], ...(data && { data }), ...(wrap && { wrap }) };
        moveStep(change.layer, change.after as Place, change.before as Place, change.before as Place, sizeOf(layer.el), record);
        return layerById(change.layer);
      }
      // Whatever the layer offers now (a hidden one offers only Visible), a change of its own can always go.
      edit(layer, change.property as Property, change.before as PropertyValues[Property], false, change.after as PropertyValues[Property]);
      return layer;
    },
  };
  return editor;
}

/** What a move records besides where the layer was and is. */
type MoveRecord = Omit<Parameters<ChangeSet["record"]>[1], "before" | "after" | "style">;

/** An element's size as CSS sets it now: what keeps it as large once it is absolute. */
function sizeOf(el: Element): Record<string, string> {
  const style = getComputedStyle(el);
  return { width: `${round(parseFloat(style.width))}px`, height: `${round(parseFloat(style.height))}px` };
}

/** Instances a loop renders: several, side by side in one container. */
function isLoop(instances: Layer[]): boolean {
  return instances.length > 1 && instances.every((instance) => instance.el.parentElement === instances[0].el.parentElement);
}

/** The CSS properties a property may declare, and the ones it is read from: what taking it off the canvas puts back. */
export function cssOf(property: Property): string[] {
  const { writes, sets, stack }: Definition<PropertyValues[typeof property]> = PROPERTIES[property];
  return [...writes, ...sets, ...(stack ? ["display", "flex-direction"] : [])];
}

/**
 * The automatic layout an element lays its children out in, as the layer
 * model has it: a flex container, or a plain flow, top to bottom.
 */
function stackOf(el: Element): { direction: "horizontal" | "vertical"; flex: boolean } {
  const style = getComputedStyle(el);
  if (/flex$/.test(style.display)) return { direction: style.flexDirection.startsWith("row") ? "horizontal" : "vertical", flex: true };
  return { direction: "vertical", flex: false };
}

/** Block-level displays a plain flow lays out top to bottom. */
const FLOW = /^(block|flow-root|list-item)$/;

/** The Stack `el` is laid out in, if it is: in its parent's flex layout, or down its plain flow. Absolute layers are in none. */
function stackAround(el: Element): { direction: "horizontal" | "vertical"; flex: boolean } | null {
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
  const [source] = sourcesOf(el, [property]);
  return source.declaration ? source.declaration.slice(source.declaration.indexOf(":") + 1).trim() : "auto";
}

/** An absolute layer's place along one axis: where its edge is from its parent's, as CSS sets it. */
function position(start: "left" | "top", end: "right" | "bottom", axis: 0 | 1): Definition<number> {
  return {
    kinds: EVERY_KIND,
    applies: absolute,
    // Where the freezer pinned it, it was shifted with the page's scroll: shifted back, it reads as the page has it.
    read: (el) => round(parseFloat(getComputedStyle(el).getPropertyValue(start)) - Number((el.getAttribute(PIN_OFFSET_ATTR) ?? "0 0").split(" ")[axis])),
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

/** The value the page itself declares for `property`, edits aside: empty when nothing does. */
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
  const context = { path, element: openingTag(layer.el) };
  return { loc, chain, component, instances, locked: layer.kind === "locked", unlocated: !loc, context };
}

const MAX_CLASSES = 200;

/** `<div id="root" class="…">`: what of the element the Agent can search the source for. */
function openingTag(el: Element): string {
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
