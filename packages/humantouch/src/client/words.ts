/**
 * A text layer's words as one reads them (ticket 144): white space between
 * them run together, and, where its lines break, a line break, "\n".
 */

/**
 * An element's words, as one reads them: white space between them as one
 * space; with `lines`, a line break as a line break, "\n": a `<br>`, or a new
 * line where the white space keeps new lines (`white-space: pre-line`, say,
 * as text typed in has it), each line's words with no space around them.
 * Without, a `<br>` reads as the space between the words it parts. With
 * `blocks` too, as the page draws them (ADR 0016): an element laid out as a
 * block (`display: block`, `flex`, …) in it starts a line and ends one, as
 * a line break does, once between two blocks; a `<br>` or new line kept
 * where one ends and the next starts reads as no more than itself. A
 * Stack's or a Grid's layers (in an element laid out `flex` or `grid`),
 * laid out as blocks whichever way they go, start a line only where one is
 * drawn below those before it: side by side, they read as words apart.
 */
export function wordsOf(el: Element, lines = true, blocks = false): string {
  let text = "";
  const view = el.ownerDocument.defaultView;
  // Not a table's cells or columns either, which stand side by side on a line.
  const drawing = blocks && lines && !!view;
  const block = (child: Element) => drawing && child.isConnected && !/^(inline|contents|none|table-cell|table-column)/.test(view!.getComputedStyle(child).display);
  // A Stack's or a Grid's layers are laid out as blocks, side by side as often as not.
  const laysOut = (node: Node) => drawing && node.nodeType === Node.ELEMENT_NODE && (node as Element).isConnected && /(flex|grid)$/.test(view!.getComputedStyle(node as Element).display);
  const walk = (node: Node) => {
    const items = laysOut(node);
    /** In a Stack or a Grid: the lowest of its layers walked so far reaches, and whether one was. */
    let below = -Infinity;
    let first = true;
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) text += lines ? spacedOut((child as Text).data, node as Element) : (child as Text).data;
      else if (child.nodeType !== Node.ELEMENT_NODE) continue;
      else if ((child as Element).localName === "br") text += lines ? "\n" : " ";
      else if (items && block(child as Element)) {
        // A layer of a Stack or a Grid starts a line only where it starts below those before it; beside them, it is parted from them as words are.
        const box = (child as Element).getBoundingClientRect();
        if (!first) text += box.top >= below - 0.5 ? BLOCK_EDGE : " ";
        walk(child);
        below = Math.max(below, box.bottom);
        first = false;
      } else if (block(child as Element)) {
        text += BLOCK_EDGE;
        walk(child);
        text += BLOCK_EDGE;
      } else walk(child);
    }
  };
  walk(el);
  if (!lines) return text.replace(/\s+/g, " ").trim();
  // Each run of blocks' edges and white space between them, one line break, or as many as are kept in it.
  return tidyWords(text.replace(BLOCK_EDGES, (run) => "\n".repeat(Math.max(1, run.split("\n").length - 1))));
}

/** Where a block starts or ends, in the words as walked: a character no text has. */
const BLOCK_EDGE = "\u0000";
const BLOCK_EDGES = /[\s\u0000]*\u0000[\s\u0000]*/g;

/** A text's white space as one space each run, but for its new lines where `parent` keeps them, as it is drawn. */
function spacedOut(data: string, parent: Element): string {
  if (!data.includes("\n")) return data.replace(/\s+/g, " ");
  return keepsNewLines(parent) ? data.replace(/[^\S\n]+/g, " ") : data.replace(/\s+/g, " ");
}

/** Whether `el`'s white space keeps new lines, as `pre-line` does, drawing each as a line break. */
function keepsNewLines(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  const style = view && el.isConnected ? view.getComputedStyle(el) : null;
  return !!style && /^(pre|pre-wrap|pre-line|break-spaces)$/.test(style.whiteSpace);
}

/**
 * Makes each new line in `el`'s words that is drawn as a space a space, with
 * the white space around it: before it is typed in, as typing keeps new lines
 * (`pre-wrap`), and they would show, and be read, as line breaks.
 */
export function spaceOutNewLines(el: Element) {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode() as Text | null; text; text = walker.nextNode() as Text | null) {
    if (text.data.includes("\n") && !keepsNewLines(text.parentElement!)) text.data = text.data.replace(/\s*\n\s*/g, " ");
  }
}

/**
 * Words as they are set: a run of white space on a line as one space, each
 * line's words with no space around them, a line break kept as one ("\n"),
 * none before the first words or after the last.
 */
export function tidyWords(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}
