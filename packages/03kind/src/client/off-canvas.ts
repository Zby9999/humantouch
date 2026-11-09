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
import { createChangeSet, madeBy, type Target, type Change, type ChangeSet, type Composed, type Created, type Place } from "./changeset";
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
  /** A new layer off the canvas, the look of `el` frozen, its top left at `at`; not there until `put`. */
  moveOut(el: Element, at: { x: number; y: number }, origin: OffCanvasOrigin): OffCanvasLayer;
  /**
   * A new layer off the canvas made in the blank space beside the views
   * (ticket 106): a Frame or text, its top left at `at`, `size` as drawn
   * (none: clicked), made by its editor as one is drawn on the canvas, in the
   * body text of `page`, the canvas. It is there at once, one step of the
   * history: undone, it goes. Returns it.
   */
  make(type: Created["type"], at: { x: number; y: number }, size: { width: number; height: number } | undefined, page: Document): OffCanvasLayer;
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
export const OFF_CANVAS_ATTR = "data-tk-off-canvas";

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
    iframe.className = "tk-off-canvas";
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

  return {
    list: () => all.filter((outside) => outside.there),
    of: (node) => all.find((outside) => outside.there && outside.document === (node.ownerDocument ?? node)) ?? null,
    find: (id) => all.find((outside) => outside.id === id) ?? null,
    moveOut(el, at, origin) {
      return show(crypto.randomUUID(), at.x, at.y, origin, null, (iframe) => freezeLook(el, iframe));
    },
    make(type, at, size, page) {
      // How the Agent would find it, were it asked to: a new layer, in no source, on no page.
      const target: Target = { loc: null, chain: [], component: null, instances: 1, locked: false, unlocated: true, context: { path: [type === "frame" ? "Frame" : "Text"], element: `<${NEW_TAGS[type]}>` } };
      const origin: OffCanvasOrigin = { target, place: null, written: null, snippet: null, made: type, at: new Date().toISOString() };
      const outside = show(crypto.randomUUID(), at.x, at.y, origin, null, (iframe) => blankLook(page, iframe));
      const { editor } = outside;
      const itself = () => [outside.layer()].filter((layer) => layer !== null);
      editor.batch(() => {
        // There first, to be laid out as it is made; then as big as it is made.
        editor.along(
          () => put(outside),
          () => take(outside),
          itself,
        );
        const made = editor.create(type, { parent: editor.tree().root, index: 0 }, size);
        // A Frame white, as one drawn on an empty Figma canvas (designer, 2026-11-09): a fill of its own, put back with it.
        if (type === "frame") editor.set(made, "fill", NEW_FILL);
        editor.along(
          () => fit(outside),
          () => {},
          itself,
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
 */
export function remake(editor: Editor, outside: OffCanvasLayer, to: Destination): { layer: Layer | null; missed: Change[] } {
  const rootId = outside.layer()!.el.getAttribute(LAYER_ID_ATTR)!;
  const kept = outside.keep();
  const changes = [...outside.changes.list()].sort((a, b) => a.id - b.id);
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
        const at = change.layer === rootId ? to : destination(created.place);
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
        const layer = layerOf(change.layer);
        const at = destination(change.after as Place);
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
      // Never off the canvas: only the canvas puts back.
      case "putBack":
        return false;
      default: {
        const unknown: never = change.kind;
        throw new Error(`03Kind: no way to make a ${String(unknown)} change again`);
      }
    }
  };
  let left = changes.filter((change) => !change.breakpoint && change.scope !== "component");
  // Off the canvas there is one view, and no component to promote to: a change at a breakpoint or to a component is none of its.
  const missed = changes.filter((change) => !left.includes(change));
  editor.inDesktop(() => {
    // Round after round, each in its order, until a round makes none.
    for (let before = -1; left.length && left.length !== before; ) {
      before = left.length;
      left = left.filter((change) => !makeAgain(change));
    }
  });
  return { layer: ids.has(rootId) ? byId(ids.get(rootId)!) : null, missed: [...missed, ...left] };
}
