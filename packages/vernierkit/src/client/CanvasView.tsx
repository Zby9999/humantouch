/** @jsxImportSource preact */
import type { TargetedPointerEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { freeze, type Canvas } from "./freezer";
import { Icon } from "./icons";
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
  /** Called once the page is frozen and laid out. */
  onCanvas(canvas: Canvas): void;
  /** The canvas's layers, once there is a canvas. */
  tree: LayerTree | null;
  selected: Layer | null;
  onSelect(layer: Layer | null): void;
}

/** The middle column: the frozen page, scaled and panned inside a viewport. */
export function CanvasView({ onCanvas, tree, selected, onSelect }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const pan = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // A layout effect, so freezing starts in the same task as the click.
  useLayoutEffect(() => {
    let mounted = true;
    const frozen = freeze(window, iframe.current!);
    // Pause the page underneath, now that it has been copied: no focus, no clicks.
    const body = document.body;
    const wasInert = body.inert;
    body.inert = true;
    frozen.then((frozen) => {
      if (!mounted) return;
      setCanvas(frozen);
      onCanvas(frozen);
      setView(initialView(frozen, viewport.current!.getBoundingClientRect()));
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
      if (mounted) setFailed(true);
    });
    // Take focus from the toggle, so keys like Space act on the canvas.
    viewport.current!.focus({ preventScroll: true });
    return () => {
      mounted = false;
      body.inert = wasInert;
    };
  }, []);

  // Effects run after paint; a key pressed right after a click must still see that click's selection.
  const latest = useRef({ canvas, selected, onSelect });
  latest.current = { canvas, selected, onSelect };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { canvas, selected, onSelect } = latest.current;
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
    const release = () => setSpaceHeld(false);
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
    if (!p || p.pointerId !== event.pointerId) return;
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

  return (
    <div
      ref={viewport}
      class={`vk-viewport${panning ? " is-panning" : spaceHeld ? " is-pan-ready" : ""}`}
      role="region"
      aria-label="Canvas viewport"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDblClick={(event) => {
        const hit = layerAt(event);
        if (hit && !event.metaKey && !event.ctrlKey) onSelect(selectOnDoubleClick(hit, selected));
      }}
    >
      <div
        class="vk-stage"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          visibility: canvas ? "visible" : "hidden",
        }}
      >
        <iframe ref={iframe} class="vk-canvas" title="Canvas" sandbox="allow-same-origin" />
      </div>
      {canvas && selected && <SelectionBox layer={selected} view={view} />}
      {failed && <p class="vk-viewport-message">The page could not be frozen. See the browser console for details.</p>}
    </div>
  );
}

/** Drawn above the canvas, so its lines stay 1px at any zoom. Blue, purple for an instance, gray for a locked layer. */
function SelectionBox({ layer, view }: { layer: Layer; view: View }) {
  const r = boxOf(layer);
  const kind = role(layer);
  return (
    <div
      class="vk-selection"
      data-kind={kind}
      aria-hidden="true"
      style={{
        left: `${view.x + r.left * view.zoom}px`,
        top: `${view.y + r.top * view.zoom}px`,
        width: `${r.width * view.zoom}px`,
        height: `${r.height * view.zoom}px`,
      }}
    >
      {kind === "locked" && (
        <span class="vk-selection-lock">
          <Icon name="lock" />
        </span>
      )}
    </div>
  );
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
