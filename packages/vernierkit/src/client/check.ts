/**
 * The check (ADR 0006): once the Agent reports a change done, whether the live
 * page shows it. The page never shows changes not yet applied (ADR 0010), so
 * what it shows is what the code does. The dev server may still be bringing the edit in: a value
 * that does not match yet is read again each time the page changes, until it
 * does or time is up. Changes to the page are watched rather than polled, as a
 * page in a background tab gets its timers slowed. What the browser draws
 * otherwise than written is drawn on the page to compare: on an element put
 * in and taken out at once, before anything is painted.
 */
import { CHECK_SETTLE_MS, type CheckResult } from "../service-protocol";
import { isReorder, type Change, type Place } from "./changeset";
import { openingTag, readValue, type Property, type Stroke } from "./edits";
import { signOf, usageKey } from "./layers";
import { elementsOf, usageKeyOf } from "./page-elements";
import { colorReader, readStroke } from "./paint";
import { drawnStroke } from "./stroke-weight";

/**
 * Properties the browser draws otherwise than written: the page is read as it
 * draws them, and the value after is drawn on the page first to compare with,
 * so a value the code writes right is not taken for one it does not.
 */
const AS_DRAWN: Partial<Record<Property, { read(el: Element): unknown; draw(doc: Document, value: unknown): unknown }>> = {
  // A border is drawn a whole number of physical pixels wide: 1.5px is 1px on a 1x screen.
  stroke: { read: (el) => readStroke(el, colorReader(el.ownerDocument)), draw: (doc, value) => drawnStroke(doc, value as Stroke | null) },
};

/** Why a change cannot be checked, when it cannot: the page must be able to find the layer, and tell what the change does there. */
function uncheckable(change: Change): string | null {
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

export function checkChange(doc: Document, change: Change): Promise<CheckResult> {
  const reason = uncheckable(change);
  if (reason) return Promise.resolve({ outcome: "unchecked", reason });
  const property = change.property as Property;
  const drawn = AS_DRAWN[property];
  // Drawn once, before the page is watched: drawing it changes the page.
  const expected = drawn && change.kind === "style" ? drawn.draw(doc, change.after) : change.after;
  /** `reportActual`: read what the page has instead, when it does not show the change; read as written, which may change the page too. */
  const look = (reportActual: boolean): CheckResult => {
    if (change.kind === "delete") return lookDeleted(doc, change);
    if (change.kind === "move") return (change.after as Place).absolute ? lookPlaced(doc, change) : lookOrder(doc, change);
    const els = elementsOf(doc, change.target);
    if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
    const read = drawn ? drawn.read : (el: Element) => readValue(el, property);
    const wrong = els.find((el) => !sameValue(read(el), expected));
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
