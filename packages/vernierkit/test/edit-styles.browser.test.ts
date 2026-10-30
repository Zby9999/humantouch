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
const chain = (levels: object[]) => `data-vk-chain='${JSON.stringify(levels)}'`;

/** A loop of six Cards, a title in each; with `lifted`, the last one has an important opacity of the page's own on its style attribute. */
const pageWith = (lifted: boolean) => `<!DOCTYPE html>
<body style="margin: 0">
  <main data-vk-loc="src/App.tsx:4:5" ${chain(APP)} style="display: grid; grid-template-columns: repeat(3, 120px); gap: 8px">
    ${[1, 2, 3, 4, 5, 6]
      .map(
        (n) => `<article data-vk-loc="src/Card.tsx:3:5" ${chain(LOOP)} style="height: 60px; background-color: rgb(255, 255, 255); border-radius: 12px${lifted && n === 6 ? "; opacity: 0.5 !important" : ""}">
          <h3 data-vk-loc="src/Card.tsx:4:7" ${chain(LOOP)} style="margin: 0">Card ${n}</h3>
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

const sheets = (doc: Document) => [...doc.querySelectorAll("style[data-vk-rules]")];
const keys = (els: Element[]) => new Set(els.map((el) => el.getAttribute("data-vk-style")));
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
});
