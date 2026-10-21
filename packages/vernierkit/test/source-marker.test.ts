import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { markSource } from "../src/source-marker";

const root = "/project";

function mark(code: string, file = "src/App.tsx") {
  return markSource(code, { id: `${root}/${file}`, root });
}

describe("source marker", () => {
  test("marks an HTML element with its file:line:column", () => {
    const code = `export function App() {\n  return <div className="app">Hi</div>;\n}\n`;

    expect(mark(code)?.code).toBe(
      `export function App() {\n  return <div className="app" data-vk-loc="src/App.tsx:2:10">Hi</div>;\n}\n`,
    );
  });

  test("marks a component usage with its file:line:column", () => {
    const code = `import { Card } from "./Card";\nexport const App = () => (\n  <main>\n    <Card title="One" />\n  </main>\n);\n`;

    expect(mark(code)?.code).toBe(
      `import { Card } from "./Card";\nexport const App = () => (\n  <main data-vk-loc="src/App.tsx:3:3">\n    <Card title="One" data-vk-usage="src/App.tsx:4:5" />\n  </main>\n);\n`,
    );
  });

  test("writes the marker after spread props, so a marker passed down in them cannot override it", () => {
    const code = `export const Button = (props) => <Pressable {...props} />;\n`;

    expect(mark(code)?.code).toBe(
      `export const Button = (props) => <Pressable {...props} data-vk-usage="src/App.tsx:1:34" />;\n`,
    );
  });

  test("marks a component written with type arguments", () => {
    const code = `export const A = () => <List<string> />;\n`;

    expect(mark(code)?.code).toBe(`export const A = () => <List<string> data-vk-usage="src/App.tsx:1:24" />;\n`);
  });

  test("does not mark fragments, which accept no extra props", () => {
    const code = `import React, { Fragment } from "react";\nexport const A = () => <>\n  <Fragment key="a">x</Fragment>\n  <React.Fragment>y</React.Fragment>\n</>;\n`;

    expect(mark(code)?.code).toBe(code);
  });

  test("never marks an element twice", () => {
    const code = `export const A = () => <div className="a"><B /></div>;\n`;
    const once = mark(code)!.code;

    expect(mark(once)?.code).toBe(once);
  });

  test("writes the file path without the module query string", () => {
    const code = `export const A = () => <p />;\n`;

    expect(mark(code, "src/A.jsx?v=1a2b")?.code).toBe(
      `export const A = () => <p data-vk-loc="src/A.jsx:1:24" />;\n`,
    );
  });

  test("only handles .jsx and .tsx modules", () => {
    expect(mark(`export const a = 1;\n`, "src/a.ts")).toBeNull();
    expect(mark(`.a { color: red }\n`, "src/a.css")).toBeNull();
  });

  test("marks namespaced tags as HTML elements", () => {
    const code = `export const A = () => <svg:rect />;\n`;

    expect(mark(code)?.code).toBe(`export const A = () => <svg:rect data-vk-loc="src/App.tsx:1:24" />;\n`);
  });

  test("leaves a module it cannot parse to the next plugin, which reports the error", () => {
    expect(mark(`export const A = () => <div>;\n`)).toBeNull();
  });

  test("source map points at the file, without the query string", () => {
    expect(mark(`export const A = () => <p />;\n`, "src/A.tsx?v=1")?.map.sources).toEqual(["/project/src/A.tsx"]);
  });

  test("leaves code from third-party dependencies untouched", () => {
    const code = `export const Badge = () => <span>New</span>;\n`;

    expect(mark(code, "node_modules/acme-ui/Badge.jsx")).toBeNull();
    expect(mark(code, "node_modules/.pnpm/acme-ui@1.0.0/node_modules/acme-ui/Badge.jsx")).toBeNull();
  });

  describe("common JSX forms", () => {
    const code = readFileSync(new URL("./fixtures/common-jsx.tsx", import.meta.url), "utf8");
    const marked = mark(code, "src/Gallery.tsx")!.code;

    test("output matches the snapshot", async () => {
      await expect(marked).toMatchFileSnapshot("./__snapshots__/common-jsx.marked.tsx");
    });

    test("only inserts attributes, so every line keeps its number", () => {
      const markedLines = marked.split("\n");
      expect(markedLines).toHaveLength(code.split("\n").length);
      const stripped = markedLines.map((line) =>
        line.replace(/ data-vk-(?:loc|usage)="src\/Gallery\.tsx:\d+:\d+"/g, ""),
      );
      expect(stripped).toEqual(code.split("\n"));
    });
  });
});
