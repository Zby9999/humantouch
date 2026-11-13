/**
 * Whether the page already draws what a change's style draws (ADR 0016): the
 * value read off the page is written otherwise than the change's, yet it may
 * draw the same, as 0 letter spacing written `0px` or `normal`, or a fixed
 * width written as a maximum the container is wide enough for. The canvas's
 * style for the change (its reference style, `Change.style`) is put on the
 * page's elements for a moment, and taken off again, all before anything is
 * painted: if nothing drawn moves, the page shows the change.
 *
 * The style is put on through a stylesheet adopted by the document, its
 * declarations important, its rules found by each element's place among its
 * container's: no attribute changes, nor any element put in, so nothing that
 * watches the page for changes takes it for one. What is drawn: where the
 * layer, its container, the container's other layers and the layers in it
 * are, and how large, within half a px (a box with no area, drawn nowhere, but
 * for its size); their colors, rounded as the panel reads them, and the rest
 * of how they are painted; where their text is, and how wide. What a change
 * of one layer cannot move (the rest of the page) is not looked at.
 *
 * Put on a page that applies the change in another way that adds to it (a
 * margin for a padding, a gap for a margin), the style moves things again, so
 * this alone would not tell. What it moves on the page before the change is
 * applied is noted too (`Moved`): the page that moves the same to the same
 * shows the change (`movedAsNoted`).
 */
import { NOT_DRAWN } from "./layers";
import { colorReader } from "./paint";
import { sourcesOf, type StyleSource } from "./style-source";

/** An element, and the style to put on it: CSS properties to values, as the canvas writes them. */
export interface Restyled {
  el: Element;
  style: Record<string, string>;
}

/** How many elements around and in the layers are looked at, and how many runs of text: past these, the first ones. */
const MAX_ELEMENTS = 1500;
const MAX_TEXTS = 500;
/** Within this, in px, a place or a size is the same. */
const NEAR = 0.5;

/** How an element is painted, past where it is: its computed values of these. */
const PAINTED = [
  "color",
  "background-color",
  "background-image",
  "background-position",
  "background-size",
  "background-repeat",
  "background-clip",
  ...["top", "right", "bottom", "left"].flatMap((side) => ["color", "style", "width"].map((part) => `border-${side}-${part}`)),
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "text-shadow",
  "opacity",
  "filter",
  "backdrop-filter",
  "mix-blend-mode",
  "outline-color",
  "outline-style",
  "outline-width",
  "outline-offset",
  "text-decoration-line",
  "text-decoration-color",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-underline-offset",
  "visibility",
  "clip-path",
  "overflow-x",
  "overflow-y",
  "transform",
  "translate",
  "rotate",
  "scale",
  "font-family",
  "font-weight",
  "font-style",
  "text-transform",
  "-webkit-text-stroke-width",
  "-webkit-text-stroke-color",
  "object-fit",
  "object-position",
  "fill",
  "stroke",
];
/** Of those, the colors: compared as painted, so a color written in another space is the same color. */
const COLORS = new Set(PAINTED.filter((name) => name.endsWith("color") || name === "fill" || name === "stroke"));

/** Properties that lay out what is in a container only where it is a flex or grid container. */
const OF_CONTAINERS = new Set(["gap", "row-gap", "column-gap", "justify-content", "justify-items", "align-items", "align-content", "flex-direction", "flex-wrap", "grid-template-columns", "grid-template-rows", "grid-auto-flow"]);
/** Properties that place an element only where its container is a flex or grid container. */
const OF_ITEMS = new Set(["flex-grow", "flex-shrink", "flex-basis", "align-self", "justify-self", "order", "grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end"]);

/** What is drawn of an element: where and how large (page coordinates), and how it is painted. */
interface Drawn {
  box: number[];
  paint: string[];
}

/**
 * What a change's style moves of how the page lays out one of its layer's
 * elements, noted before the change is applied (`drawsAlike`): each place or
 * size it changes, by what it is of (`layoutOf`), and what to.
 */
export type Moved = Map<string, number[]>;

/** What `drawsAlike` found: whether nothing drawn moved; and, for each element it was asked to note, what the style moved (none, where it could not be told). */
export interface Drawing {
  alike: boolean;
  moved: Map<Element, Moved>;
}

/**
 * Whether the page draws the same with each of `restyled` given its style as
 * without: so, with the layer the change is to, and the elements around and
 * in it. Not, where it cannot be told: an element not drawn (or in a shadow
 * root), a style with nothing in it, one the page's own important
 * declarations would win over, or one that lays out a container (a gap, an
 * alignment) or an item in one where there is none, which would draw nothing
 * there either way. Of each of `noting`, what the style moved, as `layoutOf`
 * reads it; not `look`ing, that alone, at what costs little.
 */
export function drawsAlike(restyled: Restyled[], noting: Element[] = [], look = true): Drawing {
  const drawing: Drawing = { alike: false, moved: new Map() };
  const [first] = restyled;
  if (!first) return drawing;
  const doc = first.el.ownerDocument;
  const win = doc.defaultView;
  if (!win || !restyled.every(({ el, style }) => el.isConnected && el.getRootNode() === doc && Object.keys(style).length > 0 && el.getClientRects().length > 0)) return drawing;
  // Hidden and shown again, a layer's animations and its starting styles begin anew, and what scrolls in it goes back to its start: never put on.
  if (restyled.some(({ style }) => /^\s*none\b/.test(style.display ?? ""))) return drawing;
  const sheet = new win.CSSStyleSheet();
  const rules = restyled.map(({ el, style }) => `${pathOf(el)} { ${Object.entries(style).map(([name, value]) => `${name}: ${value} !important;`).join(" ")} }`);
  try {
    sheet.replaceSync(rules.join("\n"));
  } catch {
    return drawing;
  }
  const longhands = restyled.map((_, i) => {
    const rule = sheet.cssRules[i] as CSSStyleRule | undefined;
    return rule ? [...rule.style] : [];
  });
  if (longhands.some((names) => !names.length)) return drawing;
  const els = [...new Set(restyled.flatMap(({ el }) => around(el)))];
  // Past as many as are looked at, what is not looked at may move; a field's words, of the layers or in them, have no node of their own to see them move by.
  const fields = restyled.some(({ el }) => UNSEEN_WORDS.has(el.localName) || !!el.querySelector([...UNSEEN_WORDS].join(", ")));
  if (els.length > MAX_ELEMENTS || fields) return drawing;
  const texts = [...new Set(restyled.flatMap(({ el }) => textsIn(el)))].slice(0, MAX_TEXTS);
  // Paint, of the layers and what is in them: the style on them paints nothing else, but may move it.
  const painted = (el: Element) => restyled.some((one) => one.el.contains(el));
  const before = look ? drawnOf(els, texts, win, painted) : null;
  // Looked at as it was drawn when last looked at, with the same style: as it was then, with nothing put on it again.
  const print = look && !noting.length ? JSON.stringify([rules, before, restyled.map(({ el }, i) => longhands[i].map((name) => getComputedStyle(el).getPropertyValue(name))), win.innerWidth]) : null;
  const key = rules.join("\n");
  const last = print ? lastLooked.get(first.el)?.get(key) : undefined;
  if (print && last?.print === print) return { alike: last.alike, moved: new Map() };
  // The page's own important declarations that would win over these (its style attribute's, those in a CSS layer, or by an id): what they draw would not be the change's.
  const winsOver = (source: StyleSource) => source.important && (source.kind === "inline" || source.layer !== null || (source.selector ?? "").includes("#"));
  // Read once for elements alike (a loop's instances): the same tag, classes and style attribute are set alike.
  const told = new Map<string, boolean>();
  const isHeld = (el: Element, names: string[]) => {
    const key = `${el.localName} ${el.getAttribute("class")} ${el.getAttribute("style")} ${names.join(",")}`;
    if (!told.has(key)) told.set(key, sourcesOf(el, names).some(winsOver));
    return told.get(key)!;
  };
  if (restyled.some(({ el }, i) => isHeld(el, longhands[i]))) return remembered(drawing);

  const laidOut = noting.map(layoutOf);
  // A transition on any of them would start as the style goes on, or comes off: it is held off meanwhile.
  const transitions = els.some((el) => /[1-9]/.test(getComputedStyle(el).transitionDuration));
  const held = restyled.map(({ el }) => `${pathOf(el)}, ${pathOf(el)} * { transition: none !important; }`);
  if (transitions) for (const rule of held) sheet.insertRule(rule, sheet.cssRules.length);
  const scroll = [win.scrollX, win.scrollY];
  // What scrolls round the layers, where it is scrolled: a style that makes what is in it shorter would scroll it back.
  const scrolled = [...new Set([...restyled.flatMap(({ el }) => scrollersOf(el)), ...els.filter((el) => el.scrollTop || el.scrollLeft)])].map((box) => [box, box.scrollLeft, box.scrollTop] as const);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  try {
    if (!restyled.some(({ el, style }, i) => inertOn(el, longhands[i]) || heldBack(el, style))) {
      drawing.alike = !!before && same(before, drawnOf(els, texts, win, painted), doc);
      // A style that paints too (a font, its weight, its case) is not told by where things are alone: nothing noted.
      if (!longhands.some((names) => names.some((name) => PAINTED.includes(name)))) noting.forEach((el, i) => drawing.moved.set(el, movedBetween(laidOut[i], layoutOf(el))));
    }
  } finally {
    if (transitions) {
      // Off again with transitions still held: what the elements go back to is what they were, so none starts as they are let go.
      sheet.replaceSync(held.join("\n"));
      void doc.documentElement.getBoundingClientRect();
    }
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((one) => one !== sheet);
    // At once: a page that scrolls smoothly would be seen to glide back.
    if (win.scrollX !== scroll[0] || win.scrollY !== scroll[1]) win.scrollTo({ left: scroll[0], top: scroll[1], behavior: "instant" });
    for (const [box, left, top] of scrolled) if (box.scrollLeft !== left || box.scrollTop !== top) box.scrollTo({ left, top, behavior: "instant" });
  }
  return remembered(drawing);

  function remembered(found: Drawing): Drawing {
    if (print) {
      let byRules = lastLooked.get(first.el);
      if (!byRules) lastLooked.set(first.el, (byRules = new Map()));
      byRules.set(key, { print, alike: found.alike });
    }
    return found;
  }
}

/**
 * What was found of an element the last time it was looked at (`drawsAlike`),
 * and how it was drawn then, with the style it was given: as the page's
 * checks look again at a change not applied yet each time the code changes,
 * where nothing round its layer has changed, putting the style on again
 * finds the same, and costs the whole page's styles worked out anew.
 */
const lastLooked = new WeakMap<Element, Map<string, { print: string; alike: boolean }>>();

/** Elements whose words are drawn with no text node to measure: a field's. */
const UNSEEN_WORDS = new Set(["input", "textarea", "select"]);

/** The elements round `el`, and `el`, scrolled away from their start: those a style that moves what is in them may scroll back. */
function scrollersOf(el: Element): Element[] {
  const out: Element[] = [];
  for (let at: Element | null = el; at && at !== el.ownerDocument.documentElement && at !== el.ownerDocument.body; at = at.parentElement) {
    if (at.scrollTop || at.scrollLeft) out.push(at);
  }
  return out;
}

/**
 * Where the page lays out what a style on `el` may move, each by what it is
 * of, so it is found again as the code changes and the elements are made
 * anew: `el` itself (`layer`) and the others in its container (`s`, and their
 * place among its nodes), from the container's corner, and the container's
 * size (`container`); what is in `el` (`d` for an element, `t` for a run of
 * text, and the places among their containers' nodes down to them), from
 * `el`'s corner. Each as x, y, width and height, in px.
 */
export function layoutOf(el: Element): Moved {
  const out: Moved = new Map();
  const of = (rect: DOMRect, from: DOMRect) => [rect.left - from.left, rect.top - from.top, rect.width, rect.height];
  const own = el.getBoundingClientRect();
  out.set("size", [0, 0, own.width, own.height]);
  const parent = el.parentElement;
  if (parent) {
    const from = parent.getBoundingClientRect();
    out.set("container", [0, 0, from.width, from.height]);
    out.set("layer", of(own, from));
    parent.childNodes.forEach((node, i) => {
      if (node !== el && node.nodeType === Node.ELEMENT_NODE && !NOT_DRAWN.has((node as Element).localName)) out.set(`s${i}`, of((node as Element).getBoundingClientRect(), from));
    });
  } else out.set("layer", [0, 0, own.width, own.height]);
  const range = el.ownerDocument.createRange();
  const walk = (node: Node, path: string) => {
    node.childNodes.forEach((child, i) => {
      if (out.size >= MAX_ELEMENTS) return;
      if (child.nodeType === Node.TEXT_NODE && (child as Text).data.trim()) {
        range.selectNodeContents(child);
        out.set(`t${path}.${i}`, [...range.getClientRects()].flatMap((line) => of(line, own)));
      } else if (child.nodeType === Node.ELEMENT_NODE && !NOT_DRAWN.has((child as Element).localName)) {
        out.set(`d${path}.${i}`, of((child as Element).getBoundingClientRect(), own));
        walk(child, `${path}.${i}`);
      }
    });
  };
  walk(el, "");
  range.detach();
  return out;
}

/** What moved from `before` to `after`, as `after` has it: what is in one and not the other moves too; a box with no area either side is drawn nowhere. */
function movedBetween(before: Moved, after: Moved): Moved {
  const moved: Moved = new Map();
  for (const [key, box] of after) {
    const was = before.get(key);
    if (!was || !alike(was, box)) moved.set(key, box);
  }
  return moved;
}

/**
 * Whether the page lays out `el` as a change's style was noted to move it
 * (`Moved`): all it moved, where it moved them to, within half a px. Not
 * where it moved nothing: a style that moves nothing is told by what is
 * drawn (`drawsAlike`).
 */
export function movedAsNoted(el: Element, moved: Moved): boolean {
  if (!moved.size || !el.isConnected || !el.getClientRects().length) return false;
  const now = layoutOf(el);
  return [...moved].every(([key, box]) => {
    const there = now.get(key);
    return !!there && alike(there, box);
  });
}

/**
 * What a change's style moves of each of `others`, from what it moved of one
 * of `noted` (`moved`) laid out alike, now, as it is not applied yet: a
 * loop's instances, each a layer of the same, so the page need not put the
 * style on every one to note them. Laid out alike: what is in them, the
 * layer's size, and its container's, the same within half a px; where it is
 * in its container is its own, and the others there are not looked at. What
 * the layer itself moved to, so, from where it is.
 */
export function movedAlike(noted: Element[], moved: Map<Element, Moved>, others: Element[]): Map<Element, Moved> {
  const own = (layout: Moved) => {
    const kept = [...layout].filter(([key]) => !key.startsWith("s")).map(([key, box]): [string, number[]] => [key, key === "layer" ? [0, 0, box[2], box[3]] : box]);
    return new Map(kept);
  };
  const sameAs = (a: Moved, b: Moved) => a.size === b.size && [...a].every(([key, box]) => !!b.get(key) && alike(box, b.get(key)!));
  const laidOut = noted.map((el) => ({ layout: layoutOf(el), moved: moved.get(el) })).filter((one) => one.moved?.size);
  const out = new Map<Element, Moved>();
  for (const el of others) {
    const layout = layoutOf(el);
    const like = laidOut.find((one) => sameAs(own(one.layout), own(layout)));
    if (!like) continue;
    const [from, to] = [like.layout.get("layer")!, layout.get("layer")!];
    const shifted: Moved = new Map();
    for (const [key, box] of like.moved!) {
      if (key.startsWith("s")) continue;
      shifted.set(key, key === "layer" ? [box[0] - from[0] + to[0], box[1] - from[1] + to[1], box[2], box[3]] : box);
    }
    if (shifted.size) out.set(el, shifted);
  }
  return out;
}

/** Two boxes, x, y, width and height (as many as a run of text has lines), the same within half a px: where neither has an area, by their size alone. */
function alike(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  // Boxes four numbers each: a run of text, one to a line.
  for (let at = 0; at < a.length; at += 4) {
    const nowhere = (box: number[]) => box[at + 2] * box[at + 3] === 0;
    const from = nowhere(a) && nowhere(b) ? 2 : 0;
    for (let i = from; i < 4; i++) if (Math.abs(a[at + i] - b[at + i]) > NEAR) return false;
  }
  return true;
}

/**
 * Whether the style, now on `el`, lays out a container it is not, or places
 * an item in no container that lays it out: it draws nothing there. Or
 * aligns what is in it where a layer in it places itself (an auto margin, an
 * alignment of its own): the alignment moves that layer nothing, whatever it is.
 */
function inertOn(el: Element, longhands: string[]): boolean {
  const laysOut = (of: Element | null) => !!of && /(flex|grid)/.test(getComputedStyle(of).display);
  if (longhands.some((name) => OF_CONTAINERS.has(name)) && !laysOut(el)) return true;
  if (longhands.some((name) => OF_ITEMS.has(name)) && !laysOut(el.parentElement)) return true;
  return longhands.some((name) => ALIGNING.has(name)) && [...el.children].some(placesItself);
}

/** Properties that align what is in a container, which a layer in it may override for itself. */
const ALIGNING = new Set(["justify-content", "align-items", "justify-items", "align-content"]);

/** Whether a layer places itself in its container, whatever the container's alignment: an auto margin, or an alignment of its own. */
function placesItself(child: Element): boolean {
  const style = getComputedStyle(child);
  if (!/^(auto|normal)$/.test(style.alignSelf) || !/^(auto|normal)$/.test(style.justifySelf)) return true;
  const map = child.computedStyleMap?.();
  return !!map && ["margin-top", "margin-right", "margin-bottom", "margin-left"].some((side) => String(map.get(side)) === "auto");
}

/**
 * Whether the style, now on `el`, is held back from what it declares: a
 * length in px the element does not come to, as a size its own maximum or
 * minimum keeps it from (`max-width` written by the page for a fixed width).
 * Then nothing moving tells nothing: the page's own styles keep it as it was.
 */
function heldBack(el: Element, style: Record<string, string>): boolean {
  const computed = getComputedStyle(el);
  return Object.entries(style).some(([name, value]) => /^-?\d*\.?\d+px$/.test(value.trim()) && Math.abs(parseFloat(computed.getPropertyValue(name)) - parseFloat(value)) > NEAR);
}

/** A selector for `el` alone, by its place among its container's elements, from the root: its tag and a class it has in its own part. */
function pathOf(el: Element): string {
  const parts: string[] = [];
  for (let at: Element | null = el; at; at = at.parentElement) {
    if (!at.parentElement) {
      parts.unshift(":root");
      break;
    }
    const nth = [...at.parentElement.children].indexOf(at) + 1;
    const own = at === el && at.classList[0] ? `.${CSS.escape(at.classList[0])}` : "";
    parts.unshift(`${CSS.escape(at.localName)}${own}:nth-child(${nth})`);
  }
  return parts.join(" > ");
}

/** The elements a style on `el` may move: its container, the container's elements, and those in `el`, in order. */
function around(el: Element): Element[] {
  const els = new Set<Element>();
  const parent = el.parentElement;
  if (parent) {
    els.add(parent);
    for (const child of parent.children) if (!NOT_DRAWN.has(child.localName)) els.add(child);
  }
  els.add(el);
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node && els.size <= MAX_ELEMENTS; node = walker.nextNode()) {
    if (!NOT_DRAWN.has((node as Element).localName)) els.add(node as Element);
  }
  return [...els];
}

/** The runs of text in `el`, but white space alone. */
function textsIn(el: Element): Text[] {
  const texts: Text[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node && texts.length < MAX_TEXTS; node = walker.nextNode()) {
    if ((node as Text).data.trim() && !NOT_DRAWN.has(node.parentElement?.localName ?? "")) texts.push(node as Text);
  }
  return texts;
}

/** What is drawn of `els` and `texts` now: how those `painted` picks are painted too. */
function drawnOf(els: Element[], texts: Text[], win: Window, painted: (el: Element) => boolean): { els: Drawn[]; texts: number[][] } {
  const [sx, sy] = [win.scrollX, win.scrollY];
  const box = (r: DOMRect) => [r.left + sx, r.top + sy, r.width, r.height];
  const range = win.document.createRange();
  const drawn = {
    els: els.map((el) => {
      if (!painted(el)) return { box: box(el.getBoundingClientRect()), paint: [] };
      const style = getComputedStyle(el);
      return { box: box(el.getBoundingClientRect()), paint: PAINTED.map((name) => style.getPropertyValue(name)) };
    }),
    // Each line: a run broken otherwise may take up as much room in all.
    texts: texts.map((text) => {
      range.selectNodeContents(text);
      return [...range.getClientRects()].flatMap(box);
    }),
  };
  range.detach();
  return drawn;
}

/** Whether two drawings are the same: places and sizes within half a px, paint the same, colors as painted. */
function same(a: { els: Drawn[]; texts: number[][] }, b: { els: Drawn[]; texts: number[][] }, doc: Document): boolean {
  if (!a.texts.every((box, i) => alike(box, b.texts[i]))) return false;
  const colors = colorReader(doc);
  const painted = (css: string) => {
    const { color, opacity } = colors.color(css);
    return `${color} ${opacity}`;
  };
  return a.els.every((drawn, i) => {
    const other = b.els[i];
    if (!alike(drawn.box, other.box)) return false;
    return drawn.paint.every((value, j) => {
      const then = other.paint[j];
      if (value === then) return true;
      // A paint that is no color (`none`, a `url()`) is told by how it is written.
      if (COLORS.has(PAINTED[j]) && CSS.supports("color", value) && CSS.supports("color", then)) return painted(value) === painted(then);
      if (COLORS.has(PAINTED[j])) return false;
      return roundedIn(value) === roundedIn(then);
    });
  });
}

/** A computed value with its numbers rounded: to the hundredth up to 1, else to the whole number, as colors and lengths are drawn. */
function roundedIn(css: string): string {
  return css.replace(/-?\d*\.?\d+(e-?\d+)?/g, (n) => {
    const value = Number(n);
    return String(Math.abs(value) <= 1 ? Math.round(value * 100) / 100 : Math.round(value));
  });
}
