/**
 * The check (ADR 0006): once the Agent reports a change done, whether the live
 * page shows it. The change's preview is off by then, so what the page shows is
 * what the code does. The dev server may still be bringing the edit in: a value
 * that does not match yet is read again each time the page changes, until it
 * does or time is up. Changes to the page are watched rather than polled, as a
 * page in a background tab gets its timers slowed.
 */
import { CHECK_SETTLE_MS, type CheckResult } from "../service-protocol";
import { canPreview, elementsOf, keyOf } from "./change-preview";
import type { Change, Place } from "./changeset";
import { openingTag, readValue, type Property } from "./edits";
import { usageKey } from "./layers";

/** Why a change cannot be checked, when it cannot: as for the Change Preview, the page must be able to find and show it. */
function uncheckable(change: Change): string | null {
  if (change.target.made) return "the layer is new this round, so the page has no marker to find it by";
  if (change.target.run !== undefined) return "the text has no element of its own on the page";
  if (!change.target.loc) return "the layer has no source marker, so the page cannot find it";
  if (canPreview(change)) return null;
  if (change.kind === "style") return "the layer's container cannot be found on the page";
  return "of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page";
}

export function checkChange(doc: Document, change: Change): Promise<CheckResult> {
  const reason = uncheckable(change);
  if (reason) return Promise.resolve({ outcome: "unchecked", reason });
  const look = (): CheckResult => {
    if (change.kind === "delete") return lookDeleted(doc, change);
    if (change.kind === "move") return (change.after as Place).absolute ? lookPlaced(doc, change) : lookOrder(doc, change);
    const els = elementsOf(doc, change.target);
    if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
    const wrong = els.map((el) => readValue(el, change.property as Property)).find((value) => !same(value, change.after));
    return wrong === undefined ? { outcome: "shown" } : { outcome: "not shown", actual: wrong };
  };
  const first = look();
  if (first.outcome === "shown") return Promise.resolve(first);
  return new Promise((resolve) => {
    const settle = (result: CheckResult) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };
    // Styles and markup the dev server swaps in, a stylesheet's text included.
    const observer = new MutationObserver(() => {
      const result = look();
      if (result.outcome === "shown") settle(result);
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const timer = setTimeout(() => settle(look()), CHECK_SETTLE_MS);
  });
}

/**
 * A deleted layer is gone from the page, or hidden. One found where its
 * markers have moved counts only if it is the same element, as its opening tag tells.
 */
function lookDeleted(doc: Document, { target }: Change): CheckResult {
  const own = usageKey(target.loc!, target.chain);
  const tag = /^<([\w-]+)/.exec(target.context.element)?.[1];
  const there = elementsOf(doc, target).filter(
    (el) => el.localName === tag && getComputedStyle(el).display !== "none" && (keyOf(el) === own || openingTag(el) === target.context.element),
  );
  return there.length ? { outcome: "not shown", actual: "there" } : { outcome: "shown" };
}

/** A reordered container's layers are in the order the canvas has them, as far as both have them. `actual`: their keys on the page. */
function lookOrder(doc: Document, change: Change): CheckResult {
  const containers = elementsOf(doc, (change.after as Place).container.target);
  if (!containers.length) return { outcome: "unchecked", reason: "its container is not on the page now" };
  for (const container of containers) {
    const page = [...container.children].map(keyOf);
    const keys = change.order!.keys;
    const expected = keys.filter((key) => key !== null && page.includes(key));
    const actual = page.filter((key) => key !== null && keys.includes(key));
    if (!same(actual, expected)) return { outcome: "not shown", actual };
  }
  return { outcome: "shown" };
}

/** A layer placed absolute is absolute, at its X and Y, in every instance. `actual`: where it is instead, or null when it is not absolute. */
function lookPlaced(doc: Document, change: Change): CheckResult {
  const els = elementsOf(doc, change.target);
  if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
  const { x, y } = (change.after as Place).absolute!;
  for (const el of els) {
    const style = getComputedStyle(el);
    if (!/^(absolute|fixed)$/.test(style.position)) return { outcome: "not shown", actual: null };
    const at = { x: Math.round(parseFloat(style.left) * 100) / 100, y: Math.round(parseFloat(style.top) * 100) / 100 };
    if (Math.abs(at.x - x) > 0.5 || Math.abs(at.y - y) > 0.5) return { outcome: "not shown", actual: at };
  }
  return { outcome: "shown" };
}

/** Values are plain data in design language. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
