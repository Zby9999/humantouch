import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_LABEL, NEXT_INSTALL_PORT, TOGGLE_LABEL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { CLI, copyWithoutHumanTouch, gitStatus, pack, replaceIn, sh, startServer } from "./install-copy";
import { scripts, settle } from "./loading";

const EXAMPLE = fileURLToPath(new URL("../../examples/next-app-css-modules/", import.meta.url));

// One Next.js project, installed into, checked, and taken back out, in that order.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

let packed: string;
let project: string;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  packed = await pack(mkdtempSync(join(tmpdir(), "03kind-pack-")));
  project = await copyWithoutHumanTouch(EXAMPLE, (dir) => {
    replaceIn(dir, "next.config.ts", 'import { withHumanTouch } from "humantouch/next";\n');
    replaceIn(dir, "next.config.ts", "withHumanTouch(nextConfig)", "nextConfig");
    replaceIn(dir, "app/layout.tsx", 'import { HumanTouch } from "humantouch/react";\n');
    replaceIn(dir, "app/layout.tsx", "        <HumanTouch />\n");
  });
});

test.afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
  if (packed) rmSync(join(packed, ".."), { recursive: true, force: true });
});

const installed = (...args: string[]) => sh(process.execPath, [join(project, "node_modules/humantouch/dist/cli.js"), ...args], project);

test("init installs Human Touch into a Next.js project: with webpack, the toggle is on the page and the markers in it; the rest of the editor layer loads as edit mode is first entered", async ({ page }) => {
  // Room for the waits on Next.js below: 150 s for its cold start and 60 s for edit mode's first compile, and
  // 60 s left for `init` (an install from the packed package), the checks between and stopping the server.
  test.setTimeout(150_000 + 60_000 + 60_000);
  const output = await sh(process.execPath, [CLI, "init"], project, { TK_INSTALL_FROM: packed });
  expect(output).toContain("Human Touch (Next.js, pnpm)");
  expect(output).toContain("Installed.");

  const server = startServer(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", String(NEXT_INSTALL_PORT)], project);
  try {
    const loaded = scripts(page);
    // Next.js starts cold here, with webpack, in a copy just installed: on a busy machine it took more than 60 seconds to answer at all (ticket 93).
    await expect(async () => {
      await page.goto(`http://localhost:${NEXT_INSTALL_PORT}`);
    }).toPass({ timeout: 150_000 });
    const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
    await expect(toggle).toBeVisible();
    await expect(page.locator("article").first()).toHaveAttribute("data-tk-loc", /^components\/Card\.tsx:\d+:\d+$/);

    await settle(page);
    expect(await loaded.has(EXIT_LABEL)).toBe(false);
    await toggle.click();
    // webpack compiles the rest of the editor layer only now, as it is first asked for: seconds more on a busy machine.
    await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible({ timeout: 60_000 });
    expect(await loaded.has(EXIT_LABEL)).toBe(true);
  } finally {
    await server.stop();
  }
});

test("init changes two places in the project's source: the config and the root layout", async () => {
  const changed = (await gitStatus(project)).split("\n").filter(Boolean).map((line) => line.slice(3));
  const notSource = /^(package\.json|pnpm-lock\.yaml|AGENTS\.md|\.gitignore|\.agents\/skills\/humantouch\/SKILL\.md|\.claude\/skills\/humantouch\/SKILL\.md)$/;

  expect(changed.filter((file) => !notSource.test(file)).sort()).toEqual(["app/layout.tsx", "next.config.ts"]);
});

test("doctor reports every part installed, and a production build with none of the editor layer", async () => {
  const output = await installed("doctor");

  expect(output).toContain("✓ next.config.ts: adds the plugin");
  expect(output).toContain("✓ app/layout.tsx: mounts the editor layer");
  expect(output).toContain("✓ A production build has none of the editor layer");
  expect(output).toContain("All good.");
});

test("remove takes it all back out: git sees no change at all", async () => {
  await installed("remove");

  expect(await gitStatus(project)).toBe("");
});
