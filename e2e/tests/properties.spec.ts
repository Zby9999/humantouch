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
function cardStyles(
  page: Page,
  property: "backgroundColor" | "backgroundImage" | "borderRadius" | "borderStyle" | "borderWidth" | "borderColor" | "boxShadow" | "filter" | "backdropFilter",
) {
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

test("a fill made a linear gradient: its angle and its stops, dragged, added, moved and taken off, paint the canvas at once", async ({ page }) => {
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  const gradient = async () => (await cardStyles(page, "backgroundImage"))[0];

  await fill.getByRole("combobox", { name: "Fill type" }).selectOption("Linear");
  // The card's white, fading out, top to bottom; on every instance of the usage and no other.
  expect(await cardStyles(page, "backgroundImage")).toEqual([
    ...Array(3).fill("linear-gradient(rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0) 100%)"),
    "none",
  ]);

  const angle = fill.getByRole("textbox", { name: "Angle" });
  await angle.fill("90");
  await angle.press("Enter");
  expect(await gradient()).toBe("linear-gradient(90deg, rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0) 100%)");

  const first = fill.getByRole("textbox", { name: "Stop 1 color", exact: true });
  await first.fill("ff0000");
  await first.press("Enter");
  await fill.getByRole("slider", { name: "Stop 2 position" }).press("Shift+ArrowLeft");
  expect(await gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 0%, rgba(255, 255, 255, 0) 90%)");

  // Dragged along the bar: the canvas follows the handle.
  const bar = fill.getByRole("group", { name: "Gradient stops" });
  const box = (await bar.boundingBox())!;
  const handle = (await fill.getByRole("slider", { name: "Stop 1 position" }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 4 });
  expect(await gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 10%, rgba(255, 255, 255, 0) 90%)");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(await gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 255, 255, 0) 90%)");
  await expect(fill.getByRole("textbox", { name: "Stop 1 at" })).toHaveValue("20%");
  // The whole drag is one step to undo.
  await page.keyboard.press("ControlOrMeta+z");
  expect(await gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 0%, rgba(255, 255, 255, 0) 90%)");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 255, 255, 0) 90%)");

  // A click on the bar adds a stop there, in the color the gradient has there.
  await bar.click({ position: { x: box.width * 0.55, y: box.height / 2 } });
  await expect(fill.getByRole("slider")).toHaveCount(3);
  expect(await gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 128, 128, 0.5) 55%, rgba(255, 255, 255, 0) 90%)");

  await fill.getByRole("slider", { name: "Stop 2 position" }).press("Delete");
  await fill.getByRole("button", { name: "Add stop" }).click();
  expect(await gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 128, 128, 0.5) 55%, rgba(255, 255, 255, 0) 90%)");
  await fill.getByRole("button", { name: "Remove stop 3" }).click();
  expect(await gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 128, 128, 0.5) 55%)");
  await expect(fill.getByRole("button", { name: "Remove stop 1" })).toBeDisabled();
});

test("a radial gradient keeps the stops, and a color again takes the first of them", async ({ page }) => {
  await selectRow(page, "Card");
  const type = design(page).getByRole("group", { name: "Fill" }).getByRole("combobox", { name: "Fill type" });

  await type.selectOption("Radial");
  expect((await cardStyles(page, "backgroundImage"))[0]).toBe("radial-gradient(rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0) 100%)");

  await type.selectOption("Solid");
  expect((await cardStyles(page, "backgroundImage"))[0]).toBe("none");
  expect((await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(255, 255, 255)");
});

test("a conic gradient the page has shows, and cannot be edited", async ({ page }) => {
  await canvas(page)
    .locator("article")
    // The three cards of one usage; "Your turn" is another.
    .evaluateAll((cards) => cards.slice(0, 3).forEach((card) => ((card as HTMLElement).style.backgroundImage = "conic-gradient(red, blue)")));
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });

  await expect(fill.getByText("Conic gradient", { exact: true })).toBeVisible();
  await expect(fill.getByRole("combobox")).toHaveCount(0);
  await expect(fill.getByRole("textbox")).toHaveCount(0);
  await expect(fill.getByRole("button")).toHaveCount(0);

  // With a layer of another fill, Mixed: still nothing to change it with.
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).nth(3).click({ modifiers: ["Shift"] });
  await expect(fill.getByText("Mixed")).toBeVisible();
  await expect(fill.getByRole("combobox")).toHaveCount(0);
  await expect(fill.getByRole("button")).toHaveCount(0);
});

test("a stroke: the page's own as it is; its weight and line, one side, each side its own, and none, on the canvas at once", async ({ page }) => {
  await selectRow(page, "Card");
  const stroke = design(page).getByRole("group", { name: "Stroke", exact: true });
  // border border-stone-200
  await expect(stroke.getByRole("textbox", { name: "Stroke color", exact: true })).toHaveValue("E7E5E4");
  const weight = stroke.getByRole("textbox", { name: "Stroke weight" });
  await expect(weight).toHaveValue("1");

  await weight.fill("3");
  await weight.press("Enter");
  expect(await cardStyles(page, "borderWidth")).toEqual(["3px", "3px", "3px", "1px"]);

  await stroke.getByRole("combobox", { name: "Stroke style" }).selectOption("Dashed");
  expect((await cardStyles(page, "borderStyle"))[0]).toBe("dashed");

  const sides = stroke.getByRole("combobox", { name: "Stroke sides" });
  await sides.selectOption("Bottom");
  expect((await cardStyles(page, "borderWidth"))[0]).toBe("0px 0px 3px");

  await sides.selectOption("Custom");
  const left = stroke.getByRole("textbox", { name: "Stroke left" });
  await left.fill("5");
  await left.press("Enter");
  expect((await cardStyles(page, "borderWidth"))[0]).toBe("0px 0px 3px 5px");

  await sides.selectOption("All");
  expect((await cardStyles(page, "borderWidth"))[0]).toBe("5px");

  // A weight of 0 is no stroke.
  await weight.fill("0");
  await weight.press("Enter");
  expect((await cardStyles(page, "borderStyle"))[0]).toBe("none");
  await expect(stroke.getByRole("button", { name: "Add stroke" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  expect((await cardStyles(page, "borderWidth"))[0]).toBe("5px");

  await stroke.getByRole("button", { name: "Remove stroke" }).click();
  expect((await cardStyles(page, "borderStyle"))[0]).toBe("none");
  await stroke.getByRole("button", { name: "Add stroke" }).click();
  expect([(await cardStyles(page, "borderWidth"))[0], (await cardStyles(page, "borderStyle"))[0], (await cardStyles(page, "borderColor"))[0]]).toEqual([
    "1px",
    "solid",
    "rgb(0, 0, 0)",
  ]);
});

test("effects: the page's shadows as they are; shadows added, changed and taken off, and a layer blur and a background blur, on the canvas at once", async ({ page }) => {
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const field = (name: string) => effects.getByRole("textbox", { name, exact: true });
  const enter = async (name: string, value: string) => {
    await field(name).fill(value);
    await field(name).press("Enter");
  };
  const shadow = async () => (await cardStyles(page, "boxShadow"))[0];

  // shadow-sm: two drop shadows.
  await expect(effects.getByRole("combobox", { name: "Shadow 1 type" })).toHaveValue("drop");
  await expect(field("Shadow 1 Y")).toHaveValue("1");
  await expect(field("Shadow 1 blur")).toHaveValue("3");
  await expect(field("Shadow 2 spread")).toHaveValue("-1");
  await expect(field("Shadow 2 opacity")).toHaveValue("10%");

  await effects.getByRole("button", { name: "Remove shadow 2" }).click();
  await enter("Shadow 1 Y", "8");
  await enter("Shadow 1 blur", "16");
  // On every instance of the usage, and no other.
  const [first, second, third, other] = await cardStyles(page, "boxShadow");
  expect([first, second, third]).toEqual(Array(3).fill("rgba(0, 0, 0, 0.1) 0px 8px 16px 0px"));
  expect(other).not.toBe(first);

  // A new effect is a drop shadow, as in Figma; made an inner shadow, in red.
  await effects.getByRole("button", { name: "Add effect" }).click();
  await expect(field("Shadow 2 blur")).toHaveValue("4");
  await effects.getByRole("combobox", { name: "Shadow 2 type" }).selectOption("Inner shadow");
  await enter("Shadow 2 color", "ff0000");
  expect(await shadow()).toBe("rgba(0, 0, 0, 0.1) 0px 8px 16px 0px, rgba(255, 0, 0, 0.25) 0px 4px 4px 0px inset");

  // A shadow made a layer blur blurs as much.
  await effects.getByRole("combobox", { name: "Shadow 1 type" }).selectOption("Layer blur");
  expect(await cardStyles(page, "filter")).toEqual(["blur(16px)", "blur(16px)", "blur(16px)", "none"]);
  expect(await shadow()).toBe("rgba(255, 0, 0, 0.25) 0px 4px 4px 0px inset");
  await enter("Layer blur", "2");
  expect((await cardStyles(page, "filter"))[0]).toBe("blur(2px)");

  // One layer blur and one background blur: the one there is is not offered again.
  await effects.getByRole("button", { name: "Add effect" }).click();
  const type = effects.getByRole("combobox", { name: "Shadow 2 type" });
  await expect(type.getByRole("option", { name: "Layer blur" })).toBeDisabled();
  await type.selectOption("Background blur");
  expect((await cardStyles(page, "backdropFilter"))[0]).toBe("blur(4px)");

  await effects.getByRole("button", { name: "Remove layer blur" }).click();
  await effects.getByRole("button", { name: "Remove background blur" }).click();
  expect([(await cardStyles(page, "filter"))[0], (await cardStyles(page, "backdropFilter"))[0]]).toEqual(["none", "none"]);
  await expect(effects.getByRole("combobox", { name: "Layer blur type" })).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  expect((await cardStyles(page, "backdropFilter"))[0]).toBe("blur(4px)");
  await expect(field("Background blur")).toHaveValue("4");
});

test("a shadow dragged until it draws nothing is taken off, and the rest of the drag leaves the next shadow as it is", async ({ page }) => {
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const y = effects.getByRole("textbox", { name: "Shadow 1 Y", exact: true });
  await y.fill("0");
  await y.press("Enter"); // shadow-sm's first shadow, now 0 0 3px 0
  const icon = page.locator('.vk-field:has([aria-label="Shadow 1 blur"]) .vk-scrub');
  await icon.scrollIntoViewIfNeeded();
  const box = (await icon.boundingBox())!;
  const at = { x: box.x + 4, y: box.y + 4 };

  // Down to 0, and back up, in one drag.
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (const dx of [-1, -2, -3, -1, 1, 3]) await page.mouse.move(at.x + dx, at.y);
  await page.mouse.up();

  expect((await cardStyles(page, "boxShadow"))[0]).toBe("rgba(0, 0, 0, 0.1) 0px 1px 2px -1px");
  await expect(effects.getByRole("textbox", { name: "Shadow 1 blur", exact: true })).toHaveValue("2");
});

test("shadows the selected layers do not share show as Mixed, replaced by a new effect, or taken off together", async ({ page }) => {
  await canvas(page)
    .locator("article")
    .evaluateAll((cards) => ((cards[3] as HTMLElement).style.boxShadow = "none"));
  await selectRow(page, "Card");
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).nth(3).click({ modifiers: ["Shift"] });
  const effects = design(page).getByRole("group", { name: "Effects" });

  await expect(effects.getByText("Mixed shadows")).toBeVisible();
  // As in Figma, a new effect replaces the mixed ones.
  await effects.getByRole("button", { name: "Add effect" }).click();
  expect(await cardStyles(page, "boxShadow")).toEqual(Array(4).fill("rgba(0, 0, 0, 0.25) 0px 4px 4px 0px"));
  await expect(effects.getByRole("textbox", { name: "Shadow 1 Y", exact: true })).toHaveValue("4");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(effects.getByText("Mixed shadows")).toBeVisible();
  await effects.getByRole("button", { name: "Remove shadows" }).click();
  expect(await cardStyles(page, "boxShadow")).toEqual(Array(4).fill("none"));
  await expect(effects.getByRole("textbox")).toHaveCount(0);
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

test("corner radius: each corner its own, and back to one for all corners", async ({ page }) => {
  await selectRow(page, "Card");
  const panel = design(page);
  const radius = panel.getByRole("textbox", { name: "Corner radius" });
  const independent = panel.getByRole("button", { name: "Independent corners" });
  await expect(independent).toHaveAttribute("aria-pressed", "false");
  await expect(panel.getByRole("textbox", { name: "Top left radius" })).toHaveCount(0);

  await independent.click();
  await expect(independent).toHaveAttribute("aria-pressed", "true");
  const corners = panel.getByRole("group", { name: "Radius per corner" });
  for (const name of ["Top left", "Top right", "Bottom right", "Bottom left"]) {
    await expect(corners.getByRole("textbox", { name: `${name} radius` })).toHaveValue("12");
  }

  for (const name of ["Bottom right", "Bottom left"]) {
    const corner = corners.getByRole("textbox", { name: `${name} radius` });
    await corner.fill("0");
    await corner.press("Enter");
  }
  // On every instance of the usage, and no other.
  expect(await cardStyles(page, "borderRadius")).toEqual(["12px 12px 0px 0px", "12px 12px 0px 0px", "12px 12px 0px 0px", "12px"]);
  await expect(radius).toHaveValue("Mixed");

  // Off again, the corners stay as they are until one radius is set for all.
  await independent.click();
  await expect(corners).toHaveCount(0);
  expect((await cardStyles(page, "borderRadius"))[0]).toBe("12px 12px 0px 0px");
  await radius.fill("8");
  await radius.press("Enter");
  expect((await cardStyles(page, "borderRadius"))[0]).toBe("8px");

  // A layer whose corners differ shows them each, from the start.
  await page.keyboard.press("ControlOrMeta+z");
  await selectRow(page, "Card", 3);
  await selectRow(page, "Card");
  await expect(panel.getByRole("button", { name: "Independent corners" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("textbox", { name: "Bottom left radius" })).toHaveValue("0");
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

test("a text layer offers no fill, corner radius or effects here", async ({ page }) => {
  await selectRow(page, "Freeze");

  await expect(design(page).getByRole("group", { name: "Fill" })).toHaveCount(0);
  await expect(design(page).getByRole("group", { name: "Effects" })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveCount(0);
});

test("the selection box steps aside while a value changes, so the change can be seen, and comes back after", async ({ page }) => {
  await selectRow(page, "Card");
  const box = page.locator(".vk-selection");
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
