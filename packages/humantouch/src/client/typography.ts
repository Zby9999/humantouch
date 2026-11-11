/**
 * Text in design language, read from and written as CSS: a text layer's font,
 * weight and size, line height and letter spacing, alignment, color, case and
 * decoration. Each is written on the text layer itself, and its inline
 * fragments (a bold run, a link) follow it by inheritance, but for a fragment
 * that has a value of its own, which it keeps.
 */
import { declaredByEdit, rematch } from "./canvas-style";
import type { Fragment } from "./changeset";
import { openingTag } from "./layer-target";
import type { Definition } from "./property-table";
import { wordsOf } from "./words";
import { cssColor, type Color, type ColorReader } from "./paint";
import { flatParent } from "./shadow-roots";
import { sourcesOf } from "./style-source";

export type TextAlign = "left" | "center" | "right" | "justify";
/** As typed, UPPER, lower or Title, as Figma names the case. */
export type TextCase = "none" | "upper" | "lower" | "title";
export type TextDecoration = "none" | "underline" | "strikethrough";
/** A length in px, or a share of the font size in %, as Figma has them. */
export interface TextLength {
  value: number;
  unit: "px" | "%";
}
/** Auto: the font's own line height (CSS `normal`). */
export type LineHeight = "auto" | TextLength;

export interface TypographyValues {
  /** The font family, by name: the first of the text's stack of fonts that is there. */
  fontFamily: string;
  /** Font size in px. */
  fontSize: number;
  /** 100 to 900. */
  fontWeight: number;
  textColor: Color;
  textAlign: TextAlign;
  textCase: TextCase;
  textDecoration: TextDecoration;
  lineHeight: LineHeight;
  letterSpacing: TextLength;
}

export type TypographyProperty = keyof TypographyValues;

const TEXT_CASES: Record<TextCase, string> = { none: "none", upper: "uppercase", lower: "lowercase", title: "capitalize" };
const DECORATIONS: Record<TextDecoration, string> = { none: "none", underline: "underline", strikethrough: "line-through" };

/** A text style kept in one CSS property, read and written as it says. */
function textStyle<V>(css: string, read: (computed: string, el: Element) => V, write: (value: V) => string): Definition<V> {
  const definition: Definition<V> = {
    kinds: ["text"],
    read: (el) => read(getComputedStyle(el).getPropertyValue(css), el),
    write: (value) => ({ [css]: write(value) }),
    writes: [css],
    sets: [css],
  };
  // Inherited, it is set where the text inherits it from.
  return { ...definition, keeps: keepsOwn(css, definition.read), setOn: css === "text-decoration-line" ? undefined : inheritedFrom(css) };
}

/**
 * Two values of each inherited text style, far apart: what a fragment comes to
 * with the text at each tells whether it follows the text (as inherited, or
 * relative to it: `bolder`, `0.75em`) or keeps a value of its own.
 */
const PROBES: Record<string, [string, string]> = {
  "font-family": ["serif", "monospace"],
  "font-weight": ["100", "900"],
  "font-size": ["1px", "100px"],
  "line-height": ["1", "3"],
  "letter-spacing": ["0px", "10px"],
  color: ["rgb(1, 2, 3)", "rgb(4, 5, 6)"],
  "text-transform": ["none", "uppercase"],
};

/**
 * The inline fragments of a text layer that keep a value of their own of
 * `css`: those that stay as they are whatever the text's value is. A
 * decoration is not inherited but drawn across the fragments: a fragment's own
 * is one it draws, other than the layer's.
 */
function keepsOwn<V>(css: string, read: (el: Element, colors: ColorReader) => V) {
  // A line height's plain number, as computed, is inherited as it is: read typed, it is not taken for the px it comes to.
  const valueOf = (el: Element) => (css === "line-height" ? String(el.computedStyleMap().get(css)) : getComputedStyle(el).getPropertyValue(css));
  return (layer: Element, colors: ColorReader): Fragment[] => {
    const fragments = [...layer.querySelectorAll("*")];
    let keeps: (el: Element) => boolean;
    if (css === "text-decoration-line") {
      keeps = (el) => !["none", valueOf(layer)].includes(valueOf(el));
    } else {
      const [a, b] = PROBES[css].map((probe) => withStyle(layer, css, probe, () => new Map([layer, ...fragments].map((el) => [el, valueOf(el)]))));
      const follows = (el: Element) => el === layer || a.get(el) !== b.get(el);
      // Not one that only sits in a fragment that keeps its own, as it is.
      keeps = (el) => !follows(el) && (follows(el.parentElement!) || a.get(el) !== a.get(el.parentElement!));
    }
    return fragments.flatMap((el) => {
      const text = wordsOf(el, false);
      if (!text || getComputedStyle(el).display === "none" || !keeps(el)) return [];
      return [{ element: openingTag(el), text: text.length > MAX_WORDS ? `${text.slice(0, MAX_WORDS - 1)}…` : text, value: read(el, colors) }];
    });
  };
}

/** Runs `look` with `css` of the element set to `value`, and sets it back as it was: nothing of it is painted. */
function withStyle<T>(el: Element, css: string, value: string, look: () => T): T {
  const style = (el as HTMLElement).style;
  const [was, priority] = [style.getPropertyValue(css), style.getPropertyPriority(css)];
  style.setProperty(css, value, "important");
  try {
    return look();
  } finally {
    if (was) style.setProperty(css, was, priority);
    else style.removeProperty(css);
    rematch(el);
  }
}

/** How much of a fragment's words a change shows. */
const MAX_WORDS = 40;

export const TYPOGRAPHY: { [P in TypographyProperty]: Definition<TypographyValues[P]> } = {
  fontFamily: {
    ...textStyle("font-family", (stack, el) => firstThere(el.ownerDocument, stack), String),
    // The family in the stack the page uses it in, which names what to fall back to and which the Agent can find in the project.
    write: (family, el) => ({ "font-family": stackOf(el.ownerDocument, family) }),
  },
  fontSize: textStyle("font-size", (css) => round(parseFloat(css)), (size) => `${size}px`),
  fontWeight: textStyle("font-weight", (css) => Number(css) || 400, String),
  textColor: {
    ...textStyle<Color>("color", () => ({ color: "", opacity: 1 }), cssColor),
    read: readColor,
    keeps: keepsOwn("color", readColor),
  },
  // Inline fragments have no alignment of their own.
  textAlign: { ...textStyle("text-align", readAlign, (align) => align), keeps: undefined },
  textCase: textStyle("text-transform", (css) => (Object.keys(TEXT_CASES) as TextCase[]).find((c) => TEXT_CASES[c] === css) ?? "none", (c) => TEXT_CASES[c]),
  textDecoration: textStyle(
    "text-decoration-line",
    // One line of the two Figma draws: an underline before a strikethrough; an overline is none of them.
    (css) => (css.includes("underline") ? "underline" : css.includes("line-through") ? "strikethrough" : "none"),
    (line) => DECORATIONS[line],
  ),
  lineHeight: {
    kinds: ["text"],
    read: readLineHeight,
    keeps: keepsOwn("line-height", readLineHeight),
    setOn: inheritedFrom("line-height"),
    write: (height, el) => ({ "line-height": height === "auto" ? "normal" : lengthCss(height, el, "line-height") }),
    writes: ["line-height"],
    sets: ["line-height"],
  },
  letterSpacing: {
    kinds: ["text"],
    read: readLetterSpacing,
    keeps: keepsOwn("letter-spacing", readLetterSpacing),
    setOn: inheritedFrom("letter-spacing"),
    write: (spacing, el) => ({ "letter-spacing": lengthCss(spacing, el, "letter-spacing") }),
    writes: ["letter-spacing"],
    sets: ["letter-spacing"],
  },
};

/** How a page writes a length of text: in a unit, or as a plain number (a line height's share of the font size). */
type Unit = "number" | "%" | "em" | "rem" | "px" | "normal";

const percent = (value: number): TextLength => ({ value, unit: "%" });

function readColor(el: Element, colors: ColorReader): Color {
  return colors.color(getComputedStyle(el).color);
}

/** Normal letter spacing is none: 0%, as Figma has it. */
function readLetterSpacing(el: Element): TextLength {
  const css = getComputedStyle(el).letterSpacing;
  return css === "normal" ? percent(0) : asWritten(el, "letter-spacing", parseFloat(css));
}

/** A line height without a unit is a share of the font size, which text in it of another size scales by. */
function readLineHeight(el: Element): LineHeight {
  // Typed as computed, a plain number stays one. The canvas's own CSSUnitValue is not this window's: read by its fields.
  const computed = el.computedStyleMap().get("line-height") as (CSSStyleValue & Partial<CSSUnitValue>) | undefined;
  if (String(computed) === "normal") return "auto";
  if (computed?.unit === "number") return percent(round(computed.value! * 100));
  return asWritten(el, "line-height", parseFloat(getComputedStyle(el).lineHeight));
}

/** A length of the text, `px` as the browser computes it: a share of its font size where it is written as one (in % or em), else in px. */
function asWritten(el: Element, css: string, px: number): TextLength {
  const unit = writtenUnit(el, css, true);
  if (unit === "%" || unit === "em") return percent(round((px / fontSizeOf(el)) * 100));
  return { value: round(px), unit: "px" };
}

/**
 * The CSS of a length of the text, in the unit the page writes it in: a share
 * of the font size as the page writes one (%, em, or a line height's plain
 * number), a length in px or rem. In the other unit, or where the page's cannot
 * be told, as Figma's: a share as a line height's plain number or a letter
 * spacing's em, a length in px.
 */
function lengthCss({ value, unit }: TextLength, el: Element, css: "line-height" | "letter-spacing"): string {
  const page = writtenUnit(el, css, false);
  if (unit === "px") return page === "rem" ? `${round(value / fontSizeOf(el.ownerDocument.documentElement), 4)}rem` : `${value}px`;
  if (page === "%" && css === "line-height") return `${value}%`;
  const share = round(value / 100, 4);
  return page === "em" || css === "letter-spacing" ? `${share}em` : String(share);
}

/**
 * The unit a length of the text is written in: by an edit, when `edits` (the
 * value the designer typed), else by the page, on the text itself or on the
 * nearest element above it that writes it, as it inherits from there. Null where it cannot be told (`var()`, `calc()`).
 */
function writtenUnit(el: Element, css: string, edits: boolean): Unit | null {
  const edited = edits ? declaredByEdit(el, css) : "";
  if (edited) return unitOf(edited);
  const value = declaring(el, css)?.value;
  return value ? unitOf(value) : null;
}

/** Where an inherited style of the text is set: on it, or on the element above it that the text inherits it from. */
function inheritedFrom(css: string) {
  return (el: Element) => declaring(el, css)?.el ?? el;
}

/**
 * Where the page sets an inherited style of text: on the text itself, or on
 * the nearest element above it that declares it, and its value as declared
 * (null where a stylesheet that cannot be read may). Undefined: nowhere, the browser's default.
 */
function declaring(el: Element, css: string): { el: Element; value: string | null } | undefined {
  for (let e: Element | null = el; e; e = flatParent(e)) {
    const [source] = sourcesOf(e, [css]);
    if (source.kind === "unknown") return { el: e, value: null };
    if (!source.declaration) continue;
    const value = source.declaration.slice(source.declaration.indexOf(":") + 1).trim();
    // Taken from the element above, as inherited.
    if (/^(inherit|unset|revert|revert-layer)$/.test(value)) continue;
    return { el: e, value };
  }
}

function unitOf(value: string): Unit | null {
  if (value === "normal") return "normal";
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) return "number";
  return (/^[+-]?(?:\d+\.?\d*|\.\d+)(%|rem|em|px)$/.exec(value)?.[1] as Unit | undefined) ?? null;
}

function fontSizeOf(el: Element): number {
  return parseFloat(getComputedStyle(el).fontSize);
}

/** A font the panel offers: a family, and the weights it can be set in. */
export interface Font {
  family: string;
  weights: number[];
}

/**
 * The fonts the page has: its web fonts, each in the weights of its faces the
 * project declares (with `@font-face`), loaded or not yet, as the browser loads
 * one as soon as text uses it (ticket 140), but not those that failed to load;
 * and of each stack of fonts its text uses, the first that is there (a font of
 * the system), in the weights the text uses it in. Not every font of the
 * system: those the page uses only. By name.
 *
 * A family whose faces only name fonts of the system (`local()`, no `url()`),
 * as next/font's `__X_Fallback_…` sizing a font's fallback does, is one of the
 * system's under another name: offered as those are, only where the text uses
 * it first (ticket 149).
 */
export function fontsOf(doc: Document): Font[] {
  const fonts = new Map<string, { family: string; weights: Set<number> }>();
  // A weight split into subsets by `unicode-range`, a face each, is one weight: listed once.
  const add = (family: string, weights: number[]) => {
    const key = family.toLowerCase();
    if (!fonts.has(key)) fonts.set(key, { family, weights: new Set() });
    for (const weight of weights) fonts.get(key)!.weights.add(weight);
  };
  const local = localOnly(doc);
  doc.fonts.forEach((face) => {
    const family = unquoted(face.family);
    if (face.status !== "error" && !local.has(family.toLowerCase())) add(family, weightsOf(face.weight));
  });
  for (const el of textOf(doc)) {
    const style = getComputedStyle(el);
    const family = firstThere(doc, style.fontFamily);
    if (!isWebFont(doc, family) || local.has(family.toLowerCase())) add(family, [Number(style.fontWeight)]);
  }
  return [...fonts.values()]
    .map(({ family, weights }) => ({ family, weights: [...weights].sort((a, b) => a - b) }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

/**
 * The families, lowercased, whose every face the page has is an `@font-face`
 * rule it can read whose `src` has no `url()`: read from the rules, as a
 * `FontFace` does not tell its `src`. A family with a face from a sheet that
 * cannot be read (another origin's) or added by script is not one: whether
 * that face is the system's cannot be told.
 */
function localOnly(doc: Document): Set<string> {
  const rules = new Map<string, { local: number; url: boolean }>();
  const visit = (list: CSSRuleList) => {
    for (const rule of list) {
      // Rules live in the canvas's realm, so they are told by type, not `instanceof`.
      if (rule.type === CSSRule.FONT_FACE_RULE) {
        const style = (rule as CSSFontFaceRule).style;
        const key = unquoted(style.getPropertyValue("font-family").trim()).toLowerCase();
        const family = rules.get(key) ?? { local: 0, url: false };
        if (/\burl\(/i.test(style.getPropertyValue("src"))) family.url = true;
        else family.local++;
        rules.set(key, family);
      } else if (rule.type === CSSRule.IMPORT_RULE) {
        const sheet = (rule as CSSImportRule).styleSheet;
        if (sheet) read(sheet);
      } else if ("cssRules" in rule) visit(rule.cssRules as CSSRuleList);
    }
  };
  const read = (sheet: CSSStyleSheet) => {
    try {
      visit(sheet.cssRules);
    } catch {
      // Another origin's sheet: its faces cannot be read; they are counted below as faces no rule accounts for.
    }
  };
  for (const sheet of doc.styleSheets) read(sheet);
  for (const sheet of doc.adoptedStyleSheets ?? []) read(sheet);
  const faces = new Map<string, number>();
  doc.fonts.forEach((face) => {
    const key = unquoted(face.family).toLowerCase();
    faces.set(key, (faces.get(key) ?? 0) + 1);
  });
  const local = new Set<string>();
  for (const [key, family] of rules) if (!family.url && (faces.get(key) ?? 0) <= family.local) local.add(key);
  return local;
}

/** A face's weights: one, or each hundred in a range (a variable font's). */
function weightsOf(descriptor: string): number[] {
  const [from, to = from] = descriptor.split(/\s+/).map((w) => (w === "bold" ? 700 : w === "normal" ? 400 : Number(w)));
  if (from === to) return [from];
  const weights = [from];
  for (let w = Math.ceil(from / 100) * 100; w <= to; w += 100) if (w !== from) weights.push(w);
  if (weights.at(-1) !== to) weights.push(to);
  return weights;
}

/** The page's text: the elements that hold words of their own. */
function textOf(doc: Document): Element[] {
  return [...doc.body.querySelectorAll("*")].filter((el) => [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim()));
}

/** The first font of a stack (a computed `font-family`) that is there, by name; the last, when none is. */
function firstThere(doc: Document, stack: string): string {
  const names = familiesOf(stack);
  return unquoted(names.find((name) => isThere(doc, name)) ?? names.at(-1) ?? "");
}

/** The stack of fonts the page uses `family` in: as its text has it; the family alone, when no text has it first. */
function stackOf(doc: Document, family: string): string {
  for (const el of textOf(doc)) {
    const stack = getComputedStyle(el).fontFamily;
    if (firstThere(doc, stack) === family) return stack;
  }
  return /^[a-z-]+$/i.test(family) ? family : `"${family.replace(/"/g, '\\"')}"`;
}

function isWebFont(doc: Document, family: string): boolean {
  let found = false;
  doc.fonts.forEach((face) => {
    if (face.status !== "error" && unquoted(face.family).toLowerCase() === family.toLowerCase()) found = true;
  });
  return found;
}

/** Whether the system has the font a stack names, so far as the page can tell: found by measuring, once per document. */
const systemFonts = new WeakMap<Document, Map<string, boolean>>();

/** Whether a font, named as a stack names it (a quoted name, or a generic family's keyword), is there: a web font, or one of the system. */
function isThere(doc: Document, name: string): boolean {
  if (isWebFont(doc, unquoted(name))) return true;
  let known = systemFonts.get(doc);
  if (!known) systemFonts.set(doc, (known = new Map()));
  if (!known.has(name)) known.set(name, measures(doc, name));
  return known.get(name)!;
}

/** Text in a font that is not there falls back to the next: it measures as the fallback does, with either of two. */
function measures(doc: Document, name: string): boolean {
  const context = doc.createElement("canvas").getContext("2d")!;
  const SAMPLE = "mmmmmmmmmmlli1WQ@#";
  return ["monospace", "serif"].some((fallback) => {
    context.font = `72px ${fallback}`;
    const width = context.measureText(SAMPLE).width;
    context.font = `72px ${name}, ${fallback}`;
    return context.measureText(SAMPLE).width !== width;
  });
}

/** The families a computed `font-family` names, as it names them: commas in quotes are part of a name. */
function familiesOf(stack: string): string[] {
  return (stack.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,]+/g) ?? []).map((name) => name.trim()).filter(Boolean);
}

function unquoted(name: string): string {
  return /^(["']).*\1$/.test(name) ? name.slice(1, -1).replace(/\\(.)/g, "$1") : name;
}

/** Start and end are left and right, or right and left, as the text runs. */
function readAlign(css: string, el: Element): TextAlign {
  const align = css.replace(/^-webkit-/, "");
  if (align === "center" || align === "justify" || align === "left" || align === "right") return align;
  const rtl = getComputedStyle(el).direction === "rtl";
  return (align === "end") !== rtl ? "right" : "left";
}

function round(n: number, decimals = 2): number {
  const by = 10 ** decimals;
  return Math.round(n * by) / by;
}
