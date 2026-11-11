/**
 * Usage chain reading: which components, used where, an element on the live
 * page belongs to. This is the only module that reads React internals (the
 * fiber on each DOM node, development builds only); when React changes them,
 * this is the one place to follow.
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import { DEFINED_GLOBAL } from "../definitions";

/** One component on the chain, innermost first. */
export interface UsageLevel {
  /** Component name. */
  component: string;
  /** `file:line:column` of the JSX that uses the component; null when that JSX is not project source. */
  usage: string | null;
  /** The component comes from a third-party dependency: the JSX it writes carries no markers. */
  thirdParty: boolean;
}

/** Where the freezer writes the chain on the canvas copy, as JSON. */
export const CHAIN_ATTR = "data-ht-chain";

type Fiber = {
  tag?: number;
  type?: unknown;
  memoizedProps?: Record<string, unknown> | null;
  pendingProps?: Record<string, unknown> | null;
  _debugOwner?: Fiber | ComponentInfo | null;
  return?: Fiber | null;
};
/** React 19's stand-in for a server component, which has no fiber. */
type ComponentInfo = { name: string; props?: Record<string, unknown> | null; owner?: Fiber | ComponentInfo | null };

let fiberKey: string | undefined;

/**
 * The usage chain of an element on the live page: the component that wrote
 * it, the component that used that one, and so on up to the root. Empty when
 * React does not know the element (plain HTML, or a production build).
 */
export function readUsageChain(el: Element): UsageLevel[] {
  const fiber = fiberOf(el);
  if (!fiber) return webComponentChain(el);
  const chain: UsageLevel[] = [];
  // A component writes either marked JSX (project source) or unmarked JSX (a dependency).
  let marked = el.hasAttribute(LOC_ATTR);
  for (let owner = ownerOf(fiber); owner; owner = ownerOf(owner)) {
    const props = isComponentInfo(owner) ? owner.props : (owner.memoizedProps ?? owner.pendingProps);
    const usage = typeof props?.[USAGE_ATTR] === "string" ? (props[USAGE_ATTR] as string) : null;
    chain.push({ component: isComponentInfo(owner) ? owner.name : nameOf(owner.type), usage, thirdParty: !marked });
    marked = usage !== null;
  }
  return chain;
}

/**
 * The chain of an element React does not know, in the open shadow root of a
 * custom element a dependency defines (ticket 137, ADR 0017): drawn by that
 * dependency, as a third-party component's elements are, used where its host
 * is written, then on up the host's own chain. Empty for any other, and on a
 * page whose dev server does not record which module defines each (`DEFINED_GLOBAL`).
 */
function webComponentChain(el: Element): UsageLevel[] {
  const defined = (el.ownerDocument.defaultView as unknown as Record<string, Map<string, string> | undefined> | null)?.[DEFINED_GLOBAL];
  if (!defined?.size) return [];
  const root = el.getRootNode();
  const host = root.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? (root as ShadowRoot).host : null;
  const stack = host && defined.get(host.localName);
  if (!host || !stack || !definedByDependency(stack)) return [];
  return [{ component: host.localName, usage: host.getAttribute(LOC_ATTR), thirdParty: true }, ...readUsageChain(host)];
}

/**
 * Whether a custom element was defined from a dependency's code alone: every
 * module on the stack `customElements.define` was called from, past the
 * dev server's own script recording it, is in `node_modules`, as the source
 * markers leave dependencies unmarked. A project's element defined through a
 * library's helper (Lit's `@customElement`) has a module of its own on it.
 */
export function definedByDependency(stack: string): boolean {
  const modules = stack
    .split("\n")
    .slice(1)
    .flatMap((line) => /(?:\(|at |@)([a-z][\w+.-]*:\/\/[^\s)]+?):\d+:\d+\)?\s*$/i.exec(line.trim())?.[1] ?? [])
    .slice(1);
  return modules.length > 0 && modules.every((url) => /\/node_modules\//.test(url));
}

function fiberOf(el: Element): Fiber | undefined {
  const node = el as unknown as Record<string, Fiber | undefined>;
  if (fiberKey && node[fiberKey]) return node[fiberKey];
  // The key carries a random suffix per copy of React.
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  if (!key) return undefined;
  fiberKey = key;
  return node[key];
}

/** The component whose render wrote this one. Falls back to the tree parent where React keeps no owners. */
function ownerOf(fiber: Fiber | ComponentInfo): Fiber | ComponentInfo | null {
  if (isComponentInfo(fiber)) return fiber.owner ?? null;
  if ("_debugOwner" in fiber) return fiber._debugOwner ?? null;
  for (let f = fiber.return; f; f = f.return) if (isComponent(f)) return f;
  return null;
}

function isComponentInfo(owner: Fiber | ComponentInfo): owner is ComponentInfo {
  return typeof (owner as ComponentInfo).name === "string" && !("tag" in owner);
}

function isComponent(fiber: Fiber): boolean {
  return typeof fiber.type === "function" || (typeof fiber.type === "object" && fiber.type !== null);
}

/** Display name of a component type, through `memo` and `forwardRef` wrappers. */
function nameOf(type: unknown): string {
  if (typeof type === "function") {
    return (type as { displayName?: string }).displayName || type.name || "Anonymous";
  }
  if (typeof type === "object" && type !== null) {
    const t = type as { displayName?: string; type?: unknown; render?: unknown };
    if (t.displayName) return t.displayName;
    if (t.type) return nameOf(t.type);
    if (t.render) return nameOf(t.render);
  }
  return "Anonymous";
}
