/**
 * What the Editor is, as its callers see it: every edit command the designer
 * edits the canvas by, in design language, and what they take. Types alone:
 * `edits.ts` makes an Editor (`createEditor`), and `structure-edits.ts` makes
 * some of its commands. Callers take these types from here, and only
 * `createEditor` from `edits.ts`; the modules that make the commands build on
 * them without reaching back into `edits.ts`.
 */
import type { OffCanvasOrigin, SavedOffCanvasLayer } from "../service-protocol";
import type { Breakpoint } from "./breakpoints";
import type { Bindings, Change, Created, Picked } from "./changeset";
import type { Layer, LayerTree } from "./layers";
import type { Property, PropertyValues } from "./property-table";
import type { View } from "./views";

/** Where a layer is moved to: a place among a Stack's layers, or absolute, at `left` and `top` in px, in a Frame. */
export type Destination = { parent: Layer; index: number } | { parent: Layer; x: number; y: number };

/**
 * What a layer is resized to, as a handle has it (`Editor.resize`): Fixed
 * sizes in px, border and padding in, and, placed freely, its X and Y, or its
 * `right` and `bottom` for one placed from those edges (ticket 75); those not given stay as they are.
 */
export interface ResizeTo {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  right?: number;
  bottom?: number;
}

export interface SetOptions {
  /** One more step of an adjustment under way (a drag on a number, a color being picked): undone with the steps before it. */
  continues?: boolean;
  /**
   * One step of a run of them (a key held or pressed again and again, a drag
   * on a number or a gradient stop), rather than a value set once (typed,
   * toggled, chosen, picked): the views beside the one worked in show it once
   * the steps pause, not once the next frame is drawn (ADR 0011). In `batch`,
   * for each value set in it.
   */
  step?: boolean;
  /** The Variables the designer chose for the value, by part (see `Bindings`); null for a part: detached from its Variable. */
  variables?: Picked;
}

/**
 * Which Variables a property's value is, by part, given those the designer
 * picked now and those the change had before; undefined when no part can be one.
 */
export type Binder = (property: Property, value: unknown, picked: Picked | undefined, previous: Bindings | undefined) => Bindings | undefined;

export interface Editor {
  /**
   * Works in `view` from now on, the one the designer works in: values are read
   * as it shows them, and style and layout edits apply at its breakpoint only
   * (ADR 0008); in the desktop view (or null), at every width. Changes to the
   * structure apply in every view, wherever they are made.
   */
  at(view: View | null): void;
  /** The breakpoint of the view worked in; null in the desktop view: every width. */
  breakpoint(): Breakpoint | null;
  /** The breakpoint of a view `width` px wide, as the views are now; null: the desktop view's, every width. */
  breakpointAt(width: number): Breakpoint | null;
  /**
   * Whether `property` of the layer is changed on its own at a breakpoint
   * that holds in the view worked in: its own, or any other range of widths
   * its width is in, as one recorded before the views changed; never in the desktop view.
   */
  changedHere(layer: Layer, property: Property): boolean;
  /** The properties of the layer changed on their own at a breakpoint that holds in the view worked in, in the order they were first changed. */
  changesHere(layer: Layer): Property[];
  /**
   * Takes the value of `property` the layer has of its own at the
   * breakpoints that hold in the view worked in off it, as an edit that can
   * be undone: it inherits the value at every width there again. One
   * reaching past the view's range is taken off in that range only, and keeps its value outside it.
   */
  inherit(layer: Layer, property: Property): void;
  /** Whether `property` can be edited on the layer; with `value`, whether the layer can take that value. */
  can<P extends Property>(layer: Layer, property: P, value?: PropertyValues[P]): boolean;
  /** The layer's current value, as the view worked in shows it. */
  read<P extends Property>(layer: Layer, property: P): PropertyValues[P];
  /**
   * Changes the layer, across the instances of its usage, at the breakpoint
   * worked in, and records the change. It can be undone. Its width or height
   * changed, a layer placed freely keeps its left and top edges where they
   * are, as in Figma: one placed from its container's right or bottom edge
   * has its `right` or `bottom` changed with it, one step; one centered on
   * where it is placed stays centered (ticket 75).
   */
  set<P extends Property>(layer: Layer, property: P, value: PropertyValues[P], options?: SetOptions): void;
  /** Makes the edits `edits` makes one step, undone and redone together: the same change to several layers. */
  batch(edits: () => void, options?: SetOptions): void;
  /** Which Variables the layer's value of `property` is, as changed this round and shown in the view worked in; undefined when unchanged or none. */
  variables(layer: Layer, property: Property): Bindings | undefined;
  /** Where the layer is in the view worked in, in its px; for a hidden layer, where it is when shown. */
  measure(layer: Layer): DOMRect;
  /**
   * Resizes the layer, as a handle dragged on the canvas does: `width` and
   * `height`, those given, become Fixed at that size (outer, border and
   * padding in), whether they were Hug or Fill; nothing else changes. A
   * layer placed freely in the view worked in goes to `x` and `y`, or `right`
   * and `bottom`, those given, in its container, so the edges not dragged stay
   * where they are.
   * At the breakpoint worked in, as `set` does. `continues`: one more step of
   * the resize under way, one step with those before it, though it sets more
   * or less than they did. A step that changes nothing (the layer already that
   * size) makes none: the next that does is the resize's first, apart from any
   * resize before it. Each is a step of a run: the views beside the one
   * worked in show it once the steps pause (ADR 0011).
   */
  resize(layer: Layer, to: ResizeTo, options?: Pick<SetOptions, "continues">): void;
  /** Takes back the latest edit not yet undone. Returns the layers it was made to; none when there is nothing to undo. */
  undo(): Layer[];
  /**
   * Takes back what the adjustment under way (begun by the latest edit that
   * did not continue one) has changed, as if it was never made, as Esc cancels
   * a resize under way: there is nothing to redo of it. Nothing, when it has
   * changed nothing: the edits before it stay.
   */
  takeBack(): void;
  /** Makes again the latest edit undone. Returns the layers it was made to; none when there is nothing to redo. */
  redo(): Layer[];
  /** Takes change `id` back out of the ChangeSet, its layer back to where it started, as an edit that can be undone. */
  revert(id: number): Layer | null;
  /** The canvas's layers as they are now: a move builds them anew. */
  tree(): LayerTree;
  /** Whether the layer can be moved at all. The page cannot. */
  canMove(layer: Layer): boolean;
  /**
   * Whether the layer can go into `container`: a Stack, a Grid or a Frame, outside
   * the layer itself, that repeats with the layer's own container (each
   * instance of the layer has a container to go to).
   */
  canDrop(layer: Layer, container: Layer): boolean;
  /**
   * Moves the layer, across the instances of its container, and records the
   * move: one per layer, from where it was to where it is. Loose text first
   * gets an element of its own. Placed freely in its own container beside the
   * desktop view, it is placed so at that view's breakpoint only (ADR 0008);
   * moved into another container, it loses such placements. Returns the layer where it is now.
   */
  move(layer: Layer, to: Destination): Layer;
  /**
   * Nudges the layers `dx` and `dy` px, as the arrow keys do. A layer placed
   * freely in the view worked in moves that far, as dragging it there would
   * place it (at its breakpoint, beside the desktop view); a layer in a
   * Frame's flow is placed freely where it is, and moved on from there (beside
   * the desktop view, at its breakpoint only: the `absolute` property). A
   * layer in a Stack's layout swaps places with the next one along the Stack
   * that way, in every view, and stays at its end or nudged across it; layers
   * side by side move together. One in a Grid goes a cell along it (← →),
   * or a row (↑ ↓: as many cells as the Grid has columns in the view worked
   * in), the layers between moving a cell along, as dragging it there does,
   * in every view; it stays at the Grid's ends, and in a Grid that places its
   * layers itself (`placesItself`). `continues`: one more nudge of a run, undone
   * with the nudges before it. Each nudge is one step of a run (`step`), as the
   * arrow keys make them. Returns the layers where they are now.
   */
  nudge(layers: Layer[], dx: number, dy: number, options?: SetOptions): Layer[];
  /**
   * Whether the layers can be made a Stack: layers side by side in one
   * container, each in every instance of it; or a Frame alone, of its layers.
   */
  canStack(layers: Layer[]): boolean;
  /**
   * Makes the layers a Stack that holds them where they are (⇧A): a new one
   * around them, or the Frame selected alone. Returns the Stack.
   */
  stack(layers: Layer[]): Layer;
  /** Whether the layer is a Stack that can be dissolved: its layers are elements, each in every instance of it. */
  canUnstack(layer: Layer): boolean;
  /** Dissolves the Stack: it becomes a Frame of its size, its layers absolute where they are. Returns the Frame. */
  unstack(layer: Layer): Layer;
  /**
   * Whether the layer can be ungrouped: a Stack or a Frame, not the page nor
   * a component's own, whose layers are elements that can all go into its container.
   */
  canUngroup(layer: Layer): boolean;
  /**
   * Takes the Stack or Frame away, its layers left where they are (⌘⇧G): in
   * its container's layout, in its place and in order, or absolute where they
   * are. A Stack made this round is taken back instead. Returns its layers.
   */
  ungroup(layer: Layer): Layer[];
  /** Whether new layers can go in the layer: a Stack, a Grid or a Frame that holds layers. */
  canHold(layer: Layer): boolean;
  /**
   * Makes new text (in the page's body text style) or a new Frame (with no
   * fill) at `to`, in each instance of its container. `size`: as drawn, in px;
   * without it, text fits its words and a Frame is 100 × 100. Returns the new layer, in the container `to` names.
   */
  create(type: Created["type"], to: Destination, size?: { width: number; height: number }): Layer;
  /**
   * The layer's brief: what the designer wants achieved in it, which the
   * Design panel cannot set; for a new Frame, what the Agent is to make in it. "" when it has none.
   */
  brief(layer: Layer): string;
  /** Whether the layer is a new Frame, whose brief says what to make in it: it is written beside it on the canvas, and kept in the change that makes it. */
  isNewFrame(layer: Layer): boolean;
  /**
   * Gives the layer a brief, or takes it off (""), as one edit that can be
   * undone: a new Frame's in the change that makes it; any other layer's as
   * a change of its own, for its usage (every instance), at every width.
   * Loose text gets an element of its own first. Returns the layer the brief is on.
   */
  setBrief(layer: Layer, brief: string): Layer;
  /** The layer as text with an element of its own, to type in: loose text gets one first. */
  ownElement(layer: Layer): Layer;
  /** The layer whose element the words of a text layer are typed in: a Frame's only text's are the Frame's, which it shares; other loose text gets an element of its own first. */
  typedIn(layer: Layer): Layer;
  /**
   * Changes the words of a text layer, in every instance; one of the
   * instances a loop renders with words of its own changes alone, as data.
   */
  setText(layer: Layer, text: string): void;
  /** Whether the layer can be deleted. The page cannot. */
  canRemove(layer: Layer): boolean;
  /**
   * Deletes the layer, in every instance; one of the instances a loop renders
   * goes alone, as data. A layer made this round is taken back instead.
   * `offCanvas`: it is moved off the canvas (ADR 0009), and is there now as
   * the layer with this id; the deletion says so.
   */
  remove(layer: Layer, options?: { offCanvas?: string }): void;
  /**
   * How the Agent finds the layer in the source, where it is, and the JSX that
   * writes it (an instance's: its usage; none for a layer made this round):
   * the origin a layer moved off the canvas keeps, all but when it was moved
   * out. A layer put back from off the canvas new is where it came from still, its source as written then with it.
   */
  originOf(layer: Layer): Omit<OffCanvasOrigin, "at">;
  /**
   * Makes `make`, a change to something besides the canvas (a layer off it),
   * one step with the edits, undone by `unmake`: taken back and made again
   * in their order. `layers`: what undoing or redoing it leaves to select.
   */
  along(make: () => void, unmake: () => void, layers?: () => Layer[]): void;
  /** Whether the layer can be copied: not the page, not text with no element of its own. */
  canDuplicate(layer: Layer): boolean;
  /**
   * Copies the layer, in every instance: right after it, or at `to` (as a move
   * goes, among the other layers). One of the instances a loop renders is
   * copied alone, as data. Returns the copy.
   */
  duplicate(layer: Layer, to?: Destination): Layer;
  /**
   * Puts a layer off the canvas back onto it, at `to` (ADR 0009), as a move
   * goes, in every view; returns it there. Moved off this round and not
   * edited off the canvas since, it is the layer that was deleted, back: put
   * back where it was, neither change is left; elsewhere, it moves there.
   * Otherwise it is new on the canvas, looking as it does off it, and the
   * change puts it in with where it came from, its source as written then,
   * its look and its edits there, for the Agent to put it back by.
   */
  putBack(from: LayerToPutBack, to: Destination): Layer;
  /**
   * Whether the layer has changes for its usage alone that can be promoted
   * to its component: it is in a component used inside another, and has
   * changes to its styles or its brief not promoted yet.
   */
  canPromote(layer: Layer): boolean;
  /**
   * Promotes the layer's changes to its styles (at every width and at each
   * breakpoint) and its brief to the component that writes it, the nearest
   * on its usage chain, as one edit that can be undone: they become changes
   * to the component itself, which every usage of it shows, in every view.
   * Its other changes stay with its usage; edited again, it starts from its usage again.
   * Returns the changes promoted, as they were, and those that stay with its usage.
   */
  promote(layer: Layer): { promoted: Change[]; stays: Change[] };
}

/** An Off-canvas Layer being put back onto the canvas: its element off the canvas, as it looks now, and it as kept. */
export interface LayerToPutBack {
  el: Element;
  kept: SavedOffCanvasLayer;
}
