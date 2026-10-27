import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { INSTALL_PORT, TOGGLE_LABEL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { CLI, copyWithoutVernier, gitStatus, pack, replaceIn, sh, startServer } from "./install-copy";

const EXAMPLE = fileURLToPath(new URL("../../examples/vite-react19-tw4/", import.meta.url));

// One project, installed into, checked, and taken back out, in that order.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

let packed: string;
let project: string;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  packed = await pack(mkdtempSync(join(tmpdir(), "vernierkit-pack-")));
  project = await copyWithoutVernier(EXAMPLE, (dir) => {
    replaceIn(dir, "vite.config.ts", 'import vernier from "vernierkit/vite";\n');
    replaceIn(dir, "vite.config.ts", "vernier(), ");
    replaceIn(dir, "src/App.tsx", 'import { Vernier } from "vernierkit/react";\n');
    replaceIn(dir, "src/App.tsx", "      <Vernier />\n");
  });
});

test.afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
  if (packed) rmSync(join(packed, ".."), { recursive: true, force: true });
});

/** `npx vernierkit …` once the project has it: its own copy, as installed. */
const installed = (...args: string[]) => sh(process.execPath, [join(project, "node_modules/vernierkit/dist/cli.js"), ...args], project);

test("init installs Vernier Kit: once the dev server starts, the toggle is on the page, within 60 seconds", async ({ page }) => {
  const start = Date.now();
  const output = await sh(process.execPath, [CLI, "init"], project, { VERNIERKIT_INSTALL_FROM: packed });
  expect(output).toContain("Installed.");

  const server = startServer(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(INSTALL_PORT), "--strictPort"], project);
  try {
    await expect(async () => {
      await page.goto(`http://localhost:${INSTALL_PORT}`);
    }).toPass({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
    expect(Date.now() - start).toBeLessThan(60_000);
  } finally {
    server.stop();
  }
});

test("init changes two places in the project's source: the build config and the mount", async () => {
  const changed = (await gitStatus(project)).split("\n").filter(Boolean).map((line) => line.slice(3));
  const notSource = /^(package\.json|pnpm-lock\.yaml|AGENTS\.md|\.gitignore|\.agents\/skills\/vernierkit\/SKILL\.md|\.claude\/skills\/vernierkit\/SKILL\.md)$/;

  expect(changed.filter((file) => !notSource.test(file)).sort()).toEqual(["src/main.tsx", "vite.config.ts"]);
  const diff = await sh("git", ["diff", "--", "src/main.tsx", "vite.config.ts"], project);
  // Each one: the import, and the plugin or the component.
  expect(diff.split("\n").filter((line) => /^[-+](?![-+])/.test(line))).toEqual([
    '+import { Vernier } from "vernierkit/react";',
    "+    <Vernier />",
    '+import vernier from "vernierkit/vite";',
    "-  plugins: [react(), tailwindcss()],",
    "+  plugins: [vernier(), react(), tailwindcss()],",
  ]);
});

test("init again changes nothing", async () => {
  const before = await sh("git", ["diff"], project);

  await installed("init");

  expect(await sh("git", ["diff"], project)).toBe(before);
});

test("doctor reports every part installed, and a production build with none of the editor layer", async () => {
  const output = await installed("doctor");

  expect(output).toContain("✓ A production build has none of the editor layer");
  expect(output).not.toContain("✗");
  expect(output).toContain("All good.");
});

test("remove takes it all back out: git sees no change at all", async () => {
  const output = await installed("remove");

  expect(output).toContain("Vernier Kit removed");
  expect(await gitStatus(project)).toBe("");
});

test("remove again does nothing, and does not fail", async () => {
  const output = await sh(process.execPath, [CLI, "remove"], project);

  expect(output).toMatch(/not installed/);
  expect(await gitStatus(project)).toBe("");
});
