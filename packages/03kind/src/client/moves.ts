/**
 * Moving layers on a canvas, by layer ids and places only: the same moves apply
 * to the canvas being edited and to a saved one. A layer goes in each instance
 * of its container's usage; a layer one of several a loop renders goes alone.
 */
import { changesOn, declare, elementsOf, keepOriginal, LAYER_ID_ATTR, MADE_ATTR, MOVE_ATTR, REFERENCE_ATTR, restoreStyle, WRAP_ATTR } from "./canvas-style";
import { isReorder, placedAt, type Change, type ChangeSet, type Place } from "./changeset";
import { NOT_DRAWN, signOf } from "./layers";

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
  for (const el of moved) keepOriginal(el);
  restoreStyle(moved, MOVE_CSS, others);
  declare(moved, style);
  if (to.absolute) holdAbsolute(new Set(moved.map((el) => el.parentElement!)));
  if (from.absolute) releaseAbsolute(doc, from.container.layer, changes);
}

/**
 * Puts the order of each reordered container's layers, as the canvas has them
 * now, into its reorders: what the check measures the live page by.
 */
export function syncOrders(doc: Document, changes: ChangeSet) {
  const reorders = changes.list().filter(isReorder);
  for (const change of reorders) {
    const id = (change.after as Place).container.layer;
    const layers = layersIn(doc, id);
    const moved = (layer: string | null) => reorders.some((other) => other !== change && other.layer === layer && (other.after as Place).container.layer === id);
    const order = layers && {
      signs: layers.map(signOf),
      self: layers.findIndex((el) => el.getAttribute(LAYER_ID_ATTR) === change.layer),
      others: layers.flatMap((el, i) => (moved(el.getAttribute(LAYER_ID_ATTR)) ? [i] : [])),
    };
    if (JSON.stringify(order) !== JSON.stringify(change.order)) changes.record(change.layer, { ...change, order });
  }
}

/**
 * The elements of the container's layers on the canvas, in order: those the
 * live page has too (deleted ones included, new ones not). Null when text runs
 * on among them, which the page cannot put in another order.
 */
function layersIn(doc: Document, id: string): Element[] | null {
  const container = elementsOf(doc, id)[0];
  if (!container) return null;
  const text = [...container.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim());
  if (text || [...container.children].some((el) => el.hasAttribute(WRAP_ATTR))) return null;
  return [...container.children].filter((el) => !NOT_DRAWN.has(el.localName) && !el.hasAttribute(MADE_ATTR));
}

/** Makes each container the positioning reference of what is placed absolute in it, where it is not one already. */
export function holdAbsolute(containers: Iterable<Element>) {
  const held = [...containers].filter((container) => getComputedStyle(container).position === "static" || container.hasAttribute(REFERENCE_ATTR));
  for (const container of held) {
    keepOriginal(container);
    container.setAttribute(REFERENCE_ATTR, "");
  }
  declare(held, { position: "relative" });
}

/** The container with id `id`, once no change in `changes` places a layer absolute in it, is no longer a positioning reference. */
export function releaseAbsolute(doc: Document, id: string, changes: Change[]) {
  if (changes.some((change) => placedAt(change)?.absolute && placedAt(change)!.container.layer === id)) return;
  const own = changesOn(id, changes).filter((change) => change.kind !== "move");
  const held = elementsOf(doc, id).filter((container) => container.hasAttribute(REFERENCE_ATTR));
  for (const container of held) container.removeAttribute(REFERENCE_ATTR);
  restoreStyle(held, ["position"], own);
}
