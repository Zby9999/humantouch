"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DemoPage } from "@/components/editor/DemoPage";
import { EDITOR_CSS } from "@/components/editor/editor-css.generated";
import { styleOf } from "@/components/editor/model";
import { EASE_OUT, SCENE_CSS, useFit, useShadow } from "./scene";
import { usePhases } from "./usePhases";

/*
 * The Apply card (designer, 2026-11-11: the idea as it was, in the product's own parts). The designer tells the Agent
 * "Apply my design changes" in a chat, plain, no terminal (designer, 2026-11-12); Acme, in the browser below, has Human
 * Touch's toggle in its corner. The Agent's steps come in one under the other as it works; the toggle locks, its ring
 * fills as the Agent is done with each change, and the change list, opened by itself, lets each go as the page shows
 * it. Then the Agent's answer, in the form `finish` gives: every change applied (designer, 2026-11-12: no change left
 * not 1:1 in the demo).
 */

const SCENE_W = 640;
const SCENE_H = 667;
/** The browser: Acme at 1280 wide, its Desktop layout, drawn at this zoom. */
const PAGE_W = 1280;
/** The browser: as far from the card's left as from its foot (designer, 2026-11-12); its height is what that leaves. */
const BROWSER = { left: 20, top: 200, width: 440 };
const BROWSER_GAP = 20;
const K = BROWSER.width / PAGE_W;
const CHROME_H = 26;
/** The toggle and its list, at three quarters of their size: drawn to the page's zoom they would be too small to read. */
const DOCK_SCALE = 0.75;
const CHAT = { left: 250, top: 20, width: 370, height: 300 };
const PROMPT = "Apply my design changes";

const STONE = String(styleOf("cover").fill);
const MUTED = "#6E6C66";

/** The round: as the change list names each change, by what it is and the layer's name. */
const CHANGES = [
  { id: 1, name: "Fill · Cover" },
  { id: 2, name: "Corner radius · Cover" },
  { id: 3, name: "Font size · Acme makes tools for the slow parts of work: notes, drafts and the quiet hours between." },
];

/** The steps, and how long each holds. */
const STEPS = [
  /* 0 rest: three changes not applied yet */ 1000,
  /* 1 the designer types */ 1300,
  /* 2 the Agent claims: the toggle locks, the list opens */ 1000,
  /* 3 it edits */ 800,
  /* 4 done 1 2: the cover changes */ 1100,
  /* 5 done 3: the lede changes */ 1100,
  /* 6 finish: the toggle unlocks */ 700,
  /* 7 the report; hold */ 3400,
];
const LAST = STEPS.length - 1;

/** The Agent's steps in the chat: each comes in at its step, working, and is done at the next. */
const WORK: { at: number; doing: string; done: string }[] = [
  { at: 2, doing: "Reading your changes in Human Touch", done: "Read 3 changes in Human Touch" },
  { at: 3, doing: "Editing app/page.tsx", done: "Edited app/page.tsx" },
  { at: 4, doing: "Checking the cover on the page", done: "Checked the cover: it shows both changes" },
  { at: 5, doing: "Checking the text on the page", done: "Checked the text: it shows the change" },
];

const APPLY_CSS = `
.demo-scene { position: absolute; top: 0; right: 0; width: ${SCENE_W}px; height: ${SCENE_H}px; transform-origin: top right; pointer-events: none; }
.demo-window { position: absolute; overflow: hidden; border-radius: 10px; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.3), 0 24px 64px -12px rgb(0 0 0 / 0.55); }
.demo-chrome { display: flex; align-items: center; gap: 6px; height: ${CHROME_H}px; padding: 0 10px; box-sizing: border-box; font: 500 10px/1 var(--font-geist), system-ui, sans-serif; }
.demo-dot { width: 8px; height: 8px; border-radius: 50%; background: rgb(128 128 128 / 0.35); }
.demo-address { width: 150px; margin-left: 14px; height: 16px; padding: 0 8px; border-radius: 5px; display: flex; align-items: center; color: #737472; background: #ededec; }
.demo-browser { background: #f5f5f5; }
.demo-viewport { position: absolute; left: 0; right: 0; top: ${CHROME_H}px; bottom: 0; overflow: hidden; background: #FAF9F6; }
.demo-viewport > .demo-page { position: absolute; left: 0; top: 0; transform-origin: top left; }
.demo-viewport .ht-dock { position: absolute; z-index: 2; transform: scale(${DOCK_SCALE}); transform-origin: bottom right; --ht-gap: ${16 / DOCK_SCALE}px; }
/* The chat, light as the browser. */
.demo-chat { background: #fff; color: #1e1e1e; border-radius: 12px; font-family: var(--font-geist), system-ui, sans-serif; }
.demo-chat .demo-chrome { color: #737472; background: #fff; box-shadow: inset 0 -0.5px 0 #ededec; }
.demo-thread { position: absolute; left: 0; right: 0; top: ${CHROME_H}px; bottom: 50px; display: flex; flex-direction: column; justify-content: flex-end; gap: 7px; padding: 10px 14px 6px; overflow: hidden; mask-image: linear-gradient(to bottom, transparent 4px, #000 28px); font-size: 11px; line-height: 16px; }
.demo-line { animation: demo-line-in 240ms ${EASE_OUT} both; }
.demo-you { align-self: flex-end; max-width: 75%; padding: 6px 10px; border-radius: 12px 12px 4px 12px; background: #f0f0ef; }
.demo-step { display: flex; align-items: center; gap: 7px; color: #737472; font-size: 10.5px; line-height: 14px; }
.demo-step svg { flex: none; width: 10px; height: 10px; }
.demo-spinner { flex: none; box-sizing: border-box; width: 10px; height: 10px; border-radius: 50%; border: 1.25px solid #d4d4d3; border-top-color: #737472; animation: demo-spin 700ms linear infinite; }
.demo-answer { display: flex; flex-direction: column; gap: 4px; padding-top: 3px; }
.demo-answer p { margin: 0; }
.demo-answer ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; }
.demo-answer li { display: flex; gap: 6px; color: #525351; }
.demo-answer li > span:first-child { flex: none; width: 12px; text-align: center; }
.demo-composer { position: absolute; left: 10px; right: 10px; bottom: 10px; height: 32px; display: flex; align-items: center; gap: 6px; padding: 0 5px 0 10px; border-radius: 10px; box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.16), 0 1px 2px rgb(0 0 0 / 0.04); font-size: 11px; }
.demo-composer-text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; }
.demo-composer-text.is-empty { color: #a3a3a2; }
.demo-send { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: #fff; background: #d4d4d3; transition: background-color 150ms ${EASE_OUT}; }
.demo-send.is-ready { background: #1e1e1e; }
.demo-caret { display: inline-block; width: 1px; height: 13px; margin-left: 1px; vertical-align: -2px; background: #1e1e1e; animation: demo-blink 1s steps(1) infinite; }
@keyframes demo-line-in { from { opacity: 0; transform: translateY(4px); } }
@keyframes demo-blink { 50% { opacity: 0; } }
@keyframes demo-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .demo-line, .demo-caret, .demo-spinner { animation: none; } }
`;

export function ApplyDemo() {
  const { ref, phase } = usePhases(STEPS, LAST);
  const { host, shadow } = useShadow();
  const scale = useFit(ref, SCENE_W);
  // What shows of the scene, in its own units: the card is as tall as wide below 768px, 500px tall above.
  const [shownH, setShownH] = useState(SCENE_H);
  useEffect(() => {
    const el = ref.current!;
    const measure = () => setShownH(el.clientHeight / (el.clientWidth / SCENE_W));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return (
    <div ref={ref} className="absolute inset-0" aria-hidden="true" inert>
      <div ref={host} className="absolute inset-0" />
      {shadow &&
        createPortal(
          <>
            <style>{EDITOR_CSS + SCENE_CSS + APPLY_CSS}</style>
            <Scene phase={phase} scale={scale} browserH={Math.round(Math.min(SCENE_H, shownH) - BROWSER_GAP - BROWSER.top)} />
          </>,
          shadow as unknown as Element,
        )}
    </div>
  );
}

/** The page, drawn again only when its styles change. */
const Page = memo(DemoPage);
const none = () => {};

function Scene({ phase, scale, browserH }: { phase: number; scale: number; browserH: number }) {
  // The prompt, typed a letter at a time.
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (phase !== 1) return setTyped(phase > 1 ? PROMPT.length : 0);
    const start = performance.now();
    const timer = setInterval(() => {
      const n = Math.min(PROMPT.length, Math.floor((performance.now() - start) / 40));
      setTyped(n);
      if (n === PROMPT.length) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [phase]);

  const applying = phase >= 2 && phase <= 5;
  const done = phase >= 5 ? 3 : phase >= 4 ? 2 : 0;
  const remaining = phase >= 2 ? CHANGES.slice(done) : CHANGES;
  const styles = useMemo(
    () => ({ cover: { fill: phase >= 4 ? MUTED : STONE, radius: phase >= 4 ? 24 : 0 }, lede: { fontSize: phase >= 5 ? 18 : 20 } }),
    [phase >= 4, phase >= 5], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="demo-scene" style={{ transform: `scale(${scale})` }}>
      {/* The browser, Acme in it, Human Touch's toggle in its corner. */}
      <div className="demo-window demo-browser" style={{ left: BROWSER.left, top: BROWSER.top, width: BROWSER.width, height: browserH }}>
        <div className="demo-chrome">
          <span className="demo-dot" />
          <span className="demo-dot" />
          <span className="demo-dot" />
          <span className="demo-address">localhost:3000</span>
        </div>
        <div className="demo-viewport">
          <div className="demo-page" style={{ width: PAGE_W, transform: `scale(${K})` }}>
            <Page view="Desktop" width={PAGE_W} onPick={none} onHover={none} styles={styles} />
          </div>
          <Dock count={phase >= 6 ? 0 : remaining.length} applying={applying ? done : null} rows={applying ? remaining : null} />
        </div>
      </div>

      {/* The chat: the designer's words, the Agent's steps as it works, and its answer. */}
      <div className="demo-window demo-chat" style={{ left: CHAT.left, top: CHAT.top, width: CHAT.width, height: CHAT.height }}>
        <div className="demo-chrome">
          <span className="demo-dot" />
          <span className="demo-dot" />
          <span className="demo-dot" />
          <span style={{ marginLeft: 10 }}>Agent</span>
        </div>
        <div className="demo-thread">
          {phase >= 2 && <div className="demo-line demo-you">{PROMPT}</div>}
          {WORK.filter((w) => w.at <= phase).map((w) => {
            const working = phase === w.at;
            return (
              <div key={w.at} className="demo-line demo-step">
                {working ? <span className="demo-spinner" /> : <Check />}
                {working ? w.doing : w.done}
              </div>
            );
          })}
          {phase >= 7 && (
            <div className="demo-line demo-answer">
              <p>Applied all 3 of your changes, each checked on the page.</p>
              <ul>
                <li>
                  <span>✓</span>
                  <span>The cover: fill stone → muted, corners 0 → 24</span>
                </li>
                <li>
                  <span>✓</span>
                  <span>The text: font size 20 → 18</span>
                </li>
              </ul>
            </div>
          )}
        </div>
        <div className="demo-composer">
          <span className={`demo-composer-text${phase === 1 && typed ? "" : " is-empty"}`}>
            {phase === 1 && typed ? PROMPT.slice(0, typed) : "Ask your Agent"}
            {phase === 1 && typed > 0 && <span className="demo-caret" />}
          </span>
          <span className={`demo-send${phase === 1 && typed === PROMPT.length ? " is-ready" : ""}`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 8.5v-7M2 4.5l3-3 3 3" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

/** A step done. */
function Check() {
  return (
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5.2l2 2 4-4.4" />
    </svg>
  );
}

type Change = (typeof CHANGES)[number];

/**
 * Human Touch's toggle, as the product draws it (Toggle.tsx): the count of changes not applied after it; while the Agent
 * applies the round, locked, its ring filling as each is done, and the change list open by itself (ChangeList.tsx), the
 * one it is at marked, each leaving as the page shows it while those after rise into its place.
 */
function Dock({ count, applying, rows }: { count: number; applying: number | null; rows: Change[] | null }) {
  return (
    <div className="ht-dock" data-corner="bottom-right">
      <div className="ht-toggle-wrap">
        <button type="button" className="ht-toggle" aria-label="Human Touch" aria-disabled={applying !== null ? "true" : undefined}>
          <svg width="13.5" height="13.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13.05 5.15a.55.55 0 0 0-2.19-2.19L3.51 10.3a1.1 1.1 0 0 0-.27.46l-.73 2.39a.28.28 0 0 0 .34.34l2.39-.73a1.1 1.1 0 0 0 .46-.27zM9.65 4.15l2.2 2.2" />
          </svg>
        </button>
        {count > 0 && (
          <button type="button" className="ht-toggle-count">
            {count}
          </button>
        )}
        {applying !== null && (
          <svg className="ht-progress" viewBox="0 0 36 36">
            <rect className="ht-progress-track" pathLength={1} />
            <rect className="ht-progress-done" pathLength={1} style={{ strokeDashoffset: 1 - applying / CHANGES.length }} />
          </svg>
        )}
      </div>
      <ChangeList rows={rows} />
    </div>
  );
}

/** The change list, read-only while the Agent applies the round: each row leaves as it is done, those after rising into its place. */
function ChangeList({ rows }: { rows: Change[] | null }) {
  /** The rows as last drawn: once all are done, the list fades as it was, its last row in it. */
  const last = useRef<Change[]>([]);
  const [leaving, setLeaving] = useState<{ change: Change; top: number; current: boolean }[]>([]);
  const els = useRef(new Map<number, HTMLLIElement>());
  const tops = useRef(new Map<number, number>());
  const list = useRef<HTMLUListElement>(null);
  const height = useRef(0);
  const open = rows !== null;
  const allDone = open && rows.length === 0;
  const shown = allDone ? last.current : (rows ?? []);

  // The rows gone since the last drawing: kept where they were, as they go back and fade.
  const before = useRef<Change[]>([]);
  useLayoutEffect(() => {
    if (!rows) {
      before.current = [];
      last.current = [];
      setLeaving([]);
      return;
    }
    if (rows.length) {
      const gone = before.current.filter((c) => !rows.some((r) => r.id === c.id));
      if (gone.length) setLeaving((was) => [...was, ...gone.map((change, i) => ({ change, top: tops.current.get(change.id) ?? 0, current: i === 0 }))]);
      last.current = rows;
    }
    before.current = rows;
  }, [rows]);

  // Those after a row gone rise into its place, and the list closes up, over the product's 240ms.
  useLayoutEffect(() => {
    if (!open || allDone) return;
    const next = new Map<number, number>();
    for (const [id, row] of els.current) {
      const top = row.offsetTop;
      const was = tops.current.get(id);
      if (was !== undefined && was !== top) row.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: 240, easing: EASE_OUT });
      next.set(id, top);
    }
    tops.current = next;
    const el = list.current;
    if (el) {
      const now = el.offsetHeight;
      if (height.current && now < height.current) el.animate([{ height: `${height.current}px` }, { height: `${now}px` }], { duration: 240, easing: EASE_OUT });
      height.current = now;
    }
  });

  if (!open && !allDone) return null;
  const count = shown.length === 1 ? "1 change" : `${shown.length} changes`;
  return (
    <div className={`ht-changes${allDone ? " is-leaving" : ""}`} role="dialog" aria-label="Changes">
      <h2 className="ht-changes-title">{count} not applied yet</h2>
      <p className="ht-changes-note">The Agent is applying these changes.</p>
      <ul ref={list} className="ht-changes-list">
        {shown.map((change, index) => (
          <li
            key={change.id}
            ref={(row) => {
              if (row) els.current.set(change.id, row);
              else els.current.delete(change.id);
            }}
            className={index === 0 ? "ht-change is-current" : "ht-change"}
          >
            <span className="ht-change-text">
              <span className="ht-change-name">{change.name}</span>
            </span>
            {index === 0 && <span className="ht-change-spinner" />}
          </li>
        ))}
        {leaving.map(({ change, top, current }) => (
          <li
            key={`applied-${change.id}`}
            className={current ? "ht-change is-current is-applied" : "ht-change is-applied"}
            style={{ top }}
            onAnimationEnd={(e) => e.target === e.currentTarget && setLeaving((was) => was.filter((l) => l.change !== change))}
          >
            <span className="ht-change-text">
              <span className="ht-change-name">{change.name}</span>
            </span>
            {current && <span className="ht-change-spinner" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
