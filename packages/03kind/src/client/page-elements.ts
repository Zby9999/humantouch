/**
 * Finding a layer of the ChangeSet on the live page, as the check (ADR 0006)
 * does: by its element location and usage chain, and, where an edit to its
 * file has moved its markers, by where they went.
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import type { Target } from "./changeset";
import { originOf, usageKey } from "./layers";
import { readUsageChain } from "./usage-chain";

/**
 * The elements of the layer a change is made to, on the live page now: every
 * instance of its usage. Where its markers have moved, as an edit to its file
 * moves them, where they went.
 */
export function elementsOf(doc: Document, target: Target): Element[] {
  if (!target.loc) return [];
  const key = usageKey(target.loc, target.chain);
  // Of another tag, it is not the layer, though at its place in the code: an element the Agent wrote where the layer was, say, around it.
  const tag = tagOf(target);
  const els = [...keysIn(doc.documentElement, new Set([target.loc]))].filter(([el, k]) => k === key && (!tag || el.localName === tag)).map(([el]) => el);
  return els.length ? els : movedElementsOf(doc, target);
}

/** The tag of the layer's element, as its opening tag gives it. */
function tagOf(target: Target): string | undefined {
  return /^<([\w-]+)/.exec(target.context?.element ?? "")?.[1];
}

/**
 * The elements a change to a component itself is made to, on the live page
 * now: every element the component writes at the change's location, in every
 * usage of it but those with the usage keys `apart`. Where its markers have
 * moved, those of the usage it was promoted from.
 */
export function componentElementsOf(doc: Document, target: Target, apart: string[] = []): Element[] {
  if (!target.loc) return [];
  const tag = tagOf(target);
  const els = [...keysIn(doc.documentElement, new Set([target.loc]))]
    .filter(([el, key]) => key.startsWith(`${target.loc} `) && !apart.includes(key) && (!tag || el.localName === tag))
    .map(([el]) => el);
  return els.length ? els : elementsOf(doc, target);
}

/**
 * The elements the component writes at a layer's location in its other
 * usages on the live page now (ticket 77): every instance of each, by its
 * usage key; none of the layer's own usage. By their markers as they are:
 * none where they have moved.
 */
export function otherUsagesOf(doc: Document, target: Target): Map<string, Element[]> {
  const usages = new Map<string, Element[]>();
  if (!target.loc) return usages;
  const own = usageKey(target.loc, target.chain);
  const tag = tagOf(target);
  for (const [el, key] of keysIn(doc.documentElement, new Set([target.loc]))) {
    if (key === own || !key.startsWith(`${target.loc} `) || (tag && el.localName !== tag)) continue;
    usages.set(key, [...(usages.get(key) ?? []), el]);
  }
  return usages;
}

/**
 * A layer whose markers no longer match, found among the elements of the same
 * tag written in the same file, by the same components: the one whose
 * locations moved least. None when two are as near.
 */
function movedElementsOf(doc: Document, target: Target): Element[] {
  const at = parseLoc(target.loc);
  const tag = tagOf(target);
  if (!at || !tag) return [];
  const components = JSON.stringify(target.chain.map(({ component, thirdParty }) => [component, thirdParty]));
  const groups = new Map<string, { distance: number; els: Element[] }>();
  for (const el of doc.querySelectorAll(`${tag}[${LOC_ATTR}^="${CSS.escape(at.file)}:"]`)) {
    const { loc, chain } = originOf(el, readUsageChain(el));
    if (!loc || JSON.stringify(chain.map(({ component, thirdParty }) => [component, thirdParty])) !== components) continue;
    const distance = [distanceOf(target.loc, loc), ...chain.map((level, i) => distanceOf(target.chain[i].usage, level.usage))].reduce((a, b) => a + b, 0);
    if (!Number.isFinite(distance)) continue;
    const key = usageKey(loc, chain);
    const group = groups.get(key) ?? { distance, els: [] };
    group.els.push(el);
    groups.set(key, group);
  }
  const ranked = [...groups.values()].sort((a, b) => a.distance - b.distance);
  return ranked.length && (ranked.length === 1 || ranked[0].distance < ranked[1].distance) ? ranked[0].els : [];
}

/** How far a location moved: lines, a little more for another column; infinitely far in another file. */
function distanceOf(from: string | null, to: string | null): number {
  if (from === to) return 0;
  const a = parseLoc(from);
  const b = parseLoc(to);
  if (!a || !b || a.file !== b.file) return Infinity;
  return Math.abs(a.line - b.line) + (a.column === b.column ? 0 : 0.5);
}

function parseLoc(loc: string | null): { file: string; line: number; column: number } | null {
  const match = loc && /^(.*):(\d+):(\d+)$/.exec(loc);
  return match ? { file: match[1], line: Number(match[2]), column: Number(match[3]) } : null;
}

/** Elements in `root` (itself included) that may be layers at `locs`, with their usage keys. */
function* keysIn(root: Element, locs: Set<string>): Generator<[Element, string]> {
  for (const el of [root, ...root.querySelectorAll(`[${LOC_ATTR}], [${USAGE_ATTR}]`)]) {
    const own = el.getAttribute(LOC_ATTR);
    // Without a location of its own, it may pass a usage's props on; its origin says.
    if (own ? !locs.has(own) : !el.hasAttribute(USAGE_ATTR)) continue;
    const { loc, chain } = originOf(el, readUsageChain(el));
    if (loc) yield [el, usageKey(loc, chain)];
  }
}

/** The usage key of a live element: null with no source marker. */
export function usageKeyOf(el: Element): string | null {
  const { loc, chain } = originOf(el, readUsageChain(el));
  return loc && usageKey(loc, chain);
}
