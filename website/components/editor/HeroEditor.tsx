"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DemoPage, layerId, type Selection, type Target } from "./DemoPage";
import { EDITOR_CSS } from "./editor-css.generated";
import { Tips } from "./fields";
import { Icon } from "./Icon";
import { DesignSections } from "./DesignSections";
import { VariablesPanel } from "./VariablesPanel";
import type { IconName } from "./icon-paths";
import { LAYERS, TREE, VIEWS, nameOf, styleOf, type Key, type ViewName } from "./model";

/** The editor is laid out at a laptop's size, then scaled to the hero's width. */
const W = 1440;
const H = 900;
const PANEL = 320;
/**
 * The canvas is set out once and stays (designer, 2026-11-11): the three views side by side between the panels, 32px from
 * the Layers, clear of the toolbar on the right, 24px apart on screen, their tops 72px down; the pages run on under the
 * hero's bottom edge. No pan, no zoom.
 */
const VIEWS_WIDTH = VIEWS.reduce((x, v) => x + v.width, 0);
const ROOM = W - 2 * PANEL - 32 - 56;
const SCREEN_GAP = 24;
const CAMERA = { x: 32, y: 72, k: (ROOM - 2 * SCREEN_GAP) / VIEWS_WIDTH };
const VIEW_GAP = SCREEN_GAP / CAMERA.k;
const FRAME_LEFT = VIEWS.map((_, i) => VIEWS.slice(0, i).reduce((x, v) => x + v.width + VIEW_GAP, 0));
const STAGE_WIDTH = FRAME_LEFT.at(-1)! + VIEWS.at(-1)!.width;
/** The hero's frame, as the product's toggle has one (toggle-styles.ts): a ground round it, a hairline, the editor raised in it. */
const FRAME_PAD = 6;
const EDITOR_RADIUS = 12;

/** The product's timings for a level closed in the Layers (motion.ts). */
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
/** The page shrinking into the canvas as edit mode starts, and growing back as it ends; with reduced motion, a fade. */
const MODE_SWITCH_MS = 240;
const MODE_FADE_MS = 150;
const LAYERS_FOLD_MS = 200;
const LAYERS_FOLD_RISE_PX = 8;

/** What the site adds to the product's styles: the editor inside the hero, not over the window, and its popovers. */
const SITE_CSS = `
.ht-shell { position: absolute; }
.ht-canvas { position: absolute; top: 0; pointer-events: auto; }
.ht-panel { position: relative; }
/* Nothing in the hero scrolls of its own: a wheel or a swipe over it scrolls the page on (designer, 2026-11-11). */
.ht-panel, .ht-tree { overflow: hidden; overscroll-behavior: auto; }
.ht-viewport { touch-action: auto; }
/* The panels' headers 16px from the top, as their buttons are from the side (designer, 2026-11-11); the product's are 12px. */
.ht-panel-header { padding-top: 16px; }
.ht-pop { position: absolute; z-index: 30; max-height: 260px; overflow: auto; padding: 4px; border-radius: 12px; background: var(--ht-panel); box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12); }
.ht-pop button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; height: 24px; padding: 0 8px; border-radius: 6px; cursor: default; }
.ht-pop button:hover { background: var(--ht-field); }
.ht-pop .ht-pop-value { margin-left: auto; color: var(--ht-text-muted); font-variant-numeric: tabular-nums; }
.ht-pop .ht-pop-swatch { width: 14px; height: 14px; border-radius: 4px; box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.2); }
`;

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

/**
 * The bottom of the hero, frame and all, blurred more and more toward the page, and faded into it. Three layers of
 * backdrop blur: each one is redrawn on every frame of a scroll, and six made scrolling stutter (57 of 240 frames over
 * 25ms, headless at 2x; three, none).
 */
function ProgressiveBlur() {
  const steps = [3, 8, 20];
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

/** The way the page is going: into the canvas as edit mode starts, out over the window as it ends. */
type Travel = "in" | "out" | null;

/** The page as it is, just glimpsed, before the toggle is pressed as the hero opens (designer, 2026-11-11: "一闪而过"). */
const INTRO_DELAY_MS = 300;
/** The toggle pressed, as the hero's intro presses it: as long as a click. */
const PRESS_MS = 120;

/**
 * The editor and the page under it. The hero opens on Acme as it is, the toggle at its top right corner; a moment later the
 * toggle is pressed and the page shrinks into its place on the canvas, the panels and the tools coming in with its
 * edges, as the product switches into edit mode. The Design panel's × switches back, the page growing over the window
 * again; the toggle, again into edit mode, as often as anyone likes.
 */
function Editor({ scale, root }: { scale: number; root: ShadowRoot }) {
  const [editing, setEditing] = useState(false);
  const [travel, setTravel] = useState<Travel>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);

  const enter = () => {
    if (travel) return;
    setEditing(true);
    setTravel("in");
  };
  const leave = () => {
    if (travel) return;
    setTravel("out");
  };
  const travelled = () => {
    if (travel === "out") setEditing(false);
    setTravel(null);
  };

  // The intro: the toggle pressed, as by a click, then edit mode.
  useEffect(() => {
    const press = window.setTimeout(() => {
      toggleButton.current?.animate([{ scale: "1" }, { scale: "0.96" }, { scale: "1" }], { duration: PRESS_MS * 2, easing: "ease-out" });
      window.setTimeout(enter, PRESS_MS);
    }, INTRO_DELAY_MS);
    return () => clearTimeout(press);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {!editing && <Preview toggle={toggleButton} onEnter={enter} />}
      <EditMode shown={editing} travel={travel} onTravelled={travelled} onLeave={leave} scale={scale} root={root} />
    </>
  );
}

/** The page as it is, at the window's width, the toggle at its top right corner: preview mode. */
function Preview({ toggle, onEnter }: { toggle: React.RefObject<HTMLButtonElement | null>; onEnter: () => void }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ pointerEvents: "none" }}>
        <DemoPage view="Desktop" width={W} onPick={() => {}} onHover={() => {}} />
      </div>
      {/* At the top right, as the product can dock it: at the bottom it would be under the hero's blur, out of sight (designer, 2026-11-11). */}
      <div className="ht-dock" data-corner="top-right">
        <div className="ht-toggle-wrap">
          <button ref={toggle} type="button" className="ht-toggle" aria-label="Human Touch: enter edit mode" onClick={onEnter}>
            <svg width="13.5" height="13.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13.05 5.15a.55.55 0 0 0-2.19-2.19L3.51 10.3a1.1 1.1 0 0 0-.27.46l-.73 2.39a.28.28 0 0 0 .34.34l2.39-.73a1.1 1.1 0 0 0 .46-.27zM9.65 4.15l2.2 2.2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Edit mode: the shell. Kept while preview mode shows, hidden, so a layer selected or the Layers hidden stay so. */
function EditMode({ shown, travel, onTravelled, onLeave, scale, root }: { shown: boolean; travel: Travel; onTravelled: () => void; onLeave: () => void; scale: number; root: ShadowRoot }) {
  const [selected, setSelected] = useState<Selection>({ key: "entry", index: 0 });
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
    <div
      ref={setShell}
      className={`ht-shell${layersShown ? "" : " is-layers-hidden"}`}
      style={{ ["--ht-layers-width" as string]: `${PANEL}px`, ["--ht-design-width" as string]: `${PANEL}px`, display: shown ? undefined : "none" }}
    >
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
        travel={travel}
        onTravelled={onTravelled}
        onSelect={(t, v) => {
          setSelected(t);
          setView(v);
        }}
        onHover={setHover}
      />
      <Tools />
      <DesignPanel key={selected ? layerId(selected) : "none"} view={view} selected={selected} root={root} atRest={shown && !travel} onLeave={onLeave} />
      <Tips root={root} box={shell} scale={scale} />
    </div>
  );
}

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
            const name = nameOf(row.key, row.index);
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

/** The canvas: the three views side by side, set out once (`CAMERA`), the selection drawn over them. A click on its empty space selects nothing. */
function Viewport({
  scale,
  root,
  selected,
  hover,
  view,
  travel,
  onTravelled,
  onSelect,
  onHover,
}: {
  scale: number;
  root: ShadowRoot;
  selected: Selection;
  hover: Selection;
  view: ViewName;
  travel: Travel;
  onTravelled: () => void;
  onSelect: (t: Selection, v: ViewName) => void;
  onHover: (t: Selection) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cam = CAMERA;
  const travelling = travel !== null;
  const done = useRef(onTravelled);
  done.current = onTravelled;

  /**
   * The mode switch, as the product plays it (CanvasView.tsx): the Desktop view travels between the window, at 1:1, and
   * its place on the canvas over 240ms, eased in and out; the panels and the tools go with its edges, each side pushed off
   * the window as far as its edge goes, or just off it. The views beside it are hidden meanwhile, the selection too. With
   * reduced motion, the editor only fades.
   */
  useLayoutEffect(() => {
    if (!travel) return;
    const viewport = el.current!;
    const shell = viewport.parentElement!;
    const out = travel === "out";
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const fade = shell.animate([{ opacity: out ? 1 : 0 }, { opacity: out ? 0 : 1 }], { duration: MODE_FADE_MS, easing: EASE_OUT, fill: out ? "forwards" : "none" });
      fade.onfinish = () => done.current();
      return () => fade.cancel();
    }
    const rest = `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`;
    const overPage = `translate(${-viewport.offsetLeft}px, ${-viewport.offsetTop}px) scale(1)`;
    const timing = { duration: MODE_SWITCH_MS, easing: EASE_IN_OUT, fill: out ? ("forwards" as const) : ("none" as const) };
    const page = stage.current!.animate([{ transform: out ? rest : overPage }, { transform: out ? overPage : rest }], timing);

    const sideOf = (selector: string) => [...shell.querySelectorAll<HTMLElement>(`:scope > :is(${selector})`)];
    const layersSide = sideOf(".ht-panel.is-layers, .ht-show-layers");
    const designSide = sideOf(".ht-panel.is-design, .ht-tools");
    const width = shell.clientWidth;
    const layersRight = Math.max(0, ...layersSide.map((p) => p.offsetLeft + p.offsetWidth));
    const designLeft = Math.min(width, ...designSide.map((p) => p.offsetLeft));
    const restLeft = viewport.offsetLeft + cam.x;
    const push = { left: -Math.max(restLeft, layersRight), right: Math.max(W - (restLeft + VIEWS[0].width * cam.k), width - designLeft) };
    const chrome = [...layersSide, ...designSide].map((part, i) => {
      const away = `translateX(${i < layersSide.length ? push.left : push.right}px)`;
      return part.animate([{ transform: out ? "translateX(0px)" : away }, { transform: out ? away : "translateX(0px)" }], timing);
    });
    page.onfinish = () => done.current();
    return () => {
      page.cancel();
      for (const move of chrome) move.cancel();
    };
  }, [travel]);

  const [boxes, setBoxes] = useState<Boxes>({ selected: [], hover: [] });
  /** Bumped as the viewport changes size (the Layers hidden or shown): the selection is measured again. */
  const [size, setSize] = useState(0);

  useEffect(() => {
    const observer = new ResizeObserver(() => setSize((n) => n + 1));
    observer.observe(el.current!);
    return () => observer.disconnect();
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
  }, [root, selected, hover, scale, size, travelling]);

  const kind = (t: Selection) => (t && LAYERS[t.key].instance ? "instance" : undefined);
  const active = boxes.selected.find((b) => b.view === view);

  return (
    <div
      ref={el}
      className={`ht-viewport${travelling ? " is-travelling" : ""}`}
      role="region"
      aria-label="Canvas viewport"
      onPointerDown={(e) => e.button === 0 && onSelect(null, view)}
    >
      <div ref={stage} className="ht-stage" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
        {VIEWS.map((v, i) => (
          // Only the Desktop view travels between the window and the canvas.
          <div key={v.name} className={`ht-canvas${i ? " is-beside" : ""}`} data-view={v.name} style={{ left: FRAME_LEFT[i], width: v.width, visibility: travelling && i ? "hidden" : undefined }}>
            <DemoPage view={v.name} width={v.width} onPick={(path, at) => onSelect(pick(path, selected), at)} onHover={(t) => onHover(t && pick(pathOf(t), selected))} />
          </div>
        ))}
      </div>
      {/* The selection and the views' labels, at rest only: gone while the page travels. */}
      {!travelling && (
        <>
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
        </>
      )}
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
function DesignPanel({ view, selected, root, atRest, onLeave }: { view: ViewName; selected: Selection; root: ShadowRoot; atRest: boolean; onLeave: () => void }) {
  const [size, setSize] = useState<[number, number]>([0, 0]);

  useLayoutEffect(() => {
    if (!selected) return;
    const found = root.querySelector(`[data-view="${view}"] [data-ht="${layerId(selected)}"]`) as HTMLElement | null;
    if (found) setSize([found.offsetWidth, found.offsetHeight]);
    // Measured again once edit mode shows at rest: hidden in preview mode, every layer measures 0.
  }, [root, selected, view, atRest]);

  const header = (
    <div className="ht-panel-header">
      <h2 className="ht-panel-title">{selected ? "Design" : "Variables"}</h2>
      <button type="button" className="ht-icon-button" aria-label="Human Touch: back to preview mode" data-tip="Back to preview mode" onClick={onLeave}>
        <Icon name="close" />
      </button>
    </div>
  );

  if (!selected) {
    return (
      <aside className="ht-panel is-design" aria-label="Design">
        {header}
        <VariablesPanel />
      </aside>
    );
  }

  const key = selected.key;
  const layer = LAYERS[key];
  const style = styleOf(key);

  return (
    <aside className="ht-panel is-design" aria-label="Design">
      {header}
      <DesignSections layer={layer} style={style} icon={iconOf(key)} size={size} badge={view === "Desktop" ? undefined : { range: VIEWS.find((v) => v.name === view)!.range, label: `${view} breakpoint` }} />
    </aside>
  );
}
