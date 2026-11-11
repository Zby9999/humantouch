import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { checkChange, type EffectNotes } from "../src/client/check";
import { createEditor } from "../src/client/edits";
import type { Layer } from "../src/client/layers";
import { placedOnCanvas } from "../src/client/moves";
import type { Property } from "../src/client/property-table";
import { createViews } from "../src/client/views";

/**
 * ADR 0016, ticket 146: a value the page writes otherwise than the change is
 * shown all the same where the page draws what the change draws: the canvas's
 * style for the change put on the page's elements for a moment changes
 * nothing drawn, or, applied in a way that adds to it (a margin for a
 * padding), the page moves what the style moved before the change was applied
 * to where it moved it. What draws otherwise is not shown, as ever.
 */

/** A section, `section` its style, with an empty slot and the words "Freeze" in it, styled `slot` and `words`; the title above it styled `title`. */
const page = ({ section = "", slot = "", words = "", title = "" }: { section?: string; slot?: string; words?: string; title?: string } = {}) => `<!DOCTYPE html>
<body style="margin: 0">
  <main data-ht-loc="app/page.tsx:20:5" style="width: 800px">
    <h1 data-ht-loc="app/page.tsx:21:7" style="margin: 0; font-size: 32px; color: #3b82f6; ${title}">Human Touch</h1>
    <section data-ht-loc="app/page.tsx:22:7" style="display: flex; height: 120px; ${section}">
      <span data-ht-loc="app/page.tsx:23:9" style="${slot}"></span>
      <p data-ht-loc="app/page.tsx:24:9" style="margin: 0; ${words}">Freeze</p>
    </section>
  </main>
</body>`;

let frames: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const frame of frames) frame.remove();
  frames = [];
});

function frameWith(html: string): Document {
  const frame = document.createElement("iframe");
  frame.style.width = "800px";
  frame.style.height = "600px";
  document.body.append(frame);
  frames.push(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  return doc;
}

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | undefined {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
}

/** The round, as saved and claimed: on the page as it was (`before`), the element `selector` picks given `value` for `property`. */
function changed(before: string, selector: string, property: Property, value: unknown) {
  const doc = frameWith(before);
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const changes = createChangeSet();
  const editor = createEditor(views, changes);
  const layer = find(editor.tree().root, (one) => one.el === doc.querySelector(selector))!;
  editor.set(layer, property, value as never);
  const round = placedOnCanvas(changes.list(), doc.documentElement.outerHTML);
  expect(round).toHaveLength(1);
  return round;
}

const check = (html: string, round: ReturnType<typeof changed>, notes?: EffectNotes) => checkChange(frameWith(html), round[0], round, notes);

/** Checked first on the page as it was, as the page's checks first look at a claimed round, its notes kept; then on `html`. */
function checkNoted(before: string, html: string, round: ReturnType<typeof changed>) {
  const notes: EffectNotes = new Map();
  expect(check(before, round, notes).outcome).toBe("not shown");
  return check(html, round, notes);
}

describe("written otherwise, drawn the same: shown (ADR 0016)", () => {
  test("a fixed width written as a maximum, the container wide enough", () => {
    const round = changed(page(), "p", "width", { type: "fixed", value: 500 });
    expect(check(page({ words: "width: 500px" }), round)).toEqual({ outcome: "shown" });
    expect(check(page({ words: "max-width: 500px; flex-grow: 1" }), round)).toEqual({ outcome: "shown" });
  });

  test("a color written in another way: a name, another space", () => {
    const round = changed(page(), "h1", "textColor", { color: "#FFFFFF", opacity: 1 });
    expect(check(page({ title: "color: white" }), round)).toEqual({ outcome: "shown" });
    expect(check(page({ title: "color: oklch(1 0 0)" }), round)).toEqual({ outcome: "shown" });
  });

  test("a padding drawn by a margin of the layer in it, as noted before it was applied", () => {
    const round = changed(page(), "section", "padding", [0, 0, 0, 24]);
    const margin = page({ words: "margin-left: 24px" });
    // The padding put on as well moves the words again: not by that alone.
    expect(check(margin, round).outcome).toBe("not shown");
    expect(checkNoted(page(), margin, round)).toEqual({ outcome: "shown" });
  });

  test("a padding drawn by a gap after an empty slot, which is drawn nowhere", () => {
    const round = changed(page(), "section", "padding", [0, 0, 0, 24]);
    expect(checkNoted(page(), page({ section: "gap: 24px" }), round)).toEqual({ outcome: "shown" });
  });

  test("a loop's instances: past the first few noted, each laid out as one of those moves alike", () => {
    const cards = (words: string) => `<!DOCTYPE html>
<body style="margin: 0">
  <main data-ht-loc="app/page.tsx:20:5" style="width: 800px">
    ${Array.from({ length: 7 }, () => `<section data-ht-loc="app/page.tsx:22:7" style="display: flex; height: 40px"><p data-ht-loc="app/page.tsx:24:9" style="margin: 0; ${words}">Freeze</p></section>`).join("\n    ")}
  </main>
</body>`;
    const round = changed(cards(""), "section", "padding", [0, 0, 0, 24]);
    expect(checkNoted(cards(""), cards("margin-left: 24px"), round)).toEqual({ outcome: "shown" });
    expect(checkNoted(cards(""), cards("margin-left: 20px"), round).outcome).toBe("not shown");
  });

  test("a gap drawn by a margin of the layer after", () => {
    const round = changed(page({ slot: "width: 40px; height: 40px" }), "section", "gap", 16);
    const before = page({ slot: "width: 40px; height: 40px" });
    expect(checkNoted(before, page({ slot: "width: 40px; height: 40px", words: "margin-left: 16px" }), round)).toEqual({ outcome: "shown" });
  });

  test("a large padding at the top drawn by aligning at the bottom", () => {
    // The section 120px tall, the words 40px: at the bottom, as 80px above puts them.
    const column = "flex-direction: column; box-sizing: border-box";
    const round = changed(page({ section: column, words: "height: 40px" }), "section", "padding", [80, 0, 0, 0]);
    expect(check(page({ section: `${column}; justify-content: flex-end`, words: "height: 40px" }), round)).toEqual({ outcome: "shown" });
    // 41px of words at the bottom are a px higher than the padding puts them.
    expect(check(page({ section: `${column}; justify-content: flex-end`, words: "height: 41px" }), round).outcome).toBe("not shown");
  });
});

describe("drawn otherwise: not shown, as ever", () => {
  test("a color one shade off", () => {
    const round = changed(page(), "h1", "textColor", { color: "#3B82F6", opacity: 0.5 });
    expect(check(page({ title: "color: #3b82f680" }), round)).toEqual({ outcome: "shown" });
    const blue600 = changed(page(), "h1", "textColor", { color: "#2563EB", opacity: 1 });
    expect(check(page(), blue600)).toEqual({ outcome: "not shown", actual: { color: "#3B82F6", opacity: 1 } });
  });

  test("a width more than a px off", () => {
    const round = changed(page(), "p", "width", { type: "fixed", value: 500 });
    expect(check(page({ words: "max-width: 498px; flex-grow: 1" }), round).outcome).toBe("not shown");
    expect(check(page({ words: "width: 501.5px" }), round).outcome).toBe("not shown");
  });

  test("a padding drawn by a margin a px short", () => {
    const round = changed(page(), "section", "padding", [0, 0, 0, 24]);
    expect(checkNoted(page(), page({ words: "margin-left: 23px" }), round).outcome).toBe("not shown");
  });

  test("an alignment across a Stack otherwise", () => {
    const round = changed(page({ section: "flex-direction: column" }), "section", "align", { x: "end", y: "start", distribute: false });
    expect(check(page({ section: "flex-direction: column; align-items: flex-end" }), round)).toEqual({ outcome: "shown" });
    expect(checkNoted(page({ section: "flex-direction: column" }), page({ section: "flex-direction: column; align-items: center" }), round).outcome).toBe("not shown");
  });

  test("a gap where the page lays nothing out by one: a style that would draw nothing there either way tells nothing", () => {
    const round = changed(page({ slot: "width: 40px; height: 40px" }), "section", "gap", 16);
    expect(check(page({ section: "display: block", slot: "display: block; width: 40px; height: 40px" }), round).outcome).toBe("not shown");
  });

  test("nothing noted after the page first looked: what it moves, noted once the code changed, would be no change of the code's", () => {
    const round = changed(page(), "section", "padding", [0, 0, 0, 24]);
    const notes: EffectNotes = new Map();
    const margin = page({ words: "margin-left: 24px" });
    expect(check(margin, round, notes).outcome).toBe("not shown");
    expect(check(margin, round, notes).outcome).toBe("not shown");
  });
});

describe("looking puts nothing on the page that stays (ADR 0016)", () => {
  test("no attribute or element changes, no stylesheet left, no transition started, the scroll where it was", async () => {
    const round = changed(page(), "h1", "textColor", { color: "#FFFFFF", opacity: 1 });
    const doc = frameWith(page({ title: "color: #ff0000; transition: color 1s" }));
    const title = doc.querySelector("h1")!;
    const records: MutationRecord[] = [];
    const watch = new MutationObserver((seen) => records.push(...seen));
    watch.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
    const sheets = doc.adoptedStyleSheets.length;
    expect(checkChange(doc, round[0], round).outcome).toBe("not shown");
    await Promise.resolve();
    records.push(...watch.takeRecords());
    watch.disconnect();
    expect(records).toEqual([]);
    expect(doc.adoptedStyleSheets.length).toBe(sheets);
    expect(title.getAnimations()).toEqual([]);
    expect(getComputedStyle(title).color).toBe("rgb(255, 0, 0)");
  });
});
