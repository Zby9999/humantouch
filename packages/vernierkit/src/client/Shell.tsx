/** @jsxImportSource preact */
import type { ComponentChildren } from "preact";
import { useEffect, useReducer, useRef, useState } from "preact/hooks";
import type { SavedRound } from "../service-protocol";
import { CanvasView, isEditable } from "./CanvasView";
import { Icon } from "./icons";
import { canPreview } from "./change-preview";
import { createChangeSet, type Change, type ChangeSet } from "./changeset";
import { createEditor, type Destination, type Editor } from "./edits";
import { serializeCanvas, type Canvas } from "./freezer";
import { buildLayerTree, nodeOf, type Layer, type LayerTree } from "./layers";
import { LayerInfo } from "./LayerInfo";
import { LayerTreeView } from "./LayerTreeView";
import { Properties } from "./Properties";
import { toggleIn } from "./selection";

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
  /** The round, saved a moment after the last edit; null once it has no changes left. */
  onSave(round: SavedRound | null): void;
  /** The round's changes, right after each edit. */
  onChanges(changes: Change[]): void;
  /** Set once there is a canvas, for the change list to reach it. */
  control: { current: RoundControl | null };
  /** The Change Preview is on: back in preview mode, the page shows the changes it can. */
  previewing: boolean;
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

/** Edit mode: layers on the left, the canvas in the middle, properties on the right. */
export function Shell({ controls, saved, onSave, onChanges, control, previewing, leaving, animate, onLeft }: Props) {
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

  /** Only the round there was on entering counts: saves along the way do not restore anything. */
  const [restoreFrom] = useState(saved);
  const [tree, setTree] = useState<LayerTree | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  /** The selected layers, the one selected last at the end. */
  const [selected, setSelected] = useState<Layer[]>([]);
  /** Bumped on each edit: the panel reads its values from the canvas. */
  const [, edited] = useReducer((n: number) => n + 1, 0);
  /** Values are being adjusted: the selection box steps aside so the change shows. */
  const [adjusting, setAdjusting] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  const round = useRef<{ canvas: Canvas; changeSet: ChangeSet } | null>(null);
  const pendingSave = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestOnSave = useRef(onSave);
  latestOnSave.current = onSave;
  /** Saves now what is waiting to be saved. */
  const flush = () => {
    if (pendingSave.current === undefined || !round.current) return;
    clearTimeout(pendingSave.current);
    pendingSave.current = undefined;
    const { canvas, changeSet } = round.current;
    latestOnSave.current(changeSet.list().length ? { canvas: serializeCanvas(canvas), changeSet: changeSet.save() } : null);
  };
  // Leaving edit mode saves at once, while the canvas is still there to save.
  useEffect(() => {
    if (leaving) flush();
  }, [leaving]);
  useEffect(
    () => () => {
      flush();
      control.current = null;
    },
    [],
  );

  const onEdit = () => {
    // A move builds the layers anew: the selection is found again in them.
    const next = editor?.tree();
    if (next && next !== tree) {
      setTree(next);
      setSelected((layers) => layers.map((layer) => next.layerOf(nodeOf(layer))).filter((layer) => layer !== null));
    }
    clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(flush, AUTOSAVE_MS);
    if (round.current) onChanges(round.current.changeSet.list());
    edited(undefined);
    setAdjusting(true);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setAdjusting(false), ADJUSTING_MS);
  };
  const select = (layers: Layer[]) => {
    clearTimeout(settle.current);
    setAdjusting(false);
    setSelected(layers);
  };
  /** ⇧A: the layers made a Stack, which is then selected. */
  const makeStack = (layers: Layer[]) => {
    if (!editor?.canStack(layers)) return;
    const stack = editor.stack(layers);
    onEdit();
    select([stack]);
  };
  /** Delete: the layers deleted, and nothing selected. */
  const remove = (layers: Layer[]) => {
    if (!editor) return;
    // Each deletion may build the layers anew: each layer is found again in them.
    editor.batch(() => {
      for (const layer of layers) {
        const now = editor.tree().layerOf(nodeOf(layer));
        if (now && editor.canRemove(now)) editor.remove(now);
      }
    });
    onEdit();
    select([]);
  };
  /** ⌘D: each layer copied right after it, the copies selected. */
  const duplicate = (layers: Layer[]) => {
    if (!editor) return;
    const copies: Element[] = [];
    editor.batch(() => {
      for (const layer of layers) {
        const now = editor.tree().layerOf(nodeOf(layer));
        if (now && editor.canDuplicate(now)) copies.push(editor.duplicate(now).el);
      }
    });
    onEdit();
    select(copies.map((el) => editor.tree().layerOf(el)).filter((layer) => layer !== null));
  };
  /** ⌥⇧A: the Stacks among the layers dissolved, the Frames they become selected. */
  const dissolve = (layers: Layer[]) => {
    const stacks = editor ? layers.filter((layer) => editor.canUnstack(layer)) : [];
    if (!editor || !stacks.length) return;
    // Each dissolving builds the layers anew: each Stack is found again in them.
    editor.batch(() => stacks.forEach((stack) => editor.unstack(editor.tree().layerOf(stack.el) ?? stack)));
    onEdit();
    select(stacks.map((stack) => editor.tree().layerOf(stack.el)).filter((layer) => layer !== null));
  };

  // ⌘Z / ⇧⌘Z (Ctrl on other systems): through the edits in the order they were made. A field keeps its own
  // while something typed in it is not applied yet; a field of the Design panel otherwise passes it on.
  const latest = useRef({ editor, onEdit, select, selected, makeStack, dissolve, remove, duplicate });
  latest.current = { editor, onEdit, select, selected, makeStack, dissolve, remove, duplicate };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { editor, onEdit, select } = latest.current;
      const target = event.composedPath()[0];
      const field = target instanceof HTMLElement && target.classList.contains("vk-input") && !target.hasAttribute("data-vk-typing");
      if (!editor || !(event.metaKey || event.ctrlKey) || event.altKey || (isEditable(target) && !field)) return;
      // By the letter typed, wherever the keyboard has it.
      const key = event.key.toLowerCase();
      const redo = key === "y" ? !event.metaKey && !event.shiftKey : key === "z" && event.shiftKey;
      if (key !== "z" && !redo) return;
      event.preventDefault();
      event.stopPropagation();
      const layers = redo ? editor.redo() : editor.undo();
      if (!layers.length) return;
      select(layers);
      onEdit();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // As in Figma: ⇧A makes the selected layers a Stack, ⌥⇧A dissolves the selected Stacks, Delete deletes and ⌘D
  // copies them. Fields and dialogs keep their keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { selected, makeStack, dissolve, remove, duplicate } = latest.current;
      const target = event.composedPath()[0];
      if (!selected.length || isEditable(target) || (target instanceof Element && target.closest('[role="dialog"]'))) return;
      const command = event.metaKey || event.ctrlKey;
      // By the letter typed; with ⌥, a Mac types another one, so by the key.
      const a = event.key.toLowerCase() === "a" || (event.altKey && event.code === "KeyA");
      let act: (() => void) | null = null;
      if (a && event.shiftKey && !command) act = () => (event.altKey ? dissolve(selected) : makeStack(selected));
      else if ((event.key === "Delete" || event.key === "Backspace") && !command && !event.altKey) act = () => remove(selected);
      else if (event.key.toLowerCase() === "d" && command && !event.shiftKey && !event.altKey) act = () => duplicate(selected);
      if (!act) return;
      event.preventDefault();
      event.stopPropagation();
      act();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div class={layersShown ? "vk-shell" : "vk-shell is-layers-hidden"}>
      {layersShown ? (
        <aside class="vk-panel is-layers" aria-label="Layers">
          <div class="vk-panel-header">
            <h2 class="vk-panel-title">Layers</h2>
            <button ref={layersToggle} type="button" class="vk-icon-button" aria-label="Hide layers" aria-expanded="true" onClick={() => showLayers(false)}>
              <Icon name="sidebar" />
            </button>
          </div>
          {tree && (
            <LayerTreeView tree={tree} selected={selected} onSelect={(layer, extend) => select(extend ? toggleIn(selected, layer) : [layer])} />
          )}
        </aside>
      ) : (
        <button ref={layersToggle} type="button" class="vk-show-layers" aria-label="Show layers" aria-expanded="false" onClick={() => showLayers(true)}>
          <Icon name="sidebar" />
        </button>
      )}
      <CanvasView
        restoreFrom={restoreFrom?.canvas ?? null}
        onCanvas={(canvas) => {
          const layers = buildLayerTree(canvas.document);
          const changeSet = createChangeSet(restoreFrom?.changeSet);
          round.current = { canvas, changeSet };
          const editor = createEditor(layers, changeSet);
          setTree(layers);
          setEditor(editor);
          control.current = {
            revert(id) {
              if (editor.revert(id)) latest.current.onEdit();
            },
            discard() {
              for (const change of changeSet.list()) editor.revert(change.id);
              clearTimeout(pendingSave.current);
              pendingSave.current = undefined;
              round.current = null;
              edited(undefined);
            },
          };
        }}
        tree={tree}
        selected={selected}
        hideSelection={adjusting}
        onSelect={select}
        editor={editor}
        onMove={(layer: Layer, to: Destination) => {
          const moved = editor!.move(layer, to);
          onEdit();
          select([moved]);
        }}
        onDuplicate={(layer: Layer, to: Destination) => {
          const copy = editor!.duplicate(layer, to);
          onEdit();
          select([copy]);
        }}
        onCreate={(type, to, size) => {
          const layer = editor!.create(type, to, size);
          onEdit();
          select([layer]);
          return layer;
        }}
        onBeginText={(layer) => {
          const own = editor!.ownElement(layer);
          // Loose text got an element of its own: the layers are built anew.
          if (own !== layer) setTree(editor!.tree());
          select([own]);
          return own;
        }}
        onEditText={(layer, text) => {
          editor!.setText(editor!.tree().layerOf(layer.el) ?? layer, text);
          onEdit();
          const now = editor!.tree().layerOf(layer.el);
          if (now) select([now]);
        }}
        leaving={leaving}
        animate={animate}
        changed={!!round.current?.changeSet.list().some((change) => !previewing || !canPreview(change))}
        onLeft={onLeft}
      />
      <aside class="vk-panel is-design" aria-label="Design">
        <div class="vk-panel-header">
          <h2 class="vk-panel-title">Design</h2>
          {controls}
        </div>
        {tree && editor && selected.length ? (
          <>
            <LayerInfo tree={tree} layers={selected} />
            <Properties editor={editor} layers={selected} onEdit={onEdit} onStack={() => makeStack(selected)} onDissolve={() => dissolve(selected)} />
          </>
        ) : (
          <p class="vk-panel-empty">Select a layer to see its properties.</p>
        )}
      </aside>
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
