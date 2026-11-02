/**
 * Moving layers on a canvas, by layer ids and places only: the same moves apply
 * to the canvas being edited and to a saved one. A layer goes in each instance
 * of its container's usage; a layer one of several a loop renders goes alone.
 */
import { changesOn, declare, DELETED_ATTR, elementsOf, keepOriginal, LAYER_ID_ATTR, MADE_ATTR, MOVE_ATTR, REFERENCE_ATTR, restoreStyle, WRAP_ATTR } from "./canvas-style";
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
 * Where a new layer (a `create`) is among its container's layers on its
 * round's canvas, in its container's layout: how many come before it there
 * that the live page has too (`before`), and how many it may have or not, as
 * the Agent has applied the round so far or not (`maybe`: layers deleted,
 * moved or made this round, and those moved out of the container). `signs`:
 * what the container's layers not new this round look like (tag and words,
 * as a reorder's `order` has them), those moved out of it too: of the
 * elements of their look at its place, those are not it.
 */
export interface Among {
  before: number;
  maybe: number;
  signs: string[];
}

/** A change of a round placed on its canvas: a new layer's with where it is there (`among`; null: in no container there). */
export type ChangeOnCanvas = Change & { among?: Among | null };

declare const onCanvas: unique symbol;

/**
 * The changes of a round placed on its canvas, as `placedOnCanvas` alone
 * makes them: what the page checks a round by, as the Agent applies it,
 * claimed or not (ticket 76, 78). A new layer is found by where the canvas
 * places it, so the check takes no round its new layers are not placed in.
 */
export type RoundOnCanvas = ChangeOnCanvas[] & { readonly [onCanvas]: true };

/**
 * The changes of a round, each new layer's with where it is among its
 * container's layers on the round's canvas, `canvas` as saved (`Among`,
 * ticket 76): what the page finds it by. Read from the canvas by the page as
 * it checks, never saved with the ChangeSet, which the Agent may read: an
 * Agent that did went looking in the package for what it was. A round with
 * no new layer is as it is, its canvas not read.
 */
export function placedOnCanvas(changes: Change[], canvas: string): RoundOnCanvas {
  if (!canvas || !changes.some((change) => change.kind === "create")) return changes as RoundOnCanvas;
  const doc = new DOMParser().parseFromString(canvas, "text/html");
  return changes.map((change) => (change.kind === "create" ? { ...change, among: amongOf(doc, change.layer, changes) } : change)) as RoundOnCanvas;
}

/**
 * Where the new layer with id `id` is among its container's layers on the
 * canvas (`Among`). Null when it is in no container.
 */
function amongOf(doc: Document, id: string, changes: Change[]): Among | null {
  const el = elementsOf(doc, id).find((e) => e.getAttribute(MADE_ATTR) === id);
  const container = el?.parentElement;
  if (!el || !container) return null;
  const layers = [...container.children].filter((child) => !NOT_DRAWN.has(child.localName));
  let before = 0;
  let maybe = 0;
  for (const layer of layers.slice(0, layers.indexOf(el))) {
    if ([DELETED_ATTR, MADE_ATTR, MOVE_ATTR, WRAP_ATTR].some((attr) => layer.hasAttribute(attr))) maybe++;
    else before++;
  }
  const own = container.getAttribute(LAYER_ID_ATTR);
  const out = changes.filter((change) => change.kind === "move" && (change.before as Place).container.layer === own && (change.after as Place).container.layer !== own);
  const outside = out.flatMap((move) => elementsOf(doc, move.layer).slice(0, 1));
  const signs = [...layers.filter((layer) => !layer.hasAttribute(MADE_ATTR)), ...outside].map(signOf);
  return { before, maybe: maybe + out.length, signs };
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
