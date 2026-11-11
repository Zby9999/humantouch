/**
 * The views side by side on the stage (ADR 0008): the desktop view first,
 * then the others, widest first, a gap between each; and the layers off the
 * canvas (ADR 0009) where the designer left them in the workspace around them.
 */
import type { OffCanvas, OffCanvasLayer } from "./off-canvas";
import type { View } from "./views";
import { viewName } from "./ViewLabels";

/** Between one view and the next, in canvas px. */
const VIEW_GAP = 80;
/**
 * Between one view and the next once the page has a brief, in canvas px (ticket 134): wide enough for each view's
 * cards in the gap at its right, full size from `FULL_SIZE_FROM` up (`brief-cards.ts`) (designer, 2026-11-11).
 */
export const VIEW_GAP_WITH_BRIEFS = 600;
/** A view's label sits this far above it, on screen. */
export const LABEL_OFFSET = 26;

/**
 * A view of the canvas, or a layer off it, where it is on the stage: `x` and
 * `y` from the desktop view's top left edge, in canvas px.
 */
export interface Placed {
  /** Null until it is laid out. */
  view: View | null;
  name: string;
  desktop: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  /** A layer off the canvas (ADR 0009), rather than a view of it. */
  offCanvasLayer?: OffCanvasLayer;
}

/** A view laid out, where it is on the stage. */
export type Shown = Placed & { view: View };

/** What tells views apart: their width, but for the desktop view, which may be as wide as another. */
export function keyOf(placed: Placed): string {
  return placed.offCanvasLayer ? `off ${placed.offCanvasLayer.id}` : placed.desktop ? "desktop" : String(placed.width);
}

/**
 * Every view of the canvas, side by side on the stage: the desktop view, as
 * wide as the canvas, first; then one for each of `widths`, widest first,
 * `beside` holding those laid out so far, by width; `gap` between each.
 */
export function layoutViews(canvasWidth: number, desktop: View, widths: number[], beside: Map<number, View>, gap = VIEW_GAP): Placed[] {
  const placed: Placed[] = [{ view: desktop, name: viewName(canvasWidth, true), desktop: true, x: 0, y: 0, width: canvasWidth, height: desktop.height }];
  let x = canvasWidth;
  for (const width of widths) {
    const view = beside.get(width) ?? null;
    placed.push({ view, name: viewName(width, false), desktop: false, x: x + gap, y: 0, width, height: view?.height ?? 0 });
    x += gap + width;
  }
  return placed;
}

/** How wide the views are side by side, in canvas px, the canvas `canvasWidth` px wide. */
export function viewsWidth(canvasWidth: number, widths: number[], gap = VIEW_GAP): number {
  return canvasWidth + widths.reduce((sum, width) => sum + gap + width, 0);
}

/** The layers off the canvas, where they are on the stage. */
export function placeOffCanvas(offCanvas: OffCanvas | null): Shown[] {
  return (
    offCanvas?.list().map((offCanvasLayer) => {
      const { view, x, y, width, height } = offCanvasLayer;
      return { view, name: "Off canvas", desktop: false, x, y, width, height, offCanvasLayer };
    }) ?? []
  );
}

/** Which of `among`, laid out, is at (`x`, `y`) on the stage, the first that is, and where that is in it, in its px. */
export function shownAt(among: Placed[], x: number, y: number): { at: Shown; x: number; y: number } | null {
  const at = among.find((p): p is Shown => p.view !== null && x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height);
  return at ? { at, x: x - at.x, y: y - at.y } : null;
}
