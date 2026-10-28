import { afterEach, describe, expect, test } from "vitest";
import { freeze, restore, serializeCanvas } from "../src/client/freezer";
import { createViews } from "../src/client/views";

/**
 * A page that answers to the window's size in CSS: a media query on width
 * (and one on height), viewport units in a rule and in a style attribute,
 * orientation, and a bar fixed across the top of the window.
 */
const PAGE = `<!DOCTYPE html>
<style>
  body { margin: 0 }
  #narrow { height: 10px; background: rgb(0, 0, 255) }
  @media (max-width: 500px) { #narrow { background: rgb(255, 0, 0) } }
  @media (min-width: 400px) and (min-height: 500px) { #tall { color: rgb(0, 128, 0) } }
  @media (max-height: 499px) { #tall { color: rgb(255, 0, 0) } }
  @media (orientation: portrait) { #turned { color: rgb(0, 0, 255) } }
  #units { height: 50vh; width: 10vw }
  #bar { position: fixed; top: 0; left: 0; right: 0; height: 20px }
</style>
<body>
  <div id="narrow"></div>
  <p id="tall">Tall</p>
  <p id="turned">Turned</p>
  <div id="units"></div>
  <div id="inline" style="height: 10vh; width: 50vw"></div>
  <div id="bar"></div>
  <div style="height: 2000px"></div>
</body>`;

const made: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const iframe of made.splice(0)) iframe.remove();
});

function iframe(width?: number, height?: number): HTMLIFrameElement {
  const el = document.createElement("iframe");
  if (width) el.style.width = `${width}px`;
  if (height) el.style.height = `${height}px`;
  el.style.border = "0";
  document.body.append(el);
  made.push(el);
  return el;
}

/** The page, live in a window 800 × 600. */
function livePage(): Window {
  const live = iframe(800, 600);
  const doc = live.contentDocument!;
  doc.open();
  doc.write(PAGE);
  doc.close();
  return live.contentWindow!;
}

const style = (doc: Document, id: string) => getComputedStyle(doc.getElementById(id)!);

/** How the page answers to a window `width` wide and 600 tall, as a view `doc` shows it. */
function expectAt(doc: Document, width: number) {
  const narrow = width <= 500;
  expect(style(doc, "narrow").backgroundColor).toBe(narrow ? "rgb(255, 0, 0)" : "rgb(0, 0, 255)");
  expect(style(doc, "tall").color).toBe(width >= 400 ? "rgb(0, 128, 0)" : "rgb(0, 0, 0)");
  expect(style(doc, "turned").color).toBe(width <= 600 ? "rgb(0, 0, 255)" : "rgb(0, 0, 0)");
  expect(style(doc, "units").height).toBe("300px");
  expect(parseFloat(style(doc, "units").width)).toBeCloseTo(width / 10, 1);
  expect(style(doc, "inline").height).toBe("60px");
  expect(parseFloat(style(doc, "inline").width)).toBeCloseTo(width / 2, 1);
  expect(doc.getElementById("bar")!.getBoundingClientRect().width).toBe(width);
}

describe("the canvas shown at several widths", () => {
  test("each view answers to its own width as a window that wide would, and to the height of the window the page was frozen in", async () => {
    const canvas = await freeze(livePage(), iframe());
    const views = createViews(canvas);
    const phone = await views.add(iframe(), 390);
    const tablet = await views.add(iframe(), 450);

    // The canvas is as tall as the whole page; heights are still the window's.
    expect(canvas.height).toBeGreaterThan(2000);
    expectAt(canvas.document, 800);
    expectAt(phone.document, 390);
    expectAt(tablet.document, 450);
  });

  test("a canvas saved and put back answers to each view's width the same way", async () => {
    const saved = serializeCanvas(await freeze(livePage(), iframe()));
    const canvas = await restore(saved, iframe());
    const phone = await createViews(canvas).add(iframe(), 390);

    expectAt(canvas.document, 800);
    expectAt(phone.document, 390);
  });
});
