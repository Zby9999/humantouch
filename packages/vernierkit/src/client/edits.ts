/**
 * Edit commands: changes in design language, made to the canvas at once and
 * recorded in the ChangeSet. An edit to a layer is an edit to its usage, so
 * it shows up in every instance of that usage, and in every view of the
 * canvas. Every edit can be undone.
 */
import type { OffCanvasOrigin, SavedOffCanvasLayer } from "../service-protocol";
import { createWorkingView, rangeOfEdit } from "./breakpoint-edits";
import { contains, outside, widestFirst, within, writtenWith, type Breakpoint, type ProjectBreakpoints } from "./breakpoints";
import { AS_STACK_ATTR, asShown, changesOn, declare, elementsOf, keepOriginal, LAYER_ID_ATTR, restoreStyle, WRAP_ATTR } from "./canvas-style";
import { changeKey, type Bindings, type Change, type ChangeSet, type Created, type Picked } from "./changeset";
import { targetOf } from "./layer-target";
import { boxOf, buildLayerTree, isOnlyText, textOnFrame, type Layer, type LayerTree } from "./layers";
import { colorReader } from "./paint";
import { cssOf, definitionOf, isTextProperty, ofText, readAsShown, same, stackOf, type Definition, type Property, type PropertyValues } from "./property-table";
import { createStructureEdits } from "./structure-edits";
import { sourcesOf } from "./style-source";
import { createHistory, createSteps, type History } from "./undo-steps";
import { pickedIn } from "./variables";
import type { View, Views } from "./views";

export { LAYER_ID_ATTR };

/** Where a layer is moved to: a place among a Stack's layers, or absolute, at `left` and `top` in px, in a Frame. */
export type Destination = { parent: Layer; index: number } | { parent: Layer; x: number; y: number };

export interface SetOptions {
  /** One more step of an adjustment under way (a drag on a number, a color being picked): undone with the steps before it. */
  continues?: boolean;
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
  /** Changes the layer, across the instances of its usage, at the breakpoint worked in, and records the change. It can be undone. */
  set<P extends Property>(layer: Layer, property: P, value: PropertyValues[P], options?: SetOptions): void;
  /** Makes the edits `edits` makes one step, undone and redone together: the same change to several layers. */
  batch(edits: () => void, options?: SetOptions): void;
  /** Which Variables the layer's value of `property` is, as changed this round and shown in the view worked in; undefined when unchanged or none. */
  variables(layer: Layer, property: Property): Bindings | undefined;
  /** Where the layer is in the view worked in, in its px; for a hidden layer, where it is when shown. */
  measure(layer: Layer): DOMRect;
  /** Takes back the latest edit not yet undone. Returns the layers it was made to; none when there is nothing to undo. */
  undo(): Layer[];
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
   * with the nudges before it. Returns the layers where they are now.
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

export interface EditorOptions {
  /** The history its edits go into: one of its own when none is given. */
  history?: History;
  /** Whether a change records what set the value before, in the page's styles: not where there are none (off the canvas). */
  sources?: boolean;
  /** Which Variables a change's value is: none are told when not given. */
  bind?: Binder;
}

/**
 * Edits the canvas `views` show, every view alike, recording each change in
 * `changes`. `project`: the project's own breakpoints, which the views' ranges
 * line up with; none, they follow the views' widths.
 */
export function createEditor(
  views: Views,
  changes: ChangeSet,
  project: ProjectBreakpoints | null = null,
  { history = createHistory(), sources: readSources = true, bind }: EditorOptions = {},
): Editor {
  /** What sets `properties` of `el` in the page's styles, where the editor reads them. */
  const sourcesFor = (el: Element, properties: string[]) => (readSources ? sourcesOf(el, properties) : []);
  const doc = views.canvas.document;
  let tree = buildLayerTree(doc);
  const colors = colorReader(doc);
  let lastId = 0;
  for (const el of doc.querySelectorAll(`[${LAYER_ID_ATTR}]`)) lastId = Math.max(lastId, Number(el.getAttribute(LAYER_ID_ATTR)) || 0);

  const idOf = (layer: Layer, instances: Layer[]) => {
    let id = layer.el.getAttribute(LAYER_ID_ATTR);
    if (!id) {
      id = String(++lastId);
      for (const instance of instances) instance.el.setAttribute(LAYER_ID_ATTR, id);
    }
    return id;
  };

  const layerById = (id: string) => find(tree.root, (layer) => !layer.text && layer.el.getAttribute(LAYER_ID_ATTR) === id);
  /**
   * Whether `change` is the layer's. Those recorded on its element are, but,
   * on any layer but text, those to text styles and words: a Frame drawn
   * around its text has those of its text there. Its text has them, before
   * and after it is given an element of its own to edit, besides those
   * recorded on that element.
   */
  const ofLayer = (layer: Layer, change: Change) => {
    const text = ofText(change);
    if (!layer.text && change.layer === layer.el.getAttribute(LAYER_ID_ATTR)) return layer.kind === "text" || !text;
    const frame = layer.kind === "text" && layer.parent?.framesText ? layer.parent : null;
    return !!frame && text && change.layer === frame.el.getAttribute(LAYER_ID_ATTR);
  };
  /** The layer's changes at a breakpoint that holds in the view worked in, to `property` or to any, in the order they were first made; none in the desktop view. */
  const changesHereOf = (layer: Layer, property?: string) => {
    const view = working.beside();
    if (!view) return [];
    return changes
      .list()
      .filter((change) => change.kind === "style" && change.breakpoint && contains(change.breakpoint, view.width) && (!property || change.property === property) && ofLayer(layer, change));
  };
  /** The elements of every instance of the layer with id `id`, as the layers are now; none when it is gone. */
  const instancesOf = (id: string) => {
    const layer = layerById(id);
    return layer ? tree.acrossInstances(layer).map((instance) => instance.el) : [];
  };

  /** The view the designer works in, and the breakpoint it stands for. */
  const working = createWorkingView(views, project);
  // Changes at breakpoints recorded with no word of the project's (before its breakpoints were read) are written as it writes them, where they can be.
  for (const change of changes.list()) if (change.breakpoint && !change.breakpoint.project) Object.assign(change.breakpoint, writtenWith(change.breakpoint, project));
  /** The style changes of the layer with id `id` at a breakpoint, to `property` or to any. */
  const changesAtBreakpoints = (id: string, property?: string) =>
    changes.list().filter((change) => change.kind === "style" && change.layer === id && change.breakpoint && (!property || change.property === property));
  /**
   * Cuts what of `change`, made at a breakpoint, is in `range` out of it:
   * the change stays, with its value, at what is left of its range outside
   * `range`, one range or two. `off` cuts it; `on` puts it back whole.
   */
  const cutting = (change: Change, range: Breakpoint) => {
    const { id: _, layer: id, ...record } = change;
    const names = cssOf(change.property as Property);
    const pieces = outside(change.breakpoint!, range).map((piece) => ({ ...piece, ...writtenWith(piece, project) }));
    /** What is left, as first recorded: put back as it was each time it is redone. */
    let left: Change[] | null = null;
    const off = () => {
      changes.remove(change.id);
      if (left) for (const piece of left) changes.restore(structuredClone(piece));
      else {
        for (const piece of pieces) changes.record(id, { ...record, breakpoint: piece });
        left = pieces.map((piece) => structuredClone(changes.find(id, change.property, piece)!));
      }
      const others = changesOn(id, changes.list());
      for (const el of instancesOf(id)) restoreStyle(el, names, others, change.breakpoint!);
      for (const breakpoint of [change.breakpoint!, ...pieces]) referenceAt(change.within, breakpoint);
    };
    const on = () => {
      for (const piece of left ?? []) changes.remove(piece.id);
      changes.restore(change);
      const others = changesOn(id, changes.list());
      for (const el of instancesOf(id)) for (const piece of pieces) restoreStyle(el, names, others, piece);
      for (const breakpoint of [...pieces, change.breakpoint!]) referenceAt(change.within, breakpoint);
    };
    return { off, on };
  };

  /**
   * An edit to `property` of the layer made in the view worked in. In the
   * desktop view, at every width. In another, at the breakpoint the layer has
   * the property changed at already, of its own, that holds there, whether
   * the view's own or one recorded before the views changed, when it is
   * within the view's range. One reaching past the view's range keeps its
   * value outside it only, and the edit takes the view's range; so does an
   * edit with no such change (every width for a view in the desktop view's
   * range), as far as no other range the property has of its own reaches
   * into it, so no two of them overlap.
   */
  const editHere = <P extends Property>(layer: Layer, property: P, value: PropertyValues[P], continues: boolean, picked?: Picked) => {
    const view = working.beside();
    const id = layer.el.getAttribute(LAYER_ID_ATTR);
    const range = working.breakpoint();
    if (!view || !id) return edit(layer, property, value, continues, range, undefined, picked);
    const { breakpoint, cut } = rangeOfEdit(changesAtBreakpoints(id, property), view.width, range, project);
    edit(layer, property, value, continues, breakpoint, undefined, picked, cut ? cutting(cut, range!) : undefined);
  };

  /** The edit itself, at every width or at `breakpoint`: on the canvas and in the ChangeSet. `picked`: Variables the designer chose for the value. */
  const apply = <P extends Property>(layer: Layer, property: P, value: PropertyValues[P], breakpoint: Breakpoint | null, picked?: Picked) => {
    const definition = definitionOf(property);
    // Read, and written, as laid out at the breakpoint, in the view that stands for it.
    const el = working.shownAt(breakpoint, layer.el);
    const before = readAsShown(el, property, colors);
    // A change keeps the source it started from: the cascade is walked once, not on each step of a drag.
    const known = layer.el.getAttribute(LAYER_ID_ATTR);
    const earlier = known ? changes.find(known, property, breakpoint) : null;
    const started = definition.reference ? earlier : null;
    // A layer made this round has no style of the page's to change.
    const sources = layer.made || earlier ? [] : sourcesFor(definition.setOn?.(el) ?? el, definition.setsOn?.(el) ?? definition.sets);
    const instances = tree.acrossInstances(layer);
    // A plain flow shown as a vertical Stack takes a Stack's property as a real Stack, laid out as it is now.
    const flowing = () => !asShown(el, () => stackOf(el).flex);
    // At a breakpoint, it is made a real Stack there too: an edit at every width that made it one may be taken back.
    const asStack = definition.stack && ((!!breakpoint && !!earlier?.asStack) || layer.el.hasAttribute(AS_STACK_ATTR) || flowing());
    const declarations = asShown(el, () => ({
      ...(asStack && { display: "flex", "flex-direction": stackOf(el).direction === "horizontal" ? "row" : "column" }),
      ...definition.write(value, el),
      // Placed freely at a breakpoint and placed anew there: as large as it was when first taken out of the layout.
      ...(property === "absolute" && value && earlier?.style.width && { width: earlier.style.width, height: earlier.style.height }),
    }));
    // Placed freely at a breakpoint, in a container not positioned there: the container becomes its positioning reference there.
    const within =
      property === "absolute" && breakpoint && layer.parent
        ? earlier
          ? earlier.within
          : getComputedStyle(working.shownAt(breakpoint, layer.parent.el)).position === "static"
            ? idOf(layer.parent, tree.acrossInstances(layer.parent))
            : undefined
        : undefined;
    for (const instance of instances) {
      if (asStack && !breakpoint) instance.el.setAttribute(AS_STACK_ATTR, "");
      declare(instance.el, declarations, breakpoint);
    }
    const id = idOf(layer, instances);
    const keeps = definition.keeps?.(el, colors);
    const variables = bind?.(property, value, picked, earlier?.variables);
    changes.record(id, {
      // A text style written on a Frame drawn around its text is its text's.
      target: targetOf(layer.framesText && isTextProperty(property) ? textOnFrame(layer) : layer, instances.length),
      scope: "usage",
      ...(breakpoint && { breakpoint }),
      property,
      before,
      after: value,
      style: definition.reference?.(declarations, started ? (started.before as PropertyValues[P]) : before, value) ?? declarations,
      sources,
      ...(asStack && { asStack: true }),
      ...(keeps?.length ? { keeps } : {}),
      ...(variables && { variables }),
      ...(within && { within }),
      // Loose text given an element of its own to be placed freely: the code wraps it too, unless a move of it says so already.
      ...(property === "absolute" && layer.el.hasAttribute(WRAP_ATTR) && !changes.list().some((change) => change.layer === id && change.wrap) && { wrap: true }),
    });
    // Back where it started: the page's own style again, the layer's other changes kept on.
    if (!changes.has(id, property, breakpoint)) {
      const others = changesOn(id, changes.list());
      for (const instance of instances) restoreStyle(instance.el, cssOf(property), others, breakpoint);
    }
    referenceAt(within, breakpoint);
    // A Stack now laid out the other way: the layers are built anew, so a drag into it reads the way it runs now.
    if (layer.kind === "stack" && stackOf(layer.el).direction !== layer.direction) tree = buildLayerTree(doc);
    return id;
  };

  /**
   * The container `within` a layer is placed freely in at `breakpoint` (ADR
   * 0008): its positioning reference there, while a change places a layer so;
   * else as it was. Nothing changes at any other width.
   */
  const referenceAt = (within: string | undefined, breakpoint: Breakpoint | null) => {
    if (!within || !breakpoint) return;
    const others = changesOn(within, changes.list());
    const held = others.some((change) => change.within === within && same(change.breakpoint, breakpoint));
    for (const el of elementsOf(doc, within)) {
      if (held) {
        keepOriginal(el);
        declare(el, { position: "relative" }, breakpoint);
      } else restoreStyle(el, ["position"], others, breakpoint);
    }
  };

  /** The layers a step was made to, as they are now. */
  const layersOf = (ids: string[]) => [...new Set(ids)].map(layerById).filter((layer) => layer !== null);
  /** This editor's steps, in the history it shares. */
  const steps = createSteps(history, () => views.sync(), layersOf);
  const { push, group } = steps;
  /** A step to `property` of the layer `id` is made to its only text, if it is a Frame of text alone. */
  const textsOf = (id: string, property: Property) => (isTextProperty(property) ? { texts: [id] } : {});

  /**
   * An edit that can be undone, at every width or at `breakpoint`. `from`: the
   * value it changes, when the canvas cannot tell (on a hidden layer, say).
   * `picked`: Variables chosen for the value, which make it an edit even when
   * the value stays as it is (detached). `cut`: a change at a breakpoint
   * reaching into `breakpoint`, cut back first to make way for it.
   */
  const edit = <P extends Property>(
    layer: Layer,
    property: P,
    value: PropertyValues[P],
    continues: boolean,
    breakpoint: Breakpoint | null,
    from?: PropertyValues[P],
    picked?: Picked,
    cut?: { off(): void; on(): void },
  ) => {
    const read = () => readAsShown(working.shownAt(breakpoint, layer.el), property, colors);
    let before = from === undefined ? read() : from;
    if (same(before, value) && !picked) return;
    if (cut) {
      cut.off();
      // What the range has once the change is cut back: what it inherits.
      before = read();
    }
    const known = layer.el.getAttribute(LAYER_ID_ATTR);
    const wasPicked = pickedIn((known ? changes.find(known, property, breakpoint) : null)?.variables);
    const id = apply(layer, property, value, breakpoint, picked);
    // A Variable picked for the value the layer has already, with nothing to change: no step.
    if (!cut && same(before, value) && !wasPicked && !changes.has(id, property, breakpoint)) return;
    const to = (v: PropertyValues[P], chosen: Picked | undefined) => () => {
      // A Frame's text, given an element of its own since or not, has its text styles of then on the Frame's element.
      const target = layerById(id);
      if (target) apply(target, property, v, breakpoint, chosen);
    };
    const [undo, redo] = [to(before, wasPicked), to(value, picked)];
    push(
      {
        layers: [id],
        key: changeKey(id, property, breakpoint),
        undo: cut
          ? () => {
              undo();
              cut.on();
            }
          : undo,
        redo: cut
          ? () => {
              cut.off();
              redo();
            }
          : redo,
        ...(cut && { first: cut.off }),
        ...textsOf(id, property),
      },
      continues,
    );
  };

  /**
   * Takes a change made at a breakpoint back out, as an edit that can be
   * undone: the layer inherits what it shows at every width there again, as
   * that is now, and undone, the change is back as it was.
   */
  const inheritStep = (change: Change) => {
    const { layer: id, property, breakpoint } = change;
    const off = () => {
      changes.remove(change.id);
      const others = changesOn(id, changes.list());
      for (const el of instancesOf(id)) restoreStyle(el, cssOf(property as Property), others, breakpoint!);
      referenceAt(change.within, breakpoint!);
    };
    const on = () => {
      changes.restore(change);
      for (const el of instancesOf(id)) declare(el, change.style, breakpoint!);
      referenceAt(change.within, breakpoint!);
    };
    off();
    push({ layers: [id], key: `${id} ${property} inherit`, undo: on, redo: off, ...textsOf(id, property as Property) }, false);
  };

  /** Takes what of a change made at a breakpoint is in `range` back out, as an edit that can be undone: outside `range`, it keeps its value. */
  const cutStep = (change: Change, range: Breakpoint) => {
    const { off, on } = cutting(change, range);
    off();
    push({ layers: [change.layer], key: `${change.layer} ${change.property} inherit`, undo: on, redo: off, ...textsOf(change.layer, change.property as Property) }, false);
  };

  /** The commands that change the structure of the canvas, built on the style edits. */
  const structure = createStructureEdits({
    doc,
    changes,
    colors,
    working,
    steps,
    tree: () => tree,
    rebuild: () => {
      tree = buildLayerTree(doc);
    },
    idOf,
    newId: () => String(++lastId),
    layerById,
    ofLayer,
    sourcesFor,
    editHere,
    edit,
    inheritStep,
    editor: () => editor,
  });

  const editor: Editor = {
    ...structure,
    at: working.at,
    breakpoint: working.breakpoint,
    breakpointAt: working.breakpointAt,
    changedHere: (layer, property) => editor.changesHere(layer).includes(property),
    // In the order they were first changed, each once.
    changesHere: (layer) => [...new Set(changesHereOf(layer).map((change) => change.property as Property))],
    inherit(layer, property) {
      // Two ranges of its own that both hold here, as recorded before the views changed, or recorded on two elements: all go, one step.
      // One reaching past the view's range goes in the range only, and keeps its value outside it.
      const range = working.breakpoint();
      editor.batch(() => {
        for (const change of changesHereOf(layer, property)) {
          if (within(change.breakpoint!, range)) inheritStep(change);
          else cutStep(change, range!);
        }
      });
    },
    tree: () => tree,
    can(layer, property, value) {
      const { kinds, applies, accepts }: Definition<PropertyValues[typeof property]> = definitionOf(property);
      // Text with no element of its own has no styles, but a Frame's only text: the text styles of the Frame's element.
      if ((layer.text && !(isOnlyText(layer) && isTextProperty(property))) || !kinds.includes(layer.kind)) return false;
      // A hidden layer offers what it does when shown, so the panel stays as it was.
      const el = working.shown(layer.el);
      return asShown(el, () => (!applies || applies(el, layer)) && (value === undefined || !accepts || accepts(el, value)));
    },
    read: (layer, property) => readAsShown(working.shown(layer.el), property, colors),
    measure(layer) {
      const el = layer.text ? layer.el : working.shown(layer.el);
      if (el === layer.el) return asShown(layer.el, () => boxOf(layer));
      return asShown(el, () => el.getBoundingClientRect());
    },
    variables(layer, property) {
      // As the view worked in shows it: the layer's own value at a breakpoint that holds there, the narrowest, else that at every width; on its own element before its Frame's.
      const own = (change: Change) => !layer.text && change.layer === layer.el.getAttribute(LAYER_ID_ATTR);
      const [here] = changesHereOf(layer, property).sort((a, b) => widestFirst(b.breakpoint!, a.breakpoint!) || Number(own(b)) - Number(own(a)));
      const everywhere = changes.list().filter((change) => change.kind === "style" && change.property === property && !change.breakpoint && ofLayer(layer, change));
      return (here ?? everywhere.find(own) ?? everywhere[0])?.variables;
    },
    set(layer, property, value, { continues = false, variables } = {}) {
      if (!editor.can(layer, property, value)) throw new Error(`Vernier Kit: ${property} cannot be set to ${JSON.stringify(value)} on a ${layer.kind} layer`);
      // Placed freely at the breakpoint worked in, its X and Y there are where it is placed: the one change.
      if ((property === "x" || property === "y") && editor.changedHere(layer, "absolute")) {
        const place = { ...editor.read(layer, "absolute")!, [property]: value };
        editHere(layer, "absolute", place, continues);
        return;
      }
      editHere(layer, property, value, continues, variables);
    },
    batch(edits, { continues = false } = {}) {
      group(edits, continues);
    },
    undo: steps.undo,
    redo: steps.redo,
    along(make, unmake, layers) {
      make();
      push({ layers: [], key: "along", undo: unmake, redo: make }, false, layers && (() => layers()));
    },
  };
  return editor;
}

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | null {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
  return null;
}
