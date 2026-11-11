/**
 * A Stack made a Grid, and a Grid made a Stack (ticket 109), as Figma's auto
 * layout does: the arrangement it is given, worked out from how it lays its
 * layers out now, so nothing jumps where it can stay. Its padding and the
 * order of its layers stay as they are; so do its layers' own styles.
 */
import { readValue, type Arrangement } from "./property-table";

/** What the Stack section and the Grid section offer: the two directions of a Stack, and a Grid. */
export type ArrangeAs = "horizontal" | "vertical" | "grid";

/**
 * The arrangement `el`, a Stack or a Grid as it is laid out now, takes made
 * `as`. A Stack made a Grid: one column for each of its layers in a row (all
 * of them, unwrapped; as many as its widest line, wrapped), one column down a
 * vertical one; its gap both gaps, wrapped its gap between lines the row gap.
 * A Grid made a Stack: the gap along it its gap; made horizontal, it wraps
 * when it has more than one row and more than one column, so its rows stay
 * rows, its row gap the gap between them. Made what it is already, with the
 * direction changed alone: as a Stack's direction changes.
 */
export function arrangedAs(el: Element, as: ArrangeAs): Arrangement {
  const now = readValue(el, "arrangement");
  if (as === "grid") {
    if (now.type === "grid") return now;
    const { direction, wrap, gap } = now;
    if (direction === "vertical") return { type: "grid", columns: 1, rowGap: gap, columnGap: gap };
    const lines = linesOf(el);
    const columns = Math.max(1, ...lines);
    return wrap ? { type: "grid", columns, rowGap: now.crossGap ?? gap, columnGap: gap } : { type: "grid", columns: Math.max(1, lines.reduce((sum, n) => sum + n, 0)), rowGap: gap, columnGap: gap };
  }
  if (now.type === "stack") return { ...now, direction: as };
  const rows = linesOf(el).length;
  if (as === "vertical") return { type: "stack", direction: "vertical", wrap: false, gap: now.rowGap };
  const wrap = rows > 1 && now.columns > 1;
  return wrap ? { type: "stack", direction: "horizontal", wrap, gap: now.columnGap, crossGap: now.rowGap } : { type: "stack", direction: "horizontal", wrap, gap: now.columnGap };
}

/**
 * How many of `el`'s layers, laid out in it, each of its rows has, top to
 * bottom: those whose tops are within a px of the row's first. Those placed
 * absolute or not shown are in none; those of an element not drawn
 * (`display: contents`) are its own.
 */
function linesOf(el: Element): number[] {
  const tops = laidOut(el).map((child) => Math.round(child.getBoundingClientRect().top));
  const lines: { top: number; count: number }[] = [];
  for (const top of tops) {
    const line = lines.find((other) => Math.abs(other.top - top) <= 1);
    if (line) line.count++;
    else lines.push({ top, count: 1 });
  }
  return lines.map((line) => line.count);
}

function laidOut(el: Element): Element[] {
  return [...el.children].flatMap((child) => {
    const style = getComputedStyle(child);
    if (style.display === "contents") return laidOut(child);
    return style.display === "none" || /^(absolute|fixed)$/.test(style.position) ? [] : [child];
  });
}
