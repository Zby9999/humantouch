/**
 * A drag on the canvas under way: the layer dragged and the layers making
 * room for it are shifted on the canvas, so in every view, with inline
 * styles that are all restored when it ends, whatever happens then. Where layers were laid out before anything shifted is noted, so a
 * drop is found as if nothing had.
 */
import type { Drop } from "./drag";
import type { Layer } from "./layers";
import { EASE_OUT, prefersReducedMotion } from "./motion";
import type { Shown } from "./view-layout";
import type { Views } from "./views";

/** Pointer travel (px) before a press on a layer counts as a drag. */
export const DRAG_THRESHOLD = 3;
/** How near on screen (px) a layer dragged freely comes to lining up before it snaps there. */
export const SNAP_PX = 5;

/** Where the pointer is, in the window. */
export type At = Pick<MouseEvent, "clientX" | "clientY">;
/** That, and the keys that change a drag. */
export type Pointer = At & Pick<MouseEvent, "metaKey" | "ctrlKey">;

/** A drag under way, and the canvas styles it has changed, to put back. */
export interface DragSession {
  layer: Layer;
  /** The view it is dragged in: where things are is read there, in its px. */
  in: Shown;
  /** Where the layer was when the drag began. */
  start: DOMRect;
  /** Where layers were laid out before anything shifted, by element. */
  rects: Map<Element, DOMRect>;
  touched: Map<Element, { original: Record<string, [string, string]>; translate: boolean }>;
  drop: Drop | null;
  /** Where the layer is dragged to, in the view's px; none before it moves. */
  box?: DOMRect;
  /** Let go now, the layer goes off the canvas (ADR 0009). */
  out: boolean;
  /** A layer off the canvas, dragged whole: where its top left would go on the stage; null over a view. */
  to: { x: number; y: number } | null;
  /** A layer off the canvas dragged whole, rather than a layer in a view or in it. */
  whole?: true;
  /** A layer off the canvas dragged over a view: where it would go back onto the canvas there; null where it cannot. */
  back: Drop | null;
  /** Lets the views grow and shrink again, which they do not while the drag shifts layers. */
  release: () => void;
  /** Where the pointer was last, to drag again there as ⌘ is pressed or let go. */
  pointer?: Pointer;
}

/**
 * Starts dragging the layer in a view: it stops taking the pointer, and where
 * its neighbours are there is noted before any of them shifts. No view grows
 * or shrinks with what shifts until the drop. A layer off the canvas itself
 * is dragged whole, about the workspace or back onto the canvas.
 */
export function startDragSession(layer: Layer, shown: Shown, views: Views): DragSession {
  const { view, offCanvasLayer } = shown;
  const start = view.boxOf(layer) ?? new DOMRect();
  const session: DragSession = { layer, in: shown, start, rects: new Map(), touched: new Map(), drop: null, out: false, to: null, back: null, release: () => {} };
  if (!layer.text && offCanvasLayer?.layer()?.el === layer.el) {
    session.to = { x: offCanvasLayer.x, y: offCanvasLayer.y };
    session.whole = true;
    return session;
  }
  for (const child of layer.parent!.children) {
    const r = !child.text && view.boxOf(child);
    if (r) session.rects.set(child.el, r);
  }
  if (!layer.text) setStyles(session, layer.el, { "pointer-events": "none", "z-index": "2147483647" });
  if (!offCanvasLayer) session.release = views.holdHeights();
  return session;
}

/** Where a layer is laid out in the view dragged in, as before anything shifted. */
export function laidOut(session: DragSession, layer: Layer): DOMRect {
  if (layer.text) return session.in.view.boxOf(layer) ?? new DOMRect();
  let r = session.rects.get(layer.el);
  if (!r) session.rects.set(layer.el, (r = unshifted(session, layer.el)));
  return r;
}

/**
 * Shifts the layer dragged `by` from where it was, and the layers making room
 * for it as `drop` has them, sliding aside; any shifted before and not now goes back.
 */
export function shift(session: DragSession, by: { x: number; y: number }, drop: Drop | null): void {
  const { layer } = session;
  const shifts = new Map(drop?.shifts);
  if (!layer.text) shifts.set(layer.el, by);
  for (const [el, saved] of session.touched) {
    if (!shifts.has(el) && saved.translate) setStyles(session, el, { translate: null, transition: null });
  }
  for (const [el, { x, y }] of shifts) {
    const slide = el !== layer.el && !prefersReducedMotion();
    setStyles(session, el, { translate: `${x}px ${y}px`, transition: slide ? `translate 150ms ${EASE_OUT}` : "none" });
  }
}

/** Shifts a layer off the canvas dragged whole `dx` and `dy` from where it is in the workspace. */
export function moveWhole(session: DragSession, dx: number, dy: number): void {
  setStyles(session, session.in.offCanvasLayer!.document.defaultView!.frameElement!, { translate: `${dx}px ${dy}px` });
}

/** Ends the drag on the canvas: every style it changed is as it was, and each view is as tall as what it shows again. */
export function restoreDragStyles(session: DragSession): void {
  session.release();
  for (const [el, saved] of session.touched) {
    for (const [name, [value, priority]] of Object.entries(saved.original)) {
      if (value) (el as HTMLElement).style.setProperty(name, value, priority);
      else (el as HTMLElement).style.removeProperty(name);
    }
  }
}

/** The box between two points. */
export function boxFrom(a: { x: number; y: number }, b: { x: number; y: number }): DOMRect {
  return new DOMRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Where an element is laid out, as if nothing had shifted: the layers making
 * room (and what is in them) may be partway through sliding aside.
 */
function unshifted(session: DragSession, el: Element): DOMRect {
  const { view } = session.in;
  const r = (view.elementOf(el) ?? el).getBoundingClientRect();
  let [x, y] = [r.x, r.y];
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e === session.layer.el || !session.touched.get(e)?.translate) continue;
    const [dx = 0, dy = 0] = getComputedStyle(view.elementOf(e) ?? e).translate.split(" ").map((v) => parseFloat(v) || 0);
    x -= dx;
    y -= dy;
  }
  return new DOMRect(x, y, r.width, r.height);
}

/** Sets (or, with null, takes off) inline styles on a canvas element for the drag, noting what they were. */
function setStyles(session: DragSession, el: Element, styles: Record<string, string | null>) {
  const style = (el as HTMLElement).style;
  let saved = session.touched.get(el);
  if (!saved) session.touched.set(el, (saved = { original: {}, translate: false }));
  for (const name in styles) {
    saved.original[name] ??= [style.getPropertyValue(name), style.getPropertyPriority(name)];
    const value = styles[name];
    if (value === null) {
      const [original, priority] = saved.original[name];
      if (original) style.setProperty(name, original, priority);
      else style.removeProperty(name);
    } else style.setProperty(name, value, "important");
  }
  if ("translate" in styles) saved.translate = styles.translate !== null;
}
