/**
 * Stroke weights as written and as drawn. The browser draws a border a whole
 * number of physical pixels wide (at least one), and reads it back so: 1.5px
 * is drawn 1px on a 1x screen, and as it is on a 2x one. The editor reads a
 * weight as the style that sets it writes it, so the panel shows what the code
 * says on any screen.
 */
import { readStroke, strokeWith, type ColorReader, type Stroke } from "./paint";
import { sourcesOf } from "./style-source";

const SIDES = ["top", "right", "bottom", "left"];

/**
 * The layer's stroke, each side's weight as the style that sets it writes it;
 * as drawn when that cannot be read (through `var()`, in units other than px),
 * or does not draw as the layer is drawn (a rule that is not the one that applies).
 */
export function readWrittenStroke(el: Element, colors: ColorReader): Stroke | null {
  const stroke = readStroke(el, colors);
  if (!stroke) return null;
  const drawn = perSide(stroke.weight);
  const written = drawn.map((weight, i) => (weight > 0 ? writtenWidth(el, `border-${SIDES[i]}-width`) : null));
  const check = drawnWidths(el.ownerDocument, written.map((w) => w ?? 0));
  const weights = drawn.map((weight, i) => (written[i] !== null && check[i] === weight ? written[i]! : weight));
  return strokeWith(stroke, weights as Stroke["weight"]);
}

/**
 * The widths the browser draws borders of `widths` px at in `doc`, top, right,
 * bottom and left: drawn on an element put in the page and taken out again at
 * once, before anything is painted.
 */
function drawnWidths(doc: Document, widths: number[]): number[] {
  const probe = doc.createElement("div");
  const declarations = { position: "absolute", visibility: "hidden", "border-style": "solid", "border-width": widths.map((w) => `${w}px`).join(" ") };
  // Important, so no rule of the page's reaches it.
  for (const [name, value] of Object.entries(declarations)) probe.style.setProperty(name, value, "important");
  (doc.body ?? doc.documentElement).append(probe);
  const style = getComputedStyle(probe);
  const drawn = SIDES.map((side) => round(parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0));
  probe.remove();
  return drawn;
}

/** A side's width as written, in px: by an edit on the canvas, or else by what sets it in the page's styles; null when not in px. */
function writtenWidth(el: Element, property: string): number | null {
  const inline = (el as HTMLElement).style;
  // An edit's declaration, on top of everything.
  if (inline.getPropertyPriority(property) === "important") return pxOf(inline.getPropertyValue(property));
  const [source] = sourcesOf(el, [property]);
  return source.declaration ? pxOf(source.declaration.slice(source.declaration.indexOf(":") + 1)) : null;
}

function pxOf(css: string): number | null {
  const match = /^\s*(\d*\.?\d+)(px)?\s*$/.exec(css);
  return match && (match[2] || Number(match[1]) === 0) ? round(Number(match[1])) : null;
}

function perSide(weight: Stroke["weight"]): number[] {
  return typeof weight === "number" ? [weight, weight, weight, weight] : weight;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A change to a stroke that keeps its weight leaves the weight out of its
 * reference style: the code keeps the weight it writes. The line is then
 * given only to the sides drawn, so the others are not drawn at the default width.
 */
export function strokeReference(style: Record<string, string>, before: Stroke | null, after: Stroke | null): Record<string, string> {
  if (!before || !after || JSON.stringify(before.weight) !== JSON.stringify(after.weight)) return style;
  const { "border-width": _, "border-style": line, ...rest } = style;
  const weights = perSide(after.weight);
  if (weights.every((weight) => weight > 0)) return { "border-style": line, ...rest };
  return { ...Object.fromEntries(SIDES.flatMap((side, i) => (weights[i] > 0 ? [[`border-${side}-style`, line]] : []))), ...rest };
}

/** The stroke as the browser draws it in `doc`: each side as wide as drawn there. */
export function drawnStroke(doc: Document, stroke: Stroke | null): Stroke | null {
  return stroke && strokeWith(stroke, drawnWidths(doc, perSide(stroke.weight)) as Stroke["weight"]);
}

/**
 * A weight typed in, in 0.5px steps, what a 2x screen draws as written,
 * whatever screen it is typed on: down to the step below, and 0.5 for a weight
 * under it. 0 stays 0, no stroke.
 */
export function stepped(weight: number): number {
  return weight > 0 ? Math.max(0.5, Math.floor(weight * 2) / 2) : 0;
}
