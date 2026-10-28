import { afterEach, describe, expect, test } from "vitest";
import { dropUnusedRules } from "../src/client/canvas-style";
import { createChangeSet, type PutBack } from "../src/client/changeset";
import { createEditor, createHistory } from "../src/client/edits";
import type { Destination } from "../src/client/edits";
import type { Layer } from "../src/client/layers";
import { freezeLook, serializeLook } from "../src/client/look";
import { createOffCanvas, type OffCanvasLayer } from "../src/client/off-canvas";
import { revertSaved } from "../src/client/saved-round";
import { createViews } from "../src/client/views";

const CHAIN = `data-vk-chain='[{"component":"Card","usage":"src/App.tsx:6:9","thirdParty":false}]'`;

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
    <article class="card" data-vk-loc="src/Card.tsx:3:5" ${CHAIN} data-vk-layer="4" data-vk-style="2" style="opacity: 0.9">
      <h3 data-vk-loc="src/Card.tsx:4:7" ${CHAIN}>Freeze it</h3>
      <p class="badge" data-vk-loc="src/Card.tsx:5:7" ${CHAIN}>Words that run on and on, so they wrap within the card as it is laid out on the page</p>
      <div class="wide" data-vk-loc="src/Card.tsx:6:7" ${CHAIN}></div>
      <div data-vk-deleted="delete" style="display: none">Gone</div>
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
      [card.querySelector(".wide")!, frozen.querySelector('[data-vk-class="wide"]')!],
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
    expect(frozen.getAttribute("data-vk-loc")).toBe("src/Card.tsx:3:5");
    expect(JSON.parse(frozen.getAttribute("data-vk-chain")!)[0].component).toBe("Card");
    expect(frozen.hasAttribute("data-vk-layer")).toBe(false);
    expect(frozen.hasAttribute("style")).toBe(false);
    // Its classes are kept to tell it by, where no rule can match them.
    expect(frozen.hasAttribute("class")).toBe(false);
    expect(frozen.getAttribute("data-vk-class")).toBe("card");
    expect(frozen.textContent).not.toContain("Gone");
    // Its container's usage chain is the document's, so it is an instance as it was on the page, or not.
    expect(into.contentDocument!.body.hasAttribute("data-vk-chain")).toBe(false);
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
    expect(look.querySelector('[data-vk-class="wide"]')!.getBoundingClientRect().width).toBe(120);
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
    expect(again.querySelectorAll("style[data-vk-canvas-styles]")).toHaveLength(0);
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
        layer: back.el.getAttribute("data-vk-layer"),
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
    expect(back.made).toBe(back.el.getAttribute("data-vk-layer"));
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
    expect(doc.querySelectorAll("style[data-vk-put-back]")).toHaveLength(1);
    dropUnusedRules(doc.documentElement);
    expect(doc.querySelectorAll("style[data-vk-put-back]")).toHaveLength(0);
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
