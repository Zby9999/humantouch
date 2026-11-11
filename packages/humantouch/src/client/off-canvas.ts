/**
 * The layers off the canvas (ADR 0009): layers the designer moved out of the
 * canvas, into the room around the views. Each is shown in an iframe of its
 * own in the workspace, where it was let go, as it looked then (its look
 * frozen, `look.ts`). Each is a layer to select and edit like any other, with
 * an editor of its own, whose edits are its own and no change of the round's;
 * they share the canvas's history, so undo goes through both in order. They
 * belong to no round: saved apart from it, they come back wherever the
 * canvas does. Some are made off the canvas, in the blank space beside the
 * views (ticket 106): put back, they are made anew, as if drawn there.
 */
import type { SavedOffCanvasLayer, OffCanvasOrigin } from "../service-protocol";
import { keepEditStylesApart, LAYER_ID_ATTR } from "./canvas-style";
import { createChangeSet, editsOf, keptIn, madeBy, placedAt, type Target, type Change, type ChangeSet, type Composed, type Created, type Place, type PutBack } from "./changeset";
import type { Destination, Editor } from "./edit-commands";
import { createEditor } from "./edits";
import type { History } from "./undo-steps";
import { NEW_TAGS } from "./checkable";
import { NEW_FILL } from "./paint";
import { editable, fitHeight } from "./freezer";
import type { Layer } from "./layers";
import { blankLook, freezeLook, serializeLook } from "./look";
import type { Property, PropertyValues } from "./property-table";
import { pickedIn } from "./variables";
import { createViews, type View } from "./views";

/** An Off-canvas Layer, as shown; kept as a `SavedOffCanvasLayer`. */
export interface OffCanvasLayer {
  readonly id: string;
  /** Its top left in the workspace, in the desktop view's px from its top left. */
  readonly x: number;
  readonly y: number;
  /** Its size, px. */
  readonly width: number;
  readonly height: number;
  /** What shows it: a document of its own. */
  readonly document: Document;
  /** It, as a view: where its layers are, in its px from its top left. */
  readonly view: View;
  /** Edits it: off the canvas, recorded in a ChangeSet of its own. */
  readonly editor: Editor;
  readonly changes: ChangeSet;
  readonly origin: OffCanvasOrigin;
  /** The layer itself, as its editor's layers are now; null when it has none. */
  layer(): Layer | null;
  /** It as it is now, to keep, or to put back onto the canvas by. */
  keep(): SavedOffCanvasLayer;
}

export interface OffCanvas {
  /** The layers off the canvas now, in the order they came. */
  list(): OffCanvasLayer[];
  /** The layer off the canvas `node` is in, if it is in one there now. */
  of(node: Node): OffCanvasLayer | null;
  /** The layer off the canvas with id `id`, there now or taken away. */
  find(id: string): OffCanvasLayer | null;
  /** A new layer off the canvas, the look of `el` frozen, its top left at `at`; not there until `put`. `id`: the one it had where it came from (ticket 108). */
  moveOut(el: Element, at: { x: number; y: number }, origin: OffCanvasOrigin, id?: string): OffCanvasLayer;
  /**
   * A new layer off the canvas made in the blank space beside the views
   * (ticket 106): a Frame or text, its top left at `at`, `size` as drawn
   * (none: clicked), made by its editor as one is drawn on the canvas, in the
   * body text of `page`, the canvas. It is there at once, one step of the
   * history: undone, it goes. Returns it.
   */
  make(type: Created["type"], at: { x: number; y: number }, size: { width: number; height: number } | undefined, page: Document): OffCanvasLayer;
  /**
   * A new layer off the canvas at `at`, made anew from `part`, a layer drawn
   * in `from`, another layer off it, with the Frame or text tool (ticket 108):
   * all that was drawn and edited in it made again by its own editor, as in
   * one made in the blank space. It is there at once, one step of the
   * history. Returns it, and the edits that could not be made there: none,
   * but for a bug, for which the caller takes it back.
   */
  makeFrom(from: OffCanvasLayer, part: Layer, at: { x: number; y: number }, page: Document, keptOf: (part: Layer) => SavedOffCanvasLayer): { outside: OffCanvasLayer; missed: Change[] };
  /**
   * `part`, a layer off the canvas or one in it (`from`), as it goes
   * elsewhere (ticket 108), to be kept there: its look now, where it came
   * from first, and what was edited since. `copy`: a copy of it goes.
   * `round`: the round's changes; a layer whose code went in a round before
   * has none read.
   */
  keptOf(from: OffCanvasLayer, part: Layer, copy: boolean, round: Change[]): SavedOffCanvasLayer;
  /** One kept, `layer`, shown again as it was kept; not there until `put`. */
  bring(layer: SavedOffCanvasLayer): OffCanvasLayer;
  /** Puts it there; or back, as it was when taken away. */
  put(outside: OffCanvasLayer): void;
  /** Takes it away: no longer there, nor kept. */
  take(outside: OffCanvasLayer): void;
  /** Moves it to `x` and `y` in the workspace. */
  place(outside: OffCanvasLayer, x: number, y: number): void;
  /** What there is now, to keep. */
  save(): SavedOffCanvasLayer[];
  /** Calls `listener` whenever one comes, goes, moves or changes size. Returns what stops it. */
  onChange(listener: () => void): () => void;
}

/** On the iframe that shows a layer off the canvas: its id. */
export const OFF_CANVAS_ATTR = "data-ht-off-canvas";

/** The layer off the canvas itself, while it is there: what an edit that puts it there or takes it away is made to. */
export const itself = (outside: OffCanvasLayer) => () => [outside.layer()].filter((layer) => layer !== null);

/** The layers off the canvas, shown in `host`, an element of the workspace, starting with those `saved`. */
export function createOffCanvas(host: HTMLElement, saved: SavedOffCanvasLayer[], history: History): OffCanvas {
  const all: Shown[] = [];
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };

  /** Shows a layer off the canvas: `write` puts its look into the iframe made for it. */
  const show = (id: string, x: number, y: number, origin: OffCanvasOrigin, edits: SavedOffCanvasLayer["edits"] | null, write: (iframe: HTMLIFrameElement) => void): Shown => {
    const iframe = host.ownerDocument.createElement("iframe");
    iframe.className = "ht-off-canvas";
    iframe.title = "Off canvas";
    iframe.setAttribute(OFF_CANVAS_ATTR, id);
    iframe.setAttribute("sandbox", "allow-same-origin");
    // Laid out, to be measured, but out of sight until it is put there.
    iframe.style.visibility = "hidden";
    host.append(iframe);
    write(iframe);
    const doc = iframe.contentDocument!;
    // Its look, edits and all, is written out, put back and read by the Agent as it always was.
    keepEditStylesApart(doc);
    // As wide as the layer, whatever it comes to: the views follow only their height.
    const fitWidth = () => {
      const width = `${Math.ceil(doc.body.getBoundingClientRect().width)}px`;
      if (iframe.hidden || iframe.style.width === width) return;
      iframe.style.width = width;
      changed();
    };
    fitWidth();
    new (doc.defaultView!.ResizeObserver)(fitWidth).observe(doc.body);
    const views = createViews({ document: doc, width: 0, height: fitHeight(doc, iframe, 0), windowHeight: 0, scrollY: 0 });
    views.onResize(changed);
    const changes = createChangeSet(edits ?? undefined);
    const editor = createEditor(views, changes, null, { history, sources: false });
    const outside: Shown = {
      id,
      x,
      y,
      get width() {
        return parseFloat(iframe.style.width) || 0;
      },
      get height() {
        return parseFloat(iframe.style.height) || 0;
      },
      document: doc,
      view: views.list()[0],
      editor,
      changes,
      origin,
      layer: () => editor.tree().root.children[0] ?? null,
      keep: () => ({ id, x: outside.x, y: outside.y, look: serializeLook(doc), origin, edits: changes.save() }),
      iframe,
      there: false,
      fitWidth,
    };
    moveTo(outside, x, y);
    iframe.hidden = true;
    iframe.style.visibility = "";
    all.push(outside);
    return outside;
  };
  const moveTo = (outside: Shown, x: number, y: number) => {
    Object.assign(outside, { x: Math.round(x), y: Math.round(y) });
    outside.iframe.style.left = `${outside.x}px`;
    outside.iframe.style.top = `${outside.y}px`;
  };
  const shown = (outside: OffCanvasLayer) => all.find((a) => a === outside) ?? null;

  /** Shows `layer`, as kept. */
  const bring = (layer: SavedOffCanvasLayer) =>
    show(layer.id, layer.x, layer.y, structuredClone(layer.origin), layer.edits, (iframe) => {
      const doc = iframe.contentDocument!;
      doc.open();
      doc.write(layer.look);
      doc.close();
      editable(doc);
    });
  for (const layer of saved) put(bring(layer));

  function put(outside: Shown) {
    outside.there = true;
    outside.iframe.hidden = false;
    fit(outside);
  }
  /** Makes it as big as what it shows, now. */
  function fit(outside: Shown) {
    outside.fitWidth();
    fitHeight(outside.document, outside.iframe, 0);
    changed();
  }
  function take(outside: Shown) {
    outside.there = false;
    outside.iframe.hidden = true;
    changed();
  }
  /** The look of `el`, a layer off the canvas or one in it, as it is now, frozen, as a layer moved off the canvas has it. */
  function lookOf(el: Element): string {
    const iframe = host.ownerDocument.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-same-origin");
    iframe.style.visibility = "hidden";
    host.append(iframe);
    try {
      freezeLook(el, iframe);
      return serializeLook(iframe.contentDocument!);
    } finally {
      iframe.remove();
    }
  }

  return {
    list: () => all.filter((outside) => outside.there),
    of: (node) => all.find((outside) => outside.there && outside.document === (node.ownerDocument ?? node)) ?? null,
    // One there now first: a layer that goes into another off the canvas and out again has the id it had (ticket 108), so two may have it, the first taken away, the second there.
    // Undone, the second is taken away too and the layer is in the other again: then the latest, which a redo puts there again; the first is there again only once its going in is undone, and found then.
    find: (id) => all.find((outside) => outside.id === id && outside.there) ?? [...all].reverse().find((outside) => outside.id === id) ?? null,
    moveOut(el, at, origin, id = crypto.randomUUID()) {
      return show(id, at.x, at.y, origin, null, (iframe) => freezeLook(el, iframe));
    },
    makeFrom(from, part, at, page, keptOf) {
      const type = (from.changes.list().find((change) => change.kind === "create" && change.layer === part.el.getAttribute(LAYER_ID_ATTR))!.after as Created).type;
      const outside = show(crypto.randomUUID(), at.x, at.y, madeOrigin(type), null, (iframe) => blankLook(page, iframe));
      const { editor } = outside;
      let missed: Change[] = [];
      editor.batch(() => {
        editor.along(
          () => put(outside),
          () => take(outside),
          itself(outside),
        );
        ({ missed } = remake(editor, from, { parent: editor.tree().root, index: 0 }, { root: part, keptOf }));
        editor.along(
          () => fit(outside),
          () => {},
          itself(outside),
        );
      });
      return { outside, missed };
    },
    keptOf(from, part, copy, round) {
      const root = from.layer();
      const at = new Date().toISOString();
      if (root && part.el === root.el) {
        const kept = from.keep();
        return copy ? { ...kept, id: crypto.randomUUID(), origin: { ...kept.origin, copy: true, at } } : kept;
      }
      const changes = from.changes.list();
      const makerOf = (el: Element) => changes.find((change) => madeBy(change) === el.getAttribute(LAYER_ID_ATTR)) ?? null;
      // The layer it came into this one as, from elsewhere: itself, or the one it is in; none, when in it from the start.
      let came: Change | null = null;
      for (let el: Element | null = part.el; el && el !== root?.el && !came; el = el.parentElement) if (makerOf(el)?.kind === "putBack") came = makerOf(el);
      // Else moved out of one that came in, it or a layer it is in: still written in that one's code, where it was in it.
      let movedOut: { layer: Layer; from: Layer } | null = null;
      for (let layer: Layer | null = part; layer && layer.el !== root?.el && !came; layer = layer.parent) {
        const id = layer.el.getAttribute(LAYER_ID_ATTR);
        const move = changes.find((change) => change.kind === "move" && change.layer === id);
        const was = move && from.document.querySelector(`[${LAYER_ID_ATTR}="${CSS.escape((move.before as Place).container.layer)}"]`);
        for (let el = was || null; el && el !== root?.el && !came; el = el.parentElement) {
          if (makerOf(el)?.kind !== "putBack") continue;
          came = makerOf(el);
          movedOut = { layer, from: from.editor.tree().layerOf(was!)! };
        }
      }
      const edits = editedWithin(from, part);
      const look = lookOf(part.el);
      // Where it is in the workspace now: there, off the canvas again, once its putting back is taken back.
      const box = part.el.getBoundingClientRect();
      const [x, y] = [Math.round(from.x + box.left), Math.round(from.y + box.top)];
      const none = { lastId: 0, changes: [] };
      if (came && came.layer === part.el.getAttribute(LAYER_ID_ATTR)) {
        // Where it came from first, all it was edited since going with it.
        const kept = (came.after as PutBack).layer;
        const { edits: _, ...origin } = kept.origin;
        const all = [...editsOf(kept), ...edits];
        return { id: copy ? crypto.randomUUID() : kept.id, x, y, look, origin: { ...origin, ...(copy && { copy: true as const, at }), ...(all.length && { edits: all }) }, edits: none };
      }
      // Written in the code of the layer it came in with, or of this one: found by the way down from there.
      const within = came ? (came.after as PutBack).layer : { id: from.id, origin: from.origin };
      const top = came ? from.document.querySelector(`[${LAYER_ID_ATTR}="${CSS.escape(came.layer)}"]`) : root?.el;
      let copied = copy || !!within.origin.copy;
      /** The names of the layers from `start` up to `stop`, not it, the outermost first. */
      const wayUp = (start: Layer | null, stop: Element | null | undefined) => {
        const names: string[] = [];
        for (let layer = start; layer && layer.el !== stop; layer = layer.parent) {
          names.unshift(layer.name);
          // In a copy made here, its code stays where it is, the layer it copies with it.
          if (makerOf(layer.el)?.kind === "duplicate") copied = true;
        }
        return names;
      };
      const way = movedOut ? [...wayUp(movedOut.from, top), ...wayUp(part, movedOut.layer.el.parentElement)] : wayUp(part, top);
      const own = from.editor.originOf(part);
      const { made: _, ...target } = own.target;
      // Its code is in that layer's code, unless that is new, or a copy of a layer that stayed.
      const inCode = !within.origin.made && !copied;
      return {
        id: crypto.randomUUID(),
        x,
        y,
        look,
        origin: {
          target: { ...target, instances: 1, unlocated: !target.loc, context: { ...target.context, path: [...within.origin.target.context.path, ...way] } },
          place: null,
          written: own.written,
          // Read now, while the code is there: none, once that layer's code went in a round before (`inside` names it).
          ...((!own.written || (inCode && !round.some((change) => change.kind === "delete" && change.offCanvas === within.id))) && { snippet: null }),
          ...(copied && { copy: true as const }),
          ...(inCode && { inside: within.id }),
          ...(edits.length && { edits }),
          at,
        },
        edits: none,
      };
    },
    make(type, at, size, page) {
      const outside = show(crypto.randomUUID(), at.x, at.y, madeOrigin(type), null, (iframe) => blankLook(page, iframe));
      const { editor } = outside;
      editor.batch(() => {
        // There first, to be laid out as it is made; then as big as it is made.
        editor.along(
          () => put(outside),
          () => take(outside),
          itself(outside),
        );
        const made = editor.create(type, { parent: editor.tree().root, index: 0 }, size);
        // A Frame white, as one drawn on an empty Figma canvas (designer, 2026-11-09): a fill of its own, put back with it.
        if (type === "frame") editor.set(made, "fill", NEW_FILL);
        editor.along(
          () => fit(outside),
          () => {},
          itself(outside),
        );
      });
      return outside;
    },
    bring,
    put(outside) {
      const found = shown(outside);
      if (found) put(found);
    },
    take(outside) {
      const found = shown(outside);
      if (found) take(found);
    },
    place(outside, x, y) {
      const found = shown(outside);
      if (!found) return;
      moveTo(found, x, y);
      changed();
    },
    save: () => all.filter((outside) => outside.there).map((outside) => outside.keep()),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A layer off the canvas, with what shows it. */
interface Shown extends OffCanvasLayer {
  iframe: HTMLIFrameElement;
  /** There now, rather than taken away. */
  there: boolean;
  fitWidth(): void;
}

/** The layers that came into `outside` from elsewhere (ticket 108), all the way down, each as kept with the change that brought it in, as it is now. */
export function cameInto(outside: OffCanvasLayer): SavedOffCanvasLayer[] {
  return keptIn({ id: outside.id, x: outside.x, y: outside.y, look: "", origin: outside.origin, edits: { lastId: 0, changes: outside.changes.list() } });
}

/** Where a layer made in the blank space with the Frame or text tool comes from (ticket 106): nowhere. */
function madeOrigin(type: Created["type"]): OffCanvasOrigin {
  // How the Agent would find it, were it asked to: a new layer, in no source, on no page.
  const target: Target = { loc: null, chain: [], component: null, instances: 1, locked: false, unlocated: true, context: { path: [type === "frame" ? "Frame" : "Text"], element: `<${NEW_TAGS[type]}>` } };
  return { target, place: null, written: null, snippet: null, made: type, at: new Date().toISOString() };
}

/**
 * The edits of `outside` made in `part`, a layer in it, as it is now
 * (ticket 108): to it (its style, words, brief, layout; not where it is),
 * to any layer in it, and what went into it or out of it. Its look has
 * them: they go with it, as it goes elsewhere.
 */
export function editedWithin(outside: OffCanvasLayer, part: Layer): Change[] {
  const id = part.el.getAttribute(LAYER_ID_ATTR);
  const elementOf = (layer: string) => outside.document.querySelector(`[${LAYER_ID_ATTR}="${CSS.escape(layer)}"]`);
  const within = (layer: string) => {
    const el = elementOf(layer);
    return !!el && part.el.contains(el);
  };
  return outside.changes.list().filter((change) => {
    if (change.layer === id) return !["create", "duplicate", "putBack", "move", "delete"].includes(change.kind);
    const into = placedAt(change);
    return within(change.layer) || (!!into && within(into.container.layer)) || (change.kind === "move" && within((change.before as Place).container.layer));
  });
}

/**
 * Puts `outside`, a layer made in the blank space (ticket 106), onto the
 * canvas `editor` edits, at `to`, as edits of its batch: it is made anew
 * there, with what was drawn and edited in it off the canvas, by the same
 * edits, in the order they were first made, each as it is now, at every
 * width. So the round has what drawing it there would have given it; but
 * the change that makes it keeps it as it was off the canvas, to be there
 * again once that is taken back. An edit whose layer or place is not made
 * yet (one recorded first before what it went into was drawn, as the
 * ChangeSet keeps a change at its first place) is made once it is.
 * Returns the layer on the canvas, and the edits that could not be made
 * there at all: none, but for a bug, for which the caller takes it back.
 *
 * A layer that came into it from elsewhere (ticket 108), the canvas or
 * another layer off it, goes there as it came, by `keptOf`, as one put back
 * does (`Editor.putBack`): moved off the canvas this round and not edited,
 * its deletion is taken back and it moves there. What was edited in it goes
 * with it, in its look. `root`: a layer drawn in it, made anew alone (as
 * `editor` is another layer off the canvas's, say), with what is in it.
 */
export function remake(
  editor: Editor,
  outside: OffCanvasLayer,
  to: Destination,
  {
    root = outside.layer()!,
    keptOf,
    undelete,
  }: {
    root?: Layer;
    keptOf?: (part: Layer) => SavedOffCanvasLayer;
    /** Takes back the deletion that moved `kept` off the canvas this round, if it is not edited since: the layer back in its place, to move; null, none to take back. */
    undelete?: (kept: SavedOffCanvasLayer) => Layer | null;
  } = {},
): { layer: Layer | null; missed: Change[] } {
  const rootId = root.el.getAttribute(LAYER_ID_ATTR)!;
  const whole = root.el === outside.layer()?.el;
  const kept = whole ? outside.keep() : undefined;
  const elementOf = (id: string) => outside.document.querySelector(`[${LAYER_ID_ATTR}="${CSS.escape(id)}"]`);
  // Alone, only what is in it now: its own edits, and those of what was drawn or is in it.
  const all = [...outside.changes.list()].filter((change) => whole || root.el.contains(elementOf(change.layer))).sort((a, b) => a.id - b.id);
  // What came in from elsewhere takes what was edited in it along, in its look.
  const parts = all.filter((change) => change.kind === "putBack").map((change) => outside.editor.tree().layerOf(elementOf(change.layer)!)!);
  const carried = new Set(parts.flatMap((part) => editedWithin(outside, part)));
  // A layer moved out of one of them, into none, goes as one that came in does, where it is now, what was edited in it with it: written in the code of the one it came in with (`keptOf`).
  const strays = new Set([...carried].filter((change) => change.kind === "move" && !parts.some((part) => part.el.contains(elementOf(change.layer)))));
  for (const stray of strays) {
    carried.delete(stray);
    const el = elementOf(stray.layer);
    if (el) for (const change of editedWithin(outside, outside.editor.tree().layerOf(el)!)) carried.add(change);
  }
  const changes = all.filter((change) => !carried.has(change));
  /** The layers off the canvas that its own changes make: on the canvas once those are made again. */
  const made = new Set(changes.map(madeBy).filter((id) => id !== null));
  /** The ids of its layers off the canvas, each with that of the layer it is made on the canvas. */
  const ids = new Map<string, string>();
  const keep = (from: string, layer: Layer) => ids.set(from, layer.el.getAttribute(LAYER_ID_ATTR)!);
  const byId = (id: string): Layer | null => {
    const el = editor.tree().root.el.ownerDocument.querySelector(`[${LAYER_ID_ATTR}="${CSS.escape(id)}"]`);
    return el && editor.tree().layerOf(el);
  };
  /**
   * The layer on the canvas that the layer `id` off it is: one made there,
   * else one in it, by its way down from there (a layer of a copy, say).
   * Null while it, or what it is in, is not made there yet.
   */
  const layerOf = (id: string): Layer | null => {
    if (ids.has(id)) return byId(ids.get(id)!);
    if (made.has(id)) return null;
    let el = outside.document.querySelector(`[${LAYER_ID_ATTR}="${CSS.escape(id)}"]`);
    const way: number[] = [];
    while (el?.parentElement && !ids.has(el.getAttribute(LAYER_ID_ATTR) ?? "")) {
      way.unshift([...el.parentElement.children].indexOf(el));
      el = el.parentElement;
      if (made.has(el.getAttribute(LAYER_ID_ATTR) ?? "") && !ids.has(el.getAttribute(LAYER_ID_ATTR)!)) return null;
    }
    let there = el && ids.has(el.getAttribute(LAYER_ID_ATTR) ?? "") ? byId(ids.get(el.getAttribute(LAYER_ID_ATTR)!)!)?.el : undefined;
    for (const i of way) there = there?.children[i];
    return there ? editor.tree().layerOf(there) : null;
  };
  /** Where `place` is on the canvas: in its container's layout, or placed freely in it. */
  const destination = (place: Place): Destination | null => {
    const parent = layerOf(place.container.layer);
    if (!parent) return null;
    return place.absolute ? { parent, x: place.absolute.x, y: place.absolute.y } : { parent, index: place.nth - 1 };
  };
  /** Makes `change` again on the canvas; false, and nothing made, when what it needs is not there yet. */
  const makeAgain = (change: Change): boolean => {
    switch (change.kind) {
      case "create": {
        const created = change.after as Created;
        const at = change.layer === rootId ? into : destination(created.place);
        if (!at || !editor.canHold(at.parent)) return false;
        const size = created.type === "frame" ? { width: created.width!, height: created.height! } : created.width !== null ? { width: created.width, height: 0 } : undefined;
        keep(change.layer, editor.create(created.type, at, size, change.layer === rootId ? kept : undefined));
        if (created.text !== undefined) editor.setText(layerOf(change.layer)!, created.text);
        if (created.brief) editor.setBrief(layerOf(change.layer)!, created.brief);
        return true;
      }
      case "duplicate": {
        // The layer copied, where it was then, placed freely or not; the copy right after it (⌘D), or where it was let go (⌥ and a drag).
        const [from, after] = [change.before as Place, change.after as Place];
        const original = layerOf(from.container.layer)?.children[from.nth - 1];
        const rightAfter = after.container.layer === from.container.layer && (after.absolute ? JSON.stringify(after.absolute) === JSON.stringify(from.absolute) : after.nth === from.nth + 1);
        const at = rightAfter ? undefined : destination(after);
        if (!original || at === null || !editor.canDuplicate(original)) return false;
        keep(change.layer, editor.duplicate(original, at));
        return true;
      }
      case "stack": {
        const { place, layers } = change.after as Composed;
        const stacked = place ? layers.map((member) => layerOf(member.layer)) : [layerOf(change.layer)];
        if (!stacked.every((layer) => layer !== null) || !editor.canStack(stacked as Layer[])) return false;
        keep(change.layer, editor.stack(stacked as Layer[]));
        return true;
      }
      case "move": {
        const at = destination(change.after as Place);
        if (strays.has(change)) {
          const el = elementOf(change.layer);
          if (!keptOf || !el || !at || !editor.canHold(at.parent)) return false;
          keep(change.layer, editor.putBack({ el, kept: keptOf(outside.editor.tree().layerOf(el)!) }, at));
          return true;
        }
        const layer = layerOf(change.layer);
        if (!layer || !at || !editor.canDrop(layer, at.parent)) return false;
        editor.move(layer, at);
        return true;
      }
      case "delete": {
        const layer = layerOf(change.layer);
        if (!layer || !editor.canRemove(layer)) return false;
        editor.remove(layer);
        return true;
      }
      case "style":
      case "text":
      case "brief":
      case "unstack": {
        const layer = layerOf(change.layer);
        if (!layer) return false;
        if (change.kind === "style") editor.set(layer, change.property as Property, change.after as PropertyValues[Property], { variables: pickedIn(change.variables) });
        else if (change.kind === "text") editor.setText(layer, change.after as string);
        else if (change.kind === "brief") editor.setBrief(layer, change.after as string);
        else if (editor.canUnstack(layer)) editor.unstack(layer);
        else return false;
        return true;
      }
      // Came in from elsewhere: there, as it came, what was edited in it with it.
      case "putBack": {
        const el = elementOf(change.layer);
        const at = destination((change.after as PutBack).place);
        const was = back.get(change.layer);
        if (was && at) {
          // Back in its place already: it moves, let go by its border box, placed by its margin box.
          const layer = editor.tree().layerOf(was);
          if (!layer || !editor.canDrop(layer, at.parent)) return false;
          const style = getComputedStyle(was);
          keep(change.layer, editor.move(layer, "x" in at ? { parent: at.parent, x: Math.round(at.x - parseFloat(style.marginLeft)), y: Math.round(at.y - parseFloat(style.marginTop)) } : at));
          return true;
        }
        if (!keptOf || !el || !at || !editor.canHold(at.parent)) return false;
        keep(change.layer, editor.putBack({ el, kept: keptOf(outside.editor.tree().layerOf(el)!) }, at));
        return true;
      }
      default: {
        const unknown: never = change.kind;
        throw new Error(`Human Touch: no way to make a ${String(unknown)} change again`);
      }
    }
  };
  let left = changes.filter((change) => !change.breakpoint && change.scope !== "component");
  // Off the canvas there is one view, and no component to promote to: a change at a breakpoint or to a component is none of its.
  const missed = changes.filter((change) => !left.includes(change));
  // Known before anything is made: then nothing is, and no deletion is taken back for it.
  if (missed.length) return { layer: null, missed };
  /** Its layers that came from the canvas this round, their deletions taken back first: each back in its place, as it was when the designer drew around it. */
  const back = new Map<string, Element>();
  let into = to;
  editor.inDesktop(() => {
    if (undelete && keptOf) {
      const next = "index" in to ? (to.parent.children[to.index]?.el ?? null) : null;
      for (const change of changes) {
        const el = change.kind === "putBack" && elementOf(change.layer);
        const layer = el && undelete(keptOf(outside.editor.tree().layerOf(el)!));
        if (layer) back.set(change.layer, layer.el);
      }
      // The change that makes it keeps which went back as they were: that change taken back, they are on the canvas again, and no longer in it.
      if (kept && back.size) kept.back = [...back.keys()];
      // Where it goes, among the layers there now.
      const parent = back.size ? editor.tree().layerOf(to.parent.el) : null;
      if (parent && "index" in to) {
        const i = next ? parent.children.findIndex((child) => child.el === next) : -1;
        into = { parent, index: i < 0 ? parent.children.length : i };
      } else if (parent) into = { ...to, parent };
    }
    // Round after round, each in its order, until a round makes none.
    for (let before = -1; left.length && left.length !== before; ) {
      before = left.length;
      left = left.filter((change) => !makeAgain(change));
    }
  });
  return { layer: ids.has(rootId) ? byId(ids.get(rootId)!) : null, missed: [...missed, ...left] };
}
