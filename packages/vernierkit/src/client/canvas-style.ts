/**
 * Edits on canvas elements, as inline important declarations over the page's
 * own styles, and taking them back off. Works on the canvas being edited and on
 * a saved one alike.
 */
import type { Change } from "./changeset";
import { ORIGINAL_STYLE_ATTR, PIN_OFFSET_ATTR } from "./style-source";

/** Stamped on the canvas elements of a layer once it is edited: its identity in the ChangeSet. */
export const LAYER_ID_ATTR = "data-vk-layer";
/** On a plain top-to-bottom flow an edit has made a real Stack. */
export const AS_STACK_ATTR = "data-vk-as-stack";

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
  const [dx, dy] = (el.getAttribute(PIN_OFFSET_ATTR) ?? "0 0").split(" ").map(Number);
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
 */
export function restoreStyle(el: Element, names: string[], others: Change[]) {
  const original = el.getAttribute(ORIGINAL_STYLE_ATTR);
  if (original === null) return;
  if (!others.length) {
    if (original) el.setAttribute("style", original);
    else el.removeAttribute("style");
    el.removeAttribute(AS_STACK_ATTR);
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
  for (const change of others) declare(el, change.style);
  if (!others.some((change) => change.asStack)) el.removeAttribute(AS_STACK_ATTR);
}
