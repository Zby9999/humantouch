import { canvasInPlace, expectSegmentedChanged, steadyBox, expect, test, type Locator, type Page } from "./fixtures";
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
  await canvasInPlace(page);
}

/** The toast at the bottom middle of the canvas, read out as it changes: not the one at its bottom left, which tells of the code changing (ticket 78). */
function toast(page: Page) {
  return page.getByRole("status").and(page.locator(".tk-toasts"));
}

async function selectRow(page: Page, name: string, nth = 0) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

/** The fill's color picker, opened from its swatch: its type at the top, and a gradient's stops. */
async function openFill(fill: Locator) {
  await fill.getByRole("button", { name: "Fill color picker" }).click();
  await expect(fill.getByRole("radiogroup", { name: "Fill type" })).toBeVisible();
}

/** An effect added from the menu of Effects' +. */
async function addEffect(effects: Locator, name: string) {
  await effects.getByRole("button", { name: "Add effect" }).click();
  await effects.page().getByRole("dialog", { name: "Add effect" }).getByRole("option", { name, exact: true }).click();
}

/** A gradient's stop handles on its bar, the color picker's own bars aside. */
const stopHandles = (fill: Locator) => fill.getByRole("slider", { name: /^Stop \d+ position$/ });

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
  await expect.poll(() => cardStyles(page, "backgroundColor")).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 255, 255)"]);
  await expect(hex).toHaveValue("FF0000");
});

test("the color picker paints the canvas while it moves, the drag one step to undo", async ({ page }) => {
  await selectRow(page, "Card", 3);
  await design(page).getByRole("button", { name: "Fill color picker" }).click();
  const picker = page.getByRole("dialog", { name: "Fill color" });
  const yourTurn = async () => (await cardStyles(page, "backgroundColor"))[3];

  // White: the top left of the square. Pressed at its top right, near the hue's own color, red; dragged down, darker.
  const area = await steadyBox(picker.getByRole("slider", { name: "Saturation and brightness" }));
  await page.mouse.move(area.x + area.width - 1, area.y + 1);
  await page.mouse.down();
  await expect.poll(yourTurn).toMatch(/^rgb\(25\d, [0-3], [0-3]\)$/);
  await page.mouse.move(area.x + area.width - 1, area.y + area.height / 2, { steps: 4 });
  await expect.poll(yourTurn).toMatch(/^rgb\(1[23]\d, [0-3], [0-3]\)$/);
  await page.mouse.up();
  // The other usage's cards stay white.
  await expect.poll(async () => (await cardStyles(page, "backgroundColor")).slice(0, 3)).toEqual(Array(3).fill("rgb(255, 255, 255)"));

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(yourTurn).toBe("rgb(255, 255, 255)");
});

test("the color picker's color typed as hex, RGB, HSL or OKLCH, the last on bars, kept in sRGB", async ({ page }) => {
  await selectRow(page, "Card", 3);
  await design(page).getByRole("button", { name: "Fill color picker" }).click();
  const picker = page.getByRole("dialog", { name: "Fill color" });
  const yourTurn = async () => (await cardStyles(page, "backgroundColor"))[3];
  const type = async (name: string, value: string) => {
    await picker.getByRole("textbox", { name, exact: true }).fill(value);
    await picker.getByRole("textbox", { name, exact: true }).press("Enter");
  };
  const format = async (name: string) => {
    await picker.getByRole("combobox", { name: "Color format" }).click();
    await picker.getByRole("listbox", { name: "Color format" }).getByRole("option", { name }).click();
  };

  await type("Hex", "2440c4");
  await expect.poll(yourTurn).toBe("rgb(36, 64, 196)");
  await format("RGB");
  await expect(picker.getByRole("textbox", { name: "Green" })).toHaveValue("64");
  await type("Green", "128");
  await expect.poll(yourTurn).toBe("rgb(36, 128, 196)");
  await format("HSL");
  await type("Lightness", "50");
  await expect.poll(yourTurn).toBe("rgb(40, 141, 215)");
  await type("Opacity", "50");
  await expect.poll(yourTurn).toBe("rgba(40, 141, 215, 0.5)");

  // OKLCH, a green with more chroma than sRGB has: the most it has at that lightness and hue.
  await format("OKLCH");
  await type("OKLCH lightness value", "70");
  await type("OKLCH hue value", "145");
  await type("OKLCH chroma value", "0.37");
  await expect.poll(yourTurn).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/);
  await expect(picker.getByRole("textbox", { name: "OKLCH chroma value" })).not.toHaveValue("0.37");
  await expect(picker.getByRole("textbox", { name: "OKLCH hue value" })).toHaveValue(/^14[45](\.\d)?$/);
  // The format chosen is the one the picker opens in again.
  await picker.press("Escape");
  await design(page).getByRole("button", { name: "Fill color picker" }).click();
  await expect(picker.getByRole("combobox", { name: "Color format" })).toHaveValue("oklch");
});

test("fill opacity, and removing and adding a fill", async ({ page }) => {
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  const opacity = fill.getByRole("textbox", { name: "Fill opacity" });
  await expect(opacity).toHaveValue("100%");

  await opacity.fill("50");
  await opacity.press("Enter");
  await expect.poll(async () => (await cardStyles(page, "backgroundColor"))[0]).toBe("rgba(255, 255, 255, 0.5)");

  await fill.getByRole("button", { name: "Remove fill" }).click();
  await expect.poll(async () => (await cardStyles(page, "backgroundColor"))[0]).toBe("rgba(0, 0, 0, 0)");
  await expect(fill.getByRole("textbox")).toHaveCount(0);

  await fill.getByRole("button", { name: "Add fill" }).click();
  await expect.poll(async () => (await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(255, 255, 255)");
});

test("a fill made a linear gradient: its angle and its stops, dragged, added, moved and taken off, paint the canvas at once", async ({ page }) => {
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  const gradient = async () => (await cardStyles(page, "backgroundImage"))[0];

  await openFill(fill);
  await fill.getByRole("radio", { name: "Linear" }).click();
  // The card's white, fading out, top to bottom; on every instance of the usage and no other.
  await expect.poll(() => cardStyles(page, "backgroundImage")).toEqual([
    ...Array(3).fill("linear-gradient(rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0) 100%)"),
    "none",
  ]);

  const angle = fill.getByRole("textbox", { name: "Angle" });
  await angle.fill("90");
  await angle.press("Enter");
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0) 100%)");

  const first = fill.getByRole("textbox", { name: "Stop 1 color", exact: true });
  await first.fill("ff0000");
  await first.press("Enter");
  await fill.getByRole("slider", { name: "Stop 2 position" }).press("Shift+ArrowLeft");
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 0%, rgba(255, 255, 255, 0) 90%)");

  // Dragged along the bar: the canvas follows the handle.
  const bar = fill.getByRole("group", { name: "Gradient stops" });
  const box = (await bar.boundingBox())!;
  const handle = (await fill.getByRole("slider", { name: "Stop 1 position" }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 4 });
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 10%, rgba(255, 255, 255, 0) 90%)");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 255, 255, 0) 90%)");
  await expect(fill.getByRole("textbox", { name: "Stop 1 at" })).toHaveValue("20%");
  // The whole drag is one step to undo.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 0%, rgba(255, 255, 255, 0) 90%)");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 255, 255, 0) 90%)");

  // A click on the bar adds a stop there, in the color the gradient has there.
  await bar.click({ position: { x: box.width * 0.55, y: box.height / 2 } });
  await expect(stopHandles(fill)).toHaveCount(3);
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 128, 128, 0.5) 55%, rgba(255, 255, 255, 0) 90%)");

  await fill.getByRole("slider", { name: "Stop 2 position" }).press("Delete");
  await fill.getByRole("button", { name: "Add stop" }).click();
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 128, 128, 0.5) 55%, rgba(255, 255, 255, 0) 90%)");
  await fill.getByRole("button", { name: "Remove stop 3" }).click();
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 20%, rgba(255, 128, 128, 0.5) 55%)");
  await expect(fill.getByRole("button", { name: "Remove stop 1" })).toBeDisabled();
});

test("while a gradient's stop is dragged, ⌘Z, ⇧⌘Z, Delete and the arrows do nothing: no stop comes or goes, and the one dragged is the one that moves; let go, ⌘Z takes the drag back", async ({ page }) => {
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  const gradient = async () => (await cardStyles(page, "backgroundImage"))[0];
  await openFill(fill);
  await fill.getByRole("radio", { name: "Linear" }).click();
  const color = fill.getByRole("textbox", { name: "Stop 1 color", exact: true });
  await color.fill("ff0000");
  await color.press("Enter");
  // On: the colors the focused field lists, which open over the rows above it low in the popover.
  await color.press("Tab");
  // Something to redo that adds a stop: one added and that undone.
  await fill.getByRole("button", { name: "Add stop" }).click();
  await expect(stopHandles(fill)).toHaveCount(3);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(stopHandles(fill)).toHaveCount(2);
  const at = (n: number) => `linear-gradient(rgb(255, 0, 0) ${n}%, rgba(255, 255, 255, 0) 100%)`;
  await expect.poll(() => gradient()).toBe(at(0));

  const bar = (await fill.getByRole("group", { name: "Gradient stops" }).boundingBox())!;
  const handle = (await fill.getByRole("slider", { name: "Stop 1 position" }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width * 0.1, bar.y + bar.height / 2, { steps: 4 });
  await expect.poll(() => gradient()).toBe(at(10));
  for (const key of ["ControlOrMeta+z", "ControlOrMeta+Shift+z", "Delete", "ArrowRight"]) {
    await page.keyboard.press(key);
    await expect(stopHandles(fill), key).toHaveCount(2);
    await expect.poll(() => gradient(), key).toBe(at(10));
  }
  await page.mouse.move(bar.x + bar.width * 0.2, bar.y + bar.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => gradient()).toBe(at(20));

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => gradient()).toBe(at(0));
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => gradient()).toBe("linear-gradient(rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0) 100%)");
});

test("a radial gradient keeps the stops, and a color again takes the first of them", async ({ page }) => {
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  await openFill(fill);
  const type = (name: string) => fill.getByRole("radio", { name }).click();

  await type("Radial");
  await expect.poll(async () => (await cardStyles(page, "backgroundImage"))[0]).toBe("radial-gradient(rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0) 100%)");

  await type("Solid");
  await expect.poll(async () => (await cardStyles(page, "backgroundImage"))[0]).toBe("none");
  await expect.poll(async () => (await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(255, 255, 255)");
});

test("a radial gradient's center and size: the page's own kept until changed, changed on the panel, its stops in px kept in px", async ({ page }) => {
  await canvas(page)
    .locator("article")
    // The three cards of one usage, inside their 1px border 200 × 100.
    .evaluateAll((cards) =>
      cards.slice(0, 3).forEach((card) => {
        Object.assign((card as HTMLElement).style, { width: "202px", height: "102px", boxSizing: "border-box" });
        (card as HTMLElement).style.backgroundImage = "radial-gradient(circle closest-side at 30% 20%, red 20px, blue)";
      }),
    );
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  const gradient = async () => (await cardStyles(page, "backgroundImage"))[0];
  const field = (name: string) => fill.getByRole("textbox", { name, exact: true });
  const type = async (name: string, value: string) => {
    await field(name).fill(value);
    await field(name).press("Enter");
  };

  // 30% across and 20% down, the circle reaches the top: 20px out.
  await openFill(fill);
  await expect(fill.getByRole("radio", { name: "Radial" })).toBeChecked();
  await expect(field("Center X")).toHaveValue("30%");
  await expect(field("Center Y")).toHaveValue("20%");
  await expect(field("Radius X")).toHaveValue("20");
  await expect(field("Radius Y")).toHaveValue("20");
  // The stop at 20px is at the end of the bar, as the canvas draws it.
  const first = fill.getByRole("slider", { name: "Stop 1 position" });
  await expect(first).toHaveAttribute("aria-valuetext", "20px");
  const bar = (await fill.getByRole("group", { name: "Gradient stops" }).boundingBox())!;
  const handle = (await first.boundingBox())!;
  expect(Math.round(((handle.x + handle.width / 2 - bar.x) / bar.width) * 100)).toBe(100);

  // A stop changed: the keyword, the center in % and the stop in px stay as the page has them.
  await type("Stop 1 color", "00ff00");
  await expect.poll(() => gradient()).toBe("radial-gradient(circle closest-side at 30% 20%, rgb(0, 255, 0) 20px, rgb(0, 0, 255) 100%)");

  await type("Center X", "50");
  await expect.poll(() => gradient()).toBe("radial-gradient(circle closest-side at 50% 20%, rgb(0, 255, 0) 20px, rgb(0, 0, 255) 100%)");

  // A size by keyword, changed: an ellipse in % of the layer, 60px of 200px across and 20px of 100px down.
  await type("Radius X", "60");
  await expect.poll(() => gradient()).toBe("radial-gradient(30% 20% at 50% 20%, rgb(0, 255, 0) 20px, rgb(0, 0, 255) 100%)");
  await expect(field("Radius X")).toHaveValue("60");

  // The same both ways: a circle, which CSS sizes in px.
  await type("Radius Y", "60");
  await expect.poll(() => gradient()).toBe("radial-gradient(60px at 50% 20%, rgb(0, 255, 0) 20px, rgb(0, 0, 255) 100%)");
  await expect(first).toHaveAttribute("aria-valuetext", "20px");

  // The stop in px moves 1px at a time; a new stop goes in %, in the widest gap: 20px of 60px is 33.33%.
  await first.press("ArrowRight");
  await expect.poll(() => gradient()).toBe("radial-gradient(60px at 50% 20%, rgb(0, 255, 0) 21px, rgb(0, 0, 255) 100%)");
  await fill.getByRole("button", { name: "Add stop" }).click();
  await expect(field("Stop 2 at")).toHaveValue("67.5%");
  await expect(field("Stop 1 at")).toHaveValue("21px");
});

test("a radial gradient centered with calc() keeps the page's own center and size: no fields for them, its stops changed, its type changed", async ({ page }) => {
  await canvas(page)
    .locator("article")
    // The three cards of one usage, inside their 1px border 200 × 100, centered 10px from the right and 20px from the bottom.
    .evaluateAll((cards) =>
      cards.slice(0, 3).forEach((card) => {
        Object.assign((card as HTMLElement).style, { width: "202px", height: "102px", boxSizing: "border-box" });
        (card as HTMLElement).style.backgroundImage = "radial-gradient(circle farthest-side at right 10px bottom 20px, red 38px, blue)";
      }),
    );
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  const gradient = async () => (await cardStyles(page, "backgroundImage"))[0];
  const kept = "radial-gradient(circle farthest-side at calc(100% - 10px) calc(100% - 20px)";
  const field = (name: string) => fill.getByRole("textbox", { name, exact: true });

  await openFill(fill);
  await expect(fill.getByRole("radio", { name: "Radial" })).toBeChecked();
  for (const name of ["Center X", "Center Y", "Radius X", "Radius Y"]) await expect(field(name)).toHaveCount(0);
  // The circle reaches the far left side, 190px out: the stop at 38px is a fifth of the way along the bar.
  const first = fill.getByRole("slider", { name: "Stop 1 position" });
  await expect(first).toHaveAttribute("aria-valuetext", "38px");
  const bar = (await fill.getByRole("group", { name: "Gradient stops" }).boundingBox())!;
  const handle = (await first.boundingBox())!;
  expect(Math.round(((handle.x + handle.width / 2 - bar.x) / bar.width) * 100)).toBe(20);

  await field("Stop 1 color").fill("00ff00");
  await field("Stop 1 color").press("Enter");
  await expect.poll(() => gradient()).toBe(`${kept}, rgb(0, 255, 0) 38px, rgb(0, 0, 255) 100%)`);
  await first.press("ArrowRight");
  await expect.poll(() => gradient()).toBe(`${kept}, rgb(0, 255, 0) 39px, rgb(0, 0, 255) 100%)`);
  // A new stop in the widest gap, from 39px of 190px to the end.
  await fill.getByRole("button", { name: "Add stop" }).click();
  await expect(field("Stop 2 at")).toHaveValue("60.26%");
  await fill.getByRole("button", { name: "Remove stop 2" }).click();
  await expect.poll(() => gradient()).toBe(`${kept}, rgb(0, 255, 0) 39px, rgb(0, 0, 255) 100%)`);

  // Another type, and back with undo: the page's own center and size again.
  await fill.getByRole("radio", { name: "Linear" }).click();
  await expect.poll(() => gradient()).toMatch(/^linear-gradient\(/);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => gradient()).toBe(`${kept}, rgb(0, 255, 0) 39px, rgb(0, 0, 255) 100%)`);
  await expect(fill.getByRole("radio", { name: "Radial" })).toBeChecked();
  await expect(field("Center X")).toHaveCount(0);
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

test("a stroke's parts are marked changed on their own: the sides on their choice, the color on its field, each reset alone", async ({ page }) => {
  await selectRow(page, "Card");
  const stroke = design(page).getByRole("group", { name: "Stroke", exact: true });
  await stroke.getByRole("combobox", { name: "Stroke sides" }).selectOption("Top");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("1px 0px 0px");

  // The sides changed, not the color (designer, 2026-11-07).
  await expect(stroke.getByRole("button", { name: "Reset stroke sides" })).toBeVisible();
  await expect(stroke.getByRole("button", { name: "Reset stroke", exact: true })).toHaveCount(0);
  await expect(stroke.getByRole("button", { name: "Reset stroke weight" })).toHaveCount(0);

  const color = stroke.getByRole("textbox", { name: "Stroke color", exact: true });
  await color.fill("FF0000");
  await color.press("Enter");
  await expect(stroke.getByRole("button", { name: "Reset stroke", exact: true })).toBeVisible();

  // The sides back to all, the color kept.
  await stroke.getByRole("button", { name: "Reset stroke sides" }).click();
  await expect(stroke.getByRole("combobox", { name: "Stroke sides" })).toHaveValue("all");
  await expect(stroke.getByRole("button", { name: "Reset stroke sides" })).toHaveCount(0);
  await expect(color).toHaveValue("FF0000");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("1px");

  await stroke.getByRole("button", { name: "Reset stroke", exact: true }).click();
  await expect(color).toHaveValue("E7E5E4");
  await expect(stroke.getByRole("button", { name: /^Reset / })).toHaveCount(0);
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
  await expect.poll(() => cardStyles(page, "borderWidth")).toEqual(["3px", "3px", "3px", "1px"]);

  await stroke.getByRole("combobox", { name: "Stroke style" }).selectOption("Dashed");
  await expect.poll(async () => (await cardStyles(page, "borderStyle"))[0]).toBe("dashed");

  const sides = stroke.getByRole("combobox", { name: "Stroke sides" });
  await sides.selectOption("Bottom");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("0px 0px 3px");

  await sides.selectOption("Custom");
  const left = stroke.getByRole("textbox", { name: "Stroke left" });
  await left.fill("5");
  await left.press("Enter");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("0px 0px 3px 5px");

  await sides.selectOption("All");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("5px");

  // A weight of 0 is still a stroke, as in Figma.
  await weight.fill("0");
  await weight.press("Enter");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("0px");
  await expect(weight).toHaveValue("0");
  await expect(stroke.getByRole("button", { name: "Add stroke" })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("5px");

  await stroke.getByRole("button", { name: "Remove stroke" }).click();
  await expect.poll(async () => (await cardStyles(page, "borderStyle"))[0]).toBe("none");
  await stroke.getByRole("button", { name: "Add stroke" }).click();
  await expect.poll(async () => [(await cardStyles(page, "borderWidth"))[0], (await cardStyles(page, "borderStyle"))[0], (await cardStyles(page, "borderColor"))[0]]).toEqual([
    "1px",
    "solid",
    "rgb(0, 0, 0)",
  ]);
});

test("a stroke at weight 0, typed or dragged, stays a stroke with its color and weight, and goes up again; only Remove stroke takes it off (designer, 2026-11-08)", async ({ page }) => {
  // A drag of 1px at a time, each a round trip to the browser (ticket 93).
  test.setTimeout(90_000);
  await selectRow(page, "Card");
  const stroke = design(page).getByRole("group", { name: "Stroke", exact: true });
  const color = stroke.getByRole("textbox", { name: "Stroke color", exact: true });
  const weight = stroke.getByRole("textbox", { name: "Stroke weight" });
  await expect(weight).toHaveValue("1");

  // Typed.
  await weight.fill("0");
  await weight.press("Enter");
  await expect.poll(async () => [(await cardStyles(page, "borderWidth"))[0], (await cardStyles(page, "borderStyle"))[0]]).toEqual(["0px", "solid"]);
  await expect(weight).toHaveValue("0");
  await expect(color).toHaveValue("E7E5E4");
  await expect(stroke.getByRole("combobox", { name: "Stroke style" })).toHaveValue("solid");
  await expect(stroke.getByRole("combobox", { name: "Stroke sides" })).toHaveValue("all");
  await expect(stroke.getByRole("button", { name: "Add stroke" })).toHaveCount(0);

  await weight.fill("2");
  await weight.press("Enter");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("2px");

  // Dragged on its icon, down past 0 and held there, then back up in another drag.
  const icon = page.locator('.tk-field:has([aria-label="Stroke weight"]) .tk-scrub');
  const { x, y } = await steadyBox(icon);
  const drag = async (dx: number) => {
    await page.mouse.move(x + 4, y + 4);
    await page.mouse.down();
    for (let i = 1; i <= Math.abs(dx); i++) await page.mouse.move(x + 4 + Math.sign(dx) * i * 2, y + 4);
    await page.mouse.up();
  };
  await drag(-5);
  await expect(weight).toHaveValue("0");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("0px");
  await expect(color).toHaveValue("E7E5E4");
  await drag(2);
  await expect(weight).toHaveValue("2");
  await expect.poll(async () => (await cardStyles(page, "borderWidth"))[0]).toBe("2px");

  await stroke.getByRole("button", { name: "Remove stroke" }).click();
  await expect.poll(async () => (await cardStyles(page, "borderStyle"))[0]).toBe("none");
  await expect(stroke.getByRole("button", { name: "Add stroke" })).toBeVisible();
  await expect(weight).toHaveCount(0);
});

test("a stroke weight goes in 0.5px steps, whatever the screen, and a toast says so when it is rounded; it shows as set though a 1x screen draws it narrower", async ({ page }) => {
  await page.clock.install();
  await selectRow(page, "Card");
  const stroke = design(page).getByRole("group", { name: "Stroke", exact: true });
  const weight = stroke.getByRole("textbox", { name: "Stroke weight" });

  await weight.fill("1.25");
  await weight.press("Enter");
  await expect(weight).toHaveValue("1");
  await expect(toast(page)).toHaveText("Stroke weights go in 0.5px steps: 1.25px is now 1px.");
  // Not in the Design panel any more.
  await expect(stroke.getByText("0.5px steps")).toHaveCount(0);
  await page.clock.runFor(5000);
  await expect(toast(page)).toHaveText("");

  // The screen of these tests is 1x: 1.5px is drawn 1px wide, and shows as 1.5. In 0.5px steps already, it says nothing.
  await weight.fill("1.5");
  await weight.press("Enter");
  await expect(weight).toHaveValue("1.5");
  await expect.poll(() => cardStyles(page, "borderWidth")).toEqual(["1px", "1px", "1px", "1px"]);
  await expect(toast(page)).toHaveText("");
  await selectRow(page, "Card", 3);
  await selectRow(page, "Card");
  await expect(weight).toHaveValue("1.5");

  await weight.fill("0.3");
  await weight.press("Enter");
  await expect(weight).toHaveValue("0.5");
  await expect(toast(page)).toHaveText("Stroke weights go in 0.5px steps: 0.3px is now 0.5px.");

  // Each side its own, each rounded.
  await stroke.getByRole("combobox", { name: "Stroke sides" }).selectOption("Custom");
  const left = stroke.getByRole("textbox", { name: "Stroke left" });
  await left.fill("1.75");
  await left.press("Enter");
  await expect(left).toHaveValue("1.5");
  await expect(toast(page)).toHaveText("Stroke weights go in 0.5px steps: 1.75px is now 1.5px.");
});

test("a toast rises at the bottom middle of the canvas and fades after about 3 seconds, but not while the pointer is on it; a new one takes its place", async ({ page }) => {
  await page.clock.install();
  await selectRow(page, "Card");
  const weight = design(page).getByRole("group", { name: "Stroke", exact: true }).getByRole("textbox", { name: "Stroke weight" });
  const message = toast(page).getByText("Stroke weights go in 0.5px steps", { exact: false });

  await weight.fill("1.25");
  await weight.press("Enter");
  await expect(message).toBeVisible();
  // Over the canvas, in the middle of it, near its bottom.
  const area = (await page.getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  const box = (await message.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (area.x + area.width / 2))).toBeLessThan(2);
  expect(area.y + area.height - (box.y + box.height)).toBeGreaterThan(0);
  expect(area.y + area.height - (box.y + box.height)).toBeLessThan(48);

  // A new one takes the old one's place, and its time starts afresh.
  await page.clock.runFor(2000);
  await weight.fill("0.3");
  await weight.press("Enter");
  await expect(message).toHaveCount(1);
  await expect(message).toHaveText("Stroke weights go in 0.5px steps: 0.3px is now 0.5px.");
  await page.clock.runFor(2000);
  await expect(message).toBeVisible();
  await page.clock.runFor(2000);
  await expect(message).toHaveCount(0);

  // The pointer on it holds it; off it, it goes about 3 seconds later.
  await weight.fill("1.25");
  await weight.press("Enter");
  await message.hover();
  await page.clock.runFor(6000);
  await expect(message).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.runFor(2000);
  await expect(message).toBeVisible();
  await page.clock.runFor(2000);
  await expect(message).toHaveCount(0);
});

test("a shadow made a blur stays in its place among the effects, and made a shadow again, comes back there (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const listed = () => effects.locator(".tk-effect").evaluateAll((all) => all.map((el) => el.getAttribute("aria-label")));
  const shadow = async () => (await cardStyles(page, "boxShadow"))[0];
  // shadow-sm: two drop shadows, the first 1px down and 3px blurred.
  await expect.poll(listed).toEqual(["Shadow 1", "Shadow 2"]);

  await effects.getByRole("combobox", { name: "Shadow 1 type" }).selectOption("Layer blur");
  await expect.poll(async () => (await cardStyles(page, "filter"))[0]).toBe("blur(3px)");
  // First still: where the shadow was, not after the one left.
  await expect.poll(listed).toEqual(["Layer blur", "Shadow 1"]);
  await expect(effects.getByRole("textbox", { name: "Shadow 1 spread", exact: true })).toHaveValue("-1");

  // A drop shadow again: first again, on the page too.
  await effects.getByRole("combobox", { name: "Layer blur type" }).selectOption("Drop shadow");
  await expect.poll(listed).toEqual(["Shadow 1", "Shadow 2"]);
  await expect(effects.getByRole("textbox", { name: "Shadow 1 blur", exact: true })).toHaveValue("3");
  await expect.poll(shadow).toMatch(/^rgba\(0, 0, 0, 0\.25\) 0px 4px 3px 0px, /);

  // Made a blur again and the shadow after it taken off: the blur is the one effect.
  await effects.getByRole("combobox", { name: "Shadow 1 type" }).selectOption("Layer blur");
  await expect.poll(listed).toEqual(["Layer blur", "Shadow 1"]);
  await effects.getByRole("button", { name: "Remove shadow 1" }).click();
  await expect.poll(listed).toEqual(["Layer blur"]);
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
  await addEffect(effects, "Drop shadow");
  await expect(field("Shadow 2 blur")).toHaveValue("4");
  await effects.getByRole("combobox", { name: "Shadow 2 type" }).selectOption("Inner shadow");
  await enter("Shadow 2 color", "ff0000");
  await expect.poll(() => shadow()).toBe("rgba(0, 0, 0, 0.1) 0px 8px 16px 0px, rgba(255, 0, 0, 0.25) 0px 4px 4px 0px inset");

  // A shadow made a layer blur blurs as much.
  await effects.getByRole("combobox", { name: "Shadow 1 type" }).selectOption("Layer blur");
  await expect.poll(() => cardStyles(page, "filter")).toEqual(["blur(16px)", "blur(16px)", "blur(16px)", "none"]);
  await expect.poll(() => shadow()).toBe("rgba(255, 0, 0, 0.25) 0px 4px 4px 0px inset");
  await enter("Layer blur", "2");
  await expect.poll(async () => (await cardStyles(page, "filter"))[0]).toBe("blur(2px)");

  // One layer blur and one background blur: the one there is is not offered again.
  await addEffect(effects, "Drop shadow");
  const type = effects.getByRole("combobox", { name: "Shadow 2 type" });
  await expect(type.getByRole("option", { name: "Layer blur" })).toBeDisabled();
  await type.selectOption("Background blur");
  await expect.poll(async () => (await cardStyles(page, "backdropFilter"))[0]).toBe("blur(4px)");

  await effects.getByRole("button", { name: "Remove layer blur" }).click();
  await effects.getByRole("button", { name: "Remove background blur" }).click();
  await expect.poll(async () => [(await cardStyles(page, "filter"))[0], (await cardStyles(page, "backdropFilter"))[0]]).toEqual(["none", "none"]);
  await expect(effects.getByRole("combobox", { name: "Layer blur type" })).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await cardStyles(page, "backdropFilter"))[0]).toBe("blur(4px)");
  await expect(field("Background blur")).toHaveValue("4");
});

test("a shadow dragged until it draws nothing is taken off, and the rest of the drag leaves the next shadow as it is", async ({ page }) => {
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const y = effects.getByRole("textbox", { name: "Shadow 1 Y", exact: true });
  await y.fill("0");
  await y.press("Enter"); // shadow-sm's first shadow, now 0 0 3px 0
  const icon = page.locator('.tk-field:has([aria-label="Shadow 1 blur"]) .tk-scrub');
  await icon.scrollIntoViewIfNeeded();
  const box = (await icon.boundingBox())!;
  const at = { x: box.x + 4, y: box.y + 4 };

  // Down to 0, and back up, in one drag.
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (const dx of [-2, -4, -6, -2, 2, 6]) await page.mouse.move(at.x + dx, at.y);
  await page.mouse.up();

  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).toBe("rgba(0, 0, 0, 0.1) 0px 1px 2px -1px");
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
  await addEffect(effects, "Drop shadow");
  await expect.poll(() => cardStyles(page, "boxShadow")).toEqual(Array(4).fill("rgba(0, 0, 0, 0.25) 0px 4px 4px 0px"));
  await expect(effects.getByRole("textbox", { name: "Shadow 1 Y", exact: true })).toHaveValue("4");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(effects.getByText("Mixed shadows")).toBeVisible();
  await effects.getByRole("button", { name: "Remove shadows" }).click();
  await expect.poll(() => cardStyles(page, "boxShadow")).toEqual(Array(4).fill("none"));
  await expect(effects.getByRole("textbox")).toHaveCount(0);
});

test("a uniform corner radius, typed or stepped with the arrow keys", async ({ page }) => {
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  await expect(radius).toHaveValue("12");

  await radius.fill("4");
  await radius.press("Enter");
  await expect.poll(() => cardStyles(page, "borderRadius")).toEqual(["4px", "4px", "4px", "12px"]);

  await radius.press("ArrowUp");
  await radius.press("Shift+ArrowUp");
  await expect.poll(async () => (await cardStyles(page, "borderRadius"))[0]).toBe("15px");
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
  await expect.poll(() => cardStyles(page, "borderRadius")).toEqual(["12px 12px 0px 0px", "12px 12px 0px 0px", "12px 12px 0px 0px", "12px"]);
  await expect(radius).toHaveValue("Mixed");

  // Off again, the corners stay as they are until one radius is set for all.
  await independent.click();
  await expect(corners).toHaveCount(0);
  await expect.poll(async () => (await cardStyles(page, "borderRadius"))[0]).toBe("12px 12px 0px 0px");
  await radius.fill("8");
  await radius.press("Enter");
  await expect.poll(async () => (await cardStyles(page, "borderRadius"))[0]).toBe("8px");

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

  await expect.poll(() => cardStyles(page, "borderRadius")).toEqual(["2px", "2px", "2px", "12px"]);
  await expect(radius).toHaveValue("12");
});

test("a locked layer offers no fill or corner radius", async ({ page }) => {
  await selectRow(page, "Badge");

  await expect(design(page).getByText(/can only be moved and resized as a whole/)).toBeVisible();
  await expect(design(page).getByRole("group", { name: "Fill" })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveCount(0);
});

test("a text layer's fill is its color, with no gradient and no taking it off, and it has no corner radius", async ({ page }) => {
  await selectRow(page, "Freeze");
  const fill = design(page).getByRole("group", { name: "Fill" });

  await expect(fill.getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("1C1917");
  await fill.getByRole("button", { name: "Fill color picker" }).click();
  await expect(page.getByRole("dialog", { name: "Fill color" })).toBeVisible();
  await expect(fill.getByRole("radiogroup", { name: "Fill type" })).toHaveCount(0);
  await expect(fill.getByRole("button", { name: "Remove fill" })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveCount(0);
});

/** The text-shadow of every card's title on the canvas, in page order. */
function titleShadows(page: Page) {
  return canvas(page)
    .locator("article h3")
    .evaluateAll((titles) => titles.map((title) => getComputedStyle(title).textShadow));
}

/** Sets a style on the canvas's cards, or their titles, as if the page had it: under any edit to it, which wins over the page's style. */
function styleOnCanvas(page: Page, selector: "article" | "article h3", style: Record<string, string>) {
  return canvas(page)
    .locator(selector)
    .evaluateAll((els, style) => els.forEach((el) => Object.assign((el as HTMLElement).style, style)), style);
}

test("a text layer's drop shadows: added, changed and taken off, on the canvas at once as text-shadow, with no spread and no other effect", async ({ page }) => {
  await selectRow(page, "Freeze");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const field = (name: string) => effects.getByRole("textbox", { name, exact: true });
  const enter = async (name: string, value: string) => {
    await field(name).fill(value);
    await field(name).press("Enter");
  };
  await expect(effects.getByRole("textbox")).toHaveCount(0);
  const cardShadow = (await cardStyles(page, "boxShadow"))[0];

  // As in Figma, a new effect is a drop shadow.
  await addEffect(effects, "Drop shadow");
  await expect(field("Shadow 1 Y")).toHaveValue("4");
  await expect(field("Shadow 1 blur")).toHaveValue("4");
  await expect(field("Shadow 1 opacity")).toHaveValue("25%");
  await expect(field("Shadow 1 spread")).toHaveCount(0);
  // Text draws drop shadows only.
  const type = effects.getByRole("combobox", { name: "Shadow 1 type" });
  await expect(type.getByRole("option")).toHaveText(["Drop shadow"]);
  // On every instance of the usage, and no other; the card keeps its own shadow.
  await expect.poll(() => titleShadows(page)).toEqual([...Array(3).fill("rgba(0, 0, 0, 0.25) 0px 4px 4px"), "none"]);
  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).toBe(cardShadow);

  // A second one, below the first, each changed on its own.
  await addEffect(effects, "Drop shadow");
  await enter("Shadow 2 X", "2");
  await enter("Shadow 2 blur", "0");
  await enter("Shadow 2 color", "ff0000");
  await enter("Shadow 1 Y", "8");
  await expect.poll(async () => (await titleShadows(page))[0]).toBe("rgba(0, 0, 0, 0.25) 0px 8px 4px, rgba(255, 0, 0, 0.25) 2px 4px 0px");

  await effects.getByRole("button", { name: "Remove shadow 1" }).click();
  await expect.poll(async () => (await titleShadows(page))[0]).toBe("rgba(255, 0, 0, 0.25) 2px 4px 0px");
  await effects.getByRole("button", { name: "Remove shadow 1" }).click();
  await expect.poll(async () => (await titleShadows(page))[0]).toBe("none");
  await expect(effects.getByRole("textbox")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(field("Shadow 1 X")).toHaveValue("2");
  await expect.poll(async () => (await titleShadows(page))[0]).toBe("rgba(255, 0, 0, 0.25) 2px 4px 0px");
});

test("a text layer's text-shadow on the page reads as its drop shadows", async ({ page }) => {
  await styleOnCanvas(page, "article h3", { textShadow: "0 1px 2px rgb(0 0 0 / 0.5), 3px 3px #00f" });
  await selectRow(page, "Freeze");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const field = (name: string) => effects.getByRole("textbox", { name, exact: true });

  await expect(effects.getByRole("combobox", { name: "Shadow 1 type" })).toHaveValue("drop");
  await expect(field("Shadow 1 Y")).toHaveValue("1");
  await expect(field("Shadow 1 blur")).toHaveValue("2");
  await expect(field("Shadow 1 opacity")).toHaveValue("50%");
  await expect(field("Shadow 2 X")).toHaveValue("3");
  await expect(field("Shadow 2 color")).toHaveValue("0000FF");
});

test("text and other layers selected together take drop shadows each its own way: text-shadow and box-shadow", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Layers" });
  const selectBoth = async () => {
    await selectRow(page, "Card");
    await tree.getByRole("treeitem", { name: "Freeze", exact: true }).click({ modifiers: ["Shift"] });
  };
  const effects = design(page).getByRole("group", { name: "Effects" });
  const field = (name: string) => effects.getByRole("textbox", { name, exact: true });

  // The card's shadow-sm, and none on the text.
  await selectBoth();
  await expect(effects.getByText("Mixed shadows")).toBeVisible();
  // As in Figma, a new effect replaces the mixed ones, on each layer as it draws shadows.
  await addEffect(effects, "Drop shadow");
  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).toBe("rgba(0, 0, 0, 0.25) 0px 4px 4px 0px");
  await expect.poll(async () => (await titleShadows(page))[0]).toBe("rgba(0, 0, 0, 0.25) 0px 4px 4px");
  // No spread, and drop shadows only, as text has them.
  await expect(field("Shadow 1 spread")).toHaveCount(0);
  await expect(effects.getByRole("combobox", { name: "Shadow 1 type" }).getByRole("option")).toHaveText(["Drop shadow"]);

  // A card's spread is its own: the text shows the same shadow, and a change leaves the spread as it is.
  // The shadows added are taken back first, and the page given them, so the page's own show.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await titleShadows(page))[0]).toBe("none");
  await styleOnCanvas(page, "article h3", { textShadow: "0 4px 4px rgb(0 0 0 / 0.25)" });
  await styleOnCanvas(page, "article", { boxShadow: "0 4px 4px 2px rgb(0 0 0 / 0.25)" });
  await selectBoth();
  await expect(field("Shadow 1 Y")).toHaveValue("4");
  await field("Shadow 1 Y").fill("8");
  await field("Shadow 1 Y").press("Enter");
  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).toBe("rgba(0, 0, 0, 0.25) 0px 8px 4px 2px");
  await expect.poll(async () => (await titleShadows(page))[0]).toBe("rgba(0, 0, 0, 0.25) 0px 8px 4px");

  // An inner shadow, or a blur, that text cannot have shows as Mixed.
  await field("Shadow 1 Y").blur();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await titleShadows(page))[0]).toBe("rgba(0, 0, 0, 0.25) 0px 4px 4px");
  await styleOnCanvas(page, "article", { boxShadow: "inset 0 8px 4px rgb(0 0 0 / 0.25)", filter: "blur(2px)" });
  await selectBoth();
  await expect(effects.getByText("Mixed shadows")).toBeVisible();
  await expect(field("Layer blur")).toHaveValue("Mixed");
  await effects.getByRole("button", { name: "Remove layer blur" }).click();
  await expect.poll(async () => (await cardStyles(page, "filter"))[0]).toBe("none");
  await effects.getByRole("button", { name: "Remove shadows" }).click();
  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).toBe("none");
  await expect.poll(async () => (await titleShadows(page))[0]).toBe("none");
});

test("the selection box steps aside while a value changes, so the change can be seen, and comes back after", async ({ page }) => {
  await selectRow(page, "Card");
  const box = page.locator('.tk-selection[data-view="Desktop"]');
  await expect(box).toBeVisible();
  // It is gone only briefly, so watch for it rather than poll.
  await box.evaluate((el: HTMLElement & { stepsAside?: boolean }) => {
    new MutationObserver(() => {
      if (getComputedStyle(el).opacity === "0") el.stepsAside = true;
    }).observe(el, { attributes: true });
  });

  await design(page).getByRole("textbox", { name: "Corner radius" }).press("ArrowUp");

  await expect(box).toHaveCSS("opacity", "1");
  await expect.poll(() => box.evaluate((el: HTMLElement & { stepsAside?: boolean }) => el.stepsAside)).toBe(true);
});

test("dragging left and right on a number's icon changes it, 1 per 2px and 10 with Shift (designer, 2026-11-08)", async ({ page }) => {
  // 57 pointer moves, one px at a time, each a round trip to the browser: on a busy machine, more than the 30 seconds a test has (ticket 93).
  test.setTimeout(90_000);
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  const icon = page.locator('.tk-field:has([aria-label="Corner radius"]) .tk-scrub');
  const { x, y } = await steadyBox(icon);
  const drag = async (dx: number) => {
    await page.mouse.move(x + 4, y + 4);
    await page.mouse.down();
    for (let i = 1; i <= Math.abs(dx); i++) await page.mouse.move(x + 4 + Math.sign(dx) * i * 2, y + 4);
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
  await expect.poll(() => cardStyles(page, "borderRadius")).toEqual(["0px", "0px", "0px", "12px"]);
});

test("a number dragged is marked changed once let go, not while held; typed, at once (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  const field = page.locator('.tk-field:has([aria-label="Corner radius"])');
  const reset = design(page).getByRole("button", { name: "Reset corner radius" });
  const { x, y } = await steadyBox(field.locator(".tk-scrub"));
  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x + 4 + i * 2, y + 4);
  // Held: the value shows as it goes, the field gray, with no reset.
  await expect(radius).toHaveValue("17");
  await expect(field).not.toHaveClass(/\bis-changed\b/);
  await expect(reset).toHaveCount(0);
  await page.mouse.up();
  await expect(field).toHaveClass(/\bis-changed\b/);
  await expect(reset).toBeVisible();
  // Its reset on the field's own blue; pointed at, the lighter blue 400 (designer, 2026-11-08).
  await expect(field).toHaveCSS("background-color", "rgb(0, 143, 240)");
  await expect(reset).toHaveCSS("background-color", "rgb(0, 143, 240)");
  await reset.hover();
  await expect(reset).toHaveCSS("background-color", "rgb(63, 165, 254)");

  // Taken back, then typed: the accent at once, with no easing.
  await reset.click();
  await expect(field).not.toHaveClass(/\bis-changed\b/);
  await expect(design(page)).not.toHaveClass(/\bis-settling\b/);
  await radius.fill("20");
  await radius.press("Enter");
  await expect(field).toHaveClass(/\bis-changed\b/);
  expect(await field.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
});

/** A color the panel's CSS gives a custom property, as computed: "rgb(…)". */
function panelColor(page: Page, property: string) {
  return design(page).evaluate((el, property) => {
    const probe = el.appendChild(document.createElement("i"));
    probe.style.color = `var(${property})`;
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, property);
}

/** A field's edge, the first of its shadows (the others, its shadow and hairline, as they always are), and its ground. */
function fieldLook(field: Locator) {
  return field.evaluate((el) => ({ edge: getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/)[0].trim(), ground: getComputedStyle(el).backgroundColor }));
}

test("a field focused, and a number held mid-drag, have the 1px blue 600 edge; let go, the drag's edge is gone (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const accent = await panelColor(page, "--tk-accent-strong");
  const darker = await panelColor(page, "--tk-input-hover");
  const EDGE = `${accent} 0px 0px 0px 1px inset`;

  // Focused: the 1px blue 600 edge, drawn inward (Figma: 03 Kind, 109:1169).
  const width = design(page).getByRole("textbox", { name: "Width" });
  const widthField = page.locator('.tk-field:has([aria-label="Width"])');
  await width.focus();
  await expect.poll(async () => (await fieldLook(widthField)).edge).toBe(EDGE);
  await width.blur();
  await expect.poll(async () => (await fieldLook(widthField)).edge).not.toContain(accent);

  // Held mid-drag on its icon: the same edge, on the hover's ground.
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  const field = page.locator('.tk-field:has([aria-label="Corner radius"])');
  const { x, y } = await steadyBox(field.locator(".tk-scrub"));
  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 3; i++) await page.mouse.move(x + 4 + i * 2, y + 4);
  await expect(radius).toHaveValue("15");
  await expect.poll(() => fieldLook(field)).toEqual({ edge: EDGE, ground: darker });
  await expect(radius).not.toBeFocused();

  // Let go, the field takes the accent, with no edge of its own: it is not focused.
  await page.mouse.up();
  await expect(field).toHaveClass(/\bis-changed\b/);
  await expect(field).not.toHaveAttribute("data-scrubbing");
  await expect.poll(async () => (await fieldLook(field)).edge).toBe("rgba(0, 0, 0, 0) 0px 0px 0px 1px inset");
});

test("dragging left and right on the bar at the end of a color's opacity changes it, 1% per 2px (designer, 2026-11-08)", async ({ page }) => {
  test.setTimeout(90_000);
  await selectRow(page, "Card");
  const fill = design(page).getByRole("textbox", { name: "Fill color", exact: true });
  await fill.fill("ff0000");
  await fill.press("Enter");
  const opacity = design(page).getByRole("textbox", { name: "Fill opacity" });
  await expect(opacity).toHaveValue("100%");
  const grip = page.locator('.tk-color-opacity:has([aria-label="Fill opacity"]) .tk-scrub-grip');
  const { x, y } = await steadyBox(grip);
  await page.mouse.move(x + 6, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + 6 - i * 2, y + 4);
  // Held, its field has the 1px edge, as a number's does (designer, 2026-11-08): changed already by the fill typed, on the accent, the stronger accent, as it has focused.
  const field = page.locator('.tk-field:has([aria-label="Fill opacity"])');
  await expect(field).toHaveClass(/\bis-changed\b/);
  await expect(field).toHaveAttribute("data-scrubbing", "");
  await expect.poll(async () => (await fieldLook(field)).edge).toBe(`${await panelColor(page, "--tk-accent-strong")} 0px 0px 0px 1px inset`);
  await page.mouse.up();
  await expect(field).not.toHaveAttribute("data-scrubbing");
  await expect(opacity).toHaveValue("90%");
});

/** How far across a grip's sway has it, in px, from its computed transform. */
function gripShift(grip: Locator) {
  return grip.evaluate((el: HTMLElement) => new DOMMatrix(getComputedStyle(el).transform === "none" ? undefined : getComputedStyle(el).transform).e);
}

/** Pressed on a field's grip and moved right `steps` times, 2px at a time; left held. */
async function holdGrip(page: Page, field: Locator, steps: number) {
  const { x, y, width, height } = await steadyBox(field.locator(".tk-scrub-grip"));
  const at = { x: x + width / 2, y: y + height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(at.x + i * 2, at.y);
  return at;
}

test("a field pointed at tells its name in the editor's dark tip, above it, after a rest; nothing has the browser's gray one (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  // No title but the views' frames', which name them and show no tip.
  expect(await page.locator("third-kind").evaluate((host) => [...host.shadowRoot!.querySelectorAll("[title]")].filter((el) => el.localName !== "iframe").length)).toBe(0);
  const field = page.locator('.tk-field:has([aria-label="Corner radius"])');
  const tip = page.getByRole("tooltip");
  await field.hover();
  await expect(tip).toHaveText("Corner radius");
  const tipBox = await steadyBox(tip);
  const fieldBox = await steadyBox(field);
  expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(fieldBox.y);
  expect(Math.abs(tipBox.x + tipBox.width / 2 - (fieldBox.x + fieldBox.width / 2))).toBeLessThanOrEqual(1);
  expect(await tip.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(23, 23, 22)");
  await expect(field).toHaveAttribute("aria-describedby", "tk-tip");
  // Warm, another shows at once.
  await page.locator('.tk-field:has([aria-label="Opacity"])').first().hover();
  await expect(tip).toHaveText("Opacity");
  await expect(field).not.toHaveAttribute("aria-describedby");
  // A press hides it, till the pointer leaves.
  await page.mouse.down();
  await expect(tip).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(700);
  await expect(tip).toHaveCount(0);
});

test("every number that can be dragged has a grip at its right end, after its value, left of its reset once changed (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  for (const label of ["Width", "Height", "Gap", "Corner radius", "Opacity"]) {
    const field = page.locator(`.tk-field:has([aria-label="${label}"])`);
    await expect(field.locator(".tk-scrub-grip > .tk-grip"), label).toBeVisible();
    const input = await steadyBox(field.getByRole("textbox", { name: label, exact: true }));
    const grip = await steadyBox(field.locator(".tk-scrub-grip"));
    expect(grip.x, label).toBeGreaterThanOrEqual(input.x + input.width - 1);
  }

  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  await radius.fill("20");
  await radius.press("Enter");
  const field = page.locator('.tk-field:has([aria-label="Corner radius"])');
  const reset = design(page).getByRole("button", { name: "Reset corner radius" });
  await expect(reset).toBeVisible();
  const grip = await steadyBox(field.locator(".tk-scrub-grip"));
  const resetBox = await steadyBox(reset);
  expect(grip.x + grip.width).toBeLessThanOrEqual(resetBox.x);
  // The value keeps its room: what it shows is not cut off.
  expect(await radius.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("dragged on its grip, a number changes 1 per 2px: 20px, 10 (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  await expect(radius).toHaveValue("12");
  await holdGrip(page, page.locator('.tk-field:has([aria-label="Corner radius"])'), 10);
  await page.mouse.up();
  await expect(radius).toHaveValue("22");
  await expect.poll(() => cardStyles(page, "borderRadius")).toEqual(["22px", "22px", "22px", "12px"]);
});

test("held, a number has no scale under its grip, and its grip stays where it is: only its sway moves it (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const field = page.locator('.tk-field:has([aria-label="Corner radius"])');
  const grip = field.locator(".tk-grip");
  const before = await steadyBox(grip);
  await holdGrip(page, field, 3);
  await expect(field).toHaveAttribute("data-scrubbing");
  await expect(field.locator(".tk-ruler")).toHaveCount(0);
  expect((await steadyBox(grip)).y).toBe(before.y);
  await page.mouse.up();
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("dragged, a number's whole grip sways across with the drag, 3px at most, upright, and settles back once let go (designer, 2026-11-08)", async ({ page }) => {
    await selectRow(page, "Card");
    const field = page.locator('.tk-field:has([aria-label="Corner radius"])');
    const grip = field.locator(".tk-grip");
    // The sway eases away as soon as the pointer stops: watch for it rather than poll.
    await grip.evaluate((el: HTMLElement & { most?: number; least?: number; leaned?: boolean }) => {
      el.most = 0;
      el.least = 0;
      new MutationObserver(() => {
        const t = getComputedStyle(el).transform;
        const m = new DOMMatrix(t === "none" ? undefined : t);
        el.most = Math.max(el.most!, m.e);
        el.least = Math.min(el.least!, m.e);
        // Only across: never turned.
        if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) el.leaned = true;
      }).observe(el, { attributes: true, attributeFilter: ["style"] });
    });
    const at = await holdGrip(page, field, 15);
    await expect.poll(() => grip.evaluate((el: HTMLElement & { most?: number }) => el.most)).toBeGreaterThan(0.2);
    for (let i = 1; i <= 15; i++) await page.mouse.move(at.x + 30 - i * 2, at.y);
    await expect.poll(() => grip.evaluate((el: HTMLElement & { least?: number }) => el.least)).toBeLessThan(-0.2);
    const { most, least } = await grip.evaluate((el: HTMLElement & { most?: number; least?: number }) => ({ most: el.most!, least: el.least! }));
    expect(most).toBeLessThanOrEqual(3);
    expect(least).toBeGreaterThanOrEqual(-3);
    expect(await grip.evaluate((el: HTMLElement & { leaned?: boolean }) => el.leaned ?? false)).toBe(false);
    await page.mouse.up();
    await expect.poll(() => gripShift(grip)).toBe(0);
    await expect.poll(() => grip.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  });
});

test("with reduced motion, a number's grip does not sway as it is dragged", async ({ page }) => {
  await selectRow(page, "Card");
  const field = page.locator('.tk-field:has([aria-label="Corner radius"])');
  const grip = field.locator(".tk-grip");
  await grip.evaluate((el: HTMLElement & { tilted?: boolean }) => {
    new MutationObserver(() => {
      if (el.style.transform) el.tilted = true;
    }).observe(el, { attributes: true, attributeFilter: ["style"] });
  });
  await holdGrip(page, field, 15);
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveValue("27");
  expect(await grip.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  await page.mouse.up();
  expect(await grip.evaluate((el: HTMLElement & { tilted?: boolean }) => el.tilted ?? false)).toBe(false);
});

/** A number's rolling digits, as shown: the text of those not rolling out, and whether each runs an animation now. */
function rolled(field: Locator) {
  return field.evaluate((el) => {
    const roll = el.querySelector(":scope > .tk-roll");
    if (!roll) return null;
    const glyphs = [...roll.querySelectorAll<HTMLElement>(".tk-roll-glyph:not(.is-leaving)")];
    return {
      hidden: roll.getAttribute("aria-hidden"),
      text: glyphs.map((glyph) => glyph.textContent).join(""),
      running: glyphs.map((glyph) => glyph.getAnimations().some((anim) => anim.playState === "running")),
      // Of every digit, in or out: what its animations move.
      moves: [...new Set([...roll.querySelectorAll(".tk-roll-glyph")].flatMap((glyph) => glyph.getAnimations().flatMap((anim) => (anim.effect as KeyframeEffect).getKeyframes().flatMap((frame) => Object.keys(frame)))))].filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key)).sort(),
    };
  });
}

/** Whether the field's input shows its own text: clear while its digits roll over it. */
function inputClear(field: Locator) {
  return field.locator(".tk-input").evaluate((el) => getComputedStyle(el).webkitTextFillColor === "rgba(0, 0, 0, 0)");
}

/** From now on, notes whether the field ever shows rolling digits. */
async function watchRolls(field: Locator) {
  await field.evaluate((el: HTMLElement & { rolled?: boolean }) => {
    el.rolled = false;
    new MutationObserver(() => {
      if (el.querySelector(".tk-roll, .tk-roll-glyph")) el.rolled = true;
    }).observe(el, { childList: true, subtree: true });
  });
}

test.describe("a number's digits rolling (designer, 2026-11-08)", () => {
  test.use({ reducedMotion: "no-preference" });

  test("scrubbed, a number's digits roll over its text, hidden from screen readers, the changed digit alone moving; let go, its own text is back", async ({ page }) => {
    await selectRow(page, "Card");
    // Slowed tenfold, so a digit's roll is still under way when it is looked at.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });
    const width = design(page).getByRole("textbox", { name: "Width" });
    const field = page.locator('.tk-field:has([aria-label="Width"])');
    const start = Number(await width.inputValue());
    expect(await rolled(field)).toBeNull();
    const at = await holdGrip(page, field, 1);
    await expect(width).toHaveValue(String(start + 1));
    await expect.poll(async () => (await rolled(field))?.text).toBe(await width.inputValue());
    const shown = (await rolled(field))!;
    expect(shown.hidden).toBe("true");
    expect(shown.moves).toEqual(["filter", "opacity", "transform"]);
    // One step up: the last digit rolls, the first stays still (unless every digit is a 9).
    expect(shown.running.at(-1)).toBe(true);
    if (!/^9+$/.test(String(start))) expect(shown.running[0]).toBe(false);
    expect(await inputClear(field)).toBe(true);
    // The value read out is the input's own.
    await expect(width).toHaveValue(String(start + 1));

    // Down again: the overlay stays while held, its text the input's.
    for (let i = 1; i <= 3; i++) await page.mouse.move(at.x + 2 - i * 2, at.y);
    await expect(width).toHaveValue(String(start - 2));
    await expect.poll(async () => (await rolled(field))?.text).toBe(String(start - 2));
    await page.mouse.up();
    await expect.poll(() => rolled(field)).toBeNull();
    expect(await inputClear(field)).toBe(false);

    // Its reset clicked: the number rolls back.
    await design(page).getByRole("button", { name: "Reset width" }).click();
    await expect(width).toHaveValue(String(start));
    await expect.poll(async () => (await rolled(field))?.text).toBe(String(start));
    await expect.poll(() => rolled(field), { timeout: 10_000 }).toBeNull();
  });

  test("typed, or stepped with the arrow keys, a number changes at once: no digits roll", async ({ page }) => {
    await selectRow(page, "Card");
    const width = design(page).getByRole("textbox", { name: "Width" });
    const field = page.locator('.tk-field:has([aria-label="Width"])');
    await watchRolls(field);
    await width.fill("250");
    await width.press("Enter");
    await expect(width).toHaveValue("250");
    await width.press("ArrowUp");
    await expect(width).toHaveValue("251");
    await width.blur();
    // Undone from the keyboard, too.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(width).toHaveValue("250");
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    expect(await field.evaluate((el: HTMLElement & { rolled?: boolean }) => el.rolled)).toBe(false);
    expect(await inputClear(field)).toBe(false);
  });

  test("focused mid-roll, the field shows its own text at once", async ({ page }) => {
    await selectRow(page, "Card");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 });
    const width = design(page).getByRole("textbox", { name: "Width" });
    const field = page.locator('.tk-field:has([aria-label="Width"])');
    await holdGrip(page, field, 3);
    await page.mouse.up();
    await expect.poll(() => rolled(field)).not.toBeNull();
    await width.focus();
    await expect.poll(() => rolled(field)).toBeNull();
    expect(await inputClear(field)).toBe(false);
  });
});

test("with reduced motion, a number's digits only fade as it is scrubbed: no move, no blur", async ({ page }) => {
  await selectRow(page, "Card");
  const width = design(page).getByRole("textbox", { name: "Width" });
  const field = page.locator('.tk-field:has([aria-label="Width"])');
  await holdGrip(page, field, 4);
  await expect.poll(async () => (await rolled(field))?.text).toBe(await width.inputValue());
  expect((await rolled(field))!.moves).toEqual(["opacity"]);
  await page.mouse.up();
  await expect.poll(() => rolled(field)).toBeNull();
});

test("reset, then dragged twice, a number stays gray while held and takes the accent once let go; dragged again back past where it started, it stays marked till let go (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  const field = page.locator('.tk-field:has([aria-label="Corner radius"])');
  const reset = design(page).getByRole("button", { name: "Reset corner radius" });
  const start = Number(await radius.inputValue());
  await holdGrip(page, field, 4);
  await page.mouse.up();
  await expect(field).toHaveClass(/\bis-changed\b/);
  await reset.click();
  await expect(field).not.toHaveClass(/\bis-changed\b/);
  await expect(radius).toHaveValue(String(start));

  // The first drag: gray while held, the accent once let go.
  await holdGrip(page, field, 3);
  await expect(radius).toHaveValue(String(start + 3));
  await expect(field).not.toHaveClass(/\bis-changed\b/);
  await expect(reset).toHaveCount(0);
  await page.mouse.up();
  await expect(field).toHaveClass(/\bis-changed\b/);

  // The second, left, past where the round began: marked all the while it is held, with its reset, never easing to gray midway.
  await field.evaluate((el: HTMLElement & { held?: string[] }) => {
    el.held = [];
    const look = () => {
      if (el.hasAttribute("data-scrubbing")) el.held!.push(`${el.classList.contains("is-changed")} ${!!el.querySelector(".tk-reset")}`);
      if (el.isConnected) requestAnimationFrame(look);
    };
    look();
  });
  const at = await holdGrip(page, field, 0);
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(at.x - i * 2, at.y);
    if (i === 3) {
      // Back where it started: the round has no change to it for now, but it stays as it was when pressed.
      await expect(radius).toHaveValue(String(start));
      await expect(field).toHaveClass(/\bis-changed\b/);
      await expect(reset).toBeVisible();
    }
  }
  await expect(radius).toHaveValue(String(start - 3));
  await page.mouse.up();
  await expect(field).toHaveClass(/\bis-changed\b/);
  const held = await field.evaluate((el: HTMLElement & { held?: string[] }) => [...new Set(el.held)]);
  expect(held).toEqual(["true true"]);
});

const INTRO = "A Framer-style editor layer for any page.";

/** A computed style of the intro paragraph on the canvas, and of the bold run in it. */
function introStyle(page: Page, property: keyof CSSStyleDeclaration & string, selector = "[data-testid=hero] p") {
  return canvas(page)
    .locator(selector)
    .evaluate((el, property) => getComputedStyle(el).getPropertyValue(property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)), property);
}

test("a text layer's font, weight and size, line height and letter spacing, alignment, case, decoration and color change the canvas at once", async ({ page }) => {
  await selectRow(page, INTRO);
  const text = design(page).getByRole("group", { name: "Text" });
  const field = (name: string) => text.getByRole("textbox", { name, exact: true });
  const enter = async (name: string, value: string) => {
    await field(name).fill(value);
    await field(name).press("Enter");
  };
  const font = text.getByRole("combobox", { name: "Font", exact: true });
  const weight = text.getByRole("combobox", { name: "Font weight" });

  // The fonts the page has loaded, or uses from the system: Georgia for its body, Space Grotesk for its title, in bold only.
  await expect(font).toHaveValue("Georgia");
  await expect(font.getByRole("option")).toHaveText(["Georgia", "Space Grotesk"]);
  await expect(weight).toHaveValue("400");
  await font.selectOption("Space Grotesk");
  await expect.poll(() => introStyle(page, "fontFamily")).toBe('"Space Grotesk", sans-serif');
  // The weight kept, though the font has only bold loaded: the browser draws what it has (designer, 2026-11-08). Not marked changed.
  await expect.poll(() => introStyle(page, "fontWeight")).toBe("400");
  await expect(weight).toHaveValue("400");
  await expect(weight.getByRole("option")).toHaveText(["Regular", "Bold"]);
  await expect(text.locator(".tk-select-field:has([aria-label='Font weight'])")).not.toHaveClass(/\bis-changed\b/);
  // One undo takes the font back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => introStyle(page, "fontFamily")).toContain("Georgia");
  await expect(font).toHaveValue("Georgia");
  await expect(weight).toHaveValue("400");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(font).toHaveValue("Space Grotesk");

  // The body's line height of 1.8 and letter spacing of 0.02em: shares of the font size.
  await expect(field("Line height")).toHaveValue("180%");
  await expect(field("Letter spacing")).toHaveValue("2%");

  await enter("Font size", "20");
  await expect.poll(() => introStyle(page, "fontSize")).toBe("20px");
  // The line height grows with it; the spacing, set in em on the body, is what it came to there.
  await expect(field("Line height")).toHaveValue("180%");
  await expect(field("Letter spacing")).toHaveValue("1.6%");
  await enter("Line height", "30px");
  await expect.poll(() => introStyle(page, "lineHeight")).toBe("30px");
  await expect(field("Line height")).toHaveValue("30px");
  await enter("Line height", "auto");
  await expect.poll(() => introStyle(page, "lineHeight")).toBe("normal");
  await enter("Letter spacing", "5");
  await expect.poll(() => introStyle(page, "letterSpacing")).toBe("1px");

  await text.getByRole("radio", { name: "Align center" }).click();
  await expect.poll(() => introStyle(page, "textAlign")).toBe("center");
  await text.getByRole("radio", { name: "Upper case" }).click();
  await expect.poll(() => introStyle(page, "textTransform")).toBe("uppercase");
  await text.getByRole("radio", { name: "Strikethrough" }).click();
  await expect.poll(() => introStyle(page, "textDecorationLine")).toBe("line-through");
  await expect(text.getByRole("radio", { name: "Strikethrough" })).toHaveAttribute("aria-checked", "true");

  // Its color in Fill, as in Figma; the bold run in it follows.
  const color = design(page).getByRole("group", { name: "Fill" }).getByRole("textbox", { name: "Fill color", exact: true });
  await expect(color).toHaveValue("57534D");
  await color.fill("ff0000");
  await color.press("Enter");
  await expect.poll(() => introStyle(page, "color")).toBe("rgb(255, 0, 0)");
  await expect.poll(() => introStyle(page, "color", "[data-testid=hero] p strong")).toBe("rgb(255, 0, 0)");

  await page.keyboard.press("ControlOrMeta+z");
  // Back to the page's own: Tailwind's stone-600.
  await expect.poll(() => introStyle(page, "color")).toBe("oklch(0.444 0.011 73.639)");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => introStyle(page, "textDecorationLine")).toBe("none");
});

test("text layers selected together show what they share, Mixed otherwise, and take a change together", async ({ page }) => {
  await selectRow(page, "Freeze");
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: INTRO, exact: true }).click({ modifiers: ["Shift"] });
  const text = design(page).getByRole("group", { name: "Text" });
  const size = text.getByRole("textbox", { name: "Font size" });

  await expect(size).toHaveValue("Mixed");
  await expect(text.getByRole("combobox", { name: "Font weight" })).toHaveValue("");
  await expect(text.getByRole("textbox", { name: "Line height" })).toHaveValue("Mixed");
  await size.fill("22");
  await size.press("Enter");

  await expect.poll(() => introStyle(page, "fontSize")).toBe("22px");
  await expect.poll(() => introStyle(page, "fontSize", "article h3 >> nth=0")).toBe("22px");
  await expect(size).toHaveValue("22");
});

test("a text's case, decoration and alignment changed are marked, each group's reset at its end taking it back (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, INTRO);
  const text = design(page).getByRole("group", { name: "Text" });
  const groups = [
    { group: "Case", choice: "Upper case", reset: "Reset case", style: "textTransform", was: "none" },
    { group: "Decoration", choice: "Underline", reset: "Reset decoration", style: "textDecorationLine", was: "none" },
    { group: "Text alignment", choice: "Align center", reset: "Reset text alignment", style: "textAlign", was: "start" },
  ] as const;
  for (const { group, choice, reset, style, was } of groups) {
    const segmented = text.getByRole("radiogroup", { name: group });
    const resetButton = segmented.getByRole("button", { name: reset });
    await expect(segmented).not.toHaveClass(/\bis-changed\b/);
    await expect(resetButton).toHaveCount(0);

    const grey = await segmented.evaluate((el) => getComputedStyle(el).backgroundColor);
    await segmented.getByRole("radio", { name: choice }).click();
    await expect.poll(() => introStyle(page, style)).not.toBe(was);
    await expectSegmentedChanged(segmented, segmented.getByRole("radio", { name: choice }), resetButton);

    // Taken back: the track eases back to its grey, the reset gone.
    await resetButton.click();
    await expect.poll(() => introStyle(page, style)).toBe(was);
    await expect(segmented).not.toHaveClass(/\bis-changed\b/);
    await expect(resetButton).toHaveCount(0);
    await expect.poll(() => segmented.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(grey);
  }
});

test("a font and its weight have a field's corners, as the font size beside them, changed or not (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, INTRO);
  const text = design(page).getByRole("group", { name: "Text" });
  const radius = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).borderRadius);
  const font = text.getByRole("combobox", { name: "Font", exact: true });
  const weight = text.getByRole("combobox", { name: "Font weight" });
  const size = text.locator(".tk-field:has([aria-label='Font size'])");
  const sizeRadius = await radius(size);
  expect(sizeRadius).toBe("6px");
  expect(await radius(font)).toBe(sizeRadius);
  expect(await radius(weight)).toBe(sizeRadius);

  await font.selectOption("Space Grotesk");
  await weight.selectOption("700");
  await expect(text.locator(".tk-select-field.tk-font-field")).toHaveClass(/\bis-changed\b/);
  await expect(text.locator(".tk-select-field:has([aria-label='Font weight'])")).toHaveClass(/\bis-changed\b/);
  expect(await radius(font)).toBe(sizeRadius);
  expect(await radius(weight)).toBe(sizeRadius);
});

test("a text's font, weight, line height and letter spacing changed show their reset, which takes the change back (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, INTRO);
  const text = design(page).getByRole("group", { name: "Text" });
  const font = text.getByRole("combobox", { name: "Font", exact: true });
  const fontField = text.locator(".tk-select-field.tk-font-field");

  await expect(fontField).not.toHaveClass(/\bis-changed\b/);
  const weightField = text.locator(".tk-select-field:has([aria-label='Font weight'])");
  await font.selectOption("Space Grotesk");
  await expect(fontField).toHaveClass(/\bis-changed\b/);
  // The font alone changes: the weight stays as it was, unmarked (designer, 2026-11-08); changed itself, it is marked.
  await expect(weightField).not.toHaveClass(/\bis-changed\b/);
  await text.getByRole("combobox", { name: "Font weight" }).selectOption("700");
  await expect(weightField).toHaveClass(/\bis-changed\b/);
  await text.getByRole("button", { name: "Reset font", exact: true }).click();
  await expect.poll(() => introStyle(page, "fontFamily")).toContain("Georgia");
  await expect(fontField).not.toHaveClass(/\bis-changed\b/);
  await text.getByRole("button", { name: "Reset font weight" }).click();
  await expect.poll(() => introStyle(page, "fontWeight")).toBe("400");

  for (const [name, value] of [["Line height", "30px"], ["Letter spacing", "5"]] as const) {
    const field = text.getByRole("textbox", { name, exact: true });
    const was = await field.inputValue();
    await field.fill(value);
    await field.press("Enter");
    await expect(text.locator(`.tk-field:has([aria-label="${name}"])`)).toHaveClass(/\bis-changed\b/);
    await text.getByRole("button", { name: `Reset ${name.toLowerCase()}` }).click();
    await expect(field).toHaveValue(was);
    await expect(text.locator(`.tk-field:has([aria-label="${name}"])`)).not.toHaveClass(/\bis-changed\b/);
  }
});

test("a text's alignment is as wide as its buttons, at the row's left; the font shows Aa in its own family (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, INTRO);
  const text = design(page).getByRole("group", { name: "Text" });
  const [align, row] = await Promise.all([steadyBox(text.getByRole("radiogroup", { name: "Text alignment" })), steadyBox(text.locator(".tk-select-field.tk-font-field"))]);
  expect(align.width).toBeLessThan(row.width / 2);
  expect(align.x).toBe(row.x);

  const sample = text.locator(".tk-font-field > .tk-font-sample");
  await expect(sample).toHaveText("Aa");
  await expect.poll(() => sample.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Georgia");
  await text.getByRole("combobox", { name: "Font", exact: true }).selectOption("Space Grotesk");
  await expect.poll(() => sample.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Space Grotesk");
  await expect(sample).toHaveCSS("font-weight", "400");
});

test("a layer that is not text has no Text section", async ({ page }) => {
  await selectRow(page, "Card");

  await expect(design(page).getByRole("group", { name: "Text" })).toHaveCount(0);
});

test("a reset taking several fields back stands at its row's left, outside them, the fields marked with none of their own; a field's own reset stays inside it (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Button");
  const panel = design(page);
  const width = panel.getByRole("textbox", { name: "Width", exact: true });
  const widthField = panel.locator(`.tk-field:has([aria-label="Width"])`);
  const sizing = panel.getByRole("combobox", { name: "Width sizing" });
  const sizingField = panel.locator(`.tk-select-field:has([aria-label="Width sizing"])`);
  const resetWidth = panel.getByRole("button", { name: /^Reset width/ });
  const wasWidth = await width.inputValue();
  await expect(sizing).toHaveValue("hug");

  // Typed: Fixed, at another number; both marked, one reset, at the row's left, outside the Width field.
  await width.fill("200");
  await width.press("Enter");
  await expect(widthField).toHaveClass(/\bis-changed\b/);
  await expect(sizingField).toHaveClass(/\bis-changed\b/);
  await expect(resetWidth).toHaveCount(1);
  await expect(resetWidth).toHaveAccessibleName("Reset width");
  await expect(widthField.getByRole("button", { name: /^Reset/ })).toHaveCount(0);
  await expect(sizingField.getByRole("button", { name: /^Reset/ })).toHaveCount(0);
  await expect
    .poll(async () => {
      const [reset, field] = await Promise.all([steadyBox(resetWidth), steadyBox(widthField)]);
      // Left of it, 4px apart, centered on it.
      return { gap: Math.round(field.x - (reset.x + reset.width)), size: Math.round(reset.width), center: Math.round(reset.y + reset.height / 2 - (field.y + field.height / 2)) };
    })
    .toEqual({ gap: 4, size: 28, center: 0 });

  // It takes both back.
  await resetWidth.click();
  await expect(sizing).toHaveValue("hug");
  await expect(width).toHaveValue(wasWidth);
  await expect(resetWidth).toHaveCount(0);
  await expect(widthField).not.toHaveClass(/\bis-changed\b/);
  await expect(sizingField).not.toHaveClass(/\bis-changed\b/);

  // A color: the hex and its opacity marked, one reset at the row's left.
  await selectRow(page, "Card");
  const fill = panel.getByRole("group", { name: "Fill" });
  const hex = fill.getByRole("textbox", { name: "Fill color", exact: true });
  const hexField = fill.locator(".tk-color-field");
  const opacityField = fill.locator(".tk-color-opacity");
  const resetFill = fill.getByRole("button", { name: "Reset fill" });
  const wasHex = await hex.inputValue();
  await hex.fill("FF0000");
  await hex.press("Enter");
  await expect(hexField).toHaveClass(/\bis-changed\b/);
  await expect(opacityField).toHaveClass(/\bis-changed\b/);
  await expect(resetFill).toHaveCount(1);
  await expect(hexField.getByRole("button", { name: /^Reset/ })).toHaveCount(0);
  await expect(opacityField.getByRole("button", { name: /^Reset/ })).toHaveCount(0);
  await expect
    .poll(async () => {
      const [reset, field] = await Promise.all([steadyBox(resetFill), steadyBox(hexField)]);
      return { gap: Math.round(field.x - (reset.x + reset.width)), size: Math.round(reset.width), center: Math.round(reset.y + reset.height / 2 - (field.y + field.height / 2)) };
    })
    .toEqual({ gap: 4, size: 28, center: 0 });
  await resetFill.click();
  await expect(hex).toHaveValue(wasHex);
  await expect(resetFill).toHaveCount(0);

  // A number alone: its reset inside it, at its right end.
  const radius = panel.getByRole("textbox", { name: "Corner radius" });
  const radiusField = panel.locator(`.tk-field:has([aria-label="Corner radius"])`);
  await radius.fill("20");
  await radius.press("Enter");
  const resetRadius = radiusField.getByRole("button", { name: "Reset corner radius" });
  await expect(resetRadius).toBeVisible();
  await expect
    .poll(async () => {
      const [reset, field] = await Promise.all([steadyBox(resetRadius), steadyBox(radiusField)]);
      return Math.round(field.x + field.width - (reset.x + reset.width));
    })
    .toBe(2);
});

test("the row's reset looks as a button that stays on (Wrap, on): its size, its corners, its ground and icon, and hovered; a field's own reset stays 24px (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Header");
  const panel = design(page);
  const wrap = panel.getByRole("button", { name: "Wrap", exact: true });
  await wrap.click();
  await expect(wrap).toHaveAttribute("aria-pressed", "true");
  // The radius first: the Variables listed as it is typed close once the width is typed into.
  const radius = panel.getByRole("textbox", { name: "Corner radius" });
  await radius.fill("20");
  await radius.press("Enter");
  const width = panel.getByRole("textbox", { name: "Width", exact: true });
  await width.fill("300");
  await width.press("Enter");
  // Its Variables listed close as it leaves it: with 28px rows, they reach over Wrap.
  await width.blur();
  await expect(panel.getByRole("listbox", { name: "Matching variables" })).toHaveCount(0);
  const rowReset = panel.locator(".tk-size-row > .tk-reset");
  const fieldReset = panel.locator(".tk-field").getByRole("button", { name: "Reset corner radius" });
  await expect(rowReset).toHaveCount(1);
  await expect(fieldReset).toBeVisible();
  const look = (button: Locator) =>
    button.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: style.width, height: style.height, radius: style.borderRadius, background: style.backgroundColor, color: style.color };
    });
  // Neither hovered (the pointer left on Wrap since its click): once the colors have settled, as alike as the same rules make them.
  await page.mouse.move(0, 0);
  await expect.poll(() => look(rowReset)).toEqual(await look(wrap));
  expect((await look(rowReset)).width).toBe("28px");
  expect((await look(fieldReset)).width).toBe("24px");
  // Hovered, the same blue 600.
  await rowReset.hover();
  await expect.poll(() => look(rowReset)).toEqual({ width: "28px", height: "28px", radius: "6px", background: "rgb(0, 125, 210)", color: "rgb(255, 255, 255)" });
  await wrap.hover();
  await expect.poll(() => look(wrap)).toEqual({ width: "28px", height: "28px", radius: "6px", background: "rgb(0, 125, 210)", color: "rgb(255, 255, 255)" });
});

test("a section's reset shows for two of its changes, not for one, in every section: Appearance's opacity and radius (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const panel = design(page);
  const appearance = panel.locator("section", { has: page.locator("#tk-appearance") });
  const reset = appearance.getByRole("button", { name: "Reset Appearance" });
  const opacity = panel.getByRole("textbox", { name: "Opacity", exact: true });
  const radius = panel.getByRole("textbox", { name: "Corner radius" });
  const wasRadius = await radius.inputValue();

  await opacity.fill("50");
  await opacity.press("Enter");
  await expect(panel.locator(".tk-field:has([aria-label='Opacity'])")).toHaveClass(/\bis-changed\b/);
  await expect(reset).toHaveCount(0);
  await radius.fill("20");
  await radius.press("Enter");
  await expect(reset).toBeVisible();

  await reset.click();
  await expect(opacity).toHaveValue("100%");
  await expect(radius).toHaveValue(wasRadius);
  await expect(reset).toHaveCount(0);

  // A check is clicked again to go back: marked, no reset of its own; it counts toward the section's.
  const visible = panel.locator(".tk-check", { hasText: "Visible" });
  await panel.getByRole("checkbox", { name: "Visible" }).uncheck();
  await expect(visible).toHaveClass(/\bis-changed\b/);
  await expect(visible.getByRole("button")).toHaveCount(0);
  await expect(reset).toHaveCount(0);
  await opacity.fill("50");
  await opacity.press("Enter");
  await expect(reset).toBeVisible();
});

test("a shadow's color changed is marked, with its row's reset, which takes it back (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const hex = effects.getByRole("textbox", { name: "Shadow 1 color", exact: true });
  const hexField = effects.locator(".tk-color-field", { has: page.getByRole("textbox", { name: "Shadow 1 color", exact: true }) });
  const opacityField = effects.locator(".tk-color-opacity", { has: page.getByRole("textbox", { name: "Shadow 1 opacity" }) });
  const reset = effects.getByRole("button", { name: "Reset shadow 1", exact: true });
  const yField = effects.locator(".tk-field:has([aria-label='Shadow 1 Y'])");
  const sectionReset = effects.getByRole("button", { name: "Reset Effects" });
  const was = await hex.inputValue();
  await expect(hexField).not.toHaveClass(/\bis-changed\b/);

  await hex.fill("FF0000");
  await hex.press("Enter");
  await expect(hexField).toHaveClass(/\bis-changed\b/);
  await expect(opacityField).toHaveClass(/\bis-changed\b/);
  await expect(reset).toHaveCount(1);
  // The other shadow's color, and this one's numbers, unchanged: not marked; one operation, no section reset yet.
  await expect(effects.locator(".tk-color-field", { has: page.getByRole("textbox", { name: "Shadow 2 color", exact: true }) })).not.toHaveClass(/\bis-changed\b/);
  await expect(yField).not.toHaveClass(/\bis-changed\b/);
  await expect(sectionReset).toHaveCount(0);

  // The Y too: marked with its own reset; two operations bring the section's.
  const y = effects.getByRole("textbox", { name: "Shadow 1 Y", exact: true });
  await y.fill("9");
  await y.press("Enter");
  await expect(yField).toHaveClass(/\bis-changed\b/);
  await expect(yField.getByRole("button", { name: "Reset shadow 1 y" })).toBeVisible();
  await expect(sectionReset).toBeVisible();

  await reset.click();
  await expect(hex).toHaveValue(was);
  await expect(hexField).not.toHaveClass(/\bis-changed\b/);
  await expect(y).toHaveValue("9");
  await expect(sectionReset).toHaveCount(0);
});

test("a gradient's angle changed in the picker is marked, with no reset inside the picker: the Fill row's one reset takes the whole fill back (designer, 2026-11-08)", async ({ page }) => {
  await canvas(page)
    .locator("article")
    .evaluateAll((cards) => cards.slice(0, 3).forEach((card) => ((card as HTMLElement).style.backgroundImage = "linear-gradient(45deg, red, blue)")));
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  const gradient = async () => (await cardStyles(page, "backgroundImage"))[0];
  await openFill(fill);
  const angle = fill.getByRole("textbox", { name: "Angle", exact: true });
  const angleField = fill.locator("label.tk-field[data-tk-tip='Angle']");
  await expect(angle).toHaveValue("45");
  const stopField = fill.locator(".tk-stop-position").first();
  const width = (await steadyBox(stopField)).width;

  await angle.fill("90");
  await angle.press("Enter");
  await expect.poll(() => gradient()).toBe("linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)");
  await expect(angleField).toHaveClass(/\bis-changed\b/);
  // No reset in the picker; the Fill's row has its one.
  const picker = page.getByRole("dialog", { name: "Fill color" });
  await expect(picker.getByRole("button", { name: /^Reset/ })).toHaveCount(0);
  await expect(fill.getByRole("button", { name: "Reset fill", exact: true })).toHaveCount(1);

  // A stop moved: marked, as wide as it was, no reset of its own.
  const at = fill.getByRole("textbox", { name: "Stop 1 at", exact: true });
  await at.fill("10%");
  await at.press("Enter");
  await expect(stopField).toHaveClass(/\bis-changed\b/);
  await expect.poll(async () => (await steadyBox(stopField)).width).toBe(width);
  await expect(picker.getByRole("button", { name: /^Reset/ })).toHaveCount(0);

  await fill.getByRole("button", { name: "Reset fill", exact: true }).click();
  await expect.poll(() => gradient()).toBe("linear-gradient(45deg, rgb(255, 0, 0), rgb(0, 0, 255))");
  await expect(fill.getByRole("button", { name: /^Reset/ })).toHaveCount(0);
});

test("a shadow added in this round: its fields unmarked, with no resets, its − in the accent, which takes it back off (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const shadow3 = effects.getByRole("group", { name: "Shadow 3" });
  const remove3 = effects.getByRole("button", { name: "Remove shadow 3" });
  const was = (await cardStyles(page, "boxShadow"))[0];
  await addEffect(effects, "Drop shadow");
  await expect(shadow3).toBeVisible();

  // Changed after it was added, still unmarked: it is new, all of it.
  const y = effects.getByRole("textbox", { name: "Shadow 3 Y", exact: true });
  await y.fill("12");
  await y.press("Enter");
  await expect(shadow3.locator(".is-changed")).toHaveCount(0);
  await expect(shadow3.getByRole("button", { name: /^Reset/ })).toHaveCount(0);
  await expect(remove3).toHaveClass(/\bis-added\b/);
  // On a ground of its own, the accent, as Wrap on is; the − of a shadow the page had has none.
  const ground = (button: Locator) => button.evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect.poll(() => ground(remove3)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await ground(effects.getByRole("button", { name: "Remove shadow 1" }))).toBe("rgba(0, 0, 0, 0)");
  // The shadows before it, unchanged: not marked, their − as ever.
  await expect(effects.getByRole("group", { name: "Shadow 1" }).locator(".is-changed")).toHaveCount(0);
  await expect(effects.getByRole("button", { name: "Remove shadow 1" })).not.toHaveClass(/\bis-added\b/);

  await remove3.click();
  await expect(shadow3).toHaveCount(0);
  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).toBe(was);
  await expect(page.getByRole("button", { name: /not applied yet/ })).toHaveCount(0);
});

test("an existing shadow's Y changed is marked with its reset; one taken off above it leaves it unmarked (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const yField = effects.locator(".tk-field:has([aria-label='Shadow 1 Y'])");

  // Shadow 1 taken off: shadow 2, now the first, is as it was, and unmarked.
  await effects.getByRole("button", { name: "Remove shadow 1" }).click();
  await expect(effects.getByRole("group", { name: "Shadow 2" })).toHaveCount(0);
  const shadow1 = effects.getByRole("group", { name: "Shadow 1" });
  await expect(shadow1.locator(".is-changed")).toHaveCount(0);
  await expect(shadow1.getByRole("button", { name: /^Reset/ })).toHaveCount(0);
  await expect(effects.getByRole("button", { name: "Remove shadow 1" })).not.toHaveClass(/\bis-added\b/);

  // Its Y changed: marked, with its own reset, which takes it back.
  const y = effects.getByRole("textbox", { name: "Shadow 1 Y", exact: true });
  const wasY = await y.inputValue();
  await y.fill("9");
  await y.press("Enter");
  await expect(yField).toHaveClass(/\bis-changed\b/);
  await expect(effects.locator(".tk-field:has([aria-label='Shadow 1 blur'])")).not.toHaveClass(/\bis-changed\b/);
  await yField.getByRole("button", { name: "Reset shadow 1 y" }).click();
  await expect(y).toHaveValue(wasY);
  await expect(shadow1.locator(".is-changed")).toHaveCount(0);
});

test("a new shadow counts as one operation toward the section's reset, which takes it back off with the rest (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });
  const sectionReset = effects.getByRole("button", { name: "Reset Effects" });
  const was = (await cardStyles(page, "boxShadow"))[0];

  await addEffect(effects, "Drop shadow");
  // Its fields changed after: still the one operation.
  const blur = effects.getByRole("textbox", { name: "Shadow 3 blur", exact: true });
  await blur.fill("20");
  await blur.press("Enter");
  await expect(sectionReset).toHaveCount(0);

  const y = effects.getByRole("textbox", { name: "Shadow 1 Y", exact: true });
  await y.fill("9");
  await y.press("Enter");
  await expect(sectionReset).toBeVisible();

  await sectionReset.click();
  await expect(effects.getByRole("group", { name: "Shadow 3" })).toHaveCount(0);
  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).toBe(was);
  await expect(effects.locator(".is-changed")).toHaveCount(0);
});

test("a Stack made in this round: its fields unmarked, only its − in the accent, which takes the Stack back out (designer, 2026-11-08)", async ({ page }) => {
  const hero = canvas(page).locator('[data-testid="hero"] > *');
  const was = await hero.evaluateAll((els) => els.map((el) => el.localName));
  const layers = page.getByRole("tree", { name: "Layers" });
  await layers.getByRole("treeitem", { name: "A Framer-style editor layer for any page.", exact: true }).click();
  await layers.getByRole("treeitem", { name: "Button", exact: true }).click({ modifiers: ["Shift"] });
  await design(page).getByRole("button", { name: "Make Stack" }).click();
  const stack = design(page).locator("section[aria-labelledby='tk-stack']");
  const dissolve = stack.getByRole("button", { name: "Dissolve Stack" });
  await expect(dissolve).toBeVisible();
  await expect(dissolve).toHaveClass(/\bis-added\b/);

  // Its gap and direction changed after: unmarked, no resets, no section reset.
  const gap = stack.getByRole("textbox", { name: "Gap", exact: true });
  await gap.fill("40");
  await gap.press("Enter");
  await stack.getByRole("radio", { name: "Horizontal" }).click();
  await expect(stack.locator(".is-changed")).toHaveCount(0);
  await expect(stack.getByRole("button", { name: /^Reset/ })).toHaveCount(0);

  await dissolve.click();
  await expect.poll(() => hero.evaluateAll((els) => els.map((el) => el.localName))).toEqual(was);
  await expect(page.getByRole("button", { name: /not applied yet/ })).toHaveCount(0);
});

test("an effect's type fills its row, its − at the right end: a shadow's, changed or not, and a blur's (designer, 2026-11-08)", async ({ page }) => {
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });
  await addEffect(effects, "Layer blur");
  await effects.getByRole("combobox", { name: "Shadow 1 type" }).selectOption("Inner shadow");
  await expect(effects.getByRole("group", { name: "Shadow 1" }).locator(".tk-select-field.is-changed")).toBeVisible();

  for (const [name, remove] of [
    ["Shadow 1", "Remove shadow 1"],
    ["Shadow 2", "Remove shadow 2"],
    ["Layer blur", "Remove layer blur"],
  ]) {
    const row = effects.getByRole("group", { name, exact: true }).locator(".tk-paint-row");
    const [rowBox, type, minus] = await Promise.all([
      steadyBox(row),
      // A shadow's select inside its wrapper, with its reset; a blur's on its own.
      steadyBox(row.locator(":scope > :first-child")),
      steadyBox(row.getByRole("button", { name: remove })),
    ]);
    expect(Math.abs(type.x - rowBox.x), `${name}: its type at the row's left`).toBeLessThanOrEqual(1);
    // The 2px gap of a paint's row between them.
    expect(Math.abs(type.x + type.width + 2 - minus.x), `${name}: its type up to its −`).toBeLessThanOrEqual(1);
    expect(Math.abs(minus.x + minus.width - (rowBox.x + rowBox.width)), `${name}: its − at the row's right end`).toBeLessThanOrEqual(1);
  }
});

test("a color pointed at, wherever one is chosen, has the Variants tab's white line inside it and a darker one round it", async ({ page }) => {
  await page.goto(DEV_URL);
  await enterEditMode(page);
  await selectRow(page, "Card");
  const ring = "rgb(255, 255, 255) 0px 0px 0px 1.5px inset, rgba(0, 0, 0, 0.35) 0px 0px 0px 1px";
  // The fill's swatch, which opens its picker.
  const swatch = design(page).getByRole("button", { name: "Fill color picker" });
  await expect(swatch).not.toHaveCSS("box-shadow", ring);
  await swatch.hover();
  await expect(swatch).toHaveCSS("box-shadow", ring);
  // Left, it goes.
  await page.mouse.move(0, 0);
  await expect(swatch).not.toHaveCSS("box-shadow", ring);
  // Pointing at its hex, on the same field, does it too.
  await design(page).getByRole("textbox", { name: "Fill color", exact: true }).hover();
  await expect(swatch).toHaveCSS("box-shadow", ring);
});
