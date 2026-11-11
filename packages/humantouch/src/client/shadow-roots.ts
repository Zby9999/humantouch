import { HOST_TAG } from "./host";

/**
 * Open shadow roots on the canvas (ticket 135). The freezer copies each open
 * shadow root of the page, the styles in it with it, onto its host's copy.
 * Attached as `ON_CANVAS` says, a shadow root goes along with its host
 * wherever the canvas is copied (into each view, a layer duplicated) and is
 * written out with it when the canvas is saved, as a declarative shadow root
 * (`<template shadowrootmode="open">`), which the parser makes a shadow root
 * again when the canvas is put back. A closed shadow root cannot be read: its
 * host shows on the canvas as one with none would.
 *
 * The layers in an open shadow root are layers as any other (ticket 136): the
 * layers' tree reads what each host shows, its shadow root's nodes and those
 * slotted in them (`shownChildren`, `flatParent`), a point is hit into shadow
 * roots (`hitAt`), and each shadow root on the canvas is given the canvas's
 * own styles, which the document's do not reach (`styleShadowRoots`).
 */

/**
 * Hosts whose shadow roots are the dev server's or the framework's, not the
 * page's: Next.js's dev overlay and its route announcer, Vite's error
 * overlay. On the canvas they stay as they were before shadow roots were
 * copied, empty.
 */
export const NOT_THE_PAGES = new Set(["nextjs-portal", "next-route-announcer", "vite-error-overlay"]);

/** Whether `el` hosts an open shadow root of the page's: not the editor's own (`<human-touch>`), nor one of `NOT_THE_PAGES`. */
export function hostsPagesShadowRoot(el: Element): boolean {
  return !!el.shadowRoot && el.localName !== HOST_TAG && !NOT_THE_PAGES.has(el.localName);
}

/** How a shadow root is attached on the canvas: open, as the page's was; copied with its host; written out with it. */
export const ON_CANVAS: ShadowRootInit = { mode: "open", clonable: true, serializable: true };

/**
 * The documents that may hold open shadow roots: a canvas frozen from a page
 * with one, a view of it, a canvas or a look put back with one. Only in these
 * are shadow roots looked for, so a page with none costs no more than before.
 */
const withShadowRoots = new WeakSet<Document>();

/** Notes whether `doc` may hold open shadow roots (`withShadowRoots`). */
export function noteShadowRoots(doc: Document, may: boolean) {
  if (may) withShadowRoots.add(doc);
  else withShadowRoots.delete(doc);
}

/** Whether `doc` may hold open shadow roots. */
export function mayHoldShadowRoots(doc: Document): boolean {
  return withShadowRoots.has(doc);
}

/**
 * `root` and every element in it, in tree order (a shadow root itself is
 * left out), then the elements in each open shadow root among them, the same
 * way, nested ones too. Two trees the same node for node list theirs in the
 * same order. In a document that holds none, what
 * `[root, ...root.getElementsByTagName("*")]` lists.
 */
export function elementsWithin(root: Element | ShadowRoot): Element[] {
  const isElement = root.nodeType === Node.ELEMENT_NODE;
  const els: Element[] = isElement ? [root as Element, ...(root as Element).getElementsByTagName("*")] : [...root.querySelectorAll("*")];
  if (isElement && !mayHoldShadowRoots(root.ownerDocument!)) return els;
  for (let i = 0; i < els.length; i++) {
    const shadow = els[i].shadowRoot;
    if (shadow) for (const el of shadow.querySelectorAll("*")) els.push(el);
  }
  return els;
}

/** The elements in `doc` that match `selector`, those in its open shadow roots too. */
export function queryWithin<E extends Element = Element>(doc: Document, selector: string): E[] {
  if (!mayHoldShadowRoots(doc)) return [...doc.querySelectorAll<E>(selector)];
  return elementsWithin(doc.documentElement).filter((el) => el.matches(selector)) as E[];
}

/** The open shadow roots in `doc`, nested ones too: none in a document that holds none. */
export function shadowRootsIn(doc: Document): ShadowRoot[] {
  if (!mayHoldShadowRoots(doc)) return [];
  return elementsWithin(doc.documentElement).flatMap((el) => (el.shadowRoot ? [el.shadowRoot] : []));
}

/**
 * The element of the layers' tree that `node` sits in (ticket 136): the slot
 * it is assigned to, its parent, or, at the top of a shadow root, its host. For
 * a node in a document that holds none, its parent element.
 */
export function flatParent(node: Node): Element | null {
  const slot = (node as Element | Text).assignedSlot;
  if (slot) return slot;
  return node.parentElement ?? (node.parentNode as ShadowRoot | null)?.host ?? null;
}

/**
 * What holds the layers `el` shows, as their container (ticket 138): the
 * page's open shadow root it hosts, if it does; else `el` itself. A layer
 * moved, made or copied into `el` goes in it, and its places are its nodes.
 */
export function holderOf(el: Element): Element | ShadowRoot {
  return el.shadowRoot && hostsPagesShadowRoot(el) ? el.shadowRoot : el;
}

/**
 * The element `node` is in, as the DOM has it (ticket 138): its parent
 * element, or, at the top of a shadow root, its host. Unlike `flatParent`, a
 * slotted node's is its host's light DOM, where it is written.
 */
export function parentOf(node: Node): Element | null {
  return node.parentElement ?? (node.parentNode as ShadowRoot | null)?.host ?? null;
}

/** Whether `node` is in `el`, or in a shadow root of a host in it, or one in that (ticket 138): `contains` across shadow roots. */
export function containsAcross(el: Node, node: Node): boolean {
  if (el.contains(node)) return true;
  for (let root = node.getRootNode(); (root as ShadowRoot).host; root = (root as ShadowRoot).host.getRootNode()) if (el.contains((root as ShadowRoot).host)) return true;
  return false;
}

/**
 * Whether `node`, a layer's, would cross a shadow root's edge going into the
 * container `el` (ticket 138): it is in another tree, the document or a
 * shadow root, than the layers `el` holds; or it is slotted, written in its
 * host's light DOM but shown in the shadow root, which no move can keep it
 * so. `el` null: out of its document altogether, off the canvas, say, which a
 * layer in a shadow root, or slotted in one, cannot go either. `node` null:
 * a layer from another document, which cannot go into a shadow root.
 */
export function acrossShadowEdge(node: Node | null, el: Element | null): boolean {
  if (node && (node as Element | Text).assignedSlot) return true;
  if (!el) return !!node && node.getRootNode().nodeType !== Node.DOCUMENT_NODE;
  const tree = holderOf(el).getRootNode();
  return node ? node.getRootNode() !== tree : tree.nodeType !== Node.DOCUMENT_NODE;
}

/** Whether `node` is `el`, or what it shows: in it, slotted in a shadow root in it, in an open shadow root in it, or one in that. */
function showsIn(el: Node, node: Node): boolean {
  for (let at: Node | null = node; at; at = flatParent(at)) if (at === el) return true;
  return false;
}

/**
 * The topmost element at a point of `doc` (its viewport's px), the deepest in
 * the open shadow roots there (ticket 136); with `skip`, past it and what it
 * shows. In a document that holds none, what `elementFromPoint` finds, or with
 * `skip`, the first `elementsFromPoint` lists that is not in it.
 */
export function hitAt(doc: Document, x: number, y: number, skip?: Node | null): Element | null {
  if (!mayHoldShadowRoots(doc)) return skip ? (doc.elementsFromPoint(x, y).find((e) => !skip.contains(e)) ?? null) : doc.elementFromPoint(x, y);
  return skip ? (elementsAt(doc, x, y).find((e) => !showsIn(skip, e)) ?? null) : elementAt(doc, x, y);
}

/**
 * The topmost element at a point of `doc`, as `elementFromPoint` finds it,
 * then on into the open shadow roots it hosts: the deepest one there, which
 * `elementFromPoint` gives as the host.
 */
function elementAt(doc: Document, x: number, y: number): Element | null {
  let el = doc.elementFromPoint(x, y);
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el || inner.getRootNode() !== el.shadowRoot) break;
    el = inner;
  }
  return el;
}

/**
 * Every element at a point of `doc`, topmost first, as `elementsFromPoint`
 * lists them, with those in the open shadow roots among them each just above
 * its host.
 */
function elementsAt(doc: Document, x: number, y: number): Element[] {
  const listed = new Set<Element>();
  const visit = (root: Document | ShadowRoot) => {
    for (const el of root.elementsFromPoint(x, y)) {
      // A shadow root lists the elements around its host too: those are listed where they are.
      if (listed.has(el) || el.getRootNode() !== root) continue;
      if (el.shadowRoot) visit(el.shadowRoot);
      listed.add(el);
    }
  };
  visit(doc);
  return [...listed];
}

/**
 * The child nodes the layers' tree reads in `el` (ticket 136): those of its
 * open shadow root, which is what it shows; for a slot, the nodes assigned to
 * it, or what it holds when none is. `shadows`: whether the document may hold
 * any; when not, its child nodes.
 */
export function shownChildren(el: Element, shadows: boolean): Iterable<ChildNode> {
  if (!shadows) return el.childNodes;
  if (el.shadowRoot) return el.shadowRoot.childNodes;
  if (el.localName === "slot") {
    const assigned = (el as HTMLSlotElement).assignedNodes() as ChildNode[];
    if (assigned.length) return assigned;
  }
  return el.childNodes;
}

/** The canvas's own stylesheets in shadow roots (`styleShadowRoots`): never the page's, never saved. */
const canvasSheets = new WeakSet<CSSStyleSheet>();

/** Whether `sheet` is the canvas's own, one `styleShadowRoots` adopted. */
export function isCanvasSheet(sheet: CSSStyleSheet): boolean {
  return canvasSheets.has(sheet);
}

/**
 * Gives every open shadow root in `root`, a document or an element of one,
 * that has none yet `css`, the canvas's own styles, which the document's do
 * not reach (ticket 136): as an adopted stylesheet, last, so no node is added
 * among the page's, and none is copied or written out with the canvas, which
 * is why one copied in has to be given them again. In a document that holds
 * none, nothing.
 */
export function styleShadowRoots(root: Document | Element, css: string) {
  const doc = root.ownerDocument ?? (root as Document);
  if (!mayHoldShadowRoots(doc)) return;
  const within = elementsWithin(root.nodeType === Node.DOCUMENT_NODE ? doc.documentElement : (root as Element));
  const shadows = within.flatMap((el) => (el.shadowRoot && !el.shadowRoot.adoptedStyleSheets.some(isCanvasSheet) ? [el.shadowRoot] : []));
  if (!shadows.length) return;
  const sheet = new doc.defaultView!.CSSStyleSheet();
  sheet.replaceSync(css);
  canvasSheets.add(sheet);
  for (const shadow of shadows) shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
}

/** Whether `root`, or an element in it, hosts an open shadow root. */
export function hostsShadowRoots(root: Element): boolean {
  if (root.shadowRoot) return true;
  for (const el of root.getElementsByTagName("*")) if (el.shadowRoot) return true;
  return false;
}

/**
 * `el` as HTML: its `outerHTML`, with the open shadow roots in it that are
 * written out (`ON_CANVAS`) written in as declarative shadow roots. In a
 * document that holds none, or with none in it, its `outerHTML` as it is.
 */
export function htmlOf(el: Element): string {
  if (!mayHoldShadowRoots(el.ownerDocument) || !hostsShadowRoots(el)) return el.outerHTML;
  // Its own tags, around what is in it: a copy of it alone is written with nothing in it.
  const end = `</${el.localName}>`;
  const empty = (el.cloneNode(false) as Element).outerHTML;
  return empty.slice(0, -end.length) + el.getHTML({ serializableShadowRoots: true }) + end;
}

/**
 * Puts back the shadow roots of `doc`, a canvas or a look written from what
 * `htmlOf` wrote: notes that it may hold some, and makes every declarative
 * shadow root `htmlOf` wrote in it a shadow root of its host, as the parser
 * does where it reads them, for a browser whose `document.write` leaves them
 * templates. With none written, nothing.
 */
export function putBackShadowRoots(doc: Document, html: string) {
  const may = html.includes("shadowrootmode");
  noteShadowRoots(doc, may);
  if (may) attachDeclared(doc);
}

/** Makes the declarative shadow roots in `root` that `htmlOf` wrote (written out, so marked serializable) shadow roots, nested ones too. */
function attachDeclared(root: ParentNode) {
  for (const template of root.querySelectorAll<HTMLTemplateElement>("template[shadowrootmode][shadowrootserializable]")) {
    const host = template.parentElement;
    const mode = template.getAttribute("shadowrootmode");
    if (!host || host.shadowRoot || (mode !== "open" && mode !== "closed")) continue;
    let shadow: ShadowRoot;
    try {
      shadow = host.attachShadow({ mode, clonable: template.hasAttribute("shadowrootclonable"), serializable: template.hasAttribute("shadowrootserializable") });
    } catch {
      continue; // Not an element that can host one.
    }
    shadow.append(template.content);
    template.remove();
    attachDeclared(shadow);
  }
}

/**
 * The elements in `root` that match `selector`, itself too; with `deep`, those
 * in its open shadow roots too, nested ones, whether or not its document is
 * noted to hold any: for the live page, which never is (ticket 137), when
 * what is looked for may be in one.
 */
export function queryDeep<E extends Element = Element>(root: Document | Element, selector: string, deep: boolean): E[] {
  const found = root.nodeType === Node.ELEMENT_NODE && (root as Element).matches(selector) ? [root as E] : [];
  found.push(...root.querySelectorAll<E>(selector));
  if (!deep) return found;
  const hosts = (scope: ParentNode) => [...(scope === root && root.nodeType === Node.ELEMENT_NODE ? [root as Element] : []), ...scope.querySelectorAll("*")].filter(hostsPagesShadowRoot);
  const scopes: ParentNode[] = [root];
  for (let i = 0; i < scopes.length; i++) {
    for (const host of hosts(scopes[i])) {
      scopes.push(host.shadowRoot!);
      found.push(...host.shadowRoot!.querySelectorAll<E>(selector));
    }
  }
  return found;
}

/**
 * A canvas as saved, parsed with no window to show it in, its declarative
 * shadow roots made shadow roots again (ticket 137) and the document noted to
 * hold them, so what looks for layers finds those in them too. With none
 * written, as `DOMParser` parses it. Written back with `htmlOf`.
 */
export function parseCanvas(html: string): Document {
  if (!html.includes("shadowrootmode") || typeof Document.parseHTMLUnsafe !== "function") return new DOMParser().parseFromString(html, "text/html");
  const doc = Document.parseHTMLUnsafe(html);
  noteShadowRoots(doc, true);
  return doc;
}
