import { afterEach, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { createFolds } from "../src/client/layer-folds";
import type { Layer, LayerTree } from "../src/client/layers";
import { createViews } from "../src/client/views";

/** A list of three items, each with two lines of text in it. */
const PAGE = `<!DOCTYPE html>
<body style="margin: 0">
  <ul id="list">
    ${[0, 1, 2].map((i) => `<li id="item-${i}"><span style="display: block">Item ${i}</span><span style="display: block">More ${i}</span></li>`).join("")}
  </ul>
  <p id="after">After</p>
</body>`;

const frames: HTMLIFrameElement[] = [];
afterEach(() => frames.splice(0).forEach((frame) => frame.remove()));

function openCanvas() {
  const frame = document.createElement("iframe");
  frame.style.width = "800px";
  document.body.append(frame);
  frames.push(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(PAGE);
  doc.close();
  const editor = createEditor(createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 }), createChangeSet(), null);
  const at = (tree: LayerTree, id: string) => tree.layerOf(doc.getElementById(id)!)!;
  return { editor, at };
}

/** The ids of the elements of the closed layers. */
const ids = (closed: Set<Layer>) => [...closed].map((layer) => layer.el.id).sort();
const none = () => [];

test("a deleted layer comes back closed and open as it was when the delete is undone, and again after a redo and an undo", () => {
  const { editor, at } = openCanvas();
  const folds = createFolds();
  let tree = editor.tree();
  // The list open, two of its items closed, one open.
  let closed = new Set([at(tree, "item-0"), at(tree, "item-2")]);
  const step = (undone: boolean) => {
    const next = editor.tree();
    closed = folds.follow(closed, [tree], [next], undone, none);
    tree = next;
  };

  editor.remove(at(tree, "list"));
  step(false);
  expect(ids(closed)).toEqual([]);
  editor.undo();
  step(true);
  expect(ids(closed)).toEqual(["item-0", "item-2"]);
  expect(closed.has(at(tree, "item-0"))).toBe(true);

  editor.redo();
  step(true);
  expect(ids(closed)).toEqual([]);
  editor.undo();
  step(true);
  expect(ids(closed)).toEqual(["item-0", "item-2"]);
});

test("a layer that comes back other than by an undo or redo is open, as any layer new to the list, and stays so", () => {
  const { editor, at } = openCanvas();
  const folds = createFolds();
  let tree = editor.tree();
  let closed = new Set([at(tree, "item-1")]);
  const step = (undone: boolean) => {
    const next = editor.tree();
    closed = folds.follow(closed, [tree], [next], undone, none);
    tree = next;
  };

  editor.remove(at(tree, "list"));
  step(false);
  editor.undo();
  step(false);
  expect(ids(closed)).toEqual([]);
  // Gone and back again: it is not closed from before.
  editor.redo();
  step(true);
  editor.undo();
  step(true);
  expect(ids(closed)).toEqual([]);
});

test("the layers still listed stay closed, found in the layers built anew", () => {
  const { editor, at } = openCanvas();
  const folds = createFolds();
  const tree = editor.tree();
  editor.remove(at(tree, "after"));
  const next = editor.tree();
  const closed = folds.follow(new Set([at(tree, "item-1")]), [tree], [next], false, none);
  expect([...closed]).toEqual([at(next, "item-1")]);
});

test("a layer off the canvas new to the list has what it is given closed; one listed before and back by an undo, what was closed then", () => {
  const canvas = openCanvas();
  const outside = openCanvas();
  const folds = createFolds();
  const fresh = (tree: LayerTree) => tree.root.children.filter((layer) => layer.children.length > 0);
  const tree = canvas.editor.tree();
  const out = outside.editor.tree();

  // New to the list: its list closed.
  let closed = folds.follow(new Set(), [tree], [out, tree], false, fresh);
  expect(ids(closed)).toEqual(["list"]);
  // The designer opens it, then it goes, then an undo brings it back: open still.
  closed = folds.follow(new Set(), [out, tree], [tree], false, fresh);
  closed = folds.follow(closed, [tree], [out, tree], true, fresh);
  expect(ids(closed)).toEqual([]);
});
