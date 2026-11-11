"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icon-paths";

/*
 * The Design panel's number fields, as the product makes them (packages/humantouch/src/client/Properties.tsx: Scrub,
 * TextField, DigitRoll), with its timings (motion.ts). On the site nothing they take is kept: dragged, stepped or typed,
 * a field shows the new value till it is let go, left or Enter is pressed, then rolls back to the layer's own. The canvas
 * never changes, so it never disagrees with the panel (designer, 2026-11-11).
 */

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const FIELD_SETTLE_MS = 200;
const GRIP_SWAY_MAX_PX = 3;
const DIGIT_ROLL_MS = 100;
const DIGIT_FADE_MS = 80;
const DIGIT_ROLL_EM = 0.25;
const DIGIT_BLUR_PX = 1;
const SCRUB_PX_PER_STEP = 2;
const SWAY_RISE_MS = 40;
const SWAY_HOLD_MS = 150;
const SWAY_FALL_MS = 160;
const SWAY_MOVE_SPAN_MS = 50;
const SWAY_PX_PER_SPEED = GRIP_SWAY_MAX_PX / (8 / (1000 / 60));
const STILL = { frameDx: 0, speed: 0, frame: 0, last: 0, movedAt: 0 };

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number: drag its icon or the grip at its right end sideways, 1 per 2px (10 with ⇧), its grip swaying with the drag's
 * speed and its digits rolling; press ↑ or ↓; or type. Let go, left or entered, it rolls back to `value`.
 */
export function NumberField({ tip, icon, glyph, value, unit = "", min = 0, max = Infinity, after, className = "", rolls = true }: { tip: string; icon?: IconName; glyph?: string; value: number; unit?: string; min?: number; max?: number; after?: ReactNode; className?: string; rolls?: boolean }) {
  /** The value as dragged, stepped or typed, till it is let go; null, the layer's own. */
  const [held, setHeld] = useState<number | null>(null);
  const shown = held ?? value;
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /** The next change of the text rolls: dragged, or taken back. */
  const rollNext = useRef(false);
  /** Esc pressed: what was typed is dropped, not shown. */
  const escaped = useRef(false);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const back = () => {
    rollNext.current = rolls;
    setHeld(null);
  };
  const scrub = {
    value: shown,
    onChange: (n: number) => {
      rollNext.current = rolls;
      setHeld(clamp(n));
    },
    onEnd: back,
  };
  const text = `${shown}${unit}`;
  const roll = useRoll(text, input, rollNext);

  return (
    <label className={`ht-field${className ? ` ${className}` : ""}${shown !== value ? " is-changed" : ""}`} data-tip={tip}>
      {(icon || glyph) && <Scrub {...scrub}>{icon ? <Icon name={icon} /> : <span className="ht-glyph">{glyph}</span>}</Scrub>}
      <input
        ref={input}
        type="text"
        className={`ht-input ht-number${roll.shown ? " is-rolled" : ""}`}
        aria-label={tip}
        spellCheck={false}
        autoComplete="off"
        value={draft ?? text}
        onFocus={(e) => {
          roll.stop();
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            escaped.current = true;
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setDraft(null);
            setHeld(clamp(shown + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)));
          }
        }}
        onBlur={() => {
          const typed = draft === null || escaped.current ? null : parseFloat(draft);
          escaped.current = false;
          setDraft(null);
          if (typed !== null && Number.isFinite(typed) && clamp(typed) !== shown) {
            // Typed, it shows a moment, then rolls back.
            setHeld(clamp(typed));
            setTimeout(back, 400);
          } else if (held !== null) back();
        }}
      />
      {roll.shown && input.current && <DigitRoll input={input.current} from={roll.shown.from} to={roll.shown.to} up={roll.shown.up} />}
      {after}
      <Scrub grip {...scrub} />
    </label>
  );
}

/** What drags a number: its icon at its start, or its grip, a short upright bar at its right end. */
export function Scrub({ grip, value, onChange, onEnd, children }: { grip?: boolean; value: number; onChange: (n: number) => void; onEnd: () => void; children?: ReactNode }) {
  const drag = useRef<{ pointerId: number; value: number; rest: number; field: Element | null; grip: HTMLElement | null } | null>(null);
  const sway = useRef({ ...STILL });

  const heldFrame = (now: number) => {
    const d = drag.current;
    const t = sway.current;
    const dt = t.last ? Math.min(now - t.last, SWAY_MOVE_SPAN_MS) : 1000 / 60;
    t.last = now;
    if (t.frameDx !== 0) {
      const v = t.frameDx / Math.max(dt, Math.min(now - t.movedAt, SWAY_MOVE_SPAN_MS));
      const follows = Math.abs(v) >= Math.abs(t.speed) || Math.sign(v) !== Math.sign(t.speed);
      t.speed += (v - t.speed) * (1 - Math.exp(-dt / (follows ? SWAY_RISE_MS : SWAY_FALL_MS)));
      t.movedAt = now;
    } else if (now - t.movedAt > SWAY_HOLD_MS) t.speed *= Math.exp(-dt / SWAY_FALL_MS);
    t.frameDx = 0;
    const x = Math.max(-GRIP_SWAY_MAX_PX, Math.min(GRIP_SWAY_MAX_PX, t.speed * SWAY_PX_PER_SPEED));
    if (d?.grip) d.grip.style.transform = `translateX(${Math.abs(x) < 0.02 ? 0 : x.toFixed(2)}px)`;
    t.frame = d ? requestAnimationFrame(heldFrame) : 0;
  };

  useEffect(
    () => () => {
      drag.current?.field?.removeAttribute("data-scrubbing");
      cancelAnimationFrame(sway.current.frame);
    },
    [],
  );

  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    d.field?.removeAttribute("data-scrubbing");
    drag.current = null;
    cancelAnimationFrame(sway.current.frame);
    sway.current = { ...STILL };
    if (d.grip?.style.transform) {
      d.grip.style.transition = `transform ${FIELD_SETTLE_MS}ms ${EASE_OUT}`;
      d.grip.style.transform = "translateX(0px)";
    }
    onEnd();
  };

  return (
    <span
      className={grip ? "ht-scrub-grip" : "ht-scrub"}
      aria-hidden="true"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // A pointer that is not down (a synthetic one): the drag goes on without the capture.
        }
        const field = e.currentTarget.closest(".ht-field");
        field?.setAttribute("data-scrubbing", "");
        const g = reducedMotion() ? null : (field?.querySelector<HTMLElement>(".ht-grip") ?? null);
        if (g) g.style.transition = "";
        drag.current = { pointerId: e.pointerId, value, rest: 0, field, grip: g };
        cancelAnimationFrame(sway.current.frame);
        sway.current = { ...STILL, frame: requestAnimationFrame(heldFrame) };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d?.pointerId !== e.pointerId) return;
        sway.current.frameDx += e.movementX;
        d.rest += e.movementX / SCRUB_PX_PER_STEP;
        const steps = Math.trunc(d.rest);
        if (!steps) return;
        d.rest -= steps;
        d.value += steps * (e.shiftKey ? 10 : 1);
        onChange(d.value);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onClick={(e) => e.preventDefault()}
    >
      {grip ? <span className="ht-grip" /> : children}
    </span>
  );
}

type Roll = { from: string; to: string; up: boolean };
const rolledNumber = (text: string) => (/^\s*-?\.?\d/.test(text) ? parseFloat(text) : null);

/** Whether the field's digits roll to its text now: as it is dragged, or taken back; never as it is typed or while focused. */
function useRoll(text: string, input: { current: HTMLInputElement | null }, rollNext: { current: boolean }) {
  const [shown, setShown] = useState<Roll | null>(null);
  const was = useRef(text);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);
  const stop = () => {
    clearTimeout(settle.current);
    setShown(null);
  };
  useLayoutEffect(() => {
    const before = was.current;
    was.current = text;
    const rolls = rollNext.current;
    rollNext.current = false;
    if (before === text) return;
    const el = input.current;
    const field = el?.closest(".ht-field");
    const [older, newer] = [rolledNumber(before), rolledNumber(text)];
    if (!el || !rolls || el.matches(":focus") || older === null || newer === null || older === newer) return void stop();
    setShown((roll) => ({ from: roll?.from ?? before, to: text, up: newer > older }));
    clearTimeout(settle.current);
    const rolling = () => !!field?.querySelector(":scope > .ht-roll")?.getAnimations({ subtree: true }).some((a) => a.playState === "running");
    const later = () => {
      settle.current = setTimeout(() => (field?.hasAttribute("data-scrubbing") || rolling() ? later() : setShown(null)), DIGIT_ROLL_MS + 40);
    };
    later();
  }, [text]);
  return { shown, stop };
}

type Pose = [y: number, opacity: number, blur: number];
const SETTLED: Pose = [0, 1, 0];
type Glyph = { el: HTMLSpanElement; from: Pose; to: Pose; anim: Animation | null };
type Cell = { el: HTMLSpanElement; char: string; glyph: Glyph | null };

/** Over a number's text while it rolls: a digit that changes rolls out as its new one rolls in, up as the number grows. */
function DigitRoll({ input, from, to, up }: { input: HTMLInputElement; from: string; to: string; up: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const cells = useRef<Cell[]>([]);
  const reduce = useRef(reducedMotion());

  const place = (): Cell => {
    const cell: Cell = { el: document.createElement("span"), char: "", glyph: null };
    cell.el.className = "ht-roll-cell";
    root.current!.prepend(cell.el);
    cells.current.push(cell);
    return cell;
  };

  useLayoutEffect(() => {
    const el = root.current!;
    el.style.left = `${input.offsetLeft - input.scrollLeft}px`;
    el.style.top = `${input.offsetTop}px`;
    el.style.height = `${input.offsetHeight}px`;
    for (const char of [...from].reverse()) {
      const cell = place();
      cell.char = char;
      cell.glyph = { el: glyphIn(cell, char), from: SETTLED, to: SETTLED, anim: null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const chars = [...to].reverse();
    const ms = reduce.current ? DIGIT_FADE_MS : DIGIT_ROLL_MS;
    const away = reduce.current ? 0 : up ? DIGIT_ROLL_EM : -DIGIT_ROLL_EM;
    const blur = reduce.current ? 0 : DIGIT_BLUR_PX;
    for (let i = 0; i < Math.max(chars.length, cells.current.length); i++) {
      const cell = cells.current[i] ?? place();
      const char = chars[i] ?? "";
      if (cell.char === char) continue;
      cell.char = char;
      const going = cell.glyph;
      if (going) {
        going.el.classList.add("is-leaving");
        rollGlyph(going, [-away, 0, blur], ms, reduce.current);
        going.anim!.onfinish = () => going.el.remove();
      }
      cell.glyph = null;
      if (char) {
        const start: Pose = [away, 0, blur];
        cell.glyph = { el: glyphIn(cell, char), from: start, to: start, anim: null };
        rollGlyph(cell.glyph, SETTLED, ms, reduce.current);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  return <span ref={root} className="ht-roll" aria-hidden="true" />;
}

function glyphIn(cell: Cell, char: string) {
  const el = document.createElement("span");
  el.className = "ht-roll-glyph";
  el.textContent = char;
  cell.el.append(el);
  return el;
}

function poseOf(glyph: Glyph): Pose {
  const progress = glyph.anim?.effect?.getComputedTiming().progress;
  if (progress === null || progress === undefined) return glyph.to;
  return glyph.from.map((at, i) => at + (glyph.to[i] - at) * progress) as Pose;
}

const frameOf = ([y, opacity, blur]: Pose, reduce: boolean): Keyframe => (reduce ? { opacity } : { transform: `translateY(${y}em)`, opacity, filter: `blur(${blur}px)` });

function rollGlyph(glyph: Glyph, to: Pose, ms: number, reduce: boolean) {
  const from = poseOf(glyph);
  glyph.anim?.cancel();
  Object.assign(glyph, { from, to });
  glyph.anim = glyph.el.animate([frameOf(from, reduce), frameOf(to, reduce)], { duration: ms, easing: EASE_OUT, fill: "forwards" });
}

const TIP_DELAY_MS = 500;
const TIP_GRACE_MS = 300;
const TIP_GAP_PX = 6;

/**
 * The editor's tips, as the product shows them (Tips.tsx): over what has a `data-tip`, after the pointer rests 500ms,
 * at once while warm; placed in the editor's own box, which is scaled, so `scale` turns the window's pixels into its.
 */
export function Tips({ root, box, scale }: { root: ShadowRoot; box: HTMLElement | null; scale: number }) {
  const tipEl = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<{ text: string; at: DOMRect; easing: boolean } | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    let target: HTMLElement | null = null;
    let pressed: HTMLElement | null = null;
    let warm = false;
    let wait = 0;
    let cooling = 0;
    const tipOf = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>("[data-tip]") : null);
    const show = (el: HTMLElement, easing: boolean) => {
      clearTimeout(wait);
      if (!el.isConnected) return hide();
      clearTimeout(cooling);
      target = el;
      warm = true;
      setShown({ text: el.getAttribute("data-tip")!, at: el.getBoundingClientRect(), easing });
    };
    const hide = () => {
      clearTimeout(wait);
      target = null;
      setShown(null);
    };
    const onOver = (e: Event) => {
      const el = tipOf(e.target);
      if (!el || el === target || el === pressed) return;
      clearTimeout(wait);
      if (warm) show(el, false);
      else wait = window.setTimeout(() => show(el, true), TIP_DELAY_MS);
    };
    const onOut = (e: Event) => {
      const el = tipOf(e.target);
      const to = (e as PointerEvent).relatedTarget;
      if (!el || (to instanceof Node && el.contains(to))) return;
      if (el === pressed) pressed = null;
      clearTimeout(wait);
      if (el !== target) return;
      hide();
      cooling = window.setTimeout(() => (warm = false), TIP_GRACE_MS);
    };
    const onDown = (e: Event) => {
      pressed = tipOf(e.target);
      if (target) hide();
    };
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("wheel", hide, { capture: true, passive: true });
    return () => {
      hide();
      clearTimeout(cooling);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      root.removeEventListener("pointerdown", onDown, true);
      root.removeEventListener("wheel", hide, { capture: true });
    };
  }, [root]);

  useLayoutEffect(() => {
    const el = tipEl.current;
    if (!el || !shown || !box) return;
    const k = scaleRef.current;
    const b = box.getBoundingClientRect();
    const at = { left: (shown.at.left - b.left) / k, top: (shown.at.top - b.top) / k, width: shown.at.width / k, height: shown.at.height / k };
    const { offsetWidth: width, offsetHeight: height } = el;
    const above = at.top - TIP_GAP_PX - height >= 8;
    const left = Math.max(8, Math.min(box.offsetWidth - 8 - width, at.left + at.width / 2 - width / 2));
    el.style.left = `${left}px`;
    el.style.top = `${above ? at.top - TIP_GAP_PX - height : at.top + at.height + TIP_GAP_PX}px`;
    el.style.transformOrigin = `${at.left + at.width / 2 - left}px ${above ? "100%" : "0"}`;
  }, [shown, box]);

  if (!shown) return null;
  return (
    <div ref={tipEl} key={shown.text + shown.at.left + shown.at.top} className={shown.easing ? "ht-variants-tip ht-tip is-easing" : "ht-variants-tip ht-tip"} role="tooltip" style={{ position: "absolute" }}>
      {shown.text}
    </div>
  );
}
