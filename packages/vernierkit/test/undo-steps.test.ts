import { describe, expect, test } from "vitest";
import type { Layer } from "../src/client/layers";
import { createHistory, createSteps, type History, type Step } from "../src/client/undo-steps";

/**
 * An editor's steps over a value it edits, showing the canvas as `syncs`
 * counts, and in every view at once as `catchUps` counts, its layers found by name.
 */
function editorOver(history: History) {
  const state = { value: 0, syncs: 0, catchUps: 0, log: [] as string[] };
  const layersOf = (ids: string[]) => ids.map((id) => ({ el: { getAttribute: () => id }, name: id }) as unknown as Layer);
  const views = { sync: () => void state.syncs++, catchUp: () => void state.catchUps++ };
  const steps = createSteps(history, views, layersOf);
  /** Sets the value as an edit to `layer`, recorded as a step. */
  const set = (layer: string, to: number, continues = false, extra: Partial<Step> = {}) => {
    const from = state.value;
    state.value = to;
    steps.push({ layers: [layer], key: `${layer} value`, undo: () => (state.value = from), redo: () => (state.value = to), ...extra }, continues);
  };
  const names = (layers: Layer[]) => layers.map((layer) => layer.name);
  return { state, steps, set, names };
}

describe("one adjustment is one step", () => {
  test("the steps of a drag on a number are undone back to before it at once, and redone to where it ended", () => {
    const { state, steps, set } = editorOver(createHistory());
    set("1", 10);
    set("1", 20, true);
    set("1", 30, true);
    steps.undo();
    expect(state.value).toBe(0);
    steps.redo();
    expect(state.value).toBe(30);
    // Nothing else to undo: it was one step.
    steps.undo();
    steps.undo();
    expect(state.value).toBe(0);
  });

  test("a step that does not continue, or edits something else, is a step of its own", () => {
    const { state, steps, set } = editorOver(createHistory());
    set("1", 10);
    set("1", 20);
    set("2", 30, true);
    steps.undo();
    expect(state.value).toBe(20);
    steps.undo();
    expect(state.value).toBe(10);
    steps.undo();
    expect(state.value).toBe(0);
  });

  test("redone, a merged adjustment first does again what its first step made way with", () => {
    const { state, steps, set } = editorOver(createHistory());
    set("1", 10, false, { first: () => state.log.push("cut") });
    set("1", 20, true);
    steps.undo();
    steps.redo();
    expect(state.log).toEqual(["cut"]);
    expect(state.value).toBe(20);
  });

  test("a new step leaves nothing to redo", () => {
    const { state, steps, set } = editorOver(createHistory());
    set("1", 10);
    steps.undo();
    set("1", 5);
    expect(steps.redo()).toEqual([]);
    expect(state.value).toBe(5);
  });
});

describe("editors side by side share their history", () => {
  test("undo goes back through both editors' steps in the order they were made, and the same edit in another editor is a step of its own", () => {
    const history = createHistory();
    const canvas = editorOver(history);
    const offCanvas = editorOver(history);
    canvas.set("1", 10);
    offCanvas.set("1", 7, true);
    canvas.steps.undo();
    expect(offCanvas.state.value).toBe(0);
    expect(canvas.state.value).toBe(10);
    // Each step shows in its own editor's views again.
    const before = canvas.state.catchUps;
    offCanvas.steps.undo();
    expect(canvas.state.value).toBe(0);
    expect(canvas.state.catchUps).toBe(before + 1);
  });
});

describe("undone and redone", () => {
  test("an edit shows as the views follow the canvas; undone or redone, in every view at once, though they wait for a value changed (ADR 0011)", () => {
    const { state, steps, set } = editorOver(createHistory());
    set("1", 10);
    expect([state.syncs, state.catchUps]).toEqual([1, 0]);
    steps.undo();
    expect([state.syncs, state.catchUps]).toEqual([1, 1]);
    steps.redo();
    expect([state.syncs, state.catchUps]).toEqual([1, 2]);
    // Nothing to undo or redo: nothing to show.
    steps.redo();
    expect(state.catchUps).toBe(2);
  });
});

describe("a group of edits", () => {
  test("is one step, undone last first, and the views are shown once, when it ends", () => {
    const { state, steps, names } = editorOver(createHistory());
    let syncsInside = 0;
    steps.group(() => {
      for (const id of ["a", "b"]) {
        steps.push({ layers: [id], key: id, undo: () => state.log.push(`undo ${id}`), redo: () => state.log.push(`redo ${id}`) }, false);
      }
      syncsInside = state.syncs;
    }, false);
    expect(syncsInside).toBe(0);
    expect(state.syncs).toBe(1);
    expect(names(steps.undo())).toEqual(["a", "b"]);
    expect(state.log).toEqual(["undo b", "undo a"]);
    steps.redo();
    expect(state.log).toEqual(["undo b", "undo a", "redo a", "redo b"]);
  });

  test("with nothing in it, is no step", () => {
    const { steps } = editorOver(createHistory());
    steps.group(() => {}, false);
    expect(steps.undo()).toEqual([]);
  });
});

describe("a run of nudges", () => {
  test("is undone back through each nudge, and leaves the layers it started from undone and those it ended with redone", () => {
    const { state, steps, names } = editorOver(createHistory());
    const nudge = (from: string, to: string) =>
      steps.group(
        () => steps.push({ layers: [to], back: [from], key: "move", undo: () => state.log.push(`back to ${from}`), redo: () => state.log.push(`on to ${to}`) }, false),
        true,
        "nudge",
      );
    nudge("a", "a");
    nudge("a", "a");
    expect(names(steps.undo())).toEqual(["a"]);
    expect(state.log).toEqual(["back to a", "back to a"]);
    expect(names(steps.redo())).toEqual(["a"]);
    expect(state.log).toEqual(["back to a", "back to a", "on to a", "on to a"]);
  });
});

describe("an adjustment whose first steps change nothing", () => {
  /**
   * An editor over a value, and a resize of the same layer's width: each
   * step a group of the run "resize", which makes no step when the width
   * is already what it is set to, as a handle moved without the size changing.
   */
  function resizable() {
    const editor = editorOver(createHistory());
    const width = { now: 256 };
    const resize = (to: number, continues: boolean) =>
      editor.steps.group(
        () => {
          const from = width.now;
          if (from === to) return;
          width.now = to;
          editor.steps.push({ layers: ["1"], key: "1 width", undo: () => (width.now = from), redo: () => (width.now = to) }, false);
        },
        continues,
        "resize",
      );
    return { ...editor, width, resize };
  }

  test("taken back, as Esc cancels it, it takes nothing back: the edit before it stays, to undo and redo", () => {
    const { state, steps, set, width, resize } = resizable();
    // The layer's fill changed; then its edge pressed and moved, its width still 256.
    set("1", 10);
    resize(256, false);
    resize(256, true);
    steps.takeBack();

    expect(state.value).toBe(10);
    expect(width.now).toBe(256);
    expect(steps.redo()).toEqual([]);
    expect(state.value).toBe(10);
    steps.undo();
    expect(state.value).toBe(0);
    steps.redo();
    expect(state.value).toBe(10);
  });

  test("its later steps are a step of their own, not one with the same adjustment of the same layer just before it", () => {
    const { steps, width, resize } = resizable();
    // A first resize to 300, where it snapped; a second begins there, in the snap, and goes on to 320.
    resize(300, false);
    resize(300, false);
    resize(320, true);

    steps.undo();
    expect(width.now).toBe(300);
    steps.undo();
    expect(width.now).toBe(256);
  });

  test("taken back, it takes back its own steps only", () => {
    const { steps, width, resize } = resizable();
    resize(300, false);
    resize(300, false);
    resize(320, true);
    steps.takeBack();

    expect(width.now).toBe(300);
    expect(steps.redo()).toEqual([]);
    steps.undo();
    expect(width.now).toBe(256);
  });

  test("a run of nudges begun with one that moves nothing is a step of its own, not one with an earlier run", () => {
    const { state, steps } = editorOver(createHistory());
    const nudge = (to: number, continues: boolean) =>
      steps.group(
        () => {
          const from = state.value;
          if (from === to) return;
          state.value = to;
          steps.push({ layers: ["a"], key: "move", undo: () => (state.value = from), redo: () => (state.value = to) }, false);
        },
        continues,
        "nudge",
      );
    nudge(1, false);
    nudge(2, true);
    // Later, a run that begins against the end of a Stack: nothing moves, then it moves back.
    nudge(2, false);
    nudge(1, true);

    steps.undo();
    expect(state.value).toBe(2);
    steps.undo();
    expect(state.value).toBe(0);
  });
});
