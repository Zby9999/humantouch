"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EDITOR_CSS } from "@/components/editor/editor-css.generated";
import { NumberField } from "@/components/editor/fields";
import { Icon } from "@/components/editor/Icon";
import type { IconName } from "@/components/editor/icon-paths";
import { ACME_COLORS } from "@/components/editor/model";
import { usePhases } from "./usePhases";

/*
 * The Canvas card: the top right corner of Human Touch, with a corner of Acme's page on the canvas and the Design panel
 * beside it, holding only what the demo uses (designer, 2026-11-11). A group of texts and a button, loose, are selected
 * and made a Stack with ⇧A; then the button goes from Acme's dark pill to the white, bordered, shadowed button the
 * editor's own panels use: its fill white, a stroke, a drop shadow, and its text in ink. A click on the canvas
 * then leaves it unselected, to be seen as it now is.
 */

/** The scene is drawn at this size, then scaled to the card's width; its left and bottom run on past the card's edges. */
const SCENE_W = 640;
const SCENE_H = 667;
const PANEL = 320;
/** The editor's window in the scene: its top right corner shows, the rest runs off the card. */
const WINDOW = { left: -2, top: 48, right: 40 };
/** The page on the canvas: its left runs off, its right is 40px from the panel. */
const PAGE = { left: -40, top: 56 };
const VIEWPORT_W = SCENE_W - WINDOW.left - WINDOW.right - PANEL;
const PAGE_W = VIEWPORT_W - PAGE.left - 40;

/** From the page to the scene, for the pointer and the marquee. */
const toScene = (x: number, y: number) => ({ x: x + WINDOW.left + PAGE.left, y: y + WINDOW.top + PAGE.top });

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
const SERIF = "var(--font-instrument-serif), Georgia, serif";
const SANS = "var(--font-inter), sans-serif";

type Part = "eyebrow" | "title" | "lede" | "button";
const PARTS: Part[] = ["eyebrow", "title", "lede", "button"];
/** Where each layer is, loose (a little off, as placed by hand) and in the Stack (lined up, 14px apart). */
const LOOSE: Record<Part, [number, number]> = { eyebrow: [88, 102], title: [82, 124], lede: [90, 210], button: [86, 262] };
const STACK_AT: [number, number] = [84, 100];
const STACK_GAP = 14;

/**
 * The steps: where the pointer goes in each (a place on the page, or a field in the panel by its label), how long it
 * takes, and how long the step holds once there. What a step does shows when the pointer arrives.
 */
type Aim = { page: [number, number] } | { panel: string } | { text: true } | { button: true };
const STEPS: { aim: Aim; move: number; hold: number; click?: boolean; keys?: boolean }[] = [
  /* 0 rest */ { aim: { page: [70, 92] }, move: 500, hold: 600 },
  /* 1 marquee: the four selected */ { aim: { page: [254, 300] }, move: 800, hold: 700 },
  /* 2 ⇧A: a Stack */ { aim: { page: [254, 300] }, move: 0, hold: 1300, keys: true },
  /* 3 the button */ { aim: { button: true }, move: 500, hold: 700, click: true },
  /* 4 its fill's swatch */ { aim: { panel: "Fill color picker" }, move: 550, hold: 450, click: true },
  /* 5 white */ { aim: { panel: "white" }, move: 350, hold: 600, click: true },
  /* 6 a stroke */ { aim: { panel: "Add stroke" }, move: 450, hold: 600, click: true },
  /* 7 a drop shadow */ { aim: { panel: "Add effect" }, move: 400, hold: 700, click: true },
  /* 8 its text */ { aim: { text: true }, move: 550, hold: 600, click: true },
  /* 9 the text's swatch */ { aim: { panel: "Fill color picker" }, move: 550, hold: 450, click: true },
  /* 10 ink */ { aim: { panel: "ink" }, move: 350, hold: 900, click: true },
  /* 11 the canvas: nothing selected, the button as it now is; hold */ { aim: { page: [236, 380] }, move: 500, hold: 2200, click: true },
];
const DURATIONS = STEPS.map((s) => s.move + s.hold);
const LAST = STEPS.length - 1;

const SCENE_CSS = `
.demo-scene { position: absolute; top: 0; right: 0; width: ${SCENE_W}px; height: ${SCENE_H}px; transform-origin: top right; pointer-events: none; }
.demo-window { position: absolute; left: ${WINDOW.left}px; top: ${WINDOW.top}px; right: ${WINDOW.right}px; bottom: -40px; overflow: hidden; border-top-right-radius: 12px; box-shadow: 0 1px 1px rgb(0 0 0 / 0.15), 0 0 0 0.5px rgb(0 0 0 / 0.15), 0 24px 64px -12px rgb(0 0 0 / 0.5); }
.demo-window .ht-shell { position: absolute; inset: 0; z-index: auto; }
.demo-window .ht-panel { position: relative; overflow: hidden; }
.demo-window .ht-panel-header { padding-top: 16px; }
.demo-window .ht-canvas { position: absolute; }
.ht-pop { position: absolute; z-index: 30; padding: 4px; border-radius: 12px; background: var(--ht-panel); box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12); }
.ht-pop button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; height: 24px; padding: 0 8px; border-radius: 6px; }
.ht-pop button[data-on] { background: var(--ht-field); }
.ht-pop .ht-pop-value { margin-left: auto; color: var(--ht-text-muted); font-variant-numeric: tabular-nums; }
.ht-pop .ht-pop-swatch { width: 14px; height: 14px; border-radius: 4px; box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.2); }
.demo-marquee { position: absolute; box-sizing: border-box; border: 1px solid var(--ht-accent); background: rgb(0 143 240 / 0.08); }
.demo-cursor { position: absolute; z-index: 40; width: 18px; height: 18px; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)); }
`;

export function CanvasDemo() {
  const { ref, phase } = usePhases(DURATIONS, LAST);
  const host = useRef<HTMLDivElement>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const [scale, setScale] = useState(0.75);

  useEffect(() => {
    const el = host.current!;
    setShadow(el.shadowRoot ?? el.attachShadow({ mode: "open" }));
    const box = ref.current!;
    const fit = () => setScale(box.clientWidth / SCENE_W);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [ref]);

  const keys = STEPS[phase].keys;

  return (
    <div ref={ref} className="absolute inset-0" aria-hidden="true" inert>
      <div ref={host} className="absolute inset-0" />
      {shadow &&
        createPortal(
          <>
            <style>{EDITOR_CSS + SCENE_CSS}</style>
            <Scene phase={phase} scale={scale} root={shadow} />
          </>,
          shadow as unknown as Element,
        )}

      {/* ⇧A, pressed. */}
      <div
        className="absolute bottom-[6%] left-1/2 flex -translate-x-1/2 gap-1 transition-[opacity,translate] duration-300"
        style={{ opacity: keys ? 1 : 0, translate: keys ? "0 0" : "0 6px" }}
      >
        {["⇧", "A"].map((k) => (
          <kbd
            key={k}
            className="grid h-7 min-w-7 place-items-center rounded-[6px] bg-white px-1.5 font-editor text-[13px] text-neutral-800 shadow-[0_1px_0_1px_rgb(0_0_0/0.2),0_0_0_0.5px_rgb(0_0_0/0.15)] transition-transform"
            style={{ transform: keys ? "translateY(1px)" : undefined }}
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

type Size = { w: number; h: number };

function Scene({ phase, scale, root }: { phase: number; scale: number; root: ShadowRoot }) {
  /** The step the pointer last got to the aim of: till it gets to this one's, what shows is the step before's. */
  const [arrivedAt, setArrivedAt] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [cursor, setCursor] = useState(toScene(...(STEPS[0].aim as { page: [number, number] }).page));
  const [sizes, setSizes] = useState<Record<Part | "label", Size> | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);

  // Each layer's size, once its font is in: the Stack and the selection are drawn round them.
  useLayoutEffect(() => {
    const measure = () => {
      const el = page.current;
      if (!el) return;
      const of = (name: string) => {
        const node = el.querySelector(`[data-part="${name}"]`) as HTMLElement;
        return { w: node.offsetWidth, h: node.offsetHeight };
      };
      setSizes({ eyebrow: of("eyebrow"), title: of("title"), lede: of("lede"), button: of("button"), label: of("label") });
    };
    measure();
    document.fonts?.ready.then(measure);
  }, []);

  const step = STEPS[phase];
  const arrived = arrivedAt === phase;
  const shown = arrived ? phase : Math.max(0, phase - 1);

  // At each step: the pointer sets off for its aim, found in what shows now; once there, it clicks, and the step shows.
  useLayoutEffect(() => {
    const aim = step.aim;
    const sceneBox = scene.current!.getBoundingClientRect();
    const k = sceneBox.width / SCENE_W;
    const at = (el: Element | null | undefined, dx = 0.5, dy = 0.5) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: (b.left - sceneBox.left + b.width * dx) / k, y: (b.top - sceneBox.top + b.height * dy) / k };
    };
    const target =
      "page" in aim
        ? toScene(...aim.page)
        : "button" in aim
          ? at(page.current?.querySelector('[data-part="button"]'), 0.8, 0.7)
          : "text" in aim
            ? at(page.current?.querySelector('[data-part="label"]'), 0.6, 0.6)
            : at(root.querySelector(`[aria-label="${aim.panel}"]`) ?? [...root.querySelectorAll(".ht-pop button")].find((b) => b.textContent?.startsWith(aim.panel)), 0.5, 0.55);
    if (target) setCursor(target);
    if (phase === 0 || !step.move) {
      setArrivedAt(phase);
      return;
    }
    const timers = [
      setTimeout(() => {
        setArrivedAt(phase);
        if (step.click) setPressed(true);
      }, step.move),
      setTimeout(() => setPressed(false), step.move + 120),
    ];
    return () => timers.forEach(clearTimeout);
    // Only a new step sets it off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const stacked = shown >= 2;
  const selection: Part[] | "stack" | "button" | "label" | null = shown === 1 ? PARTS : shown === 2 ? "stack" : shown >= 11 ? null : shown >= 8 ? "label" : shown >= 3 ? "button" : null;
  const fillOpen = shown === 4 || shown === 9;
  const white = shown >= 5;
  const stroke = shown >= 6;
  const dropShadow = shown >= 7;
  const ink = shown >= 10;

  // Where each layer is: loose, or one under the other in the Stack.
  const place: Record<Part, [number, number]> = { ...LOOSE };
  if (stacked && sizes) {
    let y = STACK_AT[1];
    for (const p of PARTS) {
      place[p] = [STACK_AT[0], y];
      y += sizes[p].h + STACK_GAP;
    }
  }
  const box = (p: Part) => (sizes ? { left: place[p][0], top: place[p][1], width: sizes[p].w, height: sizes[p].h } : null);
  const stackBox = sizes && {
    left: STACK_AT[0],
    top: STACK_AT[1],
    width: Math.max(...PARTS.map((p) => sizes[p].w)),
    height: PARTS.reduce((h, p) => h + sizes[p].h, 0) + STACK_GAP * (PARTS.length - 1),
  };
  const labelBox = sizes && { left: place.button[0] + (sizes.button.w - sizes.label.w) / 2, top: place.button[1] + (sizes.button.h - sizes.label.h) / 2, width: sizes.label.w, height: sizes.label.h };

  const boxes = !sizes || !selection ? [] : Array.isArray(selection) ? selection.map(box) : [selection === "stack" ? stackBox : selection === "button" ? box("button") : labelBox];
  const union = boxes.length
    ? (() => {
        const bs = boxes.filter(Boolean) as Box[];
        const left = Math.min(...bs.map((b) => b.left));
        const top = Math.min(...bs.map((b) => b.top));
        return { left, top, width: Math.max(...bs.map((b) => b.left + b.width)) - left, height: Math.max(...bs.map((b) => b.top + b.height)) - top };
      })()
    : null;

  const marquee = phase === 1 && !arrived ? { from: toScene(70, 92), to: toScene(254, 300), growing: true } : null;

  const layer = (p: Part, style: CSSProperties, children: ReactNode) => (
    <div data-part={p} style={{ position: "absolute", left: place[p][0], top: place[p][1], transition: `left 320ms ${EASE_OUT}, top 320ms ${EASE_OUT}`, ...style }}>
      {children}
    </div>
  );

  return (
    <div ref={scene} className="demo-scene" style={{ transform: `scale(${scale})` }}>
      <div className="demo-window">
        <div className="ht-shell is-layers-hidden" style={{ ["--ht-design-width" as string]: `${PANEL}px` }}>
          <div className="ht-viewport" style={{ touchAction: "auto" }}>
            {/* A corner of Acme's page. */}
            <div ref={page} className="ht-canvas" style={{ left: PAGE.left, top: PAGE.top, width: PAGE_W, height: 1200, background: "#FAF9F6", fontFamily: SANS, color: "#161614", WebkitFontSmoothing: "antialiased" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, height: 52, alignItems: "center", margin: "0 28px", borderBottom: "1px solid #E4E2DC", fontSize: 10.5, color: "#6E6C66", letterSpacing: "0.01em" }}>
                <span>Journal</span>
                <span>Contact</span>
              </div>
              {layer("eyebrow", { fontSize: 9, lineHeight: "12px", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6E6C66", whiteSpace: "nowrap" }, "Newsletter")}
              {layer(
                "title",
                { fontFamily: SERIF, fontStyle: "italic", fontSize: 30, lineHeight: "33px", letterSpacing: "-0.02em", whiteSpace: "nowrap" },
                <>
                  Letters,
                  <br />
                  once a month.
                </>,
              )}
              {layer("lede", { width: 150, fontSize: 11, lineHeight: "16.5px", color: "#6E6C66" }, "Notes from the studio, and nothing else.")}
              {layer(
                "button",
                {
                  padding: "9px 16px",
                  borderRadius: 9999,
                  background: white ? "#FFFFFF" : "#161614",
                  boxShadow: [stroke ? "inset 0 0 0 0.5px rgb(0 0 0 / 0.1)" : "inset 0 0 0 0.5px rgb(0 0 0 / 0)", dropShadow ? "0 1px 1.5px rgb(0 0 0 / 0.15)" : "0 1px 1.5px rgb(0 0 0 / 0)"].join(", "),
                  transition: `left 320ms ${EASE_OUT}, top 320ms ${EASE_OUT}, background-color 200ms ${EASE_OUT}, box-shadow 200ms ${EASE_OUT}`,
                },
                <p data-part="label" style={{ margin: 0, fontSize: 10.5, lineHeight: "12px", fontWeight: 500, letterSpacing: "0.01em", whiteSpace: "nowrap", color: ink ? "#161614" : "#FAF9F6", transition: `color 200ms ${EASE_OUT}` }}>
                  Subscribe
                </p>,
              )}
            </div>

            {/* The selection: each layer's box, and the handles round them all. */}
            {boxes.map((b, i) => b && <div key={`${String(selection)}${i}`} className="ht-selection" style={moved(b)} />)}
            {union && <Handles box={moved(union)} />}
          </div>

          <DesignPanel shown={shown} fillOpen={fillOpen} white={white} stroke={stroke} dropShadow={dropShadow} ink={ink} />
        </div>
      </div>

      {marquee && <Marquee from={marquee.from} to={marquee.to} ms={STEPS[1].move} />}
      <Cursor at={cursor} ms={step.move} pressed={pressed} />
    </div>
  );
}

type Box = { left: number; top: number; width: number; height: number };

/** A box on the page, moved to the viewport. */
const moved = (b: Box): Box => ({ left: b.left + PAGE.left, top: b.top + PAGE.top, width: b.width, height: b.height });

/** The selected layers' handles, as the product places them: corners 8px squares on the box's edges. */
function Handles({ box }: { box: Box }) {
  const { left: l, top: t, width: w, height: h } = box;
  const corners: [string, number, number][] = [
    ["nw", l, t],
    ["ne", l + w, t],
    ["sw", l, t + h],
    ["se", l + w, t + h],
  ];
  return (
    <div className="ht-handles" aria-hidden="true">
      {corners.map(([name, x, y]) => (
        <div key={name} className="ht-handle" data-handle={name} data-corner={name === "sw" || name === "ne" ? "1" : "-1"} style={{ left: x - 4, top: y - 4, width: 8, height: 8 }} />
      ))}
    </div>
  );
}

/** The marquee, drawn out from where the pointer went down to where it goes. */
function Marquee({ from, to, ms }: { from: { x: number; y: number }; to: { x: number; y: number }; ms: number }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOut(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className="demo-marquee"
      style={{ left: from.x, top: from.y, width: out ? to.x - from.x : 0, height: out ? to.y - from.y : 0, transition: `width ${ms}ms ${EASE_IN_OUT}, height ${ms}ms ${EASE_IN_OUT}` }}
    />
  );
}

function Cursor({ at, ms, pressed }: { at: { x: number; y: number }; ms: number; pressed: boolean }) {
  return (
    <svg
      className="demo-cursor"
      viewBox="0 0 18 18"
      style={{ left: at.x - 2, top: at.y - 1.5, transition: `left ${ms}ms ${EASE_IN_OUT}, top ${ms}ms ${EASE_IN_OUT}, scale 120ms`, scale: pressed ? 0.9 : 1 }}
    >
      <path d="M2 1.5 L2 14.5 L5.6 11.2 L8 16.5 L10.4 15.4 L8.1 10.3 L13 10.3 Z" fill="#0a0a09" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** The Design panel, in the product's markup, with only the sections the demo uses. */
function DesignPanel({ shown, fillOpen, white, stroke, dropShadow, ink }: { shown: number; fillOpen: boolean; white: boolean; stroke: boolean; dropShadow: boolean; ink: boolean }) {
  const header = (
    <div className="ht-panel-header">
      <h2 className="ht-panel-title">Design</h2>
      <button type="button" className="ht-icon-button" aria-label="Back to preview mode">
        <Icon name="close" />
      </button>
    </div>
  );
  if (shown === 0 || shown === LAST) return <aside className="ht-panel is-design">{header}</aside>;
  if (shown === 1)
    return (
      <aside className="ht-panel is-design">
        {header}
        <section className="ht-layer-info">
          <div className="ht-layer-head">
            <h3 className="ht-layer-name">4 layers</h3>
          </div>
        </section>
      </aside>
    );

  const text = shown >= 8;
  const info = (icon: IconName, name: string, type: string, source: string) => (
    <section className="ht-layer-info">
      <div className="ht-layer-head">
        <h3 className="ht-layer-name">
          <Icon name={icon} />
          <span>{name}</span>
        </h3>
      </div>
      <dl>
        <dt>Type</dt>
        <dd>{type}</dd>
        <dt>Source</dt>
        <dd className="ht-source">{source}</dd>
      </dl>
    </section>
  );

  if (shown === 2)
    return (
      <aside className="ht-panel is-design">
        {header}
        {info("stack-vertical", "Stack", "Vertical Stack", "src/App.tsx:24:7")}
        <section className="ht-section">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Layout</h3>
            <button type="button" className="ht-icon-button" aria-label="Dissolve Stack">
              <Icon name="minus" />
            </button>
          </div>
          <div className="ht-row ht-align-row">
            <div className="ht-align" role="radiogroup">
              {Array.from({ length: 9 }, (_, i) => (
                <button key={i} type="button" role="radio" className="ht-align-point" aria-checked={i === 0} />
              ))}
            </div>
            <div className="ht-align-options">
              <div className="ht-variable-slot">
                <NumberField tip="Gap" icon="gap" value={STACK_GAP} />
              </div>
              <div className="ht-row">
                <div className="ht-segmented-field" role="radiogroup">
                  {(["stack-horizontal", "stack-vertical", "grid"] as IconName[]).map((icon) => (
                    <button key={icon} type="button" role="radio" className="ht-icon-button" aria-checked={icon === "stack-vertical"}>
                      <Icon name={icon} />
                    </button>
                  ))}
                </div>
                <button type="button" className="ht-icon-button" aria-pressed="false">
                  <Icon name="wrap" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </aside>
    );

  const fill = text ? (ink ? "ink" : "paper") : white ? "white" : "ink";
  return (
    <aside className="ht-panel is-design">
      {header}
      {text ? info("text", "Text", "Text", "src/App.tsx:29:11") : info("frame", "Button", "Frame", "src/App.tsx:28:9")}
      <section className="ht-section">
        <div className="ht-section-header">
          <h3 className="ht-section-title">Fill</h3>
        </div>
        <div className={text ? undefined : "ht-row ht-paint-row"} style={{ position: "relative" }}>
          <ColorRow name="Fill" variable={fill} />
          {!text && (
            <button type="button" className="ht-icon-button" aria-label="Remove fill">
              <Icon name="minus" />
            </button>
          )}
          {fillOpen && (
            <div className="ht-pop" style={{ top: 28, left: 0, right: 0 }}>
              {ACME_COLORS.map((v) => (
                <button key={v.name} type="button" data-on={v.name === fill ? "" : undefined}>
                  <span className="ht-pop-swatch" style={{ background: v.value }} />
                  {v.name}
                  <span className="ht-pop-value">{v.value}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      {!text && (
        <>
          <section className="ht-section">
            <div className="ht-section-header">
              <h3 className="ht-section-title">Stroke</h3>
              {!stroke && (
                <button type="button" className="ht-icon-button" aria-label="Add stroke">
                  <Icon name="plus" />
                </button>
              )}
            </div>
            {stroke && (
              <>
                <div className="ht-row ht-paint-row">
                  <ColorRow name="Stroke" hex="000000" opacity={10} />
                  <button type="button" className="ht-icon-button" aria-label="Remove stroke">
                    <Icon name="minus" />
                  </button>
                </div>
                <div className="ht-row ht-joined">
                  <NumberField tip="Stroke weight" icon="stroke-weight" value={0.5} />
                  <span className="ht-select-field">
                    <select className="ht-select" aria-label="Stroke style" value="solid" onChange={() => {}}>
                      <option value="solid">Solid</option>
                    </select>
                  </span>
                  <span className="ht-select-field">
                    <select className="ht-select" aria-label="Stroke sides" value="All" onChange={() => {}}>
                      <option>All</option>
                    </select>
                  </span>
                </div>
              </>
            )}
          </section>
          <section className="ht-section">
            <div className="ht-section-header">
              <h3 className="ht-section-title">Effects</h3>
              <button type="button" className="ht-icon-button" aria-label="Add effect">
                <Icon name="plus" />
              </button>
            </div>
            {dropShadow && (
              <div className="ht-effect">
                <div className="ht-row ht-paint-row">
                  <button type="button" className="ht-fold" aria-expanded="false">
                    <Icon name="chevron-down" />
                  </button>
                  <span className="ht-select-field ht-effect-type-field">
                    <select className="ht-select ht-effect-type" aria-label="Shadow 1 type" value="drop" onChange={() => {}}>
                      <option value="drop">Drop shadow</option>
                    </select>
                  </span>
                  <button type="button" className="ht-icon-button" aria-label="Remove shadow 1">
                    <Icon name="minus" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </aside>
  );
}

/** A color row: a Variable by its name, or a hex and its opacity. */
function ColorRow({ name, variable, hex, opacity = 100 }: { name: string; variable?: string; hex?: string; opacity?: number }) {
  const value = variable ? ACME_COLORS.find((c) => c.name === variable)!.value : `#${hex}`;
  return (
    <div className="ht-color-row">
      <div className={`ht-field ht-color-field${variable ? "" : " is-joined"}`}>
        <button type="button" className="ht-swatch ht-swatch-button" aria-label={`${name} color picker`} style={{ ["--ht-swatch" as string]: value }} />
        {variable ? (
          <>
            <button type="button" className="ht-variable-chip-name">
              {variable}
            </button>
            <button type="button" className="ht-icon-button" aria-label={`Detach ${name.toLowerCase()} color variable`}>
              <Icon name="detach" />
            </button>
          </>
        ) : (
          <input type="text" className="ht-input" readOnly value={hex} />
        )}
      </div>
      {!variable && <NumberField tip={`${name} opacity`} className="ht-color-opacity" value={opacity} unit="%" max={100} rolls={false} />}
    </div>
  );
}
