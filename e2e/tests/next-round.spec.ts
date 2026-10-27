import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { EXIT_LABEL, NEXT_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

/** A round on the Next.js example, saved into its `.vernier/` for real. */
test.use({ keepRoundInMemory: false });
test.describe.configure({ mode: "serial" });

const EXAMPLE = fileURLToPath(new URL("../../examples/next-app-css-modules/", import.meta.url));
const VERNIER = `${EXAMPLE}.vernier/`;
const CLI = fileURLToPath(new URL("../../packages/vernierkit/dist/cli.js", import.meta.url));
const CARD_CSS = `${EXAMPLE}components/Card.module.css`;

test.beforeEach(() => rmSync(VERNIER, { recursive: true, force: true }));
test.afterAll(() => rmSync(VERNIER, { recursive: true, force: true }));

async function vernierkit(...args: string[]) {
  const { stdout } = await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: EXAMPLE });
  return stdout;
}

function savedChanges() {
  const file = `${VERNIER}changeset.json`;
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).changes : null;
}

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function setField(page: Page, name: string, value: string) {
  const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** Fills the cards of the loop red, and the hero section, which the page writes, light blue: two changes, saved. */
async function changeCardsAndHeading(page: Page) {
  await page.goto(NEXT_URL);
  await enterEditMode(page);
  const layers = page.getByRole("tree", { name: "Layers" });
  await layers.getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Fill color", "ff0000");
  await layers.getByRole("treeitem", { name: "Stack", exact: true }).nth(1).click();
  await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Add fill" }).click();
  await setField(page, "Fill color", "e8f0ff");
  await expect.poll(() => savedChanges()?.length).toBe(2);
}

test("changes are saved into the project, and come back after a reload", async ({ page }) => {
  await changeCardsAndHeading(page);

  await page.reload();
  await enterEditMode(page);

  await expect(canvas(page).locator("article").first()).toHaveCSS("background-color", "rgb(255, 0, 0)");
});

test("after a client-side navigation in preview mode, edit mode comes back to the same canvas", async ({ page }) => {
  await changeCardsAndHeading(page);
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  await page.getByRole("link", { name: "About" }).click();
  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();

  await expect(canvas(page).locator("article").first()).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await expect(canvas(page).getByRole("heading", { name: "About" })).toHaveCount(0);
});

test("claim tells where each change is: a server component's usage in the page, and the page itself when no usage is known", async ({ page }) => {
  await changeCardsAndHeading(page);

  const [, card, hero] = (await vernierkit("claim")).split(/^## /m);

  expect(card).toMatch(/- \*\*Location:\*\* `components\/Card\.tsx:\d+:\d+`\n/);
  expect(card).toMatch(/- \*\*Scope:\*\* This usage only: Card used at `app\/page\.tsx:\d+:\d+`, inside Home used at an undetermined place\. It renders 3 instances/);
  expect(hero).toMatch(/- \*\*Location:\*\* `app\/page\.tsx:\d+:\d+`\n/);
  expect(hero).toContain("- **Scope:** **Usage not determined.** Home is used from code Vernier Kit could not locate. Change only the usage the layer is in, found from its place on the page at `/` (Layer, above)");
  expect(hero).toMatch(/- \*\*Layer:\*\* Stack, `<section class="[^"]*hero[^"]*">` \(Page › .*Stack › Stack\)/);
  // CSS Modules: the class as the page has it, and the rule that sets the value.
  expect(card).toMatch(/- \*\*Currently set by:\*\* class `[^`]*card[^`]*`: rule `\.[^`]*card[^`]*` in no CSS layer/);
});

test("claim locks the editor; done checks the change on the page once the CSS Module has it and fills the ring; finish ends the round", async ({ page }) => {
  await changeCardsAndHeading(page);
  await vernierkit("claim");
  const progress = page.getByRole("progressbar", { name: "Applying design changes" });
  await expect(page.getByRole("button", { name: /^Vernier Kit: applying design changes/ })).toHaveAttribute("aria-disabled", "true");
  await expect(progress).toHaveAttribute("aria-valuemax", "2");
  const original = readFileSync(CARD_CSS, "utf8");
  try {
    writeFileSync(CARD_CSS, original.replace("background: rgb(255, 255, 255);", "background: rgb(255, 0, 0);"));

    expect(await vernierkit("done", "1")).toContain("Checked on the page: it shows the change.");
    await expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(await vernierkit("finish")).toContain("Round finished: 1 of 2 changes applied. Not marked done: 2.");
  } finally {
    writeFileSync(CARD_CSS, original);
  }
});
