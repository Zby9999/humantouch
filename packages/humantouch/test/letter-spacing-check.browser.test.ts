import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { checkChange } from "../src/client/check";
import { createEditor } from "../src/client/edits";
import type { Layer } from "../src/client/layers";
import { placedOnCanvas } from "../src/client/moves";
import type { TextLength } from "../src/client/typography";
import { createViews } from "../src/client/views";

/**
 * Letter spacing of 0 (ticket 142): Chrome computes it as `normal`, which the
 * page reads as 0%, whatever unit the page writes it in. A change to 0, in
 * any unit, is shown where the page shows 0; any other length is compared by
 * its unit, as ever.
 */

/** The title, its letter spacing written as `spacing`. */
const titlePage = (spacing: string) => `<!DOCTYPE html>
<body style="margin: 0">
  <main data-ht-loc="app/page.tsx:20:5">
    <h1 data-ht-loc="app/page.tsx:21:7" style="letter-spacing: ${spacing}">Human Touch</h1>
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

/** The round, as saved and claimed: the title's letter spacing, 0.8px on the canvas, set to `spacing`. */
function spaced(spacing: TextLength) {
  const doc = frameWith(titlePage("0.8px"));
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const changes = createChangeSet();
  const editor = createEditor(views, changes);
  const title = find(editor.tree().root, (layer) => layer.el === doc.querySelector("h1"))!;
  editor.set(title, "letterSpacing", spacing);
  return placedOnCanvas(changes.list(), doc.documentElement.outerHTML);
}

const px = (value: number): TextLength => ({ value, unit: "px" });
const percent = (value: number): TextLength => ({ value, unit: "%" });

describe("letter spacing set to 0 (ticket 142)", () => {
  test("the page writes 0px, Chrome computes normal: a change to 0px, or to 0%, is shown", () => {
    expect(getComputedStyle(frameWith(titlePage("0px")).querySelector("h1")!).letterSpacing).toBe("normal");
    for (const zero of [px(0), percent(0)]) {
      const round = spaced(zero);
      for (const written of ["0px", "0", "0em", "0%", "normal"]) {
        expect(checkChange(frameWith(titlePage(written)), round[0], round), `${zero.value}${zero.unit} on ${written}`).toEqual({ outcome: "shown" });
      }
    }
  });

  test("the page shows 0: a change to 0.5px, or to 2%, is not shown, the page's 0 read as 0%", () => {
    for (const other of [px(0.5), percent(2)]) {
      const round = spaced(other);
      expect(checkChange(frameWith(titlePage("0px")), round[0], round)).toEqual({ outcome: "not shown", actual: percent(0) });
    }
  });

  test("any other length is compared by its unit, as ever: 2px is not shown where the page writes 0.0625em, 2px at the title's 32px", () => {
    const round = spaced(px(2));
    expect(checkChange(frameWith(titlePage("2px")), round[0], round)).toEqual({ outcome: "shown" });
    expect(checkChange(frameWith(titlePage("0.0625em")), round[0], round)).toEqual({ outcome: "not shown", actual: percent(6.25) });
  });
});
