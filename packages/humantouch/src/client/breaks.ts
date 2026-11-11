/**
 * Breaks of the layout (ADR 0016, ticket 147): at any width, a change's
 * layer is not to make the page wider than the screen, be wider than its
 * container, or be cut off by something around it that hides what overflows
 * it, where it did not as the round was claimed. Looked at on the layer's
 * elements and their containers alone, not the whole page.
 */
import type { BreakFound, BreakKind, BreaksNote } from "../widths-protocol";

/** Of a layer's elements (a loop's instances), how many are looked at for breaks: instances are laid out alike, most often. */
const LOOKED_AT_MOST = 8;

/** Half a px either way is drawn where it is. */
const NEAR = 0.5;

/** A break an element makes, as noted (`BreaksNote.seen`) and found: with how wide it is drawn and its container's content, of one wider. */
interface Seen {
  key: string;
  found: Omit<BreakFound, "width">;
}

/**
 * What breaks of the layout `els`, a layer's elements on the page `doc` at
 * one width, make there now: whether the page scrolls sideways, and the
 * breaks of each of them and its container, by key (`BreaksNote.seen`),
 * the page wider than the screen with them among those that make it so.
 */
function seenOn(doc: Document, els: Element[]): { scrolls: boolean; seen: Seen[] } {
  const root = doc.documentElement;
  const view = doc.defaultView;
  const scrollX = view?.scrollX ?? 0;
  const screen = root.clientWidth;
  const scrolls = !hidesX(root) && !(doc.body && hidesX(doc.body)) && root.scrollWidth > screen;
  const seen: Seen[] = [];
  els.slice(0, LOOKED_AT_MOST).forEach((el, i) => {
    const container = holderOf(el);
    for (const [of, one] of [["layer", el], ["container", container]] as const) {
      if (!one || one === root || one === doc.body || !drawn(one)) continue;
      const box = one.getBoundingClientRect();
      const add = (kind: BreakKind, more: Partial<BreakFound> = {}) => seen.push({ key: `${i}:${of}:${kind}`, found: { kind, of, ...more } });
      if (scrolls && (box.right + scrollX > screen + NEAR || box.left + scrollX < -NEAR)) add("page");
      const wider = widerThanContainer(one);
      if (wider) add("wider", wider);
      if (clipped(one, box)) add("clipped");
    }
  });
  return { scrolls, seen };
}

/** What `els`, a layer's elements on the page `doc` at `width`, make of breaks of the layout there now, to go by later (ticket 147). */
export function noteBreaks(doc: Document, els: Element[], width: number): BreaksNote {
  const { scrolls, seen } = seenOn(doc, els);
  return { width, scrolls, seen: seen.map((one) => one.key) };
}

/**
 * The breaks of the layout `els` make on the page `doc` now, at `noted`'s
 * width, that they did not as noted: the page wider than the screen only
 * where it did not scroll sideways then.
 */
export function newBreaks(doc: Document, els: Element[], noted: BreaksNote): BreakFound[] {
  const { seen } = seenOn(doc, els);
  const was = new Set(noted.seen);
  const found = seen.filter((one) => !was.has(one.key) && !(one.found.kind === "page" && noted.scrolls));
  // The page wider than the screen: said once, of the layer if it is among those that make it so.
  const page = found.filter((one) => one.found.kind === "page");
  const rest = found.filter((one) => one.found.kind !== "page");
  const once = page.find((one) => one.found.of === "layer") ?? page[0];
  const unique = new Map<string, Omit<BreakFound, "width">>();
  for (const one of [...(once ? [once] : []), ...rest]) {
    const key = `${one.found.of}:${one.found.kind}`;
    if (!unique.has(key)) unique.set(key, one.found);
  }
  return [...unique.values()].map((one) => ({ width: noted.width, ...one }));
}

/** Whether an element is drawn at all: a box with some room, not `display: none`, nor one of no box of its own. */
function drawn(el: Element): boolean {
  const box = el.getBoundingClientRect();
  return el.getClientRects().length > 0 && (box.width > 0 || box.height > 0);
}

/** Whether `el` hides what overflows it across: `overflow-x` hidden or clipped. */
function hidesX(el: Element): boolean {
  return /^(hidden|clip)$/.test(getComputedStyle(el).overflowX);
}

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
 * Whether something around `el` that hides what overflows it cuts it off: an
 * element it is drawn in with `overflow` hidden or clipped, across or down,
 * past whose padding box `el` reaches. Placed absolute, only the box it is
 * placed in and those around that hide it; placed fixed, none. The page itself, its `<html>` and
 * `<body>`, hides what is past the screen across alone: down, it is the page.
 */
function clipped(el: Element, box: DOMRect): boolean {
  const position = getComputedStyle(el).position;
  if (position === "fixed") return false;
  const doc = el.ownerDocument;
  let around: Element | null = position === "absolute" ? ((el as HTMLElement).offsetParent ?? null) : el.parentElement;
  while (around) {
    const style = getComputedStyle(around);
    const [x, y] = [/^(hidden|clip)$/.test(style.overflowX), /^(hidden|clip)$/.test(style.overflowY)];
    if (around === doc.documentElement || around === doc.body) {
      const screen = doc.documentElement.clientWidth;
      if (x && (box.right > screen + NEAR || box.left < -NEAR)) return true;
    } else if (x || y) {
      const edges = around.getBoundingClientRect();
      const [left, right] = [edges.left + (parseFloat(style.borderLeftWidth) || 0), edges.right - (parseFloat(style.borderRightWidth) || 0)];
      const [top, bottom] = [edges.top + (parseFloat(style.borderTopWidth) || 0), edges.bottom - (parseFloat(style.borderBottomWidth) || 0)];
      if (x && (box.left < left - NEAR || box.right > right + NEAR)) return true;
      if (y && (box.top < top - NEAR || box.bottom > bottom + NEAR)) return true;
    }
    // From the box it is placed in up: each holds that box, and hides what it does.
    around = around.parentElement;
  }
  return false;
}
