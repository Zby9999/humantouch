import { expect, test } from "./fixtures";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_LABEL, PREVIEW_URL, TOGGLE_LABEL } from "../playwright.config";

const example = fileURLToPath(new URL("../../examples/vite-react19-tw4/", import.meta.url));

function expectNoEditorLayerCode(dist: string) {
  const files = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter((f) =>
    /\.(js|css|html)$/.test(f),
  );
  expect(files.some((f) => f.endsWith(".js"))).toBe(true);

  for (const file of files) {
    const content = readFileSync(path.join(dist, file), "utf8");
    // The toggle, and the rest of the editor layer, which a page in development loads only as needed.
    for (const residue of ["human-touch", "data-ht-", TOGGLE_LABEL, EXIT_LABEL]) {
      expect(content.includes(residue), `${file} contains "${residue}"`).toBe(false);
    }
  }
}

test("the production page has no toggle and no markers", async ({ page }) => {
  await page.goto(PREVIEW_URL);
  await expect(page.locator("h1")).toBeVisible();

  await expect(page.getByRole("button", { name: /Human Touch/ })).toHaveCount(0);
  await expect(page.locator("human-touch")).toHaveCount(0);
  await expect(page.locator("[data-ht-loc]")).toHaveCount(0);
});

test("the production build output contains no editor layer code", () => {
  expectNoEditorLayerCode(path.join(example, "dist"));
});

test("a build in development mode contains no editor layer code either", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "humantouch-build-"));
  execFileSync("pnpm", ["exec", "vite", "build", "--mode", "development", "--outDir", outDir], {
    cwd: example,
    stdio: "pipe",
  });

  expectNoEditorLayerCode(outDir);
});
