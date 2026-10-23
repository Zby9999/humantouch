/** @jsxImportSource preact */
import { useEffect, useReducer, useRef, useState } from "preact/hooks";
import type { SavedRound } from "../service-protocol";
import { CanvasView, isEditable } from "./CanvasView";
import { canPreview } from "./change-preview";
import { createChangeSet, type Change, type ChangeSet } from "./changeset";
import { createEditor, type Editor } from "./edits";
import { serializeCanvas, type Canvas } from "./freezer";
import { buildLayerTree, type Layer, type LayerTree } from "./layers";
import { LayerInfo } from "./LayerInfo";
import { LayerTreeView } from "./LayerTreeView";
import { Properties } from "./Properties";
import { toggleIn } from "./selection";

/** What the change list does to the round while edit mode is up: on the canvas, as edits. */
export interface RoundControl {
  /** Takes change `id` back out, as an edit that can be undone. */
  revert(id: number): void;
  /** Takes every change back out and stops saving: the round is being discarded. */
  discard(): void;
}

interface Props {
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
export function Shell({ saved, onSave, onChanges, control, previewing, leaving, animate, onLeft }: Props) {
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

  // ⌘Z / ⇧⌘Z (Ctrl on other systems): through the edits in the order they were made. A field keeps its own.
  const latest = useRef({ editor, onEdit, select });
  latest.current = { editor, onEdit, select };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { editor, onEdit, select } = latest.current;
      if (!editor || !(event.metaKey || event.ctrlKey) || event.altKey || isEditable(event.composedPath()[0])) return;
      const redo = event.code === "KeyY" ? !event.metaKey && !event.shiftKey : event.code === "KeyZ" && event.shiftKey;
      if (event.code !== "KeyZ" && !redo) return;
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

  return (
    <div class="vk-shell">
      <aside class="vk-panel" aria-label="Layers">
        <h2 class="vk-panel-title">Layers</h2>
        {tree && (
          <LayerTreeView tree={tree} selected={selected} onSelect={(layer, extend) => select(extend ? toggleIn(selected, layer) : [layer])} />
        )}
      </aside>
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
        leaving={leaving}
        animate={animate}
        changed={!!round.current?.changeSet.list().some((change) => !previewing || !canPreview(change))}
        onLeft={onLeft}
      />
      <aside class="vk-panel" aria-label="Design">
        <h2 class="vk-panel-title">Design</h2>
        {tree && editor && selected.length ? (
          <>
            <LayerInfo tree={tree} layers={selected} />
            <Properties editor={editor} layers={selected} onEdit={onEdit} />
          </>
        ) : (
          <p class="vk-panel-empty">Select a layer to see its properties.</p>
        )}
      </aside>
    </div>
  );
}
