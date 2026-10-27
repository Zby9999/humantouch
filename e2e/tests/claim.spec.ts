import { rmSync } from "node:fs";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { readVernier, VERNIER, vernierkit } from "./project-files";

/** These tests save into the example project's `.vernier/` for real. */
test.use({ keepRoundInMemory: false });

test.beforeEach(() => rmSync(VERNIER, { recursive: true, force: true }));
test.afterAll(() => rmSync(VERNIER, { recursive: true, force: true }));

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

async function setField(page: Page, name: string, value: string) {
  const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

test("claim takes the designer's changes and prints change notes for the Agent", async ({ page }) => {
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const layers = page.getByRole("tree", { name: "Layers" });
  await layers.getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "4");
  // React's root element, from index.html: no source marker.
  await layers.getByRole("treeitem").first().click();
  await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Add fill" }).click();
  await layers.getByRole("treeitem", { name: "Button", exact: true }).click();
  await setField(page, "Fill color", "2563eb");
  await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(4);

  const notes = await vernierkit("claim");

  expect(readVernier("state.json")).toMatchObject({ status: "claimed", done: [] });
  const [, fill, radius, root, button] = notes.split(/^## /m);
  expect(fill).toMatch(/^1\. Fill\n/);
  expect(fill).toContain("- **Kind:** Style\n");
  expect(fill).toMatch(/- \*\*Location:\*\* `src\/components\/Card\.tsx:\d+:\d+`\n/);
  expect(fill).toMatch(/- \*\*Scope:\*\* This usage only: Card used at `src\/App\.tsx:\d+:\d+`, inside App used at `src\/main\.tsx:\d+:\d+`\. It renders 3 instances/);
  expect(fill).toContain("- **Design intent:** Change the fill from #FFFFFF to #FF0000.\n");
  expect(fill).toContain("- **Reference style:** `background-color: rgb(255 0 0 / 1)`\n");
  expect(radius).toContain("- **Design intent:** Change the corner radius from 12px to 4px.\n");
  expect(root).toContain("- **Location:** **Not located.**");
  expect(root).toContain('`<div id="root">`');
  expect(root).toContain("- **Currently set by:** nothing: the browser default applies\n");
  // Tailwind's utilities are in a CSS layer; the example's own rule for buttons is not, and wins.
  expect(fill).toMatch(/- \*\*Currently set by:\*\* class `bg-white`: rule `\.bg-white` in CSS layer `utilities` of `src\/index\.css`, `background-color: var\(--color-white\)`\n/);
  expect(radius).toContain("class `rounded-xl`: rule `.rounded-xl` in CSS layer `utilities`");
  expect(button).toContain("- **Currently set by:** rule `button` in no CSS layer, of `src/index.css`, `background: rgb(220, 38, 38)`\n");
});

test("layout changes are told in design language; a plain flow given a gap is to be made a real Stack", async ({ page }) => {
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const layers = page.getByRole("tree", { name: "Layers" });
  await layers.getByRole("treeitem", { name: "Button", exact: true }).click();
  await page.getByRole("complementary", { name: "Design" }).getByRole("combobox", { name: "Width sizing" }).selectOption("fill");
  await layers.getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Gap", "8");
  await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(2);

  const [, width, gap] = (await vernierkit("claim")).split(/^## /m);

  expect(width).toMatch(/^1\. Width\n/);
  expect(width).toContain("- **Design intent:** Change the width from Hug to Fill.\n");
  expect(width).toContain("- **Reference style:** `width: auto`, `align-self: stretch`\n");
  expect(width).toContain("class `self-start`");
  expect(gap).toContain("- **Design intent:** Change the gap from 0px to 8px.\n- **Make it a Stack:**");
  expect(gap).toContain("- **Reference style:** `display: flex`, `flex-direction: column`, `gap: 8px`\n");
});

test("a reorder and an absolute placement are told apart, with where each goes; done does not check moves on the page", async ({ page }) => {
  await page.goto(DEV_URL);
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "height: 240px";
    document.querySelector("main")!.append(board);
  });
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const layers = page.getByRole("tree", { name: "Layers" });
  const hero = canvas(page).getByTestId("hero");
  const dragTo = async (name: string, selector: string, to: () => Promise<{ x: number; y: number }>) => {
    await layers.getByRole("treeitem", { name, exact: true }).click();
    const start = (await hero.locator(selector).boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    const end = await to();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  };
  // The header after the paragraph; the button into the board.
  await dragTo("Header", "> header", async () => {
    const p = (await hero.locator("> p").boundingBox())!;
    return { x: p.x + p.width / 2, y: p.y + p.height - 2 };
  });
  await dragTo("Button", "> button", async () => {
    const board = (await canvas(page).locator("#board").boundingBox())!;
    return { x: board.x + board.width / 2, y: board.y + board.height / 2 };
  });
  await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(2);

  const [, reorder, absolute] = (await vernierkit("claim")).split(/^## /m);

  expect(reorder).toMatch(/^1\. Reorder\n/);
  expect(reorder).toMatch(/- \*\*Design intent:\*\* Move it from 1st to 2nd place among the layers of its container, Stack \(`<section class="flex h-screen flex-col justify-center">`, at `src\/App\.tsx:\d+:\d+`\)\.\n/);
  expect(absolute).toMatch(/^2\. Absolute\n/);
  expect(absolute).toContain("place it absolute in Frame (`<div id=\"board\">`, not located");
  expect(absolute).toContain("- **Reference style:** `position: absolute`");
  expect(await vernierkit("done", "1")).toContain("Not checked on the page: only style changes are checked on the page so far, not changes to the structure.");
});

test("a card of the loop deleted and another copied are data changes; a Stack made of two layers lists them in order", async ({ page }) => {
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const layers = page.getByRole("tree", { name: "Layers" });
  await layers.getByRole("treeitem", { name: "Card", exact: true }).nth(1).click();
  await page.keyboard.press("Delete");
  await layers.getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await page.keyboard.press("ControlOrMeta+d");
  await layers.getByRole("treeitem", { name: "Vernier Kit", exact: true }).click();
  await layers.getByRole("treeitem", { name: "Badge", exact: true }).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Shift+A");
  await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(3);

  const [, deleted, copied, stack] = (await vernierkit("claim")).split(/^## /m);

  expect(deleted).toMatch(/^1\. Delete\n/);
  expect(deleted).toContain("- **Data change:** the layer is one of the 3 instances a loop renders: take its item out of the data the loop goes through.");
  expect(copied).toMatch(/^2\. Duplicate\n/);
  expect(copied).toContain("- **Data change:** the layer is one of the 3 instances a loop renders: add an item to the data the loop goes through");
  expect(stack).toMatch(/^3\. Make Stack\n/);
  expect(stack).toMatch(/Wrap these 2 layers, in this order, in a new Stack: horizontal, with a gap of 12px, no padding, aligned center left\. Put it in the layout of Header/);
  expect(stack).toMatch(/\n {2}1\. Vernier Kit \(`<h1 class="[^"]*">`, at `src\/App\.tsx:\d+:\d+`\)\n {2}2\. Badge/);
  expect(await vernierkit("done", "3")).toContain("Not checked on the page: only style changes are checked on the page so far, not changes to the structure.");
});

test("with no changes, claim says so and leaves the round as it is", async () => {
  expect(await vernierkit("claim")).toMatch(/^No design changes to apply/);
  expect(readVernier("state.json")).toBeNull();
});
