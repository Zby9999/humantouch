import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { checkChange } from "../src/client/check";
import { createEditor } from "../src/client/edits";
import type { Layer } from "../src/client/layers";
import { placedOnCanvas } from "../src/client/moves";
import type { Align } from "../src/client/property-table";
import { createViews } from "../src/client/views";

/**
 * A Stack spread evenly (ticket 145): the page writes it as
 * `justify-content: space-between`, which carries no point along the Stack,
 * and reads that point back as the start. Where the change and the page are
 * both spread evenly, the point along the Stack is not compared; the point
 * across it is, as ever.
 */

/** A Stack of two layers, `direction` its way, written `justify` along it and `items` across. */
const stackPage = (direction: "row" | "column", justify: string, items: string) => `<!DOCTYPE html>
<body style="margin: 0">
  <main data-ht-loc="app/page.tsx:20:5">
    <section data-ht-loc="app/page.tsx:21:7" style="display: flex; flex-direction: ${direction}; justify-content: ${justify}; align-items: ${items}; width: 600px; height: 400px">
      <p data-ht-loc="app/page.tsx:22:9">Freeze</p>
      <p data-ht-loc="app/page.tsx:23:9">Apply</p>
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

/** The round, as saved and claimed: the Stack, centered on the canvas, its alignment set to `align`. */
function aligned(direction: "row" | "column", align: Align) {
  const doc = frameWith(stackPage(direction, "center", "center"));
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const changes = createChangeSet();
  const editor = createEditor(views, changes);
  const stack = find(editor.tree().root, (layer) => layer.el === doc.querySelector("section"))!;
  editor.set(stack, "align", align);
  return placedOnCanvas(changes.list(), doc.documentElement.outerHTML);
}

const check = (direction: "row" | "column", justify: string, items: string, round: ReturnType<typeof aligned>) => checkChange(frameWith(stackPage(direction, justify, items)), round[0], round);

describe("a Stack spread evenly (ticket 145)", () => {
  test("vertical, bottom left spread evenly: shown where the page spreads it evenly at the left, its point along it read as the top", () => {
    const round = aligned("column", { x: "start", y: "end", distribute: true });
    expect(round).toHaveLength(1);
    for (const justify of ["space-between", "space-around", "space-evenly"]) {
      expect(check("column", justify, "stretch", round), justify).toEqual({ outcome: "shown" });
    }
  });

  test("horizontal, right center spread evenly: shown where the page spreads it evenly, centered across", () => {
    const round = aligned("row", { x: "end", y: "center", distribute: true });
    expect(check("row", "space-between", "center", round)).toEqual({ outcome: "shown" });
  });

  test("the point across the Stack is compared, as ever", () => {
    const vertical = aligned("column", { x: "start", y: "end", distribute: true });
    expect(check("column", "space-between", "center", vertical)).toEqual({ outcome: "not shown", actual: { x: "center", y: "start", distribute: true } });
    const horizontal = aligned("row", { x: "end", y: "center", distribute: true });
    expect(check("row", "space-between", "flex-end", horizontal)).toEqual({ outcome: "not shown", actual: { x: "start", y: "end", distribute: true } });
  });

  test("spread evenly on one side only: not shown", () => {
    const spread = aligned("column", { x: "start", y: "end", distribute: true });
    expect(check("column", "flex-end", "stretch", spread)).toEqual({ outcome: "not shown", actual: { x: "start", y: "end", distribute: false } });
    const pointed = aligned("column", { x: "start", y: "start", distribute: false });
    expect(check("column", "space-between", "stretch", pointed)).toEqual({ outcome: "not shown", actual: { x: "start", y: "start", distribute: true } });
  });

  test("not spread evenly, the point along the Stack is compared, as ever", () => {
    const round = aligned("column", { x: "start", y: "end", distribute: false });
    expect(check("column", "flex-end", "stretch", round)).toEqual({ outcome: "shown" });
    expect(check("column", "flex-start", "stretch", round)).toEqual({ outcome: "not shown", actual: { x: "start", y: "start", distribute: false } });
  });
});
