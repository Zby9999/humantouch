import { afterEach, describe, expect, test, vi } from "vitest";
import { copyCanvas, freeze, restore, serializeCanvas } from "../src/client/freezer";
import { CATCH_UP_AFTER_MS, createViews, type View } from "../src/client/views";

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

/** Once the next frame is painted. */
const painted = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done)));
/** Once the next frame begins: with timers faked, too. */
const frame = () => new Promise((done) => requestAnimationFrame(done));

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

  test("each view is as tall as what it shows, grows and shrinks with it before the next paint, and is never shorter than the window; heights still answer to the window", async () => {
    const canvas = await freeze(livePage(), iframe());
    const views = createViews(canvas);
    const phone = await views.add(iframe(), 390);
    const [desktop] = views.list();
    let resized = 0;
    views.onResize(() => resized++);
    const frameOf = (doc: Document) => doc.defaultView!.frameElement as HTMLIFrameElement;
    /** Every view as tall as its page, and its iframe as tall as the view. */
    const fitted = () => {
      for (const view of [desktop, phone]) {
        expect(frameOf(view.document).offsetHeight).toBe(view.height);
        expect(view.document.documentElement.scrollHeight).toBe(view.height);
      }
    };
    const before = desktop.height;
    fitted();

    const more = canvas.document.createElement("div");
    more.style.height = "3000px";
    canvas.document.body.append(more);
    await painted();
    expect(desktop.height).toBe(before + 3000);
    expect(phone.height).toBeGreaterThanOrEqual(before + 3000);
    expect(resized).toBeGreaterThan(0);
    fitted();

    more.remove();
    await painted();
    expect(desktop.height).toBe(before);
    fitted();

    // All but the top of the page gone: as tall as the window it was frozen in.
    for (const el of [...canvas.document.body.children].slice(2)) el.remove();
    await painted();
    for (const view of [desktop, phone]) {
      expect(view.height).toBe(600);
      expect(frameOf(view.document).offsetHeight).toBe(600);
    }
    // What answers to the height answers to the window still, whatever the view's height.
    canvas.document.body.append(Object.assign(canvas.document.createElement("div"), { id: "units" }));
    await painted();
    expect(style(phone.document, "units").height).toBe("300px");
    expect(style(desktop.document, "tall").color).toBe("rgb(0, 128, 0)");
  });

  test("while a drag pins the views' heights, nothing shifted on the canvas makes a view taller; let go, each is as tall as what it shows again", async () => {
    const canvas = await freeze(livePage(), iframe());
    const views = createViews(canvas);
    const phone = await views.add(iframe(), 390);
    const [desktop] = views.list();
    await painted();
    let resized = 0;
    views.onResize(() => resized++);
    const frameOf = (doc: Document) => doc.defaultView!.frameElement as HTMLIFrameElement;
    const heights = () => [desktop, phone].map((view) => [view.height, frameOf(view.document).offsetHeight]);
    const before = heights();

    const release = views.pinHeights();
    // Dragged far below the bottom of the page, as a drag shifts it: on the canvas, so in every view.
    const dragged = canvas.document.getElementById("narrow")!;
    dragged.style.setProperty("translate", "0 5000px", "important");
    await painted();
    expect(heights()).toEqual(before);
    expect(resized).toBe(0);

    // Let go: the layer is back where it was, and what it was dropped into made the page taller.
    dragged.style.removeProperty("translate");
    const more = canvas.document.createElement("div");
    more.style.height = "500px";
    canvas.document.body.append(more);
    release();
    await painted();
    expect(desktop.height).toBe(before[0][0] + 500);
    expect(frameOf(desktop.document).offsetHeight).toBe(desktop.height);
    expect(phone.height).toBeGreaterThanOrEqual(before[1][0] + 500);
    expect(resized).toBeGreaterThan(0);
  });

  test("layers making room for a drag in the desktop view go straight to their place there; the views beside follow once the shifts pause, the latest at once", async () => {
    const canvas = await freeze(livePage(), iframe());
    const views = createViews(canvas);
    const phone = await views.add(iframe(), 390);
    const tablet = await views.add(iframe(), 450);
    const [desktop] = views.list();
    const making = canvas.document.getElementById("tall")!;
    const shifted = (view: View) => style(view.document, "tall").translate;
    const styles = () => [desktop, phone, tablet].map((view) => view.document.getElementById("tall")!.getAttribute("style"));
    const before = styles();
    let caughtUp = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      views.makeRoom(desktop, new Map([[making, { x: 0, y: 20 }]]), () => caughtUp++);
      expect(shifted(desktop)).toBe("0px 20px");
      expect(style(desktop.document, "tall").transitionDuration).toBe("0s");
      // Not before the next paint either: the canvas did not change for the views beside to follow.
      await frame();
      for (const view of [phone, tablet]) expect(shifted(view)).toBe("none");
      // The pointer moves on, the place changes: the pause starts again.
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS - 1);
      views.makeRoom(desktop, new Map([[making, { x: 0, y: 30 }]]), () => caughtUp++);
      expect(shifted(desktop)).toBe("0px 30px");
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS - 1);
      for (const view of [phone, tablet]) expect(shifted(view)).toBe("none");
      expect(caughtUp).toBe(0);
      vi.advanceTimersByTime(1);
      for (const view of [phone, tablet]) {
        expect(shifted(view)).toBe("0px 30px");
        expect(style(view.document, "tall").transitionDuration).toBe("0s");
      }
      expect(caughtUp).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    // Let go: back in every view at once, and nothing of it is left on the canvas.
    views.stopMakingRoom();
    for (const view of [desktop, phone, tablet]) expect(shifted(view)).toBe("none");
    expect(styles()).toEqual(before);
    await frame();
    expect(styles()).toEqual(before);
  });

  test("dragged in the phone view, the layers making room go there at once; the desktop view, which is the canvas, follows with the tablet view once the shifts pause, or as it is read", async () => {
    const canvas = await freeze(livePage(), iframe());
    const views = createViews(canvas);
    const phone = await views.add(iframe(), 390);
    const tablet = await views.add(iframe(), 450);
    const [desktop] = views.list();
    const making = canvas.document.getElementById("inline")!;
    const shifted = (view: View) => style(view.document, "inline").translate;
    const styles = () => [desktop, phone, tablet].map((view) => view.document.getElementById("inline")!.getAttribute("style"));
    const before = styles();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      views.makeRoom(phone, new Map([[making, { x: 10, y: 0 }]]));
      expect(shifted(phone)).toBe("10px");
      await frame();
      for (const view of [desktop, tablet]) expect(shifted(view)).toBe("none");
      // Read, a view shows it first.
      views.sync(tablet);
      expect(shifted(tablet)).toBe("10px");
      expect(shifted(desktop)).toBe("none");
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS);
      expect(shifted(desktop)).toBe("10px");
      // Nothing makes room now, dragged off the canvas: back in the phone view at once, in the others after the pause.
      views.makeRoom(phone, new Map());
      expect(shifted(phone)).toBe("none");
      await frame();
      for (const view of [desktop, tablet]) expect(shifted(view)).toBe("10px");
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS);
      for (const view of [desktop, tablet]) expect(shifted(view)).toBe("none");
      // Shifted again and let go before the pause: back everywhere, its own style as it was.
      views.makeRoom(phone, new Map([[making, { x: 5, y: 5 }]]));
      views.stopMakingRoom();
      vi.advanceTimersByTime(CATCH_UP_AFTER_MS);
    } finally {
      vi.useRealTimers();
    }
    await frame();
    for (const view of [desktop, phone, tablet]) expect(shifted(view)).toBe("none");
    expect(styles()).toEqual(before);
  });

  test("a canvas saved and put back answers to each view's width the same way", async () => {
    const saved = serializeCanvas(await freeze(livePage(), iframe()));
    const canvas = await restore(saved, iframe());
    const phone = await createViews(canvas).add(iframe(), 390);

    expectAt(canvas.document, 800);
    expectAt(phone.document, 390);
  });
});

describe("freezing what the designer had scrolled", () => {
  test("a box scrolled down, a text area, a field scrolled across and a list are shown scrolled as they were; nothing else is marked scrolled", async () => {
    const live = iframe(800, 600);
    const doc = live.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html>
<body style="margin: 0">
  <div id="box" style="height: 100px; overflow: auto"><div style="height: 1000px"></div></div>
  <div id="hidden" style="height: 100px; overflow-x: hidden"><div style="height: 1000px; width: 2000px"></div></div>
  <textarea id="area" rows="2">${"line\n".repeat(40)}</textarea>
  <input id="field" style="width: 60px" value="${"wide ".repeat(40)}">
  <select id="list" size="2">${"<option>o</option>".repeat(20)}</select>
  <div id="plain"><div style="height: 50px"></div></div>
</body>`);
    doc.close();
    const scroll = { box: [0, 300], hidden: [500, 0], area: [0, 120], field: [80, 0], list: [0, 60] } as const;
    for (const [id, [left, top]] of Object.entries(scroll)) doc.getElementById(id)!.scrollTo(left, top);
    const shown = Object.fromEntries(Object.keys(scroll).map((id) => [id, [doc.getElementById(id)!.scrollLeft, doc.getElementById(id)!.scrollTop]]));
    expect(shown.box).toEqual([0, 300]);

    const canvas = await freeze(live.contentWindow!, iframe());

    for (const id of Object.keys(scroll)) {
      const el = canvas.document.getElementById(id)!;
      expect([el.scrollLeft, el.scrollTop], id).toEqual(shown[id]);
    }
    expect(canvas.document.querySelectorAll("[data-vk-scroll]")).toHaveLength(Object.keys(scroll).length);
  });
});

describe("bringing the copy to rest", () => {
  /** A page that uses a font of its own, still loading as it is frozen, or none. */
  function pageWithFont(font: boolean): Window {
    const live = iframe(800, 600);
    const doc = live.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html>
<style>${font ? `@font-face { font-family: Slow; src: url("/never-there-${Math.random()}.woff2") } p { font-family: Slow, sans-serif }` : ""}</style>
<p>Words</p>`);
    doc.close();
    return live.contentWindow!;
  }
  /** Whether `promise` has settled once the microtasks queued so far have run: within the task that made it. */
  async function settledAtOnce(promise: Promise<unknown>) {
    let settled = false;
    void promise.then(() => (settled = true));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    return settled;
  }

  test("with nothing left to load, the copy is at rest in the task that froze it", async () => {
    expect(await settledAtOnce(freeze(pageWithFont(false), iframe()))).toBe(true);
  });

  test("a font still loading is waited for", async () => {
    const frozen = freeze(pageWithFont(true), iframe());
    expect(await settledAtOnce(frozen)).toBe(false);
    await frozen;
  });

  test("a view waiting for a font is as tall as what it shows meanwhile, never cut off at the height of a wider one", async () => {
    const live = pageWithFont(true);
    live.document.querySelector("p")!.textContent = "Words that wrap many times over in a narrow view. ".repeat(40);
    const canvas = await freeze(live, iframe());
    expect(canvas.height).toBe(600);
    const narrow = iframe();
    const copied = copyCanvas(canvas, narrow, 200);
    expect(await settledAtOnce(copied)).toBe(false);
    const shows = narrow.contentDocument!.documentElement.scrollHeight;
    expect(shows).toBeGreaterThan(600);
    expect(narrow.offsetHeight).toBe(shows);
    await copied;
  });
});
