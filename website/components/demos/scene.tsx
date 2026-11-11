"use client";

import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/editor/Icon";
import { followSiteTheme } from "@/components/editor/theme";
import { VariablesPanel } from "@/components/editor/VariablesPanel";
import { PointerShape, TIP } from "./parts";

/*
 * What the demos drawn in Human Touch's own styles share: a shadow root to draw in, a pointer that goes from aim to aim
 * and clicks, the selection's handles, and the Design panel's frame.
 */

export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

/** Styles every scene needs beside the product's: the panel's lists, as the hero draws them, and the pointer. */
export const SCENE_CSS = `
.ht-pop { position: absolute; z-index: 30; padding: 4px; border-radius: 12px; background: var(--ht-panel); box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.06), 0 8px 24px -4px rgb(0 0 0 / 0.12); }
.ht-pop button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; height: 24px; padding: 0 8px; border-radius: 6px; }
.ht-pop .ht-pop-value { margin-left: auto; color: var(--ht-text-muted); font-variant-numeric: tabular-nums; }
.ht-pop .ht-pop-swatch { width: 14px; height: 14px; border-radius: 4px; box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.2); }
.ht-panel-header { padding-top: 16px; }
.demo-cursor { position: absolute; z-index: 40; width: 20px; height: 20px; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.3)); }
`;

/** A shadow root on `host`, made once: the product's styles stay in it, and the site's out. */
export function useShadow() {
  const host = useRef<HTMLDivElement>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    const el = host.current!;
    setShadow(el.shadowRoot ?? el.attachShadow({ mode: "open" }));
    return followSiteTheme(el);
  }, []);
  return { host, shadow };
}

/** The card's width over the scene's: what the scene is scaled by. */
export function useFit(box: React.RefObject<HTMLDivElement | null>, width: number) {
  const [scale, setScale] = useState(0.75);
  useEffect(() => {
    const el = box.current!;
    const fit = () => setScale(el.clientWidth / width);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [box, width]);
  return scale;
}

export type Point = { x: number; y: number };
/** A step: how long the pointer takes to its aim, how long the step holds once there, and whether it clicks or drags. */
export type Step = { move: number; hold: number; click?: boolean; drag?: boolean };
/** Where a step's aim is: a point in the scene, or an element; one in the Design panel is scrolled into sight first. */
export type Aim = Point | { el: Element | null | undefined; dx?: number; dy?: number; inPanel?: boolean } | null;

/**
 * The pointer through the steps. At each, it sets off for the aim, found in what shows now (the step before's); when it
 * gets there it clicks, and the step shows: `shown` is the step showing. A field low in the panel, or under the card's
 * edge, is scrolled up to the middle of what shows of the panel on the way, as a hand would.
 */
export function usePointer({ phase, steps, root, scene, width, aim }: { phase: number; steps: Step[]; root: ShadowRoot; scene: React.RefObject<HTMLDivElement | null>; width: number; aim: (index: number) => Aim }) {
  /** The step the pointer last got to: till it gets to this one's aim, what shows is the step before's. */
  const [arrivedAt, setArrivedAt] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [cursor, setCursor] = useState<Point>({ x: width / 2, y: 400 });
  const step = steps[phase];

  useLayoutEffect(() => {
    const box = scene.current!.getBoundingClientRect();
    const k = box.width / width;
    const target = aim(phase);
    let point: Point | null = null;
    if (target && "x" in target) point = target;
    else if (target?.el) {
      const b = target.el.getBoundingClientRect();
      point = { x: (b.left - box.left + b.width * (target.dx ?? 0.5)) / k, y: (b.top - box.top + b.height * (target.dy ?? 0.55)) / k };
      const panel = root.querySelector(".ht-panel.is-design");
      // The part of the panel in sight: from its top to the card's foot.
      // The card: the host is drawn as its contents, so measured, it is the card it sits in. The panel may end above it.
      const card = (root.host as HTMLElement).parentElement!.getBoundingClientRect().height / k;
      const top = panel ? (panel.getBoundingClientRect().top - box.top) / k : 0;
      const bottom = panel ? Math.min(card, (panel.getBoundingClientRect().bottom - box.top) / k) : card;
      if (target.inPanel && panel && !panel.querySelector(".ht-pop") && point.y > top + (bottom - top) * 0.7) {
        const by = Math.min(Math.round(point.y - (top + (bottom - top) * 0.45)), panel.scrollHeight - panel.clientHeight - panel.scrollTop);
        panel.scrollTo({ top: panel.scrollTop + by, behavior: "smooth" });
        point = { ...point, y: point.y - by };
      }
    }
    if (point) setCursor(point);
    if (phase === 0 || !step.move) {
      setArrivedAt(phase);
      return;
    }
    if (step.drag) setPressed(true);
    const timers = [
      setTimeout(() => {
        setArrivedAt(phase);
        if (step.click) setPressed(true);
        if (step.drag) setPressed(false);
      }, step.move),
      setTimeout(() => step.click && setPressed(false), step.move + 120),
    ];
    return () => timers.forEach(clearTimeout);
    // Only a new step sets it off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const arrived = arrivedAt === phase;
  return { shown: arrived ? phase : Math.max(0, phase - 1), arrived, cursor, pressed, move: step.move };
}

export function SceneCursor({ at, ms, pressed }: { at: Point; ms: number; pressed: boolean }) {
  return (
    <svg
      className="demo-cursor"
      viewBox="0 0 20 20"
      style={{ left: at.x - TIP.x, top: at.y - TIP.y, transformOrigin: `${TIP.x}px ${TIP.y}px`, transition: `left ${ms}ms ${EASE_IN_OUT}, top ${ms}ms ${EASE_IN_OUT}, scale 120ms`, scale: pressed ? 0.9 : 1 }}
    >
      <PointerShape />
    </svg>
  );
}

export type Box = { left: number; top: number; width: number; height: number };

/** The selected layers' handles, as the product places them: corners 8px squares on the box's edges. */
export function Handles({ box }: { box: Box }) {
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

const Variables = memo(VariablesPanel);

/**
 * The Design panel's frame: its header, then the Variables with nothing selected, or a layer's sections (`content`,
 * new for each `layer`, the panel back at its top). The Variables are built once and kept: built again each loop, they
 * held the main thread for some 80ms.
 */
export function Panel({ layer, content, className = "" }: { layer: string | null; content: ReactNode; className?: string }) {
  const el = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    el.current!.scrollTop = 0;
  }, [layer]);
  return (
    <aside ref={el} className={`ht-panel is-design ${className}`} aria-label="Design">
      <div className="ht-panel-header">
        <h2 className="ht-panel-title">{layer ? "Design" : "Variables"}</h2>
        <button type="button" className="ht-icon-button" aria-label="Back to preview mode">
          <Icon name="close" />
        </button>
      </div>
      <div style={{ display: layer ? "none" : "contents" }}>
        <Variables />
      </div>
      <Fragment key={layer ?? "none"}>{layer && content}</Fragment>
    </aside>
  );
}
