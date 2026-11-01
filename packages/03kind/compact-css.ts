/**
 * The editor layer's CSS (its templates marked `css` in `styles.ts` and
 * `toggle-styles.ts`) without comments and spare whitespace, for the build: the
 * toggle's counts toward what the page loads. The `${…}` placeholders and quoted
 * strings are left as written. What it cannot compact safely (an escape, a
 * comment or string left open, a placeholder with braces in it) fails the build,
 * naming the file and line, rather than compacting it wrong.
 */

const TEMPLATE = /\/\* css \*\/ `([^`]*)`/g;
const PLACEHOLDER = /(\$\{[^}]*\})/;

class Unsafe extends Error {
  constructor(
    reason: string,
    readonly at: number,
  ) {
    super(reason);
  }
}

/** Whitespace and comment-free stretch of CSS outside strings, squeezed. */
const squeeze = (css: string) =>
  css
    .replace(/\s+/g, " ")
    .replace(/ ?([{};,]) ?/g, "$1")
    .replace(/: /g, ":")
    .replace(/;}/g, "}");

/** A stretch between placeholders: comments dropped, strings kept as written, the rest squeezed. */
function compactText(text: string, at: number): string {
  let out = "";
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === "\\") throw new Unsafe("an escape", at + i);
    if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new Unsafe("a comment not closed before a placeholder or the template's end", at + i);
      i = end + 2;
    } else if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1);
      const string = end < 0 ? "" : text.slice(i, end + 1);
      if (end < 0 || string.includes("\n")) throw new Unsafe("a string not closed on its line", at + i);
      if (string.includes("\\")) throw new Unsafe("an escape", at + i);
      out += squeeze(plain) + string;
      plain = "";
      i = end + 1;
    } else {
      plain += c;
      i++;
    }
  }
  return out + squeeze(plain);
}

/** One template's CSS, compacted; `at` is where it starts, to say where what cannot be compacted is. */
export function compactCss(css: string, at = 0): string {
  let offset = at;
  return css
    .split(PLACEHOLDER)
    .map((part, i) => {
      const start = offset;
      offset += part.length;
      if (i % 2 === 0) return compactText(part, start);
      if (part.slice(2).includes("{")) throw new Unsafe("a placeholder with braces in it", start);
      return part;
    })
    .join("")
    .trim();
}

/** A styles module's source with each of its `css` templates compacted. `path` names it in an error. */
export function compactStyleTemplates(source: string, path: string): string {
  let found = 0;
  const contents = source.replace(TEMPLATE, (template, css: string, index: number) => {
    found++;
    try {
      return `\`${compactCss(css, index + template.indexOf("`") + 1)}\``;
    } catch (error) {
      if (!(error instanceof Unsafe)) throw error;
      const line = source.slice(0, error.at).split("\n").length;
      const text = source.split("\n")[line - 1]!.trim();
      throw new Error(
        `compact-css cannot compact ${error.message} in ${path}:${line}, so it would change the CSS: ${text.length > 100 ? `${text.slice(0, 100)}…` : text}`,
      );
    }
  });
  if (!found) throw new Error(`compact-css found no /* css */ template in ${path}`);
  return contents;
}
