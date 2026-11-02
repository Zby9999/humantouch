/**
 * The check (ADR 0006, 0013): whether the live page shows a change. The page
 * never shows changes not yet applied (ADR 0010), so what it shows is what the
 * code does. A change at a breakpoint shows at its widths; one made in the
 * desktop view, at every width, but where the round changes the same property
 * of the layer at a breakpoint of its own (ADR 0008): it is looked at as wide
 * as the page's window and as wide as each view, on a copy of the page that
 * wide (`page-copy.ts`). Looking is done at once, with no waiting: when to
 * look is `page-checks.ts`'s. What the browser draws otherwise than written
 * is drawn on the page to compare where the code that writes it cannot be
 * read: on an element put in and taken out at once, before anything is painted.
 */
import { breakpointName, mediaOf, widthIn, type Breakpoint } from "./breakpoints";
import { BRIEF_UNCHECKED, type CheckResult } from "../service-protocol";
import { changeKey, isReorder, type Change, type Created, type Margins, type Place, type Target } from "./changeset";
import { openingTag } from "./layer-target";
import { checkable, madeLayer, makerOf, PLACED_BY, placeOfMade, PLACING, SIDES, type Edge } from "./checkable";
import { absolute, readValue, sourcesFor, type Property, type Stroke } from "./property-table";
import { NOT_DRAWN, originOf, SIGN_WORDS, signOf, usageKey } from "./layers";
import { componentElementsOf, elementsOf, usageKeyOf } from "./page-elements";
import { readUsageChain } from "./usage-chain";
import { colorReader } from "./paint";
import { drawnStroke, showsStroke } from "./stroke-weight";

/**
 * Properties the browser draws otherwise than written: compared as the code
 * writes them, or else as the page draws them, the value after drawn on the
 * page first (`draw`), so a value the code writes right is not taken for one it
 * does not, nor one it writes wrong for one it does.
 */
const AS_WRITTEN: Partial<Record<Property, { draw(doc: Document, value: unknown): unknown; shows(el: Element, value: unknown, drawn: unknown): boolean }>> = {
  // A border is drawn a whole number of physical pixels wide: 1.5px is 1px on a 1x screen, as 1px is.
  stroke: {
    draw: (doc, value) => drawnStroke(doc, value as Stroke | null),
    shows: (el, value, drawn) => showsStroke(el, colorReader(el.ownerDocument), value as Stroke | null, drawn as Stroke | null),
  },
};

/** Why a change cannot be checked, when it cannot (`checkable`): the page must be able to find the layer, and tell what the change does there. `round`: the changes of its round. */
export function uncheckable(change: Change, round: Change[]): string | null {
  if (checkable(change, round)) return null;
  if (change.kind === "brief") return BRIEF_UNCHECKED;
  if (change.kind === "create") return containerUnfound(placeOfMade(change, round).container.target, round);
  if (change.target.made) return madeUnfound(change, change.target.made, round);
  if (change.target.run !== undefined) return "the text has no element of its own on the page";
  if (!change.target.loc) return "the layer has no source marker, so the page cannot find it";
  if (change.kind === "style") return "the layer's container cannot be found on the page";
  if (isReorder(change) && !change.order) return "text runs on among the layers of its container, so the page cannot tell their order";
  return "of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page";
}

/**
 * The page as a check reads it at one width: the page itself (`own`), or a
 * copy of it that wide; `of`, an element of the page as shown there.
 */
export interface PageWidth {
  width: number;
  doc: Document;
  own: boolean;
  of(el: Element): Element | null;
}

/** The page itself, as wide as its window. */
export function itself(doc: Document): PageWidth {
  return { width: doc.defaultView?.innerWidth ?? 0, doc, own: true, of: (el) => el };
}

/**
 * Where the change is to show (ADR 0008): the page itself, when its window is
 * at a width the change applies at, and the other widths to look at it on a
 * copy of the page. A change at a breakpoint: one width in each part of its
 * range the project's breakpoints cut it into, where the window is not. One made in the desktop view: every view's width
 * too, but those where the round changes the same property of the layer at a
 * breakpoint of its own, and, for a `right` or `bottom`, those where the canvas
 * places the layer otherwise (`Change.placedOtherwiseAt`, ticket 75): the
 * window's width either. A reorder is the same at every width.
 */
export function widthsOf(change: Change, round: Change[], pageWidth: number, viewWidths: number[]): { own: boolean; others: number[] } {
  const { breakpoint } = change;
  if (breakpoint) {
    // Each part of the range the project's breakpoints cut it into (ticket 65): the page itself in the part its window is in.
    const parts = change.parts?.map((part) => part.breakpoint) ?? [breakpoint];
    return { own: parts.some((part) => within(part, pageWidth)), others: parts.filter((part) => !within(part, pageWidth)).map(widthIn) };
  }
  if (change.kind === "move" && !(change.after as Place).absolute) return { own: true, others: [] };
  // A new layer in its container's layout is there or not at every width alike; placed absolute, it is placed at each.
  if (change.kind === "create" && !placeOfMade(change, round).absolute) return { own: true, others: [] };
  const { loc, chain, made: madeAs } = change.target;
  const sameLayer = (other: Change) => (madeAs ? other.layer === change.layer : other.target.loc === loc && usageKey(loc!, other.target.chain) === usageKey(loc!, chain));
  const ownRanges = loc || madeAs ? round.filter((other) => other.breakpoint && other.property === change.property && sameLayer(other)).map((other) => other.breakpoint!) : [];
  const placesNothing = change.placedOtherwiseAt ?? [];
  const covered = (width: number) => [...ownRanges, ...placesNothing].some((range) => within(range, width));
  return { own: !covered(pageWidth), others: [...new Set(viewWidths)].filter((width) => width !== pageWidth && !covered(width)) };
}

/**
 * Why the page cannot find a layer made this round, as change `change` to it
 * needs: made in a round before, its source not marked on the canvas (ticket
 * 76: it is not looked for); made as a copy, a layer put back or a new
 * Stack; in a container the page cannot find; or found, but the change is
 * not to its style.
 */
function madeUnfound(change: Change, id: string, round: Change[]): string {
  const maker = makerOf(id, round);
  if (!maker) return "the layer was made in a round before, and the page cannot find it: the canvas has no source marker for it";
  if (maker.kind !== "create") return "the layer is new this round, so the page has no marker to find it by";
  if (change.kind !== "style") return "of the changes to a layer made this round, the page checks only the layer itself and its styles";
  return containerUnfound(placeOfMade(maker, round).container.target, round);
}

/** Why the page cannot find a container a layer is made in, as deep as layers made this round go. */
function containerUnfound(target: Target, round: Change[]): string {
  if (!target.made) return "its container has no source marker, so the page cannot find it";
  const maker = makerOf(target.made, round);
  if (!maker) return "its container was made in a round before, and the page cannot find it";
  if (maker.kind !== "create") return "its container is new this round (a copy, a layer put back or a new Stack), so the page has no marker to find it by";
  return containerUnfound(placeOfMade(maker, round).container.target, round);
}

/** What the page shows where a layer made this round is to be, and is not (ticket 76). */
export interface MadeMissing {
  /** What it is, and new text's words, as the page looks for it: of any tag (the canvas's `<div>` or `<p>` is the editor's, not the designer's). */
  type: Created["type"];
  words?: string;
  /** Which of its container's layers it is to be, from 1; a range, as the page may still have layers the round takes out, or not yet those it puts in. Null: placed absolute. */
  nth: [number, number] | null;
  /** What is there instead, as an opening tag and its words: none, nothing. */
  there: string | null;
}

/** A layer made this round, looked for on the page: its elements, or what is at its place instead, or why it cannot be told. */
type Found = { els: Element[] } | { missing: MadeMissing } | { unchecked: string };

/**
 * The elements of a layer made this round (ticket 76), on the live page:
 * where its change says, in its container (found by its marker, or made
 * this round as well, found so), an element the container did not have
 * before, of any tag, new text with its words. In a container's layout,
 * among the layers the canvas has before it; placed absolute, any of the
 * container's layers placed absolute. In every instance
 * of the container. Found at more than one place in the source, which one is
 * the layer cannot be told: the page does not guess.
 */
function findMade(doc: Document, id: string, round: Change[]): Found {
  const found = madeLayer(id, round);
  if (!found) return { unchecked: "the layer cannot be found on the page" };
  const { maker, place } = found;
  const created = maker.after as Created;
  const { target } = place.container;
  const outer: Found = target.made ? findMade(doc, target.made, round) : { els: elementsOf(doc, target) };
  if ("unchecked" in outer) return outer;
  if ("missing" in outer || !outer.els.length) return { unchecked: "its container is not on the page now" };
  const written = round.filter((change) => change.kind === "text" && change.layer === id).at(-1)?.after as string | undefined;
  const words = created.type === "text" ? spaced(written ?? created.text ?? "") : undefined;
  const among = maker.among;
  const range: [number, number] | null = place.absolute ? null : among ? [among.before, among.before + among.maybe] : [place.nth - 1, place.nth - 1];
  const els: Element[] = [];
  for (const container of outer.els) {
    const layers = [...container.children].filter((el) => !NOT_DRAWN.has(el.localName));
    // Not a layer the container had before this round: of the elements that look so, as many as it had are its own (tag and words, `signOf`).
    const counts = new Map<string, number>();
    for (const el of layers) counts.set(signOf(el), (counts.get(signOf(el)) ?? 0) + 1);
    for (const sign of among?.signs ?? []) counts.set(sign, (counts.get(sign) ?? 0) - 1);
    const matches = (el: Element) => (words === undefined || spaced(el.textContent ?? "") === words) && counts.get(signOf(el))! > 0;
    const here = range ? layers.slice(range[0], range[1] + 1).filter(matches) : layers.filter((el) => matches(el) && /^(absolute|fixed)$/.test(getComputedStyle(el).position));
    if (!here.length) {
      const there = range ? layers[range[0]] : undefined;
      return { missing: { type: created.type, ...(words !== undefined && { words }), nth: range && [range[0] + 1, range[1] + 1], there: there ? described(there) : null } };
    }
    els.push(...here);
  }
  // Rendered more than once from one place in the source (a loop, a component) is one layer; from several, the page cannot tell which.
  const places = [...new Set(els.map((el) => originOf(el, readUsageChain(el)).loc))];
  if (places.length > 1) {
    const where = places.map((loc) => (loc ? `\`${loc}\`` : "one with no source marker"));
    return { unchecked: `${els.length} elements at its place match it, written at ${places.length} places in the source (${where.join(", ")}): the page does not guess which is the layer` };
  }
  return { els };
}

/** Words as a reader takes them, white space run together. */
function spaced(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** An element as the Agent finds it: its opening tag, and its words. */
function described(el: Element): string {
  const words = spaced(el.textContent ?? "").slice(0, SIGN_WORDS);
  return `${openingTag(el)}${words ? ` reading “${words}”` : ""}`;
}

function within({ min, max }: Breakpoint, width: number): boolean {
  return (min === null || width >= min) && (max === null || width < max);
}

/**
 * Whether the page shows the change, at every width it is to show at:
 * looked at as wide as the page's window first, then at each other width on
 * a copy of the page, by `at` (null when there is none to be had). `round`:
 * the changes of its round, where a usage with a change of its own to the
 * property a change to its component makes shows that one instead, and a
 * breakpoint changed on its own keeps its value. `sources`: a style change
 * not shown says what sets the value shown instead too.
 */
export function checkAcross(doc: Document, change: Change, round: Change[], viewWidths: number[], at: (width: number) => PageWidth | null, sources = false): CheckResult {
  const reason = uncheckable(change, round);
  if (reason) return { outcome: "unchecked", reason };
  const page = itself(doc);
  const { own, others } = widthsOf(change, round, page.width, viewWidths);
  if (!own && !others.length && change.placedOtherwiseAt?.length) {
    return { outcome: "unchecked", reason: `at the widths the page is looked at, the canvas places the layer otherwise than by its \`${change.property}\`` };
  }
  const apart = ownValues(change, round);
  let checked = false;
  if (own) {
    const result = lookAt(doc, change, round, apart, page, sources);
    if (result.outcome !== "shown") return result;
    checked = true;
  }
  for (const width of others) {
    const copy = at(width);
    if (!copy) {
      const where = change.breakpoint ? `it applies ${breakpointName(change.breakpoint)} only, and` : "it applies at every width, but";
      return { outcome: "unchecked", reason: `${where} the page could not be shown ${width}px wide to check it` };
    }
    if (change.breakpoint && !copy.doc.defaultView?.matchMedia(mediaOf(change.breakpoint)).matches) {
      return { outcome: "unchecked", reason: `it applies ${breakpointName(change.breakpoint)} only, and the page could not be shown ${width}px wide to check it` };
    }
    const result = lookAt(doc, change, round, apart, copy, sources);
    // Not there at this width at all: nothing to show there.
    if (result.outcome === "unchecked") continue;
    if (result.outcome === "not shown") return result;
    checked = true;
  }
  return checked ? { outcome: "shown" } : { outcome: "unchecked", reason: "the layer is not on the page now" };
}

/**
 * Whether the page, as wide as its window, still shows a change it has
 * shown at every width: a quick look as the code changes, with no copy of the
 * page to bring up to date. Null when the change is not to show at that
 * width, and is looked at on copies of the page only.
 */
export function checkHere(doc: Document, change: Change, round: Change[], viewWidths: number[]): CheckResult | null {
  if (uncheckable(change, round)) return null;
  const page = itself(doc);
  return widthsOf(change, round, page.width, viewWidths).own ? lookAt(doc, change, round, ownValues(change, round), page) : null;
}

/** Whether the page shows the change as wide as its window; for tests, and a change the window is wide enough for. */
export function checkChange(doc: Document, change: Change, round: Change[] = [change]): CheckResult {
  const reason = uncheckable(change, round);
  return reason ? { outcome: "unchecked", reason } : lookAt(doc, change, round, ownValues(change, round), itself(doc));
}

/**
 * Of a change to a component itself, the usages that have a value of their own
 * for the property at the same widths, which they show in its place: by usage key.
 */
function ownValues(change: Change, round: Change[]): string[] {
  const { loc } = change.target;
  if (change.scope !== "component" || !loc) return [];
  const key = changeKey(loc, change.property, change.breakpoint);
  return round.filter((other) => other.scope === "usage" && other.target.loc === loc && changeKey(loc, other.property, other.breakpoint) === key).map((other) => usageKey(loc, other.target.chain));
}

/**
 * Whether the page, as `at` shows it, shows the change: found on the page
 * `doc`, read where `at` shows it. A change to a component, but in the usages
 * `apart`. `sources`: a style change not shown says what sets the value there.
 */
function lookAt(doc: Document, change: Change, round: Change[], apart: string[], at: PageWidth, sources = false): CheckResult {
  // A change at a breakpoint is looked at at a width in its range: which one does not matter, but for a range in parts (ticket 65).
  const width = at.own || (change.breakpoint && !change.parts) ? undefined : at.width;
  const result = look(doc, change, round, apart, at, sources);
  return result.outcome === "not shown" && width !== undefined ? { ...result, width } : result;
}

/** The elements a style change is to show on, as `at` shows them: a change to a component itself shows in every usage of it, but those `apart`. */
function styledBy(doc: Document, change: Change, apart: string[], at: PageWidth): Element[] {
  const found = change.scope === "component" ? componentElementsOf(doc, change.target, apart) : elementsOf(doc, change.target);
  return found.map((el) => at.of(el)).filter((el): el is Element => !!el);
}

/** The value of a style change's property the page, as `at` shows it, has on the layer now; undefined when the layer is not there. */
export function valueOn(doc: Document, change: Change, at: PageWidth): unknown {
  const [el] = styledBy(doc, change, ownValues(change, [change]), at);
  return el ? readValue(el, change.property as Property) : undefined;
}

function look(doc: Document, change: Change, round: Change[], apart: string[], at: PageWidth, sources: boolean): CheckResult {
  if (change.kind === "delete") return lookDeleted(doc, change, at);
  if (change.kind === "move") return (change.after as Place).absolute ? lookPlaced(doc, change, at) : lookOrder(doc, change);
  if (change.kind === "create") return lookMade(doc, change, round, at);
  const property = change.property as Property;
  let els: Element[];
  if (change.target.made) {
    // A layer made this round: found where its change puts it (ticket 76).
    const found = findMade(doc, change.target.made, round);
    if ("unchecked" in found) return { outcome: "unchecked", reason: found.unchecked };
    if ("missing" in found) return { outcome: "unchecked", reason: `the layer is new this round, and not at its place on the page (change ${makerOf(change.target.made, round)!.id})` };
    els = found.els.map((el) => at.of(el)).filter((el): el is Element => !!el);
  } else els = styledBy(doc, change, apart, at);
  if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
  const margins = marginsFor(change, at);
  const [result, wrong] = margins && change.after !== null && PLACING.includes(property) ? lookPosition(els, property, change.after as number | { x: number; y: number }, margins) : lookStyle(els, property, change.after, at);
  // What sets the value shown instead, read on the element that shows it.
  return sources && result.outcome === "not shown" && wrong ? { ...result, sources: sourcesFor(wrong, property) } : result;
}

/** Whether every one of `els` shows `after`; not, the first that does not, and the value it shows. */
function lookStyle(els: Element[], property: Property, after: unknown, at: PageWidth): [CheckResult, Element | null] {
  const comparison = AS_WRITTEN[property];
  const drawn = comparison && comparison.draw(at.doc, after);
  const shows = comparison ? (el: Element) => comparison.shows(el, after, drawn) : (el: Element) => sameValue(readValue(el, property), after);
  const wrong = els.find((el) => !shows(el));
  return wrong === undefined ? [{ outcome: "shown" }, null] : [{ outcome: "not shown", actual: readValue(wrong, property) }, wrong];
}

/**
 * A deleted layer is gone from the page, or hidden, while its container is
 * there (gone with its container, it may only be out of view). An element
 * found by its markers counts as the layer only if it looks the same: its tag
 * and words, or, with no words, its opening tag; markers move as the Agent edits.
 */
function lookDeleted(doc: Document, change: Change, at: PageWidth): CheckResult {
  const { target } = change;
  if (!elementsOf(doc, (change.before as Place).container.target).length) return { outcome: "unchecked", reason: "its container is not on the page now" };
  const own = usageKey(target.loc!, target.chain);
  const tag = /^<([\w-]+)/.exec(target.context.element)?.[1];
  const same = (el: Element) =>
    target.context.text ? signOf(el) === `${tag} ${target.context.text}` : el.localName === tag && (usageKeyOf(el) === own || openingTag(el) === target.context.element);
  const there = elementsOf(doc, target)
    .filter(same)
    .map((el) => at.of(el))
    .filter((el) => el && getComputedStyle(el).display !== "none");
  return there.length ? { outcome: "not shown", actual: "there" } : { outcome: "shown" };
}

/**
 * The reordered layer is in its place among the container's other layers, as
 * the canvas has them: told apart by what they look like, as the Agent's
 * edit moves their markers. Layers other reorders move are left out, so each
 * reorder is checked on its own. `actual`: the layers on the page, in order.
 */
function lookOrder(doc: Document, change: Change): CheckResult {
  const containers = elementsOf(doc, (change.after as Place).container.target);
  if (!containers.length) return { outcome: "unchecked", reason: "its container is not on the page now" };
  const { signs, self, others } = change.order!;
  const kept = signs.filter((_, i) => !others.includes(i));
  for (const container of containers) {
    const page = [...container.children].map(signOf);
    if (!page.includes(signs[self])) return { outcome: "unchecked", reason: "the layer cannot be told apart in its container on the page now" };
    const expected = kept.filter((sign) => page.includes(sign));
    const actual = page.filter((sign) => kept.includes(sign));
    if (!sameValue(actual, expected)) return { outcome: "not shown", actual };
  }
  return { outcome: "shown" };
}

/**
 * A layer placed absolute is absolute, in its container as its positioning
 * reference, where the canvas draws it, in every instance (`drawnThere`).
 * `actual`: where it is instead, its `left` and `top` and its margins; null
 * when it is not absolute, "no reference" when placed from elsewhere.
 */
function lookPlaced(doc: Document, change: Change, at: PageWidth): CheckResult {
  const els = elementsOf(doc, change.target)
    .map((el) => at.of(el))
    .filter((el): el is Element => !!el);
  return placedThere(els, (change.after as Place).absolute!, marginsFor(change, at));
}

/**
 * The layer a `create` change makes (ticket 76), found where it puts it:
 * new text with its words, its container's layer the canvas has it as, or,
 * placed absolute, placed where the canvas has it (its X and Y as
 * the designer last set them). `actual`, not found: what is there instead
 * (`MadeMissing`); placed elsewhere, as for a move placed absolute.
 */
function lookMade(doc: Document, change: Change, round: Change[], at: PageWidth): CheckResult {
  const found = findMade(doc, change.layer, round);
  if ("unchecked" in found) return { outcome: "unchecked", reason: found.unchecked };
  if ("missing" in found) return { outcome: "not shown", actual: found.missing };
  const { absolute: placed } = placeOfMade(change, round);
  if (!placed) return { outcome: "shown" };
  const els = found.els.map((el) => at.of(el)).filter((el): el is Element => !!el);
  const latest = (axis: "x" | "y") => round.filter((other) => other.kind === "style" && other.layer === change.layer && other.property === axis && !other.breakpoint).at(-1)?.after as number | undefined;
  return placedThere(els, { x: latest("x") ?? placed.x, y: latest("y") ?? placed.y }, null);
}

/** Whether every one of `els` is placed absolute in its container, drawn at `to`; with no elements, it cannot be told. */
function placedThere(els: Element[], { x, y }: { x: number; y: number }, margins: CanvasMargins | null): CheckResult {
  if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
  for (const el of els) {
    const style = getComputedStyle(el);
    if (!/^(absolute|fixed)$/.test(style.position)) return { outcome: "not shown", actual: null };
    // Placed from its container, or from somewhere else.
    if (style.position === "absolute" && (el as HTMLElement).offsetParent !== el.parentElement) return { outcome: "not shown", actual: "no reference" };
    const placed = placedOn(el);
    if (!drawnThere(placed, { x, y }, margins)) return { outcome: "not shown", actual: placed };
  }
  return { outcome: "shown" };
}

/**
 * An `x`, `y` or `absolute` style change, or a `right` or `bottom` one
 * (ticket 75): shown where every instance is absolute and drawn where the
 * canvas draws it (`drawnThere`), from its container's right or bottom edge
 * for those, whatever the page places it by: where the canvas places it so
 * (`widthsOf`), it must be drawn there. `actual`: along one axis, its `left`
 * or `top` (`right`, `bottom`) and its margin there; both, as a placement is.
 * Not shown: with the first that is not.
 */
function lookPosition(els: Element[], property: Property, after: number | { x: number; y: number }, margins: CanvasMargins): [CheckResult, Element | null] {
  const along = PLACED_BY[property];
  for (const el of els) {
    if (!absolute(el)) return [{ outcome: "not shown", actual: property === "absolute" ? null : readValue(el, property) }, el];
    const placed = placedOn(el, along?.edge);
    if (typeof after !== "number") {
      if (!drawnThere(placed, after, margins)) return [{ outcome: "not shown", actual: placed }, el];
      continue;
    }
    const { axis } = along!;
    if (!drawnThere(placed, { [axis]: after }, margins)) {
      return [{ outcome: "not shown", actual: { value: placed[axis], margin: placed.margins[axis] } }, el];
    }
  }
  return [{ outcome: "shown" }, null];
}

/**
 * The margins the canvas draws a placed layer past its X and Y by, at the
 * width it is looked at; null for a change recorded before the canvas kept
 * them, looked at by its `left` and `top` alone. `known`: they were measured
 * on the canvas at that width, as wide as the page's window (a breakpoint's
 * change, in its range). At the other widths a change made in the desktop
 * view is looked at, the page's own breakpoints may give the layer other
 * margins than the desktop view's: there either way counts, its margins kept
 * (its `left` and `top` are X and Y) or put into its `left` and `top`.
 */
function marginsFor(change: Change, at: PageWidth): CanvasMargins | null {
  return change.margins ? { margins: change.margins, known: !!(at.own || change.breakpoint) } : null;
}

type CanvasMargins = { margins: Margins; known: boolean };

/** Where the page places an absolute layer: its `left` and `top`, and its left and top margins, in px; from its container's right and bottom edges, its `right` and `bottom` and those margins. */
export type PlacedOnPage = { x: number; y: number; margins: Margins };

/** Where the page places an absolute layer, from its container's start edges (left, top) or `from` its end edges (right, bottom). */
function placedOn(el: Element, from: Edge = "start"): PlacedOnPage {
  const style = getComputedStyle(el);
  const px = (value: string) => Math.round((parseFloat(value) || 0) * 100) / 100;
  const [x, y] = [SIDES.x[from], SIDES.y[from]];
  return { x: px(style.getPropertyValue(x)), y: px(style.getPropertyValue(y)), margins: { x: px(style.getPropertyValue(`margin-${x}`)), y: px(style.getPropertyValue(`margin-${y}`)) } };
}

/**
 * Whether the page draws a layer placed at `placed` where the canvas draws
 * one at `to`'s X and Y (either, or both): past them by the canvas's
 * margins, its `left` and `top` and its own margins adding up to as much
 * (`marginsFor`). With no margins to go by, at X and Y themselves.
 */
function drawnThere(placed: PlacedOnPage, to: { x?: number; y?: number }, canvas: CanvasMargins | null): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
  return (["x", "y"] as const).every((side) => {
    const value = to[side];
    if (value === undefined) return true;
    const drawn = !!canvas && near(placed[side] + placed.margins[side], value + canvas.margins[side]);
    return drawn || ((!canvas || !canvas.known) && near(placed[side], value));
  });
}

/** Values are plain data in design language. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
