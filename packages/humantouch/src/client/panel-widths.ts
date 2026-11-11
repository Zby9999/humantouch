/**
 * How wide the Layers and Design panels are, each dragged by its inner edge (designer, 2026-11-08): kept per viewer
 * in localStorage, and fitted to the window so the canvas between them keeps some room.
 */

export type Panel = "layers" | "design";
export interface Widths {
  layers: number;
  design: number;
}

/** The Layers: narrower, a few levels of names no longer show; wider, the canvas pays for little. Default as before. (designer, 2026-11-08) */
export const LAYERS = { min: 200, initial: 320, max: 400 };
/** The Design panel: no narrower than drawn (designer, 2026-11-08); at 280px its rows still hold, but get cramped. */
export const DESIGN = { min: 320, initial: 320, max: 480 };
/** The room the canvas keeps between the panels, whatever they are set to, while the window has it (designer, 2026-11-08). */
export const CANVAS_MIN = 400;

export const LIMITS: Record<Panel, { min: number; max: number }> = { layers: LAYERS, design: DESIGN };
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * The widths the panels take in a window `room` wide: each within its limits, then, short of room for the canvas,
 * the Layers narrower first and the Design panel after, each down to its least. Hidden, the Layers take none.
 */
export function fitWidths(set: Widths, room: number, layersShown: boolean): Widths {
  let layers = clamp(set.layers, LAYERS.min, LAYERS.max);
  let design = clamp(set.design, DESIGN.min, DESIGN.max);
  const over = () => (layersShown ? layers : 0) + design + CANVAS_MIN - room;
  if (layersShown && over() > 0) layers = Math.max(LAYERS.min, layers - over());
  if (over() > 0) design = Math.max(DESIGN.min, design - over());
  return { layers, design };
}

/** The widest `panel` can be dragged to, beside the other as it is: within its limits, leaving the canvas its room. */
export function maxWidth(panel: Panel, widths: Widths, room: number, layersShown: boolean): number {
  const other = panel === "layers" ? widths.design : layersShown ? widths.layers : 0;
  const { min, max } = LIMITS[panel];
  return Math.max(min, Math.min(max, room - CANVAS_MIN - other));
}

/** A width kept in storage: a positive whole number of pixels, or null for none (or one that isn't). */
export function parseWidth(text: string | null): number | null {
  if (text === null || !/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

const KEYS: Record<Panel, string> = { layers: "03kind:layers-width", design: "03kind:design-width" };

/** The widths this viewer set last, or the defaults. */
export function readWidths(): Widths {
  const read = (panel: Panel) => {
    try {
      return parseWidth(localStorage.getItem(KEYS[panel]));
    } catch {
      return null;
    }
  };
  return { layers: read("layers") ?? LAYERS.initial, design: read("design") ?? DESIGN.initial };
}

export function writeWidth(panel: Panel, width: number) {
  try {
    localStorage.setItem(KEYS[panel], String(Math.round(width)));
  } catch {}
}
