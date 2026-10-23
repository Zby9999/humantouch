/** @jsxImportSource preact */
import type { TargetedPointerEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { freeze, restore, type Canvas } from "./freezer";
import { Icon } from "./icons";
import { EASE_IN_OUT, EASE_OUT, MODE_FADE_MS, MODE_SWITCH_MS, prefersReducedMotion } from "./motion";
import { boxOf, role, type Layer, type LayerTree } from "./layers";
import { selectDeepest, selectOnClick, selectOnDoubleClick, selectParent } from "./selection";

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
  selected: Layer | null;
  /** Keep the selection box out of the way, as while a value is being adjusted. */
  hideSelection: boolean;
  onSelect(layer: Layer | null): void;
  /** Edit mode has ended: grow the canvas back over the page, then call `onLeft`. */
  leaving: boolean;
  /** False: switch modes instantly (the toggle was pressed from the keyboard). */
  animate: boolean;
  /** The canvas has changes the page does not: on leaving, it fades into the page instead of cutting to it. */
  changed: boolean;
  onLeft(): void;
}

/** The middle column: the frozen page, scaled and panned inside a viewport. */
export function CanvasView({ restoreFrom, onCanvas, tree, selected, hideSelection, onSelect, leaving, animate, changed, onLeft }: Props) {
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
  const latest = useRef({ canvas, selected, onSelect });
  latest.current = { canvas, selected, onSelect };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { canvas, selected, onSelect } = latest.current;
      if (event.key === "Meta" || event.key === "Control") {
        const deep = event.metaKey || event.ctrlKey;
        setHover((h) => h && { ...h, deep });
      }
      if (isEditable(event.composedPath()[0])) return;
      if (event.code === "Space") {
        // Swallow repeats and key-up too: a focused button would otherwise click on Space.
        event.preventDefault();
        event.stopPropagation();
        setSpaceHeld(event.type === "keydown");
        return;
      }
      if (event.type !== "keydown") return;
      if (event.key === "Escape" && selected) {
        event.preventDefault();
        event.stopPropagation();
        onSelect(selectParent(selected));
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
      onSelect(hit && (event.metaKey || event.ctrlKey ? selectDeepest(hit) : selectOnClick(hit, selected)));
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
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    setPanning(false);
  };

  // Nothing to point out while panning or while a value is being adjusted.
  const hovered =
    hover && !spaceHeld && !panning && !hideSelection
      ? hover.deep
        ? selectDeepest(hover.hit)
        : selectOnClick(hover.hit, selected)
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
        if (hit && !event.metaKey && !event.ctrlKey) onSelect(selectOnDoubleClick(hit, selected));
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
      {canvas && hovered && hovered !== selected && !travelling && <Outline layer={hovered} view={view} hover />}
      {canvas && selected && !travelling && <Outline layer={selected} view={view} hidden={hideSelection} />}
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

function isEditable(target: EventTarget | undefined): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/.test(target.localName));
}
