import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { compactCss, compactStyleTemplates } from "../compact-css";

describe("compacting the editor layer's CSS as it builds", () => {
  test("comments and spare whitespace go, placeholders stay as written", () => {
    const css = `
      /* The dock. */
      .tk-dock { top: var(--tk-gap) ; font: 500 12px/16px \${FONT_STACK}; }
      .a, .b { color: rgb(0, 0, 0); }
    `;

    expect(compactCss(css)).toBe(
      ".tk-dock{top:var(--tk-gap);font:500 12px/16px ${FONT_STACK}}.a,.b{color:rgb(0,0,0)}",
    );
  });

  test("a quoted string is kept as written, colons, commas, spaces and comment marks in it too", () => {
    const css = `
      .a::after { content: "a: b, c;  d /* e */ {f}"; }
      .b { font-family: 'Segoe UI', sans-serif; }
      /* the editor's own */
    `;

    expect(compactCss(css)).toBe(
      `.a::after{content:"a: b, c;  d /* e */ {f}"}.b{font-family:'Segoe UI',sans-serif}`,
    );
  });

  test("what it cannot compact safely fails, naming the file, line and what is there", () => {
    const source = [
      "export const styles = /* css */ `",
      ".a { color: red; }",
      ".md\\:flex { display: flex; }",
      "`;",
    ].join("\n");

    expect(() => compactStyleTemplates(source, "src/client/styles.ts")).toThrow(
      "compact-css cannot compact an escape in src/client/styles.ts:3, so it would change the CSS: .md\\:flex { display: flex; }",
    );
  });

  test.each([
    ["a string left open", `.a { content: "a; }`, "a string not closed on its line"],
    ["a comment across a placeholder", `.a { color: red; /* \${X} */ }`, "a comment not closed before a placeholder"],
    ["a placeholder with braces in it", ".a { width: ${f({ x: 1 })}px; }", "a placeholder with braces in it"],
  ])("%s fails", (_, css, reason) => {
    expect(() => compactStyleTemplates(`const s = /* css */ \`${css}\`;`, "styles.ts")).toThrow(reason);
  });

  test("a styles module with no css template fails, rather than leaving its CSS as written", () => {
    expect(() => compactStyleTemplates("export const styles = `.a { color: red; }`;", "styles.ts")).toThrow(
      "no /* css */ template in styles.ts",
    );
  });

  test.each(["src/client/styles.ts", "src/client/toggle-styles.ts"])("the editor layer's own, %s, compacts", (path) => {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

    expect(compactStyleTemplates(source, path).length).toBeLessThan(source.length);
  });
});
