import { expect, test, type CDPSession, type Page } from "./fixtures";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";

test.use({ reducedMotion: "no-preference" });

const canvasIframe = (page: Page) => page.locator('iframe[title="Canvas"]');
const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });

/** Plays the page's animations at `rate` times their speed, so a test can look at them midway. */
async function playbackRate(cdp: CDPSession, rate: number) {
  await cdp.send("Animation.setPlaybackRate", { playbackRate: rate });
}

async function box(page: Page) {
  return (await canvasIframe(page).boundingBox())!;
}

/** The canvas sits inside the middle column, scaled down. */
async function expectSettled(page: Page) {
  const area = (await viewportArea(page).boundingBox())!;
  await expect
    .poll(async () => {
      const b = await box(page);
      return b.x > area.x && b.x + b.width < area.x + area.width;
    })
    .toBe(true);
}

let cdp: CDPSession;

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
});

/** The toast's look right now. */
function toastStyle(page: Page) {
  return page
    .getByRole("status")
    .getByRole("paragraph")
    .filter({ hasText: "Stroke weights go in 0.5px steps" })
    .evaluate((el) => ({ opacity: Number(getComputedStyle(el).opacity), translate: getComputedStyle(el).translate }));
}

/** Enters edit mode and types a stroke weight that is rounded: a toast says so. Its fade in plays at `rate` times its speed. */
async function showToast(page: Page, rate: number) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const weight = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Stroke weight" });
  await weight.fill("1.25");
  await playbackRate(cdp, rate);
  await weight.press("Enter");
  return toastStyle(page);
}

/** Lets the toast's fade in end, then waits for its time to run out: what changes as it fades out. */
async function fadeOut(page: Page) {
  await playbackRate(cdp, 1);
  return page
    .getByRole("status")
    .getByRole("paragraph")
    .evaluate(
      (el) =>
        new Promise<string[]>((resolve) => {
          const changing: string[] = [];
          el.addEventListener("transitionrun", (event) => {
            if (!changing.length) requestAnimationFrame(() => resolve(changing.sort()));
            changing.push((event as TransitionEvent).propertyName);
          });
        }),
    );
}

test("entering edit mode shrinks the page from where it was in the window into the canvas", async ({ page }) => {
  await page.evaluate(() => scrollTo(0, 120));
  const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
  await playbackRate(cdp, 0.02);

  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvasIframe(page).contentFrame().locator("h1")).toBeVisible();

  // Starts out covering the window exactly as the page did, scrolled the same.
  const start = await box(page);
  expect(start.x).toBeCloseTo(0, -1);
  expect(start.y).toBeCloseTo(-120, -1);
  expect(start.width).toBeCloseTo(pageWidth, -1);

  await playbackRate(cdp, 1);
  await expectSettled(page);
});

test("the views beside the desktop view stay hidden while the page shrinks into the canvas, and show it from the first frame the page is in place", async ({ page }) => {
  const views = ["Canvas", "Tablet 768", "Phone 390"];
  const seen = page.evaluate(
    (views) =>
      new Promise<{ hiddenWhileTravelling: boolean; travelled: boolean; shownOnceInPlace: boolean }>((resolve) => {
        addEventListener(
          "click",
          () => {
            const root = () => document.querySelector("third-kind")!.shadowRoot!;
            const frameOf = (title: string) => root().querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`);
            const shows = (title: string) => !!frameOf(title)?.contentDocument?.querySelector("h1") && getComputedStyle(frameOf(title)!).visibility === "visible";
            let travelled = false;
            let hiddenWhileTravelling = true;
            const frame = () => {
              const travelling = !!root().querySelector(".tk-viewport.is-travelling");
              if (travelling) {
                travelled = true;
                hiddenWhileTravelling &&= views.slice(1).every((title) => !frameOf(title) || getComputedStyle(frameOf(title)!).visibility === "hidden");
              } else if (travelled) return resolve({ hiddenWhileTravelling, travelled, shownOnceInPlace: views.every(shows) });
              requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          },
          { capture: true, once: true },
        );
      }),
    views,
  );
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  expect(await seen).toEqual({ hiddenWhileTravelling: true, travelled: true, shownOnceInPlace: true });
});

test("going back to preview grows the canvas back over the page before the editor goes away", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  const settled = await box(page);
  await playbackRate(cdp, 0.02);

  await page.getByRole("button", { name: EXIT_LABEL }).click();

  // Still there, on its way back to full size.
  await expect.poll(async () => (await box(page)).width).toBeGreaterThan(settled.width);
  await playbackRate(cdp, 1);
  await expect(canvasIframe(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

/** Gives the three cards of the loop a red fill. */
async function fillCardsRed(page: Page) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const hex = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Fill color", exact: true });
  await hex.fill("ff0000");
  await hex.press("Enter");
}

/** The lowest opacity the editor shell shows from now until it is gone. */
function lowestShellOpacity(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let lowest = 1;
        const look = () => {
          const shell = document.querySelector("third-kind")!.shadowRoot!.querySelector(".tk-shell");
          if (!shell) return resolve(lowest);
          lowest = Math.min(lowest, Number(getComputedStyle(shell).opacity));
          requestAnimationFrame(look);
        };
        look();
      }),
  );
}

test("with changes not yet applied, the canvas fades into the page once it has grown back over it", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  await fillCardsRed(page);
  const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
  await playbackRate(cdp, 0.1);

  await page.getByRole("button", { name: EXIT_LABEL }).click();

  // The page shows none of the changes: rather than cut to it, the editor dissolves into it, the canvas at full size.
  const shell = page.locator(".tk-shell");
  await expect.poll(() => shell.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.9);
  const grown = await box(page);
  expect(grown.x).toBeCloseTo(0, 0);
  expect(grown.width).toBeCloseTo(pageWidth, 0);
  await playbackRate(cdp, 1);
  await expect(canvasIframe(page)).toHaveCount(0);
});

test("a click while going back to preview turns around to the same canvas", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  const canvasMark = await canvasIframe(page).evaluate((frame: HTMLIFrameElement) => (frame.dataset.test = "same"));
  await playbackRate(cdp, 0.02);
  await page.getByRole("button", { name: EXIT_LABEL }).click();

  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await playbackRate(cdp, 1);

  await expectSettled(page);
  await expect(canvasIframe(page)).toHaveAttribute("data-test", canvasMark);
  await expect(page.getByRole("button", { name: EXIT_LABEL })).toBeVisible();
});

test("switching modes from the keyboard is instant", async ({ page }) => {
  await playbackRate(cdp, 0.02);
  await page.getByRole("button", { name: TOGGLE_LABEL }).focus();

  await page.keyboard.press("Enter");

  await expect(canvasIframe(page).contentFrame().locator("h1")).toBeVisible();
  const area = (await viewportArea(page).boundingBox())!;
  expect((await box(page)).width).toBeLessThan(area.width);
});

test("a toast rises into place as it fades in, and sinks as it fades out", async ({ page }) => {
  const comingIn = await showToast(page, 0.02);
  expect(comingIn.opacity).toBeLessThan(1);
  expect(comingIn.translate).not.toBe("none");

  expect(await fadeOut(page)).toEqual(["opacity", "translate"]);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a toast only fades in and out, where it stays", async ({ page }) => {
    const comingIn = await showToast(page, 0.02);
    expect(comingIn.opacity).toBeLessThan(1);
    expect(comingIn.translate).toBe("none");

    expect(await fadeOut(page)).toEqual(["opacity"]);
  });

  test("the canvas does not travel; the editor only fades", async ({ page }) => {
    await playbackRate(cdp, 0.02);

    await page.getByRole("button", { name: TOGGLE_LABEL }).click();

    await expect(canvasIframe(page).contentFrame().locator("h1")).toBeVisible();
    const area = (await viewportArea(page).boundingBox())!;
    expect((await box(page)).width).toBeLessThan(area.width);
  });
});
