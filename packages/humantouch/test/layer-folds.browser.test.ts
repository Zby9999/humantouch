import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { createFolds } from "../src/client/layer-folds";
import type { LayerTree } from "../src/client/layers";
import { LayerTreeView } from "../src/client/LayerTreeView";
import { createViews } from "../src/client/views";

/**
 * The Layers panel's rows as layers go and come back (ticket 74): the panel
 * as the shell shows it, given the canvas's layers and those off it, what it
 * remembers of its closed layers (kept by the shell), and a count of the
 * edits that bring layers back as they were.
 */

/** A list of three items, each with two lines of text in it. */
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <ul id="list">
    ${[0, 1, 2].map((i) => `<li id="item-${i}"><span style="display: block">Item ${i}</span><span style="display: block">More ${i}</span></li>`).join("")}
  </ul>
  <p id="after">After</p>
</body>`;

/** The list's rows, it and its items open. */
const OPEN = ["1 Stack", "2 Stack", "3 Item 0", "3 More 0", "2 Stack", "3 Item 1", "3 More 1", "2 Stack", "3 Item 2", "3 More 2"];

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function openCanvas() {
  const frame = document.createElement("iframe");
  frame.style.width = "800px";
  document.body.append(frame);
  cleanups.push(() => frame.remove());
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(PAGE);
  doc.close();
  const editor = createEditor(createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), createChangeSet(), null);
  const layer = (id: string) => editor.tree().layerOf(doc.getElementById(id)!)!;
  return { editor, layer };
}

/** The panel on the canvas `editor` edits, and `outside()`'s layers off the canvas. */
function openPanel(editor: ReturnType<typeof openCanvas>["editor"], outside: () => LayerTree[] = () => []) {
  const host = document.createElement("div");
  document.body.append(host);
  const folds = createFolds();
  let broughtBack = 0;
  let shown = true;
  const draw = () =>
    act(() => render(shown ? h(LayerTreeView, { tree: editor.tree(), offCanvas: outside(), selected: [], folds, broughtBack, onSelect() {}, onHover() {} }) : null, host));
  cleanups.push(() => {
    render(null, host);
    host.remove();
  });
  draw();
  const rows = () => [...host.querySelectorAll('[role="treeitem"]')];
  return {
    /** Each row as `level name`, and whether it is closed. */
    rows: () => rows().map((row) => `${row.getAttribute("aria-level")} ${row.textContent!.trim()}${row.getAttribute("aria-expanded") === "false" ? " (closed)" : ""}`),
    /** Opens or closes the row `nth` among those at `level`. */
    toggle(level: number, nth: number) {
      const row = rows().filter((row) => row.getAttribute("aria-level") === String(level))[nth];
      act(() => {
        row.querySelector(".tk-tree-chevron")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });
    },
    /** Makes `edit`, which brings layers back as they were (an undo, a redo) when `bringsBack`, and shows what it leaves. */
    edit(edit: () => void, { bringsBack }: { bringsBack: boolean }) {
      edit();
      if (bringsBack) broughtBack++;
      draw();
    },
    hide() {
      shown = false;
      draw();
    },
    show() {
      shown = true;
      draw();
    },
  };
}

test("a deleted layer comes back listed open and closed as it was when the delete is undone, and again after a redo and an undo; the layers still listed stay as they were", () => {
  const { editor, layer } = openCanvas();
  const panel = openPanel(editor);
  // The list open, two of its items closed, one open.
  panel.toggle(2, 0);
  panel.toggle(2, 2);
  const before = panel.rows();
  expect(before).toEqual(["1 Stack", "2 Stack (closed)", "2 Stack", "3 Item 1", "3 More 1", "2 Stack (closed)", "1 After"]);

  panel.edit(() => editor.remove(layer("list")), { bringsBack: false });
  expect(panel.rows()).toEqual(["1 After"]);
  panel.edit(() => editor.undo(), { bringsBack: true });
  expect(panel.rows()).toEqual(before);

  panel.edit(() => editor.redo(), { bringsBack: true });
  panel.edit(() => editor.undo(), { bringsBack: true });
  expect(panel.rows()).toEqual(before);
  // Built anew by an edit to another layer, the list stays as it is.
  panel.edit(() => editor.remove(layer("after")), { bringsBack: false });
  expect(panel.rows()).toEqual(before.slice(0, -1));
});

test("a layer that comes back other than by an edit that brings it back as it was is listed open, as any layer new to the list, and stays so", () => {
  const { editor, layer } = openCanvas();
  const panel = openPanel(editor);
  panel.toggle(2, 1);
  panel.toggle(1, 0);

  panel.edit(() => editor.remove(layer("list")), { bringsBack: false });
  panel.edit(() => editor.undo(), { bringsBack: false });
  expect(panel.rows()).toEqual([...OPEN, "1 After"]);
  // Gone and back again: it is not closed from before.
  panel.edit(() => editor.redo(), { bringsBack: true });
  panel.edit(() => editor.undo(), { bringsBack: true });
  expect(panel.rows()).toEqual([...OPEN, "1 After"]);
});

test("the Layers panel hidden and shown again: a layer deleted before, or while it was hidden, comes back as it was when it went, or when the panel was hidden; the others start anew", () => {
  const { editor, layer } = openCanvas();
  const panel = openPanel(editor);
  panel.toggle(2, 1);
  const itemClosed = panel.rows();
  expect(itemClosed).toContain("2 Stack (closed)");

  // Deleted, then the panel hidden and shown again: the undo brings the list back as it was.
  panel.edit(() => editor.remove(layer("list")), { bringsBack: false });
  panel.hide();
  panel.show();
  panel.edit(() => editor.undo(), { bringsBack: true });
  expect(panel.rows()).toEqual(itemClosed);

  // Hidden with the item closed, the list deleted meanwhile: brought back as the panel had it then.
  panel.hide();
  panel.edit(() => editor.remove(layer("list")), { bringsBack: false });
  panel.show();
  panel.edit(() => editor.undo(), { bringsBack: true });
  expect(panel.rows()).toEqual(itemClosed);

  // On the canvas as the panel is shown again, the list starts anew, open; an undo of something else leaves it so.
  panel.edit(() => editor.remove(layer("after")), { bringsBack: false });
  panel.hide();
  panel.show();
  expect(panel.rows()).toEqual(OPEN);
  panel.edit(() => editor.undo(), { bringsBack: true });
  expect(panel.rows()).toEqual([...OPEN, "1 After"]);
});

test("a layer off the canvas new to the list has the layers in it closed; one listed before and brought back by an undo, as they were then", () => {
  const canvas = openCanvas();
  const outside = openCanvas();
  let off = false;
  const panel = openPanel(canvas.editor, () => (off ? [outside.editor.tree()] : []));
  const canvasRows = panel.rows();

  // New to the list: its list closed.
  panel.edit(() => (off = true), { bringsBack: false });
  expect(panel.rows()).toEqual(["1 Stack (closed)", "1 After", ...canvasRows]);
  // The designer opens it, then it goes, then an undo brings it back: open still.
  panel.toggle(1, 0);
  panel.edit(() => (off = false), { bringsBack: false });
  panel.edit(() => (off = true), { bringsBack: true });
  expect(panel.rows()).toEqual([...OPEN, "1 After", ...canvasRows]);
});
