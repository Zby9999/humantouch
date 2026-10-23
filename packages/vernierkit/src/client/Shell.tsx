/** @jsxImportSource preact */
import { useEffect, useReducer, useRef, useState } from "preact/hooks";
import type { SavedRound } from "../service-protocol";
import { CanvasView } from "./CanvasView";
import { createChangeSet, type ChangeSet } from "./changeset";
import { createEditor, type Editor } from "./edits";
import { serializeCanvas, type Canvas } from "./freezer";
import { buildLayerTree, type Layer, type LayerTree } from "./layers";
import { LayerInfo } from "./LayerInfo";
import { LayerTreeView } from "./LayerTreeView";
import { Properties } from "./Properties";

interface Props {
  /** The round to come back to, canvas and ChangeSet; null to freeze the page afresh. */
  saved: SavedRound | null;
  /** The round, saved a moment after the last edit; null once it has no changes left. */
  onSave(round: SavedRound | null): void;
  /** How many changes the round has, right after each edit. */
  onChangeCount(count: number): void;
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
export function Shell({ saved, onSave, onChangeCount, leaving, animate, onLeft }: Props) {
  /** Only the round there was on entering counts: saves along the way do not restore anything. */
  const [restoreFrom] = useState(saved);
  const [tree, setTree] = useState<LayerTree | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selected, setSelected] = useState<Layer | null>(null);
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
  useEffect(() => flush, []);

  const onEdit = () => {
    clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(flush, AUTOSAVE_MS);
    if (round.current) onChangeCount(round.current.changeSet.list().length);
    edited(undefined);
    setAdjusting(true);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setAdjusting(false), ADJUSTING_MS);
  };
  const select = (layer: Layer | null) => {
    clearTimeout(settle.current);
    setAdjusting(false);
    setSelected(layer);
  };

  return (
    <div class="vk-shell">
      <aside class="vk-panel" aria-label="Layers">
        <h2 class="vk-panel-title">Layers</h2>
        {tree && <LayerTreeView tree={tree} selected={selected} onSelect={select} />}
      </aside>
      <CanvasView
        restoreFrom={restoreFrom?.canvas ?? null}
        onCanvas={(canvas) => {
          const layers = buildLayerTree(canvas.document);
          const changeSet = createChangeSet(restoreFrom?.changeSet);
          round.current = { canvas, changeSet };
          setTree(layers);
          setEditor(createEditor(layers, changeSet));
        }}
        tree={tree}
        selected={selected}
        hideSelection={adjusting}
        onSelect={select}
        leaving={leaving}
        animate={animate}
        changed={!!round.current?.changeSet.list().length}
        onLeft={onLeft}
      />
      <aside class="vk-panel" aria-label="Design">
        <h2 class="vk-panel-title">Design</h2>
        {tree && editor && selected ? (
          <>
            <LayerInfo tree={tree} layer={selected} />
            <Properties editor={editor} layer={selected} onEdit={onEdit} />
          </>
        ) : (
          <p class="vk-panel-empty">Select a layer to see its properties.</p>
        )}
      </aside>
    </div>
  );
}
