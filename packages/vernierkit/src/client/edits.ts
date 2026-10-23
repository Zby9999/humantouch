/**
 * Edit commands: changes in design language, made to the canvas at once and
 * recorded in the ChangeSet. An edit to a layer is an edit to its usage, so
 * it shows up in every instance of that usage.
 */
import type { ChangeSet, Target } from "./changeset";
import type { Layer, LayerKind, LayerTree } from "./layers";

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
}

const PROPERTIES: { [P in Property]: Definition<P> } = {
  fill: {
    kinds: ["stack", "grid", "frame"],
    // A gradient or an image paints over the solid color. Those fills are edited elsewhere.
    applies: (el) => getComputedStyle(el).backgroundImage === "none",
    read: (el, colors) => colors.fill(getComputedStyle(el).backgroundColor),
    write: (fill) => ({ "background-color": fill ? cssColor(fill) : "transparent" }),
  },
  radius: {
    kinds: ["stack", "grid", "frame", "image", "still"],
    read: readRadius,
    write: (radius) => ({ "border-radius": typeof radius === "number" ? `${radius}px` : radius.map((r) => `${r}px`).join(" ") }),
  },
};

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
      const instances = tree.acrossInstances(layer);
      const declarations = PROPERTIES[property].write(value);
      for (const instance of instances) {
        for (const name in declarations) (instance.el as HTMLElement).style.setProperty(name, declarations[name], "important");
      }
      changes.record(idOf(layer, instances), {
        target: targetOf(layer, instances.length),
        scope: "usage",
        property,
        before,
        after: value,
      });
    },
  };
  return editor;
}

function targetOf(layer: Layer, instances: number): Target {
  const { loc, chain, component } = layer;
  return { loc, chain, component, instances, locked: layer.kind === "locked", unlocated: !loc };
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

const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** The radius each corner is drawn with: percentages resolved, and no more than half the shorter side. */
function readRadius(el: Element): Radius {
  const style = getComputedStyle(el);
  const { width, height } = el.getBoundingClientRect();
  const corners = CORNERS.map((corner) => {
    const value = style.getPropertyValue(`border-${corner}-radius`).split(" ")[0];
    const px = value.endsWith("%") ? (parseFloat(value) / 100) * width : parseFloat(value) || 0;
    return Math.round(Math.min(px, Math.min(width, height) / 2) * 100) / 100;
  }) as [number, number, number, number];
  return corners.every((r) => r === corners[0]) ? corners[0] : corners;
}
