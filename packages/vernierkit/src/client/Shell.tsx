/** @jsxImportSource preact */
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { SavedOffCanvasLayer, OffCanvasSaveAnswer, SavedRound } from "../service-protocol";
import { CanvasView, isEditable, type Tool } from "./CanvasView";
import { Icon } from "./icons";
import { createChangeSet, putBackBy, withDependents, type Change, type ChangeSet } from "./changeset";
import { createClipboard } from "./clipboard";
import { createEditor, createHistory, type Destination, type Editor } from "./edits";
import { createOffCanvas, type OffCanvasLayer, type OffCanvas } from "./off-canvas";
import { serializeCanvas, type Canvas } from "./freezer";
import { isOnlyText, nodeOf, onlyTextOf, type Layer, type LayerTree } from "./layers";
import { LayerInfo } from "./LayerInfo";
import { LayerTreeView } from "./LayerTreeView";
import { Properties } from "./Properties";
import { BreakpointSection } from "./BreakpointSection";
import { BriefSection } from "./BriefSection";
import { breakpointName, contains, readMediaBreakpoints, type Breakpoint, type ProjectBreakpoints } from "./breakpoints";
import { promotedNote } from "./promote";
import { viewName } from "./ViewLabels";
import type { View, Views } from "./views";
import { toggleIn } from "./selection";
import { Toast, ToastProvider, type ShowToast, type ToastMessage } from "./Toast";
import { loadVariables } from "./service";
import { bind, bindRecorded, resolveVariables, type Catalog } from "./variables";
import { CatalogProvider } from "./VariablePicker";

const LAYERS_KEY = "vernierkit:layers-panel";

/** What the change list does to the round while edit mode is up: on the canvas, as edits. */
export interface RoundControl {
  /** Takes change `id` back out, as an edit that can be undone. */
  revert(id: number): void;
  /** Takes every change back out and stops saving: the round is being discarded. */
  discard(): void;
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
  /** Edit mode has ended; the shell goes once the canvas is back over the page. */
  leaving: boolean;
  /** False: switch modes instantly (the toggle was pressed from the keyboard). */
  animate: boolean;
  onLeft(): void;
}

/** How long after the last edit the selection box comes back. */
const ADJUSTING_MS = 200;
/** How long after the last edit the round is saved. */
const AUTOSAVE_MS = 500;
/** Nudges of the same layers this close together are a run: one step, undone at once. */
const NUDGE_RUN_MS = 1000;
/** Which way each arrow key nudges. */
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Edit mode: layers on the left, the canvas in the middle, properties on the right. */
export function Shell({ controls, saved, offCanvas: savedOffCanvas, breakpoints, onSave, onSaveOffCanvas, onChanges, control, leaving, animate, onLeft }: Props) {
  /** Hidden at first: the editor often opens in a browser built into another app, where room is short. */
  const [layersShown, setLayersShown] = useState(readLayersShown);
  const layersToggle = useRef<HTMLButtonElement>(null);
  const toggledLayers = useRef(false);
  const showLayers = (shown: boolean) => {
    toggledLayers.current = true;
    setLayersShown(shown);
    writeLayersShown(shown);
  };
  // The button pressed goes away with the panel: focus moves to the one that brings it back.
  useEffect(() => {
    if (toggledLayers.current) layersToggle.current?.focus();
  }, [layersShown]);

  /** The toast at the bottom of the canvas: a new one takes the old one's place. */
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toasts = useRef(0);
  const [showToast] = useState<ShowToast>(() => (text: string) => setToast({ text, key: ++toasts.current }));

  /** The tool picked, from the toolbar or the keyboard: null to select, or what the next drag draws. */
  const [tool, setTool] = useState<Tool>(null);
  /** Playing: the canvas alone at full size, to see the changes as they will look (ADR 0010). */
  const [playing, setPlaying] = useState(false);
  const playButton = useRef<HTMLButtonElement>(null);
  /** Playing has just stopped: focus goes back to the button that started it. */
  const refocusPlay = useRef(false);
  const play = (on: boolean) => {
    refocusPlay.current = !on;
    setPlaying(on);
  };
  useEffect(() => {
    if (!playing && refocusPlay.current) playButton.current?.focus();
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
  /** The layer off the canvas itself, while it is there: what undoing or redoing a step to it leaves selected. */
  const itself = (outside: OffCanvasLayer) => () => [outside.layer()].filter((layer) => layer !== null);
  /** The layer as the layers are now: a move builds them anew. Null once it is gone. */
  const refind = (layer: Layer): Layer | null => editorOf(layer)?.tree().layerOf(nodeOf(layer)) ?? null;
  /** The view the designer works in, and what it is called: the panel shows its values, and edits apply at its breakpoint. Null: the desktop view. */
  const [worked, setWorked] = useState<{ view: View; name: string } | null>(null);
  /** The selected layers, the one selected last at the end. */
  const [selected, setSelected] = useState<Layer[]>([]);
  /** Bumped on each edit: the panel reads its values from the canvas. */
  const [, edited] = useReducer((n: number) => n + 1, 0);
  /** Values are being adjusted: the selection box steps aside so the change shows. */
  const [adjusting, setAdjusting] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  const round = useRef<{ canvas: Canvas; changeSet: ChangeSet; offCanvas: OffCanvas } | null>(null);
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

  /** The round changed: saved soon, and its changes told. */
  const changed = () => {
    clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(flush, AUTOSAVE_MS);
    if (round.current) onChanges(round.current.changeSet.list());
  };
  const onEdit = () => {
    // A move builds the layers anew: the selection is found again in them.
    const next = editor?.tree();
    if (next && next !== tree) setTree(next);
    setSelected((layers) => {
      const found = layers.map(refind).filter((layer) => layer !== null);
      return found.length === layers.length && found.every((layer, i) => layer === layers[i]) ? layers : found;
    });
    changed();
    edited(undefined);
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
    editor.batch(() => {
      back = editor.putBack({ el: layer.el, kept: outside.keep() }, to);
      editor.along(
        () => offCanvas.take(outside),
        () => offCanvas.put(outside),
        itself(outside),
      );
    });
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

  // ⌘Z / ⇧⌘Z (Ctrl on other systems): through the edits in the order they were made. A field keeps its own
  // while something typed in it is not applied yet; a field of the Design panel otherwise passes it on.
  const latest = useRef({ editor, onEdit, changed, select, selected, makeStack, dissolve, remove, duplicate, ungroup, nudge, copy, cut, paste, playing });
  latest.current = { editor, onEdit, changed, select, selected, makeStack, dissolve, remove, duplicate, ungroup, nudge, copy, cut, paste, playing };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { editor, onEdit, select, playing } = latest.current;
      if (playing) return;
      const target = event.composedPath()[0];
      // A panel field with nothing typed in it, or a slider: ⌘Z is the editor's.
      const field =
        target instanceof HTMLElement &&
        ((target.classList.contains("vk-input") && !target.hasAttribute("data-vk-typing")) || target.getAttribute("role") === "slider");
      if (!editor || !(event.metaKey || event.ctrlKey) || event.altKey || (isEditable(target) && !field)) return;
      // By the letter typed, wherever the keyboard has it.
      const key = event.key.toLowerCase();
      const redo = key === "y" ? !event.metaKey && !event.shiftKey : key === "z" && event.shiftKey;
      if (key !== "z" && !redo) return;
      event.preventDefault();
      event.stopPropagation();
      // One history for the canvas and the layers off it: whichever edit came last is undone.
      const steps = history.past.length;
      // Nudged next, it is a run of its own: the one undone or redone stays a step apart.
      lastNudge.current = null;
      const layers = redo ? editor.redo() : editor.undo();
      if (history.past.length === steps) return;
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
      if (playing || isEditable(target) || (target instanceof Element && target.closest('[role="dialog"]'))) return;
      const command = event.metaKey || event.ctrlKey;
      const letter = event.key.toLowerCase();
      // Only what the editor holds is pasted, and only when it holds something: the system clipboard is left alone.
      if (command && !event.shiftKey && !event.altKey && ["c", "x", "v"].includes(letter)) {
        const done = letter === "v" ? paste(selected) : selected.length > 0 && (letter === "x" ? cut : copy)(selected);
        if (done) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (!selected.length) return;
      // By the letter typed; with ⌥, a Mac types another one, so by the key.
      const a = letter === "a" || (event.altKey && event.code === "KeyA");
      let act: (() => void) | null = null;
      if (a && event.shiftKey && !command) act = () => (event.altKey ? dissolve(selected) : makeStack(selected));
      else if ((event.key === "Delete" || event.key === "Backspace") && !command && !event.altKey) act = () => remove(selected);
      else if (letter === "d" && command && !event.shiftKey && !event.altKey) act = () => duplicate(selected);
      else if (letter === "g" && command && event.shiftKey && !event.altKey) act = () => ungroup(selected);
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

  return (
    <div class={`vk-shell${layersShown ? "" : " is-layers-hidden"}${playing ? " is-playing" : ""}`}>
      {layersShown ? (
        <aside class="vk-panel is-layers" aria-label="Layers">
          <div class="vk-panel-header">
            <h2 class="vk-panel-title">Layers</h2>
            <button ref={layersToggle} type="button" class="vk-icon-button" aria-label="Hide layers" aria-expanded="true" onClick={() => showLayers(false)}>
              <Icon name="sidebar" />
            </button>
          </div>
          {tree && (
            <LayerTreeView
              tree={tree}
              offCanvas={offCanvas?.list().map((outside) => outside.editor.tree()) ?? []}
              selected={selected}
              onSelect={(layer, extend) => select(extend ? toggleIn(selected, layer) : [layer])}
            />
          )}
        </aside>
      ) : (
        <button ref={layersToggle} type="button" class="vk-show-layers" aria-label="Show layers" aria-expanded="false" onClick={() => showLayers(true)}>
          <Icon name="sidebar" />
        </button>
      )}
      <CanvasView
        restoreFrom={restoreFrom?.canvas ?? null}
        onCanvas={(views, workspace) => {
          const changeSet = createChangeSet(restoreFrom?.changeSet);
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
            revert(id) {
              const { taken, brought } = offAgain(withDependents(changeSet.list(), id));
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
          };
        }}
        offCanvas={offCanvas}
        onMoveOff={moveOff}
        onPlaceOff={placeOff}
        onPutBack={putBack}
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
          // A Frame's only text is typed in the Frame's own element.
          const own = isOnlyText(layer) ? layer : editorOf(layer)!.ownElement(layer);
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
            return now && isOnlyText(layer) ? (onlyTextOf(now) ?? now) : now;
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
        onStopPlaying={() => play(false)}
        leaving={leaving}
        animate={animate}
        changed={!!round.current?.changeSet.list().length}
        onLeft={onLeft}
      />
      <Tools tool={tool} onTool={setTool} />
      <Toast message={toast} />
      <aside class="vk-panel is-design" aria-label="Design">
        <div class="vk-panel-header">
          <h2 class="vk-panel-title">Design</h2>
          {tree && (
            <button ref={playButton} type="button" class="vk-icon-button vk-play" aria-label="Play" title="Play at full size" onClick={() => play(true)}>
              <Icon name="play" />
            </button>
          )}
          {controls}
        </div>
        {tree && editor && selected.length ? (
          <>
            <LayerInfo tree={treeOf(selected[0])!} layers={selected} />
            {/* Off the canvas, a layer has no breakpoints: its look is frozen, at no width. */}
            {!outsideOf(selected[0]) && <BreakpointSection editor={editor} layers={selected} view={worked?.name ?? "Desktop"} onEdit={onEdit} />}
            {/* The Design panel's short notes show in the toast. */}
            <ToastProvider value={showToast}>
              <CatalogProvider value={catalog}>
                <Properties editor={editorOf(selected[0])!} layers={selected} onEdit={onEdit} onStack={() => makeStack(selected)} onDissolve={() => dissolve(selected)} />
              </CatalogProvider>
            </ToastProvider>
            {/* A brief is on one layer of the canvas at a time; off the canvas, a layer is kept as it looks. */}
            {selected.length === 1 && !outsideOf(selected[0]) && <BriefSection editor={editor} layer={selected[0]} onChange={(brief) => writeBrief(selected[0], brief)} />}
          </>
        ) : (
          <p class="vk-panel-empty">Select a layer to see its properties.</p>
        )}
      </aside>
      {playing && (
        <button type="button" class="vk-stop-playing" aria-label="Stop playing" title="Back to editing (Esc)" onClick={() => play(false)}>
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

/** At the top right of the canvas, by the Design panel: the tools, as V, F and T pick them too. */
function Tools({ tool, onTool }: ToolsProps) {
  return (
    <div class="vk-tools" role="toolbar" aria-label="Tools">
      {TOOLS.map((t) => (
        <button key={t.label} type="button" class="vk-icon-button" aria-label={t.label} aria-pressed={tool === t.tool} title={`${t.label} (${t.key})`} onClick={() => onTool(t.tool)}>
          <Icon name={t.icon} />
        </button>
      ))}
    </div>
  );
}

function readLayersShown(): boolean {
  try {
    return localStorage.getItem(LAYERS_KEY) === "shown";
  } catch {
    return false;
  }
}

function writeLayersShown(shown: boolean) {
  try {
    localStorage.setItem(LAYERS_KEY, shown ? "shown" : "hidden");
  } catch {}
}
