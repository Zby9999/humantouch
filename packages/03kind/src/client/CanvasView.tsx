/** @jsxImportSource preact */
import type { TargetedPointerEvent } from "preact";
import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "preact/hooks";
import { BriefMark, briefedLayers } from "./BriefMark";
import { Brief, handleCursor, Handles, Marks, Outline, SelectionToolbar, SizeLabel } from "./AboveCanvas";
import { canvasKey, type Tool } from "./canvas-keys";
import { marksNow, resizeStep, type ResizePointer, type ResizeSession, type ResizeStep } from "./canvas-resize";
import { boxFrom, DRAG_THRESHOLD, laidOut, moveWhole, restoreDragStyles, shift, SNAP_PX, startDragSession, type At, type DragSession, type Pointer } from "./canvas-drag";
import { boundsOf, cameraIn, currentCamera, fitCamera, initialCamera, place, scrolled, showsWhole, transformOf, wheelZoom, type Bounds, type Camera } from "./camera";
import type { Created } from "./changeset";
import { findDrop, findPlace, type Drop } from "./drag";
import type { Destination, Editor } from "./edit-commands";
import { fitHeight, freeze, restore } from "./freezer";
import { ENTER_MARK } from "./host";
import { chromePush, EASE_IN_OUT, EASE_OUT, MODE_FADE_MS, MODE_SWITCH_MS, prefersReducedMotion } from "./motion";
import { framedText, nodeOf, type Layer, type LayerTree } from "./layers";
import { createLater } from "./later";
import type { OffCanvasLayer, OffCanvas } from "./off-canvas";
import { GradientHandles } from "./GradientHandles";
import { holdPointer, pointerHeld } from "./pointer-held";
import { DOUBLE_CLICK_MS, DOUBLE_CLICK_PX, selectDeepest, selectOnClick, selectOnDoubleClick, selectParents, toggleIn } from "./selection";
import { distances } from "./snap";
import { drawOnlyWhatShows, onceAtRest } from "./stage-redraw";
import type { Handle } from "./resize";
import { CAUGHT_UP_MS, createViews, type View, type Views } from "./views";
import { keyOf, LABEL_OFFSET, layoutViews, placeOffCanvas, shownAt, viewsWidth, type Placed, type Shown } from "./view-layout";
import { AddView, desktopRange, readViewWidths, viewName, ViewLabel, withWidth, writeViewWidths } from "./ViewLabels";
import type { Breakpoint } from "./breakpoints";

export type { Tool } from "./canvas-keys";

/** The modifier keys held, as a key or the pointer reports them. */
type Modifiers = Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

interface Props {
  /** A saved canvas to put back; null to freeze the page. */
  restoreFrom: string | null;
  /** Done on the saved canvas put back, before it is laid out: what was applied in a round before taken in (ticket 68). */
  takeIn?(doc: Document): void;
  /** The page frozen afresh in place of a canvas (ticket 78): the camera to start at, where it was, with no mode switch to show. */
  startAt?: Camera | null;
  /** Kept up to date with where the camera is, once there is a canvas: for a canvas frozen afresh in its place to start there. */
  cameraNow?: { current: Camera | null };
  /** Called once the page is frozen, or the saved canvas restored, and laid out: with the views that show it, and where in the workspace to show the layers off it. */
  onCanvas(views: Views, workspace: HTMLElement): void;
  /** The layers off the canvas, shown in the workspace beside the views. */
  offCanvas: OffCanvas | null;
  /** A layer dragged from `view` to outside every view, let go with its top left at `at` on the stage; with ⌥ held, a copy of it. */
  onMoveOff(layer: Layer, view: View, at: { x: number; y: number }, copy: boolean): void;
  /** A layer off the canvas dragged elsewhere off it, its top left to `x` and `y` on the stage. */
  onPlaceOff(offCanvasLayer: OffCanvasLayer, x: number, y: number): void;
  /** A layer off the canvas dragged over a view and let go where it can go there: back onto the canvas (ADR 0009). */
  onPutBack(offCanvasLayer: OffCanvasLayer, to: Destination): void;
  /**
   * A Frame or text drawn with the tool in the blank space beside the views
   * and the layers off the canvas, its top left at `at` on the stage; `size`
   * when drawn rather than clicked (ticket 106). Returns it, a layer off the
   * canvas now, and the view it is in; null when none can be made.
   */
  onMakeOff(type: Created["type"], at: { x: number; y: number }, size?: { width: number; height: number }): { layer: Layer; view: View } | null;
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
  /** A handle of the layer selected dragged: one step of the resize, `to` as `Editor.resize` has it; `continues`, after the first. */
  onResize(layer: Layer, to: ResizeStep["to"], continues: boolean): void;
  /** Esc, while a handle is dragged: the resize taken back, as if never made. */
  onCancelResize(layer: Layer): void;
  /** The fill's picker is open on a gradient: its handles show on the layer selected, in every view, and change it. */
  gradientHandles: boolean;
  /** A gradient's handle dragged: one step of the change made to the layer's fill. */
  onFillEdited(): void;
  /** A dragged layer let go with ⌥ held: a copy goes there. */
  onDuplicate(layer: Layer, to: Destination): void;
  tool: Tool;
  /** A tool picked from the keyboard (V, F, T, Esc), or put down once a layer is drawn. */
  onTool(tool: Tool): void;
  /** A layer drawn with the text or Frame tool; `size` when drawn rather than clicked. Returns the new layer. */
  onCreate(type: Created["type"], to: Destination, size?: { width: number; height: number }): Layer;
  /** A new Frame's brief written, from the button beside it. */
  onSetBrief(layer: Layer, brief: string): void;
  /** Promote, from the selection toolbar: the layer's changes made changes to its component. */
  onPromote(layer: Layer): void;
  /** Typing in a text layer begins: returns the layer with an element of its own to type in. */
  onBeginText(layer: Layer): Layer;
  /** Typing in a text layer ends, with these words. */
  onEditText(layer: Layer, text: string): void;
  /** The view last pressed in, and what it is called: the one the designer works in (null: the desktop view). */
  onWorkIn(view: View | null, name: string): void;
  /** Playing: the canvas alone at 100%, scrolled like a page; nothing on it can be selected or edited. */
  playing: boolean;
  /** While playing, how wide: as the view played (designer, 2026-11-08); null, as wide as the viewport. */
  playedWidth: number | null;
  /** A view's full screen button pressed: plays it `width` px wide, null as wide as the viewport (the desktop view). */
  onPlay(width: number | null, from: HTMLButtonElement): void;
  /** Esc, while playing. */
  onStopPlaying(): void;
  /** Edit mode has ended: grow the canvas back over the page, then call `onLeft`. */
  leaving: boolean;
  /** False: switch modes instantly (the toggle was pressed from the keyboard). */
  animate: boolean;
  /** The canvas has changes the page does not: on leaving, it fades into the page instead of cutting to it. */
  changed: boolean;
  onLeft(): void;
}

/** The middle column: the frozen page, scaled and panned inside a viewport. */
export function CanvasView(props: Props) {
  const { restoreFrom, takeIn, startAt, cameraNow, onCanvas, offCanvas, onMoveOff, onPlaceOff, onPutBack, onMakeOff, tree, selected, hideSelection, onSelect, editor, onMove, onResize, onCancelResize, gradientHandles, onFillEdited, onDuplicate, tool, onTool, onCreate, onSetBrief, onPromote, onBeginText, onEditText, onWorkIn, playing, playedWidth, onPlay, onStopPlaying, leaving, animate, changed, onLeft } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  /** Where on the stage the layers off the canvas are shown. */
  const workspace = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  /** The canvas, shown as views (ADR 0008): the desktop view in the iframe on the stage, the others beside it. */
  const [views, setViews] = useState<Views | null>(null);
  /** The canvas the desktop view shows: what the camera frames, and what playing shows at full size. */
  const canvas = views?.canvas ?? null;
  const desktop = views?.list()[0] ?? null;
  /** The widths of the views beside the desktop view, widest first, as the designer left them. */
  const [widths, setWidths] = useState(readViewWidths);
  /** Each view beside the desktop view, by width, once it is laid out. */
  const [beside, setBeside] = useState<Map<number, View>>(new Map());
  /** Bumped as a view's height follows what it shows. */
  const [, resized] = useReducer((n: number) => n + 1, 0);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  /** Each view beside the desktop view shown on the canvas so far, by width; `gone` once taken away before it was laid out. */
  const attached = useRef(new Map<number, { view: View | null; gone: boolean }>());
  /** The view the designer last pressed in: a new Frame's brief shows there. */
  const [active, setActive] = useState<View | null>(null);
  /** The view whose name and widths above it are pointed at (`keyOf`): its page is outlined, as a Frame's is in Figma. */
  const [titled, setTitled] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** The deepest layer under the pointer, the view it is over, and whether ⌘ / Ctrl is held: the layer a click would select is outlined. */
  const [hover, setHover] = useState<{ hit: Layer; in: Shown; deep: boolean } | null>(null);
  /** ⌥ is held: the distances from the layer selected to the one pointed at show. */
  const [measuring, setMeasuring] = useState(false);
  const pan = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  /**
   * A press on a layer, in the view pressed in, that a move of the pointer turns into a drag. Held from
   * the moment it is pressed (`release`): until it is let go, or the drag cancelled, no key edits (ADR 0012).
   */
  const press = useRef<{ pointerId: number; layer: Layer; in: Shown; x: number; y: number; release(): void } | null>(null);
  const dragging = useRef<DragSession | null>(null);
  /**
   * A press that selects on the canvas, till it is let go: `second` when it comes close enough after
   * a click to make a double click of it, `dragged` once it has moved into a drag; `plain`, with no
   * ⌘, Ctrl or ⇧ held, as only a plain click starts a double click.
   */
  const clickPress = useRef<{ pointerId: number; time: number; x: number; y: number; second: boolean; plain: boolean; dragged: boolean } | null>(null);
  /** The last plain press let go as a click, which the next press may make a double click of. */
  const lastClick = useRef<{ time: number; x: number; y: number } | null>(null);
  /** The drag under way: how far the layer has gone, and where it would go, in the view it is dragged in, in its px; `out`: off the canvas. */
  const [drag, setDrag] = useState<{ layer: Layer; in: Shown; box: DOMRect; drop: Drop | null; out: boolean } | null>(null);
  /**
   * A handle of the layer selected pressed, and dragged: held from the moment it is pressed till it is let
   * go, or the resize cancelled with Esc (ADR 0012). `resize` has what it shows: the view, the handle (its
   * cursor, wherever the pointer goes), and the marks its edges snap to.
   */
  const resizing = useRef<ResizeSession | null>(null);
  const [resize, setResize] = useState<{ layer: Layer; in: Shown; handle: Handle; showsSize: boolean; marks: ResizeStep["marks"] } | null>(null);
  /** Drawn again once the views beside have caught up with a resize step: the selection there follows the layer (ADR 0011). */
  const [, caughtUp] = useReducer((n: number) => n + 1, 0);
  const catchingUp = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(catchingUp.current), []);
  /**
   * A layer being drawn: the view it is drawn in (null: the blank space beside them, ticket 106), where the
   * drawing started, and where the pointer is, in its px (on the stage). Held until let go (ADR 0012).
   */
  const drawing = useRef<{ pointerId: number; in: Shown | null; start: { x: number; y: number }; release(): void } | null>(null);
  const [drawn, setDrawn] = useState<{ in: Shown | null; box: DOMRect } | null>(null);
  /** The text being typed in, and what was in it; the view it is typed in, and its element there. */
  const typing = useRef<{ layer: Layer; html: string; view: View; el: HTMLElement } | null>(null);
  /**
   * The last press in the text typed in, which places the caret there as the browser would: `pointerId`
   * till it is let go, as a drag selects the words it passes; `count`, the presses close enough in a row
   * to make a double click of it (a word) or a triple click (all of it).
   */
  const typedPress = useRef<{ pointerId: number | null; in: Shown; time: number; x: number; y: number; count: number } | null>(null);
  /** The text being typed in, outlined in blue; null when none is. */
  const [typingLayer, setTypingLayer] = useState<Layer | null>(null);
  /** Bumped as the words are typed: the blue outline grows with them. */
  const [, typedOn] = useReducer((n: number) => n + 1, 0);
  const modeSwitch = useRef<Animation | null>(null);
  /** The canvas is travelling between the page and its place in the viewport, unclipped. */
  const [travelling, setTravelling] = useState(false);
  /** Every view of the canvas, side by side on the stage: the desktop view first, then the others, widest first. */
  const placed: Placed[] = canvas ? layoutViews(canvas.width, desktop!, widths, beside) : [];
  const bounds: Bounds | null = canvas && boundsOf(placed);
  /** The layers off the canvas, where they are on the stage. */
  const outside: Shown[] = canvas ? placeOffCanvas(offCanvas) : [];
  /** The layers of a view, or of a layer off the canvas. */
  const treeIn = (shown: Placed): LayerTree | null => (shown.offCanvasLayer ? shown.offCanvasLayer.editor.tree() : tree);
  /** What edits there. */
  const editorIn = (shown: Placed): Editor | null => (shown.offCanvasLayer ? shown.offCanvasLayer.editor : editor);
  /** The layers `layer` is one of: the canvas's, or those of a layer off it. */
  const treeOf = (layer: Layer): LayerTree | null => offCanvas?.of(layer.el)?.editor.tree() ?? tree;
  /**
   * While playing, how wide the canvas is shown: as wide as the viewport, as a
   * window that wide shows the page (ADR 0010), so what the page's CSS and
   * the edits at breakpoints do at that width shows. Null when not playing.
   */
  const [playWidth, setPlayWidth] = useState<number | null>(null);
  /** What playing shows: the desktop view, as wide as it is played, as tall as it is now. */
  const played: Bounds | null = placed[0] ? { width: playWidth ?? placed[0].width, height: placed[0].height } : null;
  /**
   * The widths each view covers, as its label says (designer, 2026-11-08): its own range, or for the
   * desktop view, and one in its range, the widths around it no other view's range takes.
   */
  const coveredBy = (shown: Placed): Breakpoint | null => {
    const own = shown.desktop || !editor ? null : editor.breakpointAt(shown.width);
    if (own || !editor || !canvas) return own;
    return desktopRange(canvas.width, placed.filter((p) => !p.desktop).map((p) => editor.breakpointAt(p.width)));
  };

  /** Where on the stage its views and the layers off the canvas reach, in canvas px. */
  const extent = canvas ? boundsOf([...placed, ...outside]) : null;
  /** How large the viewport is, as last observed: read as a value changes, without asking for the layout. */
  const viewportSize = useRef({ width: 0, height: 0 });
  /** Where the camera has the stage, and how far the stage reaches, as last rendered. */
  const framing = useRef({ camera, extent });
  framing.current = { camera, extent };
  /**
   * Once the camera is at rest, however it moved, the views are drawn only
   * as far as they show again (`drawOnlyWhatShows`): zoomed out till every
   * view shows in full, they would otherwise go on being drawn whole after
   * zooming back in (ticket 22). Not while a mode switch or typing is under
   * way, nor while the pointer is held down on something that edits as it
   * moves (`pointerHeld`, ADR 0012): a layer pressed or dragged, a handle
   * dragged to resize one, one drawn with a tool, a value's icon or a
   * gradient's stop. Once it is over.
   *
   * So too once the viewport or what is on the stage has changed size, the
   * camera where it was, if all of the stage has been in sight since it was
   * last drawn so (ticket 71): the window made taller, a view deleted or
   * grown shorter till every view shows whole, and back again.
   */
  const [atRest] = useState(() =>
    onceAtRest(
      () => stage.current && drawOnlyWhatShows(stage.current),
      () => !!modeSwitch.current || wasLeaving.current || pointerHeld() || !!typing.current,
      () => {
        const { camera, extent } = framing.current;
        return !!extent && showsWhole(camera, extent, viewportSize.current);
      },
    ),
  );
  useEffect(() => {
    if (canvas) atRest.moved();
  }, [camera]);
  useEffect(() => {
    if (extent) atRest.resized();
  }, [extent?.x, extent?.y, extent?.width, extent?.height]);
  useEffect(() => () => atRest.cancel(), []);

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
        // Back where the camera has it, the views are drawn only as far as they show (`drawOnlyWhatShows`).
        if (el === stage.current && !wasLeaving.current) atRest.moveEnded();
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

  /** The panels and the tools moving out with the frame as edit mode is left, or in with it as it starts or a click turns it around. */
  const chromeMoves = useRef<Animation[]>([]);
  /**
   * The panels and the tools travel with the frame (the desktop view), each side's edge with the frame's edge on that
   * side, at its speed and on its curve (designer, 2026-11-08: "跟着 Frame 一起走", "完全一致"): pushed off the window as
   * the page grows over it (`out`), brought in as it shrinks into the canvas. The Layers side (the panel, or the button
   * showing it, and its edge's grip) moves with the left edge; the Design side (the panel, its grip, the tools) with
   * the right. From where they are now, so a click on the way turns them around with the frame; `fromOut`, from off
   * the window, as edit mode starts. `atRest`: the camera with the canvas in place; `canvasWidth`: the desktop view's.
   */
  const moveChrome = (atRest: Camera, canvasWidth: number, out: boolean, fromOut = false) => {
    const shell = viewport.current!.parentElement!;
    const sideOf = (selector: string) => [...shell.querySelectorAll<HTMLElement>(`:scope > :is(${selector})`)];
    const layersSide = sideOf(".tk-panel.is-layers, .tk-show-layers, .tk-resizer.is-layers");
    const designSide = sideOf(".tk-panel.is-design, .tk-tools, .tk-resizer.is-design");
    const width = shell.clientWidth;
    // Where they are laid out, as offsets have them: their transforms aside, partway through a move too.
    const layersRight = Math.max(0, ...layersSide.map((el) => el.offsetLeft + el.offsetWidth));
    const designLeft = Math.min(width, ...designSide.map((el) => el.offsetLeft));
    const restLeft = viewport.current!.getBoundingClientRect().left + atRest.x;
    const push = chromePush(
      {
        atRest: { left: restLeft, right: restLeft + canvasWidth * atRest.zoom },
        overPage: { left: -scrollX, right: canvasWidth - scrollX },
      },
      { layersRight, designLeft },
      width,
    );
    const parts = [...layersSide, ...designSide];
    const away = (i: number) => `translateX(${i < layersSide.length ? push.left : push.right}px)`;
    const now = parts.map((el, i) => (fromOut ? away(i) : `translateX(${new DOMMatrix(getComputedStyle(el).transform).e}px)`));
    for (const move of chromeMoves.current) move.cancel();
    chromeMoves.current = parts.map((el, i) =>
      el.animate([{ transform: now[i] }, { transform: out ? away(i) : "translateX(0px)" }], {
        duration: MODE_SWITCH_MS,
        easing: EASE_IN_OUT,
        // Out, they stay off the window until the shell is gone.
        fill: out ? "forwards" : "none",
      }),
    );
  };

  // A layout effect, so freezing starts in the same task as the click.
  useLayoutEffect(() => {
    let mounted = true;
    // The shell around the canvas. It stays see-through until there is a canvas, so the page shows until it can turn into one.
    const shell = viewport.current!.parentElement!;
    // In place of a canvas, it is up already: the page never shows.
    if (!startAt) shell.style.opacity = "0";
    const frozen = restoreFrom === null ? freeze(window, iframe.current!) : restore(restoreFrom, iframe.current!, takeIn);
    // Pause the page underneath, now that it has been copied: no focus, no clicks.
    const body = document.body;
    const wasInert = body.inert;
    body.inert = true;
    frozen.then((frozen) => {
      if (!mounted) return;
      const canvasViews = createViews(frozen);
      setViews(canvasViews);
      onCanvas(canvasViews, workspace.current!);
      const start = startAt ?? initialCamera(frozen, { width: viewsWidth(frozen.width, widths), height: frozen.height }, viewport.current!.getBoundingClientRect());
      setCamera(start);
      shell.style.opacity = "";
      if (startAt) {
        // No mode switch to show.
      } else if (animate && prefersReducedMotion()) {
        play(shell, [{ opacity: 0 }, { opacity: 1 }], { duration: MODE_FADE_MS, easing: EASE_OUT });
      } else if (animate) {
        // The page shrinks from where it is in the window into its place on the canvas, the panels coming in with it.
        play(stage.current!, [{ transform: overPage() }, { transform: transformOf(start) }], {
          duration: MODE_SWITCH_MS,
          easing: EASE_IN_OUT,
        });
        moveChrome(start, frozen.width, false, true);
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

  /**
   * The views beside the desktop view made while the canvas travels into
   * place: hidden till it is there, they are made after the frame that first
   * shows it, one a task, so that frame waits for none of them. Any not made
   * by the time it is there are made at once (below).
   */
  const [besideLater] = useState(createLater);
  const travellingNow = useRef(travelling);
  travellingNow.current = travelling;
  useLayoutEffect(() => {
    if (!travelling) besideLater.runNow();
  }, [travelling]);
  useEffect(() => () => besideLater.cancel(), []);
  // The views beside the desktop view: each shows the canvas in its own iframe once there is a canvas, and stops when deleted.
  useEffect(() => {
    if (!views) return;
    for (const width of widths) {
      if (attached.current.has(width) || !frames.current.get(width)) continue;
      const entry: { view: View | null; gone: boolean } = { view: null, gone: false };
      attached.current.set(width, entry);
      const add = () => {
        const frame = frames.current.get(width);
        if (entry.gone || !frame) return;
        views.add(frame, width).then(
          (view) => {
            if (entry.gone) return views.remove(view);
            entry.view = view;
            setBeside((laidOut) => new Map(laidOut).set(width, view));
          },
          (error: unknown) => console.error(error),
        );
      };
      if (travellingNow.current) besideLater.add(add);
      else add();
    }
    for (const [width, entry] of attached.current) {
      if (widths.includes(width)) continue;
      attached.current.delete(width);
      entry.gone = true;
      if (!entry.view) continue;
      views.remove(entry.view);
      setActive((view) => (view === entry.view ? null : view));
      setBeside((laidOut) => {
        const next = new Map(laidOut);
        next.delete(width);
        return next;
      });
    }
  }, [views, widths]);
  // The view pressed in last is the one worked in: its breakpoint is where edits go.
  useLayoutEffect(() => {
    const desktop = !active || active === views?.list()[0];
    onWorkIn(desktop ? null : active, active ? viewName(active.width, desktop) : viewName(0, true));
  }, [active]);
  // Each view is as tall as what it shows: the views are placed, outlined and fitted anew as it grows or shrinks.
  useEffect(() => views?.onResize(() => resized(undefined)), [views]);
  // Leaving edit mode: the views beside the desktop view stop following the canvas.
  useEffect(
    () => () => {
      for (const entry of attached.current.values()) {
        entry.gone = true;
        if (entry.view) views?.remove(entry.view);
      }
      attached.current.clear();
    },
    [views],
  );
  const setViewWidths = (next: number[]) => {
    setWidths(next);
    writeViewWidths(next);
  };

  /** Shows the canvas `width` px wide, as playing does; null: as wide as it was frozen, its desktop view. Returns what is played. */
  const playAt = (width: number | null): Bounds | null => {
    if (!canvas || !played) return null;
    iframe.current!.style.width = `${width ?? canvas.width}px`;
    setPlayWidth(width);
    return { ...played, width: width ?? canvas.width };
  };
  /**
   * How wide playing shows the canvas in a viewport `area` px wide: as wide as the view played
   * (designer, 2026-11-08), or as the viewport for the desktop view. A view wider than the
   * viewport is played as wide as the viewport, as the window would show the page.
   */
  const widthToPlay = (area: number, width: number | null) => Math.round(Math.min(width ?? area, area));
  // Playing shows the canvas at 100%, as wide as the view played, from the part at the top of it, in the middle; stopping puts the canvas and the camera back as they were.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const beforePlaying = useRef<Camera | null>(null);
  // Playing, the camera to come back to is the one before it.
  if (cameraNow && canvas) cameraNow.current = (playing && beforePlaying.current) || camera;
  useLayoutEffect(() => {
    if (!played) return;
    if (playing) {
      beforePlaying.current = camera;
      onTool(null);
      setHover(null);
      const area = viewport.current!.getBoundingClientRect();
      const top = Math.max(0, -camera.y / camera.zoom);
      setCamera(scrolled({ zoom: 1, x: 0, y: -top }, playAt(widthToPlay(area.width, playedWidth))!, area));
      viewport.current!.focus({ preventScroll: true });
    } else if (beforePlaying.current) {
      playAt(null);
      setCamera(beforePlaying.current);
      beforePlaying.current = null;
    }
  }, [playing]);

  // Leaving grows the canvas back over the page; a click on the way turns it around.
  const wasLeaving = useRef(false);
  /** Leaving, the views held as tall as the page now is; turned around, let go, each as tall as what it shows. */
  const heightsPinned = useRef<(() => void) | null>(null);
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
      // With reduced motion, nothing is pushed (designer, 2026-11-08): any push left from before goes, the shell alone fades.
      for (const move of chromeMoves.current) move.cancel();
      play(shell, [{ opacity: from }, { opacity: leaving ? 0 : 1 }], { ...options, duration: MODE_FADE_MS }, done);
      return;
    }
    // The window resized since the page was frozen: leaving, the desktop view is laid out again as wide as the page now is,
    // so it grows into the page as the page is, not as it was (designer, 2026-11-08); turned around, as frozen again.
    // Playing sets its own width, and is left as it is.
    const width = leaving ? document.documentElement.clientWidth : canvas.width;
    if (!playing) {
      heightsPinned.current?.();
      heightsPinned.current = null;
      iframe.current!.style.width = `${width}px`;
      if (leaving) {
        // No shorter than the window now is, either, so the page's foot is not the canvas's gray: held so as it grows.
        fitHeight(canvas.document, iframe.current!, Math.max(canvas.windowHeight, innerHeight));
        heightsPinned.current = views?.pinHeights() ?? null;
      }
    }
    // Toward where the camera has the canvas, turned around: what the panels keep their gap to, either way.
    moveChrome(camera, playing ? canvas.width : width, leaving);
    const from = transformOf(currentCamera(stage.current!));
    const to = leaving ? overPage() : transformOf(camera);
    // Over the page, a changed canvas would cut to a page without the changes.
    const fadeIntoPage = () => {
      const shell = viewport.current!.parentElement!;
      play(shell, [{ opacity: 1 }, { opacity: 0 }], { ...options, duration: MODE_FADE_MS }, done, true);
    };
    const grown = leaving && changed ? fadeIntoPage : done;
    play(stage.current!, [{ transform: from }, { transform: to }], { ...options, duration: MODE_SWITCH_MS, easing: EASE_IN_OUT }, grown);
  }, [leaving]);

  // Effects run after paint; a key pressed right after a click must still see that click's selection.
  const latest = useRef({
    played,
    playAt,
    bounds,
    placed,
    outside,
    selected,
    onSelect,
    endDrag: (_commit: boolean) => {},
    endResize: (_commit: boolean) => {},
    modifiersChanged: (_keys: Modifiers) => {},
    resizeNow: () => {},
    tool,
    onTool,
    playing,
    playedWidth,
    onStopPlaying,
  });
  latest.current = { played, playAt, bounds, placed, outside, selected, onSelect, endDrag, endResize, modifiersChanged, resizeNow, tool, onTool, playing, playedWidth, onStopPlaying };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { played, bounds, placed, selected, onSelect, endDrag, tool, onTool, playing, onStopPlaying } = latest.current;
      if (playing && !played) return;
      // Read once playing, as a page scrolls by it; not on each key typed elsewhere.
      const playedIn = playing ? viewport.current!.getBoundingClientRect() : null;
      const key = canvasKey(event, {
        playing,
        page: playedIn ? playedIn.height - 40 : 0,
        tool: !!tool,
        dragging: !!dragging.current || !!resizing.current,
        held: pointerHeld(),
        selected: selected.length > 0,
      });
      if (!playing) {
        if (["Meta", "Control", "Shift", "Alt"].includes(event.key)) latest.current.modifiersChanged(event);
        if (event.key === "Meta" || event.key === "Control") {
          const deep = event.metaKey || event.ctrlKey;
          setHover((h) => h && { ...h, deep });
        }
        if (event.key === "Alt") setMeasuring(event.altKey);
      }
      if (!key) return;
      event.preventDefault();
      // Playing, the keys are the canvas's alone.
      if (playing) event.stopImmediatePropagation();
      else event.stopPropagation();
      if (key.action === "stop playing") onStopPlaying();
      else if (key.action === "scroll") {
        const dy = key.by;
        setCamera((v) => scrolled({ ...v, y: Number.isFinite(dy) ? v.y - dy : dy > 0 ? -Infinity : 0 }, played!, playedIn!));
      } else if (key.action === "pan") setSpaceHeld(key.held);
      else if (key.action === "tool") onTool(key.tool);
      else if (key.action === "cancel drag") {
        endDrag(false);
        latest.current.endResize(false);
      }
      else if (key.action === "select parents") onSelect(selectParents(selected));
      // The layers off the canvas too.
      else if (key.action === "fit" && bounds) setCamera(fitCamera(boundsOf([...placed, ...latest.current.outside]), viewport.current!.getBoundingClientRect()));
    };
    const release = () => {
      setSpaceHeld(false);
      setMeasuring(false);
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

  // A panel opening or closing beside the viewport moves its left edge: the canvas stays where it is on screen.
  // Playing hides the panels for a while, and the canvas keeps to the middle; the edge is back where it was after.
  useEffect(() => {
    const el = viewport.current!;
    let left = el.getBoundingClientRect().left;
    const observer = new ResizeObserver(([entry]) => {
      viewportSize.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (playingRef.current) {
        // The window resized while playing: the canvas is as wide as it now, or as the view played, in the middle.
        const area = el.getBoundingClientRect();
        const played = latest.current.playAt(widthToPlay(area.width, latest.current.playedWidth));
        if (played) setCamera((v) => scrolled(v, played, area));
        return;
      }
      const now = el.getBoundingClientRect().left;
      // The window resized, the camera where it was: more or less of the stage shows. Moved, the camera says so itself.
      if (now === left) return atRest.resized();
      const moved = left - now;
      left = now;
      setCamera((v) => ({ ...v, x: v.x + moved }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Registered by hand: it has to be non-passive to keep the page underneath from scrolling.
  useEffect(() => {
    const el = viewport.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientHeight : 1;
      let dx = event.deltaX * unit;
      let dy = event.deltaY * unit;
      if (playingRef.current) {
        const { played } = latest.current;
        if (event.shiftKey && !dx) [dx, dy] = [dy, 0];
        if (played) setCamera((v) => scrolled({ ...v, x: v.x - dx, y: v.y - dy }, played, el.getBoundingClientRect()));
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        setCamera((v) => wheelZoom(v, dy, event.clientX - rect.left, event.clientY - rect.top));
        return;
      }
      if (event.shiftKey && !dx) [dx, dy] = [dy, 0];
      setCamera((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const primary = selected.at(-1) ?? null;
  /** The view under the pointer, or the layer off the canvas (those first: they are drawn over the views), and where the pointer is in it, in its px. */
  const viewAt = (event: At, among: Placed[] = [...outside.slice().reverse(), ...placed]): { at: Shown; x: number; y: number } | null => {
    const { x, y } = toCanvas(event);
    return shownAt(among, x, y);
  };
  /** The deepest layer under the pointer, in whichever view it is over. The views take no pointer input, so this asks what they show. */
  const layerAt = (event: At): Layer | null => pointedAt(event)?.layer ?? null;
  /** That layer, and the view it is in. */
  const pointedAt = (event: At): { layer: Layer; in: Shown } | null => {
    const hit = viewAt(event);
    const layers = hit && treeIn(hit.at);
    const layer = hit && layers ? hit.at.view.layerAt(layers, hit.x, hit.y) : null;
    // Off the canvas, there is no page around the layer to select.
    return !layer || (layer === layers?.root && hit?.at.offCanvasLayer) ? null : { layer, in: hit!.at };
  };

  const onPointerDown = (event: TargetedPointerEvent<HTMLDivElement>) => {
    if (playing) return;
    // What is pressed on is read as the view pressed in shows it now: one beside a value just changed catches up first (ADR 0011).
    const over = viewAt(event);
    // While text is typed in, a press in it places the caret, as in the page; anywhere else, typing ends as the viewport takes the focus.
    const typed = typing.current;
    if (typed && over && event.button === 0 && !spaceHeld && over.at.view === typed.view && within(typed.el.getBoundingClientRect(), over)) {
      pressInTyped(event, typed.el, over.at, over);
      return;
    }
    if (over && !over.at.offCanvasLayer) views?.sync(over.at.view);
    if (event.button === 0 && !spaceHeld && tool && editor) {
      // Drawn in the view pressed in, or in a layer off the canvas; outside them all, in the blank space, a layer off the canvas of its own (ticket 106).
      event.currentTarget.setPointerCapture(event.pointerId);
      const start = over ? { x: over.x, y: over.y } : toCanvas(event);
      drawing.current = { pointerId: event.pointerId, in: over?.at ?? null, start, release: holdPointer(event.pointerId) };
      setDrawn({ in: over?.at ?? null, box: new DOMRect(start.x, start.y, 0, 0) });
      return;
    }
    if (event.button === 0 && !spaceHeld) {
      const last = lastClick.current;
      const second = !!last && event.timeStamp - last.time <= DOUBLE_CLICK_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) <= DOUBLE_CLICK_PX;
      const plain = !event.metaKey && !event.ctrlKey && !event.shiftKey;
      clickPress.current = { pointerId: event.pointerId, time: event.timeStamp, x: event.clientX, y: event.clientY, second, plain, dragged: false };
      if (over && !over.at.offCanvasLayer) setActive(over.at.view);
      const hit = layerAt(event);
      const layer = hit && (event.metaKey || event.ctrlKey ? selectDeepest(hit) : selectOnClick(hit, primary));
      if (event.shiftKey) {
        if (layer) onSelect(toggleIn(selected, layer));
      } else onSelect(layer ? [layer] : []);
      // Pressed on a layer it can move: moving the pointer drags it.
      if (layer && over && !event.shiftKey && editorIn(over.at)?.canMove(layer)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        press.current = { pointerId: event.pointerId, layer, in: over.at, x: event.clientX, y: event.clientY, release: holdPointer(event.pointerId) };
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

  /**
   * A press in the text typed in, in the view it is typed in: it keeps the focus, and places the caret where
   * pressed; with ⇧ held, the words selected reach there. Pressed twice in a row it selects the word there,
   * three times all the words.
   */
  const pressInTyped = (event: TargetedPointerEvent<HTMLDivElement>, el: HTMLElement, shown: Shown, at: { x: number; y: number }) => {
    // Pressed on, the viewport would take the focus, and typing would end.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const last = typedPress.current;
    const again = !!last && event.timeStamp - last.time <= DOUBLE_CLICK_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) <= DOUBLE_CLICK_PX;
    const count = again ? Math.min(last.count + 1, 3) : 1;
    typedPress.current = { pointerId: event.pointerId, in: shown, time: event.timeStamp, x: event.clientX, y: event.clientY, count };
    const selection = el.ownerDocument.getSelection()!;
    const caret = caretAt(el, at);
    if (count === 3) selection.selectAllChildren(el);
    else if (count === 2) selectWord(selection, caret);
    else if (event.shiftKey && selection.anchorNode && el.contains(selection.anchorNode)) selection.extend(caret.node, caret.offset);
    else selection.collapse(caret.node, caret.offset);
  };

  const onPointerMove = (event: TargetedPointerEvent<HTMLDivElement>) => {
    if (playing) return;
    const selecting = typedPress.current;
    if (selecting?.pointerId === event.pointerId) {
      // Dragged from where it was pressed, the words passed over are selected.
      const el = typing.current?.el;
      if (el && selecting.count === 1) {
        const caret = caretAt(el, toView(event, selecting.in));
        el.ownerDocument.getSelection()!.extend(caret.node, caret.offset);
      }
      return;
    }
    if (resizing.current?.pointerId === event.pointerId) {
      resizeOnNextFrame(resizing.current, event);
      return;
    }
    if (drawing.current?.pointerId === event.pointerId) {
      setDrawn({ in: drawing.current.in, box: boxFrom(drawing.current.start, toIn(event, drawing.current.in)) });
      return;
    }
    const pressed = press.current;
    if (pressed?.pointerId === event.pointerId) {
      if (!dragging.current && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_THRESHOLD) return;
      if (clickPress.current?.pointerId === event.pointerId) clickPress.current.dragged = true;
      dragging.current ??= startDrag(pressed.layer, pressed.in);
      moveDrag(dragging.current, event, pressed);
      return;
    }
    const p = pan.current;
    if (!p) {
      if (event.buttons) return;
      const pointed = pointedAt(event);
      const deep = event.metaKey || event.ctrlKey;
      setMeasuring(event.altKey);
      setHover((h) => (h?.hit === pointed?.layer && h?.in === pointed?.in && h?.deep === deep ? h : pointed && { hit: pointed.layer, in: pointed.in, deep }));
      return;
    }
    if (p.pointerId !== event.pointerId) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    setCamera((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  const endPan = (event: TargetedPointerEvent<HTMLDivElement>) => {
    if (typedPress.current?.pointerId === event.pointerId) {
      // Let go, it is still counted: the next press may make a double click of it.
      typedPress.current.pointerId = null;
      return;
    }
    const click = clickPress.current?.pointerId === event.pointerId ? clickPress.current : null;
    if (click) {
      clickPress.current = null;
      // Let go without moving into a drag, it is a click; the second of two, a double click, and the next press starts afresh.
      const clicked = event.type === "pointerup" && !click.dragged;
      lastClick.current = clicked && !click.second && click.plain ? click : null;
      if (clicked && click.second) doubleClick(event);
    }
    if (resizing.current?.pointerId === event.pointerId) {
      // Let go, where it is let go; a pointer cancelled takes the resize back, as a drag cancelled puts the layer back.
      if (event.type === "pointerup") resizeNow();
      endResize(event.type === "pointerup");
      return;
    }
    if (drawing.current?.pointerId === event.pointerId) {
      const { start, in: shown, release } = drawing.current;
      drawing.current = null;
      release();
      setDrawn(null);
      if (event.type === "pointerup" && tool && editor) draw(tool, shown, start, boxFrom(start, toIn(event, shown)));
      return;
    }
    if (press.current?.pointerId === event.pointerId) {
      endPress();
      endDrag(event.type === "pointerup", event.altKey);
      return;
    }
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    setPanning(false);
  };

  /** Where the pointer is on the stage, in canvas px: the desktop view's px. */
  const toCanvas = (event: At) => {
    const area = viewport.current!.getBoundingClientRect();
    return { x: (event.clientX - area.left - camera.x) / camera.zoom, y: (event.clientY - area.top - camera.y) / camera.zoom };
  };
  /** Where the pointer is in a view, in its px. */
  const toView = (event: At, shown: Shown) => {
    const { x, y } = toCanvas(event);
    return { x: x - shown.x, y: y - shown.y };
  };
  /** Where the pointer is in a view, or, with none, on the stage. */
  const toIn = (event: At, shown: Shown | null) => (shown ? toView(event, shown) : toCanvas(event));

  /**
   * Starts dragging in a view: the layer stops taking the pointer, and where its
   * neighbours are there is noted before any of them shifts. The layer dragged
   * is shifted on the canvas, so in every view; the layers making room, in
   * the view dragged in at once and in the others once the pointer pauses
   * (ADR 0011). No view grows or shrinks with it until the drop.
   */
  const startDrag = (layer: Layer, shown: Shown): DragSession => startDragSession(layer, shown, views!);

  /**
   * The layer dragged to where the pointer is, from where it was pressed.
   * Placed freely, it snaps, unless ⌘ (Ctrl) is held: as near on screen
   * as `SNAP_PX`, at any zoom.
   */
  const moveDrag = (session: DragSession, event: Pointer, from: { x: number; y: number }) => {
    session.pointer = { clientX: event.clientX, clientY: event.clientY, metaKey: event.metaKey, ctrlKey: event.ctrlKey };
    const snapWithin = event.metaKey || event.ctrlKey ? null : SNAP_PX / camera.zoom;
    let dx = (event.clientX - from.x) / camera.zoom;
    let dy = (event.clientY - from.y) / camera.zoom;
    const { layer, start, in: shown } = session;
    const box = new DOMRect(start.x + dx, start.y + dy, start.width, start.height);
    const offCanvasLayer = shown.offCanvasLayer;
    if (session.whole && offCanvasLayer) {
      // Let go over a view, it goes back onto the canvas, where it can go there, as any layer dragged in it does (ADR 0009).
      const into = viewAt(event, placed)?.at ?? null;
      const rectOf = (l: Layer) => into?.view.boxOf(l) ?? new DOMRect();
      const there = into && new DOMRect(offCanvasLayer.x + box.x - into.x, offCanvasLayer.y + box.y - into.y, box.width, box.height);
      const drop = into && there && editor ? findDrop(editor, into.view, null, toView(event, into), there, rectOf, snapWithin) : null;
      // Snapped, it is shown where it snaps to.
      if (drop && there) [dx, dy] = [dx + drop.box.x - there.x, dy + drop.box.y - there.y];
      moveWhole(session, dx, dy);
      session.to = into ? null : { x: offCanvasLayer.x + dx, y: offCanvasLayer.y + dy };
      session.back = drop;
      // Nothing makes room for it: coming from outside, the layers would slide away from under the pointer as it enters.
      setDrag({ layer, in: into ?? shown, box: drop?.box ?? there ?? box, drop, out: false });
      return;
    }
    // Let go outside every view and every layer off the canvas, a layer of the canvas goes off it.
    session.out = !offCanvasLayer && !viewAt(event) && !!editor?.canRemove(layer);
    const rectOf = (l: Layer) => laidOut(session, l);
    const drop = session.out ? null : (editorIn(shown) && findDrop(editorIn(shown)!, shown.view, layer, toView(event, shown), box, rectOf, snapWithin, session.marginsAside));
    session.drop = drop;
    // Snapped, it is shown where it snaps to.
    const at = drop?.box ?? box;
    session.box = at;
    // The views beside show the layers making room once the pointer pauses: what is drawn over them is drawn anew then.
    shift(session, { x: dx + at.x - box.x, y: dy + at.y - box.y }, drop, () => setDrag((d) => d && { ...d }));
    setDrag({ layer, in: shown, box: at, drop, out: session.out });
  };
  /**
   * A modifier key pressed or let go, the pointer still: the drag or the
   * resize under way goes again where the pointer is, with the keys as they
   * are now. ⌘ (Ctrl) turns snapping off while it is held; resizing, ⇧ keeps
   * the proportions and ⌥ resizes from the middle.
   */
  function modifiersChanged({ metaKey, ctrlKey, shiftKey, altKey }: Modifiers) {
    const drag = dragging.current;
    const from = press.current;
    if (drag?.pointer && from) moveDrag(drag, { ...drag.pointer, metaKey, ctrlKey }, from);
    const resize = resizing.current;
    if (resize) {
      // What the pointer did before the key, first.
      resizeNow();
      if (resize.pointer) moveResize(resize, { ...resize.pointer, metaKey, ctrlKey, shiftKey, altKey });
    }
  }

  /**
   * A handle of the layer selected pressed in a view: dragging it resizes the
   * layer there, at that view's breakpoint. Not while playing, drawing, or
   * with Space held (the press pans), nor but with the main button; nor with
   * ⌘ (Ctrl) held as it is pressed: that selects the deepest layer there, as
   * anywhere on the canvas, though it is on the edge of the one selected.
   */
  const pressHandle = (layer: Layer, shown: Shown, handle: Handle, event: TargetedPointerEvent<HTMLDivElement>): boolean => {
    if (playing || tool || spaceHeld || event.button !== 0 || event.metaKey || event.ctrlKey || !editor) return false;
    // Read as the view pressed in shows it now (ADR 0011), the one worked in from now on.
    views?.sync(shown.view);
    setActive(shown.view);
    // Pressed twice, a handle resizes twice: a click before it makes no double click with the press after.
    lastClick.current = null;
    viewport.current!.setPointerCapture(event.pointerId);
    const { pointerId, clientX, clientY } = event;
    resizing.current = { pointerId, layer, in: shown, handle, from: { clientX, clientY }, begun: null, stepped: false, set: new Set(), release: holdPointer(pointerId) };
    setResize({ layer, in: shown, handle, showsSize: false, marks: [] });
    setHover(null);
    return true;
  };

  /**
   * The layer resized as the pointer is now: one step more of the resize, as
   * the editor has it in the view pressed in, snapping as near on screen as
   * `SNAP_PX`, at any zoom, unless ⌘ (Ctrl) is held.
   */
  function moveResize(session: ResizeSession, pointer: ResizePointer) {
    const step = resizeStep(session, editor!, pointer, camera.zoom, SNAP_PX);
    if (!step) return;
    if (Object.keys(step.to).length) {
      onResize(session.layer, step.to, session.stepped);
      session.stepped = true;
    }
    // Drawn where its edges are now, as laid out: its container may place it otherwise than where it was dragged to.
    setResize({ layer: session.layer, in: session.in, handle: session.handle, showsSize: true, marks: marksNow(session) });
    // Once the views beside have caught up.
    clearTimeout(catchingUp.current);
    catchingUp.current = setTimeout(() => caughtUp(undefined), CAUGHT_UP_MS);
  }

  /**
   * The pointer moves, as a mouse reports it, more often than frames come: the
   * layer is resized once a frame, as the pointer is when the frame begins,
   * so no step is made that no frame shows.
   */
  const nextResize = useRef<{ frame: number; session: ResizeSession; pointer: ResizePointer } | null>(null);
  function resizeOnNextFrame(session: ResizeSession, event: ResizePointer) {
    const { clientX, clientY, metaKey, ctrlKey, shiftKey, altKey } = event;
    const pointer = { clientX, clientY, metaKey, ctrlKey, shiftKey, altKey };
    if (nextResize.current) nextResize.current.pointer = pointer;
    else nextResize.current = { frame: requestAnimationFrame(() => latest.current.resizeNow()), session, pointer };
  }
  /** The resize waiting for the next frame made now, if one is. */
  function resizeNow() {
    const next = nextResize.current;
    if (!next) return;
    nextResize.current = null;
    cancelAnimationFrame(next.frame);
    if (resizing.current === next.session) moveResize(next.session, next.pointer);
  }

  /** Ends the resize: let go, it stays as it is; cancelled with Esc, it is taken back. The keys edit again. */
  function endResize(commit: boolean) {
    const session = resizing.current;
    if (!session) return;
    resizing.current = null;
    if (nextResize.current) cancelAnimationFrame(nextResize.current.frame);
    nextResize.current = null;
    session.release();
    setResize(null);
    if (!commit && session.stepped) onCancelResize(session.layer);
  }

  /** Makes the layer drawn over `box`, where it goes; new text is typed in at once. A click rather than a drag makes one of the size it takes. */
  const draw = (type: Created["type"], shown: Shown | null, start: { x: number; y: number }, box: DOMRect) => {
    onTool(null);
    const clicked = box.width < DRAG_THRESHOLD && box.height < DRAG_THRESHOLD;
    if (!shown) {
      // In the blank space: a layer off the canvas of its own, there where it was drawn.
      const made = onMakeOff(type, { x: box.x, y: box.y }, clicked ? undefined : { width: box.width, height: box.height });
      if (made && type === "text") beginTyping(made.layer, made.view);
      return;
    }
    const view = shown.view;
    const to = findPlace(editorIn(shown)!, view, start, box);
    if (!to) return;
    const layer = onCreate(type, to, clicked ? undefined : { width: box.width, height: box.height });
    if (type === "text") beginTyping(layer, view);
  };

  /**
   * Types in a text layer, in the view it was double-clicked or drawn in: the
   * words show in every view as they are typed. Enter, Esc or going elsewhere
   * ends it, and the words are set on the canvas, as an edit.
   */
  const beginTyping = (layer: Layer, view: View) => {
    const own = onBeginText(layer);
    const onCanvas = own.el as HTMLElement;
    const html = onCanvas.innerHTML;
    const typed = view.typeIn(onCanvas);
    const el = typed.el;
    typing.current = { layer: own, html, view, el };
    typedPress.current = null;
    setTypingLayer(own);
    el.contentEditable = "plaintext-only";
    el.focus({ preventScroll: true });
    el.ownerDocument.getSelection()?.selectAllChildren(el);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && !(event.key === "Enter" && !event.shiftKey)) return;
      event.preventDefault();
      // Typed in a view's own document, the key never reaches the Shell: held down on a value's icon, say, Enter sets nothing (ADR 0012).
      if (event.key === "Enter" && pointerHeld()) return;
      el.blur();
    };
    const onInput = () => typedOn(undefined);
    const end = () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("input", onInput);
      el.removeEventListener("blur", end);
      setTypingLayer(null);
      const saved = typing.current;
      typing.current = null;
      typedPress.current = null;
      el.removeAttribute("contenteditable");
      const text = el.textContent!.replace(/\s+/g, " ").trim();
      typed.done();
      // The words are set as an edit, from what was there before typing.
      onCanvas.innerHTML = saved!.html;
      onEditText(saved!.layer, text);
      viewport.current?.focus({ preventScroll: true });
    };
    el.addEventListener("keydown", onKey);
    el.addEventListener("input", onInput);
    el.addEventListener("blur", end);
  };

  /** A double click, where the second press is let go: one layer deeper, or typing in the text selected. */
  function doubleClick(event: TargetedPointerEvent<HTMLDivElement>) {
    const over = viewAt(event);
    const hit = layerAt(event);
    const layer = hit && !event.metaKey && !event.ctrlKey && !event.shiftKey && selectOnDoubleClick(hit, primary);
    // On the text selected, a double click types in it, in the view clicked in; on a Frame drawn around its text alone selected, as a button is, in its text.
    const text = layer && (layer === primary ? (layer.kind === "text" ? layer : framedText(layer)) : primary && layer === framedText(primary) ? layer : null);
    if (text && over && editor) beginTyping(text, over.at.view);
    else if (layer) onSelect([layer]);
  }

  /** The press on a layer is over: moving the pointer drags nothing, and the keys edit again. */
  function endPress() {
    press.current?.release();
    press.current = null;
  }

  /** Ends the drag: everything shifted goes back, and, let go where it can go, the layer moves there; with ⌥ held, a copy goes there. */
  function endDrag(commit: boolean, copy = false) {
    const session = dragging.current;
    if (!session) return;
    dragging.current = null;
    // The press is over with the drag: the keys edit again, though the pointer is still down after Esc.
    endPress();
    restoreDragStyles(session);
    setDrag(null);
    if (!commit) return;
    const { layer, in: shown, box, to, out, drop, back } = session;
    if (shown.offCanvasLayer && session.whole) {
      if (to && (to.x !== shown.offCanvasLayer.x || to.y !== shown.offCanvasLayer.y)) onPlaceOff(shown.offCanvasLayer, to.x, to.y);
      // Over a view where it cannot go, it stays off the canvas, where it was.
      else if (back) onPutBack(shown.offCanvasLayer, back.to);
      return;
    }
    if (out && box) {
      onMoveOff(layer, shown.view, { x: shown.x + box.x, y: shown.y + box.y }, copy);
      return;
    }
    if (!drop) return;
    if (copy && editorIn(shown)?.canDuplicate(layer)) onDuplicate(layer, drop.to);
    else onMove(layer, drop.to);
  }

  // Nothing to point out while panning, dragging or while a value is being adjusted.
  // A move builds the layers anew: a layer pointed at before it is gone.
  const hoveredTree = hover && treeOf(hover.hit);
  const hovered =
    hover && !spaceHeld && !panning && !drag && !resize && !hideSelection && hoveredTree && inTree(hoveredTree, hover.hit)
      ? hover.deep
        ? selectDeepest(hover.hit)
        : selectOnClick(hover.hit, primary)
      : null;

  /** The views laid out so far. */
  const shownViews = placed.filter((p): p is Shown => p.view !== null);
  /** A new Frame's brief shows beside it in the view last pressed in, or else the desktop view; in a layer made in the blank space, there (ticket 106). */
  const madeOff = primary ? outside.find((shown) => shown.offCanvasLayer?.origin.made && shown.offCanvasLayer.document === primary.el.ownerDocument) : undefined;
  const briefIn = madeOff ?? shownViews.find((p) => p.view === active) ?? shownViews[0];
  /** What edits the layer a new Frame's brief is written on. */
  const briefEditor = madeOff ? madeOff.offCanvasLayer!.editor : editor;
  /** Whether a view, or a layer off the canvas, shows the layer: those of the canvas show in every view, those off it in their own. */
  const shows = (shown: Shown, layer: Layer) => layer.el.ownerDocument === (shown.offCanvasLayer ? shown.offCanvasLayer.document : canvas?.document);
  /** The new Frame selected alone, which has the button that writes its brief beside it, in `briefIn`. */
  const newFrame =
    briefIn && briefEditor && primary && selected.length === 1 && shows(briefIn, primary) && !travelling && !playing && !drag && !resize && !hideSelection && briefEditor.isNewFrame(primary)
      ? { layer: primary, in: briefIn, brief: briefEditor.brief(primary) }
      : null;
  /** The layer of the canvas selected alone, with the selection toolbar on its top right, in `briefIn`. */
  const toolbar =
    briefIn && editor && primary && selected.length === 1 && primary.el.ownerDocument === canvas?.document && !travelling && !playing && !drag && !resize && !hideSelection && !typingLayer
      ? { layer: primary, in: briefIn, promote: editor.canPromote(primary) }
      : null;
  /**
   * The layer of the canvas selected alone that can be resized, with handles in every view: not the page,
   * not text with no element of its own, nor a layer shown inline. While it is resized, the handles stay.
   */
  /**
   * The layer selected alone whose fill's picker is open on a gradient: its gradient's handles in every view, in place of
   * the resize handles. They stay while a value steps, the selection hidden, as they are what is being changed.
   */
  const withGradient =
    gradientHandles && editor && primary && selected.length === 1 && primary.el.ownerDocument === canvas?.document && !travelling && !playing && !drag && !resize && !typingLayer
      ? primary
      : null;
  const withHandles =
    withGradient ? null : resize?.layer ??
    (editor && primary && selected.length === 1 && primary.el.ownerDocument === canvas?.document && primary !== tree?.root && !travelling && !playing && !drag && !hideSelection && !typingLayer && !tool && (editor.can(primary, "width") || editor.can(primary, "height"))
      ? primary
      : null);
  /** The layers of the canvas with a brief: marked in every view, as in the Layers panel. */
  const briefed = [
    ...(canvas && tree ? briefedLayers(canvas.document, tree) : []),
    // Those in the layers made in the blank space too, which take briefs (ticket 106).
    ...outside.flatMap(({ offCanvasLayer }) => (offCanvasLayer?.origin.made ? briefedLayers(offCanvasLayer.document, offCanvasLayer.editor.tree()) : [])),
  ];
  /**
   * ⌥ held: the distances from the layers selected, all of them as one box,
   * to the layer pointed at, in the view pointed in; pointed at one of them or
   * at nothing else, to the container of the one selected last.
   */
  const measured = (() => {
    if (!measuring || !hover || !primary || spaceHeld || panning || drag || resize || hideSelection || travelling || playing) return null;
    const shown = hover.in;
    const to = hovered && !selected.includes(hovered) ? hovered : primary.parent;
    if (!to || !selected.every((layer) => shows(shown, layer)) || !shows(shown, to)) return null;
    const boxes = selected.map((layer) => shown.view.boxOf(layer)).filter((box) => box !== null);
    const box = shown.view.boxOf(to);
    if (!boxes.length || !box) return null;
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    const from = new DOMRect(left, top, Math.max(...boxes.map((b) => b.right)) - left, Math.max(...boxes.map((b) => b.bottom)) - top);
    return { to, in: shown, marks: distances(from, box) };
  })();

  return (
    <div
      ref={viewport}
      class={`tk-viewport${panning ? " is-panning" : spaceHeld ? " is-pan-ready" : tool ? " is-drawing" : ""}${travelling ? " is-travelling" : ""}`}
      style={resize ? { cursor: handleCursor(resize.handle) } : undefined}
      role="region"
      aria-label="Canvas viewport"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={() => setHover(null)}
    >
      <div
        ref={stage}
        class="tk-stage"
        style={{
          transform: transformOf(camera),
          visibility: canvas ? "visible" : "hidden",
        }}
      >
        {/*
          No view scrolls: each is as tall as what it shows, the camera moves over it, and its scrollbar is hidden
          (`CANVAS_STYLES`). `scrolling="no"` tells the browser so: as a frame that could scroll, a view redrawn
          had the whole editor around it redrawn too, a large page's frame slower by some 5ms (ticket 22).
        */}
        <iframe ref={iframe} class="tk-canvas" title="Canvas" sandbox="allow-same-origin" scrolling="no" />
        {canvas &&
          placed
            .filter((p) => !p.desktop)
            .map((p) => (
              <iframe
                key={p.width}
                ref={(el) => {
                  if (el) frames.current.set(p.width, el);
                  else frames.current.delete(p.width);
                }}
                class="tk-canvas is-beside"
                title={`${p.name} ${p.width}`}
                sandbox="allow-same-origin"
                scrolling="no"
                // Only the desktop view travels between the page and the canvas, and only it is played.
                style={{ left: `${p.x}px`, visibility: playing || travelling ? "hidden" : undefined }}
              />
            ))}
        {/* The layers off the canvas, drawn over the views; each an iframe of its own, put there by `off-canvas.ts`. Only the canvas is played. */}
        <div ref={workspace} class="tk-off-canvas-layers" style={{ visibility: playing || travelling ? "hidden" : undefined }} />
      </div>
      {/* In every view alike: the layer pointed at, the selection, the text being typed in. */}
      {!travelling &&
        !playing &&
        [...shownViews, ...outside].map((shown) => {
          const { view, name } = shown;
          const at = cameraIn(camera, shown);
          // The selection lighter in the views other than the one worked in, pressed in last (designer, 2026-11-09).
          const away = !shown.offCanvasLayer && view !== (active ?? views?.list()[0]);
          return (
            <Fragment key={keyOf(shown)}>
              {hovered && !selected.includes(hovered) && shows(shown, hovered) && <Outline layer={hovered} view={view} name={name} camera={at} hover />}
              {tree && titled === keyOf(shown) && !selected.includes(tree.root) && <Outline layer={tree.root} view={view} name={name} camera={at} hover />}
              {selected.map((layer, i) => layer !== typingLayer && shows(shown, layer) && <Outline key={i} layer={layer} view={view} name={name} camera={at} hidden={hideSelection} away={away} />)}
              {typingLayer && shows(shown, typingLayer) && <Outline layer={typingLayer} view={view} name={name} camera={at} typing />}
              {withHandles && !shown.offCanvasLayer && (!spaceHeld || resize) && (
                <Handles layer={withHandles} view={view} name={name} camera={at} away={away} onPress={(handle, event) => pressHandle(withHandles, shown, handle, event)} />
              )}
              {withGradient && !shown.offCanvasLayer && shows(shown, withGradient) && (
                <GradientHandles
                  layer={withGradient}
                  view={view}
                  name={name}
                  camera={at}
                  editor={editor!}
                  onBegin={() => {
                    // Read as the view pressed in shows it now (ADR 0011), the one worked in from now on.
                    views?.sync(view);
                    setActive(view);
                  }}
                  onEdit={onFillEdited}
                />
              )}
              {briefed.map(
                (layer, i) =>
                  shows(shown, layer) && !(shown === newFrame?.in && layer === newFrame.layer) && <BriefMark key={`brief ${i}`} layer={layer} view={view} name={name} camera={at} />,
              )}
            </Fragment>
          );
        })}
      {newFrame && (
        <Brief
          key={newFrame.layer.el.getAttribute("data-tk-layer")}
          layer={newFrame.layer}
          view={newFrame.in.view}
          brief={newFrame.brief}
          camera={cameraIn(camera, newFrame.in)}
          onSetBrief={onSetBrief}
        />
      )}
      {toolbar && (
        <SelectionToolbar
          key={toolbar.layer.el.getAttribute("data-tk-layer") ?? undefined}
          layer={toolbar.layer}
          view={toolbar.in.view}
          camera={cameraIn(camera, toolbar.in)}
          promote={toolbar.promote}
          onPromote={onPromote}
        />
      )}
      {!travelling &&
        !playing &&
        placed.map((p) => (
          <ViewLabel
            key={keyOf(p)}
            name={p.name}
            width={p.width}
            breakpoint={coveredBy(p)}
            left={camera.x + p.x * camera.zoom}
            top={camera.y - LABEL_OFFSET}
            size={p.width * camera.zoom}
            onPlay={(button) => {
              setTitled(null);
              onPlay(p.desktop ? null : p.width, button);
            }}
            onDelete={p.desktop ? undefined : () => setViewWidths(widths.filter((width) => width !== p.width))}
            // The page in the view, selected as a Frame is by its name: the view is the one worked in from then on (ADR 0011).
            onSelect={
              p.view && tree
                ? () => {
                    views?.sync(p.view!);
                    setActive(p.view);
                    onSelect([tree.root]);
                  }
                : undefined
            }
            onPoint={(pointed) => setTitled(pointed ? keyOf(p) : null)}
          />
        ))}
      {bounds && !travelling && !playing && (
        <AddView left={camera.x + bounds.width * camera.zoom + 8} top={camera.y - LABEL_OFFSET} onAdd={(width) => setViewWidths(withWidth(widths, width))} />
      )}
      {resize?.showsSize && <SizeLabel layer={resize.layer} view={resize.in.view} name={resize.in.name} camera={cameraIn(camera, resize.in)} />}
      {resize && resize.marks.length > 0 && <Marks marks={resize.marks} view={resize.in.name} camera={cameraIn(camera, resize.in)} />}
      {drag?.drop && <Outline layer={drag.drop.to.parent} view={drag.in.view} name={drag.in.name} camera={cameraIn(camera, drag.in)} hover />}
      {drag?.drop?.line && <div class="tk-drop-line" aria-hidden="true" style={place(drag.drop.line, cameraIn(camera, drag.in))} />}
      {drag?.drop && drag.drop.marks.length > 0 && <Marks marks={drag.drop.marks} view={drag.in.name} camera={cameraIn(camera, drag.in)} />}
      {measured && (
        <>
          {measured.to !== hovered && <Outline layer={measured.to} view={measured.in.view} name={measured.in.name} camera={cameraIn(camera, measured.in)} hover />}
          <Marks marks={measured.marks} view={measured.in.name} camera={cameraIn(camera, measured.in)} />
        </>
      )}
      {(drag?.layer.text || drag?.out) && <div class="tk-drag-ghost" aria-hidden="true" style={place(drag.box, cameraIn(camera, drag.in))} />}
      {drawn && <div class="tk-drag-ghost" aria-hidden="true" style={place(drawn.box, drawn.in ? cameraIn(camera, drawn.in) : camera)} />}
      {failed && <p class="tk-viewport-message">The page could not be frozen. See the browser console for details.</p>}
    </div>
  );
}

/** Whether a point is in a box, edges and all. */
function within(box: DOMRect, { x, y }: { x: number; y: number }): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** Where the caret goes at a point in the view's px, in the element typed in; at a point beside its words, at their start or end, the nearer. */
function caretAt(el: HTMLElement, at: { x: number; y: number }): { node: Node; offset: number } {
  const caret = el.ownerDocument.caretPositionFromPoint(at.x, at.y);
  if (caret && el.contains(caret.offsetNode)) return { node: caret.offsetNode, offset: caret.offset };
  const box = el.getBoundingClientRect();
  const before = at.y < box.top || (at.y <= box.bottom && at.x < box.left);
  return { node: el, offset: before ? 0 : el.childNodes.length };
}

/** Selects the word at the caret, as a double click in the page does; at the end of a word, that word. Between words, the space there. */
function selectWord(selection: Selection, { node, offset }: { node: Node; offset: number }) {
  if (node.nodeType !== Node.TEXT_NODE) return selection.collapse(node, offset);
  const words = new Intl.Segmenter(undefined, { granularity: "word" }).segment((node as Text).data);
  let word = words.containing(offset);
  const before = offset > 0 ? words.containing(offset - 1) : undefined;
  if (before?.isWordLike && !word?.isWordLike) word = before;
  if (!word) return selection.collapse(node, offset);
  selection.setBaseAndExtent(node, word.index, node, word.index + word.segment.length);
}

/** Whether a layer is one of the tree's, not of one built before it. */
function inTree(tree: LayerTree, layer: Layer): boolean {
  return tree.layerOf(nodeOf(layer)) === layer;
}
