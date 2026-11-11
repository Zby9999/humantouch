import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet, type Change } from "../src/client/changeset";
import { declare, declareAlone } from "../src/client/canvas-style";
import { checkChange } from "../src/client/check";
import { createEditor } from "../src/client/edits";
import { placedOnCanvas } from "../src/client/moves";
import { otherUsagesChanged, noteRound } from "../src/client/other-usages";
import { serializeCanvas } from "../src/client/freezer";
import { revertSaved, takeInApplied } from "../src/client/saved-round";
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
let live: HTMLIFrameElement | undefined;
let saved: HTMLIFrameElement | undefined;
afterEach(() => {
  iframe?.remove();
  live?.remove();
  saved?.remove();
});

/** A saved canvas, shown 800 px wide, as it looks. */
function showSaved(html: string): Document {
  saved?.remove();
  saved = document.createElement("iframe");
  saved.style.width = "800px";
  document.body.append(saved);
  const doc = saved.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  return doc;
}

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

describe("done checks the instance alone, and the loop's other instances (ticket 114)", () => {
  /** The live page, as React renders it: each Card with its usage known. */
  function livePage() {
    live = document.createElement("iframe");
    live.style.width = "800px";
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(PAGE);
    page.close();
    function App() {}
    function Card() {}
    const app = { type: App, memoizedProps: {}, _debugOwner: null };
    [...page.querySelectorAll("article")].forEach((card, i) => {
      const usage = i < 3 ? "src/App.tsx:6:9" : "src/App.tsx:8:7";
      const fiber = { _debugOwner: { type: Card, memoizedProps: { "data-ht-usage": usage }, _debugOwner: app } };
      for (const el of [card, card.querySelector("h3")!]) Object.assign(el, { __reactFiber$alone: fiber });
    });
    const cards = [...page.querySelectorAll("article")] as HTMLElement[];
    return { page, cards };
  }
  /** The second Card, alone, made red; and the padding of every Card of the loop: the round. */
  function round(): Change[] {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.editAlone(layerOf(cards[1]), true);
    editor.set(layerOf(cards[1]), "fill", RED);
    editor.set(layerOf(cards[0]), "fill", BLUE);
    return changes.list();
  }

  test("shown once the second Card alone is red, the others blue; red on the first too, not shown: another instance changed", () => {
    const list = round();
    const [alone, shared] = list;
    const onCanvas = placedOnCanvas(list, "");
    const { page, cards } = livePage();
    // As the round is claimed: the other Cards white.
    // The Card used on its own only: the loop's others change with the one shared.
    const noted = noteRound(page, list, 800);
    expect(noted.get(alone.id)!.seen.map(({ nth, chain }) => [nth, chain[0].usage])).toEqual([[undefined, "src/App.tsx:8:7"]]);
    expect(checkChange(page, alone, onCanvas)).toEqual({ outcome: "not shown", actual: { type: "solid", color: "#FFFFFF", opacity: 1 } });

    cards[1].style.backgroundColor = "rgb(255, 0, 0)";
    cards[0].style.backgroundColor = cards[2].style.backgroundColor = "rgb(0, 0, 255)";
    expect(checkChange(page, alone, onCanvas)).toEqual({ outcome: "shown" });
    // The one shared shows on the first and the third: the second has a value of its own.
    expect(checkChange(page, shared, onCanvas)).toEqual({ outcome: "shown" });
  });

  test("made alone with nothing else changed, the loop's other instances are noted as the round is claimed, and one changing with it is told", () => {
    const { editor, changes, cards: canvasCards, layerOf } = openCanvas();
    editor.editAlone(layerOf(canvasCards[1]), true);
    editor.set(layerOf(canvasCards[1]), "fill", RED);
    const [alone] = changes.list();
    const { page, cards } = livePage();
    const noted = noteRound(page, changes.list(), 800);
    expect(noted.get(alone.id)!.seen.filter(({ nth }) => nth).map(({ nth, value }) => ({ nth, value }))).toEqual([
      { nth: 1, value: { type: "solid", color: "#FFFFFF", opacity: 1 } },
      { nth: 3, value: { type: "solid", color: "#FFFFFF", opacity: 1 } },
    ]);

    // Written for every instance: the second shows it, the others too.
    for (const card of cards.slice(0, 3)) card.style.backgroundColor = "rgb(255, 0, 0)";
    expect(checkChange(page, alone, placedOnCanvas(changes.list(), ""))).toEqual({ outcome: "shown" });
    expect(otherUsagesChanged(page, alone, noted.get(alone.id)!, 800)).toEqual([
      { chain: alone.target.chain, nth: 1, was: { type: "solid", color: "#FFFFFF", opacity: 1 }, is: RED },
      { chain: alone.target.chain, nth: 3, was: { type: "solid", color: "#FFFFFF", opacity: 1 }, is: RED },
    ]);
    // By a field of its data: the others as they were.
    cards[0].style.backgroundColor = cards[2].style.backgroundColor = WHITE;
    expect(otherUsagesChanged(page, alone, noted.get(alone.id)!, 800)).toEqual([]);
  });
});

describe("a saved round with an instance alone (ticket 114)", () => {
  test("saved and opened again, the instance is still alone, its change on it alone; taken out of the saved round, it is as the others", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();
    editor.editAlone(layerOf(cards[1]), true);
    editor.set(layerOf(cards[1]), "fill", RED);
    editor.set(layerOf(cards[0]), "fill", BLUE);
    const canvas = serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
    expect(canvas).toContain('data-ht-alone="1"');
    expect([...showSaved(canvas).querySelectorAll("article")].map(background)).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)", "rgb(0, 0, 255)", WHITE]);
    const reverted = revertSaved({ canvas, changeSet: changes.save() }, changes.list()[0].id)!;
    expect([...showSaved(reverted.canvas).querySelectorAll("article")].map(background)).toEqual(["rgb(0, 0, 255)", "rgb(0, 0, 255)", "rgb(0, 0, 255)", WHITE]);
    expect(reverted.changeSet.changes.map((change) => change.property)).toEqual(["fill"]);
  });
});

describe("review fixes (ticket 114)", () => {
  test("applied in a round before, a fill made alone stays over the fill the instances share, left this round", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();
    editor.editAlone(layerOf(cards[1]), true);
    editor.set(layerOf(cards[1]), "fill", RED);
    editor.set(layerOf(cards[0]), "fill", BLUE);
    const [alone, shared] = changes.list();
    const canvas = serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
    const shown = showSaved(canvas);
    takeInApplied(shown, { lastId: 2, changes: [shared], applied: [alone] });
    expect([...shown.querySelectorAll("article")].map(background)).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)", "rgb(0, 0, 255)", WHITE]);
  });

  test("a copy of the instance alone follows the others: it has no mark", () => {
    const { doc, editor, cards, layerOf } = openCanvas();
    editor.editAlone(layerOf(cards[1]), true);
    editor.duplicate(layerOf(cards[1]));
    expect(doc.querySelectorAll("[data-ht-alone]")).toHaveLength(1);
    expect(doc.querySelectorAll("article")).toHaveLength(5);
  });

  test("a value of its own at every width wins over one the instances share at a breakpoint", () => {
    const { cards } = openCanvas();
    // 800px wide: a range up to 1000px holds.
    declare(cards.slice(0, 3), { "background-color": "rgb(0, 255, 0)" }, { min: null, max: 1000 }, "9");
    declareAlone(cards[1], { "background-color": "rgb(255, 0, 0)" });
    expect(cards.map(background)).toEqual(["rgb(0, 255, 0)", "rgb(255, 0, 0)", "rgb(0, 255, 0)", WHITE]);
  });
});
