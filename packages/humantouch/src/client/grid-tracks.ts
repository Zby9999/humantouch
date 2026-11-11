/**
 * A Grid's tracks as CSS writes them: how many a computed track list has, and
 * the track list of equal columns the editor writes. Nothing imported, so the
 * change notes, written in Node, name the same CSS the canvas shows.
 */

/**
 * How many columns (or rows) a Grid is laid out in, from its computed
 * `grid-template-columns` (or `-rows`): the sizes of its tracks, with any
 * line names between them. None: one, the Grid's own width.
 */
export function trackCount(computed: string): number {
  if (computed === "none") return 1;
  return computed.replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/).filter(Boolean).length || 1;
}

/** Whether a computed track list's tracks are all as wide, to half a px (`100px 100px`, not `200px 100px`); none, one, is. */
export function equalTracks(computed: string): boolean {
  const sizes = computed.replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/).filter(Boolean).map(parseFloat).filter((n) => !Number.isNaN(n));
  return !sizes.length || Math.max(...sizes) - Math.min(...sizes) <= 0.5;
}

/** `columns` equal columns, as Tailwind's `grid-cols-*` writes them: they shrink below their content as the Grid does. */
export function equalColumns(columns: number): string {
  return `repeat(${columns}, minmax(0, 1fr))`;
}
