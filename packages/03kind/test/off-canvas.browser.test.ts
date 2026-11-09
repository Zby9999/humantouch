import { afterEach, describe, expect, test } from "vitest";
import { dropUnusedRules } from "../src/client/canvas-style";
import { createChangeSet, putBackBy, withDependents, type Change, type Created, type PutBack } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { createHistory } from "../src/client/undo-steps";
import type { Destination } from "../src/client/edit-commands";
import type { Layer } from "../src/client/layers";
import { freezeLook, serializeLook } from "../src/client/look";
import { createOffCanvas, remake, type OffCanvasLayer } from "../src/client/off-canvas";
import { revertSaved } from "../src/client/saved-round";
import { createViews } from "../src/client/views";

const CHAIN = `data-tk-chain='[{"component":"Card","usage":"src/App.tsx:6:9","thirdParty":false}]'`;

/** A card styled by classes, its words by what they inherit, its title by a web font, its badge by a `::before`. */
const PAGE = `<!DOCTYPE html>
<style>
  @font-face { font-family: "Shown"; src: local("Arial"); }
  body { margin: 0; color: rgb(68, 64, 60); font-family: Georgia, serif; line-height: 1.8 }
  .grid { display: grid; grid-template-columns: 300px 100px }
  .card { display: flex; flex-direction: column; gap: 12px; padding: 20px; background: rgb(255, 255, 255); border-radius: 12px; border: 1px solid rgb(200, 200, 200) }
  .card h3 { margin: 0; font: 700 24px "Shown", sans-serif; color: rgb(10, 10, 10) }
  .badge::before { content: "★"; color: rgb(255, 0, 0); margin-right: 4px }
  .card .wide { width: 120px; height: 30px; background: rgb(0, 0, 255) }
  /* As Tailwind's preflight has every element: a style, and no width. */
  h3, p { border: 0 solid }
</style>
<body>
  <main class="grid">
    <article class="card" data-tk-loc="src/Card.tsx:3:5" ${CHAIN} data-tk-layer="4" data-tk-style="2" style="opacity: 0.9">
      <h3 data-tk-loc="src/Card.tsx:4:7" ${CHAIN}>Freeze it</h3>
      <p class="badge" data-tk-loc="src/Card.tsx:5:7" ${CHAIN}>Words that run on and on, so they wrap within the card as it is laid out on the page</p>
      <div class="wide" data-tk-loc="src/Card.tsx:6:7" ${CHAIN}></div>
      <div data-tk-deleted="delete" style="display: none">Gone</div>
    </article>
    <div></div>
  </main>
</body>`;

const made: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const iframe of made.splice(0)) iframe.remove();
});

function iframe(width = 800): HTMLIFrameElement {
  const el = document.createElement("iframe");
  el.style.width = `${width}px`;
  el.style.height = "600px";
  document.body.append(el);
  made.push(el);
  return el;
}

function page(html = PAGE): Document {
  const doc = iframe().contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  return doc;
}

const css = (el: Element, ...names: string[]) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)]));
const LOOK = ["border-left-width", "color", "font-family", "font-size", "font-weight", "line-height", "background-color", "padding-top", "border-top-left-radius", "border-top-width", "display", "flex-direction", "row-gap", "opacity"];

describe("a layer's look, frozen", () => {
  test("looks as the layer did, every layer in it too, in a document of its own with none of the page's styles", () => {
    const doc = page();
    const card = doc.querySelector("article")!;
    const into = iframe(10);

    freezeLook(card, into);

    const look = into.contentDocument!;
    const frozen = look.querySelector("article")!;
    expect(frozen.parentElement).toBe(look.body);
    // Not a rule of the page's.
    expect([...look.querySelectorAll("style")].map((s) => s.textContent).join("")).not.toMatch(/\.card|\.badge/);
    const pairs: [Element, Element][] = [
      [card, frozen],
      [card.querySelector("h3")!, frozen.querySelector("h3")!],
      [card.querySelector("p")!, frozen.querySelector("p")!],
      [card.querySelector(".wide")!, frozen.querySelector('[data-tk-class="wide"]')!],
    ];
    for (const [from, to] of pairs) {
      expect(css(to, ...LOOK)).toEqual(css(from, ...LOOK));
      const [a, b] = [from.getBoundingClientRect(), to.getBoundingClientRect()];
      expect([b.width, b.height]).toEqual([a.width, a.height]);
    }
    expect(getComputedStyle(frozen.querySelector("p")!, "::before").content).toBe('"★"');
    expect(getComputedStyle(frozen.querySelector("p")!, "::before").color).toBe("rgb(255, 0, 0)");
    // The web font comes along.
    expect([...look.fonts].map((font) => font.family)).toContain("Shown");
  });

  test("keeps where each layer is written in the source and its usage chain, not the canvas's own marks; what was deleted is not in it", () => {
    const doc = page();
    const into = iframe(10);

    freezeLook(doc.querySelector("article")!, into);

    const frozen = into.contentDocument!.querySelector("article")!;
    expect(frozen.getAttribute("data-tk-loc")).toBe("src/Card.tsx:3:5");
    expect(JSON.parse(frozen.getAttribute("data-tk-chain")!)[0].component).toBe("Card");
    expect(frozen.hasAttribute("data-tk-layer")).toBe(false);
    expect(frozen.hasAttribute("style")).toBe(false);
    // Its classes are kept to tell it by, where no rule can match them.
    expect(frozen.hasAttribute("class")).toBe(false);
    expect(frozen.getAttribute("data-tk-class")).toBe("card");
    expect(frozen.textContent).not.toContain("Gone");
    // Its container's usage chain is the document's, so it is an instance as it was on the page, or not.
    expect(into.contentDocument!.body.hasAttribute("data-tk-chain")).toBe(false);
  });

  test("its size is as the layer's own; what follows its content still does", () => {
    const doc = page();
    const into = iframe(10);
    freezeLook(doc.querySelector("article")!, into);
    const look = into.contentDocument!;
    const title = look.querySelector("h3")!;

    title.textContent = "Freeze it, and a good deal more than that, so it wraps onto more lines";

    expect(look.querySelector("article")!.getBoundingClientRect().width).toBe(300);
    expect(title.getBoundingClientRect().height).toBeGreaterThan(40);
    expect(look.querySelector('[data-tk-class="wide"]')!.getBoundingClientRect().width).toBe(120);
  });

  test("saved and written back, looks the same", () => {
    const doc = page();
    const into = iframe(10);
    freezeLook(doc.querySelector("article")!, into);

    const again = iframe(10).contentDocument!;
    again.open();
    again.write(serializeLook(into.contentDocument!));
    again.close();

    expect(css(again.querySelector("h3")!, ...LOOK)).toEqual(css(doc.querySelector("h3")!, ...LOOK));
    expect(again.querySelectorAll("style[data-tk-canvas-styles]")).toHaveLength(0);
  });
});

describe("moving a layer off the canvas, in the editor", () => {
  /** The page as a canvas to edit, with what is moved off the canvas, and the history its edits share with those off the canvas. */
  function canvas(history = createHistory()) {
    const doc = page();
    const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
    const changes = createChangeSet();
    const editor = createEditor(views, changes, null, { history });
    const layerOf = (el: Element) => find(editor.tree().root, (layer) => layer.el === el && !layer.text)!;
    return { doc, changes, editor, layerOf, history };
  }

  test("deletes it on the canvas as one change, marked with the layer off the canvas; undone, it is back, and what was moved off the canvas goes", () => {
    const { doc, changes, editor, layerOf } = canvas();
    const set: string[] = [];
    const title = doc.querySelector("h3")!;
    const where = editor.originOf(layerOf(title));

    editor.batch(() => {
      editor.remove(layerOf(title), { offCanvas: "a" });
      editor.along(
        () => set.push("a"),
        () => set.pop(),
      );
    });

    expect(where).toMatchObject({ target: { loc: "src/Card.tsx:4:7", component: "Card" }, place: { nth: 1, absolute: null }, written: "src/Card.tsx:4:7" });
    // An instance is written where it is used.
    expect(editor.originOf(layerOf(doc.querySelector("article")!)).written).toBe("src/App.tsx:6:9");
    expect(changes.list()).toMatchObject([{ kind: "delete", offCanvas: "a", before: where.place, target: { loc: "src/Card.tsx:4:7" } }]);
    expect(getComputedStyle(title).display).toBe("none");
    expect(set).toEqual(["a"]);

    editor.undo();
    expect(changes.list()).toEqual([]);
    expect(getComputedStyle(title).display).toBe("block");
    expect(set).toEqual([]);

    editor.redo();
    expect(changes.list()).toHaveLength(1);
    expect(set).toEqual(["a"]);
  });

  test("an edit off the canvas is no change of the round's, but its own; one history goes back through both in the order made", () => {
    const history = createHistory();
    const { doc, changes, editor, layerOf } = canvas(history);
    const into = iframe(10);
    freezeLook(doc.querySelector("article")!, into);
    const look = into.contentDocument!;
    const own = createChangeSet();
    const offCanvas = createEditor(createViews({ document: look, width: 300, height: 100, windowHeight: 0, scrollY: 0 }), own, null, { history, sources: false });
    const frozen = find(offCanvas.tree().root, (layer) => layer.el === look.querySelector("article"))!;

    editor.set(layerOf(doc.querySelector("article")!), "opacity", 0.5);
    offCanvas.set(frozen, "opacity", 0.2);

    expect(changes.list().map((change) => change.after)).toEqual([0.5]);
    expect(own.list()).toMatchObject([{ property: "opacity", before: 0.9, after: 0.2, sources: [] }]);
    expect(getComputedStyle(look.querySelector("article")!).opacity).toBe("0.2");

    // Undone from the canvas, the edit off the canvas goes first: it was made last.
    const undone = editor.undo();
    expect(undone.map((layer) => layer.el)).toEqual([look.querySelector("article")]);
    expect(getComputedStyle(look.querySelector("article")!).opacity).toBe("0.9");
    expect(changes.list()).toHaveLength(1);
    offCanvas.undo();
    expect(changes.list()).toHaveLength(0);
    editor.redo();
    expect(changes.list()).toHaveLength(1);
    expect(own.list()).toHaveLength(0);
  });
});

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | undefined {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
}

describe("the layers off the canvas", () => {
  const ORIGIN = {
    target: { loc: "src/Card.tsx:3:5", chain: [], component: "Card", instances: 1, locked: false, unlocated: false, context: { path: ["Page", "Card"], element: "<article>" } },
    place: null,
    written: "src/App.tsx:6:9",
    at: "2026-10-29T00:00:00.000Z",
  };
  let host: HTMLDivElement | undefined;
  afterEach(() => host?.remove());
  function workspace() {
    host = document.createElement("div");
    document.body.append(host);
    return host;
  }

  test("each is where it was put, as it looked, and is selected and edited as a layer, its edits its own; kept and shown again, all is as it was", () => {
    const doc = page();
    const offCanvas = createOffCanvas(workspace(), [], createHistory());

    const outside = offCanvas.moveOut(doc.querySelector("article")!, { x: -400, y: 120 }, ORIGIN);
    offCanvas.put(outside);

    expect(offCanvas.list()).toEqual([outside]);
    const iframe = outside.document.defaultView!.frameElement as HTMLIFrameElement;
    expect([iframe.style.left, iframe.style.top]).toEqual(["-400px", "120px"]);
    expect([outside.width, outside.height]).toEqual([300, Math.round(doc.querySelector("article")!.getBoundingClientRect().height)]);
    const layer = outside.layer()!;
    expect(layer.name).toBe("Card");
    expect(outside.view.layerAt(outside.editor.tree(), 10, 10)).toBe(layer);
    expect(offCanvas.of(layer.el)).toBe(outside);
    outside.editor.set(layer, "radius", 0);

    const saved = offCanvas.save();
    expect(saved).toMatchObject([{ id: outside.id, x: -400, y: 120, origin: ORIGIN, edits: { changes: [{ property: "radius", after: 0 }] } }]);

    const again = createOffCanvas(workspace(), saved, createHistory());
    const [back] = again.list();
    expect([back.id, back.x, back.y]).toEqual([outside.id, -400, 120]);
    expect(getComputedStyle(back.layer()!.el).borderTopLeftRadius).toBe("0px");
    expect(getComputedStyle(back.layer()!.el).backgroundColor).toBe("rgb(255, 255, 255)");
    back.editor.undo();
    expect(getComputedStyle(back.layer()!.el).borderTopLeftRadius).toBe("0px");
  });

  test("taken away, one is no longer there, nor kept; put back, it is again, as it was", () => {
    const doc = page();
    const offCanvas = createOffCanvas(workspace(), [], createHistory());
    const outside = offCanvas.moveOut(doc.querySelector("h3")!, { x: 0, y: -100 }, ORIGIN);
    offCanvas.put(outside);
    outside.editor.set(outside.layer()!, "opacity", 0.5);

    offCanvas.take(outside);
    expect(offCanvas.list()).toEqual([]);
    expect(offCanvas.save()).toEqual([]);

    offCanvas.put(outside);
    expect(getComputedStyle(outside.layer()!.el).opacity).toBe("0.5");
    offCanvas.place(outside, 20, -80);
    expect(offCanvas.save()).toMatchObject([{ x: 20, y: -80 }]);
  });
});

const ORIGIN = {
  target: { loc: "src/Card.tsx:3:5", chain: [], component: "Card", instances: 1, locked: false, unlocated: false, context: { path: ["Page", "Card"], element: "<article>" } },
  place: null,
  written: "src/App.tsx:6:9",
  at: "2026-10-29T00:00:00.000Z",
};

describe("putting a layer off the canvas back", () => {
  let host: HTMLDivElement | undefined;
  afterEach(() => host?.remove());

  /** The page as a canvas to edit, and the layers off it, sharing one history. */
  function canvas(html = PAGE) {
    const doc = page(html);
    const history = createHistory();
    const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
    const changes = createChangeSet();
    const editor = createEditor(views, changes, null, { history });
    host = document.createElement("div");
    document.body.append(host);
    const offCanvas = createOffCanvas(host, [], history);
    const layerOf = (el: Element) => find(editor.tree().root, (layer) => layer.el === el && !layer.text)!;
    /** Moves the layer of `el` off the canvas, as the designer drags it out (`copy`: with ⌥ held). */
    const moveOff = (el: Element, copy = false) => {
      const layer = layerOf(el);
      const outside = offCanvas.moveOut(el, { x: -400, y: 0 }, { ...editor.originOf(layer), at: "2026-10-29T00:00:00.000Z" });
      editor.batch(() => {
        if (!copy) editor.remove(layer, { offCanvas: outside.id });
        editor.along(
          () => offCanvas.put(outside),
          () => offCanvas.take(outside),
        );
      });
      return outside;
    };
    /** Puts it back at `to`, as the designer lets it go over a view. */
    const putBack = (outside: OffCanvasLayer, to: Destination) => {
      let layer: Layer | null = null;
      editor.batch(() => {
        layer = editor.putBack({ el: outside.layer()!.el, kept: outside.keep() }, to);
        editor.along(
          () => offCanvas.take(outside),
          () => offCanvas.put(outside),
        );
      });
      return layer!;
    };
    return { doc, changes, editor, offCanvas, layerOf, moveOff, putBack };
  }

  test("moved off and put back where it was in the same round, it is as it was, and neither change is left", () => {
    const { doc, changes, offCanvas, layerOf, moveOff, putBack } = canvas();
    const card = doc.querySelector("article")!;
    const title = doc.querySelector("h3")!;
    const outside = moveOff(title);

    const back = putBack(outside, { parent: layerOf(card), index: 0 });

    expect(changes.list()).toEqual([]);
    expect(back.el).toBe(title);
    expect(getComputedStyle(title).display).toBe("block");
    expect(card.querySelectorAll("h3")).toHaveLength(1);
    expect(offCanvas.list()).toEqual([]);
  });

  test("moved off and put back elsewhere in the same round, it is a move, the deletion gone; undone, it is off the canvas again, deleted", () => {
    const { doc, changes, editor, offCanvas, layerOf, moveOff, putBack } = canvas();
    const card = doc.querySelector("article")!;
    const title = doc.querySelector("h3")!;
    const outside = moveOff(title);

    const back = putBack(outside, { parent: layerOf(card), index: 2 });

    expect(changes.list()).toMatchObject([{ kind: "move", before: { nth: 1 }, after: { nth: 3, container: { layer: "4" } } }]);
    expect(back.el).toBe(title);
    expect(card.lastElementChild).toBe(title);

    editor.undo();
    expect(changes.list()).toMatchObject([{ kind: "delete", offCanvas: outside.id }]);
    expect(getComputedStyle(title).display).toBe("none");
    expect(offCanvas.list()).toEqual([outside]);
  });

  test("edited off the canvas, it comes back as an insertion, looking as it does off the canvas, with its source, look and edits; undone, it is off the canvas again", () => {
    const { doc, changes, editor, offCanvas, layerOf, moveOff, putBack } = canvas();
    const card = doc.querySelector("article")!;
    const title = doc.querySelector("h3")!;
    const outside = moveOff(title);
    outside.editor.set(outside.layer()!, "opacity", 0.5);
    const shown = css(outside.layer()!.el, ...LOOK);

    const back = putBack(outside, { parent: layerOf(card), index: 0 });

    expect(changes.list()).toMatchObject([
      { kind: "delete", offCanvas: outside.id },
      {
        kind: "putBack",
        layer: back.el.getAttribute("data-tk-layer"),
        target: { loc: "src/Card.tsx:3:5" },
        after: {
          place: { container: { layer: "4" }, nth: 1, absolute: null },
          layer: { id: outside.id, origin: { written: "src/Card.tsx:4:7", place: { nth: 1 } }, edits: { changes: [{ property: "opacity", after: 0.5 }] } },
        },
      },
    ]);
    expect((changes.list()[1].after as PutBack).layer.look).toContain("Freeze it");
    // A layer of the canvas's, new this round, in every instance of its container; the one deleted stays deleted.
    expect(back.el).not.toBe(title);
    expect(back.el.parentElement).toBe(card);
    expect(back.el.nextElementSibling).toBe(card.querySelector("p"));
    expect(back.made).toBe(back.el.getAttribute("data-tk-layer"));
    expect(getComputedStyle(title).display).toBe("none");
    expect(css(back.el, ...LOOK)).toEqual(shown);
    expect(offCanvas.list()).toEqual([]);

    editor.undo();
    expect(changes.list()).toMatchObject([{ kind: "delete" }]);
    expect(card.querySelectorAll("h3")).toHaveLength(1);
    expect(offCanvas.list()).toEqual([outside]);
    editor.redo();
    expect(changes.list()).toHaveLength(2);
    expect(card.querySelectorAll("h3")).toHaveLength(2);
  });

  test("moved off in an earlier round, its code and the rules of its classes gone since, it comes back new, looking as it did off the canvas", () => {
    // The Agent deleted the badge, and its rules with it; the page's words are another colour now.
    const after = PAGE.replace(/<p class="badge"[^]*?<\/p>/, "").replace(".badge::before", ".gone::before").replace("color: rgb(68, 64, 60)", "color: rgb(0, 0, 255)");
    const before = page();
    const { doc, changes, editor, offCanvas, layerOf, putBack } = canvas(after);
    const badge = before.querySelector("p")!;
    const outside = offCanvas.moveOut(badge, { x: -400, y: 0 }, { ...ORIGIN, written: "src/Card.tsx:5:7", snippet: { loc: "src/Card.tsx:5:7", code: '<p className="badge">Words</p>' } });
    offCanvas.put(outside);
    const card = doc.querySelector("article")!;

    const back = putBack(outside, { parent: layerOf(card), index: 1 });

    expect(changes.list()).toMatchObject([{ kind: "putBack", after: { place: { nth: 2 }, layer: { origin: { snippet: { code: '<p className="badge">Words</p>' } } } } }]);
    expect(back.el.previousElementSibling).toBe(card.querySelector("h3"));
    expect(back.el.hasAttribute("class")).toBe(false);
    expect(css(back.el, ...LOOK, "width")).toEqual(css(badge, ...LOOK, "width"));
    expect(getComputedStyle(back.el, "::before").content).toBe('"★"');
    expect(getComputedStyle(back.el, "::before").color).toBe("rgb(255, 0, 0)");

    // Taken off again, what showed its `::before` goes once the canvas is saved.
    editor.undo();
    expect(doc.querySelectorAll("style[data-tk-put-back]")).toHaveLength(1);
    dropUnusedRules(doc.documentElement);
    expect(doc.querySelectorAll("style[data-tk-put-back]")).toHaveLength(0);
  });

  test("an insertion goes with the deletion it put back: taking back the deletion takes it too, on the canvas and on a saved one; taken back alone, the deletion stays", () => {
    const { doc, changes, editor, layerOf, moveOff, putBack } = canvas();
    const card = doc.querySelector("article")!;
    const outside = moveOff(doc.querySelector("h3")!);
    outside.editor.set(outside.layer()!, "opacity", 0.5);
    const back = putBack(outside, { parent: layerOf(card), index: 0 });
    const [deletion, insertion] = changes.list();
    const saved = { canvas: doc.documentElement.outerHTML, changeSet: changes.save() };

    editor.revert(insertion.id);
    expect(changes.list()).toEqual([deletion]);
    expect(back.el.isConnected).toBe(false);
    editor.undo();

    editor.revert(deletion.id);
    expect(changes.list()).toEqual([]);
    expect(card.querySelectorAll("h3")).toHaveLength(1);
    expect(getComputedStyle(card.querySelector("h3")!).display).toBe("block");

    const reverted = new DOMParser().parseFromString(revertSaved(saved, insertion.id)!.canvas, "text/html");
    expect(reverted.querySelectorAll("article h3")).toHaveLength(1);
    expect(revertSaved(saved, deletion.id)).toBeNull();
  });

  test("put back new, it is where it came from still, its source with it: moved off again, it takes them along, and its putting back is taken back", () => {
    const { doc, changes, editor, offCanvas, layerOf, putBack } = canvas();
    const snippet = { loc: "src/Card.tsx:5:7", code: '<p className="badge">Words</p>' };
    const outside = offCanvas.moveOut(doc.querySelector("p")!, { x: -400, y: 0 }, { ...ORIGIN, written: "src/Card.tsx:5:7", snippet });
    offCanvas.put(outside);
    const back = putBack(outside, { parent: layerOf(doc.querySelector("article")!), index: 0 });

    expect(editor.originOf(back)).toMatchObject({ target: ORIGIN.target, written: "src/Card.tsx:5:7", snippet, place: { nth: 1 } });
    editor.remove(back, { offCanvas: "again" });
    expect(changes.list()).toEqual([]);
  });
});

describe("a layer made in the blank space off the canvas (ticket 106)", () => {
  /** A page with room to draw in, its body text of its own. */
  const ROOM = `<!DOCTYPE html>
<style>
  body { margin: 0; color: rgb(68, 64, 60); font-family: Georgia, serif; font-size: 18px; line-height: 1.8 }
  main { position: relative; width: 600px; height: 400px }
</style>
<body><main data-tk-loc="src/App.tsx:3:5"><p data-tk-loc="src/App.tsx:4:7">Words</p></main></body>`;
  const RED = { type: "solid", color: "#FF0000", opacity: 1 } as const;
  /** As the Fill field adds one. */
  const WHITE = { type: "solid", color: "#FFFFFF", opacity: 1 } as const;
  const hosts: HTMLElement[] = [];
  afterEach(() => {
    for (const host of hosts.splice(0)) host.remove();
  });

  /** The page as a canvas to edit, and the layers off it, sharing one history. */
  function canvas(saved: Parameters<typeof createOffCanvas>[1] = []) {
    const doc = page(ROOM);
    const history = createHistory();
    const changes = createChangeSet();
    const editor = createEditor(createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changes, null, { history });
    const host = document.createElement("div");
    document.body.append(host);
    hosts.push(host);
    const offCanvas = createOffCanvas(host, saved, history);
    const main = () => find(editor.tree().root, (layer) => layer.el === doc.querySelector("main"))!;
    return { doc, changes, editor, offCanvas, main };
  }
  /** Puts `outside` back at `to`, as the designer lets it go over a view: every one of its edits made there again. */
  function putBack(off: ReturnType<typeof canvas>, outside: OffCanvasLayer, to: Destination): Layer {
    let made: ReturnType<typeof remake> | null = null;
    off.editor.batch(() => {
      made = remake(off.editor, outside, to);
      off.editor.along(
        () => off.offCanvas.take(outside),
        () => off.offCanvas.put(outside),
      );
    });
    expect(made!.missed).toEqual([]);
    return made!.layer!;
  }
  /**
   * Builds the same in a Frame made in the blank space and put back, and in
   * one drawn on the canvas at once: the round, and the canvas, are the same
   * either way. Not `inOrder`: in another order, so numbered otherwise, and
   * with what a layer's place among its container's layers was as it was made.
   */
  function sameAsDrawn(build: (editor: ReturnType<typeof createEditor>, frame: Layer) => void, inOrder = true) {
    const off = canvas();
    const outside = off.offCanvas.make("frame", { x: -300, y: 40 }, { width: 200, height: 160 }, off.doc);
    build(outside.editor, outside.layer()!);
    putBack(off, outside, { parent: off.main(), x: 40, y: 30 });
    const drawn = canvas();
    build(drawn.editor, drawWhite(drawn.editor, { parent: drawn.main(), x: 40, y: 30 }, { width: 200, height: 160 }));
    const unplaced = ({ id: _, ...change }: Change) =>
      change.kind === "create" ? { ...change, after: { ...(change.after as Created), place: { ...(change.after as Created).place, nth: 0, slot: 0 } } } : change;
    const read = (list: Change[]) => (inOrder ? asRead(list) : asRead(list).map(unplaced).sort((a, b) => `${a.layer} ${a.property}`.localeCompare(`${b.layer} ${b.property}`)));
    expect(read(off.changes.list())).toEqual(read(drawn.changes.list()));
    expect(off.doc.querySelector("main > [data-tk-new]")!.outerHTML).toBe(drawn.doc.querySelector("main > [data-tk-new]")!.outerHTML);
    return { off, drawn, outside };
  }
  /** A Frame drawn on the canvas and its fill set white in the Design panel, as one made in the blank space is (designer, 2026-11-09). */
  function drawWhite(editor: ReturnType<typeof createEditor>, to: Destination, size: { width: number; height: number }) {
    const frame = editor.create("frame", to, size);
    editor.set(frame, "fill", WHITE);
    return editor.tree().layerOf(frame.el)!;
  }
  /** Changes as the Agent reads them: but where one made off the canvas came from, which the notes leave out. */
  const asRead = (list: Change[]) => list.map(({ madeOffCanvas: _, ...change }) => change);
  /** Draws a Frame in `frame`, as the designer would, on the canvas or off it: a fill, a brief, text and a Frame in it. */
  function sketch(editor: ReturnType<typeof createEditor>, frame: Layer) {
    editor.set(frame, "fill", RED);
    editor.setBrief(frame, "A hero for the launch");
    const text = editor.create("text", { parent: frame, x: 12, y: 16 });
    editor.setText(text, "Hello");
    const inner = editor.create("frame", { parent: editor.tree().layerOf(frame.el)!, x: 100, y: 20 }, { width: 40, height: 30 });
    editor.set(inner, "opacity", 0.5);
  }

  test("pressed with F, a Frame is made there: a layer off the canvas, made by its own editor as on the canvas, no change of the round's; one undo takes it away", () => {
    const { doc, changes, editor, offCanvas } = canvas();

    const outside = offCanvas.make("frame", { x: -300, y: 40 }, { width: 200, height: 120 }, doc);

    expect(offCanvas.list()).toEqual([outside]);
    const frame = outside.layer()!;
    expect(frame.kind).toBe("frame");
    expect(outside.editor.isNewFrame(frame)).toBe(true);
    expect([outside.x, outside.y, outside.width, outside.height]).toEqual([-300, 40, 200, 120]);
    expect(outside.view.layerAt(outside.editor.tree(), 100, 60)).toBe(frame);
    // White, as one drawn on an empty Figma canvas: a fill of its own (designer, 2026-11-09), one step with its making.
    expect(outside.changes.list()).toMatchObject([
      { kind: "create", after: { type: "frame", width: 200, height: 120 } },
      { kind: "style", property: "fill", before: null, after: WHITE },
    ]);
    expect(getComputedStyle(frame.el).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(changes.list()).toEqual([]);
    expect(outside.origin).toMatchObject({ made: "frame", place: null, written: null, snippet: null, target: { loc: null, context: { path: ["Frame"], element: "<div>" } } });

    editor.undo();
    expect(offCanvas.list()).toEqual([]);
    expect(outside.layer()).toBeNull();
    expect(outside.changes.list()).toEqual([]);
    editor.redo();
    expect(offCanvas.list()).toEqual([outside]);
    expect(outside.layer()?.kind).toBe("frame");
    expect([outside.width, outside.height]).toEqual([200, 120]);
  });

  test("pressed with T, text is made there in the page's body text style; kept, and shown again, it is as it was, its edits and all", () => {
    const { doc, offCanvas } = canvas();
    const outside = offCanvas.make("text", { x: -200, y: -80 }, undefined, doc);
    const text = outside.layer()!;
    outside.editor.setText(text, "Hello there");

    expect(text.kind).toBe("text");
    const shown = css(text.el, "font-family", "font-size", "line-height", "color");
    expect(shown).toEqual({ "font-family": "Georgia, serif", "font-size": "18px", "line-height": "32.4px", color: "rgb(68, 64, 60)" });
    expect(outside.changes.list()).toMatchObject([{ kind: "create", after: { type: "text", text: "Hello there", width: null } }]);

    const saved = offCanvas.save();
    expect(saved).toMatchObject([{ id: outside.id, x: -200, y: -80, origin: { made: "text" } }]);
    const again = canvas(saved);
    const [back] = again.offCanvas.list();
    expect(back.layer()!.el.textContent).toBe("Hello there");
    expect(css(back.layer()!.el, "font-family", "font-size", "line-height", "color")).toEqual(shown);
    expect(back.changes.list()).toEqual(outside.changes.list());
    // Text has no fill.
    expect(back.changes.list().map((change) => change.kind)).toEqual(["create"]);
  });

  test("put back, it is made anew where it goes, all drawn in it too: the round has what drawing it there gives it; one undo, and it is off the canvas again, as it was", () => {
    const off = canvas();
    const outside = off.offCanvas.make("frame", { x: -300, y: 40 }, { width: 200, height: 120 }, off.doc);
    sketch(outside.editor, outside.layer()!);
    const edits = structuredClone(outside.changes.list());

    const back = putBack(off, outside, { parent: off.main(), x: 40, y: 30 });

    const drawn = canvas();
    sketch(drawn.editor, drawWhite(drawn.editor, { parent: drawn.main(), x: 40, y: 30 }, { width: 200, height: 120 }));
    expect(asRead(off.changes.list())).toEqual(asRead(drawn.changes.list()));
    expect(off.changes.list().map((change) => change.kind)).toEqual(["create", "style", "create", "create", "style"]);
    expect(off.changes.list()[0].madeOffCanvas).toMatchObject({ id: outside.id, edits: { changes: edits } });
    expect(off.changes.list().slice(1).every((change) => !change.madeOffCanvas)).toBe(true);
    expect(back.el.parentElement).toBe(off.doc.querySelector("main"));
    expect(back.el.outerHTML).toBe(drawn.doc.querySelector("main > [data-tk-new]")!.outerHTML);
    expect(off.offCanvas.list()).toEqual([]);

    off.editor.undo();
    expect(off.changes.list()).toEqual([]);
    expect(off.doc.querySelector("[data-tk-new]")).toBeNull();
    expect(off.offCanvas.list()).toEqual([outside]);
    expect(outside.changes.list()).toEqual(edits);
    // Redone, made again, numbered afresh as any change made again is.
    off.editor.redo();
    const unnumbered = (list: Change[]) => asRead(list).map(({ id: _, ...change }) => change);
    expect(unnumbered(off.changes.list())).toEqual(unnumbered(drawn.changes.list()));
    expect(off.doc.querySelector("main > [data-tk-new]")!.outerHTML).toBe(drawn.doc.querySelector("main > [data-tk-new]")!.outerHTML);
    expect(off.offCanvas.list()).toEqual([]);

    // Taken back from the change list, or the round discarded, it is off the canvas again too, as moved-out layers put back are.
    const [made] = off.changes.list();
    expect(putBackBy(withDependents(off.changes.list(), made.id))).toEqual([made.madeOffCanvas]);
  });

  test("a Frame made in the blank space and put back as it is: new there, white, as one drawn there and filled white", () => {
    const { off } = sameAsDrawn(() => {});
    expect(off.changes.list()).toMatchObject([{ kind: "create" }, { kind: "style", property: "fill", after: WHITE }]);
  });

  test("what was made a Stack, copied and moved in it off the canvas is so on the canvas too, as if done there", () => {
    /** Two words and a box in the Frame, made a Stack, its gap set; the box copied, the copy put first, the words moved into the box. */
    const build = (editor: ReturnType<typeof createEditor>, frame: Layer) => {
      const first = editor.create("text", { parent: frame, x: 10, y: 10 });
      editor.setText(first, "One");
      const box = editor.create("frame", { parent: editor.tree().layerOf(frame.el)!, x: 10, y: 60 }, { width: 50, height: 40 });
      editor.set(box, "fill", RED);
      const stack = editor.stack([editor.tree().layerOf(frame.el)!]);
      editor.set(stack, "gap", 8);
      const copy = editor.duplicate(editor.tree().layerOf(box.el)!, { parent: editor.tree().layerOf(frame.el)!, index: 0 });
      editor.set(copy, "opacity", 0.4);
      editor.move(editor.tree().layerOf(first.el)!, { parent: editor.tree().layerOf(box.el)!, index: 0 });
    };
    const { off } = sameAsDrawn(build);
    expect(off.changes.list().map((change) => change.kind)).toEqual(expect.arrayContaining(["stack", "duplicate", "move"]));
  });

  test("a layer in a copy deleted off the canvas is deleted on the canvas too", () => {
    const { off } = sameAsDrawn((editor, frame) => {
      const inner = editor.create("frame", { parent: frame, x: 10, y: 10 }, { width: 80, height: 60 });
      editor.setText(editor.create("text", { parent: editor.tree().layerOf(inner.el)!, x: 4, y: 4 }), "Hi");
      const copy = editor.duplicate(editor.tree().layerOf(inner.el)!, { parent: editor.tree().layerOf(frame.el)!, x: 100, y: 10 });
      editor.remove(editor.tree().layerOf(copy.el)!.children[0]);
    });
    expect(off.changes.list().map((change) => change.kind)).toContain("delete");
  });

  test("a copy of a layer placed freely is made on the canvas too", () => {
    const { off } = sameAsDrawn((editor, frame) => {
      const inner = editor.create("frame", { parent: frame, x: 10, y: 10 }, { width: 80, height: 60 });
      editor.duplicate(editor.tree().layerOf(inner.el)!);
    });
    expect(off.doc.querySelectorAll("main > [data-tk-new] > div")).toHaveLength(2);
  });

  test("a layer moved into a Frame drawn after it first moved is moved there on the canvas too, numbered as made there", () => {
    const { off } = sameAsDrawn((editor, frame) => {
      const a = editor.create("frame", { parent: frame, x: 10, y: 10 }, { width: 60, height: 60 });
      const text = editor.create("text", { parent: editor.tree().layerOf(frame.el)!, x: 100, y: 100 });
      editor.setText(text, "Moved");
      editor.move(editor.tree().layerOf(text.el)!, { parent: editor.tree().layerOf(a.el)!, x: 4, y: 4 });
      const b = editor.create("frame", { parent: editor.tree().layerOf(frame.el)!, x: 100, y: 10 }, { width: 60, height: 60 });
      editor.move(editor.tree().layerOf(text.el)!, { parent: editor.tree().layerOf(b.el)!, x: 6, y: 6 });
    }, false);
    expect(off.changes.list().map((change) => change.kind)).toContain("move");
    expect(off.doc.querySelector("main > [data-tk-new] > div:nth-of-type(2)")!.textContent).toBe("Moved");
  });

  test("the round discarded, or the putting back taken back after a reload, it is off the canvas again as it was kept, edits and all", () => {
    const off = canvas();
    const outside = off.offCanvas.make("frame", { x: -300, y: 40 }, { width: 200, height: 120 }, off.doc);
    sketch(outside.editor, outside.layer()!);
    const edits = structuredClone(outside.changes.list());
    putBack(off, outside, { parent: off.main(), x: 40, y: 30 });
    const saved = off.changes.save();

    // As the page has it after a reload: the layers off the canvas as saved, without it; the round's changes give it back.
    const again = canvas();
    const [kept] = putBackBy(saved.changes);
    const back = again.offCanvas.find(kept.id) ?? again.offCanvas.bring(kept);
    again.offCanvas.put(back);

    expect(again.offCanvas.list()).toEqual([back]);
    expect([back.id, back.x, back.y]).toEqual([outside.id, -300, 40]);
    expect(back.origin.made).toBe("frame");
    expect(back.changes.list()).toEqual(edits);
    expect(back.layer()!.el.outerHTML).toBe(outside.layer()!.el.outerHTML);
  });

  test("text put back into a container's layout takes a place there, as text drawn there does, its words and all", () => {
    const off = canvas();
    const outside = off.offCanvas.make("text", { x: -200, y: 0 }, { width: 160, height: 20 }, off.doc);
    outside.editor.setText(outside.layer()!, "Launch");

    putBack(off, outside, { parent: off.main(), index: 0 });

    const drawn = canvas();
    const text = drawn.editor.create("text", { parent: drawn.main(), index: 0 }, { width: 160, height: 20 });
    drawn.editor.setText(text, "Launch");
    expect(asRead(off.changes.list())).toEqual(asRead(drawn.changes.list()));
    expect(off.doc.querySelector("main")!.firstElementChild!.textContent).toBe("Launch");
  });
});

describe("resizing a layer off the canvas (ticket 107)", () => {
  const ROOM = `<!DOCTYPE html>
<style>body { margin: 0; font-family: Georgia, serif; font-size: 18px }</style>
<body><main data-tk-loc="src/App.tsx:3:5"><h3 data-tk-loc="src/App.tsx:4:7">Freeze it</h3></main></body>`;
  const hosts: HTMLElement[] = [];
  afterEach(() => {
    for (const host of hosts.splice(0)) host.remove();
  });
  function canvas() {
    const doc = page(ROOM);
    const history = createHistory();
    const changes = createChangeSet();
    const editor = createEditor(createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changes, null, { history });
    const host = document.createElement("div");
    document.body.append(host);
    hosts.push(host);
    const offCanvas = createOffCanvas(host, [], history);
    return { doc, changes, editor, offCanvas };
  }
  /** Resizes the whole of `outside` as its handles do, its top left going to `at` with it, one step with those before when `continues`. */
  function resizeWhole(off: ReturnType<typeof canvas>, outside: OffCanvasLayer, to: { width?: number; height?: number }, at: { x: number; y: number }, continues: boolean) {
    const [x, y] = [outside.x, outside.y];
    outside.editor.resize(outside.layer()!, to, {
      continues,
      along: { make: () => off.offCanvas.place(outside, at.x, at.y), unmake: () => off.offCanvas.place(outside, x, y) },
    });
  }
  const shape = (outside: OffCanvasLayer) => [outside.x, outside.y, outside.width, outside.height];

  test("resized whole, its room in the blank space grows and shrinks with it; from its left and top, its top left goes along, one step with the size; no change of the round's", async () => {
    const off = canvas();
    const outside = off.offCanvas.make("frame", { x: -300, y: 40 }, { width: 200, height: 120 }, off.doc);

    resizeWhole(off, outside, { width: 230, height: 130 }, { x: -330, y: 30 }, false);
    resizeWhole(off, outside, { width: 260, height: 150 }, { x: -360, y: 10 }, true);

    await expect.poll(() => shape(outside)).toEqual([-360, 10, 260, 150]);
    expect(outside.changes.list()).toMatchObject([
      { kind: "create" },
      { kind: "style", property: "width", after: { type: "fixed", value: 260 } },
      { kind: "style", property: "height", after: { type: "fixed", value: 150 } },
    ]);
    expect(off.changes.list()).toEqual([]);

    // Smaller again, from its bottom right: its top left stays.
    resizeWhole(off, outside, { width: 90, height: 60 }, { x: -360, y: 10 }, false);
    await expect.poll(() => shape(outside)).toEqual([-360, 10, 90, 60]);

    off.editor.undo();
    await expect.poll(() => shape(outside)).toEqual([-360, 10, 260, 150]);
    off.editor.undo();
    await expect.poll(() => shape(outside)).toEqual([-300, 40, 200, 120]);
    off.editor.redo();
    await expect.poll(() => shape(outside)).toEqual([-360, 10, 260, 150]);
    // Kept as it is now, where it is now.
    expect(off.offCanvas.save()).toMatchObject([{ x: -360, y: 10, edits: { changes: [{ kind: "create" }, { property: "width" }, { property: "height" }] } }]);
  });

  test("Esc takes the resize back, its top left too, with nothing to redo", async () => {
    const off = canvas();
    const outside = off.offCanvas.make("frame", { x: -300, y: 40 }, { width: 200, height: 120 }, off.doc);

    resizeWhole(off, outside, { width: 240 }, { x: -340, y: 40 }, false);
    resizeWhole(off, outside, { width: 280 }, { x: -380, y: 40 }, true);
    outside.editor.takeBack();

    await expect.poll(() => shape(outside)).toEqual([-300, 40, 200, 120]);
    expect(outside.changes.list()).toMatchObject([{ kind: "create" }]);
    expect(off.editor.redo()).toEqual([]);
  });

  test("a step that moves it but changes no size is one with the resize still: one undo, or Esc, takes all of it back", async () => {
    const off = canvas();
    const outside = off.offCanvas.make("frame", { x: -300, y: 40 }, { width: 200, height: 120 }, off.doc);

    resizeWhole(off, outside, { width: 240 }, { x: -340, y: 40 }, false);
    resizeWhole(off, outside, { width: 240 }, { x: -350, y: 40 }, true);
    await expect.poll(() => shape(outside)).toEqual([-350, 40, 240, 120]);
    off.editor.undo();
    await expect.poll(() => shape(outside)).toEqual([-300, 40, 200, 120]);

    resizeWhole(off, outside, { width: 240 }, { x: -340, y: 40 }, false);
    resizeWhole(off, outside, { width: 240 }, { x: -350, y: 40 }, true);
    outside.editor.takeBack();
    await expect.poll(() => shape(outside)).toEqual([-300, 40, 200, 120]);
  });

  test("a layer moved off the canvas and resized there is edited there: put back, it is an insertion, its new size among its edits", () => {
    const off = canvas();
    const title = off.doc.querySelector("h3")!;
    const layer = find(off.editor.tree().root, (l) => l.el === title && !l.text)!;
    const outside = off.offCanvas.moveOut(title, { x: -400, y: 0 }, { ...off.editor.originOf(layer), at: "2026-11-09T00:00:00.000Z" });
    off.editor.batch(() => {
      off.editor.remove(layer, { offCanvas: outside.id });
      off.editor.along(
        () => off.offCanvas.put(outside),
        () => off.offCanvas.take(outside),
      );
    });

    outside.editor.resize(outside.layer()!, { width: 320 });
    const main = find(off.editor.tree().root, (l) => l.el === off.doc.querySelector("main"))!;
    let back: Layer | null = null;
    off.editor.batch(() => {
      back = off.editor.putBack({ el: outside.layer()!.el, kept: outside.keep() }, { parent: main, index: 0 });
      off.editor.along(
        () => off.offCanvas.take(outside),
        () => off.offCanvas.put(outside),
      );
    });

    expect(off.changes.list()).toMatchObject([
      { kind: "delete", offCanvas: outside.id },
      { kind: "putBack", after: { layer: { edits: { changes: [{ kind: "style", property: "width", after: { type: "fixed", value: 320 } }] } } } },
    ]);
    expect(back!.el.getBoundingClientRect().width).toBe(320);
  });
});
