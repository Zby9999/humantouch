/**
 * The hero's first frame, light and dark, for public/hero/first-*.webp: what shows in the hero till its script has come
 * (designer, 2026-11-12). Run it again whenever the hero's first frame changes, against the site as built and served
 * (`pnpm build`, then serve out/ on a port):
 *
 *   node scripts/hero-first-frame.mjs <folder for the PNGs> http://localhost:<port>/
 *
 * then make each PNG a WebP at quality 90 (Python: `Image.open(png).convert("RGB").save(webp, "webp", quality=90,
 * method=6)`). The page's timers are paused, so the intro's toggle is not pressed; the blur, fade and shadow over the
 * editor's edges are hidden, as the page draws them over the frame itself. 2x, at the hero's full width.
 */
import { createRequire } from "node:module";
const req = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [out, base] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.clock.install();
  await page.clock.pauseAt(new Date("2026-11-12T00:00:00Z"));
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const s = document.querySelector('section[aria-label="Human Touch\'s editor, to try"]');
    for (const el of s.children) if (el !== s.firstElementChild) el.style.visibility = "hidden";
  });
  const inner = page.locator('section[aria-label="Human Touch\'s editor, to try"] > div').first();
  await inner.screenshot({ path: `${out}/hero-first-${scheme}.png` });
  await ctx.close();
}
await browser.close();
