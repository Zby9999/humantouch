import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_LABEL, NEXT_INSTALL_PORT, TOGGLE_LABEL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { CLI, copyWithoutThirdKind, gitStatus, pack, replaceIn, sh, startServer } from "./install-copy";
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
  project = await copyWithoutThirdKind(EXAMPLE, (dir) => {
    replaceIn(dir, "next.config.ts", 'import { withThirdKind } from "03kind/next";\n');
    replaceIn(dir, "next.config.ts", "withThirdKind(nextConfig)", "nextConfig");
    replaceIn(dir, "app/layout.tsx", 'import { ThirdKind } from "03kind/react";\n');
    replaceIn(dir, "app/layout.tsx", "        <ThirdKind />\n");
  });
});

test.afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
  if (packed) rmSync(join(packed, ".."), { recursive: true, force: true });
});

const installed = (...args: string[]) => sh(process.execPath, [join(project, "node_modules/03kind/dist/cli.js"), ...args], project);

test("init installs 03Kind into a Next.js project: with webpack, the toggle is on the page and the markers in it; the rest of the editor layer loads as edit mode is first entered", async ({ page }) => {
  const output = await sh(process.execPath, [CLI, "init"], project, { TK_INSTALL_FROM: packed });
  expect(output).toContain("03Kind (Next.js, pnpm)");
  expect(output).toContain("Installed.");

  const server = startServer(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", String(NEXT_INSTALL_PORT)], project);
  try {
    const loaded = scripts(page);
    await expect(async () => {
      await page.goto(`http://localhost:${NEXT_INSTALL_PORT}`);
    }).toPass({ timeout: 60_000 });
    const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
    await expect(toggle).toBeVisible();
    await expect(page.locator("article").first()).toHaveAttribute("data-tk-loc", /^components\/Card\.tsx:\d+:\d+$/);

    await settle(page);
    expect(await loaded.has(EXIT_LABEL)).toBe(false);
    await toggle.click();
    await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
    expect(await loaded.has(EXIT_LABEL)).toBe(true);
  } finally {
    await server.stop();
  }
});

test("init changes two places in the project's source: the config and the root layout", async () => {
  const changed = (await gitStatus(project)).split("\n").filter(Boolean).map((line) => line.slice(3));
  const notSource = /^(package\.json|pnpm-lock\.yaml|AGENTS\.md|\.gitignore|\.agents\/skills\/03kind\/SKILL\.md|\.claude\/skills\/03kind\/SKILL\.md)$/;

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
