/** @jsxImportSource preact */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { TIP_DELAY_MS, TIP_GRACE_MS } from "./motion";

/**
 * What an element of the editor layer tells in its tip, in place of a `title`, whose tip the browser draws gray and its own way
 * (designer, 2026-11-08): every tip is the editor's dark one, the tools' (`Shell`).
 */
export const TIP_ATTR = "data-ht-tip";

const TIP_ID = "ht-tip";
/** Between the tip and what it tells of, and kept in from the window's edges. */
const TIP_GAP_PX = 6;
const TIP_EDGE_PX = 8;

interface Shown {
  text: string;
  at: DOMRect;
  /** Shown after the pointer rested: it eases in. Warm, or by focus, it is there at once. */
  easing: boolean;
}

/**
 * The tip of whatever in the editor layer has one (`TIP_ATTR`), as the tools' (designer, 2026-11-08): the pointer rests on it
 * `TIP_DELAY_MS` before it shows, above it, centred, or below it with no room above, never past the window's edges. Once one shows,
 * another shows at once, without motion, and so within `TIP_GRACE_MS` of the pointer leaving the last. Focus from the keyboard shows
 * it at once. A press hides it till the pointer leaves. Shown, it describes what it tells of to screen readers.
 */
export function Tips() {
  const anchor = useRef<HTMLSpanElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const root = anchor.current!.getRootNode() as ShadowRoot | Document;
    let target: HTMLElement | null = null;
    /** Pressed: no tip till the pointer has left it. */
    let pressed: HTMLElement | null = null;
    let byFocus = false;
    let warm = false;
    let wait = 0;
    let cooling = 0;
    const tipOf = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>(`[${TIP_ATTR}]`) : null);

    const show = (el: HTMLElement, easing: boolean) => {
      clearTimeout(wait);
      // Taken away or left out while it waited (a view's full screen, gone once the pointer left its label): no tip, at the window's corner.
      if (!el.isConnected || !el.checkVisibility({ opacityProperty: true })) return hide();
      clearTimeout(cooling);
      if (target && target !== el) target.removeAttribute("aria-describedby");
      target = el;
      warm = true;
      if (!el.hasAttribute("aria-describedby")) el.setAttribute("aria-describedby", TIP_ID);
      setShown({ text: el.getAttribute(TIP_ATTR)!, at: el.getBoundingClientRect(), easing });
    };
    const hide = () => {
      clearTimeout(wait);
      if (target?.getAttribute("aria-describedby") === TIP_ID) target.removeAttribute("aria-describedby");
      target = null;
      byFocus = false;
      setShown(null);
    };

    const onOver = (event: Event) => {
      // Taken away under the pointer, what it told of: its tip goes too.
      if (target && (!target.isConnected || !target.checkVisibility({ opacityProperty: true }))) hide();
      const el = tipOf(event.target);
      if (!el || el === target || el === pressed || byFocus) return;
      clearTimeout(wait);
      if (warm) show(el, false);
      else wait = window.setTimeout(() => show(el, true), TIP_DELAY_MS);
    };
    const onOut = (event: Event) => {
      const el = tipOf(event.target);
      const to = (event as PointerEvent).relatedTarget;
      if (!el || (to instanceof Node && el.contains(to))) return;
      if (el === pressed) pressed = null;
      if (byFocus) return;
      clearTimeout(wait);
      if (el !== target) return;
      hide();
      cooling = window.setTimeout(() => (warm = false), TIP_GRACE_MS);
    };
    const onDown = (event: Event) => {
      pressed = tipOf(event.target);
      if (target) hide();
    };
    // Focused from the keyboard, what has a tip of its own; not a field typed into, focused by a click too.
    const onFocusIn = (event: Event) => {
      const el = event.target as HTMLElement;
      if (!el.hasAttribute(TIP_ATTR) || !el.matches(":focus-visible") || el.matches("input, textarea")) return;
      byFocus = false;
      show(el, false);
      byFocus = true;
    };
    const onFocusOut = () => {
      if (byFocus) hide();
    };
    // Moved under it, it no longer points at what it tells of.
    const onScroll = () => target && hide();

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("wheel", onScroll, { capture: true, passive: true });
    root.addEventListener("scroll", onScroll, true);
    return () => {
      hide();
      clearTimeout(cooling);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      root.removeEventListener("pointerdown", onDown, true);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("wheel", onScroll, { capture: true });
      root.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  // Placed once its size is known: above, or below with no room above; within the window.
  useLayoutEffect(() => {
    const el = tipEl.current;
    if (!el || !shown) return;
    const { at } = shown;
    const { width, height } = el.getBoundingClientRect();
    const above = at.top - TIP_GAP_PX - height >= TIP_EDGE_PX;
    const left = Math.max(TIP_EDGE_PX, Math.min(innerWidth - TIP_EDGE_PX - width, at.left + at.width / 2 - width / 2));
    el.style.left = `${left}px`;
    el.style.top = `${above ? at.top - TIP_GAP_PX - height : at.bottom + TIP_GAP_PX}px`;
    // It grows toward what it tells of.
    el.style.transformOrigin = `${at.left + at.width / 2 - left}px ${above ? "100%" : "0"}`;
  }, [shown]);

  return (
    <>
      <span ref={anchor} hidden />
      {shown && (
        <div ref={tipEl} key={shown.text + shown.at.left + shown.at.top} id={TIP_ID} class={shown.easing ? "ht-variants-tip ht-tip is-easing" : "ht-variants-tip ht-tip"} role="tooltip">
          {shown.text}
        </div>
      )}
    </>
  );
}
