/**
 * The camera over the canvas: where the views sit in the viewport and at
 * what scale, as the designer pans and zooms, fits every view in (⇧1), or
 * plays the canvas at 100%, scrolled like a page (ADR 0010).
 */
import type { Canvas } from "./freezer";

/** Where the canvas sits in the viewport: its top-left corner and its scale. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** The size of all the views side by side, in canvas px; `x` and `y`, where it starts, when not at the desktop view's top left. */
export interface Bounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

/** A box on the stage, in canvas px: a view, a layer off the canvas, a layer in one. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 32;
/** Room kept around the canvas when it is fitted to the viewport. */
const PADDING = 40;
/** Room kept above the views, for the tools and the views' labels. */
const TOP = 72;
/** Wheel distance (px) per e-fold of zoom. Mouse wheel notches are clamped so one notch is a modest step. */
const ZOOM_SPEED = 0.01;
const MAX_ZOOM_STEP = 30;

/** The camera as it frames a view: what is at its top left is at the view's. */
export function cameraIn(camera: Camera, shown: Pick<Box, "x" | "y">): Camera {
  return { ...camera, x: camera.x + shown.x * camera.zoom, y: camera.y + shown.y * camera.zoom };
}

/** A box on the canvas, placed over it in the viewport. */
export function place(r: Box, camera: Camera) {
  return { left: `${camera.x + r.x * camera.zoom}px`, top: `${camera.y + r.y * camera.zoom}px`, width: `${r.width * camera.zoom}px`, height: `${r.height * camera.zoom}px` };
}

/** The stage's CSS transform for the camera. */
export function transformOf({ x, y, zoom }: Camera): string {
  return `translate(${x}px, ${y}px) scale(${zoom})`;
}

/**
 * Has the browser draw only what the camera shows of the stage again, once a
 * camera move animated on it has ended, with nothing on screen changed.
 *
 * Chromium draws all of what is under an animated transform. Once it has
 * drawn all of the stage, under an animation or with all of it in sight, it
 * goes on drawing all of it while the transform is set from script, as the
 * camera's is: on a large page, each change to a view then had the whole of
 * it drawn again, not just what shows, some 12ms a frame (ticket 22). Taking
 * the stage out of the layout and putting it back in the same task, before
 * anything is drawn, makes the browser start that over: the views keep their
 * documents, what has focus keeps it, and the stage is drawn the same.
 * Zoomed out till every view shows in full, the stage is drawn whole again,
 * and stays so after zooming back in till the next animated camera move.
 */
export function drawOnlyWhatShows(stage: HTMLElement) {
  // Only `display` is touched: the style written again in full would be read back with fewer digits, the camera a little off.
  const display = stage.style.getPropertyValue("display");
  const priority = stage.style.getPropertyPriority("display");
  stage.style.setProperty("display", "none");
  stage.getBoundingClientRect();
  if (display) stage.style.setProperty("display", display, priority);
  else stage.style.removeProperty("display");
}

/** Where the stage is right now, partway through an animation included. */
export function currentCamera(stage: HTMLElement): Camera {
  const m = new DOMMatrix(getComputedStyle(stage).transform);
  return { x: m.e, y: m.f, zoom: m.a };
}

/** At 100%, kept within the view played: in the middle when it is narrower than the viewport, its bottom no higher than the viewport's. */
export function scrolled(camera: Camera, played: Bounds, area: DOMRect): Camera {
  const within = (n: number, min: number) => Math.max(Math.min(0, min), Math.min(0, n));
  const x = played.width <= area.width ? Math.round((area.width - played.width) / 2) : within(camera.x, area.width - played.width);
  return { zoom: 1, x, y: within(camera.y, area.height - played.height) };
}

/** At most 100%, every view across, and the part of the page the designer was looking at on top. */
export function initialCamera(canvas: Pick<Canvas, "scrollY">, bounds: Bounds, area: DOMRect): Camera {
  const zoom = clamp(Math.min(1, (area.width - 2 * PADDING) / bounds.width));
  return { ...centered(bounds, area, zoom), y: TOP - canvas.scrollY * zoom };
}

/** Every view in the viewport, as large as they fit. */
export function fitCamera(bounds: Bounds, area: DOMRect): Camera {
  const zoom = clamp(Math.min((area.width - 2 * PADDING) / bounds.width, (area.height - TOP - PADDING) / bounds.height));
  const { x } = centered(bounds, area, zoom);
  return { zoom, x: x - (bounds.x ?? 0) * zoom, y: TOP + (area.height - TOP - PADDING - bounds.height * zoom) / 2 - (bounds.y ?? 0) * zoom };
}

function centered(bounds: Bounds, area: DOMRect, zoom: number): Camera {
  return { zoom, x: (area.width - bounds.width * zoom) / 2, y: (area.height - bounds.height * zoom) / 2 };
}

/** All the views side by side, and any layers off the canvas: from the leftmost to the rightmost, the topmost to the lowest. */
export function boundsOf(placed: Box[]): Bounds {
  const x = Math.min(...placed.map((p) => p.x));
  const y = Math.min(...placed.map((p) => p.y));
  return { x, y, width: Math.max(...placed.map((p) => p.x + p.width)) - x, height: Math.max(...placed.map((p) => p.y + p.height)) - y };
}

/** Zoomed by a wheel turned `dy` px (with ⌘ or Ctrl held, or pinched), keeping the point (`px`, `py`) of the viewport fixed. */
export function wheelZoom(camera: Camera, dy: number, px: number, py: number): Camera {
  const step = Math.max(-MAX_ZOOM_STEP, Math.min(MAX_ZOOM_STEP, dy));
  return zoomAt(camera, Math.exp(-step * ZOOM_SPEED), px, py);
}

/** Scales by `factor`, keeping the point (`px`, `py`) of the viewport fixed. */
function zoomAt(camera: Camera, factor: number, px: number, py: number): Camera {
  const zoom = clamp(camera.zoom * factor);
  const k = zoom / camera.zoom;
  return { zoom, x: px - (px - camera.x) * k, y: py - (py - camera.y) * k };
}

function clamp(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}
