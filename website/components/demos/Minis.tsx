"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DemoPage } from "@/components/editor/DemoPage";
import { EDITOR_CSS } from "@/components/editor/editor-css.generated";
import { Icon } from "@/components/editor/Icon";
import { EASE_IN_OUT, EASE_OUT, Handles, SCENE_CSS, SceneCursor, usePointer, useShadow, type Aim, type Box, type Step } from "./scene";
import { usePhases } from "./usePhases";

/*
 * Two of the small cards' pictures, in the product's own parts, as the big cards' are (designer, 2026-11-11): a Brief
 * written on a layer, and a layer dragged off the canvas and back. (The Variables card's is a video: MiniVideo.) Each
 * scene is drawn at its own size and fitted into its card, whole, in its middle.
 */

const MINI_CSS = `
.mini-scene.ht-shell { position: absolute; inset: auto; left: 50%; top: 50%; display: block; z-index: auto; background: none; pointer-events: none; }
.mini-scene .ht-view-label { color: rgb(255 255 255 / 0.6); }
.mini-scene .ht-view-name { color: rgb(255 255 255 / 0.9); }
.mini-frame { position: absolute; overflow: hidden; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.25), 0 12px 32px -8px rgb(0 0 0 / 0.45); }
.mini-frame > div { transform-origin: top left; }
`;

const Page = memo(DemoPage);
const none = () => {};

/** The card's room over the scene's: the scene fitted whole. */
function useMiniFit(box: React.RefObject<HTMLDivElement | null>, width: number, height: number) {
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = box.current!;
    const fit = () => setK(Math.min(el.clientWidth / width, el.clientHeight / height));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [box, width, height]);
  return k;
}

type SceneProps = { phase: number; root: ShadowRoot; k: number };

function Mini({ steps, still, width, height, css, Scene }: { steps: Step[]; still: number; width: number; height: number; css: string; Scene: (props: SceneProps) => ReactNode }) {
  const durations = useRef(steps.map((s) => s.move + s.hold)).current;
  const { ref, phase } = usePhases(durations, still);
  const { host, shadow } = useShadow();
  const k = useMiniFit(ref, width, height);
  return (
    <div ref={ref} className="absolute inset-0" aria-hidden="true" inert>
      <div ref={host} className="absolute inset-0" />
      {shadow &&
        createPortal(
          <>
            <style>{EDITOR_CSS + SCENE_CSS + MINI_CSS + css}</style>
            <Scene phase={phase} root={shadow} k={k} />
          </>,
          shadow as unknown as Element,
        )}
    </div>
  );
}

/** A layer's box in the scene's units, read off the screen. */
function boxIn(el: Element | null | undefined, scene: HTMLElement | null, width: number): Box | null {
  if (!el || !scene) return null;
  const s = scene.getBoundingClientRect();
  const k = s.width / width;
  const b = el.getBoundingClientRect();
  return { left: (b.left - s.left) / k, top: (b.top - s.top) / k, width: b.width / k, height: b.height / k };
}

/** A view's label, as the canvas draws it over the view. */
function ViewLabel({ left, top, width }: { left: number; top: number; width: number }) {
  return (
    <div className="ht-view-label" style={{ left, top, width }}>
      <span className="ht-view-title">
        <span className="ht-view-name is-active">Phone</span>
        <span className="ht-view-range">≤ 767</span>
      </span>
      <span className="ht-icon-button ht-view-play">
        <Icon name="fullscreen" />
      </span>
    </div>
  );
}

/* ——— Brief ——— */

const BRIEF_W = 380;
const BRIEF_H = 300;
/** The Phone view at this zoom: the card, drawn to it, still reads. */
const BRIEF_Z = 0.8;
const BRIEF_VIEW = { left: 12, top: 34, width: 390 * BRIEF_Z };
const BRIEF_TEXT = "Pressed, it shrinks a little and springs back.";
const BRIEF_TOOLS = [
  { label: "Select", icon: "pointer" },
  { label: "Frame", icon: "frame" },
  { label: "Text", icon: "text" },
  { label: "Brief", icon: "brief-add" },
] as const;
type BriefAim = { at: [number, number] } | { el: string; dx?: number; dy?: number };
const BRIEF_STEPS: (Step & { aim: BriefAim })[] = [
  /* 0 rest */ { aim: { at: [300, 268] }, move: 400, hold: 700 },
  /* 1 the Brief tool */ { aim: { el: '.ht-tools [aria-label="Brief"]' }, move: 650, hold: 350, click: true },
  /* 2 the button: its card opens, written in */ { aim: { el: '[data-ht="button"]', dx: 0.4 }, move: 700, hold: 300, click: true },
  /* 3 the brief, typed */ { aim: { el: '[data-ht="button"]', dx: 0.4 }, move: 0, hold: 2300 },
  /* 4 its arrow sets it */ { aim: { el: ".ht-brief-card-set" }, move: 550, hold: 250, click: true },
  /* 5 set; hold */ { aim: { at: [300, 268] }, move: 600, hold: 2400 },
  /* 6 the card goes, for the loop */ { aim: { at: [300, 268] }, move: 0, hold: 500 },
];

function BriefScene({ phase, root, k }: SceneProps) {
  const scene = useRef<HTMLDivElement>(null);
  const [button, setButton] = useState<Box | null>(null);
  /** The canvas panned up, view and all, as a hand would to reach the button: low in sight, the title over it shown, the card clear of the tools. */
  const [lift, setLift] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const el = root.querySelector<HTMLElement>('[data-ht="button"]');
      const page = root.querySelector<HTMLElement>('.mini-frame [data-ht="page"]');
      if (!el || !page) return;
      setLift(Math.max(0, el.getBoundingClientRect().top - page.getBoundingClientRect().top) / (k * BRIEF_Z) - 228);
      requestAnimationFrame(() => setButton(boxIn(el, scene.current, BRIEF_W)));
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [root, k]);

  const { shown, cursor, pressed, move } = usePointer({
    phase,
    steps: BRIEF_STEPS,
    root,
    scene,
    width: BRIEF_W,
    aim: (i): Aim => {
      const aim = BRIEF_STEPS[i].aim;
      return "at" in aim ? { x: aim.at[0], y: aim.at[1] } : { el: root.querySelector(aim.el), dx: aim.dx, dy: aim.dy };
    },
  });

  // The brief typed a letter at a time.
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (shown !== 3) return setTyped(shown > 3 && shown < 6 ? BRIEF_TEXT.length : 0);
    const start = performance.now();
    const timer = setInterval(() => {
      const n = Math.min(BRIEF_TEXT.length, Math.floor((performance.now() - start) / 38));
      setTyped(n);
      if (n === BRIEF_TEXT.length) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [shown]);

  const tool = shown >= 1 && shown < 5 ? 3 : 0;
  const carded = shown >= 2;
  const writing = shown >= 2 && shown < 5;
  const gone = shown === 6;
  // The card beside the button, 16px off it on the canvas, level with its middle; the line from it to the button's edge.
  const card = button && { left: button.left + button.width + 16 * BRIEF_Z, top: button.top + button.height / 2 - 18 * BRIEF_Z };
  const lineY = button ? button.top + button.height / 2 : 0;

  return (
    <div ref={scene} className="ht-shell mini-scene" style={{ width: BRIEF_W, height: BRIEF_H, transform: `translate(-50%, -50%) scale(${k})` }}>
      <ViewLabel left={BRIEF_VIEW.left} top={BRIEF_VIEW.top - 24 - lift * BRIEF_Z} width={BRIEF_VIEW.width} />
      <div className="mini-frame" style={{ left: BRIEF_VIEW.left, top: BRIEF_VIEW.top - lift * BRIEF_Z, width: BRIEF_VIEW.width, height: BRIEF_H + lift * BRIEF_Z }}>
        <div style={{ transform: `scale(${BRIEF_Z})` }}>
          <Page view="Phone" width={390} onPick={none} onHover={none} hug />
        </div>
      </div>

      {button && carded && !gone && (
        <>
          <div className="ht-selection" style={button} />
          <Handles box={button} />
          <svg className="ht-brief-lines" width="1" height="1" aria-hidden="true" style={{ overflow: "visible" }}>
            <g data-selected="true">
              <path d={`M ${card!.left} ${lineY} H ${button.left + button.width}`} />
              <circle cx={button.left + button.width} cy={lineY} r={2.5} />
            </g>
          </svg>
          <div style={{ position: "absolute", left: card!.left, top: card!.top, transform: `scale(${BRIEF_Z})`, transformOrigin: "0 0" }}>
            <div className="ht-brief-card" data-selected="true" data-writing={writing || undefined} style={{ position: "relative", width: 220 }}>
              <p className="ht-brief-card-text" style={typed ? undefined : { color: "var(--ht-text-muted)" }}>
                {typed ? BRIEF_TEXT.slice(0, typed) : "What should the Agent achieve here?"}
                {writing && <span className="mini-caret" />}
              </p>
              {writing && (
                <button type="button" className="ht-brief-card-set" aria-label="Set brief">
                  <Icon name="arrow-up" />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="ht-tools" role="toolbar" aria-label="Tools" style={{ top: BRIEF_VIEW.top, right: 10 }}>
        <div className="ht-tools-backing is-sliding" aria-hidden="true" style={{ ["--ht-tool-index" as string]: tool }} />
        {BRIEF_TOOLS.map((t, i) => (
          <button key={t.label} type="button" className="ht-icon-button" aria-label={t.label} aria-pressed={tool === i}>
            <Icon name={t.icon} />
          </button>
        ))}
      </div>
      <SceneCursor at={cursor} ms={move} pressed={pressed} />
    </div>
  );
}

const BRIEF_CSS = `
.mini-caret { display: inline-block; width: 1px; height: 13px; margin-left: 1px; vertical-align: -2px; background: var(--ht-accent); animation: mini-blink 1s steps(1) infinite; }
@keyframes mini-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .mini-caret { animation: none; } }
`;

export function BriefMini() {
  return <Mini steps={BRIEF_STEPS} still={5} width={BRIEF_W} height={BRIEF_H} css={BRIEF_CSS} Scene={BriefScene} />;
}

/* ——— Off canvas ——— */

const OFF_W = 400;
const OFF_H = 300;
const OFF_Z = 0.46;
const OFF_VIEW = { left: 20, top: 34, width: 390 * OFF_Z };
/** Where the cover is left, on the stage beside the view. */
const OFF_AT = { left: 224, top: 120 };
type OffAim = { at: [number, number] } | "cover" | "away" | "back";
const OFF_STEPS: (Step & { aim: OffAim })[] = [
  /* 0 rest */ { aim: { at: [330, 268] }, move: 400, hold: 700 },
  /* 1 the cover, selected */ { aim: "cover", move: 700, hold: 300, click: true },
  /* 2 dragged off the view */ { aim: "away", move: 950, hold: 300, drag: true },
  /* 3 the canvas: it waits there */ { aim: { at: [300, 50] }, move: 550, hold: 1500, click: true },
  /* 4 the cover again */ { aim: "cover", move: 650, hold: 250, click: true },
  /* 5 dragged back in */ { aim: "back", move: 950, hold: 300, drag: true },
  /* 6 the canvas; hold */ { aim: { at: [330, 268] }, move: 550, hold: 1600, click: true },
];

function OffCanvasScene({ phase, root, k }: SceneProps) {
  const scene = useRef<HTMLDivElement>(null);
  /** The cover's box in the page, as it was before it left. */
  const home = useRef<Box | null>(null);
  const cover = () => root.querySelector('.mini-frame [data-ht="cover"]');
  const offBox = (): Box => ({ ...OFF_AT, width: home.current?.width ?? 157, height: home.current?.height ?? 120 });

  useLayoutEffect(() => {
    const measure = () => {
      const b = boxIn(cover(), scene.current, OFF_W);
      if (b) home.current = b;
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [root, k]);

  const { shown, arrived, cursor, pressed, move } = usePointer({
    phase,
    steps: OFF_STEPS,
    root,
    scene,
    width: OFF_W,
    aim: (i): Aim => {
      const aim = OFF_STEPS[i].aim;
      if (typeof aim === "object") return { x: aim.at[0], y: aim.at[1] };
      const h = home.current;
      if (!h) return null;
      // Held where it was pressed, at 40% across and down: so it is carried, and so it is put back.
      const grip = (b: Box) => ({ x: b.left + b.width * 0.4, y: b.top + b.height * 0.4 });
      if (aim === "cover") return grip(i >= 4 ? offBox() : h);
      if (aim === "away") return grip(offBox());
      return grip(h);
    },
  });

  // Off the page from the drag out's start to the drag back's end: the page closes up under it, and opens again.
  const out = (phase >= 2 && phase <= 4) || (phase === 5 && !arrived);
  const dragging = (phase === 2 || phase === 5) && !arrived;
  const selected = shown === 1 || shown === 2 || shown === 4 || shown === 5 || dragging;
  const at = !home.current ? null : dragging ? (phase === 2 ? offBox() : home.current) : out ? offBox() : home.current;

  // The layers below the cover slide to their new places, as the page closes up or opens.
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const page = root.querySelector('.mini-frame [data-ht="page"]');
    if (!page) return;
    const next = new Map<string, number>();
    for (const el of page.querySelectorAll<HTMLElement>(":scope > [data-ht]")) {
      const id = el.dataset.ht!;
      const top = el.offsetTop;
      const was = tops.current.get(id);
      if (was !== undefined && was !== top) el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: 320, easing: EASE_OUT });
      next.set(id, top);
    }
    tops.current = next;
  }, [out, root]);

  return (
    <div ref={scene} className="ht-shell mini-scene" style={{ width: OFF_W, height: OFF_H, transform: `translate(-50%, -50%) scale(${k})` }}>
      <ViewLabel left={OFF_VIEW.left} top={OFF_VIEW.top - 24} width={OFF_VIEW.width} />
      <div className="mini-frame" style={{ left: OFF_VIEW.left, top: OFF_VIEW.top, width: OFF_VIEW.width, height: OFF_H }}>
        <div style={{ transform: `scale(${OFF_Z})` }}>
          <Page view="Phone" width={390} onPick={none} onHover={none} hug without={out ? "cover" : undefined} />
        </div>
      </div>

      {/* The cover off the page: carried, or left on the stage as it looks, on nothing of its own (ADR 0009). */}
      {out && at && (
        <div
          className="mini-carried"
          style={{ left: at.left, top: at.top, width: at.width, height: at.height, transition: dragging ? `left ${move}ms ${EASE_IN_OUT}, top ${move}ms ${EASE_IN_OUT}` : "none" }}
        >
          {/* The page itself, cut to the cover: the cover as it looks. */}
          <div style={{ transform: `translate(${OFF_VIEW.left - home.current!.left}px, ${OFF_VIEW.top - home.current!.top}px) scale(${OFF_Z})` }}>
            <Page view="Phone" width={390} onPick={none} onHover={none} hug />
          </div>
        </div>
      )}
      {selected && at && (
        <>
          <div className="ht-selection" style={{ ...at, transition: dragging ? `left ${move}ms ${EASE_IN_OUT}, top ${move}ms ${EASE_IN_OUT}` : "none" }} />
          {!dragging && <Handles box={at} />}
        </>
      )}
      <SceneCursor at={cursor} ms={move} pressed={pressed} />
    </div>
  );
}

const OFF_CSS = `
.mini-carried { position: absolute; overflow: hidden; }
.mini-carried > div { transform-origin: top left; }
`;

export function OffCanvasMini() {
  return <Mini steps={OFF_STEPS} still={3} width={OFF_W} height={OFF_H} css={OFF_CSS} Scene={OffCanvasScene} />;
}
