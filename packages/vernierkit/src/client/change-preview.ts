/**
 * Change Preview: in preview mode, the changes not yet applied show on the
 * live page, which goes on working as usual. Each change's layer is found on
 * the page by its element location and usage chain and marked with an
 * attribute; one injected stylesheet shows the changes on the marked
 * elements. The page's element structure is never touched, so React renders
 * on undisturbed, and elements it renders later are marked as they come.
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import type { Change, Target } from "./changeset";
import { PREVIEW_ATTR, PREVIEW_STYLES_ATTR } from "./host";
import { originOf, usageKey } from "./layers";
import { readUsageChain } from "./usage-chain";

export interface ChangePreview {
  /** Shows `changes` on the page, in place of the ones shown before. Those it cannot show are left out. */
  show(changes: Change[]): void;
  /** Takes every change off the page. */
  stop(): void;
}

/** Whether the live page can show the change before it is applied. A layer with no source marker cannot be found there. */
export function canPreview(change: Change): boolean {
  return change.target.loc !== null;
}

export function startChangePreview(doc: Document): ChangePreview {
  const sheet = doc.createElement("style");
  sheet.setAttribute(PREVIEW_STYLES_ATTR, "");
  /** Layer ids by usage key: the layers the changes shown are made to. */
  let layers = new Map<string, string[]>();
  /** Their element locations, to pass over most elements without reading their usage chain. */
  let locs = new Set<string>();

  const mark = (root: Element) => {
    for (const [el, key] of keysIn(root, locs)) {
      const ids = layers.get(key);
      if (ids) el.setAttribute(PREVIEW_ATTR, ids.join(" "));
    }
  };
  const unmark = () => {
    for (const el of doc.querySelectorAll(`[${PREVIEW_ATTR}]`)) el.removeAttribute(PREVIEW_ATTR);
  };

  // Called before the browser renders what React added: new elements never show without the changes.
  // React may also reuse an element for other JSX, changing its markers: it is marked again.
  const observer = new MutationObserver((records) => {
    if (!layers.size) return;
    for (const record of records) {
      if (record.type === "attributes") {
        (record.target as Element).removeAttribute(PREVIEW_ATTR);
        mark(record.target as Element);
      }
      for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) mark(node as Element);
    }
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [LOC_ATTR, USAGE_ATTR] });

  let shownKeys = "";
  return {
    show(changes) {
      const shown = changes.filter(canPreview);
      const next = new Map<string, string[]>();
      for (const { layer, target } of shown) {
        const key = usageKey(target.loc!, target.chain);
        const ids = next.get(key) ?? [];
        if (!ids.includes(layer)) next.set(key, [...ids, layer]);
      }
      // Only a different set of layers needs the page marked again; new values need a new stylesheet only.
      const keys = JSON.stringify([...next]);
      if (keys !== shownKeys) {
        shownKeys = keys;
        layers = next;
        locs = new Set(shown.map((change) => change.target.loc!));
        unmark();
        if (layers.size) mark(doc.documentElement);
      }
      sheet.textContent = shown.map(ruleOf).join("\n");
      if (!shown.length) sheet.remove();
      else if (!sheet.isConnected) (doc.head ?? doc.documentElement).append(sheet);
    },
    stop() {
      observer.disconnect();
      sheet.remove();
      unmark();
      layers = new Map();
      shownKeys = "";
    },
  };
}

/** The elements of the layer a change is made to, on the live page now: every instance of its usage. */
export function elementsOf(doc: Document, target: Target): Element[] {
  if (!target.loc) return [];
  const key = usageKey(target.loc, target.chain);
  return [...keysIn(doc.documentElement, new Set([target.loc]))].filter(([, k]) => k === key).map(([el]) => el);
}

/** Elements in `root` (itself included) that may be layers at `locs`, with their usage keys. */
function* keysIn(root: Element, locs: Set<string>): Generator<[Element, string]> {
  for (const el of [root, ...root.querySelectorAll(`[${LOC_ATTR}], [${USAGE_ATTR}]`)]) {
    const own = el.getAttribute(LOC_ATTR);
    // Without a location of its own, it may pass a usage's props on; its origin says.
    if (own ? !locs.has(own) : !el.hasAttribute(USAGE_ATTR)) continue;
    const { loc, chain } = originOf(el, readUsageChain(el));
    if (loc) yield [el, usageKey(loc, chain)];
  }
}

/**
 * The change as a rule for its layer's elements. Important, so it holds over
 * the page's own rules and their states; `:not(#…)` lifts it above important
 * page rules with an id in them.
 */
function ruleOf({ layer, style }: Change): string {
  const declarations = Object.entries(style).map(([name, value]) => `${name}: ${value} !important;`);
  return `[${PREVIEW_ATTR}~="${CSS.escape(layer)}"]:not(#vk-no-id) { ${declarations.join(" ")} }`;
}
