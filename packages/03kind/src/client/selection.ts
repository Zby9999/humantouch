/**
 * Which layer a click selects, the way Figma does it. A click stays at the
 * depth of the current selection: it selects the layer under the pointer that
 * sits beside the selected one, or the outermost one when nothing is selected.
 */
import type { Layer } from "./layers";

/** A click on `hit`, the deepest layer under the pointer. */
export function selectOnClick(hit: Layer, selected: Layer | null): Layer | null {
  const path = pathTo(hit);
  // The parent of the selection, or the closest layer above it that also holds the hit; none, with the selection
  // in other layers than the hit (a layer off the canvas, and the canvas): from the outermost.
  let context: Layer | null = selected?.parent ?? path[0];
  while (context && !path.includes(context)) context = context.parent;
  context ??= path[0];
  return selectable(path[path.indexOf(context) + 1] ?? context);
}

/**
 * A second press this soon (ms) after the first, and this near it on screen (px), each let go before it
 * moved into a drag, is a double click: judged here, not by the system's double-click speed, which asked
 * the designer for quicker presses than felt right (2026-11-05).
 */
export const DOUBLE_CLICK_MS = 700;
export const DOUBLE_CLICK_PX = 8;

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

/** Esc: up to the parents. The page itself is not selectable, so from outermost layers it clears the selection. */
export function selectParents(selected: Layer[]): Layer[] {
  return [...new Set(selected.map((layer) => selectable(layer.parent)))].filter((layer) => layer !== null);
}

/** ⇧ + click: the layer joins the selection, or leaves it if it was in it. */
export function toggleIn(selected: Layer[], layer: Layer): Layer[] {
  return selected.includes(layer) ? selected.filter((l) => l !== layer) : [...selected, layer];
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
