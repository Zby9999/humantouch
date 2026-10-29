/** @jsxImportSource preact */
import { LayerIcon } from "./icons";
import { isWholeText, role, typeLabel, type Layer, type LayerTree } from "./layers";

/** Top of the Design panel: what the selected layer is and where it comes from in the source; with several, how many. */
export function LayerInfo({ tree, layers }: { tree: LayerTree; layers: Layer[] }) {
  if (layers.length > 1) {
    return (
      <section class="vk-layer-info" aria-label="Selected layers">
        <h3 class="vk-layer-name">{layers.length} layers</h3>
      </section>
    );
  }
  const [layer] = layers;
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
        <p class="vk-layer-note">
          {isWholeText(layer)
            ? `The text of ${layer.parent.name}: its text styles are written on ${layer.parent.name} itself.`
            : `Text styles apply to the layer it sits in, ${layer.parent.name}.`}
        </p>
      )}
    </section>
  );
}
