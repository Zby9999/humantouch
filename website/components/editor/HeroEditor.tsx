"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DemoPage, layerId, type Selection, type Target } from "./DemoPage";
import { EDITOR_CSS } from "./editor-css.generated";
import { NumberField, Tips } from "./fields";
import { Icon } from "./Icon";
import type { IconName } from "./icon-paths";
import { COLOR_VARIABLES, LAYERS, RADIUS_VARIABLES, SPACING_VARIABLES, TEXT_VARIABLES, TREE, VIEWS, styleOf, type Key, type ViewName } from "./model";

/** The editor is laid out at a laptop's size, then scaled to the hero's width. */
const W = 1440;
const H = 900;
const PANEL = 320;
const VIEW_GAP = 80;
const FRAME_LEFT = VIEWS.map((_, i) => VIEWS.slice(0, i).reduce((x, v) => x + v.width + VIEW_GAP, 0));
const STAGE_WIDTH = FRAME_LEFT.at(-1)! + VIEWS.at(-1)!.width;
// Fitted between the panels, clear of the toolbar on the canvas's right edge.
const FIT: Camera = { x: 32, y: 72, k: (W - 2 * PANEL - 32 - 64) / STAGE_WIDTH };
/** The hero's frame, as the product's toggle has one (toggle-styles.ts): a ground round it, a hairline, the editor raised in it. */
const FRAME_PAD = 6;
const EDITOR_RADIUS = 12;

/** The product's timings for a level closed in the Layers (motion.ts). */
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const LAYERS_FOLD_MS = 200;
const LAYERS_FOLD_RISE_PX = 8;

/** What the site adds to the product's styles: the editor inside the hero, not over the window, and its popovers. */
const SITE_CSS = `
.ht-shell { position: absolute; }
.ht-canvas { position: absolute; top: 0; pointer-events: auto; }
.ht-panel { position: relative; }
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
 * page on the canvas to look through. Select a layer on a view or in Layers and the Design panel shows its design; its
 * fields can be dragged and typed into, but keep nothing, so the canvas, which does not change, never disagrees with them
 * (designer, 2026-11-11). Framed as the product's toggle is, its bottom under a progressive blur.
 */
export function HeroEditor() {
  const inner = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const [scale, setScale] = useState((1200 - 2 * FRAME_PAD) / W);

  useLayoutEffect(() => {
    const el = inner.current!;
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
    <section aria-label="Human Touch's editor, to try" className="relative w-full max-w-[1200px] rounded-[18px] bg-raised shadow-[0_0_0_0.5px_var(--color-surface)]" style={{ padding: FRAME_PAD }}>
      <div
        ref={inner}
        className="relative overflow-hidden shadow-[0_1px_1px_rgb(0_0_0/0.15),0_0_0_0.5px_rgb(0_0_0/0.15)]"
        style={{ height: H * scale, borderRadius: EDITOR_RADIUS }}
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
          <div ref={host} />
        </div>
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

/** The bottom of the hero, frame and all, blurred more and more toward the page, and faded into it. */
function ProgressiveBlur() {
  const steps = [1, 2, 4, 8, 16, 32];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -inset-x-px -bottom-px h-[20%]">
      {steps.map((blur, i) => {
        const from = (i / steps.length) * 100;
        const mid = ((i + 1) / steps.length) * 100;
        const to = ((i + 2) / steps.length) * 100;
        const mask = `linear-gradient(to bottom, transparent ${from}%, #000 ${mid}%, #000 ${Math.min(to, 100)}%, ${to > 100 ? "#000" : "transparent"} ${Math.min(to + 1, 100)}%)`;
        return <div key={blur} className="absolute inset-0" style={{ backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, maskImage: mask, WebkitMaskImage: mask }} />;
      })}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-20% to-page" />
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
  const [selected, setSelected] = useState<Selection>({ key: "card", index: 0 });
  const [hover, setHover] = useState<Selection>(null);
  const [view, setView] = useState<ViewName>("Desktop");
  const [layersShown, setLayersShown] = useState(true);
  const [shell, setShell] = useState<HTMLDivElement | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  const showLayers = (shown: boolean) => {
    toggled.current = true;
    setLayersShown(shown);
  };
  // The button pressed goes with the panel: focus moves to the one that brings it back, as in the product.
  useEffect(() => {
    if (toggled.current) toggle.current?.focus({ preventScroll: true });
  }, [layersShown]);

  return (
    <div ref={setShell} className={`ht-shell${layersShown ? "" : " is-layers-hidden"}`} style={{ ["--ht-layers-width" as string]: `${PANEL}px`, ["--ht-design-width" as string]: `${PANEL}px` }}>
      {layersShown ? (
        <LayersPanel key="layers" toggle={toggle} onHide={() => showLayers(false)} selected={selected} onSelect={setSelected} onHover={setHover} />
      ) : (
        <button key="show-layers" ref={toggle} type="button" className="ht-show-layers" aria-label="Show layers" aria-expanded="false" onClick={() => showLayers(true)}>
          <Icon name="sidebar" />
        </button>
      )}
      <Viewport
        scale={scale}
        root={root}
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
      <DesignPanel key={selected ? layerId(selected) : "none"} view={view} selected={selected} root={root} />
      <Tips root={root} box={shell} scale={scale} />
    </div>
  );
}

const CARD_TEXT = {
  cardTitle: ["Plan", "Vote", "Go"],
  cardBody: ["Pin places, add dates, share the list.", "Everyone picks what they want to see.", "Offline maps and tickets in one place."],
};

type LayersProps = {
  toggle: React.RefObject<HTMLButtonElement | null>;
  onHide: () => void;
  selected: Selection;
  onSelect: (t: Target) => void;
  onHover: (t: Selection) => void;
};

/**
 * The Layers, as the product's (LayerTreeView.tsx): rows 28px high, a level 26px in, guides down to each level. A level
 * closed: its rows go up a little and fade, clipped at their foot, while the rows after rise into their places.
 */
function LayersPanel({ toggle, onHide, selected, onSelect, onHover }: LayersProps) {
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const list = useRef<HTMLDivElement>(null);
  const fold = useRef<{ at: number; hidden: number; tops: number[] } | null>(null);
  const folding = useRef<{ copies: HTMLElement; motion: Animation[] } | null>(null);
  const hasLater = (i: number) => TREE.some((r, j) => j > i && r.parent === TREE[i].parent);
  const hasChildren = (i: number) => TREE.some((r) => r.parent === i);
  const hidden = (i: number): boolean => {
    for (let p = TREE[i].parent; p !== null; p = TREE[p].parent) if (closed.has(p)) return true;
    return false;
  };
  const rows = TREE.map((row, i) => ({ row, i })).filter(({ i }) => !hidden(i));

  const settleFold = () => {
    if (!folding.current) return;
    for (const m of folding.current.motion) m.finish();
    folding.current.copies.remove();
    folding.current = null;
  };

  /** Row `at` (its place in the list) closed: copies of its rows rise and fade over the rows after, which rise with them. */
  const foldUp = (at: number) => {
    const box = list.current;
    const shown = box?.querySelector(".ht-tree-rows")?.children;
    let count = 0;
    while (rows[at + 1 + count] && rows[at + 1 + count].row.depth > rows[at].row.depth) count++;
    if (!box || !shown || !count) return;
    const all = [...shown] as HTMLElement[];
    const els = all.slice(at + 1, at + 1 + count);
    const first = els[0];
    const last = els[count - 1];
    const copies = document.createElement("div");
    copies.className = "ht-tree-fold";
    copies.setAttribute("aria-hidden", "true");
    copies.inert = true;
    Object.assign(copies.style, { top: `${first.offsetTop}px`, height: `${last.offsetTop + last.offsetHeight - first.offsetTop}px`, width: `${first.offsetWidth}px` });
    const inner = copies.appendChild(document.createElement("div"));
    inner.className = "ht-tree-rows";
    for (const el of els) {
      const copy = el.cloneNode(true) as HTMLElement;
      for (const name of copy.getAttributeNames()) if (name === "role" || name.startsWith("aria-")) copy.removeAttribute(name);
      inner.append(copy);
    }
    box.append(copies);
    const timing = { duration: LAYERS_FOLD_MS, easing: EASE_OUT };
    const rise = inner.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(${-LAYERS_FOLD_RISE_PX}px)`, opacity: 0 }], { ...timing, fill: "forwards" });
    const clip = copies.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 100% 0)" }], { ...timing, fill: "forwards" });
    clip.onfinish = () => copies.remove();
    folding.current = { copies, motion: [rise, clip] };
    fold.current = { at, hidden: count, tops: all.map((el) => el.getBoundingClientRect().top) };
  };

  // The rows after a level closed rise from where they were, in step with its rows' copies: a row now `i` was `i + hidden`.
  useLayoutEffect(() => {
    const was = fold.current;
    const box = list.current;
    fold.current = null;
    if (!was || !box || !folding.current) return;
    const shown = [...(box.querySelector(".ht-tree-rows")?.children ?? [])] as HTMLElement[];
    for (let i = was.at + 1; i < shown.length; i++) {
      const from = was.tops[i + was.hidden] - shown[i].getBoundingClientRect().top;
      if (from) folding.current.motion.push(shown[i].animate([{ transform: `translateY(${from}px)` }, { transform: "none" }], { duration: LAYERS_FOLD_MS, easing: EASE_OUT }));
    }
  });

  const toggleFold = (i: number, at: number) => {
    settleFold();
    const next = new Set(closed);
    if (!next.delete(i)) {
      next.add(i);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) foldUp(at);
    }
    setClosed(next);
  };

  return (
    <aside className="ht-panel is-layers" aria-label="Layers">
      <div className="ht-panel-header">
        <button ref={toggle} type="button" className="ht-icon-button" aria-label="Hide layers" aria-expanded="true" onClick={onHide}>
          <Icon name="sidebar" />
        </button>
        <h2 className="ht-panel-title">Layers</h2>
      </div>
      <div ref={list} className="ht-tree" role="tree" aria-label="Layers">
        <div className="ht-tree-rows">
          {rows.map(({ row, i }, at) => {
            const layer = LAYERS[row.key];
            const target = { key: row.key, index: row.index };
            const isSelected = sameTarget(target, selected);
            const pad = 16 + row.depth * 26;
            const through: number[] = [];
            for (let a = row.parent, d = row.depth - 1; a !== null && d >= 1; a = TREE[a].parent, d--) if (hasLater(a)) through.push(1 + d * 26);
            const name = row.key === "cardTitle" || row.key === "cardBody" ? CARD_TEXT[row.key][row.index!] : layer.name;
            return (
              <div
                key={at}
                className={`ht-tree-row${isSelected ? " is-selected" : ""}${layer.instance ? " is-instance" : ""}`}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={isSelected}
                style={{ paddingLeft: pad }}
                onPointerDown={() => onSelect(target)}
                onPointerEnter={() => onHover(target)}
                onPointerLeave={() => onHover(null)}
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
                    toggleFold(i, at);
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

function iconOf(key: Key): IconName {
  const layer = LAYERS[key];
  if (layer.instance) return "instance";
  if (layer.kind === "stack") return styleOf(key).direction === "row" ? "stack-horizontal" : "stack-vertical";
  return layer.kind;
}

const TOOLS: { label: string; icon: IconName; key: string }[] = [
  { label: "Select", icon: "pointer", key: "V" },
  { label: "Frame", icon: "frame", key: "F" },
  { label: "Text", icon: "text", key: "T" },
  { label: "Brief", icon: "brief-add", key: "B" },
];

/**
 * The tools, as the product's (Shell.tsx): the chosen one's backing slides to a tool clicked; a tool pointed at for
 * 500ms tells its name and key beside the toolbar, and once one has, the others tell at once till the toolbar is left.
 */
function Tools() {
  const [tool, setTool] = useState(0);
  const [sliding, setSliding] = useState(false);
  const [tip, setTip] = useState<{ text: string; middle: number; easing: boolean } | null>(null);
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
  const tipOf = (t: (typeof TOOLS)[number], button: HTMLElement, easing: boolean) => ({ text: `${t.label} (${t.key})`, middle: button.offsetTop + button.offsetHeight / 2, easing });
  return (
    <div
      className="ht-tools"
      role="toolbar"
      aria-label="Tools"
      onPointerEnter={() => clearTimeout(cooling.current)}
      onPointerLeave={() => {
        clearTimeout(waiting.current);
        setTip(null);
        if (!warm.current) return;
        clearTimeout(cooling.current);
        cooling.current = window.setTimeout(() => (warm.current = false), 300);
      }}
    >
      <div className={sliding ? "ht-tools-backing is-sliding" : "ht-tools-backing"} aria-hidden="true" style={{ ["--ht-tool-index" as string]: tool }} />
      {TOOLS.map((t, i) => (
        <button
          key={t.label}
          type="button"
          className="ht-icon-button"
          aria-label={t.label}
          aria-pressed={tool === i}
          aria-keyshortcuts={t.key}
          onPointerEnter={(e) => {
            if (e.pointerType === "touch") return;
            clearTimeout(waiting.current);
            const button = e.currentTarget;
            if (warm.current || tip) {
              clearTimeout(cooling.current);
              warm.current = true;
              setTip(tipOf(t, button, false));
              return;
            }
            waiting.current = window.setTimeout(() => {
              warm.current = true;
              setTip(tipOf(t, button, true));
            }, 500);
          }}
          onPointerLeave={() => clearTimeout(waiting.current)}
          onClick={() => {
            clearTimeout(waiting.current);
            setTip(null);
            setSliding(true);
            setTool(i);
          }}
        >
          <Icon name={t.icon} />
        </button>
      ))}
      {tip && (
        <div className={tip.easing ? "ht-variants-tip ht-tools-tip is-easing" : "ht-variants-tip ht-tools-tip"} role="tooltip" style={{ top: tip.middle }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

type Boxes = { selected: (Box & { view: ViewName })[]; hover: (Box & { view: ViewName })[] };

/**
 * The canvas: the three views side by side, the selection drawn over them. Drag its empty space to pan; pinch, or scroll
 * with ⌘ or Ctrl held, to zoom round the pointer; double-click it to fit. Plain scrolling is left to the page.
 */
function Viewport({ scale, root, selected, hover, view, onSelect, onHover }: { scale: number; root: ShadowRoot; selected: Selection; hover: Selection; view: ViewName; onSelect: (t: Selection, v: ViewName) => void; onHover: (t: Selection) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Camera>(FIT);
  const drag = useRef<{ x: number; y: number; cam: Camera; moved: boolean } | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const [boxes, setBoxes] = useState<Boxes>({ selected: [], hover: [] });
  /** Bumped as the viewport changes size (the Layers hidden or shown): the selection is measured again. */
  const [size, setSize] = useState(0);

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
    const observer = new ResizeObserver(() => setSize((n) => n + 1));
    observer.observe(node);
    return () => {
      node.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
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
  }, [root, selected, hover, cam, scale, size]);

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
            <DemoPage view={v.name} width={v.width} onPick={(path, at) => onSelect(pick(path, selected), at)} onHover={(t) => onHover(t && pick(pathOf(t), selected))} />
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

/**
 * The Design panel, in the product's markup. Everything in it can be pointed at, opened, dragged and typed into, but it
 * keeps nothing: a number rolls back once let go, a choice stays as it was, a Variable picked leaves the one bound.
 */
function DesignPanel({ view, selected, root }: { view: ViewName; selected: Selection; root: ShadowRoot }) {
  const [size, setSize] = useState<[number, number]>([0, 0]);

  useLayoutEffect(() => {
    if (!selected) return;
    const found = root.querySelector(`[data-view="${view}"] [data-ht="${layerId(selected)}"]`) as HTMLElement | null;
    if (found) setSize([found.offsetWidth, found.offsetHeight]);
  }, [root, selected, view]);

  const header = (
    <div className="ht-panel-header">
      <h2 className="ht-panel-title">{selected ? "Design" : "Variables"}</h2>
      <button type="button" className="ht-icon-button" aria-label="Human Touch: back to preview mode" data-tip="Back to preview mode">
        <Icon name="close" />
      </button>
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
  const style = styleOf(key);
  const isText = layer.kind === "text";
  const inCard = key === "cardTitle" || key === "cardBody";
  const type = layer.kind === "stack" ? (style.direction === "row" ? "Horizontal Stack" : "Vertical Stack") : { grid: "Grid", frame: "Frame", text: "Text" }[layer.kind];
  const padding = style.padding as number[] | undefined;

  return (
    <aside className="ht-panel is-design" aria-label="Design">
      {header}
      <section className="ht-layer-info" aria-label="Selected layer">
        <div className="ht-layer-head">
          <h3 className={`ht-layer-name${layer.instance ? " is-instance" : ""}`}>
            <Icon name={iconOf(key)} />
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
              <NumberField
                tip={dim}
                glyph={dim}
                value={size[i]}
                after={
                  <button type="button" className="ht-icon-button ht-field-action" aria-label={`Add min or max ${dim.toLowerCase()}`} aria-haspopup="listbox" aria-expanded="false">
                    <Icon name="plus" />
                  </button>
                }
              />
            </div>
            <span className="ht-select-field">
              <select className="ht-select" aria-label={`${dim} sizing`} value={layer.sizing[i].toLowerCase()} onChange={() => {}}>
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
              <ValueField
                tip="Gap"
                icon="gap"
                value={Number(style.gap)}
                variables={SPACING_VARIABLES}
                after={
                  <select className="ht-select ht-gap-mode" aria-label="Gap sizing" value="fixed" onChange={() => {}}>
                    <option value="fixed">Fixed</option>
                    <option value="auto">Auto</option>
                  </select>
                }
              />
              <div className="ht-row">
                <div className="ht-segmented-field" role="radiogroup" aria-label="Direction">
                  {(
                    [
                      ["Horizontal", "stack-horizontal", "row"],
                      ["Vertical", "stack-vertical", "column"],
                      ["Grid", "grid", "grid"],
                    ] as const
                  ).map(([label, icon, dir]) => (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      className="ht-icon-button"
                      aria-checked={layer.kind === "grid" ? dir === "grid" : style.direction === dir}
                      aria-label={label}
                      data-tip={label}
                    >
                      <Icon name={icon} />
                    </button>
                  ))}
                </div>
                <button type="button" className="ht-icon-button" aria-label="Wrap" data-tip="Wrap" aria-pressed="false">
                  <Icon name="wrap" />
                </button>
              </div>
            </div>
          </div>
          {padding && <PaddingFields value={padding} />}
        </section>
      )}

      {layer.kind === "frame" && padding && (
        <section className="ht-section" aria-label="Padding">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Padding</h3>
          </div>
          <PaddingFields value={padding} />
        </section>
      )}

      <section className="ht-section" aria-labelledby="ht-appearance">
        <div className="ht-section-header">
          <h3 id="ht-appearance" className="ht-section-title">
            Appearance
          </h3>
        </div>
        <div className="ht-grid-2">
          <NumberField tip="Opacity" icon="opacity" value={Number(style.opacity)} unit="%" max={100} />
          {!isText && (
            <div className="ht-row">
              <ValueField tip="Corner radius" icon="radius" value={Number(style.radius ?? 0)} variables={RADIUS_VARIABLES} />
              <button type="button" className="ht-icon-button" aria-label="Independent corners" data-tip="Independent corners" aria-pressed="false">
                <Icon name="corners" />
              </button>
            </div>
          )}
          <label className="ht-check">
            <input type="checkbox" checked readOnly />
            Visible
          </label>
          {!isText && (
            <label className="ht-check">
              <input type="checkbox" checked={false} readOnly />
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
            <select className="ht-select ht-font" aria-label="Font" value="Inter" onChange={() => {}}>
              <option>Inter</option>
            </select>
          </span>
          <div className="ht-grid-2">
            <span className="ht-select-field ht-wide">
              <select className="ht-select" aria-label="Font weight" value={layer.weight} onChange={() => {}}>
                <option>Regular</option>
                <option>Semi Bold</option>
                <option>Bold</option>
              </select>
            </span>
            <ValueField tip="Font size" icon="font-size" value={Number(style.fontSize)} variables={TEXT_VARIABLES} />
          </div>
          <div className="ht-grid-2">
            <NumberField tip="Line height" icon="line-height" value={135} unit="%" />
            <NumberField tip="Letter spacing" icon="letter-spacing" value={0} unit="%" />
          </div>
          <div className="ht-segmented-field ht-hug" role="radiogroup" aria-label="Text alignment">
            {(["Align left", "Align center", "Align right", "Justify"] as const).map((label, i) => (
              <button key={label} type="button" role="radio" className="ht-icon-button" aria-checked={i === 0} aria-label={label} data-tip={label}>
                <Icon name={(["align-left", "align-center", "align-right", "align-justify"] as IconName[])[i]} />
              </button>
            ))}
          </div>
          <div className="ht-row">
            <div className="ht-segmented-field" role="radiogroup" aria-label="Case">
              {(
                [
                  ["As typed", "—"],
                  ["Upper case", "AG"],
                  ["Lower case", "ag"],
                  ["Title case", "Ag"],
                ] as const
              ).map(([label, glyph], i) => (
                <button key={label} type="button" role="radio" className="ht-icon-button" aria-checked={i === 0} aria-label={label} data-tip={label}>
                  <span className="ht-text-glyph">{glyph}</span>
                </button>
              ))}
            </div>
            <div className="ht-segmented-field" role="radiogroup" aria-label="Decoration">
              {(
                [
                  ["No decoration", "—", "ht-none"],
                  ["Underline", "U", "ht-underline"],
                  ["Strikethrough", "S", "ht-strikethrough"],
                ] as const
              ).map(([label, glyph, cls], i) => (
                <button key={label} type="button" role="radio" className="ht-icon-button" aria-checked={i === 0} aria-label={label} data-tip={label}>
                  <span className={`ht-text-glyph ${cls}`}>{glyph}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {(layer.props.includes("fill") || isText) && (
        <section className="ht-section" role="group" aria-label="Fill">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Fill</h3>
          </div>
          <ColorField name="Fill" value={String(style[isText ? "color" : "fill"])} removable={!isText} />
        </section>
      )}

      {!isText && (
        <section className="ht-section" role="group" aria-label="Stroke">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Stroke</h3>
            {key !== "card" && (
              <button type="button" className="ht-icon-button" aria-label="Add stroke" data-tip="Add stroke">
                <Icon name="plus" />
              </button>
            )}
          </div>
          {key === "card" && (
            <>
              <ColorField name="Stroke" value="#E5E5E4" removable />
              <div className="ht-row ht-joined">
                <NumberField tip="Stroke weight" icon="stroke-weight" value={1} />
                <span className="ht-select-field">
                  <select className="ht-select" aria-label="Stroke style" value="solid" onChange={() => {}}>
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                  </select>
                </span>
                <span className="ht-select-field">
                  <select className="ht-select" aria-label="Stroke sides" value="all" onChange={() => {}}>
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
          <button type="button" className="ht-icon-button" aria-label="Add effect" aria-haspopup="listbox" aria-expanded="false">
            <Icon name="plus" />
          </button>
        </div>
        {key === "card" && (
          <div className="ht-variable-slot">
            <div className="ht-field ht-variable-chip">
              <Icon name="variable" />
              <button type="button" className="ht-variable-chip-name" aria-label="Shadow variable" data-tip="sm: 0 1px 3px, 0 1px 2px">
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

/** Opens a list on the panel; anything picked in it, or a click outside, closes it, and nothing changes. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const root = ref.current?.getRootNode() as ShadowRoot | undefined;
    const close = (e: Event) => !ref.current?.contains(e.composedPath()[0] as Node) && setOpen(false);
    root?.addEventListener("pointerdown", close, true);
    return () => root?.removeEventListener("pointerdown", close, true);
  }, [open]);
  return { open, setOpen, ref };
}

/** A value bound to a Variable, by name: click it for the others; detached, a number. Neither is kept. */
function ValueField({ tip, icon, value, variables, after }: { tip: string; icon: IconName; value: number; variables: { name: string; value: number }[]; after?: React.ReactNode }) {
  const pop = usePopover();
  const bound = variables.find((v) => v.value === value);
  if (!bound)
    return (
      <div className="ht-variable-slot">
        <NumberField tip={tip} icon={icon} value={value} after={after} />
      </div>
    );
  return (
    <div ref={pop.ref} className="ht-variable-slot" style={{ position: "relative" }}>
      <div className="ht-field ht-variable-chip">
        <Icon name={icon} />
        <button type="button" className="ht-variable-chip-name" aria-label={`${tip} variable`} aria-haspopup="dialog" aria-expanded={pop.open} data-tip={`${bound.name}: ${bound.value}px`} onClick={() => pop.setOpen((o) => !o)}>
          {bound.name}
        </button>
        <button type="button" className="ht-icon-button" aria-label={`Detach ${tip.toLowerCase()} variable`} data-tip="Detach variable">
          <Icon name="detach" />
        </button>
      </div>
      {pop.open && (
        <div className="ht-pop" style={{ top: 28, left: 0, width: 160 }}>
          {variables.map((v) => (
            <button key={v.name} type="button" aria-current={v.name === bound.name} onClick={() => pop.setOpen(false)}>
              {v.name}
              <span className="ht-pop-value">{v.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaddingFields({ value }: { value: number[] }) {
  const sides: [string, IconName][] = [
    ["Padding top", "padding-top"],
    ["Padding right", "padding-right"],
    ["Padding bottom", "padding-bottom"],
    ["Padding left", "padding-left"],
  ];
  return (
    <div className="ht-grid-2" role="group" aria-label="Padding">
      {sides.map(([tip, icon], i) => (
        <ValueField key={tip} tip={tip} icon={icon} value={value[i]} variables={SPACING_VARIABLES} />
      ))}
    </div>
  );
}

/** A color: its swatch opens the project's colors; its value is the Variable it equals, or its hex, typed in and taken back. */
function ColorField({ name, value, removable }: { name: string; value: string; removable?: boolean }) {
  const pop = usePopover();
  const [draft, setDraft] = useState<string | null>(null);
  const bound = COLOR_VARIABLES.find((v) => v.value.toUpperCase() === value.toUpperCase());
  const row = (
    <div className="ht-color-row">
      <div className={`ht-field ht-color-field${bound ? "" : " is-joined"}`}>
        <button type="button" className="ht-swatch ht-swatch-button" aria-label={`${name} color picker`} aria-haspopup="dialog" aria-expanded={pop.open} style={{ ["--ht-swatch" as string]: value }} onClick={() => pop.setOpen((o) => !o)} />
        {bound ? (
          <>
            <button type="button" className="ht-variable-chip-name" aria-label={`${name} color variable`} aria-haspopup="dialog" data-tip={`${bound.name}: ${bound.value}`} onClick={() => pop.setOpen((o) => !o)}>
              {bound.name}
            </button>
            <button type="button" className="ht-icon-button" aria-label={`Detach ${name.toLowerCase()} color variable`} data-tip="Detach variable">
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
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
          />
        )}
      </div>
      {!bound && <NumberField tip={`${name} opacity`} className="ht-color-opacity" value={100} unit="%" max={100} rolls={false} />}
    </div>
  );
  const picker = pop.open && (
    <div className="ht-pop" style={{ top: 28, left: 0, right: 0 }}>
      {COLOR_VARIABLES.map((v) => (
        <button key={v.name} type="button" aria-current={v.value.toUpperCase() === value.toUpperCase()} onClick={() => pop.setOpen(false)}>
          <span className="ht-pop-swatch" style={{ background: v.value }} />
          {v.name}
          <span className="ht-pop-value">{v.value}</span>
        </button>
      ))}
    </div>
  );
  // A text's fill is its color row alone; a frame's paint has a remove button after it.
  if (!removable)
    return (
      <div ref={pop.ref} style={{ position: "relative" }}>
        {row}
        {picker}
      </div>
    );
  return (
    <div ref={pop.ref} className="ht-row ht-paint-row" style={{ position: "relative" }}>
      {row}
      <button type="button" className="ht-icon-button" aria-label={`Remove ${name.toLowerCase()}`} data-tip={`Remove ${name.toLowerCase()}`}>
        <Icon name="minus" />
      </button>
      {picker}
    </div>
  );
}
