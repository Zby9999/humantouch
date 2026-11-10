/**
 * ⌥⌘C and ⌥⌘V, as Figma's Copy properties and Paste properties (ticket 117):
 * a layer's style, recorded inside the editor alone (the system clipboard is
 * left alone, as ⌘C leaves it), set on other layers. What is copied is how a
 * layer looks: its fill, stroke, corners, effects, opacity and clipping, and
 * its text styles. Not where it is or how big (its X and Y, its size and its
 * minimums and maximums), not how a Stack or a Grid lays its layers out
 * (direction, gaps, padding, alignment, wrap, columns), not whether it is
 * shown, and not its words. Each value pasted is an ordinary style change,
 * as the Design panel makes it: across the instances of the usage, at the
 * breakpoint of the view worked in (ADR 0008), its Variables those picked for
 * it or those the code writes it with (ticket 119), else those its value is.
 * One paste is one step.
 */
import type { Editor } from "./edit-commands";
import type { Picked } from "./changeset";
import { textCanDraw, type Shadow } from "./effects";
import type { Layer } from "./layers";
import { same, type Fill, type Property, type PropertyValues } from "./property-table";
import { pickedIn, sameVariable } from "./variables";

/** What is copied, in the order it is pasted: the Design panel's order. */
export const STYLE_PROPERTIES = [
  "fill",
  "stroke",
  "radius",
  "opacity",
  "clip",
  "shadows",
  "textShadows",
  "layerBlur",
  "backgroundBlur",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textCase",
  "textDecoration",
  "textColor",
] as const satisfies readonly Property[];

export type StyleProperty = (typeof STYLE_PROPERTIES)[number];

/** One value copied, and the Variables of its parts, if any: picked this round, or written in the code (ticket 119). */
interface Copied<P extends Property = Property> {
  value: PropertyValues[P];
  picked?: Picked;
}

/** A layer's style as ⌥⌘C records it: the values it offers, as the view worked in shows them. */
export type CopiedStyle = Partial<{ [P in StyleProperty]: Copied<P> }>;

/**
 * The layer's style, as the view worked in shows it: each value the layer
 * offers. Null when it offers none (a locked layer, loose text with no element of its own).
 */
export function copyStyle(editor: Editor, layer: Layer): CopiedStyle | null {
  if (layer.kind === "locked") return null;
  const style: Record<string, Copied> = {};
  for (const property of STYLE_PROPERTIES) {
    if (!editor.can(layer, property)) continue;
    // Those picked for it this round, and those the code writes it with (ticket 119): pasted, each is that Variable still.
    const chosen = pickedIn(editor.variables(layer, property));
    const code = editor.inCode(layer, property);
    const picked = chosen || code ? { ...code, ...chosen } : undefined;
    style[property] = { value: editor.read(layer, property), ...(picked && { picked }) };
  }
  return Object.keys(style).length ? (style as CopiedStyle) : null;
}

/** A value copied, as another property takes it: text's color as a fill and back, text shadows as shadows and back. */
interface Mapped {
  property: Property;
  value: unknown;
  picked?: Picked;
}

/**
 * What the layer takes of the style copied, property by property, in the
 * order pasted: each property it offers, and takes that value of; what is of
 * text on a box, or of a box on text, as that has it, as Figma's text has its
 * color as a fill: text's color as a solid fill and a solid fill as text's
 * color; drop shadows as text shadows, those text can draw (no spread, no
 * inner shadow), and text shadows as shadows. What is not taken is left as it is.
 */
export function styleFor(editor: Editor, layer: Layer, style: CopiedStyle): Mapped[] {
  if (layer.kind === "locked") return [];
  const mapped = new Map<Property, Mapped>();
  const take = (property: Property, value: unknown, picked?: Picked) => {
    if (mapped.has(property) || !editor.can(layer, property, value as never)) return;
    mapped.set(property, { property, value, ...(picked && { picked }) });
  };
  for (const property of STYLE_PROPERTIES) {
    const copied = style[property] as Copied | undefined;
    if (copied) take(property, copied.value, copied.picked);
  }
  // Of text on a box, or of a box on text, what each has as the other.
  const { textColor, fill, shadows, textShadows } = style;
  if (textColor && !style.fill) {
    take("fill", { type: "solid", color: textColor.value.color, opacity: textColor.value.opacity } satisfies Fill, renamed(textColor.picked, "", "color"));
  }
  if (fill && !style.textColor && fill.value?.type === "solid") {
    take("textColor", { color: fill.value.color, opacity: fill.value.opacity }, renamed(fill.picked, "color", ""));
  }
  if (shadows && !style.textShadows && textCanDraw(shadows.value)) take("textShadows", shadows.value, shadowColors(shadows.picked));
  if (textShadows && !style.shadows) take("shadows", textShadows.value as Shadow[], textShadows.picked);
  return STYLE_PROPERTIES.flatMap((property) => mapped.get(property) ?? []);
}

/**
 * Sets the style copied on each layer, as one step: each value as the Design
 * panel sets it (`Editor.set`), the Variables picked for it picked again.
 * Returns the layers it changed: none when each already had all it takes.
 */
export function pasteStyle(editor: Editor, layers: Layer[], style: CopiedStyle): Layer[] {
  const pasted: Layer[] = [];
  editor.batch(() => {
    for (const layer of layers) {
      // Read all before any is set: a value set restyles the page, and each read after it would lay it out again.
      const changed = styleFor(editor, layer, style).filter(({ property, value, picked }) => changes(editor, layer, property, value, picked));
      for (const { property, value, picked } of changed) editor.set(layer, property, value as never, picked && { variables: picked });
      if (changed.length) pasted.push(layer);
    }
  });
  return pasted;
}

/**
 * Whether setting `value` on the layer's `property`, with the Variables
 * `picked`, changes anything, as `Editor.set` finds it: another value; or the
 * same value as changed this round, with a Variable picked for a part that
 * it does not have picked now. The same value with the same Variables is no
 * change, nor is a Variable picked for a value the layer has of its own.
 */
function changes(editor: Editor, layer: Layer, property: Property, value: unknown, picked: Picked | undefined): boolean {
  if (!same(editor.read(layer, property), value)) return true;
  const now = picked && editor.variables(layer, property);
  if (!now) return false;
  return Object.entries(picked!).some(([part, variable]) => !(now[part]?.picked && sameVariable(now[part], variable)));
}

/** The Variable picked for part `from`, as part `to` of another property. */
function renamed(picked: Picked | undefined, from: string, to: string): Picked | undefined {
  const variable = picked?.[from];
  return variable ? { [to]: variable } : undefined;
}

/** Of the Variables picked for shadows, their colors': text shadows have no shadow Variable as a whole. */
function shadowColors(picked: Picked | undefined): Picked | undefined {
  if (!picked) return undefined;
  const colors = Object.entries(picked).filter(([part]) => part !== "");
  return colors.length ? Object.fromEntries(colors) : undefined;
}
