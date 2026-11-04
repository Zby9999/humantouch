import { REACT18_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

/**
 * The project's Variables coming in after the canvas (ticket 98): a field of the
 * Design panel typed into meanwhile keeps the focus, what is typed, what is
 * selected in it, and the Enter pressed, whatever moment they come in. On the
 * React 18 + Tailwind v3 example, whose Variables include spacing, radii,
 * sizes, font sizes and colors.
 *
 * These tests hold the Variables back on purpose, so they never call
 * `canvasInPlace`, which waits for them.
 */

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

/** Holds the project's Variables back till the returned function lets them through. */
async function holdVariables(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/variables", async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

async function enterEditMode(page: Page) {
  await page.goto(REACT18_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

/** A field that can be a Variable, on a layer of the example, and what a value typed in it draws. */
interface Field {
  layer: string;
  label: string;
  /** What shows once the Variables are in: the field's Variables button, or for a color its picker's button. */
  arrived: string;
  /** Two values to type, the second after the first is applied. */
  values: [string, string];
  /** The canvas's computed style the value sets. */
  drawn(page: Page): Promise<string>;
  /** What that style is for a value typed. */
  expected(value: string): string;
}

const firstCard = (page: Page) => canvas(page).locator("article").first();
const px = (value: string) => `${value}px`;
const rgb = (hex: string) => `rgb(${[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

const FIELDS: Field[] = [
  { layer: "Card", label: "Corner radius", arrived: "Corner radius variables", values: ["71", "72"], drawn: (page) => firstCard(page).evaluate((el) => getComputedStyle(el).borderTopLeftRadius), expected: px },
  { layer: "Card", label: "Padding top", arrived: "Padding top variables", values: ["71", "72"], drawn: (page) => firstCard(page).evaluate((el) => getComputedStyle(el).paddingTop), expected: px },
  { layer: "Card", label: "Width", arrived: "Width variables", values: ["171", "172"], drawn: (page) => firstCard(page).evaluate((el) => getComputedStyle(el).width), expected: px },
  { layer: "Freeze", label: "Font size", arrived: "Font size variables", values: ["31", "32"], drawn: (page) => canvas(page).locator("h3").first().evaluate((el) => getComputedStyle(el).fontSize), expected: px },
  { layer: "Card", label: "Fill color", arrived: "Fill color picker", values: ["123456", "654321"], drawn: (page) => firstCard(page).evaluate((el) => getComputedStyle(el).backgroundColor), expected: rgb },
  { layer: "Grid", label: "Row gap", arrived: "Row gap variables", values: ["71", "72"], drawn: (page) => canvas(page).locator("[data-testid=features]").evaluate((el) => getComputedStyle(el).rowGap), expected: px },
];

/** The field as it is now: focused or not, what it shows, and what is selected in it. */
function seen(page: Page, label: string) {
  return design(page)
    .getByRole("textbox", { name: label, exact: true })
    .evaluate((input: HTMLInputElement) => ({
      focused: (input.getRootNode() as Document | ShadowRoot).activeElement === input,
      value: input.value,
      selected: [input.selectionStart, input.selectionEnd],
    }));
}

for (const field of FIELDS) {
  const { layer, label, arrived, values: [first, second] } = field;
  const arrivedButton = (page: Page) => design(page).getByRole("button", { name: arrived, exact: true });

  test(`${label}: typed as the Variables come in, the field keeps the text, the focus and the selection, and Enter applies it`, async ({ page }) => {
    const release = await holdVariables(page);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: layer, exact: true }).first().click();
    const input = design(page).getByRole("textbox", { name: label, exact: true });
    // A click selects what the field shows: typing replaces it.
    await input.click();
    await page.keyboard.type(first.slice(0, -1));
    await expect(arrivedButton(page)).toHaveCount(0);

    // The Variables come in somewhere around the last key and the select-all: before, between or after them.
    release();
    await page.keyboard.type(first.slice(-1));
    await page.keyboard.press("ControlOrMeta+a");
    await expect(arrivedButton(page)).toBeVisible();
    await expect.poll(() => seen(page, label)).toEqual({ focused: true, value: first, selected: [0, first.length] });

    // Enter, on the keyboard as the designer has it: no click to focus the field again.
    await page.keyboard.press("Enter");
    await expect.poll(() => field.drawn(page)).toBe(field.expected(first));
    await expect.poll(() => seen(page, label)).toEqual({ focused: true, value: first.toUpperCase(), selected: [0, first.length] });
  });

  test(`${label}: applied with Enter before the Variables are in, the field stays focused and selected for the next value`, async ({ page }) => {
    const release = await holdVariables(page);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: layer, exact: true }).first().click();
    const input = design(page).getByRole("textbox", { name: label, exact: true });
    await input.click();
    await page.keyboard.type(first);
    await page.keyboard.press("Enter");
    await expect.poll(() => field.drawn(page)).toBe(field.expected(first));
    await expect(arrivedButton(page)).toHaveCount(0);

    release();
    await expect(arrivedButton(page)).toBeVisible();
    // Enter selected what it applied, to type over.
    await expect.poll(() => seen(page, label)).toEqual({ focused: true, value: first.toUpperCase(), selected: [0, first.length] });

    await page.keyboard.type(second);
    await page.keyboard.press("Enter");
    await expect.poll(() => field.drawn(page)).toBe(field.expected(second));
    await expect.poll(() => seen(page, label)).toEqual({ focused: true, value: second.toUpperCase(), selected: [0, second.length] });
  });
}
