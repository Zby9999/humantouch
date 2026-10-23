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

export interface Editor {
  /** Whether `property` can be edited on the layer. */
  can(layer: Layer, property: Property): boolean;
  /** The layer's current value. */
  read<P extends Property>(layer: Layer, property: P): PropertyValues[P];
  /** Changes the layer, across the instances of its usage, and records the change. */
  set<P extends Property>(layer: Layer, property: P, value: PropertyValues[P]): void;
}

/** Stamped on the canvas elements of a layer once it is edited: its identity in the ChangeSet. */
export const LAYER_ID_ATTR = "data-vk-layer";

interface Definition<P extends Property> {
  /** Layers the property applies to. Locked layers never get any. */
  kinds: LayerKind[];
  /** Further, whether the layer as it is now can take the property. */
  applies?(el: Element): boolean;
  read(el: Element, colors: ColorReader): PropertyValues[P];
  /** CSS declarations that show the value on the canvas. */
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

  const editor: Editor = {
    can(layer, property) {
      const { kinds, applies } = PROPERTIES[property];
      return !layer.text && kinds.includes(layer.kind) && (!applies || applies(layer.el));
    },
    read: (layer, property) => PROPERTIES[property].read(layer.el, colors),
    set(layer, property, value) {
      if (!editor.can(layer, property)) throw new Error(`Vernier Kit: ${property} cannot be edited on a ${layer.kind} layer`);
      const before = editor.read(layer, property);
      const sources = sourcesOf(layer.el, PROPERTIES[property].sets);
      const instances = tree.acrossInstances(layer);
      const declarations = PROPERTIES[property].write(value);
      for (const instance of instances) {
        // Kept before the first edit: what sets a value is looked up in the page's own styles.
        if (!instance.el.hasAttribute(ORIGINAL_STYLE_ATTR)) instance.el.setAttribute(ORIGINAL_STYLE_ATTR, instance.el.getAttribute("style") ?? "");
        for (const name in declarations) (instance.el as HTMLElement).style.setProperty(name, declarations[name], "important");
      }
      changes.record(idOf(layer, instances), {
        target: targetOf(layer, instances.length),
        scope: "usage",
        property,
        before,
        after: value,
        style: declarations,
        sources,
      });
    },
  };
  return editor;
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
