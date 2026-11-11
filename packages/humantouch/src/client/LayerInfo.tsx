/** @jsxImportSource preact */
import type { ComponentChildren } from "preact";
import { LayerIcon } from "./icons";
import { isOnlyText, role, typeLabel, type Layer, type LayerTree } from "./layers";

/**
 * Top of the Design panel: what the selected layer is and where it comes from in the source; with several, how many.
 * `badge`: beside the name, at its right (the breakpoint, `BreakpointBadge`).
 */
export function LayerInfo({ tree, layers, badge }: { tree: LayerTree; layers: Layer[]; badge?: ComponentChildren }) {
  if (layers.length > 1) {
    return (
      <section class="ht-layer-info" aria-label="Selected layers">
        <div class="ht-layer-head">
          <h3 class="ht-layer-name">{layers.length} layers</h3>
          {badge}
        </div>
      </section>
    );
  }
  const [layer] = layers;
  const repeats = tree.acrossInstances(layer).length;
  return (
    <section class="ht-layer-info" aria-label="Selected layer">
      <div class="ht-layer-head">
        <h3 class={`ht-layer-name${role(layer) === "instance" ? " is-instance" : ""}`}>
          <LayerIcon layer={layer} />
          {/* A text layer's name is its words, as long as they are: here, what it is (designer, 2026-11-07). */}
          <span>{layer.kind === "text" ? "Text" : layer.name}</span>
        </h3>
        {badge}
      </div>
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
            <dd class={layer.loc ? "ht-source" : "ht-unlocated"}>{layer.loc ?? "Not located"}</dd>
          </>
        )}
        {layer.usageLoc && (
          <>
            <dt>Usage</dt>
            <dd class="ht-source">{layer.usageLoc}</dd>
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
        <p class="ht-layer-note">
          {isOnlyText(layer)
            ? `The text of ${layer.parent.name}: its text styles are written on ${layer.parent.name} itself.`
            : `Text styles apply to the layer it sits in, ${layer.parent.name}.`}
        </p>
      )}
    </section>
  );
}
