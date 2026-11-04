import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { checkChange } from "../src/client/check";
import { createEditor } from "../src/client/edits";
import type { Layer } from "../src/client/layers";
import { canvasOf, placedOnCanvas } from "../src/client/moves";
import { elementsOf } from "../src/client/page-elements";
import type { Fill } from "../src/client/property-table";
import { CHAIN_ATTR, type UsageLevel } from "../src/client/usage-chain";
import { createViews } from "../src/client/views";

/**
 * Finding a layer whose markers an edit to the code has moved (ticket 99):
 * lines added above it, or a wrapper written above it, and the page still
 * checks the layer itself; where it cannot tell which element is the layer,
 * it says the layer is not on the page, and reads no other element.
 */

const level = (component: string, usage: string | null, thirdParty = false): UsageLevel => ({ component, usage, thirdParty });
const HOME = [level("Home", null)];
const APP = [level("App", null)];
const chain = (levels: UsageLevel[]) => `${CHAIN_ATTR}='${JSON.stringify(levels)}'`;

/** One Stat (`components/Stat.tsx`), used at `usage` in the page, its elements' lines `at` (the div's; the spans' the next two). */
const stat = (usage: string, value: string, label: string, at = 6) => {
  const of = chain([level("Stat", usage), ...HOME]);
  return `<div data-tk-loc="components/Stat.tsx:${at}:5" ${of} style="background-color: rgb(255, 255, 255)"><span data-tk-loc="components/Stat.tsx:${at + 1}:7" ${of} style="display: block">${value}</span><span data-tk-loc="components/Stat.tsx:${at + 2}:7" ${of} style="display: block">${label}</span></div>`;
};

/** The Next.js page's stats: three Stats, at lines 32–34 of the page (`down` lines further, and the Stats `usagesDown` more); the Stat's div at line `at`. */
const stats = (at = 6, labels = ["views side by side", "layers at 60fps", "bytes in production"], down = 0, usagesDown = 0) => `<!DOCTYPE html>
<body style="margin: 0">
  <main data-tk-loc="app/page.tsx:${20 + down}:5" ${chain(HOME)}>
    <section data-tk-loc="app/page.tsx:${31 + down}:7" ${chain(HOME)} data-testid="stats">
      ${[0, 1, 2].map((n) => stat(`app/page.tsx:${32 + n + down + usagesDown}:9`, ["3", "5,000", "0"][n], labels[n], at)).join("")}
    </section>
  </main>
</body>`;

/** The cards' grid, acme-ui's Surface (it passes its props on to its div), used at line `surface` of the App; above it, what the hero has (`above`). */
const surfacePage = ({ above = "", shift = 0 } = {}) => {
  const at = (line: number) => line + shift;
  const surface = [level("Surface", `src/App.tsx:${at(38)}:7`, true), ...APP];
  return `<!DOCTYPE html>
<body style="margin: 0">
  <main data-tk-loc="src/App.tsx:17:5" ${chain(APP)}>
    <section data-tk-loc="src/App.tsx:19:7" ${chain(APP)}>
      <header data-tk-loc="src/App.tsx:20:9" ${chain(APP)}>
        <h1 data-tk-loc="src/App.tsx:21:11" ${chain(APP)}>Third Kind</h1>
        ${above || `<span ${chain([level("Badge", "src/App.tsx:22:11", true), ...APP])}>Beta</span>`}
      </header>
      <p data-tk-loc="src/App.tsx:${at(24)}:9" ${chain(APP)}>A Framer-style editor layer for <strong data-tk-loc="src/App.tsx:${at(25)}:51" ${chain(APP)}>any</strong> page.</p>
    </section>
    <div data-tk-usage="src/App.tsx:${at(38)}:7" ${chain(surface)} style="display: grid; gap: 4px">
      ${[0, 1, 2].map((n) => `<article data-tk-loc="src/Card.tsx:3:5" ${chain([level("Card", `src/App.tsx:${at(40)}:11`), ...APP])}>Card ${n}</article>`).join("")}
    </div>
  </main>
</body>`;
};

let frames: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const frame of frames) frame.remove();
  frames = [];
});

function frameWith(html: string): Document {
  const frame = document.createElement("iframe");
  frame.style.width = "800px";
  document.body.append(frame);
  frames.push(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  return doc;
}

/** A canvas of `html`, frozen from the page: each element's usage chain written on it. */
function openCanvas(html: string) {
  const doc = frameWith(html);
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const changes = createChangeSet();
  const editor = createEditor(views, changes);
  const layerOf = (el: Element) => find(editor.tree().root, (layer) => layer.el === el)!;
  /** The round as saved and claimed: on its canvas. */
  const round = () => placedOnCanvas(changes.list(), doc.documentElement.outerHTML);
  return { doc, editor, layerOf, round };
}

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | undefined {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
}

/**
 * The live page, as `html` writes it: each element's usage chain, as the
 * canvas has it written, given it as React would (its owners' fibers), and
 * not written on it.
 */
function livePage(html: string): Document {
  const page = frameWith(html);
  for (const el of page.querySelectorAll(`[${CHAIN_ATTR}]`)) {
    const levels = JSON.parse(el.getAttribute(CHAIN_ATTR)!) as UsageLevel[];
    el.removeAttribute(CHAIN_ATTR);
    let owner: object | null = null;
    for (const { component, usage } of [...levels].reverse()) {
      const type = Object.assign(function () {}, { displayName: component });
      owner = { type, memoizedProps: usage ? { "data-tk-usage": usage } : {}, _debugOwner: owner };
    }
    Object.assign(el, { __reactFiber$moved: { _debugOwner: owner } });
  }
  return page;
}

const NOT_ON_PAGE = { outcome: "unchecked", reason: "the layer is not on the page now" };
const STONE: Fill = { type: "solid", color: "#F5F5F4", opacity: 1 };
const STONE_RGB = "rgb(245, 245, 244)";

describe("the third Stat's label given new words (next-server-usage-text)", () => {
  /** The round: the third Stat's label reads “bytes shipped to production”. */
  function newWords() {
    const { doc, editor, layerOf, round } = openCanvas(stats());
    const label = doc.querySelectorAll('[data-testid="stats"] > div')[2].lastElementChild!;
    editor.setText(layerOf(label), "bytes shipped to production");
    return round();
  }
  const written = ["views side by side", "layers at 60fps", "bytes shipped to production"];

  test("the Stat's parameters split over several lines, every marker in it 8 lines down: the label is read, not the value above it", () => {
    const round = newWords();
    expect(checkChange(livePage(stats(14, written)), round[0], round)).toEqual({ outcome: "shown" });
    expect(checkChange(livePage(stats(14)), round[0], round)).toEqual({ outcome: "not shown", actual: "bytes in production" });
  });

  test("one line added above the Stat's div: the label is read", () => {
    const round = newWords();
    expect(checkChange(livePage(stats(7, written)), round[0], round)).toEqual({ outcome: "shown" });
  });

  test("a line added to the page above the Stats, the third's usage where the second's was: the third's label is read, not the second's", () => {
    const round = newWords();
    expect(checkChange(livePage(stats(6, written, 1)), round[0], round)).toEqual({ outcome: "shown" });
    expect(checkChange(livePage(stats(6, undefined, 1)), round[0], round)).toEqual({ outcome: "not shown", actual: "bytes in production" });
  });

  test("the value deleted from the Stat, the label a line up: which of the two it is cannot be told, and the page says so", () => {
    const round = newWords();
    const page = livePage(stats(6, written));
    for (const value of page.querySelectorAll('[data-testid="stats"] > div > span:first-child')) value.remove();
    for (const label of page.querySelectorAll('[data-testid="stats"] > div > span')) label.setAttribute("data-tk-loc", "components/Stat.tsx:7:7");
    expect(checkChange(page, round[0], round)).toEqual(NOT_ON_PAGE);
  });

  test("a line added above the Stats alone, no element's marker after it, the third's usage where the second's was: the third's label is read, not the second's given its words (review)", () => {
    const round = newWords();
    expect(checkChange(livePage(stats(6, ["views side by side", "bytes shipped to production", "bytes in production"], 0, 1)), round[0], round)).toEqual({
      outcome: "not shown",
      actual: "bytes in production",
    });
    expect(checkChange(livePage(stats(6, written, 0, 1)), round[0], round)).toEqual({ outcome: "shown" });
  });

  test("a new span written between the value and the label, the label two lines down: which of the two it is cannot be told, and the page says so", () => {
    const round = newWords();
    const page = livePage(stats(6, written));
    for (const label of page.querySelectorAll('[data-testid="stats"] > div > span:last-child')) {
      label.setAttribute("data-tk-loc", "components/Stat.tsx:10:7");
      const added = label.cloneNode() as Element;
      Object.assign(added, { __reactFiber$moved: (label as unknown as Record<string, unknown>).__reactFiber$moved });
      added.setAttribute("data-tk-loc", "components/Stat.tsx:9:7");
      added.textContent = "bytes shipped to production";
      label.before(added);
      label.textContent = "new";
    }
    expect(checkChange(page, round[0], round)).toEqual(NOT_ON_PAGE);
  });
});

describe("the cards' grid, acme-ui's Surface, filled (third-party)", () => {
  function filled() {
    const { doc, editor, layerOf, round } = openCanvas(surfacePage());
    editor.set(layerOf(doc.querySelector("[data-tk-usage]")!), "fill", STONE);
    return round();
  }
  const fill = (page: Document) => ((page.querySelector("[data-tk-usage]") as HTMLElement).style.backgroundColor = STONE_RGB);

  for (const tag of ["span", "div"]) {
    test(`a <${tag}> written around the Badge above it, the Surface 2 lines down: the Surface's own div is read`, () => {
      const round = filled();
      const wrapper = `<${tag} data-tk-loc="src/App.tsx:22:11" ${chain(APP)} style="display: contents"><span ${chain([level("Badge", "src/App.tsx:23:13", true), ...APP])}>Beta</span></${tag}>`;
      const page = livePage(surfacePage({ above: wrapper, shift: 2 }));
      expect(checkChange(page, round[0], round)).toMatchObject({ outcome: "not shown" });
      fill(page);
      expect(checkChange(page, round[0], round)).toEqual({ outcome: "shown" });
    });
  }

  test("lines added above the Surface, nothing else: its div is read", () => {
    const round = filled();
    const page = livePage(surfacePage({ shift: 3 }));
    fill(page);
    expect(checkChange(page, round[0], round)).toEqual({ outcome: "shown" });
  });
});

describe("two siblings alike", () => {
  const ITEMS = (lines: number[], words = ["One", "Two"]) => `<!DOCTYPE html>
<body style="margin: 0">
  <ul data-tk-loc="src/App.tsx:4:5" ${chain(APP)}>${lines.map((line, i) => `<li data-tk-loc="src/App.tsx:${line}:7" ${chain(APP)}>${words[i]}</li>`).join("")}</ul>
</body>`;
  function secondRenamed() {
    const { doc, editor, layerOf, round } = openCanvas(ITEMS([5, 6]));
    editor.setText(layerOf(doc.querySelectorAll("li")[1]), "Second");
    return round();
  }

  test("lines added above both: the second is read, not the first", () => {
    const round = secondRenamed();
    expect(checkChange(livePage(ITEMS([7, 8], ["One", "Second"])), round[0], round)).toEqual({ outcome: "shown" });
    expect(checkChange(livePage(ITEMS([7, 8], ["Second", "Two"])), round[0], round)).toEqual({ outcome: "not shown", actual: "Two" });
  });

  test("a third written above both, over two lines: which is the layer cannot be told, and the page says so", () => {
    const round = secondRenamed();
    expect(checkChange(livePage(ITEMS([5, 7, 8], ["New", "One", "Second"])), round[0], round)).toEqual(NOT_ON_PAGE);
  });

  test("the second deleted, nothing above the first changed: the first is read", () => {
    const { doc, editor, layerOf, round } = openCanvas(ITEMS([5, 6]));
    editor.setText(layerOf(doc.querySelectorAll("li")[0]), "First");
    const changes = round();
    expect(checkChange(livePage(ITEMS([5], ["First"])), changes[0], changes)).toEqual({ outcome: "shown" });
  });

  test("the first deleted, the second a line up: which is the layer cannot be told, and the page says so", () => {
    const round = secondRenamed();
    expect(checkChange(livePage(ITEMS([5], ["Second"])), round[0], round)).toEqual(NOT_ON_PAGE);
  });
});

describe("the Stat's fill, a change to the Stat itself (review)", () => {
  /** The round: the first Stat filled, the change promoted to the Stat. */
  function promoted() {
    const { doc, editor, layerOf, round } = openCanvas(stats());
    const first = layerOf(doc.querySelector('[data-testid="stats"] > div')!);
    editor.set(first, "fill", STONE);
    editor.promote(first);
    return round();
  }
  const fill = (stat: Element) => ((stat as HTMLElement).style.backgroundColor = STONE_RGB);

  test("a line added to the Stat above its div, the first usage alone filled: every usage is read where the div went, not the first alone", () => {
    const round = promoted();
    expect(round[0]).toMatchObject({ scope: "component" });
    const page = livePage(stats(7));
    const divs = [...page.querySelectorAll('[data-testid="stats"] > div')];
    fill(divs[0]);
    expect(checkChange(page, round[0], round)).toEqual({ outcome: "not shown", actual: { type: "solid", color: "#FFFFFF", opacity: 1 } });
    divs.forEach(fill);
    expect(checkChange(page, round[0], round)).toEqual({ outcome: "shown" });
  });
});

describe("a layer deleted, two siblings alike (review)", () => {
  const ITEMS = (lines: number[], words: string[]) => `<!DOCTYPE html>
<body style="margin: 0">
  <ul data-tk-loc="src/App.tsx:4:5" ${chain(APP)}>${lines.map((line, i) => `<li data-tk-loc="src/App.tsx:${line}:7" ${chain(APP)}>${words[i]}</li>`).join("")}</ul>
</body>`;
  function secondDeleted() {
    const { doc, editor, layerOf, round } = openCanvas(ITEMS([5, 6], ["One", "Two"]));
    editor.remove(layerOf(doc.querySelectorAll("li")[1]));
    return round();
  }
  const UNTOLD = { outcome: "unchecked", reason: "its markers have moved, and an element that looks like it is on the page: the page cannot tell whether that is the layer" };

  test("deleted: shown", () => {
    const round = secondDeleted();
    expect(checkChange(livePage(ITEMS([5], ["One"])), round[0], round)).toEqual({ outcome: "shown" });
  });

  test("not deleted, a third written above both over two lines: which is the layer cannot be told, and the page does not take it for gone", () => {
    const round = secondDeleted();
    expect(checkChange(livePage(ITEMS([5, 7, 8], ["New", "One", "Two"])), round[0], round)).toEqual(UNTOLD);
  });

  test("the first deleted instead, the second a line up: not taken for gone", () => {
    const round = secondDeleted();
    expect(checkChange(livePage(ITEMS([5], ["Two"])), round[0], round)).toEqual(UNTOLD);
  });

  test("deleted, one alike in another list further down the file: shown, the other not taken for it", () => {
    const LISTS = (first: [number, string][], down: number) => `<!DOCTYPE html>
<body style="margin: 0">
  <ul data-tk-loc="src/App.tsx:4:5" ${chain(APP)}>${first.map(([line, words]) => `<li data-tk-loc="src/App.tsx:${line}:7" ${chain(APP)}>${words}</li>`).join("")}</ul>
  <ol data-tk-loc="src/App.tsx:${8 - down}:5" ${chain(APP)}><li data-tk-loc="src/App.tsx:${9 - down}:7" ${chain(APP)}>Two</li></ol>
</body>`;
    const { doc, editor, layerOf, round } = openCanvas(LISTS([[5, "One"], [6, "Two"]], 0));
    editor.remove(layerOf(doc.querySelectorAll("ul > li")[1]));
    const changes = round();
    expect(checkChange(livePage(LISTS([[5, "One"]], 1)), changes[0], changes)).toEqual({ outcome: "shown" });
  });

  test("not deleted, a third written after both: the second, where it was, is there", () => {
    const round = secondDeleted();
    expect(checkChange(livePage(ITEMS([5, 6, 7], ["One", "Two", "New"])), round[0], round)).toEqual({ outcome: "not shown", actual: "there" });
  });
});

describe("what the page reads off itself, kept (review)", () => {
  test("a layer looked for with no canvas first, then by the round's canvas: found where it went", () => {
    const ITEMS = (lines: number[]) => `<!DOCTYPE html>
<body style="margin: 0">
  <ul data-tk-loc="src/App.tsx:4:5" ${chain(APP)}>${lines.map((line, i) => `<li data-tk-loc="src/App.tsx:${line}:7" ${chain(APP)}>${["One", "Two"][i]}</li>`).join("")}</ul>
</body>`;
    const { doc, editor, layerOf, round } = openCanvas(ITEMS([5, 6]));
    editor.setText(layerOf(doc.querySelectorAll("li")[1]), "Second");
    const changes = round();
    const page = livePage(ITEMS([7, 8]));
    expect(elementsOf(page, changes[0].target)).toEqual([]);
    expect(elementsOf(page, changes[0].target, () => canvasOf(changes))).toEqual([page.querySelectorAll("li")[1]]);
  });
});
