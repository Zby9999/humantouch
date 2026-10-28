import { afterEach, describe, expect, test, vi } from "vitest";
import { CHECK_SETTLE_MS } from "../src/service-protocol";
import { layerName } from "../src/design-values";
import { readMediaBreakpoints, type ProjectBreakpoints } from "../src/client/breakpoints";
import { createChangeSet } from "../src/client/changeset";
import { checkChange, type PageAt } from "../src/client/check";
import { createClipboard } from "../src/client/clipboard";
import { moveInlineEdits } from "../src/client/canvas-style";
import { createEditor } from "../src/client/edits";
import { serializeCanvas } from "../src/client/freezer";
import { boxOf, type Layer } from "../src/client/layers";
import { revertSaved } from "../src/client/saved-round";
import { createViews } from "../src/client/views";

/** Usage chains as the freezer writes them onto the canvas. */
const APP = [{ component: "App", usage: null, thirdParty: false }];
const cardAt = (usage: string) => [{ component: "Card", usage, thirdParty: false }, ...APP];
const chain = (levels: object[]) => `data-vk-chain='${JSON.stringify(levels)}'`;

/**
 * A fixed canvas: three cards from one usage (a loop), one card from phoneFrame
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
let live: HTMLIFrameElement | undefined;
/** A second view of the canvas, as narrow as a phone. */
let phoneFrame: HTMLIFrameElement | undefined;
/** A saved canvas, shown as it would be put back. */
let savedFrame: HTMLIFrameElement | undefined;

afterEach(() => {
  iframe?.remove();
  live?.remove();
  phoneFrame?.remove();
  savedFrame?.remove();
});

/** A saved canvas, shown 800 px wide, as it looks. */
function showSaved(html: string): Document {
  savedFrame?.remove();
  savedFrame = document.createElement("iframe");
  savedFrame.style.width = "800px";
  document.body.append(savedFrame);
  const doc = savedFrame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  return doc;
}

function openCanvas(page = PAGE, project: ProjectBreakpoints | null = null) {
  iframe = document.createElement("iframe");
  iframe.style.width = "800px";
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(page);
  doc.close();
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const changes = createChangeSet();
  const editor = createEditor(views, changes, project);
  const tree = editor.tree();
  const cards = [...doc.querySelectorAll("article")];
  const layerOf = (el: Element) => find(tree.root, (layer) => layer.el === el && !layer.text)!;
  return { doc, views, tree, changes, editor, cards, layerOf };
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
    canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }),
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
    const saved = showSaved(once.canvas).querySelectorAll<HTMLElement>("article");
    expect([...saved].slice(0, 3).map((card) => [style(card).borderRadius, style(card).backgroundColor])).toEqual(
      Array(3).fill(["12px", "rgb(255, 0, 0)"]),
    );
    expect(style(saved[3]).borderRadius).toBe("2px");
    expect(once.canvas).toMatch(/^<!DOCTYPE html>/);

    const twice = revertSaved(once, fill.id)!;
    const back = [...parse(twice.canvas).querySelectorAll("article")].slice(0, 3);
    expect(back.map((card) => card.getAttribute("style"))).toEqual(before.slice(0, 3));
    expect(back.map((card) => card.hasAttribute("data-vk-style"))).toEqual([false, false, false]);
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

  test("with nothing setting it, the browser default; a nested rule for phoneFrame state does not count", () => {
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

  test("declarations nested in a condition count; a stylesheet for phoneFrame medium does not", () => {
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

  test("a Stack turned the other way is laid out the other way in the layers too, as a drag reads them; undone, back again", () => {
    const { editor, at, el } = open();
    expect(at("row").direction).toBe("horizontal");

    editor.set(at("row"), "direction", "vertical");
    expect(editor.tree().layerOf(el("row"))!.direction).toBe("vertical");
    editor.set(at("flow"), "direction", "horizontal");
    expect(editor.tree().layerOf(el("flow"))!.direction).toBe("horizontal");

    editor.undo();
    editor.undo();
    expect(editor.tree().layerOf(el("row"))!.direction).toBe("horizontal");
    expect(editor.tree().layerOf(el("flow"))!.direction).toBe("vertical");
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
    const { views, editor, at, el } = open();
    const before = el("hug").getAttribute("style");

    editor.set(at("hug"), "visible", false);
    expect(style(el("hug")).display).toBe("none");
    const rebuilt = createEditor(views, createChangeSet());
    const hidden = find(rebuilt.tree().root, (layer) => layer.el === el("hug"))!;
    expect(hidden).toBeDefined();
    expect(rebuilt.read(hidden, "visible")).toBe(false);

    editor.set(at("hug"), "visible", true);
    expect(el("hug").getAttribute("style")).toBe(before);
  });

  test("hidden, a layer still offers and reads its properties as when shown, and can be changed meanwhile", () => {
    const { editor, at, el } = open();

    editor.set(at("row"), "visible", false);

    expect(editor.can(at("row"), "gap")).toBe(true);
    expect(editor.read(at("row"), "gap")).toBe(10);
    expect(editor.read(at("row"), "width")).toEqual({ type: "fixed", value: 616 });
    expect(editor.measure(at("row")).width).toBe(616);
    editor.set(at("row"), "gap", 20);
    expect(style(el("row")).display).toBe("none");
    editor.set(at("row"), "visible", true);
    expect(style(el("row")).display).toBe("flex");
    expect(style(el("row")).columnGap).toBe("20px");
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

  test("within a Stack, to phoneFrame place among its layers, recorded from where it was to where it is", () => {
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

  test("into phoneFrame Stack, at the place it is dropped", () => {
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
    const saved = { canvas: serializeCanvas({ document: opened.doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: opened.changes.save() };

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
    // A card's title, in each of the three cards of the loop: into one card of phoneFrame usage, it could not follow.
    expect(editor.canDrop(title, layerOf(cards[3]))).toBe(false);
    expect(editor.canDrop(title, layerOf(cards[2]))).toBe(true);
    expect(editor.canMove(tree.root)).toBe(false);
  });
});

describe("moves, taken back in any order", () => {
  const open = (page = MOVES) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const order = (id: string) => [...canvas.doc.getElementById(id)!.children].map((el) => el.id);
    return { ...canvas, layer, order };
  };

  test("a move taken back from the change list after a later one still puts its layer back, on the canvas and the saved round", () => {
    const opened = open();
    const { editor, changes, layer, order } = opened;
    editor.move(layer("a"), { parent: layer("list"), index: 2 });
    editor.move(layer("b"), { parent: layer("list"), index: 2 });
    expect(order("list")).toEqual(["c", "a", "b"]);
    const saved = { canvas: serializeCanvas({ document: opened.doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };

    editor.revert(changes.list()[0].id);
    expect(order("list")[0]).toBe("a");
    expect(changes.list()).toHaveLength(1);

    const doc = new DOMParser().parseFromString(revertSaved(saved, saved.changeSet.changes[0].id)!.canvas, "text/html");
    expect([...doc.getElementById("list")!.children].map((el) => el.id)[0]).toBe("a");
  });

  test("two instances a loop renders, moved one after the other, are two changes", () => {
    const item = `data-vk-loc="src/Item.tsx:2:3" ${chain([{ component: "Item", usage: "src/App.tsx:6:9", thirdParty: false }, ...APP])}`;
    const { doc, editor, changes, layer } = open(`<!DOCTYPE html>
      <ul id="list" ${at("5:5")} style="display: flex; flex-direction: column">
        <li ${item}>One</li><li ${item}>Two</li><li ${item}>Three</li>
      </ul>`);
    const li = (text: string) => find(editor.tree().root, (l) => l.el.textContent === text && l.el.localName === "li")!;

    editor.move(li("Three"), { parent: layer("list"), index: 0 });
    editor.move(li("One"), { parent: layer("list"), index: 2 });

    expect([...doc.querySelectorAll("li")].map((el) => el.textContent)).toEqual(["Three", "Two", "One"]);
    expect(changes.list().map((change) => [change.before, change.after].map((place) => (place as { nth: number }).nth))).toEqual([
      [3, 1],
      // "One" is 2nd once "Three" has gone first.
      [2, 3],
    ]);
  });

  test("a Frame stays the positioning reference of what was moved into it when a change of its own is undone", () => {
    const { doc, editor, layer } = open();
    editor.move(layer("b"), { parent: layer("board"), x: 10, y: 10 });
    editor.set(layer("board"), "opacity", 0.5);

    editor.undo();

    expect(style(doc.getElementById("board")!).position).toBe("relative");
  });

  test("dragged again in the Frame it was moved into, it is still one move, to where it is now", () => {
    const { editor, changes, layer } = open();
    editor.move(layer("b"), { parent: layer("board"), x: 10, y: 10 });
    editor.move(layer("b"), { parent: layer("board"), x: 50, y: 20 });

    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0]).toMatchObject({ kind: "move", after: { absolute: { x: 50, y: 20 } }, style: { left: "50px", top: "20px" } });
  });

  test("a layer the freezer pinned to the window stays in its container", () => {
    const { doc, editor, layer } = open(MOVES.replace("<p id", `<div id="pinned" data-vk-pin-offset="0 250" style="position: fixed; top: 300px; left: 0; width: 20px; height: 20px"></div><p id`));

    expect(editor.canDrop(layer("pinned"), layer("board"))).toBe(false);
    expect(editor.canDrop(layer("pinned"), find(editor.tree().root, (l) => l.el === doc.body)!)).toBe(true);
  });
});

/** Each element of the page, in order, with its style: what it looks like, apart from the editor's own attributes. */
const styles = (doc: Document) => [...doc.body.querySelectorAll("*")].map((el) => `${el.id || el.localName} ${el.getAttribute("style")}`);

/** A Frame 600 × 400 at the page's top left, with these layers in it. */
const board = (layers: string) => `<!DOCTYPE html>
<body style="margin: 0">
  <div id="board" ${at("20:5")} style="position: relative; width: 600px; height: 400px">${layers}</div>
</body>`;
/** An absolute layer in the board: `[left, top, width, height]`. */
const placed = (id: string, [left, top, width, height]: number[]) =>
  `<div id="${id}" ${at(`2${id.charCodeAt(0) - 96}:7`)} style="position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px"></div>`;

const NUDGES = `<!DOCTYPE html>
<body style="margin: 0">
  <div id="list" ${at("5:5")} style="display: flex; flex-direction: column; gap: 10px; width: 200px">
    <div id="a" ${at("6:7")} style="height: 20px">A</div>
    <div id="b" ${at("7:7")} style="height: 20px">B</div>
    <div id="c" ${at("8:7")} style="height: 20px">C</div>
  </div>
  <div id="board" ${at("10:5")} style="position: relative; width: 300px; height: 200px">
    <div id="free" ${at("11:7")} style="position: absolute; left: 12px; top: 8px; width: 30px; height: 20px"></div>
  </div>
  <div id="frame" ${at("13:5")} style="width: 300px; height: 100px"><span id="tag" ${at("13:30")} style="display: inline-block; width: 40px; height: 20px; margin-left: 5px">Tag</span></div>
</body>`;

describe("nudging layers, as the arrow keys do", () => {
  const open = () => {
    const canvas = openCanvas(NUDGES);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const order = () => [...canvas.doc.getElementById("list")!.children].map((el) => el.id);
    /** Where an element is in its container, in px. */
    const place = (id: string, doc = canvas.doc) => {
      const r = doc.getElementById(id)!.getBoundingClientRect();
      const p = doc.getElementById(id)!.parentElement!.getBoundingClientRect();
      return [r.left - p.left, r.top - p.top];
    };
    return { ...canvas, layer, order, place };
  };

  test("a layer placed freely moves by as much, its X and Y; a run of nudges is one step, undone at once", () => {
    const { editor, changes, layer, place } = open();

    editor.nudge([layer("free")], 1, 0);
    editor.nudge([layer("free")], 10, 0, { continues: true });
    editor.nudge([layer("free")], 0, -1, { continues: true });

    expect(place("free")).toEqual([23, 7]);
    expect(changes.list().map((change) => [change.property, change.before, change.after])).toEqual([
      ["x", 12, 23],
      ["y", 8, 7],
    ]);
    editor.undo();
    expect(place("free")).toEqual([12, 8]);
    expect(changes.list()).toEqual([]);
    editor.redo();
    expect(place("free")).toEqual([23, 7]);
  });

  test("nudges apart are steps apart", () => {
    const { editor, layer, place } = open();

    editor.nudge([layer("free")], 1, 0);
    editor.nudge([layer("free")], 1, 0);
    editor.undo();

    expect(place("free")).toEqual([13, 8]);
  });

  test("a nudge of other layers is a step of its own, though it comes right after; undone, the run leaves its layer selected", () => {
    const { editor, layer, place, order } = open();

    editor.nudge([layer("free")], 1, 0);
    editor.nudge([layer("free")], 1, 0, { continues: true });
    editor.nudge([layer("a")], 0, 1, { continues: true });
    editor.undo();

    expect(order()).toEqual(["a", "b", "c"]);
    expect(place("free")).toEqual([14, 8]);
    expect(editor.undo().map((l) => l.el.id)).toEqual(["free"]);
    expect(place("free")).toEqual([12, 8]);
  });

  test("in a Stack, a layer swaps places with the next one along it that way; at the end, or across the Stack, it stays", () => {
    const { editor, changes, layer, order } = open();

    editor.nudge([layer("a")], 0, 1);
    expect(order()).toEqual(["b", "a", "c"]);
    editor.nudge([layer("a")], 0, 10, { continues: true });
    expect(order()).toEqual(["b", "c", "a"]);
    editor.nudge([layer("a")], 0, 1, { continues: true });
    editor.nudge([layer("a")], 1, 0, { continues: true });
    expect(order()).toEqual(["b", "c", "a"]);

    // One move, from where it was to where it is; one step.
    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0]).toMatchObject({ kind: "move", before: { nth: 1 }, after: { nth: 3 } });
    editor.undo();
    expect(order()).toEqual(["a", "b", "c"]);
    expect(changes.list()).toEqual([]);
  });

  test("several layers side by side in a Stack move together, until the first reaches the end", () => {
    const { editor, layer, order } = open();

    const moved = editor.nudge([layer("a"), layer("b")], 0, 1);
    expect(order()).toEqual(["c", "a", "b"]);
    expect(moved.map((l) => l.el.id)).toEqual(["a", "b"]);
    editor.nudge(moved, 0, 1);
    expect(order()).toEqual(["c", "a", "b"]);
    editor.nudge(moved, 0, -1);
    expect(order()).toEqual(["a", "b", "c"]);
  });

  test("in a Frame, a layer in its flow is placed freely where it is, nudged on from there", () => {
    const { editor, changes, layer, place } = open();

    const was = place("tag");
    const [moved] = editor.nudge([layer("tag")], 0, 10);

    expect(place("tag")).toEqual([was[0], was[1] + 10]);
    expect(moved.absolute).toBe(true);
    expect(changes.list()[0]).toMatchObject({ kind: "move", after: { absolute: { x: 0, y: 10 } } });
    editor.nudge([moved], 1, 0, { continues: true });
    expect(place("tag")).toEqual([was[0] + 1, was[1] + 10]);
    expect(changes.list()).toHaveLength(1);
    editor.undo();
    expect(style(layer("tag").el).position).toBe("static");
    expect(place("tag")).toEqual(was);
  });

  test("the page stays", () => {
    const { editor, changes } = open();

    expect(editor.nudge([editor.tree().root], 1, 0)).toEqual([editor.tree().root]);
    expect(changes.list()).toEqual([]);
  });
});

describe("making a Stack", () => {
  const open = (page = MOVES) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const rects = (...ids: string[]) => ids.map((id) => canvas.doc.getElementById(id)!.getBoundingClientRect().toJSON() as DOMRect);
    return { ...canvas, layer, rects };
  };
  /** How far each layer moved, at most, in px. */
  const drift = (before: DOMRect[], after: DOMRect[]) =>
    Math.max(...before.map((b, i) => Math.max(Math.abs(b.x - after[i].x), Math.abs(b.y - after[i].y))));

  test("of layers side by side: a horizontal Stack, in their order across, its gap the median of the spaces between, where they were", () => {
    // In the page's order, the third comes first; the spaces between are 20, 24 and 30px.
    const { doc, editor, changes, layer, rects } = open(
      board([placed("c", [264, 30, 100, 40]), placed("a", [20, 30, 100, 40]), placed("b", [140, 30, 100, 40]), placed("d", [394, 30, 100, 40])].join("")),
    );
    const before = rects("a", "b", "c", "d");

    const stack = editor.stack(["a", "b", "c", "d"].map(layer));

    expect(stack.kind).toBe("stack");
    expect(stack.direction).toBe("horizontal");
    expect(stack.children.map((l) => l.el.id)).toEqual(["a", "b", "c", "d"]);
    expect(stack.el.parentElement).toBe(doc.getElementById("board"));
    expect(drift(before, rects("a", "b", "c", "d"))).toBeLessThanOrEqual(6);
    expect(editor.tree().root.children[0].children).toEqual([stack]);
    const [change] = changes.list();
    expect(change).toMatchObject({
      kind: "stack",
      layer: stack.el.getAttribute("data-vk-layer"),
      property: "stack",
      target: { loc: "src/App.tsx:20:5" },
      before: null,
      after: {
        direction: "horizontal",
        gap: 24,
        padding: [0, 0, 0, 0],
        align: { x: "start", y: "start", distribute: false },
        place: { container: { target: { loc: "src/App.tsx:20:5" } }, nth: 1, absolute: { x: 20, y: 30 } },
        layers: ["a", "b", "c", "d"].map((id) => ({ target: { loc: layer(id).loc }, from: { absolute: { x: Number(doc.getElementById(id)!.style.left.slice(0, -2)) } } })),
      },
      // As tall as each other: they stay as tall as the Stack.
      style: { display: "flex", "flex-direction": "row", gap: "24px", "align-items": "stretch", position: "absolute", left: "20px", top: "30px" },
    });
  });

  test("of layers one above the other: a vertical Stack; centered across, it aligns them center", () => {
    const { editor, changes, layer, rects } = open(
      board([placed("a", [140, 0, 120, 50]), placed("b", [170, 70, 60, 50]), placed("c", [155, 130, 90, 50])].join("")),
    );
    const before = rects("a", "b", "c");

    editor.stack(["a", "b", "c"].map(layer));

    // Spaces of 20 and 10px: the median of two is their mean.
    expect(changes.list()[0].after).toMatchObject({ direction: "vertical", gap: 15, align: { x: "center", y: "start" } });
    expect(drift(before, rects("a", "b", "c"))).toBeLessThanOrEqual(5);
  });

  test("lined up on their far edges, they are aligned to the end; spread out no further across than down, the Stack is vertical", () => {
    const { editor, changes, layer } = open(board([placed("a", [100, 0, 100, 40]), placed("b", [140, 60, 60, 40])].join("")));

    editor.stack([layer("a"), layer("b")]);

    expect(changes.list()[0].after).toMatchObject({ direction: "vertical", gap: 20, align: { x: "end", y: "start" } });
  });

  test("overlapping layers are put one after the other, with no gap", () => {
    const { editor, changes, layer } = open(board([placed("a", [0, 0, 100, 40]), placed("b", [60, 10, 100, 40])].join("")));

    editor.stack([layer("a"), layer("b")]);

    expect(changes.list()[0].after).toMatchObject({ direction: "horizontal", gap: 0 });
  });

  test("a Frame selected alone becomes a Stack of its layers, its padding the room on their nearer sides", () => {
    const { doc, editor, changes, layer, rects } = open(board([placed("a", [20, 30, 100, 40]), placed("b", [140, 30, 100, 40])].join("")));
    const before = rects("a", "b");

    const stack = editor.stack([layer("board")]);

    expect(stack.el).toBe(doc.getElementById("board"));
    expect(stack.kind).toBe("stack");
    expect(changes.list()[0]).toMatchObject({
      kind: "stack",
      target: { loc: "src/App.tsx:20:5" },
      after: { place: null, direction: "horizontal", gap: 20, padding: [30, 20, 30, 20], align: { x: "start", y: "start" } },
      style: { display: "flex", padding: "30px 20px 30px 20px" },
    });
    expect(drift(before, rects("a", "b"))).toBe(0);
    expect(style(doc.getElementById("a")!).position).toBe("static");
  });

  test("a Frame's free layers are placed by its Stack: aligned where they are nearest, the rest of the room the alignment's", () => {
    // Its size counting its padding in, as most pages size things: the padding does not make it larger.
    const { doc, editor, changes, layer, rects } = open(board(placed("a", [380, 160, 100, 40])).replace("position: relative;", "position: relative; box-sizing: border-box;"));
    const before = rects("a");

    let stack = editor.stack([layer("board")]);

    expect(changes.list()[0].after).toMatchObject({ padding: [160, 120, 160, 120], align: { x: "end", y: "start" } });
    expect(drift(before, rects("a"))).toBe(0);
    editor.undo();

    // Nearer the bottom: along the Stack too, it is aligned to the end.
    editor.move(layer("a"), { parent: layer("board"), x: 380, y: 300 });
    editor.stack([layer("board")]);
    expect(changes.list().at(-1)!.after).toMatchObject({ padding: [60, 120, 60, 120], align: { x: "end", y: "end" } });
    expect(changes.list().at(-1)!.style["justify-content"]).toBe("flex-end");
    const moved = doc.getElementById("a")!.getBoundingClientRect();
    expect([moved.left, moved.top].map(Math.round)).toEqual([380, 300]);
    stack = layer("board");

    editor.set(stack, "align", { x: "center", y: "center", distribute: false });

    const frame = doc.getElementById("board")!.getBoundingClientRect();
    const a = doc.getElementById("a")!.getBoundingClientRect();
    expect([a.left - frame.left, a.top - frame.top]).toEqual([250, 180]);
  });

  test("of layers in a Stack's layout: a Stack in their place, nothing moving", () => {
    const { doc, editor, changes, layer, rects } = open();
    const before = rects("a", "b", "c");

    const stack = editor.stack([layer("b"), layer("a")]);

    expect([...doc.getElementById("list")!.children].map((el) => el.id || el.localName)).toEqual(["div", "c"]);
    expect(stack.children.map((l) => l.el.id)).toEqual(["a", "b"]);
    expect(rects("a", "b", "c")).toEqual(before);
    expect(changes.list()[0].after).toMatchObject({ direction: "vertical", gap: 10, align: { x: "start" }, place: { nth: 1, absolute: null } });
    // Its layers were as wide as the Stack they were in: they still are.
    expect(changes.list()[0].style["align-items"]).toBe("stretch");
  });

  test("of layers with margins: the room between them is the gap, the Stack has none of its own; undone, the margins are back", () => {
    const { doc, editor, changes, layer, rects } = open(`<!DOCTYPE html><body style="margin: 0">
      <section id="hero" ${at("5:5")} style="display: flex; flex-direction: column; width: 400px">
        <header id="h" ${at("6:7")} style="height: 30px">Title</header>
        <p id="p" ${at("7:7")} style="height: 20px; margin: 16px 0 0">Words</p>
        <button id="btn" ${at("8:7")} style="height: 30px; margin: 24px 0 4px; align-self: flex-start">Go</button>
      </section></body>`);
    const before = rects("h", "p", "btn");

    const stack = editor.stack([layer("p"), layer("btn")]);

    // The paragraph's margin above it goes: the Stack is right under the header, and hugs its layers.
    const [h, p, btn] = rects("h", "p", "btn");
    expect(p.top).toBe(h.bottom);
    expect(btn.top - p.bottom).toBe(24);
    expect(stack.el.getBoundingClientRect().height).toBe(btn.bottom - p.top);
    expect(changes.list()[0].after).toMatchObject({ direction: "vertical", gap: 24, padding: [0, 0, 0, 0] });
    expect(changes.list()[0].after).toMatchObject({ layers: [{ unmargined: true }, { unmargined: true }] });
    expect(changes.list()[0].style.margin).toBeUndefined();
    expect([style(doc.getElementById("p")!).marginTop, style(doc.getElementById("btn")!).marginTop]).toEqual(["0px", "0px"]);

    // No gap: they touch.
    editor.set(stack, "gap", 0);
    expect(doc.getElementById("btn")!.getBoundingClientRect().top).toBe(doc.getElementById("p")!.getBoundingClientRect().bottom);

    editor.undo();
    editor.undo();
    expect(rects("h", "p", "btn")).toEqual(before);
    expect([style(doc.getElementById("p")!).marginTop, style(doc.getElementById("btn")!).marginTop]).toEqual(["16px", "24px"]);
  });

  test("taken apart, a layer's own margin on one side is back, though the layer has other changes", () => {
    const { doc, editor, layer } = open(`<!DOCTYPE html><body style="margin: 0">
      <section id="hero" ${at("5:5")} style="display: flex; flex-direction: column; width: 400px">
        <p id="p" ${at("7:7")} style="height: 20px; margin-top: 16px">Words</p>
        <p id="q" ${at("8:7")} style="height: 20px; margin-top: 8px">More</p>
      </section></body>`);
    editor.set(layer("p"), "opacity", 0.5);
    editor.stack([layer("p"), layer("q")]);

    editor.undo();

    expect(doc.getElementById("p")!.style.marginTop).toBe("16px");
    expect(style(doc.getElementById("p")!).opacity).toBe("0.5");
  });

  test("in every instance of the usage; not of instances a loop renders", () => {
    const card = (n: number) => `<article ${at("30:9")} style="display: flex; flex-direction: column; gap: 4px">
        <h3 ${at("31:11")} style="margin: 0">Card ${n}</h3><p ${at("32:11")} style="margin: 0">Body</p></article>`;
    const { doc, editor, changes } = open(`<!DOCTYPE html><body style="margin: 0"><main ${at("29:7")}>${[1, 2, 3].map(card).join("")}</main></body>`);
    const tree = editor.tree();
    const [h3, p] = ["h3", "p"].map((tag) => find(tree.root, (l) => l.el === doc.querySelector(tag))!);
    const articles = [...doc.querySelectorAll("article")].map((el) => find(tree.root, (l) => l.el === el)!);

    expect(editor.canStack([articles[0], articles[1]])).toBe(false);
    editor.stack([h3, p]);

    expect([...doc.querySelectorAll("article")].map((el) => [...el.children].map((c) => c.localName))).toEqual([["div"], ["div"], ["div"]]);
    expect(changes.list()[0].target.instances).toBe(3);
  });

  test("what can be made a Stack: layers side by side in one container, not text with no element of its own, not the page", () => {
    const { editor, layer } = open();
    const run = find(editor.tree().root, (l) => l.name === "more")!;

    expect(editor.canStack([layer("a"), layer("c")])).toBe(true);
    expect(editor.canStack([layer("a"), layer("d")])).toBe(false);
    expect(editor.canStack([run])).toBe(false);
    expect(editor.canStack([editor.tree().root])).toBe(false);
    expect(editor.canStack([])).toBe(false);
  });

  test("undone and redone in one step each", () => {
    const { doc, editor, changes, layer } = open();
    const original = styles(doc);

    editor.stack([layer("a"), layer("b")]);
    expect(editor.undo().map((l) => l.el.id)).toEqual(["a", "b"]);
    expect(styles(doc)).toEqual(original);
    expect(changes.list()).toEqual([]);

    const [stack] = editor.redo();
    expect(stack.kind).toBe("stack");
    expect(stack.children.map((l) => l.el.id)).toEqual(["a", "b"]);
    expect(changes.list()).toHaveLength(1);
  });

  test("a change to the new Stack says it is new; taken back from the change list, the Stack takes it along", () => {
    const opened = open();
    const { doc, editor, changes, layer } = opened;
    const stack = editor.stack([layer("a"), layer("b")]);
    editor.set(stack, "gap", 4);
    const id = stack.el.getAttribute("data-vk-layer");
    expect(changes.list()[1]).toMatchObject({ property: "gap", target: { loc: null, made: id, unlocated: false, context: { path: ["Page", "App", "Stack"] } } });
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };

    expect(editor.revert(changes.list()[0].id)?.el.id).toBe("a");
    expect([...doc.getElementById("list")!.children].map((el) => el.id)).toEqual(["a", "b", "c"]);
    expect(changes.list()).toEqual([]);
    editor.undo();
    expect(changes.list().map((c) => c.property)).toEqual(["stack", "gap"]);

    expect(revertSaved(saved, saved.changeSet.changes[0].id)).toBeNull();
  });

  test("taken back from a saved round, its layers go back where they were, as they were", () => {
    const opened = open(board([placed("a", [20, 30, 100, 40]), placed("b", [140, 30, 100, 40])].join("") + placed("c", [0, 200, 10, 10])));
    opened.editor.stack([opened.layer("b"), opened.layer("a")]);
    opened.editor.set(opened.layer("c"), "opacity", 0.5);
    const saved = { canvas: serializeCanvas({ document: opened.doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: opened.changes.save() };

    const reverted = revertSaved(saved, saved.changeSet.changes[0].id)!;

    const doc = new DOMParser().parseFromString(reverted.canvas, "text/html");
    expect([...doc.getElementById("board")!.children].map((el) => el.id)).toEqual(["a", "b", "c"]);
    expect(doc.getElementById("a")!.getAttribute("style")).toBe("position: absolute; left: 20px; top: 30px; width: 100px; height: 40px");
    expect(reverted.changeSet.changes.map((c) => c.property)).toEqual(["opacity"]);
  });
});

describe("dissolving a Stack", () => {
  const open = (page = MOVES) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const rects = (...ids: string[]) => ids.map((id) => canvas.doc.getElementById(id)!.getBoundingClientRect().toJSON() as DOMRect);
    return { ...canvas, layer, rects };
  };

  test("makes it a Frame of the same size, its layers absolute where they were, as large as they were", () => {
    const { doc, editor, changes, layer, rects } = open();
    const before = rects("list", "a", "b", "c", "row");

    const frame = editor.unstack(layer("list"));

    expect(rects("list", "a", "b", "c", "row")).toEqual(before);
    expect(frame.kind).toBe("frame");
    expect(frame.children.map((l) => [l.el.id, l.absolute])).toEqual([["a", true], ["b", true], ["c", true]]);
    expect(style(doc.getElementById("list")!).position).toBe("relative");
    expect(changes.list()[0]).toMatchObject({
      kind: "unstack",
      property: "unstack",
      target: { loc: "src/App.tsx:5:5" },
      before: { direction: "vertical", gap: 10, padding: [0, 0, 0, 0], align: { x: "start", y: "start", distribute: false } },
      after: {
        width: 200,
        height: 80,
        layers: [
          { target: { loc: "src/App.tsx:6:7" }, x: 0, y: 0, width: 200, height: 20 },
          { target: { loc: "src/App.tsx:7:7" }, x: 0, y: 30, width: 200, height: 20 },
          { target: { loc: "src/App.tsx:8:7" }, x: 0, y: 60, width: 200, height: 20 },
        ],
      },
      style: { display: "block", width: "200px", height: "80px", position: "relative" },
    });
    expect(changes.list()[0].sources.map((s) => s.declaration)).toContain("display: flex");
  });

  test("with padding, and layers with margins, nothing moves", () => {
    const { editor, layer, rects } = open(`<!DOCTYPE html><body style="margin: 0">
      <div id="s" ${at("5:5")} style="display: flex; align-items: center; gap: 6px; padding: 12px 8px; border: 2px solid">
        <div id="a" ${at("6:7")} style="width: 40px; height: 40px; margin: 5px"></div>
        <div id="b" ${at("7:7")} style="width: 30px; height: 10px"></div>
      </div></body>`);
    const before = rects("s", "a", "b");

    editor.unstack(layer("s"));

    expect(rects("s", "a", "b")).toEqual(before);
  });

  test("undone and redone, and taken back from a saved round", () => {
    const { doc, editor, changes, layer } = open();
    const original = styles(doc);

    editor.unstack(layer("list"));
    expect(editor.undo().map((l) => l.el.id)).toEqual(["list"]);
    expect(styles(doc)).toEqual(original);
    editor.redo();
    expect(style(doc.getElementById("a")!).position).toBe("absolute");

    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };
    expect(revertSaved(saved, saved.changeSet.changes[0].id)).toBeNull();
  });

  test("a Stack made of layers can be dissolved again", () => {
    const { doc, editor, layer, rects } = open(board([placed("a", [20, 30, 100, 40]), placed("b", [140, 30, 100, 40])].join("")));
    const stack = editor.stack([layer("a"), layer("b")]);
    const before = rects("a", "b");

    editor.unstack(stack);

    expect(rects("a", "b")).toEqual(before);
    expect(style(doc.getElementById("a")!).position).toBe("absolute");
  });

  test("only a Stack, with no text of its own beside its layers, nor instances a loop renders", () => {
    const { editor, layer } = open();
    const item = `data-vk-loc="src/Item.tsx:2:3" ${chain([{ component: "Item", usage: "src/App.tsx:6:9", thirdParty: false }, ...APP])}`;
    const loop = openCanvas(`<!DOCTYPE html><ul id="list" ${at("5:5")} style="display: flex"><li ${item}>One</li><li ${item}>Two</li></ul>`);
    const text = openCanvas(`<!DOCTYPE html><button id="go" ${at("5:5")} style="display: flex">Go <span ${at("5:20")}>→</span></button>`);

    expect(editor.canUnstack(layer("list"))).toBe(true);
    expect(editor.canUnstack(layer("board"))).toBe(false);
    expect(editor.canUnstack(layer("a"))).toBe(false);
    expect(text.editor.canUnstack(text.layerOf(text.doc.getElementById("go")!))).toBe(false);
    expect(loop.editor.canUnstack(loop.layerOf(loop.doc.getElementById("list")!))).toBe(false);
  });
});

describe("new text and Frames", () => {
  const open = (page = MOVES) => {
    const canvas = openCanvas(page.replace('<body style="margin: 0">', '<body style="margin: 0; font: 15px/22px serif; color: rgb(10, 20, 30)">'));
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const order = (id: string) => [...canvas.doc.getElementById(id)!.children].map((el) => el.id || el.localName);
    return { ...canvas, layer, order };
  };

  test("new text in a Stack takes a place among its layers, in the page's body text style", () => {
    const { doc, editor, changes, layer, order } = open();

    const text = editor.create("text", { parent: layer("list"), index: 1 });

    expect(order("list")).toEqual(["a", "p", "b", "c"]);
    expect(text.kind).toBe("text");
    expect(text.name).toBe("Text");
    const el = doc.querySelector("#list > p")!;
    expect([style(el).fontSize, style(el).lineHeight, style(el).fontFamily, style(el).color, style(el).marginTop]).toEqual(["15px", "22px", "serif", "rgb(10, 20, 30)", "0px"]);
    expect(changes.list()[0]).toMatchObject({
      kind: "create",
      property: "new",
      layer: el.getAttribute("data-vk-layer"),
      target: { loc: "src/App.tsx:5:5" },
      before: null,
      after: { type: "text", text: "Text", width: null, height: null, place: { container: { target: { loc: "src/App.tsx:5:5" } }, nth: 2, absolute: null } },
      style: { "font-size": "15px", "line-height": "22px", margin: "0px" },
    });

    editor.undo();
    expect(order("list")).toEqual(["a", "b", "c"]);
    expect(changes.list()).toEqual([]);
  });

  test("a new Frame in a Frame is absolute where it is drawn, at its size, with no fill; the Frame is its positioning reference", () => {
    const { doc, editor, changes, layer } = open();

    const frame = editor.create("frame", { parent: layer("board"), x: 30, y: 20 }, { width: 120, height: 80 });

    const board = doc.getElementById("board")!;
    expect(frame.el.parentElement).toBe(board);
    expect(frame.absolute).toBe(true);
    const r = frame.el.getBoundingClientRect();
    expect([r.left - board.getBoundingClientRect().left, r.top - board.getBoundingClientRect().top, r.width, r.height]).toEqual([30, 20, 120, 80]);
    expect(style(frame.el).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style(board).position).toBe("relative");
    expect(changes.list()[0].after).toMatchObject({ type: "frame", width: 120, height: 80, place: { absolute: { x: 30, y: 20 } } });

    editor.undo();
    expect(board.children).toHaveLength(0);
    expect(style(board).position).toBe("static");
  });

  test("a new layer goes in every instance of its container's usage", () => {
    const card = (n: number) => `<article ${at("30:9")} style="display: flex; flex-direction: column"><h3 ${at("31:11")}>Card ${n}</h3></article>`;
    const { doc, editor, changes } = open(`<!DOCTYPE html><body style="margin: 0"><main ${at("29:7")}>${[1, 2, 3].map(card).join("")}</main></body>`);
    const article = find(editor.tree().root, (l) => l.el === doc.querySelector("article"))!;

    editor.create("text", { parent: article, index: 1 });

    expect([...doc.querySelectorAll("article")].map((el) => el.lastElementChild!.textContent)).toEqual(["Text", "Text", "Text"]);
    expect(changes.list()[0].target.instances).toBe(3);
  });

  test("a new Frame made a Stack and dissolved: it and its text stay where they are, shown", () => {
    const { doc, editor, changes, layer } = open();
    const frame = editor.create("frame", { parent: layer("list"), index: 3 }, { width: 200, height: 120 });
    const text = editor.create("text", { parent: editor.tree().layerOf(frame.el)!, x: 60, y: 40 });
    const stack = editor.stack([editor.tree().layerOf(frame.el)!]);
    editor.set(stack, "padding", [12, 12, 12, 12]);
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map(Math.round);
    };
    const before = [box(frame.el), box(text.el)];

    editor.unstack(editor.tree().layerOf(frame.el)!);

    expect(frame.el.isConnected && text.el.isConnected).toBe(true);
    expect([box(frame.el), box(text.el)]).toEqual(before);
    expect(getComputedStyle(frame.el).display).not.toBe("none");
    expect(doc.contains(text.el)).toBe(true);
  });

  test("a new Frame made a Stack, ungrouped: its text takes its place, the Frame goes", () => {
    const { doc, editor, changes, layer } = open();
    const frame = editor.create("frame", { parent: layer("list"), index: 3 }, { width: 200, height: 120 });
    const text = editor.create("text", { parent: editor.tree().layerOf(frame.el)!, x: 60, y: 40 });
    editor.stack([editor.tree().layerOf(frame.el)!]);

    let error: unknown = null;
    try {
      editor.ungroup(editor.tree().layerOf(frame.el)!);
    } catch (e) {
      error = e;
    }

    expect(error).toBeNull();
    expect(text.el.isConnected).toBe(true);
    expect(text.el.parentElement).toBe(doc.getElementById("list"));
    expect(editor.tree().layerOf(frame.el)).toBeNull();
    // The text is made where it is now: no move, and nothing of the Frame.
    const list = doc.getElementById("list")!.getAttribute("data-vk-layer");
    expect(changes.list().map((c) => c.kind)).toEqual(["create"]);
    expect(changes.list()[0].after).toMatchObject({ type: "text", place: { container: { layer: list }, absolute: null } });
    expect(changes.list()[0].style.position).toBeUndefined();

    editor.undo();
    expect(text.el.parentElement).toBe(frame.el);
    expect(changes.list().map((c) => c.kind)).toEqual(["create", "create", "stack"]);
    expect(changes.list().find((c) => c.layer === text.el.getAttribute("data-vk-layer"))!.after).toMatchObject({ place: { container: { layer: frame.el.getAttribute("data-vk-layer") } } });

    editor.redo();
    expect(text.el.parentElement).toBe(doc.getElementById("list"));
    expect(changes.list().map((c) => c.kind)).toEqual(["create"]);
  });

  test("text made in a new Frame and dragged out of it stays when the Frame is deleted", () => {
    const { doc, editor, changes, layer } = open();
    const frame = editor.create("frame", { parent: layer("list"), index: 3 }, { width: 200, height: 120 });
    const text = editor.create("text", { parent: editor.tree().layerOf(frame.el)!, x: 60, y: 40 });
    editor.move(editor.tree().layerOf(text.el)!, { parent: layer("list"), index: 0 });

    editor.remove(editor.tree().layerOf(frame.el)!);

    expect(frame.el.isConnected).toBe(false);
    expect(text.el.parentElement).toBe(doc.getElementById("list"));
    expect(changes.list().map((c) => c.kind)).toEqual(["create"]);
    expect(changes.list()[0].after).toMatchObject({ place: { nth: 1, absolute: null } });
  });

  test("a new Frame takes a brief, shown in its place on the canvas, and what is drawn in it is its sketch; taken back, all of it goes", () => {
    const opened = open();
    const { doc, editor, changes, layer } = opened;
    const frame = editor.create("frame", { parent: layer("list"), index: 3 }, { width: 200, height: 120 });

    editor.setBrief(frame, "A pricing table with three plans");
    const text = editor.create("text", { parent: editor.tree().layerOf(frame.el)!, x: 10, y: 12 });

    expect(editor.brief(editor.tree().layerOf(frame.el)!)).toBe("A pricing table with three plans");
    expect(frame.el.getAttribute("data-vk-brief")).toBe("A pricing table with three plans");
    expect(changes.list()[0].after).toMatchObject({ type: "frame", brief: "A pricing table with three plans" });
    expect(changes.list()[1]).toMatchObject({ kind: "create", target: { loc: null, made: frame.el.getAttribute("data-vk-layer") }, after: { type: "text", place: { absolute: { x: 10, y: 12 } } } });
    expect(text.el.parentElement).toBe(frame.el);
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };

    editor.revert(changes.list()[0].id);
    expect(doc.querySelectorAll("[data-vk-made]")).toHaveLength(0);
    expect(changes.list()).toEqual([]);
    editor.undo();
    expect(changes.list()).toHaveLength(2);

    expect(revertSaved(saved, saved.changeSet.changes[0].id)).toBeNull();
    // Only the brief, in an editor without it, for a layer the designer did not make.
    expect(editor.brief(layer("a"))).toBeNull();
  });

  test("where a new layer can go: a Stack or a Frame that holds layers, not text or a field", () => {
    const { editor, layer } = open(MOVES.replace("</body>", `<input id="field" ${at("40:5")}></body>`));

    expect(editor.canHold(layer("list"))).toBe(true);
    expect(editor.canHold(layer("board"))).toBe(true);
    expect(editor.canHold(layer("a"))).toBe(false);
    expect(editor.canHold(layer("field"))).toBe(false);
  });
});

describe("editing text", () => {
  const open = (page = MOVES) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    return { ...canvas, layer };
  };

  test("changes the words of the text in every instance, and records them; set back, it is no longer a change", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas(PAGE.replace(/>Card \d</g, ">Card<"));
    const title = layerOf(cards[0].querySelector("h3")!);

    editor.setText(title, "Plan");

    expect(cards.slice(0, 3).map((card) => card.querySelector("h3")!.textContent)).toEqual(["Plan", "Plan", "Plan"]);
    expect(cards[3].querySelector("h3")!.textContent).toBe("Your turn");
    expect(changes.list()[0]).toMatchObject({ kind: "text", property: "text", target: { loc: "src/Card.tsx:4:7", instances: 3 }, before: "Card", after: "Plan" });
    expect(changes.list()[0].data).toBeUndefined();

    editor.setText(editor.tree().layerOf(cards[1].querySelector("h3")!)!, "Card");
    expect(changes.list()).toEqual([]);
    expect(doc.querySelectorAll("h3")[0].textContent).toBe("Card");
  });

  test("text that differs across the instances a loop renders comes from data: only this one changes, as a data change", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.setText(layerOf(cards[1].querySelector("h3")!), "Second");

    expect(cards.slice(0, 3).map((card) => card.querySelector("h3")!.textContent)).toEqual(["Card 1", "Second", "Card 3"]);
    expect(changes.list()[0]).toMatchObject({ kind: "text", data: true, before: "Card 2", after: "Second" });
    editor.undo();
    expect(cards[1].querySelector("h3")!.textContent).toBe("Card 2");
  });

  test("text with no element of its own gets one, and is found in its container's source", () => {
    const { doc, editor, changes } = open();
    const run = find(editor.tree().root, (l) => l.name === "more")!;

    const own = editor.ownElement(run);
    editor.setText(own, "less");

    expect(doc.getElementById("mixed")!.textContent).toBe("Loose text pill less");
    expect(changes.list()[0]).toMatchObject({ kind: "text", target: { loc: "src/App.tsx:15:5", unlocated: false, context: { element: '<p id="mixed">' } }, before: "more", after: "less" });
  });

  test("of a new text layer, it is the words of the change that makes it", () => {
    const { editor, changes, layer } = open();
    const text = editor.create("text", { parent: layer("list"), index: 0 });

    editor.setText(text, "Hello");

    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0].after).toMatchObject({ type: "text", text: "Hello" });
    expect(text.el.textContent).toBe("Hello");
    editor.undo();
    expect(text.el.textContent).toBe("Text");
  });

  test("keeps the text's inline pieces as they were once taken back, on the canvas and a saved round", () => {
    const { doc, editor, changes, layer } = open(`<!DOCTYPE html><p id="t" ${at("3:3")}>Some <b>bold</b> words</p><p id="u" ${at("4:3")}>Other</p>`);
    editor.setText(layer("t"), "Plain");
    editor.setText(layer("u"), "Changed");
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };

    editor.revert(changes.list()[0].id);
    expect(doc.getElementById("t")!.innerHTML).toBe("Some <b>bold</b> words");

    const reverted = new DOMParser().parseFromString(revertSaved(saved, saved.changeSet.changes[0].id)!.canvas, "text/html");
    expect(reverted.getElementById("t")!.innerHTML).toBe("Some <b>bold</b> words");
    expect(reverted.getElementById("u")!.textContent).toBe("Changed");
  });
});

describe("ungrouping", () => {
  const open = (page: string) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const rects = (...ids: string[]) => ids.map((id) => canvas.doc.getElementById(id)!.getBoundingClientRect().toJSON() as DOMRect);
    return { ...canvas, layer, rects };
  };
  const NESTED = `<!DOCTYPE html><body style="margin: 0">
    <div id="outer" ${at("5:5")} style="display: flex; flex-direction: column; gap: 8px; width: 300px">
      <div id="top" ${at("6:7")} style="height: 20px">Top</div>
      <div id="inner" ${at("7:7")} style="display: flex; flex-direction: column; gap: 8px">
        <div id="x" ${at("8:9")} style="height: 20px">X</div>
        <div id="y" ${at("9:9")} style="height: 20px">Y</div>
      </div>
      <div id="end" ${at("11:7")} style="height: 20px">End</div>
    </div></body>`;

  test("a Stack in a Stack: its layers join the outer one in its place, in order, nothing moving; the Stack goes; undone, all is back", () => {
    const { doc, editor, changes, layer, rects } = open(NESTED);
    const before = rects("top", "x", "y", "end");
    expect(editor.canUngroup(layer("inner"))).toBe(true);

    const out = editor.ungroup(layer("inner"));

    expect(out.map((l) => l.el.id)).toEqual(["x", "y"]);
    expect(editor.tree().root.children[0].children.map((l) => l.el.id)).toEqual(["top", "x", "y", "end"]);
    expect(rects("top", "x", "y", "end")).toEqual(before);
    expect(style(doc.getElementById("inner")!).display).toBe("none");
    expect(changes.list().map((c) => [c.kind, c.target.loc])).toEqual([
      ["move", "src/App.tsx:8:9"],
      ["move", "src/App.tsx:9:9"],
      ["delete", "src/App.tsx:7:7"],
    ]);

    editor.undo();
    expect(changes.list()).toEqual([]);
    expect(editor.tree().root.children[0].children.map((l) => l.el.id)).toEqual(["top", "inner", "end"]);
  });

  test("a Frame in a Frame: its layers are placed absolute in the outer one, where they were", () => {
    const { editor, layer, rects } = open(
      board(`<div id="card" ${at("22:7")} style="position: absolute; left: 20px; top: 30px; width: 200px; height: 100px">
        <div id="p" ${at("23:9")} style="position: absolute; left: 10px; top: 5px; width: 50px; height: 20px; margin: 4px"></div>
      </div>`),
    );
    const before = rects("p");

    editor.ungroup(layer("card"));

    expect(layer("p").parent!.el.id).toBe("board");
    expect(layer("p").absolute).toBe(true);
    expect(rects("p")).toEqual(before);
  });

  test("a Stack made this round: ungrouped, it is taken back", () => {
    const { editor, changes, layer } = open(NESTED);
    const stack = editor.stack([layer("top"), layer("end")]);

    editor.ungroup(stack);

    expect(changes.list()).toEqual([]);
    expect(editor.tree().root.children[0].children.map((l) => l.el.id)).toEqual(["top", "inner", "end"]);
  });

  test("one of its moves taken back from the change list brings the layer back too, that layer in it again", () => {
    const { doc, editor, changes, layer } = open(NESTED);
    editor.ungroup(layer("inner"));
    const [first] = changes.list();

    editor.revert(first.id);

    expect(style(doc.getElementById("inner")!).display).toBe("flex");
    expect(doc.getElementById("x")!.parentElement!.id).toBe("inner");
    expect(doc.getElementById("y")!.parentElement!.id).toBe("outer");
    expect(changes.list().map((c) => c.kind)).toEqual(["move"]);
  });

  test("a Frame in a Stack: its absolute layers stay where they are, absolute in the Stack", () => {
    const { editor, layer, rects } = open(NESTED.replace(
      `<div id="end" ${at("11:7")} style="height: 20px">End</div>`,
      `<div id="end" ${at("11:7")} style="height: 20px">End</div>
      <div id="card" ${at("12:7")} style="position: relative; height: 80px"><div id="pin" ${at("13:9")} style="position: absolute; left: 30px; top: 10px; width: 20px; height: 20px"></div></div>`,
    ));
    const before = rects("pin");

    editor.ungroup(layer("card"));

    expect(layer("pin").parent!.el.id).toBe("outer");
    expect(layer("pin").absolute).toBe(true);
    expect(rects("pin")).toEqual(before);
  });

  test("not the page, text, or a layer with no layers in it", () => {
    const { editor, layer } = open(NESTED);
    expect(editor.canUngroup(editor.tree().root)).toBe(false);
    expect(editor.canUngroup(layer("x"))).toBe(false);
  });
});

describe("copy, cut and paste", () => {
  const open = (page = MOVES) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const order = (id: string) => [...canvas.doc.getElementById(id)!.children].filter((el) => style(el).display !== "none").map((el) => el.textContent);
    return { ...canvas, layer, order, clipboard: createClipboard(canvas.editor, canvas.changes) };
  };

  test("copied and pasted into a Stack selected: a copy at its end, as ⌘D makes one", () => {
    const { editor, changes, layer, order, clipboard } = open();

    expect(clipboard.copy([layer("a")])).toBe(true);
    const pasted = clipboard.paste([layer("row")]);

    expect(order("row")).toEqual(["D", "A"]);
    expect(pasted.map((l) => l.el.textContent)).toEqual(["A"]);
    expect(changes.list().map((c) => c.kind)).toEqual(["duplicate"]);
    editor.undo();
    expect(order("row")).toEqual(["D"]);
  });

  test("pasted with a layer selected that holds none: right after it", () => {
    const { layer, order, clipboard } = open();

    clipboard.copy([layer("d")]);
    clipboard.paste([layer("b")]);

    expect(order("list")).toEqual(["A", "B", "D", "C"]);
  });

  test("cut: gone at once, as a deletion; pasted elsewhere, a move instead, which pastes again as copies", () => {
    const { doc, changes, layer, order, clipboard } = open();

    expect(clipboard.cut([layer("b")])).toBe(true);
    expect(style(doc.getElementById("b")!).display).toBe("none");
    expect(changes.list().map((c) => c.kind)).toEqual(["delete"]);

    clipboard.paste([layer("row")]);
    expect(order("row")).toEqual(["D", "B"]);
    expect(order("list")).toEqual(["A", "C"]);
    expect(changes.list().map((c) => [c.kind, c.layer === doc.getElementById("b")!.getAttribute("data-vk-layer")])).toEqual([["move", true]]);

    clipboard.paste([layer("list")]);
    expect(order("list")).toEqual(["A", "C", "B"]);
    expect(changes.list().map((c) => c.kind)).toEqual(["move", "duplicate"]);
  });

  test("cut and pasted after a layer of the same Stack: right after it", () => {
    const { layer, order, clipboard } = open();

    clipboard.cut([layer("a")]);
    clipboard.paste([layer("b")]);

    expect(order("list")).toEqual(["B", "A", "C"]);
  });

  test("a cut undone is still held: pasted, it is moved", () => {
    const { editor, changes, layer, order, clipboard } = open();

    clipboard.cut([layer("b")]);
    editor.undo();
    clipboard.paste([layer("row")]);

    expect(order("row")).toEqual(["D", "B"]);
    expect(changes.list().map((c) => c.kind)).toEqual(["move"]);
  });

  test("into a Frame selected: placed where it was in its own", () => {
    const { layer, clipboard, doc } = open(
      board(placed("a", [20, 30, 100, 40])).replace("</body>", `<div id="frame2" ${at("40:5")} style="position: relative; width: 300px; height: 200px"></div></body>`),
    );

    clipboard.copy([layer("a")]);
    const [copy] = clipboard.paste([layer("frame2")]);

    expect(copy.el.parentElement).toBe(doc.getElementById("frame2"));
    expect([style(copy.el).left, style(copy.el).top]).toEqual(["20px", "30px"]);
  });
});

describe("deleting layers", () => {
  const open = (page = MOVES) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const names = () => canvas.editor.tree().root.children[0].children.map((l) => l.name);
    return { ...canvas, layer, names };
  };

  test("takes the layer off the canvas and the layer tree, in every instance; undo puts it back", () => {
    const { doc, editor, changes, layer, names } = open();

    editor.remove(layer("b"));

    expect(style(doc.getElementById("b")!).display).toBe("none");
    expect(names()).toEqual(["A", "C"]);
    expect(changes.list()[0]).toMatchObject({ kind: "delete", property: "delete", target: { loc: "src/App.tsx:7:7" }, before: { nth: 2 }, after: null, style: { display: "none" } });

    editor.undo();
    expect(style(doc.getElementById("b")!).display).toBe("block");
    expect(names()).toEqual(["A", "B", "C"]);
  });

  test("one of the instances a loop renders goes alone, as a data change; taken back from a saved round, it is back", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();

    editor.remove(layerOf(cards[1]));
    editor.remove(editor.tree().layerOf(cards[0])!);

    expect(cards.map((card) => style(card).display)).toEqual(["none", "none", "block", "block"]);
    expect(changes.list().map((c) => [c.property, c.data, c.target.instances])).toEqual([
      ["delete-1", true, 3],
      // The page still renders three.
      ["delete-2", true, 3],
    ]);
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };
    const reverted = showSaved(revertSaved(saved, saved.changeSet.changes[0].id)!.canvas);
    expect([...reverted.querySelectorAll("article")].map((card) => style(card).display)).toEqual(["none", "block", "block", "block"]);

    editor.revert(changes.list()[1].id);
    expect(cards.map((card) => style(card).display)).toEqual(["block", "none", "block", "block"]);
  });

  test("a layer made this round is taken back instead: there is nothing in the source to delete", () => {
    const { doc, editor, changes, layer } = open();
    const text = editor.create("text", { parent: layer("list"), index: 0 });

    editor.remove(text);

    expect(doc.querySelectorAll("#list > p")).toHaveLength(0);
    expect(changes.list()).toEqual([]);
    editor.undo();
    expect(doc.querySelectorAll("#list > p")).toHaveLength(1);
  });

  test("a Stack made this round goes with its layers", () => {
    const { doc, editor, changes, layer } = open();
    const stack = editor.stack([layer("a"), layer("b")]);

    editor.remove(stack);

    expect(changes.list().map((c) => [c.kind, c.target.loc])).toEqual([
      ["delete", "src/App.tsx:6:7"],
      ["delete", "src/App.tsx:7:7"],
    ]);
    expect([...doc.getElementById("list")!.children].map((el) => [el.id, style(el).display])).toEqual([["a", "none"], ["b", "none"], ["c", "block"]]);
  });

  test("not the page", () => {
    const { editor } = open();
    expect(editor.canRemove(editor.tree().root)).toBe(false);
  });
});

describe("duplicating layers", () => {
  const open = (page = MOVES) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    return { ...canvas, layer };
  };

  test("puts a copy right after the layer, in every instance; the copy is a layer of its own, new this round", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();
    const title = layerOf(cards[3].querySelector("h3")!);
    editor.set(title, "opacity", 0.5);

    const copy = editor.duplicate(title);

    expect([...cards[3].children].map((el) => el.textContent)).toEqual(["Your turn", "Your turn"]);
    expect(style(cards[3].children[1]).opacity).toBe("0.5");
    expect(copy.el).toBe(cards[3].children[1]);
    expect(changes.list()[1]).toMatchObject({
      kind: "duplicate",
      property: "copy",
      layer: copy.el.getAttribute("data-vk-layer"),
      target: { loc: "src/Card.tsx:4:7" },
      before: { nth: 1 },
      after: { nth: 2, absolute: null },
    });
    expect(changes.list()[1].target.made).toBeUndefined();
    // Its own layer: changed apart from the original.
    editor.set(copy, "opacity", 1);
    expect(style(cards[3].children[0]).opacity).toBe("0.5");
    expect(changes.list()[2].target).toMatchObject({ loc: "src/Card.tsx:4:7", made: copy.el.getAttribute("data-vk-layer") });

    editor.undo();
    editor.undo();
    expect(cards[3].children).toHaveLength(1);
  });

  test("an instance a loop renders is copied alone, as a data change", () => {
    const { editor, changes, cards, layerOf, doc } = openCanvas();

    editor.duplicate(layerOf(cards[1]));

    expect([...doc.querySelectorAll("article")].map((el) => el.querySelector("h3")!.textContent)).toEqual(["Card 1", "Card 2", "Card 2", "Card 3", "Your turn"]);
    expect(changes.list()[0]).toMatchObject({ kind: "duplicate", data: true, target: { instances: 3 } });
  });

  test("to where it is dragged: in a Stack, or absolute in a Frame; taken back from a saved round, the copy goes", () => {
    const { doc, editor, changes, layer } = open();

    editor.duplicate(layer("a"), { parent: layer("list"), index: 1 });
    editor.duplicate(layer("b"), { parent: layer("board"), x: 12, y: 8 });

    expect([...doc.getElementById("list")!.children].map((el) => el.textContent)).toEqual(["A", "B", "A", "C"]);
    const copy = doc.getElementById("board")!.firstElementChild!;
    expect([style(copy).position, style(copy).left, style(copy).top, style(copy).width]).toEqual(["absolute", "12px", "8px", "200px"]);
    expect(changes.list()[1].after).toMatchObject({ absolute: { x: 12, y: 8 } });

    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };
    const reverted = new DOMParser().parseFromString(revertSaved(saved, saved.changeSet.changes[1].id)!.canvas, "text/html");
    expect(reverted.getElementById("board")!.children).toHaveLength(0);
    expect(reverted.getElementById("board")!.style.position).toBe("");
  });

  test("not text with no element of its own, nor the page", () => {
    const { editor } = open();
    expect(editor.canDuplicate(find(editor.tree().root, (l) => l.name === "more")!)).toBe(false);
    expect(editor.canDuplicate(editor.tree().root)).toBe(false);
  });
});

/**
 * A page with source markers only (no React, so no usage chains on the live
 * page either): a Stack, a plain flow, and a Frame with layers in its flow.
 */
const loc = (at: string) => `data-vk-loc="src/App.tsx:${at}"`;
const STRUCTURE = `<!DOCTYPE html>
<body style="margin: 0">
  <div id="list" ${loc("5:5")} style="display: flex; flex-direction: column; gap: 10px; width: 200px">
    <div id="a" ${loc("6:7")} style="height: 20px">A</div>
    <div id="b" ${loc("7:7")} style="height: 20px">B</div>
    <div id="c" ${loc("8:7")} style="height: 20px">C</div>
  </div>
  <section id="flow" ${loc("10:5")}><p id="one" ${loc("11:7")} style="margin: 0">One</p><p id="two" ${loc("12:7")} style="margin: 4px 0 0">Two</p></section>
  <div id="board" ${loc("13:5")} style="width: 300px; height: 100px"><span id="tag" ${loc("14:7")} style="display: inline-block; width: 50px; height: 20px">Tag</span></div>
</body>`;

describe("changes to the structure are checked on the live page", () => {
  /** The canvas, edited; and the live page, as the page is. */
  const open = () => {
    const canvas = openCanvas(STRUCTURE);
    live = document.createElement("iframe");
    live.style.width = "800px";
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(STRUCTURE);
    page.close();
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    return { ...canvas, page, layer };
  };

  test("a reorder is checked by what the layers look like: moving the JSX moves their markers along", async () => {
    const { page, editor, changes, layer } = open();
    editor.move(layer("c"), { parent: layer("list"), index: 0 });
    editor.move(layer("a"), { parent: layer("list"), index: 2 });
    const [first, second] = changes.list();
    const list = page.getElementById("list")!;
    const lines = () => [...list.children].map((el, i) => el.setAttribute("data-vk-loc", `src/App.tsx:${6 + i}:7`));
    const check = async (change: (typeof changes.list extends () => (infer C)[] ? C : never)) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        const result = checkChange(page, change);
        vi.advanceTimersByTime(CHECK_SETTLE_MS);
        return await result;
      } finally {
        vi.useRealTimers();
      }
    };

    // Not applied, but a line added above moves every marker down: still not shown.
    for (const el of list.children) el.setAttribute("data-vk-loc", el.getAttribute("data-vk-loc")!.replace(/:(\d+):/, (_, n) => `:${Number(n) + 1}:`));
    expect((await check(first)).outcome).toBe("not shown");
    // The first reorder applied alone, its JSX moved with its markers: shown, though the second is not applied yet.
    list.prepend(page.getElementById("c")!);
    lines();
    expect(await check(first)).toEqual({ outcome: "shown" });
    expect((await check(second)).outcome).toBe("not shown");
    list.append(page.getElementById("a")!);
    lines();
    expect(await check(second)).toEqual({ outcome: "shown" });
  });

  test("a layer placed absolute is checked from its container, its positioning reference", async () => {
    const { page, editor, changes, layer } = open();
    editor.move(layer("tag"), { parent: layer("board"), x: 40, y: 30 });
    Object.assign((page.getElementById("tag") as HTMLElement).style, { position: "absolute", left: "40px", top: "30px" });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const result = checkChange(page, changes.list()[0]);
      vi.advanceTimersByTime(CHECK_SETTLE_MS);
      expect(await result).toEqual({ outcome: "not shown", actual: "no reference" });
    } finally {
      vi.useRealTimers();
    }
    page.getElementById("board")!.style.position = "relative";
    expect(await checkChange(page, changes.list()[0])).toEqual({ outcome: "shown" });
  });

  test("a deletion is checked while its container is on the page; a sibling come to its place in the source is not it", async () => {
    const { page, editor, changes, layer } = open();
    editor.remove(layer("one"));
    const [deleted] = changes.list();

    // The Agent deletes it: the next paragraph moves up to its line.
    page.getElementById("one")!.remove();
    page.getElementById("two")!.setAttribute("data-vk-loc", "src/App.tsx:11:7");
    expect(await checkChange(page, deleted)).toEqual({ outcome: "shown" });

    page.getElementById("flow")!.remove();
    expect(await checkChange(page, deleted)).toEqual({ outcome: "unchecked", reason: "its container is not on the page now" });
  });

  test("checked: shown once the page's own markup has the change; a deletion not yet made is not", async () => {
    const { page, editor, changes, layer } = open();
    editor.move(layer("c"), { parent: layer("list"), index: 0 });
    editor.move(layer("tag"), { parent: layer("board"), x: 40, y: 30 });
    editor.remove(layer("b"));
    const [reorder, placed, deleted] = changes.list();

    // The Agent's code, as the dev server brings it in.
    page.getElementById("list")!.prepend(page.getElementById("c")!);
    Object.assign((page.getElementById("tag") as HTMLElement).style, { position: "absolute", left: "40px", top: "30px" });
    page.getElementById("board")!.style.position = "relative";
    expect(await checkChange(page, reorder)).toEqual({ outcome: "shown" });
    expect(await checkChange(page, placed)).toEqual({ outcome: "shown" });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const result = checkChange(page, deleted);
      vi.advanceTimersByTime(CHECK_SETTLE_MS);
      expect(await result).toEqual({ outcome: "not shown", actual: "there" });
    } finally {
      vi.useRealTimers();
    }
    page.getElementById("b")!.remove();
    expect(await checkChange(page, deleted)).toEqual({ outcome: "shown" });
  });
});

describe("views", () => {
  /** The canvas shown in a second view too, as narrow as a phone, where `#b` is set in by a media query. */
  const open = async () => {
    const canvas = openCanvas(MOVES.replace("<body", "<style>@media (max-width: 500px) { #b { margin-left: 50px } }</style>\n<body"));
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await canvas.views.add(phoneFrame, 390);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    /** Both views show the same canvas. */
    const alike = () => expect(phone.document.documentElement.outerHTML).toBe(canvas.doc.documentElement.outerHTML);
    return { ...canvas, phone, layer, alike };
  };

  test("an edit command changes every view of the canvas alike; undone and redone, every view follows", async () => {
    const { editor, changes, phone, layer, alike } = await open();
    const red = { type: "solid", color: "#FF0000", opacity: 1 } as const;
    let stack: Element | null = null;
    let frame: Element | null = null;
    const edits = [
      () => editor.set(layer("board"), "fill", red),
      () =>
        editor.batch(() => {
          editor.set(layer("list"), "gap", 20);
          editor.set(layer("board"), "radius", 8);
        }),
      () => editor.ownElement(layer("mixed").children[0]),
      () => editor.revert(changes.list().find((change) => change.property === "radius")!.id),
      () => editor.move(layer("c"), { parent: layer("list"), index: 0 }),
      () => editor.setText(layer("a"), "Alpha"),
      () => (stack = editor.stack([layer("a"), layer("b")]).el),
      () => (frame = editor.create("frame", { parent: layer("board"), x: 10, y: 20 }).el),
      () => editor.setBrief(editor.tree().layerOf(frame!)!, "A chart of the week"),
      () => editor.duplicate(layer("d")),
      () => editor.remove(layer("d")),
      () => editor.unstack(editor.tree().layerOf(stack!)!),
      () => editor.move(layer("mixed").children[0], { parent: layer("board"), x: 5, y: 5 }),
    ];
    for (const edit of edits) {
      edit();
      alike();
    }
    expect(style(phone.document.getElementById("board")!).backgroundColor).toBe("rgb(255, 0, 0)");
    expect(phone.document.getElementById("a")!.textContent).toBe("Alpha");
    expect(phone.document.querySelectorAll("#board > *")).toHaveLength(2);

    while (editor.undo().length) alike();
    expect(style(phone.document.getElementById("board")!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect([...phone.document.getElementById("list")!.children].map((el) => el.id)).toEqual(["a", "b", "c"]);
    while (editor.redo().length) alike();
    expect(phone.document.querySelectorAll("#board > *")).toHaveLength(2);
  });

  test("what changes on the canvas outside the edit commands, as words typed into text, shows in every view before the next paint", async () => {
    const { doc, phone, alike } = await open();

    doc.getElementById("a")!.textContent = "Typed";
    doc.getElementById("b")!.setAttribute("contenteditable", "plaintext-only");
    await new Promise(requestAnimationFrame);

    alike();
    expect(phone.document.getElementById("a")!.textContent).toBe("Typed");
  });

  test("words typed into text in another view are written to the canvas and show in every view at once; the view typed in keeps its own nodes", async () => {
    const { doc, views, phone, alike } = await open();
    const tabletFrame = document.createElement("iframe");
    document.body.append(tabletFrame);
    try {
      const tablet = await views.add(tabletFrame, 600);
      const typing = phone.typeIn(doc.getElementById("a")!);
      const el = typing.el;
      expect(el).toBe(phone.document.getElementById("a"));
      const words = el.firstChild as Text;

      // As the browser types: into the text there, then a line break and more words after it.
      el.setAttribute("contenteditable", "plaintext-only");
      words.appendData("lpha");
      el.append(phone.document.createElement("br"), phone.document.createTextNode("Beta"));
      // In every view as soon as the view typed in has taken it, before anything renders on it.
      await Promise.resolve();

      for (const view of [doc, tablet.document]) expect(view.getElementById("a")!.innerHTML).toBe("Alpha<br>Beta");
      // The view typed in is left as it is: the caret stays in the words it is in.
      expect(el.firstChild).toBe(words);
      expect(el.getAttribute("contenteditable")).toBe("plaintext-only");
      expect(doc.getElementById("a")!.hasAttribute("contenteditable")).toBe(false);

      words.data = "Al";
      await new Promise(requestAnimationFrame);
      expect(doc.getElementById("a")!.innerHTML).toBe("Al<br>Beta");

      // Done typing, the view follows the canvas again.
      el.removeAttribute("contenteditable");
      typing.done();
      doc.getElementById("a")!.textContent = "Typed";
      await new Promise(requestAnimationFrame);
      alike();
      expect(tablet.document.documentElement.outerHTML).toBe(doc.documentElement.outerHTML);
    } finally {
      tabletFrame.remove();
    }
  });

  test("a view taken away stops following the canvas; the desktop view cannot be taken away", async () => {
    const { views, editor, phone, layer } = await open();
    const [desktop] = views.list();

    views.remove(phone);
    editor.setText(layer("a"), "Alpha");
    await new Promise(requestAnimationFrame);

    expect(views.list()).toEqual([desktop]);
    expect(phone.document.getElementById("a")!.textContent).not.toBe("Alpha");
    expect(() => views.remove(desktop)).toThrow();
  });

  test("a layer is one across the views: each finds it under a point of its own, and shows where it is laid out there", async () => {
    const { views, editor, phone, layer } = await open();
    const [desktop] = views.list();
    const b = layer("b");

    expect(desktop.document).toBe(views.canvas.document);
    expect(desktop.boxOf(b)).toEqual(boxOf(b));
    const box = phone.boxOf(b)!;
    expect(box.x).toBe(50);
    expect(box).toEqual(phone.document.getElementById("b")!.getBoundingClientRect());
    expect(phone.layerAt(editor.tree(), box.x + 1, box.y + 1)).toBe(b);
    expect(desktop.layerAt(editor.tree(), 1, box.y + 1)).toBe(b);

    // Loose text, which has no element of its own, is found by its words in each view.
    const loose = layer("mixed").children[0];
    const words = phone.boxOf(loose)!;
    expect(loose.text).not.toBeNull();
    expect(phone.layerAt(editor.tree(), words.x + 2, words.y + 2)).toBe(loose);

    // Built anew by an edit, the layers are still found in every view.
    editor.move(layer("c"), { parent: layer("list"), index: 0 });
    const c = layer("c");
    expect(phone.boxOf(c)!.y).toBe(0);
    expect(phone.layerAt(editor.tree(), 1, 1)).toBe(c);
  });
});

describe("breakpoints", () => {
  const RED = { type: "solid", color: "#FF0000", opacity: 1 } as const;
  const BLUE = { type: "solid", color: "#0000FF", opacity: 1 } as const;
  /** The canvas, 800 px wide, shown in a phone view too: its breakpoint is every width below 800 px, unless the project has breakpoints of its own. */
  const open = async (page = MOVES, project: ProjectBreakpoints | null = null) => {
    const canvas = openCanvas(page, project);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await canvas.views.add(phoneFrame, 390);
    const [desktop] = canvas.views.list();
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    /** How the element with id `id` is styled in each view: desktop, then phone. */
    const shown = (id: string) => [canvas.doc, phone.document].map((doc) => style(doc.getElementById(id)!));
    const fills = (id: string) => shown(id).map((s) => s.backgroundColor);
    /** Shows the canvas in one more view, `width` px wide. */
    const addView = async (width: number) => {
      const frame = document.createElement("iframe");
      document.body.append(frame);
      extraFrames.push(frame);
      return canvas.views.add(frame, width);
    };
    return { ...canvas, desktop, phone, layer, shown, fills, addView };
  };
  let extraFrames: HTMLIFrameElement[] = [];
  afterEach(() => {
    for (const frame of extraFrames) frame.remove();
    extraFrames = [];
  });

  /** A Tailwind theme of the project's own, as the local service reads it. */
  const TAILWIND: ProjectBreakpoints = {
    from: "tailwind",
    list: [
      { width: 640, name: "sm" },
      { width: 768, name: "md" },
    ],
  };

  test("with breakpoints of the project's own, a view stands for the range of them its width is in, whatever other views there are; one in the desktop view's range is the desktop view", async () => {
    const { editor, changes, phone, layer, addView } = await open(MOVES, TAILWIND);
    const tablet = await addView(700);
    const wide = await addView(780);

    expect([phone, tablet, wide].map((view) => editor.breakpointAt(view.width))).toEqual([
      { min: null, max: 640, project: { tailwind: "max-sm:" } },
      { min: 640, max: 768, project: { tailwind: "sm:max-md:" } },
      null,
    ]);
    await addView(500);
    expect(editor.breakpointAt(phone.width)).toEqual({ min: null, max: 640, project: { tailwind: "max-sm:" } });

    editor.at(tablet);
    editor.set(layer("board"), "fill", RED);
    editor.at(wide);
    editor.set(layer("board"), "radius", 8);
    expect(changes.list().map((change) => [change.property, change.breakpoint ?? "every width"])).toEqual([
      ["fill", { min: 640, max: 768, project: { tailwind: "sm:max-md:" } }],
      ["radius", "every width"],
    ]);
  });

  test("with the project's media queries, a range is written with the query at each of its edges", async () => {
    const css: ProjectBreakpoints = {
      from: "css",
      list: [
        { width: 600, name: "(max-width: 599px)" },
        { width: 750, name: "(min-width: 750px)" },
      ],
    };
    const { editor, phone } = await open(MOVES, css);
    expect(editor.breakpointAt(phone.width)).toEqual({ min: null, max: 600, project: { queries: ["(max-width: 599px)"] } });
    expect(editor.breakpointAt(700)).toEqual({ min: 600, max: 750, project: { queries: ["(max-width: 599px)", "(min-width: 750px)"] } });
  });

  test("a change at a breakpoint is checked on the page shown at a width in its range, wherever the window is: shown, not shown, or not checked when it cannot be shown there", async () => {
    // As the live page has it: source markers, and no usage chains, which only the canvas is given.
    const live = MOVES.replace(/ data-vk-chain='[^']*'/g, "");
    const { editor, changes, phone, layer } = await open(live);
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    const [change] = changes.list();
    /** The live page, `width` px wide: with the fill applied below 800px, or not. */
    const pageAt = (width: number, applied: boolean) => {
      const frame = document.createElement("iframe");
      frame.style.width = `${width}px`;
      document.body.append(frame);
      extraFrames.push(frame);
      const page = frame.contentDocument!;
      page.open();
      page.write(live.replace("<body", `<style>${applied ? "@media (width < 800px) { #board { background-color: rgb(255, 0, 0) } }" : ""}</style>\n<body`));
      page.close();
      return page;
    };
    const widths: number[] = [];
    let closed = 0;
    const openAt = (applied: boolean) => async (width: number) => {
      widths.push(width);
      return { doc: pageAt(width, applied), close: () => void closed++ };
    };
    const check = async (applied: boolean, at: PageAt = openAt(applied)) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        const result = checkChange(pageAt(1000, applied), change, at);
        await vi.advanceTimersByTimeAsync(CHECK_SETTLE_MS);
        return await result;
      } finally {
        vi.useRealTimers();
      }
    };

    expect(await check(true)).toEqual({ outcome: "shown" });
    expect(await check(false)).toEqual({ outcome: "not shown", actual: null });
    expect(widths).toEqual([799, 799]);
    expect(closed).toBe(2);
    expect(await check(true, async () => null)).toEqual({ outcome: "unchecked", reason: "it applies below 800px only, and the page could not be shown 799px wide to check it" });
    // The window in the range already: checked on the page as it is.
    widths.length = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      expect(await checkChange(pageAt(700, true), change, openAt(true))).toEqual({ outcome: "shown" });
    } finally {
      vi.useRealTimers();
    }
    expect(widths).toEqual([]);
  });

  test("the project's media queries are read from the page's stylesheets: each width one starts or stops holding at, named by the first there", () => {
    const { doc } = openCanvas(`<!DOCTYPE html><style>
      @media (max-width: 767px) { p { color: red } }
      @media screen and (min-width: 48em) { p { color: blue } }
      @layer page { @supports (display: grid) { @media (width >= 1024px) { p { color: green } } } }
      @media (640px < width <= 900px) { p { margin: 0 } }
      @media (prefers-color-scheme: dark), (min-height: 500px), print { p { color: white } }
    </style><body><p>Hi</p></body>`);
    expect(readMediaBreakpoints(doc)).toEqual({
      from: "css",
      list: [
        { width: 641, name: "(640px < width <= 900px)" },
        { width: 768, name: "(max-width: 767px)" },
        { width: 901, name: "(640px < width <= 900px)" },
        { width: 1024, name: "(width >= 1024px)" },
      ],
    });
    expect(readMediaBreakpoints(openCanvas(MOVES).doc)).toBeNull();
  });

  test("a change at a breakpoint recorded before the views changed is told, edited and reset in every view whose width is in its range, never doubled", async () => {
    const { editor, changes, phone, layer, fills, addView } = await open();
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    // A view added between: the phone view now stands for the widths below 600px, the new one for 600px up to 800px.
    const between = await addView(600);
    expect(editor.breakpoint()).toEqual({ min: null, max: 600 });

    for (const view of [phone, between]) {
      editor.at(view);
      expect(editor.changesHere(layer("board"))).toEqual(["fill"]);
    }
    editor.set(layer("board"), "fill", BLUE);
    expect(changes.list().map((change) => [change.after, change.breakpoint])).toEqual([[BLUE, { min: null, max: 800 }]]);
    expect(fills("board")).toEqual(["rgba(0, 0, 0, 0)", "rgb(0, 0, 255)"]);

    editor.inherit(layer("board"), "fill");
    expect(changes.list()).toEqual([]);
    expect(fills("board")).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
    editor.at(phone);
    expect(editor.changesHere(layer("board"))).toEqual([]);
  });

  test("with the project's breakpoints read, a change recorded at a range of them before says how the project writes it, and one in a view in the desktop view's range is told, edited and reset there", async () => {
    const canvas = openCanvas(MOVES, TAILWIND);
    const { views, editor, doc } = canvas;
    // Recorded before the project's breakpoints were read, by the views' widths: as a saved round brings them back.
    const layer = (id: string) => find(editor.tree().root, (l) => l.el === doc.getElementById(id) && !l.text)!;
    const wide = await (async () => {
      const frame = document.createElement("iframe");
      document.body.append(frame);
      extraFrames.push(frame);
      return views.add(frame, 780);
    })();
    const narrow = await (async () => {
      const frame = document.createElement("iframe");
      document.body.append(frame);
      extraFrames.push(frame);
      return views.add(frame, 700);
    })();
    editor.at(narrow);
    editor.set(layer("board"), "fill", RED);
    editor.set(layer("board"), "radius", 4);
    editor.set(layer("list"), "gap", 4);
    // As a round saved before the project's breakpoints were read has them: with no word of the project's, the fill at 640px up to 800px, the views' widths then.
    const round = structuredClone(canvas.changes.save());
    const [old, oldRadius] = round.changes;
    old.breakpoint = { min: 640, max: 800 };
    oldRadius.breakpoint = { min: 640, max: 768 };
    const saved = createChangeSet(round);
    const [fill, radius] = saved.list();
    const reopened = createEditor(views, saved, TAILWIND);
    expect(radius.breakpoint).toEqual({ min: 640, max: 768, project: { tailwind: "sm:max-md:" } });
    expect(fill.breakpoint).toEqual({ min: 640, max: 800 });

    // 780px is in the desktop view's range, md and up: edits there are at every width, but the fill of 640px up to 800px holds there.
    reopened.at(wide);
    expect(reopened.breakpoint()).toBeNull();
    expect(reopened.changesHere(layer("board"))).toEqual(["fill"]);
    reopened.set(layer("board"), "fill", BLUE);
    expect(saved.list().map((change) => [change.property, change.after, change.breakpoint ?? "every width"])).toEqual([
      ["fill", BLUE, { min: 640, max: 800 }],
      ["radius", 4, { min: 640, max: 768, project: { tailwind: "sm:max-md:" } }],
      ["gap", 4, { min: 640, max: 768, project: { tailwind: "sm:max-md:" } }],
    ]);
    reopened.inherit(layer("board"), "fill");
    expect(reopened.changesHere(layer("board"))).toEqual([]);
    reopened.set(layer("board"), "opacity", 0.5);
    expect(saved.list().at(-1)!.breakpoint).toBeUndefined();
    // In the view of its own range, the board's changes there, in the order they were made.
    reopened.at(narrow);
    expect(reopened.changesHere(layer("board"))).toEqual(["radius"]);
  });

  test("an edit at a breakpoint reaching into another range the property has of its own takes only the widths left, so no two overlap", async () => {
    const { editor, changes, views, phone, layer, shown, addView } = await open();
    const between = await addView(600);
    editor.at(between);
    editor.set(layer("board"), "fill", RED);
    // The view taken away: the phone view stands for every width below 800px again, which reaches into the change's range.
    views.remove(between);
    editor.at(phone);
    editor.set(layer("board"), "fill", BLUE);

    expect(changes.list().map((change) => change.breakpoint)).toEqual([
      { min: 600, max: 800 },
      { min: null, max: 600 },
    ]);
    expect(style(phone.document.getElementById("board")!).backgroundColor).toBe("rgb(0, 0, 255)");
    expect(shown("board")[0].backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  test("an edit made in the phone view shows there only, and is recorded at its breakpoint", async () => {
    const { editor, changes, phone, layer, fills } = await open();

    editor.at(phone);
    editor.set(layer("board"), "fill", RED);

    expect(fills("board")).toEqual(["rgba(0, 0, 0, 0)", "rgb(255, 0, 0)"]);
    expect(changes.list()).toMatchObject([{ kind: "style", property: "fill", breakpoint: { min: null, max: 800 }, before: null, after: RED }]);
  });

  test("an edit made in the desktop view applies at every breakpoint, but where the breakpoint has changed the property on its own", async () => {
    const { editor, phone, desktop, layer, fills } = await open();

    editor.set(layer("list"), "fill", BLUE);
    expect(fills("list")).toEqual(["rgb(0, 0, 255)", "rgb(0, 0, 255)"]);

    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    editor.at(desktop);
    editor.set(layer("board"), "fill", BLUE);

    expect(fills("board")).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)"]);
  });

  test("worked in, a view reads values as it shows them, and tells which the breakpoint changed on its own", async () => {
    const { editor, phone, desktop, layer } = await open(MOVES.replace("<body", "<style>@media (width < 500px) { #list { gap: 4px !important } }</style>\n<body"));

    expect(editor.read(layer("list"), "gap")).toBe(10);
    editor.at(phone);
    expect(editor.breakpoint()).toEqual({ min: null, max: 800 });
    expect(editor.read(layer("list"), "gap")).toBe(4);
    expect(editor.changedHere(layer("list"), "gap")).toBe(false);

    editor.set(layer("list"), "gap", 12);
    expect(editor.read(layer("list"), "gap")).toBe(12);
    expect(editor.changedHere(layer("list"), "gap")).toBe(true);
    expect(editor.changedHere(layer("list"), "padding")).toBe(false);

    editor.at(desktop);
    expect(editor.breakpoint()).toBeNull();
    expect(editor.read(layer("list"), "gap")).toBe(10);
    expect(editor.changedHere(layer("list"), "gap")).toBe(false);
  });

  test("set back to inherit, a breakpoint shows the value at every width again, as it is now; undone, its own is back", async () => {
    const { editor, changes, phone, desktop, layer, fills } = await open();

    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    editor.at(desktop);
    editor.set(layer("board"), "fill", BLUE);
    editor.at(phone);
    editor.inherit(layer("board"), "fill");

    expect(fills("board")).toEqual(["rgb(0, 0, 255)", "rgb(0, 0, 255)"]);
    expect(editor.changedHere(layer("board"), "fill")).toBe(false);
    expect(changes.list().map((change) => [change.property, change.breakpoint ?? "every width"])).toEqual([["fill", "every width"]]);

    editor.undo();
    expect(fills("board")).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)"]);
    expect(editor.changedHere(layer("board"), "fill")).toBe(true);
    editor.redo();
    expect(fills("board")).toEqual(["rgb(0, 0, 255)", "rgb(0, 0, 255)"]);
  });

  test("an edit at a breakpoint is undone and redone there, whichever view is worked in then; set back to where it started, it is no change", async () => {
    const { editor, changes, phone, desktop, layer, fills } = await open();

    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    editor.at(desktop);
    editor.undo();
    expect(fills("board")).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
    expect(changes.list()).toEqual([]);
    editor.redo();
    expect(fills("board")).toEqual(["rgba(0, 0, 0, 0)", "rgb(255, 0, 0)"]);

    editor.at(phone);
    editor.set(layer("board"), "fill", null);
    expect(changes.list()).toEqual([]);
    expect(fills("board")).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
  });

  test("a layer hidden at a breakpoint is hidden there only, and stays a layer; hidden at every width, a breakpoint can show it again", async () => {
    const { editor, changes, phone, desktop, layer, shown } = await open();
    const displays = (id: string) => shown(id).map((s) => s.display);

    editor.at(phone);
    editor.set(layer("b"), "visible", false);
    expect(displays("b")).toEqual(["block", "none"]);
    expect(editor.read(layer("b"), "visible")).toBe(false);
    expect(editor.read(layer("b"), "fill")).toBeNull();
    expect(phone.boxOf(layer("b"))).toBeNull();
    expect(editor.tree().root.children[0].children.map((l) => l.name)).toEqual(["A", "B", "C"]);
    editor.at(desktop);
    expect(editor.read(layer("b"), "visible")).toBe(true);

    editor.set(layer("c"), "visible", false);
    editor.at(phone);
    expect(editor.read(layer("c"), "visible")).toBe(false);
    editor.set(layer("c"), "visible", true);
    expect(displays("c")).toEqual(["none", "block"]);
    expect(changes.list().map((change) => [change.layer, change.after, change.breakpoint ?? "every width"])).toEqual([
      [layer("b").el.getAttribute("data-vk-layer"), false, { min: null, max: 800 }],
      [layer("c").el.getAttribute("data-vk-layer"), false, "every width"],
      [layer("c").el.getAttribute("data-vk-layer"), true, { min: null, max: 800 }],
    ]);
    // Shown again at every width, it is shown at the breakpoint as well, which says so on its own still.
    editor.at(desktop);
    editor.set(layer("c"), "visible", true);
    expect(displays("c")).toEqual(["block", "block"]);
  });

  test("changes to the structure made in the phone view apply in every view, at every width", async () => {
    const { editor, changes, phone, layer, shown } = await open();
    const order = (doc: Document) => [...doc.getElementById("list")!.children].map((el) => el.id);

    editor.at(phone);
    editor.move(layer("c"), { parent: layer("list"), index: 0 });
    const copy = editor.duplicate(layer("d"));
    editor.remove(layer("a"));
    const stack = editor.stack([layer("b"), layer("c")]);

    expect(order(phone.document)).toEqual(order(editor.tree().root.el.ownerDocument));
    expect(shown("a").map((s) => s.display)).toEqual(["none", "none"]);
    expect(phone.boxOf(copy)).not.toBeNull();
    expect(phone.boxOf(stack)).not.toBeNull();
    expect(changes.list().every((change) => !change.breakpoint)).toBe(true);
  });

  test("sizes, Stack settings and minimums change at a breakpoint as any property does", async () => {
    const { editor, phone, layer, shown } = await open();

    editor.at(phone);
    editor.set(layer("list"), "gap", 24);
    editor.set(layer("list"), "direction", "horizontal");
    editor.set(layer("board"), "width", { type: "fixed", value: 120 });
    editor.set(layer("board"), "minHeight", 300);

    expect(shown("list").map((s) => [s.flexDirection, s.rowGap])).toEqual([
      ["column", "10px"],
      ["row", "24px"],
    ]);
    expect(shown("board").map((s) => [s.width, s.minHeight])).toEqual([
      ["300px", "0px"],
      ["120px", "300px"],
    ]);
    expect(editor.read(layer("board"), "width")).toEqual({ type: "fixed", value: 120 });
    expect(editor.measure(layer("board")).width).toBe(120);
  });

  test("a layer placed freely is placed anew at a breakpoint when dragged there in its container, or when its X and Y change there", async () => {
    const { editor, changes, phone, desktop, layer, doc } = await open();
    editor.move(layer("d"), { parent: layer("board"), x: 10, y: 20 });
    const place = (d: Document) => {
      const r = d.getElementById("d")!.getBoundingClientRect();
      const b = d.getElementById("board")!.getBoundingClientRect();
      return [r.left - b.left, r.top - b.top];
    };

    editor.at(phone);
    editor.move(layer("d"), { parent: layer("board"), x: 40, y: 50 });
    expect([place(doc), place(phone.document)]).toEqual([
      [10, 20],
      [40, 50],
    ]);
    editor.set(layer("d"), "x", 5);
    expect(place(phone.document)).toEqual([5, 50]);
    expect(changes.list().map((change) => [change.kind, change.property, change.breakpoint ?? "every width"])).toEqual([
      ["move", "move", "every width"],
      ["style", "x", { min: null, max: 800 }],
      ["style", "y", { min: null, max: 800 }],
    ]);

    // In the desktop view, dragged again, it is the move that changes.
    editor.at(desktop);
    editor.move(layer("d"), { parent: layer("board"), x: 30, y: 30 });
    expect([place(doc), place(phone.document)]).toEqual([
      [30, 30],
      [5, 50],
    ]);
  });

  test("nudged in the phone view, a layer placed freely is placed anew at its breakpoint; one in a Stack swaps places in every view", async () => {
    const { editor, changes, phone, layer, doc } = await open(NUDGES);
    const place = (d: Document) => {
      const r = d.getElementById("free")!.getBoundingClientRect();
      const b = d.getElementById("board")!.getBoundingClientRect();
      return [r.left - b.left, r.top - b.top];
    };
    const order = (d: Document) => [...d.getElementById("list")!.children].map((el) => el.id);

    editor.at(phone);
    editor.nudge([layer("free")], 10, 0);
    editor.nudge([layer("a")], 0, 1);

    expect([place(doc), place(phone.document)]).toEqual([
      [12, 8],
      [22, 8],
    ]);
    expect([order(doc), order(phone.document)]).toEqual([
      ["b", "a", "c"],
      ["b", "a", "c"],
    ]);
    expect(changes.list().map((change) => [change.property, change.breakpoint ?? "every width"])).toEqual([
      ["x", { min: null, max: 800 }],
      ["move", "every width"],
    ]);
  });

  test("nudged in the phone view, a layer in a Frame's flow is placed freely at its breakpoint only, one change and one step; the desktop view keeps it in the flow", async () => {
    const { editor, changes, phone, layer, doc } = await open(NUDGES);
    const place = (d: Document) => {
      const r = d.getElementById("tag")!.getBoundingClientRect();
      const f = d.getElementById("frame")!.getBoundingClientRect();
      return [r.left - f.left, r.top - f.top];
    };
    const positions = () => [doc, phone.document].map((d) => style(d.getElementById("tag")!).position);
    const was = [place(doc), place(phone.document)];

    editor.at(phone);
    const [moved] = editor.nudge([layer("tag")], 0, 10);
    editor.nudge([moved], 1, 0, { continues: true });

    expect(positions()).toEqual(["static", "absolute"]);
    expect([place(doc), place(phone.document)]).toEqual([was[0], [was[1][0] + 1, was[1][1] + 10]]);
    expect(changes.list().map((change) => [change.kind, change.property, change.before, change.after, change.breakpoint ?? "every width"])).toEqual([
      ["style", "absolute", null, { x: 1, y: 10 }, { min: null, max: 800 }],
    ]);
    expect(editor.changesHere(layer("tag"))).toEqual(["absolute"]);

    editor.undo();
    expect(positions()).toEqual(["static", "static"]);
    expect([place(doc), place(phone.document)]).toEqual(was);
    expect(changes.list()).toEqual([]);
    editor.redo();
    expect(positions()).toEqual(["static", "absolute"]);
    expect(place(phone.document)).toEqual([was[1][0] + 1, was[1][1] + 10]);
  });

  test("dragged in its own Frame in the phone view, a layer in the flow is placed freely there only; its X there changes that placement; set back to inherit, it is in the flow again", async () => {
    const { editor, changes, phone, desktop, layer, doc } = await open(NUDGES);
    const tag = (d: Document) => style(d.getElementById("tag")!);
    const frame = doc.getElementById("frame")!;

    editor.at(phone);
    editor.move(layer("tag"), { parent: layer("frame"), x: 50, y: 30 });
    editor.move(layer("tag"), { parent: layer("frame"), x: 60, y: 40 });
    editor.set(layer("tag"), "x", 5);

    expect([tag(doc).position, tag(phone.document).position]).toEqual(["static", "absolute"]);
    expect([tag(phone.document).left, tag(phone.document).top, tag(phone.document).width]).toEqual(["5px", "40px", "40px"]);
    expect(changes.list().map((change) => [change.property, change.before, change.after, change.breakpoint ?? "every width"])).toEqual([
      ["absolute", null, { x: 5, y: 40 }, { min: null, max: 800 }],
    ]);
    // Its Frame is its positioning reference.
    expect(style(frame).position).toBe("relative");
    expect(editor.changesHere(layer("tag"))).toEqual(["absolute"]);

    // In the desktop view, it is in the Frame's flow, as it was.
    editor.at(desktop);
    expect(editor.read(layer("tag"), "absolute")).toBeNull();
    expect(editor.can(layer("tag"), "x")).toBe(false);

    editor.at(phone);
    editor.inherit(layer("tag"), "absolute");
    expect([tag(doc).position, tag(phone.document).position]).toEqual(["static", "static"]);
    expect(tag(phone.document).left).toBe("auto");
    expect(style(frame).position).toBe("static");
    expect(changes.list()).toEqual([]);
    expect(editor.changesHere(layer("tag"))).toEqual([]);
    editor.undo();
    expect(tag(phone.document).position).toBe("absolute");
    expect(style(frame).position).toBe("relative");
  });

  test("placed freely at a breakpoint, taken back from the change list or from a saved round, a layer is in its Frame's flow again, which is no positioning reference any more", async () => {
    const { editor, changes, phone, layer, doc } = await open(NUDGES);
    editor.at(phone);
    editor.nudge([layer("tag")], 0, 10);
    const [change] = changes.list();

    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };
    expect(revertSaved(saved, change.id)).toBeNull();
    const shown = showSaved(saved.canvas);
    savedFrame!.style.width = "390px";
    expect(style(shown.getElementById("tag")!).position).toBe("absolute");

    editor.revert(change.id);
    expect(style(phone.document.getElementById("tag")!).position).toBe("static");
    expect(style(doc.getElementById("frame")!).position).toBe("static");
    expect(changes.list()).toEqual([]);
    editor.undo();
    expect(style(phone.document.getElementById("tag")!).position).toBe("absolute");
  });

  test("moved into another container in the phone view, a layer is moved in every view, placed freely where it is dropped at every width", async () => {
    const { editor, changes, phone, layer, doc } = await open(NUDGES);

    editor.at(phone);
    editor.move(layer("tag"), { parent: layer("board"), x: 20, y: 30 });

    expect([doc, phone.document].map((d) => [d.getElementById("tag")!.parentElement!.id, style(d.getElementById("tag")!).position])).toEqual([
      ["board", "absolute"],
      ["board", "absolute"],
    ]);
    expect(changes.list().map((change) => [change.kind, (change.after as { absolute: unknown }).absolute, change.breakpoint ?? "every width"])).toEqual([
      ["move", { x: 20, y: 30 }, "every width"],
    ]);
  });

  test("taken back from the change list, or from a saved round with no canvas open, a change at a breakpoint goes there only", async () => {
    const opened = await open();
    const { editor, changes, phone, layer, fills, doc } = opened;
    editor.set(layer("board"), "fill", BLUE);
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    editor.set(layer("list"), "fill", RED);
    const [, board, list] = changes.list();

    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };
    const reverted = revertSaved(saved, board.id)!;
    expect(reverted.changeSet.changes.map((change) => change.id)).toEqual([1, list.id]);
    const shownAt = (width: number) => {
      const shown = showSaved(reverted.canvas);
      savedFrame!.style.width = `${width}px`;
      return ["board", "list"].map((id) => style(shown.getElementById(id)!).backgroundColor);
    };
    expect(shownAt(390)).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)"]);
    expect(shownAt(800)).toEqual(["rgb(0, 0, 255)", "rgba(0, 0, 0, 0)"]);

    editor.revert(board.id);
    expect(fills("board")).toEqual(["rgb(0, 0, 255)", "rgb(0, 0, 255)"]);
    editor.undo();
    expect(fills("board")).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)"]);
  });

  test("a copy looks as the layer does at every breakpoint, but the layer's changes there are not the copy's", async () => {
    const { editor, changes, phone, layer, doc } = await open();

    editor.at(phone);
    editor.set(layer("row"), "fill", RED);
    const copy = editor.duplicate(layer("row"));
    editor.set(layer("row"), "fill", BLUE);

    const copyIn = (d: Document) => style(d.body.children[2]).backgroundColor;
    expect([copyIn(doc), copyIn(phone.document)]).toEqual(["rgba(0, 0, 0, 0)", "rgb(255, 0, 0)"]);
    expect(editor.read(copy, "fill")).toEqual(RED);
    expect(changes.list().filter((change) => change.layer === copy.el.getAttribute("data-vk-layer")).map((change) => change.kind)).toEqual(["duplicate"]);
  });

  test("a copy's change says what the layer, and each layer in it, has at breakpoints of its own when copied, as the copy keeps it", async () => {
    const { editor, changes, phone, layer } = await open();
    const PHONE = { min: null, max: 800 };

    editor.at(phone);
    editor.set(layer("row"), "fill", RED);
    editor.set(layer("d"), "visible", false);
    const [fill, hidden] = changes.list();
    const copy = editor.duplicate(layer("row"));
    // Changed again once copied: the copy keeps what the layer had then.
    editor.set(layer("row"), "fill", BLUE);
    const copyOfCopy = editor.duplicate(copy);

    const copied = (layer: typeof copy) => changes.list().find((change) => change.layer === layer.el.getAttribute("data-vk-layer"))!.copiedBreakpoints;
    expect(copied(copy)).toEqual([
      { change: fill.id, inside: null, breakpoint: PHONE, property: "fill", value: RED },
      { change: hidden.id, inside: { name: hidden.target.context.path.at(-1), element: hidden.target.context.element }, breakpoint: PHONE, property: "visible", value: false },
    ]);
    expect(copied(copyOfCopy)).toEqual(copied(copy));
  });

  test("a copy of a copy says what a layer in it has at a breakpoint now, its own value over what it took over, and nothing of a layer deleted from it", async () => {
    const { editor, changes, phone, layer } = await open();
    const PHONE = { min: null, max: 800 };

    editor.at(phone);
    editor.set(layer("d"), "visible", false);
    const copy = editor.duplicate(layer("row"));
    const inCopy = () => find(editor.tree().root, (l) => l.el === copy.el.firstElementChild && !l.text)!;
    editor.set(inCopy(), "visible", true);
    const shown = changes.list().at(-1)!;
    const copied = (layer: typeof copy) => changes.list().find((change) => change.layer === layer.el.getAttribute("data-vk-layer"))!.copiedBreakpoints;

    expect(copied(editor.duplicate(copy))).toEqual([{ change: shown.id, inside: { name: layerName(shown), element: shown.target.context.element }, breakpoint: PHONE, property: "visible", value: true }]);
    editor.remove(inCopy());
    expect(copied(editor.duplicate(copy))).toBeUndefined();
  });

  test("a copy of a layer with nothing of its own at any breakpoint says none", async () => {
    const { editor, changes, layer } = await open();

    editor.set(layer("row"), "fill", RED);
    editor.duplicate(layer("row"));

    expect(changes.list().find((change) => change.kind === "duplicate")!.copiedBreakpoints).toBeUndefined();
  });

  test("what the edits declare wins over what the page declares, important or in a CSS layer, at every width", async () => {
    const page = MOVES.replace(
      "<body",
      "<style>@layer base, utilities; @layer utilities { #board { background-color: rgb(0 128 0) !important } } div#board.x { background-color: rgb(0 128 0) !important }</style>\n<body",
    );
    const { editor, phone, desktop, layer, fills } = await open(page);
    layer("board").el.classList.add("x");

    editor.set(layer("board"), "fill", BLUE);
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    expect(fills("board")).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)"]);
    editor.at(desktop);
    expect(editor.changedHere(layer("board"), "fill")).toBe(false);
  });

  test("a canvas saved with its edits in the style attribute, as before, is put back with them in its edit styles, and they come off as they did", () => {
    const old = `<!DOCTYPE html>
<body style="margin: 0">
  <div id="board" data-vk-layer="1" data-vk-original-style="width: 300px; height: 200px"
    style="width: 300px; height: 200px; background-color: rgb(255 0 0 / 1) !important"></div>
</body>`;
    const { doc, views } = openCanvas(old);
    const el = doc.getElementById("board")!;

    // As putting a saved canvas back does.
    moveInlineEdits(doc);
    const changes = createChangeSet({
      lastId: 1,
      changes: [
        {
          id: 1,
          kind: "style",
          layer: "1",
          target: { loc: null, chain: [], component: null, instances: 1, locked: false, unlocated: true, context: { path: ["Page", "Board"], element: "<div>" } },
          scope: "usage",
          property: "fill",
          before: null,
          after: { type: "solid", color: "#FF0000", opacity: 1 },
          style: { "background-color": "rgb(255 0 0 / 1)" },
          sources: [],
        },
      ],
    });
    const editor = createEditor(views, changes);
    expect(el.getAttribute("style")).toBe("width: 300px; height: 200px");
    expect(style(el).backgroundColor).toBe("rgb(255, 0, 0)");

    editor.revert(1);
    expect(style(el).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(el.getAttribute("style")).toBe("width: 300px; height: 200px");
  });

  test("a plain flow given a gap at a breakpoint is a real Stack there, though one at every width made it one first and is taken back", async () => {
    const { editor, changes, phone, desktop, layer, shown } = await open(LAYOUT);
    const flow = () => find(editor.tree().root, (l) => l.el.id === "flow")!;

    editor.set(flow(), "gap", 16);
    editor.at(phone);
    editor.set(flow(), "gap", 30);
    editor.at(desktop);
    editor.revert(changes.list()[0].id);

    expect(changes.list().map((change) => [change.after, change.asStack, change.breakpoint ?? "every width"])).toEqual([[30, true, { min: null, max: 800 }]]);
    expect(shown("flow").map((s) => [s.display, s.rowGap])).toEqual([
      ["block", "normal"],
      ["flex", "30px"],
    ]);
  });
});


/** A Grid of four cards, as Tailwind writes one (`grid grid-cols-2 gap-4`), another of fixed columns, and a Stack. */
const GRID = `<!DOCTYPE html>
<body style="margin: 0">
  <style>.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) } .gap-4 { gap: 16px }</style>
  <div id="grid" ${at("5:5")} class="grid-cols-2 gap-4" style="display: grid; width: 400px">
    <div id="a" ${at("6:7")} style="height: 40px">A</div>
    <div id="b" ${at("7:7")} style="height: 40px">B</div>
    <div id="c" ${at("8:7")} style="height: 40px">C</div>
    <div id="d" ${at("9:7")} style="height: 40px">D</div>
  </div>
  <div id="fixed" ${at("11:5")} style="display: grid; grid-template-columns: 300px 100px; column-gap: 8px">
    <div id="e" ${at("12:7")} style="height: 20px">E</div>
  </div>
  <div id="list" ${at("14:5")} style="display: flex; flex-direction: column; gap: 10px; width: 200px">
    <div id="f" ${at("15:7")} style="height: 20px">F</div>
  </div>
</body>`;

describe("Grid", () => {
  const open = () => {
    const canvas = openCanvas(GRID);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const order = () => [...canvas.doc.getElementById("grid")!.children].map((el) => el.id);
    /** The columns the Grid is laid out in, by their widths. */
    const columns = (id = "grid") => style(canvas.doc.getElementById(id)!).gridTemplateColumns;
    return { ...canvas, layer, order, columns };
  };

  test("a Grid offers its columns, row gap and column gap, read as it is laid out; a Stack and the layers in a Grid do not", () => {
    const { editor, layer } = open();

    expect(["columns", "rowGap", "columnGap"].map((p) => editor.read(layer("grid"), p as "columns"))).toEqual([2, 16, 16]);
    expect(["columns", "rowGap", "columnGap"].map((p) => editor.read(layer("fixed"), p as "columns"))).toEqual([2, 0, 8]);
    expect(editor.can(layer("list"), "columns")).toBe(false);
    expect(editor.can(layer("a"), "rowGap")).toBe(false);
    expect(editor.can(layer("grid"), "gap")).toBe(false);
  });

  test("columns are set as equal columns, at least one, a whole number; the change records the count, and undo takes it back", () => {
    const { editor, changes, layer, columns } = open();

    editor.set(layer("grid"), "columns", 4);

    // 400px wide, three gaps of 16px between them.
    expect(columns()).toBe("88px 88px 88px 88px");
    expect(changes.list()[0]).toMatchObject({
      kind: "style",
      property: "columns",
      before: 2,
      after: 4,
      style: { "grid-template-columns": "repeat(4, minmax(0, 1fr))" },
      sources: [{ kind: "rule", className: "grid-cols-2", declaration: "grid-template-columns: repeat(2, minmax(0px, 1fr))" }],
    });
    expect(editor.can(layer("grid"), "columns", 0)).toBe(false);
    expect(editor.can(layer("grid"), "columns", 1.5)).toBe(false);
    editor.undo();
    expect(columns()).toBe("192px 192px");
    expect(changes.list()).toEqual([]);
  });

  test("columns sized otherwise become as many equal columns", () => {
    const { editor, layer, columns } = open();

    editor.set(layer("fixed"), "columns", 3);

    // 800px wide, two gaps of 8px between them.
    expect(columns("fixed").split(" ").map((w) => Math.round(parseFloat(w)))).toEqual([261, 261, 261]);
    expect(editor.read(layer("fixed"), "columns")).toBe(3);
  });

  test("row gap and column gap are set apart, over the gap the page sets both with", () => {
    const { doc, editor, changes, layer } = open();
    const grid = doc.getElementById("grid")!;

    editor.set(layer("grid"), "rowGap", 24);
    editor.set(layer("grid"), "columnGap", 8);

    expect([style(grid).rowGap, style(grid).columnGap]).toEqual(["24px", "8px"]);
    expect(changes.list().map((change) => [change.property, change.before, change.after, change.style])).toEqual([
      ["rowGap", 16, 24, { "row-gap": "24px" }],
      ["columnGap", 16, 8, { "column-gap": "8px" }],
    ]);
    expect(changes.list()[0].sources).toMatchObject([{ className: "gap-4", declaration: "gap: 16px" }]);
  });

  test("in a narrower view, columns and gaps change at its breakpoint only, as the view reads them, and can be set back to inherit", async () => {
    const { doc, views, editor, changes, layer } = open();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    const counts = () => [doc, phone.document].map((d) => style(d.getElementById("grid")!).gridTemplateColumns.split(" ").length);

    editor.at(phone);
    editor.set(layer("grid"), "columns", 1);
    editor.set(layer("grid"), "rowGap", 8);

    expect(counts()).toEqual([2, 1]);
    expect(editor.read(layer("grid"), "columns")).toBe(1);
    expect(changes.list().map((change) => [change.property, change.breakpoint])).toEqual([
      ["columns", { min: null, max: 800 }],
      ["rowGap", { min: null, max: 800 }],
    ]);
    expect(editor.changesHere(layer("grid"))).toEqual(["columns", "rowGap"]);
    editor.inherit(layer("grid"), "columns");
    expect(counts()).toEqual([2, 2]);
    expect(changes.list().map((change) => change.property)).toEqual(["rowGap"]);
  });

  test("a layer moved within its Grid takes another cell, the layers after it filling the cells in order: a Reorder in a Grid", () => {
    const { editor, changes, layer, order } = open();

    expect(editor.canDrop(layer("a"), layer("grid"))).toBe(true);
    editor.move(layer("a"), { parent: layer("grid"), index: 3 });

    expect(order()).toEqual(["b", "c", "d", "a"]);
    expect(changes.list()[0]).toMatchObject({
      kind: "move",
      before: { container: { grid: true, target: { loc: "src/App.tsx:5:5" } }, nth: 1, absolute: null },
      after: { container: { grid: true }, nth: 4, absolute: null },
    });
    expect(layerName(changes.list()[0])).toBe("A");
    editor.undo();
    expect(order()).toEqual(["a", "b", "c", "d"]);
  });

  test("a layer from elsewhere, or a new one, takes a cell of the Grid", () => {
    const { editor, layer, order } = open();

    expect(editor.canHold(layer("grid"))).toBe(true);
    editor.move(layer("f"), { parent: layer("grid"), index: 1 });
    expect(order()).toEqual(["a", "f", "b", "c", "d"]);
    const text = editor.create("text", { parent: layer("grid"), index: 0 });
    expect(text.absolute).toBe(false);
    expect(order()[1]).toBe("a");
  });

  test("nudged, a layer in a Grid takes the cell before or after it with ← and →, the one above or below with ↑ and ↓, and stays at the ends; the run is one move", () => {
    const { editor, changes, layer, order } = open();

    let [a] = editor.nudge([layer("a")], 1, 0);
    expect(order()).toEqual(["b", "a", "c", "d"]);
    [a] = editor.nudge([a], 0, 1, { continues: true });
    expect(order()).toEqual(["b", "c", "d", "a"]);
    [a] = editor.nudge([a], 0, 10, { continues: true });
    [a] = editor.nudge([a], 1, 0, { continues: true });
    expect(order()).toEqual(["b", "c", "d", "a"]);
    [a] = editor.nudge([a], -1, 0, { continues: true });
    expect(order()).toEqual(["b", "c", "a", "d"]);

    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0]).toMatchObject({ before: { nth: 1 }, after: { nth: 3 } });
    editor.undo();
    expect(order()).toEqual(["a", "b", "c", "d"]);
  });
});

