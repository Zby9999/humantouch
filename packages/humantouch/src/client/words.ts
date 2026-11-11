/**
 * A text layer's words as one reads them (ticket 144): white space between
 * them run together, and, where its lines break, a line break, "\n".
 */

/**
 * An element's words, as one reads them: white space between them as one
 * space; with `lines`, a line break as a line break, "\n": a `<br>`, or a new
 * line where the white space keeps new lines (`white-space: pre-line`, say,
 * as text typed in has it), each line's words with no space around them.
 * Without, a `<br>` reads as the space between the words it parts.
 */
export function wordsOf(el: Element, lines = true): string {
  let text = "";
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) text += lines ? spacedOut((child as Text).data, node as Element) : (child as Text).data;
      else if (child.nodeType !== Node.ELEMENT_NODE) continue;
      else if ((child as Element).localName === "br") text += lines ? "\n" : " ";
      else walk(child);
    }
  };
  walk(el);
  return lines ? tidyWords(text) : text.replace(/\s+/g, " ").trim();
}

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
