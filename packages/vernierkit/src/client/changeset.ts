/**
 * The ChangeSet: every change the designer made this round, in design
 * language, for the Agent to apply. Adjusting one property of one layer again
 * and again stays a single change, from the first value to the latest.
 */
import { breakpointKey, type Breakpoint } from "./breakpoints";
import type { SavedOffCanvasLayer, Variable } from "../service-protocol";
import type { Align, Padding } from "./property-table";
import type { StyleSource } from "./style-source";
import type { UsageLevel } from "./usage-chain";

/** The layer a change is made to, as the Agent finds it in the source. */
export interface Target {
  /** `file:line:column` of the JSX that wrote the layer. Null: not located. */
  loc: string | null;
  /** Usage chain, innermost component first. */
  chain: UsageLevel[];
  component: string | null;
  /** How many instances of the usage the change shows up in; for a change to the component itself, how many elements it writes there on the canvas, in every usage. */
  instances: number;
  locked: boolean;
  unlocated: boolean;
  /** The layer is new this round, or in a new one: the id of the layer made, whose change says what it is. */
  made?: string;
  /** Text with no element of its own: which run of text in the element at `loc` it is, from 0. */
  run?: number;
  /** The only text of a Frame, as a button's words are: it has no element of its own, and its styles are written on the Frame's, at `loc`, which its words inherit. */
  onlyText?: true;
  /** Where the layer is on the page, for the Agent to find it by when its source is not known. */
  context: {
    /** Layer names from the page down to the layer itself. */
    path: string[];
    /** The layer's element as an opening tag, with its id and classes. */
    element: string;
    /** Its words, when it has any, as the page had them: to tell it apart from its siblings when its markers have moved. */
    text?: string;
    /** The address of the page the canvas was frozen from, its path and query. */
    page?: string;
  };
}

/** A part of a change's breakpoint, between two of the project's breakpoints, and what the page showed there before the change. */
export interface RangePart {
  breakpoint: Breakpoint;
  before: unknown;
}

/** Where a moved layer is: the container it is in, its place there, and its position when absolute. */
export interface Place {
  /** The container: its id on the canvas, how the Agent finds it in the source, and whether it is a Grid, whose places are its cells. */
  container: { layer: string; target: Target; grid?: true };
  /** Its place among the container's layers, from 1. */
  nth: number;
  /** Its place among the container element's child nodes on the canvas, to put it back by. */
  slot: number;
  /** Absolute: `left` and `top` in the container, in px. Null: in the container's layout. */
  absolute: { x: number; y: number } | null;
}

/** How a Stack lays its layers out, in design language. */
export interface StackSettings {
  direction: "horizontal" | "vertical";
  gap: number;
  padding: Padding;
  align: Align;
}

/** A layer a change to the structure takes in: its id on the canvas, and how the Agent finds it in the source. */
export interface Member {
  layer: string;
  target: Target;
}

/** A Stack made of layers (the `after` of a `stack` change): how it lays them out, and which. */
export interface Composed extends StackSettings {
  /** Where the new Stack is. Null: the Frame the change is made to became the Stack. */
  place: Place | null;
  /**
   * The layers in it, in order, each with where it was. `unmargined`: it had
   * margins, which the Stack takes over: the room between the layers is its
   * gap, the room around them its own margin.
   */
  layers: (Member & { from: Place; unmargined?: true })[];
}

/** A Stack dissolved (the `after` of an `unstack` change): a Frame of its size, its layers absolute in it. */
export interface Dissolved {
  /** The Frame's size, in px. */
  width: number;
  height: number;
  /**
   * Its layers, each where it was: `x` and `y` in px from the Frame's top
   * left, its size, the CSS that places it so, and its margins, which it
   * keeps (`Change.margins`): it is drawn past `x` and `y` by them. None in
   * a round saved before the canvas recorded them.
   */
  layers: (Member & { x: number; y: number; width: number; height: number; style: Record<string, string>; margins?: Margins })[];
}

/** A layer's left and top margins, in px. */
export interface Margins {
  x: number;
  y: number;
}

/** A layer the designer made (the `after` of a `create` change): new text or a new Frame, and where it goes. */
export interface Created {
  type: "text" | "frame";
  place: Place;
  /** Its size in px, as drawn. Null: it fits its content (text not drawn wider than its words). */
  width: number | null;
  height: number | null;
  /** New text: its words. */
  text?: string;
  /** A new Frame: its brief, what the Agent is to make in it. */
  brief?: string;
}

/** An inline fragment of a text layer (a bold run, a link): its element as an opening tag, its words, and its own value of a property, in design language. */
export interface Fragment {
  element: string;
  text: string;
  value: unknown;
}

/** A Variable a part of a change's value is. `picked`: the designer chose it, rather than typed its value. */
export type Bound = Variable & { picked?: true };

/**
 * Which Variable each part of a style change's value is, by part: "" the
 * whole value, else a side ("top"), a corner ("top-left"), "color", a gradient
 * stop ("stop 1"). Null: no Variable has that value.
 */
export type Bindings = Record<string, Bound | null>;

/** The Variables the designer chose, by part of the value; null: detached from the one it had. */
export type Picked = Record<string, Variable | null>;
/**
 * A layer off the canvas put back onto it (the `after` of a `putBack`
 * change, ADR 0009): where it goes, and the layer as it was kept off the
 * canvas: how it looks, where it came from with its source as written then,
 * and what was edited there. The Agent puts it back by its source, which may
 * be gone from the code by now.
 */
export interface PutBack {
  place: Place;
  layer: SavedOffCanvasLayer;
}

/** A value a layer has at a breakpoint of its own, as a copy of it takes it over. */
export interface CopiedBreakpoint {
  /** The change that gave the layer it, by its id. */
  change: number;
  /** The layer it is on: null, the layer copied itself; else a layer in it, by its name and its element as an opening tag. */
  inside: { name: string; element: string } | null;
  breakpoint: Breakpoint;
  property: string;
  /** Its value there when copied. */
  value: unknown;
  /** The change made the layer a real Stack there, as its own change does (`Change.asStack`). */
  asStack?: true;
}

export interface Change {
  id: number;
  /**
   * `style`: a property of the layer changes. `move`: the layer goes to
   * another place; `before` and `after` are `Place`s. `stack`: layers are made
   * a Stack, the layer; `after` is `Composed`. `unstack`: the Stack, the
   * layer, is dissolved; `before` is its `StackSettings`, `after` is `Dissolved`.
   * `create`: the layer is new; `after` is `Created`. `text`: the layer's
   * words change; `before` and `after` are strings. `delete`: the layer goes;
   * `before` is its `Place`. `duplicate`: the layer is a copy of the layer
   * `target` is; `before` is where that one is, `after` where the copy goes.
   * `putBack`: a layer off the canvas comes back onto it, new there; `after` is `PutBack`.
   * `brief`: the designer's words on what to achieve in the layer, which the
   * Design panel cannot set; `before` is null, or, on a copy of a new Frame,
   * the brief it was copied with; `after` is the brief, "" taken off. It holds
   * at every width (a new Frame's brief is in its `create` change instead).
   */
  kind: "style" | "move" | "stack" | "unstack" | "create" | "text" | "delete" | "duplicate" | "putBack" | "brief";
  /** Id of the layer on the canvas (`data-vk-layer`). */
  layer: string;
  target: Target;
  /**
   * `usage`: this usage of the component only. `component`: the component
   * itself, every usage of it: the designer promoted the change from one
   * usage. Its `layer` is then `componentKey(target.loc)`, not a layer of the
   * canvas: the change shows on every element the component writes there.
   */
  scope: "usage" | "component";
  /**
   * A style change made in a view other than the desktop view: it applies at
   * that view's breakpoint only, the width range it stands for (ADR 0008).
   * None: at every width, unless a breakpoint changes the property on its own.
   */
  breakpoint?: Breakpoint;
  /**
   * A style change at a breakpoint the project's own breakpoints cut into
   * parts (ticket 65): each part, and the value the live page showed there,
   * the code as it was, once the change was made. Null: the page has yet to
   * be read, and `claim` waits for it. None: the range is one part, or the
   * page could not be looked at.
   */
  parts?: RangePart[] | null;
  property: string;
  before: unknown;
  after: unknown;
  /** Reference style: the CSS that shows `after` on the canvas. */
  style: Record<string, string>;
  /** What set the value before the change, in the page's styles. */
  sources: StyleSource[];
  /**
   * The layer is a plain top-to-bottom flow, shown as a vertical Stack: the
   * change (to its gap, alignment, direction or wrap) makes it a real Stack.
   */
  asStack?: true;
  /**
   * A copy's: what the layer it copies, and the layers in it, had at
   * breakpoints of their own when copied, which the copy keeps (ADR 0008).
   * None: nothing of its own at any breakpoint.
   */
  copiedBreakpoints?: CopiedBreakpoint[];
  /** A copy of a new Frame with a brief: the brief, which the copy is made by too. */
  brief?: string;
  /**
   * A deletion that moved the layer off the canvas (ADR 0009): the id of the
   * layer it is there now, which keeps how it looked and its source, to be put back by.
   */
  offCanvas?: string;
  /** A change to one of the instances a loop renders alone (a move, new words, a copy, deleting it): in the code, the data the loop goes through changes. */
  data?: true;
  /** Of a change to one of a loop's instances alone (`data`): which of them it is, from 1, as the page renders them, those deleted on the canvas too, and its words (ticket 65). */
  instance?: { nth: number; words?: string };
  /** A move of text with no element of its own: the canvas wrapped it in a `<span>`, and so must the code. */
  wrap?: true;
  /** An absolute placement in a container the page does not position: the container becomes its positioning reference. */
  reference?: true;
  /** A change to a text layer, made on it as a whole: its inline fragments with a value of their own, which they keep. The others follow the layer. */
  keeps?: Fragment[];
  /** A style change whose value is, or could be, Variables: which part is which, exactly. */
  variables?: Bindings;
  /**
   * A layer placed freely at a breakpoint (an `absolute` style change), in a
   * container the page does not position at those widths: the container's id.
   * It is the layer's positioning reference there, as the change is (ADR 0008).
   */
  within?: string;
  /**
   * A layer placed by its X and Y (an `x`, `y` or `absolute` style change, or
   * a move absolute): its left and top margins on the canvas, in the view
   * the change is made in. Its X and Y are its `left` and `top`, and it keeps
   * its margins: the canvas draws it past its X and Y by them, and so must the page.
   */
  margins?: Margins;
  /**
   * A reorder: the layers of the container in their order now, by what they
   * look like (`signs`: tag and words, which survive the Agent moving the
   * JSX); what the check measures the live page by. `self`: which of them the
   * change moves; `others`: those other reorders move, which this one's check
   * leaves out. Null: the page cannot tell their order, as text runs on among the layers.
   */
  order?: { signs: string[]; self: number; others: number[] } | null;
}

/**
 * The property a move is recorded under: one move per layer, from where it
 * was to where it is. An instance a loop renders moves alone, under a property
 * of its own (`move 2`).
 */
export const MOVE = "move";

export interface ChangeSet {
  /**
   * Records `property` of the layer with id `layerId` going from `before` to
   * `after`, at every width or at `breakpoint`. A property changed before (at
   * the same breakpoint) keeps its first `before`; one that ends up where it
   * started is no longer a change.
   */
  record(
    layerId: string,
    change: Pick<
      Change,
      "target" | "scope" | "breakpoint" | "property" | "before" | "after" | "style" | "sources" | "asStack" | "data" | "wrap" | "reference" | "within" | "order" | "copiedBreakpoints" | "brief" | "offCanvas" | "keeps" | "variables" | "margins" | "instance"
    > & {
      kind?: Change["kind"];
    },
  ): void;
  /** Takes change `id` out: the designer no longer wants it. */
  remove(id: number): void;
  /** Puts `change` in as it is, its id and all, in its place among the others by id: over the one it was, or back where it was. */
  restore(change: Change): void;
  /** Whether `property` of the layer with id `layerId` is changed already: at every width, or at `breakpoint` on its own. */
  has(layerId: string, property: string, breakpoint?: Breakpoint | null): boolean;
  /** The change to `property` of the layer with id `layerId`, at every width or at `breakpoint`; null when there is none. */
  find(layerId: string, property: string, breakpoint?: Breakpoint | null): Change | null;
  /** The changes, oldest first. */
  list(): Change[];
  /** The ChangeSet as plain data, to save with the canvas. */
  save(): SavedChangeSet;
}

/** A ChangeSet as saved in `.vernier/changeset.json`. */
export interface SavedChangeSet {
  /** The last id handed out, so a restored ChangeSet never hands it out again. */
  lastId: number;
  changes: Change[];
}

/** A new ChangeSet, or the one `saved` was saved from. */
export function createChangeSet(saved?: SavedChangeSet): ChangeSet {
  const changes = new Map<string, Change>(saved?.changes.map((change) => [changeKey(change.layer, change.property, change.breakpoint), change]));
  let lastId = saved?.lastId ?? 0;
  return {
    record(layerId, change) {
      const key = changeKey(layerId, change.property, change.breakpoint);
      const earlier = changes.get(key);
      const before = earlier ? earlier.before : change.before;
      // Back where it started, or never left: nothing for the Agent to do.
      if (same(before, change.after)) changes.delete(key);
      else if (earlier) {
        Object.assign(earlier, { after: change.after, style: change.style }, change.order !== undefined && { order: change.order });
        // Which fragments keep their own value depends on the value now.
        if (change.keeps) earlier.keeps = change.keeps;
        else delete earlier.keeps;
        // So do the Variables it is.
        if (change.variables) earlier.variables = change.variables;
        else delete earlier.variables;
        // And where the canvas draws it, by the margins it has where it is now.
        if (change.margins) earlier.margins = change.margins;
        else delete earlier.margins;
      } else {
        const { breakpoint, ...rest } = change;
        changes.set(key, { id: ++lastId, kind: "style", layer: layerId, ...(breakpoint && { breakpoint: { ...breakpoint } }), ...rest });
      }
    },
    remove(id) {
      for (const [key, change] of changes) if (change.id === id) changes.delete(key);
    },
    restore(change) {
      for (const [key, other] of changes) if (other.id === change.id) changes.delete(key);
      const entries = [...changes, [changeKey(change.layer, change.property, change.breakpoint), change] as [string, Change]].sort(([, a], [, b]) => a.id - b.id);
      changes.clear();
      for (const [key, value] of entries) changes.set(key, value);
    },
    has: (layerId, property, breakpoint) => changes.has(changeKey(layerId, property, breakpoint)),
    find: (layerId, property, breakpoint) => changes.get(changeKey(layerId, property, breakpoint)) ?? null,
    list: () => [...changes.values()],
    save: () => structuredClone({ lastId, changes: [...changes.values()] }),
  };
}

/**
 * Change `id` and the changes that build on it, newest first: what taking it
 * back out takes along. A change builds on another when it changes the place
 * of a layer the other placed before it, or when it is made to, into or out
 * of a layer the other made.
 */
export function withDependents(list: Change[], id: number): Change[] {
  const taken = new Set<Change>();
  const take = (change: Change) => {
    if (taken.has(change)) return;
    taken.add(change);
    for (const other of list) if (buildsOn(other, change)) take(other);
  };
  const change = list.find((c) => c.id === id);
  if (change) take(change);
  return [...taken].sort((a, b) => b.id - a.id);
}

/** Whether `later` needs `earlier` to be there: it is made to, in or around what `earlier` made, or moves a layer `earlier` moved before it. */
function buildsOn(later: Change, earlier: Change): boolean {
  if (later === earlier) return false;
  const made = madeBy(earlier);
  if (made && (later.target.made === made || placed(later).includes(made) || placesOf(later).some((place) => place.container.layer === made))) return true;
  if (later.id < earlier.id) return false;
  // Put back once it was moved off this round: had it not been moved off, it could not come back.
  if (later.kind === "putBack" && movedOffBy([earlier], (later.after as PutBack).layer.id)) return true;
  // A layer deleted once its layers were moved out of it (ungrouped): bringing one back into it brings it back too.
  if (later.kind === "delete" && earlier.kind === "move" && (earlier.before as Place).container.layer === later.layer) return true;
  return placed(later).some((layer) => placed(earlier).includes(layer));
}

/** The deletion among `changes` that moved the layer off the canvas that is there now as `id` (ADR 0009), if one does. */
export function movedOffBy(changes: Change[], id: string): Change | null {
  return changes.find((change) => change.kind === "delete" && change.offCanvas === id) ?? null;
}

/** The change among `changes` that put back onto the canvas the layer off it with id `id` (ADR 0009), if one does. */
export function putBackOf(changes: Change[], id: string): Change | null {
  return changes.find((change) => change.kind === "putBack" && (change.after as PutBack).layer.id === id) ?? null;
}

/** The layers off the canvas that `changes` put back onto it, as they were kept there. */
export function putBackBy(changes: Change[]): SavedOffCanvasLayer[] {
  return changes.filter((change) => change.kind === "putBack").map((change) => (change.after as PutBack).layer);
}

/** The property a brief on a layer is recorded under: one per layer. */
export const BRIEF = "brief";

/** A move to another place among the layers of the same container, in its layout. */
export function isReorder(change: Change): boolean {
  if (change.kind !== "move") return false;
  const [before, after] = [change.before, change.after] as Place[];
  return before.container.layer === after.container.layer && !before.absolute && !after.absolute;
}

/** The layer a change makes, if it makes one: a new Stack, new text or a Frame, a copy. */
export function madeBy(change: Change): string | null {
  if (change.kind === "create" || change.kind === "duplicate" || change.kind === "putBack") return change.layer;
  return change.kind === "stack" && (change.after as Composed).place ? change.layer : null;
}

/** Where a change puts a layer: a move's or a copy's new place, a new layer's, a new Stack's. */
export function placedAt(change: Change): Place | null {
  if (change.kind === "move" || change.kind === "duplicate") return change.after as Place;
  if (change.kind === "create" || change.kind === "stack" || change.kind === "putBack") return (change.after as Created | Composed | PutBack).place;
  return null;
}

/** The layers whose place or layout a change changes. One of a loop's instances changed alone is told apart from the others. */
function placed(change: Change): string[] {
  if (change.kind === "move" || change.kind === "delete") return [change.data ? `${change.layer} ${change.property}` : change.layer];
  if (change.kind === "stack" || change.kind === "unstack") return [change.layer, ...(change.after as Composed | Dissolved).layers.map((member) => member.layer)];
  return [];
}

/** The places a change takes layers from and to. */
function placesOf(change: Change): Place[] {
  if (change.kind === "move" || change.kind === "duplicate") return [change.before, change.after] as Place[];
  if (change.kind === "create" || change.kind === "putBack") return [(change.after as Created | PutBack).place];
  if (change.kind !== "stack") return [];
  const { place, layers } = change.after as Composed;
  return [...(place ? [place] : []), ...layers.map((member) => member.from)];
}

/** What tells changes apart: one per property of a layer, at every width and at each breakpoint. An edit of one is one undo step by it too. */
export function changeKey(layerId: string, property: string, breakpoint?: Breakpoint | null): string {
  return breakpoint ? `${layerId} ${property} ${breakpointKey(breakpoint)}` : `${layerId} ${property}`;
}

/** Values are plain data in design language. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
