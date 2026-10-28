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
import type { OffCanvasLayer, OffCanvasOrigin } from "../service-protocol";
import { createChangeSet, type ChangeSet } from "./changeset";
import { createEditor, type Editor, type History } from "./edits";
import { editable, fitHeight } from "./freezer";
import type { Layer } from "./layers";
import { freezeLook, serializeLook } from "./look";
import { createViews, type View } from "./views";

/** A layer off the canvas, as shown. */
export interface Aside {
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
}

export interface OffCanvas {
  /** The layers off the canvas now, in the order they came. */
  list(): Aside[];
  /** The layer off the canvas `node` is in, if it is in one there now. */
  of(node: Node): Aside | null;
  /** The layer off the canvas with id `id`, there now or taken away. */
  find(id: string): Aside | null;
  /** A new layer off the canvas, the look of `el` frozen, its top left at `at`; not there until `put`. */
  moveOut(el: Element, at: { x: number; y: number }, origin: OffCanvasOrigin): Aside;
  /** Puts it there; or back, as it was when taken away. */
  put(aside: Aside): void;
  /** Takes it away: no longer there, nor kept. */
  take(aside: Aside): void;
  /** Moves it to `x` and `y` in the workspace. */
  place(aside: Aside, x: number, y: number): void;
  /** What there is now, to keep. */
  save(): OffCanvasLayer[];
  /** Calls `listener` whenever one comes, goes, moves or changes size. Returns what stops it. */
  onChange(listener: () => void): () => void;
}

/** On the iframe that shows a layer off the canvas: its id. */
export const OFF_CANVAS_ATTR = "data-vk-off-canvas";

/** The layers off the canvas, shown in `host`, an element of the workspace, starting with those `saved`. */
export function createOffCanvas(host: HTMLElement, saved: OffCanvasLayer[], history: History): OffCanvas {
  const all: Shown[] = [];
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };

  /** Shows a layer off the canvas: `write` puts its look into the iframe made for it. */
  const show = (id: string, x: number, y: number, origin: OffCanvasOrigin, edits: OffCanvasLayer["edits"] | null, write: (iframe: HTMLIFrameElement) => void): Shown => {
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
    const aside: Shown = {
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
      iframe,
      there: false,
      fitWidth,
    };
    moveTo(aside, x, y);
    iframe.hidden = true;
    iframe.style.visibility = "";
    all.push(aside);
    return aside;
  };
  const moveTo = (aside: Shown, x: number, y: number) => {
    Object.assign(aside, { x: Math.round(x), y: Math.round(y) });
    aside.iframe.style.left = `${aside.x}px`;
    aside.iframe.style.top = `${aside.y}px`;
  };
  const shown = (aside: Aside) => all.find((a) => a === aside) ?? null;

  for (const layer of saved) {
    const aside = show(layer.id, layer.x, layer.y, layer.origin, layer.edits, (iframe) => {
      const doc = iframe.contentDocument!;
      doc.open();
      doc.write(layer.look);
      doc.close();
      editable(doc);
    });
    put(aside);
  }

  function put(aside: Shown) {
    aside.there = true;
    aside.iframe.hidden = false;
    aside.fitWidth();
    fitHeight(aside.document, aside.iframe, 0);
    changed();
  }

  return {
    list: () => all.filter((aside) => aside.there),
    of: (node) => all.find((aside) => aside.there && aside.document === (node.ownerDocument ?? node)) ?? null,
    find: (id) => all.find((aside) => aside.id === id) ?? null,
    moveOut(el, at, origin) {
      return show(crypto.randomUUID(), at.x, at.y, origin, null, (iframe) => freezeLook(el, iframe));
    },
    put(aside) {
      const found = shown(aside);
      if (found) put(found);
    },
    take(aside) {
      const found = shown(aside);
      if (!found) return;
      found.there = false;
      found.iframe.hidden = true;
      changed();
    },
    place(aside, x, y) {
      const found = shown(aside);
      if (!found) return;
      moveTo(found, x, y);
      changed();
    },
    save: () =>
      all
        .filter((aside) => aside.there)
        .map((aside) => ({ id: aside.id, x: aside.x, y: aside.y, look: serializeLook(aside.document), origin: aside.origin, edits: aside.changes.save() })),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A layer off the canvas, with what shows it. */
interface Shown extends Aside {
  iframe: HTMLIFrameElement;
  /** There now, rather than taken away. */
  there: boolean;
  fitWidth(): void;
}
