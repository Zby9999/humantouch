/**
 * The check (ADR 0006): once the Agent reports a change done, whether the live
 * page shows it. The page never shows changes not yet applied (ADR 0010), so
 * what it shows is what the code does. The dev server may still be bringing the edit in: a value
 * that does not match yet is read again each time the page changes, until it
 * does or time is up. Changes to the page are watched rather than polled, as a
 * page in a background tab gets its timers slowed. What the browser draws
 * otherwise than written is drawn on the page to compare where the code that
 * writes it cannot be read: on an element put in and taken out at once, before
 * anything is painted.
 */
import { breakpointName, mediaOf, widthIn } from "./breakpoints";
import { BRIEF_UNCHECKED, CHECK_SETTLE_MS, type CheckResult } from "../service-protocol";
import { isReorder, type Change, type Place } from "./changeset";
import { openingTag, readValue, type Property, type Stroke } from "./edits";
import { signOf, usageKey } from "./layers";
import { CHECK_FRAME_ATTR } from "./host";
import { elementsOf, usageKeyOf } from "./page-elements";
import { colorReader } from "./paint";
import { drawnStroke, showsStroke } from "./stroke-weight";

/**
 * Properties the browser draws otherwise than written: compared as the code
 * writes them, or else as the page draws them, the value after drawn on the
 * page first (`draw`), so a value the code writes right is not taken for one it
 * does not, nor one it writes wrong for one it does.
 */
const AS_WRITTEN: Partial<Record<Property, { draw(doc: Document, value: unknown): unknown; shows(el: Element, value: unknown, drawn: unknown): boolean }>> = {
  // A border is drawn a whole number of physical pixels wide: 1.5px is 1px on a 1x screen, as 1px is.
  stroke: {
    draw: (doc, value) => drawnStroke(doc, value as Stroke | null),
    shows: (el, value, drawn) => showsStroke(el, colorReader(el.ownerDocument), value as Stroke | null, drawn as Stroke | null),
  },
};

/** Why a change cannot be checked, when it cannot: the page must be able to find the layer, and tell what the change does there. */
function uncheckable(change: Change): string | null {
  if (change.kind === "brief") return BRIEF_UNCHECKED;
  if (change.target.made) return "the layer is new this round, so the page has no marker to find it by";
  if (change.target.run !== undefined) return "the text has no element of its own on the page";
  if (!change.target.loc) return "the layer has no source marker, so the page cannot find it";
  if (checkable(change)) return null;
  if (change.kind === "style") return "the layer's container cannot be found on the page";
  if (isReorder(change) && !change.order) return "text runs on among the layers of its container, so the page cannot tell their order";
  return "of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page";
}

/**
 * Of the changes to the structure, those the page can be measured for: a
 * reorder in the same container (unless text runs on among its layers), a
 * placement absolute in the same container, a deletion; not when one of a
 * loop's instances is changed alone, which the page cannot tell apart.
 */
function checkable(change: Change): boolean {
  if (change.kind === "style") return true;
  if (change.data) return false;
  if (change.kind === "delete") return true;
  if (change.kind !== "move" || change.wrap) return false;
  const [before, after] = [change.before, change.after] as Place[];
  const container = after.container.target;
  if (before.container.layer !== after.container.layer || !container.loc || container.made) return false;
  return after.absolute ? true : !before.absolute && !!change.order;
}

/** The page shown at another width, as a window that wide, to check it there; null when it cannot be. */
export type PageAt = (width: number) => Promise<{ doc: Document; close(): void } | null>;

/**
 * Whether `doc`, the live page, shows the change. A change at a breakpoint
 * shows at its widths only (ADR 0008): with the window at none of them, it is
 * checked on the page shown at one of them, by `at`.
 */
export async function checkChange(doc: Document, change: Change, at?: PageAt): Promise<CheckResult> {
  const { breakpoint } = change;
  if (!breakpoint || doc.defaultView?.matchMedia(mediaOf(breakpoint)).matches) return checkOn(doc, change);
  const width = widthIn(breakpoint);
  const cannot: CheckResult = { outcome: "unchecked", reason: `it applies ${breakpointName(breakpoint)} only, and the page could not be shown ${width}px wide to check it` };
  // What cannot be checked on any page needs no other width.
  const reason = uncheckable(change);
  if (reason) return { outcome: "unchecked", reason };
  const page = await at?.(width).catch(() => null);
  if (!page) return cannot;
  try {
    return page.doc.defaultView?.matchMedia(mediaOf(breakpoint)).matches ? await checkOn(page.doc, change) : cannot;
  } finally {
    page.close();
  }
}

/** How long the page may take to load at another width: what is left of the time `done` waits, once it has settled. */
const LOAD_MS = 3000;

/**
 * The page `page` shows, loaded afresh in a hidden iframe `width` px wide,
 * as tall as its window: as it shows in a window that wide. The editor layer
 * is not mounted there. Null when it does not load in time.
 */
export function pageAt(page: Window): PageAt {
  return (width) =>
    new Promise((resolve) => {
      const frame = page.document.createElement("iframe");
      frame.setAttribute(CHECK_FRAME_ATTR, "");
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      Object.assign(frame.style, {
        position: "fixed",
        top: "0",
        left: `${-width - 100}px`,
        width: `${width}px`,
        height: `${page.innerHeight}px`,
        border: "0",
        visibility: "hidden",
        pointerEvents: "none",
      });
      const close = () => frame.remove();
      const timer = setTimeout(() => {
        close();
        resolve(null);
      }, LOAD_MS);
      frame.addEventListener(
        "load",
        () => {
          clearTimeout(timer);
          const doc = frame.contentDocument;
          if (doc) resolve({ doc, close });
          else {
            close();
            resolve(null);
          }
        },
        { once: true },
      );
      frame.src = page.location.href;
      page.document.documentElement.append(frame);
    });
}

/** Whether `doc` shows the change, as wide as it is. */
function checkOn(doc: Document, change: Change): Promise<CheckResult> {
  const reason = uncheckable(change);
  if (reason) return Promise.resolve({ outcome: "unchecked", reason });
  const property = change.property as Property;
  const comparison = AS_WRITTEN[property];
  // Drawn once, before the page is watched: drawing it changes the page.
  const drawn = comparison && change.kind === "style" ? comparison.draw(doc, change.after) : undefined;
  /** `reportActual`: read what the page has instead, when it does not show the change. Looking may change the page, to draw a value. */
  const look = (reportActual: boolean): CheckResult => {
    if (change.kind === "delete") return lookDeleted(doc, change);
    if (change.kind === "move") return (change.after as Place).absolute ? lookPlaced(doc, change) : lookOrder(doc, change);
    const els = elementsOf(doc, change.target);
    if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
    const shows = comparison ? (el: Element) => comparison.shows(el, change.after, drawn) : (el: Element) => sameValue(readValue(el, property), change.after);
    const wrong = els.find((el) => !shows(el));
    return wrong === undefined ? { outcome: "shown" } : { outcome: "not shown", actual: reportActual ? readValue(wrong, property) : undefined };
  };
  const first = look(false);
  if (first.outcome === "shown") return Promise.resolve(first);
  return new Promise((resolve) => {
    const settle = (result: CheckResult) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };
    // Styles and markup the dev server swaps in, a stylesheet's text included.
    const observer = new MutationObserver(() => {
      const result = look(false);
      // What looking put in the page and took out again is not the dev server's: left unseen, it would be looked at again, and again.
      observer.takeRecords();
      if (result.outcome === "shown") settle(result);
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const timer = setTimeout(() => settle(look(true)), CHECK_SETTLE_MS);
  });
}

/**
 * A deleted layer is gone from the page, or hidden, while its container is
 * there (gone with its container, it may only be out of view). An element
 * found by its markers counts as the layer only if it looks the same: its tag
 * and words, or, with no words, its opening tag; markers move as the Agent edits.
 */
function lookDeleted(doc: Document, change: Change): CheckResult {
  const { target } = change;
  if (!elementsOf(doc, (change.before as Place).container.target).length) return { outcome: "unchecked", reason: "its container is not on the page now" };
  const own = usageKey(target.loc!, target.chain);
  const tag = /^<([\w-]+)/.exec(target.context.element)?.[1];
  const same = (el: Element) =>
    target.context.text ? signOf(el) === `${tag} ${target.context.text}` : el.localName === tag && (usageKeyOf(el) === own || openingTag(el) === target.context.element);
  const there = elementsOf(doc, target).filter((el) => getComputedStyle(el).display !== "none" && same(el));
  return there.length ? { outcome: "not shown", actual: "there" } : { outcome: "shown" };
}

/**
 * The reordered layer is in its place among the container's other layers, as
 * the canvas has them: told apart by what they look like, as the Agent's
 * edit moves their markers. Layers other reorders move are left out, so each
 * reorder is checked on its own. `actual`: the layers on the page, in order.
 */
function lookOrder(doc: Document, change: Change): CheckResult {
  const containers = elementsOf(doc, (change.after as Place).container.target);
  if (!containers.length) return { outcome: "unchecked", reason: "its container is not on the page now" };
  const { signs, self, others } = change.order!;
  const kept = signs.filter((_, i) => !others.includes(i));
  for (const container of containers) {
    const page = [...container.children].map(signOf);
    if (!page.includes(signs[self])) return { outcome: "unchecked", reason: "the layer cannot be told apart in its container on the page now" };
    const expected = kept.filter((sign) => page.includes(sign));
    const actual = page.filter((sign) => kept.includes(sign));
    if (!sameValue(actual, expected)) return { outcome: "not shown", actual };
  }
  return { outcome: "shown" };
}

/**
 * A layer placed absolute is absolute, in its container as its positioning
 * reference, at its X and Y, in every instance. `actual`: where it is
 * instead, null when it is not absolute, "no reference" when placed from elsewhere.
 */
function lookPlaced(doc: Document, change: Change): CheckResult {
  const els = elementsOf(doc, change.target);
  if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
  const { x, y } = (change.after as Place).absolute!;
  for (const el of els) {
    const style = getComputedStyle(el);
    if (!/^(absolute|fixed)$/.test(style.position)) return { outcome: "not shown", actual: null };
    // Placed from its container, or from somewhere else.
    if (style.position === "absolute" && (el as HTMLElement).offsetParent !== el.parentElement) return { outcome: "not shown", actual: "no reference" };
    const at = { x: Math.round(parseFloat(style.left) * 100) / 100, y: Math.round(parseFloat(style.top) * 100) / 100 };
    if (Math.abs(at.x - x) > 0.5 || Math.abs(at.y - y) > 0.5) return { outcome: "not shown", actual: at };
  }
  return { outcome: "shown" };
}

/** Values are plain data in design language. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
