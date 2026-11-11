import { canvasInPlace, expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

/** The example's page whose web font, Space Grotesk, is declared in Light, Medium and Bold, its title in Medium only (ticket 140). */
const FONTS_URL = `${DEV_URL}/fonts.html`;
const TITLE = "Declared weights";

const VIEWS = ['iframe[title="Canvas"]', 'iframe[title="Tablet 768"]', 'iframe[title="Phone 390"]'];
const views = (page: Page) => VIEWS.map((selector) => page.locator(selector));
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });

/** In a view, the title's weight as drawn, and the status of Space Grotesk's Latin face at `weight` in its document. */
function title(view: Locator, weight: string) {
  return view.evaluate((frame: HTMLIFrameElement, weight) => {
    const doc = frame.contentDocument!;
    const faces = [...(doc.fonts as unknown as Iterable<FontFace>)].filter((face) => face.family.replace(/"/g, "") === "Space Grotesk" && face.weight === weight);
    const latin = faces.find((face) => face.unicodeRange.startsWith("U+0-FF"));
    return { weight: getComputedStyle(doc.querySelector("h1")!).fontWeight, face: latin?.status };
  }, weight);
}

test.beforeEach(async ({ page }) => {
  await page.goto(FONTS_URL);
  await expect(page.locator("h1")).toHaveText(TITLE);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(views(page)[2].contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
});

test("the weight menu lists every weight the project declares for a web font, not only the one the page uses; one not loaded yet, chosen, shows at once in every view, and ⌘Z takes it back (ticket 140)", async ({ page }) => {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: TITLE, exact: true }).click();
  const text = design(page).getByRole("group", { name: "Text" });
  const font = text.getByRole("combobox", { name: "Font", exact: true });
  const weight = text.getByRole("combobox", { name: "Font weight" });

  await expect(font).toHaveValue("Space Grotesk");
  await expect(weight).toHaveValue("500");
  // Light and Bold, declared but used by no text, are not loaded on the canvas: still in the menu, and can be chosen.
  for (const view of views(page)) expect(await title(view, "300")).toEqual({ weight: "500", face: "unloaded" });
  await expect(weight.getByRole("option")).toHaveText(["Light", "Medium", "Bold"]);
  for (const option of await weight.getByRole("option").all()) await expect(option).toBeEnabled();

  await weight.selectOption("300");
  // The panel takes it at once, and every view draws it, loading the face it had not.
  await expect(weight).toHaveValue("300");
  for (const view of views(page)) await expect.poll(() => title(view, "300")).toEqual({ weight: "300", face: "loaded" });
  await expect(text.locator(".ht-select-field:has([aria-label='Font weight'])")).toHaveClass(/\bis-changed\b/);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(weight).toHaveValue("500");
  for (const view of views(page)) await expect.poll(async () => (await title(view, "500")).weight).toBe("500");
});
