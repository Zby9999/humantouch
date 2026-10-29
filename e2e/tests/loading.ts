import { gzipSync } from "node:zlib";
import type { Page } from "./fixtures";

/** What the page may load of the editor layer before edit mode is first entered: the toggle, gzipped (docs/goals.md). */
export const TOGGLE_BUDGET = 10 * 1024;

export const gzipped = (texts: (string | Buffer)[]) => texts.reduce((sum, text) => sum + gzipSync(text).length, 0);

/** A script as served, but for the source map Vite's dev server puts at its end: no code of the editor layer. */
export const codeOf = (script: string) => script.replace(/\n\/\/# sourceMappingURL=data:[^\n]*\s*$/, "");

/** Lets the page go idle a few times: whatever it does once it has loaded, it has done. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 3; i++) await page.evaluate(() => new Promise((resolve) => requestIdleCallback(resolve)));
}

/** The scripts the page loads, as served: `all()` so far, and whether any so far `has` a text. */
export function scripts(page: Page) {
  const loaded: Promise<{ url: string; text: string }>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    loaded.push(response.text().then((text) => ({ url: response.url(), text }), () => ({ url: response.url(), text: "" })));
  });
  const all = () => Promise.all(loaded);
  return { all, has: async (text: string) => (await all()).some((script) => script.text.includes(text)) };
}
