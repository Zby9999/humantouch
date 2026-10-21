/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { CanvasView } from "./CanvasView";
import { buildLayerTree, type Layer, type LayerTree } from "./layers";
import { LayerInfo } from "./LayerInfo";
import { LayerTreeView } from "./LayerTreeView";

/** Edit mode: layers on the left, the canvas in the middle, properties on the right. */
export function Shell() {
  const [tree, setTree] = useState<LayerTree | null>(null);
  const [selected, setSelected] = useState<Layer | null>(null);

  return (
    <div class="vk-shell">
      <aside class="vk-panel" aria-label="Layers">
        <h2 class="vk-panel-title">Layers</h2>
        {tree && <LayerTreeView tree={tree} selected={selected} onSelect={setSelected} />}
      </aside>
      <CanvasView
        onCanvas={(canvas) => setTree(buildLayerTree(canvas.document))}
        tree={tree}
        selected={selected}
        onSelect={setSelected}
      />
      <aside class="vk-panel" aria-label="Design">
        <h2 class="vk-panel-title">Design</h2>
        {tree && selected ? (
          <LayerInfo tree={tree} layer={selected} />
        ) : (
          <p class="vk-panel-empty">Select a layer to see its properties.</p>
        )}
      </aside>
    </div>
  );
}
