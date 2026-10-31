/**
 * What the live page shows in each part of a change's range (ticket 65):
 * the project's breakpoints inside a breakpoint cut it into parts, and the
 * layer may show another value in each, as the code is before the change is
 * applied. Read on a copy of the page at a width in each part, as the check
 * reads it (`check.ts`), so the change notes can say, part by part, what the
 * page shows now and what it is to show, and the check looks at every part.
 *
 * Reading is done a step at a time, each in a task of its own, as the check
 * readies its copies (ticket 64): making the copy, bringing it up to date,
 * laying it out and reading it. A page of thousands of elements is never held
 * up for long, and the designer's edits go on in between.
 */
import { partsOf, widthIn, type ProjectBreakpoints } from "./breakpoints";
import type { Change, RangePart } from "./changeset";
import { valueOn } from "./check";
import { copyPage, type PageCopy } from "./page-copy";
import { PLACING, type Property } from "./property-table";

/**
 * Performance entries: a measure for each step of reading the parts of a
 * change's range, which must never make a long task. Here, not with the other
 * entries' names in `host.ts`: those go in the code the toggle loads with the page.
 */
export const PARTS_MEASURE = "vernierkit:parts";

/** A style change at a breakpoint, not a placement, whose range the project's breakpoints cut into parts: what the page shows in each is to be read. */
export function hasPartsToRead(change: Change, project: ProjectBreakpoints | null): boolean {
  return change.kind === "style" && !!change.breakpoint && !PLACING.includes(change.property as Property) && partsOf(change.breakpoint, project).length > 1;
}

/**
 * Each part of `change`'s range, with the value `page` shows the layer at in
 * it, read on a copy of the page put in `into` for the while; null for a
 * change at every width, a placement, a range that is one part, or a layer
 * the page does not show in one of them.
 */
export async function measureParts(page: Document, change: Change, project: ProjectBreakpoints | null, into: ParentNode): Promise<RangePart[] | null> {
  if (!hasPartsToRead(change, project)) return null;
  const read: RangePart[] = [];
  for (const breakpoint of partsOf(change.breakpoint!, project)) {
    const width = widthIn(breakpoint);
    let copy: PageCopy | null = null;
    try {
      copy = await step(() => copyPage(page, width, into));
      await copy.loaded();
      const made = copy;
      await step(() => made.sync());
      await step(() => made.layOut());
      const before = await step(() => valueOn(page, change, { width, doc: made.doc, own: false, of: made.of }));
      if (before === undefined) return null;
      read.push({ breakpoint, before });
    } finally {
      copy?.close();
    }
  }
  return read;
}

/**
 * Does `work` in a task of its own, once the page has had a turn, and
 * measures it. A message, not a timer: a timer in a tab in the background
 * waits a second or more, and `claim` waits for the reading.
 */
function step<T>(work: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      const start = performance.now();
      try {
        resolve(work());
      } catch (error) {
        reject(error);
      } finally {
        performance.measure(PARTS_MEASURE, { start, end: performance.now() });
      }
    };
    channel.port2.postMessage(null);
  });
}
