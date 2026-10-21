/** @jsxImportSource preact */
import { LayerIcon } from "./icons";
import { role, typeLabel, type Layer, type LayerTree } from "./layers";

/** Top of the Design panel: what the selected layer is and where it comes from in the source. */
export function LayerInfo({ tree, layer }: { tree: LayerTree; layer: Layer }) {
  const repeats = tree.acrossInstances(layer).length;
  return (
    <section class="vk-layer-info" aria-label="Selected layer">
      <h3 class={`vk-layer-name${role(layer) === "instance" ? " is-instance" : ""}`}>
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
        {repeats > 1 &&
          (layer.isInstance ? (
            <>
              <dt>Instances</dt>
              <dd>{repeats}</dd>
            </>
          ) : (
            <>
              <dt>Repeated</dt>
              <dd>In {repeats} instances</dd>
            </>
          ))}
      </dl>
      {layer.text && layer.parent && (
        <p class="vk-layer-note">Text styles apply to the layer it sits in, {layer.parent.name}.</p>
      )}
    </section>
  );
}
