/**
 * Edits on canvas elements, and taking them back off. What edits declare goes
 * into the canvas's edit styles: a style element per group of elements edited
 * alike, in the canvas's head, its rules in a CSS layer of the editor's that
 * comes before every layer of the page's, all important, so they win over
 * whatever the page declares, as the style attribute did. What applies at
 * every width is the group's base rule; what applies at a breakpoint only
 * (ADR 0008) is in a media query for its range, after it. Each view, as wide
 * as it is, and the canvas played at any width, show what belongs there.
 * Works on the canvas being edited and on a saved one alike.
 *
 * The elements of a group are instances of one layer, with the same rules:
 * an edit to a layer is written once for all its instances, which share a key
 * (ticket 60). An instance whose rules come to differ, as one moved or deleted
 * alone, or one the page or the freezer styles otherwise, has a group of its
 * own, and joins the others again once they are alike again. An element of no
 * layer yet is a group alone. What is written onto elements is worked out for
 * each of them, and grouped as it comes out.
 *
 * A style element's rules, as JSON, are what it declares. Its text is written
 * from them, except while a value is changed again and again (each step of a
 * drag on a number, each arrow key): then its rules are changed in place,
 * through the CSSOM, and its text is left behind. Chromium lays the whole
 * document out and paints it again for any change to the text of a sheet with
 * a CSS layer in it, which on a large page is more than a frame, in every
 * view; for a change to a rule's declarations, only what it styles.
 * `syncEditStyles` writes the text out again, for a copy that is shown or saved.
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

/** On a canvas element edits have given styles: the key its rules go by in the edit styles, which instances of its layer with the same rules share. */
export const STYLE_KEY_ATTR = "data-vk-style";
/** On a style element of a group's rules: the group's key. */
const RULES_FOR_ATTR = "data-vk-rules-for";
/** On a style element of a group's rules: the rules, as JSON, which its CSS is written from. */
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
  /** What changes to the component itself declare, on an element it writes: under the edits of its usage, which win over them. */
  promoted?: RuleBlocks;
  /** The edits'. */
  edits: RuleBlocks;
}

/** Canvas elements an edit is written onto: one, or several, as the instances of a layer. */
export type Elements = Element | Iterable<Element>;

/**
 * Writes declarations onto canvas elements, over the page's: at every width,
 * or only at `breakpoint`. Where the freezer pinned one, shifted as it was.
 * `layer`: the id of the layer they are the instances of, when it is stamped
 * on them only after, as on a layer's first edit: they share their edit
 * styles from then on.
 */
export function declare(els: Elements, declarations: Record<string, string>, breakpoint: Breakpoint | null = null, layer?: string) {
  editRules(els, (el, rules) => put(el, rules.edits, declarations, breakpoint), false, layer);
}

/**
 * Writes onto canvas elements the component writes what the changes to the
 * component itself, `changes`, declare, in place of what they declared
 * before: under the edits of each element's usage, which win over them.
 */
export function declarePromoted(els: Elements, changes: Change[]) {
  editRules(
    els,
    (el, rules) => {
      const promoted: RuleBlocks = { base: { style: {} }, at: [] };
      for (const change of changes) put(el, promoted, change.style, change.breakpoint ?? null);
      if (changes.length) rules.promoted = promoted;
      else delete rules.promoted;
    },
    !changes.length,
  );
}

/**
 * Lays a layer out anew at every width, as a Stack made or dissolved does:
 * `declarations` at every width, and no breakpoint keeps a display of its own
 * (an edit there made it a real Stack) against it.
 */
export function relayOut(els: Elements, declarations: Record<string, string>) {
  editRules(els, (el, { edits }) => {
    put(el, edits, declarations, null);
    for (const at of edits.at) delete at.style.display;
  });
}

/**
 * Takes the declarations of the CSS properties `names` off canvas elements, at
 * every width or at `breakpoint`, and keeps each element's other changes,
 * `others`, on: they may declare some of the same CSS properties. With no
 * other change left, nothing of the edits is left on it.
 * A Frame something was moved into stays its positioning reference.
 */
export function restoreStyle(els: Elements, names: string[], others: Change[], breakpoint: Breakpoint | null = null) {
  // A move or a deletion of one of a loop's instances alone is not on the others: those elements are marked with it.
  const othersOn = (el: Element) =>
    others.filter((change) => {
      const mark = change.kind === "move" ? MOVE_ATTR : change.kind === "delete" ? DELETED_ATTR : null;
      return !change.data || !mark || el.getAttribute(mark) === change.property;
    });
  const list = elementsIn(els);
  editRules(
    list,
    (el, { edits }) => {
      const own = othersOn(el);
      if (!own.length) {
        edits.base = { style: {} };
        edits.at = [];
        return;
      }
      const block = blockOf(edits, breakpoint, false);
      if (block) {
        for (const name of names) delete block.style[name];
        if (names.includes("display")) delete block.hidden;
      }
      for (const change of own) put(el, edits, change.style, change.breakpoint ?? null);
    },
    true,
  );
  for (const el of list) if (!othersOn(el).some((change) => change.asStack)) el.removeAttribute(AS_STACK_ATTR);
  declare(
    list.filter((el) => el.hasAttribute(REFERENCE_ATTR)),
    { position: "relative" },
  );
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

/**
 * Runs `look` on an element as the page styles it: none of this round's edits
 * to it, nor its component's, apply meanwhile, those that hide it among them;
 * what the freezer wrote on it, and the look a layer was copied or made with,
 * still do. Nothing of it is painted meanwhile; the instances sharing its
 * edit styles are as the page styles them meanwhile too.
 */
export function asPage<T>(el: Element, look: () => T): T {
  const key = el.getAttribute(STYLE_KEY_ATTR);
  const rules = readRules(el);
  const sheet = key && rules && sheetOf(el.ownerDocument, key);
  if (!sheet) return look();
  // Put back as the rules have it: the text may be behind them.
  const css = cssOf(key, effective(rules));
  sheet.textContent = cssOf(key, effective({ lifted: rules.lifted, copied: rules.copied, edits: { base: { style: {} }, at: [] } }));
  try {
    return look();
  } finally {
    sheet.textContent = css;
  }
}

/**
 * Has the element's styles worked out anew, edit styles and all. Chromium may
 * keep what a change to the style attribute alone left, its important
 * declarations taken back off since, over the edit styles' important rules:
 * the element is matched against the rules again, as its key goes and comes back.
 */
export function rematch(el: Element) {
  const key = el.getAttribute(STYLE_KEY_ATTR);
  if (key === null) return;
  el.removeAttribute(STYLE_KEY_ATTR);
  el.setAttribute(STYLE_KEY_ATTR, key);
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
  writeRules([{ el: copy, rules: { lifted: { ...rules.lifted }, copied: effective({ ...rules, lifted: {} }), edits: { base: { style: {} }, at: [] } } }]);
}

/**
 * Gives `el`, an element new on the canvas, a look of its own: `style`, at
 * every width, as a copy has the look of what it copies; edits win over it.
 */
export function lookRules(el: Element, style: Record<string, string>) {
  keepOriginal(el);
  el.removeAttribute(STYLE_KEY_ATTR);
  writeRules([{ el, rules: { lifted: {}, copied: { base: { style }, at: [] }, edits: { base: { style: {} }, at: [] } } }]);
}

/**
 * Brings a canvas saved by an earlier Vernier Kit up to how edits are kept
 * now: those in the style attribute move into the edit styles
 * (`moveInlineEdits`), and the instances of a layer with the same rules, each
 * with a style element of its own then, share one (`shareEditStyles`). It
 * looks as it did. Nothing changes on a canvas saved as edits are kept now.
 */
export function upgradeEditStyles(doc: Document) {
  moveInlineEdits(doc);
  shareEditStyles(doc);
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
    editRules(el, (_, rules) => putAsIs(rules.edits.base, edits));
  }
}

/**
 * The instances of each layer whose rules are the same share one key, the
 * smallest of theirs, and its style element: those of the others go. As a
 * canvas saved before they shared them (ticket 60) is brought up to now.
 */
export function shareEditStyles(doc: Document) {
  const jsonOf = rulesReader(doc);
  /** The keys of the instances of each layer with the same rules, by layer and rules. */
  const alike = new Map<string, Set<string>>();
  for (const el of doc.querySelectorAll(`[${LAYER_ID_ATTR}][${STYLE_KEY_ATTR}]`)) {
    const key = el.getAttribute(STYLE_KEY_ATTR)!;
    const json = jsonOf(key);
    if (!json) continue;
    const id = `${el.getAttribute(LAYER_ID_ATTR)}\n${json}`;
    if (!alike.has(id)) alike.set(id, new Set());
    alike.get(id)!.add(key);
  }
  for (const keys of alike.values()) {
    if (keys.size < 2) continue;
    const [kept, ...others] = [...keys].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    for (const key of others) {
      for (const el of membersOf(doc, key)) el.setAttribute(STYLE_KEY_ATTR, kept);
      sheetOf(doc, key)?.remove();
    }
  }
}

/**
 * Gives each element of `root`, a copy of a document, that shares its key
 * with elements before it a key and a style element of its own, the same
 * rules in it: as each was kept before the instances of a layer shared them
 * (ticket 60). For the look of a layer off the canvas, which a put back
 * hands to the Agent as it was then.
 */
export function unshareEditStyles(root: Element) {
  let last = 0;
  for (const el of root.querySelectorAll(`[${STYLE_KEY_ATTR}], style[${RULES_FOR_ATTR}]`)) {
    last = Math.max(last, Number(el.getAttribute(STYLE_KEY_ATTR) ?? el.getAttribute(RULES_FOR_ATTR)) || 0);
  }
  /** The style element last written for each key: the next of its group goes after it. */
  const latest = new Map<string, Element>();
  for (const el of root.querySelectorAll(`[${STYLE_KEY_ATTR}]`)) {
    const key = el.getAttribute(STYLE_KEY_ATTR)!;
    const sheet = latest.get(key) ?? root.querySelector(`style[${RULES_FOR_ATTR}="${CSS.escape(key)}"]`);
    if (!sheet) continue;
    if (!latest.has(key)) {
      latest.set(key, sheet);
      continue;
    }
    const own = String(++last);
    const copy = sheet.cloneNode(true) as Element;
    copy.setAttribute(RULES_FOR_ATTR, own);
    sheet.after(copy);
    latest.set(key, copy);
    el.setAttribute(STYLE_KEY_ATTR, own);
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

/** What applies, all told: the lifted declarations, then what a copy took over, then the component's changes, then the edits. */
function effective(rules: Rules): RuleBlocks {
  const all: RuleBlocks = { base: { style: { ...rules.lifted } }, at: [] };
  for (const blocks of [rules.copied, rules.promoted, rules.edits]) {
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

/** The element's rules, those of its group; null when it has none. */
function readRules(el: Element): Rules | null {
  const key = el.getAttribute(STYLE_KEY_ATTR);
  const sheet = key && sheetOf(el.ownerDocument, key);
  return sheet ? (JSON.parse(sheet.getAttribute(RULES_ATTR)!) as Rules) : null;
}

/** The rules of each key in `doc`, as JSON, each read once; null for a key with none. */
function rulesReader(doc: Document): (key: string) => string | null {
  const read = new Map<string, string | null>();
  return (key) => {
    if (!read.has(key)) read.set(key, sheetOf(doc, key)?.getAttribute(RULES_ATTR) ?? null);
    return read.get(key)!;
  };
}

/** The elements of `els`, each once. */
function elementsIn(els: Elements): Element[] {
  return "nodeType" in (els as object) ? [els as Element] : [...new Set(els as Iterable<Element>)];
}

/**
 * Changes the rules of each of `els` as `change` does, given the element and
 * its rules as they are, for it alone; an element's rules are made on the
 * first, with what of its style attribute is important taken in, unless
 * `ruledOnly`: then those with none are left as they are. `layer`: the layer
 * of those with no layer id yet.
 */
function editRules(els: Elements, change: (el: Element, rules: Rules) => void, ruledOnly = false, layer?: string) {
  const list = elementsIn(els);
  if (!list.length) return;
  const docs = new Set(list.map((el) => el.ownerDocument));
  if (docs.size > 1) {
    for (const doc of docs) editRules(list.filter((el) => el.ownerDocument === doc), change, ruledOnly, layer);
    return;
  }
  const jsonOf = rulesReader(list[0].ownerDocument);
  const written: { el: Element; rules: Rules }[] = [];
  for (const el of list) {
    const key = el.getAttribute(STYLE_KEY_ATTR);
    const json = key === null ? null : jsonOf(key);
    if (!json && ruledOnly) continue;
    const rules = json ? (JSON.parse(json) as Rules) : liftedRules(el);
    change(el, rules);
    written.push({ el, rules });
  }
  writeRules(written, layer);
}

/** The rules of an element edited for the first time: none, but what of its style attribute is important, taken off it. */
function liftedRules(el: Element): Rules {
  keepOriginal(el);
  const style = (el as HTMLElement).style;
  const lifted: Record<string, string> = {};
  for (const name of [...style]) {
    if (style.getPropertyPriority(name) !== "important") continue;
    lifted[name] = style.getPropertyValue(name);
    style.removeProperty(name);
  }
  if (el.getAttribute("style") === "") el.removeAttribute("style");
  return { lifted, edits: { base: { style: {} }, at: [] } };
}

/**
 * Writes each element's rules into the style element of its group: with no
 * edits and nothing copied, the element is left as the page has it. The
 * instances of a layer with the same rules share one, the one they share
 * already where they can, else one of another instance with those rules, else
 * one of theirs no other element shares, else a new one; a style element left
 * with no element goes. Rules written for the whole of a group, all alike, are
 * written into its style element as they are, which changes in place.
 * `pending`: the layer of those with no layer id yet, stamped on them after.
 */
function writeRules(written: { el: Element; rules: Rules }[], pending?: string) {
  if (!written.length) return;
  const doc = written[0].el.ownerDocument;
  const empty = (blocks: RuleBlocks) => !Object.keys(blocks.base.style).length && blocks.base.hidden === undefined && !blocks.at.length;
  const all = written.map(({ el, rules }) => {
    rules.edits.at = rules.edits.at.filter((at) => Object.keys(at.style).length || at.hidden !== undefined);
    if (rules.promoted && empty(rules.promoted)) delete rules.promoted;
    const shows = !empty(rules.edits) || !!rules.copied || !!rules.promoted;
    return { el, rules, json: shows ? JSON.stringify(rules) : null, key: el.getAttribute(STYLE_KEY_ATTR) };
  });

  // A whole group, alike still, of a layer with no other group to join: its style element, as it is.
  const [first] = all;
  if (first.json && first.key !== null && all.every(({ key, json }) => key === first.key && json === first.json)) {
    const sheet = sheetOf(doc, first.key);
    const these = new Set(all.map(({ el }) => el));
    const layer = first.el.getAttribute(LAYER_ID_ATTR);
    const alone = !layer || !doc.querySelector(`[${LAYER_ID_ATTR}="${CSS.escape(layer)}"][${STYLE_KEY_ATTR}]:not([${STYLE_KEY_ATTR}="${CSS.escape(first.key)}"])`);
    if (sheet && alone && membersOf(doc, first.key).every((el) => these.has(el))) {
      showGroup(sheet as HTMLStyleElement, first.key, first.rules, first.json);
      return;
    }
  }

  const these = new Set(all.map(({ el }) => el));
  const jsonOf = rulesReader(doc);
  const outside = new Map<string, boolean>();
  /** Whether elements not written here have key `key`. */
  const othersHave = (key: string) => {
    if (!outside.has(key)) outside.set(key, membersOf(doc, key).some((el) => !these.has(el)));
    return outside.get(key)!;
  };
  const had = new Set(all.flatMap(({ key }) => (key !== null && sheetOf(doc, key) ? [key] : [])));
  const taken = new Set<string>();
  const groups = new Map<string, typeof all>();
  all.forEach((one, i) => {
    if (!one.json) {
      one.el.removeAttribute(STYLE_KEY_ATTR);
      // What was lifted off the style attribute goes back on it.
      for (const name in one.rules.lifted) (one.el as HTMLElement).style.setProperty(name, one.rules.lifted[name], "important");
      return;
    }
    const layer = one.el.getAttribute(LAYER_ID_ATTR) ?? pending;
    // An element of no layer is a group alone.
    const id = layer ? `${layer}\n${one.json}` : String(i);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(one);
  });
  for (const group of groups.values()) {
    const { el, rules, json } = group[0];
    const layer = el.getAttribute(LAYER_ID_ATTR) ?? pending;
    const own = [...new Set(group.flatMap(({ key }) => (key === null ? [] : [key])))];
    const instances = layer ? [...new Set([...doc.querySelectorAll(`[${LAYER_ID_ATTR}="${CSS.escape(layer)}"][${STYLE_KEY_ATTR}]`)].map((instance) => instance.getAttribute(STYLE_KEY_ATTR)!))] : [];
    const key =
      [...own, ...instances].find((key) => !taken.has(key) && jsonOf(key) === json) ?? own.find((key) => !taken.has(key) && !othersHave(key)) ?? String(nextKey(doc));
    taken.add(key);
    for (const one of group) if (one.key !== key) one.el.setAttribute(STYLE_KEY_ATTR, key);
    let sheet = sheetOf(doc, key);
    if (!sheet) {
      sheet = doc.createElement("style");
      sheet.setAttribute(EDIT_STYLES_ATTR, "");
      sheet.setAttribute(RULES_FOR_ATTR, key);
      (doc.head ?? doc.documentElement).append(sheet);
      orderEditStyles(doc);
    }
    showGroup(sheet as HTMLStyleElement, key, rules, json!);
  }
  for (const key of had) {
    if (taken.has(key) || membersOf(doc, key).length || all.some(({ el }) => el.getAttribute(STYLE_KEY_ATTR) === key)) continue;
    sheetOf(doc, key)?.remove();
  }
}

/** Has the style element of the group with key `key` declare `rules`, as JSON `json`. */
function showGroup(sheet: HTMLStyleElement, key: string, rules: Rules, json: string) {
  if (sheet.getAttribute(RULES_ATTR) === json) return;
  sheet.setAttribute(RULES_ATTR, json);
  showRules(sheet, cssOf(key, effective(rules)));
}

/** The elements of the canvas with key `key`. */
function membersOf(doc: Document, key: string): Element[] {
  return [...doc.querySelectorAll(`[${STYLE_KEY_ATTR}="${CSS.escape(key)}"]`)];
}

/**
 * Makes `root`, and every edit style element in it, declare what its rules
 * have: in place where it can, else as text, which a copy that is not in a
 * document yet always gets. For a copy of the canvas, or of any part of it,
 * before it is shown or saved; and for a view, as its copy of an edit style
 * element takes in new rules from the canvas.
 */
export function syncEditStyles(root: Element) {
  const sheets = isEditStyles(root) ? [root] : root.querySelectorAll(`style[${RULES_ATTR}]`);
  for (const sheet of sheets) {
    const rules = JSON.parse(sheet.getAttribute(RULES_ATTR)!) as Rules;
    showRules(sheet as HTMLStyleElement, cssOf(sheet.getAttribute(RULES_FOR_ATTR)!, effective(rules)));
  }
}

/**
 * Whether `record` is of a change to an edit style element alone: to its
 * rules, or to its text. A copy of the canvas writes its own text from the
 * rules (`syncEditStyles`), so a change to the text alone, as `asPage` makes,
 * changes nothing there.
 */
export function changesEditStyles(record: MutationRecord): boolean {
  if (record.type === "attributes") return record.attributeName === RULES_ATTR && isEditStyles(record.target);
  return isEditStyles(record.type === "characterData" ? (record.target.parentNode ?? record.target) : record.target);
}

/** Whether `node` is an edit style element: what it declares is its rules, its text maybe behind them. */
export function isEditStyles(node: Node): node is HTMLStyleElement {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === "style" && (node as Element).hasAttribute(RULES_ATTR);
}

/** Has the style element declare `css`: in place when its rules are the same rules with other declarations, else as its text. */
function showRules(sheet: HTMLStyleElement, css: string) {
  if (!restyleInPlace(sheet, css) && sheet.textContent !== css) sheet.textContent = css;
}

/**
 * Changes the declarations of the sheet's rules to those of `css`, through
 * the CSSOM, when `css` has the same rules, in the same at-rules, in the same
 * order; returns false, changing nothing, when it does not, or when the sheet
 * is not in a document shown in a window.
 */
function restyleInPlace(sheet: HTMLStyleElement, css: string): boolean {
  const live = sheet.sheet;
  const View = sheet.ownerDocument.defaultView?.CSSStyleSheet;
  if (!live || !View) return false;
  const wanted = new View();
  wanted.replaceSync(css);
  if (!sameRules(live.cssRules, wanted.cssRules)) return false;
  copyDeclarations(live.cssRules, wanted.cssRules);
  return true;
}

function sameRules(a: CSSRuleList, b: CSSRuleList): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const [x, y] = [a[i], b[i]];
    if (x.constructor.name !== y.constructor.name) return false;
    if ("selectorText" in x && x.selectorText !== (y as CSSStyleRule).selectorText) return false;
    if ("conditionText" in x && x.conditionText !== (y as CSSConditionRule).conditionText) return false;
    if ("name" in x && x.name !== (y as CSSLayerBlockRule).name) return false;
    const [xs, ys] = ["cssRules" in x ? (x as CSSGroupingRule).cssRules : null, "cssRules" in y ? (y as CSSGroupingRule).cssRules : null];
    if (!xs !== !ys || (xs && !sameRules(xs, ys!))) return false;
  }
  return true;
}

function copyDeclarations(to: CSSRuleList, from: CSSRuleList) {
  for (let i = 0; i < to.length; i++) {
    const [x, y] = [to[i], from[i]];
    if ("cssRules" in x) copyDeclarations((x as CSSGroupingRule).cssRules, (y as CSSGroupingRule).cssRules);
    if (!("style" in x)) continue;
    const [style, wanted] = [(x as CSSStyleRule).style, (y as CSSStyleRule).style];
    for (const name of [...style]) if (!wanted.getPropertyValue(name)) style.removeProperty(name);
    for (const name of wanted) {
      const [value, priority] = [wanted.getPropertyValue(name), wanted.getPropertyPriority(name)];
      if (style.getPropertyValue(name) !== value || style.getPropertyPriority(name) !== priority) style.setProperty(name, value, priority);
    }
  }
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
