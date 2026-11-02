import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet, type Change } from "../src/client/changeset";
import { checkChange } from "../src/client/check";
import { watchPage } from "../src/client/page-checks";
import type { CheckReport } from "../src/service-protocol";
import { createEditor } from "../src/client/edits";
import type { Fill } from "../src/client/property-table";
import { serializeCanvas } from "../src/client/freezer";
import { revertSaved } from "../src/client/saved-round";
import type { Layer } from "../src/client/layers";
import { createViews } from "../src/client/views";
import { placedOnCanvas } from "../src/client/moves";
import { keptOf, notedFor, notedFrom, noteRound, type OtherUsagesNoted } from "../src/client/other-usages";

/** A round as the page checks it, placed on its canvas: with no new layer, no canvas to read. */
const onCanvas = (round: Change[]) => placedOnCanvas(round, "");

/**
 * Promote (ticket 20): a layer's changes for its usage alone made changes to
 * its component itself, the nearest one on its usage chain, which every usage
 * of that component shows at once.
 */

const APP = [{ component: "App", usage: null, thirdParty: false }];
const cardAt = (usage: string) => [{ component: "Card", usage, thirdParty: false }, ...APP];
/** A Button, used inside the Card at `src/Card.tsx:5:7`, in the Card used at `usage`. */
const buttonIn = (usage: string) => [{ component: "Button", usage: "src/Card.tsx:5:7", thirdParty: false }, ...cardAt(usage)];
const HEADER_BUTTON = [{ component: "Button", usage: "src/App.tsx:3:7", thirdParty: false }, ...APP];
/** A badge a dependency draws, used in the Card used at `src/App.tsx:8:7`: a locked layer. */
const BADGE = [{ component: "Badge", usage: "src/Card.tsx:6:7", thirdParty: true }, ...cardAt("src/App.tsx:8:7")];
const chain = (levels: object[]) => `data-tk-chain='${JSON.stringify(levels)}'`;

const card = (usage: string, title: string) => `
  <article data-tk-loc="src/Card.tsx:3:5" ${chain(cardAt(usage))} style="height: 80px; background-color: rgb(255, 255, 255); padding: 4px">
    <h3 data-tk-loc="src/Card.tsx:4:7" ${chain(cardAt(usage))} style="margin: 0; color: rgb(0, 0, 0)">${title}</h3>
    <button data-tk-loc="src/Button.tsx:2:3" ${chain(buttonIn(usage))} style="background-color: rgb(200, 200, 200)">Open</button>
  </article>`;

/**
 * A fixed canvas: a Button in the header, three Cards from one usage (a
 * loop), one Card from another, each Card with a Button in it; a heading
 * the App writes itself, and a box with no source marker.
 */
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <main data-tk-loc="src/App.tsx:2:5" ${chain(APP)} style="display: grid; grid-template-columns: repeat(4, 150px); gap: 8px">
    <button data-tk-loc="src/Button.tsx:2:3" ${chain(HEADER_BUTTON)} style="background-color: rgb(200, 200, 200)">Menu</button>
    <h1 data-tk-loc="src/App.tsx:4:7" ${chain(APP)} style="margin: 0">Title</h1>
    ${[1, 2, 3].map((n) => card("src/App.tsx:6:9", `Card ${n}`)).join("")}
    ${card("src/App.tsx:8:7", "Your turn")}
  </main>
  <div id="unmarked" style="height: 40px; background-color: rgb(0, 0, 0)"></div>
  <span id="badge" ${chain(BADGE)} style="display: block; width: 40px; height: 20px"><b ${chain(BADGE)}>Beta</b></span>
</body>`;

let iframe: HTMLIFrameElement | undefined;
let phoneFrame: HTMLIFrameElement | undefined;
let savedFrame: HTMLIFrameElement | undefined;
let live: HTMLIFrameElement | undefined;
afterEach(() => {
  live?.remove();
  iframe?.remove();
  phoneFrame?.remove();
  savedFrame?.remove();
});

/** A saved canvas, shown 800 px wide, as it looks. */
function showSaved(html: string): Document {
  savedFrame = document.createElement("iframe");
  savedFrame.style.width = "800px";
  document.body.append(savedFrame);
  const doc = savedFrame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  return doc;
}

function openCanvas(page = PAGE) {
  iframe = document.createElement("iframe");
  iframe.style.width = "800px";
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(page);
  doc.close();
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const changes = createChangeSet();
  const editor = createEditor(views, changes);
  const cards = [...doc.querySelectorAll("article")];
  const buttons = [...doc.querySelectorAll("button")];
  /** The layer an element is, as the layers are now. */
  const layerOf = (el: Element) => find(editor.tree().root, (layer) => layer.el === el && !layer.text)!;
  return { doc, views, changes, editor, cards, buttons, layerOf };
}

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | undefined {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
}

const RED: Fill = { type: "solid", color: "#FF0000", opacity: 1 };
const background = (el: Element) => getComputedStyle(el).backgroundColor;

describe("promote", () => {
  test("a Button, a box of text, promotes its own changes, its text the text's: each from the layer they are of", () => {
    const { editor, changes, buttons, layerOf } = openCanvas();
    const button = layerOf(buttons[1]);
    const [text] = button.children;
    editor.set(text, "fontSize", 20);
    editor.set(button, "fill", RED);

    expect([editor.canPromote(text), editor.canPromote(button)]).toEqual([true, true]);
    const { promoted, stays } = editor.promote(text);

    expect(promoted.map((change) => change.property)).toEqual(["fontSize"]);
    expect(stays).toEqual([]);
    // Every Button the Button component writes, in the header too.
    expect(buttons.map((el) => getComputedStyle(el).fontSize)).toEqual(Array(5).fill("20px"));
    expect(buttons.map(background)).toEqual(["rgb(200, 200, 200)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(200, 200, 200)"]);
    expect(editor.canPromote(layerOf(buttons[1]).children[0])).toBe(false);

    editor.promote(layerOf(buttons[1]));
    expect(buttons.map(background)).toEqual(Array(5).fill("rgb(255, 0, 0)"));
    expect(changes.list().map((change) => [change.property, change.scope])).toEqual([
      ["fontSize", "component"],
      ["fill", "component"],
    ]);
  });

  test("its text given an element of its own, a Button promotes none of the changes made to the text before", () => {
    const { editor, changes, buttons, layerOf } = openCanvas();
    const box = () => layerOf(buttons[1]);
    editor.set(box().children[0], "fontSize", 20);
    editor.setBrief(box().children[0], "Make it bold");

    // The text's change is no change of the Button's.
    expect(editor.canPromote(box())).toBe(false);
    editor.set(box(), "fill", RED);
    const { promoted, stays } = editor.promote(box());

    expect([promoted.map((change) => change.property), stays]).toEqual([["fill"], []]);
    expect(changes.list().find((change) => change.property === "fontSize")!.scope).toBe("usage");
    expect(buttons.map((el) => getComputedStyle(el).fontSize)).toEqual(["13.3333px", "20px", "20px", "20px", "13.3333px"]);
  });

  test("a fill changed on one usage of the Card shows on every usage of it once promoted, and the change is to the Card itself", () => {
    const { editor, changes, cards, layerOf } = openCanvas();

    editor.set(layerOf(cards[0]), "fill", RED);
    expect(cards.map(background)).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 255, 255)"]);
    expect(editor.canPromote(layerOf(cards[0]))).toBe(true);

    editor.promote(layerOf(cards[0]));

    expect(cards.map(background)).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)"]);
    expect(changes.list()).toHaveLength(1);
    expect(changes.list()[0]).toMatchObject({
      id: 1,
      kind: "style",
      scope: "component",
      property: "fill",
      before: { type: "solid", color: "#FFFFFF", opacity: 1 },
      after: RED,
      target: { loc: "src/Card.tsx:3:5", component: "Card", instances: 4 },
    });
    // Nothing left to promote.
    expect(editor.canPromote(layerOf(cards[0]))).toBe(false);
  });

  test("promoting is one step: undone, the change is for its usage again and the other usage as it was; redone, for the Card again", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[3]), "fill", RED);
    editor.promote(layerOf(cards[3]));

    editor.undo();
    expect(cards.map(background)).toEqual(["rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgb(255, 0, 0)"]);
    expect(changes.list()).toMatchObject([{ id: 1, scope: "usage", target: { instances: 1 } }]);
    expect(editor.canPromote(layerOf(cards[3]))).toBe(true);

    editor.redo();
    expect(cards.map(background)).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)"]);
    expect(changes.list()).toMatchObject([{ id: 1, scope: "component" }]);

    // Undoing the fill itself, before it was promoted, leaves every Card as the page has it.
    editor.undo();
    editor.undo();
    expect(cards.map(background)).toEqual(["rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgb(255, 255, 255)"]);
    expect(changes.list()).toEqual([]);
  });

  test("edited again once promoted, the layer starts from its usage again: a new change, from the promoted value, which only its usage shows and can be promoted in turn", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", RED);
    editor.promote(layerOf(cards[0]));

    const blue: Fill = { type: "solid", color: "#0000FF", opacity: 1 };
    editor.set(layerOf(cards[0]), "fill", blue);

    expect(cards.map(background)).toEqual(["rgb(0, 0, 255)", "rgb(0, 0, 255)", "rgb(0, 0, 255)", "rgb(255, 0, 0)"]);
    expect(changes.list()).toMatchObject([
      { id: 1, scope: "component", before: { color: "#FFFFFF" }, after: RED },
      { id: 2, scope: "usage", before: RED, after: blue, target: { instances: 3 } },
    ]);
    expect(editor.canPromote(layerOf(cards[0]))).toBe(true);

    // Back to the Card's own value: no change of the usage's is left, and the Card's shows.
    editor.set(layerOf(cards[0]), "fill", RED);
    expect(changes.list()).toMatchObject([{ id: 1, scope: "component" }]);
    expect(cards.map(background)).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)"]);

    // Promoted again, from the other usage: still the Card's one change to its fill, from where it started.
    editor.set(layerOf(cards[3]), "fill", blue);
    editor.promote(layerOf(cards[3]));
    expect(changes.list()).toMatchObject([{ id: 1, scope: "component", before: { color: "#FFFFFF" }, after: blue }]);
    expect(cards.map(background)).toEqual(["rgb(0, 0, 255)", "rgb(0, 0, 255)", "rgb(0, 0, 255)", "rgb(0, 0, 255)"]);
  });

  test("in nested components, a change promotes to the nearest one: a Button in a Card to the Button, in the header too; a heading the Card writes to the Card", () => {
    const { doc, editor, changes, buttons, layerOf } = openCanvas();
    const inCard = buttons[1];
    const opacity = (el: Element) => getComputedStyle(el).opacity;
    editor.set(layerOf(inCard), "opacity", 0.5);
    expect(buttons.map(opacity)).toEqual(["1", "0.5", "0.5", "0.5", "1"]);

    editor.promote(layerOf(inCard));
    expect(buttons.map(opacity)).toEqual(Array(5).fill("0.5"));
    expect(changes.list()[0]).toMatchObject({ scope: "component", target: { loc: "src/Button.tsx:2:3", component: "Button", instances: 5 } });

    const headings = [...doc.querySelectorAll("h3")];
    editor.set(layerOf(headings[3]), "opacity", 0.5);
    editor.promote(layerOf(headings[3]));
    expect(headings.map(opacity)).toEqual(Array(4).fill("0.5"));
    expect(changes.list()[1]).toMatchObject({ scope: "component", target: { loc: "src/Card.tsx:4:7", component: "Card", instances: 4 } });
  });

  test("changes at a breakpoint are promoted with those at every width, each keeping its breakpoint, shown on every usage in every view", async () => {
    const { editor, changes, cards, views, layerOf } = openCanvas();
    phoneFrame = document.createElement("iframe");
    document.body.append(phoneFrame);
    const phone = await views.add(phoneFrame, 390);
    editor.set(layerOf(cards[0]), "fill", RED);
    editor.at(phone);
    editor.set(layerOf(cards[0]), "opacity", 0.5);
    editor.at(null);

    editor.promote(layerOf(cards[0]));

    expect(changes.list()).toMatchObject([
      { scope: "component", property: "fill" },
      { scope: "component", property: "opacity", breakpoint: { min: null, max: 800 } },
    ]);
    const inPhone = (el: Element) => phone.elementOf(el)!;
    expect(cards.map((el) => getComputedStyle(el).opacity)).toEqual(["1", "1", "1", "1"]);
    expect(cards.map((el) => getComputedStyle(inPhone(el)).opacity)).toEqual(["0.5", "0.5", "0.5", "0.5"]);
    expect(cards.map((el) => background(inPhone(el)))).toEqual(Array(4).fill("rgb(255, 0, 0)"));
  });

  test("changes to the structure and to data stay with the usage; a layer with only those has nothing to promote", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();
    const headings = [...doc.querySelectorAll("h3")];
    editor.setText(layerOf(headings[3]), "Mine");
    expect(editor.canPromote(layerOf(headings[3]))).toBe(false);

    editor.set(layerOf(headings[3]), "opacity", 0.5);
    editor.promote(layerOf(headings[3]));
    expect(changes.list()).toMatchObject([
      { kind: "text", scope: "usage" },
      { kind: "style", scope: "component", property: "opacity" },
    ]);
    expect(headings.map((el) => el.textContent)).toEqual(["Card 1", "Card 2", "Card 3", "Mine"]);
    expect(editor.canPromote(layerOf(cards[0]))).toBe(false);
  });

  test("a layer its own component writes outside any other, a locked layer, or one with no source marker, has no component to promote to", () => {
    const { doc, editor, layerOf } = openCanvas();
    const title = layerOf(doc.querySelector("h1")!);
    editor.set(title, "opacity", 0.5);
    expect(editor.canPromote(title)).toBe(false);
    const badge = layerOf(doc.querySelector("#badge")!);
    expect(badge.kind).toBe("locked");
    editor.set(badge, "width", { type: "fixed", value: 60 });
    expect(editor.canPromote(badge)).toBe(false);
    const unmarked = layerOf(doc.querySelector("#unmarked")!);
    editor.set(unmarked, "opacity", 0.5);
    expect(editor.canPromote(unmarked)).toBe(false);
  });

  test("a brief is promoted with the styles: marked on every usage of the Card, until a usage writes its own, which takes its place there", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.setBrief(layerOf(cards[0]), "Lift on hover");
    expect(editor.canPromote(layerOf(cards[0]))).toBe(true);
    editor.promote(layerOf(cards[0]));

    expect(cards.map((el) => el.getAttribute("data-tk-brief"))).toEqual(Array(4).fill("Lift on hover"));
    expect(changes.list()).toMatchObject([{ kind: "brief", scope: "component", before: null, after: "Lift on hover" }]);
    expect(editor.brief(layerOf(cards[3]))).toBe("Lift on hover");

    // Written anew on one usage: its own, in place of the Card's, there only.
    editor.setBrief(layerOf(cards[3]), "Lift higher");
    expect(cards.map((el) => el.getAttribute("data-tk-brief"))).toEqual(["Lift on hover", "Lift on hover", "Lift on hover", "Lift higher"]);
    expect(changes.list()[1]).toMatchObject({ kind: "brief", scope: "usage", before: "Lift on hover", after: "Lift higher" });
    // Taken back: the Card's again.
    editor.undo();
    expect(cards.map((el) => el.getAttribute("data-tk-brief"))).toEqual(Array(4).fill("Lift on hover"));

    editor.undo();
    expect(cards.map((el) => el.getAttribute("data-tk-brief"))).toEqual(["Lift on hover", "Lift on hover", "Lift on hover", null]);
    expect(changes.list()).toMatchObject([{ kind: "brief", scope: "usage" }]);
  });

  test("a change to the Card taken back out from the change list leaves every usage as the page has it, and its usages' own changes on", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", RED);
    editor.promote(layerOf(cards[0]));
    const blue: Fill = { type: "solid", color: "#0000FF", opacity: 1 };
    editor.set(layerOf(cards[3]), "fill", blue);

    expect(editor.revert(1)).not.toBeNull();
    expect(cards.map(background)).toEqual(["rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgb(0, 0, 255)"]);
    expect(changes.list()).toMatchObject([{ id: 2, scope: "usage" }]);
    editor.undo();
    expect(cards.map(background)).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(0, 0, 255)"]);
  });

  test("taken back out of a saved round with no canvas open, a change to the Card leaves every usage as the page has it, and its usages' own changes and briefs on", () => {
    const { doc, editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", RED);
    editor.setBrief(layerOf(cards[0]), "Lift on hover");
    editor.promote(layerOf(cards[0]));
    editor.setBrief(layerOf(cards[3]), "Lift higher");
    const [fill, brief] = changes.list();
    const saved = { canvas: serializeCanvas({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), changeSet: changes.save() };

    const once = revertSaved(saved, fill.id)!;
    let shown = [...showSaved(once.canvas).querySelectorAll("article")];
    expect(shown.map(background)).toEqual(Array(4).fill("rgb(255, 255, 255)"));
    expect(shown.map((el) => el.getAttribute("data-tk-brief"))).toEqual(["Lift on hover", "Lift on hover", "Lift on hover", "Lift higher"]);

    const twice = revertSaved(once, brief.id)!;
    shown = [...showSaved(twice.canvas).querySelectorAll("article")];
    expect(shown.map((el) => el.getAttribute("data-tk-brief"))).toEqual([null, null, null, "Lift higher"]);
    expect(twice.changeSet.changes).toMatchObject([{ kind: "brief", scope: "usage" }]);
  });

  test("done checks a change to the Card on every usage of it, but one that has its own value of the property, which it shows in place of the Card's", async () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", RED);
    editor.promote(layerOf(cards[0]));
    const blue: Fill = { type: "solid", color: "#0000FF", opacity: 1 };
    editor.set(layerOf(cards[3]), "fill", blue);

    // The live page, as the Agent writes both: red in the Card, blue at the usage at src/App.tsx:8:7. React tells each Card's usage.
    live = document.createElement("iframe");
    document.body.append(live);
    const page = live.contentDocument!;
    page.open();
    page.write(PAGE);
    page.close();
    function App() {}
    function Card() {}
    const app = { type: App, memoizedProps: {}, _debugOwner: null };
    const liveCards = [...page.querySelectorAll("article")];
    liveCards.forEach((el, i) => {
      const usage = i < 3 ? "src/App.tsx:6:9" : "src/App.tsx:8:7";
      Object.assign(el, { __reactFiber$promote: { _debugOwner: { type: Card, memoizedProps: { "data-tk-usage": usage }, _debugOwner: app } } });
      (el as HTMLElement).style.backgroundColor = i < 3 ? "rgb(255, 0, 0)" : "rgb(0, 0, 255)";
    });

    const [card, usage] = changes.list();
    expect(checkChange(page, card, onCanvas(changes.list()))).toEqual({ outcome: "shown" });
    expect(checkChange(page, usage, onCanvas(changes.list()))).toEqual({ outcome: "shown" });
  });

  test("a brief a usage wrote in place of the Card's, promoted once the Card's is taken back out, is the Card's brief from none", () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.setBrief(layerOf(cards[0]), "Lift on hover");
    editor.promote(layerOf(cards[0]));
    editor.setBrief(layerOf(cards[3]), "Lift higher");
    editor.revert(1);
    expect(cards.map((el) => el.getAttribute("data-tk-brief"))).toEqual([null, null, null, "Lift higher"]);

    editor.promote(layerOf(cards[3]));

    expect(changes.list()).toMatchObject([{ kind: "brief", scope: "component", before: null, after: "Lift higher" }]);
    expect(cards.map((el) => el.getAttribute("data-tk-brief"))).toEqual(Array(4).fill("Lift higher"));
  });
});

/**
 * Ticket 77: a change for one usage of the Card alone, which the Agent may
 * write into the Card itself, so its other usage changes with it. The page
 * notes, as it begins to check the claimed round, what the Card's other
 * usages show of the change's property, and looks again as the code changes:
 * changed there, the change is not shown, and the page says where and from
 * what to what. Those usages the round changes the property of itself, or
 * the Card itself, are not looked at.
 */
describe("a change for one usage, looked at on the component's other usages (ticket 77)", () => {
  const WHITE: Fill = { type: "solid", color: "#FFFFFF", opacity: 1 };
  const BLUE: Fill = { type: "solid", color: "#0000FF", opacity: 1 };
  /** The live page, the canvas's page as React renders it: the loop's three Cards and "Your turn", each Card's usage known; `fill(i, color)` as the Agent's code paints the `i`th. */
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
    const cards = [...page.querySelectorAll("article")] as HTMLElement[];
    cards.forEach((el, i) => {
      const usage = i < 3 ? "src/App.tsx:6:9" : "src/App.tsx:8:7";
      Object.assign(el, { __reactFiber$leak: { _debugOwner: { type: Card, memoizedProps: { "data-tk-usage": usage }, _debugOwner: app } } });
    });
    const fill = (i: number, color: string) => (cards[i].style.backgroundColor = color);
    return { page, fill };
  }
  /** The page checking the claimed round `round`, what it says of each change; going by `otherUsages` as noted, with each note it takes in `noted`. */
  function watch(page: Document, round: Change[], otherUsages?: Map<number, OtherUsagesNoted | null>) {
    const reports: CheckReport[] = [];
    const noted = new Map<number, OtherUsagesNoted | null>();
    const checks = watchPage({
      window: page.defaultView!,
      changes: onCanvas(round),
      report: (r) => reports.push(r),
      onShown() {},
      viewWidths: () => [],
      copiesIn: () => document.body,
      otherUsages,
      onNoted: (id, one) => noted.set(id, one),
    });
    const last = (id: number) => reports.filter((r) => r.id === id).at(-1);
    return { checks, reports, last, noted };
  }

  test("the loop's Cards filled red, written into the Card: the fourth is red too, so it is not shown, and the page says where and from what to what; put back, it is shown", async () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", RED);
    const { page, fill } = livePage();
    const { checks, last } = watch(page, changes.list());
    await expect.poll(() => last(1)?.outcome).toBe("not shown");

    for (const i of [0, 1, 2, 3]) fill(i, "rgb(255, 0, 0)");

    await expect.poll(() => last(1)).toMatchObject({
      outcome: "not shown",
      otherUsages: [{ chain: cardAt("src/App.tsx:8:7"), was: WHITE, is: RED }],
    });
    fill(3, "rgb(255, 255, 255)");
    await expect.poll(() => last(1)?.outcome).toBe("shown");
    expect(last(1)).not.toHaveProperty("otherUsages");
    checks.stop();
  });

  test("written at the loop's usage alone, its three instances change and the fourth does not: shown", async () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", RED);
    const { page, fill } = livePage();
    const { checks, reports, last } = watch(page, changes.list());
    await expect.poll(() => last(1)?.outcome).toBe("not shown");

    for (const i of [0, 1, 2]) fill(i, "rgb(255, 0, 0)");

    await expect.poll(() => last(1)?.outcome).toBe("shown");
    expect(reports.some((r) => "otherUsages" in r)).toBe(false);
    checks.stop();
  });

  test("shown, then written into the Card by a later edit: the page sees the fourth change, and it is not shown any more", async () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", RED);
    const { page, fill } = livePage();
    const { checks, last } = watch(page, changes.list());
    await expect.poll(() => last(1)?.outcome).toBe("not shown");
    for (const i of [0, 1, 2]) fill(i, "rgb(255, 0, 0)");
    await expect.poll(() => last(1)?.outcome).toBe("shown");

    fill(3, "rgb(255, 0, 0)");

    await expect.poll(() => last(1)).toMatchObject({ outcome: "not shown", undone: true, otherUsages: [{ was: WHITE, is: RED }] });
    checks.stop();
  });

  test("the fourth Card has a fill of its own this round: its fill changing is its own change, not the loop's", async () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", RED);
    editor.set(layerOf(cards[3]), "fill", BLUE);
    const { page, fill } = livePage();
    const { checks, reports, last } = watch(page, changes.list());
    await expect.poll(() => last(1)?.outcome).toBe("not shown");

    for (const i of [0, 1, 2]) fill(i, "rgb(255, 0, 0)");
    fill(3, "rgb(0, 0, 255)");

    await expect.poll(() => [last(1)?.outcome, last(2)?.outcome]).toEqual(["shown", "shown"]);
    expect(reports.some((r) => "otherUsages" in r)).toBe(false);
    checks.stop();
  });

  test("the Card itself has a fill change this round too, the loop's own fill in place of it: the other usages taking the Card's fill is no leak", async () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[3]), "fill", RED);
    editor.promote(layerOf(cards[3]));
    editor.set(layerOf(cards[0]), "fill", BLUE);
    const { page, fill } = livePage();
    const round = changes.list();
    expect(round.map((change) => change.scope)).toEqual(["component", "usage"]);
    const { checks, reports, last } = watch(page, round);
    await expect.poll(() => last(round[1].id)?.outcome).toBe("not shown");

    for (const i of [0, 1, 2]) fill(i, "rgb(0, 0, 255)");
    fill(3, "rgb(255, 0, 0)");

    await expect.poll(() => [last(round[0].id)?.outcome, last(round[1].id)?.outcome]).toEqual(["shown", "shown"]);
    expect(reports.some((r) => "otherUsages" in r)).toBe(false);
    checks.stop();
  });

  test("promoted to the Card itself, written into the Card: every usage is red, as asked", async () => {
    const { editor, changes, cards, layerOf } = openCanvas();
    editor.set(layerOf(cards[0]), "fill", RED);
    editor.promote(layerOf(cards[0]));
    const { page, fill } = livePage();
    const { checks, reports, last } = watch(page, changes.list());
    await expect.poll(() => last(1)?.outcome).toBe("not shown");

    for (const i of [0, 1, 2, 3]) fill(i, "rgb(255, 0, 0)");

    await expect.poll(() => last(1)?.outcome).toBe("shown");
    expect(reports.some((r) => "otherUsages" in r)).toBe(false);
    checks.stop();
  });

  /**
   * Ticket 82: what the page notes as it begins to check is kept with the
   * claim (`keptOf`, as JSON), and a page that checks the round anew, the
   * designer having reloaded it, goes by it (`notedFrom`): the elements found
   * again by their usage.
   */
  describe("kept with the claim (ticket 82)", () => {
    /** What a first page notes as the round is claimed, kept as `.03kind/` keeps it; that page then gone. */
    async function keptAtTheClaim(round: Change[]) {
      const { page } = livePage();
      const { checks, noted } = watch(page, round);
      await expect.poll(() => noted.size).toBe(1);
      checks.stop();
      live!.remove();
      return JSON.parse(JSON.stringify(keptOf(noted))) as ReturnType<typeof keptOf>;
    }

    test("the page reloaded once the Agent wrote the fill into the Card itself: by what was kept, the fourth Card red is found; noted afresh, as before, it is not", async () => {
      const { editor, changes, cards, layerOf } = openCanvas();
      editor.set(layerOf(cards[0]), "fill", RED);
      const round = changes.list();
      const kept = await keptAtTheClaim(round);
      expect(kept).toEqual({ 1: { width: 800, seen: [{ key: expect.stringContaining("src/App.tsx:8:7"), chain: cardAt("src/App.tsx:8:7"), value: WHITE }] } });

      const { page, fill } = livePage();
      for (const i of [0, 1, 2, 3]) fill(i, "rgb(255, 0, 0)");
      const afresh = watch(page, round);
      await expect.poll(() => afresh.last(1)?.outcome).toBe("shown");
      afresh.checks.stop();

      const { checks, last, noted } = watch(page, round, notedFrom(kept));
      await expect.poll(() => last(1)).toMatchObject({ outcome: "not shown", otherUsages: [{ chain: cardAt("src/App.tsx:8:7"), was: WHITE, is: RED }] });
      // Noted already: nothing to keep again.
      expect(noted.size).toBe(0);
      fill(3, "rgb(255, 255, 255)");
      await expect.poll(() => last(1)?.outcome).toBe("shown");
      checks.stop();
    });

    test("the page reloaded once the Agent wrote the fill for the loop alone: by what was kept, shown", async () => {
      const { editor, changes, cards, layerOf } = openCanvas();
      editor.set(layerOf(cards[0]), "fill", RED);
      const round = changes.list();
      const kept = await keptAtTheClaim(round);
      const { page, fill } = livePage();
      for (const i of [0, 1, 2]) fill(i, "rgb(255, 0, 0)");
      const { checks, reports, last } = watch(page, round, notedFrom(kept));
      await expect.poll(() => last(1)?.outcome).toBe("shown");
      expect(reports.some((r) => "otherUsages" in r)).toBe(false);
      checks.stop();
    });

    test("noted as the code begins to change with no claim: the changes for one usage alone, the page as it is; for the change by the same id it was noted for alone", () => {
      const { editor, changes, cards, layerOf } = openCanvas();
      editor.set(layerOf(cards[0]), "fill", RED);
      // The Card's own corners, promoted: for every usage, so no usage's to look at others for.
      editor.set(layerOf(cards[3]), "radius", 4);
      editor.promote(layerOf(cards[3]));
      const round = changes.list();
      expect(round.map((change) => `${change.scope} ${change.property}`)).toEqual(["usage fill", "component radius"]);
      const { page, fill } = livePage();
      const noted = noteRound(page, round, 800);
      expect([...noted.keys()]).toEqual([1]);
      expect(noted.get(1)!.seen.map(({ chain, value }) => ({ chain, value }))).toEqual([{ chain: cardAt("src/App.tsx:8:7"), value: WHITE }]);
      // The Agent's code in, the fourth card red: noted before, white it was.
      fill(3, "rgb(255, 0, 0)");
      expect(noted.get(1)!.seen[0].value).toEqual(WHITE);
      expect(notedFor(round[0], round[0])).toBe(true);
      expect(notedFor(round[0], { ...round[0], property: "radius" } as Change)).toBe(false);
      expect(notedFor(round[0], { ...round[1], id: round[0].id })).toBe(false);
    });
  });
});
