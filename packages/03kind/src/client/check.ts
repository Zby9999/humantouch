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
import { breakpointKey, breakpointName, mediaOf, widthIn, type Breakpoint } from "./breakpoints";
import { BRIEF_UNCHECKED, type CheckResult } from "../service-protocol";
import { changeKey, isGridSettings, isReorder, makesGrid, placedAt, type Change, type Composed, type Created, type Margins, type Place } from "./changeset";
import { canvasOf, type RoundOnCanvas } from "./moves";
import { openingTag } from "./layer-target";
import { autoMarginTakesRoom, edgeGoneBy, middleShareOf, offsetPlacing, placedFrom, roomAlong, shareOf, sideShareOf, sizeAlong } from "./placed-from";
import { checkable, foundByMarker, isEndOffset, textMovedInPlace, madeLayer, pxIn, makerOf, PLACED_BY, placeOfMade, PLACING, movedBy, SIDES, centeringSides, whereMade, type Edge, type InLayout, type Position, type Share, type Unfound } from "./checkable";
import { absolute, ARRANGED, readValue, round as rounded, sourcesFor, type Arrangement, type Property, type Stroke } from "./property-table";
import { NOT_DRAWN, originOf, SIGN_WORDS, signOf, usageKey } from "./layers";
import { componentElementsOf, elementsOf, mayBeOf, savedCanvas as savedCanvasOf, usageKeyOf, type SavedCanvas } from "./page-elements";
import { MADE_ATTR } from "./canvas-style";
import { LOC_ATTR } from "../markers";
import type { Axis } from "./snap";
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
  if (change.kind === "create" || change.target.made) {
    const where = whereMade(change.kind === "create" ? change.layer : change.target.made!, round);
    // New words of a layer made this round are those of the change that makes it, which the page checks them with (ticket 90).
    if (change.kind === "text" && "maker" in where) return `the layer is new this round: the page checks its words with the change that makes it (change ${where.maker.id})`;
    if (change.kind !== "create" && !("layer" in where) && change.kind !== "style" && change.kind !== "text") return "of the changes to a layer made this round, the page checks only the layer itself and its styles";
    if (!("maker" in where)) return "layer" in where ? MADE_UNFOUND[where.layer] : CONTAINER_UNFOUND[where.container];
  }
  if (change.target.run !== undefined) return "the text has no element of its own on the page";
  if (!change.target.loc) return "the layer has no source marker, so the page cannot find it";
  if (change.kind === "style") return "the layer's container cannot be found on the page";
  // Found by its marker, one of a loop's instances alone: its new words (ticket 90), or it deleted, copied or moved (ticket 95).
  if (change.data) return change.kind === "text" ? "the words come from the data the loop goes through, and the page cannot tell the loop's instances apart" : LOOP_DATA;
  // A Grid made of layers (ticket 110), its container found by its marker, one of its layers not.
  if (makesGrid(change)) return "the page cannot find every layer the Grid is made of by its source marker";
  // Text with no element of its own, moved in its container: the page cannot find it, as it cannot a run of text (ticket 95).
  if (textMovedInPlace(change)) return "the text has no element of its own on the page";
  // A placement absolute in the same container, or a reorder there the page can tell the order of: what the page checks, but in a container it cannot find (ticket 95).
  const unfound = change.kind === "move" && containerUnfound(change, round);
  if (unfound) return unfound;
  if (isReorder(change) && !change.order) return "text runs on among the layers of its container, so the page cannot tell their order";
  return "of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page";
}

/** Why the page cannot check one of a loop's instances alone deleted, copied or moved (ticket 95): in the code, the data the loop goes through changes. */
const LOOP_DATA = "the change is to the data the loop goes through, and the page cannot tell the loop's instances apart";

/**
 * Of a move the page would check were its container found (`checkable`): a
 * placement absolute in the same container, or a reorder there among layers
 * with no text running on (`Change.order`), why it does not (ticket 95): a
 * container with no source marker, one made in a round before, or this round
 * otherwise than as a Frame, or as a Frame in a container the page cannot
 * find; a Frame made this round, which the page checks no move in. Null for
 * any other move, and for a container it finds by its marker.
 */
function containerUnfound(change: Change, round: Change[]): string | null {
  const [before, after] = [change.before, change.after] as Place[];
  const { target } = after.container;
  if (before.container.layer !== after.container.layer) return null;
  if (!after.absolute && (before.absolute || !change.order)) return null;
  if (!target.made) return target.loc ? null : CONTAINER_UNFOUND.unmarked;
  const where = whereMade(target.made, round);
  if ("layer" in where) return CONTAINER_UNFOUND[where.layer];
  // A new Frame in a container the page cannot find, as deep as layers made this round go: the page cannot find the Frame either.
  if ("container" in where) return "its container is new this round, in a container the page cannot find";
  return "its container is new this round, and the page checks no move in it";
}

/**
 * Why the page cannot find a layer made this round (`whereMade`): made in a
 * round before, its source not marked on the canvas (ticket 76: it is not
 * looked for); made as a copy, a layer put back or a new Stack.
 */
const MADE_UNFOUND: Record<Exclude<Unfound, "unmarked">, string> = {
  before: "the layer was made in a round before, and the page cannot find it: the canvas has no source marker for it",
  otherwise: "the layer is new this round, so the page has no marker to find it by",
};

/** Why the page cannot find a container a layer is made in, as deep as layers made this round go (`whereMade`). */
const CONTAINER_UNFOUND: Record<Unfound, string> = {
  unmarked: "its container has no source marker, so the page cannot find it",
  before: "its container was made in a round before, and the page cannot find it",
  otherwise: "its container is new this round (a copy, a layer put back or a new Stack), so the page has no marker to find it by",
};

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
 * breakpoint of its own, and, for an X or Y, a `right` or `bottom`, those where
 * the canvas places the layer otherwise (`Change.placedOtherwiseAt`, tickets
 * 75, 83): the window's width either. A reorder is the same at every width.
 */
export function widthsOf(change: Change, round: Change[], pageWidth: number, viewWidths: number[]): { own: boolean; others: number[] } {
  const { breakpoint } = change;
  if (breakpoint) {
    // Each part of the range the project's breakpoints cut it into (ticket 65): the page itself in the part its window is in.
    const parts = change.parts?.map((part) => part.breakpoint) ?? [breakpoint];
    return { own: parts.some((part) => within(part, pageWidth)), others: parts.filter((part) => !within(part, pageWidth)).map(widthIn) };
  }
  // A layer's words, as its order among its container's layers, are the same at every width.
  if (change.kind === "text" || (change.kind === "move" && !(change.after as Place).absolute)) return { own: true, others: [] };
  // A new layer in its container's layout is there or not at every width alike; placed absolute, it is placed at each.
  if (change.kind === "create" && !placeOfMade(change, round).absolute) return { own: true, others: [] };
  const { loc, chain, made: madeAs } = change.target;
  const sameLayer = (other: Change) => (madeAs ? other.layer === change.layer : other.target.loc === loc && usageKey(loc!, other.target.chain) === usageKey(loc!, chain));
  // A Stack made a Grid at a breakpoint, or its columns changed there once made one at every width (ticket 109), lays out its own too.
  // Its direction or gaps changed there before, made a Grid at every width after: the page checks the Grid there, but for what that change sets (`arrangedOver`).
  const laysOutOwn = (other: Change) => other.property === change.property || (arrangedTogether(change.property, other.property) && (change.property !== "arrangement" || other.id > change.id));
  const ownRanges = loc || madeAs ? round.filter((other) => other.breakpoint && laysOutOwn(other) && sameLayer(other)).map((other) => other.breakpoint!) : [];
  const placesNothing = change.placedOtherwiseAt ?? [];
  const covered = (width: number) => [...ownRanges, ...placesNothing].some((range) => within(range, width));
  return { own: !covered(pageWidth), others: [...new Set(viewWidths)].filter((width) => width !== pageWidth && !covered(width)) };
}

/**
 * Of a change at a breakpoint, the widths outside its range where the page
 * looks at the layer to show the change's property as it did when the round
 * was claimed (ticket 104): the window's and each view's, but those where the
 * round changes the property of the layer otherwise (in the desktop view, or
 * at a breakpoint of its own there): there it is looked at by that change. A
 * style change to a layer the page finds by its source marker, not one that
 * places it (its X, Y, right, bottom or whether absolute, which the layout
 * around it moves).
 */
export function outsideOf(change: Change, round: Change[], pageWidth: number, viewWidths: number[]): number[] {
  const { breakpoint } = change;
  if (!breakpoint || change.kind !== "style" || !foundByMarker(change.target) || PLACING.includes(change.property as Property)) return [];
  const { loc, chain } = change.target;
  const ownKey = usageKey(loc!, chain);
  const otherwise = round.filter(
    (other) => other.id !== change.id && other.kind === "style" && other.target.loc === loc && (other.scope === "component" || usageKey(loc!, other.target.chain) === ownKey) && changesTheSame(change, other),
  );
  return [...new Set([pageWidth, ...viewWidths])].filter((width) => !within(breakpoint, width) && !otherwise.some((other) => !other.breakpoint || within(other.breakpoint, width)));
}

/** Whether `other`, a style change, changes what the style change `change` does: its property, one its arrangement lays out anew (ticket 109), or a CSS property its reference style names. */
export function changesTheSame(change: Change, other: Change): boolean {
  return other.property === change.property || arrangedTogether(change.property, other.property) || Object.keys(other.style).some((css) => css in change.style);
}

/** Whether a change to one of the two properties lays out what the other does: a Stack's or a Grid's arrangement, and its direction, gap, alignment, wrap, columns or gaps (ticket 109). */
function arrangedTogether(one: string, other: string): boolean {
  return (one === "arrangement" && ARRANGED.has(other)) || (other === "arrangement" && ARRANGED.has(one));
}

/** Which fields of an arrangement of `type` a change to `property`, one of `ARRANGED`, sets the page's value of: the page shows what that change sets there. */
const ARRANGED_FIELDS: Record<Arrangement["type"], Record<string, string[]>> = {
  grid: { columns: ["columns"], rowGap: ["rowGap"], columnGap: ["columnGap"], gap: ["rowGap", "columnGap"] },
  stack: { direction: ["direction", "gap", "crossGap"], wrap: ["wrap", "crossGap"], gap: ["gap", "crossGap"], rowGap: ["gap", "crossGap"], columnGap: ["gap", "crossGap"] },
};

/**
 * Of an arrangement change, the fields of it other changes of the round to
 * the layer set the page's value of at `width` (ticket 109): later ones, each
 * checked itself, and, made a Grid or a Stack at every width, earlier ones at
 * a breakpoint that holds there, whose CSS the page keeps (a phone view's gap
 * stays the Grid's gap there). The page checks the rest.
 */
function arrangedOver(change: Change, round: Change[], width: number): Set<string> {
  const type = (change.after as Arrangement).type;
  const over = round.filter(
    (other) =>
      other.kind === "style" &&
      ARRANGED.has(other.property) &&
      other.layer === change.layer &&
      (!other.breakpoint || within(other.breakpoint, width)) &&
      (other.id > change.id || (!!other.breakpoint && !change.breakpoint)),
  );
  return new Set(over.flatMap((other) => ARRANGED_FIELDS[type][other.property] ?? []));
}

/** `lookStyle` for an arrangement, but the fields of it `over` names, which other changes set: those it takes as the page has them. */
function lookArranged(els: Element[], after: Arrangement, over: Set<string>): [CheckResult, Element | null] {
  const shows = (el: Element) => {
    const actual = readValue(el, "arrangement") as Arrangement;
    if (actual.type !== after.type) return false;
    const fields = new Set([...Object.keys(after), ...Object.keys(actual)].filter((field) => !over.has(field)));
    return [...fields].every((field) => sameValue((actual as Record<string, unknown>)[field], (after as Record<string, unknown>)[field]));
  };
  const wrong = els.find((el) => !shows(el));
  return wrong === undefined ? [{ outcome: "shown" }, null] : [{ outcome: "not shown", actual: readValue(wrong, "arrangement") }, wrong];
}

/**
 * Of a change to a Stack's direction, gap or wrap, or a Grid's columns or
 * gaps, a later change of the round that makes the layer a Grid or a Stack
 * (its arrangement, ticket 109) at all its widths: it lays it out anew, so
 * what it showed of the property is that change's to check. Of a Stack's
 * alignment, one that makes it a Grid, which reads none. Null for any other.
 */
function arrangedAnewBy(change: Change, round: Change[]): Change | null {
  if (change.kind !== "style" || !(ARRANGED.has(change.property) || change.property === "align")) return null;
  const covers = (other: Change) => !other.breakpoint || (!!change.breakpoint && breakpointKey(other.breakpoint) === breakpointKey(change.breakpoint));
  const anew = round.find((other) => other.kind === "style" && other.property === "arrangement" && other.layer === change.layer && other.id > change.id && covers(other));
  return anew && (change.property !== "align" || (anew.after as Arrangement).type === "grid") ? anew : null;
}

/** Why the page does not check a change (`uncheckable`), or, laid out anew by a later one (`arrangedAnewBy`), checks that one instead. */
function notChecked(change: Change, round: Change[]): string | null {
  const reason = uncheckable(change, round);
  if (reason) return reason;
  const anew = arrangedAnewBy(change, round);
  return anew && `change ${anew.id} lays the layer out anew, as ${(anew.after as Arrangement).type === "grid" ? "a Grid" : "a Stack"}: the page checks how it is laid out by that change`;
}

/**
 * What the layer of a style change shows of its property, each of its
 * elements, on the page `doc` as `at` shows it: of a change to a component,
 * in every usage but those the round (`round`) changes the property of
 * themselves. Undefined when the layer is not there.
 */
export function valuesAt(doc: Document, change: Change, round: RoundOnCanvas, at: PageWidth): unknown[] | undefined {
  const { loc } = change.target;
  const apart = change.scope === "component" ? round.filter((other) => other.scope === "usage" && other.kind === "style" && other.target.loc === loc && changesTheSame(change, other)).map((other) => usageKey(loc!, other.target.chain)) : [];
  const els = styledBy(doc, change, apart, at, round);
  return els.length ? els.map((el) => readValue(el, change.property as Property)) : undefined;
}

/**
 * Properties whose value the layer's other properties, or the layers around
 * it, may change (ticket 104): its size (a Stack around it, its padding), and
 * its text's (inherited, or the line height by the font size).
 */
const SIZES = new Set<string>(["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"]);
const TEXT = new Set<string>(["fontFamily", "fontSize", "fontWeight", "textColor", "textAlign", "textCase", "textDecoration", "lineHeight", "letterSpacing", "textShadows"]);
/** Properties that change how a layer is painted alone, never its size. */
const PAINT = new Set<string>(["fill", "radius", "shadows", "textShadows", "opacity", "layerBlur", "backgroundBlur", "clip", "textColor", "textDecoration"]);

/** Whether a style change to `other`'s property, on the layer or one around it, may change what the layer shows of `property`: a size by anything but paint, text by text. */
function mayChange(property: string, other: string): boolean {
  return SIZES.has(property) ? !PAINT.has(other) : TEXT.has(other);
}

/**
 * Whether the round changes, at `width`, the layer of `change` otherwise
 * than by its property, or a layer around it (ticket 104), where its
 * property is one these may change, its size or its text's: a style change
 * applying there to the layer or one around it that may change it
 * (`mayChange`), or a change to the structure of one around it. What the layer shows of its property there may then change by the
 * round itself, which the page does not tell from the Agent's edit: it is
 * not looked at.
 */
export function changedAround(doc: Document, change: Change, round: RoundOnCanvas, width: number): boolean {
  if (!SIZES.has(change.property) && !TEXT.has(change.property)) return false;
  const own = elementsOf(doc, change.target, savedCanvas(round));
  const around = (target: Change["target"]) => foundByMarker(target) && elementsOf(doc, target, savedCanvas(round)).some((el) => own.some((mine) => el.contains(mine)));
  return round.some((other) => {
    if (other.id === change.id || (other.breakpoint && !within(other.breakpoint, width))) return false;
    if (other.kind === "style" && !mayChange(change.property, other.property)) return false;
    if (other.kind === "create") return around(placeOfMade(other, round).container.target);
    // A change to the structure: the layer it is to, and the containers it takes it out of or puts it in.
    const containers = other.kind === "style" ? [] : [other.before, other.after].map((place) => (place as Partial<Place> | null)?.container?.target).filter((target) => !!target);
    return [other.target, ...containers].some(around);
  });
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
function findMade(doc: Document, id: string, round: RoundOnCanvas): Found {
  const found = madeLayer(id, round);
  if (!found) return { unchecked: "the layer cannot be found on the page" };
  const { maker, place } = found;
  const created = maker.after as Created;
  const { target } = place.container;
  const outer: Found = target.made ? findMade(doc, target.made, round) : { els: elementsOf(doc, target, savedCanvas(round)) };
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
    const matches = (el: Element) => (words === undefined || wordsOn(el) === words) && counts.get(signOf(el))! > 0;
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

/** What an element on the page reads, as a reader takes it (`spaced`): its inline pieces' words with its own, a line break (`<br>`) as the space it reads as. New text is found by these, and new words are checked by them (ticket 90). */
export function wordsOn(el: Element): string {
  if (!el.querySelector("br")) return spaced(el.textContent ?? "");
  let text = "";
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text += (child as Text).data;
      else if ((child as Element).localName === "br") text += " ";
      else walk(child);
    }
  };
  walk(el);
  return spaced(text);
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
export function checkAcross(doc: Document, change: Change, round: RoundOnCanvas, viewWidths: number[], at: (width: number) => PageWidth | null, sources = false): CheckResult {
  const reason = notChecked(change, round);
  if (reason) return { outcome: "unchecked", reason };
  const page = itself(doc);
  const { own, others } = widthsOf(change, round, page.width, viewWidths);
  if (!own && !others.length && change.placedOtherwiseAt?.length) {
    // Its X or Y moves nothing where the canvas lays the layer out static (ticket 83).
    const howTheCanvasPlacesIt = isEndOffset(change.property) ? `places the layer otherwise than by its \`${change.property}\`` : "does not place the layer absolute";
    return { outcome: "unchecked", reason: `at the widths the page is looked at, the canvas ${howTheCanvasPlacesIt}` };
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
export function checkHere(doc: Document, change: Change, round: RoundOnCanvas, viewWidths: number[]): CheckResult | null {
  if (notChecked(change, round)) return null;
  const page = itself(doc);
  return widthsOf(change, round, page.width, viewWidths).own ? lookAt(doc, change, round, ownValues(change, round), page) : null;
}

/** Whether the page shows the change as wide as its window; for tests, and a change the window is wide enough for. `round`: the changes of its round, placed on its canvas. */
export function checkChange(doc: Document, change: Change, round: RoundOnCanvas): CheckResult {
  const reason = notChecked(change, round);
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
function lookAt(doc: Document, change: Change, round: RoundOnCanvas, apart: string[], at: PageWidth, sources = false): CheckResult {
  // A change at a breakpoint is looked at at a width in its range: which one does not matter, but for a range in parts (ticket 65).
  const width = at.own || (change.breakpoint && !change.parts) ? undefined : at.width;
  const result = look(doc, change, round, apart, at, sources);
  return result.outcome === "not shown" && width !== undefined ? { ...result, width } : result;
}

/** The elements a style change is to show on, as `at` shows them: a change to a component itself shows in every usage of it, but those `apart`. */
function styledBy(doc: Document, change: Change, apart: string[], at: PageWidth, round?: RoundOnCanvas): Element[] {
  const found = change.scope === "component" ? componentElementsOf(doc, change.target, apart, savedCanvas(round)) : elementsOf(doc, change.target, savedCanvas(round));
  return found.map((el) => at.of(el)).filter((el): el is Element => !!el);
}

/** The value of a style change's property the page, as `at` shows it, has on the layer now; undefined when the layer is not there. */
export function valueOn(doc: Document, change: Change, at: PageWidth): unknown {
  const [el] = styledBy(doc, change, ownValues(change, [change]), at);
  return el ? readValue(el, change.property as Property) : undefined;
}

function look(doc: Document, change: Change, round: RoundOnCanvas, apart: string[], at: PageWidth, sources: boolean): CheckResult {
  if (change.kind === "delete") return lookDeleted(doc, change, round, at);
  if (change.kind === "move") return (change.after as Place).absolute ? lookPlaced(doc, change, round, at) : lookOrder(doc, change, round);
  if (change.kind === "create") return lookMade(doc, change, round, at);
  if (change.kind === "stack") return lookGrid(doc, change, round, at);
  if (change.kind === "text") return lookWords(doc, change, round);
  const property = change.property as Property;
  let els: Element[];
  if (change.target.made) {
    // A layer made this round: found where its change puts it (ticket 76).
    const found = findMade(doc, change.target.made, round);
    if ("unchecked" in found) return { outcome: "unchecked", reason: found.unchecked };
    if ("missing" in found) return { outcome: "unchecked", reason: `the layer is new this round, and not at its place on the page (change ${makerOf(change.target.made, round)!.id})` };
    els = found.els.map((el) => at.of(el)).filter((el): el is Element => !!el);
  } else els = styledBy(doc, change, apart, at, round);
  if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
  if (property === "arrangement" && change.after) {
    const over = arrangedOver(change, round, at.width);
    if (over.size) {
      const [result, wrong] = lookArranged(els, change.after as Arrangement, over);
      return sources && result.outcome === "not shown" && wrong ? { ...result, sources: sourcesFor(wrong, property) } : result;
    }
  }
  const margins = marginsFor(change, at);
  const placing = change.after !== null && PLACING.includes(property);
  // Where the canvas moves it in its container's layout still, relative or sticky: by the value itself (ticket 84).
  const inLayout = placing ? change.offsetInLayoutAt?.find(({ breakpoint }) => within(breakpoint, at.width))?.position : undefined;
  // Not absolute on the page, a layer is not placed by its X, Y, right or bottom at all: no value read off it stands for one (ticket 80).
  const notAbsolute = placing && !inLayout ? els.find((el) => !absolute(el)) : undefined;
  const [result, wrong]: [CheckResult, Element | null] = inLayout
    ? lookOffset(els, property, change.after as number, inLayout)
    : notAbsolute
      ? [{ outcome: "not shown", actual: null }, notAbsolute]
      : placing && margins
        ? lookPosition(els, property, change.after as number | { x: number; y: number }, margins, {
            centered: change.centeredOn,
            ...(change.placedFrom?.margins && { byMargins: change.style }),
            uncentered: !!change.uncenteredAt?.some((range) => within(range, at.width)),
          })
        : lookStyle(els, property, change.after, at);
  // What sets the value shown instead, read on the element that shows it.
  return sources && result.outcome === "not shown" && wrong ? { ...result, sources: sourcesFor(wrong, property) } : result;
}

/**
 * How the page has a layer in its container's layout at a width where the
 * canvas moves it there by its X or Y, `right` or `bottom` (`OffsetInLayout`,
 * ticket 84): placed `canvas`, as the canvas places it; placed `position` on
 * the page; and `offset`, how far its side moves it there, in px, as the
 * side's value goes. Null where the side moves it nothing (laid out static),
 * places it (absolute, fixed), or is not in px (sticky: `auto`, a
 * percentage), as the browser computes it then (`written`).
 */
export interface OffsetInLayout {
  canvas: InLayout;
  position: Position;
  offset: number | null;
  written?: string;
}

/**
 * An X or Y, or a `right` or `bottom`, at a width where the canvas has the
 * layer in its container's layout still, moved by the value, placed relative
 * or sticky (`Change.offsetInLayoutAt`, ticket 84): shown where every one of
 * `els` is placed as the canvas places it there, and its side gives it `after`
 * itself, its margins left out, as they are where its container lays it out.
 * Relative, by how far the browser moves it, which it gives its `left` and
 * `top`: a `right` or `bottom` moves it the other way, but not with a `left`
 * or `top` declared too, which it goes by instead; right to left, it goes by
 * the `right` (`movedAlong`, ticket 89). Sticky, by its side's value. Not
 * shown: with the first that is not, and how (`OffsetInLayout`).
 */
function lookOffset(els: Element[], property: Property, after: number, canvas: InLayout): [CheckResult, Element | null] {
  const { axis, edge } = PLACED_BY[property]!;
  for (const el of els) {
    const style = getComputedStyle(el);
    const position = style.position as Position;
    // Sticky, as written: a percentage is not px, though it reads as a number.
    const written = style.getPropertyValue(SIDES[axis][edge]);
    const offset = position === "relative" ? movedBy(edge, movedAlong(el, axis)) : position === "sticky" && written.endsWith("px") ? rounded(parseFloat(written)) : null;
    if (position !== canvas || offset === null || Math.abs(offset - after) > 0.5) {
      const actual: OffsetInLayout = { canvas, position, offset, ...(position === "sticky" && offset === null && { written }) };
      return [{ outcome: "not shown", actual }, el];
    }
  }
  return [{ outcome: "shown" }, null];
}

/**
 * How far the browser moves `el`, placed relative, along `axis`, across or
 * down, in px: by the side it goes by (`edgeGoneBy`), which it gives how far
 * that moves it, its `left` or `top`, or right to left its `right`, the other
 * way (ticket 89).
 */
function movedAlong(el: Element, axis: Axis): number {
  const by = edgeGoneBy(el, axis);
  return movedBy(by, rounded(parseFloat(getComputedStyle(el).getPropertyValue(SIDES[axis][by])) || 0));
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
 * Where they have moved, the layer found by them or not, another element that
 * may be it and looks the same leaves it untold (review of ticket 99): not
 * finding the layer is not finding it gone.
 */
function lookDeleted(doc: Document, change: Change, round: RoundOnCanvas, at: PageWidth): CheckResult {
  const { target } = change;
  const canvas = savedCanvas(round);
  if (!elementsOf(doc, (change.before as Place).container.target, canvas).length) return { outcome: "unchecked", reason: "its container is not on the page now" };
  const own = usageKey(target.loc!, target.chain);
  const tag = /^<([\w-]+)/.exec(target.context.element)?.[1];
  const same = (el: Element) =>
    target.context.text ? signOf(el) === `${tag} ${target.context.text}` : el.localName === tag && (usageKeyOf(el) === own || openingTag(el) === target.context.element);
  const shown = (els: Element[]) =>
    els
      .filter(same)
      .map((el) => at.of(el))
      .filter((el) => el && getComputedStyle(el).display !== "none");
  if (shown(elementsOf(doc, target, canvas)).length) return { outcome: "not shown", actual: "there" };
  if (shown(mayBeOf(doc, target, canvas)).length) return { outcome: "unchecked", reason: "its markers have moved, and an element that looks like it is on the page: the page cannot tell whether that is the layer" };
  return { outcome: "shown" };
}

/**
 * The reordered layer is in its place among the container's other layers, as
 * the canvas has them: told apart by what they look like, as the Agent's
 * edit moves their markers. Layers other reorders move are left out, so each
 * reorder is checked on its own. `actual`: the layers on the page, in order.
 */
function lookOrder(doc: Document, change: Change, round: RoundOnCanvas): CheckResult {
  const containers = elementsOf(doc, (change.after as Place).container.target, savedCanvas(round));
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
function lookPlaced(doc: Document, change: Change, round: RoundOnCanvas, at: PageWidth): CheckResult {
  const els = elementsOf(doc, change.target, savedCanvas(round))
    .map((el) => at.of(el))
    .filter((el): el is Element => !!el);
  return placedThere(els, (change.after as Place).absolute!, marginsFor(change, at));
}

/**
 * New words (ticket 90): the layer, found by its source marker, reads the
 * words last typed, in every instance, as new text is found by its words
 * (`findMade`): as a reader takes them, white space run together, the words
 * of its bold runs, links and other pieces with its own. `actual`, not shown:
 * what the first instance that does not reads instead.
 */
function lookWords(doc: Document, change: Change, round: RoundOnCanvas): CheckResult {
  const els = elementsOf(doc, change.target, savedCanvas(round));
  if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
  const words = spaced(change.after as string);
  const wrong = els.find((el) => wordsOn(el) !== words);
  return wrong ? { outcome: "not shown", actual: wordsOn(wrong) } : { outcome: "shown" };
}

/**
 * The layer a `create` change makes (ticket 76), found where it puts it:
 * new text with its words, its container's layer the canvas has it as, or,
 * placed absolute, placed where the canvas has it (its X and Y as
 * the designer last set them). `actual`, not found: what is there instead
 * (`MadeMissing`); placed elsewhere, as for a move placed absolute.
 */
function lookMade(doc: Document, change: Change, round: RoundOnCanvas, at: PageWidth): CheckResult {
  const found = findMade(doc, change.layer, round);
  if ("unchecked" in found) return { outcome: "unchecked", reason: found.unchecked };
  if ("missing" in found) return { outcome: "not shown", actual: found.missing };
  const { absolute: placed } = placeOfMade(change, round);
  if (!placed) return { outcome: "shown" };
  const els = found.els.map((el) => at.of(el)).filter((el): el is Element => !!el);
  const latest = (axis: "x" | "y") => round.filter((other) => other.kind === "style" && other.layer === change.layer && other.property === axis && !other.breakpoint).at(-1)?.after as number | undefined;
  return placedThere(els, { x: latest("x") ?? placed.x, y: latest("y") ?? placed.y }, null);
}

/**
 * Whether the page shows a Grid made of layers (ticket 110): the layers still
 * in it by the end of the round, each found by its source marker, all in one
 * element (past any not drawn, `display: contents`), a new one in the
 * container named, or, made of a Frame, that Frame's own; laid out as a Grid
 * with the columns and gaps given, but those a later change of the round to
 * it sets, as the page has them there. Dissolved, or laid out anew, by a later
 * change, it is not looked at: what it shows is that change's.
 */
function lookGrid(doc: Document, change: Change, round: RoundOnCanvas, at: PageWidth): CheckResult {
  const composed = change.after as Composed;
  if (!isGridSettings(composed)) return { outcome: "unchecked", reason: "the page does not check a Stack made" };
  const later = round.filter((other) => other.id > change.id && (!other.breakpoint || within(other.breakpoint, at.width)));
  // Dissolved, laid out anew, moved elsewhere or deleted as a whole, later: what the page shows of it is that change's.
  const anew = later.find(
    (other) => other.layer === change.layer && (other.kind === "unstack" || other.kind === "move" || other.kind === "delete" || (other.kind === "style" && other.property === "arrangement")),
  );
  if (anew) {
    const what = { unstack: "dissolves the Grid", move: "moves the Grid", delete: "deletes the Grid" }[anew.kind as "unstack" | "move" | "delete"] ?? "lays the Grid out anew";
    return { outcome: "unchecked", reason: `change ${anew.id} ${what}: what the page shows of it is that change's` };
  }
  // Its layers taken out of it later: deleted, moved elsewhere, or made a Stack (or a Grid) of their own in it.
  const stackedAgain = later.filter((other) => other.kind === "stack").flatMap((other) => (other.after as Composed).layers.map((member) => member.layer));
  const gone = new Set([
    ...later.filter((other) => other.kind === "delete" || (other.kind === "move" && (other.after as Place).container.layer !== change.layer)).map((other) => other.layer),
    ...stackedAgain,
  ]);
  const members = composed.layers.filter((member) => !gone.has(member.layer));
  if (!members.length) return { outcome: "unchecked", reason: "none of the layers it is made of is in it by the end of the round" };
  // Layers put in it later, by a move (which may reorder them too), a new layer, a copy or one put back: the cells it has besides its own layers.
  const putIn = later.filter((other) => other.layer !== change.layer && placedAt(other)?.container.layer === change.layer);
  const reordered = putIn.some((other) => other.kind === "move" || other.kind === "stack");
  const addedCells = new Set(putIn.filter((other) => !composed.layers.some((member) => member.layer === other.layer)).map((other) => other.layer)).size;
  const found = (canvas: () => SavedCanvas | null) => {
    const shown = (target: Change["target"]) => elementsOf(doc, target, canvas).map((el) => at.of(el)).filter((el): el is Element => !!el);
    return { containers: shown(change.target), els: members.map((member) => shown(member.target)) };
  };
  // The new element the Agent writes round them moves the markers after it, of its tag too: followed as on the canvas written so, where they are not found as it is.
  let { containers, els } = found(savedCanvas(round));
  if ((!containers.length || els.some((one) => !one.length)) && composed.place) ({ containers, els } = found(writtenAround(round, change)));
  if (!containers.length) return { outcome: "unchecked", reason: "its container is not on the page now" };
  if (els.some((one) => !one.length)) return { outcome: "unchecked", reason: "a layer it is made of is not on the page now" };
  const over = new Set(later.filter((other) => other.kind === "style" && other.layer === change.layer).flatMap((other) => ARRANGED_FIELDS.grid[other.property] ?? []));
  for (const holder of new Set(els.flat().map(holderOf))) {
    // A new element right in the container's layout (past any not drawn), or the Frame made a Grid itself.
    const inPlace = !!holder && (composed.place ? !containers.includes(holder) && containers.includes(holderOf(holder)!) : containers.includes(holder));
    if (!inPlace || !els.every((found) => found.some((el) => holderOf(el) === holder))) return { outcome: "not shown", actual: null };
    // Left placed absolute, a layer is not laid out by the Grid, but placed against it: not in its cells.
    if (els.flat().some((el) => holderOf(el) === holder && /^(absolute|fixed)$/.test(getComputedStyle(el).position))) return { outcome: "not shown", actual: "absolute" };
    // Its cells: these layers alone, but those put in it later, in their order but where a later change reorders them; as many of them as there are layers, of a loop's instances too.
    const cells = laidOutIn(holder);
    const of = cells.map((cell) => els.findIndex((found) => found.includes(cell)));
    const own = of.filter((i) => i >= 0);
    const firsts = own.filter((i, n) => own.indexOf(i) === n);
    if (own.length < members.length || cells.length - own.length > addedCells || (!reordered && firsts.some((i, n) => i !== n))) return { outcome: "not shown", actual: "cells" };
    const actual = readValue(holder, "arrangement") as Arrangement;
    const fields = (["columns", "rowGap", "columnGap"] as const).filter((field) => !over.has(field));
    // Its gaps were measured off where the layers were drawn: within half a px is the gap given.
    if (actual.type !== "grid") return { outcome: "not shown", actual };
    const off = (field: (typeof fields)[number]) => (field === "columns" ? actual[field] !== composed.grid[field] : Math.abs(actual[field] - composed.grid[field]) > 0.5);
    if (fields.some(off)) return { outcome: "not shown", actual };
  }
  return { outcome: "shown" };
}

/** Each round's canvas as the Agent writes a new Grid of it (`writtenAround`), by the change that makes it. */
const written = new WeakMap<RoundOnCanvas, Map<number, SavedCanvas | null>>();

/**
 * The round's canvas as saved, the new Grid `change` makes written in the
 * source as asked (ticket 110): its element marked as one written where the
 * first of its layers was, just before it, in that layer's file. An Agent
 * writes it so, of the same tag as its layers often (a `<div>` round
 * `<div>`s): the page's markers of that tag, paired with the canvas's
 * (`elementsOf`), then pair one for one, as they could not with one more
 * on the page than on the canvas. Null with no canvas.
 */
function writtenAround(round: RoundOnCanvas, change: Change): () => SavedCanvas | null {
  let byChange = written.get(round);
  if (!byChange) written.set(round, (byChange = new Map()));
  if (!byChange.has(change.id)) {
    const saved = canvasOf(round);
    // The first of its layers in the source: the lowest line, in the file of its first.
    const locs = (change.after as Composed).layers.flatMap(({ target }) => {
      const m = /^(.*):(\d+):\d+$/.exec(target.loc ?? "");
      return m ? [{ file: m[1], line: Number(m[2]) }] : [];
    });
    const file = locs[0]?.file;
    const line = Math.min(...locs.filter((loc) => loc.file === file).map((loc) => loc.line));
    const doc = saved && file ? (new DOMParser().parseFromString(saved.doc().documentElement.outerHTML, "text/html") as Document) : null;
    const el = doc?.querySelector(`[${MADE_ATTR}="${CSS.escape(change.layer)}"]`);
    // Marked as written in the source, not as made on the canvas, which the markers followed leave out.
    if (doc && el) {
      el.setAttribute(LOC_ATTR, `${file}:${line}:0`);
      el.removeAttribute(MADE_ATTR);
    }
    byChange.set(change.id, doc && el ? savedCanvasOf(doc.documentElement.outerHTML, () => doc) : null);
  }
  const canvas = byChange.get(change.id)!;
  return () => canvas;
}

/** The elements laid out in `el`, in order: its children, those of any not drawn (`display: contents`) in their place, none not shown. */
function laidOutIn(el: Element): Element[] {
  return [...el.children].flatMap((child) => {
    const { display } = getComputedStyle(child);
    if (display === "contents") return laidOutIn(child);
    return display === "none" || NOT_DRAWN.has(child.localName) ? [] : [child];
  });
}

/** The element an element is laid out in: its parent, past any not drawn (`display: contents`). */
function holderOf(el: Element): Element | null {
  let parent = el.parentElement;
  while (parent && getComputedStyle(parent).display === "contents") parent = parent.parentElement;
  return parent;
}

/**
 * Whether every one of `els` is placed absolute in its container, drawn at
 * `to`; with no elements, it cannot be told. Along an axis it is `placed`
 * otherwise (ticket 79), by the side that places it so, at what that gives it
 * there, as large as its container is: its margins as they are; centered,
 * still so, its translate kept (`centered: false` in `actual` when not); by
 * its auto margins, its middle where the share puts it (`offMiddle`, ticket 96).
 */
function placedThere(els: Element[], { x, y, placed = {} }: NonNullable<Place["absolute"]>, margins: CanvasMargins | null): CheckResult {
  if (!els.length) return { outcome: "unchecked", reason: "the layer is not on the page now" };
  for (const el of els) {
    const style = getComputedStyle(el);
    if (!/^(absolute|fixed)$/.test(style.position)) return { outcome: "not shown", actual: null };
    // Placed from its container, or from somewhere else.
    if (style.position === "absolute" && (el as HTMLElement).offsetParent !== el.parentElement) return { outcome: "not shown", actual: "no reference" };
    const at = placedOn(el);
    // Centered, its translate gone or turned over: drawn half its size aside, whatever its side gives it.
    if ((["x", "y"] as const).some((axis) => placed[axis]?.centered && !placed[axis]!.margins && !centeredByTranslate(el, axis, placed[axis]!.edge))) return { outcome: "not shown", actual: { ...at, centered: false } };
    // Along an axis placed otherwise than from the start (ticket 79): how far its side places it, what the share and px of its container that side is to give it come to there;
    // not with an auto margin there taking up room, which draws it elsewhere (ticket 96, review). Centered by its auto margins: its middle, where its sides put it there.
    const sideOff = (["x", "y"] as const).some((axis) => {
      const how = placed[axis];
      if (!how) return false;
      if (how.margins) return !!offMiddle(el, axis, centeringSides(how));
      return autoMarginTakesRoom(el, axis, how.edge) || Math.abs(offsetPlacing(el, axis, how.edge) - pxIn(how, roomAlong(el, axis))) > 0.5;
    });
    if (sideOff || !drawnThere(at, { ...(!placed.x && { x }), ...(!placed.y && { y }) }, margins)) return { outcome: "not shown", actual: at };
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
 * Not shown: with the first that is not. `els` are all absolute (`look`).
 * `centered`: of a layer centered on where the side places it (ticket 79),
 * the share of its container the side gives it: at each width, it is where
 * that puts it there, as its container is (`at` in `actual`, with what its
 * side is written as now, `share`); and centered still, its translate kept
 * (`centered: false` in `actual` when not, line review). `byMargins`:
 * centered by its auto margins between its sides (ticket 96), the sides the
 * canvas gives it (`style`): at each width, it is drawn where those put it
 * there, whatever places it so (`offMiddle`); where the canvas has it not
 * centered so (`uncentered`, review), where its side from the start puts it
 * (`offSide`). Along that axis an auto margin taking up room at the edge the
 * side is from draws it elsewhere than the side does (review): not shown,
 * at any width, for any other.
 */
function lookPosition(
  els: Element[],
  property: Property,
  after: number | { x: number; y: number },
  margins: CanvasMargins,
  { centered, byMargins, uncentered = false }: { centered?: Change["centeredOn"]; byMargins?: Record<string, string>; uncentered?: boolean } = {},
): [CheckResult, Element | null] {
  const placedBy = PLACED_BY[property];
  for (const el of els) {
    const placed = placedOn(el, placedBy?.edge);
    if (typeof after !== "number") {
      if (!drawnThere(placed, after, margins)) return [{ outcome: "not shown", actual: placed }, el];
      continue;
    }
    const { axis, edge } = placedBy!;
    if (byMargins && centered) {
      const off = uncentered ? offSide(el, axis, byMargins) : offMiddle(el, axis, canvasSides(byMargins, axis, centered.after));
      if (off) return [{ outcome: "not shown", actual: off }, el];
      continue;
    }
    const aside = autoMarginTakesRoom(el, axis, edge);
    if (!centered) {
      if (aside || !drawnThere(placed, { [axis]: after }, margins)) return [{ outcome: "not shown", actual: { value: placed[axis], margin: placed.margins[axis] } }, el];
      continue;
    }
    // Where the canvas centers it at this width, and what its side is written as now: a share, or else px.
    const at = rounded(pxIn(centered.after, roomAlong(el, axis)));
    const off = { value: placed[axis], margin: placed.margins[axis], at, share: sideShareOf(el, axis, edge) ?? { percent: 0, px: placed[axis] } };
    // Its translate gone or turned over: drawn half its size aside, whatever its side gives it.
    if (!centeredByTranslate(el, axis, edge)) return [{ outcome: "not shown", actual: { ...off, centered: false } }, el];
    if (aside || !drawnThere(placed, { [axis]: at }, margins)) return [{ outcome: "not shown", actual: off }, el];
  }
  return [{ outcome: "shown" }, null];
}

/**
 * The sides the canvas gives a layer centered along `axis` by its auto
 * margins (ticket 96), as a change writes them (`style`): each a share of its
 * container and px past it. One not written there, as a move where a view
 * beside does not center it so leaves its side from the end (review), is
 * the one that puts its middle at `middle` with the other.
 */
function canvasSides(style: Record<string, string>, axis: Axis, middle: Share): Record<Edge, Share> {
  const written = (edge: Edge) => (style[SIDES[axis][edge]] ? shareOf(style[SIDES[axis][edge]]) : null);
  const [start, end] = [written("start"), written("end")];
  if (start && end) return { start, end };
  if (start) return { start, end: { percent: 100 + start.percent - 2 * middle.percent, px: start.px - 2 * middle.px } };
  return centeringSides(middle);
}

/** Where the page draws `el` along `axis` from its container's start edge, as an X or Y reads it: its side there and its margin, as laid out, whatever that margin is. */
function drawnFrom(el: Element, axis: Axis): number {
  return offsetPlacing(el, axis, "start") + (parseFloat(getComputedStyle(el).getPropertyValue(`margin-${SIDES[axis].start}`)) || 0);
}

/**
 * Where the page draws `el`, along `axis`, the canvas centering it there by
 * its auto margins between `sides` (ticket 96), when not where those put it
 * as large as its container is at this width, as the browser places it (CSS
 * 2.1, 10.3.7, 10.6.4): the room they and its size leave, split between its
 * margins; across, where there is none, all of it taken from the margin past
 * its end, left to right, or before its start, right to left (review), as
 * the box that places it runs (`edgeGoneBy`). As an X or Y (`value`,
 * `drawnFrom`: so a px margin written instead is where it is drawn too), and
 * where the canvas has it (`at`), both from its container's start edge.
 * Drawn there, null: so, whether its auto margins or its sides alone place it
 * there, and only so (where its middle is, `share`, read again as for a
 * translate, ticket 79), as wide as its container is (a px right at one width
 * is not at another; its margins gone, it is drawn at its side). A
 * `translate` is no part of it, as of an X or Y.
 */
function offMiddle(el: Element, axis: Axis, sides: Record<Edge, Share>): { value: number; at: number; margins: true; share: Share } | null {
  const room = roomAlong(el, axis);
  const size = sizeAlong(el, axis);
  const [start, end] = [pxIn(sides.start, room), pxIn(sides.end, room)];
  const left = room - start - end - size;
  const at = start + (left >= 0 || axis === "y" ? left / 2 : edgeGoneBy(el, axis) === "end" ? left : 0);
  const drawn = drawnFrom(el, axis);
  if (Math.abs(drawn - at) <= 0.5) return null;
  // Where its middle is now: centered by its auto margins still, the share its sides give it; else in px, as drawn (read again, as for a translate, ticket 79).
  const share = placedFrom(el, axis).margins ? middleShareOf(el, axis) : { percent: 0, px: rounded(drawn + size / 2) };
  return { value: rounded(drawn), at: rounded(at), margins: true, share };
}

/**
 * Where the page draws `el` along `axis`, at a width the canvas has it not
 * centered by its auto margins (`Change.uncenteredAt`, ticket 96, review),
 * when not where its side from the start, as the change writes it (`style`),
 * puts it there: by that side, as an X or Y is, its margin there kept or not,
 * as at a width the canvas's margins are not known (`drawnThere`). `side`:
 * so in `actual`.
 */
function offSide(el: Element, axis: Axis, style: Record<string, string>): { value: number; at: number; margins: true; side: true } | null {
  const share = shareOf(style[SIDES[axis].start] ?? "");
  if (!share) return null;
  const at = pxIn(share, roomAlong(el, axis));
  const drawn = drawnFrom(el, axis);
  if (Math.abs(drawn - at) <= 0.5 || Math.abs(offsetPlacing(el, axis, "start") - at) <= 0.5) return null;
  return { value: rounded(drawn), at: rounded(at), margins: true, side: true };
}

/**
 * Whether the page still centers `el` along `axis` on where its side from
 * `edge` places it by a translate: moved back (forward) half its size, by a
 * translate nothing turns or scales; not centered by its auto margins, which
 * is no translate (ticket 96, review).
 */
function centeredByTranslate(el: Element, axis: Axis, edge: Edge): boolean {
  const from = placedFrom(el, axis);
  return from.centered && !from.margins && from.edge === edge;
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

/**
 * Where the page places an absolute layer, from its container's start edges
 * (left, top) or `from` its end edges (right, bottom): as the browser does,
 * given both sides along an axis (`offsetPlacing`).
 */
function placedOn(el: Element, from: Edge = "start"): PlacedOnPage {
  const style = getComputedStyle(el);
  const margin = (axis: Axis) => rounded(parseFloat(style.getPropertyValue(`margin-${SIDES[axis][from]}`)) || 0);
  // Where it is placed, given both sides: by the one the browser goes by (ticket 89, review).
  return { x: rounded(offsetPlacing(el, "x", from)), y: rounded(offsetPlacing(el, "y", from)), margins: { x: margin("x"), y: margin("y") } };
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

/** The canvas of `round`, as saved, which the page tells by whether a layer's markers have moved, and where (`canvasOf`). None to go by with no round. */
const savedCanvas = (round?: RoundOnCanvas) => () => (round ? canvasOf(round) : null);

/** Values are plain data in design language. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
