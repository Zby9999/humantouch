/**
 * Where a layer's value comes from: the declaration that wins the cascade for
 * a CSS property of an element on the canvas, as the browser has it, with what
 * the Agent needs to find it in the project (file, CSS layer, class name).
 * The browser offers no such lookup to pages, so the cascade is resolved here:
 * importance, the style attribute, CSS layers, specificity, then order.
 */
import { EDIT_STYLES_ATTR } from "./style-marks";

/** What sets some of the CSS properties a change is about. */
export interface StyleSource {
  /** The CSS properties it sets, of those asked about. */
  properties: string[];
  /**
   * `rule`: a rule of a stylesheet; `inline`: the element's style attribute;
   * `none`: nothing, the browser default applies; `unknown`: nothing readable
   * sets it, but a stylesheet from another origin, which cannot be read, may.
   */
  kind: "rule" | "inline" | "none" | "unknown";
  selector: string | null;
  /** The file the stylesheet comes from, when the dev server says (a path, or a URL); else null. */
  file: string | null;
  /** The CSS layer the rule is in, dotted when nested; null: not in a layer. */
  layer: string | null;
  important: boolean;
  /** The rule is a single class, and the element carries that class. */
  className: string | null;
  /** The declaration as written: the shorthand, when the rule sets it through one. */
  declaration: string | null;
}

/** Before any edit, the element's own style attribute, as the page wrote it: edits may take the important declarations off it. */
export const ORIGINAL_STYLE_ATTR = "data-tk-original-style";
/**
 * On an element the freezer pinned where the designer saw it (placed against
 * the viewport, which the canvas has none of): the CSS properties it wrote into
 * the style attribute. They are the freezer's, not the page's.
 */
export const PINNED_ATTR = "data-tk-pinned";
/** On a pinned element, how far (`x y`, px) it was shifted with the page's scroll: the canvas has it there, the page does not. */
export const PIN_OFFSET_ATTR = "data-tk-pin-offset";
/** On a stylesheet the freezer inlined from a `<link>`: where it was loaded from. */
export const SHEET_HREF_ATTR = "data-tk-href";
/** Where Vite's dev server says a stylesheet comes from. */
const VITE_ID_ATTR = "data-vite-dev-id";
/** Styles of the canvas itself, not the page's. */
const CANVAS_STYLES_ATTR = "data-tk-canvas-styles";

const SIDES = ["top", "right", "bottom", "left"];
const BORDER_PARTS = ["width", "style", "color"];

/** The shorthands that can set a longhand, as written in a rule. */
const SHORTHANDS: Record<string, string[]> = {
  "background-color": ["background"],
  "flex-grow": ["flex"],
  "flex-shrink": ["flex"],
  "flex-basis": ["flex"],
  "flex-direction": ["flex-flow"],
  "flex-wrap": ["flex-flow"],
  "row-gap": ["gap"],
  "column-gap": ["gap"],
  "justify-content": ["place-content"],
  "align-items": ["place-items"],
  "align-self": ["place-self"],
  "overflow-x": ["overflow"],
  "overflow-y": ["overflow"],
  top: ["inset", "inset-block", "inset-block-start"],
  left: ["inset", "inset-inline", "inset-inline-start"],
  ...Object.fromEntries(SIDES.map((side) => [`padding-${side}`, ["padding"]])),
  "border-top-left-radius": ["border-radius"],
  "border-top-right-radius": ["border-radius"],
  "border-bottom-right-radius": ["border-radius"],
  "border-bottom-left-radius": ["border-radius"],
};

/**
 * Shorthands that set a longhand reported as itself: written through `var()`,
 * they leave it empty to read (the browser substitutes only when it computes),
 * yet set it all the same. The most particular first.
 */
const THROUGH_VAR: Record<string, string[]> = Object.fromEntries([
  ...SIDES.flatMap((side) => BORDER_PARTS.map((part) => [`border-${side}-${part}`, [`border-${side}`, `border-${part}`, "border"]])),
  ...["block-start", "block-end", "inline-start", "inline-end"].flatMap((side) => {
    const axis = side.slice(0, side.indexOf("-"));
    return BORDER_PARTS.map((part) => [`border-${side}-${part}`, [`border-${side}`, `border-${axis}-${part}`, `border-${axis}`]]);
  }),
]);

type Specificity = [number, number, number];

/** One declaration that applies to the element, with what ranks it in the cascade. */
interface Candidate {
  /** Declarations from one place share it: their properties are reported together. */
  key: string;
  source: Omit<StyleSource, "properties">;
  inline: boolean;
  /** Position among CSS layers: one index per level, `Infinity` for declarations directly at that level. */
  layerPath: number[];
  specificity: Specificity;
  order: number;
}

/** For each of `properties` of `el`, what sets it now; properties set from one place are grouped. */
export function sourcesOf(el: Element, properties: string[]): StyleSource[] {
  const { winners, unreadable } = cascade(el, properties);
  const sources = new Map<string, StyleSource>();
  for (const property of properties) {
    const winner = winners.get(property);
    const key = winner?.key ?? "none";
    const source = sources.get(key);
    if (source) source.properties.push(property);
    else if (winner) sources.set(key, { properties: [property], ...winner.source });
    else {
      const kind = unreadable ? "unknown" : "none";
      sources.set(key, { properties: [property], kind, selector: null, file: null, layer: null, important: false, className: null, declaration: null });
    }
  }
  return [...sources.values()];
}

/**
 * For each of `properties` of `el`, the declaration that sets it now, as
 * written (`border-top-width: 1px`, or the shorthand it is set through); null
 * when none does. Each its own, where `sourcesOf` reports one per place.
 */
export function declarationsOf(el: Element, properties: string[]): (string | null)[] {
  const { winners } = cascade(el, properties);
  return properties.map((property) => winners.get(property)?.source.declaration ?? null);
}

/**
 * For each list of CSS properties of `el`, the declaration that wins the
 * cascade among all of them, as written, and the class its rule is (see
 * `StyleSource`); null when none of them is set. A list holds the properties
 * that set the same on the element, physical and logical (`padding-left`,
 * `padding-inline-start`, `padding-inline`). One walk of the cascade for all.
 */
export function winnersAmong(el: Element, lists: string[][]): ({ declaration: string; className: string | null } | null)[] {
  const { winners } = cascade(el, [...new Set(lists.flat())]);
  return lists.map((list) => {
    const winner = list.reduce<Candidate | null>((best, property) => {
      const c = winners.get(property) ?? null;
      return c && (!best || beats(c, best)) ? c : best;
    }, null);
    return winner?.source.declaration ? { declaration: winner.source.declaration, className: winner.source.className } : null;
  });
}

/** The declaration that wins the cascade for each of `properties` of `el` (null: none), and whether any stylesheet could not be read. */
function cascade(el: Element, properties: string[]): { winners: Map<string, Candidate | null>; unreadable: boolean } {
  const doc = el.ownerDocument;
  const candidates = new Map<string, Candidate[]>(properties.map((p) => [p, []]));
  const layers = new LayerOrder();
  const view = doc.defaultView!;
  const logical = logicalBorders(el);
  let order = 0;
  let unreadable = false;

  /** The declarations of a style rule, or of a nested block of them, for `selector`. */
  const declare = (style: CSSStyleDeclaration, selector: string, file: string | null, layer: string[]) => {
    const match = bestMatch(el, selector);
    if (!match) return;
    const position = order++;
    for (const property of properties) {
      const declared = declarationIn(style, property, logical[property]);
      if (!declared) continue;
      candidates.get(property)!.push({
        key: `rule ${position}`,
        source: {
          kind: "rule",
          selector: match.selector,
          file,
          layer: layer.length ? layer.join(".") : null,
          important: declared.important,
          className: classNameOf(el, match.selector),
          declaration: declared.text,
        },
        inline: false,
        layerPath: layers.path(layer),
        specificity: match.specificity,
        order: position,
      });
    }
  };

  const visit = (rules: CSSRuleList, file: string | null, layer: string[], parent: string | null) => {
    for (const rule of rules) {
      switch (rule.constructor.name) {
        case "CSSStyleRule": {
          const style = rule as CSSStyleRule;
          const selector = parent === null ? style.selectorText : nest(style.selectorText, parent);
          declare(style.style, selector, file, layer);
          if (style.cssRules?.length) visit(style.cssRules, file, layer, selector);
          break;
        }
        // Declarations nested in a condition, or after a nested rule, apply to the rule they sit in.
        case "CSSNestedDeclarations":
          if (parent !== null) declare((rule as CSSStyleRule).style, parent, file, layer);
          break;
        case "CSSMediaRule":
          if (matchesMedia((rule as CSSMediaRule).media)) visit((rule as CSSMediaRule).cssRules, file, layer, parent);
          break;
        case "CSSSupportsRule":
          if (CSS.supports((rule as CSSSupportsRule).conditionText)) visit((rule as CSSSupportsRule).cssRules, file, layer, parent);
          break;
        case "CSSContainerRule": // Taken as matching: which container queries hold is not worth resolving here.
          visit((rule as CSSGroupingRule).cssRules, file, layer, parent);
          break;
        case "CSSLayerStatementRule":
          for (const name of (rule as CSSLayerStatementRule).nameList) layers.declare([...layer, ...name.split(".")]);
          break;
        case "CSSLayerBlockRule": {
          const name = (rule as CSSLayerBlockRule).name;
          const inner = [...layer, ...(name ? name.split(".") : [layers.anonymous()])];
          layers.declare(inner);
          visit((rule as CSSLayerBlockRule).cssRules, file, inner, parent);
          break;
        }
        case "CSSImportRule": {
          const imported = (rule as CSSImportRule).styleSheet;
          const condition = (rule as CSSImportRule & { supportsText?: string | null }).supportsText;
          if (!matchesMedia((rule as CSSImportRule).media) || (condition && !CSS.supports(condition))) break;
          const rules = imported && readRules(imported);
          if (imported && !rules) unreadable = true;
          const name = (rule as CSSImportRule).layerName;
          const inner = name === null ? layer : [...layer, ...(name ? name.split(".") : [layers.anonymous()])];
          if (name !== null) layers.declare(inner);
          if (rules) visit(rules, imported!.href ?? file, inner, parent);
          break;
        }
      }
    }
  };

  /** Media that do not match (print, another width) leave their rules out. */
  const matchesMedia = (media: MediaList) => !media.mediaText || view.matchMedia(media.mediaText).matches;

  for (const sheet of doc.styleSheets) {
    const owner = sheet.ownerNode as Element | null;
    if (owner?.hasAttribute(CANVAS_STYLES_ATTR) || owner?.hasAttribute(EDIT_STYLES_ATTR) || sheet.disabled || !matchesMedia(sheet.media)) continue;
    const rules = readRules(sheet);
    if (!rules) unreadable = true;
    else visit(rules, owner?.getAttribute(VITE_ID_ATTR) ?? owner?.getAttribute(SHEET_HREF_ATTR) ?? sheet.href, [], null);
  }

  // The style attribute as the page wrote it, before any edit added to it, and without what the freezer pinned.
  const original = el.getAttribute(ORIGINAL_STYLE_ATTR) ?? el.getAttribute("style");
  if (original) {
    const style = doc.createElement("div").style;
    style.cssText = original;
    const pinned = pinnedOf(el);
    for (const property of properties) {
      if (pinned.includes(property)) continue;
      const declared = declarationIn(style, property, logical[property]);
      if (!declared) continue;
      candidates.get(property)!.push({
        key: "inline",
        source: { kind: "inline", selector: null, file: null, layer: null, important: declared.important, className: null, declaration: declared.text },
        inline: true,
        layerPath: [Infinity],
        specificity: [0, 0, 0],
        order: Infinity,
      });
    }
  }

  const winners = new Map(properties.map((property) => [property, candidates.get(property)!.reduce<Candidate | null>((best, c) => (!best || beats(c, best) ? c : best), null)]));
  return { winners, unreadable };
}

/** How far the freezer shifted a pinned element with the page's scroll: `[x, y]`, px. */
export function pinOffsetOf(el: Element): [number, number] {
  const [x = 0, y = 0] = (el.getAttribute(PIN_OFFSET_ATTR) ?? "").split(" ").map(Number);
  return [x || 0, y || 0];
}

/** The CSS properties the freezer pinned on `el`. */
export function pinnedOf(el: Element): string[] {
  return el.getAttribute(PINNED_ATTR)?.split(" ") ?? [];
}

/** The cascade, for declarations of one origin: importance, the style attribute, layers, specificity, order. */
function beats(a: Candidate, b: Candidate): boolean {
  if (a.source.important !== b.source.important) return a.source.important;
  if (a.inline !== b.inline) return a.inline;
  const layer = compare(a.layerPath, b.layerPath);
  // Important declarations rank layers the other way round: earlier layers, then those in no layer.
  if (layer) return a.source.important ? layer < 0 : layer > 0;
  const specificity = compare(a.specificity, b.specificity);
  if (specificity) return specificity > 0;
  return a.order > b.order;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity;
    const y = b[i] ?? -Infinity;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** CSS layers in the order they first appear, at each level of nesting. */
class LayerOrder {
  private children = new Map<string, string[]>();
  private unnamed = 0;

  declare(names: string[]) {
    for (let i = 0; i < names.length; i++) {
      const parent = names.slice(0, i).join(".");
      const siblings = this.children.get(parent) ?? [];
      if (!siblings.includes(names[i])) siblings.push(names[i]);
      this.children.set(parent, siblings);
    }
  }

  /** The position of declarations made directly in `names` (no names: in no layer). */
  path(names: string[]): number[] {
    const path = names.map((name, i) => this.children.get(names.slice(0, i).join("."))!.indexOf(name));
    return [...path, Infinity];
  }

  anonymous(): string {
    return `\u0000anonymous ${this.unnamed++}`;
  }
}

/**
 * The declaration of `property` in a block, through a shorthand if that is
 * how it is written; or of `logical`, the logical longhand that sets the same
 * on the element, when the block declares it after.
 */
function declarationIn(style: CSSStyleDeclaration, property: string, logical?: string): { text: string; important: boolean } | null {
  const physical = declaredIn(style, [...(SHORTHANDS[property] ?? []), property, ...(THROUGH_VAR[property] ?? [])]);
  const other = logical ? declaredIn(style, [logical, ...THROUGH_VAR[logical]]) : null;
  if (!physical || !other) return physical ?? other;
  const order = [...style];
  return order.indexOf(logical!) > order.indexOf(property) ? other : physical;
}

/** The first of `names` a block declares. Read empty, a longhand may still be set: by a shorthand written through var(). */
function declaredIn(style: CSSStyleDeclaration, names: string[]): { text: string; important: boolean } | null {
  for (const name of names) {
    const value = style.getPropertyValue(name);
    if (value) return { text: `${name}: ${value}`, important: style.getPropertyPriority(name) === "important" };
  }
  return null;
}

/**
 * For each physical border longhand, the logical one that sets the same on
 * `el` (as Tailwind's `border-x` and `border-s` write them): in a horizontal
 * writing mode, the block is top to bottom and the inline left to right, or
 * right to left. None in a vertical writing mode.
 */
function logicalBorders(el: Element): Record<string, string> {
  const style = getComputedStyle(el);
  if (style.writingMode !== "horizontal-tb") return {};
  const [start, end] = style.direction === "rtl" ? ["inline-end", "inline-start"] : ["inline-start", "inline-end"];
  const sides: Record<string, string> = { top: "block-start", right: end, bottom: "block-end", left: start };
  return Object.fromEntries(SIDES.flatMap((side) => BORDER_PARTS.map((part) => [`border-${side}-${part}`, `border-${sides[side]}-${part}`])));
}

/** A nested rule's selector, made whole: `&` stands for the parent; without one, it is a descendant. */
function nest(selector: string, parent: string): string {
  return splitList(selector)
    .map((part) => (part.includes("&") ? part.replaceAll("&", `:is(${parent})`) : `:is(${parent}) ${part}`))
    .join(", ");
}

/** Of a selector list, the most specific selector that matches `el`. */
function bestMatch(el: Element, selectorList: string): { selector: string; specificity: Specificity } | null {
  let best: { selector: string; specificity: Specificity } | null = null;
  for (const selector of splitList(selectorList)) {
    let matches = false;
    try {
      matches = el.matches(selector);
    } catch {} // Pseudo-elements and selectors this browser does not know.
    if (!matches) continue;
    const s = specificity(selector);
    if (!best || compare(s, best.specificity) > 0) best = { selector, specificity: s };
  }
  return best;
}

/** The selectors of a list, split at its top-level commas. */
function splitList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === "\\") i++;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts.filter(Boolean);
}

const LEGACY_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);
const MATCHES_ANY = new Set(["is", "not", "has", "matches", "-webkit-any", "-moz-any"]);

/** Ids, then classes, attributes and pseudo-classes, then types and pseudo-elements. */
function specificity(selector: string): Specificity {
  const s: Specificity = [0, 0, 0];
  const add = ([a, b, c]: Specificity) => {
    s[0] += a;
    s[1] += b;
    s[2] += c;
  };
  const maxOf = (list: string) => splitList(list).map(specificity).reduce((m, x) => (compare(x, m) > 0 ? x : m), [0, 0, 0]);
  let i = 0;
  const n = selector.length;
  const ident = () => {
    const start = i;
    while (i < n) {
      const ch = selector[i];
      if (ch === "\\") {
        i += /[0-9a-f]/i.test(selector[i + 1] ?? "") ? (selector.slice(i + 1).match(/^[0-9a-f]{1,6}\s?/i)![0].length + 1) : 2;
      } else if (/[\w-]/.test(ch) || ch.charCodeAt(0) > 127) i++;
      else break;
    }
    return selector.slice(start, i);
  };
  const parens = () => {
    const start = ++i;
    for (let depth = 1; i < n && depth; i++) {
      if (selector[i] === "\\") i++;
      else if (selector[i] === "(") depth++;
      else if (selector[i] === ")") depth--;
    }
    return selector.slice(start, i - 1);
  };
  while (i < n) {
    const ch = selector[i];
    if (ch === "#") {
      i++;
      ident();
      add([1, 0, 0]);
    } else if (ch === ".") {
      i++;
      ident();
      add([0, 1, 0]);
    } else if (ch === "[") {
      while (i < n && selector[i] !== "]") i += selector[i] === "\\" ? 2 : 1;
      i++;
      add([0, 1, 0]);
    } else if (ch === ":") {
      if (selector[i + 1] === ":") {
        i += 2;
        ident();
        if (selector[i] === "(") parens();
        add([0, 0, 1]);
        continue;
      }
      i++;
      const name = ident().toLowerCase();
      const arg = selector[i] === "(" ? parens() : null;
      if (arg !== null && MATCHES_ANY.has(name)) add(maxOf(arg));
      else if (name === "where") continue;
      else if (arg !== null && /^nth-(last-)?child$/.test(name) && / of /.test(arg)) {
        add([0, 1, 0]);
        add(maxOf(arg.slice(arg.indexOf(" of ") + 4)));
      } else if (LEGACY_PSEUDO_ELEMENTS.has(name)) add([0, 0, 1]);
      else add([0, 1, 0]);
    } else if (/[a-z_]/i.test(ch) || ch === "\\" || ch.charCodeAt(0) > 127) {
      ident();
      add([0, 0, 1]);
    } else i++;
  }
  return s;
}

/** For a rule that is one class the element carries: that class, unescaped. */
function classNameOf(el: Element, selector: string): string | null {
  const match = /^\.((?:\\[0-9a-f]{1,6}\s?|\\.|[\w-]|[^\x00-\x7f])+)$/i.exec(selector);
  if (!match) return null;
  const name = match[1].replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex: string | undefined, ch: string | undefined) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ch!,
  );
  return el.classList.contains(name) ? name : null;
}

function readRules(sheet: CSSStyleSheet): CSSRuleList | null {
  try {
    return sheet.cssRules;
  } catch {
    return null; // Cross-origin.
  }
}
