/** How properties and their values read in design language: in the change notes, and in the editor's change list. */
import type { Change, Composed, Created, Place, PutBack, StackSettings } from "./client/changeset";
import type { Align, ColorStop, Fill, Padding, Radius, Shadow, Size, Stroke } from "./client/property-table";
import { isCircle, isMiddle, lengthCss, type Color, type RadialGradient } from "./client/paint";
import type { LineHeight, TextCase, TextLength } from "./client/typography";
import type { UsageLevel } from "./client/usage-chain";
import type { Elsewhere } from "./service-protocol";

const PROPERTIES: Record<string, string> = {
  fill: "Fill",
  stroke: "Stroke",
  radius: "Corner radius",
  shadows: "Shadows",
  // A text layer's: said as its shadows too.
  textShadows: "Shadows",
  layerBlur: "Layer blur",
  backgroundBlur: "Background blur",
  x: "X",
  y: "Y",
  right: "Right",
  bottom: "Bottom",
  absolute: "Absolute",
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
  columns: "Columns",
  rowGap: "Row gap",
  columnGap: "Column gap",
  opacity: "Opacity",
  visible: "Visibility",
  clip: "Clip content",
  fontFamily: "Font",
  fontWeight: "Font weight",
  fontSize: "Font size",
  lineHeight: "Line height",
  letterSpacing: "Letter spacing",
  textAlign: "Text alignment",
  textColor: "Text color",
  textCase: "Case",
  textDecoration: "Decoration",
};
/** Where the title does not read well in a sentence. */
const IN_A_SENTENCE: Record<string, string> = { x: "X position", y: "Y position", right: "right position", bottom: "bottom position", absolute: "absolute placement", clip: "content clipping", columns: "number of columns" };

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
    case "putBack":
      return "Put back";
    case "brief":
      return "Brief";
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
    return `${width} × ${height}px${brief ? `, ${briefShown(brief)}` : ""}`;
  }
  if (change.kind === "brief") return change.after ? briefShown(change.after as string) : "taken off";
  if (change.kind === "text") return `${quoted(change.before as string)} → ${quoted(change.after as string)}`;
  const name = (place: Place) => place.container.target.context.path.at(-1);
  if (change.kind === "delete") return `from ${name(change.before as Place)}`;
  if (change.kind === "putBack") {
    const to = (change.after as PutBack).place;
    return to.absolute ? `at X ${to.absolute.x}px, Y ${to.absolute.y}px in ${name(to)}` : `in ${name(to)}, ${ordinal(to.nth)}`;
  }
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

/** A brief as the change list shows it: quoted, cut short when long. */
function briefShown(brief: string): string {
  return quoted(brief.length > MAX_BRIEF ? `${brief.slice(0, MAX_BRIEF - 1)}…` : brief);
}

/**
 * Where a usage of a component is, as the notes name one: `Card used at
 * \`src/App.tsx:44:9\``, and, `outer`, the components it is inside, out to the
 * page (ticket 77).
 */
function usageWhere(chain: UsageLevel[], outer = true): string {
  const levels = (outer ? chain : chain.slice(0, 1)).map((level) => `${level.component} used at ${level.usage ? `\`${level.usage}\`` : "an undetermined place"}`);
  return levels.join(", inside ");
}

/** Other usages of a change's component, as many as `elsewhere` has, in a sentence: `another usage of Card`, `2 other usages of Card` (ticket 77). */
export function otherUsagesWord(change: Change, elsewhere: Elsewhere[]): string {
  const component = change.target.chain[0]?.component;
  return elsewhere.length === 1 ? `another usage of ${component}` : `${elsewhere.length} other usages of ${component}`;
}

/** What other usages of a change's component show of its property now, and showed as the round was claimed (ticket 77): each `Card used at …, its fill from … to …`. */
export function elsewhereWords(property: string, elsewhere: Elsewhere[], outer = true): string {
  return elsewhere.map(({ chain, was, is }) => `${usageWhere(chain, outer)}, its ${propertyName(property)} from ${value(property, was)} to ${value(property, is)}`).join("; ");
}

/** `1`, `1 and 2`, `1, 2 and 3`: things in a sentence. */
export function listed(things: (string | number)[]): string {
  return things.length < 2 ? `${things[0]}` : `${things.slice(0, -1).join(", ")} and ${things.at(-1)}`;
}

/** 1st, 2nd, 3rd, 4th, … */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** The name of the layer a change is made to, as the layer tree showed it. */
export function layerName({ kind, target, after }: Change): string {
  // Put back, it is the layer that was off the canvas, not the container it goes into.
  if (kind === "putBack") target = (after as PutBack).layer.origin.target;
  return target.context.path.at(-1) ?? "Layer";
}

/** A color, with its opacity when it has some see-through: "#FF0000", "#FF0000 at 50% opacity". */
function colorValue({ color, opacity }: { color: string; opacity: number }): string {
  return opacity === 1 ? color : `${color} at ${Math.round(opacity * 100)}% opacity`;
}

/**
 * Which way a linear gradient runs, for the angles that run from side to side.
 * Not the diagonals: toward a corner runs along the box's own diagonal, at an angle that depends on its size.
 */
const DIRECTIONS: Record<number, string> = { 0: "bottom to top", 90: "left to right", 180: "top to bottom", 270: "right to left" };

function fillValue(fill: Fill | null): string {
  if (!fill) return "no fill";
  const stops = (stops: ColorStop[]) => stops.map((stop) => `${colorValue(stop)} at ${stop.position}${stop.unit}`).join(", ");
  switch (fill.type) {
    case "solid":
      return colorValue(fill);
    case "linear": {
      const direction = DIRECTIONS[fill.angle];
      return `a linear gradient at ${fill.angle}°${direction ? ` (${direction})` : ""}: ${stops(fill.stops)}`;
    }
    case "radial":
      return `a radial gradient ${"shape" in fill ? "centered and sized as the page has it" : radialShape(fill)}: ${stops(fill.stops)}`;
    case "conic":
      return "a conic gradient";
  }
}

/**
 * Where a radial gradient is centered and how far out it reaches, in the
 * units the page writes them in: "from the middle out", "centered 30% across
 * and 20% down, 20px out", "from the middle, a circle out to the closest side".
 */
function radialShape({ center, size }: RadialGradient): string {
  const middle = isMiddle(center);
  if (middle && "extent" in size && size.extent === "farthest-corner" && !size.circle) return "from the middle out";
  const from = middle ? "from the middle" : `centered ${lengthCss(center.x)} across and ${lengthCss(center.y)} down`;
  if ("extent" in size) return `${from}, ${size.circle ? "a circle" : "an ellipse"} out to the ${size.extent.replace("-", " ")}`;
  return `${from}, ${isCircle(size) ? `${lengthCss(size.x)} out` : `out ${lengthCss(size.x)} across and ${lengthCss(size.y)} down`}`;
}

/** "a drop shadow (x 0px, y 4px, blur 4px, spread 0px, #000000 at 25% opacity)"; a text layer's has no spread. */
function shadowValue(s: Shadow, spread: boolean): string {
  return `${s.type === "drop" ? "a drop" : "an inner"} shadow (x ${s.x}px, y ${s.y}px, blur ${s.blur}px, ${spread ? `spread ${s.spread}px, ` : ""}${colorValue(s)})`;
}

/** Font weights by the names Figma gives them. */
const WEIGHTS: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

/** A font weight's name: "Semi Bold"; a weight between the named ones, its number. */
export function weightName(weight: number): string {
  return WEIGHTS[weight] ?? String(weight);
}

/** "24px", "150% of the font size". */
function textLength({ value, unit }: TextLength): string {
  return unit === "px" ? `${value}px` : `${value}% of the font size`;
}

const CASES: Record<TextCase, string> = { none: "as typed", upper: "upper case", lower: "lower case", title: "title case" };

export function value(property: string, v: unknown): string {
  switch (property) {
    case "fontFamily":
      return v as string;
    case "fontWeight":
      return WEIGHTS[v as number] ? `${weightName(v as number)} (${v})` : String(v);
    case "fontSize":
      return `${v as number}px`;
    case "lineHeight":
      return v === "auto" ? "Auto (the font's own)" : textLength(v as Exclude<LineHeight, "auto">);
    case "letterSpacing":
      return textLength(v as TextLength);
    case "textAlign":
      return v === "justify" ? "justified" : (v as string);
    case "textColor":
      return colorValue(v as Color);
    case "textCase":
      return CASES[v as TextCase];
    case "textDecoration":
      return v as string;
    case "fill":
      return fillValue(v as Fill | null);
    case "stroke": {
      const stroke = v as Stroke | null;
      if (!stroke) return "no stroke";
      const { weight } = stroke;
      if (typeof weight === "number") return `${weight}px ${stroke.style} ${colorValue(stroke)}`;
      const sides = ["top", "right", "bottom", "left"].map((side, i) => `${side} ${weight[i]}px`).join(", ");
      return `${stroke.style} ${colorValue(stroke)}, on some sides: ${sides}`;
    }
    case "shadows":
    case "textShadows": {
      const shadows = v as Shadow[];
      if (!shadows.length) return "no shadow";
      return `${shadows.map((s) => shadowValue(s, property === "shadows")).join(" and ")}${shadows.length > 1 ? ", the first on top" : ""}`;
    }
    case "layerBlur":
    case "backgroundBlur":
      return v === null ? "none" : `${v as number}px`;
    case "radius": {
      const radius = v as Radius;
      if (typeof radius === "number") return `${radius}px`;
      const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
      return radius.map((r, i) => `${corners[i]} ${r}px`).join(", ");
    }
    case "x":
    case "y":
    case "right":
    case "bottom":
    case "gap":
    case "rowGap":
    case "columnGap":
      return `${v as number}px`;
    case "columns":
      return String(v);
    case "absolute": {
      const place = v as { x: number; y: number } | null;
      return place ? `X ${place.x}px, Y ${place.y}px` : "in the layout";
    }
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
