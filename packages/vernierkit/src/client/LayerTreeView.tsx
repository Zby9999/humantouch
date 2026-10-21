/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import { role, typeLabel, type Layer, type LayerTree } from "./layers";
import { LayerIcon } from "./icons";

interface Props {
  tree: LayerTree;
  selected: Layer | null;
  onSelect(layer: Layer): void;
}

/** Rows shown open at first. Deeper levels start collapsed, so a large page's tree is quick to show. */
const MAX_OPEN_ROWS = 200;

/** The left panel's tree: one row per layer, outermost layers first. */
export function LayerTreeView({ tree, selected, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<Layer>>(() => initiallyCollapsed(tree.root));
  const list = useRef<HTMLDivElement>(null);

  // The selected layer is always in view: open everything around it.
  useEffect(() => {
    if (!selected) return;
    const closed = [...collapsed].filter((layer) => isAncestor(layer, selected));
    if (closed.length) setCollapsed(new Set([...collapsed].filter((layer) => !closed.includes(layer))));
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected, collapsed]);

  const rows: { layer: Layer; level: number }[] = [];
  const add = (layer: Layer, level: number) => {
    rows.push({ layer, level });
    if (!collapsed.has(layer)) for (const child of layer.children) add(child, level + 1);
  };
  for (const layer of tree.root.children) add(layer, 1);

  const toggle = (layer: Layer) => {
    const next = new Set(collapsed);
    if (!next.delete(layer)) next.add(layer);
    setCollapsed(next);
  };

  return (
    <div ref={list} class="vk-tree" role="tree" aria-label="Layers">
      {rows.map(({ layer, level }, i) => {
        const open = layer.children.length ? !collapsed.has(layer) : undefined;
        return (
          <div
            key={i}
            class={`vk-tree-row${layer === selected ? " is-selected" : ""}${role(layer) === "component" ? " is-component" : ""}`}
            role="treeitem"
            aria-level={level}
            aria-selected={layer === selected}
            aria-expanded={open}
            aria-description={typeLabel(layer)}
            style={{ paddingLeft: `${8 + (level - 1) * 12}px` }}
            onPointerDown={(event) => {
              if (event.button === 0) onSelect(layer);
            }}
          >
            <span
              class="vk-tree-chevron"
              aria-hidden="true"
              data-open={open}
              onPointerDown={(event) => {
                if (open === undefined) return;
                event.stopPropagation();
                toggle(layer);
              }}
            />
            <LayerIcon layer={layer} />
            <span class="vk-tree-name">{layer.name}</span>
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
