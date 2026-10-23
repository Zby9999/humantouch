/** @jsxImportSource preact */
import type { TargetedPointerEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { findDrop, type Drop } from "./drag";
import type { Destination, Editor } from "./edits";
import { freeze, restore, type Canvas } from "./freezer";
import { Icon } from "./icons";
import { EASE_IN_OUT, EASE_OUT, MODE_FADE_MS, MODE_SWITCH_MS, prefersReducedMotion } from "./motion";
import { boxOf, role, type Layer, type LayerTree } from "./layers";
import { selectDeepest, selectOnClick, selectOnDoubleClick, selectParents, toggleIn } from "./selection";

/** Where the canvas sits in the viewport: its top-left corner and its scale. */
interface View {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 32;
/** Room kept around the canvas when it is fitted to the viewport. */
const PADDING = 40;
/** Wheel distance (px) per e-fold of zoom. Mouse wheel notches are clamped so one notch is a modest step. */
const ZOOM_SPEED = 0.01;
const MAX_ZOOM_STEP = 30;
/** Performance entries: a mark when the designer asks for edit mode, a measure once the canvas is on screen. */
export const ENTER_MARK = "vernierkit:enter-edit-mode";

interface Props {
  /** A saved canvas to put back; null to freeze the page. */
  restoreFrom: string | null;
  /** Called once the page is frozen, or the saved canvas restored, and laid out. */
  onCanvas(canvas: Canvas): void;
  /** The canvas's layers, once there is a canvas. */
  tree: LayerTree | null;
  /** The selected layers, the one selected last at the end: clicks go on from its depth. */
  selected: Layer[];
  /** Keep the selection box out of the way, as while a value is being adjusted. */
  hideSelection: boolean;
  onSelect(layers: Layer[]): void;
  /** What a dragged layer can be moved into; null until there is a canvas to edit. */
  editor: Editor | null;
  /** A dragged layer let go where it can go. */
  onMove(layer: Layer, to: Destination): void;
  /** Edit mode has ended: grow the canvas back over the page, then call `onLeft`. */
  leaving: boolean;
  /** False: switch modes instantly (the toggle was pressed from the keyboard). */
  animate: boolean;
  /** The canvas has changes the page does not: on leaving, it fades into the page instead of cutting to it. */
  changed: boolean;
  onLeft(): void;
}

/** The middle column: the frozen page, scaled and panned inside a viewport. */
export function CanvasView({ restoreFrom, onCanvas, tree, selected, hideSelection, onSelect, editor, onMove, leaving, animate, changed, onLeft }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** The deepest layer under the pointer, and whether ⌘ / Ctrl is held: the layer a click would select is outlined. */
  const [hover, setHover] = useState<{ hit: Layer; deep: boolean } | null>(null);
  const pan = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  /** A press on a layer that a move of the pointer turns into a drag. */
  const press = useRef<{ pointerId: number; layer: Layer; x: number; y: number } | null>(null);
  const dragging = useRef<DragSession | null>(null);
  /** The drag under way: how far the layer has gone, in canvas px, and where it would go. */
  const [drag, setDrag] = useState<{ layer: Layer; box: DOMRect; drop: Drop | null } | null>(null);
  const modeSwitch = useRef<Animation | null>(null);
  /** The canvas is travelling between the page and its place in the viewport, unclipped. */
  const [travelling, setTravelling] = useState(false);

  /**
   * Plays a mode switch animation, taking over from one still running.
   * `travelling`: the canvas is out of its place in the viewport meanwhile.
   */
  const play = (
    el: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    done?: () => void,
    travelling = el === stage.current,
  ) => {
    modeSwitch.current?.cancel();
    const animation = el.animate(keyframes, options);
    modeSwitch.current = animation;
    setTravelling(travelling);
    animation.finished.then(
      () => {
        if (modeSwitch.current !== animation) return;
        modeSwitch.current = null;
        setTravelling(false);
        done?.();
      },
      () => {}, // Cancelled: a newer switch took over.
    );
  };

  /** The stage transform that puts the canvas exactly where the page is in the window. */
  const overPage = () => {
    const area = viewport.current!.getBoundingClientRect();
    return transformOf({ x: -area.left - scrollX, y: -area.top - scrollY, zoom: 1 });
  };

  // A layout effect, so freezing starts in the same task as the click.
  useLayoutEffect(() => {
    let mounted = true;
    // The shell around the canvas. It stays see-through until there is a canvas, so the page shows until it can turn into one.
    const shell = viewport.current!.parentElement!;
    shell.style.opacity = "0";
    const frozen = restoreFrom === null ? freeze(window, iframe.current!) : restore(restoreFrom, iframe.current!);
    // Pause the page underneath, now that it has been copied: no focus, no clicks.
    const body = document.body;
    const wasInert = body.inert;
    body.inert = true;
    frozen.then((frozen) => {
      if (!mounted) return;
      setCanvas(frozen);
      onCanvas(frozen);
      const start = initialView(frozen, viewport.current!.getBoundingClientRect());
      setView(start);
      shell.style.opacity = "";
      if (animate && prefersReducedMotion()) {
        play(shell, [{ opacity: 0 }, { opacity: 1 }], { duration: MODE_FADE_MS, easing: EASE_OUT });
      } else if (animate) {
        // The page shrinks from where it is in the window into its place on the canvas.
        play(stage.current!, [{ transform: overPage() }, { transform: transformOf(start) }], {
          duration: MODE_SWITCH_MS,
          easing: EASE_IN_OUT,
        });
      }
      // The task after the next frame: the canvas has been painted by then.
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (!performance.getEntriesByName(ENTER_MARK, "mark").length) return;
          performance.measure(ENTER_MARK, ENTER_MARK);
          performance.clearMarks(ENTER_MARK);
        }),
      );
    }, (error: unknown) => {
      console.error(error);
      shell.style.opacity = "";
      if (mounted) setFailed(true);
    });
    // Take focus from the toggle, so keys like Space act on the canvas.
    viewport.current!.focus({ preventScroll: true });
    return () => {
      mounted = false;
      body.inert = wasInert;
    };
  }, []);

  // Leaving grows the canvas back over the page; a click on the way turns it around.
  const wasLeaving = useRef(false);
  useLayoutEffect(() => {
    if (leaving === wasLeaving.current) return;
    wasLeaving.current = leaving;
    const done = leaving ? onLeft : undefined;
    if (!canvas) {
      done?.(); // Nothing frozen yet, so nothing to grow.
      return;
    }
    // Leaving holds its last frame until the shell is gone.
    const options = { easing: EASE_OUT, fill: leaving ? "forwards" : "none" } as const;
    if (prefersReducedMotion()) {
      const shell = viewport.current!.parentElement!;
      const from = getComputedStyle(shell).opacity;
      play(shell, [{ opacity: from }, { opacity: leaving ? 0 : 1 }], { ...options, duration: MODE_FADE_MS }, done);
      return;
    }
    const from = transformOf(currentView(stage.current!));
    const to = leaving ? overPage() : transformOf(view);
    // Over the page, a changed canvas would cut to a page without the changes.
    const fadeIntoPage = () => {
      const shell = viewport.current!.parentElement!;
      play(shell, [{ opacity: 1 }, { opacity: 0 }], { ...options, duration: MODE_FADE_MS }, done, true);
    };
    const grown = leaving && changed ? fadeIntoPage : done;
    play(stage.current!, [{ transform: from }, { transform: to }], { ...options, duration: MODE_SWITCH_MS, easing: EASE_IN_OUT }, grown);
  }, [leaving]);

  // Effects run after paint; a key pressed right after a click must still see that click's selection.
  const latest = useRef({ canvas, selected, onSelect, endDrag: (_commit: boolean) => {} });
  latest.current = { canvas, selected, onSelect, endDrag };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { canvas, selected, onSelect, endDrag } = latest.current;
      if (event.key === "Meta" || event.key === "Control") {
        const deep = event.metaKey || event.ctrlKey;
        setHover((h) => h && { ...h, deep });
      }
      const target = event.composedPath()[0];
      // A field, or a dialog over the canvas (the change list), keeps its keys.
      if (isEditable(target) || (target instanceof Element && target.closest('[role="dialog"]'))) return;
      if (event.code === "Space") {
        // Swallow repeats and key-up too: a focused button would otherwise click on Space.
        event.preventDefault();
        event.stopPropagation();
        setSpaceHeld(event.type === "keydown");
        return;
      }
      if (event.type !== "keydown") return;
      if (event.key === "Escape" && dragging.current) {
        event.preventDefault();
        event.stopPropagation();
        endDrag(false);
        return;
      }
      if (event.key === "Escape" && selected.length) {
        event.preventDefault();
        event.stopPropagation();
        onSelect(selectParents(selected));
        return;
      }
      if (event.code === "Digit1" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        if (canvas) setView(fitView(canvas, viewport.current!.getBoundingClientRect()));
      }
    };
    const release = () => {
      setSpaceHeld(false);
      setHover((h) => h && { ...h, deep: false });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", release);
    };
  }, []);

  // Registered by hand: it has to be non-passive to keep the page underneath from scrolling.
  useEffect(() => {
    const el = viewport.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientHeight : 1;
      let dx = event.deltaX * unit;
      let dy = event.deltaY * unit;
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        const step = Math.max(-MAX_ZOOM_STEP, Math.min(MAX_ZOOM_STEP, dy));
        setView((v) => zoomAt(v, Math.exp(-step * ZOOM_SPEED), event.clientX - rect.left, event.clientY - rect.top));
        return;
      }
      if (event.shiftKey && !dx) [dx, dy] = [dy, 0];
      setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const primary = selected.at(-1) ?? null;
  /** The deepest layer under the pointer. The canvas itself takes no pointer input, so this asks its document. */
  const layerAt = (event: MouseEvent): Layer | null => {
    if (!canvas || !tree) return null;
    const area = viewport.current!.getBoundingClientRect();
    const x = (event.clientX - area.left - view.x) / view.zoom;
    const y = (event.clientY - area.top - view.y) / view.zoom;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    return tree.layerAt(x, y);
  };

  const onPointerDown = (event: TargetedPointerEvent<HTMLDivElement>) => {
    if (event.button === 0 && !spaceHeld) {
      const hit = layerAt(event);
      const layer = hit && (event.metaKey || event.ctrlKey ? selectDeepest(hit) : selectOnClick(hit, primary));
      if (event.shiftKey) {
        if (layer) onSelect(toggleIn(selected, layer));
      } else onSelect(layer ? [layer] : []);
      // Pressed on a layer it can move: moving the pointer drags it.
      if (layer && !event.shiftKey && editor?.canMove(layer)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        press.current = { pointerId: event.pointerId, layer, x: event.clientX, y: event.clientY };
      }
      return;
    }
    // Space + drag, or the middle button, pans.
    if (!(spaceHeld && event.button === 0) && event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setPanning(true);
  };

  const onPointerMove = (event: TargetedPointerEvent<HTMLDivElement>) => {
    const pressed = press.current;
    if (pressed?.pointerId === event.pointerId) {
      if (!dragging.current && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_THRESHOLD) return;
      dragging.current ??= startDrag(pressed.layer);
      moveDrag(dragging.current, event, pressed);
      return;
    }
    const p = pan.current;
    if (!p) {
      if (event.buttons) return;
      const hit = layerAt(event);
      const deep = event.metaKey || event.ctrlKey;
      setHover((h) => (h?.hit === hit && h.deep === deep ? h : hit && { hit, deep }));
      return;
    }
    if (p.pointerId !== event.pointerId) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  const endPan = (event: TargetedPointerEvent<HTMLDivElement>) => {
    if (press.current?.pointerId === event.pointerId) {
      press.current = null;
      endDrag(event.type === "pointerup");
      return;
    }
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    setPanning(false);
  };

  /** Where the pointer is on the canvas, in canvas px. */
  const toCanvas = (event: MouseEvent) => {
    const area = viewport.current!.getBoundingClientRect();
    return { x: (event.clientX - area.left - view.x) / view.zoom, y: (event.clientY - area.top - view.y) / view.zoom };
  };

  /** Starts dragging: the layer stops taking the pointer, and where its neighbours are is noted before any of them shifts. */
  const startDrag = (layer: Layer): DragSession => {
    const session: DragSession = { layer, start: boxOf(layer), rects: new Map(), touched: new Map(), drop: null };
    for (const child of layer.parent!.children) if (!child.text) session.rects.set(child.el, child.el.getBoundingClientRect());
    if (!layer.text) setStyles(session, layer.el, { "pointer-events": "none", "z-index": "2147483647" });
    return session;
  };

  const moveDrag = (session: DragSession, event: MouseEvent, from: { x: number; y: number }) => {
    const dx = (event.clientX - from.x) / view.zoom;
    const dy = (event.clientY - from.y) / view.zoom;
    const { layer, start } = session;
    const box = new DOMRect(start.x + dx, start.y + dy, start.width, start.height);
    const rectOf = (l: Layer) => {
      if (l.text) return boxOf(l);
      let r = session.rects.get(l.el);
      if (!r) session.rects.set(l.el, (r = l.el.getBoundingClientRect()));
      return r;
    };
    const drop = editor && findDrop(editor, layer, toCanvas(event), box, rectOf);
    session.drop = drop;
    // Only shifted while dragging: the layer, and the layers making room for it.
    const shifts = new Map(drop?.shifts);
    if (!layer.text) shifts.set(layer.el, { x: dx, y: dy });
    for (const [el, saved] of session.touched) {
      if (!shifts.has(el) && saved.translate) setStyles(session, el, { translate: null, transition: null });
    }
    for (const [el, { x, y }] of shifts) {
      setStyles(session, el, { translate: `${x}px ${y}px`, transition: el === layer.el ? "none" : `translate 150ms ${EASE_OUT}` });
    }
    setDrag({ layer, box, drop });
  };

  /** Ends the drag: everything shifted goes back, and, let go where it can go, the layer moves there. */
  function endDrag(commit: boolean) {
    const session = dragging.current;
    if (!session) return;
    dragging.current = null;
    press.current = null;
    for (const [el, saved] of session.touched) {
      for (const [name, [value, priority]] of Object.entries(saved.original)) {
        if (value) (el as HTMLElement).style.setProperty(name, value, priority);
        else (el as HTMLElement).style.removeProperty(name);
      }
    }
    setDrag(null);
    if (commit && session.drop) onMove(session.layer, session.drop.to);
  }

  // Nothing to point out while panning, dragging or while a value is being adjusted.
  // A move builds the layers anew: a layer pointed at before it is gone.
  const hovered =
    hover && !spaceHeld && !panning && !drag && !hideSelection && tree && inTree(tree, hover.hit)
      ? hover.deep
        ? selectDeepest(hover.hit)
        : selectOnClick(hover.hit, primary)
      : null;

  return (
    <div
      ref={viewport}
      class={`vk-viewport${panning ? " is-panning" : spaceHeld ? " is-pan-ready" : ""}${travelling ? " is-travelling" : ""}`}
      role="region"
      aria-label="Canvas viewport"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={() => setHover(null)}
      onDblClick={(event) => {
        const hit = layerAt(event);
        const layer = hit && !event.metaKey && !event.ctrlKey && !event.shiftKey && selectOnDoubleClick(hit, primary);
        if (layer) onSelect([layer]);
      }}
    >
      <div
        ref={stage}
        class="vk-stage"
        style={{
          transform: transformOf(view),
          visibility: canvas ? "visible" : "hidden",
        }}
      >
        <iframe ref={iframe} class="vk-canvas" title="Canvas" sandbox="allow-same-origin" />
      </div>
      {canvas && hovered && !selected.includes(hovered) && !travelling && <Outline layer={hovered} view={view} hover />}
      {canvas && !travelling && selected.map((layer, i) => <Outline key={i} layer={layer} view={view} hidden={hideSelection} />)}
      {drag?.drop && <Outline layer={drag.drop.container} view={view} hover />}
      {drag?.drop?.line && <div class="vk-drop-line" aria-hidden="true" style={place(drag.drop.line, view)} />}
      {drag?.layer.text && <div class="vk-drag-ghost" aria-hidden="true" style={place(drag.box, view)} />}
      {failed && <p class="vk-viewport-message">The page could not be frozen. See the browser console for details.</p>}
    </div>
  );
}

interface OutlineProps {
  layer: Layer;
  view: View;
  /** The layer under the pointer rather than the selected one. */
  hover?: boolean;
  hidden?: boolean;
}

/**
 * The selection box, or the outline of the layer a click would select. Drawn
 * above the canvas, so its lines stay 1px at any zoom. Blue, purple for an
 * instance, gray for a locked layer.
 */
function Outline({ layer, view, hover, hidden }: OutlineProps) {
  const r = boxOf(layer);
  const kind = role(layer);
  return (
    <div
      class={hover ? "vk-hover" : "vk-selection"}
      data-kind={kind}
      data-hidden={hidden || undefined}
      aria-hidden="true"
      style={{
        left: `${view.x + r.left * view.zoom}px`,
        top: `${view.y + r.top * view.zoom}px`,
        width: `${r.width * view.zoom}px`,
        height: `${r.height * view.zoom}px`,
      }}
    >
      {kind === "locked" && !hover && (
        <span class="vk-selection-lock">
          <Icon name="lock" />
        </span>
      )}
    </div>
  );
}

/** Whether a layer is one of the tree's, not of one built before it. */
function inTree(tree: LayerTree, layer: Layer): boolean {
  return tree.layerOf(layer.text ? layer.text.find((node) => node.textContent!.trim())! : layer.el) === layer;
}

/** Pointer travel (px) before a press on a layer counts as a drag. */
const DRAG_THRESHOLD = 3;

/** A drag under way, and the canvas styles it has changed, to put back. */
interface DragSession {
  layer: Layer;
  /** Where the layer was when the drag began. */
  start: DOMRect;
  /** Where layers were laid out before anything shifted, by element. */
  rects: Map<Element, DOMRect>;
  touched: Map<Element, { original: Record<string, [string, string]>; translate: boolean }>;
  drop: Drop | null;
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

/** A box on the canvas, placed over it in the viewport. */
function place(r: { x: number; y: number; width: number; height: number }, view: View) {
  return { left: `${view.x + r.x * view.zoom}px`, top: `${view.y + r.y * view.zoom}px`, width: `${r.width * view.zoom}px`, height: `${r.height * view.zoom}px` };
}

function transformOf({ x, y, zoom }: View): string {
  return `translate(${x}px, ${y}px) scale(${zoom})`;
}

/** Where the stage is right now, partway through an animation included. */
function currentView(stage: HTMLElement): View {
  const m = new DOMMatrix(getComputedStyle(stage).transform);
  return { x: m.e, y: m.f, zoom: m.a };
}

/** At most 100%, the full width in view, and the part of the page the designer was looking at on top. */
function initialView(canvas: Canvas, area: DOMRect): View {
  const zoom = clamp(Math.min(1, (area.width - 2 * PADDING) / canvas.width));
  return { ...centered(canvas, area, zoom), y: PADDING - canvas.scrollY * zoom };
}

function fitView(canvas: Canvas, area: DOMRect): View {
  const zoom = clamp(Math.min((area.width - 2 * PADDING) / canvas.width, (area.height - 2 * PADDING) / canvas.height));
  return centered(canvas, area, zoom);
}

function centered(canvas: Canvas, area: DOMRect, zoom: number): View {
  return { zoom, x: (area.width - canvas.width * zoom) / 2, y: (area.height - canvas.height * zoom) / 2 };
}

/** Scales by `factor`, keeping the point (`px`, `py`) of the viewport fixed. */
function zoomAt(view: View, factor: number, px: number, py: number): View {
  const zoom = clamp(view.zoom * factor);
  const k = zoom / view.zoom;
  return { zoom, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
}

function clamp(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function isEditable(target: EventTarget | undefined): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/.test(target.localName));
}
