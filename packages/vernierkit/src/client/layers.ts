/**
 * The layer model: translates the canvas copy into a tree of layers in design
 * language (Stack, Grid, Frame, text, …), with where each layer comes from in
 * the source and which layers repeat across the instances of one usage.
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import { DELETED_ATTR, hiddenByEdit, LAYER_ID_ATTR, MADE_ATTR, ORIGINAL_TEXT_ATTR, WRAP_ATTR } from "./canvas-style";
import { FROZEN } from "./freezer";
import { CHAIN_ATTR, type UsageLevel } from "./usage-chain";

export type LayerKind = "stack" | "grid" | "frame" | "text" | "image" | "still" | "locked";

export interface Layer {
  /** The element the layer is; for text beside other layers, the element it sits in, which holds its styles. */
  el: Element;
  /** Text beside other layers: the run of text the layer is. It has no element of its own. */
  text: Text[] | null;
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
  /** The layer is an instance: the outermost layer a component renders from a usage. */
  isInstance: boolean;
  /** For an instance: `file:line:column` of its usage, the JSX that uses the component. */
  usageLoc: string | null;
  /** Made this round, or in a layer made this round: the id of the layer made. */
  made: string | null;
  parent: Layer | null;
  children: Layer[];
}

export interface LayerTree {
  /** The page itself. Its children are the outermost layers. */
  root: Layer;
  /** The deepest layer at a point of the canvas, in canvas px; with `skip`, past the elements it skips (and what is in them). */
  layerAt(x: number, y: number, skip?: Element): Layer | null;
  /** The layer an element is, or the run of loose text a text node starts. */
  layerOf(node: Element | Text): Layer | null;
  /**
   * This layer in every instance of its usage, in page order, `layer` itself included: layers
   * with the same element location and usage chain. For an instance, all instances of its usage.
   */
  acrossInstances(layer: Layer): Layer[];
}

/** Elements that never draw a box of their own. */
export const NOT_DRAWN = new Set(["head", "script", "style", "link", "meta", "template", "title", "noscript", "br", "wbr", "source", "track"]);
/** Elements drawn as one piece: what is inside is not layers. */
const IMAGES = new Set(["img", "svg", "picture"]);
const STILLS = new Set(["canvas", "video"]);
const LEAVES = new Set(["input", "textarea", "select", "hr", "iframe", "object", "embed", "audio", "progress", "meter", "math"]);
/** Elements named after what they are for, as a designer would call them. */
const PURPOSES: Record<string, string> = {
  button: "Button",
  a: "Link",
  input: "Input",
  textarea: "Text Area",
  select: "Select",
  form: "Form",
  nav: "Navigation",
  header: "Header",
  footer: "Footer",
  dialog: "Dialog",
};
const ROLES: Record<string, string> = { button: "Button", link: "Link", dialog: "Dialog", navigation: "Navigation" };

/** Inner display types laid out top to bottom when every child is a block. */
const FLOW = /^(block|flow-root|list-item|inline-block)$/;

export function buildLayerTree(doc: Document): LayerTree {
  const view = doc.defaultView!;
  const layers = new Map<Element, Layer>();
  const groups = new Map<string, Layer[]>();
  const origins = new Map<Element, Origin>();
  const origin = (el: Element) => {
    let o = origins.get(el);
    if (!o) origins.set(el, (o = originOf(el, chainOf(el))));
    return o;
  };

  const make = (el: Element, parent: Layer | null): Layer => {
    const { loc, chain } = origin(el);
    const style = view.getComputedStyle(el);
    const layer: Layer = {
      el,
      text: null,
      kind: "frame",
      direction: null,
      absolute: style.position === "absolute" || style.position === "fixed",
      name: "",
      component: chain[0]?.component ?? null,
      loc,
      chain,
      isInstance: false,
      usageLoc: null,
      made: el.getAttribute(MADE_ATTR),
      parent,
      children: [],
    };
    layers.set(el, layer);
    const set = (patch: Partial<Layer>) => Object.assign(layer, patch);
    if (parent && isInstanceRoot(chain, el.parentElement ? origin(el.parentElement).chain : [])) {
      set({ isInstance: true, usageLoc: chain[0].usage });
    }
    if (!loc && chain[0]?.thirdParty) {
      // The whole dependency is one locked layer, named after its outermost component.
      const outer = chain.findIndex((level) => !level.thirdParty);
      const dependency = chain[(outer < 0 ? chain.length : outer) - 1];
      const { component, usage } = dependency;
      set({ kind: "locked", name: component, component, isInstance: true, usageLoc: usage });
    } else if (el.hasAttribute(FROZEN) || STILLS.has(el.localName)) {
      set({ kind: "still", name: stillName(el) });
    } else if (IMAGES.has(el.localName)) {
      set({ kind: "image", name: el.localName === "svg" ? "Vector" : el.getAttribute("alt") || "Image" });
    } else if (LEAVES.has(el.localName)) {
      set({ name: "Frame" });
    } else if (isText(el, view)) {
      set({ kind: "text", name: textName(el.textContent!) });
    } else {
      for (const child of drawnChildren(el, view)) {
        layer.children.push(Array.isArray(child) ? makeText(child, layer) : make(child, layer));
      }
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
    // A container (or a field) is named for what it is for; text keeps its words, an instance its component.
    const purpose = ROLES[el.getAttribute("role") ?? ""] ?? (el.localName === "a" && !el.hasAttribute("href") ? undefined : PURPOSES[el.localName]);
    if (purpose && ["stack", "grid", "frame"].includes(layer.kind)) layer.name = purpose;
    if (role(layer) === "instance") layer.name = layer.component!;
    return layer;
  };

  const makeText = (run: Text[], parent: Layer): Layer => ({
    ...parent,
    text: run,
    kind: "text",
    direction: null,
    absolute: false,
    name: textName(run.map((node) => node.textContent).join("")),
    isInstance: false,
    usageLoc: null,
    parent,
    children: [],
  });

  const root = make(doc.body, null);
  root.name = "Page";

  const keys = new Map<Layer, string>();
  const group = (layer: Layer) => {
    let runs = 0;
    for (const child of layer.children) {
      let key = repeatKey(child);
      // Runs of text share their element's origin: the nth run of one instance goes with the nth run of the others.
      if (key && child.text) key += ` text ${runs++}`;
      if (key) {
        keys.set(child, key);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(child);
      }
      group(child);
    }
  };
  group(root);

  return {
    root,
    layerAt(x, y, skip) {
      let layer: Layer | undefined;
      const hit = skip ? doc.elementsFromPoint(x, y).find((e) => !skip.contains(e)) : doc.elementFromPoint(x, y);
      for (let e = hit ?? null; e && !layer; e = e.parentElement) layer = layers.get(e);
      return layer ? runAt(layer, x, y, rangeOf) : null;
    },
    layerOf(node) {
      if (node.nodeType === Node.ELEMENT_NODE) return layers.get(node as Element) ?? null;
      const parent = node.parentElement && layers.get(node.parentElement);
      return parent?.children.find((child) => child.text?.[0] === node) ?? null;
    },
    acrossInstances(layer) {
      const key = keys.get(layer);
      return (key && groups.get(key)) || [layer];
    },
  };
}

/** Whether layers can go in the layer: a Stack, a Grid or a Frame that is not a field or another element that holds no others. */
export function holdsLayers(layer: Layer): boolean {
  return (layer.kind === "stack" || layer.kind === "grid" || layer.kind === "frame") && !LEAVES.has(layer.el.localName);
}

/**
 * What selecting the layer means: an ordinary layer, an instance (edits apply
 * to its usage), or a locked layer (moved and resized as a whole only).
 */
export function role(layer: Layer): "layer" | "instance" | "locked" {
  return layer.kind === "locked" ? "locked" : layer.isInstance ? "instance" : "layer";
}

/** The node a layer starts at: its element, or for loose text, its first text with something in it. */
export function nodeOf(layer: Layer): Element | Text {
  return layer.text ? layer.text.find((node) => node.textContent!.trim())! : layer.el;
}

/** Where the layer is on the canvas, in canvas px. */
export function boxOf(layer: Layer): DOMRect {
  return layer.text ? rangeOf(layer.text).getBoundingClientRect() : layer.el.getBoundingClientRect();
}

/**
 * Text is not an element, so a point on it lands on the layer the text sits
 * in: the run of loose text of `layer` at the point, if there is one, or
 * `layer`. `range`: where a run is shown, null where it is not.
 */
export function runAt(layer: Layer, x: number, y: number, range: (run: Text[]) => Range | null): Layer {
  const at = (child: Layer) => !!child.text && [...(range(child.text)?.getClientRects() ?? [])].some((r) => contains(r, x, y));
  return layer.children.find(at) ?? layer;
}

/** The text of a run of loose text, without the white space around it. */
export function rangeOf(run: Text[]): Range {
  const range = run[0].ownerDocument.createRange();
  const first = run[0].textContent!;
  const last = run.at(-1)!.textContent!;
  range.setStart(run[0], first.length - first.trimStart().length);
  range.setEnd(run.at(-1)!, last.trimEnd().length);
  return range;
}

function contains(r: DOMRect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
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

/**
 * The same layer across instances shares a location (a locked layer has only
 * its usage's) and a usage chain. A layer made this round repeats with the
 * others the same edit made, apart from the layers it was made from.
 */
function repeatKey(layer: Layer): string | null {
  const loc = layer.kind === "locked" ? layer.usageLoc : layer.loc;
  // Text given an element of its own goes with the same run of text of the other instances.
  const wrap = layer.text ? null : layer.el.getAttribute(WRAP_ATTR);
  if (wrap !== null) return loc && `${usageKey(loc, layer.chain)} wrap ${wrap}${layer.made ? ` made ${layer.made}` : ""}`;
  if (!layer.made) return loc && usageKey(loc, layer.chain);
  if (loc) return `${usageKey(loc, layer.chain)} made ${layer.made}`;
  return layer.el.getAttribute(LAYER_ID_ATTR) === layer.made ? `made ${layer.made}` : null;
}

/** Elements with the same key are one layer across the instances of a usage. */
export function usageKey(loc: string, chain: UsageLevel[]): string {
  return `${loc} ${JSON.stringify(chain)}`;
}

/** Where an element comes from: its element location and usage chain. */
export interface Origin {
  loc: string | null;
  chain: UsageLevel[];
}

/** Where `el`, with usage chain `chain`, comes from: on the canvas and on the live page alike. */
export function originOf(el: Element, chain: UsageLevel[]): Origin {
  const loc = el.getAttribute(LOC_ATTR);
  // A dependency component that passes the usage's props on to the element it renders
  // (as motion.div and Radix primitives do) leaves that element to the code at the usage.
  if (!loc && chain[0]?.thirdParty && el.hasAttribute(USAGE_ATTR)) {
    const project = chain.findIndex((level) => !level.thirdParty);
    if (project > 0 && chain[project - 1].usage) return { loc: chain[project - 1].usage, chain: chain.slice(project) };
  }
  return { loc, chain };
}

/** How much of its words tells an element apart. */
export const SIGN_WORDS = 80;

/**
 * What an element looks like to a reader, on a canvas or the live page: its
 * tag and its first words (on a canvas, those the page had, before any new
 * words). It tells siblings apart where markers have moved.
 */
export function signOf(el: Element): string {
  return `${el.localName} ${wordsAsPage(el).slice(0, SIGN_WORDS)}`;
}

/** An element's words as the page has them: on a canvas, before any change to them. */
export function wordsAsPage(el: Element): string {
  const original = el.getAttribute(ORIGINAL_TEXT_ATTR);
  let text = el.textContent!;
  if (original !== null) {
    const template = el.ownerDocument.createElement("template");
    template.innerHTML = original;
    text = template.content.textContent!;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** The usage chain the freezer wrote on a canvas element; none when it wrote none. */
export function chainOf(el: Element): UsageLevel[] {
  const json = el.getAttribute(CHAIN_ATTR);
  if (!json) return [];
  try {
    return JSON.parse(json) as UsageLevel[];
  } catch {
    return [];
  }
}

/** A component's outermost element: its parent belongs to the components further up the chain only. */
function isInstanceRoot(chain: UsageLevel[], parentChain: UsageLevel[]): boolean {
  if (chain.length <= parentChain.length) return false;
  const tail = chain.slice(chain.length - parentChain.length);
  return tail.every((level, i) => level.component === parentChain[i].component && level.usage === parentChain[i].usage);
}

/** Children that draw a box, and runs of text between them. `display: contents` passes its children through. */
function drawnChildren(el: Element, view: Window): (Element | Text[])[] {
  const children: (Element | Text[])[] = [];
  let run: Text[] = [];
  const endRun = () => {
    if (run.some((node) => node.textContent!.trim())) children.push(run);
    run = [];
  };
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      run.push(child as Text);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const e = child as Element;
    if (NOT_DRAWN.has(e.localName) || e.hasAttribute(DELETED_ATTR)) continue;
    const display = view.getComputedStyle(e).display;
    if (display === "none" && !hiddenByEdit(e)) continue;
    endRun();
    if (display === "contents") children.push(...drawnChildren(e, view));
    else children.push(e);
  }
  endRun();
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
        if (NOT_DRAWN.has(e.localName) || e.hasAttribute(DELETED_ATTR)) continue;
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
      if (child.text) return false; // Text runs on in a line.
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

function textName(content: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > MAX_NAME ? `${text.slice(0, MAX_NAME - 1)}…` : text;
}
