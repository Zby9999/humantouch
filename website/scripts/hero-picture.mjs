/**
 * The hero's picture, light and dark, for public/hero/edit-*.webp: the editor in edit mode at rest, as it starts when
 * the picture has been on screen (designer, 2026-11-12). Run it again whenever that changes, against the site as built
 * and served (`pnpm build`, then serve out/ on a port):
 *
 *   node scripts/hero-picture.mjs <folder for the PNGs> http://localhost:<port>/
 *
 * then make each PNG a WebP at quality 90 (Python: `Image.open(png).convert("RGB").save(webp, "webp", quality=90,
 * method=6)`). The page is told the picture is in and shown, so the editor starts in edit mode; the picture, and the
 * blur, fade and shadow over the editor's edges, are hidden, as the page draws them itself. 2x, at the hero's full width.
 */
import { createRequire } from "node:module";
const req = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [out, base] = process.argv.slice(2);
const SEL = 'section[aria-label="Human Touch\'s editor, to try"]';
const browser = await chromium.launch({ headless: true });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.addInitScript(() => {
    window.__heroPicture = true;
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "[data-hero-picture] { animation: none !important; }";
      document.head.append(style);
    });
  });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2000);
  await page.evaluate((sel) => {
    const s = document.querySelector(sel);
    for (const el of s.children) if (el !== s.firstElementChild) el.style.visibility = "hidden";
    s.querySelector("[data-hero-picture]")?.style.setProperty("visibility", "hidden");
  }, SEL);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await page.locator(SEL + " > div").first().screenshot({ path: `${out}/hero-edit-${scheme}.png` });
  await ctx.close();
}
await browser.close();
