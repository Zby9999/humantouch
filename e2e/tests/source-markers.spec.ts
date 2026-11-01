import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { DEV_URL } from "../playwright.config";

const exampleRoot = new URL("../../examples/vite-react19-tw4/", import.meta.url);

/** `file:line:column` of the first occurrence of `snippet` in an example source file. */
function locate(file: string, snippet: string) {
  const lines = readFileSync(new URL(file, exampleRoot), "utf8").split("\n");
  const line = lines.findIndex((text) => text.includes(snippet));
  if (line < 0) throw new Error(`${snippet} not found in ${file}`);
  return `${file}:${line + 1}:${lines[line].indexOf(snippet) + 1}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("elements written by project source carry their element location", async ({ page }) => {
  await expect(page.locator("main")).toHaveAttribute("data-tk-loc", locate("src/App.tsx", "<main"));
  await expect(page.locator("h1")).toHaveAttribute("data-tk-loc", locate("src/App.tsx", "<h1"));

  const cards = page.locator("article");
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    await expect(card).toHaveAttribute("data-tk-loc", locate("src/components/Card.tsx", "<article"));
  }
});

/** The props of the nearest component that rendered the element matching `selector`. */
function ownerProps(page: import("./fixtures").Page, selector: string) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector)!;
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"))!;
    let fiber = (el as any)[key];
    while (fiber && typeof fiber.type !== "function") fiber = fiber.return;
    return fiber?.memoizedProps as Record<string, unknown>;
  }, selector);
}

test("component usages carry their usage location", async ({ page }) => {
  const props = await ownerProps(page, "article");

  expect(props["data-tk-usage"]).toBe(locate("src/App.tsx", "<Card"));
});

test("code from third-party dependencies is not marked", async ({ page }) => {
  const badge = page.getByTestId("acme-badge");
  await expect(badge).toBeVisible();

  expect(await badge.getAttribute("data-tk-loc")).toBeNull();
  // The usage of the third-party component is project source, so it is marked.
  expect((await ownerProps(page, "[data-testid=acme-badge]"))["data-tk-usage"]).toBe(
    locate("src/App.tsx", "<Badge"),
  );
});
