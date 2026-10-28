/**
 * Edits on canvas elements, and taking them back off. What edits declare goes
 * into the canvas's edit styles: a style element per element edited, in the
 * canvas's head, its rules in a CSS layer of the editor's that comes before
 * every layer of the page's, all important, so they win over whatever the page
 * declares, as the style attribute did. What applies at every width is the
 * element's base rule; what applies at a breakpoint only (ADR 0008) is in a
 * media query for its range, after it. Each view, as wide as it is, and the
 * canvas played at any width, show what belongs there. Works on the canvas
 * being edited and on a saved one alike.
 */
import { mediaOf, sameBreakpoint, widestFirst, type Breakpoint } from "./breakpoints";
import type { Change, Composed, Dissolved } from "./changeset";
import { EDIT_STYLES_ATTR, EDIT_STYLES_ORDER } from "./style-marks";
import { ORIGINAL_STYLE_ATTR, pinOffsetOf } from "./style-source";

/** Stamped on the canvas elements of a layer once it is edited: its identity in the ChangeSet. */
export const LAYER_ID_ATTR = "data-vk-layer";
/** On a plain top-to-bottom flow an edit has made a real Stack. */
export const AS_STACK_ATTR = "data-vk-as-stack";
/** On a Frame a move made the positioning reference of a layer placed absolute in it. */
export const REFERENCE_ATTR = "data-vk-reference";
/** On moved elements: the change (its property) they move under. */
export const MOVE_ATTR = "data-vk-move";
/** On elements this round made (a Stack around layers, new text or a Frame, a copy and all in it): the id of the layer made. */
export const MADE_ATTR = "data-vk-made";
/** On new text or a new Frame: `text` or `frame`. */
export const NEW_ATTR = "data-vk-new";
/** On a new Frame: its brief, shown in its place on the canvas. */
export const BRIEF_ATTR = "data-vk-brief";
/** On deleted elements: the change (its property) they are deleted under. They are no layers any more. */
export const DELETED_ATTR = "data-vk-deleted";
/** On elements whose words changed: the change (its property) they changed under. */
export const TEXT_ATTR = "data-vk-text";
/** Before the first change to an element's words: what was in it, to go back to. */
export const ORIGINAL_TEXT_ATTR = "data-vk-original-text";
/**
 * On the element loose text was given to move or edit it: which run of text of
 * its container it was, from 0. It carries the container's markers, as the
 * text is written there.
 */
export const WRAP_ATTR = "data-vk-wrap";

/** The canvas elements of the layer with id `id`, in page order: one per instance. */
export function elementsOf(doc: Document, id: string): Element[] {
  return [...doc.querySelectorAll(`[${LAYER_ID_ATTR}="${CSS.escape(id)}"]`)];
}

/** Before the first edit to an element: its own style attribute, as the page wrote it, kept to look up what the page sets. */
export function keepOriginal(el: Element) {
  if (!el.hasAttribute(ORIGINAL_STYLE_ATTR)) el.setAttribute(ORIGINAL_STYLE_ATTR, el.getAttribute("style") ?? "");
}

/** On a canvas element edits have given styles: the key its rules go by in the edit styles. */
export const STYLE_KEY_ATTR = "data-vk-style";
/** On a style element of an element's rules: the element's key. */
const RULES_FOR_ATTR = "data-vk-rules-for";
/** On a style element of an element's rules: the rules, as JSON, which its CSS is written from. */
const RULES_ATTR = "data-vk-rules";
/** On an element read as if shown: its edits that hide it do not apply meanwhile. */
const SHOWN_ATTR = "data-vk-shown";
/** The CSS layer the edit styles are in: declared before any other, so its important declarations win over all of the page's. */
const EDIT_LAYER = "vernierkit-edits";

/** What edits declare on an element, at every width or at one breakpoint: CSS, and whether it is hidden. */
interface RuleBlock {
  style: Record<string, string>;
  /** True: hidden (`display: none`). False, at a breakpoint: shown there, though hidden at every width. */
  hidden?: boolean;
}
interface AtBreakpoint extends RuleBlock {
  breakpoint: Breakpoint;
}
/** Declarations at every width, and at breakpoints. */
interface RuleBlocks {
  base: RuleBlock;
  at: AtBreakpoint[];
}
/** An element's rules. */
interface Rules {
  /** Important declarations the style attribute had (the freezer's), taken into the rules so the edits can win over them. */
  lifted: Record<string, string>;
  /** A copy's: how the layer it copies looked, edits included. It starts as it looks. */
  copied?: RuleBlocks;
  /** The edits'. */
  edits: RuleBlocks;
}

/** Writes declarations onto a canvas element, over the page's: at every width, or only at `breakpoint`. Where the freezer pinned it, shifted as it was. */
export function declare(el: Element, declarations: Record<string, string>, breakpoint: Breakpoint | null = null) {
  editRules(el, (edits) => put(el, edits, declarations, breakpoint));
}

/**
 * Lays a layer out anew at every width, as a Stack made or dissolved does:
 * `declarations` at every width, and no breakpoint keeps a display of its own
 * (an edit there made it a real Stack) against it.
 */
export function relayOut(el: Element, declarations: Record<string, string>) {
  editRules(el, (edits) => {
    put(el, edits, declarations, null);
    for (const at of edits.at) delete at.style.display;
  });
}

/**
 * Takes the declarations of the CSS properties `names` off an element, at
 * every width or at `breakpoint`, and keeps the element's other changes,
 * `others`, on: they may declare some of the same CSS properties. With no
 * other change left, nothing of the edits is left on it.
 * A Frame something was moved into stays its positioning reference.
 */
export function restoreStyle(el: Element, names: string[], others: Change[], breakpoint: Breakpoint | null = null) {
  // A move or a deletion of one of a loop's instances alone is not on the others: those elements are marked with it.
  others = others.filter((change) => {
    const mark = change.kind === "move" ? MOVE_ATTR : change.kind === "delete" ? DELETED_ATTR : null;
    return !change.data || !mark || el.getAttribute(mark) === change.property;
  });
  if (readRules(el)) {
    editRules(el, (edits) => {
      if (!others.length) {
        edits.base = { style: {} };
        edits.at = [];
        return;
      }
      const block = blockOf(edits, breakpoint, false);
      if (block) {
        for (const name of names) delete block.style[name];
        if (names.includes("display")) delete block.hidden;
      }
      for (const change of others) put(el, edits, change.style, change.breakpoint ?? null);
    });
  }
  if (!others.some((change) => change.asStack)) el.removeAttribute(AS_STACK_ATTR);
  if (el.hasAttribute(REFERENCE_ATTR)) declare(el, { position: "relative" });
}

/** Runs `look` on an element as if shown: what the edits hide is read and measured as it is laid out when shown. Nothing of it is painted meanwhile. */
export function asShown<T>(el: Element, look: () => T): T {
  if (!hiddenByEdit(el)) return look();
  el.setAttribute(SHOWN_ATTR, "");
  try {
    return look();
  } finally {
    el.removeAttribute(SHOWN_ATTR);
  }
}

/** Whether the edits hide the element, at the width its document is shown at: hidden by the designer, rather than by the page. */
export function hiddenByEdit(el: Element): boolean {
  const rules = readRules(el);
  if (!rules) return false;
  let hidden = !!effective(rules).base.hidden;
  for (const at of applying(el, effective(rules))) if (at.hidden !== undefined) hidden = at.hidden;
  return hidden;
}

/** What the edits declare for the CSS property on the element, at the width its document is shown at; empty when they do not. The freezer's own are not counted. */
export function declaredByEdit(el: Element, property: string): string {
  const rules = readRules(el);
  if (!rules) return "";
  const blocks = effective({ ...rules, lifted: {} });
  let value = blocks.base.style[property] ?? "";
  for (const at of applying(el, blocks)) value = at.style[property] ?? value;
  return value;
}

/**
 * Gives `copy`, a copy of an element of `doc` made with all its attributes,
 * rules of its own: as that element looks now, edits and all, but none of its changes.
 */
export function copyRules(doc: Document, copy: Element) {
  const key = copy.getAttribute(STYLE_KEY_ATTR);
  const rules = key && sheetOf(doc, key) ? (JSON.parse(sheetOf(doc, key)!.getAttribute(RULES_ATTR)!) as Rules) : null;
  copy.removeAttribute(STYLE_KEY_ATTR);
  if (!rules) return;
  writeRules(copy, { lifted: { ...rules.lifted }, copied: effective({ ...rules, lifted: {} }), edits: { base: { style: {} }, at: [] } });
}

/**
 * Gives `el`, an element new on the canvas, a look of its own: `style`, at
 * every width, as a copy has the look of what it copies; edits win over it.
 */
export function lookRules(el: Element, style: Record<string, string>) {
  keepOriginal(el);
  el.removeAttribute(STYLE_KEY_ATTR);
  writeRules(el, { lifted: {}, copied: { base: { style }, at: [] }, edits: { base: { style: {} }, at: [] } });
}

/**
 * A canvas saved before edits went into the edit styles had them in the style
 * attribute, as important declarations over the page's: they move into the
 * edit styles, and the style attribute is as the page wrote it again.
 */
export function moveInlineEdits(doc: Document) {
  for (const el of doc.querySelectorAll(`[${ORIGINAL_STYLE_ATTR}]:not([${STYLE_KEY_ATTR}])`)) {
    const style = (el as HTMLElement).style;
    const page = doc.createElement("div").style;
    page.cssText = el.getAttribute(ORIGINAL_STYLE_ATTR)!;
    const edits: Record<string, string> = {};
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (style.getPropertyPriority(name) !== "important") continue;
      if (page.getPropertyValue(name) === style.getPropertyValue(name) && page.getPropertyPriority(name) === "important") continue;
      edits[name] = style.getPropertyValue(name);
    }
    if (!Object.keys(edits).length) continue;
    const original = el.getAttribute(ORIGINAL_STYLE_ATTR)!;
    if (original) el.setAttribute("style", original);
    else el.removeAttribute("style");
    // Written as they were: shifted already where the freezer pinned it.
    editRules(el, (rules) => putAsIs(rules.base, edits));
  }
}

/** Puts the CSS layer of the edit styles first in the canvas's head, before any of the page's: where the layer order is settled. */
export function orderEditStyles(doc: Document) {
  const head = doc.head;
  if (!head) return;
  let order = head.querySelector(`style[${EDIT_STYLES_ATTR}="${EDIT_STYLES_ORDER}"]`);
  if (order && head.firstElementChild === order) return;
  if (!order) {
    order = doc.createElement("style");
    order.setAttribute(EDIT_STYLES_ATTR, EDIT_STYLES_ORDER);
    order.textContent = `@layer ${EDIT_LAYER};`;
  }
  head.prepend(order);
}

/** On the style element that shows the `::before` and `::after` of a layer put back from off the canvas: its id. */
export const PUT_BACK_ATTR = "data-vk-put-back";

/** Leaves out of `root`, a saved canvas, the rules of elements no longer on it. */
export function dropUnusedRules(root: Element) {
  const keys = new Set([...root.querySelectorAll(`[${STYLE_KEY_ATTR}]`)].map((el) => el.getAttribute(STYLE_KEY_ATTR)));
  for (const sheet of root.querySelectorAll(`style[${RULES_FOR_ATTR}]`)) if (!keys.has(sheet.getAttribute(RULES_FOR_ATTR))) sheet.remove();
  for (const sheet of root.querySelectorAll(`style[${PUT_BACK_ATTR}]`)) {
    if (!root.querySelector(`[${MADE_ATTR}="${CSS.escape(sheet.getAttribute(PUT_BACK_ATTR)!)}"]`)) sheet.remove();
  }
}

/** Puts `declarations` into `edits`, at every width or at `breakpoint`: `display: none` hides, an empty value takes a declaration off. */
function put(el: Element, edits: RuleBlocks, declarations: Record<string, string>, breakpoint: Breakpoint | null) {
  const [dx, dy] = pinOffsetOf(el);
  const shift = { left: dx, top: dy } as Record<string, number>;
  const shifted: Record<string, string> = {};
  for (const name in declarations) {
    const value = declarations[name];
    shifted[name] = shift[name] && value.endsWith("px") ? `${parseFloat(value) + shift[name]}px` : value;
  }
  const block = blockOf(edits, breakpoint, true)!;
  putAsIs(block, shifted);
}

function putAsIs(block: RuleBlock, declarations: Record<string, string>) {
  for (const name in declarations) {
    const value = declarations[name];
    if (name === "display" && value === "none") block.hidden = true;
    else if (name === "display" && value === "") block.hidden = false;
    else if (value === "") delete block.style[name];
    else block.style[name] = value;
  }
  if (block.hidden === false && !("breakpoint" in block)) delete block.hidden;
}

/** The block of `blocks` at `breakpoint` (null: every width), made when `make` and there is none. */
function blockOf(blocks: RuleBlocks, breakpoint: Breakpoint | null, make: boolean): RuleBlock | null {
  if (!breakpoint) return blocks.base;
  let at = blocks.at.find((a) => sameBreakpoint(a.breakpoint, breakpoint)) ?? null;
  if (!at && make) blocks.at.push((at = { breakpoint: { ...breakpoint }, style: {} }));
  return at;
}

/** The blocks at the breakpoints the element's document is shown in, wider ones first. */
function applying(el: Element, blocks: RuleBlocks): AtBreakpoint[] {
  const view = el.ownerDocument.defaultView;
  if (!view) return [];
  return [...blocks.at].sort((a, b) => widestFirst(a.breakpoint, b.breakpoint)).filter((at) => view.matchMedia(mediaOf(at.breakpoint)).matches);
}

/** What applies, all told: the lifted declarations, then what a copy took over, then the edits. */
function effective(rules: Rules): RuleBlocks {
  const all: RuleBlocks = { base: { style: { ...rules.lifted } }, at: [] };
  for (const blocks of [rules.copied, rules.edits]) {
    if (!blocks) continue;
    Object.assign(all.base.style, blocks.base.style);
    if (blocks.base.hidden !== undefined) all.base.hidden = blocks.base.hidden;
    for (const at of blocks.at) {
      const into = blockOf(all, at.breakpoint, true)!;
      Object.assign(into.style, at.style);
      if (at.hidden !== undefined) into.hidden = at.hidden;
    }
  }
  return all;
}

/** The element's rules; null when it has none. */
function readRules(el: Element): Rules | null {
  const key = el.getAttribute(STYLE_KEY_ATTR);
  const sheet = key && sheetOf(el.ownerDocument, key);
  return sheet ? (JSON.parse(sheet.getAttribute(RULES_ATTR)!) as Rules) : null;
}

/** Changes the element's edits, as `change` does; its rules are made on the first, with what of its style attribute is important taken in. */
function editRules(el: Element, change: (edits: RuleBlocks) => void) {
  let rules = readRules(el);
  if (!rules) {
    keepOriginal(el);
    const style = (el as HTMLElement).style;
    const lifted: Record<string, string> = {};
    for (const name of [...style]) {
      if (style.getPropertyPriority(name) !== "important") continue;
      lifted[name] = style.getPropertyValue(name);
      style.removeProperty(name);
    }
    if (el.getAttribute("style") === "") el.removeAttribute("style");
    rules = { lifted, edits: { base: { style: {} }, at: [] } };
  }
  change(rules.edits);
  writeRules(el, rules);
}

/** Writes the element's rules into its style element; with no edits and nothing copied, the element is left as the page has it. */
function writeRules(el: Element, rules: Rules) {
  const doc = el.ownerDocument;
  rules.edits.at = rules.edits.at.filter((at) => Object.keys(at.style).length || at.hidden !== undefined);
  let key = el.getAttribute(STYLE_KEY_ATTR);
  const empty = !Object.keys(rules.edits.base.style).length && rules.edits.base.hidden === undefined && !rules.edits.at.length;
  if (empty && !rules.copied) {
    if (key) sheetOf(doc, key)?.remove();
    el.removeAttribute(STYLE_KEY_ATTR);
    // What was lifted off the style attribute goes back on it.
    for (const name in rules.lifted) (el as HTMLElement).style.setProperty(name, rules.lifted[name], "important");
    return;
  }
  if (!key || !sheetOf(doc, key)) {
    key ??= String(nextKey(doc));
    el.setAttribute(STYLE_KEY_ATTR, key);
  }
  let sheet = sheetOf(doc, key);
  if (!sheet) {
    sheet = doc.createElement("style");
    sheet.setAttribute(EDIT_STYLES_ATTR, "");
    sheet.setAttribute(RULES_FOR_ATTR, key);
    (doc.head ?? doc.documentElement).append(sheet);
    orderEditStyles(doc);
  }
  const json = JSON.stringify(rules);
  if (sheet.getAttribute(RULES_ATTR) === json) return;
  sheet.setAttribute(RULES_ATTR, json);
  sheet.textContent = cssOf(key, effective(rules));
}

/** The style element of the rules with key `key`. */
function sheetOf(doc: Document, key: string): Element | null {
  return doc.querySelector(`style[${RULES_FOR_ATTR}="${CSS.escape(key)}"]`);
}

/** The last key handed out in each document. */
const lastKeys = new WeakMap<Document, number>();
/** The next key not taken in the document. */
function nextKey(doc: Document): number {
  let last = lastKeys.get(doc);
  if (last === undefined) {
    last = 0;
    for (const el of doc.querySelectorAll(`[${STYLE_KEY_ATTR}], style[${RULES_FOR_ATTR}]`)) {
      last = Math.max(last, Number(el.getAttribute(STYLE_KEY_ATTR) ?? el.getAttribute(RULES_FOR_ATTR)) || 0);
    }
  }
  lastKeys.set(doc, ++last);
  return last;
}

/**
 * The CSS of an element's rules: at every width, then at each breakpoint, in
 * a media query for its range, narrower ranges last. Hiding is a rule of its
 * own, more particular, so it wins over any display the edits declare; it
 * holds wherever no breakpoint shows the element again.
 */
function cssOf(key: string, { base, at }: RuleBlocks): string {
  const element = `[${STYLE_KEY_ATTR}="${key}"]`;
  const hide = `${element}:not([${SHOWN_ATTR}]){display:none!important}`;
  const block = (style: Record<string, string>) => {
    const body = Object.entries(style)
      .map(([name, value]) => `${name}:${value}!important`)
      .join(";");
    return body ? `${element}{${body}}` : "";
  };
  let css = block(base.style);
  if (base.hidden) {
    const shown = at.filter((a) => a.hidden === false).map((a) => `(not ${mediaOf(a.breakpoint)})`);
    css += shown.length ? `@media ${shown.join(" and ")}{${hide}}` : hide;
  }
  for (const a of [...at].sort((x, y) => widestFirst(x.breakpoint, y.breakpoint))) {
    const inner = block(a.style) + (a.hidden ? hide : "");
    if (inner) css += `@media ${mediaOf(a.breakpoint)}{${inner}}`;
  }
  return `@layer ${EDIT_LAYER}{${css}}`;
}

/**
 * The changes that declare styles on the layer with id `layer`, each with the
 * declarations it puts on it: its own changes, those that place it as one
 * of the layers of a Stack made or dissolved, and those that make it the
 * positioning reference of a layer placed freely in it at a breakpoint.
 */
export function changesOn(layer: string, changes: Change[]): Change[] {
  return changes.flatMap((change) => {
    if (change.layer === layer) return [change];
    // A layer placed freely in it at a breakpoint: it is the layer's positioning reference there.
    if (change.within === layer) return [{ ...change, style: { position: "relative" } }];
    if (change.kind === "unstack") {
      const member = (change.after as Dissolved).layers.find((m) => m.layer === layer);
      return member ? [{ ...change, style: member.style }] : [];
    }
    if (change.kind === "stack") {
      const member = (change.after as Composed).layers.find((m) => m.layer === layer);
      return member ? [{ ...change, style: memberStyle(member) }] : [];
    }
    return [];
  });
}

/** What joining a Stack declares on a layer: one that was absolute joins its layout; one with margins has them no more. */
export function memberStyle({ from, unmargined }: Composed["layers"][number]): Record<string, string> {
  return { ...(from.absolute && { position: "static" }), ...(unmargined && NO_MARGIN) };
}

/** A layer joining a Stack with margins: it has none, one side at a time, so each side's own style comes back when taken apart. */
const NO_MARGIN = { "margin-top": "0px", "margin-right": "0px", "margin-bottom": "0px", "margin-left": "0px" };
