import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_LABEL, INSTALL_PORT, TOGGLE_LABEL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { CLI, copyWithoutHumanTouch, gitStatus, pack, replaceIn, sh, startServer } from "./install-copy";
import { codeOf, gzipped, scripts, settle, TOGGLE_BUDGET } from "./loading";

const EXAMPLE = fileURLToPath(new URL("../../examples/vite-react19-tw4/", import.meta.url));

// One project, installed into, checked, and taken back out, in that order.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

let packed: string;
let project: string;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  packed = await pack(mkdtempSync(join(tmpdir(), "humantouch-pack-")));
  project = await copyWithoutHumanTouch(EXAMPLE, (dir) => {
    replaceIn(dir, "vite.config.ts", 'import humanTouch from "humantouch/vite";\n');
    replaceIn(dir, "vite.config.ts", "humanTouch(), ");
    replaceIn(dir, "src/App.tsx", 'import { HumanTouch } from "humantouch/react";\n');
    replaceIn(dir, "src/App.tsx", "      <HumanTouch />\n");
    // Its page of declared font weights mounts it too (ticket 140): `init` would see it mounted there, and leave App be.
    replaceIn(dir, "src/fonts/FontsPage.tsx", 'import { HumanTouch } from "humantouch/react";\n');
    replaceIn(dir, "src/fonts/FontsPage.tsx", "      <HumanTouch />\n");
    // So does its page that moves (ticket 141).
    replaceIn(dir, "src/motion/MotionPage.tsx", 'import { HumanTouch } from "humantouch/react";\n');
    replaceIn(dir, "src/motion/MotionPage.tsx", "      <HumanTouch />\n");
  });
});

test.afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
  if (packed) rmSync(join(packed, ".."), { recursive: true, force: true });
});

/** `npx humantouch …` once the project has it: its own copy, as installed. */
const installed = (...args: string[]) => sh(process.execPath, [join(project, "node_modules/humantouch/dist/cli.js"), ...args], project);

test("init installs Human Touch: once the dev server starts, the toggle is on the page, within 60 seconds", async ({ page }) => {
  const start = Date.now();
  const output = await sh(process.execPath, [CLI, "init"], project, { HT_INSTALL_FROM: packed });
  expect(output).toContain("Installed.");

  const server = startServer(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(INSTALL_PORT), "--strictPort"], project);
  try {
    await expect(async () => {
      await page.goto(`http://localhost:${INSTALL_PORT}`);
    }).toPass({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
    expect(Date.now() - start).toBeLessThan(60_000);
  } finally {
    await server.stop();
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
    const ours = (await loaded.all()).filter((script) => script.url.includes("/node_modules/humantouch/dist/"));
    expect(ours.length).toBeGreaterThan(0);
    const served = gzipped(ours.map((script) => codeOf(script.text)));
    // In the output, to compare with the budget from one ticket to the next.
    console.log(`toggle as Vite serves it: ${served} B gzipped of ${TOGGLE_BUDGET} B`);
    expect(served).toBeLessThanOrEqual(TOGGLE_BUDGET);
    expect(ours.some((script) => script.text.includes(EXIT_LABEL))).toBe(false);

    await toggle.click();
    await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
    expect(await loaded.has(EXIT_LABEL)).toBe(true);
  } finally {
    await server.stop();
  }
});

test("init changes two places in the project's source: the build config and the mount", async () => {
  const changed = (await gitStatus(project)).split("\n").filter(Boolean).map((line) => line.slice(3));
  const notSource = /^(package\.json|pnpm-lock\.yaml|AGENTS\.md|\.gitignore|\.agents\/skills\/humantouch\/SKILL\.md|\.claude\/skills\/humantouch\/SKILL\.md)$/;

  expect(changed.filter((file) => !notSource.test(file)).sort()).toEqual(["src/main.tsx", "vite.config.ts"]);
  const diff = await sh("git", ["diff", "--", "src/main.tsx", "vite.config.ts"], project);
  // Each one: the import, and the plugin or the component.
  expect(diff.split("\n").filter((line) => /^[-+](?![-+])/.test(line))).toEqual([
    '+import { HumanTouch } from "humantouch/react";',
    "+    <HumanTouch />",
    '+import humanTouch from "humantouch/vite";',
    "-  plugins: [react(), tailwindcss()],",
    "+  plugins: [humanTouch(), react(), tailwindcss()],",
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

  expect(output).toContain("Human Touch removed");
  expect(await gitStatus(project)).toBe("");
});

test("remove again does nothing, and does not fail", async () => {
  const output = await sh(process.execPath, [CLI, "remove"], project);

  expect(output).toMatch(/not installed/);
  expect(await gitStatus(project)).toBe("");
});
