/**
 * Finding a layer of the ChangeSet on the live page, as the check (ADR 0006)
 * does: by its element location and usage chain, and, where an edit to its
 * files has moved its markers, by where they went.
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import { MADE_ATTR } from "./canvas-style";
import type { Target } from "./changeset";
import { chainOf, originOf, usageKey, type Origin } from "./layers";
import { readUsageChain, type UsageLevel } from "./usage-chain";

/**
 * The round's canvas as saved, which the page goes by where an edit to a
 * layer's files has moved its markers (ticket 99): read only as far as that
 * asks, its markers before it is parsed.
 */
export interface SavedCanvas {
  /** The locations of the markers written on it in `file` (`data-tk-loc`, `data-tk-usage`), read off it unparsed. */
  markers(file: string): ReadonlySet<string>;
  /** The canvas, parsed. */
  doc(): Document;
}

/** A canvas as saved, `html`, read once each is asked for: its markers file by file, then the whole of it. */
export function savedCanvas(html: string, parse: (html: string) => Document): SavedCanvas {
  const files = new Map<string, Set<string>>();
  let doc: Document | undefined;
  return {
    markers(file) {
      let found = files.get(file);
      if (!found) {
        // As the canvas is serialized: in double quotes, `&` and `"` escaped.
        const start = `="${file.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}:`;
        found = new Set();
        for (let at = html.indexOf(start); at >= 0; at = html.indexOf(start, at + start.length)) {
          if (!MARKER_NAME.test(html.slice(Math.max(0, at - 13), at))) continue;
          const end = html.indexOf('"', at + 2);
          found.add(html.slice(at + 2, end).replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
        }
        files.set(file, found);
      }
      return found;
    },
    doc: () => (doc ??= parse(html)),
  };
}

/** The name of a marker's attribute, just before its value. */
const MARKER_NAME = new RegExp(`(?:${LOC_ATTR}|${USAGE_ATTR})$`);

/**
 * The elements of the layer a change is made to, on the live page now: every
 * instance of its usage. Where an edit to its files has moved markers, as
 * one adding lines above it does, where its own went, by the round's canvas
 * as saved (`canvas`), not an element that came to be where it was; with no
 * canvas, by its markers as they are.
 */
export function elementsOf(doc: Document, target: Target, canvas: () => SavedCanvas | null = () => null): Element[] {
  if (!target.loc) return [];
  const key = usageKey(target.loc, target.chain);
  // Of another tag, it is not the layer, though at its place in the code: an element the Agent wrote where the layer was, say, around it.
  const tag = tagOf(target);
  const els = [...keysIn(doc.documentElement, new Set([target.loc]))].filter(([el, k]) => k === key && (!tag || el.localName === tag)).map(([el]) => el);
  if (!els.length) return movedElementsOf(doc, target, canvas);
  const saved = canvas();
  return saved && markersMoved(doc, [target.loc, ...target.chain.map((level) => level.usage)], saved) ? movedElementsOf(doc, target, () => saved) : els;
}

/** Whether markers written in the files of `locs` (a layer's element's, say, and each usage's on its chain) are not where the canvas has them: an edit to one moved them, or added or took some away. */
function markersMoved(doc: Document, locs: (string | null)[], saved: SavedCanvas): boolean {
  const files = new Set(locs.map((loc) => parseLoc(loc)?.file).filter((file) => file !== undefined));
  for (const file of files) {
    const was = saved.markers(file);
    const now = markersOn(doc, file);
    if (now.size !== was.size || [...now].some((loc) => !was.has(loc))) return true;
  }
  return false;
}

/** What is read off each page to find layers whose markers moved, kept until an element or a marker on it changes: its markers by file, and the layers found by usage key. */
const readOff = new WeakMap<Document, { watch: MutationObserver; files: Map<string, Set<string>>; moved: Map<string, Element[]> }>();

/** What is read off page `doc` as it is now (`readOff`): the check looks at it many times a hot update. */
function readOffPage(doc: Document) {
  let read = readOff.get(doc);
  if (!read) {
    const files = new Map<string, Set<string>>();
    const moved = new Map<string, Element[]>();
    const watch = new MutationObserver(() => {
      files.clear();
      moved.clear();
    });
    watch.observe(doc, { subtree: true, childList: true, attributes: true, attributeFilter: [LOC_ATTR, USAGE_ATTR] });
    readOff.set(doc, (read = { watch, files, moved }));
  }
  // Changed since, and not told yet: what was read is out of date.
  if (read.watch.takeRecords().length) {
    read.files.clear();
    read.moved.clear();
  }
  return read;
}

/** The locations of the markers on page `doc` in `file`. */
function markersOn(doc: Document, file: string): ReadonlySet<string> {
  const { files } = readOffPage(doc);
  let now = files.get(file);
  if (!now) {
    now = new Set();
    for (const el of doc.querySelectorAll(`[${LOC_ATTR}^="${CSS.escape(`${file}:`)}"], [${USAGE_ATTR}^="${CSS.escape(`${file}:`)}"]`)) {
      for (const attr of [LOC_ATTR, USAGE_ATTR]) {
        const loc = el.getAttribute(attr);
        if (loc?.startsWith(`${file}:`)) now.add(loc);
      }
    }
    files.set(file, now);
  }
  return now;
}

/** The tag of the layer's element, as its opening tag gives it. */
function tagOf(target: Target): string | undefined {
  return /^<([\w-]+)/.exec(target.context?.element ?? "")?.[1];
}

/**
 * The elements a change to a component itself is made to, on the live page
 * now: every element the component writes at the change's location, in every
 * usage of it but those with the usage keys `apart`. Where markers in its
 * file have moved (`canvas`), those of the usage it was promoted from, where
 * they went (`elementsOf`).
 */
export function componentElementsOf(doc: Document, target: Target, apart: string[] = [], canvas: () => SavedCanvas | null = () => null): Element[] {
  if (!target.loc) return [];
  const tag = tagOf(target);
  const els = [...keysIn(doc.documentElement, new Set([target.loc]))]
    .filter(([el, key]) => key.startsWith(`${target.loc} `) && !apart.includes(key) && (!tag || el.localName === tag))
    .map(([el]) => el);
  const saved = els.length ? canvas() : null;
  return els.length && !(saved && markersMoved(doc, [target.loc], saved)) ? els : elementsOf(doc, target, canvas);
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
 * A layer whose markers no longer match, as an edit to its files moves them
 * (ticket 99): each of its locations (its element's, and each usage's on its
 * chain) followed to where it went. An edit adds, takes away and moves lines,
 * and keeps the JSX of a file in its order: the markers of the file on the
 * round's canvas `saved` and on the page now, each in source order and each
 * of a kind (an element's tag; the tag of a dependency's element that takes
 * its marker from the usage; a component's name), are paired as many as can
 * be, in order. A location goes where every such pairing takes it; where one
 * takes it elsewhere, or leaves it unpaired, which it is cannot be told, and
 * the layer is not found: the page reads no element in its place. Its
 * elements are those of its tag written in its file by the same components,
 * a dependency's that takes its marker from the usage (`originOf`) too.
 */
function movedElementsOf(doc: Document, target: Target, canvas: () => SavedCanvas | null): Element[] {
  const tag = tagOf(target);
  const file = parseLoc(target.loc)?.file;
  if (!tag || !file) return [];
  const { moved } = readOffPage(doc);
  const key = `${tag} ${usageKey(target.loc!, target.chain)}`;
  if (!moved.has(key)) moved.set(key, followed(doc, target, tag, file, canvas));
  return moved.get(key)!;
}

/** The elements of `target`, of `tag`, written in `file`, where its locations went (`movedElementsOf`). */
function followed(doc: Document, target: Target, tag: string, file: string, canvas: () => SavedCanvas | null): Element[] {
  const components = componentsOf(target.chain);
  const now = layersIn(doc, file, tag, components, readUsageChain);
  if (!now.length) return [];
  const saved = canvas()?.doc();
  if (!saved) return [];
  const was = layersIn(saved, file, tag, components, chainOf);
  const files = new Map<string, [Point[], Point[]]>();
  const where = (loc: string): string | null => {
    const of = parseLoc(loc)?.file;
    if (of === undefined) return null;
    if (!files.has(of)) files.set(of, [pointsIn(saved, of, was, chainOf), pointsIn(doc, of, now, readUsageChain)]);
    const [before, after] = files.get(of)!;
    return movedTo(loc, before, after);
  };
  const loc = where(target.loc!);
  if (!loc) return [];
  const chain: UsageLevel[] = [];
  for (const level of target.chain) {
    const usage = level.usage && where(level.usage);
    if (level.usage && !usage) return [];
    chain.push({ ...level, usage });
  }
  const key = usageKey(loc, chain);
  return now.filter(({ origin }) => usageKey(origin.loc!, origin.chain) === key).map(({ el }) => el);
}

/** The components of a usage chain, and which are a dependency's: what a layer's elements have in common, wherever their markers go. */
function componentsOf(chain: UsageLevel[]): string {
  return JSON.stringify(chain.map(({ component, thirdParty }) => [component, thirdParty]));
}

/** The elements in `root` of `tag` written in `file` by `components` (`componentsOf`), with where each comes from; none made this round. */
function layersIn(root: Document, file: string, tag: string, components: string, chainFor: (el: Element) => UsageLevel[]): { el: Element; origin: Origin }[] {
  const prefix = CSS.escape(`${file}:`);
  const found: { el: Element; origin: Origin }[] = [];
  for (const el of root.querySelectorAll(`${tag}[${LOC_ATTR}^="${prefix}"], ${tag}[${USAGE_ATTR}]:not([${LOC_ATTR}])`)) {
    if (el.hasAttribute(MADE_ATTR)) continue;
    const origin = originOf(el, chainFor(el));
    if (origin.loc?.startsWith(`${file}:`) && componentsOf(origin.chain) === components) found.push({ el, origin });
  }
  return found;
}

/** A marker in a file: where, and of what kind (`movedElementsOf`). */
interface Point {
  loc: string;
  line: number;
  column: number;
  kind: string;
}

/**
 * The markers of `file` in `root`, in source order: each element's written
 * there, by its tag; each a dependency's element takes from its usage there
 * (`originOf`), by its tag and `via`; and each usage there on the chains of
 * `layers` (`layersIn`), by its component's name. None made this round.
 */
function pointsIn(root: Document, file: string, layers: { origin: Origin }[], chainFor: (el: Element) => UsageLevel[]): Point[] {
  const kinds = new Map<string, Set<string>>();
  const add = (loc: string | null, kind: string) => {
    if (!loc?.startsWith(`${file}:`)) return;
    if (!kinds.has(loc)) kinds.set(loc, new Set());
    kinds.get(loc)!.add(kind);
  };
  const prefix = CSS.escape(`${file}:`);
  for (const el of root.querySelectorAll(`[${LOC_ATTR}^="${prefix}"], [${USAGE_ATTR}^="${prefix}"]:not([${LOC_ATTR}])`)) {
    if (el.hasAttribute(MADE_ATTR)) continue;
    if (el.hasAttribute(LOC_ATTR)) add(el.getAttribute(LOC_ATTR), el.localName);
    else add(originOf(el, chainFor(el)).loc, `${el.localName} via`);
  }
  for (const { origin } of layers) for (const level of origin.chain) add(level.usage, `<${level.component}>`);
  const points: Point[] = [];
  for (const [loc, kind] of kinds) {
    const at = parseLoc(loc);
    if (at) points.push({ loc, line: at.line, column: at.column, kind: [...kind].sort().join(" ") });
  }
  return points.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Past this many pairs of markers to weigh, a file is too large to follow a location through: not found. */
const MAX_PAIRS = 25_000_000;

/**
 * Where location `loc`, a marker in `before`, went in `after`: the marker
 * every largest pairing of the two, in order and kind by kind, pairs it
 * with. Null where one pairs it with another, or leaves it unpaired.
 */
function movedTo(loc: string, before: Point[], after: Point[]): string | null {
  const i = before.findIndex((point) => point.loc === loc);
  const n = before.length;
  const m = after.length;
  if (i < 0 || !m || n * m > MAX_PAIRS) return null;
  const same = (x: number, y: number) => before[x].kind === after[y].kind;
  // Nothing before it, nor it, written otherwise: it stayed put, whatever came after it.
  if (i < m && before.slice(0, i + 1).every((point, x) => point.loc === after[x].loc && same(x, x))) return loc;
  // The most pairs of the markers before it with after's first y, for each y.
  let head = new Int32Array(m + 1);
  for (let x = 0; x < i; x++) {
    const next = new Int32Array(m + 1);
    for (let y = 0; y < m; y++) next[y + 1] = same(x, y) ? head[y] + 1 : Math.max(head[y + 1], next[y]);
    head = next;
  }
  // The most pairs of the markers after it with after's from y on, for each y.
  let tail = new Int32Array(m + 1);
  for (let x = n - 1; x > i; x--) {
    const next = new Int32Array(m + 1);
    for (let y = m - 1; y >= 0; y--) next[y] = same(x, y) ? tail[y + 1] + 1 : Math.max(tail[y], next[y + 1]);
    tail = next;
  }
  let unpaired = 0;
  for (let y = 0; y <= m; y++) unpaired = Math.max(unpaired, head[y] + tail[y]);
  let most = 0;
  let to: number[] = [];
  for (let y = 0; y < m; y++) {
    if (!same(i, y)) continue;
    const pairs = head[y] + 1 + tail[y + 1];
    if (pairs > most) [most, to] = [pairs, [y]];
    else if (pairs === most) to.push(y);
  }
  return most > unpaired && to.length === 1 ? after[to[0]].loc : null;
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
