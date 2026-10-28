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
import type { Change, Created, Place } from "./changeset";
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
