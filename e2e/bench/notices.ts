/**
 * The editor layer's notices, as the bench and its playbooks find them on the
 * designer's page.
 */
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Each notice by what the editor layer marks it with (`data-tk-notice`: in
 * `PageToast.tsx` and `StalledNotice.tsx`, which cannot be imported here:
 * they run on a page), not by its words, which may change; and where
 * the page keeps when it showed: on its window, and in its session's storage,
 * so a reload keeps it.
 */
const NOTICES = {
  /** In edit mode: the code is changing, but no Agent has claimed the changes (ticket 66; gone since ticket 78, kept to measure the code before it). */
  unclaimed: { selector: '[role="alertdialog"][data-tk-notice="unclaimed"]', key: "__tkBenchUnclaimedNotices" },
  /** In edit mode, at the canvas's bottom left: the page changed and the canvas, with no changes on it, was frozen afresh (ticket 78). */
  canvasUpdated: { selector: '[data-tk-notice="canvas-updated"]', key: "__tkBenchCanvasUpdatedNotices" },
  /** In edit mode, at the canvas's bottom left: the page changed since the canvas, with changes on it, was frozen (ticket 78). */
  pageChanged: { selector: '[data-tk-notice="page-changed"]', key: "__tkBenchPageChangedNotices" },
  /** On the locked toggle: the Agent seems to have stopped (ticket 67). */
  stalled: { selector: '[role="alert"][data-tk-notice="stalled"]', key: "__tkBenchStalledNotices" },
};

export const unclaimedNotice = (page: Page) => page.locator(NOTICES.unclaimed.selector);
export const canvasUpdatedNotice = (page: Page) => page.locator(NOTICES.canvasUpdated.selector);
export const pageChangedNotice = (page: Page) => page.locator(NOTICES.pageChanged.selector);
export const stalledNotice = (page: Page) => page.locator(NOTICES.stalled.selector);

/**
 * Has the page, from its next load on, note each time each notice shows: once
 * for as long as it stays, however briefly, by watching the editor layer's
 * Shadow DOM as it changes (looking now and then could miss one taken away
 * at once, by a claim heard right after). Only on the top page, not in the
 * canvas's frames.
 */
export async function recordNotices(on: Page | BrowserContext) {
  await on.addInitScript((notices) => {
    // Asked for again on the same page (a playbook that designs a second round): once is enough.
    const recording = "__tkBenchNoticesRecorded";
    if (window.top !== window || recording in window) return;
    (window as unknown as Record<string, boolean>)[recording] = true;
    const looks = notices.map(({ key, selector }) => {
      let times: number[] = [];
      try {
        times = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      } catch {}
      (window as unknown as Record<string, number[]>)[key] = times;
      let shown = false;
      return (root: ShadowRoot) => {
        const now = root.querySelector(selector) !== null;
        if (now && !shown) {
          times.push(Date.now());
          try {
            sessionStorage.setItem(key, JSON.stringify(times));
          } catch {}
        }
        shown = now;
      };
    });
    const look = (root: ShadowRoot) => looks.forEach((one) => one(root));
    // The editor layer's host comes once the page's code mounts it: then its Shadow DOM is watched.
    const findHost = new MutationObserver(() => {
      const root = document.querySelector("third-kind")?.shadowRoot;
      if (!root) return;
      findHost.disconnect();
      new MutationObserver(() => look(root)).observe(root, { childList: true, subtree: true });
      look(root);
    });
    findHost.observe(document, { childList: true, subtree: true });
  }, Object.values(NOTICES));
}

/** When, in ms since the epoch, the notice showed on `page`: since `recordNotices`, or from `since` on. */
async function shownTimes(page: Page, key: string, since: number): Promise<number[]> {
  const times = await page.evaluate((key) => [...((window as unknown as Record<string, number[] | undefined>)[key] ?? [])], key);
  return times.filter((at) => at >= since);
}

/** When the notice that no Agent claimed the changes showed. */
export const unclaimedNoticesShown = (page: Page, since = -Infinity) => shownTimes(page, NOTICES.unclaimed.key, since);
/** When the toast that the canvas was frozen afresh showed. */
export const canvasUpdatedNoticesShown = (page: Page, since = -Infinity) => shownTimes(page, NOTICES.canvasUpdated.key, since);
/** When the toast that the page changed since the canvas was frozen showed. */
export const pageChangedNoticesShown = (page: Page, since = -Infinity) => shownTimes(page, NOTICES.pageChanged.key, since);
/** When the notice that the Agent seems to have stopped showed. */
export const stalledNoticesShown = (page: Page, since = -Infinity) => shownTimes(page, NOTICES.stalled.key, since);
