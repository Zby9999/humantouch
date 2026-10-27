/** How properties and their values read in design language: in the change notes, and in the editor's change list. */
import type { Change, Composed, Created, Place, StackSettings } from "./client/changeset";
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

/** What a change is, as a title: "Fill", "Reorder", "Make Stack". */
export function changeTitle(change: Change): string {
  return change.kind === "style" ? propertyTitle(change.property) : kindTitle(change);
}

/** The kind of a change: "Style", "Reorder", "Make Stack". */
export function kindTitle(change: Change): string {
  switch (change.kind) {
    case "style":
      return "Style";
    case "move":
      return moveKind(change);
    case "stack":
      return "Make Stack";
    case "unstack":
      return "Dissolve Stack";
    case "create":
      return (change.after as Created).type === "text" ? "New text" : "New Frame";
    case "text":
      return "Text";
    case "delete":
      return "Delete";
    case "duplicate":
      return "Duplicate";
  }
}

/** Words as quoted in the notes and the change list. */
export function quoted(text: string): string {
  return `“${text}”`;
}

/** How a Stack lays its layers out, in a sentence: "horizontal, with a gap of 24px, no padding, aligned top left". */
export function stackSettings({ direction, gap, padding, align }: StackSettings): string {
  const room = padding.some((p) => p) ? `padding ${value("padding", padding)}` : "no padding";
  return `${direction}, with a gap of ${gap}px, ${room}, aligned ${value("align", align)}`;
}

/** A change's values, from the first to the latest: "#FFFFFF → #FF0000", "3rd → 1st". */
export function changeValues(change: Change): string {
  if (change.kind === "stack") {
    const { layers, direction, gap } = change.after as Composed;
    return `${layers.length === 1 ? "1 layer" : `${layers.length} layers`}, ${direction}, gap ${gap}px`;
  }
  if (change.kind === "unstack") return `${(change.before as StackSettings).direction} Stack → Frame`;
  if (change.kind === "create") {
    const { type, text, width, height, brief } = change.after as Created;
    if (type === "text") return quoted(text ?? "");
    return `${width} × ${height}px${brief ? `, ${quoted(brief.length > MAX_BRIEF ? `${brief.slice(0, MAX_BRIEF - 1)}…` : brief)}` : ""}`;
  }
  if (change.kind === "text") return `${quoted(change.before as string)} → ${quoted(change.after as string)}`;
  const name = (place: Place) => place.container.target.context.path.at(-1);
  if (change.kind === "delete") return `from ${name(change.before as Place)}`;
  if (change.kind === "duplicate") {
    const to = change.after as Place;
    return to.absolute ? `copy at X ${to.absolute.x}px, Y ${to.absolute.y}px in ${name(to)}` : `copy in ${name(to)}, ${ordinal(to.nth)}`;
  }
  if (change.kind === "move") {
    const [before, after] = [change.before, change.after] as Place[];
    const name = (place: Place) => place.container.target.context.path.at(-1);
    if (after.absolute) return `X ${after.absolute.x}px, Y ${after.absolute.y}px in ${name(after)}`;
    if (moveKind(change) === "Reorder") return `${ordinal(before.nth)} → ${ordinal(after.nth)}`;
    return `${name(before)} → ${name(after)}`;
  }
  return `${value(change.property, change.before)} → ${value(change.property, change.after)}`;
}

/**
 * The kind of a move: to another place among its container's layers
 * (Reorder), into another container's layout or back into one (Move), or
 * placed absolute (Absolute).
 */
export function moveKind(change: Change): "Reorder" | "Move" | "Absolute" {
  const [before, after] = [change.before, change.after] as Place[];
  if (after.absolute) return "Absolute";
  return before.container.layer === after.container.layer && !before.absolute ? "Reorder" : "Move";
}

/** How much of a brief the change list shows. */
const MAX_BRIEF = 40;

/** 1st, 2nd, 3rd, 4th, … */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
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
