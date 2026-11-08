/** @jsxImportSource preact */
import { breakpointName } from "./breakpoints";
import type { Editor } from "./edit-commands";
import type { Property } from "./property-table";
import type { Layer } from "./layers";

interface Props {
  editor: Editor;
  /** The selected layers. */
  layers: Layer[];
  /** What the view worked in is called: "Phone". */
  view: string;
}

/**
 * Beside the selected layer's name at the top of the Design panel, in a view other than the desktop view: the
 * breakpoint edits there apply at (ADR 0008), its widths alone, as the layer's name is shown (designer, 2026-11-08).
 * What the selected layers have changed there shows on its fields, each with its reset (designer, 2026-11-07).
 */
export function BreakpointBadge({ editor, layers, view }: Props) {
  const breakpoint = editor.breakpoint();
  const changed: Property[] = [];
  for (const layer of layers) for (const property of editor.changesHere(layer)) if (!changed.includes(property)) changed.push(property);
  // A view in the desktop view's range edits every width, as it does; only what a narrower range recorded before holds there is shown.
  if (!breakpoint && !changed.length) return null;
  return (
    <span class="tk-breakpoint-badge" role="note" aria-label={`${view} breakpoint`}>
      {breakpointName(breakpoint)}
    </span>
  );
}
