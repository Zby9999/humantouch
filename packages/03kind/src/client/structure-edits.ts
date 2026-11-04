/**
 * Changes to the structure of the canvas, and the commands built on them:
 * moving and nudging layers, making and dissolving Stacks, ungrouping,
 * new layers, copies, deleting, new words and briefs, putting a layer off
 * the canvas back onto it (ADR 0009), taking changes back out of the
 * ChangeSet and promoting them to a component. Each is an edit that can be
 * undone, in every view at once: the structure is the same at every width (ADR 0008).
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import type { WorkingView } from "./breakpoint-edits";
import type { Breakpoint } from "./breakpoints";
import {
  AS_STACK_ATTR,
  BRIEF_ATTR,
  changesOn,
  DELETED_ATTR,
  elementsOf,
  LAYER_ID_ATTR,
  MADE_ATTR,
  MOVE_ATTR,
  NEW_ATTR,
  REFERENCE_ATTR,
  restoreStyle,
  TEXT_ATTR,
  WRAP_ATTR,
} from "./canvas-style";
import {
  BRIEF,
  createChangeSet,
  madeBy,
  MOVE,
  movedOffBy,
  withDependents,
  type Change,
  type ChangeSet,
  type Composed,
  type Created,
  type Dissolved,
  type Place,
  type PutBack,
  type StackSettings,
} from "./changeset";
import type { Destination, Editor } from "./edit-commands";
import { copiedBreakpointsOf, hide, insertCopies, insertNew, insertPutBack, removeMade, unhide, wordsOf, writeText } from "./layer-changes";
import { instanceOf, targetOf } from "./layer-target";
import { framedText, holdsLayers, isOnlyText, nodeOf, type Layer, type LayerTree } from "./layers";
import { relocate, slotsOf, syncOrders } from "./moves";
import type { ColorReader } from "./paint";
import { componentBrief, componentElements, componentKey, inComponent, promotable, promoteIn, showComponent } from "./promote";
import { absolute, absoluteAt, CONTAINERS, cssOf, definitionOf, ofText, placesItself, readAsShown, round, same, sizeOf, type Property, type PropertyValues } from "./property-table";
import { borderBox, compose, decompose, dissolve, inferStack, marginsAt, marginsOf, paddingBox, spotIn, stackStyle, undissolve } from "./stacks";
import { PIN_OFFSET_ATTR, pinOffsetOf, type StyleSource } from "./style-source";
import { heldCentered, placedAlong, roomIn, shiftIn, startOffsetOf } from "./placed-from";
import type { Steps } from "./undo-steps";
import { CHAIN_ATTR } from "./usage-chain";

/**
 * What the structure commands build on, inside the editor: the canvas and
 * the ChangeSet, its layers and their ids, its steps, and the style edits.
 */
export interface EditorCore {
  doc: Document;
  changes: ChangeSet;
  colors: ColorReader;
  working: WorkingView;
  steps: Steps;
  /** The canvas's layers as they are now. */
  tree(): LayerTree;
  /** Builds the layers anew, once the canvas has changed. */
  rebuild(): void;
  /** The layer's id: given to every one of `instances` first, if it has none. */
  idOf(layer: Layer, instances: Layer[]): string;
  /** An id for a layer new on the canvas. */
  newId(): string;
  /** The layer with id `id`, as the layers are now; null when it is gone. */
  layerById(id: string): Layer | null;
  /** Whether `change` is the layer's: a Frame drawn around its text has those to text styles and words of its text. */
  ofLayer(layer: Layer, change: Change): boolean;
  /** What sets `properties` of `el` in the page's styles, where the editor reads them. */
  sourcesFor(el: Element, properties: string[]): StyleSource[];
  /** An edit to `property` of the layer made in the view worked in, at the breakpoint it takes there. */
  editHere<P extends Property>(layer: Layer, property: P, value: PropertyValues[P], continues: boolean): void;
  /** An edit that can be undone, at every width or at `breakpoint`; `from`: the value it changes, when the canvas cannot tell. */
  edit<P extends Property>(layer: Layer, property: P, value: PropertyValues[P], continues: boolean, breakpoint: Breakpoint | null, from?: PropertyValues[P]): void;
  /** Takes a change made at a breakpoint back out, as an edit that can be undone. */
  inheritStep(change: Change): void;
  /** The whole editor: commands built on others call them through it. */
  editor(): Editor;
}

/** The editor's commands that change the structure of the canvas, or take changes back out. */
export type StructureEdits = Pick<
  Editor,
  | "canMove"
  | "canDrop"
  | "move"
  | "nudge"
  | "revert"
  | "canPromote"
  | "promote"
  | "canStack"
  | "stack"
  | "canUnstack"
  | "canUngroup"
  | "ungroup"
  | "canHold"
  | "create"
  | "brief"
  | "isNewFrame"
  | "setBrief"
  | "ownElement"
  | "typedIn"
  | "setText"
  | "canRemove"
  | "originOf"
  | "remove"
  | "canDuplicate"
  | "duplicate"
  | "putBack"
  | "unstack"
>;

/** The structure commands of the editor `core` is the inside of. */
export function createStructureEdits(core: EditorCore): StructureEdits {
  const { doc, changes, colors, working, tree, rebuild, idOf, newId, layerById, ofLayer, sourcesFor, editHere, edit, inheritStep, editor } = core;
  const { push, group, show } = core.steps;
  let lastMove = 0;
  for (const el of doc.querySelectorAll(`[${MOVE_ATTR}]`)) lastMove = Math.max(lastMove, Number(el.getAttribute(MOVE_ATTR)!.split(" ")[1]) || 0);
  /** Changes made to one of a loop's instances alone are numbered: `delete-2`, `text-3`. */
  let lastAlone = 0;
  for (const el of doc.querySelectorAll(`[${DELETED_ATTR}], [${TEXT_ATTR}]`)) {
    for (const attr of [DELETED_ATTR, TEXT_ATTR]) lastAlone = Math.max(lastAlone, Number(/-(\d+)$/.exec(el.getAttribute(attr) ?? "")?.[1]) || 0);
  }

  /** A container as a place names it: a Grid's places are its cells. */
  const containerOf = (container: Layer): Place["container"] => {
    const instances = tree().acrossInstances(container);
    // A Grid that places its layers itself has no cell to name by their order.
    const cells = container.kind === "grid" && !placesItself(working.shown(container.el));
    return { layer: idOf(container, instances), target: targetOf(container, instances.length), ...(cells && { grid: true as const }) };
  };

  /**
   * The layer's place now. Its `slot` is where it would go back to with the
   * layer itself taken out first, as a move takes it out before putting it in.
   */
  const placeOf = (layer: Layer): Place => {
    const parent = layer.parent!;
    const container = containerOf(parent);
    let absolute: Place["absolute"] = null;
    if (layer.absolute) {
      const at = { x: definitionOf("x").read(layer.el, colors), y: definitionOf("y").read(layer.el, colors) };
      // Placed from its container's right or bottom edge, or centered, in the view worked in, as a drop reads it (`freelyAt`): so (ticket 79).
      const el = working.shown(layer.el);
      const placed = layer.text ? undefined : placedAlong(el, { x: definitionOf("x").read(el, colors), y: definitionOf("y").read(el, colors) }, roomIn(working.shown(parent.el)));
      absolute = { ...at, ...(placed && { placed }) };
    }
    return { container, nth: parent.children.indexOf(layer) + 1, slot: slotsOf(parent.el).indexOf(layer.el), absolute };
  };

  /** The place of a layer new on the canvas at `to`. */
  const placeNew = (to: Destination): Place => {
    const container = to.parent;
    const where = containerOf(container);
    const slots = slotsOf(container.el);
    if ("x" in to) return { container: where, nth: container.children.length + 1, slot: slots.length, absolute: { x: round(to.x), y: round(to.y) } };
    const next = container.children[to.index];
    return { container: where, nth: to.index + 1, slot: next ? slots.indexOf(nodeOf(next)) : slots.length, absolute: null };
  };

  /**
   * What a layer new on the canvas at `to` goes into, as its change records
   * it: the container, which must be able to hold it, with its id and how the
   * Agent finds it, and the place the layer takes there.
   */
  const newAt = (to: Destination) => {
    const container = to.parent;
    if (!editor().canHold(container)) throw new Error(`03Kind: nothing can go into ${container.name}`);
    const count = tree().acrossInstances(container).length;
    const containerId = idOf(container, tree().acrossInstances(container));
    const place = placeNew(to);
    return { container, containerId, place, target: targetOf(container, count) };
  };

  /**
   * Where `layer` is placed absolute, let go with its border box at `to`, as
   * the view worked in lays it out: its `left` and `top` less than that by its
   * own translate (half its size, centered, ticket 79); placed from its
   * container's right or bottom edge, or centered, it stays so in `to`'s
   * container, as Figma's constraints go with a layer (ADR 0014).
   */
  const freelyAt = (layer: Layer, to: { parent: Layer; x: number; y: number }): NonNullable<Place["absolute"]> => {
    if (layer.text) return { x: round(to.x), y: round(to.y) };
    const el = working.shown(layer.el);
    const shift = shiftIn(el);
    const at = { x: round(to.x - shift.x), y: round(to.y - shift.y) };
    const placed = placedAlong(el, at, roomIn(working.shown(to.parent.el)));
    return { ...at, ...(placed && { placed }) };
  };

  /** The layer's place at `to`, worked out before it moves. */
  const placeAt = (layer: Layer, to: Destination): Place => {
    const parent = to.parent;
    const container = containerOf(parent);
    const others = parent.children.filter((child) => child !== layer);
    const nodes = slotsOf(parent.el).filter((node) => node !== layer.el);
    if ("x" in to) return { container, nth: others.length + 1, slot: nodes.length, absolute: freelyAt(layer, to) };
    const next = others[to.index];
    const slot = next ? nodes.indexOf(nodeOf(next)) : nodes.length;
    return { container, nth: to.index + 1, slot, absolute: null };
  };

  /**
   * Where a layer is in its container, in the view worked in, as a drop
   * there places it freely: placed freely already, where its CSS has it;
   * otherwise from inside the container's border, its margins aside.
   */
  const freePlaceOf = (layer: Layer): { x: number; y: number } => {
    const container = working.shown(layer.parent!.el);
    if (layer.text) {
      const box = editor().measure(layer);
      const inside = paddingBox(container);
      return { x: round(box.left - inside.left), y: round(box.top - inside.top) };
    }
    const el = working.shown(layer.el);
    if (!absolute(el)) return spotIn(el, container);
    // Where its border box is: past its `left` and `top` by its own translate, as a drop has it.
    // Given both sides along an axis, where the browser places it, past an auto margin, as its X and Y read (tickets 94, 96).
    const shift = shiftIn(el);
    return { x: startOffsetOf(el, "x") + shift.x, y: startOffsetOf(el, "y") + shift.y };
  };

  /**
   * Gives loose text an element of its own, in each instance: a `<span>`,
   * carrying its container's markers, as the text is written there. Returns the layer it now is.
   */
  const wrap = (layer: Layer): Layer => {
    const runs = tree().acrossInstances(layer);
    const run = layer.parent!.children.filter((child) => child.text).indexOf(layer);
    const spans = runs.map((text) => {
      const span = doc.createElement("span");
      for (const attr of [LOC_ATTR, USAGE_ATTR, CHAIN_ATTR, MADE_ATTR]) {
        const value = text.el.getAttribute(attr);
        if (value !== null) span.setAttribute(attr, value);
      }
      span.setAttribute(WRAP_ATTR, String(run));
      // A Frame's only text runs on in its inline fragments: they go in with it.
      const nodes = [...new Set(text.text!.map((node) => childIn(text.el, node)))];
      nodes[0].before(span);
      span.append(...nodes);
      return span;
    });
    const id = newId();
    for (const span of spans) span.setAttribute(LAYER_ID_ATTR, id);
    show();
    rebuild();
    return tree().layerOf(spans[runs.indexOf(layer)])!;
  };

  /**
   * The size a layer placed freely keeps as it moves (`sizeOf`): but along
   * an axis it is centered by its auto margins, its size `auto`, held by a
   * maximum (`heldCentered`, ticket 97), none, so it still fills what room
   * its sides leave where less, as it did.
   */
  const keptSize = (el: Element): Record<string, string> => {
    const size = sizeOf(el);
    const shown = working.shown(el);
    if (heldCentered(shown, "x")) delete size.width;
    if (heldCentered(shown, "y")) delete size.height;
    return size;
  };

  /** A move that can be undone. `start`: where the layer was before any move, where its own style is enough. */
  const moveStep = (id: string, from: Place, to: Place, start: Place, size: Record<string, string>, record: MoveRecord) => {
    const styleAt = (place: Place): Record<string, string> => {
      if (same(place, start)) return {};
      if (place.absolute) return { ...absoluteAt(place.absolute), ...size };
      // An absolute layer put into a layout leaves its own position.
      return start.absolute ? { position: "static" } : {};
    };
    moveTo(id, from, to, styleAt(to), record);
    push(
      {
        layers: [id],
        key: `${id} ${record.property}`,
        undo: () => moveTo(id, to, from, styleAt(from), record),
        redo: () => moveTo(id, from, to, styleAt(to), record),
      },
      false,
    );
  };

  /**
   * A change to the structure that can be undone: `make` makes it, `unmake`
   * takes it back, each on the canvas and in the ChangeSet; the layers are
   * built anew after each. `layers`: what it is made to; `back`: what taking it back leaves.
   */
  const structural = (layers: string[], back: string[], make: () => void, unmake: () => void) => {
    const run = (f: () => void) => () => {
      f();
      syncOrders(doc, changes);
      rebuild();
    };
    run(make)();
    push({ layers, back, key: layers.join(" "), undo: run(unmake), redo: run(make) }, false);
  };
  /** Making a Stack, or dissolving one, as recorded in `record`, with the layer `id`. */
  const stackOn = (id: string, record: StructureRecord) => () => {
    changes.record(id, record);
    if (record.kind === "stack") compose(doc, id, record.after as Composed, record.style);
    else dissolve(doc, id, record.after as Dissolved, record.style);
  };
  /** Taking that back. */
  const stackOff = (id: string, record: StructureRecord) => () => {
    drop(id, record.property);
    if (record.kind === "stack") decompose(doc, id, record.after as Composed, changes.list());
    else undissolve(doc, id, record.after as Dissolved, changes.list());
  };
  /** Takes the change to the layer `id` under `property` out of the ChangeSet. */
  const drop = (id: string, property: string) => {
    const change = changes.list().find((c) => c.layer === id && c.property === property);
    if (change) changes.remove(change.id);
  };
  /**
   * Taking a layer made this round off the canvas, as recorded in `record`;
   * once taken off, making it again puts the same elements back where they were.
   */
  const madeLayer = (id: string, record: StructureRecord, make: () => void) => {
    let taken: [Element, Element, Node | null][] = [];
    const container = (record.kind === "create" || record.kind === "putBack" ? (record.after as Created | PutBack).place : (record.after as Place)).container.layer;
    return {
      make: () => {
        if (!taken.length) return make();
        changes.record(id, record);
        for (const [el, parent, next] of taken) parent.insertBefore(el, next);
        taken = [];
      },
      takeOff: () => {
        drop(id, record.property);
        taken = elementsOf(doc, id)
          .filter((el) => el.getAttribute(MADE_ATTR) === id)
          .map((el) => [el, el.parentElement!, el.nextSibling]);
        removeMade(doc, id, container, changes.list());
      },
    };
  };
  /** New words, `text`, for the layer `id` under `record`; null: the words it had. */
  const words = (id: string, record: StructureRecord, text: string | null) => () => {
    if (text === null) drop(id, record.property);
    else changes.record(id, { ...record, after: text });
    writeText(doc, id, record.property, changes.has(id, record.property) ? text : null);
  };
  /** Marks every instance of the layer `id` with the brief `text`, the Layers panel and the canvas showing it; "": none. */
  const markBrief = (id: string, text: string) => {
    // With no brief of its usage's own, the component's, if it has one, shows.
    const own = !!changes.find(id, BRIEF);
    for (const el of elementsOf(doc, id)) {
      const shown = text || (own ? "" : componentBrief(el, changes.list()));
      if (shown) el.setAttribute(BRIEF_ATTR, shown);
      else el.removeAttribute(BRIEF_ATTR);
    }
  };
  /**
   * The brief `text` on the layer `id`, as recorded in `record`, a change of
   * its own; "": none. The brief the layer was copied with, if any, is the
   * record's `before`: back to it, there is no change.
   */
  const briefing = (id: string, record: StructureRecord, text: string) => () => {
    if (text === ((record.before as string | null) ?? "")) drop(id, record.property);
    else changes.record(id, { ...record, after: text });
    markBrief(id, text);
  };
  /** Deleting `els`, the layer `id`, as recorded in `record`. */
  const deleting = (id: string, record: StructureRecord, els: Element[]) => ({
    make: () => {
      changes.record(id, record);
      hide(els, record.property, record.style);
    },
    bringBack: () => {
      drop(id, record.property);
      unhide(doc, id, record.property, changes.list());
    },
  });
  /**
   * The elements of the layer in every instance of its usage on the page:
   * those deleted on the canvas, no layers any more, count too, as the page
   * still has them.
   */
  const onPage = (layer: Layer): Element[] => {
    const id = layer.text ? null : layer.el.getAttribute(LAYER_ID_ATTR);
    const shown = tree().acrossInstances(layer).map((instance) => instance.el);
    const all = id ? elementsOf(doc, id) : [];
    return all.length > shown.length ? all : shown;
  };
  /** One of the instances a loop renders, those deleted included. */
  const inLoop = (layer: Layer) => isLoop(onPage(layer));
  /** A layer made this round by the change `id` is the one with: the change that made it, if there is one. */
  const makerOf = (id: string) => changes.list().find((change) => change.layer === id && madeBy(change) === id) ?? null;

  /** Laid out in its container's own element, there to be placed: not text with no element of its own, nor pinned to the window. */
  const placeable = (layer: Layer) => !layer.text && layer.el.parentElement === layer.parent?.el && !layer.el.hasAttribute(PIN_OFFSET_ATTR);
  /** The layer is in every instance of `container`: not one of the instances a loop renders there. */
  const repeatsWith = (layer: Layer, container: Layer) => tree().acrossInstances(layer).length === tree().acrossInstances(container).length;
  /** A Frame that can become a Stack of its layers. */
  const isFrameOfLayers = (layer: Layer) =>
    layer.kind === "frame" && !!layer.parent && layer.children.length > 0 && layer.children.every((child) => placeable(child) && repeatsWith(child, layer));

  /**
   * The changes of the layer `id` promoted to the component that writes it at
   * `loc`, or back with its usage, shown as `changes` has them now: the
   * usage's own edits on its elements, the component's on all it writes.
   */
  const showPromoted = (id: string, loc: string, taken: Change[]) => {
    const others = changesOn(id, changes.list());
    const els = elementsOf(doc, id);
    for (const change of taken) if (change.kind === "style") restoreStyle(els, cssOf(change.property as Property), others, change.breakpoint ?? null);
    if (others.some((change) => change.asStack && !change.breakpoint)) for (const el of els) el.setAttribute(AS_STACK_ATTR, "");
    showComponent(doc, loc, changes.list());
  };

  /** Takes one change back out, as an edit that can be undone. Returns its layer as it is then. */
  const revertOne = (change: Change): Layer | null => {
    if (change.scope === "component") {
      // On every element the component writes.
      const loc = change.target.loc!;
      const to = (on: boolean) => () => {
        if (on) changes.restore(structuredClone(change));
        else changes.remove(change.id);
        showComponent(doc, loc, changes.list());
      };
      structural([], [], to(false), to(true));
      const [el] = componentElements(doc, loc);
      return el ? tree().layerOf(el) : null;
    }
    if (change.kind === "delete") {
      // Deleted, it is no layer: its elements are found by the change.
      const { id: _, layer: id, ...record } = change;
      const els = elementsOf(doc, id).filter((el) => el.getAttribute(DELETED_ATTR) === change.property);
      const { make, bringBack } = deleting(id, record, els);
      structural([id], [id], bringBack, make);
      return layerById(id);
    }
    if (change.kind === "brief") {
      // Found by its id: a layer deleted since keeps its brief to take off.
      const { id: _, layer: id, ...record } = change;
      structural([id], [id], briefing(id, record, (change.before as string | null) ?? ""), briefing(id, record, change.after as string));
      return layerById(id);
    }
    const layer = layerById(change.layer);
    if (!layer) return null;
    if (change.kind === "move") {
      const { kind, target, scope, property, data, instance, wrap, reference } = change;
      const record: MoveRecord = { kind, target, scope, property, sources: [], ...(data && { data }), ...(instance && { instance }), ...(wrap && { wrap }), ...(reference && { reference }) };
      const el = elementsOf(doc, change.layer).find((e) => e.getAttribute(MOVE_ATTR) === property) ?? layer.el;
      moveStep(change.layer, change.after as Place, change.before as Place, change.before as Place, keptSize(el), record);
      return tree().layerOf(el);
    }
    const { id: _, layer: id, ...record } = change;
    if (change.kind === "stack" || change.kind === "unstack") {
      const members = (change.after as Composed | Dissolved).layers.map((member) => member.layer);
      const kept = change.kind === "stack" && (change.after as Composed).place ? members : [id];
      structural(kept, [id], stackOff(id, record), stackOn(id, record));
      return layerById(kept[0]);
    }
    if (change.kind === "create" || change.kind === "duplicate" || change.kind === "putBack") {
      const container = layer.parent!;
      const { make, takeOff } = madeLayer(id, record, () => {});
      structural([container.el.getAttribute(LAYER_ID_ATTR) ?? id], [id], takeOff, make);
      return tree().layerOf(container.el);
    }
    if (change.kind === "text") {
      structural([id], [id], words(id, record, null), words(id, record, change.after as string));
      return layerById(id);
    }
    // A text style on a Frame drawn around its text is its text's: what taking it back leaves selected.
    const left = (ofText(change) && framedText(layer)) || layer;
    if (change.breakpoint) {
      inheritStep(change);
      return left;
    }
    // Whatever the layer offers now (a hidden one offers only Visible), a change of its own can always go.
    edit(layer, change.property as Property, change.before as PropertyValues[Property], false, change.breakpoint ?? null, change.after as PropertyValues[Property]);
    return left;
  };

  /**
   * The layers made this round in the layer `id` and moved out of it since,
   * made where they are now instead, each move taken into its making: taking
   * back what made `id` then leaves them. Nothing moves on the canvas.
   */
  const rehome = (id: string) => {
    const moved = changes.list().filter((change) => {
      const maker = change.kind === "move" && (change.before as Place).container.layer === id ? makerOf(change.layer) : null;
      return maker?.kind === "create" && (maker.after as Created).place.container.layer === id;
    });
    if (!moved.length) return;
    const layers = moved.map((move) => {
      const made = makerOf(move.layer)!;
      const place = move.after as Place;
      const style = Object.fromEntries(Object.entries(made.style).filter(([name]) => !["position", "left", "top", "right", "bottom"].includes(name)));
      const where: Change = { ...made, target: place.container.target, after: { ...(made.after as Created), place }, style: { ...style, ...(place.absolute && absoluteAt(place.absolute)) } };
      return { made, where, move };
    });
    const marks = (layer: string, move: string | null) => {
      for (const el of elementsOf(doc, layer)) {
        if (el.getAttribute(MADE_ATTR) !== layer) continue;
        if (move) el.setAttribute(MOVE_ATTR, move);
        else el.removeAttribute(MOVE_ATTR);
      }
    };
    const ids = layers.map(({ made }) => made.layer);
    structural(
      ids,
      ids,
      () => {
        for (const { where, move } of layers) {
          drop(move.layer, move.property);
          changes.restore(where);
          marks(where.layer, null);
        }
      },
      () => {
        for (const { made, move } of layers) {
          changes.restore(made);
          changes.restore(move);
          marks(made.layer, move.property);
        }
      },
    );
  };

  /**
   * Whether the layer deleted by `deletion`, its element `el`, can come back
   * into `container` as it was: into a container in as many instances as the
   * one it was in, where it is not pinned to stay where it was.
   */
  const canReturn = (deletion: Change, el: Element, container: Layer) => {
    const home = layerById((deletion.before as Place).container.layer);
    if (!home || tree().acrossInstances(home).length !== tree().acrossInstances(container).length) return false;
    // One of a loop's instances, or pinned against a window: only back into its own container.
    return container === home || !(deletion.data || el.hasAttribute(PIN_OFFSET_ATTR));
  };

  /** Puts a moved layer at `to`, on the canvas and in the ChangeSet, and builds the layers anew. */
  const moveTo = (id: string, from: Place, to: Place, style: Record<string, string>, record: MoveRecord) => {
    changes.record(id, { ...record, before: from, after: to, style });
    relocate(doc, id, record.property, from, to, style, changes.list());
    // Placed absolute: drawn past its X and Y by the margins it has where it is now.
    const moved = changes.find(id, record.property);
    const el = elementsOf(doc, id)[0];
    if (moved && to.absolute && el) changes.record(id, { ...moved, margins: marginsAt(el) });
    syncOrders(doc, changes);
    rebuild();
  };

  return {
    canMove: (layer) => layer.parent !== null,
    canDrop(layer, container) {
      if (!editor().canMove(layer) || !CONTAINERS.includes(container.kind)) return false;
      // Pinned where the designer saw it, against a window the canvas has none of: it stays in its container.
      if (!layer.text && layer.el.hasAttribute(PIN_OFFSET_ATTR) && container !== layer.parent) return false;
      for (let c: Layer | null = container; c; c = c.parent) if (c === layer) return false;
      return tree().acrossInstances(container).length === tree().acrossInstances(layer.parent!).length;
    },
    move(layer, to) {
      if (!editor().canDrop(layer, to.parent)) throw new Error(`03Kind: ${layer.name} cannot go into ${to.parent.name}`);
      // Absolute as the page has it, and staying in its container: only its position changes, as X and Y do.
      // At a breakpoint, so does that of any absolute layer: where it is placed there is its X and Y there.
      const moved = !layer.text && layer.el.hasAttribute(MOVE_ATTR);
      if ("x" in to && to.parent === layer.parent && (working.breakpoint() || (layer.absolute && !layer.text && !moved))) {
        // At a breakpoint, loose text gets an element of its own, to be placed freely there.
        if (layer.text) layer = wrap(layer);
        // Let go where its border box is: moved back by its own translate (centered, half its size), its `left` and `top` are less (ticket 79).
        const [dx, dy] = pinOffsetOf(layer.el);
        const shift = layer.text ? { x: 0, y: 0 } : shiftIn(working.shown(layer.el));
        const at = { x: round(to.x - dx - shift.x), y: round(to.y - dy - shift.y) };
        // At a breakpoint, a layer in its container's flow there is placed freely there only (ADR 0008).
        if (working.breakpoint() && !absolute(working.shown(layer.el))) editHere(layer, "absolute", at, false);
        else {
          // Placed freely already: only its position changes, as X and Y do; at a breakpoint, there.
          const placed = layer;
          editor().batch(() => {
            editor().set(placed, "x", at.x);
            editor().set(placed, "y", at.y);
          });
        }
        return layer;
      }
      // Into another container, a change to the structure in every view: where it was placed freely at a breakpoint goes with what it leaves.
      const placings = layer.text ? [] : changes.list().filter((change) => change.layer === layer.el.getAttribute(LAYER_ID_ATTR) && change.property === "absolute");
      if (placings.length && to.parent !== layer.parent) {
        let there = layer;
        editor().batch(() => {
          for (const change of placings) inheritStep(change);
          there = editor().move(layer, to);
        });
        return there;
      }
      const target = targetOf(layer, tree().acrossInstances(layer).length);
      const loop = isLoop(tree().acrossInstances(layer).map((instance) => instance.el));
      const text = !!layer.text;
      if (text) layer = wrap(layer);
      const id = idOf(layer, tree().acrossInstances(layer));
      const from = placeOf(layer);
      const after = placeAt(layer, to);
      if (same(from, after)) return layer;
      // The elements that move, marked with the change they move under: a loop's instance alone, under one of its own.
      let property = layer.el.getAttribute(MOVE_ATTR);
      if (!property) {
        property = loop ? `${MOVE} ${++lastMove}` : MOVE;
        for (const el of loop ? [layer.el] : elementsOf(doc, id)) el.setAttribute(MOVE_ATTR, property);
      }
      const el = layer.el;
      const earlier = changes.list().find((change) => change.layer === id && change.property === property);
      // Placed absolute in a container the page does not position: it becomes the positioning reference.
      const container = to.parent.el;
      const reference = !!after.absolute && (getComputedStyle(container).position === "static" || container.hasAttribute(REFERENCE_ATTR));
      const record: MoveRecord = {
        kind: "move",
        target,
        scope: "usage",
        property,
        sources: [],
        ...(loop && { data: true, instance: instanceOf(layer.el, onPage(layer)) }),
        ...(text && { wrap: true }),
        ...(reference && { reference: true }),
      };
      moveStep(id, from, after, (earlier?.before as Place | undefined) ?? from, keptSize(el), record);
      return tree().layerOf(el) ?? layer;
    },
    nudge(layers, dx, dy, { continues = false } = {}) {
      /** Each layer by its node, found again as each move builds the layers anew; loose text gets an element on its first. */
      const nodes = layers.map(nodeOf);
      const found = (i: number) => tree().layerOf(nodes[i]);
      const moved = (i: number, layer: Layer) => (nodes[i] = nodeOf(layer));
      /** Placed freely in the view worked in. */
      const free = (layer: Layer) => !layer.text && (layer.absolute || absolute(working.shown(layer.el)));
      group(
        () => {
          // Placed freely, or in a Frame: moved that far, from where they are.
          layers.forEach((_, i) => {
            const layer = found(i);
            const parent = layer?.parent;
            if (!layer || !parent || (!dx && !dy) || !(free(layer) || parent.kind === "frame") || !editor().canDrop(layer, parent)) return;
            const { x, y } = freePlaceOf(layer);
            moved(i, editor().move(layer, { parent, x: x + dx, y: y + dy }));
          });
          // In a Stack's or a Grid's layout: each a place along it, the furthest that way first, so side by side they go together.
          const stacked = layers.map((_, i) => i).filter((i) => {
            const layer = found(i);
            const parent = layer?.parent;
            // A Grid that places its layers itself has no cell along to take: they stay, as they do in a Frame's flow.
            const along = parent?.kind === "stack" || (parent?.kind === "grid" && !placesItself(working.shown(parent.el)));
            return along && !free(layer!) && editor().canDrop(layer!, parent!);
          });
          const stuck = new Set<Node>();
          for (const parentNode of new Set(stacked.map((i) => nodeOf(found(i)!.parent!)))) {
            const container = tree().layerOf(parentNode)!;
            // A Grid's cells run along its rows: a row on is as many cells on as it has columns.
            const along =
              container.kind === "grid"
                ? Math.sign(dx) || Math.sign(dy) * definitionOf("columns").read(working.shown(container.el), colors)
                : Math.sign(container.direction === "horizontal" ? dx : dy);
            if (!along) continue;
            const flowOf = (i: number) => {
              const parent = found(i)!.parent!;
              return { parent, flow: parent.children.filter((child) => !free(child)) };
            };
            const mine = stacked
              .filter((i) => nodeOf(found(i)!.parent!) === parentNode)
              .sort((a, b) => along * (flowOf(b).flow.indexOf(found(b)!) - flowOf(a).flow.indexOf(found(a)!)));
            for (const i of mine) {
              const layer = found(i)!;
              const { parent, flow } = flowOf(i);
              const to = flow.indexOf(layer) + along;
              if (to < 0 || to >= flow.length || stuck.has(nodeOf(flow[to]))) {
                stuck.add(nodes[i]);
                continue;
              }
              // Before the layer that will come after it, the layer itself taken out, as a drop places it.
              const rest = flow.filter((child) => child !== layer);
              const others = parent.children.filter((child) => child !== layer);
              moved(i, editor().move(layer, { parent, index: to < rest.length ? others.indexOf(rest[to]) : others.length }));
            }
          }
        },
        continues,
        "nudge",
      );
      return layers.map((layer, i) => found(i) ?? layer);
    },
    revert(id) {
      // What builds on it goes first, newest first, all one step.
      let layer: Layer | null = null;
      editor().batch(() => {
        for (const change of withDependents(changes.list(), id)) {
          const reverted = revertOne(change);
          if (change.id === id) layer = reverted;
        }
      });
      return layer && tree().layerOf(nodeOf(layer));
    },
    canPromote(layer) {
      // A Frame's only text has its changes on the Frame's element.
      const id = layer.el.getAttribute(LAYER_ID_ATTR);
      return !!id && inComponent(layer) && promotable(changes.list(), id).some((change) => ofLayer(layer, change));
    },
    promote(layer) {
      if (!editor().canPromote(layer)) throw new Error(`03Kind: ${layer.name} has no changes to promote to its component`);
      const id = layer.el.getAttribute(LAYER_ID_ATTR)!;
      const loc = layer.loc!;
      const component = componentKey(loc);
      const taken = structuredClone(promotable(changes.list(), id).filter((change) => ofLayer(layer, change)));
      const before = structuredClone(changes.list().filter((change) => change.layer === component));
      // The component's changes once promoted, worked out apart.
      const after = promoteIn(createChangeSet(changes.save()), taken, loc, componentElements(doc, loc).length);
      const swap = (out: Change[], back: Change[]) => () => {
        for (const change of out) changes.remove(change.id);
        for (const change of back) changes.restore(structuredClone(change));
        showPromoted(id, loc, taken);
      };
      structural([id], [id], swap([...taken, ...before], after), swap(after, [...before, ...taken]));
      return { promoted: taken, stays: changes.list().filter((change) => change.layer === id && change.scope === "usage" && ofLayer(layer, change)) };
    },
    canStack(layers) {
      if (layers.length === 1 && isFrameOfLayers(layers[0])) return true;
      const parent = layers[0]?.parent;
      return !!parent && layers.every((layer) => layer.parent === parent && placeable(layer) && repeatsWith(layer, parent));
    },
    stack(layers) {
      if (!editor().canStack(layers)) throw new Error(`03Kind: ${layers.map((layer) => layer.name).join(", ")} cannot be made a Stack`);
      const frame = layers.length === 1 && isFrameOfLayers(layers[0]) ? layers[0] : null;
      const members = frame ? frame.children : layers;
      const container = frame ?? layers[0].parent!;
      const count = tree().acrossInstances(container).length;
      // Measured as they show, margins left out: in the Stack, the room between them is its gap. The Stack has no
      // margin of its own either, which no one could see or set: the room the margins made around them goes.
      // Placed freely in a Frame, they are placed again, by the Stack.
      const inferred = inferStack(
        members.map((member) => borderBox(member.el)),
        frame && paddingBox(frame.el),
        !!frame && members.every((member) => member.absolute),
      );
      const ordered = inferred.order.map((i) => members[i]);
      const margins = ordered.map((member) => marginsOf(member.el));
      const composed: Composed = {
        ...inferred.settings,
        place: null,
        layers: ordered.map((member, i) => ({
          layer: idOf(member, tree().acrossInstances(member)),
          target: targetOf(member, count),
          from: placeOf(member),
          ...(margins[i].some((m) => m) && { unmargined: true as const }),
        })),
      };
      let style = stackStyle(inferred.settings, inferred.stretch);
      let id: string;
      if (frame) id = idOf(frame, tree().acrossInstances(frame));
      else {
        id = newId();
        // Where the first of them is; absolute where they are, if they all are.
        const slots = slotsOf(container.el);
        let absolute: Place["absolute"] = null;
        if (members.every((member) => member.absolute)) {
          const reference = paddingBox((members[0].el as HTMLElement).offsetParent ?? container.el);
          const boxes = members.map((member) => borderBox(member.el));
          absolute = { x: round(Math.min(...boxes.map((b) => b.left)) - reference.left), y: round(Math.min(...boxes.map((b) => b.top)) - reference.top) };
          style = { ...style, ...absoluteAt(absolute) };
        }
        composed.place = {
          container: { layer: idOf(container, tree().acrossInstances(container)), target: targetOf(container, count) },
          nth: container.children.findIndex((child) => members.includes(child)) + 1,
          slot: Math.min(...members.map((member) => slots.indexOf(member.el))),
          absolute,
        };
      }
      // What sets the margins the layers lose, for the Agent to take off.
      const sources = ordered.flatMap((member, i) => (margins[i].some((m) => m) ? sourcesFor(member.el, MARGIN_CSS) : []));
      const record: StructureRecord = { kind: "stack", target: targetOf(container, count), scope: "usage", property: "stack", before: null, after: composed, style, sources };
      const kept = frame ? [id] : composed.layers.map((member) => member.layer);
      structural([id], kept, stackOn(id, record), stackOff(id, record));
      return layerById(id)!;
    },
    canUnstack: (layer) => layer.kind === "stack" && !!layer.parent && layer.children.every((child) => placeable(child) && repeatsWith(child, layer)),
    canUngroup: (layer) =>
      !!layer.parent &&
      ["stack", "frame"].includes(layer.kind) &&
      !layer.isInstance &&
      layer.children.length > 0 &&
      layer.children.every((child) => placeable(child) && editor().canDrop(child, layer.parent!)),
    ungroup(layer) {
      if (!editor().canUngroup(layer)) throw new Error(`03Kind: ${layer.name} cannot be ungrouped`);
      const els = layer.children.map((child) => child.el);
      const found = () => els.map((el) => tree().layerOf(el)).filter((l) => l !== null);
      const maker = makerOf(idOf(layer, tree().acrossInstances(layer)));
      if (maker?.kind === "stack") {
        editor().revert(maker.id);
        return found();
      }
      const ungrouped = layer.el;
      const container = layer.parent!.el;
      // In its container's layout, its layers in its layout take its place; any other stays where it is, absolute.
      const inLayout = layer.children.map((child) => layer.parent!.kind !== "frame" && !layer.absolute && !child.absolute);
      const index = layer.parent!.children.indexOf(layer);
      const spots = els.map((el) => spotIn(el, container));
      editor().batch(() => {
        let n = 0;
        els.forEach((el, i) => {
          const parent = tree().layerOf(container)!;
          editor().move(tree().layerOf(el)!, inLayout[i] ? { parent, index: index + n++ } : { parent, ...spots[i] });
        });
        editor().remove(tree().layerOf(ungrouped)!);
      });
      return found();
    },
    canHold: (layer) => holdsLayers(layer),
    create(type, to, size) {
      const { container, containerId, place, target } = newAt(to);
      // Text drawn wider than a click keeps the width it was drawn at; its height follows its words.
      const frame = type === "frame";
      const width = size ? round(size.width) : frame ? NEW_FRAME_SIZE : null;
      const height = frame ? (size ? round(size.height) : NEW_FRAME_SIZE) : null;
      const created: Created = { type, place, width, height, ...(frame ? {} : { text: NEW_TEXT }) };
      const style = {
        ...(frame ? {} : bodyText(doc)),
        ...(width !== null && { width: `${width}px` }),
        ...(height !== null && { height: `${height}px` }),
        ...(place.absolute && absoluteAt(place.absolute)),
      };
      const id = newId();
      const record: StructureRecord = { kind: "create", target, scope: "usage", property: "new", before: null, after: created, style, sources: [] };
      const { make, takeOff } = madeLayer(id, record, () => {
        changes.record(id, record);
        insertNew(doc, id, created, style);
      });
      structural([id], [containerId], make, takeOff);
      return tree().layerOf([...container.el.children].find((el) => el.getAttribute(LAYER_ID_ATTR) === id)!)!;
    },
    brief(layer) {
      if (layer.text) return "";
      const id = layer.el.getAttribute(LAYER_ID_ATTR);
      // Not changed this round: its component's brief, if one is promoted to it.
      if (!id) return layer.el.getAttribute(BRIEF_ATTR) ?? "";
      if (editor().isNewFrame(layer)) return (makerOf(id)!.after as Created).brief ?? "";
      // A copy of a new Frame has the brief it was copied with, until one is written on it.
      return (changes.find(id, BRIEF)?.after as string | undefined) ?? layer.el.getAttribute(BRIEF_ATTR) ?? "";
    },
    isNewFrame(layer) {
      const maker = layer.text ? null : makerOf(layer.el.getAttribute(LAYER_ID_ATTR) ?? "");
      return maker?.kind === "create" && (maker.after as Created).type === "frame";
    },
    setBrief(layer, brief) {
      const before = editor().brief(layer);
      if (before === brief) return layer;
      if (editor().isNewFrame(layer)) {
        // In the change that makes it.
        const id = layer.el.getAttribute(LAYER_ID_ATTR)!;
        const maker = makerOf(id)!;
        const { id: _, layer: __, ...record } = maker;
        const to = (text: string) => () => {
          changes.record(id, { ...record, after: { ...(maker.after as Created), brief: text || undefined } });
          markBrief(id, text);
        };
        structural([id], [id], to(brief), to(before));
        return tree().layerOf(layer.el)!;
      }
      const own = editor().ownElement(layer);
      const id = idOf(own, tree().acrossInstances(own));
      // Before: what the layer shows otherwise, which writing one on it takes the place of: the brief a copy of a new Frame was copied with, or its component's.
      const written = changes.find(id, BRIEF);
      const copiedWith = written ? written.before : before || null;
      const record: StructureRecord = { kind: "brief", target: targetOf(own, onPage(own).length), scope: "usage", property: BRIEF, before: copiedWith, after: brief, style: {}, sources: [] };
      structural([id], [id], briefing(id, record, brief), briefing(id, record, before));
      return tree().layerOf(own.el)!;
    },
    ownElement: (layer) => (layer.text ? wrap(layer) : layer),
    typedIn: (layer) => (isOnlyText(layer) ? layer : editor().ownElement(layer)),
    setText(layer, text) {
      const own = editor().typedIn(layer);
      const instances = tree().acrossInstances(own);
      const id = idOf(own, instances);
      const maker = makerOf(id);
      // The words of new text are those of the change that makes it.
      if (maker?.kind === "create") {
        const created = maker.after as Created;
        if (created.text === undefined || created.text === text) return;
        const { id: _, layer: __, ...record } = maker;
        const to = (words: string) => () => {
          changes.record(id, { ...record, after: { ...created, text: words } });
          for (const el of elementsOf(doc, id)) el.textContent = words;
        };
        structural([id], [id], to(text), to(created.text));
        return;
      }
      const now = wordsOf(own.el);
      if (now === text) return;
      // Words that differ across the instances of a usage come from data: those a loop renders.
      let property = own.el.getAttribute(TEXT_ATTR);
      if (!property) {
        const alone = new Set(instances.map((instance) => wordsOf(instance.el))).size > 1;
        property = alone ? `text-${++lastAlone}` : "text";
        for (const instance of alone ? [own] : instances) instance.el.setAttribute(TEXT_ATTR, property);
      }
      const earlier = changes.list().find((change) => change.layer === id && change.property === property);
      const record: StructureRecord = {
        kind: "text",
        target: targetOf(own, onPage(own).length),
        scope: "usage",
        property,
        before: earlier ? earlier.before : now,
        after: text,
        style: {},
        sources: [],
        ...(property !== "text" && { data: true, instance: instanceOf(own.el, onPage(own)) }),
      };
      structural([id], [id], words(id, record, text), words(id, record, now));
    },
    canRemove: (layer) => layer.parent !== null,
    originOf(layer) {
      const made = layer.made !== null && layer.el.getAttribute(LAYER_ID_ATTR) === layer.made;
      const maker = made ? makerOf(layer.made!) : null;
      if (maker?.kind === "putBack") {
        const { target, written, snippet, copy } = (maker.after as PutBack).layer.origin;
        return { target, place: placeOf(layer), written, ...(snippet !== undefined && { snippet }), ...(copy && { copy }) };
      }
      return {
        target: targetOf(layer, onPage(layer).length),
        place: layer.parent ? placeOf(layer) : null,
        written: made ? null : layer.isInstance ? layer.usageLoc : layer.loc,
      };
    },
    remove(layer, { offCanvas } = {}) {
      if (!editor().canRemove(layer)) throw new Error(`03Kind: ${layer.name} cannot be deleted`);
      const own = editor().ownElement(layer);
      const instances = tree().acrossInstances(own);
      const id = idOf(own, instances);
      // Made this round, it is not in the source: taking it back is deleting it. A new Stack goes with its layers.
      const maker = makerOf(id);
      if (maker) {
        const members = maker.kind === "stack" ? (maker.after as Composed).layers.map((member) => member.layer) : [];
        editor().batch(() => {
          rehome(id);
          editor().revert(maker.id);
          for (const member of members) {
            const found = layerById(member);
            if (found) editor().remove(found);
          }
        });
        return;
      }
      const loop = inLoop(own);
      const property = loop ? `delete-${++lastAlone}` : "delete";
      const parent = own.parent!;
      const record: StructureRecord = {
        kind: "delete",
        target: targetOf(own, onPage(own).length),
        scope: "usage",
        property,
        before: placeOf(own),
        after: null,
        style: { display: "none" },
        sources: [],
        ...(loop && { data: true, instance: instanceOf(own.el, onPage(own)) }),
        ...(offCanvas && { offCanvas }),
      };
      const { make, bringBack } = deleting(id, record, loop ? [own.el] : instances.map((instance) => instance.el));
      structural([idOf(parent, tree().acrossInstances(parent))], [id], make, bringBack);
    },
    canDuplicate: (layer) => layer.parent !== null && !layer.text,
    duplicate(layer, to) {
      if (!editor().canDuplicate(layer) || (to && !editor().canDrop(layer, to.parent))) throw new Error(`03Kind: ${layer.name} cannot be copied there`);
      const instances = tree().acrossInstances(layer);
      const loop = inLoop(layer);
      const parent = to?.parent ?? layer.parent!;
      const containers = loop ? [parent] : tree().acrossInstances(parent);
      // The original needs an id of its own, for its changes to stay apart from the copy's.
      idOf(layer, instances);
      const from = placeOf(layer);
      const where = { layer: idOf(parent, tree().acrossInstances(parent)), target: targetOf(parent, tree().acrossInstances(parent).length) };
      const slots = slotsOf(parent.el);
      let place: Place;
      let style: Record<string, string> = {};
      if (!to) place = { container: where, nth: parent.children.indexOf(layer) + 2, slot: slots.indexOf(layer.el) + 1, absolute: from.absolute };
      else if ("x" in to) {
        place = { container: where, nth: parent.children.length + 1, slot: slots.length, absolute: freelyAt(layer, to) };
        style = { ...absoluteAt(place.absolute!), ...keptSize(layer.el) };
      } else {
        const next = parent.children.filter((child) => child !== layer)[to.index];
        const nth = next ? parent.children.indexOf(next) : parent.children.length;
        place = { container: where, nth: nth + 1, slot: next ? slots.indexOf(nodeOf(next)) : slots.length, absolute: null };
        // An absolute layer's copy put into a layout leaves its position.
        if (layer.absolute) style = { position: "static" };
      }
      const id = newId();
      // It keeps what the layer has at breakpoints of its own, as it is now.
      const copied = copiedBreakpointsOf(layer.el, changes.list());
      const record: StructureRecord = {
        kind: "duplicate",
        target: targetOf(layer, onPage(layer).length),
        scope: "usage",
        property: "copy",
        before: from,
        after: place,
        style,
        sources: [],
        ...(loop && { data: true, instance: instanceOf(layer.el, onPage(layer)) }),
        ...(copied.length > 0 && { copiedBreakpoints: copied }),
        // A new Frame's copy is made by its brief too.
        ...(layer.el.getAttribute(NEW_ATTR) === "frame" && layer.el.hasAttribute(BRIEF_ATTR) && { brief: layer.el.getAttribute(BRIEF_ATTR)! }),
      };
      const originals = (loop ? [layer] : instances).map((instance) => instance.el);
      const { make, takeOff } = madeLayer(id, record, () => {
        changes.record(id, record);
        insertCopies(originals, containers.map((container) => container.el), id, place, style);
      });
      structural([id], [layer.el.getAttribute(LAYER_ID_ATTR)!], make, takeOff);
      const at = containers[loop ? 0 : instances.indexOf(layer)].el;
      return tree().layerOf([...at.children].find((el) => el.getAttribute(LAYER_ID_ATTR) === id)!)!;
    },
    putBack(from, to) {
      const deletion = movedOffBy(changes.list(), from.kept.id);
      const deleted = deletion ? elementsOf(doc, deletion.layer).filter((el) => el.getAttribute(DELETED_ATTR) === deletion.property) : [];
      // Moved off this round, as it was: the deletion is taken back, and it moves to where it is let go, if anywhere.
      if (deletion && deleted.length && !from.kept.edits.changes.length && canReturn(deletion, deleted[0], to.parent)) {
        let back: Layer | null = null;
        // A change to the structure: at every width, whatever view it is let go in (ADR 0008).
        working.inDesktop(() =>
          editor().batch(() => {
            editor().revert(deletion.id);
            const layer = tree().layerOf(deleted[0])!;
            const parent = tree().layerOf(to.parent.el)!;
            // Let go by its border box: placed by its margin box.
            const [x, y] = "x" in to ? [to.x - parseFloat(getComputedStyle(layer.el).marginLeft), to.y - parseFloat(getComputedStyle(layer.el).marginTop)] : [0, 0];
            back = editor().move(layer, "x" in to ? { parent, x: round(x), y: round(y) } : { parent, index: to.index });
          }),
        );
        return back!;
      }
      // Otherwise new on the canvas, as it looks off it.
      const { container, containerId, place, target } = newAt(to);
      const style = place.absolute ? absoluteAt(place.absolute) : {};
      const id = newId();
      const putBack: PutBack = { place, layer: structuredClone(from.kept) };
      const record: StructureRecord = { kind: "putBack", target, scope: "usage", property: "put back", before: null, after: putBack, style, sources: [] };
      const { make, takeOff } = madeLayer(id, record, () => {
        changes.record(id, record);
        insertPutBack(doc, id, from.el, place, style);
      });
      structural([id], [containerId], make, takeOff);
      return tree().layerOf(elementsOf(doc, id).find((el) => el.parentElement === container.el) ?? elementsOf(doc, id)[0])!;
    },
    unstack(layer) {
      if (!editor().canUnstack(layer)) throw new Error(`03Kind: ${layer.name} cannot be dissolved`);
      const count = tree().acrossInstances(layer).length;
      const id = idOf(layer, tree().acrossInstances(layer));
      const before: StackSettings = {
        direction: readAsShown(layer.el, "direction", colors),
        gap: readAsShown(layer.el, "gap", colors),
        padding: readAsShown(layer.el, "padding", colors),
        align: readAsShown(layer.el, "align", colors),
      };
      // Each layer where it is now, from inside the Frame's border, its margins aside, but `auto` ones, which take up no room once it is placed by its left and top (ticket 97).
      const dissolved: Dissolved = {
        width: round(layer.el.getBoundingClientRect().width),
        height: round(layer.el.getBoundingClientRect().height),
        layers: layer.children.map((child) => {
          const r = child.el.getBoundingClientRect();
          const { x, y } = spotIn(child.el, layer.el);
          const style = { ...absoluteAt({ x, y }), ...sizeOf(child.el) };
          return { layer: idOf(child, tree().acrossInstances(child)), target: targetOf(child, count), x, y, width: round(r.width), height: round(r.height), style, margins: marginsAt(child.el) };
        }),
      };
      const own = getComputedStyle(layer.el);
      const style = {
        ...(/flex$/.test(own.display) && { display: own.display === "inline-flex" ? "inline-block" : "block" }),
        ...sizeOf(layer.el),
        // The positioning reference of its layers.
        ...(own.position === "static" && { position: "relative" }),
      };
      const record: StructureRecord = {
        kind: "unstack",
        target: targetOf(layer, count),
        scope: "usage",
        property: "unstack",
        before,
        after: dissolved,
        style,
        sources: sourcesFor(layer.el, ["display", "flex-direction"]),
      };
      structural([id], [id], stackOn(id, record), stackOff(id, record));
      return layerById(id)!;
    },
  };
}

/** What a move records besides where the layer was and is. */
type MoveRecord = Omit<Parameters<ChangeSet["record"]>[1], "before" | "after" | "style">;
/** What a change to the structure records (making or dissolving a Stack, a new layer, a copy, deleting, new words). */
type StructureRecord = Omit<Change, "id" | "layer">;

/** New text reads this, to be typed over. */
const NEW_TEXT = "Text";
/** A new Frame clicked rather than drawn is this size, in px. */
const NEW_FRAME_SIZE = 100;

/** The page's body text style: what new text takes, wherever it goes. */
function bodyText(doc: Document): Record<string, string> {
  const body = getComputedStyle(doc.body);
  return {
    "font-family": body.fontFamily,
    "font-size": body.fontSize,
    "font-weight": body.fontWeight,
    "line-height": body.lineHeight,
    "letter-spacing": body.letterSpacing,
    color: body.color,
    margin: "0px",
  };
}

/** Instances a loop renders: several, side by side in one container. */
function isLoop(els: Element[]): boolean {
  return els.length > 1 && els.every((el) => el.parentElement === els[0].parentElement);
}

/** The margins a layer joining a Stack loses. */
const MARGIN_CSS = ["margin-top", "margin-right", "margin-bottom", "margin-left"];

/** The child of `el` that `node` is, or is in. */
function childIn(el: Element, node: Node): ChildNode {
  while (node.parentNode !== el) node = node.parentNode!;
  return node as ChildNode;
}
