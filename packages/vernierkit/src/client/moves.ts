/**
 * Moving layers on a canvas, by layer ids and places only: the same moves apply
 * to the canvas being edited and to a saved one. A layer goes in each instance
 * of its container's usage; a layer one of several a loop renders goes alone.
 */
import { changesOn, declare, elementsOf, keepOriginal, LAYER_ID_ATTR, MOVE_ATTR, REFERENCE_ATTR, restoreStyle } from "./canvas-style";
import type { Change, Place } from "./changeset";

/** The CSS properties a move may declare on the layer: what moving it back takes off. */
export const MOVE_CSS = ["position", "left", "top", "right", "bottom", "width", "height"];
/**
 * The places in a container a layer can be at: its child elements and its runs
 * of text. White space between elements does not count, so a layer moved away
 * and back is where it was.
 */
export function slotsOf(container: Element): ChildNode[] {
  return [...container.childNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE || (node.nodeType === Node.TEXT_NODE && node.textContent!.trim()));
}

/**
 * Moves the layer with id `layer` from one place to another, and gives it the
 * style `style` there: the elements of it that move under change `move` (its
 * property), found where they are now, whatever moved since. `changes`: the
 * ChangeSet as it is once the move is recorded, which says what else the
 * layer, and the container it leaves, still need.
 */
export function relocate(doc: Document, layer: string, move: string, from: Place, to: Place, style: Record<string, string>, changes: Change[]) {
  const sources = elementsOf(doc, from.container.layer);
  const targets = elementsOf(doc, to.container.layer);
  const moved: Element[] = [];
  sources.forEach((container, i) => {
    const node = [...container.children].find((el) => el.getAttribute(LAYER_ID_ATTR) === layer && el.getAttribute(MOVE_ATTR) === move);
    if (!node) return;
    const into = targets.length === sources.length ? targets[i] : targets[0];
    node.remove();
    into.insertBefore(node, slotsOf(into)[to.slot] ?? null);
    moved.push(node);
  });

  const others = changesOn(layer, changes).filter((change) => change.kind !== "move");
  for (const el of moved) {
    keepOriginal(el);
    restoreStyle(el, MOVE_CSS, others);
    declare(el, style);
  }
  if (to.absolute) {
    for (const container of new Set(moved.map((el) => el.parentElement!))) {
      if (getComputedStyle(container).position !== "static" && !container.hasAttribute(REFERENCE_ATTR)) continue;
      keepOriginal(container);
      container.setAttribute(REFERENCE_ATTR, "");
      declare(container, { position: "relative" });
    }
  }
  // A container no absolute layer is placed in any more is no longer a positioning reference.
  const id = from.container.layer;
  if (from.absolute && !changes.some((change) => change.kind === "move" && (change.after as Place).absolute && (change.after as Place).container.layer === id)) {
    const own = changesOn(id, changes).filter((change) => change.kind !== "move");
    for (const container of sources) {
      if (!container.hasAttribute(REFERENCE_ATTR)) continue;
      container.removeAttribute(REFERENCE_ATTR);
      restoreStyle(container, ["position"], own);
    }
  }
}
