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
  const view = parent.ownerDocument.defaultView;
  const style = view && parent.isConnected ? view.getComputedStyle(parent) : null;
  const keeps = !!style && /^(pre|pre-wrap|pre-line|break-spaces)$/.test(style.whiteSpace);
  return keeps ? data.replace(/[^\S\n]+/g, " ") : data.replace(/\s+/g, " ");
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
