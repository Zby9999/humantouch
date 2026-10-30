/** Summaries of what the performance tests measure, and how they are printed. */

export interface Summary {
  n: number;
  median: number;
  p95: number;
  worst: number;
}

/** The median, and the 95th percentile and worst on the bad side: the high side, or the low side when `higherIsBetter`, as with frames per second. */
export function summarize(values: number[], { higherIsBetter = false } = {}): Summary {
  if (!values.length) return { n: 0, median: NaN, p95: NaN, worst: NaN };
  const sorted = [...values].sort((a, b) => (higherIsBetter ? b - a : a - b));
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { n: sorted.length, median, p95: at(0.95), worst: sorted[sorted.length - 1] };
}

export function ms(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}ms` : "–";
}

/** One line per metric: its summary and, against its target, whether it is met. */
export function report(title: string, rows: { name: string; summary: Summary; unit?: (value: number) => string; target?: string; met?: boolean }[], notes: string[] = []): string {
  const lines = [``, `── ${title}`];
  for (const { name, summary, unit = ms, target, met } of rows) {
    const verdict = met === undefined ? "" : met ? "  ✓ met" : "  ✗ NOT met";
    lines.push(
      `   ${name.padEnd(34)} median ${unit(summary.median).padStart(8)}   p95 ${unit(summary.p95).padStart(8)}   worst ${unit(summary.worst).padStart(8)}   (n=${summary.n})${target ? `   target ${target}` : ""}${verdict}`,
    );
  }
  for (const note of notes) lines.push(`   ${note}`);
  return lines.join("\n");
}
