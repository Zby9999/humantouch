/**
 * Which layers the Layers panel lists closed, followed as the layers are
 * built anew (ticket 74). A layer still listed stays as it was. A layer no
 * longer listed (deleted, say) is remembered as it was. An edit that brings it
 * back as it was (an undo or redo, a deletion taken back from the change
 * list, a layer put back as it was moved off the canvas) lists it closed or
 * open as before it went, as it brings back everything else. Back any other
 * way, it is as a layer new to the list: open.
 *
 * What is remembered outlives the panel: hidden, the panel goes, and the
 * layers closed in it then are remembered as they were too. Shown again, it
 * starts its layers anew, as on entering edit mode; a layer brought back
 * after that, deleted before or while the panel was hidden, is listed as it
 * was when it went, or when the panel was hidden (ticket 74, line review).
 */
import type { Layer, LayerTree } from "./layers";

/** What the Layers panel remembers of its closed layers, kept by the shell while edit mode is up, the panel shown or not. */
export interface Folds {
  /**
   * The layers closed in `trees`, the layers as built anew from `shown`, where
   * `closed` were closed. `bringingBack`: built anew by an edit that brings layers back as they were.
   */
  follow(closed: ReadonlySet<Layer>, shown: LayerTree[], trees: LayerTree[], bringingBack: boolean): Set<Layer>;
  /** The panel is shown on `trees`, its layers anew: those listed there are as it starts them, whatever they were before. */
  shown(trees: LayerTree[]): void;
  /** The panel is hidden, `closed` closed in it: each is remembered so, as a layer gone from the list is. */
  hidden(closed: ReadonlySet<Layer>): void;
}

/** A layer off the canvas starts with what is in it closed: it is one row beside the canvas's. */
export function closedOutside(tree: LayerTree): Layer[] {
  return tree.root.children.filter((layer) => layer.children.length > 0);
}

export function createFolds(): Folds {
  /** The elements of the layers closed as they went from the list. */
  const away = new Set<Element>();
  /** The documents listed so far: the canvas, and those of layers off it. */
  const listed = new WeakSet<Document>();
  const docOf = (tree: LayerTree) => tree.root.el.ownerDocument;
  const finder = (trees: LayerTree[]) => (el: Element) => trees.find((tree) => docOf(tree) === el.ownerDocument)?.layerOf(el) ?? null;
  return {
    follow(closed, shown, trees, bringingBack) {
      for (const tree of shown) listed.add(docOf(tree));
      const known = new Set(shown.map(docOf));
      const layerOf = finder(trees);
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
        if (bringingBack) next.add(found);
      }
      for (const tree of trees) {
        const doc = docOf(tree);
        if (known.has(doc) || (bringingBack && listed.has(doc))) continue;
        for (const layer of closedOutside(tree)) next.add(layer);
      }
      return next;
    },
    shown(trees) {
      const layerOf = finder(trees);
      for (const el of away) if (layerOf(el)) away.delete(el);
    },
    hidden(closed) {
      for (const layer of closed) away.add(layer.el);
    },
  };
}
