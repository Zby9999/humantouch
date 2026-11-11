/**
 * How the Agent finds a layer in the source: the Target a change records,
 * from the layer's markers, where it is in the layer tree, and what of its
 * element and words the source can be searched for.
 */
import { ORIGINAL_TEXT_ATTR, WRAP_ATTR } from "./canvas-style";
import type { Change, Target } from "./changeset";
import { PAGE_ATTR } from "./freezer";
import { isOnlyText, SIGN_WORDS, wordsAsPage, type Layer } from "./layers";

/** The layer as the Agent finds it in the source, in `instances` instances of its usage. */
export function targetOf(layer: Layer, instances: number): Target {
  const { loc, chain, component } = layer;
  const path: string[] = [];
  for (let l: Layer | null = layer; l; l = l.parent) path.unshift(l.name);
  // Text given an element of its own is written in its container.
  const written = layer.el.hasAttribute(WRAP_ATTR) && layer.el.parentElement ? layer.el.parentElement : layer.el;
  // Its words, to tell it apart once its markers move: text has them, containers do not count theirs, but a Frame of text alone, as a button is.
  const words = layer.kind === "text" ? (layer.text ? layer.name : wordsAsPage(layer.el)) : layer.framesText ? wordsAsPage(layer.el) : "";
  const page = layer.el.ownerDocument.documentElement.getAttribute(PAGE_ATTR);
  const context = { path, element: openingTag(written), ...(words && { text: words.slice(0, SIGN_WORDS) }), ...(page && { page }) };
  // Text with no element of its own is found by which run of text of its container it is; a Frame's only text, by the Frame's element.
  const wrapped = written !== layer.el ? Number(layer.el.getAttribute(WRAP_ATTR)) : null;
  const run = layer.text && !isOnlyText(layer) ? layer.parent!.children.filter((child) => child.text).indexOf(layer) : layer.text ? null : wrapped;
  // A layer made this round is not in the source yet: the change that made it says where it goes.
  return {
    loc,
    chain,
    component,
    instances,
    locked: layer.kind === "locked",
    unlocated: !loc && !layer.made,
    ...(layer.made && { made: layer.made }),
    ...(run !== null && { run }),
    ...(layer.text && isOnlyText(layer) && { onlyText: true as const }),
    context,
  };
}

/**
 * Which of a loop's instances, `all` as the page renders them (those deleted
 * on the canvas too), `el` is, from 1, and its words, each piece of text apart,
 * as the page has them: for the Agent to find it in the data by (ticket 65).
 */
export function instanceOf(el: Element, all: Element[]): NonNullable<Change["instance"]> {
  const pieces: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) pieces.push((node as Text).data);
    else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute(ORIGINAL_TEXT_ATTR)) pieces.push(wordsAsPage(node as Element));
    else for (const child of node.childNodes) walk(child);
  };
  walk(el);
  const words = pieces.join(" ").replace(/\s+/g, " ").trim().slice(0, SIGN_WORDS);
  return { nth: all.indexOf(el) + 1, ...(words && { words }) };
}

const MAX_CLASSES = 200;

/** `<div id="root" class="…">`: what of the element the Agent can search the source for. */
export function openingTag(el: Element): string {
  let tag = `<${el.localName}`;
  if (el.id) tag += ` id="${el.id}"`;
  const classes = el.getAttribute("class")?.trim();
  if (classes) tag += ` class="${classes.length > MAX_CLASSES ? `${classes.slice(0, MAX_CLASSES - 1)}…` : classes}"`;
  return `${tag}>`;
}
