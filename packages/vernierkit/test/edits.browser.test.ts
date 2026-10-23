import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { serializeCanvas } from "../src/client/freezer";
import { buildLayerTree, type Layer } from "../src/client/layers";
import { revertSaved } from "../src/client/saved-round";

/** Usage chains as the freezer writes them onto the canvas. */
const APP = [{ component: "App", usage: null, thirdParty: false }];
const cardAt = (usage: string) => [{ component: "Card", usage, thirdParty: false }, ...APP];
const chain = (levels: object[]) => `data-vk-chain='${JSON.stringify(levels)}'`;

/**
 * A fixed canvas: three cards from one usage (a loop), one card from another
 * usage, a locked badge from a dependency, and a box with no source marker.
 */
const BADGE = [{ component: "Badge", usage: "src/App.tsx:10:5", thirdParty: true }, ...APP];
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <main data-vk-loc="src/App.tsx:4:5" ${chain(APP)} style="display: grid; grid-template-columns: repeat(4, 100px); gap: 8px">
    ${[1, 2, 3]
      .map(
        (n) => `<article data-vk-loc="src/Card.tsx:3:5" ${chain(cardAt("src/App.tsx:6:9"))}
          style="height: 80px; background-color: rgb(255, 255, 255); border-radius: 12px">
          <h3 data-vk-loc="src/Card.tsx:4:7" ${chain(cardAt("src/App.tsx:6:9"))}>Card ${n}</h3>
        </article>`,
      )
      .join("")}
    <article data-vk-loc="src/Card.tsx:3:5" ${chain(cardAt("src/App.tsx:8:7"))}
      style="height: 80px; background-color: rgb(255, 255, 255); border-radius: 12px">
      <h3 data-vk-loc="src/Card.tsx:4:7" ${chain(cardAt("src/App.tsx:8:7"))}>Your turn</h3>
    </article>
    <span ${chain(BADGE)} style="display: block; background-color: rgb(0, 128, 0); border-radius: 4px"><b ${chain(BADGE)}>Beta</b></span>
  </main>
  <div id="unmarked" style="height: 40px; background-color: rgb(0, 0, 0)"></div>
</body>`;

let iframe: HTMLIFrameElement | undefined;

afterEach(() => iframe?.remove());

function openCanvas(page = PAGE) {
  iframe = document.createElement("iframe");
  iframe.style.width = "800px";
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(page);
  doc.close();
  const tree = buildLayerTree(doc);
  const changes = createChangeSet();
  const editor = createEditor(tree, changes);
  const cards = [...doc.querySelectorAll("article")];
  const layerOf = (el: Element) => find(tree.root, (layer) => layer.el === el && !layer.text)!;
  return { doc, tree, changes, editor, cards, layerOf };
}

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | undefined {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
}

const style = (el: Element) => getComputedStyle(el);

describe("solid fill", () => {
  test("paints every instance of the usage, and the change records target, scope, before, after, reference style and source", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.set(layerOf(cards[1]), "fill", { type: "solid", color: "#FF0000", opacity: 1 });

    expect(cards.map((card) => style(card).backgroundColor)).toEqual([
      "rgb(255, 0, 0)",
      "rgb(255, 0, 0)",
      "rgb(255, 0, 0)",
      "rgb(255, 255, 255)",
    ]);
    expect(changes.list()).toEqual([
      {
        id: 1,
        kind: "style",
        layer: "1",
        target: {
          loc: "src/Card.tsx:3:5",
          chain: cardAt("src/App.tsx:6:9"),
          component: "Card",
          instances: 3,
          locked: false,
          unlocated: false,
          context: { path: ["Page", "App", "Card"], element: "<article>" },
        },
        scope: "usage",
        property: "fill",
        before: { type: "solid", color: "#FFFFFF", opacity: 1 },
        after: { type: "solid", color: "#FF0000", opacity: 1 },
        style: { "background-color": "rgb(255 0 0 / 1)" },
        sources: [
          {
            properties: ["background-color"],
            kind: "inline",
            selector: null,
            file: null,
            layer: null,
            important: false,
            className: null,
            declaration: "background-color: rgb(255, 255, 255)",
          },
        ],
      },
    ]);
  });
});

describe("the ChangeSet", () => {
  test("keeps one change per property of a layer, from the first value to the latest, whichever instance was edited", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    const red = { type: "solid", color: "#FF0000", opacity: 1 } as const;
    const blue = { type: "solid", color: "#0000FF", opacity: 0.5 } as const;

    editor.set(layerOf(cards[0]), "fill", red);
    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(cards[2]), "fill", blue);
    editor.set(layerOf(cards[1]), "radius", 20);

    expect(changes.list().map(({ id, property, before, after }) => ({ id, property, before, after }))).toEqual([
      { id: 1, property: "fill", before: { type: "solid", color: "#FFFFFF", opacity: 1 }, after: blue },
      { id: 2, property: "radius", before: 12, after: 20 },
    ]);
    expect(style(cards[0]).backgroundColor).toBe("rgba(0, 0, 255, 0.5)");
  });

  test("a property set back to where it started is no longer a change", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(cards[0]), "fill", null);
    editor.set(layerOf(cards[0]), "radius", 12);

    expect(changes.list().map(({ property, before, after }) => ({ property, before, after }))).toEqual([
      { property: "fill", before: { type: "solid", color: "#FFFFFF", opacity: 1 }, after: null },
    ]);
    expect(style(cards[0]).borderRadius).toBe("12px");
  });

  test("setting a property to the value it already has is not a change", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.set(layerOf(cards[0]), "radius", 12);
    editor.set(layerOf(cards[0]), "fill", { type: "solid", color: "#FFFFFF", opacity: 1 });

    expect(changes.list()).toEqual([]);
  });

  test("a layer with no source marker is edited all the same, and recorded as not located", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;

    editor.set(layerOf(box), "radius", 8);

    expect(style(box).borderRadius).toBe("8px");
    expect(changes.list()[0].target).toEqual({
      loc: null,
      chain: [],
      component: null,
      instances: 1,
      locked: false,
      unlocated: true,
      context: { path: ["Page", "Frame"], element: '<div id="unmarked">' },
    });
  });

  test("the same property of different layers makes separate changes", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(cards[3]), "radius", 4);

    expect(changes.list().map((change) => change.target.chain[0].usage)).toEqual(["src/App.tsx:6:9", "src/App.tsx:8:7"]);
  });
});

describe("undo and redo", () => {
  const red = { type: "solid", color: "#FF0000", opacity: 1 } as const;
  const summary = (changes: ReturnType<typeof openCanvas>["changes"]) => changes.list().map(({ property, after }) => ({ property, after }));

  test("go back and forth through the edits in the order they were made, across layers, on the canvas and the ChangeSet alike", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;

    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(box), "radius", 8);
    editor.set(layerOf(cards[0]), "radius", 6);

    expect(editor.undo()).toEqual([layerOf(cards[0])]);
    expect(style(cards[0]).borderRadius).toBe("4px");
    expect(summary(changes)).toEqual([
      { property: "radius", after: 4 },
      { property: "radius", after: 8 },
    ]);
    expect(editor.undo()).toEqual([layerOf(box)]);
    expect(style(box).borderRadius).toBe("0px");
    editor.undo();
    expect(cards.map((card) => style(card).borderRadius)).toEqual(["12px", "12px", "12px", "12px"]);
    expect(changes.list()).toEqual([]);
    expect(editor.undo()).toEqual([]);

    editor.redo();
    editor.redo();
    expect(style(box).borderRadius).toBe("8px");
    expect(summary(changes)).toEqual([
      { property: "radius", after: 4 },
      { property: "radius", after: 8 },
    ]);
    editor.redo();
    expect(style(cards[2]).borderRadius).toBe("6px");
    expect(editor.redo()).toEqual([]);
  });

  test("back where it started, the layer has the page's own style again, as if never edited", () => {
    const { editor, cards, layerOf } = openCanvas();
    const before = cards[1].getAttribute("style");

    editor.set(layerOf(cards[0]), "fill", red);
    editor.undo();

    expect(cards[1].getAttribute("style")).toBe(before);
  });

  test("a new edit after undoing drops what could be redone", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.set(layerOf(cards[0]), "radius", 4);
    editor.undo();
    editor.set(layerOf(cards[0]), "fill", red);

    expect(editor.redo()).toEqual([]);
    expect(summary(changes)).toEqual([{ property: "fill", after: red }]);
  });

  test("the steps of one adjustment, as a drag on a number makes them, are undone together", () => {
    const { editor, cards, layerOf } = openCanvas();

    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(cards[0]), "radius", 5);
    editor.set(layerOf(cards[0]), "radius", 6, { continues: true });
    editor.set(layerOf(cards[0]), "radius", 7, { continues: true });
    editor.undo();

    expect(style(cards[0]).borderRadius).toBe("4px");
  });

  test("a change taken back from the change list is undone like any edit, and comes back with redo", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(cards[0]), "fill", red);

    expect(editor.revert(changes.list()[0].id)).toBe(layerOf(cards[0]));
    expect(style(cards[0]).borderRadius).toBe("12px");
    expect(summary(changes)).toEqual([{ property: "fill", after: red }]);

    editor.undo();
    expect(style(cards[0]).borderRadius).toBe("4px");
    expect(summary(changes)).toEqual([
      { property: "fill", after: red },
      { property: "radius", after: 4 },
    ]);
  });
});

describe("taking a change back from a saved round, with no canvas open", () => {
  const save = ({ doc, changes }: ReturnType<typeof openCanvas>) => ({
    canvas: serializeCanvas({ document: doc, width: 800, height: 600, scrollY: 0 }),
    changeSet: changes.save(),
  });
  const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

  test("puts the layer back as the page had it on the saved canvas, and drops the change; the others stay", () => {
    const opened = openCanvas();
    const { editor, changes, cards, layerOf } = opened;
    const before = cards.map((card) => card.getAttribute("style"));
    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(cards[0]), "fill", { type: "solid", color: "#FF0000", opacity: 1 });
    editor.set(layerOf(cards[3]), "radius", 2);
    const [radius, fill] = changes.list();

    const once = revertSaved(save(opened), radius.id)!;
    expect(once.changeSet.changes.map((change) => change.id)).toEqual([fill.id, 3]);
    const saved = parse(once.canvas).querySelectorAll<HTMLElement>("article");
    expect([...saved].slice(0, 3).map((card) => [card.style.borderRadius, card.style.backgroundColor])).toEqual(
      Array(3).fill(["12px", "rgb(255, 0, 0)"]),
    );
    expect(saved[3].style.borderRadius).toBe("2px");
    expect(once.canvas).toMatch(/^<!DOCTYPE html>/);

    const twice = revertSaved(once, fill.id)!;
    expect([...parse(twice.canvas).querySelectorAll("article")].slice(0, 3).map((card) => card.getAttribute("style"))).toEqual(before.slice(0, 3));
    expect(twice.changeSet.lastId).toBe(3);
  });

  test("with no change left, there is no round to keep", () => {
    const opened = openCanvas();
    opened.editor.set(opened.layerOf(opened.cards[0]), "radius", 4);

    expect(revertSaved(save(opened), 1)).toBeNull();
  });
});

describe("what can be edited", () => {
  test("a locked layer offers no fill or radius, and refuses them", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const badge = layerOf(doc.querySelector("span")!);

    expect(badge.kind).toBe("locked");
    expect(editor.can(badge, "fill")).toBe(false);
    expect(editor.can(badge, "radius")).toBe(false);
    expect(() => editor.set(badge, "fill", null)).toThrow();
    expect(style(doc.querySelector("span")!).backgroundColor).toBe("rgb(0, 128, 0)");
    expect(changes.list()).toEqual([]);
  });

  test("a layer painted with a gradient or an image offers no solid fill, which would not show", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.backgroundImage = "linear-gradient(red, blue)";

    expect(editor.can(layerOf(box), "fill")).toBe(false);
    expect(editor.can(layerOf(box), "radius")).toBe(true);
  });

  test("containers offer fill and radius; text offers neither", () => {
    const { doc, editor, cards, layerOf } = openCanvas();
    const card = layerOf(cards[0]);
    const title = layerOf(doc.querySelector("h3")!);

    expect([editor.can(card, "fill"), editor.can(card, "radius")]).toEqual([true, true]);
    expect([editor.can(title, "fill"), editor.can(title, "radius")]).toEqual([false, false]);
  });
});

describe("reading values in design language", () => {
  test("a fill in any CSS color space reads as hex and opacity; a transparent one as no fill", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    const read = (css: string) => {
      box.style.backgroundColor = css;
      return editor.read(layerOf(box), "fill");
    };

    // Tailwind v4's stone-200.
    expect(read("oklch(92.3% 0.003 48.717)")).toEqual({ type: "solid", color: "#E7E5E4", opacity: 1 });
    expect(read("rgb(13 153 255 / 0.4)")).toEqual({ type: "solid", color: "#0D99FF", opacity: 0.4 });
    expect(read("transparent")).toBeNull();
  });

  test("a radius reads as set, even past half the shorter side; a percentage in px; uneven corners one by one", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    const read = (css: string) => {
      box.style.borderRadius = css;
      return editor.read(layerOf(box), "radius");
    };

    // The box is 800 × 40: anything from 20 up draws the same pill.
    expect(read("99px")).toBe(99);
    expect(read("9999px")).toBe(9999);
    // Tailwind v4's rounded-full.
    expect(read("calc(infinity * 1px)")).toBe(9999);
    // 50% of each side, 400 × 20: the shorter one.
    expect(read("50%")).toBe(20);
    expect(read("0")).toBe(0);
    expect(read("8px 8px 0 0")).toEqual([8, 8, 0, 0]);
  });

  test("a radius set past half the shorter side reads back as set", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = layerOf(doc.getElementById("unmarked")!);

    editor.set(box, "radius", 99);

    expect(editor.read(box, "radius")).toBe(99);
  });
});

/**
 * Styles as a Vite + Tailwind v4 page has them: utilities in a CSS layer,
 * the page's own CSS not in one, each stylesheet carrying the file it comes from.
 */
const STYLED_PAGE = `<!DOCTYPE html>
<style data-vite-dev-id="/project/src/index.css">
  @layer theme, base, components, utilities;
  @layer utilities {
    .bg-white { background-color: var(--color-white, #fff); }
    .rounded-xl { border-radius: 12px; }
    .rounded-sm { border-radius: 4px; }
    .card { &:hover { background-color: red; } }
  }
  button { background: rgb(220, 38, 38); border-radius: 0; }
  .nested-state { @media (min-width: 1px) { border-radius: 6px; } }
  @media (min-width: 1px) { .wide { border-top-left-radius: 2px !important; } }
  @media (max-width: 1px) { .wide { border-top-left-radius: 1px !important; } }
</style>
<style media="print">button { background: black; }</style>
<body style="margin: 0">
  <main data-vk-loc="src/App.tsx:4:5" ${chain(APP)} style="display: flex; flex-direction: column; gap: 8px">
    <article data-vk-loc="src/Card.tsx:3:5" class="card bg-white rounded-xl" style="height: 40px"></article>
    <button data-vk-loc="src/App.tsx:9:7" class="bg-white rounded-xl" style="display: flex; height: 40px"></button>
    <section data-vk-loc="src/App.tsx:12:7" class="rounded-sm wide" style="height: 40px; border-radius: 8px"></section>
    <div data-vk-loc="src/App.tsx:14:7" style="display: flex; height: 40px"></div>
    <aside data-vk-loc="src/App.tsx:16:7" class="nested-state" style="display: flex; height: 40px"></aside>
  </main>
</body>`;

describe("where the value comes from", () => {
  const openStyled = () => {
    const canvas = openCanvas(STYLED_PAGE);
    const at = (selector: string) => canvas.layerOf(canvas.doc.querySelector(selector)!);
    return { ...canvas, at };
  };

  test("a class in a CSS layer: its rule, layer, file and class name", () => {
    const { editor, changes, at } = openStyled();

    editor.set(at("article"), "fill", { type: "solid", color: "#FF0000", opacity: 1 });

    expect(changes.list()[0].sources).toEqual([
      {
        properties: ["background-color"],
        kind: "rule",
        selector: ".bg-white",
        file: "/project/src/index.css",
        layer: "utilities",
        important: false,
        className: "bg-white",
        declaration: "background-color: var(--color-white, #fff)",
      },
    ]);
  });

  test("importance, media queries and the style attribute rank as the browser has them; corners set alike are grouped", () => {
    const { editor, changes, at } = openStyled();

    editor.set(at("section"), "radius", 0);

    const sources = changes.list()[0].sources;
    expect(sources.map(({ properties, kind, selector, important, declaration }) => ({ properties, kind, selector, important, declaration }))).toEqual([
      { properties: ["border-top-left-radius"], kind: "rule", selector: ".wide", important: true, declaration: "border-top-left-radius: 2px" },
      {
        properties: ["border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
        kind: "inline",
        selector: null,
        important: false,
        declaration: "border-radius: 8px",
      },
    ]);
  });

  test("with nothing setting it, the browser default; a nested rule for another state does not count", () => {
    const { editor, changes, at } = openStyled();

    editor.set(at("div"), "fill", { type: "solid", color: "#000000", opacity: 1 });
    editor.set(at("article"), "radius", 2);

    expect(changes.list()[0].sources).toEqual([
      { properties: ["background-color"], kind: "none", selector: null, file: null, layer: null, important: false, className: null, declaration: null },
    ]);
    expect(changes.list()[1].sources[0]).toMatchObject({ selector: ".rounded-xl", className: "rounded-xl", layer: "utilities" });
  });

  test("edited, set back and edited again, the source is still the page's, not the edit's", () => {
    const { editor, changes, at } = openStyled();
    const red = { type: "solid", color: "#FF0000", opacity: 1 } as const;

    editor.set(at("article"), "fill", red);
    editor.set(at("article"), "fill", { type: "solid", color: "#FFFFFF", opacity: 1 });
    editor.set(at("article"), "fill", red);

    expect(changes.list()[0].sources[0]).toMatchObject({ kind: "rule", selector: ".bg-white" });
  });

  test("declarations nested in a condition count; a stylesheet for another medium does not", () => {
    const { editor, changes, at } = openStyled();

    editor.set(at("aside"), "radius", 1);
    editor.set(at("button"), "radius", 1);

    expect(changes.list()[0].sources[0]).toMatchObject({ kind: "rule", selector: ".nested-state", declaration: "border-radius: 6px" });
    expect(changes.list()[1].sources[0]).toMatchObject({ selector: "button", declaration: "border-radius: 0px" });
  });

  test("a rule not in a layer wins over a class in one, as the browser has it", () => {
    const { editor, changes, at } = openStyled();

    editor.set(at("button"), "fill", { type: "solid", color: "#2563EB", opacity: 1 });

    expect(changes.list()[0].sources).toEqual([
      {
        properties: ["background-color"],
        kind: "rule",
        selector: "button",
        file: "/project/src/index.css",
        layer: null,
        important: false,
        className: null,
        declaration: "background: rgb(220, 38, 38)",
      },
    ]);
  });
});

/**
 * Layouts in design language: a horizontal Stack (flex row) holding a fixed, a
 * hugging and a filling layer; a vertical Stack (flex column); a plain
 * top-to-bottom flow; a Frame holding an absolute layer; and a fixed element
 * the freezer pinned where the designer saw it, 250px down the page.
 */
const LAYOUT = `<!DOCTYPE html>
<body style="margin: 0">
  <div id="row" style="display: flex; width: 600px; gap: 10px; padding: 4px 8px; align-items: center">
    <div id="fixed" style="width: 120px; height: 40px; flex: none"></div>
    <div id="hug" style="height: 40px; padding: 0 20px"></div>
    <div id="grow" style="flex: 1; height: 40px"></div>
  </div>
  <div id="column" style="display: flex; flex-direction: column; width: 300px">
    <div id="stretched" style="height: 20px"></div>
    <div id="centered" style="height: 20px; width: 50px; align-self: center"></div>
    <div id="narrow" style="height: 20px; width: fit-content; padding: 0 30px"></div>
    <div id="boxed" style="height: 20px; width: 50px; padding: 0 10px; border: 5px solid; box-sizing: content-box"></div>
  </div>
  <section id="flow" style="width: 300px">
    <div id="block" style="height: 30px"></div>
    <div style="height: 30px; margin-top: 10px"></div>
  </section>
  <div id="frame" style="position: relative; width: 300px; height: 200px">
    <div id="badge" style="position: absolute; left: 12px; top: 8px; width: 30px; height: 20px"></div>
  </div>
  <div id="pinned" data-vk-pinned="top left bottom right width height" data-vk-pin-offset="0 250"
    style="position: fixed; top: 300px !important; left: 20px !important; bottom: auto !important; right: auto !important; width: 50px !important; height: 10px !important"></div>
</body>`;

describe("size: Fixed, Hug and Fill", () => {
  const open = () => {
    const canvas = openCanvas(LAYOUT);
    return { ...canvas, at: (id: string) => canvas.layerOf(canvas.doc.getElementById(id)!), el: (id: string) => canvas.doc.getElementById(id)! };
  };
  const width = (el: Element) => el.getBoundingClientRect().width;

  test("read from what the page declares, not from the size it comes to", () => {
    const { editor, at } = open();
    const sizes = (id: string) => [editor.read(at(id), "width"), editor.read(at(id), "height")];

    // In a horizontal Stack, width runs along it: Fill grows into the room left.
    expect(sizes("fixed")).toEqual([{ type: "fixed", value: 120 }, { type: "fixed", value: 40 }]);
    expect(editor.read(at("hug"), "width")).toEqual({ type: "hug" });
    expect(editor.read(at("grow"), "width")).toEqual({ type: "fill" });
    // In a vertical Stack, width runs across it: Fill stretches.
    expect(editor.read(at("stretched"), "width")).toEqual({ type: "fill" });
    expect(editor.read(at("centered"), "width")).toEqual({ type: "fixed", value: 50 });
    expect(editor.read(at("narrow"), "width")).toEqual({ type: "hug" });
    // Fixed is the size the layer takes up, border and padding included.
    expect(editor.read(at("boxed"), "width")).toEqual({ type: "fixed", value: 80 });
    // A plain flow: a block fills the width and hugs its content down.
    expect(sizes("flow")).toEqual([{ type: "fixed", value: 300 }, { type: "hug" }]);
    expect(editor.read(at("block"), "width")).toEqual({ type: "fill" });
    expect(sizes("badge")).toEqual([{ type: "fixed", value: 30 }, { type: "fixed", value: 20 }]);
  });

  test("Fill, Hug and Fixed in a horizontal Stack, with the style that shows each", () => {
    const { editor, changes, at, el } = open();

    editor.set(at("fixed"), "width", { type: "fill" });
    // 600px inside the padding, 20 of gaps, 40 hugging: two layers share 540.
    expect(width(el("fixed"))).toBe(270);
    expect(changes.list()[0].style).toEqual({ width: "auto", "flex-grow": "1", "flex-shrink": "1", "flex-basis": "0%" });

    editor.set(at("grow"), "width", { type: "fixed", value: 100 });
    expect(width(el("grow"))).toBe(100);
    expect(width(el("fixed"))).toBe(440);
    editor.set(at("fixed"), "width", { type: "hug" });
    expect(width(el("fixed"))).toBe(0);
    expect(editor.read(at("fixed"), "width")).toEqual({ type: "hug" });
  });

  test("across a vertical Stack, Fill stretches and Hug shrinks to the content; Fixed counts border and padding in", () => {
    const { editor, at, el } = open();

    editor.set(at("centered"), "width", { type: "fill" });
    expect(width(el("centered"))).toBe(300);
    editor.set(at("stretched"), "width", { type: "hug" });
    expect(width(el("stretched"))).toBe(0);
    editor.set(at("boxed"), "width", { type: "fixed", value: 100 });
    expect(width(el("boxed"))).toBe(100);
    expect(editor.read(at("boxed"), "width")).toEqual({ type: "fixed", value: 100 });
  });

  test("Fill is there only where a Stack has room to give", () => {
    const { editor, at } = open();
    const fill = { type: "fill" } as const;

    expect(editor.can(at("hug"), "width", fill)).toBe(true);
    expect(editor.can(at("stretched"), "width", fill)).toBe(true);
    expect(editor.can(at("block"), "width", fill)).toBe(true);
    // Absolute, or down a plain flow, there is no room to fill.
    expect(editor.can(at("badge"), "width", fill)).toBe(false);
    expect(editor.can(at("block"), "height", fill)).toBe(false);
    expect(editor.can(at("badge"), "width", { type: "hug" })).toBe(true);
    expect(() => editor.set(at("badge"), "width", fill)).toThrow();
  });

  test("minimum and maximum sizes, none when not set", () => {
    const { editor, at, el } = open();

    expect(editor.read(at("grow"), "minWidth")).toBeNull();
    expect(editor.read(at("grow"), "maxWidth")).toBeNull();
    editor.set(at("grow"), "maxWidth", 200);
    expect(width(el("grow"))).toBe(200);
    editor.set(at("hug"), "minWidth", 90);
    expect(width(el("hug"))).toBe(90);
    editor.set(at("grow"), "maxWidth", null);
    expect(width(el("grow"))).toBe(370);
  });
});

describe("Stack", () => {
  const open = () => {
    const canvas = openCanvas(LAYOUT);
    return { ...canvas, at: (id: string) => canvas.layerOf(canvas.doc.getElementById(id)!), el: (id: string) => canvas.doc.getElementById(id)! };
  };

  test("direction, gap, padding, alignment and wrap, read in design language", () => {
    const { editor, at } = open();
    const row = at("row");

    expect(editor.read(row, "direction")).toBe("horizontal");
    expect(editor.read(row, "gap")).toBe(10);
    expect(editor.read(row, "padding")).toEqual([4, 8, 4, 8]);
    expect(editor.read(row, "align")).toEqual({ x: "start", y: "center", distribute: false });
    expect(editor.read(row, "wrap")).toBe(false);
    expect(editor.read(at("column"), "align")).toEqual({ x: "start", y: "start", distribute: false });
  });

  test("alignment on the nine-point grid maps to the axes of the Stack's direction", () => {
    const { editor, changes, at, el } = open();

    editor.set(at("row"), "align", { x: "end", y: "start", distribute: false });
    expect(style(el("row")).justifyContent).toBe("flex-end");
    expect(style(el("row")).alignItems).toBe("flex-start");
    editor.set(at("column"), "align", { x: "center", y: "end", distribute: false });
    expect(style(el("column")).justifyContent).toBe("flex-end");
    expect(style(el("column")).alignItems).toBe("center");
    expect(changes.list()[1].style).toEqual({ "justify-content": "flex-end", "align-items": "center" });

    editor.set(at("row"), "align", { x: "start", y: "center", distribute: true });
    expect(style(el("row")).justifyContent).toBe("space-between");
    expect(editor.read(at("row"), "align")).toEqual({ x: "start", y: "center", distribute: true });
  });

  test("direction, gap, padding and wrap", () => {
    const { editor, at, el } = open();

    editor.set(at("row"), "direction", "vertical");
    editor.set(at("row"), "gap", 24);
    editor.set(at("row"), "padding", [0, 16, 8, 16]);
    editor.set(at("column"), "wrap", true);

    expect(style(el("row")).flexDirection).toBe("column");
    expect(el("hug").getBoundingClientRect().top - el("fixed").getBoundingClientRect().bottom).toBe(24);
    expect(style(el("row")).padding).toBe("0px 16px 8px");
    expect(style(el("column")).flexWrap).toBe("wrap");
  });

  test("a plain flow becomes a real Stack once its gap or alignment changes, and the change says so", () => {
    const { editor, changes, at, el } = open();
    const flow = at("flow");
    expect([flow.kind, flow.direction]).toEqual(["stack", "vertical"]);

    editor.set(flow, "padding", [8, 8, 8, 8]);
    expect(style(el("flow")).display).toBe("block");
    editor.set(flow, "gap", 16);

    expect(style(el("flow")).display).toBe("flex");
    expect(style(el("flow")).flexDirection).toBe("column");
    expect(editor.read(flow, "gap")).toBe(16);
    expect(changes.list().map(({ property, asStack }) => ({ property, asStack }))).toEqual([
      { property: "padding", asStack: undefined },
      { property: "gap", asStack: true },
    ]);
    expect(changes.list()[1].style).toEqual({ display: "flex", "flex-direction": "column", gap: "16px" });
  });

  test("Stack properties are for Stacks", () => {
    const { editor, at } = open();

    expect(editor.can(at("frame"), "gap")).toBe(false);
    expect(editor.can(at("badge"), "align")).toBe(false);
    expect(editor.can(at("row"), "gap")).toBe(true);
  });
});

describe("absolute layers", () => {
  const open = () => {
    const canvas = openCanvas(LAYOUT);
    return { ...canvas, at: (id: string) => canvas.layerOf(canvas.doc.getElementById(id)!), el: (id: string) => canvas.doc.getElementById(id)! };
  };

  test("X and Y place an absolute layer in its parent; other layers have none", () => {
    const { editor, changes, at, el } = open();

    expect([editor.read(at("badge"), "x"), editor.read(at("badge"), "y")]).toEqual([12, 8]);
    editor.set(at("badge"), "x", 40);
    editor.set(at("badge"), "y", 0);

    expect(el("badge").getBoundingClientRect().left - el("frame").getBoundingClientRect().left).toBe(40);
    expect(changes.list().map((change) => change.style)).toEqual([
      { left: "40px", right: "auto" },
      { top: "0px", bottom: "auto" },
    ]);
    expect(editor.can(at("fixed"), "x")).toBe(false);
  });

  test("a layer the freezer pinned where the designer saw it reads and writes the page's own position", () => {
    const { editor, changes, at, el } = open();

    expect(editor.read(at("pinned"), "y")).toBe(50);
    editor.set(at("pinned"), "y", 60);

    expect(style(el("pinned")).top).toBe("310px");
    expect(editor.read(at("pinned"), "y")).toBe(60);
    expect(changes.list()[0].style).toEqual({ top: "60px", bottom: "auto" });
    // What the freezer pinned is not the page's: nothing in the page sets it.
    expect(changes.list()[0].sources.map((source) => source.kind)).toEqual(["none"]);
  });
});

describe("opacity, visibility and clipping", () => {
  const open = () => {
    const canvas = openCanvas(LAYOUT);
    return { ...canvas, at: (id: string) => canvas.layerOf(canvas.doc.getElementById(id)!), el: (id: string) => canvas.doc.getElementById(id)! };
  };

  test("opacity and clipping", () => {
    const { editor, at, el } = open();

    expect(editor.read(at("hug"), "opacity")).toBe(1);
    editor.set(at("hug"), "opacity", 0.4);
    expect(style(el("hug")).opacity).toBe("0.4");
    expect(editor.read(at("frame"), "clip")).toBe(false);
    editor.set(at("frame"), "clip", true);
    expect(style(el("frame")).overflow).toBe("hidden");
    expect(editor.read(at("frame"), "clip")).toBe(true);
  });

  test("a hidden layer stays in the layer tree, to be shown again", () => {
    const { doc, editor, at, el } = open();
    const before = el("hug").getAttribute("style");

    editor.set(at("hug"), "visible", false);
    expect(style(el("hug")).display).toBe("none");
    const rebuilt = buildLayerTree(doc);
    const hidden = find(rebuilt.root, (layer) => layer.el === el("hug"))!;
    expect(hidden).toBeDefined();
    expect(createEditor(rebuilt, createChangeSet()).read(hidden, "visible")).toBe(false);

    editor.set(at("hug"), "visible", true);
    expect(el("hug").getAttribute("style")).toBe(before);
  });

  test("undoing one change to a layer leaves its other changes on, though they set the same style", () => {
    const { editor, at, el } = open();

    editor.set(at("flow"), "gap", 16);
    editor.set(at("flow"), "visible", false);
    editor.undo();
    expect(style(el("flow")).display).toBe("flex");
    editor.redo();
    editor.revert(1);

    expect(style(el("flow")).display).toBe("none");
    expect(style(el("flow")).rowGap).toBe("normal");
  });
});

describe("what a locked layer offers", () => {
  test("its position and outer size only", () => {
    const { doc, editor, layerOf } = openCanvas();
    const badge = layerOf(doc.querySelector("span")!);

    expect(editor.can(badge, "width")).toBe(true);
    expect(editor.can(badge, "height")).toBe(true);
    for (const property of ["opacity", "visible", "clip", "minWidth", "gap", "padding"] as const) expect(editor.can(badge, property)).toBe(false);
  });
});

describe("several layers at once", () => {
  test("are changed in one step, undone together", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.batch(() => {
      editor.set(layerOf(cards[0]), "opacity", 0.5);
      editor.set(layerOf(cards[3]), "opacity", 0.5);
    });
    expect(changes.list()).toHaveLength(2);

    expect(editor.undo()).toEqual([layerOf(cards[0]), layerOf(cards[3])]);
    expect(changes.list()).toEqual([]);
    expect(cards.map((card) => style(card).opacity)).toEqual(["1", "1", "1", "1"]);
  });
});

/**
 * Moves: a vertical Stack of three, a horizontal Stack of one, an empty
 * Frame, and a paragraph with loose text beside an element.
 */
const at = (loc: string) => `data-vk-loc="src/App.tsx:${loc}" ${chain(APP)}`;
const MOVES = `<!DOCTYPE html>
<body style="margin: 0">
  <div id="list" ${at("5:5")} style="display: flex; flex-direction: column; gap: 10px; width: 200px">
    <div id="a" ${at("6:7")} style="height: 20px">A</div>
    <div id="b" ${at("7:7")} style="height: 20px">B</div>
    <div id="c" ${at("8:7")} style="height: 20px">C</div>
  </div>
  <div id="row" ${at("10:5")} style="display: flex; gap: 8px; height: 40px">
    <div id="d" ${at("11:7")} style="width: 30px">D</div>
  </div>
  <div id="board" ${at("13:5")} style="width: 300px; height: 200px"></div>
  <p id="mixed" ${at("15:5")}>Loose text <span ${at("15:20")} style="display: inline-block">pill</span> more</p>
</body>`;

describe("moving layers", () => {
  const open = (page = MOVES) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const order = (id: string) => [...canvas.doc.getElementById(id)!.children].map((el) => el.id);
    return { ...canvas, layer, order };
  };

  test("within a Stack, to another place among its layers, recorded from where it was to where it is", () => {
    const { editor, changes, layer, order } = open();

    editor.move(layer("c"), { parent: layer("list"), index: 0 });

    expect(order("list")).toEqual(["c", "a", "b"]);
    expect(editor.tree().root.children[0].children.map((l) => l.name)).toEqual(["C", "A", "B"]);
    const [change] = changes.list();
    expect(change).toMatchObject({
      kind: "move",
      property: "move",
      target: { loc: "src/App.tsx:8:7", context: { path: ["Page", "App", "C"] } },
      before: { container: { target: { loc: "src/App.tsx:5:5" } }, nth: 3, absolute: null },
      after: { container: { target: { loc: "src/App.tsx:5:5" } }, nth: 1, absolute: null },
      style: {},
    });
  });

  test("moved back where it was, it is no longer a change; undo and redo move it again", () => {
    const { editor, changes, layer, order } = open();

    editor.move(layer("a"), { parent: layer("list"), index: 2 });
    expect(order("list")).toEqual(["b", "c", "a"]);
    editor.move(layer("a"), { parent: layer("list"), index: 0 });
    expect(changes.list()).toEqual([]);

    editor.undo();
    expect(order("list")).toEqual(["b", "c", "a"]);
    editor.undo();
    expect(order("list")).toEqual(["a", "b", "c"]);
    expect(editor.redo().map((l) => l.name)).toEqual(["A"]);
    expect(order("list")).toEqual(["b", "c", "a"]);
    expect(changes.list()).toHaveLength(1);
  });

  test("into another Stack, at the place it is dropped", () => {
    const { editor, changes, layer, order } = open();

    editor.move(layer("b"), { parent: layer("row"), index: 1 });

    expect(order("list")).toEqual(["a", "c"]);
    expect(order("row")).toEqual(["d", "b"]);
    expect(changes.list()[0]).toMatchObject({
      before: { container: { target: { loc: "src/App.tsx:5:5" } }, nth: 2 },
      after: { container: { target: { loc: "src/App.tsx:10:5" } }, nth: 2 },
    });
  });

  test("into a Frame, absolute where it is dropped: the Frame becomes its positioning reference, and undo puts all back", () => {
    const { doc, editor, changes, layer, order } = open();
    const board = doc.getElementById("board")!;
    const b = doc.getElementById("b")!;

    editor.move(layer("b"), { parent: layer("board"), x: 40, y: 30 });

    expect(b.parentElement).toBe(board);
    expect(b.getBoundingClientRect().left - board.getBoundingClientRect().left).toBe(40);
    expect(b.getBoundingClientRect().top - board.getBoundingClientRect().top).toBe(30);
    // It keeps the size it had in the Stack.
    expect(b.getBoundingClientRect().width).toBe(200);
    expect(style(board).position).toBe("relative");
    expect(editor.tree().root.children[2].children.map((l) => [l.name, l.absolute])).toEqual([["B", true]]);
    expect(changes.list()[0]).toMatchObject({
      after: { container: { target: { loc: "src/App.tsx:13:5" } }, nth: 1, absolute: { x: 40, y: 30 } },
      style: { position: "absolute", left: "40px", top: "30px", width: "200px", height: "20px" },
    });

    editor.undo();
    expect(order("list")).toEqual(["a", "b", "c"]);
    expect(style(b).position).toBe("static");
    expect(style(board).position).toBe("static");
    expect(changes.list()).toEqual([]);
  });

  test("taken back from a saved round with no canvas open, it goes back where it was", () => {
    const opened = open();
    opened.editor.move(opened.layer("c"), { parent: opened.layer("list"), index: 0 });
    opened.editor.move(opened.layer("b"), { parent: opened.layer("board"), x: 10, y: 10 });
    const saved = { canvas: serializeCanvas({ document: opened.doc, width: 800, height: 600, scrollY: 0 }), changeSet: opened.changes.save() };

    const reverted = revertSaved(revertSaved(saved, 2)!, 1);

    expect(reverted).toBeNull();
    const doc = new DOMParser().parseFromString(revertSaved(saved, 2)!.canvas, "text/html");
    expect([...doc.getElementById("list")!.children].map((el) => el.id)).toEqual(["c", "a", "b"]);
    expect(doc.getElementById("b")!.getAttribute("style")).toBe("height: 20px");
    expect(doc.getElementById("board")!.hasAttribute("style")).toBe(true);
    expect(doc.getElementById("board")!.style.position).toBe("");
  });

  test("loose text is wrapped in an element of its own to move, and the change says so", () => {
    const { doc, editor, changes, order } = open();
    const run = find(editor.tree().root, (l) => l.name === "more")!;

    editor.move(run, { parent: find(editor.tree().root, (l) => l.el.id === "row")!, index: 0 });

    const wrapped = doc.getElementById("row")!.firstElementChild!;
    expect(wrapped.localName).toBe("span");
    expect(wrapped.textContent!.trim()).toBe("more");
    expect(order("row")).toEqual(["", "d"]);
    expect(changes.list()[0]).toMatchObject({ wrap: true, target: { loc: "src/App.tsx:15:5" } });
  });

  test("an instance a loop renders, moved among its siblings, is a change to the data the loop goes through", () => {
    const item = `data-vk-loc="src/Item.tsx:2:3" ${chain([{ component: "Item", usage: "src/App.tsx:6:9", thirdParty: false }, ...APP])}`;
    const { doc, editor, changes, layer } = open(`<!DOCTYPE html>
      <ul id="list" ${at("5:5")} style="display: flex; flex-direction: column">
        <li ${item}>One</li><li ${item}>Two</li><li ${item}>Three</li>
      </ul>`);
    const second = find(editor.tree().root, (l) => l.el === doc.querySelectorAll("li")[1])!;

    editor.move(second, { parent: layer("list"), index: 0 });

    expect([...doc.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Two", "One", "Three"]);
    expect(changes.list()[0]).toMatchObject({ data: true, target: { instances: 3 }, before: { nth: 2 }, after: { nth: 1 } });
  });

  test("where a layer can go: not into itself, into a locked layer, or into a usage it does not repeat with", () => {
    const { doc, editor, cards } = open(PAGE);
    const tree = editor.tree();
    const layerOf = (el: Element) => find(tree.root, (l) => l.el === el && !l.text)!;
    const badge = layerOf(doc.querySelector("span")!);
    const title = layerOf(doc.querySelector("h3")!);

    expect(editor.canMove(badge)).toBe(true);
    expect(editor.canDrop(layerOf(cards[3]), badge)).toBe(false);
    expect(editor.canDrop(layerOf(cards[0]), layerOf(cards[0]))).toBe(false);
    // A card's title, in each of the three cards of the loop: into one card of another usage, it could not follow.
    expect(editor.canDrop(title, layerOf(cards[3]))).toBe(false);
    expect(editor.canDrop(title, layerOf(cards[2]))).toBe(true);
    expect(editor.canMove(tree.root)).toBe(false);
  });
});
