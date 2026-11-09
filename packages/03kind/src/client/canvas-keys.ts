/**
 * What a key does on the canvas, as Figma's keys do: Space held pans, T and F
 * pick the text and Frame tools and V puts them down, Esc puts a tool down,
 * cancels a drag or selects the parents, ⇧1 fits every view in. Playing, the
 * keys scroll the canvas as on a page, and Esc stops (ADR 0010). A field, or
 * a dialog over the canvas, keeps its keys. ⌘Z and ⇧⌘Z go through the edits
 * made (`historyKey`). While the pointer is held down on something that edits
 * as it moves, only the keys that move about the canvas, and Esc, do
 * anything (`heldKey`, ADR 0012).
 */
import type { Created } from "./changeset";

/** The tool picked: what the next drag on the canvas draws, new text or a new Frame; null to select. */
export type Tool = Created["type"] | null;

/** What a key pressed or let go does on the canvas; the canvas keeps the key from anything else. */
export type CanvasKey =
  /** Playing: scrolled down `by` px (up when negative); ±Infinity: to the end or to the top. */
  | { action: "scroll"; by: number }
  | { action: "stop playing" }
  /** Space pressed or let go: dragging pans while it is held. */
  | { action: "pan"; held: boolean }
  /** A tool picked, or put down (null). */
  | { action: "tool"; tool: Tool }
  | { action: "cancel drag" }
  | { action: "select parents" }
  | { action: "fit" };

/** What the canvas is doing as the key comes. */
export interface KeyState {
  playing: boolean;
  /** Playing: how far a page down scrolls, in px. */
  page: number;
  /** A tool is picked. */
  tool: boolean;
  /** A layer is dragged, or a handle of the layer selected is: Esc cancels it. */
  dragging: boolean;
  /** The pointer is held down on a layer, or drawing one, or elsewhere on something that edits as it moves (`heldKey`). */
  held: boolean;
  /** Layers are selected. */
  selected: boolean;
}

/** What the key `event` does on the canvas as it is now; null: nothing, and the key goes on. */
export function canvasKey(event: KeyboardEvent, { playing, page, tool, dragging, held, selected }: KeyState): CanvasKey | null {
  if (playing) {
    if (event.type !== "keydown" || event.metaKey || event.ctrlKey || event.altKey) return null;
    if (event.key === "Escape") return { action: "stop playing" };
    const by: Record<string, number> = { ArrowDown: 40, ArrowUp: -40, PageDown: page, PageUp: -page, Home: -Infinity, End: Infinity };
    // Space on the button that stops playing presses it, as on any button.
    const onButton = event.composedPath()[0] instanceof HTMLButtonElement;
    const dy = event.code === "Space" ? (onButton ? undefined : event.shiftKey ? -page : page) : by[event.key];
    return dy === undefined ? null : { action: "scroll", by: dy };
  }
  const target = event.composedPath()[0];
  if (isEditable(target) || (target instanceof Element && target.closest('[role="dialog"]'))) return null;
  // Held down, only the keys that move about the canvas, and Esc, act here: not T, F or V, say,
  // as a tool picked would change what the press makes, or what follows it.
  if (held && heldKey(event) !== "passes") return null;
  // Repeats and key-up too: a focused button would otherwise click on Space.
  if (event.code === "Space") return { action: "pan", held: event.type === "keydown" };
  if (event.type !== "keydown") return null;
  if (event.key === "Escape" && tool) return { action: "tool", tool: null };
  const key = event.key.toLowerCase();
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
  if ((key === "t" || key === "f" || key === "v") && plain && !event.shiftKey) return { action: "tool", tool: key === "t" ? "text" : key === "f" ? "frame" : null };
  if (event.key === "Escape" && dragging) return { action: "cancel drag" };
  if (event.key === "Escape" && selected) return { action: "select parents" };
  if (event.code === "Digit1" && event.shiftKey && plain) return { action: "fit" };
  return null;
}

/** What ⌘Z, ⇧⌘Z or Ctrl+Y does to the edits made: `ignored` while the pointer is held down (`heldKey`), when the key is taken and does nothing, then or later. */
export type HistoryKey = "undo" | "redo" | "ignored";

/**
 * What the key `event` does to the edits made, in the order they were made:
 * ⌘Z undoes, ⇧⌘Z redoes (Ctrl on other systems, and Ctrl+Y there too). While
 * the pointer is held down on a layer on the canvas, a handle of the layer
 * selected, a value's icon, a gradient's stop or a layer being drawn, neither
 * does anything until it is let go, or a drag cancelled with Esc: the views
 * put back what makes room as it was when the drag began, over what an undo
 * would change meanwhile, and a value dragged would be set again as the
 * pointer next moves (tickets 61, 62, ADR 0012). A field keeps its own while something typed in it is not applied
 * yet; a field of the Design panel otherwise, or a slider, passes it on. The
 * change list in preview mode takes the same keys by this same judgment
 * (ticket 72). Null: not these keys, and the key goes on.
 */
export function historyKey(event: KeyboardEvent, { held }: { held: boolean }): HistoryKey | null {
  const target = event.composedPath()[0];
  // A panel field with nothing typed in it, a slider, or a panel's edge: ⌘Z is the editor's.
  const field =
    target instanceof HTMLElement &&
    ((target.classList.contains("tk-input") && !target.hasAttribute("data-tk-typing")) || movesWithArrows(target));
  if (isEditable(target) && !field) return null;
  const command = editorCommand(event);
  if (command !== "undo" && command !== "redo") return null;
  return held ? "ignored" : command;
}

/** What the editor does with ⌘ (Ctrl) and a letter: the Shell's keys. */
export type EditorCommand = "copy" | "cut" | "paste" | "duplicate" | "ungroup" | "undo" | "redo" | "copy style" | "paste style";

/**
 * Which of the editor's commands the key `event` is: ⌘C, ⌘X, ⌘V and ⌘D copy,
 * cut, paste and duplicate, ⌘⇧G ungroups, ⌘Z undoes, ⇧⌘Z redoes, and so does
 * Ctrl+Y; ⌥⌘C and ⌥⌘V copy and paste a layer's style (ticket 117, Figma's
 * Copy properties and Paste properties). ⌘ or Ctrl alike, on any system; with
 * ⌥, those two alone. By the letter typed, wherever the keyboard has it; with
 * ⌥, a Mac types another one (ç, √), so by the key. The same letter with other
 * modifiers (⌘Y, ⌘G, ⌘⇧C, ⌘⇧V, ⌥⌘Z, ⌥⇧⌘C) is none of them: the browser's, if anything. Null: none.
 */
export function editorCommand(event: KeyboardEvent): EditorCommand | null {
  if (!(event.metaKey || event.ctrlKey)) return null;
  if (event.altKey) {
    if (event.shiftKey) return null;
    const letter = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : event.code === "KeyC" ? "c" : event.code === "KeyV" ? "v" : "";
    return letter === "c" ? "copy style" : letter === "v" ? "paste style" : null;
  }
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y") return event.metaKey || event.shiftKey ? null : "redo";
  if (key === "g") return event.shiftKey ? "ungroup" : null;
  return (!event.shiftKey && SHORTCUTS[key]) || null;
}

/** The editor's commands made with ⌘ and a letter alone, but undo, redo and ungroup. */
const SHORTCUTS: Record<string, EditorCommand | undefined> = { c: "copy", x: "cut", v: "paste", d: "duplicate" };

/** What becomes of a key while the pointer is held down (`heldKey`). */
export type HeldKey = "passes" | "text" | "ignored";

/**
 * What becomes of a key while the pointer is held down on a layer on the
 * canvas, a handle of the layer selected, a value's icon, a gradient's stop
 * or a layer being drawn
 * (`pointerHeld`, ADR 0012):
 * - `passes`, it goes on as ever: Esc; Space, off a field (it pans); ⇧1, with
 *   no other modifier; the modifier keys themselves (⌘ turning snapping off,
 *   ⌥ measuring or copying where the layer is let go, ⇧ stepping by 10); the
 *   browser's own shortcuts, with ⌘ (Ctrl) and keys that are none of the
 *   editor's commands (`editorCommand`): ⌘R, ⌘F, ⌘L, ⌘+, and ⌘G, ⌘Y, ⌘⇧C,
 *   ⌘⇧V, though the editor takes those letters with other modifiers; and any
 *   key let go.
 * - `text`, in a field that takes text: it types there as ever, but nothing
 *   acts on it, the field neither (no value applied with Enter or stepped with
 *   the arrows).
 * - `ignored`: nothing acts on it, nor the browser. Every other key: none
 *   changes the canvas, the changes or the history, picks a tool, copies a
 *   layer as the drag has shifted it, presses a button, or moves the focus out
 *   of a field (Tab), which would apply what was typed in it.
 */
export function heldKey(event: KeyboardEvent): HeldKey {
  if (event.type !== "keydown" || event.key === "Escape" || MODIFIERS.has(event.key)) return "passes";
  const target = event.composedPath()[0];
  if (event.key === "Tab") return "ignored";
  if (takesText(target)) return "text";
  if ((event.metaKey || event.ctrlKey) && !editorCommand(event)) return "passes";
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
  // Space pans, but on a checkbox or a stop's handle it would press it.
  if ((event.code === "Space" && !isEditable(target)) || (event.code === "Digit1" && event.shiftKey && plain)) return "passes";
  return "ignored";
}

const MODIFIERS = new Set(["Shift", "Meta", "Control", "Alt", "AltGraph", "CapsLock", "Fn"]);

/** Whether the target takes text typed: a text field, a text area, or text typed in. */
function takesText(target: EventTarget | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.localName === "textarea") return true;
  return target instanceof HTMLInputElement && !/^(checkbox|radio|range|color|button|submit|reset|file|image)$/.test(target.type);
}

/**
 * Whether keys pressed on the target are its own: a field, or what moves with the arrow keys: a slider (a gradient's
 * stops), or a panel's edge (designer, 2026-11-08).
 */
export function isEditable(target: EventTarget | undefined): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/.test(target.localName) || movesWithArrows(target));
}

/** A slider (a gradient's stop) or a panel's edge (designer, 2026-11-08): it moves with the arrow keys. */
function movesWithArrows(target: HTMLElement): boolean {
  return /^(slider|separator)$/.test(target.getAttribute("role") ?? "");
}
