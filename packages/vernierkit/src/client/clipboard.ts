/**
 * ⌘C, ⌘X and ⌘V, inside the editor only: the system clipboard is left
 * alone. Made of the edit commands there are: a copy pasted is a copy (as
 * ⌘D makes), a cut layer is deleted at once, and pasted it is a move instead.
 */
import { LAYER_ID_ATTR } from "./canvas-style";
import type { ChangeSet } from "./changeset";
import type { Destination, Editor } from "./edits";
import type { Layer } from "./layers";
import { marginsOf, paddingBox } from "./stacks";

export interface Clipboard {
  /** Holds the layers to paste copies of. False when none of them can be copied. */
  copy(layers: Layer[]): boolean;
  /** Holds the layers and deletes them, to paste somewhere else. False when none of them can be cut. */
  cut(layers: Layer[]): boolean;
  /**
   * Into the Stack or Frame selected (at the end of a Stack, where each was
   * in its own Frame), or right after the layer selected; with nothing
   * selected, a copy goes right after its original, a cut layer back where it
   * was. Returns the layers pasted. Once a cut is pasted, it pastes again as copies.
   */
  paste(selected: Layer[]): Layer[];
}

interface Held {
  mode: "copy" | "cut";
  /** The layers' elements, and where each was in its container, in px from its top left. */
  items: { el: Element; spot: { x: number; y: number } }[];
}

export function createClipboard(editor: Editor, changes: ChangeSet): Clipboard {
  let held: Held | null = null;

  const spotOf = (layer: Layer) => {
    const reference = paddingBox(layer.parent!.el);
    const r = layer.el.getBoundingClientRect();
    const [top, , , left] = marginsOf(layer.el);
    return { x: Math.round(r.left - left - reference.left), y: Math.round(r.top - top - reference.top) };
  };
  const hold = (mode: Held["mode"], layers: Layer[]) => {
    held = { mode, items: layers.map((layer) => ({ el: layer.el, spot: spotOf(layer) })) };
  };
  /** Where the `n`th layer pasted goes, given the layer selected. Null: where the paste goes with nothing selected. */
  const destination = (target: Layer | null, item: Held["items"][number], n: number): Destination | null => {
    if (!target) return null;
    const isHeld = held!.items.some((h) => h.el === target.el);
    if (!isHeld && editor.canHold(target)) {
      return target.kind === "stack" ? { parent: target, index: target.children.length } : { parent: target, ...item.spot };
    }
    const parent = target.parent;
    if (!parent) return null;
    return parent.kind === "stack" ? { parent, index: parent.children.indexOf(target) + 1 + n } : { parent, ...item.spot };
  };

  return {
    copy(layers) {
      const copied = layers.filter((layer) => editor.canDuplicate(layer));
      if (!copied.length) return false;
      hold("copy", copied);
      return true;
    },
    cut(layers) {
      // A layer made this round is not in the source to move: it is copied, or dragged.
      const cut = layers.filter((layer) => editor.canDuplicate(layer) && editor.canRemove(layer) && !layer.made);
      if (!cut.length) return false;
      hold("cut", cut);
      editor.batch(() => {
        for (const layer of cut) editor.remove(editor.tree().layerOf(layer.el) ?? layer);
      });
      return true;
    },
    paste(selected) {
      if (!held) return [];
      const { mode, items } = held;
      const last = selected.at(-1);
      const pasted: Element[] = [];
      editor.batch(() => {
        items.forEach((item, n) => {
          if (mode === "cut") {
            // Back from its deletion first, then moved: one move in the ChangeSet.
            const id = item.el.getAttribute(LAYER_ID_ATTR);
            const deletion = changes.list().find((change) => change.kind === "delete" && change.layer === id);
            if (!deletion) return;
            editor.revert(deletion.id);
          }
          const layer = editor.tree().layerOf(item.el);
          if (!layer) return;
          const target = last ? editor.tree().layerOf(last.el) : null;
          const to = destination(target, item, n);
          if (to && !editor.canDrop(layer, to.parent)) return;
          if (mode === "copy") pasted.push(editor.duplicate(layer, to ?? undefined).el);
          else pasted.push((to ? editor.move(layer, to) : layer).el);
        });
      });
      const layers = pasted.map((el) => editor.tree().layerOf(el)).filter((layer) => layer !== null);
      if (mode === "cut" && layers.length) hold("copy", layers);
      return layers;
    },
  };
}
