/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import { role, typeLabel, type Layer, type LayerTree } from "./layers";
import { BRIEF_ATTR } from "./canvas-style";
import { closedOutside, type Folds } from "./layer-folds";
import { Icon, LayerIcon } from "./icons";

interface Props {
  tree: LayerTree;
  /** The layers of each layer off the canvas (ADR 0009): listed beside the canvas's, as Framer lists them. */
  offCanvas: LayerTree[];
  selected: Layer[];
  /** What the panel remembers of its closed layers, kept while it is hidden (`createFolds`). */
  folds: Folds;
  /** Counts the edits that bring layers back as they were (undo, redo, a deletion taken back, a layer put back as it was): the layers one brings back are listed closed and open as they were before they went. */
  broughtBack: number;
  /** `extend`: ⇧ held, the layer joins the selection or leaves it. */
  onSelect(layer: Layer, extend: boolean): void;
}

/** How far in a level's rows start: a disclosure and the gap after it. */
const LEVEL_INDENT = 26;
/** Where a level's guides run: down the middle of its disclosures. */
const guideX = (level: number) => 16 + (level - 1) * LEVEL_INDENT + 11;

/** Rows shown open at first. Deeper levels start collapsed, so a large page's tree is quick to show. */
const MAX_OPEN_ROWS = 200;

/**
 * The left panel's tree: one row per layer, outermost layers first. The
 * layers off the canvas come first, each as it is named on the canvas, at
 * the level of the canvas's outermost layers; the canvas's follow.
 */
export function LayerTreeView({ tree, offCanvas, selected, folds, broughtBack, onSelect }: Props) {
  const trees = [...offCanvas, tree];
  // Shown, the panel starts its layers anew; hidden, it leaves those closed then with what it remembers.
  const [collapsed, setCollapsed] = useState<ReadonlySet<Layer>>(() => {
    folds.shown(trees);
    return new Set([...initiallyCollapsed(tree.root), ...offCanvas.flatMap(closedOutside)]);
  });
  const closedNow = useRef(collapsed);
  closedNow.current = collapsed;
  useEffect(() => () => folds.hidden(closedNow.current), []);
  const list = useRef<HTMLDivElement>(null);
  // Built anew after a move: the same layers stay collapsed. A layer new off the canvas starts so.
  // Brought back by an undo, a redo, a deletion taken back or put back as it was, a layer is as it was before it went (ticket 74).
  const shown = useRef(trees);
  const broughtBackSeen = useRef(broughtBack);
  const bringingBack = broughtBack !== broughtBackSeen.current;
  broughtBackSeen.current = broughtBack;
  if (shown.current.length !== trees.length || shown.current.some((t, i) => t !== trees[i])) {
    const next = folds.follow(collapsed, shown.current, trees, bringingBack);
    shown.current = trees;
    if (next.size !== collapsed.size || [...next].some((layer) => !collapsed.has(layer))) setCollapsed(next);
  }

  // Selected, the layers come into view: everything around them opens, and the list scrolls to them. Only as they are
  // selected, not on each fold: run on every change of what is closed, this opened again at once a layer closed around
  // the selection, and with a layer selected to edit in the Design panel, the layers around it could not be closed
  // (designer, 2026-11-08). Closed so, a layer stays closed until the selection changes, as in Figma.
  const scrollToSelected = useRef(false);
  useEffect(() => {
    if (!selected.length) return;
    scrollToSelected.current = true;
    setCollapsed((collapsed) => {
      const closed = [...collapsed].filter((layer) => selected.some((s) => isAncestor(layer, s)));
      return closed.length ? new Set([...collapsed].filter((layer) => !closed.includes(layer))) : collapsed;
    });
  }, [selected]);
  // Once its row is listed: it may be listed only as the layers around it open.
  useEffect(() => {
    if (!scrollToSelected.current) return;
    const row = list.current?.querySelector('[aria-selected="true"]');
    if (!row) return;
    scrollToSelected.current = false;
    row.scrollIntoView({ block: "nearest" });
  });

  /** `past`: the levels whose guides go on down past this row, to a later layer in them. `more`: this layer has a later one in its own. */
  const rows: { layer: Layer; level: number; outside: boolean; past: number[]; more: boolean }[] = [];
  const add = (layer: Layer, level: number, outside: boolean, past: number[], more: boolean) => {
    rows.push({ layer, level, outside, past, more });
    if (collapsed.has(layer)) return;
    // Its own level's guide goes on past the layers in it, to its later one; the outermost level has none.
    const inner = more && level > 1 ? [...past, level - 1] : past;
    layer.children.forEach((child, i) => add(child, level + 1, outside, inner, i < layer.children.length - 1));
  };
  for (const t of offCanvas) for (const layer of t.root.children) add(layer, 1, true, [], false);
  const canvasStart = rows.length;
  for (const layer of tree.root.children) add(layer, 1, false, [], false);

  const toggle = (layer: Layer) => {
    const next = new Set(collapsed);
    if (!next.delete(layer)) next.add(layer);
    setCollapsed(next);
  };

  return (
    <div ref={list} class="tk-tree" role="tree" aria-label="Layers" aria-multiselectable="true">
      {rows.map(({ layer, level, outside, past, more }, i) => {
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
            style={{ paddingLeft: `${16 + (level - 1) * LEVEL_INDENT}px` }}
            onPointerDown={(event) => {
              if (event.button === 0) onSelect(layer, event.shiftKey);
            }}
          >
            {/* Guides: in to this layer from the one it is in, and on down past it to the later layers of those above it. */}
            {/* In to the row's chevron; a row with none, on across its place to its icon (designer, 2026-11-07). */}
            {level > 1 && <span class={`tk-tree-guide is-in${open === undefined ? " is-leaf" : ""}`} style={{ left: `${guideX(level - 1)}px` }} />}
            {level > 1 && more && <span class="tk-tree-guide is-past" style={{ left: `${guideX(level - 1)}px` }} />}
            {past.filter((at) => at < level - 1).map((at) => (
              <span key={at} class="tk-tree-guide is-past is-through" style={{ left: `${guideX(at)}px` }} />
            ))}
            <span
              class="tk-tree-chevron"
              aria-hidden="true"
              data-open={open}
              onPointerDown={(event) => {
                if (open === undefined) return;
                event.stopPropagation();
                toggle(layer);
              }}
            >
              {open !== undefined && <Icon name="chevron-down" />}
            </span>
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
