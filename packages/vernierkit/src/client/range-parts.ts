/**
 * What the live page shows in each part of a change's range (ticket 65):
 * the project's breakpoints inside a breakpoint cut it into parts, and the
 * layer may show another value in each, as the code is before the change is
 * applied. Read on a copy of the page at a width in each part, as the check
 * reads it (`check.ts`), so the change notes can say, part by part, what the
 * page shows now and what it is to show, and the check looks at every part.
 */
import { partsOf, widthIn, type ProjectBreakpoints } from "./breakpoints";
import type { Change, RangePart } from "./changeset";
import { valueOn } from "./check";
import { copyPage } from "./page-copy";
import { PLACING, type Property } from "./property-table";

/** A change whose range's parts are read: a style change at a breakpoint, not a placement. */
export function hasParts(change: Change): boolean {
  return change.kind === "style" && !!change.breakpoint && !PLACING.includes(change.property as Property);
}

/**
 * Each part of `change`'s range, with the value `page` shows the layer at in
 * it, read on a copy of the page put in `into` for the while; null for a
 * change at every width, a placement, a range that is one part, or a layer
 * the page does not show in one of them.
 */
export async function measureParts(page: Document, change: Change, project: ProjectBreakpoints | null, into: ParentNode): Promise<RangePart[] | null> {
  if (!hasParts(change)) return null;
  const parts = partsOf(change.breakpoint!, project);
  if (parts.length < 2) return null;
  const read: RangePart[] = [];
  for (const breakpoint of parts) {
    const width = widthIn(breakpoint);
    const copy = copyPage(page, width, into);
    try {
      await copy.loaded();
      copy.sync();
      const before = valueOn(page, change, { width, doc: copy.doc, own: false, of: copy.of });
      if (before === undefined) return null;
      read.push({ breakpoint, before });
    } finally {
      copy.close();
    }
  }
  return read;
}
