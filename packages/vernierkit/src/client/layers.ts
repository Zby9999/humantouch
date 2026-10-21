/**
 * The layer model: translates the canvas copy into a tree of layers in design
 * language (Stack, Grid, Frame, text, …), with where each layer comes from in
 * the source and which layers are instances of the same usage.
 */
import { LOC_ATTR } from "../markers";
import { FROZEN } from "./freezer";
import { CHAIN_ATTR, type UsageLevel } from "./usage-chain";

export type LayerKind = "stack" | "grid" | "frame" | "text" | "image" | "still" | "locked";

export interface Layer {
  el: Element;
  kind: LayerKind;
  /** Stacks only: the direction children are laid out in. */
  direction: "horizontal" | "vertical" | null;
  /** Absolute: placed by coordinates in its parent, outside any automatic layout. */
  absolute: boolean;
  name: string;
  /** The component this layer belongs to, if React knows it. */
  component: string | null;
  /** `file:line:column` of the JSX that wrote this layer. Null: not located. */
  loc: string | null;
  /** Usage chain, innermost component first. */
  chain: UsageLevel[];
  /** The layer is a component usage: the outermost element a component renders. */
  isUsage: boolean;
  /** For a component usage: `file:line:column` of the JSX that uses the component. */
  usageLoc: string | null;
  parent: Layer | null;
  children: Layer[];
}

export interface LayerTree {
  /** The page itself. Its children are the outermost layers. */
  root: Layer;
  /** The layer an element of the canvas shows up as: itself, or the text or locked layer it is inside. */
  layerOf(el: Element): Layer | null;
  /** Layers with the same element location and usage chain, in page order; `layer` itself included. */
  instancesOf(layer: Layer): Layer[];
}

/** Elements that never draw a box of their own. */
const NOT_DRAWN = new Set(["head", "script", "style", "link", "meta", "template", "title", "noscript", "br", "wbr", "source", "track"]);
/** Elements drawn as one piece: what is inside is not layers. */
const IMAGES = new Set(["img", "svg", "picture"]);
const STILLS = new Set(["canvas", "video"]);
const LEAVES = new Set(["input", "textarea", "select", "hr", "iframe", "object", "embed", "audio", "progress", "meter", "math"]);
/** Inner display types laid out top to bottom when every child is a block. */
const FLOW = /^(block|flow-root|list-item|inline-block)$/;

export function buildLayerTree(doc: Document): LayerTree {
  const view = doc.defaultView!;
  const layers = new Map<Element, Layer>();
  const groups = new Map<string, Layer[]>();

  const make = (el: Element, parent: Layer | null): Layer => {
    const loc = el.getAttribute(LOC_ATTR);
    const chain = chainOf(el);
    const style = view.getComputedStyle(el);
    const layer: Layer = {
      el,
      kind: "frame",
      direction: null,
      absolute: style.position === "absolute" || style.position === "fixed",
      name: "",
      component: chain[0]?.component ?? null,
      loc,
      chain,
      isUsage: false,
      usageLoc: null,
      parent,
      children: [],
    };
    layers.set(el, layer);
    const set = (patch: Partial<Layer>) => Object.assign(layer, patch);
    if (parent && isUsageRoot(chain, el.parentElement ? chainOf(el.parentElement) : [])) {
      set({ isUsage: true, usageLoc: chain[0].usage });
    }
    if (!loc && chain[0]?.thirdParty) {
      // The whole dependency is one locked layer, named after its outermost component.
      const outer = chain.findIndex((level) => !level.thirdParty);
      const dependency = chain[(outer < 0 ? chain.length : outer) - 1];
      const { component, usage } = dependency;
      set({ kind: "locked", name: component, component, isUsage: true, usageLoc: usage });
    } else if (el.hasAttribute(FROZEN) || STILLS.has(el.localName)) {
      set({ kind: "still", name: stillName(el) });
    } else if (IMAGES.has(el.localName)) {
      set({ kind: "image", name: el.localName === "svg" ? "Vector" : el.getAttribute("alt") || "Image" });
    } else if (LEAVES.has(el.localName)) {
      set({ name: "Frame" });
    } else if (isText(el, view)) {
      set({ kind: "text", name: textName(el) });
    } else {
      for (const child of drawnChildren(el, view)) layer.children.push(make(child, layer));
      const display = style.display;
      if (/flex$/.test(display)) {
        set({ kind: "stack", name: "Stack", direction: style.flexDirection.startsWith("row") ? "horizontal" : "vertical" });
      } else if (/grid$/.test(display)) {
        set({ kind: "grid", name: "Grid" });
      } else if (FLOW.test(display) && flowsTopToBottom(layer.children, view)) {
        set({ kind: "stack", name: "Stack", direction: "vertical" });
      } else {
        set({ name: "Frame" });
      }
    }
    if (role(layer) === "component") layer.name = layer.component!;
    const key = instanceKey(layer);
    if (key) {
      const group = groups.get(key) ?? [];
      group.push(layer);
      groups.set(key, group);
    }
    return layer;
  };

  const root = make(doc.body, null);
  root.name = "Page";

  return {
    root,
    layerOf(el) {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const layer = layers.get(e);
        if (layer) return layer;
      }
      return null;
    },
    instancesOf(layer) {
      const key = instanceKey(layer);
      return (key && groups.get(key)) || [layer];
    },
  };
}

/**
 * What selecting the layer means: an ordinary layer, a component usage (edits
 * apply to that usage), or a locked layer (moved and resized as a whole only).
 */
export function role(layer: Layer): "layer" | "component" | "locked" {
  return layer.kind === "locked" ? "locked" : layer.isUsage ? "component" : "layer";
}

/** Description of a layer's type in design language, e.g. "Vertical Stack". */
export function typeLabel(layer: Layer): string {
  const type = {
    stack: `${layer.direction === "horizontal" ? "Horizontal" : "Vertical"} Stack`,
    grid: "Grid",
    frame: "Frame",
    text: "Text",
    image: "Image",
    still: "Still",
    locked: "Locked",
  }[layer.kind];
  return layer.absolute ? `${type} · Absolute` : type;
}

/** Instances share a location (a locked layer has only its usage's) and a usage chain. */
function instanceKey(layer: Layer): string | null {
  const loc = layer.kind === "locked" ? layer.usageLoc : layer.loc;
  return loc && `${loc} ${JSON.stringify(layer.chain)}`;
}

function chainOf(el: Element): UsageLevel[] {
  const json = el.getAttribute(CHAIN_ATTR);
  if (!json) return [];
  try {
    return JSON.parse(json) as UsageLevel[];
  } catch {
    return [];
  }
}

/** A component's outermost element: its parent belongs to the components further up the chain only. */
function isUsageRoot(chain: UsageLevel[], parentChain: UsageLevel[]): boolean {
  if (chain.length <= parentChain.length) return false;
  const tail = chain.slice(chain.length - parentChain.length);
  return tail.every((level, i) => level.component === parentChain[i].component && level.usage === parentChain[i].usage);
}

/** Children that draw a box. `display: contents` passes its children through. */
function drawnChildren(el: Element, view: Window): Element[] {
  const children: Element[] = [];
  for (const child of el.children) {
    if (NOT_DRAWN.has(child.localName)) continue;
    const display = view.getComputedStyle(child).display;
    if (display === "none") continue;
    if (display === "contents") children.push(...drawnChildren(child, view));
    else children.push(child);
  }
  return children;
}

/** Only text, with inline pieces (bold, links, …) counted as part of it. */
function isText(el: Element, view: Window): boolean {
  let text = false;
  const visit = (node: Element): boolean => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent!.trim()) text = true;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const e = child as Element;
        if (e.localName === "br" || e.localName === "wbr") continue;
        if (NOT_DRAWN.has(e.localName)) continue;
        const display = view.getComputedStyle(e).display;
        if (display === "none") continue;
        if (display !== "inline" && display !== "contents") return false;
        if (IMAGES.has(e.localName) || STILLS.has(e.localName) || LEAVES.has(e.localName)) return false;
        if (!visit(e)) return false;
      }
    }
    return true;
  };
  return visit(el) && text;
}

/** Every child in the flow is a block of its own, so they stack top to bottom. */
function flowsTopToBottom(children: Layer[], view: Window): boolean {
  const inFlow = children.filter((child) => !child.absolute);
  return (
    inFlow.length > 0 &&
    inFlow.every((child) => {
      const style = view.getComputedStyle(child.el);
      return !style.display.startsWith("inline") && style.float === "none";
    })
  );
}

function stillName(el: Element): string {
  const frozen = el.getAttribute(FROZEN);
  if (frozen === "iframe") return el.textContent!; // The placeholder shows the embedded page's name.
  return frozen === "video" || el.localName === "video" ? "Video" : "Canvas";
}

const MAX_NAME = 100;

function textName(el: Element): string {
  const text = el.textContent!.replace(/\s+/g, " ").trim();
  return text.length > MAX_NAME ? `${text.slice(0, MAX_NAME - 1)}…` : text;
}
