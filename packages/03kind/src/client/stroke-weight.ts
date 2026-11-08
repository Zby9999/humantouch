/**
 * Stroke weights as written and as drawn. The browser draws a border a whole
 * number of physical pixels wide (at least one), and reads it back so: 1.5px
 * is drawn 1px on a 1x screen, and as it is on a 2x one. The editor reads a
 * weight as the style that sets it writes it, so the panel shows what the code
 * says on any screen, and `done` compares it so (ADR 0006).
 */
import { declaredByEdit } from "./canvas-style";
import { readStroke, strokeWith, type ColorReader, type Stroke } from "./paint";
import { declarationsOf } from "./style-source";

const SIDES = ["top", "right", "bottom", "left"];

/**
 * The layer's stroke, each side's weight as the style that sets it writes it;
 * as drawn when that cannot be read (through `var()`, in units other than px),
 * or does not draw as the layer is drawn (a rule that is not the one that applies).
 */
export function readWrittenStroke(el: Element, colors: ColorReader): Stroke | null {
  const sides = readSides(el, colors);
  return sides ? asWritten(sides) : editedAtZero(el, colors);
}

/**
 * A stroke an edit draws at 0, as in Figma: still a stroke, with its color and
 * line, so its weight can go up again. Only an edit's line counts: the page's
 * styles give many a layer a line of 0 (Tailwind's `border: 0 solid`), and
 * those have no stroke.
 */
function editedAtZero(el: Element, colors: ColorReader): Stroke | null {
  const line = declaredByEdit(el, "border-style");
  if (!line || /^(none|hidden)$/.test(line)) return null;
  return {
    ...colors.color(getComputedStyle(el).getPropertyValue("border-top-color")),
    weight: 0,
    style: /^(dashed|dotted)$/.test(line) ? "dashed" : "solid",
  };
}

/**
 * Whether the layer shows `after` (ADR 0006): each side's weight compared as
 * the style that sets it writes it, so 1.5px is told from the 1px a 1x screen
 * draws both at; where that cannot be read, as drawn, `drawnAfter` being
 * `after` drawn in the layer's document beforehand (see `drawnStroke`).
 */
export function showsStroke(el: Element, colors: ColorReader, after: Stroke | null, drawnAfter: Stroke | null): boolean {
  const sides = readSides(el, colors);
  // A stroke at 0 draws nothing, as no stroke does.
  if (after && perSide(after.weight).every((weight) => weight === 0)) after = drawnAfter = null;
  if (!sides || !after || !drawnAfter) return !sides && !after;
  const [weights, drawnWeights] = [perSide(after.weight), perSide(drawnAfter.weight)];
  const actual = asWritten(sides);
  const expected = strokeWith(after, weights.map((weight, i) => (sides.written[i] === null ? drawnWeights[i] : weight)) as Stroke["weight"]);
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/**
 * The layer's stroke as drawn, with each side's weight as drawn and as
 * written: null for a side not drawn, or whose weight as written cannot be
 * read or does not draw as the side is drawn.
 */
function readSides(el: Element, colors: ColorReader): Sides | null {
  const stroke = readStroke(el, colors);
  if (!stroke) return null;
  const drawn = perSide(stroke.weight);
  const written = writtenWidths(el, drawn.map((weight) => weight > 0));
  const redrawn = drawnWidths(el.ownerDocument, written.map((w) => w ?? 0));
  return { stroke, drawn, written: written.map((w, i) => (w !== null && redrawn[i] === drawn[i] ? w : null)) };
}

interface Sides {
  stroke: Stroke;
  drawn: number[];
  written: (number | null)[];
}

/** The stroke, each side as written where it can be read, else as drawn. */
function asWritten({ stroke, drawn, written }: Sides): Stroke | null {
  return strokeWith(stroke, drawn.map((weight, i) => written[i] ?? weight) as Stroke["weight"]);
}

/** The widths borders are drawn at, as found in each document, by the widths written and the screen's pixel density. */
const drawnIn = new WeakMap<Document, Map<string, number[]>>();

/**
 * The widths the browser draws borders of `widths` px at in `doc`, top, right,
 * bottom and left; found once for each set of widths and pixel density, so
 * the canvas is not changed each time the Design panel reads a stroke.
 */
function drawnWidths(doc: Document, widths: number[]): number[] {
  const key = `${doc.defaultView?.devicePixelRatio} ${widths.join(" ")}`;
  let known = drawnIn.get(doc);
  if (!known) drawnIn.set(doc, (known = new Map()));
  let drawn = known.get(key);
  if (!drawn) known.set(key, (drawn = probeWidths(doc, widths)));
  return [...drawn];
}

/** Those widths, drawn on an element put in `doc` and taken out again at once, before anything is painted. */
function probeWidths(doc: Document, widths: number[]): number[] {
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

/**
 * Each side's width as written, in px, top, right, bottom and left: by an
 * edit on the canvas, or else by what sets it in the page's styles, read in
 * one pass over them; null for a side not drawn, or not written in px.
 */
function writtenWidths(el: Element, isDrawn: boolean[]): (number | null)[] {
  // An edit's declaration, on top of everything.
  const sides = SIDES.map((side, i) => {
    const property = `border-${side}-width`;
    return { property, drawn: isDrawn[i], edited: isDrawn[i] ? editedWidth(el, property) : "" };
  });
  const unread = sides.filter((side) => side.drawn && !side.edited).map((side) => side.property);
  const declarations = unread.length ? declarationsOf(el, unread) : [];
  return sides.map(({ property, drawn, edited }) => {
    if (!drawn) return null;
    if (edited) return pxOf(edited);
    const declaration = declarations[unread.indexOf(property)];
    return declaration ? pxOf(declaration.slice(declaration.indexOf(":") + 1)) : null;
  });
}

/** A side's width as an edit declares it: on its own, or as one of the four `border-width` sets; empty when no edit does. */
function editedWidth(el: Element, property: string): string {
  const own = declaredByEdit(el, property);
  if (own) return own;
  const all = declaredByEdit(el, "border-width");
  if (!all) return "";
  const style = el.ownerDocument.createElement("div").style;
  style.setProperty("border-width", all);
  return style.getPropertyValue(property);
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
 * under it. 0 stays 0, a stroke drawn on no side.
 */
export function stepped(weight: number): number {
  return weight > 0 ? Math.max(0.5, Math.floor(weight * 2) / 2) : 0;
}
