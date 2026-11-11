import { afterEach, describe, expect, test, vi } from "vitest";
import { commands } from "vitest/browser";
import { createChangeSet, type PutBack, type SavedChangeSet } from "../src/client/changeset";
import type { Destination } from "../src/client/edit-commands";
import { createEditor } from "../src/client/edits";
import { restore, serializeCanvas, type Canvas } from "../src/client/freezer";
import type { Layer } from "../src/client/layers";
import { createOffCanvas, type OffCanvasLayer } from "../src/client/off-canvas";
import type { Fill } from "../src/client/property-table";
import { revertSaved } from "../src/client/saved-round";
import { createHistory } from "../src/client/undo-steps";
import { createViews, type Views } from "../src/client/views";
import type { SavedOffCanvasLayer } from "../src/service-protocol";

/**
 * A round saved before the instances of a layer shared their edit styles
 * (ticket 60): `fixtures/round-before-60/`, written once by the code of then,
 * when `VITE_TK_WRITE_FIXTURE` is set, and kept since. A round saved then
 * opens as it was, edits go on and are undone, and the same edits made now
 * record the same ChangeSet, and look the same, as they did then.
 */

const FIXTURE = "./test/fixtures/round-before-60/";

const APP = [{ component: "App", usage: null, thirdParty: false }];
const cardAt = (usage: string) => [{ component: "Card", usage, thirdParty: false }, ...APP];
const buttonIn = (usage: string) => [{ component: "Button", usage: "src/Card.tsx:5:7", thirdParty: false }, ...cardAt(usage)];
const HEADER_BUTTON = [{ component: "Button", usage: "src/App.tsx:3:7", thirdParty: false }, ...APP];
const CHIP = [{ component: "Chip", usage: "src/App.tsx:11:9", thirdParty: false }, ...APP];
const TAG = [{ component: "Tag", usage: "src/App.tsx:15:9", thirdParty: false }, ...APP];
const chain = (levels: object[]) => `data-tk-chain='${JSON.stringify(levels)}'`;

const card = (usage: string, title: string, style = "") => `
    <article data-tk-loc="src/Card.tsx:3:5" ${chain(cardAt(usage))} style="height: 80px; background-color: rgb(255, 255, 255); border-radius: 12px; padding: 4px;${style}">
      <h3 data-tk-loc="src/Card.tsx:4:7" ${chain(cardAt(usage))} style="margin: 0">${title}</h3>
      <button data-tk-loc="src/Button.tsx:2:3" ${chain(buttonIn(usage))} style="background-color: rgb(200, 200, 200)">Open</button>
    </article>`;

/**
 * A Button in the header; four Cards from one usage (a loop), the first with
 * an important opacity of the page's own on its style attribute, and one
 * from another, each with a Button in it; a shelf of three chips (a loop),
 * and a box of two tags (a loop).
 */
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <main data-tk-loc="src/App.tsx:2:5" ${chain(APP)} style="display: grid; grid-template-columns: repeat(3, 150px); gap: 8px">
    <button data-tk-loc="src/Button.tsx:2:3" ${chain(HEADER_BUTTON)} style="background-color: rgb(200, 200, 200)">Menu</button>
    ${card("src/App.tsx:6:9", "Card 1", " opacity: 0.9 !important")}
    ${[2, 3, 4].map((n) => card("src/App.tsx:6:9", `Card ${n}`)).join("")}
    ${card("src/App.tsx:8:7", "Your turn")}
  </main>
  <aside data-tk-loc="src/App.tsx:10:5" ${chain(APP)} style="display: flex; gap: 4px">
    ${[1, 2, 3].map((n) => `<span data-tk-loc="src/Chip.tsx:2:3" ${chain(CHIP)} style="padding: 2px; background-color: rgb(230, 230, 230)">Chip ${n}</span>`).join("")}
  </aside>
  <section data-tk-loc="src/App.tsx:14:5" ${chain(APP)}>
    ${[1, 2].map((n) => `<em data-tk-loc="src/Tag.tsx:2:3" ${chain(TAG)} style="display: inline-block; background-color: rgb(240, 240, 240)">Tag ${n}</em>`).join("")}
  </section>
</body>`;

/** The widths of the views: the desktop view, then two beside it. */
const WIDTHS = [800, 600, 390] as const;
/** What is compared of each element, in each view. */
const PROPERTIES = [
  "display",
  "position",
  "left",
  "top",
  "width",
  "height",
  "background-color",
  "border-top-left-radius",
  "opacity",
  "padding-top",
  "row-gap",
  "column-gap",
  "color",
];

const RED: Fill = { type: "solid", color: "#FF0000", opacity: 1 };
const BLUE: Fill = { type: "solid", color: "#0000FF", opacity: 1 };
const GREEN: Fill = { type: "solid", color: "#00FF00", opacity: 1 };

/** What the fixture holds. */
interface Fixture {
  canvas: string;
  changeSet: SavedChangeSet;
  offCanvas: SavedOffCanvasLayer[];
  /** Each view, by width: every element of the body, in page order, with its `PROPERTIES`. */
  styles: Record<string, string[][]>;
  /** The saved canvas, each change taken back out of it with no canvas open, as shown 800 px wide. */
  reverted: Record<string, string[][] | null>;
  /** The edit style elements on the saved canvas. */
  sheets: number;
}

const made: HTMLElement[] = [];
afterEach(() => {
  for (const el of made.splice(0)) el.remove();
  vi.restoreAllMocks();
});

function iframe(width: number): HTMLIFrameElement {
  const el = document.createElement("iframe");
  el.style.width = `${width}px`;
  el.style.height = "600px";
  document.body.append(el);
  made.push(el);
  return el;
}

/** The ids of layers moved off the canvas, one after the other, as each is made: the same each time. */
function countedIds() {
  let n = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`);
}

/** Each element of the body, in page order, with its `PROPERTIES`. */
function stylesOf(doc: Document): string[][] {
  return [...doc.body.querySelectorAll("*")].map((el) => {
    const style = getComputedStyle(el);
    return [el.localName, ...PROPERTIES.map((name) => style.getPropertyValue(name))];
  });
}

/** `canvas` shown in each of `WIDTHS`, edited, with the layers off it sharing its history. */
async function open(canvas: Canvas, saved?: { changeSet: SavedChangeSet; offCanvas: SavedOffCanvasLayer[] }) {
  const doc = canvas.document;
  const history = createHistory();
  const views = createViews(canvas);
  for (const width of WIDTHS.slice(1)) await views.add(iframe(width), width);
  const changes = createChangeSet(saved?.changeSet);
  const editor = createEditor(views, changes, null, { history });
  const host = document.createElement("div");
  document.body.append(host);
  made.push(host);
  const offCanvas = createOffCanvas(host, saved?.offCanvas ?? [], history);
  const layerOf = (el: Element) => editor.tree().layerOf(el)!;
  /** Every view, by width, as it shows the canvas now. */
  const styles = (): Record<string, string[][]> => {
    // Read now, though the views beside would hold a value back till the next frame.
    for (const view of views.list().slice(1)) views.sync(view);
    return Object.fromEntries(views.list().map((view) => [String(view.width), stylesOf(view.document)]));
  };
  /** Puts a layer off the canvas back at `to`, as the designer lets it go over a view. */
  const putBack = (outside: OffCanvasLayer, to: Destination) =>
    editor.batch(() => {
      editor.putBack({ el: outside.layer()!.el, kept: outside.keep() }, to);
      editor.along(
        () => offCanvas.take(outside),
        () => offCanvas.put(outside),
      );
    });
  /** The layer of what `selector` finds in a layer off the canvas. */
  const insideOf = (outside: OffCanvasLayer, selector: string): Layer => outside.editor.tree().layerOf(outside.document.querySelector(selector)!)!;
  return { doc, views, changes, editor, offCanvas, layerOf, styles, history, putBack, insideOf };
}

/** The page as a canvas, 800 px wide, as frozen. */
function freshCanvas(): Canvas {
  const doc = iframe(800).contentDocument!;
  doc.open();
  doc.write(PAGE);
  doc.close();
  return { document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 };
}

/**
 * The round of the fixture, made on the page: edits to the loop of Cards at
 * every width and at the breakpoints of the views beside, one of its
 * instances moved alone and one deleted alone, a title duplicated in each, a
 * Button's fill promoted to its component, the shelf moved off the canvas,
 * its chips edited there, and put back, and the tags' box moved off the
 * canvas and edited there.
 */
async function makeRound() {
  countedIds();
  const canvas = freshCanvas();
  const opened = await open(canvas);
  const { doc, views, editor, offCanvas, layerOf, putBack, insideOf } = opened;
  const [, phone] = [views.list()[1], views.list()[2]];
  const tablet = views.list()[1];
  const cards = [...doc.querySelectorAll("article")];
  const main = doc.querySelector("main")!;

  const moveOff = (el: Element) => {
    const layer = layerOf(el);
    const outside = offCanvas.moveOut(el, { x: -400, y: 0 }, { ...editor.originOf(layer), at: "2026-10-29T00:00:00.000Z" });
    editor.batch(() => {
      editor.remove(layer, { offCanvas: outside.id });
      editor.along(
        () => offCanvas.put(outside),
        () => offCanvas.take(outside),
      );
    });
    return outside;
  };

  const loop = () => layerOf(cards[1]);
  editor.set(loop(), "fill", RED);
  editor.set(loop(), "radius", 4);
  editor.at(phone);
  editor.set(loop(), "radius", 20);
  editor.set(loop(), "opacity", 0.8);
  editor.at(tablet);
  editor.set(loop(), "fill", BLUE);
  editor.at(null);
  editor.set(layerOf(main), "radius", 6);
  editor.move(layerOf(cards[2]), { parent: layerOf(main), x: 10, y: 400 });
  editor.remove(layerOf(cards[3]));
  editor.duplicate(layerOf(cards[0].querySelector("h3")!));
  const button = () => layerOf(cards[0].querySelector("button")!);
  editor.set(button(), "fill", GREEN);
  editor.promote(button());
  const shelf = moveOff(doc.querySelector("aside")!);
  shelf.editor.set(insideOf(shelf, "span"), "fill", RED);
  putBack(shelf, { parent: layerOf(main), index: 1 });
  const box = moveOff(doc.querySelector("section")!);
  box.editor.set(insideOf(box, "em"), "radius", 6);

  return { ...opened, canvas };
}

/** Each change of the saved round taken back out of it, with no canvas open: as each saved canvas left shows 800 px wide; null when no change is left. */
function revertedOf(saved: { canvas: string; changeSet: SavedChangeSet }): Record<string, string[][] | null> {
  return Object.fromEntries(
    saved.changeSet.changes.map((change) => {
      const left = revertSaved(saved, change.id);
      if (!left) return [String(change.id), null];
      const doc = iframe(800).contentDocument!;
      doc.open();
      doc.write(left.canvas);
      doc.close();
      return [String(change.id), stylesOf(doc)];
    }),
  );
}

const editSheets = (doc: Document) => doc.querySelectorAll("style[data-tk-rules]").length;

async function readFixture(): Promise<Fixture> {
  const read = async (file: string) => commands.readFile(`${FIXTURE}${file}`);
  return {
    canvas: await read("canvas.html"),
    changeSet: JSON.parse(await read("changeset.json")),
    offCanvas: JSON.parse(await read("off-canvas.json")),
    ...JSON.parse(await read("looks.json")),
  };
}

describe.runIf((import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_TK_WRITE_FIXTURE)("the fixture", () => {
  test("is written by the code of now", async () => {
    // Written once, by the code of then (before ticket 60): never over the one kept.
    const kept = await commands.readFile(`${FIXTURE}canvas.html`).then(
      () => true,
      () => false,
    );
    if (kept) throw new Error(`Human Touch: the fixture in ${FIXTURE} is kept as the code of then wrote it`);
    const { canvas, changes, offCanvas, styles } = await makeRound();
    const saved = { canvas: serializeCanvas(canvas), changeSet: changes.save() };
    const looks = { styles: styles(), reverted: revertedOf(saved), sheets: editSheets(canvas.document) };
    await commands.writeFile(`${FIXTURE}canvas.html`, saved.canvas);
    await commands.writeFile(`${FIXTURE}changeset.json`, `${JSON.stringify(saved.changeSet, null, 2)}\n`);
    await commands.writeFile(`${FIXTURE}off-canvas.json`, `${JSON.stringify(offCanvas.save(), null, 2)}\n`);
    await commands.writeFile(`${FIXTURE}looks.json`, `${JSON.stringify(looks)}\n`);
  });
});

describe("a round saved before the instances of a layer shared their edit styles", () => {
  /** The fixture's canvas put back, as edit mode does after a reload, shown in every view, with its ChangeSet and the layers off it. */
  const reopen = async (fixture: Fixture, html = fixture.canvas) => {
    const canvas = await restore(html, iframe(800));
    return { ...(await open(canvas, fixture)), canvas };
  };
  /** The loop of Cards, by an instance of it neither moved nor deleted alone. */
  const loopOf = (doc: Document) => doc.querySelector('article[data-tk-layer="1"]:not([data-tk-move]):not([data-tk-deleted])')!;

  test("opens as it was, in every view, its ChangeSet and the layers off the canvas as they were; edits go on, are undone, and saved again open as they were", async () => {
    const fixture = await readFixture();
    const { doc, canvas, changes, editor, offCanvas, layerOf, styles } = await reopen(fixture);

    expect(styles()).toEqual(fixture.styles);
    expect(JSON.stringify(changes.save())).toBe(JSON.stringify(fixture.changeSet));
    expect(JSON.stringify(offCanvas.save())).toBe(JSON.stringify(fixture.offCanvas));
    // The Cards of the loop neither moved nor deleted alone, the one the page gives an opacity of its own aside, share one style element now.
    const alike = [...doc.querySelectorAll('article[data-tk-layer="1"]:not([data-tk-move]):not([data-tk-deleted])')].slice(1);
    expect(alike.length).toBeGreaterThan(0);
    expect(new Set(alike.map((card) => card.getAttribute("data-tk-style"))).size).toBe(1);
    expect(editSheets(doc)).toBeLessThan(fixture.sheets);

    // A value stepped on the loop changes the style elements of its instances' groups alone: the one the page gives an opacity, the one moved alone and the others (the one deleted is no layer).
    const changed = new Set<Node>();
    const observer = new MutationObserver((records) => records.forEach((record) => changed.add(record.target)));
    observer.observe(doc.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
    editor.set(layerOf(loopOf(doc)), "radius", 29, { step: true });
    await Promise.resolve();
    observer.disconnect();
    expect([...changed].every((node) => (node as Element).localName === "style")).toBe(true);
    expect(changed.size).toBe(3);

    editor.set(layerOf(loopOf(doc)), "radius", 30);
    const radii = (el: Element) => getComputedStyle(el).borderTopLeftRadius;
    // Every instance at every width, the one moved alone too; the one deleted alone is not shown.
    expect([...doc.querySelectorAll('article[data-tk-layer="1"]:not([data-tk-deleted])')].map(radii)).toEqual(["30px", "30px", "30px"]);
    expect(changes.list().find((change) => change.property === "radius" && change.layer === "1" && !change.breakpoint)).toMatchObject({ before: 12, after: 30 });
    editor.undo();
    editor.undo();
    expect(styles()).toEqual(fixture.styles);
    expect(JSON.stringify(changes.save())).toBe(JSON.stringify(fixture.changeSet));
    editor.redo();
    editor.redo();

    const again = await reopen(fixture, serializeCanvas(canvas));
    expect(again.styles()["800"]).toEqual(styles()["800"]);
    again.editor.set(again.layerOf(loopOf(again.doc)), "radius", 4);
    expect(again.styles()).toEqual(fixture.styles);
  });

  test("a layer kept off the canvas as it was then is edited there and put back: each element of its look keeps a style element of its own, as the Agent read it then", async () => {
    const fixture = await readFixture();
    const { doc, changes, offCanvas, layerOf, putBack, insideOf } = await reopen(fixture);
    const [box] = offCanvas.list();
    box.editor.set(insideOf(box, "em"), "radius", 8);
    box.editor.set(insideOf(box, "section"), "fill", RED);

    putBack(box, { parent: layerOf(doc.querySelector("main")!), index: 0 });

    const { look } = (changes.list().at(-1)!.after as PutBack).layer;
    const looked = new DOMParser().parseFromString(look, "text/html");
    const tags = [...looked.querySelectorAll("em")];
    expect(tags.map((tag) => tag.getAttribute("data-tk-style"))).toEqual(["1", "2"]);
    expect([...looked.querySelectorAll("style[data-tk-rules-for]")].map((sheet) => sheet.getAttribute("data-tk-rules-for"))).toEqual(["1", "2", "3"]);
    expect([...doc.querySelectorAll("main em")].map((tag) => getComputedStyle(tag).borderTopLeftRadius)).toEqual(["8px", "8px"]);
  });

  test("the same edits, made now, record the same ChangeSet and keep the same layers off the canvas, word for word, and look the same in every view", async () => {
    const fixture = await readFixture();
    const { changes, offCanvas, styles } = await makeRound();

    // Since ticket 64, a layer placed by its X and Y records besides the margins the canvas draws it past them by: all else as then.
    const saved = changes.save();
    const placed = saved.changes.filter((change) => change.margins);
    expect(placed.map((change) => [change.kind, change.margins])).toEqual([["move", { x: 0, y: 0 }]]);
    for (const change of placed) delete change.margins;
    // Since ticket 65, a change to one of a loop's instances alone records which of them it is.
    const items = saved.changes.filter((change) => change.instance);
    expect(items.every((change) => change.data)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    for (const change of items) delete change.instance;
    expect(JSON.stringify(saved, null, 2)).toBe(JSON.stringify(fixture.changeSet, null, 2));
    expect(JSON.stringify(offCanvas.save(), null, 2)).toBe(JSON.stringify(fixture.offCanvas, null, 2));
    expect(styles()).toEqual(fixture.styles);
  });

  test("each change taken back out of it with no canvas open leaves it as it did then", async () => {
    const fixture = await readFixture();
    expect(revertedOf(fixture)).toEqual(fixture.reverted);
  });
});
