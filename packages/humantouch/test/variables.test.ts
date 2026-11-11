import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startService } from "../src/service";
import { TOKEN_HEADER, VARIABLES_PATH, type Variable } from "../src/service-protocol";
import { readVariables } from "../src/variables";

const EXAMPLES = fileURLToPath(new URL("../../../examples/", import.meta.url));

let project: string;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "humantouch-variables-"));
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

function write(file: string, text: string) {
  mkdirSync(dirname(join(project, file)), { recursive: true });
  writeFileSync(join(project, file), text);
}

function named(variables: Variable[], group: Variable["group"], name: string) {
  return variables.find((v) => v.group === group && v.name === name);
}

/** The names in a group, in the order the panel lists them. */
function namesIn(variables: Variable[], group: Variable["group"]) {
  return variables.filter((v) => v.group === group).map((v) => v.name);
}

describe("a Tailwind v3 project", () => {
  test("its config's own colors, spacing, radii, font sizes and shadows come first, Tailwind's own after", async () => {
    const variables = await readVariables(join(EXAMPLES, "vite-react18-tw3"));

    expect(named(variables, "color", "brand-500")).toEqual({ name: "brand-500", group: "color", value: "#3d63f5", from: "tailwind", own: true });
    expect(named(variables, "color", "ink")).toMatchObject({ value: "#1b1d2a", own: true });
    expect(named(variables, "color", "red-500")).toMatchObject({ value: "#ef4444", own: false });
    expect(namesIn(variables, "color").slice(0, 6)).toEqual(["brand-50", "brand-100", "brand-500", "brand-700", "ink", "muted"]);

    expect(named(variables, "spacing", "gutter")).toMatchObject({ value: "1.375rem", own: true });
    expect(named(variables, "spacing", "section")).toMatchObject({ value: "4.5rem", own: true });
    expect(named(variables, "spacing", "4")).toMatchObject({ value: "1rem", own: false });
    expect(namesIn(variables, "spacing").slice(0, 2)).toEqual(["gutter", "section"]);

    expect(named(variables, "radius", "card")).toMatchObject({ value: "14px", own: true });
    expect(named(variables, "radius", "pill")).toMatchObject({ value: "999px", own: true });
    expect(named(variables, "radius", "DEFAULT")).toMatchObject({ value: "0.25rem", own: false });

    // A font size with its line height is the size alone.
    expect(named(variables, "fontSize", "lead")).toMatchObject({ value: "1.1875rem", own: true });
    expect(named(variables, "fontSize", "display")).toMatchObject({ value: "2.75rem", own: true });
    expect(named(variables, "fontSize", "sm")).toMatchObject({ value: "0.875rem", own: false });

    expect(named(variables, "shadow", "card")).toMatchObject({ value: "0 1px 2px rgb(27 29 42 / 0.06), 0 4px 12px rgb(27 29 42 / 0.08)", own: true });
    expect(named(variables, "shadow", "md")).toMatchObject({ own: false });
    // `shadow-none` draws nothing: no Variable.
    expect(named(variables, "shadow", "none")).toBeUndefined();
    // Not a color one can compare: currentColor, inherit.
    expect(named(variables, "color", "current")).toBeUndefined();
    expect(named(variables, "color", "inherit")).toBeUndefined();
  });
});

test("a Tailwind v3 theme made of the project's CSS variables has their values", async () => {
  mkdirSync(join(project, "node_modules"));
  symlinkSync(join(EXAMPLES, "vite-react18-tw3/node_modules/tailwindcss"), join(project, "node_modules/tailwindcss"));
  write(
    "tailwind.config.cjs",
    `module.exports = { content: [], theme: { extend: { colors: { primary: "hsl(var(--primary) / <alpha-value>)", ghost: "rgb(var(--nowhere))" } } } };`,
  );
  write("src/index.css", "@tailwind base;\n:root { --primary: 222 47% 11%; }\n");
  const variables = await readVariables(project);

  expect(named(variables, "color", "primary")).toEqual({ name: "primary", group: "color", value: "hsl(222 47% 11% / 1)", from: "tailwind", own: true });
  expect(named(variables, "color", "ghost")).toBeUndefined();
});

describe("a Tailwind v4 project", () => {
  test("its default theme: colors, spacing steps of --spacing, radii, font sizes, shadows", async () => {
    const variables = await readVariables(join(EXAMPLES, "vite-react19-tw4"));

    expect(named(variables, "color", "red-500")).toEqual({
      name: "red-500",
      group: "color",
      value: "oklch(63.7% 0.237 25.331)",
      from: "tailwind",
      css: "var(--color-red-500)",
      own: false,
    });
    // Steps of --spacing, named as Tailwind's spacing classes.
    expect(named(variables, "spacing", "4")).toMatchObject({ value: "calc(0.25rem * 4)", css: "calc(var(--spacing) * 4)", own: false });
    expect(named(variables, "spacing", "0.5")).toMatchObject({ value: "calc(0.25rem * 0.5)" });
    expect(named(variables, "spacing", "96")).toBeDefined();
    expect(named(variables, "spacing", "13")).toBeUndefined();
    expect(named(variables, "radius", "lg")).toMatchObject({ value: "0.5rem", css: "var(--radius-lg)" });
    expect(named(variables, "fontSize", "xs")).toMatchObject({ value: "0.75rem", css: "var(--text-xs)" });
    // A font size's line height is no font size.
    expect(variables.some((v) => v.name.includes("--"))).toBe(false);
    expect(named(variables, "shadow", "sm")).toMatchObject({ value: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)" });
    // Fonts, breakpoints and the like are none of the five groups.
    expect(variables.some((v) => v.name.startsWith("sans") || v.name.startsWith("breakpoint"))).toBe(false);
  });

  test("the project's own @theme comes first, overrides Tailwind's, and can clear a namespace", async () => {
    write("node_modules/tailwindcss/package.json", JSON.stringify({ name: "tailwindcss", version: "4.3.3" }));
    write(
      "node_modules/tailwindcss/theme.css",
      "@theme default {\n  --color-red-500: oklch(63.7% 0.237 25.331);\n  --color-blue-500: oklch(62.3% 0.214 259.815);\n  --spacing: 0.25rem;\n  --radius-lg: 0.5rem;\n}\n",
    );
    write(
      "src/index.css",
      `@import "tailwindcss";\n/* --color-ghost: #000; */\n@theme {\n  --color-*: initial;\n  --color-brand: #3d63f5;\n  --color-accent: var(--color-brand);\n  --spacing-gutter: 1.375rem;\n  --radius-lg: 12px;\n  --font-display: "Space Grotesk";\n}\n`,
    );
    const variables = await readVariables(project);

    expect(namesIn(variables, "color")).toEqual(["brand", "accent"]);
    // A Variable made of another has its value.
    expect(named(variables, "color", "accent")).toMatchObject({ value: "#3d63f5", css: "var(--color-accent)", own: true });
    expect(named(variables, "spacing", "gutter")).toMatchObject({ value: "1.375rem", own: true });
    expect(namesIn(variables, "spacing")[0]).toBe("gutter");
    expect(named(variables, "radius", "lg")).toMatchObject({ value: "12px", own: true });
    expect(named(variables, "color", "ghost")).toBeUndefined();
  });
});

describe("CSS variables", () => {
  test("the project's custom properties, grouped by their names, then by their values", async () => {
    write(
      "src/styles/tokens.css",
      `:root {\n  --brand: #3d63f5;\n  --text-color: rgb(27 29 42);\n  --shadow-color: hsl(0 0% 0% / 0.2);\n  --space-md: 16px;\n  --radius-card: 0.875rem;\n  --font-size-lead: 1.1875rem;\n  --header-height: 64px;\n  --shadow-card: 0 4px 12px var(--shadow-color);\n  --font-family: Inter, sans-serif;\n  --line-height: 1.5;\n  --gap: calc(var(--space-md) * 2);\n  --broken: var(--nowhere);\n  --wide: 50%;\n}\n.dark { --brand: #ffffff; }\n`,
    );
    write("node_modules/some-lib/lib.css", ":root { --lib-color: red; }");
    const variables = await readVariables(project);
    const css = (name: string) => variables.find((v) => v.name === name);

    expect(css("--brand")).toEqual({ name: "--brand", group: "color", value: "#3d63f5", from: "css", css: "var(--brand)", own: true });
    expect(css("--text-color")).toMatchObject({ group: "color" });
    expect(css("--shadow-color")).toMatchObject({ group: "color" });
    expect(css("--space-md")).toMatchObject({ group: "spacing", value: "16px" });
    expect(css("--radius-card")).toMatchObject({ group: "radius" });
    expect(css("--font-size-lead")).toMatchObject({ group: "fontSize" });
    // A length with nothing in its name to go by is spacing.
    expect(css("--header-height")).toMatchObject({ group: "spacing" });
    expect(css("--shadow-card")).toMatchObject({ group: "shadow", value: "0 4px 12px hsl(0 0% 0% / 0.2)" });
    expect(css("--gap")).toMatchObject({ group: "spacing", value: "calc(16px * 2)" });
    for (const name of ["--font-family", "--line-height", "--broken", "--wide", "--lib-color"]) expect(css(name)).toBeUndefined();
  });

  test("a project with none has no Variables", async () => {
    write("src/index.css", "body { margin: 0; }");
    expect(await readVariables(project)).toEqual([]);
    expect(await readVariables(join(project, "nowhere"))).toEqual([]);
  });
});

test("the local service gives the editor layer the project's Variables, to pages with its token only", async () => {
  const service = await startService({ root: join(EXAMPLES, "vite-react18-tw3") });
  try {
    const answer = await fetch(`${service.url}${VARIABLES_PATH}`, { headers: { [TOKEN_HEADER]: service.token } });
    expect(answer.status).toBe(200);
    expect(named((await answer.json()) as Variable[], "spacing", "gutter")).toMatchObject({ value: "1.375rem", own: true });
    expect((await fetch(`${service.url}${VARIABLES_PATH}`)).status).toBe(401);
  } finally {
    await service.close();
  }
});
