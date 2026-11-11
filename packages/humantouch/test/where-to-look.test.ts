import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { bodyRules, whereToLook } from "../src/where-to-look";
import type { Change } from "../src/client/changeset";

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "03kind-look-"));
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

function write(file: string, text: string) {
  mkdirSync(dirname(join(project, file)), { recursive: true });
  writeFileSync(join(project, file), text);
}

const APP = { component: "App", usage: "src/main.tsx:8:5", thirdParty: false };

/** A style change for the usage of Card at `usage`, as the editor layer records it. */
function cardChange(usage = "src/App.tsx:5:7", extra: Partial<Change> = {}): Change {
  return {
    id: 1,
    kind: "style",
    layer: "1",
    target: {
      loc: "src/components/Card.tsx:3:5",
      chain: [{ component: "Card", usage, thirdParty: false }, APP],
      component: "Card",
      instances: 1,
      locked: false,
      unlocated: false,
      context: { path: ["Page", "Card"], element: "<article>" },
    },
    scope: "usage",
    property: "radius",
    before: 12,
    after: 4,
    style: { "border-radius": "4px" },
    ...extra,
  } as Change;
}

const newText = {
  id: 2,
  kind: "create",
  layer: "new-1",
  target: { loc: null, chain: [], component: null, instances: 1, locked: false, unlocated: true, context: { path: ["Page"], element: "<main>" } },
  scope: "usage",
  property: "create",
  before: null,
  after: { type: "text", text: "Hello", width: null, place: null },
  style: {},
} as unknown as Change;

const APP_TSX = [
  'import { Card } from "./components/Card";',
  "export function App() {",
  "  return (",
  "    <main>",
  '      <Card title="One" />',
  '      <Card title="Two" />',
  "      {/* <Card title=\"Not code\" /> */}",
  "    </main>",
  "  );",
  "}",
  "",
].join("\n");

describe("the usages of a component", () => {
  test("are every place the source uses it, as its usage markers give them, in the order of the source", async () => {
    write("package.json", "{}");
    write("src/App.tsx", APP_TSX);
    write("src/Other.tsx", 'import { Card } from "./components/Card";\nexport const Other = () => <Card title="Three" />;\n');
    write("src/components/Card.tsx", "export function Card({ title }: { title: string }) {\n  return (\n    <article>{title}</article>\n  );\n}\n");

    const look = await whereToLook(project, [cardChange()]);

    expect(look.usages).toEqual({ Card: ["src/App.tsx:5:7", "src/App.tsx:6:7", "src/Other.tsx:2:28"] });
  });

  test("leave out node_modules, ignored files and vendored packages", async () => {
    write("package.json", "{}");
    write(".gitignore", "node_modules\ndist\n");
    write("src/App.tsx", APP_TSX);
    write("node_modules/ui/Card.jsx", "export const X = () => <Card />;\n");
    write("dist/App.js", "export const X = () => <Card />;\n");
    write("vendor/acme-ui/package.json", "{}");
    write("vendor/acme-ui/index.jsx", "export const X = () => <Card />;\n");
    execFileSync("git", ["init", "-q"], { cwd: project });

    const look = await whereToLook(project, [cardChange()]);

    expect(look.usages).toEqual({ Card: ["src/App.tsx:5:7", "src/App.tsx:6:7"] });
  });

  test("leave out node_modules and vendored packages outside a git repository too", async () => {
    write("package.json", "{}");
    write("src/App.tsx", APP_TSX);
    write("node_modules/ui/Card.jsx", "export const X = () => <Card />;\n");
    write("vendor/acme-ui/package.json", "{}");
    write("vendor/acme-ui/index.jsx", "export const X = () => <Card />;\n");

    const look = await whereToLook(project, [cardChange()]);

    expect(look.usages).toEqual({ Card: ["src/App.tsx:5:7", "src/App.tsx:6:7"] });
  });

  test("are not known when a file that names the component does not parse, or is not JSX the notes read (MDX): no list, rather than one that may leave a usage out", async () => {
    write("package.json", "{}");
    write("src/App.tsx", APP_TSX);
    write("src/Broken.tsx", "export const X = () => <Card title={ />;\n");
    expect((await whereToLook(project, [cardChange()])).usages).toEqual({});

    rmSync(join(project, "src/Broken.tsx"));
    write("docs/intro.mdx", "# Intro\n\n<Card title=\"Docs\" />\n");
    expect((await whereToLook(project, [cardChange()])).usages).toEqual({});
  });

  test("count only the component's own tags, whatever other tags are named", async () => {
    write("package.json", "{}");
    write("src/App.tsx", "export const X = () => (\n  <div>\n    <Card />\n    <constructor />\n    <valueOf />\n  </div>\n);\n");

    expect((await whereToLook(project, [cardChange("src/App.tsx:3:5")])).usages).toEqual({ Card: ["src/App.tsx:3:5"] });
  });

  test("are found in a project inside a git repository that ignores it", async () => {
    write(".gitignore", "app/\n");
    execFileSync("git", ["init", "-q"], { cwd: project });
    const root = join(project, "app");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "src/App.tsx"), APP_TSX);

    expect((await whereToLook(root, [cardChange()])).usages).toEqual({ Card: ["src/App.tsx:5:7", "src/App.tsx:6:7"] });
  });

  test("are not looked for when no change is for one usage alone", async () => {
    write("package.json", "{}");
    write("src/App.tsx", APP_TSX);

    const look = await whereToLook(project, [cardChange(undefined, { scope: "component" })]);

    expect(look.usages).toEqual({});
  });
});

describe("the class-merging helper", () => {
  test("is the one the files of the change import, where it is defined, merging with tailwind-merge", async () => {
    write("package.json", JSON.stringify({ dependencies: { clsx: "^2", "tailwind-merge": "^3" } }));
    write("src/App.tsx", `import { cn } from "@/lib/helpers";\n${APP_TSX}`);
    write(
      "src/lib/helpers.ts",
      'import { clsx, type ClassValue } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n',
    );

    const look = await whereToLook(project, [cardChange("src/App.tsx:6:7")]);

    expect(look.helper).toEqual({ name: "cn", at: "src/lib/helpers.ts:4", merges: true });
  });

  test("is found at the path shadcn/ui gives it when no file of the change imports one", async () => {
    write("package.json", JSON.stringify({ dependencies: { "tailwind-merge": "^3" } }));
    write("src/App.tsx", APP_TSX);
    write("src/lib/utils.ts", 'import { twMerge } from "tailwind-merge";\nexport const cn = (...c: string[]) => twMerge(c.join(" "));\n');

    expect((await whereToLook(project, [cardChange()])).helper).toEqual({ name: "cn", at: "src/lib/utils.ts:2", merges: true });
  });

  test("is found by an import written with .js, of a .ts module", async () => {
    write("package.json", "{}");
    write("src/App.tsx", `import { cn } from "./helpers/classes.js";\n${APP_TSX}`);
    write("src/helpers/classes.ts", 'import { twMerge } from "tailwind-merge";\nexport const cn = (...c: string[]) => twMerge(c);\n');

    expect((await whereToLook(project, [cardChange("src/App.tsx:6:7")])).helper).toEqual({ name: "cn", at: "src/helpers/classes.ts:2", merges: true });
  });

  test("is said not to merge when it only joins the classes", async () => {
    write("package.json", "{}");
    write("src/App.tsx", `import { cn } from "./lib/utils";\n${APP_TSX}`);
    write("src/lib/utils.ts", '/** Joins. */\nexport function cn(...classes: string[]): string {\n  return classes.filter(Boolean).join(" ");\n}\n');

    expect((await whereToLook(project, [cardChange("src/App.tsx:6:7")])).helper).toEqual({ name: "cn", at: "src/lib/utils.ts:2", merges: false });
  });

  test("is the package's own when the project has no helper of its own", async () => {
    write("package.json", JSON.stringify({ devDependencies: { "tailwind-merge": "^3" } }));
    write("src/App.tsx", APP_TSX);

    expect((await whereToLook(project, [cardChange()])).helper).toEqual({ name: "twMerge", from: "tailwind-merge", merges: true });
  });

  test("is none when the project has none", async () => {
    write("package.json", JSON.stringify({ dependencies: { react: "^19" } }));
    write("src/App.tsx", APP_TSX);

    expect((await whereToLook(project, [cardChange()])).helper).toBeNull();
  });

  test("is not said to be none when a file of the change imports one from where it cannot be read: outside the project, or by an alias", async () => {
    write("shared/utils.ts", 'import { twMerge } from "tailwind-merge";\nexport const cn = (...c: string[]) => twMerge(c);\n');
    const root = join(project, "app");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "src/App.tsx"), `import { cn } from "../../shared/utils";\n${APP_TSX}`);
    expect((await whereToLook(root, [cardChange("src/App.tsx:6:7")])).helper).toBeUndefined();

    writeFileSync(join(root, "src/App.tsx"), `import { cn } from "#/lib/utils";\n${APP_TSX}`);
    expect((await whereToLook(root, [cardChange("src/App.tsx:6:7")])).helper).toBeUndefined();
  });

  test("is not looked for, nor anything else, in a folder with no package.json, which is no project", async () => {
    write("src/App.tsx", APP_TSX);
    write("src/index.css", "body {\n  font-family: Georgia;\n}\n");

    expect(await whereToLook(project, [cardChange(), newText])).toEqual({ usages: {} });
  });
});

describe("the body text style", () => {
  test("is set by the rules on body or html in the project's stylesheets, CSS Modules aside", async () => {
    write("package.json", "{}");
    write("src/index.css", '@import "tailwindcss";\n\n/* body { color: red } */\nbutton {\n  color: red;\n}\n\nbody {\n  font-family: Georgia, serif;\n}\n');
    write("src/Card.module.css", "body {\n  color: red;\n}\n");

    expect((await whereToLook(project, [newText])).bodyText).toEqual([{ selector: "body", at: "src/index.css:8" }]);
  });

  test("is set by the className of the layout's <body>", async () => {
    write("package.json", "{}");
    write("app/layout.tsx", 'export default function Layout({ children }) {\n  return (\n    <html>\n      <body className="font-sans text-stone-700">{children}</body>\n    </html>\n  );\n}\n');
    write("app/globals.css", "body {\n  margin: 0;\n}\n");

    expect((await whereToLook(project, [newText])).bodyText).toEqual([{ element: "body", attribute: "className", at: "app/layout.tsx:4:7" }]);
  });

  test("is set by a class on the <html> JSX, or on <body> in the page's index.html", async () => {
    write("package.json", "{}");
    write("app/layout.tsx", 'export default function Layout({ children }) {\n  return (\n    <html className="font-serif">\n      <body>{children}</body>\n    </html>\n  );\n}\n');
    write("index.html", '<!doctype html>\n<html>\n  <body class="font-sans">\n    <div id="root"></div>\n  </body>\n</html>\n');

    expect((await whereToLook(project, [newText])).bodyText).toEqual([
      { element: "html", attribute: "className", at: "app/layout.tsx:3:5" },
      { element: "body", attribute: "class", at: "index.html:3" },
    ]);
  });

  test("is set by a style on the <body> JSX too", async () => {
    write("package.json", "{}");
    write("app/layout.tsx", 'export default function Layout({ children }) {\n  return (\n    <html>\n      <body style={{ fontFamily: "Georgia" }}>{children}</body>\n    </html>\n  );\n}\n');

    expect((await whereToLook(project, [newText])).bodyText).toEqual([{ element: "body", attribute: "style", at: "app/layout.tsx:4:7" }]);
  });

  test("is not read from a stylesheet linked in from outside the project", async () => {
    write("outside/theme.css", "body {\n  font-family: Georgia;\n}\n");
    const root = join(project, "app");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}");
    symlinkSync(join(project, "outside/theme.css"), join(root, "src/theme.css"));
    execFileSync("git", ["init", "-q"], { cwd: root });

    expect((await whereToLook(root, [newText])).bodyText).toEqual([]);
  });

  test("is not known when a file that opens <body> does not parse", async () => {
    write("package.json", "{}");
    write("app/layout.tsx", "export default function Layout() {\n  return <body className={>;\n}\n");

    expect((await whereToLook(project, [newText])).bodyText).toBeUndefined();
  });

  test("is set nowhere when no rule or className sets it", async () => {
    write("package.json", "{}");
    write("src/index.css", "body {\n  margin: 0;\n}\n");

    expect((await whereToLook(project, [newText])).bodyText).toEqual([]);
  });

  test("is not looked for without new text", async () => {
    write("package.json", "{}");
    write("src/index.css", "body {\n  font-family: Georgia;\n}\n");

    expect((await whereToLook(project, [cardChange()])).bodyText).toBeUndefined();
  });

  test("rules: not those in a media query, for some widths or print only", () => {
    expect(bodyRules("@media print {\n  body { color: black }\n}\n@layer base {\n  @media (min-width: 640px) { html { font-size: 18px } }\n}\n")).toEqual([]);
  });

  test("rules: each on body or html with a text style, at the line its selector starts, in layers and with @apply too", () => {
    const css = "html,\nbody { color: #333 }\n@layer base {\n  body {\n    @apply font-sans;\n  }\n}\n.body { font-size: 2px }\nbody .x { color: red }\n";

    expect(bodyRules(css)).toEqual([
      { selector: "html, body", line: 1 },
      { selector: "body", line: 4 },
    ]);
  });
});
