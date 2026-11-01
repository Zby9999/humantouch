/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import { role, typeLabel, type Layer, type LayerTree } from "./layers";
import { BRIEF_ATTR } from "./canvas-style";
import { createFolds } from "./layer-folds";
import { Icon, LayerIcon } from "./icons";

interface Props {
  tree: LayerTree;
  /** The layers of each layer off the canvas (ADR 0009): listed beside the canvas's, as Framer lists them. */
  offCanvas: LayerTree[];
  selected: Layer[];
  /** Counts the undos and redos: the layers one brings back are listed closed and open as they were before they went. */
  undone: number;
  /** `extend`: ⇧ held, the layer joins the selection or leaves it. */
  onSelect(layer: Layer, extend: boolean): void;
}

/** Rows shown open at first. Deeper levels start collapsed, so a large page's tree is quick to show. */
const MAX_OPEN_ROWS = 200;

/**
 * The left panel's tree: one row per layer, outermost layers first. The
 * layers off the canvas come first, each as it is named on the canvas, at
 * the level of the canvas's outermost layers; the canvas's follow.
 */
export function LayerTreeView({ tree, offCanvas, selected, undone, onSelect }: Props) {
  const trees = [...offCanvas, tree];
  const [collapsed, setCollapsed] = useState<ReadonlySet<Layer>>(() => new Set([...initiallyCollapsed(tree.root), ...offCanvas.flatMap(closedOutside)]));
  const list = useRef<HTMLDivElement>(null);
  // Built anew after a move: the same layers stay collapsed. A layer new off the canvas starts so.
  // Brought back by an undo or redo, a layer is as it was before it went (ticket 74).
  const shown = useRef(trees);
  const [folds] = useState(() => createFolds(closedOutside));
  const undoneSeen = useRef(undone);
  const undoing = undone !== undoneSeen.current;
  undoneSeen.current = undone;
  if (shown.current.length !== trees.length || shown.current.some((t, i) => t !== trees[i])) {
    const next = folds.follow(collapsed, shown.current, trees, undoing);
    shown.current = trees;
    if (next.size !== collapsed.size || [...next].some((layer) => !collapsed.has(layer))) setCollapsed(next);
  }

  // The selected layers are always in view: open everything around them.
  useEffect(() => {
    if (!selected.length) return;
    const closed = [...collapsed].filter((layer) => selected.some((s) => isAncestor(layer, s)));
    if (closed.length) setCollapsed(new Set([...collapsed].filter((layer) => !closed.includes(layer))));
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected, collapsed]);

  const rows: { layer: Layer; level: number; outside: boolean }[] = [];
  const add = (layer: Layer, level: number, outside: boolean) => {
    rows.push({ layer, level, outside });
    if (!collapsed.has(layer)) for (const child of layer.children) add(child, level + 1, outside);
  };
  for (const t of offCanvas) for (const layer of t.root.children) add(layer, 1, true);
  const canvasStart = rows.length;
  for (const layer of tree.root.children) add(layer, 1, false);

  const toggle = (layer: Layer) => {
    const next = new Set(collapsed);
    if (!next.delete(layer)) next.add(layer);
    setCollapsed(next);
  };

  return (
    <div ref={list} class="tk-tree" role="tree" aria-label="Layers" aria-multiselectable="true">
      {rows.map(({ layer, level, outside }, i) => {
        const open = layer.children.length ? !collapsed.has(layer) : undefined;
        return (
          <div
            key={i}
            class={`tk-tree-row${selected.includes(layer) ? " is-selected" : ""}${role(layer) === "instance" ? " is-instance" : ""}${i === canvasStart && i > 0 ? " is-first-on-canvas" : ""}`}
            role="treeitem"
            aria-level={level}
            aria-selected={selected.includes(layer)}
            aria-expanded={open}
            aria-description={outside && level === 1 ? `${typeLabel(layer)} · Off canvas` : typeLabel(layer)}
            data-off-canvas={outside || undefined}
            style={{ paddingLeft: `${8 + (level - 1) * 12}px` }}
            onPointerDown={(event) => {
              if (event.button === 0) onSelect(layer, event.shiftKey);
            }}
          >
            <span
              class="tk-tree-chevron"
              aria-hidden="true"
              data-open={open}
              onPointerDown={(event) => {
                if (open === undefined) return;
                event.stopPropagation();
                toggle(layer);
              }}
            />
            <LayerIcon layer={layer} />
            <span class="tk-tree-name">{layer.name}</span>
            {/* A layer the designer wrote a brief for: what the Agent is to achieve in it, or make in a new Frame. */}
            {!layer.text && layer.el.hasAttribute(BRIEF_ATTR) && (
              <span class="tk-tree-brief" title={`Brief: ${layer.el.getAttribute(BRIEF_ATTR)}`} aria-hidden="true">
                <Icon name="brief" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A layer off the canvas starts with what is in it closed: it is one row beside the canvas's. */
function closedOutside(tree: LayerTree): Layer[] {
  return tree.root.children.filter((layer) => layer.children.length > 0);
}

/** Opens level after level while the rows fit; everything from the first level that does not fit stays closed. */
function initiallyCollapsed(root: Layer): Set<Layer> {
  let level = root.children;
  let rows = level.length;
  for (;;) {
    const next = level.flatMap((layer) => layer.children);
    if (!next.length) return new Set();
    if (rows + next.length > MAX_OPEN_ROWS) break;
    rows += next.length;
    level = next;
  }
  const collapsed = new Set<Layer>();
  const close = (layer: Layer) => {
    if (!layer.children.length) return;
    collapsed.add(layer);
    layer.children.forEach(close);
  };
  level.forEach(close);
  return collapsed;
}

function isAncestor(ancestor: Layer, layer: Layer): boolean {
  for (let p = layer.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}
