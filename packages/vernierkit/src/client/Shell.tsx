/** @jsxImportSource preact */
import { useEffect, useReducer, useRef, useState } from "preact/hooks";
import { CanvasView } from "./CanvasView";
import { createChangeSet } from "./changeset";
import { createEditor, type Editor } from "./edits";
import { buildLayerTree, type Layer, type LayerTree } from "./layers";
import { LayerInfo } from "./LayerInfo";
import { LayerTreeView } from "./LayerTreeView";
import { Properties } from "./Properties";

interface Props {
  /** Edit mode has ended; the shell goes once the canvas is back over the page. */
  leaving: boolean;
  /** False: switch modes instantly (the toggle was pressed from the keyboard). */
  animate: boolean;
  onLeft(): void;
}

/** How long after the last edit the selection box comes back. */
const ADJUSTING_MS = 200;

/** Edit mode: layers on the left, the canvas in the middle, properties on the right. */
export function Shell({ leaving, animate, onLeft }: Props) {
  const [tree, setTree] = useState<LayerTree | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selected, setSelected] = useState<Layer | null>(null);
  /** Bumped on each edit: the panel reads its values from the canvas. */
  const [, edited] = useReducer((n: number) => n + 1, 0);
  /** Values are being adjusted: the selection box steps aside so the change shows. */
  const [adjusting, setAdjusting] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  const onEdit = () => {
    edited(undefined);
    setAdjusting(true);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setAdjusting(false), ADJUSTING_MS);
  };
  const select = (layer: Layer | null) => {
    clearTimeout(settle.current);
    setAdjusting(false);
    setSelected(layer);
  };

  return (
    <div class="vk-shell">
      <aside class="vk-panel" aria-label="Layers">
        <h2 class="vk-panel-title">Layers</h2>
        {tree && <LayerTreeView tree={tree} selected={selected} onSelect={select} />}
      </aside>
      <CanvasView
        onCanvas={(canvas) => {
          const layers = buildLayerTree(canvas.document);
          setTree(layers);
          // The ChangeSet lives in memory for now, so it goes with the canvas.
          setEditor(createEditor(layers, createChangeSet()));
        }}
        tree={tree}
        selected={selected}
        hideSelection={adjusting}
        onSelect={select}
        leaving={leaving}
        animate={animate}
        onLeft={onLeft}
      />
      <aside class="vk-panel" aria-label="Design">
        <h2 class="vk-panel-title">Design</h2>
        {tree && editor && selected ? (
          <>
            <LayerInfo tree={tree} layer={selected} />
            <Properties editor={editor} layer={selected} onEdit={onEdit} />
          </>
        ) : (
          <p class="vk-panel-empty">Select a layer to see its properties.</p>
        )}
      </aside>
    </div>
  );
}
