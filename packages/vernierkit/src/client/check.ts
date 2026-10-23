/**
 * The check (ADR 0006): once the Agent reports a change done, whether the live
 * page shows it. The change's preview is off by then, so what the page shows is
 * what the code does. The dev server may still be bringing the edit in: a value
 * that does not match yet is read again each time the page changes, until it
 * does or time is up. Changes to the page are watched rather than polled, as a
 * page in a background tab gets its timers slowed.
 */
import { CHECK_SETTLE_MS, type CheckResult } from "../service-protocol";
import { canPreview, elementsOf } from "./change-preview";
import type { Change } from "./changeset";
import { readValue, type Property } from "./edits";

export function checkChange(doc: Document, change: Change): Promise<CheckResult> {
  if (change.kind === "move") return Promise.resolve({ outcome: "unchecked", reason: "only style changes are checked on the page so far, not moves" });
  if (!canPreview(change)) return Promise.resolve({ outcome: "unchecked", reason: "the layer has no source marker, so the page cannot find it" });
  const look = (): CheckResult => {
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

/** Values are plain data in design language. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
