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

    expect(editor.undo()).toBe(layerOf(cards[0]));
    expect(style(cards[0]).borderRadius).toBe("4px");
    expect(summary(changes)).toEqual([
      { property: "radius", after: 4 },
      { property: "radius", after: 8 },
    ]);
    expect(editor.undo()).toBe(layerOf(box));
    expect(style(box).borderRadius).toBe("0px");
    editor.undo();
    expect(cards.map((card) => style(card).borderRadius)).toEqual(["12px", "12px", "12px", "12px"]);
    expect(changes.list()).toEqual([]);
    expect(editor.undo()).toBeNull();

    editor.redo();
    editor.redo();
    expect(style(box).borderRadius).toBe("8px");
    expect(summary(changes)).toEqual([
      { property: "radius", after: 4 },
      { property: "radius", after: 8 },
    ]);
    editor.redo();
    expect(style(cards[2]).borderRadius).toBe("6px");
    expect(editor.redo()).toBeNull();
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

    expect(editor.redo()).toBeNull();
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
