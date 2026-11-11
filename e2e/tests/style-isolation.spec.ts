import { expect, test } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
});

test("the editor layer is mounted in a Shadow DOM", async ({ page }) => {
  const inShadow = await page.getByRole("button", { name: TOGGLE_LABEL }).evaluate((el) => {
    const root = el.getRootNode();
    return root instanceof ShadowRoot && root.host.localName === "human-touch";
  });

  expect(inShadow).toBe(true);
});

test("page styles do not reach the editor layer", async ({ page }) => {
  await page.addStyleTag({
    content: `
      html, body { font: italic 20px/3 Georgia, serif !important; color: red !important;
        letter-spacing: 3px !important; text-transform: uppercase !important; }
      *, button, div { background: red !important; border-radius: 0 !important; padding: 20px !important; }
    `,
  });
  const toggle = page.getByRole("button", { name: TOGGLE_LABEL });

  const toggleStyle = await toggle.evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, radius: s.borderRadius, padding: s.padding, width: s.width };
  });
  expect(toggleStyle).toEqual({ background: "rgb(255, 255, 255)", radius: "6px", padding: "0px", width: "28px" });

  await toggle.click();
  const panelTitle = page.getByRole("complementary", { name: "Layers" }).getByRole("heading");
  await expect(panelTitle).toBeVisible();

  const titleStyle = await panelTitle.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      fontStyle: s.fontStyle,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textTransform: s.textTransform,
      color: s.color,
      serif: s.fontFamily.includes("Georgia"),
    };
  });
  expect(titleStyle).toEqual({
    fontStyle: "normal",
    // A panel's title as the designer drew it (2026-11-07): Geist Medium 14px, neutral 700.
    fontSize: "14px",
    lineHeight: "16px",
    letterSpacing: "normal",
    textTransform: "none",
    color: "rgb(63, 64, 63)",
    serif: false,
  });
});

test("editor layer styles do not reach the page", async ({ page }) => {
  const pageButton = page.getByRole("button", { name: "Get started" });
  const style = await pageButton.evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, radius: s.borderRadius };
  });
  // Values from the example's own CSS (src/index.css).
  expect(style).toEqual({ background: "rgb(220, 38, 38)", radius: "0px" });

  const editorRulesInDocument = await page.evaluate(() =>
    [...document.styleSheets].some((sheet) =>
      [...sheet.cssRules].some((rule) => rule.cssText.includes(".ht-")),
    ),
  );
  expect(editorRulesInDocument).toBe(false);
});
