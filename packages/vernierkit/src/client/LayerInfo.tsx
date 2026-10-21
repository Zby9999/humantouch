/** @jsxImportSource preact */
import { LayerIcon } from "./icons";
import { role, typeLabel, type Layer, type LayerTree } from "./layers";

/** Top of the Design panel: what the selected layer is and where it comes from in the source. */
export function LayerInfo({ tree, layer }: { tree: LayerTree; layer: Layer }) {
  const instances = tree.instancesOf(layer).length;
  return (
    <section class="vk-layer-info" aria-label="Selected layer">
      <h3 class={`vk-layer-name${role(layer) === "component" ? " is-component" : ""}`}>
        <LayerIcon layer={layer} />
        <span>{layer.name}</span>
      </h3>
      <dl>
        <dt>Type</dt>
        <dd>{typeLabel(layer)}</dd>
        {layer.component && (
          <>
            <dt>Component</dt>
            <dd>{layer.component}</dd>
          </>
        )}
        {layer.kind !== "locked" && (
          <>
            <dt>Source</dt>
            <dd class={layer.loc ? "vk-source" : "vk-unlocated"}>{layer.loc ?? "Not located"}</dd>
          </>
        )}
        {layer.usageLoc && (
          <>
            <dt>Usage</dt>
            <dd class="vk-source">{layer.usageLoc}</dd>
          </>
        )}
        {instances > 1 && (
          <>
            <dt>Instances</dt>
            <dd>{instances}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
