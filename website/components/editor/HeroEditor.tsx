"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DemoPage, layerId, type Selection, type Target } from "./DemoPage";
import { EDITOR_CSS } from "./editor-css.generated";
import { Icon } from "./Icon";
import type { IconName } from "./icon-paths";
import {
  COLOR_VARIABLES,
  LAYERS,
  NO_EDITS,
  PROP_TITLES,
  RADIUS_VARIABLES,
  SPACING_VARIABLES,
  TEXT_VARIABLES,
  TREE,
  VIEWS,
  changedIn,
  listChanges,
  styleIn,
  type Edits,
  type Key,
  type Prop,
  type Value,
  type ViewName,
} from "./model";

/** The editor is laid out at a laptop's size, then scaled to the hero's width. */
const W = 1440;
const H = 900;
const PANEL = 320;
const VIEW_GAP = 80;
const FRAME_LEFT = VIEWS.map((_, i) => VIEWS.slice(0, i).reduce((x, v) => x + v.width + VIEW_GAP, 0));
const STAGE_WIDTH = FRAME_LEFT.at(-1)! + VIEWS.at(-1)!.width;
// Fitted between the panels, clear of the toolbar on the canvas's right edge.
const FIT: Camera = { x: 32, y: 72, k: (W - 2 * PANEL - 32 - 64) / STAGE_WIDTH };

/** What the site adds to the product's styles: the editor inside the hero, not over the window, and its popovers. */
const SITE_CSS = `
.ht-shell { position: absolute; }
.ht-canvas { position: absolute; top: 0; pointer-events: auto; }
.ht-panel { position: relative; }
.ht-changes.is-site { position: absolute; top: 44px; right: 16px; z-index: 30; }
.ht-pop { position: absolute; z-index: 30; max-height: 260px; overflow: auto; padding: 4px; border-radius: 12px; background: var(--ht-panel); box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12); }
.ht-pop button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; height: 24px; padding: 0 8px; border-radius: 6px; cursor: default; }
.ht-pop button:hover { background: var(--ht-field); }
.ht-pop .ht-pop-value { margin-left: auto; color: var(--ht-text-muted); font-variant-numeric: tabular-nums; }
.ht-pop .ht-pop-swatch { width: 14px; height: 14px; border-radius: 4px; box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.2); }
.ht-var-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; }
.ht-var-list li { display: flex; align-items: center; gap: 8px; list-style: none; }
.ht-var-list .ht-var-value { margin-left: auto; color: var(--ht-text-muted); font-variant-numeric: tabular-nums; }
`;

type Camera = { x: number; y: number; k: number };
type Box = { left: number; top: number; width: number; height: number };

/**
 * The hero: Human Touch's editor, as the product draws it (its own styles, built in from the product's source), with a
 * page on the canvas to edit. Select a layer on a view or in Layers, change it in the Design panel, and the views follow;
 * made in the Tablet or Phone view, a change holds only at that view's breakpoint. Its bottom fades out under a
 * progressive blur.
 */
export function HeroEditor() {
  const outer = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const [scale, setScale] = useState(1200 / W);

  useLayoutEffect(() => {
    const el = outer.current!;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = host.current!;
    setShadow(el.shadowRoot ?? el.attachShadow({ mode: "open" }));
  }, []);

  return (
    <section ref={outer} aria-label="Human Touch's editor, to try" className="relative w-full max-w-[1200px] overflow-hidden" style={{ height: H * scale }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <div ref={host} />
      </div>
      <ProgressiveBlur />
      {shadow &&
        createPortal(
          <>
            <style>{EDITOR_CSS + SITE_CSS}</style>
            <Editor scale={scale} root={shadow} />
          </>,
          shadow as unknown as Element,
        )}
    </section>
  );
}

/** The bottom of the hero, blurred more and more toward the page, and faded into it. */
function ProgressiveBlur() {
  const steps = [1, 2, 4, 8, 16, 32];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]">
      {steps.map((blur, i) => {
        const from = (i / steps.length) * 100;
        const mid = ((i + 1) / steps.length) * 100;
        const to = ((i + 2) / steps.length) * 100;
        const mask = `linear-gradient(to bottom, transparent ${from}%, #000 ${mid}%, #000 ${Math.min(to, 100)}%, ${to > 100 ? "#000" : "transparent"} ${Math.min(to + 1, 100)}%)`;
        return <div key={blur} className="absolute inset-0" style={{ backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, maskImage: mask, WebkitMaskImage: mask }} />;
      })}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-30% to-page" />
    </div>
  );
}

const pathOf = (t: Target): Target[] => {
  const at = TREE.findIndex((r) => r.key === t.key && (r.index === undefined || r.index === t.index));
  const path: Target[] = [];
  for (let i: number | null = at; i !== null && i >= 0; i = TREE[i].parent) path.unshift({ key: TREE[i].key, index: TREE[i].index });
  return path;
};
const sameTarget = (a: Selection, b: Selection) => !!a && !!b && a.key === b.key && a.index === b.index;
const depthOf = (t: Target) => pathOf(t).length - 1;

/** Which layer a click picks, as in Figma: the page's child first, then deeper with each click, and siblings alike. */
function pick(path: Target[], selected: Selection): Target {
  if (!selected) return path[1] ?? path[0];
  const d = depthOf(selected);
  if (d >= path.length) return path[Math.min(1, path.length - 1)];
  if (sameTarget(path[d], selected)) return path[d + 1] ?? path[d];
  return path[Math.max(d, 1)] ?? path[path.length - 1];
}

function Editor({ scale, root }: { scale: number; root: ShadowRoot }) {
  const [edits, setEdits] = useState<Edits>(NO_EDITS);
  const [selected, setSelected] = useState<Selection>({ key: "card", index: 0 });
  const [hover, setHover] = useState<Selection>(null);
  const [view, setView] = useState<ViewName>("Desktop");
  const [detached, setDetached] = useState<Set<string>>(new Set());

  function set(key: Key, prop: Prop, value: Value) {
    setEdits((all) => ({ ...all, [view]: { ...all[view], [key]: { ...all[view][key], [prop]: value } } }));
  }
  function undo(v: ViewName, key: Key, prop: Prop) {
    setEdits((all) => {
      const style = { ...all[v][key] };
      delete style[prop];
      return { ...all, [v]: { ...all[v], [key]: style } };
    });
  }

  return (
    <div className="ht-shell" style={{ ["--ht-layers-width" as string]: `${PANEL}px`, ["--ht-design-width" as string]: `${PANEL}px` }}>
      <LayersPanel selected={selected} hover={hover} onSelect={setSelected} onHover={setHover} />
      <Viewport
        scale={scale}
        root={root}
        edits={edits}
        selected={selected}
        hover={hover}
        view={view}
        onSelect={(t, v) => {
          setSelected(t);
          setView(v);
        }}
        onHover={setHover}
      />
      <Tools />
      <DesignPanel
        edits={edits}
        view={view}
        selected={selected}
        root={root}
        detached={detached}
        onDetach={(id) => setDetached((s) => new Set(s).add(id))}
        onAttach={(id) =>
          setDetached((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          })
        }
        onSet={set}
        onUndo={undo}
        onDiscard={() => {
          setEdits(NO_EDITS);
          setDetached(new Set());
        }}
      />
    </div>
  );
}

const CARD_TEXT = {
  cardTitle: ["Plan", "Vote", "Go"],
  cardBody: ["Pin places, add dates, share the list.", "Everyone picks what they want to see.", "Offline maps and tickets in one place."],
};

function LayersPanel({ selected, hover, onSelect, onHover }: { selected: Selection; hover: Selection; onSelect: (t: Target) => void; onHover: (t: Selection) => void }) {
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const hasLater = (i: number) => TREE.some((r, j) => j > i && r.parent === TREE[i].parent);
  const hasChildren = (i: number) => TREE.some((r) => r.parent === i);
  const hidden = (i: number): boolean => {
    for (let p = TREE[i].parent; p !== null; p = TREE[p].parent) if (closed.has(p)) return true;
    return false;
  };

  return (
    <aside className="ht-panel is-layers" aria-label="Layers">
      <div className="ht-panel-header">
        <button type="button" className="ht-icon-button" aria-label="Hide layers" aria-expanded="true">
          <Icon name="sidebar" />
        </button>
        <h2 className="ht-panel-title">Layers</h2>
      </div>
      <div className="ht-tree" role="tree" aria-label="Layers" onPointerLeave={() => onHover(null)}>
        <div className="ht-tree-rows">
          {TREE.map((row, i) => {
            if (hidden(i)) return null;
            const layer = LAYERS[row.key];
            const target = { key: row.key, index: row.index };
            const isSelected = sameTarget(target, selected);
            const pad = 16 + row.depth * 26;
            const through: number[] = [];
            for (let a = row.parent, d = row.depth - 1; a !== null && d >= 1; a = TREE[a].parent, d--) if (hasLater(a)) through.push(1 + d * 26);
            const name = row.key === "cardTitle" || row.key === "cardBody" ? CARD_TEXT[row.key][row.index!] : layer.name;
            return (
              <div
                key={i}
                className={`ht-tree-row${isSelected ? " is-selected" : ""}${layer.instance ? " is-instance" : ""}`}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={isSelected}
                style={{ paddingLeft: pad, background: !isSelected && sameTarget(target, hover) ? "rgb(237 237 236 / 0.6)" : undefined }}
                onPointerDown={() => onSelect(target)}
                onPointerEnter={() => onHover(target)}
              >
                {row.depth > 0 && <span className={`ht-tree-guide is-in${hasChildren(i) ? "" : " is-leaf"}`} style={{ left: pad - 15 }} />}
                {row.depth > 0 && hasLater(i) && <span className="ht-tree-guide is-past" style={{ left: pad - 15 }} />}
                {through.map((left) => (
                  <span key={left} className="ht-tree-guide is-past is-through" style={{ left }} />
                ))}
                <span
                  className="ht-tree-chevron"
                  aria-hidden="true"
                  data-open={hasChildren(i) ? String(!closed.has(i)) : undefined}
                  onPointerDown={(e) => {
                    if (!hasChildren(i)) return;
                    e.stopPropagation();
                    setClosed((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    });
                  }}
                >
                  {hasChildren(i) && <Icon name="chevron-down" />}
                </span>
                <Icon name={iconOf(row.key)} />
                <span className="ht-tree-name">{name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function iconOf(key: Key, direction?: Value): IconName {
  const layer = LAYERS[key];
  if (layer.instance) return "instance";
  if (layer.kind === "stack") return (direction ?? styleIn(NO_EDITS, "Desktop", key).direction) === "row" ? "stack-horizontal" : "stack-vertical";
  return layer.kind;
}

function Tools() {
  const [tool, setTool] = useState(0);
  const tools: { label: string; icon: IconName; key: string }[] = [
    { label: "Select", icon: "pointer", key: "V" },
    { label: "Frame", icon: "frame", key: "F" },
    { label: "Text", icon: "text", key: "T" },
    { label: "Brief", icon: "brief", key: "B" },
  ];
  return (
    <div className="ht-tools" role="toolbar" aria-label="Tools">
      <div className="ht-tools-backing" aria-hidden="true" style={{ ["--ht-tool-index" as string]: tool }} />
      {tools.map((t, i) => (
        <button key={t.label} type="button" className="ht-icon-button" aria-label={t.label} aria-pressed={tool === i} aria-keyshortcuts={t.key} data-tip={t.label} onClick={() => setTool(i)}>
          <Icon name={t.icon} />
        </button>
      ))}
    </div>
  );
}

type Boxes = { selected: (Box & { view: ViewName })[]; hover: (Box & { view: ViewName })[] };

/**
 * The canvas: the three views side by side, the selection drawn over them. Drag its empty space to pan; pinch, or scroll
 * with ⌘ or Ctrl held, to zoom round the pointer; double-click it to fit. Plain scrolling is left to the page.
 */
function Viewport({ scale, root, edits, selected, hover, view, onSelect, onHover }: { scale: number; root: ShadowRoot; edits: Edits; selected: Selection; hover: Selection; view: ViewName; onSelect: (t: Selection, v: ViewName) => void; onHover: (t: Selection) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Camera>(FIT);
  const drag = useRef<{ x: number; y: number; cam: Camera; moved: boolean } | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const [boxes, setBoxes] = useState<Boxes>({ selected: [], hover: [] });

  useEffect(() => {
    const node = el.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = node.getBoundingClientRect();
      const px = (e.clientX - r.left) / scaleRef.current;
      const py = (e.clientY - r.top) / scaleRef.current;
      setCam((c) => {
        const k = Math.min(1.5, Math.max(0.15, c.k * Math.exp(-e.deltaY * 0.01)));
        return { k, x: px - ((px - c.x) * k) / c.k, y: py - ((py - c.y) * k) / c.k };
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  // Where the selected and hovered layers are on each view, in the viewport's own pixels.
  useLayoutEffect(() => {
    const node = el.current!;
    const r = node.getBoundingClientRect();
    const measure = (t: Selection) =>
      !t
        ? []
        : VIEWS.flatMap(({ name }) =>
            [...root.querySelectorAll(`[data-view="${name}"] [data-ht="${layerId(t)}"]`)].map((found) => {
              const b = found.getBoundingClientRect();
              return { view: name, left: (b.left - r.left) / scale, top: (b.top - r.top) / scale, width: b.width / scale, height: b.height / scale };
            }),
          );
    setBoxes({ selected: measure(selected), hover: sameTarget(hover, selected) ? [] : measure(hover) });
  }, [root, selected, hover, edits, cam, scale]);

  const kind = (t: Selection) => (t && LAYERS[t.key].instance ? "instance" : undefined);
  const active = boxes.selected.find((b) => b.view === view);

  return (
    <div
      ref={el}
      className="ht-viewport"
      role="region"
      aria-label="Canvas viewport"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, cam, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = (e.clientX - d.x) / scale;
        const dy = (e.clientY - d.y) / scale;
        if (!d.moved && Math.hypot(dx, dy) < 3) return;
        d.moved = true;
        setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy });
      }}
      onPointerUp={() => {
        if (drag.current && !drag.current.moved) onSelect(null, view);
        drag.current = null;
      }}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) setCam(FIT);
      }}
    >
      <div className="ht-stage" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
        {VIEWS.map((v, i) => (
          <div key={v.name} className={`ht-canvas${i ? " is-beside" : ""}`} data-view={v.name} style={{ left: FRAME_LEFT[i], width: v.width }}>
            <DemoPage view={v.name} width={v.width} edits={edits} onPick={(path, at) => onSelect(pick(path, selected), at)} onHover={(t) => onHover(t && pick(pathOf(t), selected))} />
          </div>
        ))}
      </div>
      {boxes.hover.map((b, i) => (
        <div key={`h${i}`} className="ht-hover" data-kind={kind(hover)} aria-hidden="true" style={{ left: b.left, top: b.top, width: b.width, height: b.height }} />
      ))}
      {boxes.selected.map((b, i) => (
        <div
          key={`s${i}`}
          className="ht-selection"
          data-kind={kind(selected)}
          data-view={b.view}
          data-away={b.view !== view ? "true" : undefined}
          aria-hidden="true"
          style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
        />
      ))}
      {active && <Handles box={active} kind={kind(selected)} />}
      {VIEWS.map((v, i) => (
        <div key={v.name} className="ht-view-label" role="group" aria-label={`${v.name} view`} style={{ left: cam.x + FRAME_LEFT[i] * cam.k, top: cam.y - 26, width: v.width * cam.k }}>
          <button type="button" className="ht-view-title" aria-label={`Select ${v.name} view`}>
            <span className="ht-view-name" style={{ color: v.name === view ? "var(--ht-text)" : undefined }}>
              {v.name}
            </span>
            <span className="ht-view-range">{v.range}</span>
          </button>
          <button type="button" className="ht-icon-button ht-view-play" aria-label={`Full screen ${v.name} view`} data-tip="Full screen">
            <Icon name="fullscreen" />
          </button>
          {i > 0 && (
            <button type="button" className="ht-icon-button ht-view-delete" aria-label={`Delete ${v.name} view`} data-tip="Delete view">
              <Icon name="close" />
            </button>
          )}
        </div>
      ))}
      <div className="ht-add-view" style={{ left: cam.x + STAGE_WIDTH * cam.k + 8, top: cam.y - 26 }}>
        <button type="button" className="ht-icon-button" aria-label="Add view" data-tip="Add view">
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}

/** The selected layer's handles, as the product places them: its edges 8px thick, its corners 8px squares. */
function Handles({ box, kind }: { box: Box; kind?: string }) {
  const { left: l, top: t, width: w, height: h } = box;
  const handles: [string, Box][] = [
    ["w", { left: l - 4, top: t, width: 8, height: h }],
    ["s", { left: l, top: t + h - 4, width: w, height: 8 }],
    ["e", { left: l + w - 4, top: t, width: 8, height: h }],
    ["n", { left: l, top: t - 4, width: w, height: 8 }],
    ["sw", { left: l - 4, top: t + h - 4, width: 8, height: 8 }],
    ["se", { left: l + w - 4, top: t + h - 4, width: 8, height: 8 }],
    ["ne", { left: l + w - 4, top: t - 4, width: 8, height: 8 }],
    ["nw", { left: l - 4, top: t - 4, width: 8, height: 8 }],
  ];
  return (
    <div className="ht-handles" data-kind={kind} aria-hidden="true">
      {handles.map(([name, b]) => (
        <div key={name} className="ht-handle" data-handle={name} data-corner={name.length === 2 ? (name === "sw" || name === "ne" ? "1" : "-1") : undefined} style={b} />
      ))}
    </div>
  );
}

type PanelProps = {
  edits: Edits;
  view: ViewName;
  selected: Selection;
  root: ShadowRoot;
  detached: Set<string>;
  onDetach: (id: string) => void;
  onAttach: (id: string) => void;
  onSet: (key: Key, prop: Prop, value: Value) => void;
  onUndo: (view: ViewName, key: Key, prop: Prop) => void;
  onDiscard: () => void;
};

function DesignPanel({ edits, view, selected, root, detached, onDetach, onAttach, onSet, onUndo, onDiscard }: PanelProps) {
  const [listOpen, setListOpen] = useState(false);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const changes = listChanges(edits);
  const attach = { detached, onDetach, onAttach };

  useLayoutEffect(() => {
    if (!selected) return;
    const found = root.querySelector(`[data-view="${view}"] [data-ht="${layerId(selected)}"]`) as HTMLElement | null;
    if (found) setSize([found.offsetWidth, found.offsetHeight]);
  }, [root, selected, view, edits]);

  useEffect(() => {
    if (!changes.length) setListOpen(false);
  }, [changes.length]);

  const header = (
    <div className="ht-panel-header">
      <h2 className="ht-panel-title">{selected ? "Design" : "Variables"}</h2>
      {changes.length > 0 && (
        <button type="button" className="ht-count" aria-label={`${changes.length} changes not applied yet`} aria-haspopup="dialog" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
          {changes.length}
        </button>
      )}
      <button type="button" className="ht-icon-button" aria-label="Human Touch: back to preview mode" data-tip="Back to preview mode">
        <Icon name="close" />
      </button>
      {listOpen && <ChangeList changes={changes} onUndo={onUndo} onDiscard={onDiscard} />}
    </div>
  );

  if (!selected) {
    return (
      <aside className="ht-panel is-design" aria-label="Design">
        {header}
        <section className="ht-section">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Color</h3>
          </div>
          <ul className="ht-var-list">
            {COLOR_VARIABLES.map((v) => (
              <li key={v.name}>
                <span className="ht-swatch" style={{ ["--ht-swatch" as string]: v.value }} />
                {v.name}
                <span className="ht-var-value">{v.value}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="ht-section">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Spacing</h3>
          </div>
          <ul className="ht-var-list">
            {SPACING_VARIABLES.slice(1, 8).map((v) => (
              <li key={v.name}>
                <Icon name="gap" />
                {v.name}
                <span className="ht-var-value">{v.value}px</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    );
  }

  const key = selected.key;
  const layer = LAYERS[key];
  const style = styleIn(edits, view, key);
  const changed = (prop: Prop) => changedIn(edits, view, key, prop);
  const vid = (prop: string) => `${view}:${key}:${prop}`;
  const isText = layer.kind === "text";
  const inCard = key === "cardTitle" || key === "cardBody";
  const type = layer.kind === "stack" ? (style.direction === "row" ? "Horizontal Stack" : "Vertical Stack") : { grid: "Grid", frame: "Frame", text: "Text" }[layer.kind];

  return (
    <aside className="ht-panel is-design" aria-label="Design">
      {header}
      <section className="ht-layer-info" aria-label="Selected layer">
        <div className="ht-layer-head">
          <h3 className={`ht-layer-name${layer.instance ? " is-instance" : ""}`}>
            <Icon name={iconOf(key, style.direction)} />
            <span>{inCard ? "Text" : layer.name}</span>
          </h3>
          {view !== "Desktop" && (
            <span className="ht-breakpoint-badge" role="note" aria-label={`${view} breakpoint`}>
              {VIEWS.find((v) => v.name === view)!.range}
            </span>
          )}
        </div>
        <dl>
          <dt>Type</dt>
          <dd>{type}</dd>
          {(layer.instance || inCard) && (
            <>
              <dt>Component</dt>
              <dd>Card</dd>
            </>
          )}
          <dt>Source</dt>
          <dd className="ht-source">{layer.source}</dd>
          {layer.instance && (
            <>
              <dt>Usage</dt>
              <dd className="ht-source">src/App.tsx:27:9</dd>
              <dt>Instances</dt>
              <dd>3</dd>
            </>
          )}
          {inCard && (
            <>
              <dt>Repeated</dt>
              <dd>In 3 instances</dd>
            </>
          )}
        </dl>
      </section>

      <section className="ht-section" aria-labelledby="ht-size">
        <div className="ht-section-header">
          <h3 id="ht-size" className="ht-section-title">
            Size
          </h3>
        </div>
        {(["Width", "Height"] as const).map((dim, i) => (
          <div key={dim} className="ht-row ht-size-row">
            <div className="ht-variable-slot">
              <label className="ht-field" data-tip={dim}>
                <span className="ht-scrub" aria-hidden="true">
                  <span className="ht-glyph">{dim}</span>
                </span>
                <input type="text" className="ht-input ht-number" aria-label={dim} readOnly value={size[i]} />
                <button type="button" className="ht-icon-button ht-field-action" aria-label={`Add min or max ${dim.toLowerCase()}`}>
                  <Icon name="plus" />
                </button>
              </label>
            </div>
            <span className="ht-select-field">
              <select className="ht-select" aria-label={`${dim} sizing`} defaultValue={layer.sizing[i].toLowerCase()} key={`${key}${dim}`}>
                <option value="fixed">Fixed</option>
                <option value="hug">Hug</option>
                <option value="fill">Fill</option>
              </select>
            </span>
          </div>
        ))}
      </section>

      {(layer.kind === "stack" || layer.kind === "grid") && (
        <section className="ht-section" aria-labelledby="ht-stack">
          <div className="ht-section-header">
            <h3 id="ht-stack" className="ht-section-title">
              Layout
            </h3>
            <button type="button" className="ht-icon-button" aria-label="Dissolve Stack" data-tip="Dissolve Stack (⌥⇧A)">
              <Icon name="minus" />
            </button>
          </div>
          <div className="ht-row ht-align-row">
            <div className="ht-align" role="radiogroup" aria-label="Alignment">
              {["Top left", "Top center", "Top right", "Center left", "Center", "Center right", "Bottom left", "Bottom center", "Bottom right"].map((a, i) => (
                <button key={a} type="button" role="radio" className="ht-align-point" aria-checked={i === 0} aria-label={a} />
              ))}
            </div>
            <div className="ht-align-options">
              <ValueField {...attach} id={vid("gap")} tip="Gap" icon="gap" value={Number(style.gap)} variables={SPACING_VARIABLES} changed={changed("gap")} onChange={(v) => onSet(key, "gap", v)} />
              <div className="ht-row">
                <div className="ht-segmented-field" role="radiogroup" aria-label="Direction">
                  {(
                    [
                      ["Horizontal", "stack-horizontal", "row"],
                      ["Vertical", "stack-vertical", "column"],
                      ["Grid", "grid", "grid"],
                    ] as const
                  ).map(([label, icon, dir]) => {
                    const checked = layer.kind === "grid" ? dir === "grid" : style.direction === dir;
                    return (
                      <button
                        key={label}
                        type="button"
                        role="radio"
                        className="ht-icon-button"
                        aria-checked={checked}
                        aria-label={label}
                        data-tip={label}
                        onClick={() => dir !== "grid" && layer.props.includes("direction") && onSet(key, "direction", dir)}
                      >
                        <Icon name={icon} />
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="ht-icon-button" aria-label="Wrap" data-tip="Wrap" aria-pressed="false">
                  <Icon name="wrap" />
                </button>
              </div>
            </div>
          </div>
          {layer.props.includes("padding") && <PaddingFields {...attach} id={vid("padding")} value={style.padding as number[]} initial={changed("padding")} onChange={(v) => onSet(key, "padding", v)} />}
        </section>
      )}

      {layer.kind === "frame" && layer.props.includes("padding") && (
        <section className="ht-section" aria-label="Padding">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Padding</h3>
          </div>
          <PaddingFields {...attach} id={vid("padding")} value={style.padding as number[]} initial={changed("padding")} onChange={(v) => onSet(key, "padding", v)} />
        </section>
      )}

      <section className="ht-section" aria-labelledby="ht-appearance">
        <div className="ht-section-header">
          <h3 id="ht-appearance" className="ht-section-title">
            Appearance
          </h3>
        </div>
        <div className="ht-grid-2">
          <NumberField tip="Opacity" icon="opacity" value={Number(style.opacity)} suffix="%" max={100} changed={changed("opacity")} onChange={(v) => onSet(key, "opacity", v)} />
          {layer.props.includes("radius") ? (
            <div className="ht-row">
              <ValueField {...attach} id={vid("radius")} tip="Corner radius" icon="radius" value={Number(style.radius)} variables={RADIUS_VARIABLES} changed={changed("radius")} onChange={(v) => onSet(key, "radius", v)} />
              <button type="button" className="ht-icon-button" aria-label="Independent corners" data-tip="Independent corners" aria-pressed="false">
                <Icon name="corners" />
              </button>
            </div>
          ) : (
            <span />
          )}
          <label className="ht-check">
            <input type="checkbox" defaultChecked />
            Visible
          </label>
          {!isText && (
            <label className="ht-check">
              <input type="checkbox" />
              Clip content
            </label>
          )}
        </div>
      </section>

      {isText && (
        <section className="ht-section" role="group" aria-label="Text">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Text</h3>
          </div>
          <span className="ht-select-field ht-font-field">
            <span className="ht-font-sample" aria-hidden="true" style={{ fontFamily: "var(--font-inter)" }}>
              Aa
            </span>
            <select className="ht-select ht-font" aria-label="Font" defaultValue="Inter">
              <option>Inter</option>
            </select>
          </span>
          <div className="ht-grid-2">
            <span className="ht-select-field ht-wide">
              <select className="ht-select" aria-label="Font weight" defaultValue={layer.weight} key={key}>
                <option>Regular</option>
                <option>Semi Bold</option>
                <option>Bold</option>
              </select>
            </span>
            <ValueField {...attach} id={vid("fontSize")} tip="Font size" icon="font-size" value={Number(style.fontSize)} variables={TEXT_VARIABLES} changed={changed("fontSize")} onChange={(v) => onSet(key, "fontSize", v)} />
          </div>
          <div className="ht-grid-2">
            <NumberField tip="Line height" icon="line-height" value={135} suffix="%" onChange={() => {}} />
            <NumberField tip="Letter spacing" icon="letter-spacing" value={0} suffix="%" onChange={() => {}} />
          </div>
          <div className="ht-segmented-field ht-hug" role="radiogroup" aria-label="Text alignment">
            {(["align-left", "align-center", "align-right", "align-justify"] as IconName[]).map((icon, i) => (
              <button key={icon} type="button" role="radio" className="ht-icon-button" aria-checked={i === 0} aria-label={icon}>
                <Icon name={icon} />
              </button>
            ))}
          </div>
        </section>
      )}

      {(layer.props.includes("fill") || isText) && (
        <section className="ht-section" role="group" aria-label="Fill">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Fill</h3>
          </div>
          <ColorField
            {...attach}
            id={vid(isText ? "color" : "fill")}
            name="Fill"
            value={String(style[isText ? "color" : "fill"])}
            changed={changed(isText ? "color" : "fill")}
            removable={!isText}
            onChange={(v) => onSet(key, isText ? "color" : "fill", v)}
          />
        </section>
      )}

      {!isText && (
        <section className="ht-section" role="group" aria-label="Stroke">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Stroke</h3>
            {key !== "card" && (
              <button type="button" className="ht-icon-button" aria-label="Add stroke">
                <Icon name="plus" />
              </button>
            )}
          </div>
          {key === "card" && (
            <>
              <ColorField {...attach} id={vid("stroke")} name="Stroke" value="#E5E5E4" removable onChange={() => {}} />
              <div className="ht-row ht-joined">
                <NumberField tip="Stroke weight" icon="stroke-weight" value={1} onChange={() => {}} />
                <span className="ht-select-field">
                  <select className="ht-select" aria-label="Stroke style" defaultValue="solid">
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                  </select>
                </span>
                <span className="ht-select-field">
                  <select className="ht-select" aria-label="Stroke sides" defaultValue="all">
                    <option value="all">All</option>
                  </select>
                </span>
              </div>
            </>
          )}
        </section>
      )}

      <section className="ht-section" role="group" aria-label="Effects">
        <div className="ht-section-header">
          <h3 className="ht-section-title">Effects</h3>
          <button type="button" className="ht-icon-button" aria-label="Add effect">
            <Icon name="plus" />
          </button>
        </div>
        {key === "card" && (
          <div className="ht-variable-slot">
            <div className="ht-field ht-variable-chip">
              <Icon name="variable" />
              <button type="button" className="ht-variable-chip-name" aria-label="Shadow variable">
                sm
              </button>
              <button type="button" className="ht-icon-button" aria-label="Detach shadow variable" data-tip="Detach variable">
                <Icon name="detach" />
              </button>
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}

function ChangeList({ changes, onUndo, onDiscard }: { changes: { view: ViewName; key: Key; prop: Prop }[]; onUndo: PanelProps["onUndo"]; onDiscard: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="ht-changes is-site" role="dialog" aria-label="Changes">
      <h2 className="ht-changes-title">{changes.length} not applied yet</h2>
      <ul className="ht-changes-list">
        {changes.map((c) => (
          <li key={`${c.view}${c.key}${c.prop}`} className="ht-change">
            <span>
              {PROP_TITLES[c.prop]} · {LAYERS[c.key].name}
              {c.view !== "Desktop" ? ` · ${c.view}` : ""}
            </span>
            <button type="button" className="ht-icon-button" aria-label="Undo this change" data-tip="Undo this change" onClick={() => onUndo(c.view, c.key, c.prop)}>
              <Icon name="undo" />
            </button>
          </li>
        ))}
      </ul>
      {confirming ? (
        <div className="ht-changes-confirm">
          <p>Discard all {changes.length}?</p>
          <div className="ht-changes-actions">
            <button type="button" className="ht-button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="ht-button is-danger" onClick={onDiscard}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div className="ht-changes-actions">
          <button type="button" className="ht-button" onClick={() => setConfirming(true)}>
            Discard all
          </button>
        </div>
      )}
    </div>
  );
}

type Attachable = { id: string; detached: Set<string>; onDetach: (id: string) => void; onAttach: (id: string) => void };

/** A number: type it, press ↑ or ↓ (with ⇧, by 10), or drag its icon sideways, 1 per 2px. */
function NumberField({ tip, icon, value, suffix = "", max, changed, onChange }: { tip: string; icon: IconName; value: number; suffix?: string; max?: number; changed?: boolean; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; value: number } | null>(null);
  const clamp = (n: number) => Math.max(0, max === undefined ? n : Math.min(max, n));
  return (
    <label className={`ht-field${changed ? " is-changed" : ""}`} data-tip={tip}>
      <span
        className="ht-scrub"
        aria-hidden="true"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub.current = { x: e.clientX, value };
        }}
        onPointerMove={(e) => scrub.current && onChange(clamp(Math.round(scrub.current.value + (e.clientX - scrub.current.x) / 2)))}
        onPointerUp={() => (scrub.current = null)}
      >
        <Icon name={icon} />
      </span>
      <input
        type="text"
        className="ht-input ht-number"
        aria-label={tip}
        spellCheck={false}
        value={draft ?? `${value}${suffix}`}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (draft !== null) {
            const n = parseFloat(draft);
            if (Number.isFinite(n)) onChange(clamp(n));
          }
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setDraft(null);
            onChange(clamp(value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)));
          }
        }}
      />
      <span className="ht-scrub-grip" aria-hidden="true">
        <span className="ht-grip" />
      </span>
    </label>
  );
}

/** A value with Variables: the Variable it equals, by name, to pick another or detach it; detached, a number. */
function ValueField({
  tip,
  icon,
  value,
  variables,
  changed,
  onChange,
  ...attach
}: Attachable & { tip: string; icon: IconName; value: number; variables: { name: string; value: number }[]; changed?: boolean; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const bound = !attach.detached.has(attach.id) ? variables.find((v) => v.value === value) : undefined;
  return (
    <div className="ht-variable-slot" style={{ position: "relative" }}>
      {bound ? (
        <div className={`ht-field ht-variable-chip${changed ? " is-changed" : ""}`}>
          <Icon name={icon} />
          <button type="button" className="ht-variable-chip-name" aria-label={`${tip} variable`} aria-haspopup="dialog" data-tip={`${bound.name}: ${bound.value}px`} onClick={() => setOpen((o) => !o)}>
            {bound.name}
          </button>
          <button type="button" className="ht-icon-button" aria-label={`Detach ${tip.toLowerCase()} variable`} data-tip="Detach variable" onClick={() => attach.onDetach(attach.id)}>
            <Icon name="detach" />
          </button>
        </div>
      ) : (
        <NumberField tip={tip} icon={icon} value={value} changed={changed} onChange={onChange} />
      )}
      {open && (
        <div className="ht-pop" style={{ top: 28, left: 0, width: 160 }}>
          {variables.map((v) => (
            <button
              key={v.name}
              type="button"
              onClick={() => {
                onChange(v.value);
                setOpen(false);
              }}
            >
              {v.name}
              <span className="ht-pop-value">{v.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaddingFields({ value, initial, onChange, ...attach }: Attachable & { value: number[]; initial: boolean; onChange: (v: number[]) => void }) {
  const sides: [string, IconName][] = [
    ["Padding top", "padding-top"],
    ["Padding right", "padding-right"],
    ["Padding bottom", "padding-bottom"],
    ["Padding left", "padding-left"],
  ];
  return (
    <div className="ht-grid-2" role="group" aria-label="Padding">
      {sides.map(([tip, icon], i) => (
        <ValueField key={tip} {...attach} id={`${attach.id}${i}`} tip={tip} icon={icon} value={value[i]} variables={SPACING_VARIABLES} changed={initial} onChange={(v) => onChange(value.map((n, j) => (j === i ? v : n)))} />
      ))}
    </div>
  );
}

/** A color: its swatch opens the project's colors; its value is the Variable it equals, or its hex, typed. */
function ColorField({ name, value, changed, removable, onChange, ...attach }: Attachable & { name: string; value: string; changed?: boolean; removable?: boolean; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const bound = !attach.detached.has(attach.id) ? COLOR_VARIABLES.find((v) => v.value.toUpperCase() === value.toUpperCase()) : undefined;
  return (
    <div className="ht-row ht-paint-row" style={{ position: "relative" }}>
      <div className="ht-color-row">
        <div className={`ht-field ht-color-field${bound ? "" : " is-joined"}${changed ? " is-changed" : ""}`}>
          <button type="button" className="ht-swatch ht-swatch-button" aria-label={`${name} color picker`} aria-haspopup="dialog" style={{ ["--ht-swatch" as string]: value }} onClick={() => setOpen((o) => !o)} />
          {bound ? (
            <>
              <button type="button" className="ht-variable-chip-name" aria-label={`${name} color variable`} aria-haspopup="dialog" data-tip={`${bound.name}: ${bound.value}`} onClick={() => setOpen((o) => !o)}>
                {bound.name}
              </button>
              <button type="button" className="ht-icon-button" aria-label={`Detach ${name.toLowerCase()} color variable`} data-tip="Detach variable" onClick={() => attach.onDetach(attach.id)}>
                <Icon name="detach" />
              </button>
            </>
          ) : (
            <input
              type="text"
              className="ht-input"
              aria-label={`${name} hex`}
              spellCheck={false}
              value={draft ?? value.replace("#", "").toUpperCase()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft !== null && /^[0-9a-f]{6}$/i.test(draft)) onChange(`#${draft.toUpperCase()}`);
                setDraft(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          )}
        </div>
        {!bound && (
          <label className={`ht-field ht-color-opacity${changed ? " is-changed" : ""}`}>
            <input type="text" className="ht-input ht-number" aria-label={`${name} opacity`} readOnly value="100%" />
          </label>
        )}
      </div>
      {removable && (
        <button type="button" className="ht-icon-button" aria-label={`Remove ${name.toLowerCase()}`} data-tip={`Remove ${name.toLowerCase()}`}>
          <Icon name="minus" />
        </button>
      )}
      {open && (
        <div className="ht-pop" style={{ top: 28, left: 0, right: 0 }}>
          {COLOR_VARIABLES.map((v) => (
            <button
              key={v.name}
              type="button"
              onClick={() => {
                attach.onAttach(attach.id);
                onChange(v.value);
                setOpen(false);
              }}
            >
              <span className="ht-pop-swatch" style={{ background: v.value }} />
              {v.name}
              <span className="ht-pop-value">{v.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
