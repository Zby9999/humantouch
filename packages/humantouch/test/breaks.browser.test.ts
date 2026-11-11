import { afterEach, expect, test } from "vitest";
import type { Change } from "../src/client/changeset";
import { breakWidthsOf, checkAcross, effectNotes, itself, type PageWidth } from "../src/client/check";
import { placedOnCanvas } from "../src/client/moves";
import { breaksNow, noteChange, noteRound, type OtherUsagesNoted } from "../src/client/other-usages";
import { watchPage } from "../src/client/page-checks";
import { CODE_EVENT, type CheckReport } from "../src/service-protocol";

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

test("broken already when the round was claimed, the same way, as far: not said; a few px further, not either; cut off already, and wider too now, the wider is", () => {
  const page = pageOf(PAGE("#column { overflow-x: auto } #box { width: 400px }"));
  expect(breaksBy(page, style(BOX, "width"), widen(page, "width: 402px"))).toEqual([]);
  const hidden = pageOf(PAGE("#column { overflow: hidden; height: 20px }"));
  expect(breaksBy(hidden, style(BOX, "width"), widen(hidden, "width: 100px; height: 42px"))).toEqual([]);
  const wider = pageOf(PAGE("#column { overflow: hidden; height: 20px }"));
  expect(breaksBy(wider, style(BOX, "width"), widen(wider, "width: 500px; height: 40px"))).toContainEqual({ width: 390, kind: "wider", of: "layer", size: 500, room: 342 });
});

test("broken already the same way, but further now (ticket 147's review): wider than its column by more, or cut off further, is said; the page reaching further past the screen too", () => {
  const page = pageOf(PAGE("#box { width: 400px }"));
  expect(breaksBy(page, style(BOX, "width"), widen(page))).toEqual([
    { width: 390, kind: "page", of: "layer" },
    { width: 390, kind: "wider", of: "layer", size: 500, room: 342 },
  ]);
  const hidden = pageOf(PAGE("#column { overflow: hidden; height: 20px }"));
  expect(breaksBy(hidden, style(BOX, "height"), widen(hidden, "height: 80px"))).toEqual([{ width: 390, kind: "clipped", of: "layer" }]);
});

test("pushed past the screen's start edge, which the page cannot be scrolled to: cut off by the screen; right to left, past its right edge", () => {
  const page = pageOf(PAGE("#column { position: relative; height: 40px } #box { position: absolute; left: 0 }"));
  expect(breaksBy(page, style(BOX, "x"), widen(page, "left: -60px"))).toEqual([{ width: 390, kind: "clipped", of: "layer", by: "screen" }]);
  const rtl = pageOf(PAGE("#column { position: relative; height: 40px } #box { position: absolute; right: 0 }").replace("<body", '<html dir="rtl"><body'));
  expect(breaksBy(rtl, style(BOX, "x"), widen(rtl, "right: -60px"))).toEqual([{ width: 390, kind: "clipped", of: "layer", by: "screen" }]);
  // Right to left, past the left edge is the page's end: it scrolls to it.
  const end = pageOf(PAGE("#column { position: relative; height: 40px } #box { position: absolute; right: 0 }").replace("<body", '<html dir="rtl"><body'));
  expect(breaksBy(end, style(BOX, "x"), widen(end, "right: 360px"))).toEqual([{ width: 390, kind: "page", of: "layer" }]);
});

test("placed absolute: an element between it and the box it is placed in that hides what overflows does not cut it off; the box it is placed in does", () => {
  const between = pageOf(PAGE("main { position: relative } #column { overflow: hidden; height: 20px } #box { position: absolute; top: 0 }"));
  expect(breaksBy(between, style(BOX, "height"), widen(between, "height: 80px"))).toEqual([]);
  const placedIn = pageOf(PAGE("#column { position: relative; overflow: hidden; height: 20px } #box { position: absolute; top: 0 }"));
  expect(breaksBy(placedIn, style(BOX, "height"), widen(placedIn, "height: 80px"))).toEqual([{ width: 390, kind: "clipped", of: "layer" }]);
  // Nor, for the box it is placed in, one between that and the box that is placed in.
  const up = pageOf(
    PAGE("main { position: relative } #column { overflow: hidden; height: 20px } #inner { position: absolute; top: 0; left: 0; width: 200px } #box { position: absolute; top: 0 }").replace(
      '<div id="box"',
      '<div id="inner" style="position: absolute"><div id="box"',
    ).replace('data-ht-loc="src/App.tsx:4:9"></div>', 'data-ht-loc="src/App.tsx:4:9"></div></div>'),
  );
  expect(breaksBy(up, style(BOX, "height"), widen(up, "height: 80px"))).toEqual([]);
});

test("noted late, after the code changed: every break found is said, as the page cannot tell which are new", () => {
  const page = pageOf(PAGE("#box { width: 400px }"));
  const width = style(BOX, "width");
  const at = () => itself(page);
  const noted = noteChange(page, width, [width], 390, [], at, [390], true);
  expect(noted?.breaks?.[0]).toMatchObject({ width: 390, late: true });
  expect(breaksNow(page, width, onCanvas([width]), noted, [390], at).found).toEqual([
    { width: 390, kind: "page", of: "layer", late: true },
    { width: 390, kind: "wider", of: "layer", size: 400, room: 342, late: true },
  ]);
});

test("looked at for breaks: not a change to a property that cannot break the layout, a fill, a radius, opacity, a shadow, the text's alignment", () => {
  for (const property of ["fill", "radius", "opacity", "shadows", "textColor", "textAlign"]) {
    const one = style(BOX, property);
    expect(breakWidthsOf(one, [one], 1280, [768, 390])).toEqual([]);
  }
  for (const property of ["padding", "gap", "fontSize", "letterSpacing", "stroke", "x"]) {
    const one = style(BOX, property);
    expect(breakWidthsOf(one, [one], 1280, [768, 390])).toEqual([1280, 768, 390]);
  }
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
function watch(page: Document, round: Change[], more: Partial<Parameters<typeof watchPage>[0]> = {}) {
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
    ...more,
  });
  return { checks, noted, last: (one: number) => reports.filter((r) => r.id === one).at(-1) };
}

test("the page's checks: what breaks is noted as they begin; the code written so that the box breaks the layout, it is not shown, though its value is; within the screen, shown", async () => {
  // 600px wide: its column 552px, room for the box 500px wide.
  const page = pageOf(PAGE(), 600);
  const width = style(BOX, "width", { before: { type: "fixed", value: 100 }, after: { type: "fixed", value: 500 }, style: { width: "500px" } });
  const { checks, noted, last } = watch(page, [width]);
  await expect.poll(() => noted.get(width.id)?.breaks).toEqual([{ width: 600, scrolls: false, seen: [], over: { page: 0 } }]);
  await expect.poll(() => last(width.id)?.outcome).toBe("not shown");

  widen(page, "width: 500px; margin-left: 200px")();
  await expect.poll(() => last(width.id)).toMatchObject({ outcome: "not shown", actual: width.after, breaks: [{ width: 600, kind: "page", of: "layer" }] });
  widen(page)();
  await expect.poll(() => last(width.id)?.outcome).toBe("shown");
  expect(last(width.id)).not.toHaveProperty("breaks");
  checks.stop();
});

/** The box 400px wide in its 342px column at a phone's width, a change making it so: broken already, or by the change, the page cannot tell by looking now. */
const brokenBox = () => {
  const page = pageOf(PAGE("#box { width: 400px }"));
  const width = style(BOX, "width", { before: { type: "fixed", value: 100 }, after: { type: "fixed", value: 400 }, style: { width: "400px" } });
  return { page, width };
};

test("late notes, the claim's way (ticket 147's review): a page that could note nothing before the code changed notes late, and every break it finds is said, as late", async () => {
  const { page, width } = brokenBox();
  // Opened since the claim, or the code changed first: what a change's style moves it could not note either.
  const { checks, noted, last } = watch(page, [width], { effects: effectNotes(false) });
  await expect.poll(() => noted.get(width.id)?.breaks?.[0]?.late).toBe(true);
  await expect.poll(() => last(width.id)).toMatchObject({ outcome: "not shown", breaks: [{ width: 390, kind: "page", late: true }, { width: 390, kind: "wider", late: true }] });
  checks.stop();
});

test("late notes, the claim's way: the code changing once the checks began, a width noted from then on is late", async () => {
  const { page, width } = brokenBox();
  const { checks, noted, last } = watch(page, [width], { viewWidths: () => [], otherUsages: new Map([[width.id, null]]) });
  // Noted already for other usages (none), not for breaks: the code comes in first.
  page.defaultView!.dispatchEvent(new Event(CODE_EVENT));
  await expect.poll(() => noted.get(width.id)?.breaks?.[0]?.late).toBe(true);
  await expect.poll(() => last(width.id)?.outcome).toBe("not shown");
  checks.stop();
});

test("late notes, ticket 78's way: noted as wide as the window as the code began to change, before it, not late: what was broken then is not said", async () => {
  const { page, width } = brokenBox();
  const before = noteRound(page, [width], 390);
  expect(before.get(width.id)?.breaks?.[0]).not.toHaveProperty("late");
  // The round claimed for the Agent once a change showed: the code has changed, the window's note goes from before it.
  const { checks, last } = watch(page, [width], { effects: effectNotes(false), otherUsages: before });
  await expect.poll(() => last(width.id)?.outcome).toBe("shown");
  checks.stop();
});
