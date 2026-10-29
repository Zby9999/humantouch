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

/** `columns` equal columns, as Tailwind's `grid-cols-*` writes them: they shrink below their content as the Grid does. */
export function equalColumns(columns: number): string {
  return `repeat(${columns}, minmax(0, 1fr))`;
}
