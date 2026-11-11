import { afterEach, describe, expect, test } from "vitest";
import { elementsOf } from "../src/client/canvas-style";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { freeze, restore, serializeCanvas } from "../src/client/freezer";
import type { Fill } from "../src/client/property-table";
import { copyStyle, pasteStyle } from "../src/client/style-copy";
import { createViews } from "../src/client/views";
import { checkChange } from "../src/client/check";
import { buildLayerTree } from "../src/client/layers";
import { placedOnCanvas } from "../src/client/moves";
import { copyPage } from "../src/client/page-copy";
import { revertSaved } from "../src/client/saved-round";
import { sourcesOf } from "../src/client/style-source";
import { definedByDependency } from "../src/client/usage-chain";
import { DEFINED_GLOBAL } from "../src/definitions";
import type { Variable } from "../src/service-protocol";
import { variablesInCode } from "../src/client/code-variables";
import { bind, resolveVariables } from "../src/client/variables";

/**
 * Style edits on layers in an open shadow root (ticket 137): written into
 * that shadow root's own edit styles, which the document's cannot reach.
 */

const made: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const iframe of made.splice(0)) iframe.remove();
});

function iframe(width = 800, height = 600): HTMLIFrameElement {
  const el = document.createElement("iframe");
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.border = "0";
  document.body.append(el);
  made.push(el);
  return el;
}

function livePage(html: string, then?: (doc: Document) => void): Window {
  const live = iframe();
  const doc = live.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  then?.(doc);
  return live.contentWindow!;
}

const PAGE = `<!DOCTYPE html>
<style>body { margin: 0 } .card { border-radius: 2px }</style>
<body>
<div id="host"></div>
<div id="other" class="card" style="height: 20px">Light card</div>
</body>`;

function withShadow(doc: Document) {
  const win = doc.defaultView as Window & typeof globalThis;
  const shadow = doc.getElementById("host")!.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>.card { height: 40px; background: rgb(0, 128, 0); border-radius: 12px; margin: 4px }</style>
<div class="card" id="a">A</div><div class="card" id="b">B</div><div id="inner-host"></div>`;
  const sheet = new win.CSSStyleSheet();
  sheet.replaceSync(":host { display: block }");
  shadow.adoptedStyleSheets = [sheet];
  const nested = shadow.getElementById("inner-host")!.attachShadow({ mode: "open" });
  nested.innerHTML = `<style>div { height: 10px }</style><div id="deep"></div>`;
}

const RED: Fill = { type: "solid", color: "#FF0000", opacity: 1 };
const shadowOf = (doc: Document) => doc.getElementById("host")!.shadowRoot!;
const inShadow = (doc: Document, id: string) => shadowOf(doc).getElementById(id)!;
const fill = (el: Element) => getComputedStyle(el).backgroundColor;
const radius = (el: Element) => getComputedStyle(el).borderTopLeftRadius;

async function open() {
  const canvas = await freeze(livePage(PAGE, withShadow), iframe());
  const doc = canvas.document;
  const views = createViews(canvas);
  const phone = await views.add(iframe(390), 390);
  const changes = createChangeSet();
  const editor = createEditor(views, changes);
  const layerOf = (el: Element) => editor.tree().layerOf(el)!;
  const inPhone = (el: Element) => {
    views.sync(phone);
    return phone.elementOf(el)!;
  };
  return { canvas, doc, views, phone, changes, editor, layerOf, inPhone };
}

describe("a style edit to a layer in an open shadow root (ticket 137)", () => {
  test("shows at once on the canvas and in every view, written into that shadow root's edit styles, and is in the ChangeSet", async () => {
    const { doc, editor, changes, layerOf, inPhone } = await open();
    const a = inShadow(doc, "a");
    editor.set(layerOf(a), "fill", RED);
    editor.set(layerOf(a), "radius", 4);

    expect(fill(a)).toBe("rgb(255, 0, 0)");
    expect(radius(a)).toBe("4px");
    expect(fill(inPhone(a))).toBe("rgb(255, 0, 0)");
    expect(radius(inPhone(a))).toBe("4px");
    // In the shadow root's styles, not the document's; the page's other card is as it was.
    expect(shadowOf(doc).querySelectorAll("style[data-ht-rules]")).toHaveLength(1);
    expect(doc.querySelectorAll("style[data-ht-rules]")).toHaveLength(0);
    expect(radius(doc.getElementById("other")!)).toBe("2px");
    expect(radius(inShadow(doc, "b"))).toBe("12px");
    expect(changes.list().map((change) => change.property)).toEqual(["fill", "radius"]);
    expect(elementsOf(doc, a.getAttribute("data-ht-layer")!)).toEqual([a]);
  });

  test("made in the phone view, holds at the phone's breakpoint alone", async () => {
    const { doc, editor, phone, layerOf, inPhone } = await open();
    const a = inShadow(doc, "a");
    editor.at(phone);
    editor.set(layerOf(a), "radius", 20);
    expect(radius(inPhone(a))).toBe("20px");
    expect(radius(a)).toBe("12px");
  });

  test("is undone and redone", async () => {
    const { doc, editor, layerOf, inPhone } = await open();
    const a = inShadow(doc, "a");
    editor.set(layerOf(a), "fill", RED);
    editor.undo();
    expect(fill(a)).toBe("rgb(0, 128, 0)");
    expect(fill(inPhone(a))).toBe("rgb(0, 128, 0)");
    expect(shadowOf(doc).querySelectorAll("style[data-ht-rules]")).toHaveLength(0);
    editor.redo();
    expect(fill(a)).toBe("rgb(255, 0, 0)");
    expect(fill(inPhone(a))).toBe("rgb(255, 0, 0)");
  });

  test("in a nested shadow root, and on a host, goes where each is", async () => {
    const { doc, editor, layerOf, inPhone } = await open();
    const deep = inShadow(doc, "inner-host").shadowRoot!.getElementById("deep")!;
    const host = doc.getElementById("host")!;
    editor.set(layerOf(deep), "fill", RED);
    editor.set(layerOf(host), "fill", RED);
    expect(fill(deep)).toBe("rgb(255, 0, 0)");
    expect(fill(inPhone(deep))).toBe("rgb(255, 0, 0)");
    expect(fill(host)).toBe("rgb(255, 0, 0)");
    expect(inShadow(doc, "inner-host").shadowRoot!.querySelectorAll("style[data-ht-rules]")).toHaveLength(1);
    expect(doc.querySelectorAll("style[data-ht-rules]")).toHaveLength(1);
    // Keys are the document's: none taken twice across the trees.
    expect(deep.getAttribute("data-ht-style")).not.toBe(host.getAttribute("data-ht-style"));
  });

  test("is saved with the canvas and put back with it; saved again as it was", async () => {
    const { canvas, doc, editor, layerOf } = await open();
    editor.set(layerOf(inShadow(doc, "a")), "fill", RED);
    const saved = serializeCanvas(canvas);
    const back = await restore(saved, iframe());
    expect(fill(inShadow(back.document, "a"))).toBe("rgb(255, 0, 0)");
    expect(serializeCanvas(back)).toBe(saved);
  });

  test("copied and pasted onto another layer of the shadow root, as a style", async () => {
    const { doc, editor, layerOf } = await open();
    const [a, b] = [inShadow(doc, "a"), inShadow(doc, "b")];
    editor.set(layerOf(a), "fill", RED);
    const style = copyStyle(editor, layerOf(a))!;
    pasteStyle(editor, [layerOf(b)], style);
    expect(fill(b)).toBe("rgb(255, 0, 0)");
    editor.undo();
    expect(fill(b)).toBe("rgb(0, 128, 0)");
  });

  test("copied from a layer of the document onto one in the shadow root, and back: each written into its own tree's edit styles", async () => {
    const { doc, editor, layerOf } = await open();
    const [other, a] = [doc.getElementById("other")!, inShadow(doc, "a")];
    const editStyles = (root: Document | ShadowRoot) => root.querySelectorAll("style[data-ht-rules-for]").length;
    editor.set(layerOf(other), "fill", RED);
    pasteStyle(editor, [layerOf(a)], copyStyle(editor, layerOf(other))!);
    expect(fill(a)).toBe("rgb(255, 0, 0)");
    expect(editStyles(shadowOf(doc))).toBe(1);
    editor.set(layerOf(a), "radius", 6);
    pasteStyle(editor, [layerOf(other)], copyStyle(editor, layerOf(a))!);
    expect(radius(other)).toBe("6px");
    expect(radius(a)).toBe("6px");
    expect(editStyles(doc)).toBe(1);
    expect(editStyles(shadowOf(doc))).toBe(1);
    editor.undo();
    expect(radius(other)).toBe("2px");
    editor.undo();
    editor.undo();
    expect(fill(a)).toBe("rgb(0, 128, 0)");
  });

  test("records the layer's shadow root on its change, and what sets its value now as the shadow root's own rule", async () => {
    const { doc, editor, changes, layerOf } = await open();
    editor.set(layerOf(inShadow(doc, "a")), "fill", RED);
    const [change] = changes.list();
    expect(change.target.shadowRoot).toBe('<div id="host">');
    expect(change.sources).toEqual([expect.objectContaining({ kind: "rule", selector: ".card", file: null, shadowRoot: "div" })]);
    // A layer of the document's own tree has none.
    editor.set(layerOf(doc.getElementById("other")!), "fill", RED);
    expect(changes.list()[1].target.shadowRoot).toBeUndefined();
    expect(changes.list()[1].sources![0].shadowRoot).toBeUndefined();
  });

  test("taken back out of the round as saved, with no canvas open, its layer is as the page styles it again; the other change stays", async () => {
    const { canvas, doc, editor, changes, layerOf } = await open();
    const a = inShadow(doc, "a");
    editor.set(layerOf(a), "fill", RED);
    editor.set(layerOf(a), "radius", 4);
    const left = revertSaved({ canvas: serializeCanvas(canvas), changeSet: changes.save() }, 1)!;
    expect(left.canvas).toContain('<template shadowrootmode="open"');
    const back = await restore(left.canvas, iframe());
    expect(fill(inShadow(back.document, "a"))).toBe("rgb(0, 128, 0)");
    expect(radius(inShadow(back.document, "a"))).toBe("4px");
  });
});

/** The page as the code may have it, its card filled `fill` in its shadow root's own styles, its elements marked as the build marks JSX. */
const marked = () => `<!DOCTYPE html>
<style>body { margin: 0 }</style>
<body><div id="host" data-ht-loc="src/Hero.tsx:5:5"></div></body>`;
function markedShadow(fill: string) {
  return (doc: Document) => {
    const shadow = doc.getElementById("host")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>.card { height: 40px; background: ${fill} } @media (max-width: 500px) { .card { border-radius: 9px } }</style><div class="card" id="a" data-ht-loc="src/Hero.tsx:9:9">A</div>`;
  };
}
function liveWith(fill: string): Document {
  return livePage(marked(), markedShadow(fill)).document;
}

describe("Variables on a layer in an open shadow root (ticket 137)", () => {
  const BRAND: Variable = { name: "--brand", group: "color", value: "#2f6bff", from: "css", css: "var(--brand)", own: true };
  const PAGE_OF_VARIABLES = `<!DOCTYPE html><style>:root { --brand: #2f6bff } body { margin: 0 }</style><body><div id="host"></div></body>`;
  const withVariable = (doc: Document) => {
    doc.getElementById("host")!.attachShadow({ mode: "open" }).innerHTML = `<style>.card { height: 40px; background-color: var(--brand) }</style><div class="card" id="a"></div><div class="card" id="b" style="background-color: #ffffff"></div>`;
  };

  test("the one its code writes is read off the shadow root's own styles; one picked is bound to the change", async () => {
    const canvas = await freeze(livePage(PAGE_OF_VARIABLES, withVariable), iframe());
    const catalog = resolveVariables([BRAND], canvas.document);
    const changes = createChangeSet();
    const editor = createEditor(createViews(canvas), changes, null, { bind: (...args) => bind(catalog, ...args) });
    const [a, b] = [inShadow(canvas.document, "a"), inShadow(canvas.document, "b")];
    expect(variablesInCode(catalog, a, "fill", { type: "solid", color: "#2F6BFF", opacity: 1 })).toEqual({ color: BRAND });
    editor.set(editor.tree().layerOf(b)!, "fill", { type: "solid", color: "#2F6BFF", opacity: 1 }, { variables: { color: BRAND } });
    expect(changes.list()[0].variables).toEqual({ color: { ...BRAND, picked: true } });
    expect(fill(b)).toBe("rgb(47, 107, 255)");
  });
});

describe("the page check of a change in an open shadow root (ticket 137)", () => {
  test("finds the layer by its markers in the page's shadow root: shown once the page fills it so, not shown before", async () => {
    const canvas = await freeze(livePage(marked(), markedShadow("rgb(0, 128, 0)")), iframe());
    const changes = createChangeSet();
    const editor = createEditor(createViews(canvas), changes);
    editor.set(editor.tree().layerOf(inShadow(canvas.document, "a"))!, "fill", RED);
    const round = placedOnCanvas(changes.list(), serializeCanvas(canvas));
    expect(checkChange(liveWith("rgb(255, 0, 0)"), round[0], round)).toEqual({ outcome: "shown" });
    expect(checkChange(liveWith("rgb(0, 128, 0)"), round[0], round)).toMatchObject({ outcome: "not shown" });
  });

  test("a copy of the page at another width has its shadow roots, styled at that width, and follows them as they change", () => {
    const live = liveWith("rgb(0, 128, 0)");
    const copy = copyPage(live, 390, document.body);
    try {
      const a = inShadow(live, "a");
      expect(getComputedStyle(copy.of(a)!).borderTopLeftRadius).toBe("9px");
      expect(getComputedStyle(copy.of(a)!).backgroundColor).toBe("rgb(0, 128, 0)");
      shadowOf(live).querySelector("style")!.textContent = ".card { background: rgb(255, 0, 0) }";
      a.textContent = "Changed";
      copy.sync();
      expect(getComputedStyle(copy.of(a)!).backgroundColor).toBe("rgb(255, 0, 0)");
      expect(copy.of(a)!.textContent).toBe("Changed");
    } finally {
      copy.close();
    }
  });
});

test("a copy of the page has a shadow root the page made clonable too, and follows it as it changes", () => {
  const live = livePage(`<!DOCTYPE html><body><div id="host"></div></body>`, (doc) => {
    doc.getElementById("host")!.attachShadow({ mode: "open", clonable: true }).innerHTML = `<style>p { color: rgb(0, 128, 0) }</style><p id="a">A</p>`;
  }).document;
  const copy = copyPage(live, 390, document.body);
  try {
    const a = inShadow(live, "a");
    expect(getComputedStyle(copy.of(a)!).color).toBe("rgb(0, 128, 0)");
    a.textContent = "Changed";
    copy.sync();
    expect(copy.of(a)!.textContent).toBe("Changed");
  } finally {
    copy.close();
  }
});

test("a copy of a page whose only open shadow roots are the editor's own (`<human-touch>`) and the dev server's has none, and does not follow them", () => {
  const live = livePage(`<!DOCTYPE html><body><p id="a">A</p><human-touch></human-touch><vite-error-overlay></vite-error-overlay></body>`, (doc) => {
    doc.querySelector("human-touch")!.attachShadow({ mode: "open" }).innerHTML = `<div id="ui">Editor</div>`;
    doc.querySelector("vite-error-overlay")!.attachShadow({ mode: "open" }).innerHTML = `<div>Overlay</div>`;
  }).document;
  const copy = copyPage(live, 390, document.body);
  try {
    expect(copy.doc.querySelector("human-touch")!.shadowRoot).toBeNull();
    expect(copy.doc.querySelector("vite-error-overlay")!.shadowRoot).toBeNull();
    // Not deep: a host added later is copied as any other element, with no shadow root.
    live.querySelector("human-touch")!.shadowRoot!.getElementById("ui")!.textContent = "Changed";
    expect(copy.sync()).toBe(false);
    const later = live.createElement("div");
    later.attachShadow({ mode: "open" }).innerHTML = `<span>In it</span>`;
    live.body.append(later);
    copy.sync();
    expect(copy.of(later)!.shadowRoot).toBeNull();
  } finally {
    copy.close();
  }
});

describe("what sets a value in an open shadow root (ticket 137)", () => {
  const PARTS = `<!DOCTYPE html>
<style>body { margin: 0 } #host::part(label) { color: rgb(0, 0, 255) } #host::part(other) { color: rgb(0, 255, 0) }</style>
<body><div id="host"></div></body>`;
  const parts = (important: boolean) => (doc: Document) => {
    const shadow = doc.getElementById("host")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>span { color: rgb(255, 0, 0)${important ? " !important" : ""} }</style><span part="label" id="label">Label</span>`;
  };

  test("a `::part()` rule of the page's beats the shadow root's own; an important one of the shadow root's beats it", async () => {
    for (const important of [false, true]) {
      const canvas = await freeze(livePage(PARTS, parts(important)), iframe());
      const label = inShadow(canvas.document, "label");
      const [source] = sourcesOf(label, ["color"]);
      expect(getComputedStyle(label).color).toBe(important ? "rgb(255, 0, 0)" : "rgb(0, 0, 255)");
      expect(source.selector).toBe(important ? "span" : "#host::part(label)");
      // The page's own CSS, not the shadow root's.
      expect(source.shadowRoot).toBe(important ? "div" : undefined);
    }
  });
});

describe("a custom element a dependency defines (ticket 137)", () => {
  const PAGE_WITH_CHIP = `<!DOCTYPE html><body><acme-chip id="chip" data-ht-loc="src/App.tsx:30:9"></acme-chip></body>`;
  const stack = (...urls: string[]) => ["Error", ...urls.map((url) => `    at ${url}:1:10`)].join("\n");

  test("is told by the modules it was defined from: all of them a dependency's, past the dev server's own script", () => {
    const page = "http://localhost:5173/";
    expect(definedByDependency(stack(page, "http://localhost:5173/node_modules/.vite/deps/acme-ui.js?v=1"))).toBe(true);
    // A project's element, defined through a library's helper (Lit's `@customElement`).
    expect(definedByDependency(stack(page, "http://localhost:5173/node_modules/.vite/deps/lit.js?v=1", "http://localhost:5173/src/my-card.ts"))).toBe(false);
    expect(definedByDependency(stack(page, "http://localhost:5173/src/my-card.ts"))).toBe(false);
    expect(definedByDependency(stack(page))).toBe(false);
  });

  test("reads Firefox's and Safari's stacks, with no `Error` line, and async frames, as Chrome's", () => {
    const page = "http://localhost:5173/";
    const firefox = (...urls: string[]) => urls.map((url, i) => `${i ? "" : "r.define"}@${url}:1:10`).join("\n");
    expect(definedByDependency(firefox(page, "http://localhost:5173/node_modules/.vite/deps/acme-ui.js?v=1"))).toBe(true);
    expect(definedByDependency(firefox(page, "http://localhost:5173/node_modules/.vite/deps/lit.js?v=1", "http://localhost:5173/src/my-card.ts"))).toBe(false);
    expect(definedByDependency(firefox(page))).toBe(false);
    const safari = [`define@${page}:1:200`, "module code@http://localhost:5173/node_modules/acme-ui/chip.js:3:1", "evaluate@[native code]"].join("\n");
    expect(definedByDependency(safari)).toBe(true);
    const async = ["Error", `    at r.define (${page}:1:200)`, "    at http://localhost:5173/node_modules/acme-ui/chip.js:3:1", "    at async http://localhost:5173/src/main.tsx:9:3"].join("\n");
    expect(definedByDependency(async)).toBe(false);
    const asyncDependency = ["Error", `    at r.define (${page}:1:200)`, "    at async http://localhost:5173/node_modules/acme-ui/index.js:3:1"].join("\n");
    expect(definedByDependency(asyncDependency)).toBe(true);
  });

  test("draws the layers in its shadow root locked, used where its host is written; one the project defines, as any other", async () => {
    for (const dependency of [true, false]) {
      const live = livePage(PAGE_WITH_CHIP, (doc) => {
        const defined = new Map([["acme-chip", stack("http://localhost:5173/", dependency ? "http://localhost:5173/node_modules/acme-ui/chip.js" : "http://localhost:5173/src/chip.ts")]]);
        (doc.defaultView as unknown as Record<string, unknown>)[DEFINED_GLOBAL] = defined;
        doc.getElementById("chip")!.attachShadow({ mode: "open" }).innerHTML = `<style>span { display: block; height: 10px }</style><span part="label" id="label"></span>`;
      });
      const canvas = await freeze(live, iframe());
      const label = buildLayerTree(canvas.document).layerOf(inShadowOf(canvas.document, "chip", "label"))!;
      if (dependency) {
        expect(label.kind).toBe("locked");
        expect(label.chain).toEqual([{ component: "acme-chip", usage: "src/App.tsx:30:9", thirdParty: true, webComponent: true }]);
      } else {
        expect(label.kind).not.toBe("locked");
        expect(label.chain).toEqual([]);
      }
    }
  });
});

const inShadowOf = (doc: Document, host: string, id: string) => doc.getElementById(host)!.shadowRoot!.getElementById(id)!;
