/**
 * Change Preview: in preview mode, the changes not yet applied show on the
 * live page, which goes on working as usual. Each change's layer is found on
 * the page by its element location and usage chain and marked with an
 * attribute; one injected stylesheet shows the changes on the marked
 * elements. The page's element structure is never touched (ADR 0001), so
 * React renders on undisturbed, and elements it renders later are marked as
 * they come. Of the changes to the structure, the page shows those it can
 * with styles alone: a reorder in a Stack (with `order`), a layer placed
 * absolute in its own container, a layer deleted (hidden).
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import type { Change, Place, Target } from "./changeset";
import { PREVIEW_ATTR, PREVIEW_FLOW_ATTR, PREVIEW_ORDER_ATTR, PREVIEW_REFERENCE_ATTR, PREVIEW_STYLES_ATTR } from "./host";
import { originOf, usageKey } from "./layers";
import { readUsageChain } from "./usage-chain";

export interface ChangePreview {
  /** Shows `changes` on the page, in place of the ones shown before. Those it cannot show are left out. */
  show(changes: Change[]): void;
  /** Takes every change off the page. */
  stop(): void;
}

/**
 * Whether the live page can show the change before it is applied. A layer with
 * no source marker cannot be found there, nor one made this round, nor text
 * with no element of its own. Of the changes to the structure, only those
 * styles alone show: a reorder in the same container (unless text runs on
 * among its layers), a placement absolute in the same container, a deletion;
 * not when one of a loop's instances is changed alone, which the page cannot tell apart.
 */
export function canPreview(change: Change): boolean {
  const { target } = change;
  if (!target.loc || target.made || target.run !== undefined) return false;
  if (change.kind === "style") return true;
  if (change.data) return false;
  if (change.kind === "delete") return true;
  if (change.kind !== "move" || change.wrap) return false;
  const [before, after] = [change.before, change.after] as Place[];
  const container = after.container.target;
  if (before.container.layer !== after.container.layer || !container.loc || container.made) return false;
  return after.absolute ? true : !before.absolute && !!change.order;
}

export function startChangePreview(doc: Document): ChangePreview {
  const sheet = doc.createElement("style");
  sheet.setAttribute(PREVIEW_STYLES_ATTR, "");
  /** Layer ids by usage key: the layers the changes shown are made to. */
  let layers = new Map<string, string[]>();
  /** One target for each of those layers, to find it by when its markers have moved. */
  let targets = new Map<string, Target>();
  /** Their element locations, to pass over most elements without reading their usage chain. */
  let locs = new Set<string>();
  /** Containers whose layers show in another order, by usage key: their layers' keys in that order, and whether they are a plain flow. */
  let orders = new Map<string, { target: Target; keys: (string | null)[]; flow: boolean }>();
  /** Containers that become the positioning reference of a layer placed absolute in them, by usage key. */
  let references = new Map<string, Target>();

  /**
   * Gives the layers of each reordered container their place in the new order,
   * found by their usage keys; a layer the order does not name stays right
   * after the one before it.
   */
  const arrange = () => {
    for (const attr of [PREVIEW_ORDER_ATTR, PREVIEW_FLOW_ATTR, PREVIEW_REFERENCE_ATTR]) {
      for (const el of doc.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr);
    }
    for (const { target, keys, flow } of orders.values()) {
      for (const container of elementsOf(doc, target)) {
        if (flow) container.setAttribute(PREVIEW_FLOW_ATTR, "");
        const taken = keys.map(() => false);
        let last = 0;
        for (const child of container.children) {
          const key = usageKeyOf(child);
          const i = keys.findIndex((k, j) => k !== null && k === key && !taken[j]);
          if (i >= 0) {
            taken[i] = true;
            last = 2 * i + 1;
          }
          child.setAttribute(PREVIEW_ORDER_ATTR, String(last));
        }
      }
    }
    for (const target of references.values()) for (const el of elementsOf(doc, target)) el.setAttribute(PREVIEW_REFERENCE_ATTR, "");
  };

  const mark = (root: Element) => {
    for (const [el, key] of keysIn(root, locs)) {
      const ids = layers.get(key);
      if (ids) el.setAttribute(PREVIEW_ATTR, ids.join(" "));
    }
  };
  const unmark = () => {
    for (const el of doc.querySelectorAll(`[${PREVIEW_ATTR}]`)) el.removeAttribute(PREVIEW_ATTR);
  };
  // While the Agent edits a file, the markers of the file's other layers move: those are found where they went.
  const markMoved = () => {
    for (const [key, ids] of layers) {
      if (doc.querySelector(`[${PREVIEW_ATTR}~="${CSS.escape(ids[0])}"]`)) continue;
      for (const el of movedElementsOf(doc, targets.get(key)!)) el.setAttribute(PREVIEW_ATTR, ids.join(" "));
    }
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
    markMoved();
    // React renders another child, or the same in another place: the order is given anew.
    if (orders.size || references.size) arrange();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [LOC_ATTR, USAGE_ATTR] });

  let shownKeys = "";
  return {
    show(changes) {
      const shown = changes.filter(canPreview);
      const next = new Map<string, string[]>();
      const nextTargets = new Map<string, Target>();
      const nextOrders = new Map<string, { target: Target; keys: (string | null)[]; flow: boolean }>();
      const nextReferences = new Map<string, Target>();
      for (const change of shown) {
        const { layer, target } = change;
        const key = usageKey(target.loc!, target.chain);
        const ids = next.get(key) ?? [];
        if (!ids.includes(layer)) next.set(key, [...ids, layer]);
        nextTargets.set(key, target);
        if (change.kind !== "move") continue;
        const container = (change.after as Place).container.target;
        const at = usageKey(container.loc!, container.chain);
        if (change.order) nextOrders.set(at, { target: container, ...change.order });
        if (change.reference) nextReferences.set(at, container);
      }
      // Only a different set of layers needs the page marked again; new values need a new stylesheet only.
      const keys = JSON.stringify([[...next], [...nextOrders], [...nextReferences]]);
      if (keys !== shownKeys) {
        shownKeys = keys;
        layers = next;
        targets = nextTargets;
        orders = nextOrders;
        references = nextReferences;
        locs = new Set([...nextTargets.values()].map((target) => target.loc!));
        unmark();
        if (layers.size) mark(doc.documentElement);
        markMoved();
        arrange();
      }
      sheet.textContent = [...shown.filter((change) => Object.keys(change.style).length).map(ruleOf), ...structureRules(orders)].join("\n");
      if (!shown.length) sheet.remove();
      else if (!sheet.isConnected) (doc.head ?? doc.documentElement).append(sheet);
    },
    stop() {
      observer.disconnect();
      sheet.remove();
      unmark();
      layers = new Map();
      targets = new Map();
      orders = new Map();
      references = new Map();
      arrange();
      shownKeys = "";
    },
  };
}

/**
 * The elements of the layer a change is made to, on the live page now: every
 * instance of its usage. Where its markers have moved, as an edit to its file
 * moves them, where they went.
 */
export function elementsOf(doc: Document, target: Target): Element[] {
  if (!target.loc) return [];
  const key = usageKey(target.loc, target.chain);
  const els = [...keysIn(doc.documentElement, new Set([target.loc]))].filter(([, k]) => k === key).map(([el]) => el);
  return els.length ? els : movedElementsOf(doc, target);
}

/**
 * A layer whose markers no longer match, found among the elements of the same
 * tag written in the same file, by the same components: the one whose
 * locations moved least. None when two are as near.
 */
function movedElementsOf(doc: Document, target: Target): Element[] {
  const at = parseLoc(target.loc);
  const tag = /^<([\w-]+)/.exec(target.context?.element ?? "")?.[1];
  if (!at || !tag) return [];
  const components = JSON.stringify(target.chain.map(({ component, thirdParty }) => [component, thirdParty]));
  const groups = new Map<string, { distance: number; els: Element[] }>();
  for (const el of doc.querySelectorAll(`${tag}[${LOC_ATTR}^="${CSS.escape(at.file)}:"]`)) {
    const { loc, chain } = originOf(el, readUsageChain(el));
    if (!loc || JSON.stringify(chain.map(({ component, thirdParty }) => [component, thirdParty])) !== components) continue;
    const distance = [distanceOf(target.loc, loc), ...chain.map((level, i) => distanceOf(target.chain[i].usage, level.usage))].reduce((a, b) => a + b, 0);
    if (!Number.isFinite(distance)) continue;
    const key = usageKey(loc, chain);
    const group = groups.get(key) ?? { distance, els: [] };
    group.els.push(el);
    groups.set(key, group);
  }
  const ranked = [...groups.values()].sort((a, b) => a.distance - b.distance);
  return ranked.length && (ranked.length === 1 || ranked[0].distance < ranked[1].distance) ? ranked[0].els : [];
}

/** How far a location moved: lines, a little more for another column; infinitely far in another file. */
function distanceOf(from: string | null, to: string | null): number {
  if (from === to) return 0;
  const a = parseLoc(from);
  const b = parseLoc(to);
  if (!a || !b || a.file !== b.file) return Infinity;
  return Math.abs(a.line - b.line) + (a.column === b.column ? 0 : 0.5);
}

function parseLoc(loc: string | null): { file: string; line: number; column: number } | null {
  const match = loc && /^(.*):(\d+):(\d+)$/.exec(loc);
  return match ? { file: match[1], line: Number(match[2]), column: Number(match[3]) } : null;
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

/** The usage key of a live element: null with no source marker. */
export function usageKeyOf(el: Element): string | null {
  const { loc, chain } = originOf(el, readUsageChain(el));
  return loc && usageKey(loc, chain);
}

/** Rules for the order of reordered layers, a plain flow laid out as a column so it holds, and positioning references. */
function structureRules(orders: Map<string, { keys: (string | null)[] }>): string[] {
  const most = Math.max(0, ...[...orders.values()].map(({ keys }) => keys.length));
  const rules = Array.from({ length: 2 * most }, (_, n) => `[${PREVIEW_ORDER_ATTR}="${n}"]:not(#vk-no-id) { order: ${n} !important; }`);
  rules.push(`[${PREVIEW_FLOW_ATTR}]:not(#vk-no-id) { display: flex !important; flex-direction: column !important; }`);
  rules.push(`[${PREVIEW_REFERENCE_ATTR}]:not(#vk-no-id) { position: relative !important; }`);
  return rules;
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
