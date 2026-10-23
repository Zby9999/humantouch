/** How properties and their values read in design language: in the change notes, and in the editor's change list. */
import type { Change } from "./client/changeset";
import type { Align, Fill, Padding, Radius, Size } from "./client/edits";

const PROPERTIES: Record<string, string> = {
  fill: "Fill",
  radius: "Corner radius",
  x: "X",
  y: "Y",
  width: "Width",
  height: "Height",
  minWidth: "Min width",
  maxWidth: "Max width",
  minHeight: "Min height",
  maxHeight: "Max height",
  direction: "Direction",
  gap: "Gap",
  padding: "Padding",
  align: "Alignment",
  wrap: "Wrap",
  opacity: "Opacity",
  visible: "Visibility",
  clip: "Clip content",
};
/** Where the title does not read well in a sentence. */
const IN_A_SENTENCE: Record<string, string> = { x: "X position", y: "Y position", clip: "content clipping" };

/** A property's name as a title: "Fill", "Corner radius". */
export function propertyTitle(property: string): string {
  return PROPERTIES[property] ?? property;
}

/** A property's name in a sentence: "fill", "corner radius". */
export function propertyName(property: string): string {
  return IN_A_SENTENCE[property] ?? propertyTitle(property).toLowerCase();
}

/** What a change is, as a title: "Fill". */
export function changeTitle(change: Change): string {
  return propertyTitle(change.property);
}

/** A change's values, from the first to the latest: "#FFFFFF → #FF0000". */
export function changeValues(change: Change): string {
  return `${value(change.property, change.before)} → ${value(change.property, change.after)}`;
}

/** The name of the layer a change is made to, as the layer tree showed it. */
export function layerName({ target }: Change): string {
  return target.context.path.at(-1) ?? "Layer";
}

export function value(property: string, v: unknown): string {
  switch (property) {
    case "fill": {
      const fill = v as Fill | null;
      if (!fill) return "no fill";
      return fill.opacity === 1 ? fill.color : `${fill.color} at ${Math.round(fill.opacity * 100)}% opacity`;
    }
    case "radius": {
      const radius = v as Radius;
      if (typeof radius === "number") return `${radius}px`;
      const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
      return radius.map((r, i) => `${corners[i]} ${r}px`).join(", ");
    }
    case "x":
    case "y":
    case "gap":
      return `${v as number}px`;
    case "width":
    case "height": {
      const size = v as Size;
      return size.type === "fixed" ? `Fixed ${size.value}px` : size.type === "hug" ? "Hug" : "Fill";
    }
    case "minWidth":
    case "maxWidth":
    case "minHeight":
    case "maxHeight":
      return v === null ? "none" : `${v as number}px`;
    case "direction":
      return v as string;
    case "padding": {
      const [top, right, bottom, left] = v as Padding;
      if (top === bottom && left === right) return top === left ? `${top}px` : `${top}px top and bottom, ${left}px left and right`;
      return `top ${top}px, right ${right}px, bottom ${bottom}px, left ${left}px`;
    }
    case "align": {
      const { x, y, distribute } = v as Align;
      const across = { start: "left", center: "center", end: "right" }[x];
      const down = { start: "top", center: "center", end: "bottom" }[y];
      const point = across === down ? "center" : `${down} ${across}`;
      return distribute ? `${point}, spread evenly` : point;
    }
    case "wrap":
      return v ? "wrapping" : "not wrapping";
    case "opacity":
      return `${Math.round((v as number) * 100)}%`;
    case "visible":
      return v ? "shown" : "hidden";
    case "clip":
      return v ? "on" : "off";
    default:
      return JSON.stringify(v);
  }
}
