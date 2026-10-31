/**
 * The editor layer's notices, as the bench and its playbooks find them on the
 * designer's page.
 */
import type { BrowserContext, Page } from "@playwright/test";

/**
 * The notice that the code is changing in edit mode, but no Agent has claimed
 * the changes (ticket 66), by what the editor layer marks it with
 * (`UNCLAIMED_NOTICE` in `CodeChangeNotice.tsx`, which cannot be imported
 * here: it runs on a page), not by its words, which may change.
 */
const UNCLAIMED = '[role="alertdialog"][data-vk-notice="unclaimed"]';
/** Where the page keeps when it showed: on its window, and in its session's storage, so a reload keeps it. */
const KEY = "__vkBenchUnclaimedNotices";

/** In edit mode: the code is changing, but no Agent has claimed the changes (ticket 66). */
export const unclaimedNotice = (page: Page) => page.locator(UNCLAIMED);

/**
 * Has the page, from its next load on, note each time that notice shows: once
 * for as long as it stays, however briefly, by watching the editor layer's
 * Shadow DOM as it changes (looking now and then could miss one taken away
 * at once, by a claim heard right after). Only on the top page, not in the
 * canvas's frames.
 */
export async function recordUnclaimedNotices(on: Page | BrowserContext) {
  await on.addInitScript(
    ({ key, selector }) => {
      if (window.top !== window) return;
      let times: number[] = [];
      try {
        times = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      } catch {}
      (window as unknown as Record<string, number[]>)[key] = times;
      let shown = false;
      const look = (root: ShadowRoot) => {
        const now = root.querySelector(selector) !== null;
        if (now && !shown) {
          times.push(Date.now());
          try {
            sessionStorage.setItem(key, JSON.stringify(times));
          } catch {}
        }
        shown = now;
      };
      // The editor layer's host comes once the page's code mounts it: then its Shadow DOM is watched.
      const findHost = new MutationObserver(() => {
        const root = document.querySelector("vernier-kit")?.shadowRoot;
        if (!root) return;
        findHost.disconnect();
        new MutationObserver(() => look(root)).observe(root, { childList: true, subtree: true });
        look(root);
      });
      findHost.observe(document, { childList: true, subtree: true });
    },
    { key: KEY, selector: UNCLAIMED },
  );
}

/** When, in ms since the epoch, the notice showed on `page`: since `recordUnclaimedNotices`, or from `since` on. */
export async function unclaimedNoticesShown(page: Page, since = -Infinity): Promise<number[]> {
  const times = await page.evaluate((key) => [...((window as unknown as Record<string, number[] | undefined>)[key] ?? [])], KEY);
  return times.filter((at) => at >= since);
}
