/**
 * Views: the one canvas shown at several widths (ADR 0008). The canvas is the
 * desktop view's document: every edit is made there, and the layers are read
 * from it. Each other view is a copy of it that follows every change to it,
 * node for node, so every view shows the same canvas, laid out at its own
 * width. A layer is the canvas's; each view finds it in what it shows.
 */
import { copyCanvas, drawInto, type Canvas } from "./freezer";
import { rangeOf, runAt, type Layer, type LayerTree } from "./layers";

export interface View {
  /** What the view shows: the canvas itself for the desktop view, a copy of it for any other. */
  readonly document: Document;
  /** The deepest layer at a point of this view, in its px, as `LayerTree.layerAt` finds it on the canvas. */
  layerAt(tree: LayerTree, x: number, y: number): Layer | null;
  /** Where the layer is laid out in this view, in its px; null when the view shows none of it. */
  boxOf(layer: Layer): DOMRect | null;
}

export interface Views {
  /** The canvas, which the desktop view shows. */
  readonly canvas: Canvas;
  /** Every view, the desktop view first. */
  list(): View[];
  /** Shows the canvas in `iframe` too, `width` px wide, as one more view. Settles once it is laid out. */
  add(iframe: HTMLIFrameElement, width: number): Promise<View>;
  /** Shows every change made to the canvas so far in every view now, rather than before the next paint. */
  sync(): void;
}

/** The canvas, shown so far in the desktop view only. */
export function createViews(canvas: Canvas): Views {
  const views: View[] = [viewOf(canvas.document, ITSELF)];
  const followers: Follower[] = [];
  return {
    canvas,
    list: () => [...views],
    add(iframe, width) {
      const doc = iframe.contentDocument;
      if (!doc) return Promise.reject(new Error("Vernier Kit: the view's iframe is not in the document"));
      const laidOut = copyCanvas(canvas, iframe, width);
      const follower = follow(canvas.document, doc);
      followers.push(follower);
      const view = viewOf(doc, follower);
      views.push(view);
      return laidOut.then(() => view);
    },
    sync() {
      for (const follower of followers) follower.sync();
    },
  };
}

/** Which node of a view is which node of the canvas, both ways. */
interface Correspondence {
  /** The view's node that is `node` of the canvas. */
  inView(node: Node): Node | null;
  /** The canvas node that is `node` of the view. */
  onCanvas(node: Node): Node | null;
}

/** The desktop view shows the canvas itself. */
const ITSELF: Correspondence = { inView: (node) => node, onCanvas: (node) => node };

/** A view of the canvas, as `document` shows it. */
function viewOf(document: Document, { inView, onCanvas }: Correspondence): View {
  const rangeIn = (run: Text[]) => {
    const nodes = run.map(inView);
    return nodes.every((node) => node !== null) ? rangeOf(nodes as Text[]) : null;
  };
  return {
    document,
    layerAt(tree, x, y) {
      let layer: Layer | null = null;
      for (let e = document.elementFromPoint(x, y); e && !layer; e = e.parentElement) {
        const node = onCanvas(e);
        layer = node && tree.layerOf(node as Element);
      }
      return layer && runAt(layer, x, y, rangeIn);
    },
    boxOf(layer) {
      if (layer.text) return rangeIn(layer.text)?.getBoundingClientRect() ?? null;
      const el = inView(layer.el) as Element | null;
      return el ? el.getBoundingClientRect() : null;
    },
  };
}

/** A copy of the canvas kept the same as it, node for node. */
interface Follower extends Correspondence {
  /** Takes in the changes to the canvas not taken in yet. */
  sync(): void;
}

/**
 * Keeps `copy`, made from `canvas` node for node, the same as it: each change
 * to the canvas is taken in before the next paint, or at once on `sync`. What
 * changed is copied as it is now, so changes are taken in in any order.
 */
function follow(canvas: Document, copy: Document): Follower {
  /** Each canvas node's node in the copy, and back. */
  const inCopy = new WeakMap<Node, Node>();
  const onCanvas = new WeakMap<Node, Node>();
  const pair = (from: Node, to: Node) => {
    inCopy.set(from, to);
    onCanvas.set(to, from);
    for (let a = from.firstChild, b = to.firstChild; a && b; a = a.nextSibling, b = b.nextSibling) pair(a, b);
  };
  pair(canvas.documentElement, copy.documentElement);

  /** A new node of the canvas, made in the copy: the nodes in it the copy has already go in it. */
  const copyOf = (node: Node): Node => {
    const template = isTemplate(node);
    const made = copy.importNode(node, template);
    inCopy.set(node, made);
    onCanvas.set(made, node);
    if (node.nodeName.toLowerCase() === "canvas") drawInto(made as HTMLCanvasElement, node as HTMLCanvasElement);
    if (!template) update(node, made, false);
    return made;
  };
  /**
   * Makes `to` the same as `from`: its attributes or text, and its children,
   * in order. Children it has already are kept as they are, unless they come
   * from elsewhere or `deep`: they may have changed while out of the canvas.
   */
  const update = (from: Node, to: Node, deep: boolean) => {
    if (from.nodeType === Node.ELEMENT_NODE) copyAttributes(from as Element, to as Element);
    else if (hasData(from)) (to as CharacterData).data = (from as CharacterData).data;
    if (isTemplate(from)) return; // What it holds is its content, which the copy took whole.
    const wanted = [...from.childNodes].map((child) => {
      const known = inCopy.get(child);
      if (!known) return copyOf(child);
      if (deep || known.parentNode !== to) update(child, known, true);
      return known;
    });
    const children = to.childNodes;
    wanted.forEach((child, i) => {
      if (children[i] !== child) to.insertBefore(child, children[i] ?? null);
    });
    while (children.length > wanted.length) to.removeChild(to.lastChild!);
  };
  const takeIn = (records: MutationRecord[]) => {
    const lists = new Set<Node>();
    for (const record of records) {
      const to = inCopy.get(record.target);
      // A node the copy has none of yet is made whole once it is in place.
      if (!to) continue;
      if (record.type === "childList") lists.add(record.target);
      else if (record.type === "characterData") (to as CharacterData).data = (record.target as CharacterData).data;
      else copyAttribute(record.target as Element, to as Element, record.attributeNamespace, record.attributeName!);
    }
    for (const node of lists) update(node, inCopy.get(node)!, false);
  };
  const observer = new MutationObserver(takeIn);
  observer.observe(canvas.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  return {
    inView: (node) => inCopy.get(node) ?? null,
    onCanvas: (node) => onCanvas.get(node) ?? null,
    sync: () => takeIn(observer.takeRecords()),
  };
}

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
