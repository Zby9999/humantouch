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

/** The layer's elements in every instance of its usage on the page: those deleted on the canvas, no layers any more, count too, as the page still has them. */
function onPage(tree: LayerTree, layer: Layer): Element[] {
  const shown = tree.acrossInstances(layer).map((instance) => instance.el);
  const id = layer.text ? null : layer.el.getAttribute(LAYER_ID_ATTR);
  const all = id ? elementsOf(layer.el.ownerDocument, id) : [];
  return all.length > shown.length ? all : shown;
}

/** The instance of a loop the layer is, or is in, the nearest: one of several instances of its usage side by side in one container, those deleted on the canvas too. Null when it is in none. */
export function loopInstanceOf(tree: LayerTree, layer: Layer): Layer | null {
  for (let l: Layer | null = layer; l?.parent; l = l.parent) {
    if (l.text || l.made) continue;
    if (isLoop(onPage(tree, l))) return l;
  }
  return null;
}

/**
 * One instance alone, as a change made on it is recorded: its mark, which of
 * the loop's instances it is (`Change.instance`), and how many the loop
 * renders; and the layer's elements in it, which the change is written on.
 */
export interface Alone {
  mark: string;
  instance: NonNullable<Change["instance"]>;
  instances: number;
  els: Element[];
}

/**
 * Whether a change to the layer is made on its instance alone: it is in an
 * instance of a loop that no longer follows the others. Then the change is
 * written on its elements in that instance: one, or several, as a loop of its
 * own in it renders them. Null when it is not.
 */
export function aloneOf(tree: LayerTree, layer: Layer): Alone | null {
  const root = loopInstanceOf(tree, layer);
  const mark = root?.el.getAttribute(ALONE_ATTR);
  if (!root || !mark) return null;
  const els = tree.acrossInstances(layer).flatMap((instance) => (root.el.contains(instance.el) ? [instance.el] : []));
  if (!els.length) return null;
  const all = onPage(tree, root);
  return { mark, instance: instanceOf(root.el, all), instances: all.length, els };
}

/** The marks of the instances alone on the canvas `doc`, the largest number among them: the next is one more. */
export function lastAloneMark(doc: Document): number {
  let last = 0;
  for (const el of doc.querySelectorAll(`[${ALONE_ATTR}]`)) last = Math.max(last, Number(el.getAttribute(ALONE_ATTR)) || 0);
  return last;
}
