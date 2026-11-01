/**
 * Which layers the Layers panel lists closed, followed as the layers are
 * built anew (ticket 74). A layer still listed stays as it was. A layer no
 * longer listed (deleted, say) is remembered as it was. An edit that
 * restores it (an undo or redo, a deletion taken back from the change list, a
 * layer put back as it was moved off the canvas) lists it closed or open as
 * before it went, as it brings back everything else. Back any other way, it
 * is as a layer new to the list: open.
 */
import type { Layer, LayerTree } from "./layers";

export interface Folds {
  /**
   * The layers closed in `trees`, the layers as built anew from `shown`, where
   * `closed` were closed. `restoring`: built anew by an edit that restores layers as they were.
   */
  follow(closed: ReadonlySet<Layer>, shown: LayerTree[], trees: LayerTree[], restoring: boolean): Set<Layer>;
}

/** `fresh`: what the layers of a layer off the canvas have closed as they are first listed. */
export function createFolds(fresh: (tree: LayerTree) => Layer[]): Folds {
  /** The elements of the layers closed as they went from the list. */
  const away = new Set<Element>();
  /** The documents listed so far: the canvas, and those of layers off it. */
  const listed = new WeakSet<Document>();
  const docOf = (tree: LayerTree) => tree.root.el.ownerDocument;
  return {
    follow(closed, shown, trees, restoring) {
      for (const tree of shown) listed.add(docOf(tree));
      const known = new Set(shown.map(docOf));
      const layerOf = (el: Element) => trees.find((tree) => docOf(tree) === el.ownerDocument)?.layerOf(el) ?? null;
      const next = new Set<Layer>();
      for (const layer of closed) {
        const found = layerOf(layer.el);
        if (found) next.add(found);
        else away.add(layer.el);
      }
      for (const el of away) {
        const found = layerOf(el);
        if (!found) continue;
        away.delete(el);
        if (restoring) next.add(found);
      }
      for (const tree of trees) {
        const doc = docOf(tree);
        if (known.has(doc) || (restoring && listed.has(doc))) continue;
        for (const layer of fresh(tree)) next.add(layer);
      }
      return next;
    },
  };
}
