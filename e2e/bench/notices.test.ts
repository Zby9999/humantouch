import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { recordNotices, stalledNoticesShown, unclaimedNoticesShown } from "./notices.ts";

let browser: Browser;
before(async () => {
  browser = await chromium.launch();
});
after(() => browser.close());

/** A page with the editor layer's host, as `mount.ts` puts it on the page, and a way to show and take away a notice in its Shadow DOM. */
async function pageWithEditorLayer(): Promise<Page> {
  const page = await browser.newPage();
  await recordNotices(page);
  await page.route("http://bench.test/", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>t</title><main></main>" }));
  await page.goto("http://bench.test/");
  await page.evaluate(() => {
    const host = document.createElement("human-touch");
    host.attachShadow({ mode: "open" }).append(document.createElement("div"));
    document.documentElement.append(host);
  });
  return page;
}

const UNCLAIMED_TITLE = "The code is changing, but no Agent has claimed your changes";
/** Shows an alert dialog with `text`: the notice no Agent claimed the changes, as the editor layer marks it, when it is that notice's. */
const show = (page: Page, text: string) =>
  page.evaluate(({ text, UNCLAIMED_TITLE }) => {
    const notice = document.createElement("div");
    notice.setAttribute("role", "alertdialog");
    if (text === UNCLAIMED_TITLE) notice.dataset.htNotice = "unclaimed";
    notice.innerHTML = `<h2>${text}</h2>`;
    document.querySelector("human-touch")!.shadowRoot!.firstElementChild!.append(notice);
  }, { text, UNCLAIMED_TITLE });
const takeAway = (page: Page) => page.evaluate(() => document.querySelector("human-touch")!.shadowRoot!.querySelector('[role="alertdialog"]')!.remove());

test("each time the notice that no Agent claimed the changes shows, once however long it stays, and from a time on; other notices are not it", async () => {
  const page = await pageWithEditorLayer();
  assert.equal((await unclaimedNoticesShown(page)).length, 0);

  await show(page, UNCLAIMED_TITLE);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  assert.equal((await unclaimedNoticesShown(page)).length, 1);
  await takeAway(page);
  await show(page, "Something else");
  await takeAway(page);
  await show(page, UNCLAIMED_TITLE);

  const times = await unclaimedNoticesShown(page);
  assert.equal(times.length, 2);
  assert.ok(times[0] <= times[1] && times[1] <= Date.now());
  // Only those from a time on, as the bench counts those from the Agent's start.
  assert.deepEqual(await unclaimedNoticesShown(page, times[1]), [times[1]]);
  assert.deepEqual(await unclaimedNoticesShown(page, times[1] + 1), []);
  await page.close();
});

test("a notice taken away as soon as the task after is counted; the count is kept when the page loads again", async () => {
  const page = await pageWithEditorLayer();
  await page.evaluate(() => {
    const root = document.querySelector("human-touch")!.shadowRoot!.firstElementChild!;
    const notice = document.createElement("div");
    notice.setAttribute("role", "alertdialog");
    notice.dataset.htNotice = "unclaimed";
    notice.textContent = "The code is changing, but no Agent has claimed your changes";
    root.append(notice);
    // Taken away a task later, as a claim heard at once would.
    return new Promise((resolve) => setTimeout(() => resolve(notice.remove()), 0));
  });
  assert.equal((await unclaimedNoticesShown(page)).length, 1);

  await page.reload();
  assert.equal((await unclaimedNoticesShown(page)).length, 1);
  await page.close();
});

test("recorded for a browser context, as the bench does for the designer's page, before the page opens", async () => {
  const context = await browser.newContext();
  await recordNotices(context);
  const page = await context.newPage();
  await page.route("http://bench.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><script>
        addEventListener("DOMContentLoaded", () => {
          const host = document.createElement("human-touch");
          const root = host.attachShadow({ mode: "open" });
          document.documentElement.append(host);
          setTimeout(() => (root.innerHTML = '<div role="alertdialog" data-ht-notice="unclaimed"><h2>The code is changing, but no Agent has claimed your changes</h2></div>'), 20);
        });
      </script><iframe srcdoc="<div role=alertdialog data-ht-notice=unclaimed>no Agent has claimed</div>"></iframe>`,
    }),
  );
  await page.goto("http://bench.test/");
  await page.waitForFunction(() => document.querySelector("human-touch")?.shadowRoot?.childElementCount);

  assert.equal((await unclaimedNoticesShown(page)).length, 1);
  await context.close();
});

test("each time the notice that the Agent seems to have stopped shows, apart from the other notice: by its mark, once however long it stays", async () => {
  const page = await pageWithEditorLayer();
  const stalled = () =>
    page.evaluate(() => {
      const notice = document.createElement("div");
      notice.setAttribute("role", "alert");
      notice.dataset.htNotice = "stalled";
      notice.textContent = "Your Agent seems to have stopped";
      document.querySelector("human-touch")!.shadowRoot!.firstElementChild!.append(notice);
    });
  const takeStalledAway = () => page.evaluate(() => document.querySelector("human-touch")!.shadowRoot!.querySelector('[data-ht-notice="stalled"]')!.remove());

  await stalled();
  await show(page, UNCLAIMED_TITLE);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  await takeStalledAway();
  await stalled();

  const times = await stalledNoticesShown(page);
  assert.equal(times.length, 2);
  assert.equal((await unclaimedNoticesShown(page)).length, 1);
  assert.deepEqual(await stalledNoticesShown(page, times[1]), [times[1]]);
  await page.close();
});
