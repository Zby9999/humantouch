/**
 * The live page at another width, for the check (ADR 0006, 0008): a copy of
 * it, node for node, in a hidden iframe that wide, kept the same as the page
 * as the dev server brings the code in. As the views do, it shows what CSS
 * does at its width; none of the page's scripts run in it, and it loads
 * nothing of its own but the stylesheets and images it shares with the page.
 * The page's open shadow roots are copied too, their styles with them, and
 * kept the same as well (ticket 137): only on a page that has some of its own
 * when it is first copied (the editor's `<human-touch>` and the dev server's
 * overlays are not the page's), so a page with none costs no more than
 * before.
 */
import { CHECK_FRAME_ATTR } from "./host";
import { hostsPagesShadowRoot } from "./shadow-roots";

export interface PageCopy {
  width: number;
  doc: Document;
  /** Takes in what changed on the page since the last time; whether anything did. */
  sync(): boolean;
  /** Has the copy work out its styles and layout now, as they are: so the next read of it costs little. */
  layOut(): void;
  /** An element of the page, as the copy has it: once synced. */
  of(el: Element): Element | null;
  /** Its stylesheets have loaded: a `<link>` copied loads its sheet afresh (from the cache). */
  ready(): boolean;
  /** Resolves once it is ready, or a while has passed. */
  loaded(): Promise<void>;
  close(): void;
}

/** How long a copy's stylesheets may take to load before it is read all the same. */
const LOAD_MS = 2000;
/** Changes to the page held for the next sync, beyond which the copy is made afresh instead. */
const MAX_HELD = 5000;
const EVERYTHING: MutationObserverInit = { subtree: true, childList: true, attributes: true, characterData: true };
/** What would load something into the copy, or take focus: left off it. */
const LOADS: Record<string, string[]> = { iframe: ["src", "srcdoc"], frame: ["src"], embed: ["src"], object: ["data"], video: ["autoplay"], audio: ["autoplay"] };

/** A copy of `page` `width` px wide, in a hidden iframe put in `into`. */
export function copyPage(page: Document, width: number, into: ParentNode): PageCopy {
  const frame = page.createElement("iframe");
  frame.setAttribute(CHECK_FRAME_ATTR, "");
  frame.setAttribute("aria-hidden", "true");
  frame.inert = true;
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    top: "0",
    left: `${-width - 100}px`,
    width: `${width}px`,
    height: `${page.defaultView?.innerHeight ?? 800}px`,
    border: "0",
    visibility: "hidden",
    pointerEvents: "none",
  });
  into.append(frame);
  const doc = frame.contentDocument!;
  // In the page's mode: the iframe's first document is in quirks mode.
  doc.open();
  doc.write(page.compatMode === "CSS1Compat" ? "<!DOCTYPE html><html></html>" : "<html></html>");
  doc.close();

  let inCopy = new WeakMap<Node, Node>();
  const failed = new WeakSet<Element>();
  /** Whether the page has open shadow roots, copied too (ticket 137). */
  let deep = false;

  /** Makes an element of the copy load nothing of its own but stylesheets and images, nor take focus. */
  const quiet = (el: Element) => {
    for (const name of LOADS[el.localName] ?? []) el.removeAttribute(name);
    el.removeAttribute("autofocus");
    if (el.localName === "video" || el.localName === "audio") el.setAttribute("preload", "none");
    if (el.localName === "link") el.addEventListener("error", () => failed.add(el), { once: true });
  };
  const copyOf = (node: Node): Node => {
    const template = node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === "template";
    const made = doc.importNode(node, template);
    inCopy.set(node, made);
    if (made.nodeType === Node.ELEMENT_NODE) quiet(made as Element);
    if (!template) update(node, made);
    if (deep && node.nodeType === Node.ELEMENT_NODE && hostsPagesShadowRoot(node as Element)) copyShadow(node as Element, made as Element);
    return made;
  };
  /**
   * Gives `to`, the copy of `host`, a copy of the open shadow root it hosts,
   * node for node, the stylesheets it adopted as constructable ones of the
   * copy's. Its nodes are kept the same as the page's from then on, as the
   * page's are; its adopted stylesheets are copied this once, and not
   * followed after (ticket 137).
   */
  const copyShadow = (host: Element, to: Element) => {
    const shadow = host.shadowRoot!;
    let copy: ShadowRoot;
    if (to.shadowRoot) {
      // One the page made clonable came with its host's copy: made anew from the page's, node for node, as any other.
      copy = to.shadowRoot;
      copy.replaceChildren();
    } else {
      try {
        copy = to.attachShadow({ mode: "open" });
      } catch {
        return; // Not an element that can host one.
      }
    }
    inCopy.set(shadow, copy);
    const Sheet = doc.defaultView!.CSSStyleSheet;
    copy.adoptedStyleSheets = shadow.adoptedStyleSheets.map((sheet) => {
      const own = new Sheet();
      own.replaceSync([...sheet.cssRules].map((rule) => rule.cssText).join("\n"));
      return own;
    });
    observer.observe(shadow, EVERYTHING);
    update(shadow, copy);
  };
  /** Pairs each node of the page with its node in `to`, a deep copy of `from`; a check's own iframe is taken out of it. */
  const pair = (from: Node, to: Node) => {
    inCopy.set(from, to);
    let b = to.firstChild;
    for (let a = from.firstChild; a; a = a.nextSibling) {
      const next = b!.nextSibling;
      if (a.nodeType === Node.ELEMENT_NODE && (a as Element).hasAttribute(CHECK_FRAME_ATTR)) b!.parentNode!.removeChild(b!);
      else pair(a, b!);
      b = next;
    }
  };
  /** Makes `to` the same as `from`: its attributes or text, and its children, in order. */
  const update = (from: Node, to: Node) => {
    if (from.nodeType === Node.ELEMENT_NODE) copyAttributes(from as Element, to as Element);
    else if (hasData(from)) (to as CharacterData).data = (from as CharacterData).data;
    if (from.nodeType === Node.ELEMENT_NODE && (from as Element).localName === "template") return;
    const wanted: Node[] = [];
    for (const child of from.childNodes) {
      // A check's own iframe, where it is on the page itself.
      if (child.nodeType === Node.ELEMENT_NODE && (child as Element).hasAttribute(CHECK_FRAME_ATTR)) continue;
      const known = inCopy.get(child);
      if (!known) wanted.push(copyOf(child));
      else {
        if (known.parentNode !== to) update(child, known);
        wanted.push(known);
      }
    }
    const children = to.childNodes;
    wanted.forEach((child, i) => {
      if (children[i] !== child) to.insertBefore(child, children[i] ?? null);
    });
    while (children.length > wanted.length) to.removeChild(to.lastChild!);
  };
  /** The whole page at once, as the browser copies it, quieted before it is put in. */
  const copyAll = () => {
    inCopy = new WeakMap();
    const root = doc.importNode(page.documentElement, true);
    pair(page.documentElement, root);
    for (const el of root.querySelectorAll(`${Object.keys(LOADS).join(", ")}, link, [autofocus]`)) quiet(el);
    doc.replaceChild(root, doc.documentElement);
    // The page's open shadow roots, which a copy of its nodes leaves out: each copied onto its host's copy, those nested in it with it.
    const hosts = [...page.documentElement.querySelectorAll("*")].filter((el) => hostsPagesShadowRoot(el) && !el.hasAttribute(CHECK_FRAME_ATTR));
    deep = hosts.length > 0;
    for (const host of hosts) {
      const to = inCopy.get(host) as Element | undefined;
      if (to) copyShadow(host, to);
    }
  };

  let held: MutationRecord[] = [];
  let stale = false;
  const observer = new MutationObserver((records) => {
    if (stale) return;
    held.push(...records);
    if (held.length > MAX_HELD) {
      stale = true;
      held = [];
    }
  });
  copyAll();
  observer.observe(page.documentElement, EVERYTHING);

  const sync = () => {
    const records = [...held, ...observer.takeRecords()];
    held = [];
    if (stale) {
      stale = false;
      copyAll();
      return true;
    }
    const lists = new Set<Node>();
    for (const record of records) {
      const to = inCopy.get(record.target);
      // A node the copy has none of yet is made whole once it is in place.
      if (!to) continue;
      if (record.type === "childList") lists.add(record.target);
      else if (record.type === "characterData") (to as CharacterData).data = (record.target as CharacterData).data;
      else copyAttribute(record.target as Element, to as Element, record.attributeNamespace, record.attributeName!);
    }
    for (const node of lists) update(node, inCopy.get(node)!);
    return records.length > 0;
  };
  const sheets = () => [...doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')];
  const ready = () => sheets().every((link) => link.sheet || failed.has(link) || link.disabled);

  return {
    width,
    doc,
    sync,
    layOut: () => void doc.documentElement.getBoundingClientRect(),
    of: (el) => (inCopy.get(el) as Element | undefined) ?? null,
    ready,
    loaded: () =>
      new Promise((resolve) => {
        if (ready()) return resolve();
        const timer = setTimeout(done, LOAD_MS);
        const links = sheets().filter((link) => !link.sheet);
        function done() {
          clearTimeout(timer);
          for (const link of links) {
            link.removeEventListener("load", look);
            link.removeEventListener("error", look);
          }
          resolve();
        }
        function look() {
          if (ready()) done();
        }
        for (const link of links) {
          link.addEventListener("load", look);
          link.addEventListener("error", look);
        }
      }),
    close() {
      observer.disconnect();
      frame.remove();
    },
  };
}

/** Text and comments: what they hold is their data. */
function hasData(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.CDATA_SECTION_NODE;
}

function copyAttributes(from: Element, to: Element) {
  for (const attr of [...to.attributes]) if (!from.hasAttributeNS(attr.namespaceURI, attr.localName) && !keptOff(to, attr.localName)) to.removeAttributeNode(attr);
  for (const attr of from.attributes) copyAttribute(from, to, attr.namespaceURI, attr.localName);
}

function copyAttribute(from: Element, to: Element, namespace: string | null, name: string) {
  if (keptOff(to, name)) return;
  const attr = from.getAttributeNodeNS(namespace, name);
  if (!attr) to.removeAttributeNS(namespace, name);
  else if (to.getAttributeNS(namespace, name) !== attr.value) {
    if (namespace) to.setAttributeNS(namespace, attr.name, attr.value);
    else to.setAttribute(attr.name, attr.value);
  }
}

/** An attribute the copy does without, or sets its own way. */
function keptOff(el: Element, name: string): boolean {
  if (name === "autofocus") return true;
  if (name === "preload" && (el.localName === "video" || el.localName === "audio")) return true;
  return LOADS[el.localName]?.includes(name) ?? false;
}
