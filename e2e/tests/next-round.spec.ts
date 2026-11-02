import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { EXIT_LABEL, NEXT_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { clearThirdKindFolder } from "./project-files";

/** A round on the Next.js example, saved into its `.03kind/` for real. */
test.use({ keepRoundInMemory: false });
test.describe.configure({ mode: "serial" });

const EXAMPLE = fileURLToPath(new URL("../../examples/next-app-css-modules/", import.meta.url));
const THIRD_KIND_FOLDER = `${EXAMPLE}.03kind/`;
const CLI = fileURLToPath(new URL("../../packages/03kind/dist/cli.js", import.meta.url));
const CARD_CSS = `${EXAMPLE}components/Card.module.css`;
const CARD = `${EXAMPLE}components/Card.tsx`;

test.beforeEach(() => clearThirdKindFolder(THIRD_KIND_FOLDER));
test.afterAll(() => clearThirdKindFolder(THIRD_KIND_FOLDER));

async function npx03kind(...args: string[]) {
  const { stdout } = await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: EXAMPLE });
  return stdout;
}

function savedChanges() {
  const file = `${THIRD_KIND_FOLDER}changeset.json`;
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

  const [, card, hero] = (await npx03kind("claim")).split(/^## /m);

  expect(card).toMatch(/- \*\*Location:\*\* `components\/Card\.tsx:\d+:\d+`\n/);
  expect(card).toMatch(/- \*\*Scope:\*\* This usage only: Card used at `app\/page\.tsx:\d+:\d+`, inside Home used at an undetermined place\. It renders 3 instances/);
  expect(hero).toMatch(/- \*\*Location:\*\* `app\/page\.tsx:\d+:\d+`\n/);
  expect(hero).toContain("- **Scope:** **Usage not determined.** Home is used from code 03Kind could not locate. Change only the usage the layer is in, found from its place on the page at `/` (Layer, above)");
  expect(hero).toMatch(/- \*\*Layer:\*\* Stack, `<section class="[^"]*hero[^"]*">` \(Page › .*Stack › Stack\)/);
  // CSS Modules: the class as the page has it, and the rule that sets the value.
  expect(card).toMatch(/- \*\*Currently set by:\*\* class `[^`]*card[^`]*`: rule `\.[^`]*card[^`]*` in no CSS layer/);
});

test("claim locks the editor; done checks the change on the page once the CSS Module has it and fills the ring; finish ends the round", async ({ page }) => {
  await changeCardsAndHeading(page);
  await npx03kind("claim");
  const progress = page.getByRole("progressbar", { name: "Applying design changes" });
  await expect(page.getByRole("button", { name: /^03Kind: applying design changes/ })).toHaveAttribute("aria-disabled", "true");
  await expect(progress).toHaveAttribute("aria-valuemax", "2");
  const original = readFileSync(CARD_CSS, "utf8");
  const originalCard = readFileSync(CARD, "utf8");
  try {
    // For the loop's cards alone (ticket 77): the `.card` rule styles the fourth card too, so the loop's get a class of their own.
    writeFileSync(CARD_CSS, `${original}\n.loop {\n  background: rgb(255, 0, 0);\n}\n`);
    writeFileSync(CARD, originalCard.replace("<article className={styles.card}>", '<article className={title === "Your turn" ? styles.card : `${styles.card} ${styles.loop}`}>'));

    expect(await npx03kind("done", "1")).toContain("Checked on the page: it shows the change.");
    await expect(progress).toHaveAttribute("aria-valuenow", "1");
    // The heading was never applied: the page itself saw it not shown, done or not.
    expect(await npx03kind("finish")).toContain("Round finished: 1 of 2 changes applied. The page does not show: 2.");
  } finally {
    writeFileSync(CARD_CSS, original);
    writeFileSync(CARD, originalCard);
  }
});

test("a change made in the phone view is at the range of the page's own media queries the view is in, and noted with them", async ({ page }) => {
  await page.goto(NEXT_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  const phone = page.locator('iframe[title="Phone 390"]');
  await expect(phone.contentFrame().locator("h1")).toBeVisible();
  const box = (await phone.contentFrame().locator("article").first().boundingBox())!;
  await page.keyboard.down("Meta");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Meta");
  await setField(page, "Fill color", "ff0000");
  // The page's CSS Module has its grid one column wide up to 767px, two up to 1023px.
  await expect.poll(() => savedChanges()?.[0]?.breakpoint).toEqual({ min: null, max: 768, project: { queries: ["(max-width: 767px)"] } });

  const notes = await npx03kind("claim");
  expect(notes).toContain("The project writes these widths with its own media queries, whose edges these are: 768px, where `(max-width: 767px)` starts or stops holding");
});
