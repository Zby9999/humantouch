/** @jsxImportSource preact */
import { CanvasView } from "./CanvasView";

/** Edit mode: layers on the left, the canvas in the middle, properties on the right. */
export function Shell() {
  return (
    <div class="vk-shell">
      <aside class="vk-panel" aria-label="Layers">
        <h2 class="vk-panel-title">Layers</h2>
        <p class="vk-panel-empty">The layer tree will show up here.</p>
      </aside>
      <CanvasView />
      <aside class="vk-panel" aria-label="Design">
        <h2 class="vk-panel-title">Design</h2>
        <p class="vk-panel-empty">Select a layer to see its properties.</p>
      </aside>
    </div>
  );
}
