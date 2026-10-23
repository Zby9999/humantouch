/** How properties and their values read in design language: in the change notes, and in the editor's change list. */
import type { Change } from "./client/changeset";
import type { Fill, Radius } from "./client/edits";

const PROPERTIES: Record<string, string> = { fill: "Fill", radius: "Corner radius" };

/** A property's name as a title: "Fill", "Corner radius". */
export function propertyTitle(property: string): string {
  return PROPERTIES[property] ?? property;
}

/** A property's name in a sentence: "fill", "corner radius". */
export function propertyName(property: string): string {
  return propertyTitle(property).toLowerCase();
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
    default:
      return JSON.stringify(v);
  }
}
