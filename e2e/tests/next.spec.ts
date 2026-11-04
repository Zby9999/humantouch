import { readFileSync } from "node:fs";
import { NEXT_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

/** The Next.js example: App Router, CSS Modules, served by `next dev` with Turbopack. */
const EXAMPLE = new URL("../../examples/next-app-css-modules/", import.meta.url);

/** `file:line:column` of the first occurrence of `snippet` in an example source file. */
function locate(file: string, snippet: string) {
  const lines = readFileSync(new URL(file, EXAMPLE), "utf8").split("\n");
  const line = lines.findIndex((text) => text.includes(snippet));
  if (line < 0) throw new Error(`${snippet} not found in ${file}`);
  return `${file}:${line + 1}:${lines[line].indexOf(snippet) + 1}`;
}

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

test.beforeEach(async ({ page }) => {
  await page.goto(NEXT_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("the toggle appears on a Next.js page", async ({ page }) => {
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
});

test("elements server components write carry their element location, under Turbopack", async ({ page }) => {
  await expect(page.locator("body")).toHaveAttribute("data-tk-loc", locate("app/layout.tsx", "<body"));
  await expect(page.locator("main")).toHaveAttribute("data-tk-loc", locate("app/page.tsx", "<main"));
  for (const card of await page.locator("article").all()) {
    await expect(card).toHaveAttribute("data-tk-loc", locate("components/Card.tsx", "<article"));
  }
  // A client component's element.
  await expect(page.getByRole("button", { name: "Get started" })).toHaveAttribute("data-tk-loc", locate("components/GetStarted.tsx", "<button"));
});

test("code from Next.js itself is not marked: the link next/link writes has no element location", async ({ page }) => {
  const link = page.getByRole("link", { name: "About" });

  await expect.poll(() => link.getAttribute("data-tk-loc")).toBeNull();
  // Its usage is project source: Link passes the marker on to the element.
  await expect(link).toHaveAttribute("data-tk-usage", locate("app/page.tsx", "<Link"));
});

test("the usage chain reaches through server components: the cards are Card used in the page", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  const card = canvas(page).locator("article").first();
  await expect(card).toBeVisible();

  const chain = JSON.parse((await card.getAttribute("data-tk-chain"))!);

  // The page itself is rendered by Next.js, from no JSX of the project's.
  expect(chain).toEqual([
    { component: "Card", usage: locate("app/page.tsx", "<Card key"), thirdParty: false },
    { component: "Home", usage: null, thirdParty: false },
  ]);
});

test("edit mode freezes the page into a canvas: the layers are there to select and change", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const layers = page.getByRole("tree", { name: "Layers" });
  await expect(layers.getByRole("treeitem", { name: "Card", exact: true })).toHaveCount(4);

  await layers.getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const fill = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Fill color", exact: true });
  await expect(fill).toHaveValue("FFFFFF");
  await fill.fill("ff0000");
  await fill.press("Enter");

  // The three cards of the loop change together; the fourth is another usage.
  const fills = () => canvas(page).locator("article").evaluateAll((cards) => cards.map((card) => getComputedStyle(card).backgroundColor));
  await expect.poll(fills).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 255, 255)"]);
});
