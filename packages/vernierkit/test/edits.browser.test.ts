import { afterEach, describe, expect, test, vi } from "vitest";
import { CHECK_SETTLE_MS } from "../src/service-protocol";
import { createChangeSet } from "../src/client/changeset";
import { checkChange } from "../src/client/check";
import { createClipboard } from "../src/client/clipboard";
import { createEditor, type Fill, type PropertyValues, type Shadow, type Stroke } from "../src/client/edits";
import { serializeCanvas } from "../src/client/freezer";
import { boxOf, type Layer } from "../src/client/layers";
import { revertSaved } from "../src/client/saved-round";
import { fontsOf } from "../src/client/typography";
import { createViews } from "../src/client/views";
import { bind, resolveVariables } from "../src/client/variables";
import type { Variable } from "../src/service-protocol";

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

afterEach(() => {
  iframe?.remove();
  live?.remove();
  phoneFrame?.remove();
});

function openCanvas(page = PAGE) {
  iframe = document.createElement("iframe");
  iframe.style.width = "800px";
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(page);
  doc.close();
  const views = createViews({ document: doc, width: 800, height: 600, scrollY: 0 });
  const changes = createChangeSet();
  const editor = createEditor(views, changes);
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

describe("gradient fill", () => {
  const sunset: Fill & { type: "linear" } = {
    type: "linear",
    angle: 90,
    stops: [
      { color: "#FF0000", opacity: 1, position: 0, unit: "%" },
      { color: "#0000FF", opacity: 0.5, position: 100, unit: "%" },
    ],
  };

  test("a linear gradient paints every instance at its angle, over no color, and reads back as set", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.set(layerOf(cards[0]), "fill", sunset);

    expect(cards.map((card) => style(card).backgroundImage)).toEqual([
      ...Array(3).fill("linear-gradient(90deg, rgb(255, 0, 0) 0%, rgba(0, 0, 255, 0.5) 100%)"),
      "none",
    ]);
    expect(style(cards[0]).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(editor.read(layerOf(cards[1]), "fill")).toEqual(sunset);
    const [change] = changes.list();
    expect(change.style).toEqual({
      "background-color": "transparent",
      "background-image": "linear-gradient(90deg, rgb(255 0 0 / 1) 0%, rgb(0 0 255 / 0.5) 100%)",
    });
    expect(change.before).toEqual({ type: "solid", color: "#FFFFFF", opacity: 1 });
  });

  test("the page's own gradients read as angle and stops, wherever CSS leaves the positions out", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!; // 800 × 40
    const read = (css: string) => {
      box.style.backgroundImage = css;
      return editor.read(layerOf(box), "fill");
    };
    const red = { color: "#FF0000", opacity: 1 };
    const blue = { color: "#0000FF", opacity: 1 };

    const at = (position: number, unit: "%" | "px" = "%") => ({ position, unit });

    expect(read("linear-gradient(red, blue)")).toEqual({ type: "linear", angle: 180, stops: [{ ...red, ...at(0) }, { ...blue, ...at(100) }] });
    // Tailwind v3's bg-gradient-to-r from-red-500 via-… to-transparent, in short.
    expect(read("linear-gradient(to right, red, rgb(0 0 255 / 0.5), transparent)")).toEqual({
      type: "linear",
      angle: 90,
      stops: [
        { ...red, ...at(0) },
        { color: "#0000FF", opacity: 0.5, ...at(50) },
        { color: "#000000", opacity: 0, ...at(100) },
      ],
    });
    // Tailwind v4 blends in oklab: the stops read the same. A stop in px stays in px.
    expect(read("linear-gradient(to left in oklab, red 20%, blue 400px)")).toEqual({
      type: "linear",
      angle: 270,
      stops: [{ ...red, ...at(20) }, { ...blue, ...at(400, "px") }],
    });
    // A corner: square to the diagonal of the 800 × 40 box.
    expect((read("linear-gradient(to top right, red, blue)") as { angle: number }).angle).toBe(2.86);
    expect(read("linear-gradient(0.25turn, red 10% 30%, blue)")).toEqual({
      type: "linear",
      angle: 90,
      stops: [{ ...red, ...at(10) }, { ...red, ...at(30) }, { ...blue, ...at(100) }],
    });
    // A stop left out goes halfway, in the unit of its neighbours, or in % between px and %; 800px along, 200px is 25%.
    const green = { color: "#008000", opacity: 1 };
    expect((read("linear-gradient(90deg, red 100px, green, blue 300px)") as { stops: unknown[] }).stops[1]).toEqual({ ...green, ...at(200, "px") });
    expect((read("linear-gradient(90deg, red 200px, green, blue 75%)") as { stops: unknown[] }).stops[1]).toEqual({ ...green, ...at(50) });
    // A stop before the one before it is where that one is: 0 after 20% is a hard edge at 20%.
    expect(read("linear-gradient(90deg, red 20%, blue 0)")).toEqual({ type: "linear", angle: 90, stops: [{ ...red, ...at(20) }, { ...blue, ...at(20) }] });
    expect(read("conic-gradient(red, blue)")).toEqual({ type: "conic", css: "conic-gradient(rgb(255, 0, 0), rgb(0, 0, 255))" });
  });

  test("the page's own radial gradients read as center and size, in the units the page writes them; stops in px are measured along the real gradient", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.width = "200px";
    box.style.height = "100px";
    const read = (css: string) => {
      box.style.backgroundImage = css;
      return editor.read(layerOf(box), "fill");
    };
    const red = { color: "#FF0000", opacity: 1 };
    const blue = { color: "#0000FF", opacity: 1 };
    const pc = (value: number) => ({ value, unit: "%" });
    const px = (value: number) => ({ value, unit: "px" as const });

    // The default: an ellipse from the middle out to the farthest corner.
    expect(read("radial-gradient(red, blue)")).toEqual({
      type: "radial",
      center: { x: pc(50), y: pc(50) },
      size: { extent: "farthest-corner", circle: false },
      stops: [{ ...red, position: 0, unit: "%" }, { ...blue, position: 100, unit: "%" }],
    });
    // The keyword size and the center in % stay as written; the stop in px stays in px.
    expect(read("radial-gradient(circle closest-side at 30% 20%, red 20px, blue)")).toEqual({
      type: "radial",
      center: { x: pc(30), y: pc(20) },
      size: { extent: "closest-side", circle: true },
      stops: [{ ...red, position: 20, unit: "px" }, { ...blue, position: 100, unit: "%" }],
    });
    // The 20px circle reaches 10px out at 50%; a stop at 0 after it is where it is.
    expect(read("radial-gradient(circle 20px at 40px 10px, red 10px, green, blue 0)")).toEqual({
      type: "radial",
      center: { x: px(40), y: px(10) },
      size: { x: px(20), y: px(20) },
      stops: [
        { ...red, position: 10, unit: "px" },
        { color: "#008000", opacity: 1, position: 10, unit: "px" },
        { ...blue, position: 10, unit: "px" },
      ],
    });
    // A missing stop between px and %: halfway along a ray as long as the ellipse is wide, 100px.
    expect(read("radial-gradient(ellipse 50% 30% at left top, red 20px, green, blue 60%)")).toEqual({
      type: "radial",
      center: { x: pc(0), y: pc(0) },
      size: { x: pc(50), y: pc(30) },
      stops: [
        { ...red, position: 20, unit: "px" },
        { color: "#008000", opacity: 1, position: 40, unit: "%" },
        { ...blue, position: 60, unit: "%" },
      ],
    });
  });

  test("a radial gradient centered or sized with calc() keeps the page's own center and size; its stops in px are measured along it as the layer's size works it out", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.width = "200px";
    box.style.height = "100px";
    const read = (css: string) => {
      box.style.backgroundImage = css;
      return editor.read(layerOf(box), "fill");
    };
    const stops = (red: number) => [
      { color: "#FF0000", opacity: 1, position: red, unit: "px" },
      // Between px and %, halfway in %: 20% and 60%.
      { color: "#008000", opacity: 1, position: 40, unit: "%" },
      { color: "#0000FF", opacity: 1, position: 60, unit: "%" },
    ];

    // Offset from the right and bottom edges, centered 190px across and 80px down: the circle to the farthest side is 190px.
    expect(read("radial-gradient(circle farthest-side at right 10px bottom 20px, red 38px, green, blue 60%)")).toEqual({
      type: "radial",
      shape: "circle farthest-side at calc(100% - 10px) calc(100% - 20px)",
      stops: stops(38),
    });
    expect(editor.can(layerOf(box), "fill")).toBe(true);
    // Centered 110px across and 20% down: the circle to the closest side is 20px.
    expect(read("radial-gradient(circle closest-side at calc(50% + 10px) 20%, red 4px, green, blue 60%)")).toEqual({
      type: "radial",
      shape: "circle closest-side at calc(50% + 10px) 20%",
      stops: stops(4),
    });
    // 90px to the left of the layer: the ellipse to the farthest side reaches its right edge, 290px across.
    expect(read("radial-gradient(farthest-side at calc(10px - 50%) 20%, red 58px, green, blue 60%)")).toEqual({
      type: "radial",
      shape: "farthest-side at calc(-50% + 10px) 20%",
      stops: stops(58),
    });
    // A size in calc() is in px by the time Chrome computes it (it takes no % in one): a size like any other, 90px across.
    expect(read("radial-gradient(calc(80px + 10px) 30px, red 18px, green, blue 60%)")).toEqual({
      type: "radial",
      center: { x: { value: 50, unit: "%" }, y: { value: 50, unit: "%" } },
      size: { x: { value: 90, unit: "px" }, y: { value: 30, unit: "px" } },
      stops: stops(18),
    });
    // What cannot be worked out is kept all the same; its stops in px measured along the default ellipse, 141.42px across.
    expect(read("radial-gradient(at min(50%, 30px) 20%, red, green, blue 70.71px)")).toEqual({
      type: "radial",
      shape: "at min(50%, 30px) 20%",
      stops: [
        { color: "#FF0000", opacity: 1, position: 0, unit: "%" },
        { color: "#008000", opacity: 1, position: 25, unit: "%" },
        { color: "#0000FF", opacity: 1, position: 70.71, unit: "px" },
      ],
    });
  });

  test("a radial gradient centered with calc(), its stops changed, keeps the page's own center and size, and its stops in order along it", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.width = "200px";
    box.style.height = "100px";
    box.style.backgroundImage = "radial-gradient(circle farthest-side at right 10px bottom 20px, red 38px, blue)";
    const layer = layerOf(box);
    const page = editor.read(layer, "fill") as Extract<Fill, { stops: unknown }>;
    // The circle is 190px: 38px is 20% out, before a new stop at 25%.
    const changed: Fill = { ...page, stops: [{ ...page.stops[0], color: "#00FF00" }, page.stops[1], { color: "#FFFFFF", opacity: 1, position: 25, unit: "%" }] };

    editor.set(layer, "fill", changed);
    expect(style(box).backgroundImage).toBe(
      "radial-gradient(circle farthest-side at calc(100% - 10px) calc(100% - 20px), rgb(0, 255, 0) 38px, rgb(255, 255, 255) 25%, rgb(0, 0, 255) 100%)",
    );
    expect(changes.list()[0].style["background-image"]).toBe(
      "radial-gradient(circle farthest-side at calc(100% - 10px) calc(100% - 20px), rgb(0 255 0 / 1) 38px, rgb(255 255 255 / 1) 25%, rgb(0 0 255 / 1) 100%)",
    );
    expect(editor.read(layer, "fill")).toEqual({ ...changed, stops: [changed.stops[0], changed.stops[2], changed.stops[1]] });
  });

  test("a radial gradient paints at its center and size, its stops in their own units, and reads back as set", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.width = "200px";
    box.style.height = "100px";
    const layer = layerOf(box);
    const spot: Fill = {
      type: "radial",
      center: { x: { value: 30, unit: "%" }, y: { value: 20, unit: "px" } },
      size: { x: { value: 20, unit: "px" }, y: { value: 20, unit: "px" } },
      stops: [
        { color: "#FF0000", opacity: 1, position: 10, unit: "px" },
        { color: "#0000FF", opacity: 1, position: 100, unit: "%" },
      ],
    };

    editor.set(layer, "fill", spot);
    expect(style(box).backgroundImage).toBe("radial-gradient(20px at 30% 20px, rgb(255, 0, 0) 10px, rgb(0, 0, 255) 100%)");
    expect(changes.list()[0].style["background-image"]).toBe("radial-gradient(circle 20px at 30% 20px, rgb(255 0 0 / 1) 10px, rgb(0 0 255 / 1) 100%)");
    expect(editor.read(layer, "fill")).toEqual(spot);

    // A size and center by keyword, and the default ones, as CSS leaves them out.
    const keyword: Fill = { ...spot, center: { x: { value: 50, unit: "%" }, y: { value: 50, unit: "%" } }, size: { extent: "farthest-side", circle: false } };
    editor.set(layer, "fill", keyword);
    expect(style(box).backgroundImage).toBe("radial-gradient(farthest-side, rgb(255, 0, 0) 10px, rgb(0, 0, 255) 100%)");
    expect(editor.read(layer, "fill")).toEqual(keyword);
    const ellipse: Fill = { ...keyword, size: { x: { value: 50, unit: "%" }, y: { value: 30, unit: "px" } } };
    editor.set(layer, "fill", ellipse);
    expect(style(box).backgroundImage).toBe("radial-gradient(50% 30px, rgb(255, 0, 0) 10px, rgb(0, 0, 255) 100%)");
    expect(editor.read(layer, "fill")).toEqual(ellipse);
  });

  test("a conic gradient is shown, not edited: no other fill replaces it from the panel, and none is set", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.backgroundImage = "conic-gradient(red, blue)";
    const conic = editor.read(layerOf(box), "fill");

    expect(editor.can(layerOf(box), "fill")).toBe(true);
    expect(editor.can(layerOf(box), "fill", conic)).toBe(false);
  });

  test("a gradient set over a page's gradient, and a color set back over it, replace it; undo brings the page's back", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.backgroundImage = "radial-gradient(circle, red, blue)";
    const layer = layerOf(box);

    editor.set(layer, "fill", { ...sunset, angle: 45 });
    expect(style(box).backgroundImage).toBe("linear-gradient(45deg, rgb(255, 0, 0) 0%, rgba(0, 0, 255, 0.5) 100%)");
    // The page's color under its gradient stays, as it shows through.
    expect(style(box).backgroundColor).toBe("rgb(0, 0, 0)");
    expect(Object.keys(changes.list()[0].style)).toEqual(["background-image"]);
    expect(changes.list()[0].sources!.flatMap((source) => source.properties)).toEqual(["background-color", "background-image"]);

    editor.set(layer, "fill", { type: "solid", color: "#00FF00", opacity: 1 });
    expect([style(box).backgroundImage, style(box).backgroundColor]).toEqual(["none", "rgb(0, 255, 0)"]);
    expect(changes.list()[0].style).toEqual({ "background-color": "rgb(0 255 0 / 1)", "background-image": "none" });

    editor.undo();
    editor.undo();
    expect([style(box).backgroundImage, style(box).backgroundColor]).toEqual(["radial-gradient(circle, rgb(255, 0, 0), rgb(0, 0, 255))", "rgb(0, 0, 0)"]);
  });
});

describe("stroke", () => {
  test("a stroke on every side, then on some sides, dashed, then none: each paints every instance and reads back as set", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    const card = layerOf(cards[0]);
    const borders = (el: Element) => {
      const s = style(el);
      return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth, s.borderTopStyle, s.borderTopColor].join(" ");
    };

    expect(editor.read(card, "stroke")).toBeNull();

    const stroke = { color: "#E5E7EB", opacity: 1, weight: 2, style: "solid" } as const;
    editor.set(card, "stroke", stroke);
    expect(cards.map(borders)).toEqual([
      ...Array(3).fill("2px 2px 2px 2px solid rgb(229, 231, 235)"),
      "0px 0px 0px 0px none rgb(0, 0, 0)",
    ]);
    expect(editor.read(layerOf(cards[2]), "stroke")).toEqual(stroke);

    const sides: Stroke = { color: "#FF0000", opacity: 0.5, weight: [0, 0, 1, 4], style: "dashed" };
    editor.set(card, "stroke", sides);
    expect(borders(cards[1])).toBe("0px 0px 1px 4px dashed rgba(255, 0, 0, 0.5)");
    expect(editor.read(card, "stroke")).toEqual(sides);
    expect(changes.list()[0]).toMatchObject({
      property: "stroke",
      before: null,
      after: sides,
      style: { "border-width": "0px 0px 1px 4px", "border-style": "dashed", "border-color": "rgb(255 0 0 / 0.5)" },
    });

    editor.set(card, "stroke", null);
    expect(borders(cards[1])).toBe("0px 0px 0px 0px none rgb(0, 0, 0)");
    expect(changes.list()).toEqual([]);
  });

  test("the page's own borders read as one stroke: the color of the first side drawn, a side with no line as 0", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    const read = (css: string) => {
      box.style.cssText = `height: 40px; ${css}`;
      return editor.read(layerOf(box), "stroke");
    };

    // Tailwind's preflight: every element has a solid border of 0.
    expect(read("border: 0 solid #e5e7eb")).toBeNull();
    expect(read("border: 1px solid oklch(92.8% 0.006 264.531)")).toEqual({ color: "#E5E7EB", opacity: 1, weight: 1, style: "solid" });
    expect(read("border-bottom: 2px dotted blue; border-top: 3px none red")).toEqual({ color: "#0000FF", opacity: 1, weight: [0, 0, 2, 0], style: "dashed" });
  });

  test("the page's own weight reads as the style that sets it writes it, though a 1x screen draws it narrower; through var(), as drawn", () => {
    const { doc, editor, layerOf } = openCanvas();
    doc.head.insertAdjacentHTML(
      "beforeend",
      `<style>
        .half { border: 1.5px solid red }
        .sides { border-style: solid; border-color: red; border-width: 0 0 0.5px 2.5px }
        .through { --w: 1.5px; border: var(--w) solid red }
      </style>`,
    );
    const box = doc.getElementById("unmarked")!;
    const read = (className: string, css = "") => {
      box.className = className;
      box.style.cssText = `height: 40px; ${css}`;
      return editor.read(layerOf(box), "stroke");
    };
    const red = { color: "#FF0000", opacity: 1, style: "solid" };

    expect(read("half")).toEqual({ ...red, weight: 1.5 });
    // A 1x screen: whole pixels.
    expect(style(box).borderTopWidth).toBe("1px");
    expect(read("sides")).toEqual({ ...red, weight: [0, 0, 0.5, 2.5] });
    expect(read("half", "border-width: 2.5px")).toEqual({ ...red, weight: 2.5 });
    expect(read("through")).toEqual({ ...red, weight: 1 });
  });

  test("through a design variable in a shorthand, a rule below it that writes px is not taken for what sets the weight: it reads as drawn, and is the source", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    doc.head.insertAdjacentHTML("beforeend", "<style>.half { border: 1.5px solid red } .through { --w: 1px; border: var(--w) solid red }</style>");
    const box = doc.getElementById("unmarked")!;
    box.className = "half through";
    const layer = layerOf(box);

    expect(editor.read(layer, "stroke")).toEqual({ color: "#FF0000", opacity: 1, weight: 1, style: "solid" });
    editor.set(layer, "stroke", { color: "#FF0000", opacity: 1, weight: 2, style: "solid" });
    expect(changes.list()[0].sources).toMatchObject([{ kind: "rule", selector: ".through", declaration: "border: var(--w) solid red" }]);
  });

  test("a side written by a logical property in a later rule reads as written there; right to left, inline-start is the right", () => {
    const { doc, editor, layerOf } = openCanvas();
    doc.head.insertAdjacentHTML("beforeend", "<style>.all { border: 1px solid red } .x { border-inline-width: 1.5px }</style>");
    const box = doc.getElementById("unmarked")!;
    const layer = layerOf(box);
    const red = { color: "#FF0000", opacity: 1, style: "solid" };

    box.className = "all x";
    expect(editor.read(layer, "stroke")).toEqual({ ...red, weight: [1, 1.5, 1, 1.5] });
    box.className = "all";
    box.dir = "rtl";
    box.style.setProperty("border-inline-start-width", "2.5px");
    expect(editor.read(layer, "stroke")).toEqual({ ...red, weight: [1, 2.5, 1, 1] });
  });

  test("a weight set this round reads back as set, though a 1x screen draws it narrower", () => {
    const { editor, cards, layerOf } = openCanvas();
    const stroke: Stroke = { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" };

    editor.set(layerOf(cards[0]), "stroke", stroke);

    expect(style(cards[1]).borderTopWidth).toBe("1px");
    expect(editor.read(layerOf(cards[1]), "stroke")).toEqual(stroke);
  });

  test("a change to the color or line alone leaves the weight out of its reference style, so the code keeps its own", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    doc.head.insertAdjacentHTML("beforeend", "<style>.half { border: 1.5px solid red } .through { --w: 1.5px; border: var(--w) solid red }</style>");
    const box = doc.getElementById("unmarked")!;
    box.className = "half";
    const layer = layerOf(box);
    const page = editor.read(layer, "stroke")!;

    editor.set(layer, "stroke", { ...page, color: "#0000FF" });
    editor.set(layer, "stroke", { ...page, color: "#0000FF", style: "dashed" });
    expect(changes.list()[0].style).toEqual({ "border-style": "dashed", "border-color": "rgb(0 0 255 / 1)" });
    expect(style(box).borderTopColor).toBe("rgb(0, 0, 255)");

    // The weight changed too, then back: the weight is left out again.
    editor.set(layer, "stroke", { ...page, color: "#0000FF", weight: 3 });
    expect(changes.list()[0].style).toMatchObject({ "border-width": "3px" });
    editor.set(layer, "stroke", { ...page, color: "#0000FF" });
    expect(changes.list()[0].style).toEqual({ "border-style": "solid", "border-color": "rgb(0 0 255 / 1)" });
    expect(style(box).borderTopWidth).toBe("1px");

    // Through var(): the weight reads as drawn, and is left out all the same.
    editor.undo();
    editor.undo();
    editor.undo();
    editor.undo();
    expect(changes.list()).toEqual([]);
    box.className = "through";
    editor.set(layer, "stroke", { ...editor.read(layer, "stroke")!, color: "#0000FF" });
    expect(changes.list()[0].style).toEqual({ "border-style": "solid", "border-color": "rgb(0 0 255 / 1)" });
  });

  test("on some sides only, a change to the color alone gives the line to those sides only: the others are not drawn at the default width", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.cssText = "height: 40px; border-bottom: 1.5px solid #eeeeee";
    const layer = layerOf(box);

    editor.set(layer, "stroke", { ...editor.read(layer, "stroke")!, color: "#0000FF" });

    expect(changes.list()[0].style).toEqual({ "border-bottom-style": "solid", "border-color": "rgb(0 0 255 / 1)" });
  });

  test("text and locked layers offer no stroke", () => {
    const { doc, editor, cards, layerOf } = openCanvas();

    expect(editor.can(layerOf(cards[0]), "stroke")).toBe(true);
    expect(editor.can(layerOf(doc.querySelector("h3")!), "stroke")).toBe(false);
    expect(editor.can(layerOf(doc.querySelector("span")!), "stroke")).toBe(false);
  });
});

describe("shadows", () => {
  const drop: Shadow = { type: "drop", x: 0, y: 4, blur: 4, spread: 0, color: "#000000", opacity: 0.25 };
  const inner: Shadow = { type: "inner", x: 2, y: -1, blur: 0, spread: 3, color: "#FF0000", opacity: 1 };

  test("drop and inner shadows, several at once, paint every instance in their order and read back as set; none takes them off", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    const card = layerOf(cards[0]);

    expect(editor.read(card, "shadows")).toEqual([]);

    editor.set(card, "shadows", [drop, inner]);
    expect(cards.map((el) => style(el).boxShadow)).toEqual([
      ...Array(3).fill("rgba(0, 0, 0, 0.25) 0px 4px 4px 0px, rgb(255, 0, 0) 2px -1px 0px 3px inset"),
      "none",
    ]);
    expect(editor.read(layerOf(cards[2]), "shadows")).toEqual([drop, inner]);
    expect(changes.list()[0]).toMatchObject({
      property: "shadows",
      before: [],
      after: [drop, inner],
      style: { "box-shadow": "0px 4px 4px 0px rgb(0 0 0 / 0.25), inset 2px -1px 0px 3px rgb(255 0 0 / 1)" },
    });

    editor.set(card, "shadows", []);
    expect(style(cards[1]).boxShadow).toBe("none");
    expect(changes.list()).toEqual([]);
  });

  test("the page's own shadows read in their order; Tailwind's empty shadows, there to compose with, are left out", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    const read = (css: string) => {
      box.style.boxShadow = css;
      return editor.read(layerOf(box), "shadows");
    };

    // Tailwind v4's shadow-sm, after its inset, ring and ring-offset shadows, unset.
    expect(read("0 0 #0000, 0 0 #0000, 0 0 #0000, 0 0 #0000, 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)")).toEqual([
      { type: "drop", x: 0, y: 1, blur: 3, spread: 0, color: "#000000", opacity: 0.1 },
      { type: "drop", x: 0, y: 1, blur: 2, spread: -1, color: "#000000", opacity: 0.1 },
    ]);
    expect(read("inset 0 2px 4px oklch(62.8% 0.2577 29.23)")).toEqual([{ type: "inner", x: 0, y: 2, blur: 4, spread: 0, color: "#FF0000", opacity: 1 }]);
    // A ring is a shadow spread out with no blur; its offset, 0px wide in white, draws nothing.
    expect(read("0 0 0 0px #fff, 0 0 0 2px blue")).toEqual([{ type: "drop", x: 0, y: 0, blur: 0, spread: 2, color: "#0000FF", opacity: 1 }]);
  });
});

describe("text shadows", () => {
  const drop: Shadow = { type: "drop", x: 0, y: 4, blur: 4, spread: 0, color: "#000000", opacity: 0.25 };
  const red: Shadow = { type: "drop", x: 2, y: -1, blur: 0, spread: 0, color: "#FF0000", opacity: 1 };

  test("a text layer's drop shadows, several at once, paint every instance as text-shadow in their order and read back as set; none takes them off", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const titles = [...doc.querySelectorAll("h3")];
    const title = layerOf(titles[0]);

    expect(editor.can(title, "shadows")).toBe(false);
    expect(editor.read(title, "textShadows")).toEqual([]);

    editor.set(title, "textShadows", [drop, red]);
    expect(titles.map((el) => style(el).textShadow)).toEqual([...Array(3).fill("rgba(0, 0, 0, 0.25) 0px 4px 4px, rgb(255, 0, 0) 2px -1px 0px"), "none"]);
    expect(style(titles[0]).boxShadow).toBe("none");
    expect(editor.read(layerOf(titles[2]), "textShadows")).toEqual([drop, red]);
    expect(changes.list()[0]).toMatchObject({
      property: "textShadows",
      before: [],
      after: [drop, red],
      style: { "text-shadow": "0px 4px 4px rgb(0 0 0 / 0.25), 2px -1px 0px rgb(255 0 0 / 1)" },
    });

    editor.set(title, "textShadows", []);
    expect(style(titles[1]).textShadow).toBe("none");
    expect(changes.list()).toEqual([]);
  });

  test("only text layers have text shadows, and they take no inner shadow and no spread", () => {
    const { doc, editor, cards, layerOf } = openCanvas();
    const title = layerOf(doc.querySelector("h3")!);

    expect(editor.can(layerOf(cards[0]), "textShadows")).toBe(false);
    expect(editor.can(title, "textShadows", [drop])).toBe(true);
    expect(editor.can(title, "textShadows", [{ ...drop, type: "inner" }])).toBe(false);
    expect(editor.can(title, "textShadows", [{ ...drop, spread: 2 }])).toBe(false);
  });

  test("the page's own text-shadow reads as drop shadows in their order; one that draws nothing is left out", () => {
    const { doc, editor, layerOf } = openCanvas();
    const el = doc.querySelector("h3")!;
    const read = (css: string) => {
      el.style.textShadow = css;
      return editor.read(layerOf(el), "textShadows");
    };

    expect(read("0 1px 2px rgb(0 0 0 / 0.1), 1px 1px oklch(62.8% 0.2577 29.23)")).toEqual([
      { type: "drop", x: 0, y: 1, blur: 2, spread: 0, color: "#000000", opacity: 0.1 },
      { type: "drop", x: 1, y: 1, blur: 0, spread: 0, color: "#FF0000", opacity: 1 },
    ]);
    expect(read("0 0 #0000, 0 0 3px blue")).toEqual([{ type: "drop", x: 0, y: 0, blur: 3, spread: 0, color: "#0000FF", opacity: 1 }]);
  });
});

/**
 * Text set in each way a page writes line height and letter spacing: on the
 * body (inherited), and on the text itself in each unit.
 */
const TEXT_PAGE = `<!DOCTYPE html>
<style>
  body { margin: 0; font: 16px Georgia, serif; line-height: 1.5; letter-spacing: 0.02em }
  #percent { line-height: 150% }
  #em { line-height: 1.25em; letter-spacing: 0.1em }
  #rem { line-height: 1.5rem; letter-spacing: 0.125rem }
  #px { line-height: 30px; letter-spacing: 1px }
  #normal { line-height: normal; letter-spacing: normal }
</style>
<body>
  <p id="inherited">Inherited</p>
  <h1 id="big" style="font-size: 32px">Big</h1>
  <p id="percent">Percent</p>
  <p id="em">Em</p>
  <p id="rem">Rem</p>
  <p id="px">Px</p>
  <p id="normal">Normal</p>
</body>`;

/**
 * Fonts the page loads (one face it never uses), and stacks of fonts it uses
 * on text, one of which asks first for a font that is not there.
 */
const FONT_PAGE = `<!DOCTYPE html>
<style>
  @font-face { font-family: Brand; src: local("Arial"); font-weight: 400 700 }
  @font-face { font-family: Brand; src: local("Arial Black"); font-weight: 900 }
  @font-face { font-family: Unused; src: local("Arial") }
  body { margin: 0; font: 16px "No Such Font", Georgia, serif }
</style>
<body>
  <h1 style="font-family: Brand, sans-serif; font-weight: 400">Brand</h1>
  <h2 style="font-family: Brand, sans-serif; font-weight: 900">Heavy</h2>
  <p>Body <code style="font-family: 'Courier New', monospace">x</code></p>
  <h3>Bold body</h3>
  <pre style="font-family: Menlo, monospace">code</pre>
</body>`;

describe("text", () => {
  test("line height and letter spacing read in px or as % of the font size, as the page writes them, and are written in the page's unit", () => {
    const { doc, editor, changes, layerOf } = openCanvas(TEXT_PAGE);
    const text = (id: string) => layerOf(doc.getElementById(id)!);
    const read = (id: string) => [editor.read(text(id), "lineHeight"), editor.read(text(id), "letterSpacing")];
    const percent = (value: number) => ({ value, unit: "%" as const });
    const px = (value: number) => ({ value, unit: "px" as const });

    // A line height without a unit, and one in % or em, is a share of the font size; one in px or rem a length.
    expect(read("inherited")).toEqual([percent(150), percent(2)]);
    // Inherited in em, the letter spacing is the body's, in px, against this text's own size.
    expect(read("big")).toEqual([percent(150), percent(1)]);
    expect(read("percent")).toEqual([percent(150), percent(2)]);
    expect(read("em")).toEqual([percent(125), percent(10)]);
    expect(read("rem")).toEqual([px(24), px(2)]);
    expect(read("px")).toEqual([px(30), px(1)]);
    expect(read("normal")).toEqual(["auto", percent(0)]);

    const written = (id: string, property: "lineHeight" | "letterSpacing", value: PropertyValues["lineHeight"]) => {
      editor.set(text(id), property, value as never);
      expect(editor.read(text(id), property)).toEqual(value);
      const css = property === "lineHeight" ? "line-height" : "letter-spacing";
      // The reference style is what the canvas shows.
      const change = changes.list().find((c) => c.layer === text(id).el.getAttribute("data-vk-layer") && c.property === property)!;
      expect(change.style).toEqual({ [css]: (doc.getElementById(id) as HTMLElement).style.getPropertyValue(css) });
      return change.style[css];
    };
    expect(written("inherited", "lineHeight", percent(160))).toBe("1.6");
    expect(written("percent", "lineHeight", percent(120))).toBe("120%");
    expect(written("em", "lineHeight", percent(140))).toBe("1.4em");
    expect(written("rem", "lineHeight", px(32))).toBe("2rem");
    expect(written("px", "lineHeight", px(28))).toBe("28px");
    expect(written("rem", "lineHeight", "auto")).toBe("normal");
    expect(written("big", "letterSpacing", percent(5))).toBe("0.05em");
    expect(written("rem", "letterSpacing", px(4))).toBe("0.25rem");
    expect(written("px", "letterSpacing", px(-0.5))).toBe("-0.5px");

    // A value in the other unit, as Figma has it: % of the font size without a unit, px in px.
    expect(written("px", "lineHeight", percent(150))).toBe("1.5");
    expect(written("em", "lineHeight", px(18))).toBe("18px");
    expect(written("px", "letterSpacing", percent(-2))).toBe("-0.02em");
    expect(written("em", "letterSpacing", px(3))).toBe("3px");
    expect(written("normal", "lineHeight", px(20))).toBe("20px");
    expect(doc.getElementById("normal")!.getBoundingClientRect().height).toBe(20);
  });

  test("inline fragments follow the text layer; those with a value of their own keep it, and the change says which", () => {
    const { doc, editor, changes, layerOf } = openCanvas(`<!DOCTYPE html>
      <body style="margin: 0; font-size: 16px">
        <p id="text" style="color: rgb(0, 0, 0)">Read <strong style="color: rgb(255, 0, 0)">this</strong>, <a href="#" class="link" style="color: rgb(0, 0, 255)">a link</a>, <code style="font-size: 12px">code</code> and <em style="font-size: 0.75em">so <b style="font-weight: 900">on</b></em>.</p>
      </body>`);
    const p = doc.getElementById("text")!;
    const text = layerOf(p);
    const fragment = (selector: string) => style(p.querySelector(selector)!);
    const keeps = (property: string) => changes.list().find((change) => change.property === property)?.keeps;

    // A size of its own in em follows the text's, at its share of it; one in px is kept.
    editor.set(text, "fontSize", 20);
    expect(["strong", "a", "code", "em", "b"].map((s) => fragment(s).fontSize)).toEqual(["20px", "20px", "12px", "15px", "15px"]);
    expect(keeps("fontSize")).toEqual([{ element: "<code>", text: "code", value: 12 }]);

    // A fragment with a color of its own keeps it, even one that is the color the text is given.
    editor.set(text, "textColor", { color: "#FF0000", opacity: 1 });
    expect(["strong", "a", "b"].map((s) => fragment(s).color)).toEqual(["rgb(255, 0, 0)", "rgb(0, 0, 255)", "rgb(255, 0, 0)"]);
    expect(keeps("textColor")).toEqual([
      { element: "<strong>", text: "this", value: { color: "#FF0000", opacity: 1 } },
      { element: '<a class="link">', text: "a link", value: { color: "#0000FF", opacity: 1 } },
    ]);

    // Decorations are drawn across the fragments: a link's own underline is kept only where it differs.
    editor.set(text, "textDecoration", "underline");
    expect(keeps("textDecoration")).toBeUndefined();
    editor.set(text, "textDecoration", "strikethrough");
    expect(keeps("textDecoration")).toEqual([{ element: '<a class="link">', text: "a link", value: "underline" }]);
    editor.set(text, "textDecoration", "underline");
    expect(keeps("textDecoration")).toBeUndefined();

    // A bold run is bolder than the text around it, whatever its weight: it follows. A weight of its own is kept.
    editor.set(text, "fontWeight", 300);
    expect(fragment("strong").fontWeight).toBe("400");
    expect(keeps("fontWeight")).toEqual([{ element: "<b>", text: "on", value: 900 }]);
    editor.set(text, "letterSpacing", { value: 1, unit: "px" });
    expect(fragment("code").letterSpacing).toBe("1px");
    expect(keeps("letterSpacing")).toBeUndefined();
    // The text is as it was, after looking at how its fragments follow it.
    expect(p.style.getPropertyValue("font-weight")).toBe("300");
  });

  test("the fonts offered are those the page has loaded, each with its loaded weights, and the first font of each stack the page uses that is there", async () => {
    const { doc } = openCanvas(FONT_PAGE);
    await doc.fonts.ready;

    expect(fontsOf(doc)).toEqual([
      // Its faces from 400 to 700, as a variable font has them, and a 900 of its own.
      { family: "Brand", weights: [400, 500, 600, 700, 900] },
      // Where the page asks for a font that is not there, the one it falls back to: in the weights the page uses it in.
      { family: "Courier New", weights: [400] },
      { family: "Georgia", weights: [400, 700] },
      { family: "Menlo", weights: [400] },
    ]);
  });

  test("a text layer's font is the first of its stack that is there; changed, it takes the stack the page uses that font in", async () => {
    const { doc, editor, changes, layerOf } = openCanvas(FONT_PAGE);
    await doc.fonts.ready;
    const text = (selector: string) => layerOf(doc.querySelector(selector)!);

    expect(editor.read(text("h1"), "fontFamily")).toBe("Brand");
    expect(editor.read(text("p"), "fontFamily")).toBe("Georgia");

    editor.set(text("p"), "fontFamily", "Menlo");
    expect(style(doc.querySelector("p")!).fontFamily).toBe("Menlo, monospace");
    expect(editor.read(text("p"), "fontFamily")).toBe("Menlo");
    expect(changes.list()[0]).toMatchObject({ property: "fontFamily", before: "Georgia", after: "Menlo", style: { "font-family": "Menlo, monospace" } });
    // Code in the text has a font of its own.
    expect(changes.list()[0].keeps).toEqual([{ element: "<code>", text: "x", value: "Courier New" }]);

    editor.set(text("p"), "fontFamily", "Brand");
    expect(changes.list()[0].style).toEqual({ "font-family": "Brand, sans-serif" });
  });

  test("what sets an inherited text style is the rule on the element it is inherited from; one not inherited, its own", () => {
    const { doc, editor, changes, layerOf } = openCanvas(TEXT_PAGE);
    const text = layerOf(doc.getElementById("inherited")!);

    editor.set(text, "lineHeight", { value: 200, unit: "%" });
    editor.set(text, "textDecoration", "underline");

    const [lineHeight, decoration] = changes.list();
    expect(lineHeight.sources).toEqual([expect.objectContaining({ kind: "rule", selector: "body", declaration: "line-height: 1.5" })]);
    expect(decoration.sources).toEqual([expect.objectContaining({ kind: "none" })]);
  });

  test("a text layer's font size paints every instance in px, reads back as set, and is offered on text only", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();
    const titles = [...doc.querySelectorAll("h3")];
    const title = layerOf(titles[0]);

    expect(editor.can(layerOf(cards[0]), "fontSize")).toBe(false);
    expect(editor.read(title, "fontSize")).toBe(18.72);

    editor.set(title, "fontSize", 24);
    expect(titles.map((el) => style(el).fontSize)).toEqual(["24px", "24px", "24px", "18.72px"]);
    expect(editor.read(layerOf(titles[1]), "fontSize")).toBe(24);
    expect(changes.list()[0]).toMatchObject({ property: "fontSize", before: 18.72, after: 24, style: { "font-size": "24px" } });
  });

  test("weight, color, alignment, case and decoration paint every instance, read back as set, and record the CSS that shows them", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const titles = [...doc.querySelectorAll("h3")];
    const title = layerOf(titles[0]);

    expect([
      editor.read(title, "fontWeight"),
      editor.read(title, "textColor"),
      editor.read(title, "textAlign"),
      editor.read(title, "textCase"),
      editor.read(title, "textDecoration"),
    ]).toEqual([700, { color: "#000000", opacity: 1 }, "left", "none", "none"]);

    editor.set(title, "fontWeight", 300);
    editor.set(title, "textColor", { color: "#FF0000", opacity: 0.5 });
    editor.set(title, "textAlign", "center");
    editor.set(title, "textCase", "title");
    editor.set(title, "textDecoration", "strikethrough");

    const [second, other] = [titles[2], titles[3]].map(style);
    expect([second.fontWeight, second.color, second.textAlign, second.textTransform, second.textDecorationLine]).toEqual([
      "300",
      "rgba(255, 0, 0, 0.5)",
      "center",
      "capitalize",
      "line-through",
    ]);
    expect([other.fontWeight, other.textAlign, other.textTransform]).toEqual(["700", "start", "none"]);
    const again = layerOf(titles[1]);
    expect([
      editor.read(again, "fontWeight"),
      editor.read(again, "textColor"),
      editor.read(again, "textAlign"),
      editor.read(again, "textCase"),
      editor.read(again, "textDecoration"),
    ]).toEqual([300, { color: "#FF0000", opacity: 0.5 }, "center", "title", "strikethrough"]);
    expect(changes.list().map(({ property, style }) => [property, style])).toEqual([
      ["fontWeight", { "font-weight": "300" }],
      ["textColor", { color: "rgb(255 0 0 / 0.5)" }],
      ["textAlign", { "text-align": "center" }],
      ["textCase", { "text-transform": "capitalize" }],
      ["textDecoration", { "text-decoration-line": "line-through" }],
    ]);

    // Upper and lower case, an underline, right and justified, each in its CSS word.
    for (const [property, value, css] of [
      ["textCase", "upper", "uppercase"],
      ["textCase", "lower", "lowercase"],
      ["textDecoration", "underline", "underline"],
      ["textAlign", "right", "right"],
      ["textAlign", "justify", "justify"],
    ] as const) {
      editor.set(title, property, value);
      expect(editor.read(title, property)).toBe(value);
      expect(Object.values(changes.list().find((change) => change.property === property)!.style)).toEqual([css]);
    }
  });

  test("the page's own alignment, case and decoration read in design language", () => {
    const { doc, editor, layerOf } = openCanvas();
    const el = doc.querySelector("h3")! as HTMLElement;
    const read = (css: Partial<CSSStyleDeclaration>) => {
      Object.assign(el.style, css);
      const title = layerOf(el);
      return [editor.read(title, "textAlign"), editor.read(title, "textCase"), editor.read(title, "textDecoration")];
    };

    expect(read({ textAlign: "end", textTransform: "uppercase", textDecoration: "underline line-through" })).toEqual(["right", "upper", "underline"]);
    expect(read({ textAlign: "-webkit-center", textTransform: "lowercase", textDecoration: "line-through" })).toEqual(["center", "lower", "strikethrough"]);
    expect(read({ direction: "rtl", textAlign: "start", textTransform: "none", textDecoration: "overline" })).toEqual(["right", "none", "none"]);
  });
});

describe("blurs", () => {
  test("a layer blur and a background blur, added and taken off, paint every instance and read back as set", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    const card = layerOf(cards[0]);

    expect([editor.read(card, "layerBlur"), editor.read(card, "backgroundBlur")]).toEqual([null, null]);

    editor.set(card, "layerBlur", 4);
    editor.set(card, "backgroundBlur", 12);
    expect(cards.map((el) => `${style(el).filter} ${style(el).backdropFilter}`)).toEqual([...Array(3).fill("blur(4px) blur(12px)"), "none none"]);
    expect([editor.read(layerOf(cards[1]), "layerBlur"), editor.read(layerOf(cards[1]), "backgroundBlur")]).toEqual([4, 12]);
    expect(changes.list().map(({ property, before, after, style }) => ({ property, before, after, style }))).toEqual([
      { property: "layerBlur", before: null, after: 4, style: { filter: "blur(4px)" } },
      { property: "backgroundBlur", before: null, after: 12, style: { "backdrop-filter": "blur(12px)" } },
    ]);

    editor.set(card, "layerBlur", null);
    editor.set(card, "backgroundBlur", null);
    expect(`${style(cards[1]).filter} ${style(cards[1]).backdropFilter}`).toBe("none none");
    expect(changes.list()).toEqual([]);
  });

  test("a blur among the page's other filters is changed in its place, and they stay", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.filter = "grayscale(1) blur(2px) brightness(0.5)";
    box.style.backdropFilter = "saturate(2)";
    const layer = layerOf(box);

    expect([editor.read(layer, "layerBlur"), editor.read(layer, "backgroundBlur")]).toEqual([2, null]);

    editor.set(layer, "layerBlur", 6);
    editor.set(layer, "backgroundBlur", 8);
    expect([style(box).filter, style(box).backdropFilter]).toEqual(["grayscale(1) blur(6px) brightness(0.5)", "saturate(2) blur(8px)"]);

    editor.set(layer, "layerBlur", null);
    expect(style(box).filter).toBe("grayscale(1) brightness(0.5)");
    expect(changes.list().find((change) => change.property === "layerBlur")).toMatchObject({ before: 2, after: null, style: { filter: "grayscale(1) brightness(0.5)" } });
  });

  test("a layer whose filter blurs twice offers no layer blur, which could not be read as one", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.filter = "blur(2px) blur(3px)";

    expect(editor.can(layerOf(box), "layerBlur")).toBe(false);
    expect(editor.can(layerOf(box), "backgroundBlur")).toBe(true);
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

  test("a layer painted with an image, or with layers of background, offers no fill; one gradient is a fill", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    const offers = (image: string) => {
      box.style.backgroundImage = image;
      return editor.can(layerOf(box), "fill");
    };

    expect(offers("url(data:image/gif;base64,R0lGODlhAQABAAAAACw=)")).toBe(false);
    expect(offers("linear-gradient(red, blue), linear-gradient(green, white)")).toBe(false);
    expect(offers("repeating-linear-gradient(red 0 10px, blue 10px 20px)")).toBe(false);
    expect(offers("linear-gradient(red, blue)")).toBe(true);
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
    const saved = { canvas: serializeCanvas({ document: opened.doc, width: 800, height: 600, scrollY: 0 }), changeSet: changes.save() };

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
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, scrollY: 0 }), changeSet: changes.save() };

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
    const saved = { canvas: serializeCanvas({ document: opened.doc, width: 800, height: 600, scrollY: 0 }), changeSet: opened.changes.save() };

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

    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, scrollY: 0 }), changeSet: changes.save() };
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
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, scrollY: 0 }), changeSet: changes.save() };

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
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, scrollY: 0 }), changeSet: changes.save() };

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
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, scrollY: 0 }), changeSet: changes.save() };
    const reverted = new DOMParser().parseFromString(revertSaved(saved, saved.changeSet.changes[0].id)!.canvas, "text/html");
    expect([...reverted.querySelectorAll("article")].map((card) => card.style.display)).toEqual(["none", "", "", ""]);

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

    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, scrollY: 0 }), changeSet: changes.save() };
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

describe("text styles are checked on the live page", () => {
  test("a line height and a font size show as the Agent writes them in the project's own units", async () => {
    const { doc, editor, changes, layerOf } = openCanvas(STRUCTURE);
    const one = layerOf(doc.getElementById("one")!);
    editor.set(one, "lineHeight", { value: 150, unit: "%" });
    editor.set(one, "fontSize", 20);
    live = document.createElement("iframe");
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(STRUCTURE.replace('style="margin: 0">One', 'style="margin: 0; line-height: 150%; font-size: 1.25rem">One'));
    page.close();

    expect(await checkChange(page, changes.list()[0])).toEqual({ outcome: "shown" });
    expect(await checkChange(page, changes.list()[1])).toEqual({ outcome: "shown" });
  });
});

describe("a stroke is checked on the live page as the code writes it, else as the browser draws it", () => {
  /** The canvas, edited; and the live page, as the page is, its board as the Agent writes its border in the code. */
  const open = () => {
    const canvas = openCanvas(STRUCTURE);
    live = document.createElement("iframe");
    live.style.width = "800px";
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(STRUCTURE);
    page.close();
    const board = canvas.layerOf(canvas.doc.getElementById("board")!);
    const write = (css: string) => (page.getElementById("board")!.style.cssText = `width: 300px; height: 100px; ${css}`);
    return { ...canvas, page, board, write };
  };
  const check = async (page: Document, change: Parameters<typeof checkChange>[1]) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const result = checkChange(page, change);
      vi.advanceTimersByTime(CHECK_SETTLE_MS);
      return await result;
    } finally {
      vi.useRealTimers();
    }
  };

  test("1.5px written in the code is shown, though a 1x screen draws it 1px; 3px is not, and says so", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
    const [change] = changes.list();

    write("border: 1.5px solid #ff0000");
    expect(getComputedStyle(page.getElementById("board")!).borderTopWidth).toBe("1px");
    expect(await check(page, change)).toEqual({ outcome: "shown" });

    write("border: 3px solid #ff0000");
    expect(await check(page, change)).toEqual({ outcome: "not shown", actual: { color: "#FF0000", opacity: 1, weight: 3, style: "solid" } });
  });

  test("the weight the code writes is compared first: 1px or 1.25px is not 1.5px, though a 1x screen draws all three 1px", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
    const [change] = changes.list();

    write("border: 1px solid #ff0000");
    expect(await check(page, change)).toEqual({ outcome: "not shown", actual: { color: "#FF0000", opacity: 1, weight: 1, style: "solid" } });
    write("border: 1.25px solid #ff0000");
    expect(await check(page, change)).toEqual({ outcome: "not shown", actual: { color: "#FF0000", opacity: 1, weight: 1.25, style: "solid" } });
  });

  test("while the dev server brings the edit in, each change to the page is looked at once: still wrong, then right", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
    const [change] = changes.list();
    write("border: 1px solid #ff0000");

    const result = checkChange(page, change);
    write("border: 3px solid #ff0000");
    await new Promise((resolve) => setTimeout(resolve, 20));
    write("border: 1.5px solid #ff0000");

    expect(await result).toEqual({ outcome: "shown" });
  });

  test("written through a design variable, it is compared as the page draws it", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
    const [change] = changes.list();

    write("--stroke: 1.5px; border: var(--stroke) solid #ff0000");
    expect(await check(page, change)).toEqual({ outcome: "shown" });
  });

  test("written through a design variable in a shorthand, a rule below it that writes px is not taken for the code: compared as drawn", async () => {
    const { page, editor, changes, board, write } = open();
    page.head.insertAdjacentHTML("beforeend", "<style>#board { border: 1.5px solid #ff0000 }</style>");
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1, style: "solid" });
    const [change] = changes.list();

    write("--stroke: 1px; border: var(--stroke) solid #ff0000");
    expect(await check(page, change)).toEqual({ outcome: "shown" });
  });

  test("a side written by a logical property, as Tailwind's border-x writes it, is compared as written there, not as the rule below it writes it", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: [1, 1.5, 1, 1.5], style: "solid" });
    const [change] = changes.list();

    write("border: 1px solid #ff0000; border-inline-width: 1.5px");
    expect(await check(page, change)).toEqual({ outcome: "shown" });
    write("border-style: solid; border-color: #ff0000; border-block-width: 1px; border-inline-width: 1.5px; border-left-width: 1px");
    expect(await check(page, change)).toEqual({ outcome: "not shown", actual: { color: "#FF0000", opacity: 1, weight: [1, 1.5, 1, 1], style: "solid" } });
  });

  test("each side is drawn as it says; a color that is not the one set is not shown", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: [0, 0, 0.5, 2.5], style: "dashed" });
    const [change] = changes.list();

    write("border: 0 dashed #ff0000; border-bottom-width: 0.5px; border-left-width: 2.5px");
    expect(await check(page, change)).toEqual({ outcome: "shown" });

    write("border: 0 dashed #0000ff; border-bottom-width: 0.5px; border-left-width: 2.5px");
    expect(await check(page, change)).toEqual({ outcome: "not shown", actual: { color: "#0000FF", opacity: 1, weight: [0, 0, 0.5, 2.5], style: "dashed" } });
  });
});

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

describe("Variables", () => {
  const variable = (name: string, group: Variable["group"], value: string, extra: Partial<Variable> = {}): Variable => ({ name, group, value, from: "tailwind", own: true, ...extra });
  const GUTTER = variable("gutter", "spacing", "1.375rem");
  const FOUR = variable("4", "spacing", "1rem", { own: false });
  const RED = variable("--danger", "color", "hsl(0 100% 50%)", { from: "css", css: "var(--danger)" });
  const BRAND = variable("brand-500", "color", "#3d63f5");
  const CARD = variable("card", "radius", "14px");
  const RAISED = variable("card", "shadow", "0 1px 2px rgb(27 29 42 / 0.06), 0 4px 12px rgb(27 29 42 / 0.08)");
  const LEAD = variable("lead", "fontSize", "1.1875rem");
  const ALL = [GUTTER, FOUR, RED, BRAND, CARD, RAISED, LEAD, variable("nowhere", "color", "not-a-color")];
  const PAGE_OF_STACKS = `<!DOCTYPE html>
<body style="margin: 0">
  <div id="row" data-vk-loc="src/App.tsx:4:5" style="display: flex; gap: 10px; padding: 4px 8px">
    <article data-vk-loc="src/Card.tsx:3:5" style="height: 80px; width: 120px; background-color: rgb(255, 255, 255); border-radius: 12px"></article>
    <h3 data-vk-loc="src/Card.tsx:4:7" style="font-size: 16px; color: rgb(0, 0, 0)">Card</h3>
  </div>
</body>`;

  function openWithVariables(variables = ALL) {
    const canvas = openCanvas(PAGE_OF_STACKS);
    const catalog = resolveVariables(variables, canvas.doc);
    const editor = createEditor(canvas.views, canvas.changes, (property, value, picked, previous) => bind(catalog, property, value, picked, previous));
    const tree = editor.tree();
    const layer = (selector: string) => find(tree.root, (l) => l.el === canvas.doc.querySelector(selector) && !l.text)!;
    const change = (property: string) => canvas.changes.list().find((c) => c.property === property);
    return { ...canvas, catalog, editor, layer, change };
  }

  test("each is worked out on the canvas: lengths in px by the page's rem, colors in sRGB, shadows; one that is none of these is left out", () => {
    const { catalog } = openWithVariables();
    expect(catalog.of("spacing").map(({ variable, drawn }) => [variable.name, drawn])).toEqual([["gutter", 22], ["4", 16]]);
    expect(catalog.of("color").map(({ drawn }) => drawn)).toEqual([{ color: "#FF0000", opacity: 1 }, { color: "#3D63F5", opacity: 1 }]);
    expect(catalog.of("shadow")[0].drawn).toEqual([
      { type: "drop", x: 0, y: 1, blur: 2, spread: 0, color: "#1B1D2A", opacity: 0.06 },
      { type: "drop", x: 0, y: 4, blur: 12, spread: 0, color: "#1B1D2A", opacity: 0.08 },
    ]);
    expect(catalog.of("fontSize")[0].drawn).toBe(19);
  });

  test("a value typed in names the Variable it is exactly, and only that: a color in another color space too; a value no Variable has says so", () => {
    const { editor, layer, change } = openWithVariables();
    editor.set(layer("#row"), "gap", 22);
    expect(change("gap")!.variables).toEqual({ "": GUTTER });
    editor.set(layer("#row"), "gap", 23);
    expect(change("gap")!.variables).toEqual({ "": null });

    editor.set(layer("article"), "fill", { type: "solid", color: "#FF0000", opacity: 1 });
    expect(change("fill")!.variables).toEqual({ color: RED });
    // Close is not the same.
    editor.set(layer("article"), "fill", { type: "solid", color: "#FE0000", opacity: 1 });
    expect(change("fill")!.variables).toEqual({ color: null });

    editor.set(layer("#row"), "padding", [22, 16, 4, 8]);
    expect(change("padding")!.variables).toEqual({ top: GUTTER, right: FOUR, bottom: null, left: null });
    editor.set(layer("h3"), "fontSize", 19);
    expect(change("fontSize")!.variables).toEqual({ "": LEAD });
    editor.set(layer("article"), "radius", [14, 14, 0, 0]);
    expect(change("radius")!.variables).toEqual({ "top-left": CARD, "top-right": CARD, "bottom-right": null, "bottom-left": null });
    // No Variable is offered for X, nor for opacity.
    editor.set(layer("article"), "opacity", 0.5);
    expect(change("opacity")!.variables).toBeUndefined();
  });

  test("a Variable picked is recorded as picked, kept while that part keeps its value, and undone with the edit", () => {
    const { editor, layer, change, cards } = openWithVariables();
    const row = layer("#row");
    editor.set(row, "padding", [22, 8, 4, 8], { variables: { top: GUTTER } });
    expect(change("padding")!.variables!.top).toEqual({ ...GUTTER, picked: true });
    // Another side changes: the top keeps its Variable.
    editor.set(row, "padding", [22, 16, 4, 8]);
    expect(change("padding")!.variables).toEqual({ top: { ...GUTTER, picked: true }, right: FOUR, bottom: null, left: null });

    // Detached: the value stays, and is still the Variable it equals, but not as picked.
    editor.set(row, "padding", [22, 16, 4, 8], { variables: { top: null } });
    expect(change("padding")!.variables!.top).toEqual(GUTTER);
    editor.undo();
    expect(change("padding")!.variables!.top).toEqual({ ...GUTTER, picked: true });
    editor.undo();
    editor.undo();
    expect(change("padding")).toBeUndefined();
    editor.redo();
    expect(change("padding")!.variables!.top).toEqual({ ...GUTTER, picked: true });

    // Shadows picked as a whole are drawn on the canvas.
    const article = layer("article");
    const shadows = editor.read(article, "shadows");
    expect(shadows).toEqual([]);
    editor.set(article, "shadows", [
      { type: "drop", x: 0, y: 1, blur: 2, spread: 0, color: "#1B1D2A", opacity: 0.06 },
      { type: "drop", x: 0, y: 4, blur: 12, spread: 0, color: "#1B1D2A", opacity: 0.08 },
    ], { variables: { "": RAISED } });
    expect(change("shadows")!.variables).toEqual({ "": { ...RAISED, picked: true } });
    expect(editor.variables(article, "shadows")).toEqual({ "": { ...RAISED, picked: true } });
    expect(getComputedStyle(article.el).boxShadow).toContain("0px 4px 12px 0px");
    void cards;
  });

  test("a Variable picked for the value the layer has already is no change, and no step to undo", () => {
    const { editor, layer, changes } = openWithVariables();
    editor.set(layer("#row"), "gap", 22);
    editor.set(layer("article"), "radius", 12, { variables: { "": { ...CARD, value: "12px" } } });
    expect(changes.list().map((c) => c.property)).toEqual(["gap"]);
    // The one undo takes back the gap.
    editor.undo();
    expect(changes.list()).toEqual([]);
  });

  test("a part picked and then given another value is that value's Variable, if any", () => {
    const { editor, layer, change } = openWithVariables();
    editor.set(layer("article"), "fill", { type: "solid", color: "#3D63F5", opacity: 1 }, { variables: { color: BRAND } });
    expect(change("fill")!.variables).toEqual({ color: { ...BRAND, picked: true } });
    editor.set(layer("article"), "fill", { type: "solid", color: "#3D63F5", opacity: 0.5 });
    expect(change("fill")!.variables).toEqual({ color: null });
    editor.set(layer("article"), "fill", { type: "linear", angle: 90, stops: [
      { color: "#3D63F5", opacity: 1, position: 0, unit: "%" },
      { color: "#000000", opacity: 1, position: 100, unit: "%" },
    ] });
    expect(change("fill")!.variables).toEqual({ "stop 1": BRAND, "stop 2": null });
  });

  test("without Variables, a change names none", () => {
    const { editor, layer, change } = openWithVariables([]);
    editor.set(layer("#row"), "gap", 22);
    expect(change("gap")).not.toHaveProperty("variables");
  });
});
