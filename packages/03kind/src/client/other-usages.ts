/**
 * A change for one usage of a component alone (ticket 77), which the Agent
 * may write into the component itself, so that its other usages change too.
 * As the page begins to check a claimed round, it notes what the component's
 * other usages on the page show of the change's property, as wide as its
 * window; looking again as the code changes, a value not what it was there
 * means the change went beyond its usage, and is not applied. The property
 * the change sets alone is looked at, as the check reads it, not every style
 * an edit may bring along. Not looked at: a usage the round changes the
 * property of itself, every usage when the round changes the component
 * itself so, and usages not on the page.
 */
import type { OtherUsageChanged } from "../service-protocol";
import type { Change } from "./changeset";
import { forOneUsage, foundByMarker } from "./checkable";
import { originOf } from "./layers";
import { otherUsagesOf } from "./page-elements";
import { readValue, type Property } from "./property-table";
import { readUsageChain, type UsageLevel } from "./usage-chain";

/** What the component's other usages showed of a change's property, as the page began to check the round, as wide as its window was then: by element, each instance of each usage. */
export interface OtherUsagesNoted {
  width: number;
  seen: { el: Element; key: string; chain: UsageLevel[]; value: unknown }[];
}

/** Whether the page looks at the component's other usages for `change`: a style change for one usage of it alone, to a layer it finds by its source marker. */
export function looksAtOtherUsages(change: Change): boolean {
  return change.kind === "style" && change.scope === "usage" && !change.data && foundByMarker(change.target) && forOneUsage(change);
}

/** Whether `other`, another change of the round, changes what `change` changes: its property, or a CSS property its reference style names. */
function changesTheSame(change: Change, other: Change): boolean {
  return other.id !== change.id && other.kind === "style" && (other.property === change.property || Object.keys(other.style).some((css) => css in change.style));
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
  const changedThere = new Set(round.filter((other) => other.scope === "usage" && changesTheSame(change, other)).map((other) => JSON.stringify(other.target.chain)));
  const seen: OtherUsagesNoted["seen"] = [];
  for (const [key, els] of otherUsagesOf(doc, change.target)) {
    const { chain } = originOf(els[0], readUsageChain(els[0]));
    if (changedThere.has(JSON.stringify(chain))) continue;
    for (const el of els) seen.push({ el, key, chain, value: readValue(el, change.property as Property) });
  }
  return { width, seen };
}

/**
 * The other usages that show the change's property otherwise than noted
 * (`noted`), on the page `doc` now, `width` px wide: one entry a usage, its
 * first instance that does. None at another width than noted, which cannot
 * be told. An element the page has drawn anew is found again by its usage,
 * and its place among the usage's instances; not found, it is not looked at.
 */
export function otherUsagesChanged(doc: Document, change: Change, noted: OtherUsagesNoted | null, width: number): OtherUsageChanged[] {
  if (!noted || noted.width !== width) return [];
  const found = new Map<string, OtherUsageChanged>();
  let now: Map<string, Element[]> | undefined;
  noted.seen.forEach(({ el, key, chain, value }, i) => {
    if (found.has(key)) return;
    let there: Element | undefined = el;
    if (!el.isConnected) {
      now ??= otherUsagesOf(doc, change.target);
      there = now.get(key)?.[noted.seen.slice(0, i).filter((seen) => seen.key === key).length];
    }
    if (!there) return;
    const is = readValue(there, change.property as Property);
    if (JSON.stringify(is) !== JSON.stringify(value)) found.set(key, { chain, was: value, is });
  });
  return [...found.values()];
}
