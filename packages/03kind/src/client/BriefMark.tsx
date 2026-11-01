/** @jsxImportSource preact */
import { BRIEF_ATTR } from "./canvas-style";
import { Icon } from "./icons";
import type { Layer, LayerTree } from "./layers";
import type { View } from "./views";

/** The layers of `doc`, laid out as `tree`, that have a brief: each instance. */
export function briefedLayers(doc: Document, tree: LayerTree): Layer[] {
  return [...doc.querySelectorAll(`[${BRIEF_ATTR}]`)].map((el) => tree.layerOf(el)).filter((layer): layer is Layer => layer !== null);
}

interface Props {
  layer: Layer;
  view: View;
  /** What the view is called. */
  name: string;
  /** Where the view is on screen, and at what zoom. */
  camera: { x: number; y: number; zoom: number };
}

/** On a layer with a brief, in a view: a small mark of the brief on its top right corner, as the button beside a new Frame shows it. */
export function BriefMark({ layer, view, name, camera }: Props) {
  const r = view.boxOf(layer);
  // Not drawn (hidden): nowhere to mark.
  if (!r || (!r.width && !r.height)) return null;
  return (
    <span class="tk-brief-mark" data-view={name} aria-hidden="true" style={{ left: `${camera.x + r.right * camera.zoom}px`, top: `${camera.y + r.top * camera.zoom}px` }}>
      <Icon name="brief" />
    </span>
  );
}
