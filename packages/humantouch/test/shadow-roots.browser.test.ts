import { afterEach, describe, expect, test } from "vitest";
import { freeze, restore, serializeCanvas } from "../src/client/freezer";
import { createViews } from "../src/client/views";

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

/** `html` live in a window 800 × 600; `then` runs on it once it is written. */
function livePage(html: string, then?: (doc: Document) => void): Window {
  const live = iframe(800, 600);
  const doc = live.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  then?.(doc);
  return live.contentWindow!;
}

/**
 * A page with no shadow root, with a bit of everything the freezer handles:
 * rules on the window's size, rules inserted through the CSSOM, constructable
 * sheets, an element of a custom name, a template, a still, form fields,
 * something fixed, scripts.
 */
const NO_SHADOW = `<!DOCTYPE html>
<html lang="en"><head>
<style>body { margin: 0 } @media (max-width: 500px) { p { color: red } } .units { height: 50vh }</style>
<style id="cssom"></style>
</head><body>
<my-card data-kind="plain"><span>Light</span></my-card>
<template id="kept"><b>Kept</b></template>
<p>Words</p>
<canvas width="4" height="4"></canvas>
<input value="typed"><input type="checkbox" checked><textarea>area</textarea>
<select><option>one</option><option selected>two</option></select>
<div class="units" style="width: 10vw"></div>
<div style="position: fixed; top: 0; height: 10px; width: 10px"></div>
<script>void 0</script><noscript>Off</noscript>
</body></html>`;

function withExtras(doc: Document) {
  (doc.getElementById("cssom") as HTMLStyleElement).sheet!.insertRule("p { letter-spacing: 1px }");
  const sheet = new (doc.defaultView as Window & typeof globalThis).CSSStyleSheet();
  sheet.replaceSync("my-card { display: block; padding: 4px }");
  doc.adoptedStyleSheets = [sheet];
  const still = doc.querySelector("canvas")!.getContext("2d")!;
  still.fillStyle = "#f00";
  still.fillRect(0, 0, 2, 2);
}

/**
 * A page with an open shadow root styled by a style element in it and by a
 * constructable sheet, both answering to the width, a shadow root nested in
 * it, a slot for the host's own content, and a closed shadow root.
 */
const SHADOW = `<!DOCTYPE html>
<style>body { margin: 0 } p { color: rgb(1, 2, 3) }</style>
<body>
<div id="host"><span id="slotted">Slotted</span></div>
<div id="closed"><span>Light of closed</span></div>
<p id="outside">Outside</p>
</body>`;

function withShadowRoots(doc: Document) {
  const win = doc.defaultView as Window & typeof globalThis;
  const shadow = doc.getElementById("host")!.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
  h2 { color: rgb(255, 0, 0); margin: 0 }
  @media (max-width: 500px) { h2 { color: rgb(0, 0, 255) } }
  .units { height: 50vh }
</style>
<h2 id="title">In the shadow</h2><div class="units" id="units"></div><slot></slot><div id="inner-host"></div>`;
  const sheet = new win.CSSStyleSheet();
  sheet.replaceSync(":host { display: block; padding: 7px } .card { border-radius: 12px; background: rgb(0, 128, 0) } @media (max-width: 500px) { .card { border-radius: 4px } }");
  shadow.adoptedStyleSheets = [sheet];
  const card = Object.assign(doc.createElement("div"), { id: "card", className: "card", textContent: "Card" });
  shadow.append(card);
  const nested = shadow.getElementById("inner-host")!.attachShadow({ mode: "open" });
  nested.innerHTML = `<style>b { font-weight: 900 }</style><b id="deep">Deep</b>`;
  doc.getElementById("closed")!.attachShadow({ mode: "closed" }).innerHTML = "<i>Hidden</i>";
}

const inShadow = (doc: Document, id: string) => doc.getElementById("host")!.shadowRoot!.getElementById(id);
const styleIn = (doc: Document, id: string) => getComputedStyle(inShadow(doc, id)!);

/** What the shadow root shows in a view `width` wide, as a window that wide and 600 tall would show it. */
function expectShadowAt(doc: Document, width: number) {
  const narrow = width <= 500;
  expect(inShadow(doc, "title")!.textContent).toBe("In the shadow");
  expect(styleIn(doc, "title").color).toBe(narrow ? "rgb(0, 0, 255)" : "rgb(255, 0, 0)");
  expect(styleIn(doc, "card").backgroundColor).toBe("rgb(0, 128, 0)");
  expect(styleIn(doc, "card").borderTopLeftRadius).toBe(narrow ? "4px" : "12px");
  expect(styleIn(doc, "units").height).toBe("300px");
  expect(getComputedStyle(doc.getElementById("host")!).paddingTop).toBe("7px");
  // The host's own content, slotted in.
  expect(doc.getElementById("slotted")!.assignedSlot).not.toBeNull();
  const deep = inShadow(doc, "inner-host")!.shadowRoot!.getElementById("deep")!;
  expect(getComputedStyle(deep).fontWeight).toBe("900");
  // A closed one cannot be read: the host shows as one with none.
  expect(doc.getElementById("closed")!.shadowRoot).toBeNull();
  expect(doc.getElementById("closed")!.textContent).toBe("Light of closed");
  // Styles in the shadow root reach nothing outside it.
  expect(getComputedStyle(doc.getElementById("outside")!).color).toBe("rgb(1, 2, 3)");
}

describe("an open shadow root on the page (ticket 135)", () => {
  test("is on the canvas, styled as on the page, and in each view at its own width", async () => {
    const canvas = await freeze(livePage(SHADOW, withShadowRoots), iframe());
    const views = createViews(canvas);
    const phone = await views.add(iframe(), 390);
    const tablet = await views.add(iframe(), 768);

    expectShadowAt(canvas.document, 800);
    expectShadowAt(tablet.document, 768);
    expectShadowAt(phone.document, 390);
  });

  test("is saved with the canvas, as a declarative shadow root, and put back with it, in each view too", async () => {
    const saved = serializeCanvas(await freeze(livePage(SHADOW, withShadowRoots), iframe()));
    expect(saved).toContain('<template shadowrootmode="open"');
    expect(saved).not.toContain("Hidden");
    const canvas = await restore(saved, iframe());
    const phone = await createViews(canvas).add(iframe(), 390);

    expectShadowAt(canvas.document, 800);
    expectShadowAt(phone.document, 390);
    // Saved again as it was.
    expect(serializeCanvas(canvas)).toBe(saved);
  });

  test("a change in a shadow root of the canvas is in every view before the next paint", async () => {
    const canvas = await freeze(livePage(SHADOW, withShadowRoots), iframe());
    const views = createViews(canvas);
    const phone = await views.add(iframe(), 390);
    inShadow(canvas.document, "title")!.textContent = "Changed";
    inShadow(canvas.document, "card")!.append(canvas.document.createElement("hr"));
    views.sync();
    expect(inShadow(phone.document, "title")!.textContent).toBe("Changed");
    expect(inShadow(phone.document, "card")!.querySelector("hr")).not.toBeNull();
    // Each node of the view's shadow root is known to be the canvas's.
    expect(phone.elementOf(inShadow(canvas.document, "card")!)).toBe(inShadow(phone.document, "card"));
  });

  test("the shadow roots of a dev server's overlay are not the page's: not copied", async () => {
    const live = livePage(SHADOW, (doc) => {
      withShadowRoots(doc);
      const portal = doc.createElement("nextjs-portal");
      portal.attachShadow({ mode: "open" }).innerHTML = "<div>Dev tools</div>";
      doc.body.append(portal);
    });
    const canvas = await freeze(live, iframe());
    expect(canvas.document.querySelector("nextjs-portal")!.shadowRoot).toBeNull();
    expect(inShadow(canvas.document, "title")).not.toBeNull();
  });

  // A script's animation is read on a page in the editor's own window, which a test's page is not: e2e/tests/shadow-roots.spec.ts.
  test("a CSS animation in a shadow root is at its end on the canvas and in each view", async () => {
    const live = livePage(SHADOW, (doc) => {
      withShadowRoots(doc);
      const style = doc.createElement("style");
      style.textContent = "@keyframes grow { to { width: 33px } } #units { animation: grow 10s forwards }";
      doc.getElementById("host")!.shadowRoot!.append(style);
    });
    const canvas = await freeze(live, iframe());
    const phone = await createViews(canvas).add(iframe(), 390);
    expect(styleIn(canvas.document, "units").width).toBe("33px");
    expect(styleIn(phone.document, "units").width).toBe("33px");
  });

  test("a shadow root the page made clonable is copied as any other, its constructable sheet too, and saved", async () => {
    const live = livePage(SHADOW, (doc) => {
      withShadowRoots(doc);
      const other = doc.createElement("div");
      other.id = "clonable";
      const shadow = other.attachShadow({ mode: "open", clonable: true });
      shadow.innerHTML = '<p id="in-clonable">Clonable</p>';
      const sheet = new (doc.defaultView as Window & typeof globalThis).CSSStyleSheet();
      sheet.replaceSync("p { color: rgb(9, 9, 9) }");
      shadow.adoptedStyleSheets = [sheet];
      doc.body.append(other);
    });
    const canvas = await freeze(live, iframe());
    const read = (doc: Document) => getComputedStyle(doc.getElementById("clonable")!.shadowRoot!.getElementById("in-clonable")!).color;
    expect(read(canvas.document)).toBe("rgb(9, 9, 9)");
    expect(read((await restore(serializeCanvas(canvas), iframe())).document)).toBe("rgb(9, 9, 9)");
  });

  test("a still drawn in a shadow root is drawn on the canvas, and again once the round is put back; its pixels are not kept on it", async () => {
    const live = livePage(SHADOW, (doc) => {
      withShadowRoots(doc);
      const still = Object.assign(doc.createElement("canvas"), { id: "still", width: 4, height: 4 });
      doc.getElementById("host")!.shadowRoot!.append(still);
      const ink = still.getContext("2d")!;
      ink.fillStyle = "#f00";
      ink.fillRect(0, 0, 4, 4);
    });
    const red = (doc: Document) => [...(inShadow(doc, "still") as HTMLCanvasElement).getContext("2d")!.getImageData(1, 1, 1, 1).data];
    const canvas = await freeze(live, iframe());
    expect(red(canvas.document)).toEqual([255, 0, 0, 255]);
    const saved = serializeCanvas(canvas);
    expect(saved).toContain("data-ht-pixels");
    const back = await restore(saved, iframe());
    expect(red(back.document)).toEqual([255, 0, 0, 255]);
    expect(inShadow(back.document, "still")!.hasAttribute("data-ht-pixels")).toBe(false);
    expect(serializeCanvas(back)).toBe(saved);
  });

  test("a popover open, a modal dialog and a box scrolled in a shadow root stay so on the canvas, and once put back", async () => {
    const live = livePage(SHADOW, (doc) => {
      withShadowRoots(doc);
      const shadow = doc.getElementById("host")!.shadowRoot!;
      const more = doc.createElement("template");
      more.innerHTML = `<div id="pop" popover="manual">Pop</div><dialog id="dialog">Dialog</dialog>
<div id="scroller" style="height: 50px; overflow: auto"><div style="height: 500px"></div></div>`;
      shadow.append(more.content);
      (shadow.getElementById("pop") as HTMLElement).showPopover();
      (shadow.getElementById("dialog") as HTMLDialogElement).showModal();
      shadow.getElementById("scroller")!.scrollTop = 120;
    });
    const expectAsOnPage = (doc: Document) => {
      expect(inShadow(doc, "pop")!.matches(":popover-open")).toBe(true);
      expect(inShadow(doc, "dialog")!.matches(":modal")).toBe(true);
      expect(inShadow(doc, "scroller")!.scrollTop).toBe(120);
    };
    const canvas = await freeze(live, iframe());
    expectAsOnPage(canvas.document);
    expectAsOnPage((await restore(serializeCanvas(canvas), iframe())).document);
  });

  test("a custom element hidden till it is defined, defined on the page, shows on the canvas and in each view", async () => {
    const live = livePage(`<!DOCTYPE html><style>x-late:not(:defined) { display: none } x-late:defined { color: rgb(0, 99, 0) }</style><x-late id="late">Late</x-late>`, (doc) => {
      const win = doc.defaultView as Window & typeof globalThis;
      win.customElements.define("x-late", class extends win.HTMLElement {});
    });
    const canvas = await freeze(live, iframe());
    const phone = await createViews(canvas).add(iframe(), 390);
    for (const doc of [canvas.document, phone.document]) {
      expect(getComputedStyle(doc.getElementById("late")!).display).toBe("inline");
      expect(getComputedStyle(doc.getElementById("late")!).color).toBe("rgb(0, 99, 0)");
    }
  });

  test("a rule on `:defined` weighs on the canvas as on the page, over a later rule without it", async () => {
    const live = livePage(
      `<!DOCTYPE html><style>.bar x-icon:defined { color: rgb(255, 0, 0) } .bar x-icon { color: rgb(0, 0, 255) }</style><div class="bar"><x-icon id="icon">i</x-icon></div>`,
      (doc) => {
        const win = doc.defaultView as Window & typeof globalThis;
        win.customElements.define("x-icon", class extends win.HTMLElement {});
      },
    );
    expect(getComputedStyle(live.document.getElementById("icon")!).color).toBe("rgb(255, 0, 0)");
    const canvas = await freeze(live, iframe());
    expect(getComputedStyle(canvas.document.getElementById("icon")!).color).toBe("rgb(255, 0, 0)");
  });

  test("a custom element of the page's is copied as it is, none of its code run in the copy", async () => {
    let made = 0;
    const live = livePage(SHADOW, (doc) => {
      const win = doc.defaultView as Window & typeof globalThis;
      win.customElements.define(
        "made-here",
        class extends win.HTMLElement {
          constructor() {
            super();
            made++;
          }
          connectedCallback() {
            (this.shadowRoot ?? this.attachShadow({ mode: "open" })).append(doc.createElement("hr"));
          }
        },
      );
      doc.body.append(doc.createElement("made-here"));
    });
    expect(made).toBe(1);
    const canvas = await freeze(live, iframe());
    expect(made).toBe(1);
    expect(canvas.document.querySelector("made-here")!.shadowRoot!.querySelectorAll("hr")).toHaveLength(1);
  });
});

describe("a page with no shadow root", () => {
  // Recorded with the freezer as it was before shadow roots were copied (ticket 135): it must not change.
  test("is frozen, shown in a view, saved and put back byte for byte as before", async () => {
    const canvas = await freeze(livePage(NO_SHADOW, withExtras), iframe());
    const frozen = canvas.document.documentElement.outerHTML;
    const view = await createViews(canvas).add(iframe(), 390);
    const shown = view.document.documentElement.outerHTML;
    const saved = serializeCanvas(canvas);
    const putBack = serializeCanvas(await restore(saved, iframe()));
    // The address of the test runner's page changes from run to run.
    const text = [frozen, shown, saved, putBack].join("\n\n---\n\n").replace(/data-ht-page="[^"]*"/g, 'data-ht-page="/"');
    await expect(text).toMatchFileSnapshot("__snapshots__/freezer-no-shadow-root.html");
  });
});
