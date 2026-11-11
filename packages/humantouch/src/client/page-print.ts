/**
 * The page's print (ticket 141): what tells, as edit mode comes back to a
 * round's canvas, whether the page changed since the page the canvas
 * reflects, and how. Two parts, each a hash:
 *
 * - its structure: each element drawn, by its tag and its class names, and
 *   each text, in the body and in open shadow roots, counted, not in order;
 * - its styles: the text of each of the page's own stylesheets (`@font-face`
 *   and theme variables among them), in the order they come in: those in its
 *   head, those its root holds, and those it adopted.
 *
 * What may differ from one load to the next with the code the same is left
 * out, so the page loaded again prints the same: the `style` attribute and
 * every attribute but `class` (animations write them, motion libraries
 * above all), digits in text (a time, a count), where an element is among
 * the others (what is shuffled, a carousel turning), source markers, and
 * the editor layer itself. A stylesheet in the body is the page's
 * structure: the canvas only takes in those of the page's head.
 */
import { HOST_TAG } from "./host";
import { NOT_THE_PAGES } from "./shadow-roots";

/**
 * `PUT`, to the local service: the page the canvas reflects, printed, as
 * `PagePrint`, kept apart from the round, as `page.json` (ticket 141). Here
 * rather than in `service-protocol.ts`, whose paths the page loads with the
 * toggle: only edit mode prints the page.
 */
export const PAGE_PATH = "/page";

/** What a page printed as: its address, its structure and its styles. Kept with a round, as `page.json`. */
export interface PagePrint {
  /** The page's path and query, as the canvas notes it (`PAGE_ATTR`). */
  path: string;
  structure: string;
  styles: string;
}

/** How the page as it is now stands to the page a canvas reflects. */
export type PageSince = "same" | "styles" | "structure";

/** Elements whose subtree is not drawn, or not the page's: looked into for nothing. */
const UNDRAWN = new Set(["head", "script", "noscript", "template", "link", "style", HOST_TAG, ...NOT_THE_PAGES]);

/** `win`'s page, printed. */
export function printOf(win: Window): PagePrint {
  const doc = win.document;
  return { path: win.location.pathname + win.location.search, structure: hash(structureOf(doc)), styles: hash(stylesOf(doc)) };
}

/** How `now` stands to `then`: the same page, or one whose styles alone changed, or its structure too. A print of another page is the same: it says nothing of this one. */
export function compare(then: PagePrint, now: PagePrint): PageSince {
  if (then.path !== now.path) return "same";
  if (then.structure !== now.structure) return "structure";
  return then.styles !== now.styles ? "styles" : "same";
}

function structureOf(doc: Document): string {
  const tags: string[] = [];
  const texts: string[] = [];
  const stack: Node[] = [doc.documentElement];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node as Text).data.replace(/\s+/g, " ").trim().replace(/\d/g, "0");
      if (text) texts.push(text);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const name = el.localName;
    // In the body, or a shadow root, a stylesheet is what is drawn there: its text is its words. The head is not looked into.
    if ((name === "style" || name === "link") && el.parentNode !== doc.documentElement) {
      tags.push(name === "style" ? `style{${el.textContent}}` : `link ${el.getAttribute("href")}`);
      continue;
    }
    if (UNDRAWN.has(name)) continue;
    tags.push(el.classList.length ? `${name}.${[...el.classList].sort().join(".")}` : name);
    for (let child = el.lastChild; child; child = child.previousSibling) stack.push(child);
    const shadow = el.shadowRoot;
    if (shadow) for (let child = shadow.lastChild; child; child = child.previousSibling) stack.push(child);
  }
  return `${tags.sort().join("\n")}\n\n${texts.sort().join("\n")}`;
}

/**
 * The page's own stylesheets, as their text: those of its head, and those
 * its root holds beside the head and the body; then those it adopted. A
 * `<style>` by what it says, one whose rules were put in from script, and a
 * linked stylesheet, by its rules; one of another origin, which cannot be
 * read, by its address.
 */
function stylesOf(doc: Document): string {
  const parts: string[] = [];
  for (const sheet of doc.styleSheets) {
    const owner = sheet.ownerNode as Element | null;
    if (!owner || !(doc.head?.contains(owner) || owner.parentNode === doc.documentElement)) continue;
    const media = sheet.media.mediaText;
    const text = owner.localName === "style" && owner.textContent!.trim() ? owner.textContent! : rulesOf(sheet);
    parts.push(`${owner.localName}${media ? ` @media ${media}` : ""}${sheet.disabled ? " disabled" : ""}\n${text ?? `@import url(${sheet.href})`}`);
  }
  for (const sheet of doc.adoptedStyleSheets) parts.push(`adopted\n${rulesOf(sheet) ?? ""}`);
  return parts.join("\n\n");
}

/** A sheet's rules as text, those it imports within; null when it cannot be read. */
function rulesOf(sheet: CSSStyleSheet): string | null {
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return null;
  }
  let text = "";
  for (const rule of rules) {
    const imported = rule instanceof CSSImportRule && rule.styleSheet ? rulesOf(rule.styleSheet) : null;
    text += imported === null ? rule.cssText : `@media ${(rule as CSSImportRule).media.mediaText} {${imported}}`;
  }
  return text;
}

/** A 53-bit hash of `text` (cyrb53), as hex: short enough to keep, and to compare. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
