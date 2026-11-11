/**
 * Each item of a list as it is now, matched to its own entry in the list as
 * it was: by identity, not by position, so that an item taken off, or one
 * added before another, leaves the others matched to their own (designer,
 * 2026-11-08). The items have no ids: they are matched, in order, the items
 * left as they were first, then as many of the others as can be, each to the
 * entry it is most like (`likeness`, from 0 to 1). An item matched to none is
 * new; an entry no item is matched to was taken off.
 *
 * Returns, for each item now, the index of its entry before, or null.
 */
export function matchItems<T>(before: readonly T[], after: readonly T[], likeness: (was: T, now: T) => number): (number | null)[] {
  const same = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  /** What a match is worth: an item as it was above all, then one more item matched, then how alike. */
  const worth = (i: number, j: number) => (same(before[i], after[j]) ? 1e6 : 0) + 1e3 + Math.round(Math.max(0, Math.min(1, likeness(before[i], after[j]))) * 100);
  const n = before.length;
  const m = after.length;
  /** best[i][j]: the most the entries from `i` on and the items from `j` on can be worth, matched in order. */
  const best = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], worth(i, j) + best[i + 1][j + 1]);
    }
  }
  const matched: (number | null)[] = new Array(m).fill(null);
  let [i, j] = [0, 0];
  while (i < n && j < m) {
    if (best[i][j] === worth(i, j) + best[i + 1][j + 1]) matched[j++] = i++;
    else if (best[i][j] === best[i + 1][j]) i++;
    else j++;
  }
  return matched;
}
