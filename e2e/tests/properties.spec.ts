import { expect, test, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function selectRow(page: Page, name: string, nth = 0) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

/** A computed style of every card on the canvas, in page order. */
function cardStyles(page: Page, property: "backgroundColor" | "borderRadius") {
  return canvas(page)
    .locator("article")
    .evaluateAll((cards, property) => cards.map((card) => getComputedStyle(card)[property]), property);
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  await enterEditMode(page);
});

test("a new fill shows on every instance of the usage, and on no other", async ({ page }) => {
  await selectRow(page, "Card");
  const hex = design(page).getByRole("textbox", { name: "Fill color", exact: true });
  await expect(hex).toHaveValue("FFFFFF");

  await hex.fill("ff0000");
  await hex.press("Enter");

  // Three cards come from one usage in a loop; "Your turn" is another usage.
  expect(await cardStyles(page, "backgroundColor")).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 255, 255)"]);
  await expect(hex).toHaveValue("FF0000");
});

test("the color picker paints the canvas while it moves", async ({ page }) => {
  await selectRow(page, "Card", 3);

  await design(page).getByLabel("Pick fill color").fill("#00ff00");

  expect(await cardStyles(page, "backgroundColor")).toEqual([
    "rgb(255, 255, 255)",
    "rgb(255, 255, 255)",
    "rgb(255, 255, 255)",
    "rgb(0, 255, 0)",
  ]);
});

test("fill opacity, and removing and adding a fill", async ({ page }) => {
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  const opacity = fill.getByRole("textbox", { name: "Fill opacity" });
  await expect(opacity).toHaveValue("100%");

  await opacity.fill("50");
  await opacity.press("Enter");
  expect((await cardStyles(page, "backgroundColor"))[0]).toBe("rgba(255, 255, 255, 0.5)");

  await fill.getByRole("button", { name: "Remove fill" }).click();
  expect((await cardStyles(page, "backgroundColor"))[0]).toBe("rgba(0, 0, 0, 0)");
  await expect(fill.getByRole("textbox")).toHaveCount(0);

  await fill.getByRole("button", { name: "Add fill" }).click();
  expect((await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(255, 255, 255)");
});

test("a uniform corner radius, typed or stepped with the arrow keys", async ({ page }) => {
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  await expect(radius).toHaveValue("12");

  await radius.fill("4");
  await radius.press("Enter");
  expect(await cardStyles(page, "borderRadius")).toEqual(["4px", "4px", "4px", "12px"]);

  await radius.press("ArrowUp");
  await radius.press("Shift+ArrowUp");
  expect((await cardStyles(page, "borderRadius"))[0]).toBe("15px");
  await expect(radius).toHaveValue("15");
});

test("a radius past half the shorter side shows as set, and steps on from there", async ({ page }) => {
  await selectRow(page, "Button"); // The Get started button: 44.8px tall, so a pill from 22.4 up.
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });

  await radius.fill("99");
  await radius.press("Enter");
  await expect(radius).toHaveValue("99");

  await radius.press("ArrowUp");
  await expect(radius).toHaveValue("100");
  const button = canvas(page).getByRole("button", { name: "Get started" });
  await expect(button).toHaveCSS("border-radius", "100px");
});

test("a value typed and left without Enter still applies to the layer it was typed for", async ({ page }) => {
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });

  await radius.fill("2");
  await selectRow(page, "Card", 3);

  expect(await cardStyles(page, "borderRadius")).toEqual(["2px", "2px", "2px", "12px"]);
  await expect(radius).toHaveValue("12");
});

test("a locked layer offers no fill or corner radius", async ({ page }) => {
  await selectRow(page, "Badge");

  await expect(design(page).getByText(/can only be moved and resized as a whole/)).toBeVisible();
  await expect(design(page).getByRole("group", { name: "Fill" })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveCount(0);
});

test("a text layer offers no fill or corner radius here", async ({ page }) => {
  await selectRow(page, "Freeze");

  await expect(design(page).getByRole("group", { name: "Fill" })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveCount(0);
});

test("the selection box steps aside while a value changes, so the change can be seen, and comes back after", async ({ page }) => {
  await selectRow(page, "Card");
  const box = page.locator('.vk-selection[data-view="Desktop"]');
  await expect(box).toBeVisible();
  // It is gone only briefly, so watch for it rather than poll.
  await box.evaluate((el: HTMLElement & { stepsAside?: boolean }) => {
    new MutationObserver(() => {
      if (getComputedStyle(el).opacity === "0") el.stepsAside = true;
    }).observe(el, { attributes: true });
  });

  await design(page).getByRole("textbox", { name: "Corner radius" }).press("ArrowUp");

  await expect(box).toHaveCSS("opacity", "1");
  expect(await box.evaluate((el: HTMLElement & { stepsAside?: boolean }) => el.stepsAside)).toBe(true);
});

test("dragging left and right on a number's icon changes it, 1 per px and 10 with Shift", async ({ page }) => {
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  const icon = page.locator('.vk-field:has([aria-label="Corner radius"]) .vk-scrub');
  const { x, y } = (await icon.boundingBox())!;
  const drag = async (dx: number) => {
    await page.mouse.move(x + 4, y + 4);
    await page.mouse.down();
    for (let i = 1; i <= Math.abs(dx); i++) await page.mouse.move(x + 4 + Math.sign(dx) * i, y + 4);
    await page.mouse.up();
  };

  await drag(5);
  await expect(radius).toHaveValue("17");

  await page.keyboard.down("Shift");
  await drag(2);
  await page.keyboard.up("Shift");
  await expect(radius).toHaveValue("37");

  await drag(-50);
  await expect(radius).toHaveValue("0");
  expect(await cardStyles(page, "borderRadius")).toEqual(["0px", "0px", "0px", "12px"]);
});
