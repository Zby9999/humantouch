import { afterEach, describe, expect, test } from "vitest";
import { putBackBy, withDependents, type Change, type PutBack } from "../src/client/changeset";
import type { Destination } from "../src/client/edit-commands";
import { createEditor } from "../src/client/edits";
import type { Layer } from "../src/client/layers";
import { cameInto, createOffCanvas, type OffCanvasLayer } from "../src/client/off-canvas";
import { carry, moveInto, partOff, takenBackOff, type Desk } from "../src/client/off-canvas-moves";
import { createChangeSet } from "../src/client/changeset";
import { createHistory, together } from "../src/client/undo-steps";
import { createViews } from "../src/client/views";

/** A page with room to draw in: a card of a title and words, and a heading, each where the source writes it. */
const PAGE = `<!DOCTYPE html>
<style>
  body { margin: 0; color: rgb(68, 64, 60); font-family: Georgia, serif; font-size: 18px; line-height: 1.8 }
  main { position: relative; width: 600px; height: 400px }
  .card { display: flex; flex-direction: column; gap: 12px; padding: 20px; width: 240px; background: rgb(255, 255, 255) }
  .card h3 { margin: 0; font: 700 24px sans-serif; color: rgb(10, 10, 10) }
  h2 { margin: 0; font-size: 30px; color: rgb(200, 0, 0) }
</style>
<body><main data-ht-loc="src/App.tsx:3:5">
  <h2 data-ht-loc="src/App.tsx:4:7">Heading</h2>
  <article class="card" data-ht-loc="src/Card.tsx:3:5"><h3 data-ht-loc="src/Card.tsx:4:7">Title</h3><p data-ht-loc="src/Card.tsx:5:7">Words</p></article>
</main></body>`;

const made: HTMLElement[] = [];
afterEach(() => {
  for (const el of made.splice(0)) el.remove();
});

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | undefined {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
}

/** The page as a canvas to edit, the layers off it, and what dragging between them works with. */
function canvas() {
  const iframe = document.createElement("iframe");
  iframe.style.width = "800px";
  iframe.style.height = "600px";
  document.body.append(iframe);
  made.push(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(PAGE);
  doc.close();
  const history = createHistory();
  const changes = createChangeSet();
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const editor = createEditor(views, changes, null, { history });
  const host = document.createElement("div");
  document.body.append(host);
  made.push(host);
  const offCanvas = createOffCanvas(host, [], history);
  const desk: Desk = { editor, offCanvas, history, round: () => changes.list(), page: doc };
  const layerOf = (el: Element) => find(editor.tree().root, (layer) => layer.el === el && !layer.text)!;
  const layerIn = (outside: OffCanvasLayer, el: Element) => find(outside.editor.tree().root, (layer) => layer.el === el && !layer.text)!;
  /** A Frame made in the blank space, as the designer draws one with F (ticket 106). */
  const frame = () => offCanvas.make("frame", { x: -400, y: 0 }, { width: 300, height: 200 }, doc);
  /** Moves the layer of `el` off the canvas whole, as the designer drags it into the blank space. */
  const moveOff = (el: Element) => {
    const layer = layerOf(el);
    const outside = offCanvas.moveOut(el, { x: -400, y: 300 }, { ...editor.originOf(layer), at: "2026-11-09T00:00:00.000Z" });
    editor.batch(() => {
      editor.remove(layer, { offCanvas: outside.id });
      editor.along(
        () => offCanvas.put(outside),
        () => offCanvas.take(outside),
      );
    });
    return outside;
  };
  const view = views.list()[0];
  const main = () => layerOf(doc.querySelector("main")!);
  return { doc, changes, editor, offCanvas, desk, layerOf, layerIn, frame, moveOff, view, main, history };
}

/** The changes as the Agent reads them, but where one made off the canvas came from. */
const kinds = (list: Change[]) => list.map((change) => change.kind);
const cameIn = (outside: OffCanvasLayer) => outside.changes.list().filter((change) => change.kind === "putBack");

describe("a layer of the canvas dragged into a layer off it (ticket 108)", () => {
  test("is deleted on the page, as one moved off the canvas is, and in it there, as it looked, where it came from with it; one undo takes both back", () => {
    const { doc, changes, editor, desk, layerOf, frame, view } = canvas();
    const outside = frame();
    const heading = doc.querySelector("h2")!;
    const before = outside.changes.list().length;

    const moved = moveInto(desk, layerOf(heading), view, outside, { parent: outside.layer()!, x: 10, y: 20 }, false)!;

    const [came] = cameIn(outside);
    const kept = (came.after as PutBack).layer;
    expect(changes.list()).toMatchObject([{ kind: "delete", offCanvas: kept.id }]);
    expect(kept.origin).toMatchObject({ written: "src/App.tsx:4:7", target: { loc: "src/App.tsx:4:7" } });
    expect(moved.el.ownerDocument).toBe(outside.document);
    expect(moved.el.parentElement).toBe(outside.layer()!.el);
    expect(moved.el.textContent).toBe("Heading");
    expect(getComputedStyle(moved.el).color).toBe("rgb(200, 0, 0)");
    expect(getComputedStyle(heading).display).toBe("none");

    editor.undo();
    expect(changes.list()).toEqual([]);
    expect(outside.changes.list()).toHaveLength(before);
    expect(outside.document.querySelector("h2")).toBeNull();
    expect(getComputedStyle(heading).display).toBe("block");
    editor.redo();
    expect(changes.list()).toHaveLength(1);
    expect(outside.document.querySelector("h2")).not.toBeNull();
  });

  test("with ⌥, a copy goes in, and the page stays as it is", () => {
    const { doc, changes, desk, layerOf, frame, view } = canvas();
    const outside = frame();

    moveInto(desk, layerOf(doc.querySelector("h2")!), view, outside, { parent: outside.layer()!, x: 0, y: 0 }, true);

    expect(changes.list()).toEqual([]);
    expect((cameIn(outside)[0].after as PutBack).layer.origin.copy).toBe(true);
  });

  test("into a Frame made in the blank space, the Frame put back: made anew there, the layer moved into it, its deletion gone, as a move of its code", () => {
    const { doc, changes, editor, offCanvas, desk, layerOf, frame, view, main } = canvas();
    const outside = frame();
    const heading = doc.querySelector("h2")!;
    moveInto(desk, layerOf(heading), view, outside, { parent: outside.layer()!, x: 10, y: 20 }, false);

    const { moved: back, missed } = carry(desk, outside, outside.layer()!, { parent: main(), x: 300, y: 40 }, null);

    expect(missed).toEqual([]);
    expect(kinds(changes.list())).toEqual(["create", "style", "move"]);
    const move = changes.list()[2];
    expect(move).toMatchObject({ layer: heading.getAttribute("data-ht-layer"), after: { container: { layer: back!.el.getAttribute("data-ht-layer") }, absolute: { x: 10, y: 20 } } });
    expect(heading.parentElement).toBe(back!.el);
    expect(getComputedStyle(heading).display).toBe("block");
    expect(offCanvas.list()).toEqual([]);

    // One undo: off the canvas again, the heading in it, deleted on the page.
    editor.undo();
    expect(kinds(changes.list())).toEqual(["delete"]);
    expect(offCanvas.list()).toEqual([outside]);
    expect(outside.document.querySelector("h2")).not.toBeNull();
  });

  test("the Frame put back into the layout it came from: its place there is as drawn with the layer still there, the layer then moved into it", () => {
    const { doc, changes, desk, layerOf, frame, view } = canvas();
    const outside = frame();
    const card = doc.querySelector("article")!;
    const title = card.querySelector("h3")!;
    moveInto(desk, layerOf(title), view, outside, { parent: outside.layer()!, x: 10, y: 20 }, false);
    // Let go at the end of the card's Stack, after the words: the title is deleted there.
    expect(layerOf(card).children).toHaveLength(1);

    const { moved: back } = carry(desk, outside, outside.layer()!, { parent: layerOf(card), index: 1 }, null);

    expect(kinds(changes.list())).toEqual(["create", "style", "move"]);
    // Third, after the title and the words, as if drawn there with the title in its place; then the title moves out of the Stack, into it.
    expect(changes.list()[0].after).toMatchObject({ place: { container: { layer: card.getAttribute("data-ht-layer") }, nth: 3 } });
    expect(changes.list()[2].before).toMatchObject({ nth: 1 });
    expect([...card.children].map((el) => el.localName)).toEqual(["p", "div"]);
    expect(title.parentElement).toBe(back!.el);
  });

  test("edited in it off the canvas, it goes as it looks there, its edits with it: put back, an insertion, the deletion staying", () => {
    const { doc, changes, desk, layerOf, layerIn, frame, view, main } = canvas();
    const outside = frame();
    moveInto(desk, layerOf(doc.querySelector("h2")!), view, outside, { parent: outside.layer()!, x: 10, y: 20 }, false);
    outside.editor.set(layerIn(outside, outside.document.querySelector("h2")!), "opacity", 0.5);

    carry(desk, outside, outside.layer()!, { parent: main(), x: 300, y: 40 }, null);

    expect(kinds(changes.list())).toEqual(["delete", "create", "style", "putBack"]);
    const { layer: kept } = changes.list()[3].after as PutBack;
    expect(kept.id).toBe(changes.list()[0].offCanvas);
    expect(kept.origin.edits).toMatchObject([{ property: "opacity", after: 0.5 }]);
    expect(kept.look).toContain("Heading");
    expect(doc.querySelectorAll("h2")).toHaveLength(2);
  });

  test("taken back from the change list, its deletion takes back what put it back with a layer it came into", () => {
    const { doc, changes, desk, layerOf, frame, view, main } = canvas();
    const titled = frame();
    moveInto(desk, layerOf(doc.querySelector("h2")!), view, titled, { parent: titled.layer()!, x: 0, y: 0 }, false);
    // A layer moved off whole, the heading's Frame moved into it, it put back as it looks.
    const card = desk.offCanvas.moveOut(doc.querySelector("article")!, { x: -400, y: 400 }, { ...desk.editor.originOf(layerOf(doc.querySelector("article")!)), copy: true, at: "2026-11-09T00:00:00.000Z" });
    desk.offCanvas.put(card);
    carry(desk, titled, titled.layer()!, { parent: card.layer()!, index: 0 }, card);
    carry(desk, card, card.layer()!, { parent: main(), x: 0, y: 0 }, null);

    const [deletion, putBack] = changes.list();
    expect(kinds(changes.list())).toEqual(["delete", "putBack"]);
    expect(withDependents(changes.list(), deletion.id).map((change) => change.id)).toEqual([putBack.id, deletion.id]);
  });
});

describe("a layer in a layer off the canvas dragged out of it (ticket 108)", () => {
  test("onto a view: moved off the canvas into it this round and not edited, its deletion is taken back and it moves there", () => {
    const { doc, changes, editor, desk, layerOf, layerIn, frame, view, main } = canvas();
    const outside = frame();
    const heading = doc.querySelector("h2")!;
    moveInto(desk, layerOf(heading), view, outside, { parent: outside.layer()!, x: 10, y: 20 }, false);
    const before = outside.changes.list().length - 1;

    const { moved } = carry(desk, outside, layerIn(outside, outside.document.querySelector("h2")!), { parent: main(), x: 200, y: 300 }, null);

    expect(moved!.el).toBe(heading);
    expect(kinds(changes.list())).toEqual(["move"]);
    expect(outside.changes.list()).toHaveLength(before);
    expect(outside.document.querySelector("h2")).toBeNull();

    editor.undo();
    expect(kinds(changes.list())).toEqual(["delete"]);
    expect(outside.document.querySelector("h2")).not.toBeNull();
  });

  test("onto a view out of a layer moved off whole: its code is in that layer's, written where it is; that layer counts as edited", () => {
    const { doc, changes, desk, moveOff, layerIn, main } = canvas();
    const card = moveOff(doc.querySelector("article")!);
    const title = layerIn(card, card.document.querySelector("h3")!);

    carry(desk, card, title, { parent: main(), index: 0 }, null);

    expect(kinds(changes.list())).toEqual(["delete", "putBack"]);
    const { layer: kept } = changes.list()[1].after as PutBack;
    expect(kept.origin).toMatchObject({ inside: card.id, written: "src/Card.tsx:4:7", target: { loc: "src/Card.tsx:4:7", context: { path: [...card.origin.target.context.path, "Title"] } } });
    expect(kept.origin.snippet).toBeUndefined();
    expect(kept.origin.copy).toBeUndefined();
    expect(kinds(card.changes.list())).toEqual(["delete"]);
    expect(withDependents(changes.list(), changes.list()[0].id)).toHaveLength(2);
  });

  test("drawn in it, it is made anew there, as if drawn there", () => {
    const { changes, desk, frame, main } = canvas();
    const outside = frame();
    const text = outside.editor.create("text", { parent: outside.layer()!, x: 10, y: 10 });
    outside.editor.setText(text, "Hello");

    const { moved, missed } = carry(desk, outside, outside.editor.tree().layerOf(text.el)!, { parent: main(), x: 100, y: 100 }, null);

    expect(missed).toEqual([]);
    expect(kinds(changes.list())).toEqual(["create"]);
    expect(moved!.el.textContent).toBe("Hello");
    expect(kinds(outside.changes.list())).toEqual(["create", "style"]);
  });

  test("into the blank space: a layer off the canvas of its own, with the id the page's deletion names, and put back, it moves", () => {
    const { doc, changes, offCanvas, desk, layerOf, layerIn, frame, view, main } = canvas();
    const outside = frame();
    const heading = doc.querySelector("h2")!;
    moveInto(desk, layerOf(heading), view, outside, { parent: outside.layer()!, x: 10, y: 20 }, false);

    const { moved: own } = partOff(desk, outside, layerIn(outside, outside.document.querySelector("h2")!), { x: -400, y: 500 }, false);

    expect(kinds(changes.list())).toEqual(["delete"]);
    expect(own!.id).toBe(changes.list()[0].offCanvas);
    expect(offCanvas.list()).toEqual([outside, own]);
    expect(offCanvas.find(own!.id)).toBe(own);
    expect(outside.document.querySelector("h2")).toBeNull();

    carry(desk, own!, own!.layer()!, { parent: main(), x: 0, y: 0 }, null);
    expect(kinds(changes.list())).toEqual(["move"]);
  });

  test("into another layer off the canvas, whole: no change of the round's; the one it went into put back, it moves", () => {
    const { doc, changes, offCanvas, desk, moveOff, frame, main } = canvas();
    const heading = moveOff(doc.querySelector("h2")!);
    const outside = frame();

    carry(desk, heading, heading.layer()!, { parent: outside.layer()!, x: 5, y: 5 }, outside);

    expect(kinds(changes.list())).toEqual(["delete"]);
    expect(offCanvas.list()).toEqual([outside]);
    expect(cameInto(outside).map((kept) => kept.id)).toEqual([heading.id]);

    carry(desk, outside, outside.layer()!, { parent: main(), x: 0, y: 0 }, null);
    expect(kinds(changes.list())).toEqual(["create", "style", "move"]);
    expect(doc.querySelector("h2")!.parentElement!.hasAttribute("data-ht-new")).toBe(true);
  });

  test("a Frame made in the blank space, dragged whole into another, is made anew there; put back, all of it is made on the canvas", () => {
    const { changes, offCanvas, desk, frame, main } = canvas();
    const inner = offCanvas.make("frame", { x: -400, y: 300 }, { width: 50, height: 40 }, desk.page);
    const outside = frame();

    const { missed } = carry(desk, inner, inner.layer()!, { parent: outside.layer()!, x: 5, y: 5 }, outside);

    expect(missed).toEqual([]);
    expect(kinds(outside.changes.list())).toEqual(["create", "style", "create", "style"]);
    expect(offCanvas.list()).toEqual([outside]);
    carry(desk, outside, outside.layer()!, { parent: main(), x: 0, y: 0 }, null);
    expect(kinds(changes.list())).toEqual(["create", "style", "create", "style"]);
    expect(putBackBy(changes.list())).toHaveLength(1);
  });
});

describe("review of ticket 108", () => {
  /** A Frame drawn in the blank space, the card moved into it, and the card's title moved out of the card, into the Frame. */
  function titleMovedOut() {
    const setup = canvas();
    const { doc, desk, layerOf, layerIn, frame, view } = setup;
    const outside = frame();
    moveInto(desk, layerOf(doc.querySelector("article")!), view, outside, { parent: outside.layer()!, x: 10, y: 10 }, false);
    outside.editor.move(layerIn(outside, outside.document.querySelector("h3")!), { parent: outside.layer()!, x: 20, y: 150 });
    return { ...setup, outside };
  }

  test("a layer moved out of one that came in goes too, written in that one's code: the Frame put back has all of it", () => {
    const { doc, changes, desk, outside, main } = titleMovedOut();

    const { moved, missed } = carry(desk, outside, outside.layer()!, { parent: main(), x: 300, y: 40 }, null);

    expect(missed).toEqual([]);
    expect(moved).not.toBeNull();
    expect(kinds(changes.list())).toEqual(["delete", "create", "style", "putBack", "putBack"]);
    const [deletion, , , card, title] = changes.list();
    // The card, a title moved out of it, is edited: it goes as it looks, its deletion staying.
    expect((card.after as PutBack).layer).toMatchObject({ id: deletion.offCanvas, origin: { edits: [{ kind: "move" }] } });
    expect((title.after as PutBack).layer.origin).toMatchObject({ inside: deletion.offCanvas, written: "src/Card.tsx:4:7", target: { context: { path: [...(card.after as PutBack).layer.origin.target.context.path, "Title"] } } });
    expect(moved!.el.querySelectorAll("h3")).toHaveLength(1);
    expect(moved!.el.querySelectorAll("article h3")).toHaveLength(0);
    expect(doc.querySelectorAll("h3")).toHaveLength(2);
  });

  test("so too into another layer off the canvas: no change of the round's, the title there", () => {
    const { changes, offCanvas, desk, outside, frame } = titleMovedOut();
    const other = frame();

    const { missed } = carry(desk, outside, outside.layer()!, { parent: other.layer()!, x: 0, y: 0 }, other);

    expect(missed).toEqual([]);
    expect(kinds(changes.list())).toEqual(["delete"]);
    expect(offCanvas.list()).toEqual([other]);
    expect(other.document.querySelectorAll("h3")).toHaveLength(1);
  });

  test("not to be made there: all of it stays where it was, the deletion taken back for it there again, and nothing to redo", () => {
    const { doc, changes, editor, desk, layerOf, frame, view, main, history, offCanvas } = canvas();
    const outside = frame();
    const heading = doc.querySelector("h2")!;
    moveInto(desk, layerOf(heading), view, outside, { parent: outside.layer()!, x: 10, y: 20 }, false);
    const steps = history.past.length;
    // As a bug would have it: no Frame to be made on the canvas, after the heading's deletion is taken back for it.
    editor.canHold = () => false;

    const { moved } = carry(desk, outside, outside.layer()!, { parent: main(), x: 300, y: 40 }, null);

    expect(moved).toBeNull();
    expect(kinds(changes.list())).toEqual(["delete"]);
    expect(getComputedStyle(heading).display).toBe("none");
    expect(offCanvas.list()).toEqual([outside]);
    expect(outside.document.querySelector("h2")).not.toBeNull();
    expect(history.past).toHaveLength(steps);
    expect(history.future).toEqual([]);
    editor.redo();
    expect(kinds(changes.list())).toEqual(["delete"]);
    expect(offCanvas.list()).toEqual([outside]);
  });

  test("the made Frame's change taken back from the change list: the layer that went back with it as it was is in its place, and not in the Frame too", () => {
    const { doc, changes, editor, offCanvas, desk, layerOf, frame, view, main, history } = canvas();
    const outside = frame();
    const heading = doc.querySelector("h2")!;
    moveInto(desk, layerOf(heading), view, outside, { parent: outside.layer()!, x: 10, y: 20 }, false);
    carry(desk, outside, outside.layer()!, { parent: main(), x: 300, y: 40 }, null);
    const create = changes.list()[0];

    // As the Shell takes it back.
    const going = withDependents(changes.list(), create.id);
    const { parts, brought } = takenBackOff(offCanvas, going);
    together(history, () => {
      editor.batch(() => {
        editor.revert(create.id);
        for (const found of brought)
          editor.along(
            () => offCanvas.put(found),
            () => offCanvas.take(found),
          );
      });
      for (const { holder, layer } of parts) holder.editor.batch(() => holder.editor.remove(layer));
    });

    expect(changes.list()).toEqual([]);
    expect(heading.parentElement).toBe(main().el);
    expect(getComputedStyle(heading).display).toBe("block");
    expect(offCanvas.list()).toEqual([outside]);
    expect(outside.document.querySelector("h2")).toBeNull();
    expect(cameIn(outside)).toEqual([]);
  });

  test("a layer that goes into another and is drawn out again has its id; undone, the one there is found by it, whichever has it", () => {
    const { doc, editor, offCanvas, desk, moveOff, layerIn, frame } = canvas();
    const heading = moveOff(doc.querySelector("h2")!);
    const holder = frame();
    carry(desk, heading, heading.layer()!, { parent: holder.layer()!, x: 5, y: 5 }, holder);
    const { moved: again } = partOff(desk, holder, layerIn(holder, holder.document.querySelector("h2")!), { x: -400, y: 500 }, false);
    expect(again!.id).toBe(heading.id);
    expect(offCanvas.find(heading.id)).toBe(again);

    editor.undo();
    expect(offCanvas.list()).toEqual([holder]);
    expect(holder.document.querySelector("h2")).not.toBeNull();
    editor.undo();
    expect(offCanvas.list()).toEqual([heading, holder]);
    expect(offCanvas.find(heading.id)).toBe(heading);
    editor.redo();
    editor.redo();
    expect(offCanvas.find(heading.id)).toBe(again);
  });
});
