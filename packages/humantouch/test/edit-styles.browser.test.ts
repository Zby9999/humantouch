import { afterEach, describe, expect, test } from "vitest";
import { asPage, declare } from "../src/client/canvas-style";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { restore, serializeCanvas, type Canvas } from "../src/client/freezer";
import type { Fill } from "../src/client/property-table";
import { revertSaved } from "../src/client/saved-round";
import { createViews } from "../src/client/views";

/**
 * The instances of a layer share their edit styles (ticket 60): one style
 * element for all those with the same rules, so a value stepped on a layer a
 * loop renders many times changes one, in every view.
 */

const APP = [{ component: "App", usage: null, thirdParty: false }];
const LOOP = [{ component: "Card", usage: "src/App.tsx:6:9", thirdParty: false }, ...APP];
const chain = (levels: object[]) => `data-ht-chain='${JSON.stringify(levels)}'`;

/** A loop of six Cards, a title in each; with `lifted`, the last one has an important opacity of the page's own on its style attribute. */
const pageWith = (lifted: boolean) => `<!DOCTYPE html>
<body style="margin: 0">
  <main data-ht-loc="src/App.tsx:4:5" ${chain(APP)} style="display: grid; grid-template-columns: repeat(3, 120px); gap: 8px">
    ${[1, 2, 3, 4, 5, 6]
      .map(
        (n) => `<article data-ht-loc="src/Card.tsx:3:5" ${chain(LOOP)} style="height: 60px; background-color: rgb(255, 255, 255); border-radius: 12px${lifted && n === 6 ? "; opacity: 0.5 !important" : ""}">
          <h3 data-ht-loc="src/Card.tsx:4:7" ${chain(LOOP)} style="margin: 0">Card ${n}</h3>
        </article>`,
      )
      .join("")}
  </main>
</body>`;
const PAGE = pageWith(false);

const RED: Fill = { type: "solid", color: "#FF0000", opacity: 1 };

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

function write(html: string, width = 800): Document {
  const doc = iframe(width).contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  return doc;
}

/** The page as a canvas, 800 px wide, shown in a phone view too. */
async function open(page = PAGE) {
  const doc = write(page);
  const canvas: Canvas = { document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 };
  const views = createViews(canvas);
  const phone = await views.add(iframe(390), 390);
  const changes = createChangeSet();
  const editor = createEditor(views, changes);
  const cards = [...doc.querySelectorAll("article")];
  const layerOf = (el: Element) => editor.tree().layerOf(el)!;
  /** The phone view's copy of `el`, as it shows the canvas now. */
  const inPhone = (el: Element) => {
    views.sync(phone);
    return phone.elementOf(el)!;
  };
  return { doc, canvas, views, phone, changes, editor, cards, layerOf, inPhone };
}

const sheets = (doc: Document) => [...doc.querySelectorAll("style[data-ht-rules]")];
const keys = (els: Element[]) => new Set(els.map((el) => el.getAttribute("data-ht-style")));
const radius = (el: Element) => getComputedStyle(el).borderTopLeftRadius;

describe("the instances of a layer share their edit styles", () => {
  test("edited, a layer a loop renders has one style element for all its instances; each step of a value changes its rules alone, and every view, the canvas saved and a view added after show the last", async () => {
    const { doc, canvas, views, editor, cards, layerOf, inPhone } = await open();
    editor.set(layerOf(cards[0]), "radius", 4);
    expect(sheets(doc)).toHaveLength(1);
    expect(keys(cards).size).toBe(1);

    const changed: Node[] = [];
    const observer = new MutationObserver((records) => changed.push(...records.map((record) => record.target)));
    observer.observe(doc.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
    for (const value of [5, 6, 7, 8]) editor.set(layerOf(cards[0]), "radius", value, { continues: true, step: true });
    await Promise.resolve();
    observer.disconnect();

    expect(changed).toEqual(Array(4).fill(sheets(doc)[0]));
    const all = Array(6).fill("8px");
    expect(cards.map(radius)).toEqual(all);
    expect(cards.map((card) => radius(inPhone(card)))).toEqual(all);
    const saved = write(serializeCanvas(canvas));
    expect([...saved.querySelectorAll("article")].map(radius)).toEqual(all);
    const tablet = await views.add(iframe(600), 600);
    expect([...tablet.document.querySelectorAll("article")].map(radius)).toEqual(all);
  });

  test("one instance moved alone, or deleted alone, has a style element of its own, as it looks otherwise; undone, it shares the others' again", async () => {
    const { doc, editor, cards, layerOf } = await open();
    const main = doc.querySelector("main")!;
    editor.set(layerOf(cards[0]), "radius", 4);

    editor.move(layerOf(cards[1]), { parent: layerOf(main), x: 10, y: 300 });
    expect(keys(cards).size).toBe(2);
    expect(keys(cards.filter((card) => card !== cards[1])).size).toBe(1);
    expect(getComputedStyle(cards[1]).position).toBe("absolute");
    expect(cards.map(radius)).toEqual(Array(6).fill("4px"));
    // A value changed on the layer: on every instance, the one moved too.
    editor.set(layerOf(cards[0]), "radius", 6);
    expect(cards.map(radius)).toEqual(Array(6).fill("6px"));
    expect(keys(cards).size).toBe(2);

    editor.remove(layerOf(cards[2]));
    expect(keys(cards).size).toBe(3);
    expect(getComputedStyle(cards[2]).display).toBe("none");

    editor.undo();
    editor.undo();
    expect(keys(cards).size).toBe(2);
    editor.undo();
    expect(keys(cards).size).toBe(1);
    // Nothing is left of the move: neither of its style element nor its container's.
    expect(sheets(doc)).toHaveLength(1);
    expect(cards.map((card) => getComputedStyle(card).position)).toEqual(Array(6).fill("static"));
    expect(cards.map(radius)).toEqual(Array(6).fill("4px"));
  });

  test("an instance the page styles otherwise, with an important declaration on its style attribute, has a style element of its own, and keeps what it has", async () => {
    const { doc, editor, cards, layerOf } = await open(pageWith(true));

    editor.set(layerOf(cards[0]), "fill", RED);

    expect(keys(cards).size).toBe(2);
    expect(keys(cards.slice(0, 5)).size).toBe(1);
    expect(cards.map((card) => getComputedStyle(card).backgroundColor)).toEqual(Array(6).fill("rgb(255, 0, 0)"));
    expect(cards.map((card) => getComputedStyle(card).opacity)).toEqual([...Array(5).fill("1"), "0.5"]);
    editor.undo();
    expect(sheets(doc)).toHaveLength(0);
    expect(getComputedStyle(cards[5]).opacity).toBe("0.5");
  });

  test("instances the freezer pinned, shifted apart, each have a style element of their own, shifted as they are", async () => {
    const doc = write(`<!DOCTYPE html><body>${[0, 0, 30].map((shift) => `<nav data-ht-layer="1" data-ht-pin-offset="0 ${shift}" style="position: absolute !important; top: ${shift}px !important"></nav>`).join("")}</body>`);
    const navs = [...doc.querySelectorAll("nav")];

    declare(navs, { top: "10px" });

    expect(keys(navs).size).toBe(2);
    expect(navs.map((nav) => getComputedStyle(nav).top)).toEqual(["10px", "10px", "40px"]);
  });

  test("changed at a breakpoint and at every width, by turns, and undone, a layer's instances share one style element, its media query as the breakpoint has it", async () => {
    const { doc, editor, cards, layerOf, phone, inPhone } = await open();

    editor.at(phone);
    editor.set(layerOf(cards[0]), "radius", 20);
    editor.at(null);
    editor.set(layerOf(cards[0]), "radius", 4);
    editor.at(phone);
    editor.set(layerOf(cards[0]), "radius", 24, { continues: true, step: true });

    expect(sheets(doc)).toHaveLength(1);
    expect(sheets(doc)[0].textContent).toMatch(/@media \(width < 800px\)/);
    expect(cards.map(radius)).toEqual(Array(6).fill("4px"));
    expect(cards.map((card) => radius(inPhone(card)))).toEqual(Array(6).fill("24px"));
    editor.undo();
    editor.undo();
    expect(sheets(doc)).toHaveLength(1);
    expect(cards.map(radius)).toEqual(Array(6).fill("12px"));
    expect(cards.map((card) => radius(inPhone(card)))).toEqual(Array(6).fill("20px"));
  });

  test("one instance read as the page styles it reads the page's value; every instance still shows the edits after", async () => {
    const { editor, cards, layerOf } = await open();
    editor.set(layerOf(cards[0]), "radius", 4);

    expect(asPage(cards[2], () => radius(cards[2]))).toBe("12px");

    expect(cards.map(radius)).toEqual(Array(6).fill("4px"));
  });

  test("a layer made this round in each instance, edited, taken off and put back by undo and redo, looks as it did", async () => {
    const { doc, editor, cards, layerOf } = await open();
    const copy = editor.duplicate(layerOf(cards[0].querySelector("h3")!));
    editor.set(copy, "textColor", { color: "#FF0000", opacity: 1 });
    const copies = () => [...doc.querySelectorAll("h3 + h3")];
    expect(keys(copies()).size).toBe(1);

    editor.undo();
    editor.undo();
    expect(copies()).toHaveLength(0);
    // Meanwhile, the instances of another layer are written anew: what was taken off keeps its style element.
    declare(cards, { "outline-width": "1px" });
    editor.redo();
    editor.redo();

    expect(copies().map((el) => getComputedStyle(el).color)).toEqual(Array(6).fill("rgb(255, 0, 0)"));
    expect(keys(copies()).size).toBe(1);
  });

  test("a change taken back from a saved round, with no canvas open, leaves the instances sharing their style element as before", async () => {
    const { doc, canvas, changes, editor, cards, layerOf } = await open();
    editor.set(layerOf(cards[0]), "radius", 4);
    editor.move(layerOf(cards[1]), { parent: layerOf(doc.querySelector("main")!), x: 10, y: 300 });
    const saved = { canvas: serializeCanvas(canvas), changeSet: changes.save() };

    const reverted = write(revertSaved(saved, changes.list().find((change) => change.kind === "move")!.id)!.canvas);

    const left = [...reverted.querySelectorAll("article")];
    expect(keys(left).size).toBe(1);
    expect(left.map(radius)).toEqual(Array(6).fill("4px"));
    expect(left.map((card) => getComputedStyle(card).position)).toEqual(Array(6).fill("static"));
  });
});
