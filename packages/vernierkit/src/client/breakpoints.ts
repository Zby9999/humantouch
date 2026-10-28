/**
 * Breakpoints (ADR 0008): the width range each view stands for. The desktop
 * view stands for none in particular: its edits apply at every width. Every
 * other view stands for the widths from its own up to the next wider view's,
 * the narrowest from none at all. An edit made in it applies in that range only,
 * as a media query does, so every view, and the page played at any width, shows
 * it where it belongs.
 *
 * Here the ranges follow the views' widths alone; aligning them with the
 * project's own breakpoints (its Tailwind theme, its media queries) replaces
 * `breakpointOf` (ticket 38).
 */

/** A range of widths, px: from `min` up to, but not including, `max`; null: no bound on that side. */
export interface Breakpoint {
  min: number | null;
  max: number | null;
}

/**
 * The breakpoint of a view `width` px wide, beside the desktop view and the
 * other views, all by width. Null: the desktop view's, every width; so is a
 * view as wide as the desktop view.
 */
export function breakpointOf(width: number, desktop: number, others: number[]): Breakpoint | null {
  if (width === desktop) return null;
  const all = [...new Set([desktop, ...others, width])].sort((a, b) => a - b);
  const i = all.indexOf(width);
  return { min: i === 0 ? null : width, max: all[i + 1] ?? null };
}

/** Whether two breakpoints are the same range; null is every width. */
export function sameBreakpoint(a: Breakpoint | null | undefined, b: Breakpoint | null | undefined): boolean {
  return breakpointKey(a) === breakpointKey(b);
}

/** What tells breakpoints apart, as text: `@-768`, `@768-1280`; empty for null, every width. */
export function breakpointKey(breakpoint: Breakpoint | null | undefined): string {
  return breakpoint ? `@${breakpoint.min ?? ""}-${breakpoint.max ?? ""}` : "";
}

/** The media condition that holds in the range, in range syntax: `(width < 768px)`, `(768px <= width < 1280px)`. */
export function mediaOf({ min, max }: Breakpoint): string {
  if (min === null) return `(width < ${max}px)`;
  if (max === null) return `(width >= ${min}px)`;
  return `(${min}px <= width < ${max}px)`;
}

/** The range in words, for the designer and the Agent: "below 768px", "768px to 1279px", "1440px and wider"; "all breakpoints" for null. */
export function breakpointName(breakpoint: Breakpoint | null | undefined): string {
  if (!breakpoint) return "all breakpoints";
  const { min, max } = breakpoint;
  if (min === null) return `below ${max}px`;
  if (max === null) return `${min}px and wider`;
  return `${min}px to ${max - 1}px`;
}

/** Narrower ranges after wider ones: where two overlap, the narrower one, more particular, wins. */
export function widestFirst(a: Breakpoint, b: Breakpoint): number {
  const span = ({ min, max }: Breakpoint) => (max ?? Infinity) - (min ?? 0);
  return span(b) - span(a) || (a.min ?? 0) - (b.min ?? 0);
}
