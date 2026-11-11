import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { checkChange, effectNotes, type EffectNotes } from "../src/client/check";
import { drawsAlike } from "../src/client/draws-alike";
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
  const notes = effectNotes(true);
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
    const notes = effectNotes(true);
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

describe("review of ticket 146: what drawing alone does not tell", () => {
  test("an alignment a layer in the container overrides for itself (its own alignment, an auto margin) tells nothing", () => {
    const column = "flex-direction: column";
    const round = changed(page({ section: column }), "section", "align", { x: "center", y: "start", distribute: false });
    expect(check(page({ section: column, words: "align-self: flex-end" }), round).outcome).toBe("not shown");
    const row = changed(page(), "section", "align", { x: "center", y: "start", distribute: false });
    expect(check(page({ words: "margin-left: auto" }), row).outcome).toBe("not shown");
  });

  test("a style that paints too (a font weight) is never noted: a weight that moves things as far is not taken for it", () => {
    const round = changed(page(), "h1", "fontWeight", 400);
    expect(checkNoted(page(), page({ title: "font-weight: 500" }), round).outcome).toBe("not shown");
  });

  test("a paint that is no color is not taken for a color", () => {
    const doc = frameWith(`<!DOCTYPE html><body style="margin: 0"><svg width="40" height="40"><rect width="40" height="40" style="fill: none"></rect></svg></body>`);
    const rect = doc.querySelector("rect")!;
    expect(drawsAlike([{ el: rect, style: { fill: "red" } }]).alike).toBe(false);
    expect(drawsAlike([{ el: rect, style: { fill: "none" } }]).alike).toBe(true);
  });

  test("a change that hides the layer is never put on: its animations run on where they were", () => {
    const round = changed(page(), "p", "visible", false);
    const doc = frameWith(page({ words: "animation: turn 10s linear infinite" }).replace("<body", "<style>@keyframes turn { to { transform: rotate(1turn) } }</style><body"));
    const [turning] = doc.querySelector("p")!.getAnimations();
    turning.currentTime = 4000;
    expect(checkChange(doc, round[0], round).outcome).toBe("not shown");
    expect(turning.currentTime).toBe(4000);
    expect(doc.querySelector("p")!.getAnimations()).toEqual([turning]);
  });

  test("a page that scrolls smoothly is put back where it was scrolled at once, and so is what scrolls in the layer", () => {
    const tall = (height: string) => `<!DOCTYPE html>
<html style="scroll-behavior: smooth"><body style="margin: 0">
  <main data-ht-loc="app/page.tsx:20:5">
    <div data-ht-loc="app/page.tsx:21:7" style="height: ${height}; width: 200px">
      <div data-ht-loc="app/page.tsx:22:9" style="height: 100px; overflow: auto; scroll-behavior: smooth"><p style="margin: 0">${"Freeze the page and apply. ".repeat(40)}</p></div>
    </div>
  </main>
</body></html>`;
    const round = changed(tall("1600px"), "main > div", "height", { type: "fixed", value: 120 });
    const fontRound = changed(tall("1600px"), "main > div", "width", { type: "fixed", value: 780 });
    const doc = frameWith(tall("1600px"));
    const win = doc.defaultView!;
    win.scrollTo({ top: 900, behavior: "instant" });
    const inner = doc.querySelector("main > div > div")!;
    inner.scrollTo({ top: 300, behavior: "instant" });
    expect([win.scrollY, inner.scrollTop]).toEqual([900, 300]);
    expect(checkChange(doc, round[0], round).outcome).toBe("not shown");
    expect(checkChange(doc, fontRound[0], fontRound).outcome).toBe("not shown");
    expect([win.scrollY, inner.scrollTop]).toEqual([900, 300]);
  });

  test("0 letter spacing on a label beside a field: shown, as ticket 142 had it", () => {
    const html = (spacing: string) => `<!DOCTYPE html>
<body style="margin: 0">
  <main data-ht-loc="app/page.tsx:20:5">
    <label data-ht-loc="app/page.tsx:21:7" style="letter-spacing: ${spacing}">Name</label>
    <input data-ht-loc="app/page.tsx:22:7" value="Freeze">
  </main>
</body>`;
    const round = changed(html("0.8px"), "label", "letterSpacing", { value: 0, unit: "px" });
    expect(check(html("normal"), round)).toEqual({ outcome: "shown" });
    expect(check(html("0em"), round)).toEqual({ outcome: "shown" });
  });

  test("a loop's instances that grow along their container, each moving the next: shown by a margin as by the padding", () => {
    const cards = (words: string) => `<!DOCTYPE html>
<body style="margin: 0">
  <main data-ht-loc="app/page.tsx:20:5" style="width: 800px">
    ${Array.from({ length: 7 }, () => `<section data-ht-loc="app/page.tsx:22:7" style="display: flex"><p data-ht-loc="app/page.tsx:24:9" style="margin: 0; ${words}">Freeze</p></section>`).join("\n    ")}
  </main>
</body>`;
    const round = changed(cards(""), "section", "padding", [24, 0, 0, 0]);
    expect(checkNoted(cards(""), cards("margin-top: 24px"), round)).toEqual({ outcome: "shown" });
    expect(checkNoted(cards(""), cards("margin-top: 20px"), round).outcome).toBe("not shown");
  });

  test("another change of the round that moves what this one's style was noted to move: not taken for this one", () => {
    const doc = frameWith(page());
    const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
    const changes = createChangeSet();
    const editor = createEditor(views, changes);
    const section = () => find(editor.tree().root, (one) => one.el === doc.querySelector("section"))!;
    editor.set(section(), "padding", [0, 0, 0, 24]);
    editor.set(section(), "gap", 24);
    const round = placedOnCanvas(changes.list(), doc.documentElement.outerHTML);
    const padding = round.find((change) => change.property === "padding")!;
    const notes = effectNotes(true);
    expect(checkChange(frameWith(page()), padding, round, notes).outcome).toBe("not shown");
    // The gap applied, not the padding: the words are where the padding was noted to put them.
    expect(checkChange(frameWith(page({ section: "gap: 24px" })), padding, round, notes).outcome).toBe("not shown");
  });

  test("notes closed (a page opened after the round was claimed, or the code changed): nothing noted, nothing to go by", () => {
    const round = changed(page(), "section", "padding", [0, 0, 0, 24]);
    const notes = effectNotes(false);
    expect(check(page(), round, notes).outcome).toBe("not shown");
    expect(check(page({ words: "margin-left: 24px" }), round, notes).outcome).toBe("not shown");
  });

  test("a layer looked at again as it was drawn is not given the style again; drawn otherwise, it is", () => {
    const round = changed(page(), "p", "width", { type: "fixed", value: 500 });
    const doc = frameWith(page({ words: "width: 400px" }));
    const own = Object.getOwnPropertyDescriptor(doc.defaultView!.Document.prototype, "adoptedStyleSheets")!;
    let sets = 0;
    Object.defineProperty(doc, "adoptedStyleSheets", {
      configurable: true,
      get: () => own.get!.call(doc),
      set: (sheets) => {
        sets++;
        own.set!.call(doc, sheets);
      },
    });
    expect(checkChange(doc, round[0], round).outcome).toBe("not shown");
    const once = sets;
    expect(once).toBeGreaterThan(0);
    expect(checkChange(doc, round[0], round).outcome).toBe("not shown");
    expect(sets).toBe(once);
    const words = doc.querySelector("p") as HTMLElement;
    words.style.width = "";
    words.style.maxWidth = "500px";
    words.style.flexGrow = "1";
    expect(checkChange(doc, round[0], round)).toEqual({ outcome: "shown" });
    expect(sets).toBeGreaterThan(once);
  });
});
