"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EDITOR_CSS } from "@/components/editor/editor-css.generated";
import { DesignSections } from "@/components/editor/DesignSections";
import type { Layer } from "@/components/editor/model";
import { EASE_IN_OUT, EASE_OUT, Handles, Panel, SCENE_CSS, SceneCursor, useFit, usePointer, useShadow, type Aim, type Box, type Step } from "./scene";
import { usePhases } from "./usePhases";

/*
 * The Canvas card: the top right corner of Human Touch, with a corner of Acme's page on the canvas and the Design panel
 * beside it, holding only what the demo uses (designer, 2026-11-11). It opens on Acme's page as it is, in preview mode,
 * Human Touch's toggle at its top right; the toggle is pressed and the page shrinks into its place on the canvas, the
 * Design panel coming in from the right, as the product switches into edit mode (designer, 2026-11-12: the demo starts
 * there, for "edit the page itself" to read). Then a group of texts and a button, loose, are selected
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
const WINDOW_W = SCENE_W - WINDOW.left - WINDOW.right;
const VIEWPORT_W = WINDOW_W - PANEL;
const PAGE_W = VIEWPORT_W - PAGE.left - 40;

/** From the page to the scene, for the pointer and the marquee. */
const toScene = (x: number, y: number) => ({ x: x + WINDOW.left + PAGE.left, y: y + WINDOW.top + PAGE.top });

const SERIF = "var(--font-instrument-serif), Georgia, serif";
const SANS = "var(--font-inter), sans-serif";

type Part = "eyebrow" | "title" | "lede" | "button";
const PARTS: Part[] = ["eyebrow", "title", "lede", "button"];
/** Where each layer is, loose (a little off, as placed by hand) and in the Stack (lined up, 14px apart). */
const LOOSE: Record<Part, [number, number]> = { eyebrow: [88, 102], title: [82, 124], lede: [90, 210], button: [86, 262] };
const STACK_AT: [number, number] = [84, 100];
/** The canvas is at 75%: the page is drawn at three quarters of the sizes the panel gives. */
const ZOOM = 0.75;
const STACK_GAP = 12;
/**
 * Preview mode: the page at 1:1 over the whole window, from its top, its left run off as far as on the canvas, its right
 * at the window's: drawn at the canvas's sizes, scaled up by 1 / ZOOM, and as wide as that takes.
 */
const PREVIEW_W = WINDOW_W * ZOOM - PAGE.left;
const PREVIEW_AT = `translate(${PAGE.left / ZOOM - PAGE.left}px, ${-PAGE.top}px) scale(${1 / ZOOM})`;
/** The mode switch, as the product plays it (CanvasView.tsx, the hero's too): 240ms, eased in and out. */
const MODE_SWITCH_MS = 240;

/**
 * The steps: where the pointer goes in each (a place on the page, or a field in the panel by its label), how long it
 * takes, and how long the step holds once there. What a step does shows when the pointer arrives.
 */
type Target = { page: [number, number] } | { scene: [number, number] } | { panel: string } | { text: true } | { button: true } | { toggle: true };
const STEPS: (Step & { aim: Target; keys?: boolean })[] = [
  /* -2 preview mode: the page as it is */ { aim: { scene: [430, 330] }, move: 0, hold: 900 },
  /* -1 the toggle: edit mode */ { aim: { toggle: true }, move: 650, hold: 700, click: true },
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
/** The steps before the first on the canvas: preview mode, then the toggle. The steps after are numbered from there. */
const INTRO = 2;
const DURATIONS = STEPS.map((s) => s.move + s.hold);
const LAST = STEPS.length - 1;

const CANVAS_CSS = `
.demo-scene { position: absolute; top: 0; right: 0; width: ${SCENE_W}px; height: ${SCENE_H}px; transform-origin: top right; pointer-events: none; }
.demo-window { position: absolute; left: ${WINDOW.left}px; top: ${WINDOW.top}px; right: ${WINDOW.right}px; bottom: -40px; overflow: hidden; border-top-right-radius: 12px; box-shadow: 0 1px 1px rgb(0 0 0 / 0.15), 0 0 0 0.5px rgb(0 0 0 / 0.15), 0 24px 64px -12px rgb(0 0 0 / 0.5); }
.demo-window .ht-shell { position: absolute; inset: 0; z-index: auto; grid-template-rows: minmax(0, 1fr); }
/* Room at its foot, under the card's edge, for its last fields to scroll up into sight. */
.demo-window .ht-panel { position: relative; overflow: hidden; padding-bottom: 240px; }
.demo-window .ht-canvas { position: absolute; transform-origin: top left; }
/* In preview mode the page runs on over where the panel is, off the window. */
.demo-window .ht-viewport { overflow: visible; }
.demo-window .ht-dock { position: absolute; }
.demo-marquee { position: absolute; box-sizing: border-box; border: 1px solid var(--ht-accent); background: rgb(0 143 240 / 0.08); }
`;

export function CanvasDemo() {
  const { ref, phase } = usePhases(DURATIONS, LAST);
  const { host, shadow } = useShadow();
  const scale = useFit(ref, SCENE_W);

  const keys = STEPS[phase].keys;

  // Round again: the page as it is, faded in, not travelling back out of edit mode with its changes undone on the way.
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === 0) card.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: EASE_OUT });
  }, [phase]);

  return (
    <div ref={ref} className="absolute inset-0" aria-hidden="true" inert>
      <div ref={card} className="absolute inset-0">
        <div ref={host} className="absolute inset-0" />
      </div>
      {shadow &&
        createPortal(
          <>
            <style>{EDITOR_CSS + SCENE_CSS + CANVAS_CSS}</style>
            <Scene phase={phase} scale={scale} root={shadow} />
          </>,
          shadow as unknown as Element,
        )}

      {/* ⇧A, pressed: over the canvas, clear of the panel. */}
      <div
        className="absolute bottom-[6%] left-[22%] flex -translate-x-1/2 gap-1 transition-[opacity,translate] duration-300"
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
type Sizes = Record<Part | "label", Size>;

function Scene({ phase, scale, root }: { phase: number; scale: number; root: ShadowRoot }) {
  const [sizes, setSizes] = useState<Sizes | null>(null);
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

  const { shown, arrived, cursor, pressed, move } = usePointer({
    phase,
    steps: STEPS,
    root,
    scene,
    width: SCENE_W,
    aim: (index): Aim => {
      const aim = STEPS[index].aim;
      if ("page" in aim) return toScene(...aim.page);
      if ("scene" in aim) return { x: aim.scene[0], y: aim.scene[1] };
      if ("toggle" in aim) return { el: root.querySelector(".ht-toggle"), dx: 0.55, dy: 0.6 };
      if ("button" in aim) return { el: page.current?.querySelector('[data-part="button"]'), dx: 0.8, dy: 0.7 };
      if ("text" in aim) return { el: page.current?.querySelector('[data-part="label"]'), dx: 0.6, dy: 0.6 };
      return { el: root.querySelector(`[aria-label="${aim.panel}"]`) ?? [...root.querySelectorAll(".ht-pop button")].find((b) => b.textContent?.startsWith(aim.panel)), dx: 0.5, inPanel: true };
    },
  });

  // The step showing, counted from the first on the canvas: below 0, preview mode; from -1, the toggle pressed, edit mode.
  const at = shown - INTRO;
  const editing = at >= -1;
  /** Round again, nothing travels: it is as it was. */
  const still = phase === 0;
  const stacked = at >= 2;
  const selection: Part[] | "stack" | "button" | "label" | null = at === 1 ? PARTS : at === 2 ? "stack" : at >= 11 ? null : at >= 8 ? "label" : at >= 3 ? "button" : null;
  const fillOpen = at === 4 || at === 9;
  const white = at >= 5;
  const stroke = at >= 6;
  const dropShadow = at >= 7;
  const ink = at >= 10;

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

  const marquee = phase === INTRO + 1 && !arrived ? { from: toScene(70, 92), to: toScene(254, 300), growing: true } : null;
  const travel = still ? "none" : `${MODE_SWITCH_MS}ms ${EASE_IN_OUT}`;

  const layer = (p: Part, style: CSSProperties, children: ReactNode) => (
    <div data-part={p} style={{ position: "absolute", left: place[p][0], top: place[p][1], transition: still ? "none" : `left 320ms ${EASE_OUT}, top 320ms ${EASE_OUT}`, ...style }}>
      {children}
    </div>
  );

  return (
    <div ref={scene} className="demo-scene" style={{ transform: `scale(${scale})` }}>
      <div className="demo-window">
        <div className="ht-shell is-layers-hidden" style={{ ["--ht-design-width" as string]: `${PANEL}px` }}>
          <div className="ht-viewport" style={{ touchAction: "auto" }}>
            {/* A corner of Acme's page. */}
            <div
              ref={page}
              className="ht-canvas"
              style={{
                left: PAGE.left,
                top: PAGE.top,
                width: editing ? PAGE_W : PREVIEW_W,
                height: 1200,
                transform: editing ? "none" : PREVIEW_AT,
                transition: still ? "none" : `transform ${travel}, width ${travel}`,
                background: "#FAF9F6",
                fontFamily: SANS,
                color: "#161614",
                WebkitFontSmoothing: "antialiased",
              }}
            >
              {/* In preview mode its links leave room for the toggle at the window's corner. */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, height: 52, alignItems: "center", margin: "0 28px", paddingRight: editing ? 0 : 40, transition: still ? "none" : `padding ${travel}`, borderBottom: "1px solid #E4E2DC", fontSize: 10.5, color: "#6E6C66", letterSpacing: "0.01em" }}>
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
              {layer("lede", { width: 150, fontSize: 10.5, lineHeight: "16px", color: "#6E6C66" }, "Notes from the studio, and nothing else.")}
              {layer(
                "button",
                {
                  padding: "9px 15px",
                  borderRadius: 9999,
                  background: white ? "#FFFFFF" : "#161614",
                  boxShadow: [stroke ? "inset 0 0 0 0.5px rgb(0 0 0 / 0.1)" : "inset 0 0 0 0.5px rgb(0 0 0 / 0)", dropShadow ? "0 1px 1.5px rgb(0 0 0 / 0.15)" : "0 1px 1.5px rgb(0 0 0 / 0)"].join(", "),
                  transition: still ? "none" : `left 320ms ${EASE_OUT}, top 320ms ${EASE_OUT}, background-color 200ms ${EASE_OUT}, box-shadow 200ms ${EASE_OUT}`,
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

          <DesignPanel at={at} sizes={sizes} fillOpen={fillOpen} white={white} stroke={stroke} dropShadow={dropShadow} ink={ink} style={{ translate: editing ? "0 0" : `${PANEL}px 0`, transition: still ? "none" : `translate ${travel}` }} />
        </div>

        {/* Human Touch's toggle, at the window's top right as the product can dock it: in preview mode only. */}
        <div className="ht-dock" data-corner="top-right" style={{ opacity: editing ? 0 : 1, transition: still ? "none" : `opacity 150ms ${EASE_OUT}` }}>
          <div className="ht-toggle-wrap">
            <div className="ht-toggle" style={{ scale: pressed && at === -1 ? 0.96 : 1, transition: "scale 120ms ease-out" }}>
              <svg width="13.5" height="13.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.24" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.05 5.15a.55.55 0 0 0-2.19-2.19L3.51 10.3a1.1 1.1 0 0 0-.27.46l-.73 2.39a.28.28 0 0 0 .34.34l2.39-.73a1.1 1.1 0 0 0 .46-.27zM9.65 4.15l2.2 2.2" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {marquee && <Marquee from={marquee.from} to={marquee.to} ms={STEPS[INTRO + 1].move} />}
      <SceneCursor at={cursor} ms={move} pressed={pressed} />
    </div>
  );
}

/** A box on the page, moved to the viewport. */
const moved = (b: Box): Box => ({ left: b.left + PAGE.left, top: b.top + PAGE.top, width: b.width, height: b.height });

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

/** The Design panel, the product's, as the hero draws it: the Variables with nothing selected, a layer's design with one. */
function DesignPanel({ at, sizes, fillOpen, white, stroke, dropShadow, ink, style }: { at: number; sizes: Sizes | null; fillOpen: boolean; white: boolean; stroke: boolean; dropShadow: boolean; ink: boolean; style: CSSProperties }) {
  const nothing = at <= 0 || at === LAST - INTRO;
  /** A size as the panel gives it: the canvas is at 75%. */
  const real = (n: number) => Math.round(n / ZOOM);
  const sizeOf = (s: Size | undefined): [number, number] => (s ? [real(s.w), real(s.h)] : [0, 0]);

  let content: ReactNode;
  let key: string;
  if (nothing) {
    key = "variables";
    content = null;
  } else if (at === 1) {
    key = "four";
    content = (
      <section className="ht-layer-info" aria-label="Selected layers">
        <div className="ht-layer-head">
          <h3 className="ht-layer-name">4 layers</h3>
        </div>
      </section>
    );
  } else if (at === 2) {
    key = "stack";
    const stack = sizes && { w: Math.max(...PARTS.map((p) => sizes[p].w)), h: PARTS.reduce((h, p) => h + sizes[p].h, 0) + STACK_GAP * (PARTS.length - 1) };
    content = <DesignSections layer={STACK} style={{ gap: real(STACK_GAP), padding: [0, 0, 0, 0], direction: "column", opacity: 100 }} icon="stack-vertical" size={sizeOf(stack ?? undefined)} />;
  } else if (at < 8) {
    key = "button";
    content = (
      <DesignSections
        layer={{ ...BUTTON, stroke: stroke ? { color: "#000000", opacity: 10, weight: 0.5, sides: "All" } : undefined }}
        style={{ fill: white ? "#FFFFFF" : "#161614", radius: 9999, padding: [12, 20, 12, 20], opacity: 100 }}
        icon="frame"
        size={sizeOf(sizes?.button)}
        shadows={dropShadow ? 1 : 0}
        open={fillOpen ? "fill" : undefined}
      />
    );
  } else {
    key = "label";
    content = <DesignSections layer={LABEL} style={{ fontSize: 14, color: ink ? "#161614" : "#FAF9F6", opacity: 100 }} icon="text" size={sizeOf(sizes?.label)} open={fillOpen ? "fill" : undefined} />;
  }
  return <Panel layer={nothing ? null : key} content={content} style={style} />;
}

const STACK: Layer = { name: "Stack", kind: "stack", source: "src/App.tsx:24:7", sizing: ["Hug", "Hug"] };
const BUTTON: Layer = { name: "Button", kind: "frame", source: "src/App.tsx:28:9", sizing: ["Hug", "Hug"] };
const LABEL: Layer = { name: "Subscribe", kind: "text", source: "src/App.tsx:29:11", sizing: ["Hug", "Hug"], weight: "Medium", font: "Inter" };
