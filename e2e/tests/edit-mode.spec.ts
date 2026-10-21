import { expect, test, type Frame, type Page } from "@playwright/test";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";

function canvasIframe(page: Page) {
  return page.locator('iframe[title="Canvas"]');
}

async function enterEditMode(page: Page): Promise<Frame> {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvasIframe(page).contentFrame().locator("h1")).toBeVisible();
  return (await (await canvasIframe(page).elementHandle())!.contentFrame())!;
}

/** Box, font and colors of every element in the body, in page coordinates. */
function layout() {
  return [...document.body.querySelectorAll(":not(script, noscript)")].map((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      el: `${el.localName}${el.id ? `#${el.id}` : ""}`,
      box: [r.x + scrollX, r.y + scrollY, r.width, r.height].map(Math.round),
      font: `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily} ${s.letterSpacing}`,
      color: s.color,
      background: s.backgroundColor,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("the toggle freezes the current page state into a canvas inside the editor shell", async ({ page }) => {
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("dialog", { name: "Ship it?" })).toBeVisible();

  await enterEditMode(page);

  await expect(page.getByRole("complementary", { name: "Layers" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Design" })).toBeVisible();
  const canvas = canvasIframe(page).contentFrame();
  await expect(canvas.getByRole("dialog", { name: "Ship it?" })).toBeVisible();
  // A static copy: no scripts, and no editor layer inside it.
  await expect(canvas.locator("script")).toHaveCount(0);
  // Scripts are off in the canvas; fallbacks for that must not show up.
  await expect(canvas.getByText("You need to enable JavaScript")).toHaveCount(0);
  await expect(canvas.locator("vernier-kit")).toHaveCount(0);
});

test("the canvas looks the same as the page: fonts, fixed elements and injected styles", async ({ page }) => {
  await page.evaluate(() => document.fonts.ready);
  // CSS-in-JS libraries insert rules through the CSSOM, leaving the <style> element empty.
  await page.evaluate(() => {
    const style = document.createElement("style");
    document.head.append(style);
    style.sheet!.insertRule("[data-testid=hero] p { color: rgb(1, 2, 3); }");
    // A scrolled inner list keeps its scroll position.
    const list = document.createElement("div");
    list.style.cssText = "height: 100px; overflow: auto";
    list.innerHTML = "<div style='height: 400px'><p>Row</p></div>";
    document.body.append(list);
    list.scrollTop = 120;
    // Constructable stylesheets, as web component libraries use.
    const adopted = new CSSStyleSheet();
    adopted.replaceSync("h1 { letter-spacing: 2px; }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, adopted];
    // A transformed ancestor, not the viewport, holds this fixed element: it scrolls with the page.
    const holder = document.createElement("div");
    holder.style.cssText = "transform: translateX(0); height: 50px";
    holder.innerHTML = "<div style='position: fixed; top: 10px; left: 10px'>Held</div>";
    document.body.append(holder);
  });
  await page.getByRole("button", { name: "Get started" }).click();
  // The fixed dialog overlay must stay where the designer saw it.
  await page.evaluate(() => scrollTo(0, 150));
  const expected = await page.evaluate(layout);

  const canvas = await enterEditMode(page);
  await canvas.evaluate(() => document.fonts.ready);

  expect(await canvas.evaluate(() => document.fonts.check('700 36px "Space Grotesk"'))).toBe(true);
  expect(await canvas.locator("[data-testid=hero] p").evaluate((el) => getComputedStyle(el).color)).toBe(
    "rgb(1, 2, 3)",
  );
  expect(await canvas.evaluate(layout)).toEqual(expected);
});

test("areas sized in viewport units keep the viewport's size on the full-height canvas", async ({ page }) => {
  const viewport = page.viewportSize()!;
  // Inline styles, custom properties and calc() all have to follow.
  await page.evaluate(() => {
    const strip = document.createElement("div");
    strip.id = "strip";
    strip.style.cssText = "--half: 50vh; height: calc(var(--half) - 10px); width: 50vw";
    document.body.append(strip);
  });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  const canvas = await enterEditMode(page);

  const size = (selector: string) =>
    canvas.locator(selector).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [r.width, r.height];
    });
  expect((await size("[data-testid=hero]"))[1]).toBe(viewport.height);
  expect(await size("#strip")).toEqual([viewport.width / 2, viewport.height / 2 - 10]);
  expect(await canvas.evaluate(() => document.documentElement.scrollHeight)).toBe(pageHeight);
  await expect(canvasIframe(page)).toHaveCSS("height", `${pageHeight}px`);
});

test("animations in progress jump to their end state on the canvas", async ({ page }) => {
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes vk-test-fade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes vk-test-spin { to { rotate: 1turn } }
      #fade { animation: vk-test-fade 60s forwards }
      #spin { animation: vk-test-spin 1s linear infinite }
    `;
    document.head.append(style);
    for (const id of ["fade", "spin", "slide"]) {
      const el = document.createElement("div");
      el.id = id;
      el.textContent = id;
      document.body.append(el);
    }
    // Script-driven animation, as motion libraries use.
    document.getElementById("slide")!.animate([{ translate: "0px" }, { translate: "100px" }], {
      duration: 60_000,
      fill: "forwards",
    });
  });

  const canvas = await enterEditMode(page);

  const style = (id: string, property: string) =>
    canvas.locator(`#${id}`).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
  expect(await style("fade", "opacity")).toBe("1");
  expect(await style("slide", "translate")).toBe("100px");
  expect(await canvas.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
  // Freezing leaves the page alone: its animations carry on.
  expect(
    await page.evaluate(() => document.getAnimations().map((a) => [a.playState, Number(a.currentTime) < 30_000])),
  ).toEqual([
    ["running", true],
    ["running", true],
    ["running", true],
  ]);
});

test("native modal dialogs and popovers stay open on the canvas", async ({ page }) => {
  await page.evaluate(() => {
    const dialog = document.createElement("dialog");
    dialog.id = "native-dialog";
    dialog.textContent = "Native dialog";
    const popover = document.createElement("div");
    popover.id = "menu";
    popover.popover = "auto";
    popover.textContent = "Menu";
    document.body.append(dialog, popover);
    dialog.showModal();
    popover.showPopover();
  });
  const expected = await page.evaluate(() =>
    ["native-dialog", "menu"].map((id) => {
      const r = document.getElementById(id)!.getBoundingClientRect();
      return [r.x, r.y + scrollY, r.width, r.height].map(Math.round);
    }),
  );

  // Known limitation: a native modal dialog makes everything outside it inert, the toggle
  // included, so a real click cannot reach it. The keyboard shortcut (story 15) will.
  await page.getByRole("button", { name: TOGGLE_LABEL }).dispatchEvent("click");
  await expect(canvasIframe(page).contentFrame().locator("h1")).toBeVisible();
  const canvas = (await (await canvasIframe(page).elementHandle())!.contentFrame())!;

  await expect(canvas.locator("#native-dialog")).toBeVisible();
  await expect(canvas.locator("#menu")).toBeVisible();
  expect(await canvas.locator("#native-dialog").evaluate((el) => el.matches(":modal"))).toBe(true);
  expect(
    await canvas.evaluate(() =>
      ["native-dialog", "menu"].map((id) => {
        const r = document.getElementById(id)!.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(Math.round);
      }),
    ),
  ).toEqual(expected);
});

test("videos and chart canvases become still images; cross-origin iframes become named placeholders", async ({ page }) => {
  await page.evaluate(async () => {
    const paint = (canvas: HTMLCanvasElement, color: string) => {
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    const chart = Object.assign(document.createElement("canvas"), { id: "chart", width: 40, height: 40 });
    paint(chart, "rgb(255, 0, 0)");
    const source = Object.assign(document.createElement("canvas"), { width: 40, height: 40 });
    paint(source, "rgb(0, 255, 0)");
    const video = Object.assign(document.createElement("video"), { id: "clip", muted: true, srcObject: source.captureStream() });
    const embed = Object.assign(document.createElement("iframe"), { id: "embed", title: "Store map", src: "http://127.0.0.1:9/" });
    embed.style.cssText = "width: 300px; height: 200px";
    document.body.append(chart, video, embed);
    await video.play();
  });
  await expect.poll(() => page.locator("#clip").evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  const embedBox = await page.locator("#embed").evaluate((el: HTMLElement) => [el.offsetWidth, el.offsetHeight]);

  const canvas = await enterEditMode(page);

  const pixel = (id: string) =>
    canvas.locator(`#${id}`).evaluate((el: HTMLCanvasElement) => [...el.getContext("2d")!.getImageData(1, 1, 1, 1).data]);
  expect(await pixel("chart")).toEqual([255, 0, 0, 255]);
  expect(await canvas.locator("#clip").evaluate((el) => el.localName)).toBe("canvas");
  // Video frames go through YUV, so allow a little drift.
  const [r, g, b] = await pixel("clip");
  expect([r < 8, g > 247, b < 8]).toEqual([true, true, true]);

  const placeholder = canvas.locator("#embed");
  expect(await placeholder.evaluate((el) => el.localName)).not.toBe("iframe");
  await expect(placeholder).toHaveText("Store map");
  await expect(placeholder).toHaveCSS("background-color", "rgb(229, 229, 229)");
  expect(await placeholder.evaluate((el: HTMLElement) => [el.offsetWidth, el.offsetHeight])).toEqual(embedBox);
});

test.describe("canvas navigation", () => {
  async function box(page: Page) {
    const b = (await canvasIframe(page).boundingBox())!;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }
  const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });

  test("the canvas lays the page out at its original width and shows all of it across", async ({ page }) => {
    const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
    await enterEditMode(page);

    // Laid out at the original width, then scaled as a whole to fit between the panels.
    await expect(canvasIframe(page)).toHaveCSS("width", `${pageWidth}px`);
    const area = (await viewportArea(page).boundingBox())!;
    const canvas = await box(page);
    expect(canvas.width).toBeLessThan(area.width);
    expect(canvas.x).toBeGreaterThan(area.x);
    expect(canvas.x + canvas.width).toBeLessThan(area.x + area.width);
  });

  for (const modifier of ["Meta", "Control"]) {
    // Control + wheel is also what a trackpad pinch sends.
    test(`${modifier} + wheel zooms around the pointer`, async ({ page }) => {
      await enterEditMode(page);
      const before = await box(page);
      const pointer = { x: before.x + before.width * 0.25, y: before.y + 100 };
      await page.mouse.move(pointer.x, pointer.y);

      await page.keyboard.down(modifier);
      await page.mouse.wheel(0, -30);
      await page.keyboard.up(modifier);

      await expect.poll(async () => (await box(page)).width).toBeGreaterThan(before.width * 1.1);
      const after = await box(page);
      // The spot under the pointer stays under the pointer.
      expect((pointer.x - after.x) / after.width).toBeCloseTo((pointer.x - before.x) / before.width, 3);
      expect((pointer.y - after.y) / after.height).toBeCloseTo((pointer.y - before.y) / before.height, 3);
    });
  }

  test("space + drag pans the canvas, and does not press the toggle", async ({ page }) => {
    await enterEditMode(page);
    const before = await box(page);
    const area = (await viewportArea(page).boundingBox())!;

    await page.mouse.move(area.x + 200, area.y + 200);
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(area.x + 260, area.y + 120, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Space");

    expect(await box(page)).toEqual({ ...before, x: before.x + 60, y: before.y - 80 });
    await expect(page.getByRole("button", { name: EXIT_LABEL })).toBeVisible();
  });

  test("shift + 1 zooms to fit the whole page in the window", async ({ page }) => {
    await enterEditMode(page);
    await page.keyboard.press("Shift+Digit1");

    const area = (await viewportArea(page).boundingBox())!;
    await expect
      .poll(async () => {
        const canvas = await box(page);
        return (
          canvas.x >= area.x &&
          canvas.y >= area.y &&
          canvas.x + canvas.width <= area.x + area.width &&
          canvas.y + canvas.height <= area.y + area.height
        );
      })
      .toBe(true);
    const canvas = await box(page);
    // Centered, and as large as it can be.
    expect(canvas.x - area.x).toBeCloseTo(area.x + area.width - (canvas.x + canvas.width), 0);
    expect(canvas.y - area.y).toBeCloseTo(area.y + area.height - (canvas.y + canvas.height), 0);
    expect(Math.min(area.width - canvas.width, area.height - canvas.height)).toBeLessThan(100);
  });
});

for (const [scheme, panel, area] of [
  ["light", "rgb(255, 255, 255)", "rgb(245, 245, 245)"],
  ["dark", "rgb(44, 44, 44)", "rgb(30, 30, 30)"],
] as const) {
  test(`the editor shell follows the system ${scheme} mode, the canvas keeps the page's look`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const canvas = await enterEditMode(page);

    await expect(page.getByRole("complementary", { name: "Layers" })).toHaveCSS("background-color", panel);
    await expect(page.getByRole("region", { name: "Canvas viewport" })).toHaveCSS("background-color", area);
    await expect(canvasIframe(page)).toHaveCSS("background-color", "rgb(255, 255, 255)");
    expect(await canvas.locator("h1").evaluate((el) => getComputedStyle(el).color)).toBe(
      await page.locator("h1").evaluate((el) => getComputedStyle(el).color),
    );
  });
}

test("the page underneath is paused while editing", async ({ page }) => {
  await enterEditMode(page);

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("#root") ?? null)).toBeNull();
  }
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

/** The color on screen at page point (`x`, `y`) of the canvas. */
async function canvasPixel(page: Page, x: number, y: number) {
  const iframe = canvasIframe(page);
  const box = (await iframe.boundingBox())!;
  const width = await iframe.evaluate((el: HTMLElement) => el.offsetWidth);
  const zoom = box.width / width;
  const shot = await page.screenshot({ clip: { x: box.x + x * zoom, y: box.y + y * zoom, width: 1, height: 1 } });
  return page.evaluate(async (png) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const ctx = new OffscreenCanvas(1, 1).getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, shot.toString("base64"));
}

test("a full-screen backdrop open when frozen dims the whole canvas, not just the screen it covered", async ({ page }) => {
  await page.evaluate(() => scrollTo(0, 150));
  await page.getByRole("button", { name: "Get started" }).click();
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  await enterEditMode(page);
  await page.keyboard.press("Shift+Digit1");

  // The white page margin, inside the screen the backdrop covered, above it, and below it.
  const covered = await canvasPixel(page, 20, 400);
  expect(covered).not.toEqual([255, 255, 255, 255]);
  expect(await canvasPixel(page, 20, 50)).toEqual(covered);
  expect(await canvasPixel(page, 20, pageHeight - 10)).toEqual(covered);
});

test("without a backdrop the canvas is not dimmed", async ({ page }) => {
  await enterEditMode(page);

  expect(await canvasPixel(page, 20, 50)).toEqual([255, 255, 255, 255]);
});

test("toggling back to preview mode makes the page interactive again", async ({ page }) => {
  await page.getByRole("button", { name: "Get started" }).click();
  await enterEditMode(page);

  await page.getByRole("button", { name: EXIT_LABEL }).click();

  await expect(canvasIframe(page)).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Layers" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
