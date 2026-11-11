import { afterEach, describe, expect, test, vi } from "vitest";
import { CHECK_SETTLE_MS, CODE_EVENT, CODE_GLOBAL, type CheckReport, type CodeUpdates } from "../src/service-protocol";
import { layerName } from "../src/design-values";
import { partsOf, readMediaBreakpoints, type ProjectBreakpoints } from "../src/client/breakpoints";
import { createChangeSet, type Change, type Created, type Place } from "../src/client/changeset";
import { placedOnCanvas } from "../src/client/moves";
import { checkAcross, checkChange, itself, uncheckable, valuesAt, widthsOf, type PageWidth } from "../src/client/check";
import { copyPage, type PageCopy } from "../src/client/page-copy";
import { measureParts, PARTS_MEASURE } from "../src/client/range-parts";
import { PAGE_UPDATE_LOST_MS, watchPage } from "../src/client/page-checks";
import { createClipboard } from "../src/client/clipboard";
import { asPage, declaredByEdit, moveInlineEdits } from "../src/client/canvas-style";
import { findDrop, findPlace } from "../src/client/drag";
import { createEditor } from "../src/client/edits";
import { definitionOf, type Fill, type Property, type PropertyValues, type Shadow, type Stroke } from "../src/client/property-table";
import { resizeStep, type ResizeSession } from "../src/client/canvas-resize";
import type { Shown } from "../src/client/view-layout";
import { changeMarks } from "../src/client/ChangeMarks";
import { serializeCanvas } from "../src/client/freezer";
import { boxOf, buildLayerTree, type Layer } from "../src/client/layers";
import { revertSaved } from "../src/client/saved-round";
import { fontsOf } from "../src/client/typography";
import { CATCH_UP_AFTER_MS, createViews, type View } from "../src/client/views";
import { bind, bindRecorded, resolveVariables, type Catalog } from "../src/client/variables";
import type { Variable } from "../src/service-protocol";

/** A round as the page checks it, placed on its canvas: with no new layer, no canvas to read. */
const onCanvas = (round: Change[]) => placedOnCanvas(round, "");

/** Usage chains as the freezer writes them onto the canvas. */
const APP = [{ component: "App", usage: null, thirdParty: false }];
const cardAt = (usage: string) => [{ component: "Card", usage, thirdParty: false }, ...APP];
const chain = (levels: object[]) => `data-ht-chain='${JSON.stringify(levels)}'`;

/**
 * A fixed canvas: three cards from one usage (a loop), one card from phoneFrame
 * usage, a locked badge from a dependency, and a box with no source marker.
 */
const BADGE = [{ component: "Badge", usage: "src/App.tsx:10:5", thirdParty: true }, ...APP];
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <main data-ht-loc="src/App.tsx:4:5" ${chain(APP)} style="display: grid; grid-template-columns: repeat(4, 100px); gap: 8px">
    ${[1, 2, 3]
      .map(
        (n) => `<article data-ht-loc="src/Card.tsx:3:5" ${chain(cardAt("src/App.tsx:6:9"))}
          style="height: 80px; background-color: rgb(255, 255, 255); border-radius: 12px">
          <h3 data-ht-loc="src/Card.tsx:4:7" ${chain(cardAt("src/App.tsx:6:9"))}>Card ${n}</h3>
        </article>`,
      )
      .join("")}
    <article data-ht-loc="src/Card.tsx:3:5" ${chain(cardAt("src/App.tsx:8:7"))}
      style="height: 80px; background-color: rgb(255, 255, 255); border-radius: 12px">
      <h3 data-ht-loc="src/Card.tsx:4:7" ${chain(cardAt("src/App.tsx:8:7"))}>Your turn</h3>
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

function openCanvas(page = PAGE, project: ProjectBreakpoints | null = null, width = 800) {
  iframe = document.createElement("iframe");
  iframe.style.width = `${width}px`;
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(page);
  doc.close();
  const views = createViews({ document: doc, width, height: 600, windowHeight: 600, scrollY: 0 });
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
/** Once the next frame is drawn, and what was put off till then is done. */
const painted = () => new Promise((done) => requestAnimationFrame(() => setTimeout(() => setTimeout(done))));

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

    // Tailwind's preflight: every element has a solid border of 0, and so no stroke.
    doc.head.insertAdjacentHTML("beforeend", "<style>*, ::before, ::after { border: 0 solid #e5e7eb }</style>");
    expect(read("")).toBeNull();
    // A stroke at 0 as it lands in the code: its color the layer's own (designer, 2026-11-10).
    expect(read("border-color: red")).toEqual({ color: "#FF0000", opacity: 1, weight: 0, style: "solid" });
    expect(read("border: 1px solid oklch(92.8% 0.006 264.531)")).toEqual({ color: "#E5E7EB", opacity: 1, weight: 1, style: "solid" });
    expect(read("border-bottom: 2px dotted blue; border-top: 3px none red")).toEqual({ color: "#0000FF", opacity: 1, weight: [0, 0, 2, 0], style: "dashed" });
  });

  test("read again, as the Design panel does on each step of a value, a stroke changes nothing on the canvas", () => {
    const { doc, editor, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    box.style.cssText = "height: 40px; border: 1px solid red";
    const stroke = editor.read(layerOf(box), "stroke");
    const observer = new MutationObserver(() => {});
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    expect(editor.read(layerOf(box), "stroke")).toEqual(stroke);
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
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

  test("each side reads as its own declaration writes it, when one rule writes them side by side", () => {
    const { doc, editor, layerOf } = openCanvas();
    doc.head.insertAdjacentHTML("beforeend", "<style>.sides { border: 0 solid red; border-top-width: 1.5px; border-right-width: 3px; border-left-width: 2.5px }</style>");
    const box = doc.getElementById("unmarked")!;
    box.className = "sides";
    expect(editor.read(layerOf(box), "stroke")).toEqual({ color: "#FF0000", opacity: 1, style: "solid", weight: [1.5, 3, 0, 2.5] });
  });

  test("a weight set this round reads back as set, though a 1x screen draws it narrower", () => {
    const { editor, cards, layerOf } = openCanvas();
    const stroke: Stroke = { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" };

    editor.set(layerOf(cards[0]), "stroke", stroke);

    expect(style(cards[1]).borderTopWidth).toBe("1px");
    expect(editor.read(layerOf(cards[1]), "stroke")).toEqual(stroke);
  });

  test("a stroke at 0 stays a stroke, with its color and line, as in Figma; taken off, it is none; undone, the page's own again", () => {
    const { doc, editor, changes, layerOf } = openCanvas();
    const box = doc.getElementById("unmarked")!;
    // Tailwind's preflight under a border of the page's own: a line of 0 on its own is no stroke.
    doc.head.insertAdjacentHTML("beforeend", "<style>*, ::before, ::after { border: 0 solid #e5e7eb }</style>");
    box.style.cssText = "height: 40px";
    const layer = layerOf(box);
    expect(editor.read(layer, "stroke")).toBeNull();
    box.style.cssText = "height: 40px; border: 2px solid #ff0000";
    const page = editor.read(layer, "stroke")!;

    editor.set(layer, "stroke", { ...page, weight: 0 });
    expect([style(box).borderTopWidth, style(box).borderTopStyle]).toEqual(["0px", "solid"]);
    expect(editor.read(layer, "stroke")).toEqual({ color: "#FF0000", opacity: 1, weight: 0, style: "solid" });
    expect(changes.list()[0]).toMatchObject({
      before: page,
      after: { ...page, weight: 0 },
      style: { "border-width": "0px", "border-style": "solid", "border-color": "rgb(255 0 0 / 1)" },
    });

    // Its line changes at 0, and its weight goes up again.
    editor.set(layer, "stroke", { ...page, weight: 0, style: "dashed" });
    expect(editor.read(layer, "stroke")).toEqual({ ...page, weight: 0, style: "dashed" });
    editor.set(layer, "stroke", { ...page, weight: 3 });
    expect(editor.read(layer, "stroke")).toEqual({ ...page, weight: 3 });

    editor.set(layer, "stroke", { ...page, weight: 0 });
    editor.set(layer, "stroke", null);
    expect(editor.read(layer, "stroke")).toBeNull();

    editor.undo();
    expect(editor.read(layer, "stroke")).toEqual({ ...page, weight: 0 });
    editor.undo();
    editor.undo();
    editor.undo();
    editor.undo();
    expect(editor.read(layer, "stroke")).toEqual(page);
    expect(changes.list()).toEqual([]);
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
      const change = changes.list().find((c) => c.layer === text(id).el.getAttribute("data-ht-layer") && c.property === property)!;
      expect(change.style).toEqual({ [css]: declaredByEdit(doc.getElementById(id)!, css) });
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
    expect(declaredByEdit(p, "font-weight")).toBe("300");
    expect(style(p).fontWeight).toBe("300");
  });

  test("the fonts offered are the web fonts the page declares, each with its declared weights, and the first font of each stack the page uses that is there", async () => {
    const { doc } = openCanvas(FONT_PAGE);
    await doc.fonts.ready;

    expect(fontsOf(doc)).toEqual([
      // Its faces from 400 to 700, as a variable font has them, and a 900 of its own.
      { family: "Brand", weights: [400, 500, 600, 700, 900] },
      // Where the page asks for a font that is not there, the one it falls back to: in the weights the page uses it in.
      { family: "Courier New", weights: [400] },
      { family: "Georgia", weights: [400, 700] },
      { family: "Menlo", weights: [400] },
      // Declared, though no text uses it yet: the browser loads it once one does (ticket 140).
      { family: "Unused", weights: [400] },
    ]);
  });

  test("a web font's weights are those it declares, loaded or not yet, not those that failed to load; a weight in several unicode-range subsets is one (ticket 140)", async () => {
    const { doc } = openCanvas(`<!DOCTYPE html>
<style>
  @font-face { font-family: Display; src: local("Arial"); font-weight: 600; unicode-range: U+0-FF }
  @font-face { font-family: Display; src: url("/display-600-ext-140.woff2") format("woff2"); font-weight: 600; unicode-range: U+100-24F }
  @font-face { font-family: Display; src: url("/display-300-140.woff2") format("woff2"); font-weight: 300; unicode-range: U+0-FF }
  @font-face { font-family: Display; src: url("/display-300-ext-140.woff2") format("woff2"); font-weight: 300; unicode-range: U+100-24F }
  @font-face { font-family: Display; src: url("/no-such-font-140.woff2") format("woff2"); font-weight: 800 }
  @font-face { font-family: Broken; src: url("/no-such-font-140.woff2") format("woff2") }
  body { margin: 0; font: 16px Georgia, serif }
</style>
<body><h1 style="font-family: Display, sans-serif; font-weight: 600">Display</h1></body>`);
    await doc.fonts.ready;
    const faces = [...(doc.fonts as unknown as Iterable<FontFace>)];
    // The faces at 800 and Broken's, loaded: they fail.
    await Promise.allSettled(faces.filter((face) => face.weight === "800" || face.family === "Broken").map((face) => face.load()));
    const status = (weight: string, range: string) => faces.find((face) => face.family === "Display" && face.weight === weight && face.unicodeRange === range)?.status;

    // The text's Latin subset is loaded; the rest, used by no text, not yet.
    expect(status("600", "U+0-FF")).toBe("loaded");
    expect(status("600", "U+100-24F")).toBe("unloaded");
    expect(status("300", "U+0-FF")).toBe("unloaded");
    expect(faces.filter((face) => face.status === "error")).toHaveLength(2);
    expect(fontsOf(doc)).toEqual([{ family: "Display", weights: [300, 600] }]);
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

describe("a value stepped again and again, as the arrow keys and scrubbing do", () => {
  /** The canvas, shown as narrow as a phone too. */
  const open = async () => {
    const canvas = openCanvas();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await canvas.views.add(phoneFrame, 390);
    return { ...canvas, phone };
  };
  const radii = (doc: Document) => [...doc.querySelectorAll("article")].map((card) => style(card).borderRadius);

  test("each step shows on every instance in every view, in the canvas saved, and in a view added after", async () => {
    const { doc, views, editor, cards, layerOf, phone } = await open();
    for (const radius of [4, 5, 6]) {
      editor.set(layerOf(cards[0]), "radius", radius);
      views.sync(phone);
      expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill(`${radius}px`));
      expect(radii(phone.document)).toEqual(radii(doc));
    }
    editor.batch(() => editor.set(layerOf(cards[0]), "radius", 7), { continues: true });
    editor.batch(() => editor.set(layerOf(cards[0]), "radius", 8), { continues: false });
    views.sync(phone);
    expect(radii(phone.document)).toEqual(["8px", "8px", "8px", "12px"]);

    const saved = showSaved(serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }));
    expect(radii(saved)).toEqual(["8px", "8px", "8px", "12px"]);
    const tabletFrame = document.createElement("iframe");
    document.body.append(tabletFrame);
    try {
      const tablet = await views.add(tabletFrame, 600);
      expect(radii(tablet.document)).toEqual(["8px", "8px", "8px", "12px"]);
    } finally {
      tabletFrame.remove();
    }
  });

  test("worked in the desktop view, each step shows there at once; the views beside it show the latest step once the steps pause, or at once as one is read", async () => {
    const { doc, views, editor, cards, layerOf, phone } = await open();
    const tabletFrame = document.createElement("iframe");
    document.body.append(tabletFrame);
    /** Two frames drawn: the views beside wait for the steps to pause, not for a frame. */
    const drawn = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    try {
      const tablet = await views.add(tabletFrame, 600);
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      editor.set(layerOf(cards[0]), "radius", 4, { step: true });
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS);
      for (const view of [phone, tablet]) expect(radii(view.document).slice(0, 3)).toEqual(Array(3).fill("4px"));
      // As a key held down repeats: each step sooner after the last than the pause, frames drawn between them.
      for (const radius of [5, 6]) {
        editor.batch(() => editor.set(layerOf(cards[0]), "radius", radius), { continues: true, step: true });
        expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill(`${radius}px`));
        await drawn();
        vi.advanceTimersByTime(CATCH_UP_AFTER_MS - 1);
        for (const view of [phone, tablet]) expect(radii(view.document).slice(0, 3)).toEqual(Array(3).fill("4px"));
      }
      vi.advanceTimersByTime(1);
      for (const view of [phone, tablet]) expect(radii(view.document)).toEqual(radii(doc));
      vi.useRealTimers();

      editor.batch(() => editor.set(layerOf(cards[0]), "radius", 7), { continues: true, step: true });
      views.sync(phone);
      expect(radii(phone.document).slice(0, 3)).toEqual(Array(3).fill("7px"));
      expect(radii(tablet.document).slice(0, 3)).toEqual(Array(3).fill("6px"));
      // Anything else changed on the canvas brings every view up to date with it.
      doc.body.append(doc.createElement("hr"));
      views.sync();
      expect(radii(tablet.document).slice(0, 3)).toEqual(Array(3).fill("7px"));
      expect(tablet.document.querySelectorAll("hr")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      tabletFrame.remove();
    }
  });

  test("the first value of a layer, which gives its instances edit styles, waits in the views beside as any other: a step till the steps pause, a value set once till the next frame", async () => {
    const { doc, editor, cards, layerOf, phone, tree } = await open();
    const title = find(tree.root, (layer) => layer.el === cards[0].querySelector("h3") && !layer.text)!;
    const sizes = (d: Document) => [...d.querySelectorAll("h3")].map((h) => style(h).fontSize);
    const before = sizes(phone.document);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      editor.set(layerOf(cards[0]), "radius", 4, { step: true });
      await Promise.resolve();
      expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill("4px"));
      expect(radii(phone.document).slice(0, 3)).toEqual(Array(3).fill("12px"));
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS - 1);
      expect(radii(phone.document).slice(0, 3)).toEqual(Array(3).fill("12px"));
      vi.advanceTimersByTime(1);
      expect(radii(phone.document)).toEqual(radii(doc));
    } finally {
      vi.useRealTimers();
    }
    editor.set(title, "fontSize", 30);
    await Promise.resolve();
    expect(sizes(doc).slice(0, 3)).toEqual(Array(3).fill("30px"));
    expect(sizes(phone.document)).toEqual(before);
    await painted();
    expect(sizes(phone.document)).toEqual(sizes(doc));
  });

  test("set once in the desktop view, a value shows there at once, and in the views beside it once the next frame is drawn, with no pause to wait for", async () => {
    const { doc, editor, cards, layerOf, phone } = await open();
    editor.set(layerOf(cards[0]), "radius", 3);
    await painted();
    editor.set(layerOf(cards[0]), "radius", 4);
    await Promise.resolve();
    expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill("4px"));
    expect(radii(phone.document).slice(0, 3)).toEqual(Array(3).fill("3px"));
    await painted();
    expect(radii(phone.document)).toEqual(radii(doc));
  });

  test("set once right after steps, before they pause, a value shows in the views beside once the next frame is drawn, with no pause to wait for", async () => {
    const { doc, views, editor, cards, layerOf, phone } = await open();
    editor.set(layerOf(cards[0]), "radius", 3);
    await painted();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      for (const radius of [4, 5]) editor.batch(() => editor.set(layerOf(cards[0]), "radius", radius), { continues: radius > 4, step: true });
      editor.set(layerOf(cards[0]), "radius", 9);
      await new Promise((done) => requestAnimationFrame(done));
      expect(radii(phone.document).slice(0, 3)).toEqual(Array(3).fill("3px"));
      // The task after the frame: the steps are far from pausing.
      vi.advanceTimersByTime(0);
      expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill("9px"));
      expect(radii(phone.document)).toEqual(radii(doc));
    } finally {
      vi.useRealTimers();
    }
  });

  test("undone or redone while the views beside wait for steps to pause, it shows in every view at once, as any other change (ADR 0011)", async () => {
    const { doc, editor, cards, layerOf, phone } = await open();
    editor.set(layerOf(cards[0]), "radius", 3);
    await painted();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // Steps of one adjustment, 3 to 7: the views beside caught up with 5, then wait again.
      for (const radius of [4, 5]) editor.batch(() => editor.set(layerOf(cards[0]), "radius", radius), { continues: radius > 4, step: true });
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS);
      for (const radius of [6, 7]) editor.batch(() => editor.set(layerOf(cards[0]), "radius", radius), { continues: true, step: true });
      expect(radii(phone.document).slice(0, 3)).toEqual(Array(3).fill("5px"));

      editor.undo();
      expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill("3px"));
      expect(radii(phone.document)).toEqual(radii(doc));
      editor.redo();
      expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill("7px"));
      expect(radii(phone.document)).toEqual(radii(doc));
      // Nothing is left waiting to catch up.
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS);
      expect(radii(phone.document)).toEqual(radii(doc));
    } finally {
      vi.useRealTimers();
    }
  });

  test("worked in the phone view, each step shows there at once, at its breakpoint, as in the canvas itself", async () => {
    const { doc, editor, cards, layerOf, phone } = await open();
    editor.at(phone);
    editor.set(layerOf(cards[0]), "radius", 4);
    await painted();
    editor.batch(() => editor.set(layerOf(cards[0]), "radius", 5), { continues: true });
    expect(radii(phone.document).slice(0, 3)).toEqual(Array(3).fill("5px"));
    expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill("12px"));
  });

  test("read as the page has it between steps, the layer shows the latest step after, in every view", async () => {
    const { doc, views, editor, cards, layerOf, phone } = await open();
    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(cards[0]), "radius", 5);
    expect(asPage(cards[0], () => style(cards[0]).borderRadius)).toBe("12px");
    expect(style(cards[0]).borderRadius).toBe("5px");
    editor.set(layerOf(cards[0]), "radius", 6);
    views.sync(phone);
    expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill("6px"));
    expect(radii(phone.document)).toEqual(radii(doc));
  });

  test("a step at a breakpoint after steps at every width, and back, shows where each belongs in every view; undone, the page's own again", async () => {
    const { doc, views, editor, cards, layerOf, phone } = await open();
    editor.set(layerOf(cards[0]), "radius", 4);
    editor.set(layerOf(cards[0]), "radius", 5);
    editor.at(phone);
    editor.set(layerOf(cards[0]), "radius", 9);
    editor.set(layerOf(cards[0]), "radius", 10);
    editor.at(null);
    editor.set(layerOf(cards[0]), "radius", 6);
    views.sync();
    expect(radii(doc).slice(0, 3)).toEqual(Array(3).fill("6px"));
    expect(radii(phone.document).slice(0, 3)).toEqual(Array(3).fill("10px"));
    while (editor.undo().length);
    views.sync();
    expect(radii(doc)).toEqual(Array(4).fill("12px"));
    expect(radii(phone.document)).toEqual(Array(4).fill("12px"));
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
    expect(back.map((card) => card.hasAttribute("data-ht-style"))).toEqual([false, false, false]);
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
  <main data-ht-loc="src/App.tsx:4:5" ${chain(APP)} style="display: flex; flex-direction: column; gap: 8px">
    <article data-ht-loc="src/Card.tsx:3:5" class="card bg-white rounded-xl" style="height: 40px"></article>
    <button data-ht-loc="src/App.tsx:9:7" class="bg-white rounded-xl" style="display: flex; height: 40px"></button>
    <section data-ht-loc="src/App.tsx:12:7" class="rounded-sm wide" style="height: 40px; border-radius: 8px"></section>
    <div data-ht-loc="src/App.tsx:14:7" style="display: flex; height: 40px"></div>
    <aside data-ht-loc="src/App.tsx:16:7" class="nested-state" style="display: flex; height: 40px"></aside>
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
  <div id="pinned" data-ht-pinned="top left bottom right width height" data-ht-pin-offset="0 250"
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
const at = (loc: string) => `data-ht-loc="src/App.tsx:${loc}" ${chain(APP)}`;
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
    const item = `data-ht-loc="src/Item.tsx:2:3" ${chain([{ component: "Item", usage: "src/App.tsx:6:9", thirdParty: false }, ...APP])}`;
    const { doc, editor, changes, layer } = open(`<!DOCTYPE html>
      <ul id="list" ${at("5:5")} style="display: flex; flex-direction: column">
        <li ${item}>One</li><li ${item}>Two</li><li ${item}>Three</li>
      </ul>`);
    const second = find(editor.tree().root, (l) => l.el === doc.querySelectorAll("li")[1])!;

    editor.move(second, { parent: layer("list"), index: 0 });

    expect([...doc.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Two", "One", "Three"]);
    expect(changes.list()[0]).toMatchObject({ data: true, target: { instances: 3 }, before: { nth: 2 }, after: { nth: 1 }, instance: { nth: 2, words: "Two" } });
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
    const item = `data-ht-loc="src/Item.tsx:2:3" ${chain([{ component: "Item", usage: "src/App.tsx:6:9", thirdParty: false }, ...APP])}`;
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
    const { doc, editor, layer } = open(MOVES.replace("<p id", `<div id="pinned" data-ht-pin-offset="0 250" style="position: fixed; top: 300px; left: 0; width: 20px; height: 20px"></div><p id`));

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

  test("nudged in the desktop view, a layer placed freely moves in the views beside once the nudges pause, as the arrow keys step a value", async () => {
    const { views, editor, layer, place } = open();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // The first nudge makes the layer's edit styles: the views beside wait for the pause all the same.
      editor.nudge([layer("free")], 1, 0);
      await new Promise((done) => requestAnimationFrame(done));
      expect(place("free", phone.document)).toEqual([12, 8]);
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS);
      expect(place("free", phone.document)).toEqual([13, 8]);
      editor.nudge([layer("free")], 1, 0, { continues: true });
      expect(place("free")).toEqual([14, 8]);
      await new Promise((done) => requestAnimationFrame(done));
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS - 1);
      expect(place("free", phone.document)).toEqual([13, 8]);
      vi.advanceTimersByTime(1);
      expect(place("free", phone.document)).toEqual([14, 8]);
    } finally {
      vi.useRealTimers();
    }
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

const RESIZES = `<!DOCTYPE html>
<body style="margin: 0">
  <div id="board" ${at("30:5")} style="position: relative; width: 300px; height: 200px">
    <div id="free" ${at("31:7")} style="position: absolute; left: 12px; top: 8px; width: 30px; height: 20px"></div>
  </div>
  <div id="row" ${at("33:5")} style="display: flex; gap: 10px; width: 400px">
    <div id="grows" ${at("34:7")} style="flex-grow: 1; height: 20px"></div>
    <div id="hugs" ${at("35:7")} style="padding: 4px">Hugs</div>
  </div>
  <p id="words" ${at("37:5")} style="width: fit-content; margin: 0; font: 16px/20px sans-serif">Some words that wrap once narrower</p>
</body>`;

describe("resizing a layer, as its handles do", () => {
  const open = () => {
    const canvas = openCanvas(RESIZES);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const box = (id: string) => {
      const r = canvas.doc.getElementById(id)!.getBoundingClientRect();
      const p = canvas.doc.getElementById(id)!.parentElement!.getBoundingClientRect();
      return [r.left - p.left, r.top - p.top, r.width, r.height];
    };
    const recorded = () => canvas.changes.list().map((change) => [change.kind, change.property, change.before, change.after]);
    return { ...canvas, layer, box, recorded };
  };

  test("its width and height become Fixed at the sizes given; the steps of one resize are one step, though a later one sets more", () => {
    const { editor, layer, box, recorded } = open();

    editor.resize(layer("free"), { width: 40 });
    editor.resize(layer("free"), { width: 50, height: 30 }, { continues: true });

    expect(box("free")).toEqual([12, 8, 50, 30]);
    expect(recorded()).toEqual([
      ["style", "width", { type: "fixed", value: 30 }, { type: "fixed", value: 50 }],
      ["style", "height", { type: "fixed", value: 20 }, { type: "fixed", value: 30 }],
    ]);
    editor.undo();
    expect(box("free")).toEqual([12, 8, 30, 20]);
    expect(recorded()).toEqual([]);
    editor.redo();
    expect(box("free")).toEqual([12, 8, 50, 30]);
  });

  test("placed freely, its X and Y move with the edges dragged, so those across stay", () => {
    const { editor, layer, box, recorded } = open();

    editor.resize(layer("free"), { width: 40, x: 2 });
    editor.resize(layer("free"), { width: 42, x: 0, height: 25, y: 3 }, { continues: true });

    expect(box("free")).toEqual([0, 3, 42, 25]);
    expect(recorded().map(([, property]) => property)).toEqual(["width", "x", "height", "y"]);
  });

  test("Hug or Fill dragged becomes Fixed, in a Stack too: it no longer grows into the room left", () => {
    const { editor, layer, box, recorded } = open();

    editor.resize(layer("grows"), { width: 100 });
    editor.resize(layer("hugs"), { width: 60 });

    expect(box("grows")[2]).toBe(100);
    expect(box("hugs")[2]).toBe(60);
    expect(recorded()).toEqual([
      ["style", "width", { type: "fill" }, { type: "fixed", value: 100 }],
      ["style", "width", { type: "hug" }, { type: "fixed", value: 60 }],
    ]);
  });

  test("text made narrower is Fixed in width; its height still hugs its words, which wrap", () => {
    const { editor, layer, box, recorded } = open();
    const [, , , tall] = box("words");

    editor.resize(layer("words"), { width: 120 });

    expect(box("words")[2]).toBe(120);
    expect(box("words")[3]).toBeGreaterThan(tall);
    expect(editor.read(layer("words"), "height")).toEqual({ type: "hug" });
    expect(recorded()).toEqual([["style", "width", { type: "hug" }, { type: "fixed", value: 120 }]]);
  });

  test("taken back, as Esc cancels a resize: as it was, nothing recorded, and nothing to redo", () => {
    const { editor, layer, box, recorded } = open();
    editor.resize(layer("hugs"), { width: 80 });

    editor.resize(layer("free"), { width: 40 });
    editor.resize(layer("free"), { width: 60, height: 40 }, { continues: true });
    editor.takeBack();

    expect(box("free")).toEqual([12, 8, 30, 20]);
    expect(recorded()).toEqual([["style", "width", { type: "hug" }, { type: "fixed", value: 80 }]]);
    expect(editor.redo()).toEqual([]);
    expect(box("free")).toEqual([12, 8, 30, 20]);
  });

  test("a nudge right after is a step of its own", () => {
    const { editor, layer, box } = open();

    editor.resize(layer("free"), { width: 40 });
    editor.nudge([layer("free")], 1, 0, { continues: true });
    editor.undo();

    expect(box("free")).toEqual([12, 8, 40, 20]);
  });

  test("taken back having changed nothing (pressed and moved, its Fixed size as it was), it takes nothing back: the edit before it stays, to undo and redo", () => {
    const { editor, layer, box, recorded } = open();
    editor.set(layer("free"), "x", 20);

    editor.resize(layer("free"), { width: 30 });
    editor.resize(layer("free"), { width: 30 }, { continues: true });
    editor.takeBack();

    expect(box("free")).toEqual([20, 8, 30, 20]);
    expect(recorded()).toEqual([["style", "x", 12, 20]]);
    expect(editor.redo()).toEqual([]);
    editor.undo();
    expect(box("free")).toEqual([12, 8, 30, 20]);
    editor.redo();
    expect(box("free")).toEqual([20, 8, 30, 20]);
  });

  test("a resize right after another of the same layer is a step of its own, though its first steps change nothing; taken back, it takes back its own only", () => {
    const { editor, layer, box } = open();
    const twice = () => {
      editor.resize(layer("free"), { width: 40 });
      // Begun where the first left it, as a handle pressed again in the snap it went to.
      editor.resize(layer("free"), { width: 40 });
      editor.resize(layer("free"), { width: 50 }, { continues: true });
    };

    twice();
    editor.undo();
    expect(box("free")).toEqual([12, 8, 40, 20]);
    editor.undo();
    expect(box("free")).toEqual([12, 8, 30, 20]);

    twice();
    editor.takeBack();
    expect(box("free")).toEqual([12, 8, 40, 20]);
    editor.undo();
    expect(box("free")).toEqual([12, 8, 30, 20]);
  });

  test("a value set again by an adjustment whose first step changes nothing is a step of its own, not one with the same value set before it", () => {
    const { editor, layer, box } = open();
    editor.set(layer("free"), "x", 20);
    editor.set(layer("free"), "x", 20);
    editor.set(layer("free"), "x", 25, { continues: true });

    editor.undo();
    expect(box("free")[0]).toBe(20);
    editor.undo();
    expect(box("free")[0]).toBe(12);
  });

  test("worked in the phone view, it is resized at its breakpoint only, and shows there at once", async () => {
    const { doc, views, editor, layer, changes } = open();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    editor.at(phone);

    editor.resize(layer("free"), { width: 44, x: 4 });

    // The phone's range, up to the desktop view's width, as the views are.
    expect(changes.list().map((change) => [change.property, change.breakpoint?.max])).toEqual([
      ["width", 800],
      ["x", 800],
    ]);
    expect(phone.document.getElementById("free")!.getBoundingClientRect().width).toBe(44);
    expect(doc.getElementById("free")!.getBoundingClientRect().width).toBe(30);
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
      layer: stack.el.getAttribute("data-ht-layer"),
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
    const id = stack.el.getAttribute("data-ht-layer");
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
    const item = `data-ht-loc="src/Item.tsx:2:3" ${chain([{ component: "Item", usage: "src/App.tsx:6:9", thirdParty: false }, ...APP])}`;
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
      layer: el.getAttribute("data-ht-layer"),
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
    const list = doc.getElementById("list")!.getAttribute("data-ht-layer");
    expect(changes.list().map((c) => c.kind)).toEqual(["create"]);
    expect(changes.list()[0].after).toMatchObject({ type: "text", place: { container: { layer: list }, absolute: null } });
    expect(changes.list()[0].style.position).toBeUndefined();

    editor.undo();
    expect(text.el.parentElement).toBe(frame.el);
    expect(changes.list().map((c) => c.kind)).toEqual(["create", "create", "stack"]);
    expect(changes.list().find((c) => c.layer === text.el.getAttribute("data-ht-layer"))!.after).toMatchObject({ place: { container: { layer: frame.el.getAttribute("data-ht-layer") } } });

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
    expect(editor.isNewFrame(editor.tree().layerOf(frame.el)!)).toBe(true);
    expect(frame.el.getAttribute("data-ht-brief")).toBe("A pricing table with three plans");
    expect(changes.list()[0].after).toMatchObject({ type: "frame", brief: "A pricing table with three plans" });
    expect(changes.list()[1]).toMatchObject({ kind: "create", target: { loc: null, made: frame.el.getAttribute("data-ht-layer") }, after: { type: "text", place: { absolute: { x: 10, y: 12 } } } });
    expect(text.el.parentElement).toBe(frame.el);
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };

    editor.revert(changes.list()[0].id);
    expect(doc.querySelectorAll("[data-ht-made]")).toHaveLength(0);
    expect(changes.list()).toEqual([]);
    editor.undo();
    expect(changes.list()).toHaveLength(2);

    expect(revertSaved(saved, saved.changeSet.changes[0].id)).toBeNull();
    // A layer the designer did not make has no brief to make anything by, and none yet.
    expect(editor.isNewFrame(layer("a"))).toBe(false);
    expect(editor.brief(layer("a"))).toBe("");
  });

  test("a copy of a new Frame keeps its brief, in the copy's change too; written anew on the copy, taking it back brings back the one it was copied with", () => {
    const { doc, editor, changes, layer } = open();
    const frame = editor.create("frame", { parent: layer("list"), index: 3 }, { width: 200, height: 120 });
    editor.setBrief(frame, "A pricing table with three plans");

    const copy = editor.duplicate(editor.tree().layerOf(frame.el)!);

    expect(copy.el.getAttribute("data-ht-brief")).toBe("A pricing table with three plans");
    expect(editor.brief(copy)).toBe("A pricing table with three plans");
    expect(changes.list().map((c) => c.kind)).toEqual(["create", "duplicate"]);
    expect(changes.list()[1].brief).toBe("A pricing table with three plans");

    editor.setBrief(copy, "A pricing table with two plans");
    const brief = changes.list()[2];
    expect(brief).toMatchObject({ kind: "brief", before: "A pricing table with three plans", after: "A pricing table with two plans" });
    expect(copy.el.getAttribute("data-ht-brief")).toBe("A pricing table with two plans");
    // The Frame it copies keeps its own.
    expect(frame.el.getAttribute("data-ht-brief")).toBe("A pricing table with three plans");
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };

    editor.undo();
    expect(editor.brief(copy)).toBe("A pricing table with three plans");
    expect(changes.list().map((c) => c.kind)).toEqual(["create", "duplicate"]);
    editor.redo();
    editor.revert(changes.list()[2].id);
    expect(copy.el.getAttribute("data-ht-brief")).toBe("A pricing table with three plans");
    expect(changes.list().map((c) => c.kind)).toEqual(["create", "duplicate"]);

    const reverted = new DOMParser().parseFromString(revertSaved(saved, brief.id)!.canvas, "text/html");
    expect(reverted.querySelector(`[data-ht-layer="${copy.el.getAttribute("data-ht-layer")}"]`)!.getAttribute("data-ht-brief")).toBe("A pricing table with three plans");

    // Taken off the copy, it is a change still: the copy is not to be made by it.
    editor.setBrief(copy, "");
    expect(copy.el.hasAttribute("data-ht-brief")).toBe(false);
    expect(changes.list()[2]).toMatchObject({ kind: "brief", before: "A pricing table with three plans", after: "" });
  });

  test("where a new layer can go: a Stack or a Frame that holds layers, not text or a field", () => {
    const { editor, layer } = open(MOVES.replace("</body>", `<input id="field" ${at("40:5")}></body>`));

    expect(editor.canHold(layer("list"))).toBe(true);
    expect(editor.canHold(layer("board"))).toBe(true);
    expect(editor.canHold(layer("a"))).toBe(false);
    expect(editor.canHold(layer("field"))).toBe(false);
  });
});

describe("a brief on any layer", () => {
  test("a layer that is there takes a brief: a change of its own, for its usage at every width, marked on every instance", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.setBrief(layerOf(cards[1]), "Bounce back harder when pressed");

    expect(editor.brief(layerOf(cards[0]))).toBe("Bounce back harder when pressed");
    expect(cards.map((card) => card.getAttribute("data-ht-brief"))).toEqual([
      "Bounce back harder when pressed",
      "Bounce back harder when pressed",
      "Bounce back harder when pressed",
      null,
    ]);
    expect(changes.list()).toEqual([
      {
        id: 1,
        kind: "brief",
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
        property: "brief",
        before: null,
        after: "Bounce back harder when pressed",
        style: {},
        sources: [],
      },
    ]);
    // Not a new Frame: its brief is not what to make in it.
    expect(editor.isNewFrame(layerOf(cards[1]))).toBe(false);
    expect(editor.brief(layerOf(cards[3]))).toBe("");
  });

  test("changed, it stays one change with the latest words; taken off, no change is left; each an undo step of its own", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    const card = layerOf(cards[0]);

    editor.setBrief(card, "Bounce back harder");
    editor.setBrief(card, "Bounce back harder when pressed");
    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0]).toMatchObject({ id: 1, kind: "brief", after: "Bounce back harder when pressed" });

    editor.setBrief(card, "");
    expect(changes.list()).toEqual([]);
    expect(cards.some((c) => c.hasAttribute("data-ht-brief"))).toBe(false);

    expect(editor.undo().map((layer) => layer.el)).toEqual([cards[0]]);
    expect(editor.brief(card)).toBe("Bounce back harder when pressed");
    expect(cards[2].getAttribute("data-ht-brief")).toBe("Bounce back harder when pressed");
    editor.undo();
    expect(editor.brief(card)).toBe("Bounce back harder");
    editor.undo();
    expect(changes.list()).toEqual([]);
    expect(cards[1].hasAttribute("data-ht-brief")).toBe(false);
    editor.redo();
    expect(editor.brief(card)).toBe("Bounce back harder");

    // The same words again are no edit.
    editor.setBrief(card, "Bounce back harder");
    editor.undo();
    expect(editor.brief(card)).toBe("");
  });

  test("taken back from the change list, on the canvas or on the saved round, the brief and its marks go; the other changes stay", () => {
    const opened = openCanvas();
    const { doc, editor, changes, cards, layerOf } = opened;
    editor.set(layerOf(cards[0]), "radius", 4);
    editor.setBrief(layerOf(cards[0]), "Truncate the title past two lines");
    const brief = changes.list().find((change) => change.kind === "brief")!;
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };

    expect(editor.revert(brief.id)!.el).toBe(cards[0]);
    expect(changes.list().map((change) => change.kind)).toEqual(["style"]);
    expect(cards.some((c) => c.hasAttribute("data-ht-brief"))).toBe(false);
    editor.undo();
    expect(editor.brief(layerOf(cards[0]))).toBe("Truncate the title past two lines");

    const reverted = revertSaved(saved, brief.id)!;
    expect(reverted.changeSet.changes.map((change) => change.kind)).toEqual(["style"]);
    expect(new DOMParser().parseFromString(reverted.canvas, "text/html").querySelectorAll("[data-ht-brief]")).toHaveLength(0);
  });

  test("on a layer made this round, it goes with the change that made it; a copy of a layer that is there, with a brief, has none", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();
    const copy = editor.duplicate(layerOf(cards[3]));
    editor.setBrief(copy, "A card for the newest plan");
    expect(changes.list()[1]).toMatchObject({ kind: "brief", target: { made: copy.el.getAttribute("data-ht-layer") } });

    editor.setBrief(layerOf(cards[3]), "Bounce back harder");
    const again = editor.duplicate(editor.tree().layerOf(cards[3])!);
    expect(again.el.hasAttribute("data-ht-brief")).toBe(false);
    expect(editor.brief(again)).toBe("");

    editor.revert(changes.list()[0].id);
    expect(changes.list().map((change) => change.kind)).toEqual(["brief", "duplicate"]);
    expect(doc.querySelectorAll("[data-ht-brief]")).toHaveLength(1);
  });

  test("the live page cannot check a brief: no value shows it", async () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();
    editor.setBrief(layerOf(cards[0]), "Bounce back harder when pressed");

    expect(await checkChange(doc, changes.list()[0], onCanvas([changes.list()[0]]))).toEqual({
      outcome: "unchecked",
      reason: "a brief asks for what the Design panel cannot set, so the page has no value to check it by",
    });
  });

  test("loose text gets an element of its own to take a brief", () => {
    const { doc, editor, changes } = openCanvas(
      `<!DOCTYPE html><body><p data-ht-loc="src/App.tsx:4:5" ${chain(APP)}>Hello <span data-ht-loc="src/App.tsx:4:14" ${chain(APP)} style="display: inline-block">pill</span> world</p></body>`,
    );
    const run = find(editor.tree().root, (l) => l.name === "Hello")!;

    const own = editor.setBrief(run, "Keep it on one line");

    const span = doc.querySelector("[data-ht-brief]")!;
    expect(own.el).toBe(span);
    expect(span.localName).toBe("span");
    expect(span.textContent!.trim()).toBe("Hello");
    expect(changes.list()[0]).toMatchObject({ kind: "brief", target: { loc: "src/App.tsx:4:5", run: 0 } });
    expect(editor.brief(own)).toBe("Keep it on one line");
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
    expect(changes.list()[0]).toMatchObject({ kind: "text", data: true, before: "Card 2", after: "Second", instance: { nth: 2, words: "Card 2" } });
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
    expect(changes.list().map((c) => [c.kind, c.layer === doc.getElementById("b")!.getAttribute("data-ht-layer")])).toEqual([["move", true]]);

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
    // Which of them, as the page renders them: the first is still the first, though the second is deleted on the canvas.
    expect(changes.list().map((c) => c.instance)).toEqual([
      { nth: 2, words: "Card 2" },
      { nth: 1, words: "Card 1" },
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
      layer: copy.el.getAttribute("data-ht-layer"),
      target: { loc: "src/Card.tsx:4:7" },
      before: { nth: 1 },
      after: { nth: 2, absolute: null },
    });
    expect(changes.list()[1].target.made).toBeUndefined();
    // Its own layer: changed apart from the original.
    editor.set(copy, "opacity", 1);
    expect(style(cards[3].children[0]).opacity).toBe("0.5");
    expect(changes.list()[2].target).toMatchObject({ loc: "src/Card.tsx:4:7", made: copy.el.getAttribute("data-ht-layer") });

    editor.undo();
    editor.undo();
    expect(cards[3].children).toHaveLength(1);
  });

  test("an instance a loop renders is copied alone, as a data change", () => {
    const { editor, changes, cards, layerOf, doc } = openCanvas();

    editor.duplicate(layerOf(cards[1]));

    expect([...doc.querySelectorAll("article")].map((el) => el.querySelector("h3")!.textContent)).toEqual(["Card 1", "Card 2", "Card 2", "Card 3", "Your turn"]);
    expect(changes.list()[0]).toMatchObject({ kind: "duplicate", data: true, target: { instances: 3 }, instance: { nth: 2, words: "Card 2" } });
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
const loc = (at: string) => `data-ht-loc="src/App.tsx:${at}"`;
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

    expect(await checkChange(page, changes.list()[0], onCanvas([changes.list()[0]]))).toEqual({ outcome: "shown" });
    expect(await checkChange(page, changes.list()[1], onCanvas([changes.list()[1]]))).toEqual({ outcome: "shown" });
  });
});

describe("a layer wrapped in a new element on its own line", () => {
  test("the new element, which has the layer's old marker now, is not taken for the layer: the layer is found where its marker moved", () => {
    const { doc, editor, changes, layerOf } = openCanvas(STRUCTURE);
    editor.set(layerOf(doc.getElementById("one")!), "fontSize", 20);
    live = document.createElement("iframe");
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    // As an Agent writes it: a <div> on line 11 now, the paragraph, at 20px, on the line below, and every line after it one down.
    page.write(
      STRUCTURE.replace(loc("14:7"), loc("15:7"))
        .replace(loc("13:5"), loc("14:5"))
        .replace(loc("12:7"), loc("13:7"))
        .replace(`<p id="one" ${loc("11:7")} style="margin: 0">One</p>`, `<div ${loc("11:7")}><p id="one" ${loc("12:9")} style="margin: 0; font-size: 20px">One</p></div>`),
    );
    page.close();

    // Where it went, by the round's canvas as saved (ticket 99).
    expect(checkChange(page, changes.list()[0], placedOnCanvas([changes.list()[0]], doc.documentElement.outerHTML))).toEqual({ outcome: "shown" });
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
      const result = checkChange(page, change, onCanvas([change]));
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

  test("a stroke at 0 is shown by a border of 0, or none, as both draw nothing; not by one drawn", async () => {
    const { page, editor, changes, board, write } = open();
    write("border: 2px solid #ff0000");
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 2, style: "solid" });
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 0, style: "solid" });
    const [change] = changes.list();
    expect(change.after).toEqual({ color: "#FF0000", opacity: 1, weight: 0, style: "solid" });

    write("border: 0 solid #ff0000");
    expect(await check(page, change)).toEqual({ outcome: "shown" });
    write("");
    expect(await check(page, change)).toEqual({ outcome: "shown" });
    write("border: 2px solid #ff0000");
    expect(await check(page, change)).toMatchObject({ outcome: "not shown" });
  });

  test("asked by done while the dev server brings the edit in, the page answers once it shows: still wrong, then right", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
    const [change] = changes.list();
    write("border: 1px solid #ff0000");
    const reports: CheckReport[] = [];
    const checks = watchPage({ window: page.defaultView!, changes: onCanvas([change]), report: (r) => reports.push(r), onShown() {}, viewWidths: () => [], copiesIn: () => document.body });

    checks.ask({ ids: [change.id], at: new Date().toISOString(), key: "ask-1" });
    write("border: 3px solid #ff0000");
    await new Promise((resolve) => setTimeout(resolve, 20));
    write("border: 1.5px solid #ff0000");

    await expect.poll(() => reports.find((r) => r.answers === "ask-1")).toMatchObject({ outcome: "shown" });
    // What it saw as the code changed answers no ask: it carries no key, though it may carry the ask's millisecond.
    expect(reports.filter((r) => r.answers !== "ask-1").length).toBeGreaterThan(0);
    expect(reports.filter((r) => r.answers !== "ask-1").every((r) => !("answers" in r))).toBe(true);
    checks.stop();
  });

  test("asked by claim of a change carried over from a round before (ticket 68), the page says with the value it shows what sets it: asked by done, not", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
    const [change] = changes.list();
    write("border: 3px solid #ff0000");
    const reports: CheckReport[] = [];
    const checks = watchPage({ window: page.defaultView!, changes: onCanvas([change]), report: (r) => reports.push(r), onShown() {}, viewWidths: () => [], copiesIn: () => document.body });

    checks.ask({ ids: [change.id], at: new Date().toISOString(), key: "opening", sources: true });
    checks.ask({ ids: [change.id], at: new Date().toISOString(), key: "done" });

    await expect.poll(() => reports.find((r) => r.answers === "opening"), { timeout: 10_000 }).toMatchObject({
      outcome: "not shown",
      actual: { weight: 3 },
      sources: [expect.objectContaining({ kind: "inline", properties: expect.arrayContaining(["border-top-width"]) })],
    });
    await expect.poll(() => reports.find((r) => r.answers === "done"), { timeout: 10_000 }).toMatchObject({ outcome: "not shown" });
    expect(reports.find((r) => r.answers === "done")).not.toHaveProperty("sources");
    checks.stop();
  });

  test("shown, then undone by later code before done asks: the page sees it is no longer shown, and says so", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
    const [change] = changes.list();
    const shown: number[][] = [];
    const reports: CheckReport[] = [];
    const checks = watchPage({ window: page.defaultView!, changes: onCanvas([change]), report: (r) => reports.push(r), onShown: (ids) => shown.push(ids), viewWidths: () => [], copiesIn: () => document.body });

    write("border: 1.5px solid #ff0000");
    await expect.poll(() => shown.at(-1)).toEqual([change.id]);
    // A later edit of the code's takes it back out.
    write("border: 1px solid #ff0000");
    await expect.poll(() => shown.at(-1)).toEqual([]);
    expect(reports.at(-1)).toMatchObject({ id: change.id, outcome: "not shown", undone: true });
    checks.stop();
  });

  test("the dev server brought the code in just before the page began to check, and the page draws it a moment later (React, say): the page sees it show, with no further word", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
    const [change] = changes.list();
    write("border: 1px solid #ff0000");
    // The Agent's edit is in: the dev server said so before the page heard of the claim.
    const win = page.defaultView!;
    (win as unknown as Record<string, CodeUpdates>)[CODE_GLOBAL] = { at: Date.now(), updating: 0, inTurn: true };
    win.dispatchEvent(new Event(CODE_EVENT));
    const shown: number[][] = [];
    const reports: CheckReport[] = [];
    const checks = watchPage({ window: win, changes: onCanvas([change]), report: (r) => reports.push(r), onShown: (ids) => shown.push(ids), viewWidths: () => [], copiesIn: () => document.body });

    // The page's first look, before the page is drawn anew.
    await expect.poll(() => reports.at(-1)?.outcome).toBe("not shown");
    write("border: 1.5px solid #ff0000");

    await expect.poll(() => shown.at(-1)).toEqual([change.id]);
    checks.stop();
  });

  interface HotUpdatesFaked {
    begin(): void;
    end(): void;
    ask(key?: string): void;
    nextRound(): void;
    after(ms: number): Promise<void>;
    answer(key?: string): CheckReport | undefined;
    answered(key?: string): number | undefined;
  }

  /**
   * The page watched with word from its dev server on hot updates, the clock
   * faked (ticket 123): `begin` and `end` as Vite's `vite:beforeUpdate` and
   * `vite:afterUpdate`; `answered`, when `done`'s answer came, in ms after it
   * asked; `nextRound`, the checks stopped and begun anew on the same page,
   * as for the round after. `inTurn`, as `CodeUpdates.inTurn`: Vite 6.3.0
   * on, unless said otherwise (ticket 125).
   */
  const withUpdates = async (
    body: (page: ReturnType<typeof open>, hot: HotUpdatesFaked) => Promise<void>,
    { inTurn = true } = {},
  ) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    try {
      const opened = open();
      const { page, editor, changes, board, write } = opened;
      editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
      const [change] = changes.list();
      write("border: 1px solid #ff0000");
      const win = page.defaultView!;
      const code: CodeUpdates = { at: Date.now(), updating: 0, inTurn };
      (win as unknown as Record<string, CodeUpdates>)[CODE_GLOBAL] = code;
      const reports: CheckReport[] = [];
      /** By the ask's key: when it asked, then how long after it the answer came. */
      const asked = new Map<string, number>();
      const answeredAfter = new Map<string, number>();
      const watch = () =>
        watchPage({
          window: win,
          changes: onCanvas([change]),
          report(r) {
            reports.push(r);
            if (r.answers && !answeredAfter.has(r.answers)) answeredAfter.set(r.answers, performance.now() - asked.get(r.answers)!);
          },
          onShown() {},
          viewWidths: () => [],
          copiesIn: () => document.body,
        });
      let checks = watch();
      await vi.advanceTimersByTimeAsync(100);
      try {
        await body(opened, {
          begin() {
            code.updating++;
            win.dispatchEvent(new Event(CODE_EVENT));
          },
          end() {
            code.updating = Math.max(0, code.updating - 1);
            code.at = Date.now();
            win.dispatchEvent(new Event(CODE_EVENT));
          },
          ask(key = "done") {
            asked.set(key, performance.now());
            checks.ask({ ids: [change.id], at: new Date().toISOString(), key, codeAt: Date.now() });
          },
          nextRound() {
            checks.stop();
            checks = watch();
          },
          after: async (ms) => void (await vi.advanceTimersByTimeAsync(ms)),
          answer: (key = "done") => reports.find((r) => r.answers === key),
          answered: (key = "done") => answeredAfter.get(key),
        });
      } finally {
        checks.stop();
      }
    } finally {
      vi.useRealTimers();
    }
  };

  test("an update whose end never comes (vite:afterUpdate lost) holds done for PAGE_UPDATE_LOST_MS, not CHECK_ARRIVE_MS: the page answers as it would have, shown", async () => {
    await withUpdates(async ({ write }, hot) => {
      hot.begin();
      write("border: 1.5px solid #ff0000");
      hot.ask();
      await hot.after(PAGE_UPDATE_LOST_MS - 200);
      expect(hot.answer()).toBeUndefined();
      await hot.after(1000);
      expect(hot.answer()).toEqual(expect.objectContaining({ outcome: "shown" }));
      expect(hot.answered()).toBeLessThan(PAGE_UPDATE_LOST_MS + 1000);
    });
  });

  test("an update whose end never comes, the change not shown: the page says so once the update is taken as lost and the change has had its moment to show", async () => {
    await withUpdates(async ({ write }, hot) => {
      hot.begin();
      write("border: 3px solid #ff0000");
      hot.ask();
      await hot.after(PAGE_UPDATE_LOST_MS + CHECK_SETTLE_MS + 1000);
      expect(hot.answer()).toEqual(expect.objectContaining({ outcome: "not shown", actual: { color: "#FF0000", opacity: 1, weight: 3, style: "solid" } }));
      expect(hot.answered()).toBeLessThan(PAGE_UPDATE_LOST_MS + CHECK_SETTLE_MS + 1000);
    });
  });

  test("a slow update that ends within PAGE_UPDATE_LOST_MS is waited for to its end, as before", async () => {
    await withUpdates(async ({ write }, hot) => {
      // The page draws the edit before the update's end.
      hot.begin();
      hot.ask();
      write("border: 1.5px solid #ff0000");
      await hot.after(PAGE_UPDATE_LOST_MS - 1000);
      expect(hot.answer()).toBeUndefined();
      hot.end();
      await hot.after(1000);
      expect(hot.answer()).toEqual(expect.objectContaining({ outcome: "shown" }));
      expect(hot.answered()).toBeGreaterThanOrEqual(PAGE_UPDATE_LOST_MS - 1000);
    });
  });

  test("after an update that lost its end, each later one is waited for to its own end, and no longer: the lost one holds no later done", async () => {
    await withUpdates(async ({ write }, hot) => {
      // Lost: its end never comes.
      hot.begin();
      await hot.after(1000);
      // The next edit, a slow update: begun after the lost one, it is timed from its own beginning.
      hot.begin();
      hot.ask();
      write("border: 1.5px solid #ff0000");
      await hot.after(PAGE_UPDATE_LOST_MS - 1000);
      expect(hot.answer()).toBeUndefined();
      hot.end();
      await hot.after(1000);
      expect(hot.answer()).toEqual(expect.objectContaining({ outcome: "shown" }));
      // And the one after it, quick: answered once it is in and has had its moment to show, the lost one counted still.
      write("border: 3px solid #ff0000");
      hot.begin();
      hot.end();
      hot.ask("done again");
      await hot.after(PAGE_UPDATE_LOST_MS);
      expect(hot.answer("done again")).toEqual(expect.objectContaining({ outcome: "not shown", actual: { color: "#FF0000", opacity: 1, weight: 3, style: "solid" } }));
      expect(hot.answered("done again")).toBeLessThan(3000);
    });
  });

  test("a healthy update that takes 7s, the page drawing the edit only at its end, is waited for: shown, as before", async () => {
    await withUpdates(async ({ write }, hot) => {
      hot.begin();
      hot.ask();
      await hot.after(7000);
      expect(hot.answer()).toBeUndefined();
      write("border: 1.5px solid #ff0000");
      hot.end();
      await hot.after(1000);
      expect(hot.answer()).toEqual(expect.objectContaining({ outcome: "shown" }));
    });
  });

  test("an update that lost its end in one round holds no done in the next: the page's checks, begun anew, still know it lost", async () => {
    await withUpdates(async ({ write }, hot) => {
      hot.begin();
      await hot.after(1000);
      hot.begin();
      hot.end();
      hot.nextRound();
      // Asked with no update since (the edit in a file the page does not use, say): only as long as an edit that never comes is waited for.
      write("border: 1.5px solid #ff0000");
      hot.ask();
      await hot.after(CHECK_SETTLE_MS + 2000);
      expect(hot.answer()).toEqual(expect.objectContaining({ outcome: "shown" }));
      expect(hot.answered()).toBeLessThan(CHECK_SETTLE_MS + 1000);
    });
  });

  /**
   * Two updates side by side (ticket 125): A begins, B begins, A ends, and
   * the page draws the edit only as B ends, longer than `SHOW_MS` after A.
   * What `done` had answered before B's end.
   */
  const overlapping = async ({ write }: ReturnType<typeof open>, hot: HotUpdatesFaked) => {
    hot.begin();
    hot.begin();
    hot.ask();
    await hot.after(500);
    hot.end();
    await hot.after(4000);
    const early = hot.answer();
    write("border: 1.5px solid #ff0000");
    hot.end();
    await hot.after(1000);
    return early;
  };

  test("before Vite 6.3, two updates side by side: done waits for the later one's end, not only the first's, and answers shown", async () => {
    await withUpdates(
      async (page, hot) => {
        expect(await overlapping(page, hot)).toBeUndefined();
        expect(hot.answer()).toEqual(expect.objectContaining({ outcome: "shown" }));
      },
      { inTurn: false },
    );
  });

  test("from Vite 6.3, updates never overlap, so a second's beginning says the first is over: as in ticket 123, done answers once the first ends", async () => {
    await withUpdates(async (page, hot) => {
      expect(await overlapping(page, hot)).toEqual(expect.objectContaining({ outcome: "not shown" }));
    });
  });

  test("before Vite 6.3, an update that lost its end holds a later one only till PAGE_UPDATE_LOST_MS after the later one began, and none once it has gone that long with none begun", async () => {
    await withUpdates(
      async ({ write }, hot) => {
        // Lost: its end never comes.
        hot.begin();
        await hot.after(1000);
        // Begun beside it, as far as the page can say: the change not shown, waited for till PAGE_UPDATE_LOST_MS after it began.
        write("border: 3px solid #ff0000");
        hot.begin();
        hot.end();
        hot.ask();
        await hot.after(PAGE_UPDATE_LOST_MS - 500);
        expect(hot.answer()).toBeUndefined();
        await hot.after(CHECK_SETTLE_MS);
        expect(hot.answer()).toEqual(expect.objectContaining({ outcome: "not shown" }));
        // PAGE_UPDATE_LOST_MS on with none begun, the one left under way is taken as lost as the next begins: that one is answered once in.
        await hot.after(PAGE_UPDATE_LOST_MS);
        hot.begin();
        hot.end();
        hot.ask("done again");
        await hot.after(PAGE_UPDATE_LOST_MS);
        expect(hot.answer("done again")).toEqual(expect.objectContaining({ outcome: "not shown", actual: { color: "#FF0000", opacity: 1, weight: 3, style: "solid" } }));
        expect(hot.answered("done again")).toBeLessThan(3000);
      },
      { inTurn: false },
    );
  });

  test("shown, then gone from the page with its layer (another route, say): the page cannot check it, which is no word that it is undone", async () => {
    const { page, editor, changes, board, write } = open();
    editor.set(board, "stroke", { color: "#FF0000", opacity: 1, weight: 1.5, style: "solid" });
    const [change] = changes.list();
    const reports: CheckReport[] = [];
    const checks = watchPage({ window: page.defaultView!, changes: onCanvas([change]), report: (r) => reports.push(r), onShown() {}, viewWidths: () => [], copiesIn: () => document.body });

    write("border: 1.5px solid #ff0000");
    await expect.poll(() => reports.at(-1)?.outcome).toBe("shown");
    // Another route: nothing of this one's on the page.
    page.body.replaceChildren();
    await expect.poll(() => reports.at(-1)?.outcome).toBe("unchecked");
    expect(reports.at(-1)).not.toHaveProperty("undone");
    checks.stop();
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
  const open = (html = STRUCTURE) => {
    const canvas = openCanvas(html);
    live = document.createElement("iframe");
    live.style.width = "800px";
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(html);
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
    const lines = () => [...list.children].map((el, i) => el.setAttribute("data-ht-loc", `src/App.tsx:${6 + i}:7`));
    const check = async (change: (typeof changes.list extends () => (infer C)[] ? C : never)) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        const result = checkChange(page, change, onCanvas([change]));
        vi.advanceTimersByTime(CHECK_SETTLE_MS);
        return await result;
      } finally {
        vi.useRealTimers();
      }
    };

    // Not applied, but a line added above moves every marker down: still not shown.
    for (const el of list.children) el.setAttribute("data-ht-loc", el.getAttribute("data-ht-loc")!.replace(/:(\d+):/, (_, n) => `:${Number(n) + 1}:`));
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
      const result = checkChange(page, changes.list()[0], onCanvas([changes.list()[0]]));
      vi.advanceTimersByTime(CHECK_SETTLE_MS);
      expect(await result).toEqual({ outcome: "not shown", actual: "no reference" });
    } finally {
      vi.useRealTimers();
    }
    page.getElementById("board")!.style.position = "relative";
    expect(await checkChange(page, changes.list()[0], onCanvas([changes.list()[0]]))).toEqual({ outcome: "shown" });
  });

  /** The board's tag with margins, 2px on its left and 6px on its top. */
  const MARGINED = STRUCTURE.replace(`id="tag" ${loc("14:7")} style="`, `id="tag" ${loc("14:7")} style="margin: 6px 0 0 2px; `);

  test("a layer placed absolute is where the canvas draws it: past its X and Y by the margins it keeps there; one the code takes them off is not, and says so", () => {
    const { page, editor, changes, layer } = open(MARGINED);
    editor.move(layer("tag"), { parent: layer("board"), x: 40, y: 30 });
    const [placed] = changes.list();
    expect(placed.margins).toEqual({ x: 2, y: 6 });
    page.getElementById("board")!.style.position = "relative";
    const tag = page.getElementById("tag") as HTMLElement;

    // As the Agent writes it: `left` and `top` as given, its margins kept.
    Object.assign(tag.style, { position: "absolute", left: "40px", top: "30px" });
    expect(checkChange(page, placed, onCanvas([placed]))).toEqual({ outcome: "shown" });
    // Its margins taken off: drawn 2px and 6px off where the canvas draws it.
    tag.style.margin = "0px";
    expect(checkChange(page, placed, onCanvas([placed]))).toEqual({ outcome: "not shown", actual: { x: 40, y: 30, margins: { x: 0, y: 0 } } });
    // Their room put into `left` and `top`: drawn where the canvas draws it.
    Object.assign(tag.style, { left: "42px", top: "36px" });
    expect(checkChange(page, placed, onCanvas([placed]))).toEqual({ outcome: "shown" });
  });

  test("at the other views' widths, where the canvas's margins are not known, a layer with its margins put into its `left` and `top` is shown, as one that keeps them is", () => {
    const { page, editor, changes, layer } = open(MARGINED);
    editor.move(layer("tag"), { parent: layer("board"), x: 40, y: 30 });
    const [placed] = changes.list();
    page.getElementById("board")!.style.position = "relative";
    const tag = page.getElementById("tag") as HTMLElement;
    // The page at a view's width: here, as the page is.
    const viewWidth = (width: number): PageWidth => ({ width, doc: page, own: false, of: (el) => el });

    Object.assign(tag.style, { position: "absolute", left: "42px", top: "36px", margin: "0px" });
    expect(checkAcross(page, placed, onCanvas(changes.list()), [390], viewWidth)).toEqual({ outcome: "shown" });
    Object.assign(tag.style, { left: "40px", top: "30px", margin: "6px 0 0 2px" });
    expect(checkAcross(page, placed, onCanvas(changes.list()), [390], viewWidth)).toEqual({ outcome: "shown" });
  });

  test("the Y of an absolute layer is where the canvas draws it too: its `top`, past it by the top margin it keeps there", () => {
    const html = MARGINED.replace(`id="board" ${loc("13:5")} style="`, `id="board" ${loc("13:5")} style="position: relative; `).replace("display: inline-block;", "position: absolute; left: 12px; top: 8px;");
    const { page, editor, changes, layer } = open(html);
    editor.set(layer("tag"), "y", 30);
    const [y] = changes.list();
    expect(y).toMatchObject({ property: "y", after: 30, margins: { x: 2, y: 6 } });
    const tag = page.getElementById("tag") as HTMLElement;

    tag.style.top = "30px";
    expect(checkChange(page, y, onCanvas([y]))).toEqual({ outcome: "shown" });
    tag.style.margin = "0px";
    expect(checkChange(page, y, onCanvas([y]))).toEqual({ outcome: "not shown", actual: { value: 30, margin: 0 } });
    tag.style.top = "36px";
    expect(checkChange(page, y, onCanvas([y]))).toEqual({ outcome: "shown" });
  });

  test("the Y or `right` of a layer the page does not place absolute is not shown, and no value is read off it: it is not placed by them at all, its `top` or `right` written or not (ticket 80)", () => {
    const html = MARGINED.replace(`id="board" ${loc("13:5")} style="`, `id="board" ${loc("13:5")} style="position: relative; `).replace("display: inline-block;", "position: absolute; left: 12px; top: 8px;");
    const { page, editor, changes, layer } = open(html);
    editor.set(layer("tag"), "y", 30);
    editor.resize(layer("tag"), { right: 20 });
    const placing = changes.list().filter((change) => change.property === "y" || change.property === "right");
    expect(placing.map((change) => change.property)).toEqual(["y", "right"]);
    const tag = page.getElementById("tag") as HTMLElement;

    for (const position of ["static", "relative"]) {
      // Its `top` and `right` as the changes give them, but not absolute.
      Object.assign(tag.style, { position, top: "30px", right: "20px", margin: "0px" });
      for (const change of placing) expect(checkChange(page, change, onCanvas([change]))).toEqual({ outcome: "not shown", actual: null });
      Object.assign(tag.style, { top: "", right: "" });
      for (const change of placing) expect(checkChange(page, change, onCanvas([change]))).toEqual({ outcome: "not shown", actual: null });
    }
  });

  test("the `right` of a layer placed from its container's right edge is where the canvas draws it too: past it by the right margin it keeps there (ticket 75)", () => {
    const html = STRUCTURE.replace(`id="board" ${loc("13:5")} style="`, `id="board" ${loc("13:5")} style="position: relative; `).replace(
      `id="tag" ${loc("14:7")} style="`,
      `id="tag" ${loc("14:7")} style="margin: 0 4px 0 0; position: absolute; right: 12px; top: 8px; `,
    ).replace("display: inline-block;", "");
    const { page, editor, changes, layer } = open(html);
    editor.resize(layer("tag"), { right: 20 });
    const [right] = changes.list();
    expect(right).toMatchObject({ property: "right", before: 12, after: 20, margins: { x: 4, y: 0 }, style: { right: "20px" } });
    const tag = page.getElementById("tag") as HTMLElement;

    tag.style.right = "20px";
    expect(checkChange(page, right, onCanvas([right]))).toEqual({ outcome: "shown" });
    tag.style.margin = "0px";
    expect(checkChange(page, right, onCanvas([right]))).toEqual({ outcome: "not shown", actual: { value: 20, margin: 0 } });
    tag.style.right = "24px";
    expect(checkChange(page, right, onCanvas([right]))).toEqual({ outcome: "shown" });
    // Placed by its left instead, where the canvas draws it all the same: its `right` is not the one given.
    Object.assign(tag.style, { right: "auto", left: `${page.getElementById("board")!.clientWidth - 24 - tag.offsetWidth}px` });
    expect(checkChange(page, right, onCanvas([right]))).toEqual({ outcome: "shown" });
  });

  /**
   * The board as wide as the page, its tag placed from its right edge (ticket
   * 75); `phone`: CSS of the page's own at a phone's width, below 500px.
   */
  const fromTheRight = (phone = "") => `<!DOCTYPE html>
<body style="margin: 0">
  <style>
    #board { position: relative; height: 100px }
    #tag { position: absolute; right: 12px; top: 8px; width: 50px; height: 20px }
    @media (max-width: 500px) { #tag { ${phone} } }
  </style>
  <div id="board" ${loc("13:5")}><span id="tag" ${loc("14:7")}>Tag</span></div>
</body>`;
  const copies: HTMLIFrameElement[] = [];
  afterEach(() => copies.splice(0).forEach((frame) => frame.remove()));
  /** `html` shown `width` px wide, as the check shows the page at a view's width. */
  const pageAt = (html: string, width: number): PageWidth => {
    const frame = document.createElement("iframe");
    frame.style.width = `${width}px`;
    document.body.append(frame);
    copies.push(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    return { width, doc, own: false, of: (el) => doc.getElementById(el.id) };
  };

  test("a layer the canvas places from its right edge at every width: its `right` is looked at at every view's width, though the page places it by its left instead and is right as wide as its window (ticket 75, line review)", () => {
    const { page, editor, changes, layer } = open(fromTheRight());
    editor.resize(layer("tag"), { width: 40, right: 20 });
    const right = changes.list().find((change) => change.property === "right")!;
    expect(right).toMatchObject({ property: "right", before: 12, after: 20 });
    expect(right.placedOtherwiseAt).toBeUndefined();

    // Not as the notes say: placed by its left, where the canvas draws it as wide as the window, 800px.
    const byLeft = "left: 740px; right: auto; width: 40px";
    (page.getElementById("tag") as HTMLElement).style.cssText = byLeft;
    expect(checkChange(page, right, onCanvas([right]))).toEqual({ outcome: "shown" });
    // At the phone's width, the canvas has it 20px from the right; the page, 390px off it.
    const phone = pageAt(fromTheRight().replace("</style>", `#tag { ${byLeft} }</style>`), 390);
    expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "not shown", actual: { value: -390, margin: 0 }, width: 390 });
  });

  test("a layer the canvas places from its left edge in a view, as the page's breakpoints say: its `right` places nothing there, and is not looked at in the view's range, the page's window there or not (ticket 75)", async () => {
    const html = fromTheRight("left: 8px; right: auto");
    const { views, page, editor, changes, layer } = open(html);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    await views.add(phoneFrame, 390);
    editor.resize(layer("tag"), { width: 40, right: 20 });
    const right = changes.list().find((change) => change.property === "right")!;
    // The phone's range, beside the desktop view's.
    expect(right.placedOtherwiseAt).toEqual([{ min: null, max: 800 }]);

    // As the notes say, at every width; the page's own CSS places it by its left below 500px still.
    page.getElementById("tag")!.setAttribute("style", "right: 20px; width: 40px");
    const phone = pageAt(html.replace("</style>", "#tag { right: 20px; width: 40px } @media (max-width: 500px) { #tag { left: 8px; right: auto } }</style>"), 390);
    expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "shown" });
    // Looked at as wide as the page's window only.
    expect(widthsOf(right, changes.list(), 800, [390])).toEqual({ own: true, others: [] });
    expect(widthsOf(right, changes.list(), 390, [390])).toEqual({ own: false, others: [] });
  });

  /** The board as wide as the page, its tag placed freely from its top left; `phone`: CSS of the page's own at a phone's width, below 500px. */
  const fromTheTopLeft = (phone = "") => fromTheRight(phone).replace("right: 12px", "left: 12px");

  test("a layer the canvas lays out in its container in a view, as the page's breakpoints say: its X and Y place nothing there, and are not looked at in the view's range, the page's window there or not (ticket 83)", async () => {
    const html = fromTheTopLeft("position: static");
    const { views, page, editor, changes, layer } = open(html);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    await views.add(phoneFrame, 390);
    editor.set(layer("tag"), "x", 30);
    editor.set(layer("tag"), "y", 20);
    const [x, y] = changes.list();
    // The phone's range, beside the desktop view's.
    expect([x, y].map((change) => [change.property, change.placedOtherwiseAt])).toEqual([
      ["x", [{ min: null, max: 800 }]],
      ["y", [{ min: null, max: 800 }]],
    ]);

    // As the notes say, at every width; the page's own CSS lays it out in its container below 500px still.
    page.getElementById("tag")!.setAttribute("style", "left: 30px; top: 20px");
    const phone = pageAt(html.replace("</style>", "#tag { left: 30px; top: 20px } @media (max-width: 500px) { #tag { position: static } }</style>"), 390);
    for (const change of [x, y]) expect(checkAcross(page, change, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "shown" });
    // Looked at as wide as the page's window only; with the window in the phone's range too, at no width: not checked, and why.
    expect(widthsOf(x, changes.list(), 800, [390])).toEqual({ own: true, others: [] });
    expect(widthsOf(x, changes.list(), 390, [390])).toEqual({ own: false, others: [] });
    expect(checkAcross(phone.doc, x, onCanvas(changes.list()), [390], () => null)).toEqual({
      outcome: "unchecked",
      reason: "at the widths the page is looked at, the canvas does not place the layer absolute",
    });
  });

  test("a layer the canvas places absolute at every width: its X is looked at at every view's width, and the page laying it out in its container at the phone's width does not show it (ticket 83)", async () => {
    const html = fromTheTopLeft();
    const { views, page, editor, changes, layer } = open(html);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    await views.add(phoneFrame, 390);
    editor.set(layer("tag"), "x", 30);
    const [x] = changes.list();
    expect(x.placedOtherwiseAt).toBeUndefined();

    // Right as wide as the window; at the phone's width, not placed absolute at all.
    page.getElementById("tag")!.setAttribute("style", "left: 30px");
    const phone = pageAt(html.replace("</style>", "#tag { left: 30px } @media (max-width: 500px) { #tag { position: static } }</style>"), 390);
    expect(checkAcross(page, x, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "not shown", actual: null, width: 390 });
  });

  test.each(["relative", "sticky"])("a layer the canvas places %s in a view, as the page's breakpoints say: its X and Y move it there too, and are looked at in the view's range; the page giving it its `left` and `top` from `md` up only does not show them (ticket 83, review)", async (position) => {
    const html = fromTheTopLeft(`position: ${position}`);
    const { views, page, editor, changes, layer } = open(html);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    await views.add(phoneFrame, 390);
    editor.set(layer("tag"), "x", 30);
    editor.set(layer("tag"), "y", 20);
    const [x, y] = changes.list();
    expect([x.placedOtherwiseAt, y.placedOtherwiseAt]).toEqual([undefined, undefined]);

    // Right as wide as the window; at the phone's width, its `left` and `top` as the page had them (ticket 84: by its offset there, not as placed absolute).
    page.getElementById("tag")!.setAttribute("style", "left: 30px; top: 20px");
    const phone = pageAt(html.replace("</style>", "@media (min-width: 501px) { #tag { left: 30px; top: 20px } }</style>"), 390);
    expect([x, y].map((change) => checkAcross(page, change, onCanvas(changes.list()), [390], () => phone))).toEqual([
      { outcome: "not shown", actual: { canvas: position, position, offset: 12 }, width: 390 },
      { outcome: "not shown", actual: { canvas: position, position, offset: 8 }, width: 390 },
    ]);
  });

  test.each(["relative", "sticky"] as const)(
    "a layer the canvas places %s in a view: its X and Y record that range, where the check compares their value itself; written at every width, they show; laid out static there, placed absolute there, or placed so with another value, they do not (ticket 84)",
    async (position) => {
      const html = fromTheTopLeft(`position: ${position}`);
      const { views, page, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      editor.set(layer("tag"), "x", 30);
      editor.set(layer("tag"), "y", 20);
      const [x, y] = changes.list();
      for (const change of [x, y]) expect([change.placedOtherwiseAt, change.offsetInLayoutAt]).toEqual([undefined, [{ breakpoint: { min: null, max: 800 }, position }]]);

      const at = (css: string) => pageAt(html.replace("</style>", `${css}</style>`), 390);
      const check = (phone: PageWidth) => [x, y].map((change) => checkAcross(page, change, onCanvas(changes.list()), [390], () => phone));
      page.getElementById("tag")!.setAttribute("style", "left: 30px; top: 20px");
      // As the notes say, at every width: the phone's CSS places it as the canvas does there, moved by them.
      expect(check(at("#tag { left: 30px; top: 20px }"))).toEqual([{ outcome: "shown" }, { outcome: "shown" }]);
      // Laid out in its container there, or taken out of its layout: their values move it nothing there, or place it otherwise.
      for (const placed of ["static", "absolute"]) {
        const phone = at(`#tag { left: 30px; top: 20px } @media (max-width: 500px) { #tag { position: ${placed} } }`);
        expect(check(phone)).toEqual([0, 1].map(() => ({ outcome: "not shown", actual: { canvas: position, position: placed, offset: null }, width: 390 })));
      }
      // Placed as the canvas places it there, its `left` as the canvas has it, its `top` not.
      expect(check(at("#tag { left: 30px; top: 0px }"))).toEqual([{ outcome: "shown" }, { outcome: "not shown", actual: { canvas: position, position, offset: 0 }, width: 390 }]);
    },
  );

  test("a layer the canvas places sticky in a view: the page giving it its `top` there as a share is not the px given, though the number is the same (ticket 84, review)", async () => {
    const html = fromTheTopLeft("position: sticky");
    const { views, page, editor, changes, layer } = open(html);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    await views.add(phoneFrame, 390);
    editor.set(layer("tag"), "y", 20);
    const [y] = changes.list();
    page.getElementById("tag")!.setAttribute("style", "top: 20px");
    const phone = pageAt(html.replace("</style>", "#tag { top: 20% }</style>"), 390);
    expect(checkAcross(page, y, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "not shown", actual: { canvas: "sticky", position: "sticky", offset: null, written: "20%" }, width: 390 });
  });

  test.each(["relative", "sticky"] as const)(
    "a layer placed from its right edge that the canvas places %s in a view, with no `left` there: its `right` moves it there, so the change records that range, where the check compares the value itself (ticket 84)",
    async (position) => {
      const html = fromTheRight(`position: ${position}`);
      const { views, page, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      // Moved 20px left: placed from the right, its `right` is 20px more (ADR 0014).
      editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
      const [right] = changes.list();
      expect([right.property, right.before, right.after, right.placedOtherwiseAt, right.offsetInLayoutAt]).toEqual(["right", 12, 32, undefined, [{ breakpoint: { min: null, max: 800 }, position }]]);

      page.getElementById("tag")!.setAttribute("style", "right: 32px");
      const at = (css: string) => pageAt(html.replace("</style>", `${css}</style>`), 390);
      const check = (phone: PageWidth) => checkAcross(page, right, onCanvas(changes.list()), [390], () => phone);
      expect(check(at("#tag { right: 32px }"))).toEqual({ outcome: "shown" });
      // From `md` up only: at the phone's width, its `right` as the page had it.
      expect(check(at("@media (min-width: 501px) { #tag { right: 32px } }"))).toEqual({ outcome: "not shown", actual: { canvas: position, position, offset: 12 }, width: 390 });
    },
  );

  test("a layer placed from its right edge that the canvas places relative in a view, with a `left` there: its `right` moves nothing there, and is not looked at in the view's range, as before (ticket 84)", async () => {
    const { views, editor, changes, layer } = open(fromTheRight("position: relative; left: 8px"));
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    await views.add(phoneFrame, 390);
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    const [right] = changes.list();
    expect([right.property, right.placedOtherwiseAt, right.offsetInLayoutAt]).toEqual(["right", [{ min: null, max: 800 }], undefined]);
  });

  test("the page placing a layer relative by its `left` and its `right` both: the `left` moves it, so a `right` of the change's value does not show (ticket 84)", async () => {
    const html = fromTheRight("position: relative");
    const { views, page, editor, changes, layer } = open(html);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    await views.add(phoneFrame, 390);
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    const [right] = changes.list();
    page.getElementById("tag")!.setAttribute("style", "right: 32px");
    const phone = pageAt(html.replace("</style>", "#tag { right: 32px } @media (max-width: 500px) { #tag { left: 8px } }</style>"), 390);
    expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "not shown", actual: { canvas: "relative", position: "relative", offset: -8 }, width: 390 });
  });

  /** `html` laid out right to left, as an Arabic or Hebrew site is: `dir="rtl"` on its body (ticket 89). */
  const rightToLeft = (html: string) => html.replace("<body", '<body dir="rtl"');

  test.each([
    ["left to right", (html: string) => html, [{ min: null, max: 800 }], undefined],
    ["right to left", rightToLeft, undefined, [{ breakpoint: { min: null, max: 800 }, position: "relative" }]],
  ] as const)(
    "a layer placed from its right edge that the canvas places relative in a view by its `left` and its `right` both, %s: the browser goes by its `left` left to right, where its `right` moves nothing, and by its `right` right to left, where the check compares how far that moves it (ticket 89)",
    async (_, laidOut, placedOtherwiseAt, offsetInLayoutAt) => {
      const html = laidOut(fromTheRight("position: relative; left: 8px"));
      const { views, page, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
      const [right] = changes.list();
      expect([right.property, right.before, right.after, right.placedOtherwiseAt, right.offsetInLayoutAt]).toEqual(["right", 12, 32, placedOtherwiseAt, offsetInLayoutAt]);
      if (!offsetInLayoutAt) return;

      page.getElementById("tag")!.setAttribute("style", "right: 32px");
      const at = (css: string) => pageAt(html.replace("</style>", `${css}</style>`), 390);
      const check = (phone: PageWidth) => checkAcross(page, right, onCanvas(changes.list()), [390], () => phone);
      // At every width, its `left` kept on phones: its `right` moves it 32px left.
      expect(check(at("#tag { right: 32px }"))).toEqual({ outcome: "shown" });
      // From `md` up only: on phones, its `right` as the page had it moves it 12px left.
      expect(check(at("@media (min-width: 501px) { #tag { right: 32px } }"))).toEqual({ outcome: "not shown", actual: { canvas: "relative", position: "relative", offset: 12 }, width: 390 });
    },
  );

  test.each([
    ["left to right", (html: string) => html, { outcome: "shown" }],
    ["right to left", rightToLeft, { outcome: "not shown", actual: { canvas: "relative", position: "relative", offset: -5 }, width: 390 }],
  ] as const)(
    "the page placing a layer relative by its `left` and its `right` both, %s: the browser goes by its `left` left to right, so an X of its `left` shows, and by its `right` right to left, so it does not (ticket 89)",
    async (_, laidOut, result) => {
      const html = laidOut(fromTheTopLeft("position: relative"));
      const { views, page, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      editor.set(layer("tag"), "x", 30);
      const [x] = changes.list();
      expect(x.offsetInLayoutAt).toEqual([{ breakpoint: { min: null, max: 800 }, position: "relative" }]);
      page.getElementById("tag")!.setAttribute("style", "left: 30px");
      // Its `left` as the change has it at every width; on phones, a `right` of the page's own too, which moves it 5px left right to left.
      const phone = pageAt(html.replace("</style>", "#tag { left: 30px } @media (max-width: 500px) { #tag { right: 5px } }</style>"), 390);
      expect(checkAcross(page, x, onCanvas(changes.list()), [390], () => phone)).toEqual(result);
    },
  );

  test.each([
    ["left to right", (html: string) => html, [{ min: null, max: 800 }]],
    ["right to left", rightToLeft, undefined],
  ] as const)(
    "a layer placed from its right edge that the canvas places absolute in a view by its `left` and its `right` both, as wide as it is set, %s: its `right` places nothing there left to right, and places it right to left, where it is looked at (ticket 89)",
    async (_, laidOut, placedOtherwiseAt) => {
      const html = laidOut(fromTheRight("left: 8px"));
      const { views, page, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
      const [right] = changes.list();
      expect([right.property, right.after, right.placedOtherwiseAt]).toEqual(["right", 32, placedOtherwiseAt]);
      if (placedOtherwiseAt) return;

      page.getElementById("tag")!.setAttribute("style", "right: 32px");
      const at = (css: string) => pageAt(html.replace("</style>", `${css}</style>`), 390);
      const check = (phone: PageWidth) => checkAcross(page, right, onCanvas(changes.list()), [390], () => phone);
      expect(check(at("#tag { right: 32px }"))).toEqual({ outcome: "shown" });
      expect(check(at("@media (min-width: 501px) { #tag { right: 32px } }"))).toEqual({ outcome: "not shown", actual: { value: 12, margin: 0 }, width: 390 });
    },
  );

  test("a layer placed from its right edge that the canvas places absolute in a view by its `left` and its `right` both, as wide as it is set, centered there by auto margins, right to left: neither side wins there, so its `right` is taken to place nothing there, as left to right (ticket 94, review)", async () => {
    const { views, editor, changes, layer } = open(rightToLeft(fromTheRight("left: 8px; margin-inline: auto")));
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    await views.add(phoneFrame, 390);
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    const [right] = changes.list();
    expect([right.property, right.after, right.placedOtherwiseAt]).toEqual(["right", 32, [{ min: null, max: 800 }]]);
  });

  test.each([
    ["left to right", (html: string) => html, { outcome: "shown" }],
    ["right to left", rightToLeft, { outcome: "not shown", actual: { value: 335, margin: 0 }, width: 390 }],
  ] as const)(
    "the page placing a layer absolute by its `left` and its `right` both, as wide as it is set, %s: an X of its `left` shows left to right; right to left, the browser places it by its `right`, so it does not, and the check says where its left edge is drawn (ticket 89, review)",
    async (_, laidOut, result) => {
      const html = laidOut(fromTheTopLeft());
      const { views, page, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      editor.set(layer("tag"), "x", 30);
      const [x] = changes.list();
      expect(x.placedOtherwiseAt).toBeUndefined();
      page.getElementById("tag")!.setAttribute("style", "left: 30px");
      // Its `left` as the change has it at every width; on phones, a `right` of the page's own too: 390 - 5 - 50 is 335px.
      const at = (css: string) => pageAt(html.replace("</style>", `${css}</style>`), 390);
      const check = (phone: PageWidth) => checkAcross(page, x, onCanvas(changes.list()), [390], () => phone);
      expect(check(at("#tag { left: 30px } @media (max-width: 500px) { #tag { right: 5px } }"))).toEqual(result);
      // As the notes say, its `right` let go: shown either way.
      expect(check(at("#tag { left: 30px; right: auto }"))).toEqual({ outcome: "shown" });
    },
  );

  test("the page placing a layer absolute by its `left` and its `right` both, as wide as it is set, left to right: the browser places it by its `left`, so a `right` of the change's value does not show, and the check says where its right edge is drawn (ticket 89, review)", async () => {
    const html = fromTheRight();
    const { page, editor, changes, layer } = open(html);
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    const [right] = changes.list();
    page.getElementById("tag")!.setAttribute("style", "right: 32px");
    // On phones, a `left` of the page's own too: 390 - 8 - 50 is 332px.
    const phone = pageAt(html.replace("</style>", "#tag { right: 32px } @media (max-width: 500px) { #tag { left: 8px } }</style>"), 390);
    expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "not shown", actual: { value: 332, margin: 0 }, width: 390 });
  });

  /** A page with no element placed otherwise than static round its tag, so the window places it: `html`, `body` and `phone` as `fromTheRight` has them (ticket 89, review). */
  const byTheWindow = (tag: string, phone: string, html = "<html>", body = "<body") => `<!DOCTYPE html>
${html}${body} style="margin: 0">
  <style>
    #board { height: 100px }
    #tag { ${tag}; top: 8px; width: 50px; height: 20px }
    @media (max-width: 500px) { #tag { ${phone} } }
  </style>
  <div id="board" ${loc("13:5")}><span id="tag" ${loc("14:7")}>Tag</span></div>
</body></html>`;

  test.each([
    ["absolute, `dir` on the body", "position: absolute; left: 12px", "<html>", '<body dir="rtl"', { outcome: "not shown", actual: { value: 335, margin: 0 }, width: 390 }],
    ["fixed, `dir` on the body", "position: fixed; left: 12px", "<html>", '<body dir="rtl"', { outcome: "not shown", actual: { value: 335, margin: 0 }, width: 390 }],
    ["absolute, right to left on the root but left to right on the body", "position: absolute; left: 12px", '<html dir="rtl">', '<body dir="ltr"', { outcome: "shown" }],
  ] as const)(
    "a layer the window places, %s: the browser goes by the body's direction for the window, so an X of its `left` with a `right` of the page's own too is drawn by the side that direction has (ticket 89, review)",
    async (_, tag, root, body, result) => {
      const html = byTheWindow(tag, "right: 5px", root, body);
      const { views, page, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      editor.set(layer("tag"), "x", 30);
      const [x] = changes.list();
      expect([x.property, x.placedOtherwiseAt]).toEqual(["x", undefined]);
      page.getElementById("tag")!.setAttribute("style", "left: 30px");
      // Its `left` as the change has it at every width; on phones, a `right` of the page's own too: 390 - 5 - 50 is 335px.
      const phone = pageAt(html.replace("</style>", "#tag { left: 30px }</style>"), 390);
      expect(checkAcross(page, x, onCanvas(changes.list()), [390], () => phone)).toEqual(result);
    },
  );

  test.each([
    ["the body right to left", "<html>", '<body dir="rtl"', "right"],
    ["the root right to left, the body left to right", '<html dir="rtl">', '<body dir="ltr"', "x"],
  ] as const)("a layer the window places by its `left` and its `right` both, as wide as it is set, %s: moved, it is moved by the side the browser goes by for the window (ticket 89, review)", (_, root, body, property) => {
    const { editor, changes, layer } = open(byTheWindow("position: absolute; left: 8px; right: 12px", "", root, body));
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    expect(changes.list().map((change) => change.property)).toEqual([property]);
  });

  test.each([
    ["`inset-inline-start`, right to left", "inset-inline-start: 12px", rightToLeft, "right", 32],
    ["`inset-inline`, left to right", "inset-inline: 8px 12px", (html: string) => html, "x", -12],
    ["`inset-inline`, right to left", "inset-inline: 8px 12px", rightToLeft, "right", 28],
  ] as const)("a layer placed absolute by %s: the logical side places it from the edge the direction has, so moved, that side changes (ticket 89, review)", (_, inset, laidOut, property, after) => {
    const { doc, editor, changes, layer } = open(laidOut(fromTheRight().replace("right: 12px", inset)));
    const tag = doc.getElementById("tag")!;
    const was = tag.getBoundingClientRect().left;
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    expect(changes.list().map((change) => [change.property, change.after])).toEqual([[property, after]]);
    expect(tag.getBoundingClientRect().left).toBeCloseTo(was - 20, 1);
  });

  test.each([
    ["held by `max-width`, left to right", "right", (html: string) => html, "#tag { right: 32px } @media (max-width: 500px) { #tag { left: 8px; width: auto; max-width: 50px } }", 332],
    ["a canvas as wide as it draws, right to left", "x", rightToLeft, "#tag { left: 30px; width: auto } @media (max-width: 500px) { #tag { right: 5px } }", 335],
  ] as const)("the page placing a layer absolute by both its sides, as large as %s, not as its `width` says: the check reads where the browser places it, by the side it goes by (ticket 89, review)", async (_, property, laidOut, css, value) => {
    const html = laidOut(property === "x" ? fromTheTopLeft() : fromTheRight());
    const { page, editor, changes, layer } = open(html);
    if (property === "x") editor.set(layer("tag"), "x", 30);
    else editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    const [change] = changes.list();
    expect(change.property).toBe(property);
    page.getElementById("tag")!.setAttribute("style", property === "x" ? "left: 30px" : "right: 32px");
    const phoneHtml = html.replace("</style>", `${css}</style>`);
    const phone = pageAt(property === "x" ? phoneHtml.replace(/<span id="tag" ([^>]*)>Tag<\/span>/, '<canvas id="tag" $1 width="50" height="20"></canvas>') : phoneHtml, 390);
    expect(checkAcross(page, change, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "not shown", actual: { value, margin: 0 }, width: 390 });
  });

  test.each([
    ["filter: blur(0)", "shown"],
    ["backdrop-filter: blur(0)", "shown"],
    ["contain: paint", "shown"],
    ["will-change: transform", "shown"],
    ["translate: 0 0", "shown"],
    ["transform: translateX(0)", "shown"],
    ["perspective: 100px", "shown"],
    ["container-type: inline-size", "not shown"],
  ] as const)(
    "the page placing a layer absolute by both its sides in a box with %s, 200px wide, in its positioned board: the browser places it in that box or the board as CSS has it, and the check measures the room there (ticket 89, review)",
    (style, outcome) => {
      const html = fromTheRight().replace(/<span id="tag" ([^>]*)>Tag<\/span>/, `<div style="${style}; width: 200px"><span id="tag" $1>Tag</span></div>`);
      const { page, editor, changes, layer } = open(html);
      editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
      const [right] = changes.list();
      expect([right.property, right.after]).toEqual(["right", 32]);
      page.getElementById("tag")!.setAttribute("style", "right: 32px");
      // As wide as the box: 118 + 50 + 32 is 200, so drawn where the canvas has it; in the board, 390 - 118 - 50 is 222.
      const phone = pageAt(html.replace("</style>", "@media (max-width: 500px) { #tag { right: 32px; left: 118px } }</style>"), 390);
      expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => phone)).toEqual(
        outcome === "shown" ? { outcome } : { outcome, actual: { value: 222, margin: 0 }, width: 390 },
      );
    },
  );

  test.each([
    ["`display: contents`", '<div dir="ltr" style="display: contents">', "</div>", ""],
    ["an inline `<span>`", '<span dir="ltr">', "</span>", ""],
    ["none, the layer itself", "", "", ' dir="ltr"'],
  ] as const)(
    "right to left, a layer placed relative by its `left` and its `right` both, in a box left to right that holds no layout of its own, %s: the browser goes by the block that lays it out, so its `right` moves it (ticket 89, review)",
    async (_, open1, close, own) => {
      const html = rightToLeft(fromTheRight("position: relative; left: 8px"))
        .replace(/<span id="tag" ([^>]*)>Tag<\/span>/, `${open1}<span id="tag"${own} $1>Tag</span>${close}`);
      const { views, page, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
      const [right] = changes.list();
      expect([right.property, right.placedOtherwiseAt, right.offsetInLayoutAt]).toEqual(["right", undefined, [{ breakpoint: { min: null, max: 800 }, position: "relative" }]]);
      page.getElementById("tag")!.setAttribute("style", "right: 32px");
      const phone = pageAt(html.replace("</style>", "#tag { right: 32px }</style>"), 390);
      expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "shown" });
    },
  );

  test.each([
    ["left to right", (html: string) => html],
    ["right to left", rightToLeft],
  ] as const)("the page placing a layer absolute by its `top` and its `bottom` both, as tall as it is set, %s: the browser goes by its `top`, so a `bottom` of the change's value does not show, and the check says where its bottom edge is drawn (ticket 89, review)", (_, laidOut) => {
    const html = laidOut(fromTheRight().replace("right: 12px; top: 8px", "left: 8px; bottom: 12px"));
    const { page, editor, changes, layer } = open(html);
    editor.set(layer("tag"), "y", editor.read(layer("tag"), "y")! - 20);
    const [bottom] = changes.list();
    expect([bottom.property, bottom.after]).toEqual(["bottom", 32]);
    page.getElementById("tag")!.setAttribute("style", "bottom: 32px");
    // On phones, a `top` of the page's own too: 100 - 8 - 20 is 72px.
    const phone = pageAt(html.replace("</style>", "#tag { bottom: 32px } @media (max-width: 500px) { #tag { top: 8px } }</style>"), 390);
    expect(checkAcross(page, bottom, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "not shown", actual: { value: 72, margin: 0 }, width: 390 });
  });

  test.each([
    ["content-box", 302],
    ["border-box", 312],
  ] as const)("the page placing a layer absolute by its `left` and its `right` both, with margins, padding and a border, sized as %s, in a board with a border: the check reads its `right` as what is left of the board's room inside its border (ticket 89, review)", (box, value) => {
    const html = fromTheRight();
    const { page, editor, changes, layer } = open(html);
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    const [right] = changes.list();
    page.getElementById("tag")!.setAttribute("style", "right: 32px");
    // 390 less the board's border, 380; less its `left`, its margins, its size: 8, 6 and 4, 50 and, as content, 3 + 3 + 2 + 2 more.
    const css = `#tag { right: 32px } #board { border: 5px solid } @media (max-width: 500px) { #tag { left: 8px; margin: 0 4px 0 6px; padding: 0 3px; border: 2px solid; box-sizing: ${box} } }`;
    const phone = pageAt(html.replace("</style>", `${css}</style>`), 390);
    expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "not shown", actual: { value, margin: 4 }, width: 390 });
  });

  test.each(["transform: scale(0.5)", "rotate: 10deg"])(
    "left to right, the page placing a layer from its right edge alone in a board drawn otherwise than laid out, by `%s`: its `right` as the change has it shows, as the board is laid out, not as it is drawn (ticket 89, re-review)",
    (drawn) => {
      const html = fromTheRight();
      const { page, editor, changes, layer } = open(html);
      editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
      const [right] = changes.list();
      page.getElementById("tag")!.setAttribute("style", "right: 32px");
      const phone = pageAt(html.replace("</style>", `#tag { right: 32px } #board { ${drawn} }</style>`), 390);
      expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "shown" });
      // Given its `left` too, as wide as it is set: by its `left` still, 390 - 8 - 50 is 332px in the board as laid out.
      const both = pageAt(html.replace("</style>", `#tag { right: 32px } #board { ${drawn} } @media (max-width: 500px) { #tag { left: 8px } }</style>`), 390);
      expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => both)).toEqual({ outcome: "not shown", actual: { value: 332, margin: 0 }, width: 390 });
    },
  );

  test.each([
    ["one value", "inset: 0", "x", "y"],
    ["two values", "inset: auto 0", "x", "y"],
    ["three values", "inset: 0 0 auto 0", "x", "y"],
    ["three values, from the bottom", "inset: auto 0 0", "x", "bottom"],
    ["four values", "inset: auto 0 0 auto", "right", "bottom"],
  ] as const)("left to right, a layer placed absolute by `inset` with %s, `%s`: moved, it is moved by the side each axis is placed from, as `inset` gives them (ticket 89, re-review)", (_, inset, across, down) => {
    const { editor, changes, layer } = open(fromTheRight().replace("right: 12px; top: 8px", inset));
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    editor.set(layer("tag"), "y", editor.read(layer("tag"), "y")! + 10);
    expect(changes.list().map((change) => change.property)).toEqual([across, down]);
  });

  test.each([
    ["`inset-inline-end`, as Tailwind's `end-4` writes it", "inset-inline-end: 16px"],
    ["`inset-inline` with two values", "inset-inline: auto 16px"],
  ])("left to right, a layer placed absolute by %s: placed from its right, so moved, its `right` changes, as ADR 0014 has it (ticket 89, re-review: a change from main)", (_, inset) => {
    const { editor, changes, layer } = open(fromTheRight().replace("right: 12px", inset));
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    expect(changes.list().map((change) => [change.property, change.before, change.after])).toEqual([["right", 16, 36]]);
  });

  test.each([
    ["left to right", (html: string) => html, [{ min: null, max: 800 }]],
    ["right to left", rightToLeft, undefined],
  ] as const)(
    "a `<canvas>` placed from its right edge that the canvas places absolute in a view by its `left` and its `right` both, as wide as it draws, no width set, %s: right to left, its `right` places it there, and it is looked at (ticket 89, re-review)",
    async (_, laidOut, placedOtherwiseAt) => {
      const html = laidOut(fromTheRight("left: 8px").replace("width: 50px; height: 20px", "").replace(/<span id="tag" ([^>]*)>Tag<\/span>/, '<canvas id="tag" $1 width="50" height="20"></canvas>'));
      const { views, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
      const [right] = changes.list();
      expect([right.property, right.placedOtherwiseAt]).toEqual(["right", placedOtherwiseAt]);
    },
  );

  test("the page placing a layer absolute by its `left` and its `right` both, as wide as it is set, left to right, its `right` not the change's but its `left` putting it where the canvas has it: shown, by where it is drawn (ticket 89, review)", () => {
    const html = fromTheRight();
    const { page, editor, changes, layer } = open(html);
    editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
    const [right] = changes.list();
    page.getElementById("tag")!.setAttribute("style", "right: 32px");
    // 308 + 50 + 32 is 390: its stale `right` places nothing.
    const phone = pageAt(html.replace("</style>", "@media (max-width: 500px) { #tag { right: 99px; left: 308px } }</style>"), 390);
    expect(checkAcross(page, right, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "shown" });
  });

  test.each([
    ["left to right", (html: string) => html, "x", "start"],
    ["right to left", rightToLeft, "right", "end"],
  ] as const)(
    "a layer placed absolute by its `left` and its `right` both, as wide as it is set, %s: the browser places it from its left left to right, from its right right to left, so moved, that side changes, and resized, its left edge stays (ticket 89)",
    (_, laidOut, property, edge) => {
      const { doc, editor, changes, layer } = open(laidOut(fromTheRight().replace("right: 12px", "left: 8px; right: 12px")));
      const tag = doc.getElementById("tag")!;
      const left = () => tag.getBoundingClientRect().left;
      const was = left();
      editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
      expect(changes.list().map((change) => change.property)).toEqual([property]);
      // Drawn 20px further left, as moved.
      expect(left()).toBeCloseTo(was - 20, 1);

      editor.set(layer("tag"), "width", { type: "fixed", value: 40 });
      expect(changes.list().find((change) => change.property === "width")?.placedFrom).toEqual(edge === "end" ? { edge, centered: false } : undefined);
      expect(left()).toBeCloseTo(was - 20, 1);
    },
  );

  /** The ticket's example: a board 400px wide, its tag placed by its `left` and its `right` both, 50px wide (ticket 94). */
  const bothSides = `<!DOCTYPE html>
<body style="margin: 0">
  <style>
    #board { position: relative; width: 400px; height: 100px }
    #tag { position: absolute; left: 10px; right: 30px; top: 8px; width: 50px; height: 20px }
  </style>
  <div id="board" ${loc("13:5")}><span id="tag" ${loc("14:7")}>Tag</span></div>
</body>`;

  test.each([
    ["left to right", (html: string) => html, 10, [["x", 10, 300]]],
    ["right to left", rightToLeft, 320, [["right", 30, 50]]],
  ] as const)(
    "a layer placed absolute by its `left` and its `right` both, as wide as it is set, %s: its X reads where the browser draws it from its container's left, and an X typed, a nudge or a drag lands it there, by the side the browser goes by (ticket 94)",
    (_, laidOut, x, changed) => {
      const { doc, editor, changes, layer } = open(laidOut(bothSides));
      const tag = doc.getElementById("tag")!;
      const drawn = () => tag.getBoundingClientRect().left - doc.getElementById("board")!.getBoundingClientRect().left;
      expect(drawn()).toBeCloseTo(x, 1);
      expect([editor.read(layer("tag"), "x"), editor.read(layer("tag"), "y"), editor.read(layer("tag"), "absolute")]).toEqual([x, 8, { x, y: 8 }]);
      const moves = [
        ["typed", () => editor.set(layer("tag"), "x", 300)],
        ["nudged", () => editor.nudge([layer("tag")], 300 - x, 0)],
        ["dragged", () => editor.move(layer("tag"), { parent: layer("board"), x: 300, y: 8 })],
      ] as const;
      for (const [how, move] of moves) {
        move();
        expect([how, changes.list().map((change) => [change.property, change.before, change.after])]).toEqual([how, changed]);
        expect([how, drawn()]).toEqual([how, expect.closeTo(300, 1)]);
        expect([how, editor.read(layer("tag"), "x")]).toEqual([how, 300]);
        editor.undo();
        expect([how, drawn()]).toEqual([how, expect.closeTo(x, 1)]);
      }
    },
  );

  test.each([
    ["left to right", (html: string) => html],
    ["right to left", rightToLeft],
  ] as const)(
    "a layer placed absolute by its `left` and its `right` both, as wide as it is set, centered by auto margins (`inset-x-0 mx-auto`), %s: the margins take up the room, so neither side wins; centered by them, its X reads where it is drawn, and an X typed, a nudge or a drag lands it there (ticket 94, review; ticket 96)",
    (_, laidOut) => {
      const { doc, editor, changes, layer } = open(laidOut(bothSides.replace("left: 10px; right: 30px", "left: 0; right: 0; margin-inline: auto")));
      const tag = doc.getElementById("tag")!;
      const drawn = () => tag.getBoundingClientRect().left - doc.getElementById("board")!.getBoundingClientRect().left;
      expect([drawn(), editor.read(layer("tag"), "x")]).toEqual([expect.closeTo(175, 1), 175]);
      const moves = [
        ["typed", () => editor.set(layer("tag"), "x", 300), 300],
        ["nudged", () => editor.nudge([layer("tag")], -20, 0), 155],
        ["dragged", () => editor.move(layer("tag"), { parent: layer("board"), x: 300, y: 8 }), 300],
      ] as const;
      for (const [how, move, x] of moves) {
        move();
        expect([how, changes.list().map((change) => [change.property, change.before, change.after])]).toEqual([how, [["x", 175, x]]]);
        expect([how, drawn()]).toEqual([how, expect.closeTo(x, 1)]);
        editor.undo();
        expect([how, drawn()]).toEqual([how, expect.closeTo(175, 1)]);
      }
    },
  );

  test("a layer placed absolute by its `left` and its `right` both, held 50px wide by its `max-width`, right to left: resized from its left handle, its left edge goes as far as the handle, from where it is drawn (ticket 94, review)", () => {
    const { doc, editor, layer } = open(rightToLeft(bothSides.replace("width: 50px", "max-width: 50px")));
    const tag = doc.getElementById("tag")!;
    const drawn = () => tag.getBoundingClientRect().left - doc.getElementById("board")!.getBoundingClientRect().left;
    const view = { boxOf: (l: Layer) => l.el.getBoundingClientRect(), elementOf: (el: Element) => el };
    const session: ResizeSession = { pointerId: 1, layer: layer("tag"), in: { view } as unknown as Shown, handle: "w", from: { clientX: 0, clientY: 0 }, begun: null, stepped: false, set: new Set(), release: () => {} };
    const step = resizeStep(session, editor, { clientX: 20, clientY: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 1, 0)!;
    expect(step.to).toEqual({ width: 30, x: 340 });
    editor.resize(layer("tag"), step.to);
    expect([drawn(), tag.getBoundingClientRect().width]).toEqual([expect.closeTo(340, 1), expect.closeTo(30, 1)]);
  });

  test("a layer placed absolute by its `left` and its `right` both, as wide as it is set, right to left, moved into another Frame: its place before is where it is drawn, so the move taken back puts it there again (ticket 94, review)", () => {
    const html = rightToLeft(bothSides.replace("</div>", `</div><div id="other" ${loc("15:5")} style="position: relative; width: 200px; height: 100px"></div>`));
    const { doc, editor, changes, layer } = open(html);
    const tag = () => doc.getElementById("tag")!;
    const drawn = () => tag().getBoundingClientRect().left - doc.getElementById("board")!.getBoundingClientRect().left;
    editor.move(layer("tag"), { parent: layer("other"), x: 10, y: 10 });
    const [moved] = changes.list();
    expect((moved.before as Place).absolute).toMatchObject({ x: 320, y: 8, placed: { x: { edge: "end", px: 30 } } });
    editor.revert(moved.id);
    expect(tag().parentElement!.id).toBe("board");
    expect(drawn()).toBeCloseTo(320, 1);
  });

  test("a layer placed absolute whose `left` computes to `auto`, under an element not shown: its X reads as no number, as before ticket 94 (ticket 94, review)", () => {
    const { doc } = open(bothSides.replace('<span id="tag"', '<div style="display: none"><span id="hidden" style="position: absolute">Hidden</span></div><span id="tag"'));
    const hidden = doc.getElementById("hidden")!;
    expect(getComputedStyle(hidden).left).toBe("auto");
    expect([definitionOf("x").read(hidden, undefined as never), definitionOf("y").read(hidden, undefined as never)]).toEqual([NaN, NaN]);
  });

  test("a layer placed absolute by its `left` and its `right` both, held 50px wide by its `max-width`, right to left: its X reads where the browser draws it, and an X typed lands it there, written as X, as the canvas reads its width from what is declared (ticket 94, ticket 89's 代定 2)", () => {
    const { doc, editor, changes, layer } = open(rightToLeft(bothSides.replace("width: 50px", "max-width: 50px")));
    const tag = doc.getElementById("tag")!;
    const drawn = () => tag.getBoundingClientRect().left - doc.getElementById("board")!.getBoundingClientRect().left;
    expect([drawn(), editor.read(layer("tag"), "x")]).toEqual([expect.closeTo(320, 1), 320]);
    editor.set(layer("tag"), "x", 300);
    expect(changes.list().map((change) => [change.property, change.before, change.after])).toEqual([["x", 320, 300]]);
    expect(drawn()).toBeCloseTo(300, 1);
  });

  test.each([
    ["left", "left: 50%; right: auto; translate: -50% 0", "x"],
    ["right", "right: 50%; translate: 50% 0", "right"],
  ])(
    "a layer centered on where its %s places it that the canvas places relative in a view: no range is recorded, so the check looks at it there as placed absolute, not shown though written right, and never skipped (ticket 84, review: leftover risk)",
    async (_, centered, property) => {
      const html = fromTheRight("position: relative").replace("right: 12px", centered);
      const { views, page, editor, changes, layer } = open(html);
      phoneFrame = document.createElement("iframe");
      document.body.append(phoneFrame);
      await views.add(phoneFrame, 390);
      editor.set(layer("tag"), "x", editor.read(layer("tag"), "x")! - 20);
      const [change] = changes.list();
      expect([change.property, !!change.centeredOn, change.placedOtherwiseAt, change.offsetInLayoutAt]).toEqual([property, true, undefined, undefined]);

      const css = Object.entries(change.style).map(([name, value]) => `${name}: ${value}`).join("; ");
      page.getElementById("tag")!.setAttribute("style", css);
      const phone = pageAt(html.replace("</style>", `#tag { ${css} }</style>`), 390);
      expect(checkAcross(page, change, onCanvas(changes.list()), [390], () => phone)).toEqual({ outcome: "not shown", actual: null, width: 390 });
    },
  );

  test("a deletion is checked while its container is on the page; a sibling come to its place in the source is not it", async () => {
    const { page, editor, changes, layer } = open();
    editor.remove(layer("one"));
    const [deleted] = changes.list();

    // The Agent deletes it: the next paragraph moves up to its line.
    page.getElementById("one")!.remove();
    page.getElementById("two")!.setAttribute("data-ht-loc", "src/App.tsx:11:7");
    expect(await checkChange(page, deleted, onCanvas([deleted]))).toEqual({ outcome: "shown" });

    page.getElementById("flow")!.remove();
    expect(await checkChange(page, deleted, onCanvas([deleted]))).toEqual({ outcome: "unchecked", reason: "its container is not on the page now" });
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
    expect(await checkChange(page, reorder, onCanvas([reorder]))).toEqual({ outcome: "shown" });
    expect(await checkChange(page, placed, onCanvas([placed]))).toEqual({ outcome: "shown" });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const result = checkChange(page, deleted, onCanvas([deleted]));
      vi.advanceTimersByTime(CHECK_SETTLE_MS);
      expect(await result).toEqual({ outcome: "not shown", actual: "there" });
    } finally {
      vi.useRealTimers();
    }
    page.getElementById("b")!.remove();
    expect(await checkChange(page, deleted, onCanvas([deleted]))).toEqual({ outcome: "shown" });
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
    /** Both views show the same canvas: read now, though the phone view would hold a value's steps back till they pause. */
    const alike = () => {
      canvas.views.sync(phone);
      expect(phone.document.documentElement.outerHTML).toBe(canvas.doc.documentElement.outerHTML);
    };
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
  <div id="row" data-ht-loc="src/App.tsx:4:5" style="display: flex; gap: 10px; padding: 4px 8px">
    <article data-ht-loc="src/Card.tsx:3:5" style="height: 80px; width: 120px; background-color: rgb(255, 255, 255); border-radius: 12px"></article>
    <h3 data-ht-loc="src/Card.tsx:4:7" style="font-size: 16px; color: rgb(0, 0, 0)">Card</h3>
  </div>
  <div id="grid" data-ht-loc="src/App.tsx:8:5" style="display: grid; grid-template-columns: 1fr 1fr; row-gap: 8px; column-gap: 8px">
    <p data-ht-loc="src/App.tsx:9:7" style="height: 20px; margin: 0"></p>
    <p data-ht-loc="src/App.tsx:10:7" style="height: 20px; margin: 0"></p>
  </div>
</body>`;

  function openWithVariables(variables = ALL) {
    const canvas = openCanvas(PAGE_OF_STACKS);
    const catalog = resolveVariables(variables, canvas.doc);
    const editor = createEditor(canvas.views, canvas.changes, null, { bind: (property, value, picked, previous) => bind(catalog, property, value, picked, previous) });
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
    // A Grid's gaps are spacing too.
    editor.set(layer("#grid"), "rowGap", 22);
    expect(change("rowGap")!.variables).toEqual({ "": GUTTER });
    editor.set(layer("#grid"), "columnGap", 23);
    expect(change("columnGap")!.variables).toEqual({ "": null });
    // No Variable is offered for X, nor for opacity.
    editor.set(layer("article"), "opacity", 0.5);
    expect(change("opacity")!.variables).toBeUndefined();
  });

  test("made a Grid this round, a Variable picked for a gap is of the arrangement, as its part, even at the value it has (ticket 109)", () => {
    const { editor, changes, doc } = openWithVariables();
    // Found in the layers as they are now: made a Grid, they are built anew.
    const layer = (selector: string) => find(editor.tree().root, (l) => l.el === doc.querySelector(selector) && !l.text)!;
    const variables = () => changes.list().map((change) => [change.property, change.after, change.variables]);
    editor.set(layer("#row"), "arrangement", editor.arrangedAs(layer("#row"), "grid"));
    expect(variables()).toEqual([["arrangement", { type: "grid", columns: 2, rowGap: 10, columnGap: 10 }, { rowGap: null, columnGap: null }]]);

    editor.set(layer("#row"), "rowGap", 22, { variables: { "": GUTTER } });
    // Typed, a gap is the Variable with its value, as any is.
    editor.set(layer("#row"), "columnGap", 22);
    expect(variables()).toEqual([["arrangement", { type: "grid", columns: 2, rowGap: 22, columnGap: 22 }, { rowGap: { ...GUTTER, picked: true }, columnGap: GUTTER }]]);
    expect(editor.variables(layer("#row"), "rowGap")).toEqual({ "": { ...GUTTER, picked: true } });
    // Picked at the value it has: picked all the same, one step.
    editor.set(layer("#row"), "columnGap", 22, { variables: { "": GUTTER } });
    expect(editor.variables(layer("#row"), "columnGap")).toEqual({ "": { ...GUTTER, picked: true } });
    expect(changes.list()).toHaveLength(1);
  });


  test("a button's text takes a Variable for its font size, and the button one for its padding, each its own", () => {
    const canvas = openCanvas(`<!DOCTYPE html><body style="margin: 0"><button id="go" data-ht-loc="src/App.tsx:4:5" style="padding: 4px 8px">Go</button></body>`);
    const catalog = resolveVariables(ALL, canvas.doc);
    const editor = createEditor(canvas.views, canvas.changes, null, { bind: (property, value, picked, previous) => bind(catalog, property, value, picked, previous) });
    const button = find(editor.tree().root, (l) => l.el === canvas.doc.getElementById("go") && !l.text)!;
    const [text] = button.children;

    editor.set(text, "fontSize", 19, { variables: { "": LEAD } });
    editor.set(button, "padding", [22, 8, 4, 8]);

    expect(editor.variables(text, "fontSize")).toEqual({ "": { ...LEAD, picked: true } });
    expect(editor.variables(button, "padding")).toEqual({ top: GUTTER, right: null, bottom: null, left: null });
    expect(getComputedStyle(canvas.doc.getElementById("go")!).fontSize).toBe("19px");
  });

  test("a Variable picked in the phone view is the value at its breakpoint only, as the panel shows it in each view", async () => {
    const { editor, layer, change, views } = openWithVariables();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    const row = layer("#row");

    editor.at(phone);
    editor.set(row, "gap", 22, { variables: { "": GUTTER } });
    expect(change("gap")).toMatchObject({ breakpoint: { min: null, max: 800 }, variables: { "": { ...GUTTER, picked: true } } });
    expect(editor.variables(row, "gap")).toEqual({ "": { ...GUTTER, picked: true } });
    editor.at(null);
    expect(editor.variables(row, "gap")).toBeUndefined();
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

  test("a shadow's color is a color Variable, shadow by shadow, a text layer's too; shadows that are a shadow Variable are that alone", () => {
    const { editor, layer, change } = openWithVariables();
    const article = layer("article");
    const drop = { type: "drop", x: 0, y: 4, blur: 4, spread: 0 } as const;
    editor.set(article, "shadows", [{ ...drop, color: "#3D63F5", opacity: 1 }, { ...drop, color: "#3D63F5", opacity: 0.5 }]);
    expect(change("shadows")!.variables).toEqual({ "": null, "shadow 1": BRAND, "shadow 2": null });

    // Picked for the second, as the panel does: drawn there, the first kept.
    editor.set(article, "shadows", [{ ...drop, color: "#3D63F5", opacity: 1 }, { ...drop, color: "#FF0000", opacity: 1 }], { variables: { "shadow 2": RED } });
    expect(change("shadows")!.variables).toEqual({ "": null, "shadow 1": BRAND, "shadow 2": { ...RED, picked: true } });
    expect(getComputedStyle(article.el).boxShadow).toContain("rgb(255, 0, 0)");

    // The shadows of a shadow Variable are it, colors and all.
    editor.set(article, "shadows", [
      { type: "drop", x: 0, y: 1, blur: 2, spread: 0, color: "#1B1D2A", opacity: 0.06 },
      { type: "drop", x: 0, y: 4, blur: 12, spread: 0, color: "#1B1D2A", opacity: 0.08 },
    ]);
    expect(change("shadows")!.variables).toEqual({ "": RAISED });

    // A text layer's shadows have colors only to be Variables.
    const title = layer("h3");
    expect(editor.can(title, "textShadows")).toBe(true);
    editor.set(title, "textShadows", [{ ...drop, color: "#FF0000", opacity: 1 }]);
    expect(change("textShadows")!.variables).toEqual({ "shadow 1": RED });
  });

  test("a value close to a Variable of its group finds the closest: a length within 2px and 10% of it, a color a little apart as the eye sees it; the same value is not close", () => {
    const { catalog } = openWithVariables();
    const near = (group: Variable["group"], drawn: Parameters<typeof catalog.near>[1]) => catalog.near(group, drawn)?.variable.name ?? null;
    // gutter is 22px, 4 is 16px.
    expect(near("spacing", 20)).toBe("gutter");
    expect(near("spacing", 23.5)).toBe("gutter");
    expect(near("spacing", 19.5)).toBeNull();
    expect(near("spacing", 22)).toBeNull();
    // 1.5px from 16px is within 2px and within 10% of it, 1.6px.
    expect(near("spacing", 17.5)).toBe("4");
    // 1.8px from 16px is within 2px, but more than 10% of it.
    expect(near("spacing", 14.2)).toBeNull();
    // Only in the group: a 19px gap is not close to the 19px font size.
    expect(near("spacing", 18)).toBeNull();
    expect(near("fontSize", 18)).toBe("lead");
    expect(near("radius", 13)).toBe("card");

    // brand-500 is #3D63F5: #3E64F4 is a hair apart, #4A70F0 is plainly another blue.
    expect(near("color", { color: "#3E64F4", opacity: 1 })).toBe("brand-500");
    expect(near("color", { color: "#4A70F0", opacity: 1 })).toBeNull();
    expect(near("color", { color: "#3D63F5", opacity: 1 })).toBeNull();
    expect(near("color", { color: "#FE0101", opacity: 1 })).toBe("--danger");
    // A see-through color is not close to an opaque one.
    expect(near("color", { color: "#3E64F4", opacity: 0.5 })).toBeNull();
  });

  test("of two close, the closer; Variables found by part of their name, as typed, in any case", () => {
    const { catalog } = openWithVariables([GUTTER, FOUR, variable("tight", "spacing", "21px"), BRAND, variable("brand-600", "color", "#3a5ff0"), RED]);
    expect(catalog.near("spacing", 21.4)?.variable.name).toBe("tight");
    expect(catalog.near("spacing", 21.6)?.variable.name).toBe("gutter");
    // As close to tight as to gutter: gutter, listed first.
    expect(catalog.near("spacing", 21.5)?.variable.name).toBe("gutter");
    expect(catalog.named("color", "BRA").map(({ variable }) => variable.name)).toEqual(["brand-500", "brand-600"]);
    expect(catalog.named("color", " dang ").map(({ variable }) => variable.name)).toEqual(["--danger"]);
    expect(catalog.named("spacing", "x")).toEqual([]);
    // All of a group, the closest first, however far; of two as close, the one listed first; as listed for no value.
    const closest = (group: Variable["group"], drawn: Parameters<typeof catalog.closest>[1]) => catalog.closest(group, drawn).map(({ variable }) => variable.name);
    expect(closest("spacing", 30)).toEqual(["gutter", "tight", "4"]);
    expect(closest("spacing", 21.5)).toEqual(["gutter", "tight", "4"]);
    expect(closest("spacing", null)).toEqual(["gutter", "4", "tight"]);
    expect(closest("color", { color: "#3A5FF0", opacity: 1 })).toEqual(["brand-600", "brand-500", "--danger"]);
    expect(catalog.named("radius", "")).toEqual([]);
  });

  test("of those close, the project's own closest before Tailwind's defaults, however close a default is; a default only when none of the project's own is close", () => {
    const BRAND_50 = variable("brand-50", "color", "#eef4ff");
    const INDIGO_50 = variable("indigo-50", "color", "#eef2ff", { own: false });
    const SNUG = variable("snug", "spacing", "17.5px");
    const FOUR_HALF = variable("4.5", "spacing", "18px", { own: false });
    const { catalog, doc } = openWithVariables([GUTTER, SNUG, FOUR, FOUR_HALF, BRAND_50, INDIGO_50]);
    // #EEF3FF is a hair nearer indigo-50 than brand-50 in OKLab: brand-50 is hinted at, listed after it or not.
    expect(catalog.near("color", { color: "#EEF3FF", opacity: 1 })?.variable.name).toBe("brand-50");
    expect(resolveVariables([INDIGO_50, BRAND_50], doc).near("color", { color: "#EEF3FF", opacity: 1 })?.variable.name).toBe("brand-50");
    // 16.5px is 0.5px from 4 (16px), 1px from snug (17.5px): snug.
    expect(catalog.near("spacing", 16.5)?.variable.name).toBe("snug");
    // 15px is close to 4 alone: 4.
    expect(catalog.near("spacing", 15)?.variable.name).toBe("4");
    // With none of the project's own close, the closest default: 19.5px is 1.5px from 4.5 (18px), and 2px from snug, past its 10%.
    expect(catalog.near("spacing", 19.5)?.variable.name).toBe("4.5");
    expect(resolveVariables([GUTTER, FOUR, FOUR_HALF], doc).near("spacing", 17.2)?.variable.name).toBe("4.5");
  });

  test("a value typed before the Variables are in is named by them once they are, as it was then; a change named already keeps what it has", () => {
    const canvas = openCanvas(PAGE_OF_STACKS);
    // As edit mode has it: the Variables come in a while after the canvas.
    let catalog: Catalog | null = null;
    const editor = createEditor(canvas.views, canvas.changes, null, { bind: (...args) => (catalog ? bind(catalog, ...args) : undefined) });
    const tree = editor.tree();
    const layer = (selector: string) => find(tree.root, (l) => l.el === canvas.doc.querySelector(selector) && !l.text)!;
    const change = (property: string) => canvas.changes.list().find((c) => c.property === property);
    editor.set(layer("#row"), "gap", 22);
    editor.set(layer("#row"), "padding", [23, 16, 4, 8]);
    editor.set(layer("article"), "fill", { type: "solid", color: "#FF0000", opacity: 1 });
    editor.set(layer("article"), "opacity", 0.5);
    expect(change("gap")).not.toHaveProperty("variables");

    catalog = resolveVariables(ALL, canvas.doc);
    expect(bindRecorded(catalog, canvas.changes)).toBe(true);
    expect(change("gap")!.variables).toEqual({ "": GUTTER });
    expect(change("padding")!.variables).toEqual({ top: null, right: FOUR, bottom: null, left: null });
    expect(change("fill")!.variables).toEqual({ color: RED });
    // No Variable is offered for opacity.
    expect(change("opacity")).not.toHaveProperty("variables");

    // Named once: again, nothing is.
    editor.set(layer("#row"), "gap", 16, { variables: { "": FOUR } });
    expect(bindRecorded(catalog, canvas.changes)).toBe(false);
    expect(change("gap")!.variables).toEqual({ "": { ...FOUR, picked: true } });
  });

  test("without Variables, a change names none", () => {
    const { editor, layer, change } = openWithVariables([]);
    editor.set(layer("#row"), "gap", 22);
    expect(change("gap")).not.toHaveProperty("variables");
  });
});

describe("breakpoints", () => {
  const RED = { type: "solid", color: "#FF0000", opacity: 1 } as const;
  const BLUE = { type: "solid", color: "#0000FF", opacity: 1 } as const;
  /** The canvas, 800 px wide (or `width`), shown in a phone view too: its breakpoint is every width below 800 px, unless the project has breakpoints of its own. */
  const open = async (page = MOVES, project: ProjectBreakpoints | null = null, width = 800) => {
    const canvas = openCanvas(page, project, width);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await canvas.views.add(phoneFrame, 390);
    const [desktop] = canvas.views.list();
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    /** How the element with id `id` is styled in each view, desktop then phone, as each shows the canvas now: the phone view caught up with a value just set (ADR 0011). */
    const shown = (id: string) => {
      canvas.views.sync(phone);
      return [canvas.doc, phone.document].map((doc) => style(doc.getElementById(id)!));
    };
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

  test("a fill, stroke, corner radius, shadows and text styles changed in the phone view change there only, are listed as changed there, and inherit again", async () => {
    const { editor, changes, phone, layer, shown } = await open();
    const [board, text] = [layer("board"), layer("a")];
    const shadow = { type: "drop", x: 0, y: 4, blur: 4, spread: 0, color: "#000000", opacity: 0.25 } as const;

    editor.at(phone);
    editor.set(board, "fill", RED);
    editor.set(board, "stroke", { color: "#0000FF", opacity: 1, weight: 1.5, style: "solid" });
    editor.set(board, "radius", 8);
    editor.set(board, "shadows", [shadow]);
    editor.set(text, "fontSize", 20);
    editor.set(text, "textColor", { color: "#FF0000", opacity: 1 });
    editor.set(text, "textShadows", [shadow]);

    expect(shown("board").map((s) => [s.backgroundColor, s.borderTopStyle, s.borderTopLeftRadius, s.boxShadow === "none"])).toEqual([
      ["rgba(0, 0, 0, 0)", "none", "0px", true],
      ["rgb(255, 0, 0)", "solid", "8px", false],
    ]);
    expect(shown("a").map((s) => [s.fontSize, s.color, s.textShadow === "none"])).toEqual([
      ["16px", "rgb(0, 0, 0)", true],
      ["20px", "rgb(255, 0, 0)", false],
    ]);
    // The weight as written, at the breakpoint too.
    expect(editor.read(board, "stroke")!.weight).toBe(1.5);
    expect(changes.list().map((change) => change.breakpoint)).toEqual(Array(7).fill({ min: null, max: 800 }));
    expect(editor.changesHere(board)).toEqual(["fill", "stroke", "radius", "shadows"]);
    expect(editor.changesHere(text)).toEqual(["fontSize", "textColor", "textShadows"]);

    editor.inherit(board, "fill");
    editor.inherit(text, "fontSize");
    expect(shown("board").map((s) => s.backgroundColor)).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
    expect(shown("a").map((s) => s.fontSize)).toEqual(["16px", "16px"]);
    expect(editor.changesHere(board)).toEqual(["stroke", "radius", "shadows"]);
    editor.at(null);
    expect(editor.read(board, "radius")).toBe(0);
  });

  /** A Tailwind theme of the project's own, as the local service reads it. */
  const TAILWIND: ProjectBreakpoints = {
    from: "tailwind",
    list: [
      { width: 640, name: "sm" },
      { width: 768, name: "md" },
    ],
  };

  test("with breakpoints of the project's own, a view stands for the range of them its width is in and those above with no view, up to the next view's; one in the desktop view's range is the desktop view", async () => {
    const { editor, changes, views, phone, layer, addView } = await open(MOVES, TAILWIND);
    // Alone beside the desktop view, the phone view reaches up to the desktop view's range, md and up.
    expect(editor.breakpointAt(phone.width)).toEqual({ min: null, max: 768, project: { tailwind: "max-md:" } });
    const tablet = await addView(700);
    const wide = await addView(780);

    expect([phone, tablet, wide].map((view) => editor.breakpointAt(view.width))).toEqual([
      { min: null, max: 640, project: { tailwind: "max-sm:" } },
      { min: 640, max: 768, project: { tailwind: "sm:max-md:" } },
      null,
    ]);
    // One more in the phone view's range shares it.
    const other = await addView(500);
    expect([phone, other].map((view) => editor.breakpointAt(view.width))).toEqual(Array(2).fill({ min: null, max: 640, project: { tailwind: "max-sm:" } }));
    views.remove(other);

    editor.at(tablet);
    editor.set(layer("board"), "fill", RED);
    editor.at(wide);
    editor.set(layer("board"), "radius", 8);
    expect(changes.list().map((change) => [change.property, change.breakpoint ?? "every width"])).toEqual([
      ["fill", { min: 640, max: 768, project: { tailwind: "sm:max-md:" } }],
      ["radius", "every width"],
    ]);
  });

  /** Tailwind's own breakpoints, as a theme that keeps them has them. */
  const TAILWIND_DEFAULT: ProjectBreakpoints = {
    from: "tailwind",
    list: [
      { width: 640, name: "sm" },
      { width: 768, name: "md" },
      { width: 1024, name: "lg" },
      { width: 1280, name: "xl" },
      { width: 1536, name: "2xl" },
    ],
  };
  /** A canvas 1440px wide with Tailwind's own breakpoints, shown in a phone view and a tablet view too. */
  const openWide = async () => {
    const canvas = await open(MOVES, TAILWIND_DEFAULT, 1440);
    const tablet = await canvas.addView(768);
    /** The board's fill in each of `views`. */
    const fillsIn = (...views: View[]) => views.map((view) => style(view.document.getElementById("board")!).backgroundColor);
    /** The fill's changes, as value and range. */
    const fillChanges = () => canvas.changes.list().map((change) => [change.after, change.breakpoint]);
    return { ...canvas, tablet, fillsIn, fillChanges };
  };
  const [MAX_MD, MD_MAX_XL] = [
    { min: null, max: 768, project: { tailwind: "max-md:" } },
    { min: 768, max: 1280, project: { tailwind: "md:max-xl:" } },
  ];

  test("with Tailwind's breakpoints, the phone view's changes show up to md and the tablet view's up to xl: 700px and 1100px wide get them, not the desktop view's alone", async () => {
    const { editor, phone, tablet, layer, fillsIn, fillChanges, addView } = await openWide();
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    editor.at(tablet);
    editor.set(layer("board"), "fill", BLUE);
    expect(fillChanges()).toEqual([
      [RED, MAX_MD],
      [BLUE, MD_MAX_XL],
    ]);

    const [at700, at1100] = [await addView(700), await addView(1100)];
    expect(fillsIn(at700, at1100)).toEqual(["rgb(255, 0, 0)", "rgb(0, 0, 255)"]);
    for (const view of [at700, at1100]) {
      editor.at(view);
      expect(editor.changesHere(layer("board"))).toEqual(["fill"]);
    }
  });

  test("edited in a view added at 1100px, a tablet change reaching into it keeps its value outside the view's range, the view's range takes the new one; one undo puts it back whole", async () => {
    const { editor, changes, tablet, layer, fillsIn, fillChanges, addView } = await openWide();
    editor.at(tablet);
    editor.set(layer("board"), "fill", RED);
    const at1100 = await addView(1100);
    expect(editor.breakpointAt(tablet.width)).toEqual({ min: 768, max: 1024, project: { tailwind: "md:max-lg:" } });

    editor.at(at1100);
    editor.set(layer("board"), "fill", { ...BLUE, opacity: 0.5 }, { continues: true });
    editor.set(layer("board"), "fill", BLUE, { continues: true });
    expect(fillChanges()).toEqual([
      [RED, { min: 768, max: 1024, project: { tailwind: "md:max-lg:" } }],
      [BLUE, { min: 1024, max: 1280, project: { tailwind: "lg:max-xl:" } }],
    ]);
    expect(fillsIn(tablet, at1100)).toEqual(["rgb(255, 0, 0)", "rgb(0, 0, 255)"]);
    expect(changes.list().every((change) => change.before === null)).toBe(true);

    editor.undo();
    expect(fillChanges()).toEqual([[RED, MD_MAX_XL]]);
    expect(fillsIn(tablet, at1100)).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)"]);
    editor.redo();
    expect(fillsIn(tablet, at1100)).toEqual(["rgb(255, 0, 0)", "rgb(0, 0, 255)"]);
    editor.undo();

    // Edited in the tablet view, whose range is narrower now: the part above it keeps the value it had.
    editor.at(tablet);
    editor.set(layer("board"), "fill", BLUE);
    expect(fillChanges()).toEqual([
      [RED, { min: 1024, max: 1280, project: { tailwind: "lg:max-xl:" } }],
      [BLUE, { min: 768, max: 1024, project: { tailwind: "md:max-lg:" } }],
    ]);
    expect(fillsIn(tablet, at1100)).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)"]);
  });

  test("set back to inherit in a view, a change reaching past the view's range is cleared in the range only, on either side; one undo puts it back whole", async () => {
    const { editor, views, phone, tablet: first, layer, addView, fillsIn, fillChanges } = await openWide();
    views.remove(first);
    // The phone view alone beside the desktop view: it reaches up to xl.
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    expect(fillChanges()).toEqual([[RED, { min: null, max: 1280, project: { tailwind: "max-xl:" } }]]);
    const [tablet, at1100] = [await addView(768), await addView(1100)];

    editor.at(tablet);
    expect(editor.changesHere(layer("board"))).toEqual(["fill"]);
    editor.inherit(layer("board"), "fill");
    expect(fillChanges()).toEqual([
      [RED, MAX_MD],
      [RED, { min: 1024, max: 1280, project: { tailwind: "lg:max-xl:" } }],
    ]);
    expect(fillsIn(phone, tablet, at1100)).toEqual(["rgb(255, 0, 0)", "rgba(0, 0, 0, 0)", "rgb(255, 0, 0)"]);
    expect(editor.changesHere(layer("board"))).toEqual([]);

    editor.undo();
    expect(fillChanges()).toEqual([[RED, { min: null, max: 1280, project: { tailwind: "max-xl:" } }]]);
    expect(fillsIn(phone, tablet, at1100)).toEqual(Array(3).fill("rgb(255, 0, 0)"));
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
    expect(editor.breakpointAt(phone.width)).toEqual({ min: null, max: 750, project: { queries: ["(min-width: 750px)"] } });
    expect(editor.breakpointAt(700)).toEqual({ min: 600, max: 750, project: { queries: ["(max-width: 599px)", "(min-width: 750px)"] } });
  });

  /** The live page, `width` px wide, with `css` in it: as the page has it, source markers and no usage chains, which only the canvas is given. */
  const livePage = (width: number, css: string) => {
    const frame = document.createElement("iframe");
    frame.style.width = `${width}px`;
    document.body.append(frame);
    extraFrames.push(frame);
    const page = frame.contentDocument!;
    page.open();
    page.write(MOVES.replace(/ data-ht-chain='[^']*'/g, "").replace("<body", `<style>${css}</style>\n<body`));
    page.close();
    return page;
  };
  /** Copies of `page` at the widths asked for, kept as `checkAcross` is to look at them. */
  const copiesOf = (page: Document) => {
    const widths: number[] = [];
    const at = (width: number): PageWidth => {
      widths.push(width);
      const copy = copyPage(page, width, document.body);
      copies.push(copy);
      copy.sync();
      return { width, doc: copy.doc, own: false, of: copy.of };
    };
    return { at, widths };
  };
  let copies: PageCopy[] = [];
  afterEach(() => {
    for (const copy of copies) copy.close();
    copies = [];
  });

  test("a change at a breakpoint is checked on a copy of the page at a width in its range, wherever the window is: shown, not shown, or not checked when it cannot be shown there", async () => {
    const { editor, changes, phone, layer } = await open(MOVES.replace(/ data-ht-chain='[^']*'/g, ""));
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    const [change] = changes.list();
    const applied = "@media (width < 800px) { #board { background-color: rgb(255, 0, 0) } }";

    const wide = livePage(1000, applied);
    const shown = copiesOf(wide);
    expect(checkAcross(wide, change, onCanvas(changes.list()), [768, 390], shown.at)).toEqual({ outcome: "shown" });
    expect(shown.widths).toEqual([799]);
    const page = livePage(1000, "");
    expect(checkAcross(page, change, onCanvas(changes.list()), [768, 390], copiesOf(page).at)).toEqual({ outcome: "not shown", actual: null });
    expect(checkAcross(page, change, onCanvas(changes.list()), [768, 390], () => null)).toEqual({ outcome: "unchecked", reason: "it applies below 800px only, and the page could not be shown 799px wide to check it" });
    // The window in the range already: checked on the page as it is.
    const narrowPage = livePage(700, applied);
    const narrow = copiesOf(narrowPage);
    expect(checkAcross(narrowPage, change, onCanvas(changes.list()), [768, 390], narrow.at)).toEqual({ outcome: "shown" });
    expect(narrow.widths).toEqual([]);
  });

  test("a change at a range the project's breakpoints cut into parts is checked at a width in each part, and one not shown says which width (ticket 65)", async () => {
    const { editor, changes, phone, layer } = await open(MOVES.replace(/ data-ht-chain='[^']*'/g, ""), TAILWIND);
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    const [made] = changes.list();
    const change = { ...made, parts: partsOf(made.breakpoint!, TAILWIND).map((breakpoint) => ({ breakpoint, before: null })) };
    const round = [change];

    const allOfIt = livePage(1000, "@media (width < 768px) { #board { background-color: rgb(255, 0, 0) } }");
    const shown = copiesOf(allOfIt);
    expect(checkAcross(allOfIt, change, onCanvas(round), [390], shown.at)).toEqual({ outcome: "shown" });
    expect(shown.widths).toEqual([639, 640]);
    // Below 640px only: the part from 640px is not.
    const partOfIt = livePage(1000, "@media (width < 640px) { #board { background-color: rgb(255, 0, 0) } }");
    expect(checkAcross(partOfIt, change, onCanvas(round), [390], copiesOf(partOfIt).at)).toEqual({ outcome: "not shown", actual: null, width: 640 });
    // The window in one part: the page itself there, a copy for the other.
    const narrow = livePage(700, "@media (width < 768px) { #board { background-color: rgb(255, 0, 0) } }");
    const inPart = copiesOf(narrow);
    expect(checkAcross(narrow, change, onCanvas(round), [390], inPart.at)).toEqual({ outcome: "shown" });
    expect(inPart.widths).toEqual([639]);
  });

  test("what the live page shows in each part of a change's range is read there, the code as it is, before the change is applied (ticket 65)", async () => {
    const { editor, changes, phone, layer } = await open(MOVES.replace(/ data-ht-chain='[^']*'/g, ""), TAILWIND);
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    const [change] = changes.list();
    const page = livePage(1000, "#board { background-color: rgb(255, 255, 255) } @media (width >= 640px) { #board { background-color: rgb(0, 0, 255) } }");

    expect(await measureParts(page, change, TAILWIND, document.body)).toEqual([
      { breakpoint: { min: null, max: 640, project: { tailwind: "max-sm:" } }, before: { type: "solid", color: "#FFFFFF", opacity: 1 } },
      { breakpoint: { min: 640, max: 768, project: { tailwind: "sm:max-md:" } }, before: BLUE },
    ]);
    // A range no breakpoint of the project's cuts, or a change at every width: nothing to read.
    expect(await measureParts(page, change, null, document.body)).toBeNull();
    expect(await measureParts(page, { ...change, breakpoint: undefined }, TAILWIND, document.body)).toBeNull();
    expect(document.querySelectorAll("iframe[data-ht-check]").length).toBe(0);
  });

  test("reading each part of a change's range is done a step at a time, each in a task of its own, so a large page is never held up for long (ticket 65)", async () => {
    const { editor, changes, phone, layer } = await open(MOVES.replace(/ data-ht-chain='[^']*'/g, ""), TAILWIND);
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    const [change] = changes.list();
    const page = livePage(1000, "#board { background-color: rgb(255, 255, 255) }");
    performance.clearMeasures(PARTS_MEASURE);
    let tasks = 0;
    const channel = new MessageChannel();
    let reading = true;
    channel.port1.onmessage = () => {
      tasks++;
      if (reading) channel.port2.postMessage(null);
    };
    channel.port2.postMessage(null);

    const read = await measureParts(page, change, TAILWIND, document.body);
    reading = false;

    expect(read).toHaveLength(2);
    // Making the copy, bringing it up to date, laying it out and reading it: apart, for each part.
    const steps = performance.getEntriesByName(PARTS_MEASURE);
    expect(steps.length).toBeGreaterThanOrEqual(8);
    // The page had its turns in between.
    expect(tasks).toBeGreaterThanOrEqual(steps.length - 1);
    channel.port1.close();
  });

  test("a change made in the desktop view is checked as wide as the window and as wide as each view: a width where the code gives another value does not show it; one the round changed at a breakpoint of its own keeps its own", async () => {
    const { editor, changes, desktop, phone, layer } = await open(MOVES.replace(/ data-ht-chain='[^']*'/g, ""));
    editor.at(desktop);
    editor.set(layer("board"), "fill", RED);
    const [change] = changes.list();
    // The code writes red at every width but below 640px, where a rule of its own keeps it white.
    const css = "#board { background-color: rgb(255, 0, 0) } @media (width < 640px) { #board { background-color: rgb(255, 255, 255) } }";
    const page = livePage(1000, css);
    const { at, widths } = copiesOf(page);

    expect(checkAcross(page, change, onCanvas(changes.list()), [768, 390], at)).toEqual({ outcome: "not shown", actual: { type: "solid", color: "#FFFFFF", opacity: 1 }, width: 390 });
    expect(widths).toEqual([768, 390]);

    // Changed in the phone view too, the board keeps that value below 800px: not looked at there.
    editor.at(phone);
    editor.set(layer("board"), "fill", { type: "solid", color: "#FFFFFF", opacity: 1 });
    const desktopChange = changes.list().find((c) => !c.breakpoint)!;
    const again = copiesOf(page);
    expect(checkAcross(page, desktopChange, onCanvas(changes.list()), [768, 390], again.at)).toEqual({ outcome: "shown" });
    expect(again.widths).toEqual([]);
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

  test("the media queries of a dependency's stylesheets, or of the editor's own, are not the project's; a stylesheet whose source cannot be told counts", () => {
    const { doc } = openCanvas(`<!DOCTYPE html>
      <style data-vite-dev-id="/app/node_modules/.pnpm/lib@1.0.0/node_modules/lib/dist/lib.css">@media (min-width: 500px) { p { color: red } }</style>
      <style data-vite-dev-id="/app/src/index.css">@media (min-width: 768px) { p { color: blue } }</style>
      <style data-ht-canvas-styles>@media (min-width: 300px) { p { color: green } }</style>
      <style>@media (max-width: 1023px) { p { margin: 0 } }</style>
      <body><p>Hi</p></body>`);
    expect(readMediaBreakpoints(doc)?.list.map((breakpoint) => breakpoint.width)).toEqual([768, 1024]);

    // A stylesheet loaded from a dependency's file.
    const rulesOf = (css: string) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet.cssRules;
    };
    const linked = (href: string, css: string) => ({ href, ownerNode: null, cssRules: rulesOf(css) });
    const page = {
      styleSheets: [linked("http://localhost:5173/node_modules/.vite/deps/lib.css", "@media (min-width: 500px) { p { color: red } }"), linked("http://localhost:5173/src/app.css", "@media (min-width: 640px) { p { color: red } }")],
    } as unknown as Document;
    expect(readMediaBreakpoints(page)?.list.map((breakpoint) => breakpoint.width)).toEqual([640]);
  });

  test("a change at a breakpoint recorded before the views changed is told in every view whose width is in its range; edited or reset in one whose range it reaches past, it keeps its value outside that range, never doubled", async () => {
    const { editor, changes, phone, layer, fills, addView } = await open();
    editor.at(phone);
    editor.set(layer("board"), "fill", RED);
    // A view added between: the phone view now stands for the widths below 600px, the new one for 600px up to 800px.
    const between = await addView(600);
    expect(editor.breakpoint()).toEqual({ min: null, max: 600 });
    const fillBetween = () => style(between.document.getElementById("board")!).backgroundColor;

    for (const view of [phone, between]) {
      editor.at(view);
      expect(editor.changesHere(layer("board"))).toEqual(["fill"]);
    }
    editor.set(layer("board"), "fill", BLUE);
    expect(changes.list().map((change) => [change.after, change.breakpoint])).toEqual([
      [RED, { min: null, max: 600 }],
      [BLUE, { min: 600, max: 800 }],
    ]);
    expect([...fills("board"), fillBetween()]).toEqual(["rgba(0, 0, 0, 0)", "rgb(255, 0, 0)", "rgb(0, 0, 255)"]);

    editor.inherit(layer("board"), "fill");
    expect(changes.list().map((change) => [change.after, change.breakpoint])).toEqual([[RED, { min: null, max: 600 }]]);
    expect([...fills("board"), fillBetween()]).toEqual(["rgba(0, 0, 0, 0)", "rgb(255, 0, 0)", "rgba(0, 0, 0, 0)"]);
    editor.undo();
    editor.undo();
    expect(changes.list().map((change) => [change.after, change.breakpoint])).toEqual([[RED, { min: null, max: 800 }]]);
    expect([...fills("board"), fillBetween()]).toEqual(["rgba(0, 0, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)"]);
  });

  test("placed freely at a breakpoint and set back to inherit in a view whose range it reaches past, a layer is in its Frame's flow there only, and its Frame its positioning reference outside it", async () => {
    const { editor, changes, phone, layer, doc, addView } = await open(NUDGES);
    editor.at(phone);
    editor.nudge([layer("tag")], 0, 10);
    const between = await addView(600);
    const positions = (id: string) => [doc, phone.document, between.document].map((d) => style(d.getElementById(id)!).position);

    editor.at(between);
    editor.inherit(layer("tag"), "absolute");
    expect(changes.list().map((change) => [change.property, change.breakpoint])).toEqual([["absolute", { min: null, max: 600 }]]);
    expect(positions("tag")).toEqual(["static", "absolute", "static"]);
    expect(positions("frame")).toEqual(["static", "relative", "static"]);
    editor.undo();
    expect(positions("tag")).toEqual(["static", "absolute", "absolute"]);
    expect(positions("frame")).toEqual(["static", "relative", "relative"]);
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
      ["gap", 4, { min: null, max: 768, project: { tailwind: "max-md:" } }],
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

  test("a field of the Design panel is marked where the breakpoint worked in changed its property on its own, for any selected layer; reset, they all inherit, and one undo marks it again", async () => {
    const { editor, changes, phone, desktop, layer, fills } = await open();
    const selected = [layer("board"), layer("list")];
    let edited = 0;
    const marksIn = () => {
      const marks = changeMarks(changes.list(), editor, selected, () => edited++);
      return { changed: (properties: Property[]) => properties.filter((property) => marks.changed(property)), reset: marks.reset };
    };

    editor.at(phone);
    expect(marksIn().changed(["fill", "stroke"])).toEqual([]);
    editor.set(layer("list"), "fill", RED);
    editor.set(layer("board"), "radius", 4);
    expect(marksIn().changed(["fill", "stroke"])).toEqual(["fill"]);
    expect(marksIn().changed(["opacity", "radius"])).toEqual(["radius"]);
    editor.at(desktop);
    expect(marksIn().changed(["fill", "radius"])).toEqual([]);

    editor.at(phone);
    marksIn().reset(["fill", "radius"]);
    expect(edited).toBe(1);
    expect(fills("list")).toEqual([fills("list")[0], fills("list")[0]]);
    expect(marksIn().changed(["fill", "radius"])).toEqual([]);

    editor.undo();
    expect(fills("list")[1]).toBe("rgb(255, 0, 0)");
    expect(marksIn().changed(["fill", "radius"])).toEqual(["fill", "radius"]);
  });

  test("a layer placed from the right, resized in the phone view, its width and its `right` changed there together: either reset, both inherit again, so it is back where it was (line review)", async () => {
    const fixed = (value: number) => ({ type: "fixed", value }) as const;
    for (const reset of ["width", "right"] as const) {
      const { editor, changes, phone, layer } = await open(ANCHORED);
      const right = layer("right");
      const box = () => {
        const el = phone.document.getElementById("right")!;
        const [r, p] = [el.getBoundingClientRect(), el.parentElement!.getBoundingClientRect()];
        return [r.left - p.left, r.width];
      };
      const was = box();
      editor.at(phone);
      editor.set(right, "width", fixed(50));
      expect(editor.changesHere(right)).toEqual(["width", "right"]);
      changeMarks(changes.list(), editor, [right], () => {}).reset([reset]);

      expect(editor.changesHere(right)).toEqual([]);
      phone.document.body.offsetWidth;
      expect(box()).toEqual(was);
      phoneFrame?.remove();
      iframe?.remove();
    }
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
      [layer("b").el.getAttribute("data-ht-layer"), false, { min: null, max: 800 }],
      [layer("c").el.getAttribute("data-ht-layer"), false, "every width"],
      [layer("c").el.getAttribute("data-ht-layer"), true, { min: null, max: 800 }],
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
    /** How the Frame is positioned: in the desktop view, then the phone view. */
    const frame = () => [doc, phone.document].map((d) => style(d.getElementById("frame")!).position);

    editor.at(phone);
    editor.move(layer("tag"), { parent: layer("frame"), x: 50, y: 30 });
    editor.move(layer("tag"), { parent: layer("frame"), x: 60, y: 40 });
    editor.set(layer("tag"), "x", 5);

    expect([tag(doc).position, tag(phone.document).position]).toEqual(["static", "absolute"]);
    expect([tag(phone.document).left, tag(phone.document).top, tag(phone.document).width]).toEqual(["5px", "40px", "40px"]);
    expect(changes.list().map((change) => [change.property, change.before, change.after, change.breakpoint ?? "every width"])).toEqual([
      ["absolute", null, { x: 5, y: 40 }, { min: null, max: 800 }],
    ]);
    // Its Frame is its positioning reference, there only.
    expect(frame()).toEqual(["static", "relative"]);
    expect(editor.changesHere(layer("tag"))).toEqual(["absolute"]);

    // In the desktop view, it is in the Frame's flow, as it was.
    editor.at(desktop);
    expect(editor.read(layer("tag"), "absolute")).toBeNull();
    expect(editor.can(layer("tag"), "x")).toBe(false);

    editor.at(phone);
    editor.inherit(layer("tag"), "absolute");
    expect([tag(doc).position, tag(phone.document).position]).toEqual(["static", "static"]);
    expect(tag(phone.document).left).toBe("auto");
    expect(frame()).toEqual(["static", "static"]);
    expect(changes.list()).toEqual([]);
    expect(editor.changesHere(layer("tag"))).toEqual([]);
    editor.undo();
    expect(tag(phone.document).position).toBe("absolute");
    expect(frame()).toEqual(["static", "relative"]);
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
    expect([doc, phone.document].map((d) => style(d.getElementById("frame")!).position)).toEqual(["static", "static"]);
    expect(changes.list()).toEqual([]);
    editor.undo();
    expect(style(phone.document.getElementById("tag")!).position).toBe("absolute");
  });

  test("placed freely at a breakpoint, then moved into another container, a layer is where it is dropped at every width: its placement at the breakpoint goes, one step", async () => {
    const { editor, changes, phone, layer, doc } = await open(NUDGES);
    const positions = (id: string) => [doc, phone.document].map((d) => style(d.getElementById(id)!).position);
    editor.at(phone);
    editor.nudge([layer("tag")], 0, 10);

    editor.move(layer("tag"), { parent: layer("list"), index: 0 });
    expect(positions("tag")).toEqual(["static", "static"]);
    expect(positions("frame")).toEqual(["static", "static"]);
    expect(changes.list().map((change) => [change.kind, change.property, change.breakpoint ?? "every width"])).toEqual([["move", "move", "every width"]]);

    editor.undo();
    expect(doc.getElementById("tag")!.parentElement!.id).toBe("frame");
    expect(positions("tag")).toEqual(["static", "absolute"]);
    expect(positions("frame")).toEqual(["static", "relative"]);
  });

  test("loose text in a Frame, nudged in the phone view, gets an element of its own and is placed freely there only; the change says to wrap it", async () => {
    const page = NUDGES.replace(">Tag</span></div>", ">Tag</span>loose words</div>");
    const { editor, changes, phone, doc } = await open(page);
    const text = find(editor.tree().root, (l) => !!l.text && l.name.includes("loose"))!;

    editor.at(phone);
    const [placed] = editor.nudge([text], 0, 10);

    expect(placed.el.localName).toBe("span");
    expect([doc, phone.document].map((d) => style(d.getElementById("frame")!.lastElementChild!).position)).toEqual(["static", "absolute"]);
    expect(changes.list().map((change) => [change.property, change.wrap, change.breakpoint ?? "every width"])).toEqual([["absolute", true, { min: null, max: 800 }]]);
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
    expect(changes.list().filter((change) => change.layer === copy.el.getAttribute("data-ht-layer")).map((change) => change.kind)).toEqual(["duplicate"]);
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

    const copied = (layer: typeof copy) => changes.list().find((change) => change.layer === layer.el.getAttribute("data-ht-layer"))!.copiedBreakpoints;
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
    const copied = (layer: typeof copy) => changes.list().find((change) => change.layer === layer.el.getAttribute("data-ht-layer"))!.copiedBreakpoints;

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
  <div id="board" data-ht-layer="1" data-ht-original-style="width: 300px; height: 200px"
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

  /** The Grid with its layers placed otherwise than in the order they are written: `grid` on the Grid, `b` on its second layer. */
  const placed = (grid: string, b: string) => GRID.replace('style="display: grid; width: 400px"', `style="display: grid; width: 400px; ${grid}"`).replace(`id="b" ${at("7:7")} style="height: 40px"`, `id="b" ${at("7:7")} style="height: 40px; ${b}"`);
  const PLACINGS = [
    ["a cell of its own", "", "grid-column: 2; grid-row: 2"],
    ["an area", "", "grid-area: 1 / 2"],
    ["another order", "", "order: 1"],
    ["holes filled out of order", "grid-auto-flow: row dense", ""],
  ];

  test("a layer spanning two columns is still placed in order: the Grid's layers can be moved a cell along", () => {
    const canvas = openCanvas(placed("", "grid-column: span 2"));
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;

    canvas.editor.nudge([layer("a")], 1, 0);

    expect([...canvas.doc.getElementById("grid")!.children].map((el) => el.id)).toEqual(["b", "a", "c", "d"]);
  });

  test.each(PLACINGS)("with a layer placed in %s, nudging a layer of the Grid moves none, and changes nothing", (_, grid, b) => {
    const canvas = openCanvas(placed(grid, b));
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;

    expect(canvas.editor.nudge([layer("a")], 1, 0)).toEqual([layer("a")]);
    canvas.editor.nudge([layer("c")], 0, 1);

    expect([...canvas.doc.getElementById("grid")!.children].map((el) => el.id)).toEqual(["a", "b", "c", "d"]);
    expect(canvas.changes.list()).toEqual([]);
  });

  test("with a layer placed in a cell of its own, a layer dragged in the Grid goes nowhere; one dragged in from elsewhere goes last, no cell of its own named", () => {
    const canvas = openCanvas(placed("", "grid-column: 2; grid-row: 2"));
    const { editor, views, doc } = canvas;
    const layer = (id: string) => find(editor.tree().root, (l) => l.el === doc.getElementById(id) && !l.text)!;
    const [desktop] = views.list();
    const rectOf = (l: Layer) => l.el.getBoundingClientRect();
    const over = (id: string) => {
      const r = doc.getElementById(id)!.getBoundingClientRect();
      return { x: r.left + r.width / 4, y: r.top + r.height / 2 };
    };

    expect(findDrop(editor, desktop, layer("a"), over("d"), rectOf(layer("a")), rectOf)).toBeNull();
    const drop = findDrop(editor, desktop, layer("f"), over("c"), rectOf(layer("f")), rectOf)!;
    expect(drop).toMatchObject({ to: { parent: layer("grid"), index: 4 }, line: null });
    // Drawn in it, a new layer goes last too.
    expect(findPlace(editor, desktop, over("c"), new DOMRect(over("c").x, over("c").y, 10, 10))).toMatchObject({ parent: layer("grid"), index: 4 });

    editor.move(layer("f"), drop.to);
    expect([...doc.getElementById("grid")!.children].map((el) => el.id)).toEqual(["a", "b", "c", "d", "f"]);
    // Not the Grid's 5th cell: where it is placed is the Grid's to say.
    const after = canvas.changes.list()[0].after as Place;
    expect([after.nth, after.container.grid]).toEqual([5, undefined]);
  });

  test("in a Grid that places its layers in the order they are written, a drag between them takes a cell, as before", () => {
    const { editor, views, doc, layer } = open();
    const [desktop] = views.list();
    const rectOf = (l: Layer) => l.el.getBoundingClientRect();
    const r = doc.getElementById("d")!.getBoundingClientRect();

    expect(findDrop(editor, desktop, layer("a"), { x: r.left + r.width / 4, y: r.top + r.height / 2 }, rectOf(layer("a")), rectOf)).toMatchObject({
      to: { parent: layer("grid"), index: 2 },
    });
  });
});

/** A row of three cards, a wrapping row of five, a column, and a Grid of four in two columns with a cell that fills it, sized `w-full`. */
const ARRANGEMENTS = `<!DOCTYPE html>
<body style="margin: 0">
  <div id="row" ${loc("5:5")} style="display: flex; gap: 24px; width: 600px; padding: 8px">
    ${[1, 2, 3].map((n) => `<div id="r${n}" ${loc(`${5 + n}:7`)} style="flex: 1 1 0%; height: 40px">R${n}</div>`).join("")}
  </div>
  <div id="wrapped" ${loc("10:5")} style="display: flex; flex-wrap: wrap; column-gap: 20px; row-gap: 10px; width: 400px">
    ${[1, 2, 3, 4, 5].map((n) => `<div id="w${n}" ${loc(`${10 + n}:7`)} style="width: 120px; height: 30px">W${n}</div>`).join("")}
  </div>
  <div id="column" ${loc("17:5")} style="display: flex; flex-direction: column; gap: 12px; width: 300px">
    <div id="c1" ${loc("18:7")} style="height: 20px">C1</div>
    <div id="c2" ${loc("19:7")} style="height: 20px">C2</div>
  </div>
  <div id="grid" ${loc("21:5")} style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 16px; column-gap: 8px; width: 400px">
    ${[1, 2, 3, 4].map((n) => `<div id="g${n}" ${loc(`${21 + n}:7`)} style="height: 30px">G${n}</div>`).join("")}
  </div>
  <div id="cells" ${loc("27:5")} style="display: grid; grid-template-columns: repeat(2, 100px); justify-items: start">
    <div id="full" ${loc("28:7")} style="width: 100%; height: 20px">Full</div>
    <div id="hug" ${loc("29:7")} style="height: 20px">Hug</div>
  </div>
</body>`;

describe("a Stack made a Grid, and a Grid a Stack (ticket 109)", () => {
  const open = () => {
    const canvas = openCanvas(ARRANGEMENTS);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    /** Where each layer of a container is drawn, rounded to the px. */
    const boxes = (id: string) => [...canvas.doc.getElementById(id)!.children].map((el) => ((r) => [r.left, r.top, r.width, r.height].map(Math.round))(el.getBoundingClientRect()));
    return { ...canvas, layer, boxes };
  };

  test("a Stack offers to become a Grid, and a Grid a Stack, one that places its layers in cells of their own too", () => {
    const { editor, layer } = open();
    expect(["row", "column", "grid"].map((id) => editor.can(layer(id), "arrangement"))).toEqual([true, true, true]);
    expect(editor.read(layer("row"), "arrangement")).toEqual({ type: "stack", direction: "horizontal", wrap: false, gap: 24 });
    expect(editor.read(layer("wrapped"), "arrangement")).toEqual({ type: "stack", direction: "horizontal", wrap: true, gap: 20, crossGap: 10 });
    expect(editor.read(layer("grid"), "arrangement")).toEqual({ type: "grid", columns: 2, rowGap: 16, columnGap: 8 });
    expect(editor.can(layer("r1"), "arrangement")).toBe(false);
    const placed = openCanvas(ARRANGEMENTS.replace('id="g2" data-ht-loc', 'style="grid-column: 2; grid-row: 2" id="g2" data-ht-loc'));
    const grid = find(placed.editor.tree().root, (l) => l.el === placed.doc.getElementById("grid"))!;
    expect(placed.editor.can(grid, "arrangement")).toBe(true);
  });

  /** The Grid with its layers placed in areas of their own, the other way round from the order they are written: G4, G3 in its first row, G2, G1 in its second. */
  const AREAS = ARRANGEMENTS.replace("grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap", `grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-areas: 'd c' 'b a'; row-gap`).replace(
    /id="g(\d)" (data-ht-loc="[^"]*") style="height: 30px"/g,
    (_, n: string, at: string) => `id="g${n}" ${at} style="height: 30px; grid-area: ${"abcd"[Number(n) - 1]}"`,
  );
  /** The Grid's layers, top to bottom, then left to right, as drawn. */
  const drawnOrder = (doc: Document) =>
    [...doc.getElementById("grid")!.children]
      .map((el) => ({ id: el.id, box: el.getBoundingClientRect() }))
      .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left)
      .map(({ id }) => id);

  test("a Grid that places its layers in areas made a Stack lays them out in the order they are written, as in Figma; the change says how they were placed, and ⌘Z takes them back (ticket 109's follow-up)", () => {
    const { editor, changes, doc } = openCanvas(AREAS);
    const grid = () => find(editor.tree().root, (l) => l.el === doc.getElementById("grid"))!;
    expect(drawnOrder(doc)).toEqual(["g4", "g3", "g2", "g1"]);

    expect(editor.arrangedAs(grid(), "vertical")).toEqual({ type: "stack", direction: "vertical", wrap: false, gap: 16 });
    editor.set(grid(), "arrangement", editor.arrangedAs(grid(), "vertical"));

    expect(drawnOrder(doc)).toEqual(["g1", "g2", "g3", "g4"]);
    expect(grid().kind).toBe("stack");
    expect(changes.list()).toMatchObject([{ property: "arrangement", before: { type: "grid", columns: 2 }, after: { type: "stack", direction: "vertical" }, placedInGrid: true }]);
    // Its gap changed after is of the same change, which stays one placed in the Grid.
    editor.set(grid(), "gap", 8);
    expect(changes.list()).toMatchObject([{ property: "arrangement", after: { type: "stack", gap: 8 }, placedInGrid: true }]);

    editor.undo();
    editor.undo();
    expect(drawnOrder(doc)).toEqual(["g4", "g3", "g2", "g1"]);
    expect(changes.list()).toEqual([]);
  });

  test("a Grid placing its layers in order made a Stack is no change placed in the Grid; nor is a Stack made a Grid (ticket 109's follow-up)", () => {
    const { editor, changes, layer } = open();
    editor.set(layer("grid"), "arrangement", editor.arrangedAs(layer("grid"), "vertical"));
    editor.set(layer("row"), "arrangement", editor.arrangedAs(layer("row"), "grid"));
    expect(changes.list().map((change) => change.placedInGrid)).toEqual([undefined, undefined]);
  });

  test("in the phone view, a desktop Grid placing its layers in areas made a vertical Stack there: the page shows it with the areas still written, and not while a Grid there (ticket 109's follow-up)", async () => {
    const { editor, changes, doc, views } = openCanvas(AREAS);
    const grid = () => find(editor.tree().root, (l) => l.el === doc.getElementById("grid"))!;
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);

    editor.at(phone);
    editor.set(grid(), "arrangement", editor.arrangedAs(grid(), "vertical"));
    expect(drawnOrder(phone.document)).toEqual(["g1", "g2", "g3", "g4"]);
    expect(drawnOrder(doc)).toEqual(["g4", "g3", "g2", "g1"]);
    const [stack] = changes.list();
    expect(stack).toMatchObject({ breakpoint: { min: null, max: 800 }, placedInGrid: true });

    // The Agent's page: a flex column, the Grid's areas and its layers' left as they are.
    live = document.createElement("iframe");
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(AREAS.replace("display: grid; grid-template-columns: repeat(2", "display: flex; flex-direction: column; grid-template-columns: repeat(2"));
    page.close();
    const round = onCanvas(changes.list());
    expect(checkChange(page, stack, round)).toEqual({ outcome: "shown" });
    // Still the Grid there: not shown.
    page.getElementById("grid")!.style.display = "grid";
    expect(checkChange(page, stack, round)).toMatchObject({ outcome: "not shown", actual: { type: "grid", columns: 2 } });

    editor.inherit(grid(), "arrangement");
    expect(drawnOrder(phone.document)).toEqual(["g4", "g3", "g2", "g1"]);
    expect(changes.list()).toEqual([]);
  });

  /** The Agent's page for the Grid made a Stack: a flex column; `g1`'s `order` changed to `order`. */
  const stackPage = (html: string, order?: string) => {
    live = document.createElement("iframe");
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(html.replace("display: grid; grid-template-columns: repeat(2", "display: flex; flex-direction: column; grid-template-columns: repeat(2"));
    page.close();
    if (order !== undefined) (page.getElementById("g1") as HTMLElement).style.order = order;
    return page;
  };

  test("a Grid placing its layers by `order` too, made a Stack in the phone view: laid out by their `order` there, the page shows it only with each layer's `order` kept (ticket 109's follow-up)", async () => {
    const ordered = AREAS.replace(/(id="g1" [^>]*style="height: 30px; grid-area: a)"/, '$1; order: 2"');
    const { editor, changes, doc, views } = openCanvas(ordered);
    const grid = () => find(editor.tree().root, (l) => l.el === doc.getElementById("grid"))!;
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);

    editor.at(phone);
    editor.set(grid(), "arrangement", editor.arrangedAs(grid(), "vertical"));
    expect(drawnOrder(phone.document)).toEqual(["g2", "g3", "g4", "g1"]);
    const [stack] = changes.list();
    expect(stack.layerOrders).toEqual([{ width: 390, orders: [2, 0, 0, 0] }]);
    const round = onCanvas(changes.list());

    expect(checkChange(stackPage(ordered), stack, round)).toEqual({ outcome: "shown" });
    // Its `order` taken off as the Grid's alone: laid out otherwise than on the canvas.
    expect(checkChange(stackPage(ordered, "0"), stack, round)).toMatchObject({ outcome: "not shown", actual: { type: "stack", orders: [0, 0, 0, 0] } });
  });

  test("outside its range, a Grid made a Stack at a breakpoint is read with how it places its layers: its areas taken off there read otherwise (ticket 109's follow-up)", async () => {
    const { editor, changes, doc, views } = openCanvas(AREAS);
    const grid = () => find(editor.tree().root, (l) => l.el === doc.getElementById("grid"))!;
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    editor.at(phone);
    editor.set(grid(), "arrangement", editor.arrangedAs(grid(), "vertical"));
    const [stack] = changes.list();
    const round = onCanvas(changes.list());

    live = document.createElement("iframe");
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(AREAS);
    page.close();
    const [kept] = valuesAt(page, stack, round, itself(page))!;
    expect(kept).toMatchObject({ type: "grid", columns: 2, placement: expect.stringContaining('"d c" "b a"') });
    page.getElementById("grid")!.style.gridTemplateAreas = "none";
    [...page.getElementById("grid")!.children].forEach((el) => ((el as HTMLElement).style.gridArea = "auto"));
    const [taken] = valuesAt(page, stack, round, itself(page))!;
    expect(taken).toMatchObject({ type: "grid", columns: 2 });
    expect(taken).not.toEqual(kept);
  });

  test("a Grid placing its layers in order, made a Stack, whose layers a Stack in another view orders: no change placed in the Grid (ticket 109's follow-up)", async () => {
    const page = ARRANGEMENTS.replace("<body", `<style>@media (max-width: 799px) { #grid { display: flex !important; flex-direction: column } #g4 { order: -1 } }</style><body`);
    const { editor, changes, doc, views } = openCanvas(page);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    expect(getComputedStyle(phone.document.getElementById("grid")!).display).toBe("flex");
    const grid = find(editor.tree().root, (l) => l.el === doc.getElementById("grid"))!;

    editor.set(grid, "arrangement", editor.arrangedAs(grid, "vertical"));
    expect(changes.list()).toMatchObject([{ property: "arrangement" }]);
    expect(changes.list()[0].placedInGrid).toBeUndefined();
  });

  test("a horizontal Stack becomes a Grid of a column for each of its layers, one row, its gap both gaps: nothing moves; one change, undone in one step", () => {
    const { editor, changes, layer, boxes, doc } = open();
    const before = boxes("row");

    const grid = editor.arrangedAs(layer("row"), "grid");
    expect(grid).toEqual({ type: "grid", columns: 3, rowGap: 24, columnGap: 24 });
    editor.set(layer("row"), "arrangement", grid);

    expect(style(doc.getElementById("row")!).display).toBe("grid");
    expect(boxes("row")).toEqual(before);
    expect(layer("row").kind).toBe("grid");
    expect(editor.can(layer("row"), "columns")).toBe(true);
    expect(editor.can(layer("row"), "direction")).toBe(false);
    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0]).toMatchObject({
      kind: "style",
      property: "arrangement",
      before: { type: "stack", direction: "horizontal", wrap: false, gap: 24 },
      after: grid,
      style: { display: "grid", "grid-template-columns": "repeat(3, minmax(0, 1fr))", "row-gap": "24px", "column-gap": "24px" },
    });
    // What lays it out as a Stack now: its style attribute, and nothing for its direction and wrap.
    expect(changes.list()[0].sources.map((source) => [source.kind, source.properties])).toEqual([
      ["inline", ["display", "row-gap", "column-gap"]],
      ["none", ["flex-direction", "flex-wrap"]],
    ]);

    editor.undo();
    expect(style(doc.getElementById("row")!).display).toBe("flex");
    expect(layer("row").kind).toBe("stack");
    expect(changes.list()).toEqual([]);
  });

  test("a wrapping Stack becomes a Grid of as many columns as its widest line, its gap between lines the row gap; a vertical one, one column", () => {
    const { editor, layer, boxes } = open();
    const [wrapped, column] = [boxes("wrapped"), boxes("column")];

    expect(editor.arrangedAs(layer("wrapped"), "grid")).toEqual({ type: "grid", columns: 3, rowGap: 10, columnGap: 20 });
    expect(editor.arrangedAs(layer("column"), "grid")).toEqual({ type: "grid", columns: 1, rowGap: 12, columnGap: 12 });
    editor.set(layer("column"), "arrangement", editor.arrangedAs(layer("column"), "grid"));
    expect(boxes("column")).toEqual(column);
    // Three columns of 400px less two gaps of 20px: 120px each, as wide as its layers were.
    editor.set(layer("wrapped"), "arrangement", editor.arrangedAs(layer("wrapped"), "grid"));
    expect(boxes("wrapped")).toEqual(wrapped);
  });

  test("a Grid becomes a Stack: horizontal, wrapping when it has rows and columns, its gaps kept; vertical, its row gap the gap", () => {
    const { editor, layer } = open();

    expect(editor.arrangedAs(layer("grid"), "horizontal")).toEqual({ type: "stack", direction: "horizontal", wrap: true, gap: 8, crossGap: 16 });
    expect(editor.arrangedAs(layer("grid"), "vertical")).toEqual({ type: "stack", direction: "vertical", wrap: false, gap: 16 });
    editor.set(layer("grid"), "arrangement", editor.arrangedAs(layer("grid"), "vertical"));
    expect(layer("grid").kind).toBe("stack");
    expect(editor.read(layer("grid"), "direction")).toBe("vertical");
    expect(editor.read(layer("grid"), "gap")).toBe(16);
  });

  test("its columns, gaps, direction or wrap changed once made a Grid or a Stack are of the same change: one for how it is laid out", () => {
    const { editor, changes, layer } = open();

    editor.set(layer("row"), "arrangement", editor.arrangedAs(layer("row"), "grid"));
    editor.set(layer("row"), "columns", 2);
    editor.set(layer("row"), "rowGap", 4);
    editor.set(layer("grid"), "arrangement", editor.arrangedAs(layer("grid"), "horizontal"));
    editor.set(layer("grid"), "direction", "vertical");

    expect(changes.list().map((change) => [change.property, change.after])).toEqual([
      ["arrangement", { type: "grid", columns: 2, rowGap: 4, columnGap: 24 }],
      ["arrangement", { type: "stack", direction: "vertical", wrap: true, gap: 8, crossGap: 16 }],
    ]);
    // Back as it was: no change.
    editor.set(layer("row"), "arrangement", { type: "stack", direction: "horizontal", wrap: false, gap: 24 });
    expect(changes.list().map((change) => change.layer)).toEqual([layer("grid").el.getAttribute("data-ht-layer")]);
  });

  test("in a narrower view it is made a Grid at its breakpoint only, the panel offering a Grid's properties there; inherit takes it back", async () => {
    const { doc, views, editor, changes, layer } = open();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    const displays = () => [doc, phone.document].map((d) => style(d.getElementById("row")!).display);

    editor.at(phone);
    editor.set(layer("row"), "arrangement", editor.arrangedAs(layer("row"), "grid"));
    editor.set(layer("row"), "columns", 1);

    expect(displays()).toEqual(["flex", "grid"]);
    expect(changes.list().map((change) => [change.property, change.breakpoint, (change.after as { columns: number }).columns])).toEqual([["arrangement", { min: null, max: 800 }, 1]]);
    expect([editor.can(layer("row"), "columns"), editor.can(layer("row"), "direction")]).toEqual([true, false]);
    editor.at(null);
    expect([editor.can(layer("row"), "columns"), editor.can(layer("row"), "direction")]).toEqual([false, true]);
    editor.at(phone);
    editor.inherit(layer("row"), "arrangement");
    expect(displays()).toEqual(["flex", "flex"]);
    expect(changes.list()).toEqual([]);
  });

  test("checked on the live page by its display, columns and gaps, however the code writes them; an earlier change to its direction is that change's to check", () => {
    const { editor, changes, layer } = open();
    editor.set(layer("column"), "gap", 20);
    editor.set(layer("row"), "arrangement", editor.arrangedAs(layer("row"), "grid"));
    editor.set(layer("column"), "arrangement", editor.arrangedAs(layer("column"), "grid"));
    const [gap, row, column] = changes.list();
    live = document.createElement("iframe");
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(
      ARRANGEMENTS.replace("display: flex; gap: 24px; width: 600px", "display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; width: 600px")
        .replace("display: flex; flex-direction: column; gap: 12px", "display: grid; gap: 20px"),
    );
    page.close();
    const round = onCanvas(changes.list());

    expect(checkChange(page, row, round)).toEqual({ outcome: "shown" });
    expect(checkChange(page, column, round)).toEqual({ outcome: "shown" });
    expect(checkChange(page, gap, round)).toEqual({ outcome: "unchecked", reason: `change ${column.id} lays the layer out anew, as a Grid: the page checks how it is laid out by that change` });
    page.getElementById("row")!.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    expect(checkChange(page, row, round)).toMatchObject({ outcome: "not shown", actual: { type: "grid", columns: 2 } });
  });

  test("made a Grid at every width, its columns changed in a narrower view are a change of their own there, which the check of the Grid leaves to it", async () => {
    const { views, editor, changes, layer } = open();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);

    editor.set(layer("row"), "arrangement", editor.arrangedAs(layer("row"), "grid"));
    editor.at(phone);
    editor.set(layer("row"), "columns", 1);

    const [grid, columns] = changes.list();
    expect([grid.property, grid.breakpoint, columns.property, columns.breakpoint]).toEqual(["arrangement", undefined, "columns", { min: null, max: 800 }]);
    expect(widthsOf(grid, changes.list(), 1440, [390, 1440])).toEqual({ own: true, others: [] });
  });

  test("its direction and gap changed in a narrower view, then made a Grid at every width: the Grid is checked there too, its gaps as that view's change has them", async () => {
    const { views, editor, changes, layer } = open();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);

    editor.at(phone);
    editor.set(layer("row"), "direction", "vertical");
    editor.set(layer("row"), "gap", 8);
    editor.at(null);
    editor.set(layer("row"), "arrangement", editor.arrangedAs(layer("row"), "grid"));
    const [direction, gap, grid] = changes.list();
    expect([direction.property, gap.property, grid.property, grid.breakpoint]).toEqual(["direction", "gap", "arrangement", undefined]);
    expect(widthsOf(grid, changes.list(), 1440, [390, 1440])).toEqual({ own: true, others: [390] });

    // The page as wide as its window, and as the phone view: a Grid of three columns, its gaps 24px, and 8px there.
    const pageOf = (frame: HTMLIFrameElement, gap: number) => {
      frame.style.width = "1000px";
      document.body.append(frame);
      const page = frame.contentDocument!;
      page.open();
      page.write(ARRANGEMENTS.replace("display: flex; gap: 24px; width: 600px", `display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: ${gap}px; width: 600px`));
      page.close();
      return page;
    };
    live = document.createElement("iframe");
    const page = pageOf(live, 24);
    const narrow = document.createElement("iframe");
    const there = pageOf(narrow, 8);
    const at = (width: number): PageWidth => ({ width, doc: there, own: false, of: (el) => there.getElementById(el.id) });
    const round = onCanvas(changes.list());
    try {
      expect(checkAcross(page, grid, round, [390], at)).toEqual({ outcome: "shown" });
      // Its columns are the Grid's to show there all the same.
      there.getElementById("row")!.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
      expect(checkAcross(page, grid, round, [390], at)).toMatchObject({ outcome: "not shown", actual: { type: "grid", columns: 2 }, width: 390 });
      // The narrower view's changes before it: the Grid's to check.
      expect([direction, gap].map((change) => checkAcross(page, change, round, [390], at).outcome)).toEqual(["unchecked", "unchecked"]);
    } finally {
      narrow.remove();
    }
  });

  test("a cell's Fill, Hug and `width: 100%` in a Grid: `100%` reads as Fill, and a size changed there is recorded as a cell's", () => {
    const { editor, changes, layer } = open();
    expect(editor.read(layer("full"), "width")).toEqual({ type: "fill" });
    expect(editor.read(layer("hug"), "width")).toEqual({ type: "hug" });
    editor.set(layer("hug"), "width", { type: "fill" });
    editor.set(layer("r1"), "height", { type: "fixed", value: 50 });
    expect(changes.list().map((change) => [change.property, change.cell])).toEqual([
      ["width", true],
      ["height", undefined],
    ]);
  });
});

describe("text that draws a box is a Frame with a text layer in it", () => {
  /** Buttons and links with only text in them, some drawing a box, and plain text beside them. */
  const BOXES_PAGE = `<!DOCTYPE html>
<body style="margin: 0; font: 15px/22px serif">
  <main id="main" ${loc("3:3")}>
    <button id="close" ${loc("4:5")} style="display: inline-block; margin: 0; padding: 6px 12px; border: 1px solid rgb(255, 0, 0); border-radius: 6px; background-color: rgb(0, 0, 0); box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.5); color: rgb(255, 255, 255); font: inherit">Close</button>
    <a id="more" href="#" ${loc("5:5")} style="display: inline-block; padding: 4px">Read <b ${loc("5:30")}>more</b></a>
    <a id="plain" href="#" ${loc("6:5")}>A plain link</a>
    <span id="marked" ${loc("7:5")} style="background-color: rgb(255, 255, 0)">Marked inline</span>
    <span id="bare" ${loc("8:5")} style="display: inline-block">Bare block</span>
    <p id="para" ${loc("9:5")} style="margin: 0">A paragraph</p>
    <button id="icon" ${loc("10:5")} style="display: inline-block; padding: 4px">Go <svg ${loc("10:30")} width="8" height="8"></svg></button>
  </main>
</body>`;

  test("a layer with only text in it that draws a box is a Frame, named for what it is for, holding one text layer of all its words; text that draws none is a text layer as before", () => {
    const { doc, editor, layerOf } = openCanvas(BOXES_PAGE);
    const at = (id: string) => layerOf(doc.getElementById(id)!);
    const close = at("close");

    expect([close.kind, close.name]).toEqual(["frame", "Button"]);
    expect(close.children.map((child) => [child.kind, child.name, child.el === close.el])).toEqual([["text", "Close", true]]);
    // Its inline fragments are part of the one text layer.
    expect([at("more").kind, at("more").name]).toEqual(["frame", "Link"]);
    expect(at("more").children.map((child) => [child.kind, child.name])).toEqual([["text", "Read more"]]);
    // Found again by the text it starts with, as the selection is.
    expect(editor.tree().layerOf(at("more").children[0].text!.find((node) => node.textContent!.trim())!)).toBe(at("more").children[0]);
    // Inline, or drawing no box: text, as before.
    for (const id of ["plain", "marked", "bare", "para"]) expect([id, at(id).kind, at(id).children]).toEqual([id, "text", []]);
    // Text beside another layer: loose text in a Frame, as before.
    expect(at("icon").children.map((child) => child.kind)).toEqual(["text", "image"]);
  });

  test("padding alone draws a box only around a button or a link: a table cell or a list item with only text and padding is a text layer still", () => {
    const { doc, layerOf } = openCanvas(`<!DOCTYPE html>
<body style="margin: 0; font: 15px/22px serif">
  <main id="main" ${loc("3:3")}>
    <table ${loc("4:5")}><tbody ${loc("4:12")}><tr ${loc("4:19")}><th id="head" ${loc("4:23")}>Name</th><td id="cell" ${loc("4:50")}>Ada</td></tr></tbody></table>
    <ul ${loc("5:5")} style="margin: 0"><li id="item" ${loc("5:30")} style="padding: 4px 8px">An item</li></ul>
    <button id="ghost" ${loc("6:5")} style="display: inline-block; margin: 0; padding: 6px 12px; border: 0; background: none; font: inherit">Ghost</button>
    <a id="link" href="#" ${loc("7:5")} style="display: block; padding: 0 12px">A block link</a>
    <span id="role" role="button" ${loc("8:5")} style="display: inline-block; padding: 4px">Role button</span>
    <span id="filled" ${loc("9:5")} style="display: inline-block; background-color: rgb(255, 255, 0)">Filled</span>
  </main>
</body>`);
    const at = (id: string) => layerOf(doc.getElementById(id)!);

    // Padding alone, on what is not a button or a link: text, as before.
    for (const id of ["head", "cell", "item"]) expect([id, at(id).kind, at(id).children]).toEqual([id, "text", []]);
    // A ghost button, a link, or what is one by its role: a Frame of one text layer, its padding to change.
    for (const id of ["ghost", "link", "role"]) {
      expect([id, at(id).kind, at(id).children.map((child) => [child.kind, child.el === at(id).el])]).toEqual([id, "frame", [["text", true]]]);
    }
    // A background draws a box whatever the element.
    expect([at("filled").kind, at("filled").children.map((child) => [child.kind, child.name])]).toEqual(["frame", [["text", "Filled"]]]);
  });

  test("the Frame reads the page's own background, border, corners, padding and shadow, and offers no text styles", () => {
    const { doc, editor, changes, layerOf } = openCanvas(BOXES_PAGE);
    const close = layerOf(doc.getElementById("close")!);

    expect(editor.read(close, "fill")).toEqual({ type: "solid", color: "#000000", opacity: 1 });
    expect(editor.read(close, "stroke")).toEqual({ color: "#FF0000", opacity: 1, weight: 1, style: "solid" });
    expect(editor.read(close, "radius")).toBe(6);
    expect(editor.read(close, "padding")).toEqual([6, 12, 6, 12]);
    expect(editor.read(close, "shadows")).toEqual([{ type: "drop", x: 0, y: 1, blur: 2, spread: 0, color: "#000000", opacity: 0.5 }]);
    expect((["fill", "stroke", "radius", "padding", "shadows", "opacity"] as const).map((property) => editor.can(close, property))).toEqual([true, true, true, true, true, true]);
    expect((["textColor", "fontSize", "textShadows"] as const).map((property) => editor.can(close, property))).toEqual([false, false, false]);
    // Told apart by its words, as a button is.
    editor.set(close, "radius", 8);
    expect(changes.list()[0].target.context).toEqual({ path: ["Page", "Frame", "Button"], element: '<button id="close">', text: "Close" });
    // A Frame of other layers has no padding: a Stack's are what lay its layers out.
    expect(editor.can(layerOf(doc.getElementById("icon")!), "padding")).toBe(false);
  });

  test("the text in it offers text styles only, written on the Frame's own element, which its words inherit: no <span> is put in, and the change is checked on the page", async () => {
    const { doc, editor, changes, layerOf } = openCanvas(BOXES_PAGE);
    const button = doc.getElementById("close")!;
    const [text] = layerOf(button).children;

    expect(editor.read(text, "textColor")).toEqual({ color: "#FFFFFF", opacity: 1 });
    expect((["fontSize", "textColor", "textShadows"] as const).map((property) => editor.can(text, property))).toEqual([true, true, true]);
    // The box is the Frame's: the text has none of its own to fill, size, place, hide or fade.
    expect((["fill", "stroke", "radius", "shadows", "padding", "width", "x", "visible", "opacity"] as const).map((property) => editor.can(text, property))).toEqual(
      Array(9).fill(false),
    );

    editor.set(text, "fontSize", 20);
    editor.set(text, "textColor", { color: "#FFFF00", opacity: 1 });

    expect([style(button).fontSize, style(button).color]).toEqual(["20px", "rgb(255, 255, 0)"]);
    expect(button.childElementCount).toBe(0);
    // Its text is the text layer still, the Frame's background its own.
    const now = layerOf(button);
    expect([now.kind, now.children[0].kind, editor.read(now, "fill")]).toEqual(["frame", "text", { type: "solid", color: "#000000", opacity: 1 }]);
    const [size] = changes.list();
    expect(size).toMatchObject({ layer: button.getAttribute("data-ht-layer"), property: "fontSize", after: 20, target: { loc: "src/App.tsx:4:5", context: { path: ["Page", "Frame", "Button", "Close"], element: '<button id="close">', text: "Close" } } });
    expect([size.target.run, size.target.onlyText]).toEqual([undefined, true]);

    live = document.createElement("iframe");
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    // The live page, as the Agent writes the text's styles on the button.
    page.write(BOXES_PAGE.replace("font: inherit\">Close", "font: inherit; font-size: 20px; color: rgb(255, 255, 0)\">Close"));
    page.close();
    expect(await checkChange(page, changes.list()[0], onCanvas([changes.list()[0]]))).toEqual({ outcome: "shown" });
    expect(await checkChange(page, changes.list()[1], onCanvas([changes.list()[1]]))).toEqual({ outcome: "shown" });
  });

  test("undone and redone, a change to the text is the text's still, and the text is what is left selected", () => {
    const { doc, editor, changes, layerOf } = openCanvas(BOXES_PAGE);
    const button = doc.getElementById("close")!;
    const [text] = layerOf(button).children;

    editor.set(text, "fontSize", 20);
    editor.set(layerOf(button), "radius", 0);
    editor.undo();
    const [undone] = editor.undo();
    expect([undone.kind, undone.name, undone.parent!.name]).toEqual(["text", "Close", "Button"]);
    expect(style(button).fontSize).toBe("15px");

    const [redone] = editor.redo();
    expect([redone.kind, redone.name]).toEqual(["text", "Close"]);
    expect(style(button).fontSize).toBe("20px");
    expect(changes.list()[0].target.context.path.at(-1)).toBe("Close");
    expect(changes.list()[0].target.run).toBeUndefined();
    // The box's change leaves the box selected.
    expect(editor.redo().map((layer) => layer.kind)).toEqual(["frame"]);
  });

  test("its words are changed in the Frame's own element, as the text's: no <span> is put in", () => {
    const { doc, editor, changes, layerOf } = openCanvas(BOXES_PAGE);
    const button = doc.getElementById("close")!;

    editor.setText(layerOf(button).children[0], "Done");

    expect([button.textContent, button.childElementCount]).toEqual(["Done", 0]);
    expect(changes.list()[0]).toMatchObject({ kind: "text", layer: button.getAttribute("data-ht-layer"), before: "Close", after: "Done", target: { context: { path: ["Page", "Frame", "Button", "Close"], element: '<button id="close">' } } });
    expect(changes.list()[0].target.run).toBeUndefined();
    const now = find(editor.tree().root, (layer) => layer.el === button && !layer.text)!;
    expect([now.kind, now.children.map((child) => [child.kind, child.name])]).toEqual(["frame", [["text", "Done"]]]);
    editor.undo();
    expect(button.textContent).toBe("Close");
  });

  test("a brief on the text, or deleting it, gives it an element of its own, as loose text gets: the Frame keeps its own brief, and is left empty", () => {
    const { doc, editor, changes } = openCanvas(BOXES_PAGE);
    const button = doc.getElementById("more")!;
    const box = () => find(editor.tree().root, (layer) => layer.el === button && !layer.text)!;

    const text = editor.setBrief(box().children[0], "Make it bold");
    expect([text.kind, text.name, text.el.localName, text.parent!.el]).toEqual(["text", "Read more", "span", button]);
    expect([box().kind, editor.brief(box()), editor.brief(text)]).toEqual(["frame", "", "Make it bold"]);
    // Still a box around its text: its padding is there to change.
    expect(editor.can(box(), "padding")).toBe(true);
    expect(changes.list()[0].target.run).toBe(0);

    editor.remove(box().children[0]);
    expect([box().kind, box().children, button.textContent]).toEqual(["frame", [], "Read more"]);
    expect(style(button.firstElementChild!).display).toBe("none");
  });

  test("given an element of its own, the text keeps the changes made to it before: changed here on the text, not the Frame, and undone, redone and taken back as the text's", async () => {
    const { doc, editor, views, changes } = openCanvas(BOXES_PAGE);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    const button = doc.getElementById("close")!;
    const box = () => find(editor.tree().root, (layer) => layer.el === button && !layer.text)!;

    editor.at(phone);
    editor.set(box().children[0], "fontSize", 20);
    editor.set(box(), "radius", 0);
    const text = editor.setBrief(box().children[0], "Make it bold");
    expect([text.kind, text.el.localName, text.parent!.el]).toEqual(["text", "span", button]);

    expect(editor.changesHere(box())).toEqual(["radius"]);
    expect(editor.changesHere(box().children[0])).toEqual(["fontSize"]);

    editor.undo();
    editor.undo();
    const [undone] = editor.undo();
    expect([undone.kind, undone.el.localName, style(phone.document.getElementById("close")!).fontSize]).toEqual(["text", "span", "15px"]);
    const [redone] = editor.redo();
    expect([redone.kind, redone.el.localName, style(phone.document.getElementById("close")!).fontSize]).toEqual(["text", "span", "20px"]);
    // Recorded again as it was first: the text in the Button, written on the Button.
    const size = changes.list().find((change) => change.property === "fontSize")!;
    expect([size.target.context.path, size.target.context.element, size.target.onlyText, size.target.run]).toEqual([
      ["Page", "Frame", "Button", "Close"],
      '<button id="close">',
      true,
      undefined,
    ]);

    const back = editor.revert(size.id)!;
    expect([back.kind, back.el.localName, style(phone.document.getElementById("close")!).fontSize]).toEqual(["text", "span", "15px"]);
  });

  test("its words changed before it got an element of its own, taking that change back keeps the element and what is written on it: only the words it had come back, in it", () => {
    const { doc, editor, changes } = openCanvas(BOXES_PAGE);
    const button = doc.getElementById("more")!;
    const box = () => find(editor.tree().root, (layer) => layer.el === button && !layer.text)!;

    editor.setText(box().children[0], "Read on");
    const text = editor.setBrief(box().children[0], "Make it bold");
    editor.set(text, "fontSize", 20);
    const span = button.querySelector("[data-ht-wrap]")!;
    const id = span.getAttribute("data-ht-layer");

    const words = changes.list().find((change) => change.kind === "text")!;
    editor.revert(words.id);

    expect(button.querySelector("[data-ht-wrap]")).toBe(span);
    expect([button.childElementCount, span.textContent, span.querySelector("b")?.textContent, style(span).fontSize]).toEqual([1, "Read more", "more", "20px"]);
    expect(changes.list().map((change) => [change.property, change.layer])).toEqual([
      ["brief", id],
      ["fontSize", id],
    ]);
    const now = editor.tree().layerOf(span)!;
    expect([now.kind, now.name, now.parent!.el, editor.brief(now)]).toEqual(["text", "Read more", button, "Make it bold"]);

    // Undone, the change to the words is made again, in the element the text has now.
    editor.undo();
    expect([button.querySelector("[data-ht-wrap]"), span.textContent, style(span).fontSize]).toEqual([span, "Read on", "20px"]);
  });

  test("undone back to before its words changed, the text keeps the element it got after: redone, its words, brief and text styles are in it again", () => {
    const { doc, editor, changes } = openCanvas(BOXES_PAGE);
    const button = doc.getElementById("close")!;
    const box = () => find(editor.tree().root, (layer) => layer.el === button && !layer.text)!;

    editor.setText(box().children[0], "Done");
    const text = editor.setBrief(box().children[0], "Make it bold");
    editor.set(text, "fontSize", 20);
    const span = button.querySelector("[data-ht-wrap]")!;

    editor.undo();
    editor.undo();
    editor.undo();
    expect(changes.list()).toEqual([]);
    expect([button.querySelector("[data-ht-wrap]"), button.childElementCount, span.textContent, style(span).fontSize]).toEqual([span, 1, "Close", "15px"]);
    expect(editor.brief(editor.tree().layerOf(span)!)).toBe("");

    editor.redo();
    expect([button.querySelector("[data-ht-wrap]"), span.textContent]).toEqual([span, "Done"]);
    editor.redo();
    editor.redo();
    const now = editor.tree().layerOf(span)!;
    expect([now.kind, now.name, editor.brief(now), style(span).fontSize]).toEqual(["text", "Done", "Make it bold", "20px"]);
    expect(changes.list().map((change) => [change.property, change.layer])).toEqual([
      ["text", button.getAttribute("data-ht-layer")],
      ["brief", span.getAttribute("data-ht-layer")],
      ["fontSize", span.getAttribute("data-ht-layer")],
    ]);

    // Undone once more, the words it had come back in it as they were, with no element of its own put in it.
    editor.undo();
    editor.undo();
    editor.undo();
    expect([button.querySelector("[data-ht-wrap]"), button.childElementCount, span.childElementCount, span.textContent]).toEqual([span, 1, 0, "Close"]);
  });

  test("whether a layer of text draws a box is read from the page's own styles: a Frame with its background taken off is a Frame still, built anew, and takes a fill again", () => {
    const { doc, editor, layerOf } = openCanvas(`<!DOCTYPE html>
<body style="margin: 0; font: 15px/22px serif">
  <main id="main" ${loc("3:3")}>
    <span id="filled" ${loc("4:5")} style="display: inline-block; background-color: rgb(255, 255, 0)">Filled</span>
    <span id="bare" ${loc("5:5")} style="display: inline-block">Bare</span>
  </main>
</body>`);
    const filled = doc.getElementById("filled")!;
    const box = () => find(editor.tree().root, (layer) => layer.el === filled && !layer.text)!;

    editor.set(box(), "fill", null);
    // A change to the structure builds the layers anew.
    editor.setBrief(layerOf(doc.getElementById("main")!), "Anything");

    expect([box().kind, box().children.map((child) => child.kind)]).toEqual(["frame", ["text"]]);
    expect(editor.can(box(), "fill")).toBe(true);
    editor.set(box(), "fill", { type: "solid", color: "#00FF00", opacity: 1 });
    expect(style(filled).backgroundColor).toBe("rgb(0, 255, 0)");
    // Text that draws no box is text still.
    const bare = find(editor.tree().root, (layer) => layer.el === doc.getElementById("bare"))!;
    expect([bare.kind, bare.children]).toEqual(["text", []]);
  });

  test("a round saved while the button was a text layer goes on: its text styles are the text's, its others the Frame's", () => {
    const opened = openCanvas(BOXES_PAGE);
    const button = opened.doc.getElementById("close")!;
    opened.editor.set(opened.layerOf(button).children[0], "fontSize", 20);
    opened.editor.set(opened.layerOf(button), "opacity", 0.5);
    const saved = opened.changes.save();
    // As recorded then: the button itself was the layer, named for its words.
    for (const change of saved.changes) change.target.context.path = ["Page", "Frame", "Close"];
    const canvas = serializeCanvas({ document: opened.doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });

    const again = openCanvas(canvas);
    const changes = createChangeSet(saved);
    const editor = createEditor(again.views, changes);
    const box = again.layerOf(again.doc.getElementById("close")!);
    const [text] = box.children;
    expect([box.kind, editor.read(text, "fontSize"), editor.read(box, "opacity")]).toEqual(["frame", 20, 0.5]);

    editor.set(text, "fontSize", 18);
    expect(changes.list().map((change) => [change.property, change.before, change.after])).toEqual([["fontSize", 15, 18], ["opacity", 1, 0.5]]);
    const [size] = changes.list();
    const back = editor.revert(size.id)!;
    expect([back.kind, back.name]).toEqual(["text", "Close"]);
    expect([style(again.doc.getElementById("close")!).fontSize, style(again.doc.getElementById("close")!).opacity]).toEqual(["15px", "0.5"]);
  });

  test("in a narrower view, the text's changes are listed as changed there on the text, the Frame's on the Frame", async () => {
    const { doc, editor, views, changes, layerOf } = openCanvas(BOXES_PAGE);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    const button = layerOf(doc.getElementById("close")!);

    editor.at(phone);
    editor.set(button.children[0], "fontSize", 20);
    editor.set(layerOf(doc.getElementById("close")!), "fill", { type: "solid", color: "#FF0000", opacity: 1 });

    const now = layerOf(doc.getElementById("close")!);
    expect([style(phone.document.getElementById("close")!).fontSize, style(doc.getElementById("close")!).fontSize]).toEqual(["20px", "15px"]);
    expect(editor.changesHere(now)).toEqual(["fill"]);
    expect(editor.changesHere(now.children[0])).toEqual(["fontSize"]);
    editor.inherit(now.children[0], "fontSize");
    expect(style(phone.document.getElementById("close")!).fontSize).toBe("15px");
    expect(editor.changesHere(now)).toEqual(["fill"]);

    // Placed freely there: the Frame is, not its text.
    editor.move(now, { parent: layerOf(doc.getElementById("main")!), x: 10, y: 10 });
    const placed = find(editor.tree().root, (layer) => layer.el === doc.getElementById("close") && !layer.text)!;
    expect([editor.changesHere(placed), editor.changesHere(placed.children[0])]).toEqual([["fill", "absolute"], []]);
    const absolute = changes.list().find((change) => change.property === "absolute")!;
    expect([absolute.target.context.path.at(-1), absolute.target.onlyText]).toEqual(["Button", undefined]);
    expect(editor.undo().map((layer) => layer.kind)).toEqual(["frame"]);
  });

  test("hidden, a layer of text keeps what it is shown as: inline text with a background is text still", () => {
    const { doc, editor, layerOf } = openCanvas(BOXES_PAGE);
    editor.set(layerOf(doc.getElementById("marked")!), "visible", false);
    editor.set(layerOf(doc.getElementById("close")!), "visible", false);
    // The layers as built anew, as a structural edit builds them.
    const at = (id: string) => buildLayerTree(doc).layerOf(doc.getElementById(id)!)!;

    expect([at("marked").kind, at("marked").children]).toEqual(["text", []]);
    expect([at("close").kind, at("close").children.map((child) => child.kind)]).toEqual(["frame", ["text"]]);
  });
});

describe("layers made this round are found on the live page at their place, and checked there (ticket 76)", () => {
  /** The round as the page checks it: its changes, as saved, each new layer's with where it is on the canvas as saved. */
  const savedOf = (doc: Document, changes: { save(): { changes: Change[] } }) =>
    placedOnCanvas(JSON.parse(JSON.stringify(changes.save().changes)), serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }));
  const open = (page = STRUCTURE) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    return { ...canvas, layer, saved: () => savedOf(canvas.doc, canvas.changes) };
  };
  /** The live page: `page` as the Agent has written it. */
  const livePage = (page: string) => {
    live = document.createElement("iframe");
    live.style.width = "800px";
    document.body.append(live);
    const doc = live.contentDocument!;
    doc.open();
    doc.write(page);
    doc.close();
    return doc;
  };
  const RED = { type: "solid", color: "#FF0000", opacity: 1 } as const;
  /** A Frame drawn in the list's layout, 2nd, filled red with 4px corners. */
  const frameInTheList = () => {
    const canvas = open();
    const frame = canvas.editor.create("frame", { parent: canvas.layer("list"), index: 1 }, { width: 120, height: 40 });
    canvas.editor.set(canvas.editor.tree().layerOf(frame.el)!, "fill", RED);
    canvas.editor.set(canvas.editor.tree().layerOf(frame.el)!, "radius", 4);
    return canvas;
  };
  /** STRUCTURE, with `html` written in the list after A, the lines below one down. */
  const writtenAfterA = (html: string) => STRUCTURE.replace(`<div id="b" ${loc("7:7")}`, `${html}<div id="b" ${loc("8:7")}`).replace(`<div id="c" ${loc("8:7")}`, `<div id="c" ${loc("9:7")}`);

  test("a new Frame and the changes to it show where the Agent writes it: the 2nd layer of its container, a <div>", () => {
    const { saved } = frameInTheList();
    const page = livePage(writtenAfterA(`<div ${loc("7:7")} style="width: 120px; height: 40px; background-color: rgb(255, 0, 0); border-radius: 4px"></div>`));

    expect(saved().map((change) => checkChange(page, change, saved()))).toEqual([{ outcome: "shown" }, { outcome: "shown" }, { outcome: "shown" }]);
  });

  test("written at another place, the new Frame is not shown, with what is at its place instead, a layer the container had; the changes to it are not checked", () => {
    const { saved } = frameInTheList();
    const round = saved();
    const elsewhere = livePage(STRUCTURE.replace(`<div id="c" ${loc("8:7")} style="height: 20px">C</div>`, `<div id="c" ${loc("8:7")} style="height: 20px">C</div><div ${loc("9:7")} style="width: 120px; height: 40px; background-color: rgb(255, 0, 0); border-radius: 4px"></div>`));

    expect(checkChange(elsewhere, round[0], round)).toEqual({ outcome: "not shown", actual: { type: "frame", nth: [2, 2], there: '<div id="b"> reading \u201cB\u201d' } });
    expect(checkChange(elsewhere, round[1], round)).toEqual({ outcome: "unchecked", reason: "the layer is new this round, and not at its place on the page (change 1)" });
  });

  test("of whatever element the Agent writes it: a Frame as a <ul> or a <section>, text as an <h2> or a <span>; the canvas's <div> and <p> are the editor's", () => {
    for (const tag of ["ul", "section"]) {
      const { saved } = frameInTheList();
      const page = livePage(writtenAfterA(`<${tag} ${loc("7:7")} style="display: block; margin: 0; padding: 0; width: 120px; height: 40px; background-color: rgb(255, 0, 0); border-radius: 4px"></${tag}>`));
      expect(saved().map((change) => checkChange(page, change, saved()))).toEqual([{ outcome: "shown" }, { outcome: "shown" }, { outcome: "shown" }]);
      live?.remove();
      iframe?.remove();
    }
    for (const tag of ["h2", "span"]) {
      const { editor, saved, layer } = open();
      const text = editor.create("text", { parent: layer("list"), index: 1 });
      editor.set(editor.tree().layerOf(text.el)!, "fontSize", 20);
      const page = livePage(writtenAfterA(`<${tag} ${loc("7:7")} style="display: block; margin: 0; font-size: 20px">Text</${tag}>`));
      expect(saved().map((change) => checkChange(page, change, saved()))).toEqual([{ outcome: "shown" }, { outcome: "shown" }]);
      live?.remove();
      iframe?.remove();
    }
  });

  test("new text is found at its place by its words too", () => {
    const { editor, saved, layer } = open();
    const text = editor.create("text", { parent: layer("list"), index: 1 });
    editor.set(editor.tree().layerOf(text.el)!, "fontSize", 20);
    const round = saved();

    const right = livePage(writtenAfterA(`<p ${loc("7:7")} style="margin: 0; font-size: 20px">Text</p>`));
    expect(round.map((change) => checkChange(right, change, round))).toEqual([{ outcome: "shown" }, { outcome: "shown" }]);
    live?.remove();
    const wrong = livePage(writtenAfterA(`<p ${loc("7:7")} style="margin: 0; font-size: 20px">Other words</p>`));
    expect(checkChange(wrong, round[0], round)).toEqual({ outcome: "not shown", actual: { type: "text", words: "Text", nth: [2, 2], there: '<p> reading \u201cOther words\u201d' } });
  });

  test("a layer before it deleted this round: found there with the layer still on the page, and once it is gone", () => {
    const { editor, changes, saved, layer } = open();
    editor.create("frame", { parent: layer("list"), index: 2 }, { width: 120, height: 40 });
    editor.remove(layer("a"));
    const round = saved();
    expect(round[0].among).toMatchObject({ before: 1, maybe: 1 });
    // Read from the canvas by the page, never saved with the ChangeSet, which the Agent may read.
    expect(JSON.stringify(changes.save())).not.toContain("among");

    const frame = `<div ${loc("8:7")} style="width: 120px; height: 40px"></div>`;
    const kept = livePage(STRUCTURE.replace(`<div id="c" ${loc("8:7")}`, `${frame}<div id="c" ${loc("9:7")}`));
    expect(checkChange(kept, round[0], round)).toEqual({ outcome: "shown" });
    live?.remove();
    const gone = livePage(STRUCTURE.replace(`<div id="a" ${loc("6:7")} style="height: 20px">A</div>`, "").replace(`<div id="c" ${loc("8:7")}`, `${frame}<div id="c" ${loc("9:7")}`));
    expect(checkChange(gone, round[0], round)).toEqual({ outcome: "shown" });
  });

  test("a Frame placed absolute in a Frame is found placed absolute in it, wherever among its layers it is written, at the X and Y the designer last gave it; text in it, in turn", () => {
    const { editor, saved, layer } = open();
    const frame = editor.create("frame", { parent: layer("board"), x: 30, y: 20 }, { width: 120, height: 80 });
    editor.set(editor.tree().layerOf(frame.el)!, "x", 40);
    const text = editor.create("text", { parent: editor.tree().layerOf(frame.el)!, x: 10, y: 10 });
    editor.set(editor.tree().layerOf(text.el)!, "fontSize", 20);
    const round = saved();
    expect(round.map((change) => change.kind)).toEqual(["create", "style", "create", "style"]);

    const written = (left: number) =>
      STRUCTURE.replace(
        `<div id="board" ${loc("13:5")} style="width: 300px; height: 100px"><span id="tag" ${loc("14:7")} style="display: inline-block; width: 50px; height: 20px">Tag</span></div>`,
        `<div id="board" ${loc("13:5")} style="position: relative; width: 300px; height: 100px"><div ${loc("14:7")} style="position: absolute; left: ${left}px; top: 20px; width: 120px; height: 80px"><p ${loc("15:9")} style="position: absolute; left: 10px; top: 10px; margin: 0; font-size: 20px">Text</p></div><span id="tag" ${loc("17:7")} style="display: inline-block; width: 50px; height: 20px">Tag</span></div>`,
      );
    const page = livePage(written(40));
    expect(round.map((change) => checkChange(page, change, round))).toEqual([{ outcome: "shown" }, { outcome: "shown" }, { outcome: "shown" }, { outcome: "shown" }]);
    live?.remove();
    const off = livePage(written(30));
    expect(checkChange(off, round[0], round)).toEqual({ outcome: "not shown", actual: { x: 30, y: 20, margins: { x: 0, y: 0 } } });
    expect(checkChange(off, round[2], round)).toEqual({ outcome: "shown" });
  });

  test("written in a loop's instances from one place in the source, it is one layer, checked in each; from two places, it is not checked, and they are named", () => {
    const card = (n: number, inner: string) => `<article ${loc("30:9")} style="display: flex; flex-direction: column"><h3 ${loc("31:11")}>Card ${n}</h3>${inner}</article>`;
    const cards = (inner: (n: number) => string) => `<!DOCTYPE html><body style="margin: 0"><main ${loc("29:7")}>${[1, 2, 3].map((n) => card(n, inner(n))).join("")}</main></body>`;
    const { doc, editor, changes } = openCanvas(cards(() => ""));
    const saved = () => savedOf(doc, changes);
    const article = find(editor.tree().root, (l) => l.el === doc.querySelector("article"))!;
    const text = editor.create("text", { parent: article, index: 1 });
    editor.set(editor.tree().layerOf(text.el)!, "fontSize", 20);
    const round = saved();

    const once = livePage(cards(() => `<p ${loc("32:11")} style="font-size: 20px">Text</p>`));
    expect(round.map((change) => checkChange(once, change, round))).toEqual([{ outcome: "shown" }, { outcome: "shown" }]);
    live?.remove();
    const smaller = livePage(cards((n) => `<p ${loc("32:11")} style="font-size: ${n === 3 ? 14 : 20}px">Text</p>`));
    expect(checkChange(smaller, round[1], round)).toEqual({ outcome: "not shown", actual: 14 });
    live?.remove();
    const twice = livePage(cards((n) => `<p ${loc(n === 1 ? "33:13" : "35:13")} style="font-size: 20px">Text</p>`));
    const reason = "3 elements at its place match it, written at 2 places in the source (`src/App.tsx:33:13`, `src/App.tsx:35:13`): the page does not guess which is the layer";
    expect(round.map((change) => checkChange(twice, change, round))).toEqual([
      { outcome: "unchecked", reason },
      { outcome: "unchecked", reason },
    ]);
  });

  test("a layer copied this round is not looked for; one made in a round before is not either, and the check says so", () => {
    const { editor, saved, layer } = open();
    const copy = editor.duplicate(layer("a"));
    editor.set(editor.tree().layerOf(copy.el)!, "fontSize", 20);
    const round = saved();
    const page = livePage(STRUCTURE);

    expect(checkChange(page, round[1], round)).toEqual({ outcome: "unchecked", reason: "the layer is new this round, so the page has no marker to find it by" });
    expect(checkChange(page, round[1], onCanvas([round[1]]))).toEqual({ outcome: "unchecked", reason: "the layer was made in a round before, and the page cannot find it: the canvas has no source marker for it" });
  });
});

/**
 * Layers placed freely from their container's right or bottom edge, or
 * centered on where they are placed by `translate: -50%`, as Tailwind v3
 * (`transform`, through its variables) and v4 (`translate`) write
 * `-translate-x-1/2` (ticket 75); or from the right, on where `right: 50%`
 * places it, by `translate: 50%` (`right-1/2 translate-x-1/2`).
 */
const ANCHORED = `<!DOCTYPE html>
<style>
  * { --tw-translate-x: 0; --tw-translate-y: 0; --tw-rotate: 0; --tw-skew-x: 0; --tw-skew-y: 0; --tw-scale-x: 1; --tw-scale-y: 1; }
  .v3-centered { --tw-translate-x: -50%; --tw-translate-y: -50%; transform: translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y)); }
  .v4-centered { --tw-translate-x: calc(calc(1/2 * 100%) * -1); translate: var(--tw-translate-x) var(--tw-translate-y); }
  .v4-centered-from-right { --tw-translate-x: calc(1/2 * 100%); translate: var(--tw-translate-x) var(--tw-translate-y); }
</style>
<body style="margin: 0">
  <div id="board" ${at("40:5")} style="position: relative; width: 300px; height: 200px">
    <div id="right" ${at("41:7")} style="position: absolute; right: 10px; top: 8px; width: 30px; height: 20px"></div>
    <div id="bottom" ${at("42:7")} style="position: absolute; left: 12px; bottom: 6px; width: 30px; height: 20px"></div>
    <div id="v3" class="v3-centered" ${at("43:7")} style="position: absolute; left: 50%; top: 50%; width: 40px; height: 20px"></div>
    <div id="v4" class="v4-centered" ${at("44:7")} style="position: absolute; left: 50%; top: 40px; width: 40px; height: 20px"></div>
    <div id="v4-right" class="v4-centered-from-right" ${at("45:7")} style="position: absolute; right: 50%; top: 120px; width: 40px; height: 20px"></div>
  </div>
</body>`;

describe("resizing a layer placed from its container's right or bottom edge, or centered (ticket 75)", () => {
  /** How a change records a layer placed from its container's right or bottom edge, and one centered on where its `left` or `top` places it. */
  const [END, CENTERED] = [{ edge: "end", centered: false }, { edge: "start", centered: true }];
  const open = () => {
    const canvas = openCanvas(ANCHORED);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const box = (id: string) => {
      const r = canvas.doc.getElementById(id)!.getBoundingClientRect();
      const p = canvas.doc.getElementById(id)!.parentElement!.getBoundingClientRect();
      return [r.left - p.left, r.top - p.top, r.width, r.height];
    };
    const recorded = () => canvas.changes.list().map((change) => [change.property, change.before, change.after, change.placedFrom]);
    return { ...canvas, layer, box, recorded };
  };

  test("by a handle, placed from the right: its `right` goes where the right edge is dragged, its width with it; dragged by its left edge, its width alone, the right edge staying", () => {
    const { editor, layer, box, recorded } = open();

    editor.resize(layer("right"), { width: 40, right: 0 });
    expect(box("right")).toEqual([260, 8, 40, 20]);
    editor.resize(layer("right"), { width: 50 });
    expect(box("right")).toEqual([250, 8, 50, 20]);

    expect(recorded()).toEqual([
      ["width", { type: "fixed", value: 30 }, { type: "fixed", value: 50 }, END],
      ["right", 10, 0, undefined],
    ]);
    // X shows where its left edge is now.
    expect(editor.read(layer("right"), "x")).toBe(250);
    editor.undo();
    editor.undo();
    expect(box("right")).toEqual([260, 8, 30, 20]);
    expect(recorded()).toEqual([]);
  });

  test("its width or height set, as in the Design panel: its left and top edges stay, as in Figma; placed from the right or bottom, its `right` or `bottom` changes with it, one step", () => {
    const { editor, layer, box, recorded } = open();

    editor.set(layer("right"), "width", { type: "fixed", value: 50 });
    editor.set(layer("bottom"), "height", { type: "fixed", value: 30 });

    expect(box("right")).toEqual([260, 8, 50, 20]);
    expect(box("bottom")).toEqual([12, 174, 30, 30]);
    expect(recorded()).toEqual([
      ["width", { type: "fixed", value: 30 }, { type: "fixed", value: 50 }, END],
      ["right", 10, -10, undefined],
      ["height", { type: "fixed", value: 20 }, { type: "fixed", value: 30 }, END],
      ["bottom", 6, -4, undefined],
    ]);
    editor.undo();
    expect(box("bottom")).toEqual([12, 174, 30, 20]);
    expect(recorded().map(([property]) => property)).toEqual(["width", "right"]);
  });

  test("centered by `translate: -50%`, as Tailwind v3 and v4 write it: its width or height set, it stays centered, and nothing else changes", () => {
    const { editor, layer, box, recorded } = open();

    editor.set(layer("v3"), "width", { type: "fixed", value: 60 });
    editor.set(layer("v3"), "height", { type: "fixed", value: 30 });
    editor.set(layer("v4"), "width", { type: "fixed", value: 80 });

    expect(box("v3")).toEqual([120, 85, 60, 30]);
    expect(box("v4")).toEqual([110, 40, 80, 20]);
    expect(recorded()).toEqual([
      ["width", { type: "fixed", value: 40 }, { type: "fixed", value: 60 }, CENTERED],
      ["height", { type: "fixed", value: 20 }, { type: "fixed", value: 30 }, CENTERED],
      // Placed by its top down, centered across only.
      ["width", { type: "fixed", value: 40 }, { type: "fixed", value: 80 }, CENTERED],
    ]);
  });

  test("centered from the right, on where its `right` places it by `translate: 50%`: centered all the same, its width set, it stays centered, and the change says it is centered by its `right` (ticket 75, line review)", () => {
    const { editor, layer, box, recorded } = open();
    expect(box("v4-right")).toEqual([130, 120, 40, 20]);

    editor.set(layer("v4-right"), "width", { type: "fixed", value: 80 });

    expect(box("v4-right")).toEqual([110, 120, 80, 20]);
    expect(recorded()).toEqual([["width", { type: "fixed", value: 40 }, { type: "fixed", value: 80 }, { edge: "end", centered: true }]]);
  });

  test("placed from its left and top, its width set: as before, nothing else changes and nothing says how it is placed", () => {
    const { editor, layer, recorded } = open();

    editor.set(layer("bottom"), "width", { type: "fixed", value: 50 });

    expect(recorded()).toEqual([["width", { type: "fixed", value: 30 }, { type: "fixed", value: 50 }, undefined]]);
  });
});

describe("moving a layer placed from its container's right or bottom edge, or centered (ticket 79)", () => {
  const [CENTERED, CENTERED_FROM_RIGHT] = [{ edge: "start", centered: true }, { edge: "end", centered: true }];
  /** As the live page has its markers, and so the canvas: with no React, no usage chains. */
  const UNCHAINED = ANCHORED.replace(/ data-ht-chain='[^']*'/g, "");
  const open = (html = ANCHORED) => {
    const canvas = openCanvas(html);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const box = (id: string) => {
      const r = canvas.doc.getElementById(id)!.getBoundingClientRect();
      const p = canvas.doc.getElementById(id)!.parentElement!.getBoundingClientRect();
      return [r.left - p.left, r.top - p.top, r.width, r.height];
    };
    const recorded = () => canvas.changes.list().map((change) => [change.property, change.before, change.after, change.placedFrom, change.centeredOn]);
    const declared = (id: string, property: string) => declaredByEdit(canvas.doc.getElementById(id)!, property);
    return { ...canvas, layer, box, recorded, declared };
  };

  test("its X set, as in the Design panel, placed from the right: its `right` changes by as much the other way, and it stays placed from the right; X shows where it is", () => {
    const { editor, layer, box, recorded, declared } = open();

    editor.set(layer("right"), "x", 250);

    expect(box("right")).toEqual([250, 8, 30, 20]);
    expect(recorded()).toEqual([["right", 10, 20, undefined, undefined]]);
    expect(declared("right", "left")).toBe("");
    expect(editor.read(layer("right"), "x")).toBe(250);
    editor.undo();
    expect(box("right")).toEqual([260, 8, 30, 20]);
    expect(recorded()).toEqual([]);
  });

  test("nudged, placed from the right or the bottom: its `right` or `bottom` changes, a run of nudges one step", () => {
    const { editor, layer, box, recorded } = open();

    editor.nudge([layer("bottom")], 0, -1);
    editor.nudge([layer("bottom")], 0, -4, { continues: true });
    editor.nudge([layer("right")], 3, 0);

    expect(box("bottom")).toEqual([12, 169, 30, 20]);
    expect(box("right")).toEqual([263, 8, 30, 20]);
    expect(recorded()).toEqual([
      ["bottom", 6, 11, undefined, undefined],
      ["right", 10, 7, undefined, undefined],
    ]);
    editor.undo();
    editor.undo();
    expect(box("bottom")).toEqual([12, 174, 30, 20]);
  });

  test("dropped where it is dragged to, centered by `translate: -50%` as Tailwind v3 and v4 write it: it lands there, not half its width aside, and stays centered, past the middle by as much", () => {
    const { editor, layer, box, recorded, declared } = open();
    const board = layer("board");
    expect(box("v4")).toEqual([130, 40, 40, 20]);

    // Where its border box is let go, as a drag drops it.
    editor.move(layer("v4"), { parent: board, x: 150, y: 50 });
    editor.move(layer("v3"), { parent: board, x: 110, y: 90 });

    expect(box("v4")).toEqual([150, 50, 40, 20]);
    expect(box("v3")).toEqual([110, 90, 40, 20]);
    expect(declared("v4", "left")).toBe("calc(50% + 20px)");
    expect(recorded()).toEqual([
      ["x", 150, 170, CENTERED, { before: { percent: 50, px: 0 }, after: { percent: 50, px: 20 } }],
      ["y", 40, 50, undefined, undefined],
      // Dropped at the same height: down, it stays as it is.
      ["x", 150, 130, CENTERED, { before: { percent: 50, px: 0 }, after: { percent: 50, px: -20 } }],
    ]);
    editor.undo();
    editor.undo();
    expect(box("v4")).toEqual([130, 40, 40, 20]);
    expect(declared("v4", "left")).toBe("");
  });

  test("centered from the right, by `translate: 50%`: moved, its `right` stays centered, past the middle by as much the other way", () => {
    const { editor, layer, box, recorded, declared } = open();

    editor.move(layer("v4-right"), { parent: layer("board"), x: 150, y: 120 });

    expect(box("v4-right")).toEqual([150, 120, 40, 20]);
    expect(declared("v4-right", "right")).toBe("calc(50% - 20px)");
    expect(declared("v4-right", "left")).toBe("");
    expect(recorded()).toEqual([["right", 150, 130, CENTERED_FROM_RIGHT, { before: { percent: 50, px: 0 }, after: { percent: 50, px: -20 } }]]);
  });

  /** The page as the canvas was frozen from it, its board `width` px wide; `css`: the code as the Agent writes it. */
  const pageWith = (width: number, css: string) => {
    live?.remove();
    live = document.createElement("iframe");
    live.style.width = "800px";
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(UNCHAINED.replace("width: 300px", `width: ${width}px`).replace("</style>", `${css}</style>`));
    page.close();
    return page;
  };

  test("centered and moved: the page shows it where the share its side keeps puts it, past it by as much, however wide its container is; a `left` in px right as wide as the canvas is not", () => {
    const { editor, layer, changes } = open(UNCHAINED);
    editor.move(layer("v4"), { parent: layer("board"), x: 150, y: 40 });
    const [moved] = changes.list();

    for (const width of [300, 400]) expect(checkChange(pageWith(width, "#v4 { left: calc(50% + 20px) !important }"), moved, onCanvas([moved]))).toEqual({ outcome: "shown" });
    expect(checkChange(pageWith(300, "#v4 { left: 170px !important }"), moved, onCanvas([moved]))).toEqual({ outcome: "shown" });
    // Its container 400px wide: centered 20px past its middle, at 220px; not at 170px.
    expect(checkChange(pageWith(400, "#v4 { left: 170px !important }"), moved, onCanvas([moved]))).toEqual({ outcome: "not shown", actual: { value: 170, margin: 0, at: 220, share: { percent: 0, px: 170 } } });
  });

  test("centered by `translate`, moved or its X set, in a board drawn at half its size: the page shows it where the share puts it in the board as laid out, not as drawn (ticket 89, re-review)", () => {
    const page = () => pageWith(400, "#board { transform: scale(0.5) } #v4 { left: calc(50% + 20px) !important }");
    const moving = open(UNCHAINED);
    moving.editor.move(moving.layer("v4"), { parent: moving.layer("board"), x: 150, y: 40 });
    const [moved] = moving.changes.list();
    expect(checkChange(page(), moved, onCanvas([moved]))).toEqual({ outcome: "shown" });
    iframe?.remove();
    const setting = open(UNCHAINED);
    setting.editor.set(setting.layer("v4"), "x", setting.editor.read(setting.layer("v4"), "x")! + 20);
    const [x] = setting.changes.list();
    expect(x.property).toBe("x");
    expect(checkChange(page(), x, onCanvas([x]))).toEqual({ outcome: "shown" });
  });

  test("centered from the right and moved: its `right` is looked at the same way", () => {
    const { editor, layer, changes } = open(UNCHAINED);
    editor.move(layer("v4-right"), { parent: layer("board"), x: 150, y: 120 });
    const [moved] = changes.list();

    expect(checkChange(pageWith(400, "#v4-right { right: calc(50% - 20px) !important }"), moved, onCanvas([moved]))).toEqual({ outcome: "shown" });
    expect(checkChange(pageWith(400, "#v4-right { right: 130px !important }"), moved, onCanvas([moved]))).toEqual({ outcome: "not shown", actual: { value: 130, margin: 0, at: 180, share: { percent: 0, px: 130 } } });
  });

  test("centered and moved, its side right but its translate gone or overridden: the page draws it half its width aside, so it is not shown at any width, and says the translate is gone (line review)", () => {
    const { editor, layer, changes } = open(UNCHAINED);
    editor.move(layer("v4"), { parent: layer("board"), x: 150, y: 40 });
    editor.move(layer("v4-right"), { parent: layer("board"), x: 150, y: 120 });
    const [moved, fromRight] = changes.list();
    const share = { percent: 50, px: 20 };

    for (const width of [300, 400]) {
      // Its `-translate-x-1/2` taken out; in v3, another `transform` written over it.
      for (const css of ["#v4 { left: calc(50% + 20px) !important; translate: none !important }", "#v4 { left: calc(50% + 20px) !important; translate: none !important; transform: rotate(3deg) }"]) {
        expect(checkChange(pageWith(width, css), moved, onCanvas([moved]))).toEqual({ outcome: "not shown", actual: { value: width / 2 + 20, margin: 0, at: width / 2 + 20, share, centered: false } });
      }
    }
    expect(checkChange(pageWith(400, "#v4-right { right: calc(50% - 20px) !important; translate: none !important }"), fromRight, onCanvas([fromRight]))).toMatchObject({ outcome: "not shown", actual: { centered: false } });
    // Off by its `left`, the translate kept: as before, where the canvas centers it, and what its `left` is written as now.
    expect(checkChange(pageWith(400, "#v4 { left: 170px !important }"), moved, onCanvas([moved]))).toEqual({ outcome: "not shown", actual: { value: 170, margin: 0, at: 220, share: { percent: 0, px: 170 } } });
  });

  /** With another Frame below the board, 200 px wide, its own positioning reference. */
  const WITH_OTHER =ANCHORED.replace("</body>", `  <div id="other" ${at("50:5")} style="position: relative; width: 200px; height: 100px"></div>\n</body>`);

  test("dragged into another Frame, placed freely there: placed from the right, it stays so, from that Frame's right edge; centered, it stays centered there, past its middle by as much (as Figma's constraints go with the layer)", () => {
    const { editor, layer, box, changes, declared } = open(WITH_OTHER);

    editor.move(layer("right"), { parent: layer("other"), x: 100, y: 10 });
    editor.move(layer("v4"), { parent: layer("other"), x: 100, y: 50 });

    expect(box("right")).toEqual([100, 10, 30, 20]);
    expect(declared("right", "right")).toBe("70px");
    expect(declared("right", "left")).toBe("auto");
    expect(box("v4")).toEqual([100, 50, 40, 20]);
    expect(declared("v4", "left")).toBe("calc(50% + 20px)");
    expect(changes.list().map((change) => [change.kind, (change.after as Place).absolute])).toEqual([
      ["move", { x: 100, y: 10, placed: { x: { edge: "end", centered: false, percent: 0, px: 70 } } }],
      ["move", { x: 120, y: 50, placed: { x: { edge: "start", centered: true, percent: 50, px: 20 } } }],
    ]);
    editor.undo();
    editor.undo();
    expect(box("right")).toEqual([260, 8, 30, 20]);
    expect(box("v4")).toEqual([130, 40, 40, 20]);
    expect(changes.list()).toEqual([]);
  });

  test("copied, by ⌘D or let go with ⌥ held: the copy is placed as the layer is, from its container's right edge, or centered", () => {
    const { editor, layer, box, changes, doc } = open(WITH_OTHER);

    editor.duplicate(layer("right"));
    const copy = editor.duplicate(layer("v4"), { parent: layer("other"), x: 60, y: 0 });

    expect(changes.list().map((change) => (change.after as Place).absolute)).toEqual([
      { x: 260, y: 8, placed: { x: { edge: "end", centered: false, percent: 0, px: 10 } } },
      { x: 80, y: 0, placed: { x: { edge: "start", centered: true, percent: 50, px: -20 } } },
    ]);
    expect(declaredByEdit(copy.el, "left")).toBe("calc(50% - 20px)");
    const r = copy.el.getBoundingClientRect();
    expect(r.left - doc.getElementById("other")!.getBoundingClientRect().left).toBe(60);
    expect(box("v4")).toEqual([130, 40, 40, 20]);
  });

  test("moved into another Frame and back into its own at another place, placed from the right still: the page shows it by its `right`, however wide its container is", () => {
    const html = WITH_OTHER.replace(/ data-ht-chain='[^']*'/g, "");
    const { editor, layer, changes } = open(html);
    editor.move(layer("right"), { parent: layer("other"), x: 100, y: 10 });
    editor.move(layer("right"), { parent: layer("board"), x: 230, y: 8 });
    const [moved] = changes.list();
    expect((moved.after as Place).absolute).toEqual({ x: 230, y: 8, placed: { x: { edge: "end", centered: false, percent: 0, px: 40 } } });

    expect(checkChange(pageWith(400, "#right { right: 40px !important }"), moved, onCanvas([moved])).outcome).toBe("shown");
    // Its `right` as the change has it, but a `left` and its width too, which the browser goes by left to right (ticket 89, review).
    expect(checkChange(pageWith(400, "#right { right: 40px !important; left: 5px !important }"), moved, onCanvas([moved])).outcome).toBe("not shown");
    // Placed by its left, where the canvas has it as wide as the canvas's board, not as wide as this one.
    expect(checkChange(pageWith(400, "#right { left: 230px !important; right: auto !important }"), moved, onCanvas([moved])).outcome).toBe("not shown");
  });

  test("centered, moved into another Frame and back into its own at another place: the page shows it by its side, and not with its translate gone (line review)", () => {
    const html = WITH_OTHER.replace(/ data-ht-chain='[^']*'/g, "");
    const { editor, layer, changes } = open(html);
    editor.move(layer("v4"), { parent: layer("other"), x: 100, y: 10 });
    editor.move(layer("v4"), { parent: layer("board"), x: 150, y: 40 });
    const [moved] = changes.list();
    expect((moved.after as Place).absolute).toEqual({ x: 170, y: 40, placed: { x: { edge: "start", centered: true, percent: 50, px: 20 } } });

    expect(checkChange(pageWith(400, "#v4 { left: calc(50% + 20px) !important }"), moved, onCanvas([moved])).outcome).toBe("shown");
    expect(checkChange(pageWith(400, "#v4 { left: calc(50% + 20px) !important; translate: none !important }"), moved, onCanvas([moved]))).toMatchObject({ outcome: "not shown", actual: { centered: false } });
  });

  test("copied in the phone view, placed from the right there only: the copy is placed as the layer is in the view worked in, from its container's right edge; in the desktop view, from its left (line review)", async () => {
    const html = ANCHORED.replace(
      "</style>",
      "  #narrow { position: absolute; left: 12px; top: 60px; width: 30px; height: 20px }\n  @media (max-width: 500px) { #narrow { left: auto; right: 20px } }\n</style>",
    ).replace("  </div>\n</body>", `    <div id="narrow" ${at("46:7")}></div>\n  </div>\n</body>`);
    const canvas = open(html);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await canvas.views.add(phoneFrame, 390);
    const [desktop] = canvas.views.list();
    const { editor, layer, changes } = canvas;

    editor.at(phone);
    editor.duplicate(layer("narrow"));
    editor.at(desktop);
    editor.duplicate(layer("narrow"));

    expect(changes.list().map((change) => [(change.before as Place).absolute, (change.after as Place).absolute])).toEqual([
      [
        { x: 12, y: 60, placed: { x: { edge: "end", centered: false, percent: 0, px: 20 } } },
        { x: 12, y: 60, placed: { x: { edge: "end", centered: false, percent: 0, px: 20 } } },
      ],
      [
        { x: 12, y: 60 },
        { x: 12, y: 60 },
      ],
    ]);
  });

  test("centered by `translate`, its X set or moved out and back, the page centering it by auto margins instead, its translate gone, or kept with auto margins added: the page draws it elsewhere, so it is not shown (ticket 96, review)", () => {
    const setting = open(UNCHAINED);
    setting.editor.set(setting.layer("v4"), "x", setting.editor.read(setting.layer("v4"), "x")! + 20);
    const [x] = setting.changes.list();
    // As wide as the canvas's board: the canvas draws it at 150, the page at 170.
    expect(checkChange(pageWith(300, "#v4 { left: 80px !important; right: 0 !important; margin-inline: auto !important; translate: none !important }"), x, onCanvas([x])).outcome).toBe("not shown");
    iframe?.remove();
    const moving = open(WITH_OTHER.replace(/ data-ht-chain='[^']*'/g, ""));
    moving.editor.move(moving.layer("v4"), { parent: moving.layer("other"), x: 100, y: 10 });
    moving.editor.move(moving.layer("v4"), { parent: moving.layer("board"), x: 150, y: 40 });
    const [moved] = moving.changes.list();
    // Its board 400px wide: the canvas draws it at 200; the page at 290, its translate gone, and at 270, kept.
    expect(checkChange(pageWith(400, "#v4 { left: calc(50% + 20px) !important; right: 0 !important; margin-inline: auto !important; translate: none !important }"), moved, onCanvas([moved])).outcome).toBe("not shown");
    expect(checkChange(pageWith(400, "#v4 { left: calc(50% + 20px) !important; right: 0 !important; margin-inline: auto !important }"), moved, onCanvas([moved])).outcome).toBe("not shown");
    expect(checkChange(pageWith(400, "#v4 { left: calc(50% + 20px) !important }"), moved, onCanvas([moved])).outcome).toBe("shown");
  });

  test("placed from its left and top, moved: as before, its X and Y", () => {
    const { editor, layer, recorded } = open();

    editor.set(layer("bottom"), "x", 20);

    expect(recorded()).toEqual([["x", 12, 20, undefined, undefined]]);
  });
});

/**
 * A board half as wide as the page and as tall, a tag in it centered across
 * by auto margins, as Tailwind's `inset-x-0 mx-auto w-12` centers it, and a
 * bar centered down so (`inset-y-0 my-auto h-12`), ticket 96. In the desktop
 * view, 800px wide, the board is 400px and both are drawn at 175; in a
 * phone's, 390px, 195px and 72.5.
 */
const AUTO_MARGINS = `<!DOCTYPE html>
<body style="margin: 0">
  <style>
    #board { position: relative; width: 50vw; height: 50vw }
    #tag { position: absolute; left: 0; right: 0; margin-inline: auto; top: 8px; width: 50px; height: 20px }
    #bar { position: absolute; top: 0; bottom: 0; margin-block: auto; left: 8px; width: 20px; height: 50px }
  </style>
  <div id="board" ${loc("13:5")}><span id="tag" ${loc("14:7")}>Tag</span><span id="bar" ${loc("15:7")}></span></div>
</body>`;

describe("a layer centered by auto margins (ticket 96)", () => {
  const open = async (html = AUTO_MARGINS) => {
    const canvas = openCanvas(html);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await canvas.views.add(phoneFrame, 390);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    /** Where `id` is drawn in its board along `axis`: in the desktop view, and in the phone view, brought up to date. */
    const drawn = (id: string, axis: "x" | "y") => {
      canvas.views.sync(phone);
      return [canvas.doc, phone.document].map((doc) => {
        const [r, p] = [doc.getElementById(id)!.getBoundingClientRect(), doc.getElementById("board")!.getBoundingClientRect()];
        return axis === "x" ? r.left - p.left : r.top - p.top;
      });
    };
    return { ...canvas, phone, layer, drawn };
  };
  const ways = [
    ["across, left to right", (html: string) => html, "tag", "x"],
    ["across, right to left", (html: string) => html.replace("<body", '<body dir="rtl"'), "tag", "x"],
    ["down", (html: string) => html, "bar", "y"],
  ] as const;
  /** `by` px along `axis`, as `nudge` takes it. */
  const along = (axis: "x" | "y", by: number): [number, number] => (axis === "x" ? [by, 0] : [0, by]);

  test.each(ways)("centered %s: its X or Y reads where it is drawn, from its container's left or top", async (_, laidOut, id, axis) => {
    const { editor, layer, drawn } = await open(laidOut(AUTO_MARGINS));
    expect(drawn(id, axis)).toEqual([175, 72.5]);
    expect(editor.read(layer(id), axis)).toBe(175);
  });

  test.each(ways)("centered %s, nudged 20px back: it stays centered, 20px off its middle, in every view", async (_, laidOut, id, axis) => {
    const { editor, layer, drawn } = await open(laidOut(AUTO_MARGINS));
    editor.nudge([layer(id)], ...along(axis, -20));
    expect(drawn(id, axis)).toEqual([155, 52.5]);
    expect(editor.read(layer(id), axis)).toBe(155);
    editor.undo();
    expect(drawn(id, axis)).toEqual([175, 72.5]);
  });

  test.each(ways)("centered %s, its X or Y typed, or let go there: it lands there and stays centered, as far off its middle, in every view", async (_, laidOut, id, axis) => {
    const { editor, layer, drawn } = await open(laidOut(AUTO_MARGINS));
    const other = axis === "x" ? "y" : "x";
    const moves = [
      ["typed", () => editor.set(layer(id), axis, 195)],
      ["dropped", () => editor.move(layer(id), { parent: layer("board"), [axis]: 195, [other]: editor.read(layer(id), other) } as { parent: Layer; x: number; y: number })],
    ] as const;
    for (const [how, move] of moves) {
      move();
      expect([how, drawn(id, axis)]).toEqual([how, [195, 92.5]]);
      expect([how, editor.read(layer(id), axis)]).toEqual([how, 195]);
      editor.undo();
      expect([how, drawn(id, axis)]).toEqual([how, [175, 72.5]]);
    }
  });

  test("centered across, its X typed: the change records it so, its X from where it was drawn to where it is, its middle 20px further, and its sides as much more and less", async () => {
    const { editor, layer, changes } = await open();
    editor.set(layer("tag"), "x", 195);
    const [x] = changes.list();
    expect([x.property, x.before, x.after, x.placedFrom, x.centeredOn, x.style, x.margins]).toEqual([
      "x",
      175,
      195,
      { edge: "start", centered: true, margins: true },
      { before: { percent: 50, px: 0 }, after: { percent: 50, px: 20 } },
      { left: "20px", right: "-20px" },
      { x: 0, y: 0 },
    ]);
    // Typed again, the same change, its middle where it was before the first.
    editor.set(layer("tag"), "x", 145);
    expect(changes.list().map((change) => [change.before, change.after, change.centeredOn, change.style])).toEqual([
      [175, 145, { before: { percent: 50, px: 0 }, after: { percent: 50, px: -30 } }, { left: "-30px", right: "30px" }],
    ]);
  });

  test("centered across, resized: it stays centered, growing on both sides alike, its width the one change, placed so", async () => {
    const { editor, layer, changes, drawn } = await open();
    editor.set(layer("tag"), "width", { type: "fixed", value: 70 });
    expect(drawn("tag", "x")).toEqual([165, 62.5]);
    expect(changes.list().map((change) => [change.property, change.placedFrom])).toEqual([["width", { edge: "start", centered: true, margins: true }]]);
  });

  test.each([
    ["its left one", "margin-left: auto", 350, 145, [["right", 0, 20]]],
    ["its right one", "margin-right: auto", 0, 0, [["x", 0, -20]]],
  ] as const)(
    "a layer placed by both its sides, as wide as it is set, with only %s `auto`: the browser pushes it to the other side, so it is placed from that side, its X where it is drawn, and nudged it stays placed so in every view",
    async (_, margin, x, phone, changed) => {
      const { editor, layer, changes, drawn } = await open(AUTO_MARGINS.replace("margin-inline: auto", margin));
      expect([drawn("tag", "x"), editor.read(layer("tag"), "x")]).toEqual([[x, phone], x]);
      editor.nudge([layer("tag")], -20, 0);
      expect(drawn("tag", "x")).toEqual([x - 20, phone - 20]);
      expect(changes.list().map((change) => [change.property, change.before, change.after])).toEqual(changed);
    },
  );

  test("a layer placed by both its sides, as wide as it is set, with only its left margin `auto`, copied in place: the copy is placed from the right as it is, where it is drawn (code review)", async () => {
    const { editor, layer, changes } = await open(AUTO_MARGINS.replace("margin-inline: auto", "margin-left: auto"));
    const copy = editor.duplicate(layer("tag"));
    const r = copy.el.getBoundingClientRect();
    expect(r.left - copy.el.parentElement!.getBoundingClientRect().left).toBe(350);
    expect((changes.list()[0].after as Place).absolute).toEqual({ x: 350, y: 8, placed: { x: { edge: "end", centered: false, percent: 0, px: 0 } } });
  });

  test.each([
    ["left to right", (html: string) => html],
    ["right to left", (html: string) => html.replace("<body", '<body dir="rtl"')],
  ] as const)(
    "centered across in the desktop view, placed from its left in the phone view by the page's breakpoint, moved, %s: it stays centered where it is, and in the phone view only its `left` changes, as an X does, its `right` not written; the page is checked there by its `left` (ticket 96, review)",
    async (_, laidOut) => {
      const html = laidOut(AUTO_MARGINS.replace("</style>", "@media (max-width: 500px) { #tag { right: auto; left: 16px; margin-inline: 0 } }</style>"));
      const { editor, layer, changes, drawn } = await open(html);
      expect(drawn("tag", "x")).toEqual([175, 16]);
      editor.set(layer("tag"), "x", 195);
      // Its middle 20px past the board's: its `left` twice as far, its `right` as each view has it.
      expect(drawn("tag", "x")).toEqual([195, 40]);
      const [x] = changes.list();
      expect([x.style, x.centeredOn, x.uncenteredAt]).toEqual([{ left: "40px" }, { before: { percent: 50, px: 0 }, after: { percent: 50, px: 20 } }, [{ min: null, max: 800 }]]);
      const at = (width: number, css: string) => checkChange(pageAt(width, css, html), x, onCanvas([x]));
      expect(at(1000, "#tag { left: 40px }")).toEqual({ outcome: "shown" });
      // As a phone: the page's own `left` there still, 16px, not the canvas's 40px; then as the canvas has it.
      expect(at(390, "#tag { left: 40px } @media (max-width: 500px) { #tag { left: 16px } }")).toMatchObject({ outcome: "not shown", actual: { value: 16, at: 40 } });
      expect(at(390, "#tag { left: 40px } @media (max-width: 500px) { #tag { left: 40px } }")).toEqual({ outcome: "shown" });
    },
  );

  test.each([
    ["across, left to right", (html: string) => html, "tag", "x", "#tag { width: 250px }", "#tag { left: 20px; right: -20px }"],
    ["across, right to left", (html: string) => html.replace("<body", '<body dir="rtl"'), "tag", "x", "#tag { width: 250px }", "#tag { left: 20px; right: -20px }"],
    ["down", (html: string) => html, "bar", "y", "#bar { height: 250px }", "#bar { top: 20px; bottom: -20px }"],
  ] as const)(
    "centered %s, larger than its container leaves it room for in the phone's width, moved: the page drawing it as the canvas does there is shown, where the browser does not center it (ticket 96, review)",
    async (_, laidOut, id, axis, size, written) => {
      const html = laidOut(AUTO_MARGINS.replace("</style>", `${size}</style>`));
      const { editor, layer, changes, drawn } = await open(html);
      editor.set(layer(id), axis, editor.read(layer(id), axis)! + 20);
      const [moved] = changes.list();
      const phone = drawn(id, axis)[1];
      const page = pageAt(390, written, html);
      const r = page.getElementById(id)!.getBoundingClientRect();
      const p = page.getElementById("board")!.getBoundingClientRect();
      expect(axis === "x" ? r.left - p.left : r.top - p.top).toBeCloseTo(phone, 1);
      expect(checkChange(page, moved, onCanvas([moved]))).toEqual({ outcome: "shown" });
      expect(checkChange(pageAt(1000, written, html), moved, onCanvas([moved]))).toEqual({ outcome: "shown" });
    },
  );

  /** The page `width` px wide, its board half that, as the check shows it at a view's width; `css`: the code as the Agent writes it. */
  const pageAt = (width: number, css = "", html = AUTO_MARGINS) => {
    const frame = document.createElement("iframe");
    frame.style.width = `${width}px`;
    document.body.append(frame);
    copies.push(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html.replace("</style>", `${css}</style>`));
    doc.close();
    return doc;
  };
  const copies: HTMLIFrameElement[] = [];
  afterEach(() => copies.splice(0).forEach((frame) => frame.remove()));

  test("centered across and moved: the page shows it where its middle is as far past its container's at every width; a px from one side right as wide as the canvas is not, nor its sides with its auto margins gone", async () => {
    const { editor, layer, changes } = await open();
    editor.set(layer("tag"), "x", 195);
    const [x] = changes.list();
    const check = (width: number, css: string) => checkChange(pageAt(width, css), x, onCanvas([x]));
    for (const width of [800, 390]) expect(check(width, "#tag { left: 20px; right: -20px }")).toEqual({ outcome: "shown" });
    expect(check(800, "#tag { left: 195px; right: auto }")).toEqual({ outcome: "shown" });
    // As wide as a phone, its board 195px wide: its middle 20px past the board's, at 92.5px; not at 195px.
    expect(check(390, "#tag { left: 195px; right: auto }")).toEqual({ outcome: "not shown", actual: { value: 195, at: 92.5, margins: true, share: { percent: 0, px: 220 } } });
    expect(check(800, "#tag { left: 20px; right: -20px; margin-inline: 0 }")).toEqual({ outcome: "not shown", actual: { value: 20, at: 195, margins: true, share: { percent: 0, px: 45 } } });
    // Not moved on the page at all: still at its middle.
    expect(check(800, "")).toEqual({ outcome: "not shown", actual: { value: 175, at: 195, margins: true, share: { percent: 50, px: 0 } } });
  });

  test("centered across, moved into another Frame, placed freely there: it stays centered there by its auto margins, as far past that Frame's middle; copied, the copy is placed so too", async () => {
    const html = AUTO_MARGINS.replace("</div>", `</div><div id="other" ${loc("16:5")} style="position: relative; width: 200px; height: 100px"></div>`);
    const { editor, layer, changes, doc } = await open(html);
    const box = (el: Element) => [el.getBoundingClientRect().left - el.parentElement!.getBoundingClientRect().left, el.getBoundingClientRect().width];

    editor.move(layer("tag"), { parent: layer("other"), x: 100, y: 10 });
    const tag = doc.getElementById("tag")!;
    expect(tag.parentElement!.id).toBe("other");
    expect(box(tag)).toEqual([100, 50]);
    expect([declaredByEdit(tag, "left"), declaredByEdit(tag, "right")]).toEqual(["25px", "-25px"]);
    const [moved] = changes.list();
    expect([(moved.before as Place).absolute, (moved.after as Place).absolute]).toEqual([
      { x: 175, y: 8, placed: { x: { edge: "start", centered: true, margins: true, percent: 50, px: 0 } } },
      { x: 100, y: 10, placed: { x: { edge: "start", centered: true, margins: true, percent: 50, px: 25 } } },
    ]);
    editor.undo();
    expect(doc.getElementById("tag")!.parentElement!.id).toBe("board");
    expect(box(doc.getElementById("tag")!)).toEqual([175, 50]);

    const copy = editor.duplicate(layer("tag"));
    expect(box(copy.el)).toEqual([175, 50]);
    expect((changes.list()[0].after as Place).absolute).toEqual({ x: 175, y: 8, placed: { x: { edge: "start", centered: true, margins: true, percent: 50, px: 0 } } });
  });
});

/**
 * Ticket 97: layers whose auto margins take up room, where ticket 96 left
 * them jumping. A tag centered across between its sides by its auto margins,
 * its width `auto`, held 50px wide by its `max-width` (Tailwind's `inset-x-0
 * mx-auto max-w-*`), and a bar so down (`inset-y-0 my-auto max-h-*`), in a
 * board half as wide as the page and as tall: in the desktop view, 800px
 * wide, the board is 400px and both are drawn at 175; in a phone's, 390px,
 * 195px and 72.5.
 */
const HELD = `<!DOCTYPE html>
<body style="margin: 0">
  <style>
    #board { position: relative; width: 50vw; height: 50vw }
    #tag { position: absolute; left: 0; right: 0; margin-inline: auto; top: 8px; max-width: 50px; height: 20px }
    #bar { position: absolute; top: 0; bottom: 0; margin-block: auto; left: 8px; width: 20px; max-height: 50px }
  </style>
  <div id="board" ${loc("13:5")}><span id="tag" ${loc("14:7")}>Tag</span><span id="bar" ${loc("15:7")}></span></div>
</body>`;

describe("layers whose auto margins take up room do not jump (ticket 97)", () => {
  const open = async (html = HELD) => {
    const canvas = openCanvas(html);
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await canvas.views.add(phoneFrame, 390);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    /** Where `id` is drawn in its board along `axis`, and how large it is that way: in the desktop view, and in the phone view, brought up to date. */
    const drawn = (id: string, axis: "x" | "y") => {
      canvas.views.sync(phone);
      return [canvas.doc, phone.document].map((doc) => {
        const [r, p] = [doc.getElementById(id)!.getBoundingClientRect(), doc.getElementById(id)!.parentElement!.getBoundingClientRect()];
        return axis === "x" ? [r.left - p.left, r.width] : [r.top - p.top, r.height];
      });
    };
    return { ...canvas, phone, layer, drawn };
  };
  const ways = [
    ["across, left to right", (html: string) => html, "tag", "x", "width"],
    ["across, right to left", (html: string) => html.replace("<body", '<body dir="rtl"'), "tag", "x", "width"],
    ["down", (html: string) => html, "bar", "y", "height"],
  ] as const;
  const along = (axis: "x" | "y", by: number): [number, number] => (axis === "x" ? [by, 0] : [0, by]);

  test.each(ways)("held by its maximum, centered %s by its auto margins: its X or Y reads where it is drawn; nudged 20px back, it stays centered and as large, 20px off its middle, in every view", async (_, laidOut, id, axis) => {
    const { editor, layer, drawn } = await open(laidOut(HELD));
    expect(drawn(id, axis)).toEqual([
      [175, 50],
      [72.5, 50],
    ]);
    expect(editor.read(layer(id), axis)).toBe(175);
    editor.nudge([layer(id)], ...along(axis, -20));
    expect(drawn(id, axis)).toEqual([
      [155, 50],
      [52.5, 50],
    ]);
    expect(editor.read(layer(id), axis)).toBe(155);
    editor.undo();
    expect(drawn(id, axis)).toEqual([
      [175, 50],
      [72.5, 50],
    ]);
  });

  test.each(ways)("held by its maximum, centered %s by its auto margins, its X or Y typed, or let go there: it lands there, centered and as large, in every view; the change records it so, its sides as much more and less", async (_, laidOut, id, axis) => {
    const { editor, layer, drawn, changes } = await open(laidOut(HELD));
    const other = axis === "x" ? "y" : "x";
    const moves = [
      ["typed", () => editor.set(layer(id), axis, 195)],
      ["dropped", () => editor.move(layer(id), { parent: layer("board"), [axis]: 195, [other]: editor.read(layer(id), other) } as { parent: Layer; x: number; y: number })],
    ] as const;
    const [start, end] = axis === "x" ? ["left", "right"] : ["top", "bottom"];
    for (const [how, move] of moves) {
      move();
      expect([how, drawn(id, axis)]).toEqual([
        how,
        [
          [195, 50],
          [92.5, 50],
        ],
      ]);
      const [moved] = changes.list();
      expect([how, moved.placedFrom, moved.style]).toEqual([how, { edge: "start", centered: true, margins: true, held: true }, { [start]: "20px", [end]: "-20px" }]);
      editor.undo();
    }
  });

  test.each(ways)("held by its maximum, centered %s by its auto margins, resized: it stays centered, growing on both sides alike, in every view; its maximum is what changes, so it still fills a container narrower than it", async (_, laidOut, id, axis, size) => {
    const { editor, layer, drawn, changes } = await open(laidOut(HELD));
    editor.resize(layer(id), { [size]: 70 });
    expect(drawn(id, axis)).toEqual([
      [165, 70],
      [62.5, 70],
    ]);
    const max = size === "width" ? "maxWidth" : "maxHeight";
    expect(changes.list().map((change) => [change.property, change.before, change.after, change.style, change.placedFrom])).toEqual([
      [max, 50, 70, { [`max-${size}`]: "70px" }, { edge: "start", centered: true, margins: true, held: true }],
    ]);
  });

  test("held by its maximum, centered across by its auto margins, its width typed in the panel: its maximum is what changes, as a resize sets it, so it still fills a container narrower than it", async () => {
    const { editor, layer, drawn, changes } = await open(HELD.replace("max-width: 50px", "max-width: 300px"));
    editor.set(layer("tag"), "width", { type: "fixed", value: 260 });
    expect(drawn("tag", "x")).toEqual([
      [70, 260],
      [0, 195],
    ]);
    expect(changes.list().map((change) => [change.property, change.after])).toEqual([["maxWidth", 260]]);
  });

  test("held by its maximum, centered across by its auto margins, resized by its right handle on the canvas: its maximum does not stop it, and it grows on both sides alike", async () => {
    const { editor, layer, doc } = await open();
    const view = { boxOf: (l: Layer) => l.el.getBoundingClientRect(), elementOf: (el: Element) => el };
    const session: ResizeSession = { pointerId: 1, layer: layer("tag"), in: { view } as unknown as Shown, handle: "e", from: { clientX: 0, clientY: 0 }, begun: null, stepped: false, set: new Set(), release: () => {} };
    const step = resizeStep(session, editor, { clientX: 10, clientY: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 1, 0)!;
    expect(step.to).toEqual({ width: 70 });
    editor.resize(layer("tag"), step.to);
    expect(doc.getElementById("tag")!.getBoundingClientRect().width).toBe(70);
  });

  test("held by a maximum wider than the phone's board, centered across by its auto margins: it fills the board there, and nudged it stays centered, as wide, in every view", async () => {
    const { editor, layer, drawn } = await open(HELD.replace("max-width: 50px", "max-width: 300px"));
    expect(drawn("tag", "x")).toEqual([
      [50, 300],
      [0, 195],
    ]);
    editor.nudge([layer("tag")], -20, 0);
    expect(drawn("tag", "x")).toEqual([
      [30, 300],
      [-20, 195],
    ]);
  });

  test("held by its maximum, centered across by its auto margins, moved into another Frame, or copied: it stays centered there, its width still `auto`, held by its maximum", async () => {
    const html = HELD.replace("</div>\n</body>", `</div><div id="other" ${loc("17:5")} style="position: relative; width: 200px; height: 100px"></div>\n</body>`);
    const { editor, layer, doc } = await open(html);
    editor.move(layer("tag"), { parent: layer("other"), x: 100, y: 10 });
    const tag = doc.getElementById("tag")!;
    const box = (el: Element) => [el.getBoundingClientRect().left - el.parentElement!.getBoundingClientRect().left, el.getBoundingClientRect().width];
    expect([tag.parentElement!.id, box(tag), declaredByEdit(tag, "width")]).toEqual(["other", [100, 50], ""]);
    editor.undo();
    const copy = editor.duplicate(layer("tag"));
    expect([box(copy.el), declaredByEdit(copy.el, "width")]).toEqual([[175, 50], ""]);
  });

  test("held by its maximum, centered across by its auto margins, moved: the page shows it where its middle is as far past its container's at every width; a px from one side, as wide as its words, is not", async () => {
    const { editor, layer, changes } = await open();
    editor.set(layer("tag"), "x", 195);
    const [x] = changes.list();
    const pageAt = (width: number, css: string) => {
      const frame = document.createElement("iframe");
      frame.style.width = `${width}px`;
      document.body.append(frame);
      const doc = frame.contentDocument!;
      doc.open();
      doc.write(HELD.replace("</style>", `${css}</style>`));
      doc.close();
      const outcome = checkChange(doc, x, onCanvas([x]));
      frame.remove();
      return outcome;
    };
    for (const width of [800, 390]) expect(pageAt(width, "#tag { left: 20px; right: -20px }")).toEqual({ outcome: "shown" });
    expect(pageAt(390, "#tag { left: 195px; right: auto }")).toMatchObject({ outcome: "not shown" });
  });

  test("in a Stack's layout, centered by its auto margins (`mx-auto w-*`), dragged out into a Frame, placed freely there: it lands where it is let go, in every view", async () => {
    // Above the board, a column as wide, the block in it drawn at 175 (72.5 in the phone view), and a Frame as wide under it.
    const html = HELD.replace(
      '<div id="board"',
      `<div id="column" ${loc("11:5")} style="display: flex; flex-direction: column; width: 50vw"><div id="block" ${loc("11:7")} style="margin-inline: auto; width: 50px; height: 20px"></div></div><div id="field" ${loc("12:5")} style="position: relative; width: 50vw; height: 100px"></div><div id="board"`,
    );
    const { editor, layer, drawn, views, doc } = await open(html);
    expect(drawn("block", "x")).toEqual([
      [175, 50],
      [72.5, 50],
    ]);
    const [desktop] = views.list();
    const rectOf = (l: Layer) => l.el.getBoundingClientRect();
    const [r, field] = [rectOf(layer("block")), doc.getElementById("field")!.getBoundingClientRect()];
    const box = new DOMRect(r.left + 10, field.top + 30, r.width, r.height);
    const drop = findDrop(editor, desktop, layer("block"), { x: box.left + 5, y: box.top + 5 }, box, rectOf)!;
    expect(drop.to).toMatchObject({ parent: layer("field"), x: 185, y: 30 });
    editor.move(layer("block"), drop.to);
    expect(layer("block").parent!.el.id).toBe("field");
    expect(drawn("block", "x")).toEqual([
      [185, 50],
      [185, 50],
    ]);
  });

  test.each([
    ["as wide as it is set", "width: 50px"],
    ["held by its maximum", "max-width: 50px"],
  ] as const)("a Frame dissolved, its layer centered across by its auto margins, %s: the layer stays where it is drawn, and stays centered so in the container it goes into, in every view", async (_, size) => {
    const html = HELD.replace(
      "</div>\n</body>",
      `<div id="card" ${loc("17:7")} style="position: absolute; left: 0; top: 100px; width: 100%; height: 100px"><span id="pin" ${loc("18:9")} style="position: absolute; left: 0; right: 0; margin-inline: auto; top: 8px; ${size}; height: 20px">Pin</span></div></div>\n</body>`,
    );
    const { editor, layer, drawn } = await open(html);
    // The card as wide as the board, in every view.
    expect(drawn("pin", "x")).toEqual([
      [175, 50],
      [72.5, 50],
    ]);
    editor.ungroup(layer("card"));
    expect(layer("pin").parent!.el.id).toBe("board");
    expect(drawn("pin", "x")).toEqual([
      [175, 50],
      [72.5, 50],
    ]);
  });

  test("a Stack dissolved, a layer of it centered across by its auto margins: the layer stays where it is drawn, placed from its left as each of a dissolved Stack's layers is", async () => {
    const html = HELD.replace(
      "</div>\n</body>",
      `<div id="list" ${loc("17:7")} style="position: absolute; left: 0; top: 100px; width: 400px; display: flex; flex-direction: column"><div id="item" ${loc("18:9")} style="margin-inline: auto; width: 50px; height: 20px"></div></div></div>\n</body>`,
    );
    const { editor, layer, drawn, changes } = await open(html);
    expect(drawn("item", "x")[0]).toEqual([175, 50]);
    editor.unstack(layer("list"));
    expect(drawn("item", "x")).toEqual([
      [175, 50],
      [175, 50],
    ]);
    const [dissolved] = changes.list();
    expect((dissolved.after as { layers: { x: number }[] }).layers.map((member) => member.x)).toEqual([175]);
    // Drawn past its X by the margins it keeps, as recorded: none for its `auto` ones, which its X counts now (review).
    expect((dissolved.after as { layers: { margins?: unknown }[] }).layers.map((member) => member.margins)).toEqual([{ x: 0, y: 0 }]);
  });

  test("held by its maximum, centered across by its auto margins, resized, then undone and redone: its maximum goes back and comes again, its width `auto` throughout", async () => {
    const { editor, layer, drawn, doc } = await open();
    editor.resize(layer("tag"), { width: 70 });
    editor.undo();
    expect([drawn("tag", "x"), getComputedStyle(doc.getElementById("tag")!).maxWidth]).toEqual([
      [
        [175, 50],
        [72.5, 50],
      ],
      "50px",
    ]);
    editor.redo();
    expect([drawn("tag", "x"), getComputedStyle(doc.getElementById("tag")!).maxWidth]).toEqual([
      [
        [165, 70],
        [62.5, 70],
      ],
      "70px",
    ]);
  });
});

describe("new words, as the page checks them (ticket 90)", () => {
  const SAME_TITLES = PAGE.replace(/>Card \d</g, ">Card<");

  test("looked at as wide as the page's window alone: its words are the same at every width", () => {
    const { editor, changes, cards, layerOf } = openCanvas(SAME_TITLES);
    editor.setText(layerOf(cards[0].querySelector("h3")!), "Plan");
    expect(widthsOf(changes.list()[0], changes.list(), 1280, [390, 768])).toEqual({ own: true, others: [] });
  });

  test("where the page cannot check them, it says why, in words of their own: from data, a run of text, no source marker, a layer made this round", () => {
    const reason = (change: Change, round: Change[]) => uncheckable(change, round);
    const STRUCTURE_REASON = /of the changes to the structure/;

    const loop = openCanvas();
    loop.editor.setText(loop.layerOf(loop.cards[1].querySelector("h3")!), "Second");
    expect(reason(loop.changes.list()[0], loop.changes.list())).toBe("the words come from the data the loop goes through, and the page cannot tell the loop's instances apart");

    const moves = openCanvas(MOVES);
    const run = find(moves.editor.tree().root, (l) => l.name === "more")!;
    moves.editor.setText(moves.editor.ownElement(run), "less");
    expect(reason(moves.changes.list()[0], moves.changes.list())).toBe("the text has no element of its own on the page");

    const unmarked = openCanvas(`<!DOCTYPE html><body><main ${at("2:3")}><p id="plain">Hello</p></main></body>`);
    unmarked.editor.setText(find(unmarked.editor.tree().root, (l) => l.el.id === "plain" && !l.text)!, "Hi");
    expect(reason(unmarked.changes.list()[0], unmarked.changes.list())).toBe("the layer has no source marker, so the page cannot find it");

    const copied = openCanvas();
    const copy = copied.editor.duplicate(copied.layerOf(copied.cards[3]));
    copied.editor.setText(find(copy, (l) => l.el.localName === "h3" && !l.text)!, "Mine");
    const [, words] = copied.changes.list();
    expect(words.kind).toBe("text");
    expect(reason(words, copied.changes.list())).toBe("the layer is new this round, so the page has no marker to find it by");

    for (const round of [loop, moves, unmarked, copied].map((canvas) => canvas.changes.list())) {
      for (const change of round.filter(({ kind }) => kind === "text")) expect(reason(change, round) ?? "").not.toMatch(STRUCTURE_REASON);
    }
  });

  test("new words of a layer made this round are its maker's, checked with it: a change of their own, as a round may have, says so", () => {
    const { editor, changes } = openCanvas(MOVES);
    editor.create("text", { parent: find(editor.tree().root, (l) => l.el.id === "list")!, index: 0 });
    const [maker] = changes.list();
    const words: Change = { ...maker, id: 2, kind: "text", property: "text", before: "Text", after: "Hello", style: {}, target: { ...maker.target, loc: null, made: maker.layer } };
    expect(uncheckable(words, [maker, words])).toBe("the layer is new this round: the page checks its words with the change that makes it (change 1)");
  });
});

/**
 * Ticket 95: the changes the page does not check that fell to the reason for
 * the structure ("of the changes to the structure, only reorders, …"): each
 * where that reason is wrong for it gets one of its own; where it is right, it
 * stays word for word. The page checks none of them more than before.
 */
describe("why the page cannot check a change to the structure (ticket 95)", () => {
  const STRUCTURE = "of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page";
  const LOOP = "the change is to the data the loop goes through, and the page cannot tell the loop's instances apart";
  const item = `data-ht-loc="src/Item.tsx:2:3" ${chain([{ component: "Item", usage: "src/App.tsx:6:9", thirdParty: false }, ...APP])}`;
  const LIST = `<!DOCTYPE html>
    <ul id="list" ${at("5:5")} style="display: flex; flex-direction: column; position: relative; width: 200px; height: 200px">
      <li ${item}>One</li><li ${item}>Two</li><li ${item}>Three</li>
    </ul>
    <div id="board" ${at("13:5")} style="width: 300px; height: 200px"></div>`;
  /** The reason of the round's only change, or of its last. */
  const reasonOf = (changes: { list(): Change[] }) => uncheckable(changes.list().at(-1)!, changes.list());

  test("one of a loop's instances alone deleted, copied or moved: the change is to the data, and the page cannot tell the instances apart", () => {
    const deleted = openCanvas();
    deleted.editor.remove(deleted.layerOf(deleted.cards[1]));
    expect(deleted.changes.list()[0]).toMatchObject({ kind: "delete", data: true });
    expect(reasonOf(deleted.changes)).toBe(LOOP);

    const copied = openCanvas();
    copied.editor.duplicate(copied.layerOf(copied.cards[0]));
    expect(copied.changes.list()[0]).toMatchObject({ kind: "duplicate", data: true });
    expect(reasonOf(copied.changes)).toBe(LOOP);

    const reordered = openCanvas(LIST);
    const li = (canvas: typeof reordered, n: number) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.querySelectorAll("li")[n])!;
    const list = (canvas: typeof reordered) => find(canvas.editor.tree().root, (l) => l.el.id === "list")!;
    reordered.editor.move(li(reordered, 1), { parent: list(reordered), index: 0 });
    expect(reordered.changes.list()[0]).toMatchObject({ kind: "move", data: true });
    expect(reasonOf(reordered.changes)).toBe(LOOP);

    const placed = openCanvas(LIST);
    placed.editor.move(li(placed, 2), { parent: list(placed), x: 20, y: 30 });
    expect(placed.changes.list()[0]).toMatchObject({ kind: "move", data: true, after: { absolute: { x: 20, y: 30 } } });
    expect(reasonOf(placed.changes)).toBe(LOOP);
  });

  test("one of a loop's instances moved into another container, or among text that runs on: still the data's reason", () => {
    const { changes, editor, doc } = openCanvas(LIST);
    editor.move(find(editor.tree().root, (l) => l.el === doc.querySelectorAll("li")[0])!, { parent: find(editor.tree().root, (l) => l.el.id === "list")!, index: 2 });
    const reorder = changes.list()[0];
    const elsewhere = { ...reorder, after: { ...(reorder.after as Place), container: { layer: "other", target: { ...(reorder.after as Place).container.target, loc: "src/App.tsx:13:5" } } } };
    expect(uncheckable(elsewhere, [elsewhere])).toBe(LOOP);
    const amongText = { ...reorder, order: null };
    expect(uncheckable(amongText, [amongText])).toBe(LOOP);
  });

  test("a reorder in a container the page cannot find: why it cannot find the container", () => {
    // A new Stack: no marker to find it by.
    const stacked = openCanvas(MOVES);
    const layer = (id: string) => find(stacked.editor.tree().root, (l) => l.el === stacked.doc.getElementById(id) && !l.text)!;
    stacked.editor.stack([layer("a"), layer("b")]);
    const stack = layer("a").parent!;
    stacked.editor.move(layer("b"), { parent: stack, index: 0 });
    const move = stacked.changes.list().at(-1)!;
    expect(move).toMatchObject({ kind: "move", before: { container: { layer: stack.el.getAttribute("data-ht-layer") } } });
    expect(reasonOf(stacked.changes)).toBe("its container is new this round (a copy, a layer put back or a new Stack), so the page has no marker to find it by");

    // A container with no source marker.
    const unmarked = openCanvas(MOVES.replace(`<div id="list" ${at("5:5")}`, '<div id="list"'));
    const own = (id: string) => find(unmarked.editor.tree().root, (l) => l.el === unmarked.doc.getElementById(id) && !l.text)!;
    unmarked.editor.move(own("c"), { parent: own("list"), index: 0 });
    const unmarkedMove = unmarked.changes.list()[0];
    expect(unmarkedMove.order).toBeTruthy();
    expect(uncheckable(unmarkedMove, [unmarkedMove])).toBe("its container has no source marker, so the page cannot find it");
    const placedThere: Change = { ...unmarkedMove, after: { ...(unmarkedMove.after as Place), absolute: { x: 10, y: 20 } }, order: undefined };
    expect(uncheckable(placedThere, [placedThere])).toBe("its container has no source marker, so the page cannot find it");

    // Not what the page would check were the container found: as before, text running on among its layers, and a move back into its layout.
    const amongText: Change = { ...unmarkedMove, order: null };
    expect(uncheckable(amongText, [amongText])).toBe("text runs on among the layers of its container, so the page cannot tell their order");
    const intoLayout: Change = { ...unmarkedMove, before: { ...(unmarkedMove.before as Place), absolute: { x: 10, y: 20 } } };
    expect(uncheckable(intoLayout, [intoLayout])).toBe(STRUCTURE);

    // One made in a round before.
    const [reorder] = (() => {
      const opened = openCanvas(MOVES);
      const layer = (id: string) => find(opened.editor.tree().root, (l) => l.el === opened.doc.getElementById(id) && !l.text)!;
      opened.editor.move(layer("c"), { parent: layer("list"), index: 0 });
      return opened.changes.list();
    })();
    const before = { ...(reorder.before as Place).container, target: { ...(reorder.before as Place).container.target, loc: null, made: "9" } };
    const inMadeBefore = { ...reorder, before: { ...(reorder.before as Place), container: before }, after: { ...(reorder.after as Place), container: before } };
    expect(uncheckable(inMadeBefore, [inMadeBefore])).toBe("its container was made in a round before, and the page cannot find it");

    // A new Frame, as a round carried over may have one a layer was moved into in the round before: the page finds it, but checks no move in it.
    const framed = openCanvas(MOVES);
    framed.editor.create("frame", { parent: find(framed.editor.tree().root, (l) => l.el.id === "row")!, index: 1 });
    const [maker] = framed.changes.list();
    const frame = { layer: maker.layer, target: { ...maker.target, loc: null, made: maker.layer } };
    const inFrame = { ...reorder, id: 2, before: { ...(reorder.before as Place), container: frame }, after: { ...(reorder.after as Place), container: frame } };
    expect(uncheckable(inFrame, [maker, inFrame])).toBe("its container is new this round, and the page checks no move in it");

    // The same new Frame, in a container with no source marker: the page cannot find the Frame either.
    const unmarkedRow = { ...maker, after: { ...(maker.after as Created), place: { ...(maker.after as Created).place, container: { ...(maker.after as Created).place.container, target: { ...(maker.after as Created).place.container.target, loc: null } } } } };
    expect(uncheckable(inFrame, [unmarkedRow, inFrame])).toBe("its container is new this round, in a container the page cannot find");
  });

  test("a Frame's only text, as a button's words are, placed freely in that Frame: it has no element of its own on the page", () => {
    const { editor, changes } = openCanvas(`<!DOCTYPE html><body style="margin: 0"><div id="button" ${at("3:5")} style="width: 200px; height: 100px; background-color: rgb(255, 0, 0)">Go</div></body>`);
    const button = find(editor.tree().root, (l) => l.el.id === "button" && !l.text)!;
    expect(button.framesText).toBe(true);

    editor.move(button.children[0], { parent: button, x: 10, y: 20 });

    expect(changes.list()[0]).toMatchObject({ kind: "move", wrap: true, target: { onlyText: true }, after: { absolute: { x: 10, y: 20 } } });
    expect(changes.list()[0].target.run).toBeUndefined();
    expect(reasonOf(changes)).toBe("the text has no element of its own on the page");

    // Dragged again, now in the `<span>` the canvas wrapped it in: still the one move, as first recorded.
    editor.move(find(editor.tree().root, (l) => l.el.parentElement?.id === "button" && l.el.localName === "span")!, { parent: button, x: 30, y: 40 });
    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0]).toMatchObject({ wrap: true, target: { onlyText: true }, after: { absolute: { x: 30, y: 40 } } });
    expect(reasonOf(changes)).toBe("the text has no element of its own on the page");
  });

  test("where the reason for the structure is right, it stays word for word: a copy, a layer put back, a Stack made or dissolved, a move into another container, into a layout from a place of its own", () => {
    const moves = () => {
      const canvas = openCanvas(MOVES);
      const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
      return { ...canvas, layer };
    };

    const copied = moves();
    copied.editor.duplicate(copied.layer("a"));
    expect(copied.changes.list()[0]).toMatchObject({ kind: "duplicate" });
    expect(copied.changes.list()[0].data).toBeUndefined();
    expect(reasonOf(copied.changes)).toBe(STRUCTURE);

    const stacked = moves();
    stacked.editor.stack([stacked.layer("a"), stacked.layer("b")]);
    expect(reasonOf(stacked.changes)).toBe(STRUCTURE);

    const dissolved = moves();
    dissolved.editor.unstack(dissolved.layer("list"));
    expect(dissolved.changes.list()[0]).toMatchObject({ kind: "unstack" });
    expect(reasonOf(dissolved.changes)).toBe(STRUCTURE);

    const elsewhere = moves();
    elsewhere.editor.move(elsewhere.layer("b"), { parent: elsewhere.layer("row"), index: 1 });
    expect(reasonOf(elsewhere.changes)).toBe(STRUCTURE);

    // A layer put back, as the editor records one (a layer off the canvas, back at a place of its own).
    const [moved] = copied.changes.list();
    const putBack: Change = { ...moved, id: 2, kind: "putBack", property: "put back", before: null, after: { place: moved.after, layer: { id: "a1" } } };
    expect(uncheckable(putBack, [putBack])).toBe(STRUCTURE);

    const elsewhereFree = moves();
    elsewhereFree.editor.move(elsewhereFree.layer("b"), { parent: elsewhereFree.layer("board"), x: 40, y: 30 });
    expect(reasonOf(elsewhereFree.changes)).toBe(STRUCTURE);

    const [free] = elsewhereFree.changes.list();
    const back: Change = { ...free, before: { ...(free.after as Place), nth: 1 }, after: { ...(free.after as Place), absolute: null, nth: 1 }, order: { signs: ["div B"], self: 0, others: [] } };
    expect(uncheckable(back, [back])).toBe(STRUCTURE);
  });
});

describe("free layers in rows and columns made a Grid, and a Grid dissolved (ticket 110)", () => {
  const open = (page: string) => {
    const canvas = openCanvas(page);
    const layer = (id: string) => find(canvas.editor.tree().root, (l) => l.el === canvas.doc.getElementById(id) && !l.text)!;
    const rects = (...ids: string[]) => ids.map((id) => canvas.doc.getElementById(id)!.getBoundingClientRect().toJSON() as DOMRect);
    return { ...canvas, layer, rects };
  };
  /** How far each layer moved or changed size, at most, in px. */
  const drift = (before: DOMRect[], after: DOMRect[]) =>
    Math.max(...before.flatMap((b, i) => (["x", "y", "width", "height"] as const).map((side) => Math.abs(b[side] - after[i][side]))));
  /** Two rows of two, 100 × 40, 24px apart across and 16px down, from 20, 30; in the page's order, the last first. */
  const TILES = [placed("d", [144, 86, 100, 40]), placed("a", [20, 30, 100, 40]), placed("b", [144, 30, 100, 40]), placed("c", [20, 86, 100, 40])].join("");
  const IDS = ["a", "b", "c", "d"];

  test("⇧A: a new Grid where they are, row by row, its columns and gaps theirs; one step back", () => {
    const { doc, editor, changes, layer, rects } = open(board(TILES));
    const original = styles(doc);
    const before = rects(...IDS);

    const grid = editor.stack(IDS.map(layer));

    expect(grid.kind).toBe("grid");
    expect(grid.children.map((l) => l.el.id)).toEqual(IDS);
    expect(drift(before, rects(...IDS))).toBeLessThanOrEqual(1);
    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0]).toMatchObject({
      kind: "stack",
      property: "stack",
      target: { loc: "src/App.tsx:20:5" },
      after: { grid: { type: "grid", columns: 2, rowGap: 16, columnGap: 24 }, padding: [0, 0, 0, 0], place: { nth: 1, absolute: { x: 20, y: 30 } } },
      style: { display: "grid", "grid-template-columns": "repeat(2, minmax(0, 1fr))", "row-gap": "16px", "column-gap": "24px", position: "absolute", left: "20px", top: "30px" },
    });
    expect(changes.list()[0].after).not.toHaveProperty("direction");

    editor.undo();
    expect(styles(doc)).toEqual(original);
  });

  test("the panel's button asks what ⇧A makes, and changes nothing: a Grid of free layers in rows and columns, else a Stack (its follow-up)", () => {
    const { editor, changes, layer } = open(board(TILES));
    expect(editor.stacksAsGrid(IDS.map(layer))).toBe(true);
    expect(editor.stacksAsGrid([layer("board")])).toBe(true);
    expect(editor.stacksAsGrid(["a", "b", "c"].map(layer))).toBe(true);
    // Too few, a row of them, or what ⇧A cannot stack: not a Grid.
    expect(editor.stacksAsGrid(["a", "b"].map(layer))).toBe(false);
    expect(editor.stacksAsGrid(["a", "d"].map(layer))).toBe(false);
    expect(editor.stacksAsGrid([])).toBe(false);
    expect(changes.list()).toHaveLength(0);
    // As ⇧A then does.
    expect(editor.stack(IDS.map(layer)).kind).toBe("grid");

    const row = open(board([placed("a", [20, 30, 100, 40]), placed("b", [140, 30, 100, 40]), placed("c", [264, 30, 100, 40]), placed("d", [394, 30, 100, 40])].join("")));
    expect(row.editor.stacksAsGrid(IDS.map(row.layer))).toBe(false);
    expect(row.editor.stacksAsGrid([row.layer("board")])).toBe(false);

    // One of them in the Frame's flow, not free: a Stack, as ⇧A makes it, the Frame alone too.
    const mixed = open(board(`${TILES}<div id="e" ${at("30:7")} style="width: 100px; height: 40px"></div>`));
    expect(mixed.editor.canStack([...IDS, "e"].map(mixed.layer))).toBe(true);
    expect(mixed.editor.stacksAsGrid([...IDS, "e"].map(mixed.layer))).toBe(false);
    expect(mixed.editor.stacksAsGrid([mixed.layer("board")])).toBe(false);
    expect(mixed.editor.stack([...IDS, "e"].map(mixed.layer)).kind).toBe("stack");
  });

  test("a Frame selected alone becomes the Grid, its padding the room round its cells; a row of them, a Stack as ever", () => {
    const { doc, editor, changes, layer, rects } = open(board(TILES).replace("position: relative;", "position: relative; box-sizing: border-box;"));
    const before = rects(...IDS);

    const grid = editor.stack([layer("board")]);

    expect(grid.el).toBe(doc.getElementById("board"));
    expect(grid.kind).toBe("grid");
    expect(changes.list()[0].after).toMatchObject({ place: null, grid: { columns: 2, rowGap: 16, columnGap: 24 }, padding: [30, 356, 274, 20] });
    expect(drift(before, rects(...IDS))).toBeLessThanOrEqual(1);

    const row = open(board([placed("a", [20, 30, 100, 40]), placed("b", [140, 30, 100, 40]), placed("c", [264, 30, 100, 40]), placed("d", [394, 30, 100, 40])].join("")));
    expect(row.editor.stack(IDS.map(row.layer)).kind).toBe("stack");
    expect(row.changes.list()[0].after).toMatchObject({ direction: "horizontal", gap: 24 });
  });

  test("⌥⇧A dissolves a Grid as a Stack: a Frame of its size, its layers absolute where they were; ⌘⇧G ungroups it", () => {
    const page = `<!DOCTYPE html><body style="margin: 0"><section id="s" ${at("4:3")} style="display: flex; flex-direction: column">
      <div id="g" ${at("5:5")} style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 8px; width: 208px">
        <div id="a" ${at("6:7")} style="height: 20px"></div><div id="b" ${at("7:7")} style="height: 20px"></div><div id="c" ${at("8:7")} style="height: 30px"></div>
      </div></section></body>`;
    const { editor, changes, layer, rects } = open(page);
    const before = rects("g", "a", "b", "c");
    expect(editor.canUnstack(layer("g"))).toBe(true);
    expect(editor.canUngroup(layer("g"))).toBe(true);

    const frame = editor.unstack(layer("g"));

    expect(frame.kind).toBe("frame");
    expect(drift(before, rects("g", "a", "b", "c"))).toBeLessThan(0.1);
    expect(changes.list()[0]).toMatchObject({
      kind: "unstack",
      before: { grid: { type: "grid", columns: 2, rowGap: 12, columnGap: 8 }, padding: [0, 0, 0, 0] },
      after: { width: 208, layers: [{ x: 0, y: 0, width: 100 }, { x: 108, y: 0 }, { x: 0, y: 32, height: 30 }] },
      style: { display: "block", position: "relative" },
    });
    expect(changes.list()[0].sources.map((s) => s.properties)).toContainEqual(expect.arrayContaining(["display"]));
    expect(changes.list()[0].before).not.toHaveProperty("unequal");

    // Its columns not all as wide: recorded so, for the notes not to call them equal.
    const uneven = open(page.replace("repeat(2, minmax(0, 1fr))", "120px 1fr"));
    uneven.editor.unstack(uneven.layer("g"));
    expect(uneven.changes.list()[0].before).toMatchObject({ grid: { columns: 2 }, unequal: true });
  });

  test("the page checks a new Grid: its layers in one new element, laid out as a Grid of their columns and gaps", () => {
    // As the live page has them, and the canvas frozen from it: the usage chain read from the page, not written on each element.
    const NO_CHAIN = / data-ht-chain='[^']*'/g;
    const { doc, editor, changes, layer } = open(board(TILES).replaceAll(NO_CHAIN, ""));
    editor.stack(IDS.map(layer));
    const round = placedOnCanvas(changes.list(), doc.documentElement.outerHTML);
    const [made] = changes.list();
    expect(uncheckable(made, round)).toBeNull();
    // As the Agent writes them: in the new Grid, no longer absolute.
    const tiles = IDS.map((id) => placed(id, [0, 0, 100, 40]).replace("position: absolute; left: 0px; top: 0px; ", ""));
    const pageOf = (inner: string) => {
      live?.remove();
      live = document.createElement("iframe");
      live.style.width = "800px";
      document.body.append(live);
      const page = live.contentDocument!;
      page.open();
      page.write(board(inner).replaceAll(NO_CHAIN, ""));
      page.close();
      return page;
    };
    // Not yet: the layers absolute in the board, as they were.
    expect(checkChange(pageOf(TILES), made, round)).toEqual({ outcome: "not shown", actual: null });
    const wrapped = (style: string) => pageOf(`<div style="position: absolute; left: 20px; top: 30px; ${style}">${tiles.join("")}</div>`);
    expect(checkChange(wrapped("display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px"), made, round)).toEqual({ outcome: "shown" });
    // As an Agent writes it: a `<div>` round the `<div>`s, on a line of its own where the first was, every line after it one down.
    const shifted = tiles.map((tile, i) => tile.replace(`App.tsx:2${i + 1}:7`, `App.tsx:2${i + 2}:9`));
    const ownLine = pageOf(`<div data-ht-loc="src/App.tsx:21:7" style="position: absolute; left: 20px; top: 30px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px">${shifted.join("")}</div>`);
    expect(checkChange(ownLine, made, round)).toEqual({ outcome: "shown" });
    expect(checkChange(wrapped("display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 24px"), made, round)).toEqual({
      outcome: "not shown",
      actual: { type: "grid", columns: 4, rowGap: 16, columnGap: 24 },
    });
    expect(checkChange(wrapped("display: flex; flex-wrap: wrap; gap: 16px 24px"), made, round)).toMatchObject({ outcome: "not shown", actual: { type: "stack" } });

    // Not shown, though in a Grid of their columns and gaps (review of ticket 110):
    const GRID_CSS = "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px";
    const grid = (inner: string, outer = "position: absolute; left: 20px; top: 30px") => pageOf(`<div style="${outer}; ${GRID_CSS}">${inner}</div>`);
    // their absolute placement left on: placed against the Grid, not in its cells;
    const stillAbsolute = IDS.map((id, i) => placed(id, [0, 0, 100, 40]).replace("left: 0px; top: 0px", `left: ${(i % 2) * 124}px; top: ${Math.floor(i / 2) * 56}px`));
    expect(checkChange(grid(stillAbsolute.join("")), made, round)).toEqual({ outcome: "not shown", actual: "absolute" });
    // in another order than the canvas has them, B and C swapped;
    expect(checkChange(grid([tiles[0], tiles[2], tiles[1], tiles[3]].join("")), made, round)).toEqual({ outcome: "not shown", actual: "cells" });
    // with another layer in it, a cell more;
    expect(checkChange(grid(`${tiles.join("")}<div style="height: 40px"></div>`), made, round)).toEqual({ outcome: "not shown", actual: "cells" });
    // not right in the container's layout, but deeper.
    expect(checkChange(pageOf(`<section><div style="${GRID_CSS}">${tiles.join("")}</div></section>`), made, round)).toEqual({ outcome: "not shown", actual: null });

    // The Grid moved to another container later, or two of its layers made a Stack in it: what the page shows of it is not this change's.
    const movedLater = placedOnCanvas([made, { ...made, id: 9, kind: "move", property: "move", before: null, after: (made.after as { place: Place }).place, style: {} }], doc.documentElement.outerHTML);
    expect(checkChange(grid(tiles.join("")), made, movedLater)).toMatchObject({ outcome: "unchecked", reason: "change 9 moves the Grid: what the page shows of it is that change's" });
    const [a, b] = (made.after as { layers: { layer: string }[] }).layers;
    const place = (made.after as { place: Place }).place;
    const inIt = { ...place, container: { ...place.container, layer: made.layer } };
    const stackedLater = placedOnCanvas([made, { ...made, id: 9, layer: "s9", after: { ...(made.after as object), place: inIt, layers: [a, b] } }], doc.documentElement.outerHTML);
    expect(checkChange(grid(`<div style="display: flex">${tiles[0]}${tiles[1]}</div>${tiles[2]}${tiles[3]}`), made, stackedLater)).toEqual({ outcome: "shown" });

    // A change to its columns after: the page shows those, which that change is for.
    editor.set(editor.tree().layerOf(doc.getElementById("a")!.parentElement!)!, "columns", 4);
    const later = placedOnCanvas(changes.list(), doc.documentElement.outerHTML);
    expect(changes.list()).toHaveLength(2);
    expect(checkChange(wrapped("display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 24px"), changes.list()[0], later)).toEqual({ outcome: "shown" });
  });
});

describe("a Stack's gap, its layers with margins between them (ticket 122)", () => {
  /**
   * A card laid out as a plain flow, its body 8px below its title by its
   * margin, the title 4px down by its own (around them, not between them); a
   * flex column whose layers have margins between them of 6px and 2px past
   * its 4px gap; a row whose last layer is pushed to the end by its auto margin.
   */
  const GAPPED = `<!DOCTYPE html>
<body style="margin: 0">
  <article id="card" ${loc("5:5")} style="width: 300px; padding: 10px">
    <h3 id="title" ${loc("6:7")} style="margin: 4px 0 0; height: 20px">Title</h3>
    <p id="body" ${loc("7:7")} style="margin: 8px 0 0; height: 20px">Body</p>
  </article>
  <div id="list" ${loc("9:5")} style="display: flex; flex-direction: column; gap: 4px; width: 200px">
    <div id="one" ${loc("10:7")} style="height: 10px; margin-bottom: 6px">One</div>
    <div id="two" ${loc("11:7")} style="height: 10px; margin-top: 2px">Two</div>
    <div id="three" ${loc("12:7")} style="height: 10px">Three</div>
  </div>
  <div id="row" ${loc("14:5")} style="display: flex; gap: 10px; width: 400px">
    <div id="left" ${loc("15:7")} style="width: 20px; height: 10px"></div>
    <div id="right" ${loc("16:7")} style="width: 20px; height: 10px; margin-left: auto"></div>
  </div>
</body>`;
  const open = () => {
    const canvas = openCanvas(GAPPED);
    return { ...canvas, at: (id: string) => canvas.layerOf(canvas.doc.getElementById(id)!), el: (id: string) => canvas.doc.getElementById(id)! };
  };
  /** How far the body is drawn below the title, in `doc`. */
  const between = (doc: Document) => doc.getElementById("body")!.getBoundingClientRect().top - doc.getElementById("title")!.getBoundingClientRect().bottom;

  test("reads as the room between its layers: a plain flow's margins, a flex container's margins with its gap, the median where they differ; auto margins and Stacks with no margins as ever", () => {
    const { editor, at } = open();
    expect(editor.read(at("card"), "gap")).toBe(8);
    // 4 + 6 and 4 + 2, between each two: 12 and 4.
    expect(editor.read(at("list"), "gap")).toBe(8);
    expect(editor.read(at("row"), "gap")).toBe(10);
  });

  test("a gap set takes the margins between the layers off, keeps those around them, and one undo puts them back", () => {
    const { doc, editor, changes, at, el } = open();
    editor.set(at("card"), "gap", 0);

    expect(between(doc)).toBe(0);
    expect(style(el("body")).marginTop).toBe("0px");
    // Around the first layer: kept.
    expect(style(el("title")).marginTop).toBe("4px");
    expect(editor.read(at("card"), "gap")).toBe(0);
    const [change] = changes.list();
    expect(change).toMatchObject({ property: "gap", before: 8, after: 0, asStack: true });
    expect(change.marginsDropped).toHaveLength(1);
    expect(change.marginsDropped![0]).toMatchObject({ layer: el("body").getAttribute("data-ht-layer"), margins: { "margin-top": "8px" } });
    expect(change.marginsDropped![0].sources.length).toBeGreaterThan(0);

    editor.set(at("card"), "gap", 16, { continues: true });
    expect(between(doc)).toBe(16);
    expect(changes.list()).toHaveLength(1);

    editor.undo();
    expect(between(doc)).toBe(8);
    expect(style(el("body")).marginTop).toBe("8px");
    expect(style(el("card")).display).toBe("block");
    expect(changes.list()).toEqual([]);
    editor.redo();
    expect(between(doc)).toBe(16);
  });

  test("auto margins stay, and the margins on both sides of a layer between two go", () => {
    const { editor, changes, at, el } = open();
    editor.set(at("row"), "gap", 20);
    expect(style(el("right")).marginLeft).not.toBe("0px");
    expect(changes.list()[0].marginsDropped).toBeUndefined();

    editor.set(at("list"), "gap", 6);
    expect([style(el("one")).marginBottom, style(el("two")).marginTop]).toEqual(["0px", "0px"]);
    expect(changes.list()[1].marginsDropped!.map((member) => member.margins)).toEqual([{ "margin-bottom": "6px" }, { "margin-top": "2px" }]);
  });

  test("in the phone view, the margins go at its breakpoint only", async () => {
    const { doc, editor, changes, views, at } = open();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    editor.at(phone);
    editor.set(at("card"), "gap", 0);
    views.sync(phone);

    expect([between(doc), between(phone.document)]).toEqual([8, 0]);
    expect(changes.list()[0].breakpoint).toEqual({ min: null, max: 800 });
    editor.at(null);
    expect(editor.read(at("card"), "gap")).toBe(8);
  });

  test("the live page shows the gap only once the room between the layers is the gap: with the margin left, it says which layer has it", () => {
    const { editor, changes, at } = open();
    editor.set(at("card"), "gap", 0);
    const [change] = changes.list();
    live = document.createElement("iframe");
    document.body.append(live);
    const page = live.contentDocument!;
    const write = (html: string) => {
      page.open();
      page.write(html);
      page.close();
    };
    const flexCard = (html: string) => html.replace('style="width: 300px; padding: 10px"', 'style="width: 300px; padding: 10px; display: flex; flex-direction: column; gap: 0px"');

    // `gap-0` written, `mt-2` left.
    write(flexCard(GAPPED));
    expect(checkChange(page, change, onCanvas([change]))).toEqual({
      outcome: "not shown",
      actual: { room: { min: 8, max: 8 }, margins: [{ layer: change.marginsDropped![0].target.context.path.at(-1), side: "margin-top", px: 8 }] },
    });

    write(flexCard(GAPPED).replace("margin: 8px 0 0", "margin: 0"));
    expect(checkChange(page, change, onCanvas([change]))).toEqual({ outcome: "shown" });

    // A margin the notes never named, which the canvas shows too: not the Agent's to take off (review).
    write(flexCard(GAPPED).replace("margin: 8px 0 0", "margin: 0").replace('style="margin: 4px 0 0; height: 20px"', 'style="margin: 4px 0 6px; height: 20px"'));
    expect(checkChange(page, change, onCanvas([change]))).toEqual({ outcome: "shown" });
    // A gap with none to take off is checked by its gap as written, as ever.
    editor.set(at("row"), "gap", 20);
    const row = changes.list()[1];
    write(GAPPED.replace("display: flex; gap: 10px; width: 400px", "display: flex; gap: 20px; width: 400px").replace("height: 10px; margin-left: auto", "height: 10px; margin-left: 6px"));
    expect(checkChange(page, row, onCanvas([row]))).toEqual({ outcome: "shown" });
  });

  test("uneven room between the layers: the median shown can be set, and is a change that takes their margins off; one undo puts them back", () => {
    const { doc, editor, changes, at, el } = open();
    const list = at("list");
    const rooms = () => {
      const [one, two, three] = ["one", "two", "three"].map((id) => doc.getElementById(id)!.getBoundingClientRect());
      return [two.top - one.bottom, three.top - two.bottom];
    };
    expect(editor.read(list, "gap")).toBe(8);

    editor.set(list, "gap", 8);
    expect(rooms()).toEqual([8, 8]);
    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0]).toMatchObject({ property: "gap", before: [12, 4], after: 8 });
    expect([style(el("one")).marginBottom, style(el("two")).marginTop]).toEqual(["0px", "0px"]);

    // 12, then the median again: still the one change.
    editor.set(list, "gap", 12);
    editor.set(list, "gap", 8, { continues: true });
    expect(changes.list()).toHaveLength(1);
    expect(rooms()).toEqual([8, 8]);

    editor.undo();
    editor.undo();
    expect(changes.list()).toEqual([]);
    expect(rooms()).toEqual([12, 4]);
    expect([style(el("one")).marginBottom, style(el("two")).marginTop]).toEqual(["6px", "2px"]);
  });

  test("layers next to each other as drawn: by their `order` in a flex container", () => {
    const { doc, editor, changes } = openCanvas(`<!DOCTYPE html>
<body style="margin: 0">
  <div id="ordered" ${loc("5:5")} style="display: flex; flex-direction: column; width: 200px">
    <div id="x" ${loc("6:7")} style="height: 10px; margin-top: 8px">X</div>
    <div id="y" ${loc("7:7")} style="height: 10px; order: -1">Y</div>
  </div>
</body>`);
    const layer = (id: string) => find(editor.tree().root, (l) => l.el === doc.getElementById(id) && !l.text)!;
    // Y is drawn first: X's top margin is between them.
    expect(editor.read(layer("ordered"), "gap")).toBe(8);
    editor.set(layer("ordered"), "gap", 0);
    expect(style(doc.getElementById("x")!).marginTop).toBe("0px");
    expect(changes.list()[0].marginsDropped!.map((member) => member.margins)).toEqual([{ "margin-top": "8px" }]);
  });

  test("a gap set right after a Grid is made a Stack takes the margins between its layers off, as a change of its own", () => {
    const { doc, editor, changes, layerOf } = openCanvas(`<!DOCTYPE html>
<body style="margin: 0">
  <div id="grid" ${loc("5:5")} style="display: grid; grid-template-columns: 1fr; width: 200px">
    <div id="g1" ${loc("6:7")} style="height: 10px">One</div>
    <div id="g2" ${loc("7:7")} style="height: 10px; margin-top: 8px">Two</div>
  </div>
</body>`);
    editor.set(layerOf(doc.getElementById("grid")!), "arrangement", { type: "stack", direction: "vertical", wrap: false, gap: 0 });
    const stack = find(editor.tree().root, (l) => l.el === doc.getElementById("grid") && !l.text)!;
    expect(editor.read(stack, "gap")).toBe(8);
    editor.set(stack, "gap", 4);

    expect(changes.list().map((change) => change.property)).toEqual(["arrangement", "gap"]);
    expect(changes.list()[1].marginsDropped!.map((member) => member.margins)).toEqual([{ "margin-top": "8px" }]);
    expect(style(doc.getElementById("g2")!).marginTop).toBe("0px");
    // Set again: the same change.
    editor.set(stack, "gap", 6);
    expect(changes.list().map((change) => change.property)).toEqual(["arrangement", "gap"]);
    expect(doc.getElementById("g2")!.getBoundingClientRect().top - doc.getElementById("g1")!.getBoundingClientRect().bottom).toBe(6);
  });
});

