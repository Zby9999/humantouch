import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { freeze } from "../src/client/freezer";
import { freezeLook } from "../src/client/look";
import { createClipboard } from "../src/client/clipboard";
import { findDrop, SHADOW_EDGE_HINTS, shadowEdgeAt } from "../src/client/drag";
import type { Place } from "../src/client/changeset";
import type { Layer } from "../src/client/layers";
import type { Fill } from "../src/client/property-table";
import { isCanvasSheet } from "../src/client/shadow-roots";
import { createViews } from "../src/client/views";

/**
 * Changes to the structure of layers in an open shadow root (ticket 138):
 * they move, stack, copy and delete within the tree they are in, never
 * across a shadow root's edge.
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
<style>body { margin: 0; color: rgb(0, 0, 255) } .card { border-radius: 2px }</style>
<body>
<div id="host"><p id="note">Slotted</p></div>
<div id="other" class="card" style="height: 20px">Light card</div>
</body>`;

/** The host's shadow root: a box of two cards and a slot, and a second box beside it, at the top of the shadow root. */
function withShadow(doc: Document) {
  const shadow = doc.getElementById("host")!.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>.card { height: 40px; background: rgb(0, 128, 0); margin: 4px } .box { padding: 8px }</style>
<div class="box" id="box"><div class="card" id="a">A</div><div class="card" id="b">B</div><slot></slot></div><div class="box" id="side"><div class="card" id="c">C</div></div>`;
}

const RED: Fill = { type: "solid", color: "#FF0000", opacity: 1 };
const shadowOf = (doc: Document) => doc.getElementById("host")!.shadowRoot!;
const inShadow = (doc: Document, id: string) => shadowOf(doc).getElementById(id)!;
const ids = (parent: ParentNode) => [...parent.children].filter((el) => el.localName !== "style").map((el) => el.id || el.localName);

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

describe("a layer in an open shadow root (ticket 138)", () => {
  test("goes nowhere past the shadow root's edge: out of it, into it, nor, slotted in it, anywhere; within it, wherever it can", async () => {
    const { doc, editor, layerOf } = await open();
    const [a, box, side, host, note] = [inShadow(doc, "a"), inShadow(doc, "box"), inShadow(doc, "side"), doc.getElementById("host")!, doc.getElementById("note")!];
    const other = doc.getElementById("other")!;
    const page = layerOf(host).parent!;
    // Within the shadow root: into another box, or at its top, beside the boxes.
    expect(editor.canDrop(layerOf(a), layerOf(side))).toBe(true);
    expect(editor.canDrop(layerOf(a), layerOf(host))).toBe(true);
    expect(editor.acrossShadowRoot(layerOf(a), layerOf(box))).toBeNull();
    // Out of it, into it.
    expect(editor.acrossShadowRoot(layerOf(a), page)).toBe("out");
    expect(editor.canDrop(layerOf(a), page)).toBe(false);
    expect(editor.canDrop(layerOf(other), layerOf(box))).toBe(false);
    expect(editor.canDrop(layerOf(other), layerOf(host))).toBe(false);
    expect(editor.canDrop(layerOf(other), page)).toBe(true);
    // Slotted: written in the host's light DOM, shown in the box; it goes nowhere, nor is it copied, made a Stack of, or carried off the canvas.
    expect(layerOf(note).parent!.el).toBe(box);
    expect(editor.canDrop(layerOf(note), layerOf(box))).toBe(false);
    expect(editor.canDrop(layerOf(note), page)).toBe(false);
    expect(editor.canDuplicate(layerOf(note))).toBe(false);
    expect(editor.canStack([layerOf(a), layerOf(note)])).toBe(false);
    expect(editor.acrossShadowRoot(layerOf(note), null)).toBe("slotted");
    expect(editor.acrossShadowRoot(layerOf(a), null)).toBe("out");
    expect(editor.acrossShadowRoot(layerOf(other), null)).toBeNull();
    // One from another document, off the canvas: into the page, not the shadow root.
    expect(editor.acrossShadowRoot(null, page)).toBeNull();
    expect(editor.acrossShadowRoot(null, layerOf(box))).toBe("in");
  });

  test("on a canvas with no shadow root, nothing is ever past an edge", async () => {
    const canvas = await freeze(livePage(PAGE), iframe());
    const editor = createEditor(createViews(canvas), createChangeSet());
    const other = editor.tree().layerOf(canvas.document.getElementById("other")!)!;
    expect(editor.acrossShadowRoot(other, null)).toBeNull();
    expect(editor.acrossShadowRoot(other, other.parent)).toBeNull();
  });

  test("moved at the top of the shadow root, a box takes another place among its host's layers, on the canvas and in every view; its edit styles stay in that shadow root; undone, back", async () => {
    const { doc, editor, layerOf, inPhone, changes } = await open();
    const side = inShadow(doc, "side");
    editor.set(layerOf(side), "fill", RED);
    editor.move(layerOf(side), { parent: layerOf(doc.getElementById("host")!), index: 0 });

    expect(ids(shadowOf(doc))).toEqual(["side", "box"]);
    expect(ids(inPhone(doc.getElementById("host")!).shadowRoot!)).toEqual(["side", "box"]);
    expect(getComputedStyle(side).backgroundColor).toBe("rgb(255, 0, 0)");
    expect(shadowOf(doc).querySelectorAll("style[data-ht-rules]")).toHaveLength(1);
    expect(doc.querySelectorAll("style[data-ht-rules]")).toHaveLength(0);
    const move = changes.list().find((change) => change.kind === "move")!;
    expect(move.order?.signs).toHaveLength(2);

    editor.undo();
    expect(ids(shadowOf(doc))).toEqual(["box", "side"]);
  });

  test("made a Stack, the cards go into a new element in the box, with their edit styles still in the shadow root; undone, back", async () => {
    const { doc, editor, layerOf } = await open();
    const [a, b] = [inShadow(doc, "a"), inShadow(doc, "b")];
    editor.set(layerOf(a), "fill", RED);
    editor.stack([layerOf(a), layerOf(b)]);
    const stack = a.parentElement!;
    expect(stack.parentElement).toBe(inShadow(doc, "box"));
    expect(ids(stack)).toEqual(["a", "b"]);
    expect(getComputedStyle(stack).display).toBe("flex");
    expect(getComputedStyle(a).backgroundColor).toBe("rgb(255, 0, 0)");
    expect(doc.querySelectorAll("style[data-ht-rules]")).toHaveLength(0);
    editor.undo();
    expect(ids(inShadow(doc, "box"))).toEqual(["a", "b", "slot"]);
  });

  test("copied, a host takes its shadow root along, with the canvas's own styles, its layers its own: an edit to one is not the original's", async () => {
    const { doc, editor, layerOf, inPhone } = await open();
    const host = doc.getElementById("host")!;
    const a = inShadow(doc, "a");
    editor.set(layerOf(a), "fill", RED);
    const copy = editor.duplicate(layerOf(host)).el;

    expect(copy).not.toBe(host);
    const copied = copy.shadowRoot!;
    expect(copied.adoptedStyleSheets.some(isCanvasSheet)).toBe(true);
    // The original's edit style elements are not copied in: the copy's own, in its shadow root.
    const copiedA = copied.getElementById("a")!;
    expect(getComputedStyle(copiedA).backgroundColor).toBe("rgb(255, 0, 0)");
    expect(copiedA.getAttribute("data-ht-style")).not.toBe(a.getAttribute("data-ht-style"));
    expect(copied.querySelector(`style[data-ht-rules-for="${a.getAttribute("data-ht-style")}"]`)).toBeNull();
    expect(copiedA.hasAttribute("data-ht-layer")).toBe(false);
    // An edit to the copy's card: the original's stays red.
    editor.set(layerOf(copiedA), "fill", { type: "solid", color: "#0000FF", opacity: 1 });
    expect(getComputedStyle(copiedA).backgroundColor).toBe("rgb(0, 0, 255)");
    expect(getComputedStyle(a).backgroundColor).toBe("rgb(255, 0, 0)");
    expect(getComputedStyle(inPhone(copiedA)).backgroundColor).toBe("rgb(0, 0, 255)");
    expect(getComputedStyle(inPhone(a)).backgroundColor).toBe("rgb(255, 0, 0)");
  });

  test("redone, a move at the top of the shadow root and a Stack in it are made again, the edit styles still in the shadow root", async () => {
    const { doc, editor, layerOf } = await open();
    const [a, b, side] = [inShadow(doc, "a"), inShadow(doc, "b"), inShadow(doc, "side")];
    editor.set(layerOf(side), "fill", RED);
    editor.move(layerOf(side), { parent: layerOf(doc.getElementById("host")!), index: 0 });
    editor.undo();
    editor.redo();
    expect(ids(shadowOf(doc))).toEqual(["side", "box"]);
    expect(getComputedStyle(side).backgroundColor).toBe("rgb(255, 0, 0)");

    editor.stack([layerOf(a), layerOf(b)]);
    editor.undo();
    editor.redo();
    const stack = a.parentElement!;
    expect(stack.parentElement).toBe(inShadow(doc, "box"));
    expect(ids(stack)).toEqual(["a", "b"]);
    expect(getComputedStyle(stack).display).toBe("flex");
    expect(doc.querySelectorAll("style[data-ht-rules]")).toHaveLength(0);
  });

  test("moved last at the top of the shadow root, a box goes after the other, before the edit styles there, which are not places among its layers", async () => {
    const { doc, editor, layerOf, changes } = await open();
    const [box, side] = [inShadow(doc, "box"), inShadow(doc, "side")];
    editor.set(layerOf(box), "fill", RED);
    editor.set(layerOf(side), "fill", RED);
    editor.move(layerOf(box), { parent: layerOf(doc.getElementById("host")!), index: 2 });
    expect(ids(shadowOf(doc))).toEqual(["side", "box"]);
    // The page's own nodes, then the edit styles, as before.
    expect([...shadowOf(doc).children].map((el) => el.id || el.getAttribute("data-ht-edit-styles") || el.localName)).toEqual(["style", "side", "box", "order", "style", "style"]);
    const move = changes.list().find((change) => change.kind === "move")!;
    expect([(move.before as Place).slot, (move.after as Place).slot]).toEqual([1, 2]);
  });

  test("copied and redone, a host is copied again with its shadow root, its layers its own", async () => {
    const { doc, editor, layerOf } = await open();
    const host = doc.getElementById("host")!;
    editor.set(layerOf(inShadow(doc, "a")), "fill", RED);
    editor.duplicate(layerOf(host));
    editor.undo();
    expect(doc.querySelectorAll("#host")).toHaveLength(1);
    editor.redo();
    const copies = [...doc.querySelectorAll("#host")];
    expect(copies).toHaveLength(2);
    const copy = copies.find((el) => el !== host)!;
    const copiedA = copy.shadowRoot!.getElementById("a")!;
    expect(copy.shadowRoot!.adoptedStyleSheets.some(isCanvasSheet)).toBe(true);
    expect(getComputedStyle(copiedA).backgroundColor).toBe("rgb(255, 0, 0)");
    expect(copiedA.getAttribute("data-ht-style")).not.toBe(inShadow(doc, "a").getAttribute("data-ht-style"));
    editor.set(layerOf(copiedA), "fill", { type: "solid", color: "#0000FF", opacity: 1 });
    expect(getComputedStyle(inShadow(doc, "a")).backgroundColor).toBe("rgb(255, 0, 0)");
  });

  test("pasted past the shadow root's edge, a copy goes nowhere, and the hint says why; within the shadow root, it goes in", async () => {
    const { doc, editor, layerOf } = await open();
    const hints: string[] = [];
    const clipboard = createClipboard(editor, createChangeSet(), (text) => hints.push(text));
    const [other, box, a] = [doc.getElementById("other")!, inShadow(doc, "box"), inShadow(doc, "a")];
    expect(clipboard.copy([layerOf(other)])).toBe(true);
    expect(clipboard.paste([layerOf(box)])).toEqual([]);
    expect(hints).toEqual([SHADOW_EDGE_HINTS.paste]);
    expect(doc.querySelectorAll("#other")).toHaveLength(1);
    expect(clipboard.copy([layerOf(a)])).toBe(true);
    expect(clipboard.paste([layerOf(inShadow(doc, "side"))])).toHaveLength(1);
    expect(hints).toHaveLength(1);
  });

  test("copied and deleted in the shadow root, a card shows so in every view", async () => {
    const { doc, editor, layerOf, inPhone } = await open();
    const [a, b] = [inShadow(doc, "a"), inShadow(doc, "b")];
    editor.duplicate(layerOf(a));
    expect(ids(inShadow(doc, "box"))).toEqual(["a", "a", "b", "slot"]);
    editor.remove(layerOf(b));
    expect(getComputedStyle(b).display).toBe("none");
    expect(getComputedStyle(inPhone(b)).display).toBe("none");
    expect(ids(inPhone(inShadow(doc, "box")))).toEqual(["a", "a", "b", "slot"]);
  });
});

/** A Stack of a layer of the page and three hosts, each a title and a line in its shadow root. */
const ROW = `<!DOCTYPE html>
<style>body { margin: 0 } #row { display: flex; flex-direction: column; gap: 8px; padding: 8px } .host { height: 80px; background: rgb(238, 238, 238) }</style>
<body><div id="row"><div id="light" style="height: 40px">Light</div><div id="h1" class="host"></div><div id="h2" class="host"></div><div id="h3" class="host"></div></div></body>`;
function withCards(doc: Document) {
  for (const id of ["h1", "h2", "h3"]) doc.getElementById(id)!.attachShadow({ mode: "open" }).innerHTML = `<p style="margin: 0">Title ${id}</p><p style="margin: 0">Body</p>`;
}

describe("dragged, a layer (ticket 138)", () => {
  async function openRow() {
    const canvas = await freeze(livePage(ROW, withCards), iframe());
    const doc = canvas.document;
    const views = createViews(canvas);
    const editor = createEditor(views, createChangeSet());
    const [desktop] = views.list();
    const layerOf = (id: string) => editor.tree().layerOf(doc.getElementById(id)!)!;
    const rectOf = (l: Layer) => l.el.getBoundingClientRect();
    const order = () => [...doc.getElementById("row")!.children].map((el) => el.id);
    return { doc, editor, desktop, layerOf, rectOf, order };
  }

  test("of the page, onto the title in a host beside it, goes beside it as onto any layer there; onto the host's middle, nowhere, the edge it stops at told", async () => {
    const { doc, editor, desktop, layerOf, rectOf, order } = await openRow();
    const r = doc.getElementById("h2")!.getBoundingClientRect();
    // Over the title in h2's shadow root, near h2's top: in the Stack around it, before h2.
    const nearTop = { x: r.left + r.width / 2, y: r.top + 4 };
    const drop = findDrop(editor, desktop, layerOf("light"), nearTop, rectOf(layerOf("light")), rectOf)!;
    expect(drop.to.parent).toBe(layerOf("row"));
    expect(shadowEdgeAt(editor, desktop, layerOf("light"), nearTop, rectOf)).toBeNull();
    editor.move(layerOf("light"), drop.to);
    expect(order()).toEqual(["h1", "light", "h2", "h3"]);

    // A host onto another the same way.
    const host = findDrop(editor, desktop, layerOf("h3"), nearTop, rectOf(layerOf("h3")), rectOf)!;
    expect(host.to.parent).toBe(layerOf("row"));
    editor.move(layerOf("h3"), host.to);
    expect(order()).toEqual(["h1", "light", "h3", "h2"]);

    // Into h2's middle, which would take it but for the shadow root's edge: nowhere, not beside h2 either.
    const r2 = doc.getElementById("h2")!.getBoundingClientRect();
    const middle = { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
    expect(findDrop(editor, desktop, layerOf("light"), middle, rectOf(layerOf("light")), rectOf)).toBeNull();
    expect(shadowEdgeAt(editor, desktop, layerOf("light"), middle, rectOf)).toBe("in");
  });
});

describe("⇧A on free layers in a shadow root (ticket 138)", () => {
  const tile = (id: string, x: number, y: number) => `<div id="${id}" style="position: absolute; left: ${x}px; top: ${y}px; width: 100px; height: 40px"></div>`;
  function withTiles(doc: Document) {
    doc.getElementById("host")!.attachShadow({ mode: "open" }).innerHTML =
      `<div id="board" style="position: relative; width: 400px; height: 200px">${tile("a", 20, 30)}${tile("b", 144, 30)}${tile("c", 20, 86)}${tile("d", 144, 86)}</div>`;
  }

  test("makes a Grid in the shadow root, where they are; undone and redone, the same", async () => {
    const canvas = await freeze(livePage(PAGE, withTiles), iframe());
    const doc = canvas.document;
    const editor = createEditor(createViews(canvas), createChangeSet());
    const tiles = ["a", "b", "c", "d"].map((id) => editor.tree().layerOf(inShadow(doc, id))!);
    const board = inShadow(doc, "board");
    expect(editor.stacksAsGrid(tiles)).toBe(true);
    const grid = editor.stack(tiles);
    expect(grid.kind).toBe("grid");
    expect(grid.el.parentElement).toBe(board);
    expect(ids(grid.el)).toEqual(["a", "b", "c", "d"]);
    expect(getComputedStyle(grid.el).display).toBe("grid");
    expect(doc.querySelectorAll("style[data-ht-rules]")).toHaveLength(0);
    editor.undo();
    expect(ids(board)).toEqual(["a", "b", "c", "d"]);
    editor.redo();
    const again = inShadow(doc, "a").parentElement!;
    expect(again.parentElement).toBe(board);
    expect(getComputedStyle(again).display).toBe("grid");
  });
});

describe("a host's look, frozen (ticket 138)", () => {
  test("freezes what is in its shadow root too, into frozen styles in the shadow root: as it looked, the page's styles in it left out", async () => {
    const { doc } = await open();
    const into = iframe();
    freezeLook(doc.getElementById("host")!, into);
    const look = into.contentDocument!;
    const host = look.getElementById("host")!;
    const shadow = host.shadowRoot!;
    const card = shadow.getElementById("a")!;
    expect(getComputedStyle(card).backgroundColor).toBe("rgb(0, 128, 0)");
    expect(getComputedStyle(card).height).toBe("40px");
    // Inherited from the page's body, through the host: frozen on it.
    expect(getComputedStyle(card).color).toBe("rgb(0, 0, 255)");
    expect(shadow.querySelector("style:not([data-ht-look-styles])")).toBeNull();
    expect(card.hasAttribute("class")).toBe(false);
  });
});
