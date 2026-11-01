import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_LABEL, INSTALL_PORT, TOGGLE_LABEL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { CLI, copyWithoutThirdKind, gitStatus, pack, replaceIn, sh, startServer } from "./install-copy";
import { codeOf, gzipped, scripts, settle, TOGGLE_BUDGET } from "./loading";

const EXAMPLE = fileURLToPath(new URL("../../examples/vite-react19-tw4/", import.meta.url));

// One project, installed into, checked, and taken back out, in that order.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

let packed: string;
let project: string;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  packed = await pack(mkdtempSync(join(tmpdir(), "03kind-pack-")));
  project = await copyWithoutThirdKind(EXAMPLE, (dir) => {
    replaceIn(dir, "vite.config.ts", 'import thirdKind from "03kind/vite";\n');
    replaceIn(dir, "vite.config.ts", "thirdKind(), ");
    replaceIn(dir, "src/App.tsx", 'import { ThirdKind } from "03kind/react";\n');
    replaceIn(dir, "src/App.tsx", "      <ThirdKind />\n");
  });
});

test.afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
  if (packed) rmSync(join(packed, ".."), { recursive: true, force: true });
});

/** `npx 03kind …` once the project has it: its own copy, as installed. */
const installed = (...args: string[]) => sh(process.execPath, [join(project, "node_modules/03kind/dist/cli.js"), ...args], project);

test("init installs 03Kind: once the dev server starts, the toggle is on the page, within 60 seconds", async ({ page }) => {
  const start = Date.now();
  const output = await sh(process.execPath, [CLI, "init"], project, { TK_INSTALL_FROM: packed });
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

test("as installed, the page loads only the toggle, under 10KB gzipped as Vite serves it; the rest as edit mode is first entered", async ({ page }) => {
  const server = startServer(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(INSTALL_PORT), "--strictPort"], project);
  try {
    const loaded = scripts(page);
    await expect(async () => {
      await page.goto(`http://localhost:${INSTALL_PORT}`);
    }).toPass({ timeout: 30_000 });
    const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
    await expect(toggle).toBeVisible();
    await settle(page);

    // From node_modules as published, not bundled again by Vite's dependency optimizer.
    const ours = (await loaded.all()).filter((script) => script.url.includes("/node_modules/03kind/dist/"));
    expect(ours.length).toBeGreaterThan(0);
    expect(gzipped(ours.map((script) => codeOf(script.text)))).toBeLessThanOrEqual(TOGGLE_BUDGET);
    expect(ours.some((script) => script.text.includes(EXIT_LABEL))).toBe(false);

    await toggle.click();
    await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
    expect(await loaded.has(EXIT_LABEL)).toBe(true);
  } finally {
    server.stop();
  }
});

test("init changes two places in the project's source: the build config and the mount", async () => {
  const changed = (await gitStatus(project)).split("\n").filter(Boolean).map((line) => line.slice(3));
  const notSource = /^(package\.json|pnpm-lock\.yaml|AGENTS\.md|\.gitignore|\.agents\/skills\/03kind\/SKILL\.md|\.claude\/skills\/03kind\/SKILL\.md)$/;

  expect(changed.filter((file) => !notSource.test(file)).sort()).toEqual(["src/main.tsx", "vite.config.ts"]);
  const diff = await sh("git", ["diff", "--", "src/main.tsx", "vite.config.ts"], project);
  // Each one: the import, and the plugin or the component.
  expect(diff.split("\n").filter((line) => /^[-+](?![-+])/.test(line))).toEqual([
    '+import { ThirdKind } from "03kind/react";',
    "+    <ThirdKind />",
    '+import thirdKind from "03kind/vite";',
    "-  plugins: [react(), tailwindcss()],",
    "+  plugins: [thirdKind(), react(), tailwindcss()],",
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

  expect(output).toContain("03Kind removed");
  expect(await gitStatus(project)).toBe("");
});

test("remove again does nothing, and does not fail", async () => {
  const output = await sh(process.execPath, [CLI, "remove"], project);

  expect(output).toMatch(/not installed/);
  expect(await gitStatus(project)).toBe("");
});
