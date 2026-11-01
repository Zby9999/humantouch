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
import { changeKey, isReorder, type Change, type Margins, type Place } from "./changeset";
import { openingTag } from "./layer-target";
import { checkable, PLACING } from "./checkable";
import { absolute, readValue, sourcesFor, type Property, type Stroke } from "./property-table";
import { signOf, usageKey } from "./layers";
import { componentElementsOf, elementsOf, usageKeyOf } from "./page-elements";
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

/** Why a change cannot be checked, when it cannot (`checkable`): the page must be able to find the layer, and tell what the change does there. */
export function uncheckable(change: Change): string | null {
  if (checkable(change)) return null;
  if (change.kind === "brief") return BRIEF_UNCHECKED;
  if (change.target.made) return "the layer is new this round, so the page has no marker to find it by";
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
 * breakpoint of its own. A reorder is the same at every width.
 */
export function widthsOf(change: Change, round: Change[], pageWidth: number, viewWidths: number[]): { own: boolean; others: number[] } {
  const { breakpoint } = change;
  if (breakpoint) {
    // Each part of the range the project's breakpoints cut it into (ticket 65): the page itself in the part its window is in.
    const parts = change.parts?.map((part) => part.breakpoint) ?? [breakpoint];
    return { own: parts.some((part) => within(part, pageWidth)), others: parts.filter((part) => !within(part, pageWidth)).map(widthIn) };
  }
  if (change.kind === "move" && !(change.after as Place).absolute) return { own: true, others: [] };
  const { loc, chain } = change.target;
  const sameLayer = (other: Change) => other.target.loc === loc && usageKey(loc!, other.target.chain) === usageKey(loc!, chain);
  const ownRanges = loc ? round.filter((other) => other.breakpoint && other.property === change.property && sameLayer(other)).map((other) => other.breakpoint!) : [];
  const covered = (width: number) => ownRanges.some((range) => within(range, width));
  return { own: !covered(pageWidth), others: [...new Set(viewWidths)].filter((width) => width !== pageWidth && !covered(width)) };
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
  const reason = uncheckable(change);
  if (reason) return { outcome: "unchecked", reason };
  const page = itself(doc);
  const { own, others } = widthsOf(change, round, page.width, viewWidths);
  const apart = ownValues(change, round);
  let checked = false;
  if (own) {
    const result = lookAt(doc, change, apart, page, sources);
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
    const result = lookAt(doc, change, apart, copy, sources);
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
  if (uncheckable(change)) return null;
  const page = itself(doc);
  return widthsOf(change, round, page.width, viewWidths).own ? lookAt(doc, change, ownValues(change, round), page) : null;
}

/** Whether the page shows the change as wide as its window; for tests, and a change the window is wide enough for. */
export function checkChange(doc: Document, change: Change, round: Change[] = []): CheckResult {
  const reason = uncheckable(change);
  return reason ? { outcome: "unchecked", reason } : lookAt(doc, change, ownValues(change, round), itself(doc));
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
function lookAt(doc: Document, change: Change, apart: string[], at: PageWidth, sources = false): CheckResult {
  // A change at a breakpoint is looked at at a width in its range: which one does not matter, but for a range in parts (ticket 65).
  const width = at.own || (change.breakpoint && !change.parts) ? undefined : at.width;
  const result = look(doc, change, apart, at, sources);
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

function look(doc: Document, change: Change, apart: string[], at: PageWidth, sources: boolean): CheckResult {
  if (change.kind === "delete") return lookDeleted(doc, change, at);
  if (change.kind === "move") return (change.after as Place).absolute ? lookPlaced(doc, change, at) : lookOrder(doc, change);
  const property = change.property as Property;
  const els = styledBy(doc, change, apart, at);
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
  if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
  const { x, y } = (change.after as Place).absolute!;
  const margins = marginsFor(change, at);
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
 * An `x`, `y` or `absolute` style change: shown where every instance is
 * absolute and drawn where the canvas draws it (`drawnThere`). `actual`:
 * along one axis, its `left` or `top` and its margin there; both, as a
 * placement is. Not shown: with the first that is not.
 */
function lookPosition(els: Element[], property: Property, after: number | { x: number; y: number }, margins: CanvasMargins): [CheckResult, Element | null] {
  for (const el of els) {
    if (!absolute(el)) return [{ outcome: "not shown", actual: property === "absolute" ? null : readValue(el, property) }, el];
    const placed = placedOn(el);
    if (typeof after !== "number") {
      if (!drawnThere(placed, after, margins)) return [{ outcome: "not shown", actual: placed }, el];
      continue;
    }
    const axis = property as "x" | "y";
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

/** Where the page places an absolute layer: its `left` and `top`, and its left and top margins, in px. */
export type PlacedOnPage = { x: number; y: number; margins: Margins };

function placedOn(el: Element): PlacedOnPage {
  const style = getComputedStyle(el);
  const px = (value: string) => Math.round((parseFloat(value) || 0) * 100) / 100;
  return { x: px(style.left), y: px(style.top), margins: { x: px(style.marginLeft), y: px(style.marginTop) } };
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
