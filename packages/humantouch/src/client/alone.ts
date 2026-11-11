/**
 * One of the instances a loop renders, no longer following the others
 * (ticket 114, GLOSSARY: Instance): as Figma's overrides go, what is changed
 * on it, or on a layer in it, from then on is changed on it alone, and wins
 * over what the instances share; what is changed on another instance still
 * changes it too, but where it has a value of its own. It is not taken out
 * of the loop. The instance is marked on the canvas (`ALONE_ATTR`), and its
 * changes are recorded under a key of their own (`aloneKey`), not its layer's id.
 */
import { ALONE_ATTR, elementsOf, LAYER_ID_ATTR } from "./canvas-style";
import type { Change } from "./changeset";
import { instanceOf } from "./layer-target";
import type { Layer, LayerTree } from "./layers";

/** Instances a loop renders: several, side by side in one container. */
export function isLoop(els: Element[]): boolean {
  return els.length > 1 && els.every((el) => el.parentElement === els[0].parentElement);
}

/** The instance of a loop the layer is, or is in, the nearest: one of several instances of its usage side by side in one container. Null when it is in none. */
export function loopInstanceOf(tree: LayerTree, layer: Layer): Layer | null {
  for (let l: Layer | null = layer; l?.parent; l = l.parent) {
    if (l.text || l.made) continue;
    if (isLoop(tree.acrossInstances(l).map((instance) => instance.el))) return l;
  }
  return null;
}

/** One instance alone, as a change made on it is recorded: its mark, and which of the loop's instances it is (`Change.instance`). */
export interface Alone {
  mark: string;
  instance: NonNullable<Change["instance"]>;
}

/**
 * Whether a change to the layer is made on its instance alone: it is in an
 * instance of a loop that no longer follows the others, and is in each of
 * them once, so the others have it too. Null when it is not.
 */
export function aloneOf(tree: LayerTree, layer: Layer): Alone | null {
  const root = loopInstanceOf(tree, layer);
  const mark = root?.el.getAttribute(ALONE_ATTR);
  if (!root || !mark) return null;
  const loop = tree.acrossInstances(root);
  if (tree.acrossInstances(layer).length !== loop.length) return null;
  // Those deleted on the canvas count too, as the page still has them.
  const shown = loop.map((instance) => instance.el);
  const id = root.el.getAttribute(LAYER_ID_ATTR);
  const all = id ? elementsOf(root.el.ownerDocument, id) : [];
  return { mark, instance: instanceOf(root.el, all.length > shown.length ? all : shown) };
}

/** The marks of the instances alone on the canvas `doc`, the largest number among them: the next is one more. */
export function lastAloneMark(doc: Document): number {
  let last = 0;
  for (const el of doc.querySelectorAll(`[${ALONE_ATTR}]`)) last = Math.max(last, Number(el.getAttribute(ALONE_ATTR)) || 0);
  return last;
}
