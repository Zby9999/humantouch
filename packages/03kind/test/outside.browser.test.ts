import { afterEach, expect, test } from "vitest";
import type { Change } from "../src/client/changeset";
import { itself } from "../src/client/check";
import { placedOnCanvas } from "../src/client/moves";
import { noteChange, noteRound, outsideChanged, unnoted } from "../src/client/other-usages";

/**
 * Ticket 104: what a layer showed at a width outside its change's range as the
 * round was claimed, and what it shows there now. Here the window, 800px, is
 * outside the phone's range.
 */
/** On the live page the usage chain comes from React; with none, an element's is empty. */
const chain = "";
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <main data-tk-loc="src/App.tsx:2:5" ${chain} style="display: flex; flex-direction: column; padding: 8px">
    <div id="box" data-tk-loc="src/App.tsx:3:7" ${chain} style="background-color: rgb(255, 255, 255); width: 100px; height: 40px"></div>
    <p data-tk-loc="src/App.tsx:4:7" ${chain} style="margin: 0">Words</p>
  </main>
</body>`;
const PHONE = { min: null, max: 768 };
const target = (loc: string) => ({ loc, chain: [], component: "App", instances: 1, locked: false, unlocated: false }) as unknown as Change["target"];
let id = 0;
const style = (loc: string, property: string, more: Partial<Change> = {}): Change =>
  ({ id: ++id, kind: "style", layer: loc, scope: "usage", property, style: {}, target: target(loc), before: null, after: null, ...more }) as Change;

let frame: HTMLIFrameElement | undefined;
afterEach(() => frame?.remove());
function livePage() {
  frame = document.createElement("iframe");
  frame.style.width = "800px";
  document.body.append(frame);
  const page = frame.contentDocument!;
  page.open();
  page.write(PAGE);
  page.close();
  return page;
}

/** Noted as the window shows the page, then compared after `edit`. */
function noteThenCompare(page: Document, change: Change, round: Change[], edit: () => void) {
  const at = () => itself(page);
  const noted = noteChange(page, change, round, 800, [800], at);
  edit();
  return outsideChanged(page, change, placedOnCanvas(round, ""), noted, [800], at).changed;
}

test("a fill at the phone's breakpoint: the box's fill outside the range changed is told, with what it was and is; kept, nothing", () => {
  const page = livePage();
  const fill = style("src/App.tsx:3:7", "fill", { breakpoint: PHONE });
  const box = page.getElementById("box")!;
  expect(noteThenCompare(page, fill, [fill], () => {})).toEqual([]);
  expect(noteThenCompare(page, fill, [fill], () => (box.style.backgroundColor = "transparent"))).toEqual([{ width: 800, was: { type: "solid", color: "#FFFFFF", opacity: 1 }, is: null }]);
});

test("the round changing another property of the layer, or a layer around it, there: a fill changed is told still", () => {
  const page = livePage();
  const fill = style("src/App.tsx:3:7", "fill", { breakpoint: PHONE });
  const round = [fill, style("src/App.tsx:3:7", "radius"), style("src/App.tsx:2:5", "padding")];
  expect(noteThenCompare(page, fill, round, () => (page.getElementById("box")!.style.backgroundColor = "red"))).toHaveLength(1);
});

test("a width or the text's: the round changing the layer otherwise, or a layer around it, at that width, it is not looked at (no false not shown); at another width only, it is", () => {
  const page = livePage();
  const box = page.getElementById("box")!;
  const width = style("src/App.tsx:3:7", "width", { breakpoint: PHONE });
  const grow = () => (box.style.width = "120px");
  // The box's own padding, in the desktop view: its width may change by it.
  expect(noteThenCompare(page, width, [width, style("src/App.tsx:3:7", "padding")], grow)).toEqual([]);
  box.style.width = "100px";
  // The Stack around it, in the desktop view: the same.
  expect(noteThenCompare(page, width, [width, style("src/App.tsx:2:5", "direction")], grow)).toEqual([]);
  box.style.width = "100px";
  // The Stack around it at the tablet's breakpoint only: not at 800px.
  expect(noteThenCompare(page, width, [width, style("src/App.tsx:2:5", "direction", { breakpoint: { min: 768, max: 790 } })], grow)).toHaveLength(1);
  box.style.width = "100px";
  // Paint alone, on the layer or around it, changes no size: told still.
  expect(noteThenCompare(page, width, [width, style("src/App.tsx:3:7", "fill"), style("src/App.tsx:2:5", "radius")], grow)).toHaveLength(1);
  box.style.width = "100px";
  // The words' size, the text of the Stack around them changed: not looked at; the Stack's padding or fill: told.
  const size = style("src/App.tsx:4:7", "fontSize", { breakpoint: PHONE });
  const p = page.querySelector("p")!;
  expect(noteThenCompare(page, size, [size, style("src/App.tsx:2:5", "fontFamily")], () => (p.style.fontSize = "20px"))).toEqual([]);
  p.style.fontSize = "";
  expect(noteThenCompare(page, size, [size, style("src/App.tsx:2:5", "padding"), style("src/App.tsx:4:7", "fill")], () => (p.style.fontSize = "20px"))).toHaveLength(1);
});

test("a width outside the range the page cannot be shown at now: said to be loading, not kept", () => {
  const page = livePage();
  const fill = style("src/App.tsx:3:7", "fill", { breakpoint: PHONE });
  const noted = noteChange(page, fill, [fill], 800, [800, 768], (w) => (w === 800 ? itself(page) : null));
  expect(unnoted(noted, [800, 768])).toEqual([768]);
  expect(outsideChanged(page, fill, placedOnCanvas([fill], ""), { width: 800, seen: [], outside: [{ width: 768, values: [] }] }, [768], () => null)).toEqual({ changed: [], loading: true });
});

test("noted as the code begins to change with no claim (ticket 78): as wide as the window alone", () => {
  const page = livePage();
  const fill = style("src/App.tsx:3:7", "fill", { breakpoint: PHONE });
  const noted = noteRound(page, [fill], 800, [768, 390]);
  expect(noted.get(fill.id)?.outside).toEqual([{ width: 800, values: [{ type: "solid", color: "#FFFFFF", opacity: 1 }] }]);
  // The window in the phone's range: nothing to note.
  expect(noteRound(page, [fill], 390, [768, 390]).size).toBe(0);
});
