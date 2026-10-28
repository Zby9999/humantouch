/**
 * The layers off the canvas (ADR 0009): layers the designer moved out of the
 * canvas, into the room around the views. Each is shown in an iframe of its
 * own in the workspace, where it was let go, as it looked then (its look
 * frozen, `look.ts`). Each is a layer to select and edit like any other, with
 * an editor of its own, whose edits are its own and no change of the round's;
 * they share the canvas's history, so undo goes through both in order. They
 * belong to no round: saved apart from it, they come back wherever the
 * canvas does.
 */
import type { SavedOffCanvasLayer, OffCanvasOrigin } from "../service-protocol";
import { createChangeSet, type ChangeSet } from "./changeset";
import { createEditor, type Editor, type History } from "./edits";
import { editable, fitHeight } from "./freezer";
import type { Layer } from "./layers";
import { freezeLook, serializeLook } from "./look";
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
export const OFF_CANVAS_ATTR = "data-vk-off-canvas";

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
    iframe.className = "vk-off-canvas";
    iframe.title = "Off canvas";
    iframe.setAttribute(OFF_CANVAS_ATTR, id);
    iframe.setAttribute("sandbox", "allow-same-origin");
    // Laid out, to be measured, but out of sight until it is put there.
    iframe.style.visibility = "hidden";
    host.append(iframe);
    write(iframe);
    const doc = iframe.contentDocument!;
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
    outside.fitWidth();
    fitHeight(outside.document, outside.iframe, 0);
    changed();
  }

  return {
    list: () => all.filter((outside) => outside.there),
    of: (node) => all.find((outside) => outside.there && outside.document === (node.ownerDocument ?? node)) ?? null,
    find: (id) => all.find((outside) => outside.id === id) ?? null,
    moveOut(el, at, origin) {
      return show(crypto.randomUUID(), at.x, at.y, origin, null, (iframe) => freezeLook(el, iframe));
    },
    bring,
    put(outside) {
      const found = shown(outside);
      if (found) put(found);
    },
    take(outside) {
      const found = shown(outside);
      if (!found) return;
      found.there = false;
      found.iframe.hidden = true;
      changed();
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
