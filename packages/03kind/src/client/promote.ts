/**
 * Promote: a layer's changes for its usage alone made changes to its
 * component itself, the nearest one on its usage chain, so every usage of
 * the component shows them. Its style changes (at every width and at each
 * breakpoint, which they keep) and its brief go; changes to the structure and
 * to data stay with the usage. On the canvas, a component's changes are in
 * the rules of every element it writes, in every usage, under the edits of
 * each usage, which win over them; edited again, the layer starts from its
 * usage again. Works on the canvas being edited and on a saved one alike.
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import { BRIEF_ATTR, declarePromoted, LAYER_ID_ATTR, WRAP_ATTR } from "./canvas-style";
import type { Breakpoint } from "./breakpoints";
import { BRIEF, type Change, type ChangeSet } from "./changeset";
import { chainOf, isOnlyText, originOf, type Layer } from "./layers";

/** What a change to the component itself, that writes the elements at `loc`, is recorded under, in place of a layer's id. */
export function componentKey(loc: string): string {
  return `component ${loc}`;
}

/**
 * Whether the layer is in a component its changes can be promoted to: one
 * used inside another component (else the layer is changed where it is
 * written already), that writes the layer in its own source. Not a locked
 * layer, a layer made this round, text beside other layers, nor text given an
 * element of its own, which only the canvas has; a Frame's only text is, as
 * it is written in the Frame's own element.
 */
export function inComponent(layer: Layer): boolean {
  return !!layer.loc && (!layer.text || isOnlyText(layer)) && !layer.made && layer.kind !== "locked" && layer.chain.length > 1 && !layer.el.hasAttribute(WRAP_ATTR);
}

/**
 * Of the changes, those to the layer with id `id` for its usage that can be
 * promoted: its styles and its brief. Not a placement free at a breakpoint
 * in its container, which the container of this usage takes part in.
 */
export function promotable(changes: Change[], id: string): Change[] {
  return changes.filter((change) => change.layer === id && change.scope === "usage" && ((change.kind === "style" && !change.within && !change.wrap) || change.kind === "brief"));
}

/**
 * `changes` with the changes `taken` (of one layer, for its usage) made
 * changes to the component that writes it at `loc`: each one the component's
 * one change to that property at that breakpoint, from where the first
 * promoted to it started; one back where it started is no change. Returns the
 * component's changes as they are then. `instances`: how many elements the component writes there.
 */
export function promoteIn(changes: ChangeSet, taken: Change[], loc: string, instances: number): Change[] {
  const key = componentKey(loc);
  for (const change of taken) {
    changes.remove(change.id);
    const { id, layer: _, breakpoint, ...rest } = structuredClone(change);
    const target = { ...rest.target, instances };
    if (changes.find(key, change.property, breakpoint)) changes.record(key, { ...rest, target, ...(breakpoint && { breakpoint }), scope: "component" });
    // A brief a usage wrote in place of another is the component's from none: the component had none of its own.
    else changes.restore({ ...structuredClone(change), layer: key, target, scope: "component", ...(change.kind === "brief" && { before: null }) });
  }
  return changes.list().filter((change) => change.layer === key);
}

/** The canvas elements the component writes at `loc`, in every usage, in page order. */
export function componentElements(doc: Document, loc: string): Element[] {
  const candidates = doc.querySelectorAll(`[${LOC_ATTR}="${CSS.escape(loc)}"], [${USAGE_ATTR}]:not([${LOC_ATTR}])`);
  return [...candidates].filter((el) => !el.hasAttribute(WRAP_ATTR) && originOf(el, chainOf(el)).loc === loc);
}

/** The brief the component that writes `el` has, as changed itself this round; "" when none. */
export function componentBrief(el: Element, changes: Change[]): string {
  const { loc } = originOf(el, chainOf(el));
  return loc ? briefAt(loc, changes) : "";
}

/** The brief of the component that writes the elements at `loc`, as changed itself this round; "" when none. */
function briefAt(loc: string, changes: Change[]): string {
  const key = componentKey(loc);
  return (changes.find((change) => change.layer === key && change.property === BRIEF)?.after as string | undefined) ?? "";
}

/**
 * Shows on the canvas the changes to the component that writes the elements
 * at `loc`, as `changes` has them: their styles in the rules of each, under
 * the edits of its usage; its brief on each whose usage has none of its own.
 */
export function showComponent(doc: Document, loc: string, changes: Change[]) {
  const key = componentKey(loc);
  const styles = changes.filter((change) => change.layer === key && change.kind === "style");
  const brief = briefAt(loc, changes);
  const els = componentElements(doc, loc);
  declarePromoted(els, styles);
  for (const el of els) {
    const id = el.getAttribute(LAYER_ID_ATTR);
    const own = id ? changes.find((change) => change.layer === id && change.property === BRIEF) : undefined;
    const text = own ? (own.after as string) : brief;
    if (text) el.setAttribute(BRIEF_ATTR, text);
    else el.removeAttribute(BRIEF_ATTR);
  }
}
