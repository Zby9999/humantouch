import { describe, expect, test } from "vitest";
import { canvasKey, historyKey, type KeyState } from "../src/client/canvas-keys";

const EDITING: KeyState = { playing: false, page: 0, tool: false, dragging: false, selected: false };
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
  function historyPress(init: KeyboardEventInit, dragging: boolean, on?: Element) {
    const event = new KeyboardEvent("keydown", { bubbles: true, composed: true, ...init });
    if (!on) return historyKey(event, { dragging });
    let key: ReturnType<typeof historyKey> = null;
    on.addEventListener("keydown", (e) => (key = historyKey(e as KeyboardEvent, { dragging })), { once: true });
    document.body.append(on);
    on.dispatchEvent(event);
    on.remove();
    return key;
  }

  test("while a layer is dragged on the canvas, ⌘Z, ⇧⌘Z and Ctrl+Y do nothing, and go no further", () => {
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

  test("a field keeps ⌘Z while something typed in it is not applied yet, dragging or not; a Design panel field otherwise, or a slider, passes it on", () => {
    const typing = Object.assign(document.createElement("input"), { className: "vk-input" });
    typing.setAttribute("data-vk-typing", "");
    expect(historyPress({ key: "z", metaKey: true }, false, typing)).toBeNull();
    expect(historyPress({ key: "z", metaKey: true }, true, typing)).toBeNull();
    expect(historyPress({ key: "z", metaKey: true }, false, document.createElement("textarea"))).toBeNull();
    expect(historyPress({ key: "z", metaKey: true }, false, Object.assign(document.createElement("input"), { className: "vk-input" }))).toBe("undo");
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    expect(historyPress({ key: "Z", metaKey: true, shiftKey: true }, false, slider)).toBe("redo");
    expect(historyPress({ key: "z", metaKey: true }, true, slider)).toBe("ignored");
  });
});
