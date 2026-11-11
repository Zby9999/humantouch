import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { jsxAt, snippetAt } from "../src/source-snippet";

const APP = `import { Card } from "./Card";

export function App() {
  return (
    <main className="p-6">
      <h1 className="text-4xl">Hello</h1>
      <Card
        title="One"
        body={"Two"}
      />
    </main>
  );
}
`;

describe("the JSX at a location", () => {
  test("is the element that starts there, all of it, as written", () => {
    expect(jsxAt(APP, "src/App.tsx", 6, 7)).toBe('<h1 className="text-4xl">Hello</h1>');
    expect(jsxAt(APP, "src/App.tsx", 7, 7)).toBe('<Card\n        title="One"\n        body={"Two"}\n      />');
    expect(jsxAt(APP, "src/App.tsx", 5, 5)).toContain("</main>");
  });

  test("is none where no element starts, or where the code does not parse", () => {
    expect(jsxAt(APP, "src/App.tsx", 6, 8)).toBeNull();
    expect(jsxAt("export const x = <div", "src/App.tsx", 1, 18)).toBeNull();
  });
});

describe("the snippet at a location in the project", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "humantouch-snippet-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/App.tsx"), APP);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("is read from the file the location names", async () => {
    expect(await snippetAt(root, "src/App.tsx:6:7")).toEqual({ loc: "src/App.tsx:6:7", code: '<h1 className="text-4xl">Hello</h1>' });
  });

  test("is none for a file that is not there, outside the project, or not source", async () => {
    expect(await snippetAt(root, "src/Gone.tsx:1:1")).toBeNull();
    expect(await snippetAt(root, "../outside.tsx:1:1")).toBeNull();
    writeFileSync(join(root, "notes.md"), "<h1>Hi</h1>");
    expect(await snippetAt(root, "notes.md:1:1")).toBeNull();
    expect(await snippetAt(root, "not a location")).toBeNull();
  });
});
