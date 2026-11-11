import { afterEach, expect, test } from "vitest";
import type { Change } from "../src/client/changeset";
import { breakWidthsOf, checkAcross, itself, type PageWidth } from "../src/client/check";
import { placedOnCanvas } from "../src/client/moves";
import { breaksNow, noteChange, type OtherUsagesNoted } from "../src/client/other-usages";
import { watchPage } from "../src/client/page-checks";
import type { CheckReport } from "../src/service-protocol";

/**
 * ADR 0016, ticket 147: at the width a change is made at the page is to draw
 * it as the canvas does; at other views' widths a change made in the desktop
 * view may be adapted; at any width, its layer is not to break the layout as
 * it did not as the round was claimed: make the page wider than the screen,
 * be wider than its container, or be cut off by something around it.
 */
const target = (loc: string) => ({ loc, chain: [], component: "App", instances: 1, locked: false, unlocated: false, context: { path: [], element: "<div>" } }) as unknown as Change["target"];
let id = 0;
const style = (loc: string, property: string, more: Partial<Change> = {}): Change =>
  ({ id: ++id, kind: "style", layer: loc, scope: "usage", property, style: {}, target: target(loc), before: null, after: null, ...more }) as Change;
const onCanvas = (round: Change[]) => placedOnCanvas(round, "");

/** A page with a box in a column, `css` of its own; the column 342px wide at 390px, as a phone's. */
const PAGE = (css = "", more = "") => `<!DOCTYPE html>
<body style="margin: 0">
  <style>main { padding: 0 24px } #box { width: 100px; height: 40px } ${css}</style>
  <main data-ht-loc="src/App.tsx:2:5">
    <section id="column" data-ht-loc="src/App.tsx:3:7"><div id="box" data-ht-loc="src/App.tsx:4:9"></div></section>
    ${more}
  </main>
</body>`;
const BOX = "src/App.tsx:4:9";

const frames: HTMLIFrameElement[] = [];
afterEach(() => frames.splice(0).forEach((frame) => frame.remove()));
/** `html` shown `width` px wide. */
function pageOf(html: string, width = 390): Document {
  const frame = document.createElement("iframe");
  frame.style.width = `${width}px`;
  frame.style.height = "300px";
  document.body.append(frame);
  frames.push(frame);
  const page = frame.contentDocument!;
  page.open();
  page.write(html);
  page.close();
  return page;
}

/** The breaks `edit` makes of the box's layer as the window shows the page, noted before it. */
function breaksBy(page: Document, change: Change, edit: () => void) {
  const width = page.defaultView!.innerWidth;
  const at = () => itself(page);
  const noted = noteChange(page, change, [change], width, [], at, [width]);
  edit();
  return breaksNow(page, change, onCanvas([change]), noted, [width], at).found;
}

const widen = (page: Document, css = "width: 500px") => () => page.getElementById("box")!.setAttribute("style", css);

test("the box made 500px wide at a phone's width: the page wider than the screen, and the box wider than its column; as wide as before, nothing", () => {
  const page = pageOf(PAGE());
  const width = style(BOX, "width");
  expect(breaksBy(page, width, () => {})).toEqual([]);
  expect(breaksBy(page, width, widen(page))).toEqual([
    { width: 390, kind: "page", of: "layer" },
    { width: 390, kind: "wider", of: "layer", size: 500, room: 342 },
  ]);
});

test("the page wider than the screen already as the round was claimed: not said again; the box wider than its column is", () => {
  const page = pageOf(PAGE("", '<div style="width: 600px; height: 10px"></div>'));
  expect(page.documentElement.scrollWidth).toBeGreaterThan(390);
  expect(breaksBy(page, style(BOX, "width"), widen(page))).toEqual([{ width: 390, kind: "wider", of: "layer", size: 500, room: 342 }]);
});

test("the page wider than the screen alone: a box placed absolute past its right edge, which no container lays out", () => {
  const page = pageOf(PAGE("#column { position: relative; height: 40px } #box { position: absolute; left: 0 }"));
  expect(breaksBy(page, style(BOX, "x"), widen(page, "left: 400px"))).toEqual([{ width: 390, kind: "page", of: "layer" }]);
});

test("wider than its column alone, the column scrolling across: the page stays as wide as the screen", () => {
  const page = pageOf(PAGE("#column { overflow-x: auto }"));
  expect(breaksBy(page, style(BOX, "width"), widen(page))).toEqual([{ width: 390, kind: "wider", of: "layer", size: 500, room: 342 }]);
});

test("cut off by its column, which hides what overflows it: down, as it grows taller; across, wider too", () => {
  const page = pageOf(PAGE("#column { overflow: hidden; height: 60px }"));
  expect(breaksBy(page, style(BOX, "height"), widen(page, "height: 100px"))).toEqual([{ width: 390, kind: "clipped", of: "layer" }]);
  const across = pageOf(PAGE("#column { overflow: hidden; height: 60px }"));
  expect(breaksBy(across, style(BOX, "width"), widen(across))).toEqual([
    { width: 390, kind: "wider", of: "layer", size: 500, room: 342 },
    { width: 390, kind: "clipped", of: "layer" },
  ]);
});

test("its container made wider than the column around it: the box growing a container as wide as what is in it", () => {
  const page = pageOf(PAGE("#column { width: max-content }"));
  const found = breaksBy(page, style(BOX, "width"), widen(page));
  expect(found).toContainEqual({ width: 390, kind: "wider", of: "container", size: 500, room: 342 });
  expect(found).toContainEqual({ width: 390, kind: "page", of: "layer" });
});

test("broken already as the round was claimed, the same way: not said; cut off already, and wider too now, the wider alone is", () => {
  const page = pageOf(PAGE("#column { overflow-x: auto } #box { width: 400px }"));
  expect(breaksBy(page, style(BOX, "width"), widen(page))).toEqual([]);
  const hidden = pageOf(PAGE("#column { overflow: hidden; height: 20px }"));
  expect(breaksBy(hidden, style(BOX, "width"), widen(hidden))).toEqual([{ width: 390, kind: "wider", of: "layer", size: 500, room: 342 }]);
});

test("a box not drawn, as `display: none` makes it: no break to tell", () => {
  const page = pageOf(PAGE());
  expect(breaksBy(page, style(BOX, "width"), widen(page, "width: 500px; display: none"))).toEqual([]);
});

test("looked at for breaks: a style change at every width it is to show at; not a change to the structure, nor one to a layer with no source marker", () => {
  const width = style(BOX, "width");
  expect(breakWidthsOf(width, [width], 1280, [768, 390])).toEqual([1280, 768, 390]);
  const phone = style(BOX, "width", { breakpoint: { min: null, max: 768 } });
  // At a breakpoint, the width its range is looked at, as wide as the window is not in it.
  expect(breakWidthsOf(phone, [phone], 1280, [768, 390])).toEqual([767]);
  expect(breakWidthsOf(phone, [phone], 390, [768, 390])).toEqual([390]);
  const unmarked = style("", "width", { target: target("") });
  expect(breakWidthsOf(unmarked, [unmarked], 1280, [768, 390])).toEqual([]);
  const deleted = { ...width, kind: "delete" } as Change;
  expect(breakWidthsOf(deleted, [deleted], 1280, [768, 390])).toEqual([]);
});

test("a width made in the desktop view, drawn otherwise at a view's width: shown, adapted there, with how wide it is drawn; at the window's own width, not shown still", () => {
  const live = pageOf(PAGE("#box { width: 500px }"), 1000);
  const phone = pageOf(PAGE("#box { width: 100% }"), 390);
  const at = (w: number): PageWidth => ({ width: w, doc: phone, own: false, of: (el) => phone.getElementById(el.id) });
  const width = style(BOX, "width", { before: { type: "fixed", value: 100 }, after: { type: "fixed", value: 500 }, style: { width: "500px" } });
  expect(checkAcross(live, width, onCanvas([width]), [390], at)).toEqual({ outcome: "shown", adapted: [{ width: 390, actual: { type: "fill" }, drawn: 342 }] });
  // Not so as wide as the window: the change's own width.
  live.getElementById("box")!.style.width = "100%";
  expect(checkAcross(live, width, onCanvas([width]), [390], at)).toMatchObject({ outcome: "not shown" });
  // At a breakpoint, strict in its range still.
  const atPhone = { ...width, breakpoint: { min: null, max: 768 } } as Change;
  expect(checkAcross(live, atPhone, onCanvas([atPhone]), [390], at)).toEqual({ outcome: "not shown", actual: { type: "fill" } });
});

/** The page's checks of `round` on `page`, as a claimed round's are, the window its only width. */
function watch(page: Document, round: Change[]) {
  const reports: CheckReport[] = [];
  const noted = new Map<number, OtherUsagesNoted | null>();
  const checks = watchPage({
    window: page.defaultView!,
    changes: onCanvas(round),
    report: (r) => reports.push(r),
    onShown() {},
    viewWidths: () => [],
    copiesIn: () => document.body,
    onNoted: (one, notes) => noted.set(one, notes),
  });
  return { checks, noted, last: (one: number) => reports.filter((r) => r.id === one).at(-1) };
}

test("the page's checks: what breaks is noted as they begin; the code written so that the box breaks the layout, it is not shown, though its value is; within the screen, shown", async () => {
  // 600px wide: its column 552px, room for the box 500px wide.
  const page = pageOf(PAGE(), 600);
  const width = style(BOX, "width", { before: { type: "fixed", value: 100 }, after: { type: "fixed", value: 500 }, style: { width: "500px" } });
  const { checks, noted, last } = watch(page, [width]);
  await expect.poll(() => noted.get(width.id)?.breaks).toEqual([{ width: 600, scrolls: false, seen: [] }]);
  await expect.poll(() => last(width.id)?.outcome).toBe("not shown");

  widen(page, "width: 500px; margin-left: 200px")();
  await expect.poll(() => last(width.id)).toMatchObject({ outcome: "not shown", actual: width.after, breaks: [{ width: 600, kind: "page", of: "layer" }] });
  widen(page)();
  await expect.poll(() => last(width.id)?.outcome).toBe("shown");
  expect(last(width.id)).not.toHaveProperty("breaks");
  checks.stop();
});
