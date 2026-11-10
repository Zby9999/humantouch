import { canvasInPlace, expect, steadyBox, test, type CDPSession, type Page } from "./fixtures";
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
    .filter({ hasText: "Stroke must be a multiple of 0.5px." })
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

test("going back to preview after the window narrowed, the canvas grows into the page as it now is, not as it was frozen; turned around, it is as frozen again (designer, 2026-11-08)", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  const frozen = await canvasIframe(page).evaluate((el) => (el as HTMLElement).clientWidth);
  // Narrower only: what answers to the window's height (vh) was settled as the page was frozen.
  await page.setViewportSize({ width: 1078, height: 720 });
  const real = await page.locator("h1").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y) };
  });
  await playbackRate(cdp, 0.02);
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await holdTravel(page);
  // Its last frame: the desktop view as wide as the window, as tall at least, its h1 where the page's is.
  const last = await page.evaluate(() => {
    const root = document.querySelector("third-kind")!.shadowRoot!;
    for (const animation of root.getAnimations()) {
      animation.pause();
      animation.currentTime = 10000;
    }
    const iframe = root.querySelector('iframe[title="Canvas"]') as HTMLIFrameElement;
    const frame = iframe.getBoundingClientRect();
    const h1 = iframe.contentDocument!.querySelector("h1")!.getBoundingClientRect();
    return { width: Math.round(frame.width), height: Math.round(frame.height), h1: { x: Math.round(frame.x + h1.x), y: Math.round(frame.y + h1.y) } };
  });
  expect(last.width).toBe(1078);
  expect(last.height).toBeGreaterThanOrEqual(720);
  expect(last.h1).toEqual(real);

  // Turned around on the way: the desktop view as wide as it was frozen.
  await page.evaluate(() => {
    for (const animation of document.querySelector("third-kind")!.shadowRoot!.getAnimations()) animation.currentTime = 40;
  });
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await playbackRate(cdp, 1);
  await expectSettled(page);
  expect(await canvasIframe(page).evaluate((el) => (el as HTMLElement).clientWidth)).toBe(frozen);
});

/** Where the frame (the desktop view), the panels and the tools are, the editor's animations held `t` ms in; null, as they are. */
function chromeAt(page: Page, t: number | null) {
  return page.evaluate((t) => {
    const root = document.querySelector("third-kind")!.shadowRoot!;
    if (t !== null) {
      for (const animation of root.getAnimations()) {
        animation.pause();
        animation.currentTime = t;
      }
    }
    const rect = (selector: string) => root.querySelector(selector)!.getBoundingClientRect();
    const frame = rect('iframe[title="Canvas"]');
    const tools = rect(".tk-tools");
    return {
      frameLeft: frame.left,
      frameRight: frame.right,
      layersRight: rect(".tk-panel.is-layers").right,
      designLeft: rect(".tk-panel.is-design").left,
      toolsLeft: tools.left,
      toolsMiddle: { x: tools.left + tools.width / 2, y: tools.top + tools.height / 2 },
      width: (root.querySelector(".tk-shell") as HTMLElement).clientWidth,
      opacity: Number(getComputedStyle(root.querySelector(".tk-panel.is-layers")!).opacity),
    };
  }, t);
}
type ChromeAt = Awaited<ReturnType<typeof chromeAt>>;

/** At each time in, each panel's inner edge keeps its gap to the frame's edge on its side, as `rest` had it, and the tools move with the Design panel. */
async function expectTravellingTogether(page: Page, rest: ChromeAt) {
  for (const t of [0, 40, 80, 120, 160, 200]) {
    const now = await chromeAt(page, t);
    expect.soft(Math.abs(now.layersRight + (rest.frameLeft - rest.layersRight) - (now.frameLeft)), `Layers at ${t}ms`).toBeLessThanOrEqual(1);
    expect.soft(Math.abs(now.designLeft - (rest.designLeft - rest.frameRight) - (now.frameRight)), `Design at ${t}ms`).toBeLessThanOrEqual(1);
    expect.soft(Math.abs(now.toolsLeft - rest.toolsLeft - (now.designLeft - rest.designLeft)), `the tools at ${t}ms`).toBeLessThanOrEqual(1);
    // Moved, never faded.
    expect.soft(now.opacity).toBe(1);
  }
}

/** Both panels and the tools wholly off the window. */
function expectOffTheWindow(now: ChromeAt) {
  expect(now.layersRight).toBeLessThanOrEqual(0);
  expect(now.designLeft).toBeGreaterThanOrEqual(now.width);
  expect(now.toolsLeft).toBeGreaterThanOrEqual(now.width);
}

/** Has the editor's animations held where they start, once edit mode has been left or entered and the canvas has started travelling. */
async function holdTravel(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.querySelector("third-kind")?.shadowRoot?.querySelector(".tk-viewport.is-travelling") !== null && document.querySelector("third-kind")!.shadowRoot!.getAnimations().length > 1))
    .toBe(true);
}

test("going back to preview, the panels are pushed out by the growing frame, each edge travelling with the frame's, and it is drawn above what is left (designer, 2026-11-08)", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  await canvasInPlace(page);
  await steadyBox(page.getByRole("complementary", { name: "Layers" }));
  const rest = await chromeAt(page, null);
  const toolsClip = { x: rest.toolsMiddle.x - 12, y: rest.toolsMiddle.y - 12, width: 24, height: 24 };
  const toolsAtRest = await page.screenshot({ clip: toolsClip });
  await playbackRate(cdp, 0);
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await holdTravel(page);

  await expectTravellingTogether(page, rest);
  // As the move starts, the tools still show as they were: the viewport's own gray is not drawn over them.
  await chromeAt(page, 0);
  expect((await page.screenshot({ clip: toolsClip })).equals(toolsAtRest)).toBe(true);
  const grown = await chromeAt(page, 240);
  expectOffTheWindow(grown);
  // Grown, the canvas covers where the tools were: they are under it, not on it.
  const onTools = await page.evaluate(({ x, y }) => document.querySelector("third-kind")!.shadowRoot!.elementFromPoint(x, y)?.className, rest.toolsMiddle);
  expect(onTools).toContain("tk-stage");
});

test("entering edit mode, the panels come in with the shrinking frame, each edge travelling with the frame's (designer, 2026-11-08)", async ({ page }) => {
  await playbackRate(cdp, 0);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await holdTravel(page);

  expectOffTheWindow(await chromeAt(page, 0));
  // Past the end, the animations no longer apply: everything in place.
  const rest = await chromeAt(page, 240);
  await expectTravellingTogether(page, rest);
});

test("a click while going back to preview turns the panels around from where they are, still with the frame", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  await canvasInPlace(page);
  await steadyBox(page.getByRole("complementary", { name: "Layers" }));
  const rest = await chromeAt(page, null);
  await playbackRate(cdp, 0);
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await holdTravel(page);
  const midway = await chromeAt(page, 120);

  await page.getByRole("button", { name: TOGGLE_LABEL }).click();

  // Turned around from where they were, not from the start or the end.
  const turned = await chromeAt(page, 0);
  expect(Math.abs(turned.layersRight - midway.layersRight)).toBeLessThanOrEqual(1);
  expect(Math.abs(turned.designLeft - midway.designLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(turned.frameLeft - midway.frameLeft)).toBeLessThanOrEqual(1);
  await expectTravellingTogether(page, rest);
  const back = await chromeAt(page, 240);
  expect(Math.abs(back.layersRight - rest.layersRight)).toBeLessThanOrEqual(1);
  expect(Math.abs(back.designLeft - rest.designLeft)).toBeLessThanOrEqual(1);
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
