/**
 * Breaks of the layout (ADR 0016, ticket 147): at any width, a change's
 * layer is not to make the page wider than the screen, be wider than its
 * container, or be cut off, by something around it that hides what overflows
 * it or by the screen's start edge, where it did not when the round was
 * claimed. Looked at on the layer's elements and their containers alone, not
 * the whole page.
 */
import type { BreakFound, BreakKind, BreaksNote } from "../widths-protocol";

/** Of a layer's elements (a loop's instances), how many are looked at for breaks: instances are laid out alike, most often. */
const LOOKED_AT_MOST = 8;

/** Half a px either way is drawn where it is. */
const NEAR = 0.5;

/** How much further than noted a break of the same kind reaches before it counts as new: a few px, as text and rounding move. */
export const GREW_PX = 4;

/** A break an element makes, as noted (`BreaksNote.seen`) and found: with how far it reaches past where it is to stay (`over`), px. */
interface Seen {
  key: string;
  over: number;
  found: Omit<BreakFound, "width">;
}

/**
 * What breaks of the layout `els`, a layer's elements on the page `doc` at
 * one width, make there now: whether the page scrolls sideways, and how far
 * past the screen it reaches; the breaks of each of them and its container,
 * by key (`BreaksNote.seen`), the page wider than the screen with them among
 * those that make it so.
 */
function seenOn(doc: Document, els: Element[]): { scrolls: boolean; page: number; seen: Seen[] } {
  const root = doc.documentElement;
  const view = doc.defaultView;
  const scrollX = view?.scrollX ?? 0;
  const screen = root.clientWidth;
  const scrolls = !hidesX(root) && !(doc.body && hidesX(doc.body)) && root.scrollWidth > screen;
  // Right to left, the page starts at the screen's right edge, and scrolls toward its left.
  const rtl = getComputedStyle(root).direction === "rtl";
  const seen: Seen[] = [];
  els.slice(0, LOOKED_AT_MOST).forEach((el, i) => {
    const container = holderOf(el);
    for (const [of, one] of [["layer", el], ["container", container]] as const) {
      if (!one || one === root || one === doc.body || !drawn(one)) continue;
      const box = one.getBoundingClientRect();
      const add = (kind: BreakKind, over: number, more: Partial<BreakFound> = {}) =>
        seen.push({ key: `${i}:${of}:${kind}${more.by ? `:${more.by}` : ""}`, over: Math.round(over), found: { kind, of, ...more } });
      const [left, right] = [box.left + scrollX, box.right + scrollX];
      // Past the end edge: the page scrolls to it. Past the start edge: it cannot, and the screen cuts it off.
      const [end, start] = rtl ? [-left, right - screen] : [right - screen, -left];
      if (scrolls && end > NEAR) add("page", end);
      if (start > NEAR) add("clipped", start, { by: "screen" });
      const wider = widerThanContainer(one);
      if (wider) add("wider", wider.size - wider.room, wider);
      const cut = clipped(one, box, rtl);
      if (cut > NEAR) add("clipped", cut);
    }
  });
  return { scrolls, page: Math.max(0, root.scrollWidth - screen), seen };
}

/** What `els`, a layer's elements on the page `doc` at `width`, make of breaks of the layout there now, to go by later (ticket 147); `late`, noted after the code changed. */
export function noteBreaks(doc: Document, els: Element[], width: number, late = false): BreaksNote {
  const { scrolls, page, seen } = seenOn(doc, els);
  return { width, scrolls, seen: seen.map((one) => one.key), over: { page, ...Object.fromEntries(seen.map((one) => [one.key, one.over])) }, ...(late && { late: true as const }) };
}

/**
 * The breaks of the layout `els` make on the page `doc` now, at `noted`'s
 * width, that they did not as noted: one of a kind noted that reaches
 * `GREW_PX` further than then counts as new too; the page wider than the
 * screen, where it scrolled sideways then, only where it reaches further
 * now. Noted late (`BreaksNote.late`), every break found, as the page cannot
 * tell which are new.
 */
export function newBreaks(doc: Document, els: Element[], noted: BreaksNote): BreakFound[] {
  const { page: pageNow, seen } = seenOn(doc, els);
  const was = new Set(noted.seen);
  const grew = (key: string, over: number) => over - (noted.over?.[key] ?? Infinity) > GREW_PX;
  const isNew = (one: Seen) => !was.has(one.key) || grew(one.key, one.over);
  const found = noted.late
    ? seen
    : seen.filter((one) => (one.found.kind === "page" && noted.scrolls ? grew("page", pageNow) && isNew(one) : isNew(one)));
  // The page wider than the screen: said once, of the layer if it is among those that make it so.
  const page = found.filter((one) => one.found.kind === "page");
  const rest = found.filter((one) => one.found.kind !== "page");
  const once = page.find((one) => one.found.of === "layer") ?? page[0];
  const unique = new Map<string, Omit<BreakFound, "width">>();
  for (const one of [...(once ? [once] : []), ...rest]) {
    const key = `${one.found.of}:${one.found.kind}:${one.found.by ?? ""}`;
    if (!unique.has(key)) unique.set(key, one.found);
  }
  return [...unique.values()].map((one) => ({ width: noted.width, ...one, ...(noted.late && { late: true as const }) }));
}

/** Whether an element is drawn at all: a box with some room, not `display: none`, nor one of no box of its own. */
function drawn(el: Element): boolean {
  const box = el.getBoundingClientRect();
  return el.getClientRects().length > 0 && (box.width > 0 || box.height > 0);
}

/** Whether `el` hides what overflows it across: `overflow-x` hidden or clipped. */
function hidesX(el: Element): boolean {
  return HIDES.test(getComputedStyle(el).overflowX);
}

/** An `overflow` that hides what overflows: hidden, or clipped. */
const HIDES = /^(hidden|clip)$/;

/** Placed out of its container's layout, by the window (fixed) or by a positioned box (absolute). */
const placedFreely = (el: Element) => /^(absolute|fixed)$/.test(getComputedStyle(el).position);

/** The element `el` is laid out in: its parent, past any not drawn (`display: contents`). */
function holderOf(el: Element): Element | null {
  let parent = el.parentElement;
  while (parent && getComputedStyle(parent).display === "contents") parent = parent.parentElement;
  return parent;
}

/**
 * How much wider `el` is drawn than its container's content, when it is:
 * how wide it is, and the room its container has for it, px. Not of one
 * placed freely, which its container does not lay out, nor of one in a
 * container drawn inline, whose content is its lines.
 */
function widerThanContainer(el: Element): { size: number; room: number } | null {
  const container = holderOf(el);
  if (!container || placedFreely(el)) return null;
  const style = getComputedStyle(container);
  if (style.display === "inline") return null;
  const room = container.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  const size = el.getBoundingClientRect().width;
  // The container's width is read in whole px.
  return size > room + 1 ? { size: Math.round(size), room: Math.round(room) } : null;
}

/**
 * How far something around `el` that hides what overflows it cuts it off,
 * px; 0 when nothing does: an element with `overflow` hidden or clipped,
 * across or down, past whose padding box `el` reaches. Only those its
 * containing blocks are drawn in clip it: placed absolute, an element
 * between it and the positioned box it is placed in does not, nor, for that
 * box, one between it and the box it is placed in, and so on up; placed
 * fixed, none. The page itself, its `<html>` and `<body>`, hides what is
 * past the screen's end edge across alone (past its start edge, the screen
 * cuts it off anyway): down, it is the page.
 */
function clipped(el: Element, box: DOMRect, rtl: boolean): number {
  const doc = el.ownerDocument;
  let cut = 0;
  let placed: Element = el;
  // The next element whose overflow clips `el`: the one `placed`, the box last looked at, is laid out in.
  let around: Element | null = containerOf(placed);
  while (around) {
    const style = getComputedStyle(around);
    const [x, y] = [HIDES.test(style.overflowX), HIDES.test(style.overflowY)];
    if (around === doc.documentElement || around === doc.body) {
      const screen = doc.documentElement.clientWidth;
      if (x) cut = Math.max(cut, rtl ? -box.left : box.right - screen);
    } else if (x || y) {
      const edges = around.getBoundingClientRect();
      const [left, right] = [edges.left + (parseFloat(style.borderLeftWidth) || 0), edges.right - (parseFloat(style.borderRightWidth) || 0)];
      const [top, bottom] = [edges.top + (parseFloat(style.borderTopWidth) || 0), edges.bottom - (parseFloat(style.borderBottomWidth) || 0)];
      if (x) cut = Math.max(cut, left - box.left, box.right - right);
      if (y) cut = Math.max(cut, top - box.top, box.bottom - bottom);
    }
    placed = around;
    around = containerOf(placed);
  }
  return cut;
}

/** The element whose overflow `el`'s place goes by: placed absolute, the positioned box it is placed in; placed fixed, none (the window's); else its parent. */
function containerOf(el: Element): Element | null {
  const position = getComputedStyle(el).position;
  if (position === "fixed") return null;
  if (position === "absolute") return (el as HTMLElement).offsetParent ?? null;
  return el.parentElement;
}
