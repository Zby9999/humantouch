/**
 * A layer's look, frozen: the layer and every layer in it, copied into a
 * document of its own with every style it had written onto it, as it was laid
 * out when it was copied. Nothing of the page's CSS comes along, so the layer
 * keeps looking as it did once the classes and rules that styled it are gone
 * (ADR 0009). It stays a layer to edit as any other: sizes the page left to
 * the content still follow the content, and what an edit declares wins over
 * the frozen look.
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import { DELETED_ATTR } from "./canvas-style";
import { readValue } from "./property-table";
import { doctypeOf, editable, FROZEN, serializeEditable } from "./freezer";
import { LOOK_STYLES_ATTR, LOOK_STYLES_BASE } from "./style-marks";
import { CHAIN_ATTR } from "./usage-chain";

/** On each element of a frozen look: the key its frozen style goes by. */
export const LOOK_ATTR = "data-ht-look";
/** What of an element's marks a frozen copy keeps: where it is written, its usage chain, and that it is a still. */
const KEPT = new Set([LOC_ATTR, USAGE_ATTR, CHAIN_ATTR, FROZEN]);
/** On a frozen copy: the classes it had, kept to tell it by, where no rule of the page's can match them. */
export const CLASS_ATTR = "data-ht-class";
/** Elements that are no part of a look. */
const DROPPED = new Set(["script", "noscript", "style", "link", "meta", "template", "title", "source", "head"]);
/**
 * Properties the frozen style leaves out: those that only say again what
 * another says (the logical ones mirror the physical ones), custom ones (every
 * value is already resolved), and motion, which a canvas has none of.
 */
const LEFT_OUT = /^--|inline|block|^inset-|-(start|end)-(start|end)-radius$|^animation|^transition/;
/** What a document of a frozen look is laid out with: no room around the layer, and as wide as it is. */
const BASE = "html,body{margin:0;padding:0;background:transparent}body{width:max-content}";

/**
 * Freezes the look of `el`, an element of a canvas or of a view of it, into
 * `into`, an iframe in the document: its document is written anew, and holds
 * the layer, top left, and nothing else.
 */
export function freezeLook(el: Element, into: HTMLIFrameElement) {
  const from = el.ownerDocument;
  const doc = into.contentDocument;
  if (!doc) throw new Error("Human Touch: the iframe to freeze a look into is not in the document");
  doc.open();
  doc.write(`${doctypeOf(from)}<html><head><style ${LOOK_STYLES_ATTR}="${LOOK_STYLES_BASE}">${BASE}</style></head><body></body></html>`);
  doc.close();

  // What an element of each kind has as it is, in this document: what the frozen style need not say.
  const defaults = new Map<string, { own: Values; before: Values; after: Values }>();
  const defaultsOf = (source: Element) => {
    const key = `${source.namespaceURI} ${source.localName}`;
    let found = defaults.get(key);
    if (!found) {
      const probe = doc.createElementNS(source.namespaceURI, source.localName);
      doc.body.append(probe);
      found = { own: valuesOf(getComputedStyle(probe)), before: valuesOf(getComputedStyle(probe, "::before")), after: valuesOf(getComputedStyle(probe, "::after")) };
      probe.remove();
      defaults.set(key, found);
    }
    return found;
  };
  const body = valuesOf(getComputedStyle(doc.body));

  const copy = el.cloneNode(true) as Element;
  const sources = [el, ...el.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  const rules: string[] = [];
  const dropped: Element[] = [];
  sources.forEach((source, i) => {
    const to = copies[i];
    if (dropped.some((gone) => gone.contains(to))) return;
    if (DROPPED.has(source.localName) || source.hasAttribute(DELETED_ATTR)) {
      dropped.push(to);
      return;
    }
    const style = getComputedStyle(source);
    const own = valuesOf(style);
    const parent = source === el ? body : valuesOf(getComputedStyle(source.parentElement!));
    const known = defaultsOf(source);
    const declared = differing(own, known.own, parent);
    Object.assign(declared, sizeOf(source, style, source === el));
    if (source === el) Object.assign(declared, OUT_OF_PLACE, /^(absolute|fixed|sticky)$/.test(style.position) && { position: "relative" });
    const key = String(i);
    rules.push(rule(`[${LOOK_ATTR}="${key}"]`, declared));
    for (const pseudo of ["before", "after"] as const) {
      const shown = getComputedStyle(source, `::${pseudo}`);
      if (/^(none|normal)$/.test(shown.content)) continue;
      rules.push(rule(`[${LOOK_ATTR}="${key}"]::${pseudo}`, differing(valuesOf(shown), known[pseudo], own)));
    }
    for (const attr of [...to.attributes]) if (attr.name === "style" || (attr.name.startsWith("data-ht-") && !KEPT.has(attr.name))) to.removeAttribute(attr.name);
    // No rule of the page's that could still load (from another origin) reaches it by its classes.
    const classes = to.getAttribute("class");
    if (classes !== null) {
      to.setAttribute(CLASS_ATTR, classes);
      to.removeAttribute("class");
    }
    to.setAttribute(LOOK_ATTR, key);
    copies[i] = asItLooks(source, to);
  });
  for (const gone of dropped) gone.remove();

  // Its container's usage chain is the document's: it is an instance as it was on the page, or not.
  const chain = el.parentElement?.getAttribute(CHAIN_ATTR);
  if (chain) doc.body.setAttribute(CHAIN_ATTR, chain);
  const { faces, imports } = fontsOf(from);
  const styles = doc.createElement("style");
  styles.setAttribute(LOOK_STYLES_ATTR, "");
  // The page's fonts, from stylesheets that cannot be read, in a layer of their own: their other rules lose to the look.
  styles.textContent = imports.map((href) => `@import url("${href}") layer(page);`).join("") + faces.join("") + rules.join("");
  doc.head.append(styles);
  doc.body.append(doc.importNode(copies[0], true));
  editable(doc);
}

/** What of the page's body text new text takes, on the canvas and in a document made in the blank space beside it. */
export const BODY_TEXT = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color"];

/**
 * Writes `into`, an iframe in the document, anew as a document for a layer
 * made in the blank space beside the views (ticket 106): laid out as a frozen
 * look is, with nothing in it yet, its body's text that of `page`, the
 * canvas, the page's fonts with it, so new text there looks as on the page.
 */
export function blankLook(page: Document, into: HTMLIFrameElement) {
  const doc = into.contentDocument;
  if (!doc) throw new Error("Human Touch: the iframe to make a layer in is not in the document");
  const body = getComputedStyle(page.body);
  const { faces, imports } = fontsOf(page);
  const text = rule("body", Object.fromEntries(BODY_TEXT.map((name) => [name, body.getPropertyValue(name)])));
  const styles = imports.map((href) => `@import url("${href}") layer(page);`).join("") + faces.join("") + text;
  doc.open();
  doc.write(`${doctypeOf(page)}<html><head><style ${LOOK_STYLES_ATTR}="${LOOK_STYLES_BASE}">${BASE}</style><style ${LOOK_STYLES_ATTR}="">${styles}</style></head><body></body></html>`);
  doc.close();
  editable(doc);
}

/** On the layer itself, put back onto the canvas, what places it is its place's, not its look's. */
const PLACING = new Set(["position", "top", "right", "bottom", "left", "float", "z-index"]);

/**
 * A copy of `source`, a layer off the canvas, for `doc`, the canvas, to put
 * it back by (ADR 0009): its marks of where it is written kept, those of the
 * editor off the canvas not, and what was deleted there left out. Each
 * element of it is keyed by its place in it (`LOOK_ATTR`). `pairs`: each
 * element of the copy with the one it copies, outermost first.
 */
export function copyLook(source: Element, doc: Document): { copy: Element; pairs: [Element, Element][] } {
  const copy = doc.importNode(source, true) as Element;
  const sources = [source, ...source.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  const pairs: [Element, Element][] = [];
  copies.forEach((to, i) => {
    if (!copy.contains(to)) return;
    if (to.hasAttribute(DELETED_ATTR) || DROPPED.has(to.localName)) {
      to.remove();
      return;
    }
    for (const attr of [...to.attributes]) if (attr.name === "style" || (attr.name.startsWith("data-ht-") && !KEPT.has(attr.name) && attr.name !== CLASS_ATTR)) to.removeAttribute(attr.name);
    to.setAttribute(LOOK_ATTR, String(pairs.length));
    pairs.push([sources[i], to]);
  });
  return { copy, pairs };
}

/**
 * Gives each copy in `pairs`, in place on the canvas, the look of the layer
 * off it that it copies: whatever it shows otherwise, from its container
 * there and the page's styles, as the layer off the canvas shows it,
 * outermost first, so each inherits as it did there. The layer itself is
 * given all of its style, so what it inherits stays so in every view, where
 * its container may differ at another width. Its size as frozen:
 * Fixed in px, the rest following the content. `write` gives a copy its look;
 * returns what shows their `::before` and `::after`, the copies told apart
 * by `scope`, a selector for them all.
 */
export function matchLook(pairs: [Element, Element][], scope: string, write: (el: Element, style: Record<string, string>) => void): string {
  const rules: string[] = [];
  pairs.forEach(([source, copy], i) => {
    const style = getComputedStyle(source);
    const want = valuesOf(style);
    const has = valuesOf(getComputedStyle(copy));
    const declared: Record<string, string> = {};
    for (const [name, value] of want) {
      if (name === "width" || name === "height" || (i === 0 && PLACING.has(name))) continue;
      if (i === 0 || has.get(name) !== value) declared[name] = value;
    }
    write(copy, { ...declared, ...sizeOf(source, style, i === 0) });
    for (const pseudo of ["before", "after"] as const) {
      const shown = getComputedStyle(source, `::${pseudo}`);
      if (/^(none|normal)$/.test(shown.content)) continue;
      const now = valuesOf(getComputedStyle(copy, `::${pseudo}`));
      const differs: Record<string, string> = {};
      for (const [name, value] of valuesOf(shown)) if (now.get(name) !== value) differs[name] = value;
      rules.push(rule(`${scope}[${LOOK_ATTR}="${copy.getAttribute(LOOK_ATTR)}"]::${pseudo}`, differs));
    }
  });
  return rules.join("");
}

/**
 * A frozen look, edits and all, as an HTML document to keep. The look as it
 * was frozen stays apart from the edits made since: in its own style element,
 * the edits in the edit styles over it.
 */
export function serializeLook(doc: Document): string {
  return serializeEditable(doc);
}

/** On the layer itself: out of where it was, in no layout but its own. */
const OUT_OF_PLACE: Record<string, string> = {
  top: "auto",
  right: "auto",
  bottom: "auto",
  left: "auto",
  "margin-top": "0px",
  "margin-right": "0px",
  "margin-bottom": "0px",
  "margin-left": "0px",
  float: "none",
};

type Values = Map<string, string>;

function valuesOf(style: CSSStyleDeclaration): Values {
  const values: Values = new Map();
  for (let i = 0; i < style.length; i++) {
    const name = style[i];
    if (!LEFT_OUT.test(name)) values.set(name, style.getPropertyValue(name));
  }
  return values;
}

/**
 * What of `own` the frozen style has to say: a value the element would not
 * have anyway, in its own kind's default (for what does not inherit) and
 * from its container (for what does).
 */
function differing(own: Values, defaults: Values, parent: Values): Record<string, string> {
  const declared: Record<string, string> = {};
  for (const [name, value] of own) if (value !== defaults.get(name) || value !== parent.get(name)) declared[name] = value;
  // A line's width counts only with a style: `0px` with no style, it would be `medium` with one.
  for (const line of LINES) {
    const width = own.get(`${line}-width`);
    if (`${line}-style` in declared && width !== undefined) declared[`${line}-width`] = width;
  }
  return declared;
}

/** Lines whose computed width is 0 while they have no style, whatever width they are given. */
const LINES = ["border-top", "border-right", "border-bottom", "border-left", "outline", "column-rule"];

/**
 * Its width and height: as the layer was laid out, where the page set them;
 * left to the content where the page did. The layer itself is as wide as it
 * was, its container gone.
 */
function sizeOf(el: Element, style: CSSStyleDeclaration, outermost: boolean): Record<string, string> {
  const sized: Record<string, string> = {};
  for (const axis of ["width", "height"] as const) {
    let fixed = outermost && axis === "width";
    try {
      fixed ||= readValue(el, axis).type === "fixed";
    } catch {
      continue; // Not a box the editor sizes (inside a vector, say): as it is.
    }
    const value = style.getPropertyValue(axis);
    sized[axis] = fixed && value.endsWith("px") ? `${exactly(el, style, axis)}px` : "auto";
  }
  return sized;
}

/**
 * The size of `el` along `axis`, as `width` or `height` sets it, exactly: the
 * computed value is written rounded, and a hair short, words it held wrap.
 * Taken from its box where nothing transforms it; in units of layout, 1/64 px.
 */
function exactly(el: Element, style: CSSStyleDeclaration, axis: "width" | "height"): number {
  const written = parseFloat(style.getPropertyValue(axis));
  if (style.transform !== "none" || style.scale !== "none" || style.rotate !== "none") return written;
  let size = el.getBoundingClientRect()[axis];
  if (style.boxSizing === "content-box") {
    const sides = axis === "width" ? ["left", "right"] : ["top", "bottom"];
    for (const side of sides) size -= parseFloat(style.getPropertyValue(`padding-${side}`)) + parseFloat(style.getPropertyValue(`border-${side}-width`));
  }
  return Math.round(size * 64) / 64;
}

/** What is outside the markup goes into it: where an image is loaded from, the pixels of a still, the values of fields. */
function asItLooks(from: Element, to: Element): Element {
  switch (from.localName) {
    case "img": {
      const image = from as HTMLImageElement;
      to.setAttribute("src", image.currentSrc || image.src);
      for (const attr of ["srcset", "sizes", "loading"]) to.removeAttribute(attr);
      return to;
    }
    case "canvas": {
      const still = to.ownerDocument.createElement("img");
      for (const { name, value } of to.attributes) still.setAttribute(name, value);
      if (!still.hasAttribute(FROZEN)) still.setAttribute(FROZEN, "canvas");
      try {
        still.setAttribute("src", (from as HTMLCanvasElement).toDataURL());
      } catch {} // Painted from another origin: it cannot be read back.
      to.replaceWith(still);
      return still;
    }
    case "input": {
      const input = from as HTMLInputElement;
      if (input.type === "checkbox" || input.type === "radio") to.toggleAttribute("checked", input.checked);
      else if (input.type !== "file") to.setAttribute("value", input.value);
      return to;
    }
    case "textarea":
      to.textContent = (from as HTMLTextAreaElement).value;
      return to;
    case "option":
      to.toggleAttribute("selected", (from as HTMLOptionElement).selected);
      return to;
    default:
      return to;
  }
}

function rule(selector: string, declared: Record<string, string>): string {
  const body = Object.entries(declared)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return body ? `${selector}{${body}}` : "";
}

/** The page's own fonts: the `@font-face` rules of the stylesheets that can be read, and the addresses of those that cannot. */
function fontsOf(doc: Document): { faces: string[]; imports: string[] } {
  const faces: string[] = [];
  const imports: string[] = [];
  const visit = (rules: CSSRuleList, base: string) => {
    for (const rule of rules) {
      // Rules live in the canvas's realm, so they are told by type, not `instanceof`.
      if (rule.type === CSSRule.FONT_FACE_RULE) faces.push(absolute(rule.cssText, base));
      else if (rule.type === CSSRule.IMPORT_RULE) {
        const sheet = (rule as CSSImportRule).styleSheet;
        if (sheet) read(sheet);
      } else if ("cssRules" in rule) visit(rule.cssRules as CSSRuleList, base);
    }
  };
  const read = (sheet: CSSStyleSheet) => {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href) imports.push(sheet.href);
      return;
    }
    visit(rules, sheet.href ?? doc.baseURI);
  };
  for (const sheet of doc.styleSheets) read(sheet);
  return { faces, imports };
}

/** `css` with its `url()`s from `base`, so they load from anywhere. */
function absolute(css: string, base: string): string {
  return css.replace(/url\("((?:[^"\\]|\\.)*)"\)/g, (match, url: string) => {
    try {
      return `url("${new URL(url.replace(/\\(.)/g, "$1"), base).href.replace(/["\\]/g, "\\$&")}")`;
    } catch {
      return match;
    }
  });
}
