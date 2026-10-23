/**
 * The check (ADR 0006): once the Agent reports a change done, whether the live
 * page shows it. The change's preview is off by then, so what the page shows is
 * what the code does. The dev server may still be bringing the edit in, so a
 * value that does not match yet is read again for a while.
 */
import type { CheckResult } from "../service-protocol";
import { canPreview, elementsOf } from "./change-preview";
import type { Change } from "./changeset";
import { readValue, type Property } from "./edits";

/** How long to wait for the dev server to bring the edit in. */
const SETTLE_MS = 2000;
const RETRY_MS = 100;

export async function checkChange(doc: Document, change: Change): Promise<CheckResult> {
  if (!canPreview(change)) return { outcome: "unchecked", reason: "the layer has no source marker, so the page cannot find it" };
  const until = Date.now() + SETTLE_MS;
  for (;;) {
    const els = elementsOf(doc, change.target);
    if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
    const wrong = els.map((el) => readValue(el, change.property as Property)).find((value) => !same(value, change.after));
    if (wrong === undefined) return { outcome: "shown" };
    if (Date.now() > until) return { outcome: "not shown", actual: wrong };
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
}

/** Values are plain data in design language. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
