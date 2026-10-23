/**
 * Edit commands: changes in design language, made to the canvas at once and
 * recorded in the ChangeSet. An edit to a layer is an edit to its usage, so
 * it shows up in every instance of that usage.
 */
import type { ChangeSet, Target } from "./changeset";
import type { Layer, LayerKind, LayerTree } from "./layers";
import { ORIGINAL_STYLE_ATTR, sourcesOf } from "./style-source";

/** A solid fill: a color as `#RRGGBB`, and its opacity from 0 to 1. */
export interface Fill {
  type: "solid";
  color: string;
  opacity: number;
}

/** Corner radius in px: one for all corners, or top-left, top-right, bottom-right, bottom-left. */
export type Radius = number | [number, number, number, number];

/** What the Design panel edits, by property. A fill of null: no fill. */
export interface PropertyValues {
  fill: Fill | null;
  radius: Radius;
}

export type Property = keyof PropertyValues;

export interface SetOptions {
  /** One more step of an adjustment under way (a drag on a number, a color being picked): undone with the steps before it. */
  continues?: boolean;
}

export interface Editor {
  /** Whether `property` can be edited on the layer. */
  can(layer: Layer, property: Property): boolean;
  /** The layer's current value. */
  read<P extends Property>(layer: Layer, property: P): PropertyValues[P];
  /** Changes the layer, across the instances of its usage, and records the change. It can be undone. */
  set<P extends Property>(layer: Layer, property: P, value: PropertyValues[P], options?: SetOptions): void;
  /** Takes back the latest edit not yet undone. Returns the layer it was made to; null when there is none. */
  undo(): Layer | null;
  /** Makes again the latest edit undone. Returns the layer it was made to; null when there is none. */
  redo(): Layer | null;
  /** Takes change `id` back out of the ChangeSet, its layer back to where it started, as an edit that can be undone. */
  revert(id: number): Layer | null;
}

/**
 * One edit, as undo and redo replay it: the layer it was made to, by id, so
 * it is found again however the layer tree changes meanwhile.
 */
interface Step {
  layer: string;
  /** Steps of one adjustment are one step: they are made to the same property of the same layer. */
  property: string;
  undo(): void;
  redo(): void;
}

/** Stamped on the canvas elements of a layer once it is edited: its identity in the ChangeSet. */
export const LAYER_ID_ATTR = "data-vk-layer";

interface Definition<P extends Property> {
  /** Layers the property applies to. Locked layers never get any. */
  kinds: LayerKind[];
  /** Further, whether the layer as it is now can take the property. */
  applies?(el: Element): boolean;
  read(el: Element, colors: ColorReader): PropertyValues[P];
  /** CSS declarations that show the value on the canvas: the same properties whatever the value, so each edit overrides the one before. */
  write(value: PropertyValues[P]): Record<string, string>;
  /** The CSS properties the value is read from, to find what sets them now. */
  sets: string[];
}

const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];

const PROPERTIES: { [P in Property]: Definition<P> } = {
  fill: {
    kinds: ["stack", "grid", "frame"],
    // A gradient or an image paints over the solid color. Those fills are edited elsewhere.
    applies: (el) => getComputedStyle(el).backgroundImage === "none",
    read: (el, colors) => colors.fill(getComputedStyle(el).backgroundColor),
    write: (fill) => ({ "background-color": fill ? cssColor(fill) : "transparent" }),
    sets: ["background-color"],
  },
  radius: {
    kinds: ["stack", "grid", "frame", "image", "still"],
    read: readRadius,
    write: (radius) => ({ "border-radius": typeof radius === "number" ? `${radius}px` : radius.map((r) => `${r}px`).join(" ") }),
    sets: CORNERS.map((corner) => `border-${corner}-radius`),
  },
};

/** `property` of an element as it is now, in design language: on the canvas, or on the live page. */
export function readValue<P extends Property>(el: Element, property: P): PropertyValues[P] {
  return PROPERTIES[property].read(el, colorReader(el.ownerDocument));
}

export function createEditor(tree: LayerTree, changes: ChangeSet): Editor {
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
    const definition = PROPERTIES[property];
    const before = definition.read(layer.el, colors);
    // A change keeps the source it started from: the cascade is walked once, not on each step of a drag.
    const known = layer.el.getAttribute(LAYER_ID_ATTR);
    const sources = known && changes.has(known, property) ? [] : sourcesOf(layer.el, definition.sets);
    const instances = tree.acrossInstances(layer);
    const declarations = definition.write(value);
    for (const instance of instances) {
      // Kept before the first edit: what sets a value is looked up in the page's own styles.
      if (!instance.el.hasAttribute(ORIGINAL_STYLE_ATTR)) instance.el.setAttribute(ORIGINAL_STYLE_ATTR, instance.el.getAttribute("style") ?? "");
      for (const name in declarations) (instance.el as HTMLElement).style.setProperty(name, declarations[name], "important");
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
    });
    // Back where it started: the page's own style again, as if never edited.
    if (!changes.has(id, property)) {
      const untouched = !changes.list().some((change) => change.layer === id);
      for (const instance of instances) restoreStyle(instance.el, property, untouched);
    }
    return id;
  };

  const past: Step[] = [];
  const future: Step[] = [];
  /** Replays a step's way, on the layer as it is now. */
  const replay = (step: Step, way: "undo" | "redo") => {
    step[way]();
    return layerById(step.layer);
  };

  const editor: Editor = {
    can(layer, property) {
      const { kinds, applies } = PROPERTIES[property];
      return !layer.text && kinds.includes(layer.kind) && (!applies || applies(layer.el));
    },
    read: (layer, property) => PROPERTIES[property].read(layer.el, colors),
    set(layer, property, value, { continues = false } = {}) {
      if (!editor.can(layer, property)) throw new Error(`Vernier Kit: ${property} cannot be edited on a ${layer.kind} layer`);
      const before = editor.read(layer, property);
      if (same(before, value)) return;
      const id = apply(layer, property, value);
      const to = (v: PropertyValues[typeof property]) => () => {
        const target = layerById(id);
        if (target) apply(target, property, v);
      };
      future.length = 0;
      const last = past.at(-1);
      if (continues && last?.layer === id && last.property === property) last.redo = to(value);
      else past.push({ layer: id, property, undo: to(before), redo: to(value) });
    },
    undo() {
      const step = past.pop();
      if (!step) return null;
      future.push(step);
      return replay(step, "undo");
    },
    redo() {
      const step = future.pop();
      if (!step) return null;
      past.push(step);
      return replay(step, "redo");
    },
    revert(id) {
      const change = changes.list().find((c) => c.id === id);
      const layer = change && layerById(change.layer);
      if (!change || !layer) return null;
      editor.set(layer, change.property as Property, change.before as PropertyValues[Property]);
      return layer;
    },
  };
  return editor;
}

/**
 * Puts back the page's own declarations of `property` on an element, as its
 * style attribute had them before the first edit. `untouched`: no edit is left
 * on the element, so the whole attribute goes back as it was.
 */
export function restoreStyle<P extends Property>(el: Element, property: P, untouched = false) {
  const original = el.getAttribute(ORIGINAL_STYLE_ATTR);
  if (original === null) return;
  if (untouched) {
    if (original) el.setAttribute("style", original);
    else el.removeAttribute("style");
    return;
  }
  const { write, sets }: Definition<P> = PROPERTIES[property];
  const style = (el as HTMLElement).style;
  const page = el.ownerDocument.createElement("div").style;
  page.cssText = original;
  for (const name of [...Object.keys(write(defaults[property])), ...sets]) style.removeProperty(name);
  for (const name of sets) {
    const value = page.getPropertyValue(name);
    if (value) style.setProperty(name, value, page.getPropertyPriority(name));
  }
}

/** Any value of each property: what it writes names the CSS properties it sets. */
const defaults: PropertyValues = { fill: null, radius: 0 };

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
