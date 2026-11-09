/** @jsxImportSource preact */
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { SavedOffCanvasLayer, OffCanvasSaveAnswer, SavedRound, Variable, VariableGroup } from "../service-protocol";
import type { Property, PropertyValues } from "./property-table";
import type { Camera } from "./camera";
import { CanvasView, type Tool } from "./CanvasView";
import { editorCommand, heldKey, historyKey, isEditable } from "./canvas-keys";
import { Icon } from "./icons";
import { FIELD_SETTLE_MS, TIP_DELAY_MS, TIP_GRACE_MS } from "./motion";
import { pointerHeld, watchHolds } from "./pointer-held";
import { createChangeSet, putBackBy, withDependents, type Change, type ChangeSet, type Created, type RangePart } from "./changeset";
import { createClipboard } from "./clipboard";
import type { Destination, Editor } from "./edit-commands";
import { createEditor } from "./edits";
import { createHistory } from "./undo-steps";
import { createOffCanvas, remake, type OffCanvasLayer, type OffCanvas } from "./off-canvas";
import { serializeCanvas, type Canvas } from "./freezer";
import { takeInApplied } from "./saved-round";
import { framedText, isOnlyText, nodeOf, type Layer, type LayerTree } from "./layers";
import { LayerInfo } from "./LayerInfo";
import { PanelResizer } from "./PanelResizer";
import { watchScrolled } from "./panel-scrolled";
import { fitWidths, maxWidth, readWidths, writeWidth, type Panel, type Widths } from "./panel-widths";
import { createFolds } from "./layer-folds";
import { LayerTreeView } from "./LayerTreeView";
import { Properties } from "./Properties";
import { BreakpointBadge } from "./BreakpointBadge";
import { BriefSection } from "./BriefSection";
import { breakpointName, contains, readMediaBreakpoints, type Breakpoint, type ProjectBreakpoints } from "./breakpoints";
import { promotedNote } from "./promote";
import { viewName } from "./ViewLabels";
import { ADJUSTING_MS, type View, type Views } from "./views";
import { hasPartsToRead } from "./range-parts";
import { toggleIn } from "./selection";
import { Toast, ToastProvider, type ShowToast, type ToastMessage } from "./Toast";
import { loadVariables } from "./service";
import { bind, bindRecorded, resolveVariables, withPart, type Catalog, type Resolved } from "./variables";
import { VariantsPanel } from "./VariantsPanel";
import { ChangeMarksProvider, changeMarks } from "./ChangeMarks";
import { CatalogProvider } from "./VariablePicker";

/** What the change list does to the round while edit mode is up: on the canvas, as edits. */
export interface RoundControl {
  /** Takes change `id` back out, as an edit that can be undone. */
  revert(id: number): void;
  /** What the page shows in each part of change `id`'s range, read (null: it could not be): kept with it, and saved at once. */
  partsRead(id: number, parts: RangePart[] | null): void;
  /** Takes every change back out and stops saving: the round is being discarded. */
  discard(): void;
  /** Saves now what is waiting to be saved: the round about to be claimed, or the canvas frozen afresh. */
  save(): void;
}

interface Props {
  /** Beside the Design panel's title: the way back to preview mode, and the changes so far. */
  controls: ComponentChildren;
  /** The round to come back to, canvas and ChangeSet; null to freeze the page afresh. */
  saved: SavedRound | null;
  /** The layers off the canvas to show beside it (ADR 0009). */
  offCanvas: SavedOffCanvasLayer[];
  /** The project's breakpoints from its Tailwind theme; null: those of the page's media queries, if any. */
  breakpoints: ProjectBreakpoints | null;
  /** The round, saved a moment after the last edit; null once it has no changes left. */
  onSave(round: SavedRound | null): void;
  /** The layers off the canvas, saved with the round, though no part of it. Answers with the JSX that writes each, as kept. */
  onSaveOffCanvas(layers: SavedOffCanvasLayer[]): Promise<OffCanvasSaveAnswer["snippets"]>;
  /** The round's changes, right after each edit. */
  onChanges(changes: Change[]): void;
  /** Set once there is a canvas, for the change list to reach it. */
  control: { current: RoundControl | null };
  /** At the canvas's bottom left: what happened outside as the code changed (ticket 78). */
  notice?: ComponentChildren;
  /** Frozen afresh in place of a canvas (ticket 78): the camera to start at, where it was. */
  startAt?: Camera | null;
  /** Kept up to date with where the camera is, for a canvas frozen afresh in this one's place. */
  cameraNow?: { current: Camera | null };
  /** Edit mode has ended; the shell goes once the canvas is back over the page. */
  leaving: boolean;
  /** False: switch modes instantly (the toggle was pressed from the keyboard). */
  animate: boolean;
  onLeft(): void;
}

/** How long after the last edit the round is saved. */
const AUTOSAVE_MS = 500;
/** Nudges of the same layers this close together are a run: one step, undone at once. */
const NUDGE_RUN_MS = 1000;
/** Which way each arrow key nudges. */
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Edit mode: layers on the left, the canvas in the middle, properties on the right. */
export function Shell({ controls, saved, offCanvas: savedOffCanvas, breakpoints, onSave, onSaveOffCanvas, onChanges, control, notice, startAt, cameraNow, leaving, animate, onLeft }: Props) {
  /**
   * Hidden at first: the editor often opens in a browser built into another app, where room is short. Hidden on every
   * entry, whether it was shown or hidden the last time; shown, it stays so until edit mode is left (designer,
   * 2026-11-08). Nothing kept for the next entry.
   */
  const [layersShown, setLayersShown] = useState(false);
  const layersToggle = useRef<HTMLButtonElement>(null);
  const toggledLayers = useRef(false);
  const showLayers = (shown: boolean) => {
    toggledLayers.current = true;
    setLayersShown(shown);
  };
  // The button pressed goes away with the panel: focus moves to the one that brings it back.
  useEffect(() => {
    if (toggledLayers.current) layersToggle.current?.focus();
  }, [layersShown]);

  /**
   * The panels' widths, each set by dragging its inner edge (designer, 2026-11-08): as the viewer set them last, and
   * as they fit the window, the canvas keeping its room between them.
   */
  const shell = useRef<HTMLDivElement>(null);
  const [chosenWidths, setChosenWidths] = useState<Widths>(readWidths);
  const [room, setRoom] = useState(() => innerWidth);
  useEffect(() => {
    const onResize = () => setRoom(innerWidth);
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);
  const widths = fitWidths(chosenWidths, room, layersShown);
  /**
   * Dragged: the width shows at once, on the shell's style alone; the shell renders anew once let go. Null: let go
   * where it began. The width held is kept here too: the shell renders anew mid-drag (the round's status, polled,
   * renders the editor layer), and the widths written after each render would put the panel back meanwhile.
   */
  const dragged = useRef<Partial<Widths>>({});
  const dragWidth = (panel: Panel) => (width: number | null) => {
    if (width === null) return void delete dragged.current[panel];
    dragged.current[panel] = width;
    shell.current?.style.setProperty(`--tk-${panel}-width`, `${width}px`);
  };
  const keepWidth = (panel: Panel) => (width: number) => {
    delete dragged.current[panel];
    setChosenWidths((was) => ({ ...was, [panel]: width }));
    writeWidth(panel, width);
  };
  // After every render, the widths as fitted, or as held: a drag wrote them on the style itself, which the style prop,
  // unchanged since, would not undo (a drag let go where it began, or the window resized meanwhile).
  useLayoutEffect(() => {
    shell.current?.style.setProperty("--tk-layers-width", `${dragged.current.layers ?? widths.layers}px`);
    shell.current?.style.setProperty("--tk-design-width", `${dragged.current.design ?? widths.design}px`);
  });

  /** The toast at the bottom of the canvas: a new one takes the old one's place. */
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toasts = useRef(0);
  const [showToast] = useState<ShowToast>(() => (text: string) => setToast({ text, key: ++toasts.current }));

  /** The tool picked, from the toolbar or the keyboard: null to select, or what the next drag draws. */
  const [tool, setTool] = useState<Tool>(null);
  /** The fill's picker is open on a gradient: its handles show on the canvas. */
  const [gradientPicker, setGradientPicker] = useState(false);
  /**
   * Playing: the canvas alone at full size, to see the changes as they will look (ADR 0010), from a
   * view's full screen button (designer, 2026-11-08). `width`: as wide as that view, null as wide as the window.
   */
  const [played, setPlayed] = useState<{ width: number | null } | null>(null);
  const playing = !!played;
  /**
   * The button that started playing, by its name: the view labels are not drawn while playing, so focus
   * goes back to the one drawn in its place once it stops.
   */
  const playedFrom = useRef<{ root: ParentNode; label: string } | null>(null);
  /** Playing has just stopped: focus goes back to the button that started it. */
  const refocusPlay = useRef(false);
  const play = (width: number | null, from: HTMLButtonElement) => {
    playedFrom.current = { root: from.getRootNode() as ParentNode, label: from.getAttribute("aria-label") ?? "" };
    refocusPlay.current = false;
    setPlayed({ width });
  };
  const stopPlaying = () => {
    refocusPlay.current = true;
    setPlayed(null);
  };
  useEffect(() => {
    if (playing || !refocusPlay.current) return;
    refocusPlay.current = false;
    const from = playedFrom.current;
    from?.root.querySelector<HTMLElement>(`button[aria-label="${CSS.escape(from.label)}"]`)?.focus();
  }, [playing]);

  /** Only the round there was on entering counts: saves along the way do not restore anything. */
  const [restoreFrom] = useState(saved);
  const [restoreOffCanvas] = useState(savedOffCanvas);
  const [tree, setTree] = useState<LayerTree | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  /** The project's Variables, asked for as edit mode opens; worked out on the canvas once there is one. */
  const [variables] = useState(loadVariables);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const catalogNow = useRef<Catalog | null>(null);
  /** The canvas's views, once there is a canvas. */
  const viewsNow = useRef<Views | null>(null);
  /** What the view at `breakpoint` is called ("Tablet"); its range in words when no view shows it now. */
  const viewAt = (breakpoint: Breakpoint) => {
    const view = viewsNow.current?.list().slice(1).find((v) => contains(breakpoint, v.width));
    return view ? viewName(view.width, false) : breakpointName(breakpoint);
  };
  /** The layers off the canvas, once there is a canvas to show them beside. Their edits share the canvas's history. */
  const [offCanvas, setOffCanvas] = useState<OffCanvas | null>(null);
  const [history] = useState(createHistory);
  /** Bumped as layers come off the canvas or go, move or change size. */
  const [, outsideChanged] = useReducer((n: number) => n + 1, 0);
  useEffect(() => offCanvas?.onChange(() => outsideChanged(undefined)), [offCanvas]);
  /** The layer off the canvas `layer` is in, if it is in one. */
  const outsideOf = (layer: Layer): OffCanvasLayer | null => offCanvas?.of(layer.el) ?? null;
  /** What edits the layer: the canvas's editor, or that of the layer off the canvas it is in. */
  const editorOf = (layer: Layer | undefined): Editor | null => (layer && outsideOf(layer)?.editor) || editor;
  /** The layers the layer is one of. */
  const treeOf = (layer: Layer | undefined): LayerTree | null => (layer && outsideOf(layer)?.editor.tree()) || tree;
  /** A layer off the canvas itself, rather than one in it. */
  const isOutside = (layer: Layer) => !layer.text && outsideOf(layer)?.layer()?.el === layer.el;
  /** In a layer made in the blank space off the canvas (ticket 106), which takes briefs as the canvas does: put back, it is made anew, briefs and all. */
  const inMadeOff = (layer: Layer) => !!outsideOf(layer)?.origin.made;
  /** The layer off the canvas itself, while it is there: what undoing or redoing a step to it leaves selected. */
  const itself = (outside: OffCanvasLayer) => () => [outside.layer()].filter((layer) => layer !== null);
  /** The layer as the layers are now: a move builds them anew. Null once it is gone. */
  const refind = (layer: Layer): Layer | null => editorOf(layer)?.tree().layerOf(nodeOf(layer)) ?? null;
  /** The view the designer works in, and what it is called: the panel shows its values, and edits apply at its breakpoint. Null: the desktop view. */
  const [worked, setWorked] = useState<{ view: View; name: string } | null>(null);
  /** The selected layers, the one selected last at the end. */
  const [selected, setSelected] = useState<Layer[]>([]);
  /**
   * Bumped on each edit that brings layers back as they were: an undo or redo, a deletion taken back from the
   * change list, a layer off the canvas put back. The Layers panel lists what one brings back as it was.
   */
  const [broughtBack, bringBack] = useReducer((n: number) => n + 1, 0);
  /** What the Layers panel remembers of its closed layers: kept here, as hiding the panel takes it away (ticket 74). */
  const [folds] = useState(createFolds);
  /** Bumped on each edit: the panel reads its values from the canvas. */
  const [, edited] = useReducer((n: number) => n + 1, 0);
  /** Values are being adjusted: the selection box steps aside so the change shows. */
  const [adjusting, setAdjusting] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  const round = useRef<{ canvas: Canvas; changeSet: ChangeSet; offCanvas: OffCanvas } | null>(null);
  /**
   * A value dragged is not marked while the press is held, and eases into the
   * accent once let go (designer, 2026-11-08): the round's changes as the press
   * began, and whether the fields are settling after it.
   */
  const heldFrom = useRef<Change[] | null>(null);
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    let done: ReturnType<typeof setTimeout> | undefined;
    const stop = watchHolds((held) => {
      const now = round.current?.changeSet.list() ?? [];
      // Copies: a change adjusted again is updated in place.
      if (held) return void (heldFrom.current = now.map((change) => ({ ...change })));
      const was = heldFrom.current ?? [];
      heldFrom.current = null;
      if (now.length === was.length && now.every((change, i) => change.id === was[i].id && change.after === was[i].after)) return;
      setSettling(true);
      clearTimeout(done);
      done = setTimeout(() => setSettling(false), FIELD_SETTLE_MS);
    });
    return () => {
      stop();
      clearTimeout(done);
    };
  }, []);
  const pendingSave = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestOnSave = useRef(onSave);
  latestOnSave.current = onSave;
  const latestOnSaveOffCanvas = useRef(onSaveOffCanvas);
  latestOnSaveOffCanvas.current = onSaveOffCanvas;
  /** Saves now what is waiting to be saved. */
  const flush = () => {
    if (pendingSave.current === undefined || !round.current) return;
    clearTimeout(pendingSave.current);
    pendingSave.current = undefined;
    const { canvas, changeSet, offCanvas } = round.current;
    latestOnSave.current(changeSet.list().length ? { canvas: serializeCanvas(canvas), changeSet: changeSet.save() } : null);
    saveOffCanvas(offCanvas);
  };
  /** The layers off the canvas as saved last: saved again only once they differ. */
  const savedOutside = useRef<string | null>(null);
  const saveOffCanvas = (offCanvas: OffCanvas) => {
    const layers = offCanvas.save();
    const json = JSON.stringify(layers);
    if (json === savedOutside.current) return;
    savedOutside.current = json;
    // Each keeps the JSX that writes it as the source had it: put back, it goes with it, though the source has it no more.
    void latestOnSaveOffCanvas.current(layers).then((snippets) => {
      for (const [id, snippet] of Object.entries(snippets)) {
        const outside = offCanvas.find(id);
        if (outside && outside.origin.snippet === undefined) outside.origin.snippet = snippet;
      }
    });
  };
  // Leaving edit mode saves at once, while the canvas is still there to save.
  useEffect(() => {
    if (leaving) flush();
  }, [leaving]);
  /** Edit mode is over: nothing is saved from here on. */
  const left = useRef(false);
  useEffect(
    () => () => {
      flush();
      control.current = null;
      left.current = true;
    },
    [],
  );

  /** The changes seen so far, by id: those of the round edit mode opened with, and those made since. A change at a breakpoint is marked for its parts to be read only as it is first seen, made (ticket 65). */
  const seenChanges = useRef(new Set<number>());
  /**
   * Marks each change made since the last edit at a breakpoint the project's
   * breakpoints cut into parts: the page is to be read in each part, the code
   * as it is (`parts` null). The editor layer reads it once the round is
   * saved, and `claim` waits for it.
   */
  const markParts = (changeSet: ChangeSet) => {
    const project = breakpoints ?? readMediaBreakpoints(document);
    for (const change of changeSet.list()) {
      if (seenChanges.current.has(change.id)) continue;
      seenChanges.current.add(change.id);
      if (change.parts === undefined && hasPartsToRead(change, project)) change.parts = null;
    }
  };

  /** The round changed: saved soon, and its changes told. */
  const changed = () => {
    clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(flush, AUTOSAVE_MS);
    if (round.current) {
      markParts(round.current.changeSet);
      onChanges(round.current.changeSet.list());
    }
  };
  /** An edit made: the panel and the Layers panel follow it; `adjust`, a value set, the selection box steps aside meanwhile. Resized by a handle, it stays. */
  /** Where a Variable of each group goes on `layer`, as the Variants list sets one: the property, and the part of it; none for spacing, which could be any of several. */
  const slotFor = (layer: Layer, group: VariableGroup): [Property, string] | null => {
    const editor = editorOf(layer);
    const at = ({ color: editor?.can(layer, "textColor") ? ["textColor", ""] : ["fill", "color"], radius: ["radius", ""], fontSize: ["fontSize", ""], shadow: ["shadows", ""] } as Partial<Record<VariableGroup, [Property, string]>>)[group];
    return at && editor?.can(layer, at[0]) ? at : null;
  };
  /** The groups a Variable picked in the Variants list can be set on every selected layer for, by what it sets there. */
  const takenBy = (layers: Layer[]) => {
    const names: Partial<Record<VariableGroup, string>> = { color: "Fill", radius: "corner radius", fontSize: "font size", shadow: "shadow" };
    return Object.fromEntries(Object.entries(names).filter(([group]) => layers.length && layers.every((layer) => slotFor(layer, group as VariableGroup)))) as Partial<Record<VariableGroup, string>>;
  };
  /** The Variables the layer selected alone has where the Variants list sets them. */
  const usedBy = (layers: Layer[]): Variable[] => {
    if (layers.length !== 1) return [];
    const [layer] = layers;
    const editor = editorOf(layer);
    return (["color", "radius", "fontSize", "shadow"] as VariableGroup[]).flatMap((group) => {
      const at = slotFor(layer, group);
      const bound = at && editor?.variables(layer, at[0])?.[at[1]];
      return bound ? [bound] : [];
    });
  };
  /** Sets the Variable picked in the Variants list on each selected layer, where it takes one of its group, as one edit. */
  const applyVariable = (entry: Resolved) => {
    const editor = editorOf(selected[0]);
    if (!editor) return;
    editor.batch(() => {
      for (const layer of selected) {
        const at = slotFor(layer, entry.variable.group);
        if (!at) continue;
        const [property, part] = at;
        const next = withPart(property, editor.read(layer, property), part, entry.drawn);
        if (next !== null) editor.set(layer, property, next as PropertyValues[Property], { variables: { [part]: entry.variable } });
      }
    });
    onEdit();
  };
  const onEdit = (adjust = true) => {
    // A move builds the layers anew: the selection is found again in them.
    const next = editor?.tree();
    if (next && next !== tree) setTree(next);
    setSelected((layers) => {
      const found = layers.map(refind).filter((layer) => layer !== null);
      return found.length === layers.length && found.every((layer, i) => layer === layers[i]) ? layers : found;
    });
    changed();
    edited(undefined);
    if (!adjust) return;
    setAdjusting(true);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setAdjusting(false), ADJUSTING_MS);
  };
  /** Selects the layers: those of one document only, the canvas or a layer off it, as the last of them is in. */
  const select = (layers: Layer[]) => {
    clearTimeout(settle.current);
    setAdjusting(false);
    const doc = layers.at(-1)?.el.ownerDocument;
    setSelected(layers.every((layer) => layer.el.ownerDocument === doc) ? layers : layers.filter((layer) => layer.el.ownerDocument === doc));
  };
  /**
   * A brief written on a layer of the canvas, or taken off: from the Design
   * panel, or beside a new Frame. Loose text gets an element of its own for
   * it, which is then selected; any other layer stays as selected.
   */
  const writeBrief = (layer: Layer, brief: string) => {
    const editor = editorOf(layer);
    if (!editor) return;
    const own = editor.setBrief(layer, brief);
    onEdit();
    if (own.el !== layer.el) select([own]);
  };
  /** ⇧A: the layers made a Stack, which is then selected. */
  const makeStack = (layers: Layer[]) => {
    const editor = editorOf(layers[0]);
    if (!editor?.canStack(layers)) return;
    const stack = editor.stack(layers);
    onEdit();
    select([stack]);
  };
  /** Delete: the layers deleted, and nothing selected. A layer off the canvas itself goes from there. */
  const remove = (layers: Layer[]) => {
    const editor = editorOf(layers[0]);
    if (!editor || !offCanvas) return;
    // Each deletion may build the layers anew: each layer is found again in them.
    editor.batch(() => {
      for (const layer of layers) {
        const outside = isOutside(layer) && outsideOf(layer);
        if (outside) {
          editor.along(() => offCanvas.take(outside), () => offCanvas.put(outside), itself(outside));
          continue;
        }
        const now = editor.tree().layerOf(nodeOf(layer));
        if (now && editor.canRemove(now)) editor.remove(now);
      }
    });
    onEdit();
    select([]);
  };
  /**
   * A layer dragged off the canvas, in `view`, let go with its top left at
   * `at` in the workspace (ADR 0009): on the page, it is deleted, every view
   * alike; off the canvas, it is as it looked in `view`, and is selected.
   * `copy`: a copy goes there, and the layer stays.
   */
  const moveOff = (layer: Layer, view: View, at: { x: number; y: number }, copy: boolean) => {
    if (!editor || !offCanvas || !editor.canRemove(layer)) return;
    const own = editor.ownElement(layer);
    const outside = offCanvas.moveOut(view.elementOf(own.el) ?? own.el, at, { ...editor.originOf(own), ...(copy && { copy: true as const }), at: new Date().toISOString() });
    editor.batch(() => {
      if (!copy) editor.remove(own, { offCanvas: outside.id });
      editor.along(() => offCanvas.put(outside), () => offCanvas.take(outside), itself(outside));
    });
    onEdit();
    // Kept at once: the local service reads the JSX that writes it as the source has it now, before the Agent may delete it.
    saveOffCanvas(offCanvas);
    const moved = outside.layer();
    select(moved ? [moved] : []);
  };
  /**
   * A Frame or text drawn with the tool in the blank space beside the views,
   * its top left at `at` in the workspace, `size` as drawn (none: clicked;
   * ticket 106): a layer off the canvas, no change of the round's, selected.
   * Returns it, and the view it is in, to type in.
   */
  const makeOff = (type: Created["type"], at: { x: number; y: number }, size: { width: number; height: number } | undefined) => {
    if (!offCanvas || !round.current) return null;
    const outside = offCanvas.make(type, at, size, round.current.canvas.document);
    onEdit();
    saveOffCanvas(offCanvas);
    const made = outside.layer()!;
    select([made]);
    return { layer: made, view: outside.view };
  };
  /** A layer off the canvas dragged elsewhere off it, its top left to `x` and `y`. */
  const placeOff = (outside: OffCanvasLayer, x: number, y: number) => {
    if (!editor || !offCanvas) return;
    const [fromX, fromY] = [outside.x, outside.y];
    editor.along(() => offCanvas.place(outside, x, y), () => offCanvas.place(outside, fromX, fromY), itself(outside));
    onEdit();
  };
  /**
   * A layer off the canvas let go over a view, at `to` there (ADR 0009): it is
   * back on the canvas, every view alike, and selected; off it, it is no more.
   */
  const putBack = (outside: OffCanvasLayer, to: Destination) => {
    const layer = outside.layer();
    if (!editor || !offCanvas || !layer) return;
    let back: Layer | null = null;
    // Moved off this round and not edited off it, it is the layer that was deleted, back as it was; any other is new.
    // Made in the blank space, it is made anew there, as one drawn there is (ticket 106).
    bringBack(undefined);
    let missed: Change[] = [];
    editor.batch(() => {
      if (outside.origin.made) ({ layer: back, missed } = remake(editor, outside, to));
      else back = editor.putBack({ el: layer.el, kept: outside.keep() }, to);
      editor.along(
        () => offCanvas.take(outside),
        () => offCanvas.put(outside),
        itself(outside),
      );
    });
    if (missed.length || (outside.origin.made && !back)) {
      // Not all of it could be made on the canvas: it stays off it, whole, and the bug is told.
      editor.undo();
      back = null;
      console.error("03Kind: a layer made off the canvas could not be put back; these of its edits could not be made on the canvas:", missed);
    }
    onEdit();
    select(back ? [back] : []);
  };
  /** ⌘D: each layer copied right after it, the copies selected. A layer off the canvas itself is not copied. */
  const duplicate = (layers: Layer[]) => {
    const editor = editorOf(layers[0]);
    if (!editor) return;
    const copies: Element[] = [];
    editor.batch(() => {
      for (const layer of layers) {
        const now = editor.tree().layerOf(nodeOf(layer));
        if (now && !isOutside(now) && editor.canDuplicate(now)) copies.push(editor.duplicate(now).el);
      }
    });
    onEdit();
    select(copies.map((el) => editor.tree().layerOf(el)).filter((layer) => layer !== null));
  };
  /** ⌥⇧A: the Stacks among the layers dissolved, the Frames they become selected. */
  const dissolve = (layers: Layer[]) => {
    const editor = editorOf(layers[0]);
    const stacks = editor ? layers.filter((layer) => editor.canUnstack(layer)) : [];
    if (!editor || !stacks.length) return;
    // Each dissolving builds the layers anew: each Stack is found again in them.
    editor.batch(() => stacks.forEach((stack) => editor.unstack(editor.tree().layerOf(stack.el) ?? stack)));
    onEdit();
    select(stacks.map((stack) => editor.tree().layerOf(stack.el)).filter((layer) => layer !== null));
  };

  /** The last nudge: when, and the layers nudged, as they are after it. */
  const lastNudge = useRef<{ at: number; layers: Layer[] } | null>(null);
  /**
   * The arrow keys: the layers nudged `dx` and `dy` px, as Figma does, and
   * still selected. Nudged again soon after, it is one step. A layer off the
   * canvas itself moves about the workspace, the layers in it with it.
   */
  const nudge = (layers: Layer[], dx: number, dy: number) => {
    const itself = layers.find(isOutside);
    const outside = itself && outsideOf(itself);
    if (outside) return placeOff(outside, outside.x + dx, outside.y + dy);
    const editor = editorOf(layers[0]);
    if (!editor) return;
    const now = performance.now();
    const last = lastNudge.current;
    const continues = !!last && now - last.at < NUDGE_RUN_MS && last.layers.length === layers.length && last.layers.every((layer, i) => nodeOf(layer) === nodeOf(layers[i]));
    const nudged = editor.nudge(layers, dx, dy, { continues });
    lastNudge.current = { at: now, layers: nudged };
    onEdit();
    select(nudged);
  };

  /** ⌘C / ⌘X / ⌘V, within the editor. */
  const clipboard = useMemo(() => (editor && round.current ? createClipboard(editor, round.current.changeSet) : null), [editor]);
  /** Layers on the canvas: the clipboard holds only those. */
  const onCanvas = (layers: Layer[]) => layers.every((layer) => !outsideOf(layer));
  /** ⌘C: whether there was anything to copy. */
  const copy = (layers: Layer[]) => onCanvas(layers) && !!clipboard?.copy(layers);
  /** ⌘X: whether there was anything to cut. Cut layers are gone, and nothing is selected. */
  const cut = (layers: Layer[]) => {
    if (!onCanvas(layers) || !clipboard?.cut(layers)) return false;
    onEdit();
    select([]);
    return true;
  };
  /** ⌘V: the layers pasted, selected. */
  const paste = (layers: Layer[]) => {
    const pasted = (onCanvas(layers) && clipboard?.paste(layers)) || [];
    if (!pasted.length) return false;
    onEdit();
    select(pasted);
    return true;
  };

  /** ⌘⇧G: each Stack or Frame taken away, its layers left where they are and selected. */
  const ungroup = (layers: Layer[]) => {
    const editor = editorOf(layers[0]);
    if (!editor) return;
    const out: (Element | Text)[] = [];
    editor.batch(() => {
      for (const layer of layers) {
        const now = editor.tree().layerOf(nodeOf(layer));
        // A layer off the canvas itself has no container to leave its layers in.
        if (now && !isOutside(now) && editor.canUngroup(now)) out.push(...editor.ungroup(now).map(nodeOf));
      }
    });
    if (!out.length) return;
    onEdit();
    select(out.map((node) => editor.tree().layerOf(node)).filter((layer) => layer !== null));
  };

  // While the pointer is held down on something that edits as it moves, no key edits (`heldKey`, ADR 0012),
  // wherever the focus is: no field or button gets the key, nor the browser when it is ignored. It is about
  // the pointer alone, so it holds playing or not, with an editor or not (none holds the pointer then).
  // Other listeners on the window still get it, as `stopPropagation` does not stop them: each checks `pointerHeld()`.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!pointerHeld()) return;
      const whileHeld = heldKey(event);
      if (whileHeld === "ignored") event.preventDefault();
      if (whileHeld !== "passes") event.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ⌘Z / ⇧⌘Z (Ctrl on other systems): through the edits in the order they were made (`historyKey`); held down, nothing.
  const latest = useRef({ editor, onEdit, changed, select, selected, makeStack, dissolve, remove, duplicate, ungroup, nudge, copy, cut, paste, playing });
  latest.current = { editor, onEdit, changed, select, selected, makeStack, dissolve, remove, duplicate, ungroup, nudge, copy, cut, paste, playing };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { editor, onEdit, select, playing } = latest.current;
      if (playing || !editor) return;
      const key = historyKey(event, { held: pointerHeld() });
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      if (key === "ignored") return;
      const redo = key === "redo";
      // One history for the canvas and the layers off it: whichever edit came last is undone.
      const steps = history.past.length;
      // Nudged next, it is a run of its own: the one undone or redone stays a step apart.
      lastNudge.current = null;
      const layers = redo ? editor.redo() : editor.undo();
      if (history.past.length === steps) return;
      bringBack(undefined);
      select(layers);
      onEdit();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // As in Figma: ⇧A makes the selected layers a Stack, ⌥⇧A dissolves the selected Stacks, ⌘⇧G ungroups them,
  // Delete deletes and ⌘D copies them, the arrow keys nudge them 1px (10px with ⇧); ⌘C, ⌘X and ⌘V copy, cut and paste.
  // Fields and dialogs keep their keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { selected, makeStack, dissolve, remove, duplicate, ungroup, nudge, copy, cut, paste, playing } = latest.current;
      const target = event.composedPath()[0];
      if (playing || pointerHeld() || isEditable(target) || (target instanceof Element && target.closest('[role="dialog"]'))) return;
      const command = event.metaKey || event.ctrlKey;
      const shortcut = editorCommand(event);
      // Only what the editor holds is pasted, and only when it holds something: the system clipboard is left alone.
      if (shortcut === "copy" || shortcut === "cut" || shortcut === "paste") {
        const done = shortcut === "paste" ? paste(selected) : selected.length > 0 && (shortcut === "cut" ? cut : copy)(selected);
        if (done) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (!selected.length) return;
      // By the letter typed; with ⌥, a Mac types another one, so by the key.
      const a = event.key.toLowerCase() === "a" || (event.altKey && event.code === "KeyA");
      let act: (() => void) | null = null;
      if (a && event.shiftKey && !command) act = () => (event.altKey ? dissolve(selected) : makeStack(selected));
      else if ((event.key === "Delete" || event.key === "Backspace") && !command && !event.altKey) act = () => remove(selected);
      else if (shortcut === "duplicate") act = () => duplicate(selected);
      else if (shortcut === "ungroup") act = () => ungroup(selected);
      else if (ARROWS[event.key] && !command && !event.altKey) {
        const [x, y] = ARROWS[event.key].map((n) => n * (event.shiftKey ? 10 : 1));
        act = () => nudge(selected, x, y);
      }
      if (!act) return;
      event.preventDefault();
      event.stopPropagation();
      act();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /** Layers selected: the Design panel shows their design; none, the project's Variables (designer, 2026-11-08). */
  const designing = !!(tree && editor && selected.length);
  return (
    <div
      ref={shell}
      class={`tk-shell${layersShown ? "" : " is-layers-hidden"}${playing ? " is-playing" : ""}`}
      style={{ "--tk-layers-width": `${widths.layers}px`, "--tk-design-width": `${widths.design}px` }}
    >
      {/*
        Keyed, the panels and the button keep their own elements: unkeyed, the Layers panel shown again took the Design
        panel's, and with them, stale, its header's rule and 6px under it: a rule across the Layers that Figma has not
        (designer, 2026-11-08). The Design panel was built anew besides.
      */}
      {layersShown ? (
        <aside key="layers" class="tk-panel is-layers" aria-label="Layers">
          <div class="tk-panel-header">
            <button ref={layersToggle} type="button" class="tk-icon-button" aria-label="Hide layers" aria-expanded="true" onClick={() => showLayers(false)}>
              <Icon name="sidebar" />
            </button>
            <h2 class="tk-panel-title">Layers</h2>
          </div>
          {tree && (
            <LayerTreeView
              tree={tree}
              offCanvas={offCanvas?.list().map((outside) => outside.editor.tree()) ?? []}
              selected={selected}
              folds={folds}
              broughtBack={broughtBack}
              onSelect={(layer, extend) => select(extend ? toggleIn(selected, layer) : [layer])}
            />
          )}
        </aside>
      ) : (
        <button key="show-layers" ref={layersToggle} type="button" class="tk-show-layers" aria-label="Show layers" aria-expanded="false" onClick={() => showLayers(true)}>
          <Icon name="sidebar" />
        </button>
      )}
      {layersShown && !playing && (
        <PanelResizer
          key="layers-edge"
          panel="layers"
          width={widths.layers}
          max={maxWidth("layers", widths, room, true)}
          onDrag={dragWidth("layers")}
          onCommit={keepWidth("layers")}
        />
      )}
      <CanvasView
        restoreFrom={restoreFrom?.canvas ?? null}
        startAt={startAt}
        cameraNow={cameraNow}
        // A round carried over (ticket 68): what was applied in the rounds before stays on the canvas, under what is left, as the page's own.
        takeIn={restoreFrom?.changeSet.applied?.length ? (doc) => takeInApplied(doc, restoreFrom.changeSet) : undefined}
        onCanvas={(views, workspace) => {
          const changeSet = createChangeSet(restoreFrom?.changeSet);
          // A round saved before opens as it was: changes in it the page has yet to be read for are read by the editor layer as it is.
          for (const change of changeSet.list()) seenChanges.current.add(change.id);
          viewsNow.current = views;
          // Edits go to the canvas, and show in every view of it; the layers are the canvas's, one across the views.
          // The views' ranges line up with the project's own breakpoints: its Tailwind theme's, or its media queries'.
          // A value is named by the Variable it is, once the Variables are in.
          const editor = createEditor(views, changeSet, breakpoints ?? readMediaBreakpoints(document), {
            history,
            bind: (...args) => (catalogNow.current ? bind(catalogNow.current, ...args) : undefined),
          });
          void variables.then((list) => {
            if (!list.length) return;
            catalogNow.current = resolveVariables(list, views.canvas.document);
            setCatalog(catalogNow.current);
            // Edits made before the Variables were in are named by them now, as their values were, and saved so.
            if (!left.current && round.current?.changeSet === changeSet && bindRecorded(catalogNow.current, changeSet)) latest.current.changed();
          });
          // Beside it, the layers off it, where they were left.
          const outside = createOffCanvas(workspace, restoreOffCanvas, history);
          savedOutside.current = JSON.stringify(outside.save());
          round.current = { canvas: views.canvas, changeSet, offCanvas: outside };
          setTree(editor.tree());
          setEditor(editor);
          setOffCanvas(outside);
          /**
           * Taking `changes` back: the layers they moved off the canvas are back on it, and so no longer off it;
           * those they put back onto it are off it again, as they were, unless moved off by them too.
           */
          const offAgain = (changes: Change[]) => {
            const out = new Set(changes.map((change) => change.offCanvas).filter((id) => id !== undefined));
            return {
              taken: [...out].map((id) => outside.find(id)).filter((found) => found !== null),
              brought: putBackBy(changes)
                .filter((kept) => !out.has(kept.id))
                .map((kept) => outside.find(kept.id) ?? outside.bring(kept)),
            };
          };
          control.current = {
            partsRead(id, parts) {
              const change = changeSet.list().find((change) => change.id === id);
              if (change?.parts !== null) return;
              if (parts) change.parts = parts;
              else delete change.parts;
              latest.current.changed();
              flush();
            },
            revert(id) {
              const going = withDependents(changeSet.list(), id);
              const { taken, brought } = offAgain(going);
              // A deletion taken back: the layer is back as it was before it was deleted.
              if (going.some((change) => change.kind === "delete")) bringBack(undefined);
              let reverted = false;
              editor.batch(() => {
                reverted = !!editor.revert(id);
                for (const found of taken) editor.along(() => outside.take(found), () => outside.put(found));
                for (const found of brought) editor.along(() => outside.put(found), () => outside.take(found));
              });
              if (reverted || taken.length || brought.length) latest.current.onEdit();
            },
            discard() {
              const { taken, brought } = offAgain(changeSet.list());
              for (const change of changeSet.list()) editor.revert(change.id);
              for (const found of brought) outside.put(found);
              for (const found of taken) outside.take(found);
              clearTimeout(pendingSave.current);
              pendingSave.current = undefined;
              round.current = null;
              // The round goes; the layers off the canvas stay, but those it moved out, and those it put back are there again.
              if (taken.length || brought.length) saveOffCanvas(outside);
              edited(undefined);
            },
            save: flush,
          };
        }}
        offCanvas={offCanvas}
        onMoveOff={moveOff}
        onPlaceOff={placeOff}
        onPutBack={putBack}
        onMakeOff={makeOff}
        tree={tree}
        selected={selected}
        hideSelection={adjusting}
        onSelect={select}
        editor={editor}
        onMove={(layer: Layer, to: Destination) => {
          const moved = editorOf(layer)!.move(layer, to);
          onEdit();
          select([moved]);
        }}
        onResize={(layer, to, continues, at) => {
          // The whole of a layer off the canvas, resized from its left or top: its top left goes with it, one step (ticket 107).
          const outside = at && offCanvas ? outsideOf(layer) : null;
          const [x, y] = outside ? [outside.x, outside.y] : [0, 0];
          const along = outside && at && (Math.round(at.x) !== x || Math.round(at.y) !== y) ? { make: () => offCanvas!.place(outside, at.x, at.y), unmake: () => offCanvas!.place(outside, x, y) } : undefined;
          editorOf(layer)!.resize(layer, to, { continues, along });
          onEdit(false);
        }}
        onCancelResize={(layer) => {
          editorOf(layer)!.takeBack();
          onEdit(false);
        }}
        gradientHandles={gradientPicker}
        // As a resize: dragged on the canvas, the selection stays.
        onFillEdited={() => onEdit(false)}
        tool={tool}
        onTool={setTool}
        onDuplicate={(layer: Layer, to: Destination) => {
          const copy = editorOf(layer)!.duplicate(layer, to);
          onEdit();
          select([copy]);
        }}
        onCreate={(type, to, size) => {
          const layer = editorOf(to.parent)!.create(type, to, size);
          onEdit();
          select([layer]);
          return layer;
        }}
        onSetBrief={writeBrief}
        onPromote={(layer) => {
          if (!editor?.canPromote(layer)) return;
          const { promoted, stays } = editor.promote(layer);
          onEdit();
          // What stays with the usage, and why, so the designer is not left wondering.
          const note = promotedNote(promoted.length, layer.chain[0]?.component ?? "its component", stays, viewAt);
          if (note) showToast(note);
        }}
        onBeginText={(layer) => {
          const own = editorOf(layer)!.typedIn(layer);
          // Loose text got an element of its own: the layers are built anew (those off the canvas are read as they are).
          if (own !== layer) setTree(editor!.tree());
          select([own]);
          return own;
        }}
        onEditText={(layer, text) => {
          const editor = editorOf(layer)!;
          /** The layer typed in, as the layers are now: a Frame's only text is found by its Frame. */
          const found = () => {
            const now = editor.tree().layerOf(layer.el);
            return now && isOnlyText(layer) ? (framedText(now) ?? now) : now;
          };
          editor.setText(found() ?? layer, text);
          onEdit();
          const now = found();
          if (now) select([now]);
        }}
        onWorkIn={(view, name) => {
          editor?.at(view);
          setWorked(view && { view, name });
        }}
        playing={playing}
        playedWidth={played?.width ?? null}
        onPlay={play}
        onStopPlaying={stopPlaying}
        leaving={leaving}
        animate={animate}
        changed={!!round.current?.changeSet.list().length}
        onLeft={onLeft}
      />
      <Tools tool={tool} onTool={setTool} />
      <Toast message={toast} />
      {notice}
      {!playing && (
        <PanelResizer
          key="design-edge"
          panel="design"
          width={widths.design}
          max={maxWidth("design", widths, room, layersShown)}
          onDrag={dragWidth("design")}
          onCommit={keepWidth("design")}
        />
      )}
      <aside key="design" class={`tk-panel is-design${settling ? " is-settling" : ""}`} aria-label="Design">
        <div ref={watchPanelScrolled} class="tk-panel-header">
          {/* No tabs (designer, 2026-11-08): with nothing selected, the project's Variables, as Figma's panel shows the page's; with layers selected, their design. */}
          {/* In the Layers' title's type: one header style for both panels (designer, 2026-11-08). */}
          <h2 class="tk-panel-title">{designing ? "Design" : "Variants"}</h2>
          {controls}
        </div>
        {!designing ? (
          <VariantsPanel catalog={catalog} takes={takenBy(selected)} inUse={usedBy(selected)} onApply={applyVariable} />
        ) : (
          <>
            <LayerInfo
              tree={treeOf(selected[0])!}
              layers={selected}
              // Off the canvas, a layer has no breakpoints: its look is frozen, at no width.
              badge={!outsideOf(selected[0]) && <BreakpointBadge editor={editor} layers={selected} view={worked?.name ?? "Desktop"} />}
            />
            {/* The Design panel's short notes show in the toast. */}
            <ToastProvider value={showToast}>
              <CatalogProvider value={catalog}>
                <ChangeMarksProvider value={changeMarks(round.current?.changeSet.list() ?? [], editorOf(selected[0])!, selected, onEdit, heldFrom.current)}>
                <Properties
                  editor={editorOf(selected[0])!}
                  layers={selected}
                  onEdit={onEdit}
                  onStack={() => makeStack(selected)}
                  onDissolve={() => dissolve(selected)}
                  onGradientPicker={setGradientPicker}
                />
                </ChangeMarksProvider>
              </CatalogProvider>
            </ToastProvider>
            {/* A brief is on one layer of the canvas at a time; off the canvas, a layer moved out is kept as it looks, one made in the blank space takes briefs. */}
            {selected.length === 1 && (!outsideOf(selected[0]) || inMadeOff(selected[0])) && (
              <BriefSection editor={editorOf(selected[0])!} layer={selected[0]} onChange={(brief) => writeBrief(selected[0], brief)} />
            )}
          </>
        )}
      </aside>
      {playing && (
        <button type="button" class="tk-stop-playing" aria-label="Stop playing" data-tk-tip="Back to editing (Esc)" onClick={stopPlaying}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

const TOOLS = [
  { tool: null, label: "Select", key: "V", icon: "pointer" },
  { tool: "frame", label: "Frame", key: "F", icon: "frame" },
  { tool: "text", label: "Text", key: "T", icon: "text" },
] as const;

interface ToolsProps {
  tool: Tool;
  onTool(tool: Tool): void;
}

/**
 * At the top right of the canvas, by the Design panel: the tools, as V, F and T pick them too. The chosen one is raised
 * on a backing of its own, which slides to a tool clicked and jumps to one a key picks (designer, 2026-11-08).
 * A tool pointed at or focused tells its name and key in the editor's dark tip, at the toolbar's left, level with it,
 * in place of the browser's gray one (designer, 2026-11-08).
 */
function Tools({ tool, onTool }: ToolsProps) {
  // The tool last clicked, until the choice changes; whether that change slides is kept until the next one, so a
  // render meanwhile doesn't take the transition off halfway. On the first render nothing has changed: no slide.
  const clicked = useRef<Tool | undefined>(undefined);
  const placedAt = useRef(tool);
  const sliding = useRef(false);
  if (tool !== placedAt.current) {
    sliding.current = clicked.current === tool;
    placedAt.current = tool;
    clicked.current = undefined;
  }
  const index = TOOLS.findIndex((t) => t.tool === tool);
  /**
   * The tool told, the middle of its button from the toolbar's top, whether it eases in, and whether focus showed it.
   * The pointer rests on a tool `TIP_DELAY_MS` before its tip shows, easing in; passing over shows nothing. Once one shows,
   * the toolbar is warm: another tool pointed at swaps the tip at once, text and place, without motion, and so within
   * `TIP_GRACE_MS` of the pointer leaving the toolbar. Focus from the keyboard shows it at once; a press hides it, and the next
   * tool pointed at, still warm, shows at once (designer, 2026-11-08). A touch shows nothing.
   */
  const [tip, setTip] = useState<{ text: string; middle: number; easing: boolean; byFocus: boolean } | null>(null);
  const waiting = useRef<number | undefined>(undefined);
  const cooling = useRef<number | undefined>(undefined);
  const warm = useRef(false);
  useEffect(
    () => () => {
      clearTimeout(waiting.current);
      clearTimeout(cooling.current);
    },
    [],
  );
  const tipOf = (t: (typeof TOOLS)[number], button: HTMLElement, easing: boolean, byFocus: boolean) => ({
    text: `${t.label} (${t.key})`,
    middle: button.offsetTop + button.offsetHeight / 2,
    easing,
    byFocus,
  });
  return (
    <div
      class="tk-tools"
      role="toolbar"
      aria-label="Tools"
      // Back on the toolbar, a gap or its edge too, within the grace: still warm.
      onPointerEnter={() => clearTimeout(cooling.current)}
      onPointerLeave={() => {
        clearTimeout(waiting.current);
        // A tip the keyboard's focus shows stays with the focus.
        setTip((shown) => (shown?.byFocus ? shown : null));
        if (!warm.current) return;
        clearTimeout(cooling.current);
        cooling.current = window.setTimeout(() => (warm.current = false), TIP_GRACE_MS);
      }}
    >
      <div class={sliding.current ? "tk-tools-backing is-sliding" : "tk-tools-backing"} style={{ "--tk-tool-index": index }} aria-hidden="true" />
      {TOOLS.map((t) => (
        <button
          key={t.label}
          type="button"
          class="tk-icon-button"
          aria-label={t.label}
          aria-pressed={tool === t.tool}
          aria-keyshortcuts={t.key}
          onPointerEnter={(event) => {
            if (event.pointerType === "touch") return;
            clearTimeout(waiting.current);
            const button = event.currentTarget;
            if (warm.current || tip) {
              clearTimeout(cooling.current);
              warm.current = true;
              setTip(tipOf(t, button, false, false));
              return;
            }
            waiting.current = window.setTimeout(() => {
              warm.current = true;
              setTip(tipOf(t, button, true, false));
            }, TIP_DELAY_MS);
          }}
          // Off a tool before its tip shows, the wait ends; a tip shown stays till the next tool or the toolbar left.
          onPointerLeave={() => clearTimeout(waiting.current)}
          onFocus={(event) => {
            // A click focuses too, but only the keyboard's focus tells.
            if (!event.currentTarget.matches(":focus-visible")) return;
            clearTimeout(waiting.current);
            setTip(tipOf(t, event.currentTarget, false, true));
          }}
          onBlur={() => setTip((shown) => (shown?.byFocus ? null : shown))}
          onClick={() => {
            clearTimeout(waiting.current);
            setTip(null);
            clicked.current = t.tool;
            onTool(t.tool);
          }}
        >
          <Icon name={t.icon} />
        </button>
      ))}
      {tip && (
        <div class={tip.easing ? "tk-variants-tip tk-tools-tip is-easing" : "tk-variants-tip tk-tools-tip"} role="tooltip" style={{ top: `${tip.middle}px` }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

/** The Design panel, its scrolling watched: its header's ref is called again on every render. */
const watchedPanels = new WeakSet<Element>();

/** The Design panel's header: the panel scrolls under it (`watchScrolled`). The Layers' tree watches its own scrolling. */
function watchPanelScrolled(header: HTMLElement | null) {
  const panel = header?.parentElement;
  if (!panel || watchedPanels.has(panel)) return;
  watchedPanels.add(panel);
  watchScrolled(panel, panel);
}

