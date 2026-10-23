import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { buildLayerTree, type Layer } from "../src/client/layers";

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

function openCanvas() {
  iframe = document.createElement("iframe");
  iframe.style.width = "800px";
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(PAGE);
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
  test("paints every instance of the usage, and the change records target, scope, before, after and reference style", () => {
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
        },
        scope: "usage",
        property: "fill",
        before: { type: "solid", color: "#FFFFFF", opacity: 1 },
        after: { type: "solid", color: "#FF0000", opacity: 1 },
        style: { "background-color": "rgb(255 0 0 / 1)" },
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
    });
  });

  test("the same property of different layers makes separate changes", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(cards[3]), "radius", 4);

    expect(changes.list().map((change) => change.target.chain[0].usage)).toEqual(["src/App.tsx:6:9", "src/App.tsx:8:7"]);
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
