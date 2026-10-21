/**
 * Which layer a click selects, the way Figma does it. A click stays at the
 * depth of the current selection: it selects the layer under the pointer that
 * sits beside the selected one, or the outermost one when nothing is selected.
 */
import type { Layer } from "./layers";

/** A click on `hit`, the deepest layer under the pointer. */
export function selectOnClick(hit: Layer, selected: Layer | null): Layer | null {
  const path = pathTo(hit);
  // The parent of the selection, or the closest layer above it that also holds the hit.
  let context = selected?.parent ?? path[0];
  while (!path.includes(context)) context = context.parent!;
  return selectable(path[path.indexOf(context) + 1] ?? context);
}

/** A double click goes one layer deeper, toward `hit`. Locked layers cannot be entered. */
export function selectOnDoubleClick(hit: Layer, selected: Layer | null): Layer | null {
  if (!selected || selected.kind === "locked") return selectOnClick(hit, selected);
  const path = pathTo(hit);
  const i = path.indexOf(selected);
  if (i < 0) return selectOnClick(hit, selected);
  return path[i + 1] ?? selected;
}

/** ⌘ + click: the deepest layer under the pointer. */
export function selectDeepest(hit: Layer): Layer | null {
  return selectable(hit);
}

/** Esc: up to the parent. The page itself is not selectable, so from an outermost layer it clears the selection. */
export function selectParent(selected: Layer): Layer | null {
  return selectable(selected.parent);
}

/** The page, then every layer down to `layer`. */
function pathTo(layer: Layer): Layer[] {
  const path: Layer[] = [];
  for (let l: Layer | null = layer; l; l = l.parent) path.unshift(l);
  return path;
}

function selectable(layer: Layer | null): Layer | null {
  return layer?.parent ? layer : null;
}
