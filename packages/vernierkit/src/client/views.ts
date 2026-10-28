/**
 * Views: the one canvas shown at several widths (ADR 0008). The canvas is the
 * desktop view's document: every edit is made there, and the layers are read
 * from it. Each other view is a copy of it that follows every change to it,
 * node for node, so every view shows the same canvas, laid out at its own
 * width. A layer is the canvas's; each view finds it in what it shows. Each
 * view is as tall as what it shows there, as it grows and shrinks.
 */
import { copyCanvas, drawInto, fitHeight, type Canvas } from "./freezer";
import { rangeOf, runAt, type Layer, type LayerTree } from "./layers";

export interface View {
  /** What the view shows: the canvas itself for the desktop view, a copy of it for any other. */
  readonly document: Document;
  /**
   * How tall the view is, px: as tall as what it shows, and no shorter than
   * the window the page was frozen in. It follows what the view shows before
   * the next paint; what answers to the height in the page's CSS does not
   * follow it, but stays as it was in that window.
   */
  readonly height: number;
  /** The deepest layer at a point of this view, in its px, as `LayerTree.layerAt` finds it on the canvas; not `skip`, nor any layer in it. */
  layerAt(tree: LayerTree, x: number, y: number, skip?: Layer): Layer | null;
  /** Where the layer is laid out in this view, in its px; null when the view shows none of it. */
  boxOf(layer: Layer): DOMRect | null;
  /** The element that shows a layer's element in this view, to read how it is laid out there; null when the view has none. */
  elementOf(el: Element): Element | null;
  /**
   * Types in `el`, an element of the canvas, in this view: returns the
   * view's element to type in. What is typed there is written to the canvas
   * as it is typed, so every other view shows it before the next paint; the
   * view typed in is left as it is meanwhile, its caret and any composition
   * with it. `done` hands the element back: the view follows the canvas again.
   */
  typeIn(el: Element): Typing;
}

/** Typing in a view, under way. */
export interface Typing {
  /** The element typed in, in the view. */
  readonly el: HTMLElement;
  /** Ends typing there. */
  done(): void;
}

export interface Views {
  /** The canvas, which the desktop view shows. */
  readonly canvas: Canvas;
  /** Every view, the desktop view first. */
  list(): View[];
  /** Shows the canvas in `iframe` too, `width` px wide, as one more view. Settles once it is laid out. */
  add(iframe: HTMLIFrameElement, width: number): Promise<View>;
  /** Stops showing the canvas in `view`, which no longer follows it. The desktop view, the canvas itself, stays. */
  remove(view: View): void;
  /** Shows every change made to the canvas so far in every view now, rather than before the next paint. */
  sync(): void;
  /** Calls `listener` whenever a view's height changes. Returns what stops it. */
  onResize(listener: () => void): () => void;
  /**
   * Keeps every view as tall as it is, whatever is shifted on the canvas
   * meanwhile, as a drag shifts layers: returns what lets go, and each view
   * is as tall as what it shows again before the next paint.
   */
  holdHeights(): () => void;
}

/** The canvas, shown so far in the desktop view only. */
export function createViews(canvas: Canvas): Views {
  const followers = new Map<View, Follower>();
  const listeners = new Set<() => void>();
  const fittings = new Map<View, Fitting>();
  const desktop = viewOf(canvas.document, ITSELF, () => fittings.get(desktop)?.height ?? canvas.height);
  const views: View[] = [desktop];

  /** Each view made as tall as what it shows, once a frame, when anything may have changed it. */
  let frame = 0;
  /** What holds every view as tall as it is: while any does, none is fitted. */
  const holds = new Set<object>();
  const fit = () => {
    frame = 0;
    if (holds.size) return;
    let changed = false;
    for (const fitting of fittings.values()) {
      const height = fitHeight(fitting.doc, fitting.iframe, canvas.windowHeight);
      if (height !== fitting.height) changed = true;
      fitting.height = height;
    }
    if (changed) for (const listener of listeners) listener();
  };
  const refit = () => {
    frame ||= requestAnimationFrame(fit);
  };
  /** Keeps `view`, `height` px tall now, as tall as what it shows from now on. */
  const keepFitted = (view: View, height: number) => {
    const doc = view.document;
    const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
    if (!iframe) return;
    // What the view shows can change size by itself too, as images load: watched in its own window.
    const Observer = doc.defaultView!.ResizeObserver;
    const observer = new Observer(refit);
    observer.observe(doc.documentElement);
    if (doc.body) observer.observe(doc.body);
    fittings.set(view, { doc, iframe, height, observer });
  };
  keepFitted(desktop, canvas.height);
  // Every change to the canvas is in every view before the next frame.
  new MutationObserver(refit).observe(canvas.document.documentElement, EVERYTHING);
  const sync = () => {
    for (const follower of followers.values()) follower.sync();
  };

  return {
    canvas,
    list: () => [...views],
    add(iframe, width) {
      const doc = iframe.contentDocument;
      if (!doc) return Promise.reject(new Error("Vernier Kit: the view's iframe is not in the document"));
      const laidOut = copyCanvas(canvas, iframe, width);
      // What is typed in this view is in every other view at once, as it is on the canvas.
      const follower = follow(canvas.document, doc, sync);
      const view = viewOf(doc, follower, () => fittings.get(view)?.height ?? iframe.offsetHeight);
      followers.set(view, follower);
      views.push(view);
      return laidOut.then((copy) => {
        if (views.includes(view)) keepFitted(view, copy.height);
        refit();
        return view;
      });
    },
    remove(view) {
      if (view === views[0]) throw new Error("Vernier Kit: the desktop view shows the canvas itself, and stays");
      followers.get(view)?.stop();
      followers.delete(view);
      fittings.get(view)?.observer.disconnect();
      fittings.delete(view);
      const i = views.indexOf(view);
      if (i >= 0) views.splice(i, 1);
    },
    sync,
    onResize(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    holdHeights() {
      const hold = {};
      holds.add(hold);
      return () => {
        if (holds.delete(hold)) refit();
      };
    },
  };
}

/** How tall a view is, and what keeps it as tall as what it shows. */
interface Fitting {
  doc: Document;
  iframe: HTMLIFrameElement;
  height: number;
  observer: ResizeObserver;
}

/** Which node of a view is which node of the canvas, both ways, and how text is typed in it. */
interface Correspondence {
  /** The view's node that is `node` of the canvas. */
  inView(node: Node): Node | null;
  /** The canvas node that is `node` of the view. */
  onCanvas(node: Node): Node | null;
  typeIn(el: Element): Typing;
}

/** The desktop view shows the canvas itself, and is typed in on the canvas. */
const ITSELF: Correspondence = { inView: (node) => node, onCanvas: (node) => node, typeIn: (el) => ({ el: el as HTMLElement, done() {} }) };

/** A view of the canvas, as `document` shows it. */
function viewOf(document: Document, { inView, onCanvas, typeIn }: Correspondence, height: () => number): View {
  const rangeIn = (run: Text[]) => {
    const nodes = run.map(inView);
    return nodes.every((node) => node !== null) ? rangeOf(nodes as Text[]) : null;
  };
  return {
    document,
    get height() {
      return height();
    },
    layerAt(tree, x, y, skip) {
      let layer: Layer | null = null;
      const skipped = skip && !skip.text ? inView(skip.el) : null;
      const hit = skipped ? (document.elementsFromPoint(x, y).find((e) => !skipped.contains(e)) ?? null) : document.elementFromPoint(x, y);
      for (let e = hit; e && !layer; e = e.parentElement) {
        const node = onCanvas(e);
        layer = node && tree.layerOf(node as Element);
      }
      return layer && runAt(layer, x, y, rangeIn);
    },
    boxOf(layer) {
      if (layer.text) return rangeIn(layer.text)?.getBoundingClientRect() ?? null;
      const el = inView(layer.el) as Element | null;
      // Not drawn at this width (`display: none` at a breakpoint): nothing to show.
      return el && (el === layer.el || el.getClientRects().length) ? el.getBoundingClientRect() : null;
    },
    elementOf: (el) => inView(el) as Element | null,
    typeIn,
  };
}

/** A copy of the canvas kept the same as it, node for node. */
interface Follower extends Correspondence {
  /** Takes in the changes to the canvas not taken in yet. */
  sync(): void;
  /** Stops following the canvas. */
  stop(): void;
}

/**
 * Keeps `copy`, made from `canvas` node for node, the same as it: each change
 * to the canvas is taken in before the next paint, or at once on `sync`. What
 * changed is copied as it is now, so changes are taken in in any order. While
 * text is typed in the copy, it goes the other way for the element typed in:
 * what is typed there is written to the canvas, and that element of the copy
 * takes in nothing from it; `typed` is called once what is typed is on it.
 */
function follow(canvas: Document, copy: Document, typed: () => void): Follower {
  /** Each canvas node's node in the copy, and back. */
  const inCopy = new WeakMap<Node, Node>();
  const onCanvas = new WeakMap<Node, Node>();
  const pair = (from: Node, to: Node) => {
    inCopy.set(from, to);
    onCanvas.set(to, from);
    for (let a = from.firstChild, b = to.firstChild; a && b; a = a.nextSibling, b = b.nextSibling) pair(a, b);
  };
  pair(canvas.documentElement, copy.documentElement);
  /** From the canvas to the copy, and, for the element typed in, back. */
  const down: Way = { to: inCopy, back: onCanvas, doc: copy };
  const up: Way = { to: onCanvas, back: inCopy, doc: canvas };
  /** The element typed in: the canvas's, and the copy's. */
  let typing: { canvas: Element; copy: Element; observer: MutationObserver } | null = null;

  /** A new node of `way`'s source, made in its other document: the nodes in it it has already go in it. */
  const copyOf = (node: Node, way: Way): Node => {
    const template = isTemplate(node);
    const made = way.doc.importNode(node, template);
    way.to.set(node, made);
    way.back.set(made, node);
    if (node.nodeName.toLowerCase() === "canvas") drawInto(made as HTMLCanvasElement, node as HTMLCanvasElement);
    if (!template) update(node, made, false, way);
    return made;
  };
  /**
   * Makes `to` the same as `from`: its attributes or text, and its children,
   * in order. Children it has already are kept as they are, unless they come
   * from elsewhere or `deep`: they may have changed while out of the canvas.
   * The element typed in is left alone in the copy, and its own attributes
   * (it is editable there) stay there.
   */
  const update = (from: Node, to: Node, deep: boolean, way: Way) => {
    if (way === down && from === typing?.canvas) return;
    if (from.nodeType === Node.ELEMENT_NODE) {
      if (from !== typing?.copy) copyAttributes(from as Element, to as Element);
    } else if (hasData(from)) (to as CharacterData).data = (from as CharacterData).data;
    if (isTemplate(from)) return; // What it holds is its content, which the copy took whole.
    const wanted = [...from.childNodes].map((child) => {
      const known = way.to.get(child);
      if (!known) return copyOf(child, way);
      if (deep || known.parentNode !== to) update(child, known, true, way);
      return known;
    });
    const children = to.childNodes;
    wanted.forEach((child, i) => {
      if (children[i] !== child) to.insertBefore(child, children[i] ?? null);
    });
    while (children.length > wanted.length) to.removeChild(to.lastChild!);
  };
  const takeIn = (records: MutationRecord[], way: Way) => {
    const lists = new Set<Node>();
    for (const record of records) {
      const { target } = record;
      // The copy's element typed in takes in nothing from the canvas; its editable state stays in the copy.
      if (way === down ? typing?.canvas.contains(target) : record.type === "attributes" && target === typing?.copy) continue;
      const to = way.to.get(target);
      // A node the other side has none of yet is made whole once it is in place.
      if (!to) continue;
      if (record.type === "childList") lists.add(target);
      else if (record.type === "characterData") (to as CharacterData).data = (target as CharacterData).data;
      else copyAttribute(target as Element, to as Element, record.attributeNamespace, record.attributeName!);
    }
    for (const node of lists) update(node, way.to.get(node)!, false, way);
  };
  const observer = new MutationObserver((records) => takeIn(records, down));
  observer.observe(canvas.documentElement, EVERYTHING);
  const sync = () => takeIn(observer.takeRecords(), down);
  const doneTyping = () => {
    if (!typing) return;
    const { canvas: el, observer: typedIn } = typing;
    takeIn(typedIn.takeRecords(), up);
    typedIn.disconnect();
    // What the canvas wrote meanwhile, which the element typed in skips.
    sync();
    typing = null;
    update(el, inCopy.get(el)!, true, down);
  };
  return {
    inView: (node) => inCopy.get(node) ?? null,
    onCanvas: (node) => onCanvas.get(node) ?? null,
    typeIn(el) {
      doneTyping();
      sync();
      const at = inCopy.get(el) as Element | undefined;
      if (!at) throw new Error("Vernier Kit: the view shows no such element");
      const observer = new MutationObserver((records) => {
        takeIn(records, up);
        typed();
      });
      observer.observe(at, EVERYTHING);
      const session = (typing = { canvas: el, copy: at, observer });
      return { el: at as HTMLElement, done: () => typing === session && doneTyping() };
    },
    sync,
    stop: () => {
      // What was typed last is kept on the canvas.
      if (typing) takeIn(typing.observer.takeRecords(), up);
      typing?.observer.disconnect();
      typing = null;
      observer.disconnect();
    },
  };
}

/** One way nodes are copied: from a node to its counterpart, made in `doc`. */
interface Way {
  to: WeakMap<Node, Node>;
  back: WeakMap<Node, Node>;
  doc: Document;
}

const EVERYTHING: MutationObserverInit = { subtree: true, childList: true, attributes: true, characterData: true };

/** Text and comments: what they hold is their data. */
function hasData(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.CDATA_SECTION_NODE;
}

function isTemplate(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === "template";
}

function copyAttributes(from: Element, to: Element) {
  for (const attr of [...to.attributes]) if (!from.hasAttributeNS(attr.namespaceURI, attr.localName)) to.removeAttributeNode(attr);
  for (const attr of from.attributes) copyAttribute(from, to, attr.namespaceURI, attr.localName);
}

function copyAttribute(from: Element, to: Element, namespace: string | null, name: string) {
  const attr = from.getAttributeNodeNS(namespace, name);
  if (!attr) to.removeAttributeNS(namespace, name);
  else if (to.getAttributeNS(namespace, name) !== attr.value) {
    if (namespace) to.setAttributeNS(namespace, attr.name, attr.value);
    else to.setAttribute(attr.name, attr.value);
  }
}
