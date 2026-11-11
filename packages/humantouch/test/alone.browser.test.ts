import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import type { Fill } from "../src/client/property-table";
import type { Layer } from "../src/client/layers";
import { createViews } from "../src/client/views";

/**
 * One instance alone (ticket 114): one of the instances a loop renders stops
 * following the others; what is changed on it from then on is changed on it
 * alone, over what the instances share, which still changes it.
 */

const APP = [{ component: "App", usage: null, thirdParty: false }];
const cardAt = (usage: string) => [{ component: "Card", usage, thirdParty: false }, ...APP];
const chain = (levels: object[]) => `data-ht-chain='${JSON.stringify(levels)}'`;

const card = (usage: string, title: string) => `
  <article data-ht-loc="src/Card.tsx:3:5" ${chain(cardAt(usage))} style="height: 80px; background-color: rgb(255, 255, 255); padding: 4px">
    <h3 data-ht-loc="src/Card.tsx:4:7" ${chain(cardAt(usage))} style="margin: 0; color: rgb(0, 0, 0)">${title}</h3>
  </article>`;

/** Three Cards a loop renders, and one Card used on its own. */
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <main data-ht-loc="src/App.tsx:2:5" ${chain(APP)} style="display: grid; grid-template-columns: repeat(4, 150px); gap: 8px">
    ${["Light", "Dark", "System"].map((title) => card("src/App.tsx:6:9", title)).join("")}
    ${card("src/App.tsx:8:7", "Your turn")}
  </main>
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
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const changes = createChangeSet();
  const editor = createEditor(views, changes);
  const cards = [...doc.querySelectorAll("article")];
  const titles = [...doc.querySelectorAll("h3")];
  const layerOf = (el: Element) => find(editor.tree().root, (layer) => layer.el === el && !layer.text)!;
  return { doc, changes, editor, cards, titles, layerOf };
}

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | undefined {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
}

const RED: Fill = { type: "solid", color: "#FF0000", opacity: 1 };
const BLUE: Fill = { type: "solid", color: "#0000FF", opacity: 1 };
const background = (el: Element) => getComputedStyle(el).backgroundColor;
const padding = (el: Element) => getComputedStyle(el).paddingTop;
const WHITE = "rgb(255, 255, 255)";

describe("one instance alone", () => {
  test("only an instance a loop renders, or a layer in one, can stop following the others", () => {
    const { editor, cards, titles, layerOf } = openCanvas();
    expect(cards.map((el) => editor.canEditAlone(layerOf(el)))).toEqual([true, true, true, false]);
    expect(editor.canEditAlone(layerOf(titles[1]))).toBe(true);
    expect(editor.canEditAlone(layerOf(titles[3]))).toBe(false);
    expect(editor.editsAlone(layerOf(cards[1]))).toBe(false);
  });

  test("alone, a fill changed on the second Card is on it alone; a padding changed on another still changes it, a fill on another not", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.editAlone(layerOf(cards[1]), true);
    expect([editor.editsAlone(layerOf(cards[1])), editor.editsAlone(layerOf(cards[0]))]).toEqual([true, false]);

    editor.set(layerOf(cards[1]), "fill", RED);
    expect(cards.map(background)).toEqual([WHITE, "rgb(255, 0, 0)", WHITE, WHITE]);

    editor.set(layerOf(cards[0]), "padding", [12, 12, 12, 12]);
    expect(cards.map(padding)).toEqual(["12px", "12px", "12px", "4px"]);

    editor.set(layerOf(cards[2]), "fill", BLUE);
    expect(cards.map(background)).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)", "rgb(0, 0, 255)", WHITE]);

    const [fill, , shared] = changes.list();
    expect(fill).toMatchObject({ kind: "style", scope: "usage", property: "fill", after: RED, alone: true, instance: { nth: 2, words: "Dark" }, target: { instances: 3, loc: "src/Card.tsx:3:5" } });
    expect(fill.layer).toBe(`${cards[1].getAttribute("data-ht-layer")} alone 1`);
    expect(shared).toMatchObject({ property: "fill", after: BLUE, layer: cards[1].getAttribute("data-ht-layer") });
    expect(shared.alone).toBeUndefined();
  });

  test("a layer in the Card alone is changed in it alone, and the same layer of the others changes it where it has no value of its own", () => {
    const { editor, titles, cards, layerOf } = openCanvas();
    editor.editAlone(layerOf(titles[1]), true);
    expect(cards[1].hasAttribute("data-ht-alone")).toBe(true);
    editor.set(layerOf(titles[1]), "fontSize", 30);
    editor.set(layerOf(titles[0]), "fontSize", 20);
    editor.set(layerOf(titles[0]), "textColor", RED);
    expect(titles.map((el) => getComputedStyle(el).fontSize)).toEqual(["20px", "30px", "20px", "18.72px"]);
    expect(titles.map((el) => getComputedStyle(el).color)).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(0, 0, 0)"]);
  });

  test("going alone, and changes made alone, undo and redo; following again takes what was changed alone back, as one step", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.editAlone(layerOf(cards[1]), true);
    editor.set(layerOf(cards[1]), "fill", RED);

    editor.undo();
    expect(cards.map(background)).toEqual([WHITE, WHITE, WHITE, WHITE]);
    expect(changes.list()).toEqual([]);
    editor.redo();
    expect(cards.map(background)).toEqual([WHITE, "rgb(255, 0, 0)", WHITE, WHITE]);

    editor.editAlone(layerOf(cards[1]), false);
    expect(editor.editsAlone(layerOf(cards[1]))).toBe(false);
    expect(cards.map(background)).toEqual([WHITE, WHITE, WHITE, WHITE]);
    expect(changes.list()).toEqual([]);

    editor.undo();
    expect(editor.editsAlone(layerOf(cards[1]))).toBe(true);
    expect(cards.map(background)).toEqual([WHITE, "rgb(255, 0, 0)", WHITE, WHITE]);
    expect(changes.list()).toMatchObject([{ property: "fill", alone: true }]);

    // Following again, a fill changed on it is on every instance.
    editor.redo();
    editor.set(layerOf(cards[1]), "fill", BLUE);
    expect(cards.map(background)).toEqual(["rgb(0, 0, 255)", "rgb(0, 0, 255)", "rgb(0, 0, 255)", WHITE]);
  });

  test("a change made alone, taken back from the change list, leaves the instance as the others are", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", BLUE);
    editor.editAlone(layerOf(cards[1]), true);
    editor.set(layerOf(cards[1]), "fill", RED);
    editor.revert(changes.list()[1].id);
    expect(cards.map(background)).toEqual(["rgb(0, 0, 255)", "rgb(0, 0, 255)", "rgb(0, 0, 255)", WHITE]);
    expect(changes.list()).toMatchObject([{ after: BLUE }]);
  });

  test("Promote takes the changes the instances share, never those made alone", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.editAlone(layerOf(cards[1]), true);
    editor.set(layerOf(cards[1]), "fill", RED);
    expect(editor.canPromote(layerOf(cards[1]))).toBe(false);
    editor.set(layerOf(cards[0]), "padding", [12, 12, 12, 12]);
    expect(editor.canPromote(layerOf(cards[1]))).toBe(true);
    const { promoted, stays } = editor.promote(layerOf(cards[1]));
    expect(promoted.map((change) => change.property)).toEqual(["padding"]);
    expect(stays).toEqual([]);
    expect(changes.list().map((change) => [change.property, change.scope, !!change.alone])).toEqual([
      ["fill", "usage", true],
      ["padding", "component", false],
    ]);
    expect(cards.map(background)).toEqual([WHITE, "rgb(255, 0, 0)", WHITE, WHITE]);
    expect(cards.map(padding)).toEqual(["12px", "12px", "12px", "12px"]);
  });
});
