"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DemoPage } from "@/components/editor/DemoPage";
import { DesignSections } from "@/components/editor/DesignSections";
import { EDITOR_CSS } from "@/components/editor/editor-css.generated";
import { Icon } from "@/components/editor/Icon";
import { LAYERS, VIEWS, styleOf, type ViewName } from "@/components/editor/model";
import { Handles, Panel, SCENE_CSS, SceneCursor, useFit, usePointer, useShadow, type Aim, type Box, type Step } from "./scene";
import { usePhases } from "./usePhases";

/*
 * The Views card: Acme at Desktop, Tablet and Phone side by side, as the canvas draws them, and the Design panel below
 * (designer, 2026-11-11: the idea as it was, in the product's own parts). The cover is selected in Desktop and its Fill
 * changed: all three views follow. Then it is selected in Phone and its corners rounded: Phone alone changes, and the
 * panel says the breakpoint it applies at.
 */

const SCENE_W = 640;
const SCENE_H = 667;
/** The canvas's zoom: Desktop's 1440px are 259 in the scene. */
const K = 0.18;
const LEFT = 20;
const GAP = 14;
const TOP = 56;
/** Where the views and the panel end: above the card's foot, on a phone's square card too (designer, 2026-11-11). */
const FOOT = 610;
const FRAME_LEFT = VIEWS.map((_, i) => LEFT + VIEWS.slice(0, i).reduce((x, v) => x + v.width * K + GAP, 0));
const FRAME_H = FOOT - TOP;
/** The Design panel at the bottom right, over the narrow views' feet, clear of the covers (designer, 2026-11-11). */
const PANEL = { right: 20, top: 300, width: 320 };
const STONE = String(styleOf("cover").fill);
const MUTED = "#6E6C66";
const RADIUS = 48;
const DRAG_MS = 800;

type Target = { at: [number, number] } | { cover: ViewName } | { panel: string } | { radius: number };
const STEPS: (Step & { aim: Target })[] = [
  /* 0 rest: nothing selected */ { aim: { at: [580, 240] }, move: 500, hold: 700 },
  /* 1 the cover, in Desktop */ { aim: { cover: "Desktop" }, move: 650, hold: 700, click: true },
  /* 2 its Fill's swatch */ { aim: { panel: "Fill color picker" }, move: 550, hold: 450, click: true },
  /* 3 muted: every view follows */ { aim: { panel: "muted" }, move: 350, hold: 1500, click: true },
  /* 4 the cover, in Phone */ { aim: { cover: "Phone" }, move: 750, hold: 800, click: true },
  /* 5 onto the corner radius's icon */ { aim: { radius: 0.08 }, move: 550, hold: 150 },
  /* 6 dragged right: Phone alone rounds */ { aim: { radius: 0.62 }, move: DRAG_MS, hold: 1600, drag: true },
  /* 7 the canvas: nothing selected; hold */ { aim: { at: [575, 200] }, move: 550, hold: 2200, click: true },
];
const DURATIONS = STEPS.map((s) => s.move + s.hold);
/** The pages, drawn again only when their styles change: three Acmes on every step cost a long task. */
const Page = memo(DemoPage);
const none = () => {};
const LAST = STEPS.length - 1;

const VIEWS_CSS = `
.demo-scene { position: absolute; top: 0; right: 0; width: ${SCENE_W}px; height: ${SCENE_H}px; transform-origin: top right; pointer-events: none; }
.demo-scene > .ht-shell { position: absolute; inset: 0; display: block; z-index: auto; background: none; }
/* On the backdrop, the views' labels in white. */
.demo-scene .ht-view-label { color: rgb(255 255 255 / 0.55); }
.demo-scene .ht-view-name { color: rgb(255 255 255 / 0.75); transition: color 150ms; }
.demo-scene .ht-view-name.is-active { color: #fff; }
.demo-frame { position: absolute; top: ${TOP}px; height: ${FRAME_H}px; overflow: hidden; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.25), 0 16px 40px -8px rgb(0 0 0 / 0.5); }
.demo-frame > div { transform-origin: top left; }
.demo-panel { position: absolute; right: ${PANEL.right}px; top: ${PANEL.top}px; width: ${PANEL.width}px; height: ${FOOT - PANEL.top}px; overflow: hidden; padding-bottom: 240px; border-radius: 12px; box-shadow: 0 1px 1px rgb(0 0 0 / 0.15), 0 0 0 0.5px rgb(0 0 0 / 0.15), 0 24px 64px -12px rgb(0 0 0 / 0.55); }
`;

export function DesignPanelDemo() {
  const { ref, phase } = usePhases(DURATIONS, LAST - 1);
  const { host, shadow } = useShadow();
  const scale = useFit(ref, SCENE_W);
  return (
    <div ref={ref} className="absolute inset-0" aria-hidden="true" inert>
      <div ref={host} className="absolute inset-0" />
      {shadow &&
        createPortal(
          <>
            <style>{EDITOR_CSS + SCENE_CSS + VIEWS_CSS}</style>
            <Scene phase={phase} scale={scale} root={shadow} />
          </>,
          shadow as unknown as Element,
        )}
    </div>
  );
}

type Measured = Record<ViewName, { box: Box; size: [number, number] }>;

function Scene({ phase, scale, root }: { phase: number; scale: number; root: ShadowRoot }) {
  const scene = useRef<HTMLDivElement>(null);
  const [covers, setCovers] = useState<Measured | null>(null);
  const coverIn = (view: ViewName) => root.querySelector(`[data-view="${view}"] [data-ht="cover"]`) as HTMLElement | null;

  // Each view's cover: its box in the scene, for the selection, and its size, for the panel.
  useLayoutEffect(() => {
    const measure = () => {
      const s = scene.current?.getBoundingClientRect();
      if (!s) return;
      const k = s.width / SCENE_W;
      const out = {} as Measured;
      for (const v of VIEWS) {
        const el = coverIn(v.name);
        if (!el) return;
        const b = el.getBoundingClientRect();
        out[v.name] = { box: { left: (b.left - s.left) / k, top: (b.top - s.top) / k, width: b.width / k, height: b.height / k }, size: [el.offsetWidth, el.offsetHeight] };
      }
      setCovers(out);
    };
    measure();
    document.fonts?.ready.then(measure);
    // Measured again at a new scale: the boxes are in the scene's units, read off the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const { shown, arrived, cursor, pressed, move } = usePointer({
    phase,
    steps: STEPS,
    root,
    scene,
    width: SCENE_W,
    aim: (index): Aim => {
      const aim = STEPS[index].aim;
      if ("at" in aim) return { x: aim.at[0], y: aim.at[1] };
      if ("cover" in aim) return { el: coverIn(aim.cover), dx: 0.62, dy: 0.5 };
      if ("radius" in aim) return { el: root.querySelector('[aria-label="Corner radius"]')?.closest(".ht-field"), dx: aim.radius, dy: 0.5, inPanel: aim.radius < 0.5 };
      return { el: root.querySelector(`[aria-label="${aim.panel}"]`) ?? [...root.querySelectorAll(".ht-pop button")].find((b) => b.textContent?.startsWith(aim.panel)), dx: 0.5, inPanel: true };
    },
  });

  // The drag: the radius goes up 4px at a time as the pointer goes right.
  const [dragged, setDragged] = useState(0);
  useEffect(() => {
    if (phase !== 6 || arrived) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / DRAG_MS);
      setDragged(Math.round((RADIUS * (1 - (1 - t) ** 2)) / 4) * 4);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, arrived]);

  const view: ViewName | null = shown >= 1 && shown <= 3 ? "Desktop" : shown >= 4 && shown < LAST ? "Phone" : null;
  const fill = shown >= 3 ? MUTED : STONE;
  const radius = phase === 6 && !arrived ? dragged : shown >= 6 ? RADIUS : 0;
  const styles = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.name, { cover: { fill, radius: v.name === "Phone" ? radius : 0 } }])) as Record<ViewName, { cover: { fill: string; radius: number } }>,
    [fill, radius],
  );
  const changed = view === "Desktop" ? (shown >= 3 ? (["fill"] as const) : []) : radius ? (["radius"] as const) : [];

  return (
    <div ref={scene} className="demo-scene" style={{ transform: `scale(${scale})` }}>
      <div className="ht-shell">
        {VIEWS.map((v, i) => (
          <div key={v.name}>
            <div className="ht-view-label" style={{ left: FRAME_LEFT[i], top: TOP - 26, width: v.width * K }}>
              <span className="ht-view-title">
                <span className={`ht-view-name${view === v.name || (!view && i === 0) ? " is-active" : ""}`}>{v.name}</span>
                <span className="ht-view-range">{v.range}</span>
              </span>
              <span className="ht-icon-button ht-view-play">
                <Icon name="fullscreen" />
              </span>
            </div>
            <div className="demo-frame" data-view={v.name} style={{ left: FRAME_LEFT[i], width: v.width * K }}>
              <div style={{ transform: `scale(${K})` }}>
                <Page view={v.name} width={v.width} onPick={none} onHover={none} styles={styles[v.name]} />
              </div>
            </div>
          </div>
        ))}

        {/* The selection: solid in the view it was made in, faint in the others, as the product draws it. */}
        {covers &&
          view &&
          VIEWS.map((v) => (
            <div key={v.name} className="ht-selection" data-away={v.name === view ? undefined : "true"} style={covers[v.name].box} />
          ))}
        {covers && view && <Handles box={covers[view].box} />}

        <Panel
          className="demo-panel"
          layer={view}
          content={
            view && (
              <DesignSections
                layer={LAYERS.cover}
                style={{ ...styleOf("cover"), fill, radius: view === "Phone" ? radius : 0 }}
                icon="frame"
                size={covers?.[view].size ?? [0, 0]}
                badge={view === "Phone" ? { range: VIEWS[2].breakpoint!, label: "Phone breakpoint" } : undefined}
                open={shown === 2 ? "fill" : undefined}
                changed={[...changed]}
                follows
              />
            )
          }
        />
      </div>
      <SceneCursor at={cursor} ms={move} pressed={pressed} />
    </div>
  );
}
