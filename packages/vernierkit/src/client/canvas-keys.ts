/**
 * What a key does on the canvas, as Figma's keys do: Space held pans, T and F
 * pick the text and Frame tools and V puts them down, Esc puts a tool down,
 * cancels a drag or selects the parents, ⇧1 fits every view in. Playing, the
 * keys scroll the canvas as on a page, and Esc stops (ADR 0010). A field, or
 * a dialog over the canvas, keeps its keys. ⌘Z and ⇧⌘Z go through the edits
 * made, and do nothing while a layer is dragged (`historyKey`).
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
  dragging: boolean;
  /** Layers are selected. */
  selected: boolean;
}

/** What the key `event` does on the canvas as it is now; null: nothing, and the key goes on. */
export function canvasKey(event: KeyboardEvent, { playing, page, tool, dragging, selected }: KeyState): CanvasKey | null {
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

/** What ⌘Z, ⇧⌘Z or Ctrl+Y does to the edits made: `ignored` while a layer is dragged on the canvas, when the key is taken and does nothing, then or later. */
export type HistoryKey = "undo" | "redo" | "ignored";

/**
 * What the key `event` does to the edits made, in the order they were made:
 * ⌘Z undoes, ⇧⌘Z redoes (Ctrl on other systems, and Ctrl+Y there too). While
 * a layer is dragged on the canvas, neither does anything until it is let go
 * or the drag cancelled: the views put back what makes room as it was when the
 * drag began, over what an undo would change meanwhile (ticket 61). A field
 * keeps its own while something typed in it is not applied yet; a field of
 * the Design panel otherwise, or a slider, passes it on. Null: not these keys,
 * and the key goes on.
 */
export function historyKey(event: KeyboardEvent, { dragging }: { dragging: boolean }): HistoryKey | null {
  const target = event.composedPath()[0];
  // A panel field with nothing typed in it, or a slider: ⌘Z is the editor's.
  const field =
    target instanceof HTMLElement &&
    ((target.classList.contains("vk-input") && !target.hasAttribute("data-vk-typing")) || target.getAttribute("role") === "slider");
  if (!(event.metaKey || event.ctrlKey) || event.altKey || (isEditable(target) && !field)) return null;
  // By the letter typed, wherever the keyboard has it.
  const key = event.key.toLowerCase();
  const redo = key === "y" ? !event.metaKey && !event.shiftKey : key === "z" && event.shiftKey;
  if (key !== "z" && !redo) return null;
  if (dragging) return "ignored";
  return redo ? "redo" : "undo";
}

/** Whether keys pressed on the target are its own: a field, or a slider (a gradient's stops), which moves with the arrow keys. */
export function isEditable(target: EventTarget | undefined): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/.test(target.localName) || target.getAttribute("role") === "slider");
}
