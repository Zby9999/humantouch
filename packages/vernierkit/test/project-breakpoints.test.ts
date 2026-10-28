import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readProjectBreakpoints } from "../src/project-breakpoints";

const EXAMPLES = fileURLToPath(new URL("../../../examples/", import.meta.url));
/** Tailwind v4 and v3, as the examples have them installed. */
const TAILWIND_4 = join(EXAMPLES, "vite-react19-tw4/node_modules/tailwindcss");
const TAILWIND_3 = join(EXAMPLES, "vite-react18-tw3/node_modules/tailwindcss");

let project: string;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "vernierkit-breakpoints-"));
  writeFileSync(join(project, "package.json"), "{}");
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

function write(file: string, text: string) {
  mkdirSync(dirname(join(project, file)), { recursive: true });
  writeFileSync(join(project, file), text);
}
/** Tailwind as one of the project's dependencies, installed. */
function install(tailwind: string) {
  writeFileSync(join(project, "package.json"), JSON.stringify({ devDependencies: { tailwindcss: "*" } }));
  mkdirSync(join(project, "node_modules"));
  symlinkSync(tailwind, join(project, "node_modules/tailwindcss"));
}

describe("the project's own breakpoints, from its Tailwind theme", () => {
  test("Tailwind v4: the theme's breakpoints, Tailwind's own by default", async () => {
    expect(await readProjectBreakpoints(join(EXAMPLES, "vite-react19-tw4"))).toEqual({
      from: "tailwind",
      list: [
        { width: 640, name: "sm" },
        { width: 768, name: "md" },
        { width: 1024, name: "lg" },
        { width: 1280, name: "xl" },
        { width: 1536, name: "2xl" },
      ],
    });
  });

  test("Tailwind v4: `@theme` adds breakpoints, changes them, takes one off, or starts afresh, in px or rem", async () => {
    install(TAILWIND_4);
    write("src/index.css", '@import "tailwindcss";\n@theme {\n  --breakpoint-xs: 30rem;\n  --breakpoint-md: 820px; /* not 48rem */\n  --breakpoint-2xl: initial;\n}\n');
    expect((await readProjectBreakpoints(project))?.list).toEqual([
      { width: 480, name: "xs" },
      { width: 640, name: "sm" },
      { width: 820, name: "md" },
      { width: 1024, name: "lg" },
      { width: 1280, name: "xl" },
    ]);

    write("src/index.css", '@import "tailwindcss";\n@theme {\n  --breakpoint-*: initial;\n  --breakpoint-tablet: 40rem;\n  --breakpoint-laptop: 64rem;\n}\n');
    expect((await readProjectBreakpoints(project))?.list).toEqual([
      { width: 640, name: "tablet" },
      { width: 1024, name: "laptop" },
    ]);
  });

  test("Tailwind v3: the config's screens, its own replacing Tailwind's", async () => {
    expect(await readProjectBreakpoints(join(EXAMPLES, "vite-react18-tw3"))).toEqual({
      from: "tailwind",
      list: [
        { width: 560, name: "sm" },
        { width: 820, name: "md" },
        { width: 1120, name: "lg" },
      ],
    });
  });

  test("Tailwind v3: screens extended, or Tailwind's own with no config at all", async () => {
    install(TAILWIND_3);
    expect((await readProjectBreakpoints(project))?.list.map(({ name }) => name)).toEqual(["sm", "md", "lg", "xl", "2xl"]);

    write("tailwind.config.cjs", 'module.exports = { content: [], theme: { extend: { screens: { xs: "475px", "3xl": { min: "1920px" }, short: { raw: "(max-height: 600px)" } } } } };');
    expect((await readProjectBreakpoints(project))?.list).toEqual([
      { width: 475, name: "xs" },
      { width: 640, name: "sm" },
      { width: 768, name: "md" },
      { width: 1024, name: "lg" },
      { width: 1280, name: "xl" },
      { width: 1536, name: "2xl" },
      { width: 1920, name: "3xl" },
    ]);
  });

  test("no Tailwind: none, for the page's media queries to tell", async () => {
    expect(await readProjectBreakpoints(join(EXAMPLES, "next-app-css-modules"))).toBeNull();
    expect(await readProjectBreakpoints(project)).toBeNull();
    // Tailwind found from the project's folder, as pnpm's NODE_PATH finds any package of the workspace, is not the project's.
    mkdirSync(join(project, "node_modules"));
    symlinkSync(TAILWIND_4, join(project, "node_modules/tailwindcss"));
    expect(await readProjectBreakpoints(project)).toBeNull();
  });
});
