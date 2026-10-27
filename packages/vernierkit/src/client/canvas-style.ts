/**
 * Edits on canvas elements, as inline important declarations over the page's
 * own styles, and taking them back off. Works on the canvas being edited and on
 * a saved one alike.
 */
import type { Change, Composed, Dissolved } from "./changeset";
import { ORIGINAL_STYLE_ATTR, pinOffsetOf } from "./style-source";

/** Stamped on the canvas elements of a layer once it is edited: its identity in the ChangeSet. */
export const LAYER_ID_ATTR = "data-vk-layer";
/** On a plain top-to-bottom flow an edit has made a real Stack. */
export const AS_STACK_ATTR = "data-vk-as-stack";
/** On a Frame a move made the positioning reference of a layer placed absolute in it. */
export const REFERENCE_ATTR = "data-vk-reference";
/** On moved elements: the change (its property) they move under. */
export const MOVE_ATTR = "data-vk-move";
/** On elements this round made (a Stack around layers): the id of the layer made. */
export const MADE_ATTR = "data-vk-made";

/** The canvas elements of the layer with id `id`, in page order: one per instance. */
export function elementsOf(doc: Document, id: string): Element[] {
  return [...doc.querySelectorAll(`[${LAYER_ID_ATTR}="${CSS.escape(id)}"]`)];
}

/** Before the first edit to an element: its own style attribute, kept to look up what the page sets and to go back to. */
export function keepOriginal(el: Element) {
  if (!el.hasAttribute(ORIGINAL_STYLE_ATTR)) el.setAttribute(ORIGINAL_STYLE_ATTR, el.getAttribute("style") ?? "");
}

/** Writes declarations onto a canvas element, over the page's: where the freezer pinned it, shifted as it was. */
export function declare(el: Element, declarations: Record<string, string>) {
  const [dx, dy] = pinOffsetOf(el);
  const shift = { left: dx, top: dy } as Record<string, number>;
  for (const name in declarations) {
    let value = declarations[name];
    if (shift[name] && value.endsWith("px")) value = `${parseFloat(value) + shift[name]}px`;
    (el as HTMLElement).style.setProperty(name, value, "important");
  }
}

/**
 * Puts back the page's own declarations of the CSS properties `names` on an
 * element, as its style attribute had them before the first edit, and keeps
 * the element's other changes, `others`, on: they may declare some of the
 * same CSS properties. With no other change left, the whole attribute goes back as it was.
 * A Frame something was moved into stays its positioning reference.
 */
export function restoreStyle(el: Element, names: string[], others: Change[]) {
  const original = el.getAttribute(ORIGINAL_STYLE_ATTR);
  if (original === null) return;
  if (!others.length) {
    if (original) el.setAttribute("style", original);
    else el.removeAttribute("style");
    el.removeAttribute(AS_STACK_ATTR);
    if (el.hasAttribute(REFERENCE_ATTR)) declare(el, { position: "relative" });
    return;
  }
  const style = (el as HTMLElement).style;
  const page = el.ownerDocument.createElement("div").style;
  page.cssText = original;
  for (const name of names) style.removeProperty(name);
  for (const name of names) {
    const value = page.getPropertyValue(name);
    if (value) style.setProperty(name, value, page.getPropertyPriority(name));
  }
  // Hidden by the designer, it stays hidden: that change goes on last.
  for (const change of [...others].sort((a, b) => Number(a.property === "visible") - Number(b.property === "visible"))) declare(el, change.style);
  if (!others.some((change) => change.asStack)) el.removeAttribute(AS_STACK_ATTR);
  if (el.hasAttribute(REFERENCE_ATTR)) declare(el, { position: "relative" });
}

/**
 * The changes that declare styles on the layer with id `layer`, each with the
 * declarations it puts on it: its own changes, and those that place it as one
 * of the layers of a Stack made or dissolved.
 */
export function changesOn(layer: string, changes: Change[]): Change[] {
  return changes.flatMap((change) => {
    if (change.layer === layer) return [change];
    if (change.kind === "unstack") {
      const member = (change.after as Dissolved).layers.find((m) => m.layer === layer);
      return member ? [{ ...change, style: member.style }] : [];
    }
    if (change.kind === "stack") {
      const member = (change.after as Composed).layers.find((m) => m.layer === layer);
      return member ? [{ ...change, style: memberStyle(member.from.absolute !== null) }] : [];
    }
    return [];
  });
}

/** What joining a Stack declares on a layer: one that was absolute joins its layout. */
export function memberStyle(absolute: boolean): Record<string, string> {
  return absolute ? { position: "static" } : {};
}
