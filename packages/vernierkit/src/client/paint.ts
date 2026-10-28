/**
 * Fills and strokes in design language, read from and written as CSS: a fill
 * is a layer's background (a color, or one gradient over no color), a stroke
 * its border. Colors read back in sRGB hex whatever CSS color space set them.
 */

/** A color as `#RRGGBB`, and its opacity from 0 to 1. */
export interface Color {
  color: string;
  opacity: number;
}

/** A solid fill. */
export interface Solid extends Color {
  type: "solid";
}

/** A gradient's color stop: where along the gradient it is, in % from 0 to 100. */
export interface ColorStop extends Color {
  position: number;
}

/** A linear gradient: `angle` in degrees, clockwise from bottom-to-top (0) as CSS turns it; 90 runs left to right. */
export interface LinearGradient {
  type: "linear";
  angle: number;
  stops: ColorStop[];
}

/**
 * A radial gradient, from the middle out. `shape`: the page's own shape and
 * center as CSS writes them (`circle at 30% 20%`), kept as they are; empty for
 * the default, an ellipse out to the farthest corner.
 */
export interface RadialGradient {
  type: "radial";
  shape: string;
  stops: ColorStop[];
}

/** A conic gradient the page already has: shown, not edited. `css`: as the page has it. */
export interface ConicGradient {
  type: "conic";
  css: string;
}

export type Gradient = LinearGradient | RadialGradient;
export type Fill = Solid | Gradient | ConicGradient;

/**
 * A stroke: one color and line for the layer, drawn `weight` px wide on every
 * side, or on each side as it says (top, right, bottom, left; 0 for none).
 */
export interface Stroke extends Color {
  weight: number | [number, number, number, number];
  style: "solid" | "dashed";
}

export interface ColorReader {
  /** Any CSS color (oklch included) in sRGB. */
  color(css: string): Color;
}

const readers = new WeakMap<Document, ColorReader>();

/** Reads colors back by painting them: the one way that handles every CSS color space. One per document. */
export function colorReader(doc: Document): ColorReader {
  let reader = readers.get(doc);
  if (!reader) readers.set(doc, (reader = paintingReader(doc)));
  return reader;
}

function paintingReader(doc: Document): ColorReader {
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
    color(css) {
      const alpha = paint(css)[3];
      // Painted opaque: a see-through color loses precision to premultiplied alpha.
      const [r, g, b] = paint(`rgb(from ${css} r g b / 1)`);
      const color = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
      return { color, opacity: Math.round((alpha / 255) * 100) / 100 };
    },
  };
}

export function cssColor({ color, opacity }: Color): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / ${opacity})`;
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** Whether the layer's fill can be read: a color, or one gradient. An image, or several layers of background, cannot. */
export function fillApplies(el: Element): boolean {
  const image = getComputedStyle(el).backgroundImage;
  return image === "none" || gradientOf(image, el, colorReader(el.ownerDocument)) !== null;
}

/** The CSS a layer's fill is read from: its color, and its gradient when it has one. */
export function fillSets(el: Element): string[] {
  return getComputedStyle(el).backgroundImage === "none" ? ["background-color"] : ["background-color", "background-image"];
}

/** The layer's fill: its gradient if it has one, as that paints over the color; else its color, or none when that is transparent. */
export function readFill(el: Element, colors: ColorReader): Fill | null {
  const style = getComputedStyle(el);
  if (style.backgroundImage !== "none") return gradientOf(style.backgroundImage, el, colors);
  const color = colors.color(style.backgroundColor);
  return color.opacity === 0 ? null : { type: "solid", ...color };
}

/**
 * The CSS that paints the fill. A color clears a gradient the layer has, and a
 * gradient in place of a color clears that color; only what the layer has now is
 * declared, so a plain color change reads as one.
 */
export function writeFill(fill: Fill | null, el: Element): Record<string, string> {
  const style = getComputedStyle(el);
  const image = !fill || fill.type === "solid" ? "none" : gradientCss(fill);
  const color = fill?.type === "solid" ? cssColor(fill) : "transparent";
  // A gradient changed where there was one already: a color under it, the page's own, stays.
  const under = fill !== null && fill.type !== "solid" && style.backgroundImage !== "none";
  return {
    ...(!under && (color !== "transparent" || style.backgroundColor !== TRANSPARENT) && { "background-color": color }),
    ...((image !== "none" || style.backgroundImage !== "none") && { "background-image": image }),
  };
}

function gradientCss(gradient: Gradient | ConicGradient): string {
  if (gradient.type === "conic") return gradient.css;
  const stops = [...gradient.stops].sort((a, b) => a.position - b.position).map((stop) => `${cssColor(stop)} ${stop.position}%`);
  const lead = gradient.type === "linear" ? `${gradient.angle}deg` : gradient.shape;
  return `${gradient.type}-gradient(${[...(lead ? [lead] : []), ...stops].join(", ")})`;
}

/** One gradient, as computed style writes it; null for anything else (an image, several layers, a repeating linear or radial gradient). */
function gradientOf(css: string, el: Element, colors: ColorReader): Fill | null {
  const match = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(css.trim());
  if (!match || split(css, ",").length > 1) return null;
  const [, repeating, type, inside] = match;
  if (type === "conic") return { type: "conic", css };
  if (repeating) return null;
  const args = split(inside, ",");
  // What comes before the stops: the direction, the shape, the color space to blend in.
  const lead = colorOf(args[0]) === null ? args.shift()!.replace(INTERPOLATION, "").trim() : "";
  const { width, height } = el.getBoundingClientRect();
  if (type === "linear") {
    const angle = angleOf(lead, width, height);
    if (angle === null) return null;
    const turn = (angle * Math.PI) / 180;
    const stops = stopsOf(args, Math.abs(width * Math.sin(turn)) + Math.abs(height * Math.cos(turn)), colors);
    return stops && { type: "linear", angle, stops };
  }
  // A length is measured along the ray of the default ellipse, out to the farthest corner.
  const stops = stopsOf(args, (width / 2) * Math.SQRT2, colors);
  return stops && { type: "radial", shape: lead, stops };
}

/** `in oklab`, `in oklch longer hue`: how the colors blend. The editor blends in the default space. */
const INTERPOLATION = /\bin\s+[a-z-]+(\s+(shorter|longer|increasing|decreasing)\s+hue)?/i;
const POSITION = /^(-?(\d*\.)?\d+(%|[a-z]+)?|calc\(.*\))$/i;

/** The color of a stop written as CSS (`red 10%`), or null when it has none (a hint, or what comes before the stops). */
function colorOf(stop: string): string | null {
  const color = split(stop, " ").filter((token) => !POSITION.test(token)).join(" ");
  return color && CSS.supports("color", color) ? color : null;
}

/**
 * The stops, at the positions CSS puts them: missing ones spread evenly
 * between their neighbours, the first at 0% and the last at 100%, none before
 * the one before it. `length`: the gradient's length in px, for stops placed in px.
 */
function stopsOf(args: string[], length: number, colors: ColorReader): ColorStop[] | null {
  const stops: { color: string; position: number | null }[] = [];
  for (const arg of args) {
    const color = colorOf(arg);
    if (color === null) continue; // A hint: where between two stops their colors meet halfway.
    const positions = split(arg, " ").filter((token) => POSITION.test(token)).map((token) => positionOf(token, length));
    for (const position of positions.length ? positions : [null]) stops.push({ color, position });
  }
  if (stops.length < 2) return null;
  stops[0].position ??= 0;
  stops.at(-1)!.position ??= 100;
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].position === null) continue;
    stops[i].position = Math.max(stops[i].position!, ...stops.slice(0, i).flatMap((s) => (s.position === null ? [] : [s.position])));
  }
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].position !== null) continue;
    const from = i - 1;
    let to = i;
    while (stops[to].position === null) to++;
    const [a, b] = [stops[from].position!, stops[to].position!];
    for (let j = i; j < to; j++) stops[j].position = a + ((b - a) * (j - from)) / (to - from);
  }
  return stops.map(({ color, position }) => ({ ...colors.color(color), position: round(position!) }));
}

/** A stop's position in %: from % or px; null for one that cannot be told (`calc()`, `em`). */
function positionOf(token: string, length: number): number | null {
  const n = parseFloat(token);
  if (token.endsWith("%")) return n;
  if (/^-?(\d*\.)?\d+(px)?$/.test(token) && length > 0) return (n / length) * 100;
  return null;
}

/** An angle in degrees as a linear gradient takes it: within one turn, from 0 up to 360. */
export function turned(degrees: number): number {
  return round(((degrees % 360) + 360) % 360);
}

const SIDE_ANGLES: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 };

/** A linear gradient's direction in degrees: an angle, a side (`to right`), or a corner, which depends on the box. */
function angleOf(lead: string, width: number, height: number): number | null {
  if (!lead) return 180;
  const angle = /^(-?(?:\d*\.)?\d+)(deg|grad|rad|turn)$/.exec(lead);
  if (angle) {
    const degrees = parseFloat(angle[1]) * { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 }[angle[2] as "deg"];
    return turned(degrees);
  }
  const sides = /^to\s+([a-z]+)(?:\s+([a-z]+))?$/.exec(lead);
  if (!sides || !(sides[1] in SIDE_ANGLES) || (sides[2] && !(sides[2] in SIDE_ANGLES))) return null;
  if (!sides[2]) return SIDE_ANGLES[sides[1]];
  // To a corner: square to the diagonal between the other two corners.
  const horizontal = (side: string) => side === "right" || side === "left";
  const [across, along] = horizontal(sides[1]) ? [sides[1], sides[2]] : [sides[2], sides[1]];
  const turn = (Math.atan2(height, width) * 180) / Math.PI;
  const up = along === "top";
  const degrees = across === "right" ? (up ? turn : 180 - turn) : up ? 360 - turn : 180 + turn;
  return round(degrees);
}

/** The fill as another type, as Figma turns it: a color into a gradient that fades it out, a gradient into its first color. */
export function fillAs(fill: Fill | null, type: "solid" | Gradient["type"]): Fill {
  const stops: ColorStop[] =
    fill && "stops" in fill
      ? fill.stops
      : [stop(fill?.type === "solid" ? fill : BLACK, 0), stop({ ...(fill?.type === "solid" ? fill : BLACK), opacity: 0 }, 100)];
  if (type === "solid") return { type, color: stops[0].color, opacity: stops[0].opacity };
  if (type === "linear") return { type, angle: fill?.type === "linear" ? fill.angle : 180, stops };
  return { type, shape: fill?.type === "radial" ? fill.shape : "", stops };
}

const BLACK: Color = { color: "#000000", opacity: 1 };

/** A stop, its fields in the order the editor reads them back in: a change is told from no change by comparing them as written. */
export function stop({ color, opacity }: Color, position: number): ColorStop {
  return { color, opacity, position: round(position) };
}

/** A new stop at `position`, in the color the gradient has there. */
export function stopAt(stops: ColorStop[], position: number): ColorStop {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const after = sorted.findIndex((s) => s.position >= position);
  if (after <= 0) return stop(sorted[after === 0 ? 0 : sorted.length - 1], position);
  const [a, b] = [sorted[after - 1], sorted[after]];
  const t = b.position === a.position ? 0 : (position - a.position) / (b.position - a.position);
  const channel = (i: number) => Math.round(parseInt(a.color.slice(i, i + 2), 16) * (1 - t) + parseInt(b.color.slice(i, i + 2), 16) * t);
  const color = `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  return stop({ color, opacity: round(a.opacity * (1 - t) + b.opacity * t) }, position);
}

/** Where a new stop goes when none is pointed at: halfway across the widest gap between two stops. */
export function nextStopPosition(stops: ColorStop[]): number {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  let best = { from: sorted[0].position, to: sorted[0].position };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].position - sorted[i - 1].position > best.to - best.from) best = { from: sorted[i - 1].position, to: sorted[i].position };
  }
  return round((best.from + best.to) / 2);
}

const SIDES = ["top", "right", "bottom", "left"];

/** Every CSS property a stroke is read from. */
export const STROKE_SETS = ["width", "style", "color"].flatMap((part) => SIDES.map((side) => `border-${side}-${part}`));

/**
 * The layer's border as a stroke: the color and line of the first side drawn
 * (a dotted line reads as dashed), a side with no line as 0; none with no side drawn.
 */
export function readStroke(el: Element, colors: ColorReader): Stroke | null {
  const style = getComputedStyle(el);
  const of = (side: string, part: string) => style.getPropertyValue(`border-${side}-${part}`);
  const weights = SIDES.map((side) => (/^(none|hidden)$/.test(of(side, "style")) ? 0 : round(parseFloat(of(side, "width")) || 0)));
  const first = weights.findIndex((weight) => weight > 0);
  if (first < 0) return null;
  return {
    ...colors.color(of(SIDES[first], "color")),
    weight: weights.every((weight) => weight === weights[0]) ? weights[0] : (weights as Stroke["weight"]),
    style: /^(dashed|dotted)$/.test(of(SIDES[first], "style")) ? "dashed" : "solid",
  };
}

/**
 * The stroke drawn at `weight`, as the editor reads it back: every side alike
 * is one weight, and no side drawn is no stroke.
 */
export function strokeWith({ color, opacity, style }: Stroke, weight: Stroke["weight"]): Stroke | null {
  const alike = typeof weight === "number" ? weight : weight.every((w) => w === weight[0]) ? weight[0] : weight;
  return alike === 0 ? null : { color, opacity, weight: alike, style };
}

/** The CSS that draws the stroke; no stroke takes the border off and leaves its color as it is. */
export function writeStroke(stroke: Stroke | null): Record<string, string> {
  if (!stroke) return { "border-width": "0px", "border-style": "none" };
  const { weight } = stroke;
  return {
    "border-width": typeof weight === "number" ? `${weight}px` : weight.map((w) => `${w}px`).join(" "),
    "border-style": stroke.style,
    "border-color": cssColor(stroke),
  };
}

/** Splits CSS at a separator outside parentheses, trimmed, leaving out empty parts. */
function split(css: string, separator: "," | " "): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const char of css) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (depth === 0 && (separator === " " ? /\s/.test(char) : char === separator)) {
      parts.push(part);
      part = "";
    } else part += char;
  }
  parts.push(part);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
