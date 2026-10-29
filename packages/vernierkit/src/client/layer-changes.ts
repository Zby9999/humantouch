/**
 * New layers, copies, deleted layers and new words, on a canvas. Taking any of
 * them back goes by layer ids and the change's values only, so it works on the
 * canvas being edited and on a saved one alike.
 */
import {
  AS_STACK_ATTR,
  BRIEF_ATTR,
  changesOn,
  copyRules,
  declare,
  lookRules,
  PUT_BACK_ATTR,
  DELETED_ATTR,
  elementsOf,
  keepOriginal,
  LAYER_ID_ATTR,
  MADE_ATTR,
  MOVE_ATTR,
  NEW_ATTR,
  ORIGINAL_TEXT_ATTR,
  REFERENCE_ATTR,
  restoreStyle,
  TEXT_ATTR,
} from "./canvas-style";
import { layerName } from "../design-values";
import { breakpointKey } from "./breakpoints";
import type { Change, CopiedBreakpoint, Created, Place } from "./changeset";
import { copyLook, matchLook } from "./look";
import { holdAbsolute, releaseAbsolute, slotsOf } from "./moves";
import { ORIGINAL_STYLE_ATTR } from "./style-source";
import { CHAIN_ATTR } from "./usage-chain";

/** Puts the new layer with id `id` where `created` says, in each instance of its container, with `style`. */
export function insertNew(doc: Document, id: string, created: Created, style: Record<string, string>) {
  const containers = elementsOf(doc, created.place.container.layer);
  for (const container of containers) {
    const el = doc.createElement(created.type === "text" ? "p" : "div");
    el.setAttribute(LAYER_ID_ATTR, id);
    el.setAttribute(MADE_ATTR, id);
    el.setAttribute(NEW_ATTR, created.type);
    // Written in the JSX its container is written in.
    const chain = container.getAttribute(CHAIN_ATTR);
    if (chain) el.setAttribute(CHAIN_ATTR, chain);
    if (created.text !== undefined) el.textContent = created.text;
    if (created.brief) el.setAttribute(BRIEF_ATTR, created.brief);
    keepOriginal(el);
    declare(el, style);
    container.insertBefore(el, slotsOf(container)[created.place.slot] ?? null);
  }
  if (created.place.absolute) holdAbsolute(containers);
}

/**
 * Puts a copy of each of `originals` in the container beside it in
 * `containers`, at `place`, with `style` over what it has: a layer of its own,
 * new this round, with id `id`, and all in it new too.
 */
export function insertCopies(originals: Element[], containers: Element[], id: string, place: Place, style: Record<string, string>) {
  originals.forEach((original, i) => {
    const copy = original.cloneNode(true) as Element;
    for (const el of [copy, ...copy.querySelectorAll("*")]) {
      if (el.hasAttribute(DELETED_ATTR)) {
        el.remove();
        continue;
      }
      // Changes to the original are not the copy's: it starts as it looks.
      for (const attr of [LAYER_ID_ATTR, MOVE_ATTR, AS_STACK_ATTR, REFERENCE_ATTR, TEXT_ATTR, ORIGINAL_TEXT_ATTR]) el.removeAttribute(attr);
      // It looks as the original does, at every width, with styles of its own.
      copyRules(original.ownerDocument, el);
      el.setAttribute(ORIGINAL_STYLE_ATTR, el.getAttribute("style") ?? "");
      el.setAttribute(MADE_ATTR, id);
    }
    copy.setAttribute(LAYER_ID_ATTR, id);
    declare(copy, style);
    containers[i].insertBefore(copy, slotsOf(containers[i])[place.slot] ?? null);
  });
  if (place.absolute) holdAbsolute(containers);
}

/**
 * Puts `source`, a layer off the canvas, back onto it (ADR 0009) as the layer
 * with id `id`, new this round, at `place`, in each instance of its
 * container, with `style`: looking as it does off the canvas, at every width.
 */
export function insertPutBack(doc: Document, id: string, source: Element, place: Place, style: Record<string, string>) {
  const containers = elementsOf(doc, place.container.layer);
  let pseudos: string | null = null;
  for (const container of containers) {
    const { copy, pairs } = copyLook(source, doc);
    // Written in the JSX its container is written in, as it is put back there.
    const chain = container.getAttribute(CHAIN_ATTR);
    for (const [, el] of pairs) {
      el.setAttribute(MADE_ATTR, id);
      if (chain) el.setAttribute(CHAIN_ATTR, chain);
      else el.removeAttribute(CHAIN_ATTR);
    }
    copy.setAttribute(LAYER_ID_ATTR, id);
    container.insertBefore(copy, slotsOf(container)[place.slot] ?? null);
    const css = matchLook(pairs, `[${MADE_ATTR}="${CSS.escape(id)}"]`, lookRules);
    declare(copy, style);
    pseudos ??= css;
  }
  // Its own, though a layer with its id was put back before and taken off since: the sheet goes once the canvas is saved without it.
  let sheet = doc.head.querySelector(`style[${PUT_BACK_ATTR}="${CSS.escape(id)}"]`);
  if (pseudos && !sheet) {
    sheet = doc.createElement("style");
    sheet.setAttribute(PUT_BACK_ATTR, id);
    doc.head.append(sheet);
  }
  if (sheet) sheet.textContent = pseudos ?? "";
  if (place.absolute) holdAbsolute(containers);
}

/**
 * What the layer whose element is `original`, and each layer in it, has at
 * breakpoints of its own, as a copy of it keeps it: its changes there in
 * `changes`, and, where it is a copy itself, what that copy took over. A
 * layer's own value wins over what it took over; a layer deleted is not in a copy.
 */
export function copiedBreakpointsOf(original: Element, changes: Change[]): CopiedBreakpoint[] {
  // By the layer each is on, its property and breakpoint: what comes later, deeper in, wins.
  const values = new Map<string, CopiedBreakpoint>();
  const put = (value: CopiedBreakpoint) => values.set(JSON.stringify([value.inside, value.property, breakpointKey(value.breakpoint)]), value);
  const gone = new Set<string>();
  const seen = new Set<string>();
  for (const el of [original, ...original.querySelectorAll(`[${LAYER_ID_ATTR}]`)]) {
    const id = el.getAttribute(LAYER_ID_ATTR)!;
    const named = (change: Change) => (el === original ? null : { name: layerName(change), element: change.target.context.element });
    const deleted = el.closest(`[${DELETED_ATTR}]`);
    if (deleted && original.contains(deleted)) {
      // One of a loop's instances deleted alone leaves the others.
      const deletion = changes.find((change) => change.kind === "delete" && change.layer === id && !change.data);
      if (deletion) gone.add(JSON.stringify(named(deletion)));
      continue;
    }
    // Each layer once, though the instances a loop renders in it are many.
    if (seen.has(id)) continue;
    seen.add(id);
    for (const change of changes) {
      if (change.layer !== id) continue;
      if (change.kind === "duplicate") for (const value of change.copiedBreakpoints ?? []) put({ ...value, inside: value.inside ?? named(change) });
      else if (change.kind === "style" && change.breakpoint) {
        const { id: from, breakpoint, property, after, asStack } = change;
        put({ change: from, inside: named(change), breakpoint: { ...breakpoint }, property, value: structuredClone(after), ...(asStack && { asStack }) });
      }
    }
  }
  return [...values.values()].filter((value) => !gone.has(JSON.stringify(value.inside)));
}

/** Takes the layer with id `id`, made this round in the container with id `container`, off the canvas. `changes`: the ChangeSet once it is no longer in it. */
export function removeMade(doc: Document, id: string, container: string, changes: Change[]) {
  for (const el of elementsOf(doc, id)) if (el.getAttribute(MADE_ATTR) === id) el.remove();
  releaseAbsolute(doc, container, changes);
}

/** Deletes `els` under change `property`, with `style`: they stay on the canvas, hidden, to come back, but are no layers. */
export function hide(els: Element[], property: string, style: Record<string, string>) {
  for (const el of els) {
    el.setAttribute(DELETED_ATTR, property);
    keepOriginal(el);
    declare(el, style);
  }
}

/** Brings back the elements of the layer with id `id` deleted under change `property`. `changes`: the ChangeSet once that change is no longer in it. */
export function unhide(doc: Document, id: string, property: string, changes: Change[]) {
  for (const el of elementsOf(doc, id)) {
    if (el.getAttribute(DELETED_ATTR) !== property) continue;
    el.removeAttribute(DELETED_ATTR);
    restoreStyle(el, ["display"], changesOn(id, changes));
  }
}

/** Gives the elements of the layer with id `id` whose words change under change `property` the words `text`; with null, the words and pieces they had. */
export function writeText(doc: Document, id: string, property: string, text: string | null) {
  for (const el of elementsOf(doc, id)) {
    if (el.getAttribute(TEXT_ATTR) !== property) continue;
    if (text === null) {
      const original = el.getAttribute(ORIGINAL_TEXT_ATTR);
      if (original !== null) el.innerHTML = original;
      el.removeAttribute(ORIGINAL_TEXT_ATTR);
      continue;
    }
    if (!el.hasAttribute(ORIGINAL_TEXT_ATTR)) el.setAttribute(ORIGINAL_TEXT_ATTR, el.innerHTML);
    // The white space around the words stays: loose text keeps its distance from what it runs on beside.
    const [, before, , after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(el.textContent!)!;
    el.textContent = before + text + after;
  }
}

/** An element's words, as one reads them: white space between them as one space. */
export function wordsOf(el: Element): string {
  return el.textContent!.replace(/\s+/g, " ").trim();
}
