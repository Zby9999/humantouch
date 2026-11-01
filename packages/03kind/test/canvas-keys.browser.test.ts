import { describe, expect, test } from "vitest";
import { canvasKey, editorCommand, heldKey, historyKey, type KeyState } from "../src/client/canvas-keys";

const EDITING: KeyState = { playing: false, page: 0, tool: false, dragging: false, held: false, selected: false };
const PLAYING: KeyState = { ...EDITING, playing: true, page: 760 };

/** What the key does on the canvas, pressed (or let go) on `on`, or on nothing in particular. */
function press(init: KeyboardEventInit, state: KeyState, { on, type = "keydown" }: { on?: Element; type?: string } = {}) {
  const event = new KeyboardEvent(type, { bubbles: true, composed: true, ...init });
  if (!on) return canvasKey(event, state);
  let key: ReturnType<typeof canvasKey> = null;
  on.addEventListener(type, (e) => (key = canvasKey(e as KeyboardEvent, state)), { once: true });
  document.body.append(on);
  on.dispatchEvent(event);
  on.remove();
  return key;
}

describe("the keys on the canvas", () => {
  test("Space held pans, pressed and let go", () => {
    expect(press({ code: "Space", key: " " }, EDITING)).toEqual({ action: "pan", held: true });
    expect(press({ code: "Space", key: " " }, EDITING, { type: "keyup" })).toEqual({ action: "pan", held: false });
  });

  test("T, F and V pick a tool, or put it down; with a modifier they do nothing here", () => {
    expect(press({ key: "t" }, EDITING)).toEqual({ action: "tool", tool: "text" });
    expect(press({ key: "F", shiftKey: false }, EDITING)).toEqual({ action: "tool", tool: "frame" });
    expect(press({ key: "v" }, EDITING)).toEqual({ action: "tool", tool: null });
    expect(press({ key: "t", metaKey: true }, EDITING)).toBeNull();
    expect(press({ key: "t", shiftKey: true }, EDITING)).toBeNull();
  });

  test("Esc puts a tool down first, then cancels a drag, then selects the parents", () => {
    expect(press({ key: "Escape" }, { ...EDITING, tool: true, dragging: true, selected: true })).toEqual({ action: "tool", tool: null });
    expect(press({ key: "Escape" }, { ...EDITING, dragging: true, selected: true })).toEqual({ action: "cancel drag" });
    expect(press({ key: "Escape" }, { ...EDITING, selected: true })).toEqual({ action: "select parents" });
    expect(press({ key: "Escape" }, EDITING)).toBeNull();
  });

  test("held down on a layer or drawing one, T, F and V pick no tool; Space, Esc and ⇧1 go on as ever", () => {
    const HELD = { ...EDITING, held: true };
    expect(press({ key: "t" }, HELD)).toBeNull();
    expect(press({ key: "f" }, { ...HELD, tool: true })).toBeNull();
    expect(press({ key: "v" }, { ...HELD, tool: true })).toBeNull();
    expect(press({ code: "Space", key: " " }, HELD)).toEqual({ action: "pan", held: true });
    expect(press({ code: "Space", key: " " }, HELD, { type: "keyup" })).toEqual({ action: "pan", held: false });
    expect(press({ key: "Escape" }, { ...HELD, tool: true })).toEqual({ action: "tool", tool: null });
    expect(press({ key: "Escape" }, { ...HELD, dragging: true, selected: true })).toEqual({ action: "cancel drag" });
    // Pressed on a layer, not yet moved 3px: Esc selects the parents, as it did.
    expect(press({ key: "Escape" }, { ...HELD, selected: true })).toEqual({ action: "select parents" });
    expect(press({ code: "Digit1", key: "!", shiftKey: true }, HELD)).toEqual({ action: "fit" });
  });

  test("⇧1 fits every view in", () => {
    expect(press({ code: "Digit1", key: "!", shiftKey: true }, EDITING)).toEqual({ action: "fit" });
    expect(press({ code: "Digit1", key: "1" }, EDITING)).toBeNull();
  });

  test("a field, or a dialog over the canvas, keeps its keys", () => {
    expect(press({ key: "t" }, EDITING, { on: document.createElement("input") })).toBeNull();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.append(button);
    let key: ReturnType<typeof canvasKey> = null;
    button.addEventListener("keydown", (e) => (key = canvasKey(e, EDITING)), { once: true });
    document.body.append(dialog);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    dialog.remove();
    expect(key).toBeNull();
  });

  test("playing, the keys scroll as on a page, Esc stops, and Space on a button presses it", () => {
    expect(press({ key: "ArrowDown" }, PLAYING)).toEqual({ action: "scroll", by: 40 });
    expect(press({ key: "PageUp" }, PLAYING)).toEqual({ action: "scroll", by: -760 });
    expect(press({ key: "End" }, PLAYING)).toEqual({ action: "scroll", by: Infinity });
    expect(press({ code: "Space", key: " ", shiftKey: true }, PLAYING)).toEqual({ action: "scroll", by: -760 });
    expect(press({ key: "Escape" }, PLAYING)).toEqual({ action: "stop playing" });
    expect(press({ code: "Space", key: " " }, PLAYING, { on: document.createElement("button") })).toBeNull();
    expect(press({ key: "t" }, PLAYING)).toBeNull();
    expect(press({ key: "ArrowDown", metaKey: true }, PLAYING)).toBeNull();
  });
});

describe("undo and redo by their keys", () => {
  /** What the key does to the history, pressed on `on`, or on nothing in particular. */
  function historyPress(init: KeyboardEventInit, held: boolean, on?: Element) {
    const event = new KeyboardEvent("keydown", { bubbles: true, composed: true, ...init });
    if (!on) return historyKey(event, { held });
    let key: ReturnType<typeof historyKey> = null;
    on.addEventListener("keydown", (e) => (key = historyKey(e as KeyboardEvent, { held })), { once: true });
    document.body.append(on);
    on.dispatchEvent(event);
    on.remove();
    return key;
  }

  test("while the pointer is held down on a layer, a value's icon, a gradient's stop or a layer being drawn, ⌘Z, ⇧⌘Z and Ctrl+Y do nothing, and go no further", () => {
    expect(historyPress({ key: "z", metaKey: true }, true)).toBe("ignored");
    expect(historyPress({ key: "Z", metaKey: true, shiftKey: true }, true)).toBe("ignored");
    expect(historyPress({ key: "z", ctrlKey: true }, true)).toBe("ignored");
    expect(historyPress({ key: "Z", ctrlKey: true, shiftKey: true }, true)).toBe("ignored");
    expect(historyPress({ key: "y", ctrlKey: true }, true)).toBe("ignored");
    // Other keys are not taken here.
    expect(historyPress({ key: "c", metaKey: true }, true)).toBeNull();
  });

  test("otherwise ⌘Z undoes and ⇧⌘Z redoes, Ctrl on other systems, with Ctrl+Y redoing there too", () => {
    expect(historyPress({ key: "z", metaKey: true }, false)).toBe("undo");
    expect(historyPress({ key: "z", ctrlKey: true }, false)).toBe("undo");
    expect(historyPress({ key: "Z", metaKey: true, shiftKey: true }, false)).toBe("redo");
    expect(historyPress({ key: "Z", ctrlKey: true, shiftKey: true }, false)).toBe("redo");
    expect(historyPress({ key: "y", ctrlKey: true }, false)).toBe("redo");
    expect(historyPress({ key: "y", metaKey: true }, false)).toBeNull();
    expect(historyPress({ key: "z", metaKey: true, altKey: true }, false)).toBeNull();
    expect(historyPress({ key: "z" }, false)).toBeNull();
  });

  test("a field keeps ⌘Z while something typed in it is not applied yet, held down or not; a Design panel field otherwise, or a slider, passes it on", () => {
    const typing = Object.assign(document.createElement("input"), { className: "tk-input" });
    typing.setAttribute("data-tk-typing", "");
    expect(historyPress({ key: "z", metaKey: true }, false, typing)).toBeNull();
    expect(historyPress({ key: "z", metaKey: true }, true, typing)).toBeNull();
    expect(historyPress({ key: "z", metaKey: true }, false, document.createElement("textarea"))).toBeNull();
    expect(historyPress({ key: "z", metaKey: true }, false, Object.assign(document.createElement("input"), { className: "tk-input" }))).toBe("undo");
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    expect(historyPress({ key: "Z", metaKey: true, shiftKey: true }, false, slider)).toBe("redo");
    expect(historyPress({ key: "z", metaKey: true }, true, slider)).toBe("ignored");
  });
});

describe("the keys while the pointer is held down on a layer, a value's icon, a gradient's stop or a layer being drawn", () => {
  /** What becomes of the key, pressed (or let go) on `on`, or on nothing in particular. */
  function heldPress(init: KeyboardEventInit, { on, type = "keydown" }: { on?: Element; type?: string } = {}) {
    const event = new KeyboardEvent(type, { bubbles: true, composed: true, ...init });
    if (!on) return heldKey(event);
    let key: ReturnType<typeof heldKey> | null = null;
    on.addEventListener(type, (e) => (key = heldKey(e as KeyboardEvent)), { once: true });
    document.body.append(on);
    on.dispatchEvent(event);
    on.remove();
    return key;
  }

  test("the keys that edit do nothing: ⌘D, Delete, Backspace, ⌘X, ⌘V, ⇧A, ⌥⇧A, ⌘⇧G, the arrows, ⌘Z and ⇧⌘Z", () => {
    for (const init of [
      { key: "d", metaKey: true },
      { key: "Delete" },
      { key: "Backspace" },
      { key: "x", metaKey: true },
      { key: "v", ctrlKey: true },
      { key: "A", shiftKey: true },
      { key: "Å", code: "KeyA", shiftKey: true, altKey: true },
      { key: "G", metaKey: true, shiftKey: true },
      { key: "ArrowLeft" },
      { key: "ArrowDown", shiftKey: true },
      { key: "z", metaKey: true },
      { key: "Z", metaKey: true, shiftKey: true },
      { key: "y", ctrlKey: true },
    ]) {
      expect(heldPress(init), JSON.stringify(init)).toBe("ignored");
    }
  });

  test("nor do the keys that would carry off or break the press: ⌘C, T, F and V, Enter on a button", () => {
    expect(heldPress({ key: "c", metaKey: true })).toBe("ignored");
    expect(heldPress({ key: "t" })).toBe("ignored");
    expect(heldPress({ key: "f" })).toBe("ignored");
    expect(heldPress({ key: "v" })).toBe("ignored");
    expect(heldPress({ key: "Enter" }, { on: document.createElement("button") })).toBe("ignored");
    // Out of a field, Tab would apply what was typed in it.
    expect(heldPress({ key: "Tab" }, { on: Object.assign(document.createElement("input"), { className: "tk-input" }) })).toBe("ignored");
    expect(heldPress({ key: "Tab", shiftKey: true })).toBe("ignored");
  });

  test("the browser's own shortcuts, with ⌘ or Ctrl and a letter the editor does not take, go on as ever", () => {
    expect(heldPress({ key: "r", metaKey: true })).toBe("passes");
    expect(heldPress({ key: "f", metaKey: true })).toBe("passes");
    expect(heldPress({ key: "l", ctrlKey: true })).toBe("passes");
    expect(heldPress({ key: "=", metaKey: true })).toBe("passes");
    // The editor's own, with ⌘ or not, do not.
    expect(heldPress({ key: "c", ctrlKey: true })).toBe("ignored");
    expect(heldPress({ key: "G", metaKey: true, shiftKey: true })).toBe("ignored");
  });

  test("a letter the editor takes with ⌘, with modifiers it does not take it with, is the browser's and goes on: ⌘G, ⌘Y, ⌘⇧C, ⌘⇧V, ⌘⇧D, ⌥⌘C, ⌥⌘Z", () => {
    for (const init of [
      { key: "g", metaKey: true },
      { key: "y", metaKey: true },
      { key: "Y", metaKey: true, shiftKey: true },
      { key: "Y", ctrlKey: true, shiftKey: true },
      { key: "C", metaKey: true, shiftKey: true },
      { key: "V", metaKey: true, shiftKey: true },
      { key: "D", metaKey: true, shiftKey: true },
      { key: "X", ctrlKey: true, shiftKey: true },
      { key: "ç", code: "KeyC", metaKey: true, altKey: true },
      { key: "Ω", code: "KeyZ", metaKey: true, altKey: true },
    ]) {
      expect(heldPress(init), JSON.stringify(init)).toBe("passes");
    }
  });

  test("Esc, Space, ⇧1 and the modifier keys themselves go on as ever, and so does a key let go", () => {
    expect(heldPress({ key: "Escape" })).toBe("passes");
    expect(heldPress({ code: "Space", key: " " })).toBe("passes");
    expect(heldPress({ code: "Digit1", key: "!", shiftKey: true })).toBe("passes");
    for (const key of ["Shift", "Meta", "Control", "Alt"]) expect(heldPress({ key }), key).toBe("passes");
    expect(heldPress({ key: "Delete" }, { type: "keyup" })).toBe("passes");
    // ⌘1 or 1 alone is not ⇧1.
    expect(heldPress({ code: "Digit1", key: "1" })).toBe("ignored");
  });

  test("in a field that takes text, a key types as ever but the field does no more with it; Esc goes on; a stop's handle, a checkbox or a list takes nothing", () => {
    const text = Object.assign(document.createElement("input"), { className: "tk-input" });
    expect(heldPress({ key: "Enter" }, { on: text })).toBe("text");
    expect(heldPress({ key: "ArrowUp" }, { on: text })).toBe("text");
    expect(heldPress({ key: "5" }, { on: text })).toBe("text");
    expect(heldPress({ key: "Escape" }, { on: text })).toBe("passes");
    expect(heldPress({ key: "Enter", metaKey: true }, { on: document.createElement("textarea") })).toBe("text");
    const slider = document.createElement("span");
    slider.setAttribute("role", "slider");
    expect(heldPress({ key: "Delete" }, { on: slider })).toBe("ignored");
    expect(heldPress({ key: "ArrowRight" }, { on: slider })).toBe("ignored");
    expect(heldPress({ code: "Space", key: " " }, { on: Object.assign(document.createElement("input"), { type: "checkbox" }) })).toBe("ignored");
    expect(heldPress({ key: "ArrowDown" }, { on: document.createElement("select") })).toBe("ignored");
  });
});

describe("the editor's commands with ⌘ (Ctrl on other systems; either, on any)", () => {
  const command = (init: KeyboardEventInit) => editorCommand(new KeyboardEvent("keydown", init));

  test("⌘C, ⌘X, ⌘V and ⌘D copy, cut, paste and duplicate; ⌘⇧G ungroups; ⌘Z undoes; ⇧⌘Z and Ctrl+Y redo", () => {
    expect(command({ key: "c", metaKey: true })).toBe("copy");
    expect(command({ key: "x", ctrlKey: true })).toBe("cut");
    expect(command({ key: "v", metaKey: true })).toBe("paste");
    expect(command({ key: "d", metaKey: true })).toBe("duplicate");
    expect(command({ key: "G", metaKey: true, shiftKey: true })).toBe("ungroup");
    expect(command({ key: "z", metaKey: true })).toBe("undo");
    expect(command({ key: "Z", ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(command({ key: "y", ctrlKey: true })).toBe("redo");
  });

  test("the same letters with other modifiers, or none, are none of them: ⌘Y, ⌘G, ⌘⇧C, ⌥⌘Z, D alone", () => {
    for (const init of [
      { key: "y", metaKey: true },
      { key: "Y", ctrlKey: true, shiftKey: true },
      { key: "g", metaKey: true },
      { key: "C", metaKey: true, shiftKey: true },
      { key: "ç", code: "KeyC", metaKey: true, altKey: true },
      { key: "Ω", code: "KeyZ", metaKey: true, altKey: true },
      { key: "d" },
      { key: "r", metaKey: true },
    ]) {
      expect(command(init), JSON.stringify(init)).toBeNull();
    }
  });
});
