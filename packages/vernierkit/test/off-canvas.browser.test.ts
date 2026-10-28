import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { createEditor, createHistory } from "../src/client/edits";
import type { Layer } from "../src/client/layers";
import { freezeLook, serializeLook } from "../src/client/look";
import { createOffCanvas } from "../src/client/off-canvas";
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

function page(): Document {
  const doc = iframe().contentDocument!;
  doc.open();
  doc.write(PAGE);
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
  /** The page as a canvas to edit, with what is set aside, and the history its edits share with those off the canvas. */
  function canvas(history = createHistory()) {
    const doc = page();
    const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
    const changes = createChangeSet();
    const editor = createEditor(views, changes, null, { history });
    const layerOf = (el: Element) => find(editor.tree().root, (layer) => layer.el === el && !layer.text)!;
    return { doc, changes, editor, layerOf, history };
  }

  test("deletes it on the canvas as one change, marked with the layer off the canvas; undone, it is back, and what was set aside goes", () => {
    const { doc, changes, editor, layerOf } = canvas();
    const set: string[] = [];
    const title = doc.querySelector("h3")!;
    const where = editor.whereIs(layerOf(title));

    editor.batch(() => {
      editor.remove(layerOf(title), { offCanvas: "a" });
      editor.along(
        () => set.push("a"),
        () => set.pop(),
      );
    });

    expect(where).toMatchObject({ target: { loc: "src/Card.tsx:4:7", component: "Card" }, place: { nth: 1, absolute: null }, written: "src/Card.tsx:4:7" });
    // An instance is written where it is used.
    expect(editor.whereIs(layerOf(doc.querySelector("article")!)).written).toBe("src/App.tsx:6:9");
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

    const aside = offCanvas.moveOut(doc.querySelector("article")!, { x: -400, y: 120 }, ORIGIN);
    offCanvas.put(aside);

    expect(offCanvas.list()).toEqual([aside]);
    const iframe = aside.document.defaultView!.frameElement as HTMLIFrameElement;
    expect([iframe.style.left, iframe.style.top]).toEqual(["-400px", "120px"]);
    expect([aside.width, aside.height]).toEqual([300, Math.round(doc.querySelector("article")!.getBoundingClientRect().height)]);
    const layer = aside.layer()!;
    expect(layer.name).toBe("Card");
    expect(aside.view.layerAt(aside.editor.tree(), 10, 10)).toBe(layer);
    expect(offCanvas.of(layer.el)).toBe(aside);
    aside.editor.set(layer, "radius", 0);

    const saved = offCanvas.save();
    expect(saved).toMatchObject([{ id: aside.id, x: -400, y: 120, origin: ORIGIN, edits: { changes: [{ property: "radius", after: 0 }] } }]);

    const again = createOffCanvas(workspace(), saved, createHistory());
    const [back] = again.list();
    expect([back.id, back.x, back.y]).toEqual([aside.id, -400, 120]);
    expect(getComputedStyle(back.layer()!.el).borderTopLeftRadius).toBe("0px");
    expect(getComputedStyle(back.layer()!.el).backgroundColor).toBe("rgb(255, 255, 255)");
    back.editor.undo();
    expect(getComputedStyle(back.layer()!.el).borderTopLeftRadius).toBe("0px");
  });

  test("taken away, one is no longer there, nor kept; put back, it is again, as it was", () => {
    const doc = page();
    const offCanvas = createOffCanvas(workspace(), [], createHistory());
    const aside = offCanvas.moveOut(doc.querySelector("h3")!, { x: 0, y: -100 }, ORIGIN);
    offCanvas.put(aside);
    aside.editor.set(aside.layer()!, "opacity", 0.5);

    offCanvas.take(aside);
    expect(offCanvas.list()).toEqual([]);
    expect(offCanvas.save()).toEqual([]);

    offCanvas.put(aside);
    expect(getComputedStyle(aside.layer()!.el).opacity).toBe("0.5");
    offCanvas.place(aside, 20, -80);
    expect(offCanvas.save()).toMatchObject([{ x: 20, y: -80 }]);
  });
});
