import { afterEach, describe, expect, test } from "vitest";
import type { Variable } from "../src/service-protocol";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import type { Layer } from "../src/client/layers";
import { copyStyle, pasteStyle, styleFor } from "../src/client/style-copy";
import { bind, resolveVariables } from "../src/client/variables";
import { createViews } from "../src/client/views";

/** Usage chains as the freezer writes them onto the canvas. */
const APP = [{ component: "App", usage: null, thirdParty: false }];
const cardAt = (usage: string) => [{ component: "Card", usage, thirdParty: false }, ...APP];
const chain = (levels: object[]) => `data-tk-chain='${JSON.stringify(levels)}'`;
const BADGE = [{ component: "Badge", usage: "src/App.tsx:10:5", thirdParty: true }, ...APP];

/**
 * A card styled in full, three cards of one usage (a loop) plain, a heading, a
 * button around its words, a Stack, and a locked badge from a dependency.
 */
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <main data-tk-loc="src/App.tsx:4:5" ${chain(APP)} style="display: flex; flex-wrap: wrap; gap: 8px; padding: 4px">
    <section id="styled" data-tk-loc="src/App.tsx:5:5" ${chain(APP)}
      style="width: 200px; height: 90px; position: relative; left: 3px; background-color: rgb(255, 0, 0); border: 2px dashed rgb(0, 0, 255);
        border-radius: 10px; opacity: 0.5; overflow: hidden; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.25); filter: blur(2px)"></section>
    ${[1, 2, 3]
      .map(
        (n) => `<article data-tk-loc="src/Card.tsx:3:5" ${chain(cardAt("src/App.tsx:6:9"))}
          style="width: 100px; height: 80px; background-color: rgb(255, 255, 255); border-radius: 12px">
          <h3 data-tk-loc="src/Card.tsx:4:7" ${chain(cardAt("src/App.tsx:6:9"))} style="margin: 0; font-size: 16px; color: rgb(0, 0, 0)">Card ${n}</h3>
        </article>`,
      )
      .join("")}
    <h1 id="title" data-tk-loc="src/App.tsx:7:5" ${chain(APP)}
      style="margin: 0; font-family: monospace; font-size: 30px; font-weight: 700; line-height: 40px; letter-spacing: 2px; text-align: center;
        text-transform: uppercase; text-decoration: underline; color: rgb(0, 128, 0); text-shadow: 1px 2px 3px rgb(0, 0, 0)">Hello</h1>
    <button id="go" data-tk-loc="src/App.tsx:8:5" ${chain(APP)} style="padding: 4px 8px; background-color: rgb(238, 238, 238)">Go</button>
    <div id="row" data-tk-loc="src/App.tsx:9:5" ${chain(APP)} style="display: flex; gap: 6px; padding: 2px; background-color: rgb(1, 2, 3)">
      <i data-tk-loc="src/App.tsx:9:9" ${chain(APP)} style="display: block; width: 10px; height: 10px"></i>
    </div>
    <span ${chain(BADGE)} style="display: block; background-color: rgb(0, 128, 0); border-radius: 4px"><b ${chain(BADGE)}>Beta</b></span>
  </main>
</body>`;

let frames: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const frame of frames) frame.remove();
  frames = [];
});

const frame = (width: number) => {
  const iframe = document.createElement("iframe");
  iframe.style.width = `${width}px`;
  document.body.append(iframe);
  frames.push(iframe);
  return iframe;
};

function openCanvas(variables: Variable[] = []) {
  const iframe = frame(800);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(PAGE);
  doc.close();
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const changes = createChangeSet();
  const catalog = variables.length ? resolveVariables(variables, doc) : null;
  const editor = createEditor(views, changes, null, { bind: catalog ? (...args) => bind(catalog, ...args) : undefined });
  const layer = (selector: string, n = 0) => find(editor.tree().root, (l) => l.el === doc.querySelectorAll(selector)[n] && !l.text)!;
  const style = (selector: string, n = 0) => getComputedStyle(doc.querySelectorAll(selector)[n]);
  return { doc, views, changes, editor, layer, style };
}

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | undefined {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
}

describe("copying a layer's style (⌥⌘C)", () => {
  test("a box's look: fill, stroke, corners, opacity, clipping, shadows and blur; not where it is, its size, or how it lays out", () => {
    const { editor, layer } = openCanvas();
    const style = copyStyle(editor, layer("#styled"))!;
    expect(Object.keys(style)).toEqual(["fill", "stroke", "radius", "opacity", "clip", "shadows", "layerBlur", "backgroundBlur"]);
    expect(style.fill!.value).toEqual({ type: "solid", color: "#FF0000", opacity: 1 });
    expect(style.stroke!.value).toMatchObject({ color: "#0000FF", weight: 2, style: "dashed" });
    expect(style.radius!.value).toBe(10);
    expect(style.opacity!.value).toBe(0.5);
    expect(style.clip!.value).toBe(true);
    expect(style.layerBlur!.value).toBe(2);
    // A Stack's own: its look alone, not its gap, padding or direction.
    expect(Object.keys(copyStyle(editor, layer("#row"))!)).not.toContain("gap");
    expect(Object.keys(copyStyle(editor, layer("#row"))!)).not.toContain("padding");
  });

  test("text's styles: font, size, weight, line height, letter spacing, alignment, case, decoration, color and shadows; not its words", () => {
    const { editor, layer } = openCanvas();
    const style = copyStyle(editor, layer("#title"))!;
    expect(Object.keys(style)).toEqual([
      "opacity",
      "textShadows",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "textAlign",
      "textCase",
      "textDecoration",
      "textColor",
    ]);
    expect(style.fontSize!.value).toBe(30);
    expect(style.textColor!.value).toEqual({ color: "#008000", opacity: 1 });
  });

  test("a locked layer has none to copy", () => {
    const { editor, layer } = openCanvas();
    expect(copyStyle(editor, layer("span"))).toBeNull();
  });

  test("as the view worked in shows it: in the phone view, its value there", async () => {
    const { editor, layer, views } = openCanvas();
    const phone = await views.add(frame(390), 390);
    editor.at(phone);
    editor.set(layer("#styled"), "radius", 4);
    expect(copyStyle(editor, layer("#styled"))!.radius!.value).toBe(4);
    editor.at(null);
    expect(copyStyle(editor, layer("#styled"))!.radius!.value).toBe(10);
  });
});

describe("pasting a style (⌥⌘V)", () => {
  test("each value an ordinary style change, as the panel makes it, on every instance of the usage; one step, undone and redone at once", () => {
    const { editor, changes, layer, style } = openCanvas();
    const copied = copyStyle(editor, layer("#styled"))!;
    pasteStyle(editor, [layer("article", 1)], copied);

    for (const n of [0, 1, 2]) {
      expect(style("article", n).backgroundColor).toBe("rgb(255, 0, 0)");
      expect(style("article", n).borderRadius).toBe("10px");
      expect(style("article", n).opacity).toBe("0.5");
      // Where it is and how big stay.
      expect(style("article", n).width).toBe("100px");
      expect(style("article", n).left).toBe("auto");
    }
    // A value it has already is no change.
    expect(changes.list().map((change) => [change.kind, change.property, change.scope, change.target.instances])).toEqual([
      ["style", "fill", "usage", 3],
      ["style", "stroke", "usage", 3],
      ["style", "radius", "usage", 3],
      ["style", "opacity", "usage", 3],
      ["style", "clip", "usage", 3],
      ["style", "shadows", "usage", 3],
      ["style", "layerBlur", "usage", 3],
    ]);
    // As the panel sets each one.
    const { editor: other, changes: byPanel, layer: otherLayer } = openCanvas();
    for (const change of changes.list()) other.set(otherLayer("article", 1), change.property as never, change.after as never);
    expect(byPanel.list()).toEqual(changes.list());

    editor.undo();
    expect(changes.list()).toEqual([]);
    expect(style("article", 0).backgroundColor).toBe("rgb(255, 255, 255)");
    editor.redo();
    expect(changes.list()).toHaveLength(7);
  });

  test("on several layers at once, each takes what it offers, one step; a locked layer takes none", () => {
    const { editor, changes, layer, style } = openCanvas();
    const copied = copyStyle(editor, layer("#styled"))!;
    const pasted = pasteStyle(editor, [layer("#row"), layer("#go"), layer("span")], copied);
    expect(pasted.map((l) => l.el.id)).toEqual(["row", "go"]);
    expect(style("#row").borderRadius).toBe("10px");
    expect(style("#go").borderRadius).toBe("10px");
    expect(style("span").borderRadius).toBe("4px");
    // How the Stack lays out stays.
    expect(style("#row").columnGap).toBe("6px");
    editor.undo();
    expect(changes.list()).toEqual([]);
  });

  test("text on text: its styles, and not its words", () => {
    const { editor, layer, doc, style } = openCanvas();
    pasteStyle(editor, [layer("h3", 0)], copyStyle(editor, layer("#title"))!);
    expect(style("h3", 2).fontSize).toBe("30px");
    expect(style("h3", 2).fontFamily).toBe("monospace");
    expect(style("h3", 2).textTransform).toBe("uppercase");
    expect(style("h3", 2).color).toBe("rgb(0, 128, 0)");
    expect(doc.querySelectorAll("h3")[2].textContent).toBe("Card 3");
  });

  test("text on a box, or a box on text: text's color is a solid fill and back, its shadows the box's and back, those text can draw; text styles go nowhere on a box", () => {
    const { editor, layer, style } = openCanvas();
    const title = copyStyle(editor, layer("#title"))!;
    expect(styleFor(editor, layer("#row"), title).map(({ property }) => property)).toEqual(["fill", "opacity", "shadows"]);
    pasteStyle(editor, [layer("#row")], title);
    expect(style("#row").backgroundColor).toBe("rgb(0, 128, 0)");
    expect(style("#row").boxShadow).toBe("rgb(0, 0, 0) 1px 2px 3px 0px");

    const box = copyStyle(editor, layer("#styled"))!;
    expect(styleFor(editor, layer("#title"), box).map(({ property }) => property)).toEqual(["opacity", "textShadows", "textColor"]);
    pasteStyle(editor, [layer("#title")], box);
    expect(style("#title").color).toBe("rgb(255, 0, 0)");
    // A gradient is no text color.
    editor.set(layer("#styled"), "fill", { type: "linear", angle: 90, stops: [{ color: "#FF0000", opacity: 1, position: 0, unit: "%" }, { color: "#0000FF", opacity: 1, position: 100, unit: "%" }] });
    expect(styleFor(editor, layer("#title"), copyStyle(editor, layer("#styled"))!).map(({ property }) => property)).not.toContain("textColor");
  });

  test("a button's words take text styles, the button its look, as the panel has each", () => {
    const { editor, layer, style } = openCanvas();
    const button = layer("#go");
    const [words] = button.children;
    pasteStyle(editor, [words], copyStyle(editor, layer("#title"))!);
    expect(style("#go").fontSize).toBe("30px");
    expect(style("#go").backgroundColor).toBe("rgb(238, 238, 238)");
  });

  test("in the phone view, at its breakpoint alone, marked as changed there", async () => {
    const { editor, layer, views, style, changes } = openCanvas();
    const phone = await views.add(frame(390), 390);
    const copied = copyStyle(editor, layer("#styled"))!;
    editor.at(phone);
    pasteStyle(editor, [layer("article", 0)], copied);
    expect(changes.list().every((change) => change.breakpoint)).toBe(true);
    expect(editor.changedHere(layer("article", 0), "radius")).toBe(true);
    expect(getComputedStyle(phone.document.querySelectorAll("article")[0]).borderRadius).toBe("10px");
    expect(style("article", 0).borderRadius).toBe("12px");
  });
});

describe("Variables pasted", () => {
  const variable = (name: string, group: Variable["group"], value: string, extra: Partial<Variable> = {}): Variable => ({ name, group, value, from: "tailwind", own: true, ...extra });
  const BRAND = variable("brand-500", "color", "#3d63f5");
  const TWIN = variable("brand-twin", "color", "#3d63f5");
  const CARD = variable("card", "radius", "14px");

  test("a Variable picked stays that Variable, picked; text's color picked is the fill's; a value a Variable is is named by it", () => {
    const { editor, layer, changes } = openCanvas([BRAND, TWIN, CARD]);
    // Picked the second of two Variables of the same value: that one, not the first that matches.
    editor.set(layer("#styled"), "fill", { type: "solid", color: "#3D63F5", opacity: 1 }, { variables: { color: TWIN } });
    editor.set(layer("#styled"), "radius", 14);
    pasteStyle(editor, [layer("article", 0)], copyStyle(editor, layer("#styled"))!);
    const of = (property: string) => changes.list().find((change) => change.property === property && change.target.loc === "src/Card.tsx:3:5")!;
    expect(of("fill").variables).toEqual({ color: { ...TWIN, picked: true } });
    expect(of("radius").variables).toEqual({ "": CARD });

    editor.set(layer("#title"), "textColor", { color: "#3D63F5", opacity: 1 }, { variables: { "": TWIN } });
    pasteStyle(editor, [layer("#row")], copyStyle(editor, layer("#title"))!);
    expect(changes.list().find((change) => change.property === "fill" && change.target.loc === "src/App.tsx:9:5")!.variables).toEqual({ color: { ...TWIN, picked: true } });
  });

  test("pasted again where it has the same values and the same Variables picked, nothing changes: no layer, no step to undo", () => {
    const { editor, layer, changes } = openCanvas([BRAND, TWIN, CARD]);
    editor.set(layer("#styled"), "fill", { type: "solid", color: "#3D63F5", opacity: 1 }, { variables: { color: TWIN } });
    const copied = copyStyle(editor, layer("#styled"))!;
    expect(pasteStyle(editor, [layer("article", 0)], copied)).toHaveLength(1);
    const listed = changes.list();
    expect(pasteStyle(editor, [layer("article", 0)], copied)).toEqual([]);
    expect(changes.list()).toEqual(listed);
    // The one undo takes the first paste back.
    editor.undo();
    expect(changes.list().filter((change) => change.target.loc === "src/Card.tsx:3:5")).toEqual([]);
    // Pasted on itself: nothing.
    expect(pasteStyle(editor, [layer("#styled")], copied)).toEqual([]);
  });

  test("the same value with another Variable picked is a change: the Variable", () => {
    const { editor, layer, changes } = openCanvas([BRAND, TWIN, CARD]);
    editor.set(layer("article", 0), "fill", { type: "solid", color: "#3D63F5", opacity: 1 }, { variables: { color: BRAND } });
    editor.set(layer("#styled"), "fill", { type: "solid", color: "#3D63F5", opacity: 1 }, { variables: { color: TWIN } });
    expect(pasteStyle(editor, [layer("article", 0)], { fill: copyStyle(editor, layer("#styled"))!.fill })).toHaveLength(1);
    expect(changes.list().find((change) => change.target.loc === "src/Card.tsx:3:5")!.variables).toEqual({ color: { ...TWIN, picked: true } });
  });
});
