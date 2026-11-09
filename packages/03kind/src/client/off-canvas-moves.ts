/**
 * Dragging layers between the canvas and the layers off it, and between
 * those (ticket 108; ADR 0009). Each layer off the canvas is a document of
 * its own, with an editor of its own: a layer dragged from one to another is
 * taken out of the one and put into the other, both one step of the history
 * they share (`together`). What the layer is where it goes is what it was
 * where it came from: moved off the canvas this round and not edited since,
 * put back, its deletion is taken back and it moves; drawn off the canvas, it
 * is made anew; else it goes as it looks, with where it came from first.
 */
import type { SavedOffCanvasLayer } from "../service-protocol";
import { DELETED_ATTR, LAYER_ID_ATTR } from "./canvas-style";
import { editsOf, movedOffBy, type Change } from "./changeset";
import type { Destination, Editor } from "./edit-commands";
import type { Layer } from "./layers";
import { remake, type OffCanvas, type OffCanvasLayer } from "./off-canvas";
import { together, type History } from "./undo-steps";
import type { View } from "./views";

/** What the moves work with: the canvas's editor, the layers off it, the history they share, the round's changes now, and the page. */
export interface Desk {
  editor: Editor;
  offCanvas: OffCanvas;
  history: History;
  round(): Change[];
  page: Document;
}

/** What a move came to: the layer where it went (none: it could not go), and the edits that could not be made there (none, but for a bug: then nothing moved). */
export interface Moved<T> {
  moved: T | null;
  missed: Change[];
}

/** Whether `part`, `from` itself or a layer in it, was drawn there with the Frame or text tool: it goes elsewhere made anew (tickets 106, 108). */
export function drawnIn(from: OffCanvasLayer, part: Layer): boolean {
  if (part.el === from.layer()?.el) return !!from.origin.made;
  const id = part.el.getAttribute(LAYER_ID_ATTR);
  return from.changes.list().some((change) => change.kind === "create" && change.layer === id);
}

/** Takes `part`, a layer in `from`, out of it, as a step of its own: deleted there, or gone, if it came in or was made there. */
function takeOut(from: OffCanvasLayer, part: Layer) {
  from.editor.batch(() => {
    const now = from.editor.tree().layerOf(part.el);
    if (now && from.editor.canRemove(now)) from.editor.remove(now);
  });
}

/** The layer off the canvas itself, while it is there. */
const itself = (outside: OffCanvasLayer) => () => [outside.layer()].filter((layer) => layer !== null);

/**
 * `part`, a layer off the canvas (`from`) or one in it, let go at `to` over
 * a view, or in `into`, another layer off the canvas: there; out of where it
 * was. One step, both sides. `copy` (⌥): a copy goes, and it stays.
 */
export function carry(desk: Desk, from: OffCanvasLayer, part: Layer, to: Destination, into: OffCanvasLayer | null, copy = false): Moved<Layer> {
  const { offCanvas, history } = desk;
  const target = into ? into.editor : desk.editor;
  const whole = part.el === from.layer()?.el;
  // Moved off this round and not edited off it, it is the layer that was deleted, back as it was; any other is new.
  // Made in the blank space, it is made anew there, as one drawn there is (ticket 106); what came into it, as it came.
  const drawn = drawnIn(from, part);
  const keptOf = (layer: Layer) => offCanvas.keptOf(from, layer, copy, desk.round());
  // Onto the canvas, a layer in it moved off the canvas this round and not edited is back in its place first, as it was when the designer drew around it, and then moves.
  const undelete = into
    ? undefined
    : (kept: SavedOffCanvasLayer) => {
        const deletion = movedOffBy(desk.round(), kept.id);
        const el = deletion && desk.page.querySelector(`[${LAYER_ID_ATTR}="${CSS.escape(deletion.layer)}"][${DELETED_ATTR}]`);
        if (!deletion || !el || deletion.data || editsOf(kept).length) return null;
        desk.editor.revert(deletion.id);
        return desk.editor.tree().layerOf(el);
      };
  let moved: Layer | null = null;
  let missed: Change[] = [];
  together(history, () => {
    target.batch(() => {
      if (drawn) ({ layer: moved, missed } = remake(target, from, to, { root: part, keptOf, undelete }));
      else moved = target.putBack({ el: part.el, kept: keptOf(part) }, to);
      if (whole && !copy)
        target.along(
          () => offCanvas.take(from),
          () => offCanvas.put(from),
          itself(from),
        );
    });
    if (missed.length || (drawn && !moved)) {
      // Not all of it could be made there: it stays where it was, whole.
      target.undo();
      moved = null;
      return;
    }
    if (!whole && !copy) takeOut(from, part);
  });
  return { moved, missed };
}

/**
 * A layer of the canvas, in `view`, let go in `into`, a layer off the
 * canvas, at `to` there: moved off the canvas, into it. On the page, it is
 * deleted, as one moved into the blank space is; there, it is as it looked
 * in `view`, and where it came from goes with it. One step, both sides.
 * `copy` (⌥): a copy goes, and the layer stays.
 */
export function moveInto(desk: Desk, layer: Layer, view: View, into: OffCanvasLayer, to: Destination, copy: boolean): Layer | null {
  const { editor, history } = desk;
  if (!copy && !editor.canRemove(layer)) return null;
  const own = editor.ownElement(layer);
  const kept: SavedOffCanvasLayer = {
    id: crypto.randomUUID(),
    x: 0,
    y: 0,
    look: "",
    origin: { ...editor.originOf(own), ...(copy && { copy: true as const }), at: new Date().toISOString() },
    edits: { lastId: 0, changes: [] },
  };
  let moved: Layer | null = null;
  together(history, () => {
    // Copied in as it looks, before it is deleted.
    into.editor.batch(() => {
      moved = into.editor.putBack({ el: view.elementOf(own.el) ?? own.el, kept }, to);
    });
    if (!copy) editor.remove(own, { offCanvas: kept.id });
  });
  return moved;
}

/**
 * A layer in `from`, a layer off the canvas, let go in the blank space, its
 * top left at `at`: a layer off the canvas of its own, where it came from
 * with it; no change of the round's. One step, both sides. `copy` (⌥): a
 * copy goes, and it stays.
 */
export function partOff(desk: Desk, from: OffCanvasLayer, part: Layer, at: { x: number; y: number }, copy: boolean): Moved<OffCanvasLayer> {
  const { offCanvas, history } = desk;
  const keptOf = (layer: Layer) => offCanvas.keptOf(from, layer, copy, desk.round());
  let moved: OffCanvasLayer | null = null;
  let missed: Change[] = [];
  together(history, () => {
    if (drawnIn(from, part)) {
      const made = offCanvas.makeFrom(from, part, at, desk.page, keptOf);
      if (made.missed.length) {
        made.outside.editor.undo();
        missed = made.missed;
        return;
      }
      moved = made.outside;
    } else {
      const kept = keptOf(part);
      const outside = offCanvas.moveOut(part.el, at, kept.origin, kept.id);
      outside.editor.along(
        () => offCanvas.put(outside),
        () => offCanvas.take(outside),
        itself(outside),
      );
      moved = outside;
    }
    if (!copy) takeOut(from, part);
  });
  return { moved, missed };
}
