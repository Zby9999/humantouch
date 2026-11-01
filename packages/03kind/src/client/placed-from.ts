/**
 * How a layer placed freely is placed along each axis (GLOSSARY: Placement,
 * ticket 75): from its container's left or top edge, from its right or bottom
 * edge (`right`, `bottom`), or centered on where it is placed (`translate:
 * -50%`, as Tailwind's `-translate-x-1/2` writes it, in v3 through
 * `transform`, in v4 through `translate`). Resized, it stays placed so: what
 * changes is the value that places it from the edge it is placed from.
 */
import { SIDES, type Edge, type PlacedFrom } from "./checkable";
import { absolute, declaredValue } from "./property-table";
import type { Axis } from "./snap";
import { pinnedOf } from "./style-source";

/**
 * How `el` is placed along `axis`, as it is laid out in its document (the
 * view worked in): by what the page and the edits declare. Placed by both
 * edges, or by neither, it is taken to be placed from its start (left, top),
 * as the browser places it; so is a layer the freezer pinned that way, which
 * the canvas places from its top whatever the page does. Not placed freely:
 * from its start. Centered from either edge, it is resized alike, on both sides.
 */
export function placedFrom(el: Element, axis: Axis): PlacedFrom {
  const { start, end } = SIDES[axis];
  if (!absolute(el) || pinnedOf(el).includes(start)) return { edge: "start", centered: false };
  const edge: Edge = declared(el, end) && !declared(el, start) ? "end" : "start";
  // Moved back half its size from where it is placed (forward, placed from the end): centered there.
  const { width, height } = el.getBoundingClientRect();
  const half = (axis === "x" ? width : height) / 2;
  const moved = half > 0 ? shiftOf(el, { width, height })?.[axis] : undefined;
  return { edge, centered: moved !== undefined && Math.abs(moved + (edge === "end" ? -half : half)) <= 0.5 };
}

/**
 * Whether a value given to `el`'s offset from its container's end edge along
 * `axis` (`right`, `bottom`) places it, as its document lays it out: placed
 * freely there, and not by its `left` or `top` too, which the browser goes by
 * then, nor pinned so by the freezer. Read from its computed `position` and
 * what is declared, with nothing laid out.
 */
export function endOffsetPlaces(el: Element, axis: Axis): boolean {
  const { start } = SIDES[axis];
  return absolute(el) && !pinnedOf(el).includes(start) && !declared(el, start);
}

/** Whether the page or an edit gives `el` a value for `property` other than `auto`. */
const declared = (el: Element, property: string) => !/^(auto)?$/.test(declaredValue(el, property));

/**
 * How far `transform` and `translate` move `el` across and down, in px, its
 * border box `size`; null when they do more than move it (turn it, scale it),
 * or move it in a way not read here.
 */
function shiftOf(el: Element, size: { width: number; height: number }): Record<Axis, number> | null {
  const style = getComputedStyle(el);
  if (style.rotate !== "none" || style.scale !== "none") return null;
  let x = 0;
  let y = 0;
  if (style.transform !== "none") {
    const m = new DOMMatrixReadOnly(style.transform);
    if (!m.is2D || m.a !== 1 || m.b !== 0 || m.c !== 0 || m.d !== 1) return null;
    x += m.e;
    y += m.f;
  }
  if (style.translate !== "none") {
    const [across = "0px", down = "0px"] = splitAtTopLevelSpaces(style.translate);
    const [dx, dy] = [pxOf(across, size.width), pxOf(down, size.height)];
    if (dx === null || dy === null) return null;
    x += dx;
    y += dy;
  }
  return { x, y };
}

/** A value's parts separated by spaces, but those inside brackets: `calc(-50% + 4px) 0px` is two. */
function splitAtTopLevelSpaces(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const c of value.trim()) {
    if (c === " " && !depth) {
      if (part) parts.push(part);
      part = "";
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    part += c;
  }
  if (part) parts.push(part);
  return parts;
}

/**
 * A length in px, a percentage of `of`: plain (`-50%`, `4px`) or a sum of
 * such in `calc()` (`calc(-50% + 4px)`), as the browser computes `translate`; null for any other.
 */
function pxOf(value: string, of: number): number | null {
  const inner = /^calc\((.*)\)$/.exec(value)?.[1] ?? value;
  const terms = inner.replace(/\s*([+-])\s+/g, " $1").trim().split(/\s+/);
  let sum = 0;
  for (const term of terms) {
    const match = /^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(px|%)$/i.exec(term);
    if (!match) return null;
    sum += match[2] === "%" ? (parseFloat(match[1]) / 100) * of : parseFloat(match[1]);
  }
  return sum;
}
