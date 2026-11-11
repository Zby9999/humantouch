/**
 * A change for one usage of a component alone (ticket 77), which the Agent
 * may write into the component itself, so that its other usages change too.
 * As the page begins to check a claimed round, it notes what the component's
 * other usages on the page show of the change's property, as wide as its
 * window; looking again as the code changes, a value not what it was there
 * means the change went beyond its usage, and is not applied. The property
 * the change sets alone is looked at, as the check reads it, not every style
 * an edit may bring along; for new words, what each usage reads (ticket
 * 90). Not looked at: a usage the round changes the property of itself,
 * every usage when the round changes the component itself so, and usages
 * not on the page.
 *
 * What the page notes is kept with the claim in `.humantouch/` (ticket 82): a
 * page reloaded or opened while the round is claimed goes by it, finding the
 * elements again by their usage. A round the page claims for an Agent that
 * did not (ticket 78) goes by what the other usages showed as the code began
 * to change (`noteRound`), noted before the code it claims for is in.
 */
import type { OtherUsageChanged, OtherUsagesKept, OtherUsagesNote } from "../service-protocol";
import type { OutsideChanged, OutsideNote } from "../outside-protocol";
import type { Change } from "./changeset";
import { changedAround, changesTheSame as sameStyle, itself, outsideOf, valuesAt, wordsOn, type PageWidth } from "./check";
import type { RoundOnCanvas } from "./moves";
import { sameBreakpoint } from "./breakpoints";
import { forOneUsage, foundByMarker } from "./checkable";
import { aloneOfKey } from "./canvas-style";
import { originOf, usageKey } from "./layers";
import { elementsOf, otherUsagesOf } from "./page-elements";
import { readValue, type Property } from "./property-table";
import { readUsageChain, type UsageLevel } from "./usage-chain";

/**
 * What the component's other usages showed of a change's property, as the
 * page began to check the round, as wide as its window was then: by element,
 * each instance of each usage. `el`: the element, as long as the page knows
 * it; kept in `.humantouch/` and read back, none till it is found again.
 */
export type OtherUsagesNoted = OtherUsagesNote<{ el?: Element }>;

/** The round's notes, `noted` by change id, as kept in `.humantouch/` (ticket 82): with no elements. */
export function keptOf(noted: Map<number, OtherUsagesNoted | null>): OtherUsagesKept {
  return Object.fromEntries(
    [...noted].map(([id, one]) => [id, one && { width: one.width, seen: one.seen.map(({ key, chain, value, nth }) => ({ key, chain, value, ...(nth && { nth }) })), ...(one.outside && { outside: one.outside }) }]),
  );
}

/** Notes kept in `.humantouch/` (`kept`), by change id, to go by: their elements to be found again on the page. */
export function notedFrom(kept: OtherUsagesKept): Map<number, OtherUsagesNoted | null> {
  return new Map(Object.entries(kept).map(([id, one]) => [Number(id), one && { width: one.width, seen: one.seen.map((seen) => ({ ...seen })), ...(one.outside && { outside: one.outside }) }]));
}

/**
 * Whether the page looks at the component's other usages for `change`: a
 * style change, or new words (ticket 90), for one usage of it alone, to a
 * layer it finds by its source marker; and at the loop's other instances, for
 * a style change made on one of them alone (ticket 114).
 */
export function looksAtOtherUsages(change: Change): boolean {
  return (change.kind === "style" || change.kind === "text") && change.scope === "usage" && !change.data && foundByMarker(change.target) && (forOneUsage(change) || !!change.alone);
}

/**
 * The elements the page looks at for a change, besides its own (`looksAtOtherUsages`), on the
 * page `doc` now: the other usages of its component, every instance of each,
 * by usage key, of a change for one usage alone; of one made on an instance
 * alone (ticket 114), the loop's other instances too, under its own usage's
 * key, each with its place among them. Leaves out the instances `skipped`.
 */
function othersOf(doc: Document, change: Change, skipped: Set<number> = new Set()): Map<string, { el: Element; nth?: number }[]> {
  const others = new Map<string, { el: Element; nth?: number }[]>();
  if (forOneUsage(change)) for (const [key, els] of otherUsagesOf(doc, change.target)) others.set(key, els.map((el) => ({ el })));
  if (change.alone && change.instance && change.target.loc) {
    const own = change.instance.nth;
    const instances = elementsOf(doc, change.target).flatMap((el, i) => (i + 1 === own || skipped.has(i + 1) ? [] : [{ el, nth: i + 1 }]));
    if (instances.length) others.set(usageKey(change.target.loc, change.target.chain), instances);
  }
  return others;
}

/** Whether `other`, another change of the round, changes what `change` changes: its property, or a CSS property its reference style names; new words, those of the same layer. */
function changesTheSame(change: Change, other: Change): boolean {
  if (other.id === change.id) return false;
  if (change.kind === "text") return other.kind === "text" && other.target.loc === change.target.loc;
  return other.kind === "style" && sameStyle(change, other);
}

/** What an element shows of what `change` changes: the value of its property, in design language; for new words, what it reads (ticket 90). */
function shownOn(el: Element, change: Change): unknown {
  return change.kind === "text" ? wordsOn(el) : readValue(el, change.property as Property);
}

/**
 * What the other usages of the component of `change` show of its property on
 * the page `doc` now, `width` px wide; null when the page does not look at
 * them for it: the change is not for one usage alone, or the component
 * itself changes the property this round (`round`). A usage that changes it
 * itself this round is left out.
 */
export function noteOtherUsages(doc: Document, change: Change, round: Change[], width: number): OtherUsagesNoted | null {
  if (!looksAtOtherUsages(change)) return null;
  const component = change.target.chain[0].component;
  if (round.some((other) => other.scope === "component" && other.target.chain[0]?.component === component && changesTheSame(change, other))) return null;
  // New words: nor a usage whose instances the round changes the data of (deleted, copied, moved, given words of their own), whose words then change, or shift from one instance to the next (review).
  const changedThere = new Set(
    round.filter((other) => other.scope === "usage" && (changesTheSame(change, other) || (change.kind === "text" && !!other.data))).map((other) => JSON.stringify(other.target.chain)),
  );
  // Made on one instance alone (ticket 114): nor the loop's other instances, once the round changes them all so, nor one it changes so alone too.
  const shared = round.some((other) => other.scope === "usage" && !other.alone && other.layer === aloneOfKey(change.layer)?.id && changesTheSame(change, other));
  const alone = new Set(round.flatMap((other) => (other.alone && other.instance && aloneOfKey(other.layer)?.id === aloneOfKey(change.layer)?.id && changesTheSame(change, other) ? [other.instance.nth] : [])));
  const seen: OtherUsagesNoted["seen"] = [];
  for (const [key, els] of othersOf(doc, change, alone)) {
    const instances = els[0].nth !== undefined;
    if (instances && shared) continue;
    const { chain } = instances ? change.target : originOf(els[0].el, readUsageChain(els[0].el));
    if (!instances && changedThere.has(JSON.stringify(chain))) continue;
    for (const { el, nth } of els) seen.push({ el, key, chain, value: shownOn(el, change), ...(nth && { nth }) });
  }
  return { width, seen };
}

/**
 * What the other usages show now of each change of `round` the page looks at
 * them for, by id, on the page `doc`, `width` px wide: as the code begins to
 * change with the round in edit mode, not claimed (ticket 82), for the page
 * to go by if it claims the round for the Agent (ticket 78).
 */
export function noteRound(doc: Document, round: Change[], width: number, viewWidths: number[] = []): Map<number, OtherUsagesNoted | null> {
  // Outside a breakpoint's range, as wide as the window alone: a copy of the page at another width takes a while to make, and the code is changing (ticket 104).
  const at = (w: number) => (w === width ? itself(doc) : null);
  const here = (change: Change) => outsideOf(change, round, width, viewWidths).filter((w) => w === width);
  return new Map(round.filter((change) => looksAtOtherUsages(change) || here(change).length).map((change) => [change.id, noteChange(doc, change, round, width, here(change), at)]));
}

/**
 * What the page notes of `change` as it begins to check the round, `width`
 * px wide: what the other usages of its component show (ticket 77), and, of a
 * change at a breakpoint, what its layer shows at each of the widths
 * `outside` its range, as `at` shows the page that wide (ticket 104). Null
 * when it looks at neither.
 */
export function noteChange(doc: Document, change: Change, round: Change[], width: number, outside: number[], at: (width: number) => PageWidth | null): OtherUsagesNoted | null {
  return withOutside(noteOtherUsages(doc, change, round, width), width, noteOutside(doc, change, round, outside, at));
}

/** `noted`, with what the layer showed at more widths outside the range (`more`): as noted already when there are none. */
export function withOutside(noted: OtherUsagesNoted | null, width: number, more: OutsideNote[]): OtherUsagesNoted | null {
  return more.length ? { ...(noted ?? { width, seen: [] }), outside: [...(noted?.outside ?? []), ...more] } : noted;
}

/** What the layer of a change at a breakpoint shows of its property at each of `widths` outside its range, as `at` shows the page that wide (ticket 104): none at a width the page cannot be shown at now, or does not have the layer at. */
export function noteOutside(doc: Document, change: Change, round: Change[], widths: number[], at: (width: number) => PageWidth | null): OutsideNote[] {
  const kept: OutsideNote[] = [];
  for (const width of widths) {
    const page = at(width);
    const values = page && valuesAt(doc, change, round as RoundOnCanvas, page);
    if (values) kept.push({ width, values });
  }
  return kept;
}

/** Of `widths` outside a change's range, those `noted` has nothing at yet. */
export function unnoted(noted: OtherUsagesNoted | null | undefined, widths: number[]): number[] {
  return widths.filter((width) => !noted?.outside?.some((one) => one.width === width));
}

/**
 * The widths outside the range of a change at a breakpoint where its layer
 * shows its property otherwise than noted (`noted`, ticket 104), of those
 * looked at now (`widths`), on the page `doc` as `at` shows it that wide: the
 * Agent wrote the change beyond its range. Not where the round itself
 * changes the layer, or a layer around it, there (`changedAround`), nor
 * where the page cannot be shown that wide now (`loading`, a copy of it still
 * loading its stylesheets). Elements are told apart by
 * value alone: a value now that none of them showed as noted.
 */
export function outsideChanged(doc: Document, change: Change, round: RoundOnCanvas, noted: OtherUsagesNoted | null, widths: number[], at: (width: number) => PageWidth | null): { changed: OutsideChanged[]; loading: boolean } {
  const changed: OutsideChanged[] = [];
  let loading = false;
  for (const { width, values } of noted?.outside ?? []) {
    if (!widths.includes(width)) continue;
    const page = at(width);
    loading ||= !page;
    const now = page && valuesAt(doc, change, round, page);
    if (!now) continue;
    const was = values.map((value) => JSON.stringify(value));
    const i = now.findIndex((value) => !was.includes(JSON.stringify(value)));
    if (i < 0 || changedAround(doc, change, round, width)) continue;
    changed.push({ width, was: values[Math.min(i, values.length - 1)], is: now[i] });
  }
  return { changed, loading };
}

/** Whether `noted`, taken for `then`, is for `now`, a change by the same id: the same property of the same layer, not another change since given its id. */
export function notedFor(then: Change, now: Change): boolean {
  return (
    then.id === now.id &&
    then.property === now.property &&
    sameBreakpoint(then.breakpoint, now.breakpoint) &&
    then.target.loc === now.target.loc &&
    JSON.stringify(then.target.chain) === JSON.stringify(now.target.chain)
  );
}

/**
 * The other usages that show the change's property otherwise than noted
 * (`noted`), on the page `doc` now, `width` px wide: one entry a usage, its
 * first instance that does. None at another width than noted, which cannot
 * be told. An element the page has drawn anew, or not known yet (the notes
 * read back from `.humantouch/`), is found again by its usage, and its place
 * among the usage's instances, and known from then on; not found, it is not
 * looked at.
 */
export function otherUsagesChanged(doc: Document, change: Change, noted: OtherUsagesNoted | null, width: number): OtherUsageChanged[] {
  if (!noted || noted.width !== width) return [];
  const found = new Map<string, OtherUsageChanged>();
  let now: Map<string, { el: Element; nth?: number }[]> | undefined;
  noted.seen.forEach((seen, i) => {
    const { el, key, chain, value, nth } = seen;
    // The loop's other instances (ticket 114): each apart.
    const one = nth ? `${key} #${nth}` : key;
    if (found.has(one)) return;
    let there: Element | undefined = el;
    if (!el?.isConnected) {
      now ??= othersOf(doc, change);
      there = nth ? now.get(key)?.find((other) => other.nth === nth)?.el : now.get(key)?.[noted.seen.slice(0, i).filter((earlier) => earlier.key === key).length]?.el;
      seen.el = there;
    }
    if (!there) return;
    const is = shownOn(there, change);
    if (JSON.stringify(is) !== JSON.stringify(value)) found.set(one, { chain, was: value, is, ...(nth && { nth }) });
  });
  return [...found.values()];
}
