import { afterEach, describe, expect, test } from "vitest";
import { carryOver, createChangeSet, type SavedChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { restore, serializeCanvas, type Canvas } from "../src/client/freezer";
import type { Fill } from "../src/client/property-table";
import { revertSaved, takeInApplied } from "../src/client/saved-round";
import { createHistory } from "../src/client/undo-steps";
import { createViews } from "../src/client/views";

/**
 * Ticket 68: a round that ends with changes not applied comes back on the
 * same canvas. What was applied stays on it, under what is left, as the
 * page's own: it looks as it did when the round ended, in every view; the
 * changes left are undone one by one, from the canvas open or with none,
 * and leave what was applied as it is; the next edit to the same value goes
 * from the applied one.
 */

const APP = [{ component: "App", usage: null, thirdParty: false }];
const cardAt = [{ component: "Card", usage: "src/App.tsx:6:9", thirdParty: false }, ...APP];
const buttonIn = [{ component: "Button", usage: "src/Card.tsx:5:7", thirdParty: false }, ...cardAt];
const chain = (levels: object[]) => `data-vk-chain='${JSON.stringify(levels)}'`;

/** Three Cards from one usage (a loop), each with a title and a Button. */
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <main data-vk-loc="src/App.tsx:2:5" ${chain(APP)} style="display: flex; gap: 8px; padding: 4px">
    ${[1, 2, 3]
      .map(
        (n) => `
    <article data-vk-loc="src/Card.tsx:3:5" ${chain(cardAt)} style="width: 150px; height: 80px; background-color: rgb(255, 255, 255); border-radius: 12px; opacity: 1">
      <h3 data-vk-loc="src/Card.tsx:4:7" ${chain(cardAt)} style="margin: 0">Card ${n}</h3>
      <button data-vk-loc="src/Button.tsx:2:3" ${chain(buttonIn)} style="background-color: rgb(200, 200, 200)">Open</button>
    </article>`,
      )
      .join("")}
  </main>
</body>`;

const WIDTHS = [800, 600, 390] as const;
const PROPERTIES = ["display", "position", "left", "top", "width", "height", "background-color", "border-top-left-radius", "opacity", "row-gap", "column-gap"];
const RED: Fill = { type: "solid", color: "#FF0000", opacity: 1 };
const BLUE: Fill = { type: "solid", color: "#0000FF", opacity: 1 };
const GREEN: Fill = { type: "solid", color: "#00FF00", opacity: 1 };

const made: HTMLElement[] = [];
afterEach(() => {
  for (const el of made.splice(0)) el.remove();
});

function iframe(width: number): HTMLIFrameElement {
  const el = document.createElement("iframe");
  el.style.width = `${width}px`;
  el.style.height = "600px";
  document.body.append(el);
  made.push(el);
  return el;
}

/** Each element of the body, in page order, its words and `PROPERTIES`. */
function stylesOf(doc: Document): string[][] {
  return [...doc.body.querySelectorAll("*")].map((el) => {
    const style = getComputedStyle(el);
    return [el.localName, el.childElementCount ? "" : el.textContent!.trim(), ...PROPERTIES.map((name) => style.getPropertyValue(name))];
  });
}

/** `canvas` shown in each of `WIDTHS`, edited. */
async function open(canvas: Canvas, changeSet?: SavedChangeSet) {
  const views = createViews(canvas);
  for (const width of WIDTHS.slice(1)) await views.add(iframe(width), width);
  const changes = createChangeSet(changeSet);
  const editor = createEditor(views, changes, null, { history: createHistory() });
  const doc = canvas.document;
  const layerOf = (el: Element) => editor.tree().layerOf(el)!;
  const styles = () => {
    for (const view of views.list().slice(1)) views.sync(view);
    return Object.fromEntries(views.list().map((view) => [String(view.width), stylesOf(view.document)]));
  };
  return { doc, views, changes, editor, layerOf, styles };
}

function freshCanvas(): Canvas {
  const doc = iframe(800).contentDocument!;
  doc.open();
  doc.write(PAGE);
  doc.close();
  return { document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 };
}

/**
 * The round, as it was when it ended: the loop filled red (1), its corners
 * 20px in the phone view (2) and 4px at every width (3), its opacity 0.5 (4),
 * the Button filled green and promoted to its component (5), the titles'
 * words changed in the second Card alone (6), the third Card deleted alone (7), and the title
 * copied (8), in every Card.
 */
async function endedRound() {
  const opened = await open(freshCanvas());
  const { doc, views, editor, layerOf } = opened;
  const cards = () => [...doc.querySelectorAll("article")];
  editor.set(layerOf(cards()[0]), "fill", RED);
  editor.at(views.list()[2]);
  editor.set(layerOf(cards()[0]), "radius", 20);
  editor.at(null);
  editor.set(layerOf(cards()[0]), "radius", 4);
  editor.set(layerOf(cards()[0]), "opacity", 0.5);
  const button = () => layerOf(cards()[0].querySelector("button")!);
  editor.set(button(), "fill", GREEN);
  editor.promote(button());
  editor.setText(layerOf(cards()[1].querySelector("h3")!), "Your turn");
  editor.remove(layerOf(cards()[2]));
  editor.duplicate(layerOf(cards()[0].querySelector("h3")!));
  const kinds = opened.changes.list().map((change) => [change.id, change.kind, change.property, change.breakpoint ? "phone" : "all"]);
  expect(kinds).toEqual([
    [1, "style", "fill", "all"],
    [2, "style", "radius", "phone"],
    [3, "style", "radius", "all"],
    [4, "style", "opacity", "all"],
    [5, "style", "fill", "all"],
    [6, "text", "text-1", "all"],
    [7, "delete", "delete-2", "all"],
    [8, "duplicate", "copy", "all"],
  ]);
  return { saved: { canvas: serializeCanvas(opened.views.canvas), changeSet: opened.changes.save() }, styles: opened.styles() };
}

/** The canvas saved when the round ended put back, as edit mode does: what was applied taken in as it is. */
async function reopen(saved: { canvas: string; changeSet: SavedChangeSet }) {
  const canvas = await restore(saved.canvas, iframe(800), (doc) => takeInApplied(doc, saved.changeSet));
  return open(canvas, saved.changeSet);
}

const cardsOf = (doc: Document) => [...doc.querySelectorAll("article")];
const look = (el: Element) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopLeftRadius, getComputedStyle(el).opacity];

describe("a round carried over to the next on the same canvas (ticket 68)", () => {
  // Applied: the red fill, the phone corners, the Button's component fill, the new words and the Card deleted. Left: the corners at every width, the opacity, the copy.
  const APPLIED = [1, 2, 5, 6, 7];

  test("opens as it was when the round ended, in every view; its ChangeSet is the changes left alone, numbered from 1", async () => {
    const { saved, styles } = await endedRound();
    const next = { ...saved, changeSet: carryOver(saved.changeSet, APPLIED)! };

    const { changes, styles: now } = await reopen(next);

    expect(now()).toEqual(styles);
    expect(changes.list().map((change) => [change.id, change.property])).toEqual([
      [1, "radius"],
      [2, "opacity"],
      [3, "copy"],
    ]);
    expect(changes.save()).not.toHaveProperty("applied");
  });

  test("the changes left are undone one by one; what was applied stays as it is, at every width, and nothing undoes it", async () => {
    const { saved } = await endedRound();
    const next = { ...saved, changeSet: carryOver(saved.changeSet, APPLIED)! };
    const { doc, editor, changes, views } = await reopen(next);

    // Nothing of this edit mode's to undo yet: what was applied is no step of it.
    editor.undo();
    expect(look(cardsOf(doc)[0])).toEqual(["rgb(255, 0, 0)", "4px", "0.5"]);

    for (const change of changes.list().reverse()) editor.revert(change.id);

    expect(changes.list()).toEqual([]);
    // The fill applied, the corners as the page has them at every width, the opacity back.
    expect(cardsOf(doc).slice(0, 2).map(look)).toEqual(Array(2).fill(["rgb(255, 0, 0)", "12px", "1"]));
    const phone = views.list()[2];
    views.sync(phone);
    expect(cardsOf(phone.document).slice(0, 2).map((card) => getComputedStyle(card).borderTopLeftRadius)).toEqual(["20px", "20px"]);
    expect([...doc.querySelectorAll("main button")].slice(0, 2).map((button) => getComputedStyle(button).backgroundColor)).toEqual(Array(2).fill("rgb(0, 255, 0)"));
    expect(cardsOf(doc).map((card) => card.querySelector("h3")!.textContent)).toEqual(["Card 1", "Your turn", "Card 3"]);
    expect(getComputedStyle(cardsOf(doc)[2]).display).toBe("none");
    expect(cardsOf(doc).map((card) => card.querySelectorAll("h3").length)).toEqual([1, 1, 1]);
  });

  test("with no canvas open, the changes left to a layer taken back out leave what was applied as it is", async () => {
    const { saved } = await endedRound();
    const next = { ...saved, changeSet: carryOver(saved.changeSet, APPLIED)! };

    const left = revertSaved(revertSaved(next, 2)!, 1)!;

    expect(left.changeSet).toEqual({ lastId: 3, changes: next.changeSet.changes.slice(2) });
    const doc = iframe(800).contentDocument!;
    doc.open();
    doc.write(left.canvas);
    doc.close();
    expect(cardsOf(doc).slice(0, 2).map(look)).toEqual(Array(2).fill(["rgb(255, 0, 0)", "12px", "1"]));
    expect(getComputedStyle(cardsOf(doc)[2]).display).toBe("none");
    expect(cardsOf(doc)[1].querySelector("h3")!.textContent).toBe("Your turn");
  });

  test("the next edit to a value applied goes from it, and its undo goes back to it; new words go from the words applied", async () => {
    const { saved } = await endedRound();
    const next = { ...saved, changeSet: carryOver(saved.changeSet, APPLIED)! };
    const { doc, editor, changes, layerOf } = await reopen(next);

    editor.set(layerOf(cardsOf(doc)[0]), "fill", BLUE);
    editor.setText(layerOf(cardsOf(doc)[1].querySelector("h3")!), "My turn");

    expect(changes.list().slice(3).map((change) => [change.id, change.before, change.after])).toEqual([
      [4, RED, BLUE],
      [5, "Your turn", "My turn"],
    ]);
    editor.undo();
    editor.undo();
    expect(look(cardsOf(doc)[0])[0]).toBe("rgb(255, 0, 0)");
    expect(cardsOf(doc)[1].querySelector("h3")!.textContent).toBe("Your turn");
  });

  test("the component's change left under its usage's applied: as it was, and undone, the usage's value stays", async () => {
    const opened = await open(freshCanvas());
    const { doc, editor, layerOf } = opened;
    const card = () => layerOf(cardsOf(doc)[0]);
    editor.set(card(), "radius", 16);
    editor.promote(card());
    editor.set(card(), "radius", 24);
    editor.set(card(), "opacity", 0.5);
    expect(opened.changes.list().map((change) => [change.id, change.property, change.scope])).toEqual([
      [1, "radius", "component"],
      [2, "radius", "usage"],
      [3, "opacity", "usage"],
    ]);
    const styles = opened.styles();
    const saved = { canvas: serializeCanvas(opened.views.canvas), changeSet: opened.changes.save() };
    // The usage's corners applied; the Card's own corners and the opacity left.
    const next = { ...saved, changeSet: carryOver(saved.changeSet, [2])! };
    const corners = (doc: Document) => cardsOf(doc).map((el) => getComputedStyle(el).borderTopLeftRadius);

    const again = await reopen(next);

    expect(again.styles()).toEqual(styles);
    again.editor.revert(1);
    expect(corners(again.doc)).toEqual(["24px", "24px", "24px"]);

    const left = revertSaved(next, 1)!;
    const shown = iframe(800).contentDocument!;
    shown.open();
    shown.write(left.canvas);
    shown.close();
    expect(corners(shown)).toEqual(["24px", "24px", "24px"]);
  });

  test("a move absolute left in a container with a change applied: undone, the container is no positioning reference", async () => {
    const opened = await open(freshCanvas());
    const { doc, editor, layerOf } = opened;
    const main = doc.querySelector("main")!;
    editor.set(layerOf(main), "opacity", 0.8);
    editor.move(layerOf(cardsOf(doc)[1]), { parent: layerOf(main), x: 10, y: 300 });
    editor.set(layerOf(cardsOf(doc)[0]), "radius", 4);
    expect(opened.changes.list().map((change) => [change.id, change.kind])).toEqual([
      [1, "style"],
      [2, "move"],
      [3, "style"],
    ]);
    expect(getComputedStyle(main).position).toBe("relative");
    const styles = opened.styles();
    const saved = { canvas: serializeCanvas(opened.views.canvas), changeSet: opened.changes.save() };
    // The opacity applied; the move and the corners left.
    const next = { ...saved, changeSet: carryOver(saved.changeSet, [1])! };
    const look = (doc: Document) => {
      const main = doc.querySelector("main")!;
      return [getComputedStyle(main).position, getComputedStyle(main).opacity, getComputedStyle(cardsOf(doc)[1]).position];
    };

    const again = await reopen(next);

    expect(again.styles()).toEqual(styles);
    again.editor.revert(1);
    expect(look(again.doc)).toEqual(["static", "0.8", "static"]);

    const left = revertSaved(next, 1)!;
    const shown = iframe(800).contentDocument!;
    shown.open();
    shown.write(left.canvas);
    shown.close();
    expect(look(shown)).toEqual(["static", "0.8", "static"]);
  });
});
