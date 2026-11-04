/**
 * Makes the Editor (`createEditor`): puts the edit commands together over the
 * canvas, and makes the style edits itself, a value set, read, inherited, at
 * every width or at a breakpoint. The commands that change the structure are
 * in `structure-edits.ts`; what the Editor is, as its callers see it, in
 * `edit-commands.ts`. An edit is made to the canvas at once and recorded in
 * the ChangeSet. An edit to a layer is an edit to its usage, so it shows up in
 * every instance of that usage, and in every view of the canvas. Every edit
 * can be undone.
 */
import { createWorkingView, rangeOfEdit } from "./breakpoint-edits";
import { contains, outside, widestFirst, within, writtenWith, type Breakpoint, type ProjectBreakpoints } from "./breakpoints";
import { AS_STACK_ATTR, asShown, changesOn, declare, elementsOf, keepOriginal, LAYER_ID_ATTR, restoreStyle, WRAP_ATTR } from "./canvas-style";
import { changeKey, type Change, type ChangeSet, type Picked } from "./changeset";
import type { Binder, Editor, SetOptions } from "./edit-commands";
import { targetOf } from "./layer-target";
import { boxOf, buildLayerTree, isOnlyText, textOnFrame, type Layer } from "./layers";
import { colorReader } from "./paint";
import { MAX_AXIS, middleOf, PLACED_BY, PLACING, shareCss, SIDES, SIZE_AXIS, type Edge, type Share, type Side } from "./checkable";
import { cssOf, definitionOf, isTextProperty, ofText, readAsShown, round, same, stackOf, type Definition, type Property, type PropertyValues, type Size } from "./property-table";
import { autoMarginBefore, computedShareOf, extentOf, heldCentered, middleShareOf, pastShare, placedFrom, sideMoves, sideShareOf } from "./placed-from";
import { marginsAt } from "./stacks";
import { createStructureEdits } from "./structure-edits";
import { sourcesOf } from "./style-source";
import { createHistory, createSteps, type History } from "./undo-steps";
import { pickedIn } from "./variables";
import type { Axis } from "./snap";
import type { Views } from "./views";

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

  /** The layer's id: the one it has, else the one `idOf` stamps on it next. */
  const idFor = (layer: Layer) => layer.el.getAttribute(LAYER_ID_ATTR) ?? String(lastId + 1);
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
    // Each piece is a range of its own: what the page shows in the parts of the range cut is no piece's (ticket 65).
    const { id: _, layer: id, parts: _parts, ...record } = change;
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
      restoreStyle(instancesOf(id), names, others, change.breakpoint!);
      for (const breakpoint of [change.breakpoint!, ...pieces]) referenceAt(change.within, breakpoint);
    };
    const on = () => {
      for (const piece of left ?? []) changes.remove(piece.id);
      changes.restore(change);
      const others = changesOn(id, changes.list());
      const els = instancesOf(id);
      for (const piece of pieces) restoreStyle(els, names, others, piece);
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

  /**
   * Of a change to `property`, one of those that place a layer along an axis
   * by a side (`PLACED_BY`): that side, when `el`, as laid out, is centered on
   * where it places it (ticket 79). With how it is placed, the share of its
   * container the side gives it, which stays (as first changed, `earlier`),
   * and the room its container gives it. Null for any other, or a side whose
   * value is not read here (a `var()`): written in px, as X and Y are; and
   * for one centered by its auto margins (`marginsCentering`).
   */
  const centeringSide = (el: Element, property: Property, earlier: Change | null) => {
    const along = PLACED_BY[property];
    if (!along) return null;
    const from = placedFrom(el, along.axis);
    if (!from.centered || from.margins || from.edge !== along.edge) return null;
    const share = earlier?.centeredOn ? earlier.centeredOn.after : sideShareOf(el, along.axis, along.edge);
    return share && { from, share, room: extentOf(el, along.axis), side: SIDES[along.axis][along.edge] };
  };

  /**
   * Of a change to the X or Y of `el`, from `before` to `value`, when it is
   * centered by its auto margins between its sides (ticket 96): how it stays
   * so, moved as far, its sides given as much more and less, each keeping
   * its share of its container (`left: 0; right: 0` to `left: 20px; right:
   * -20px`), so as wide as its container is, its middle is as far past where
   * it was; where its middle was and is now. Where a view beside does not
   * center it so (`uncentered`, the ranges of those, as `viewsUncentered`
   * reads them, review), its side from the end is left as each view has it,
   * which would place it there otherwise, and its side from the start alone
   * goes twice as far. Null for any other.
   */
  const marginsCentering = (el: Element, property: Property, value: number, before: number, uncentered: (axis: Axis) => Breakpoint[]) => {
    const along = PLACED_BY[property];
    if (!along || along.edge !== "start") return null;
    const from = placedFrom(el, along.axis);
    if (!from.margins) return null;
    const by = value - before;
    const uncenteredAt = uncentered(along.axis);
    const { start, end } = SIDES[along.axis];
    const [from0, to0] = [computedShareOf(el, start), computedShareOf(el, end)];
    const sides: Record<Edge, Share> = uncenteredAt.length
      ? { start: { percent: from0.percent, px: round(from0.px + 2 * by) }, end: to0 }
      : { start: { percent: from0.percent, px: round(from0.px + by) }, end: { percent: to0.percent, px: round(to0.px - by) } };
    return {
      from,
      declarations: { [start]: shareCss(sides.start), ...(!uncenteredAt.length && { [end]: shareCss(sides.end) }) },
      middle: { before: middleShareOf(el, along.axis), after: middleOf(sides) },
      uncenteredAt,
    };
  };

  /**
   * The ranges of the views, but the one worked in, where the layer is not
   * centered along `axis` by its auto margins (`placedFrom`), as the page's
   * breakpoints may have it (ticket 96, review): read from each view's
   * computed style as it shows the layer now, as `viewsMovedOtherwise` reads
   * them (ADR 0011). A view in the desktop view's range is the desktop view's.
   */
  const viewsUncentered = (layer: Layer, axis: Axis) => {
    const ranges: Breakpoint[] = [];
    for (const view of views.list().slice(1)) {
      if (view === working.beside()) continue;
      const el = view.elementOf(layer.el);
      const range = working.breakpointAt(view.width);
      if (el && range && !placedFrom(el, axis).margins) ranges.push(range);
    }
    return ranges;
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
    // Centered on where the side that places it does (ticket 79): the side keeps its share of the container, past it by as much as the layer moves.
    const centering = typeof value === "number" ? asShown(el, () => centeringSide(el, property, earlier)) : null;
    const offCenter = centering && pastShare(value as number, centering.share.percent, centering.room);
    // Centered by its auto margins (ticket 96): its sides move it, as much one way as the other, so it stays so.
    // Not centered so in a view beside: as when first changed (review).
    const uncentered = (axis: Axis) => (breakpoint ? [] : earlier ? (earlier.uncenteredAt ?? []) : viewsUncentered(layer, axis));
    const byMargins = typeof value === "number" && typeof before === "number" ? asShown(el, () => marginsCentering(el, property, value, before, uncentered)) : null;
    const declarations = asShown(el, () => ({
      ...(asStack && { display: "flex", "flex-direction": stackOf(el).direction === "horizontal" ? "row" : "column" }),
      // Centered by its auto margins: its sides as they keep it so, in place of its X written from its left alone.
      ...(byMargins ? byMargins.declarations : definition.write(value, el)),
      ...(centering && { [centering.side]: shareCss({ percent: centering.share.percent, px: offCenter! }) }),
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
    const els = instances.map((instance) => instance.el);
    if (asStack && !breakpoint) for (const el of els) el.setAttribute(AS_STACK_ATTR, "");
    // The instances share their edit styles from the first edit on, their id stamped on them after, as it always was.
    declare(els, declarations, breakpoint, idFor(layer));
    const id = idOf(layer, instances);
    const keeps = definition.keeps?.(el, colors);
    // A size of a layer placed from its right or bottom edge, or centered: how, as when first changed.
    // A maximum of one centered by its auto margins, held by it, as a resize sets it: so too (ticket 97).
    const max = MAX_AXIS[property];
    const along = SIZE_AXIS[property] ?? (max && asShown(el, () => heldCentered(el, max)) ? max : undefined);
    const from = along && (earlier ? earlier.placedFrom : placedFrom(el, along));
    const centeredBy = centering ?? byMargins;
    const placed = from && (from.edge === "end" || from.centered) ? { placedFrom: from } : centeredBy ? { placedFrom: earlier?.placedFrom ?? centeredBy.from } : {};
    // Its X or Y, or its `right` or `bottom`, changed at every width: where the canvas places it otherwise, the value moves nothing.
    const placedBy = PLACED_BY[property];
    const { placedOtherwiseAt, offsetInLayoutAt } = !earlier && !breakpoint && placedBy ? viewsMovedOtherwise(layer, placedBy, !!centeredBy) : { placedOtherwiseAt: [], offsetInLayoutAt: [] };
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
      // Placed by its X and Y: drawn past them by its margins, which it keeps.
      ...(PLACING.includes(property) && value !== null && { margins: marginsPast(el, PLACED_BY[property]?.edge) }),
      ...placed,
      ...(centering && {
        centeredOn: {
          before: earlier?.centeredOn?.before ?? { percent: centering.share.percent, px: pastShare(before as number, centering.share.percent, centering.room) },
          after: { percent: centering.share.percent, px: offCenter! },
        },
      }),
      ...(byMargins && { centeredOn: { before: earlier?.centeredOn?.before ?? byMargins.middle.before, after: byMargins.middle.after } }),
      ...(byMargins?.uncenteredAt.length && { uncenteredAt: byMargins.uncenteredAt }),
      ...(placedOtherwiseAt.length ? { placedOtherwiseAt } : {}),
      ...(offsetInLayoutAt.length ? { offsetInLayoutAt } : {}),
      // Loose text given an element of its own to be placed freely: the code wraps it too, unless a move of it says so already.
      ...(property === "absolute" && layer.el.hasAttribute(WRAP_ATTR) && !changes.list().some((change) => change.layer === id && change.wrap) && { wrap: true }),
    });
    // Back where it started: the page's own style again, the layer's other changes kept on.
    if (!changes.has(id, property, breakpoint)) {
      const others = changesOn(id, changes.list());
      restoreStyle(els, cssOf(property), others, breakpoint);
    }
    referenceAt(within, breakpoint);
    // A Stack now laid out the other way: the layers are built anew, so a drag into it reads the way it runs now.
    if (layer.kind === "stack" && stackOf(layer.el).direction !== layer.direction) tree = buildLayerTree(doc);
    return id;
  };

  /**
   * The margins a layer placed by its X and Y, or from `edge`, is drawn past
   * them by: but one `auto` before it, which they count (ticket 96).
   */
  const marginsPast = (el: Element, edge?: Edge) => {
    const margins = marginsAt(el, edge);
    return edge === "end" ? margins : { x: margins.x - autoMarginBefore(el, "x"), y: margins.y - autoMarginBefore(el, "y") };
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
    const els = elementsOf(doc, within);
    if (held) {
      for (const el of els) keepOriginal(el);
      declare(els, { position: "relative" }, breakpoint);
    } else restoreStyle(els, ["position"], others, breakpoint);
  };

  /**
   * The ranges of the views, but the one worked in, where a value given to
   * the layer's `side` at every width does not move it as it places it in
   * the view worked in, as the page's breakpoints may have it (`sideMoves`):
   * where it moves it nothing, as its `left` or `top` where the view shows it
   * static (ticket 83), its `right` or `bottom` where the view does not place
   * it by that (ticket 75); and where it moves it in its container's layout
   * still, placed relative or sticky, and how (ticket 84). A layer `centered`
   * on where its side places it is placed so by a share of its container,
   * which no layout moves it by: the check looks at it as placed absolute
   * there, as before. Read from each view's computed `position`, the
   * direction the browser goes by there (ticket 89) and what is declared, as
   * it shows the layer now: no view is brought up to date or laid out (ADR
   * 0011), as the change does not change what places the layer there. A view
   * in the desktop view's range is the desktop view's, where the change is made.
   */
  const viewsMovedOtherwise = (layer: Layer, side: Side, centered: boolean) => {
    const placedOtherwiseAt: Breakpoint[] = [];
    const offsetInLayoutAt: NonNullable<Change["offsetInLayoutAt"]> = [];
    for (const view of views.list().slice(1)) {
      if (view === working.beside()) continue;
      const el = view.elementOf(layer.el);
      const range = working.breakpointAt(view.width);
      if (!el || !range) continue;
      const moves = sideMoves(el, side);
      if (!moves) placedOtherwiseAt.push(range);
      else if (moves !== "placed" && !centered) offsetInLayoutAt.push({ breakpoint: range, position: moves });
    }
    return { placedOtherwiseAt, offsetInLayoutAt };
  };

  /** The layers a step was made to, as they are now. */
  const layersOf = (ids: string[]) => [...new Set(ids)].map(layerById).filter((layer) => layer !== null);
  /** This editor's steps, in the history it shares. */
  const steps = createSteps(history, views, layersOf);
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
    // A new adjustment, though this edit may change nothing.
    if (!continues) steps.begin();
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
      restoreStyle(instancesOf(id), cssOf(property as Property), others, breakpoint!);
      referenceAt(change.within, breakpoint!);
    };
    const on = () => {
      changes.restore(change);
      declare(instancesOf(id), change.style, breakpoint!);
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

  /**
   * The offset that places the layer from its container's end edge, `right`
   * or `bottom`, when `property` is its width or height and it is placed from
   * that edge in the view worked in: changing its size changes that too, so
   * its left or top edge stays (ticket 75). Null otherwise.
   */
  const endOffsetOf = (layer: Layer, property: Property): "right" | "bottom" | null => {
    const along = SIZE_AXIS[property];
    if (!along || layer.text) return null;
    const { end } = SIDES[along];
    if (!editor.can(layer, end)) return null;
    const { edge, centered } = placedFrom(working.shown(layer.el), along);
    return edge === "end" && !centered ? end : null;
  };

  /**
   * The offset that places the layer from its container's end edge, `right`
   * or `bottom`, when `property` is its X or Y and it is placed from that
   * edge in the view worked in, centered on where it places it there or not:
   * moving it changes that offset instead, so it stays placed so (ticket 79,
   * ADR 0014). Null otherwise.
   */
  const endPlacingOf = (layer: Layer, property: Property): "right" | "bottom" | null => {
    if ((property !== "x" && property !== "y") || layer.text) return null;
    const { end } = SIDES[property];
    if (!editor.can(layer, end)) return null;
    return placedFrom(working.shown(layer.el), property).edge === "end" ? end : null;
  };

  /**
   * `Editor.set`. `sizeAlone`: a width or height set as a handle sets it,
   * which says where each edge goes; else a layer placed from its right or
   * bottom edge keeps its left or top edge as its size changes, its `right`
   * or `bottom` changed with it.
   */
  const setValue = <P extends Property>(layer: Layer, property: P, value: PropertyValues[P], { continues = false, step = false, variables, sizeAlone = false }: SetOptions & { sizeAlone?: boolean } = {}) => {
    if (!editor.can(layer, property, value)) throw new Error(`03Kind: ${property} cannot be set to ${JSON.stringify(value)} on a ${layer.kind} layer`);
    // A Fixed size of one centered by its auto margins, held by a maximum: that maximum, its size `auto` still, so it goes on filling what room its sides leave where less (ticket 97).
    const held = heldMaxOf(layer, property, value);
    if (held) return setValue(layer, held, (value as Size & { type: "fixed" }).value, { continues, step, variables });
    // A value changed: the views beside the one worked in show it after the next frame, or, for the steps of a run, once they pause.
    views.lagBeside(working.beside, step || stepping, () => {
      // Placed freely at the breakpoint worked in, its X and Y there are where it is placed: the one change.
      if ((property === "x" || property === "y") && editor.changedHere(layer, "absolute")) {
        const place = { ...editor.read(layer, "absolute")!, [property]: value };
        editHere(layer, "absolute", place, continues);
        return;
      }
      // Moved, placed from its container's right or bottom edge: that offset changes the other way, so it stays placed so (ticket 79).
      const placing = sizeAlone ? null : endPlacingOf(layer, property);
      if (placing) {
        const [was, offset] = [editor.read(layer, property as Axis), editor.read(layer, placing)];
        return editHere(layer, placing, round(offset - ((value as number) - was)), continues);
      }
      const end = sizeAlone ? null : endOffsetOf(layer, property);
      if (!end) return editHere(layer, property, value, continues, variables);
      // Its far edge goes as far as its size grows: its left or top edge stays, as in Figma.
      const size = () => editor.measure(layer)[property as "width" | "height"];
      const [was, from] = [size(), editor.read(layer, end)];
      group(() => {
        editHere(layer, property, value, continues, variables);
        editHere(layer, end, round(from - (size() - was)), true);
      }, continues);
    });
  };

  /**
   * The maximum a Fixed width or height (`value`) of `property` sets in its
   * place, `layer` centered by its auto margins that way, its size there
   * `auto`, held by that maximum, in the view worked in (`heldCentered`,
   * ticket 97). Null otherwise.
   */
  const heldMaxOf = (layer: Layer, property: Property, value: unknown): "maxWidth" | "maxHeight" | null => {
    const axis = SIZE_AXIS[property];
    if (!axis || layer.text || (value as Size | null)?.type !== "fixed") return null;
    const el = working.shown(layer.el);
    return asShown(el, () => heldCentered(el, axis)) ? (axis === "x" ? "maxWidth" : "maxHeight") : null;
  };

  /** Set while edits that are steps of a run (`SetOptions.step`) are under way: each value set then is one. */
  let stepping = false;
  /** Makes what `edits` does, steps of a run when `step` (or when it already is). */
  const steppedWhile = <T>(step: boolean, edits: () => T): T => {
    const was = stepping;
    stepping ||= step;
    try {
      return edits();
    } finally {
      stepping = was;
    }
  };
  const editor: Editor = {
    ...structure,
    // The arrow keys nudge, held down or pressed again and again: each nudge is one step of a run.
    nudge: (layers, dx, dy, options) => steppedWhile(true, () => structure.nudge(layers, dx, dy, options)),
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
    set: (layer, property, value, options) => setValue(layer, property, value, options),
    batch(edits, { continues = false, step = false } = {}) {
      steppedWhile(step, () => group(edits, continues));
    },
    resize(layer, { width, height, x, y, right, bottom }, { continues = false } = {}) {
      steppedWhile(true, () =>
        group(
          () => {
            // Each edge where the handle has it: no size keeps an edge of its own accord.
            if (width !== undefined) setValue(layer, "width", { type: "fixed", value: width }, { sizeAlone: true });
            if (x !== undefined) setValue(layer, "x", x);
            if (right !== undefined) setValue(layer, "right", right);
            if (height !== undefined) setValue(layer, "height", { type: "fixed", value: height }, { sizeAlone: true });
            if (y !== undefined) setValue(layer, "y", y);
            if (bottom !== undefined) setValue(layer, "bottom", bottom);
          },
          continues,
          // Each step may set more or less than the one before: a run, apart from any of nudges.
          "resize",
        ),
      );
    },
    undo: steps.undo,
    redo: steps.redo,
    takeBack: steps.takeBack,
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
