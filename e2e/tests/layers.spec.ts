import { expect, test, type Page } from "./fixtures";
import { readFileSync } from "node:fs";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

const exampleRoot = new URL("../../examples/vite-react19-tw4/", import.meta.url);

/** `file:line:column` of the `nth` occurrence of `snippet` in an example source file. */
function locate(file: string, snippet: string, nth = 0) {
  const lines = readFileSync(new URL(file, exampleRoot), "utf8").split("\n");
  const found = lines.flatMap((text, i) => (text.includes(snippet) ? [i] : []));
  const line = found[nth];
  if (line === undefined) throw new Error(`${snippet} not found in ${file}`);
  return `${file}:${line + 1}:${lines[line].indexOf(snippet) + 1}`;
}

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

function layerTree(page: Page) {
  return page.getByRole("tree", { name: "Layers" });
}

/** Every row of the layer tree as `level name — type`, in order. */
async function treeRows(page: Page) {
  await expect(layerTree(page).getByRole("treeitem").first()).toBeVisible();
  return layerTree(page)
    .getByRole("treeitem")
    .evaluateAll((rows) =>
      rows.map((row) => `${row.getAttribute("aria-level")} ${row.textContent!.trim()} — ${row.getAttribute("aria-description")}`),
    );
}

/** The middle of an element on the canvas, in page coordinates. */
async function pointOn(page: Page, selector: string) {
  const box = (await canvas(page).locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The middle of a run of text on the canvas, in page coordinates. */
async function pointOnText(page: Page, text: string) {
  const iframe = page.locator('iframe[title="Canvas"]');
  const box = (await iframe.boundingBox())!;
  const rect = await iframe.evaluate((frame: HTMLIFrameElement, text) => {
    const doc = frame.contentDocument!;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.textContent!.trim() !== text) continue;
      const range = doc.createRange();
      range.selectNodeContents(walker.currentNode);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, zoom: frame.getBoundingClientRect().width / frame.offsetWidth };
    }
    throw new Error(`${text} not found on the canvas`);
  }, text);
  return { x: box.x + (rect.x + rect.width / 2) * rect.zoom, y: box.y + (rect.y + rect.height / 2) * rect.zoom, width: rect.width * rect.zoom };
}

async function clickOn(page: Page, selector: string, modifier?: "Meta" | "Control") {
  const { x, y } = await pointOn(page, selector);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.click(x, y);
  if (modifier) await page.keyboard.up(modifier);
}

async function doubleClickOn(page: Page, selector: string) {
  const { x, y } = await pointOn(page, selector);
  await page.mouse.dblclick(x, y);
}

function selectedRow(page: Page) {
  return layerTree(page).getByRole("treeitem", { selected: true });
}

/** What the top of the Design panel says about the selected layer, term by term. */
async function layerInfo(page: Page) {
  const panel = page.getByRole("complementary", { name: "Design" });
  await expect(panel.getByRole("term").first()).toBeVisible();
  return panel.getByRole("term").evaluateAll((terms) =>
    Object.fromEntries(terms.map((term) => [term.textContent, term.nextElementSibling!.textContent])),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("the layer tree shows the page structure, named after components, text and what elements are for", async ({ page }) => {
  await enterEditMode(page);

  expect(await treeRows(page)).toEqual([
    "1 Stack — Vertical Stack",
    "2 App — Vertical Stack",
    "3 Stack — Vertical Stack",
    "4 Header — Horizontal Stack",
    "5 Vernier Kit — Text",
    "5 Badge — Locked",
    "4 A Framer-style editor layer for any page. — Text",
    "4 Button — Horizontal Stack",
    "5 Get started — Text",
    "5 Vector — Image",
    "3 Grid — Grid",
    "4 Card — Vertical Stack",
    "5 Freeze — Text",
    "5 Turn the current page into a canvas. — Text",
    "4 Card — Vertical Stack",
    "5 Arrange — Text",
    "5 Drag layers, build Stacks, tune spacing. — Text",
    "4 Card — Vertical Stack",
    "5 Apply — Text",
    "5 Your Agent writes the changes into code. — Text",
    "4 Card — Vertical Stack",
    "5 Your turn — Text",
    "5 Open the editor and try it. — Text",
  ]);
});

test("on a large page, deeper levels start collapsed and open up to the selected layer", async ({ page }) => {
  await page.evaluate(() => {
    const list = document.createElement("ul");
    list.innerHTML = Array.from({ length: 300 }, (_, i) => `<li><span style="display: block">Row ${i}</span></li>`).join("");
    document.body.append(list);
  });
  await enterEditMode(page);
  await expect(layerTree(page).getByRole("treeitem", { name: "Row 250" })).toHaveCount(0);

  await page.keyboard.press("Shift+Digit1");
  await clickOn(page, "li:nth-child(251) span", "Meta");

  await expect(selectedRow(page)).toHaveText("Row 250");
  await expect(selectedRow(page)).toBeInViewport();
});

test("each part of the page shows up as Stack, Grid, Frame, text or a locked layer", async ({ page }) => {
  await page.getByRole("button", { name: "Get started" }).click();
  await page.evaluate(() => {
    const kinds = document.createElement("div");
    kinds.innerHTML = `
      <div style="position: absolute; top: 0; left: 0">Pinned note</div>
      <div><span style="display: inline-block">Left</span><span style="display: inline-block">Right</span></div>
      <div><div style="float: left; width: 10px; height: 10px"></div></div>
      <p>Plain, <b>bold</b> and <a href="#">linked</a> text</p>
      <div style="display: flex; flex-direction: row-reverse"><img alt="Logo" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><svg width="8" height="8"></svg></div>
      <div style="display: contents"><p>Passed through</p></div>
      <div style="display: none"><p>Hidden</p></div>
    `;
    document.body.append(kinds);
  });

  await enterEditMode(page);

  const rows = await treeRows(page);
  // The dialog's dimmed backdrop: fixed, laid out as a grid.
  expect(rows).toContain("3 Dialog — Grid · Absolute");
  expect(rows.slice(rows.lastIndexOf("1 Stack — Vertical Stack"))).toEqual([
    "1 Stack — Vertical Stack",
    "2 Pinned note — Text · Absolute",
    "2 Frame — Frame",
    "3 Left — Text",
    "3 Right — Text",
    "2 Frame — Frame",
    "3 Frame — Frame",
    "2 Plain, bold and linked text — Text",
    "2 Stack — Horizontal Stack",
    "3 Logo — Image",
    "3 Vector — Image",
    "2 Passed through — Text",
  ]);
});

test.describe("selecting layers on the canvas", () => {
  test("a click selects the outermost layer under the pointer", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "h1");

    await expect(selectedRow(page)).toHaveText("Stack");
    await expect(selectedRow(page)).toHaveAttribute("aria-level", "1");
  });

  test("each double click goes one layer deeper", async ({ page }) => {
    await enterEditMode(page);

    await doubleClickOn(page, "h1");
    await expect(selectedRow(page)).toHaveText("App");
    await doubleClickOn(page, "h1");
    await expect(selectedRow(page)).toHaveText("Stack");
    await expect(selectedRow(page)).toHaveAttribute("aria-level", "3");
    await doubleClickOn(page, "h1");
    await doubleClickOn(page, "h1");
    await expect(selectedRow(page)).toHaveText("Vernier Kit");
  });

  test("double clicks do not select the page's text the way a browser would", async ({ page }) => {
    await enterEditMode(page);

    await doubleClickOn(page, "h1");
    await doubleClickOn(page, "h1");

    expect(await page.evaluate(() => getSelection()!.type)).not.toBe("Range");
  });

  test("once inside, a click selects the layer beside the selection", async ({ page }) => {
    await enterEditMode(page);
    await clickOn(page, "article h3", "Meta");
    await expect(selectedRow(page)).toHaveText("Freeze");

    await clickOn(page, "article:nth-of-type(2) h3");
    await expect(selectedRow(page)).toHaveText("Card");
    await expect(selectedRow(page)).toHaveAttribute("aria-level", "4");
  });

  for (const modifier of ["Meta", "Control"] as const) {
    test(`${modifier} + click selects the deepest layer under the pointer`, async ({ page }) => {
      await enterEditMode(page);

      await clickOn(page, "article p", modifier);

      await expect(selectedRow(page)).toHaveText("Turn the current page into a canvas.");
    });
  }

  test("layers the page lets clicks pass through can still be selected", async ({ page }) => {
    await page.evaluate(() => {
      const note = document.createElement("p");
      note.textContent = "Decoration";
      note.style.pointerEvents = "none";
      document.body.append(note);
    });
    await enterEditMode(page);

    await clickOn(page, "body > p", "Meta");

    await expect(selectedRow(page)).toHaveText("Decoration");
  });

  test("Esc goes back up one layer at a time, then clears the selection", async ({ page }) => {
    await enterEditMode(page);
    await clickOn(page, "article p", "Meta");

    await page.keyboard.press("Escape");
    await expect(selectedRow(page)).toHaveText("Card");
    await page.keyboard.press("Escape");
    await expect(selectedRow(page)).toHaveText("Grid");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(selectedRow(page)).toHaveText("Stack");
    await page.keyboard.press("Escape");
    await expect(selectedRow(page)).toHaveCount(0);
  });

  test("a click on a row of the layer tree selects that layer", async ({ page }) => {
    await enterEditMode(page);

    await layerTree(page).getByRole("treeitem", { name: "Get started" }).click();

    await expect(selectedRow(page)).toHaveText("Get started");
  });
});

test.describe("the Design panel says where the selected layer comes from", () => {
  test("the component it belongs to and its source location", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "article h3", "Meta");

    expect(await layerInfo(page)).toEqual({
      Type: "Text",
      Component: "Card",
      Source: locate("src/components/Card.tsx", "<h3"),
      // Written once in Card, repeated in each card the loop renders; the card written on its own is another usage.
      Repeated: "In 3 instances",
    });
  });

  test("an instance: where the component is used, and how many instances that usage renders", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "article h3", "Meta");
    await page.keyboard.press("Escape");

    expect(await layerInfo(page)).toEqual({
      Type: "Vertical Stack",
      Component: "Card",
      Source: locate("src/components/Card.tsx", "<article"),
      Usage: locate("src/App.tsx", "<Card"),
      Instances: "3",
    });
  });

  test("an instance its usage renders only once", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "article:nth-of-type(4) h3", "Meta");
    await page.keyboard.press("Escape");

    expect(await layerInfo(page)).toEqual({
      Type: "Vertical Stack",
      Component: "Card",
      Source: locate("src/components/Card.tsx", "<article"),
      Usage: locate("src/App.tsx", "<Card", 1),
    });
  });

  test("a locked layer: the dependency and where the project uses it", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "[data-testid=acme-badge]", "Meta");

    expect(await layerInfo(page)).toEqual({
      Type: "Locked",
      Component: "Badge",
      Usage: locate("src/App.tsx", "<Badge"),
    });
  });

  test("a dependency component that passes its props on: edited like project code, where it is used", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "article h3", "Meta");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await expect(selectedRow(page)).toHaveText("Grid");
    expect(await layerInfo(page)).toEqual({ Type: "Grid", Component: "App", Source: locate("src/App.tsx", "<Surface") });
  });

  test("a layer without a source marker is not located", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "h1");

    expect(await layerInfo(page)).toEqual({ Type: "Vertical Stack", Source: "Not located" });
  });
});

test.describe("text beside other layers", () => {
  test("is a text layer of its own, whose text styles apply to the layer it sits in", async ({ page }) => {
    await enterEditMode(page);
    const text = await pointOnText(page, "Get started");

    await page.keyboard.down("Meta");
    await page.mouse.click(text.x, text.y);
    await page.keyboard.up("Meta");

    await expect(selectedRow(page)).toHaveText("Get started");
    expect(await layerInfo(page)).toEqual({ Type: "Text", Component: "App", Source: locate("src/App.tsx", "<button") });
    await expect(page.getByRole("complementary", { name: "Design" })).toContainText("Text styles apply to the layer it sits in, Button.");
    // Outlines the text only, not the whole button.
    const outline = (await page.locator('.vk-selection[data-view="Desktop"]').boundingBox())!;
    expect(outline.width).toBeCloseTo(text.width, 0);
  });

  test("a click on the space around it selects the layer it sits in", async ({ page }) => {
    await enterEditMode(page);
    await page.keyboard.down("Meta");
    const text = await pointOnText(page, "Get started");
    const button = (await canvas(page).getByRole("button", { name: "Get started" }).boundingBox())!;
    await page.mouse.click(text.x, button.y + 2);
    await page.keyboard.up("Meta");

    await expect(selectedRow(page)).toHaveText("Button");
    await expect(selectedRow(page)).toHaveAttribute("aria-level", "4");
  });
});

test.describe("the selection box", () => {
  const box = (page: Page) => page.locator('.vk-selection[data-view="Desktop"]');

  test("outlines the selected layer in blue", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "h1", "Meta");

    await expect(box(page)).toHaveCSS("border-color", "rgb(13, 153, 255)");
    const outline = (await box(page).boundingBox())!;
    const h1 = (await canvas(page).locator("h1").boundingBox())!;
    for (const key of ["x", "y", "width", "height"] as const) expect(outline[key]).toBeCloseTo(h1[key], 0);
  });

  test("is purple on an instance", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "article h3", "Meta");
    await page.keyboard.press("Escape");

    await expect(selectedRow(page)).toHaveText("Card");
    await expect(box(page)).toHaveCSS("border-color", "rgb(151, 71, 255)");
  });

  test("is gray with a lock on a locked layer, which a double click cannot enter", async ({ page }) => {
    await enterEditMode(page);

    // The dot is inside the dependency's own markup: the whole Badge is selected.
    await clickOn(page, "[data-testid=acme-badge] span", "Meta");
    await expect(selectedRow(page)).toHaveText("Badge");
    await doubleClickOn(page, "[data-testid=acme-badge] span");

    await expect(selectedRow(page)).toHaveText("Badge");
    await expect(box(page)).toHaveCSS("border-color", "rgb(140, 140, 140)");
    await expect(box(page).locator(".vk-selection-lock")).toBeVisible();
  });

  test("follows the layer when the canvas zooms", async ({ page }) => {
    await enterEditMode(page);
    await clickOn(page, "h1", "Meta");

    await page.keyboard.press("Shift+Digit1");

    await expect
      .poll(async () => {
        const outline = (await box(page).boundingBox())!;
        const h1 = (await canvas(page).locator("h1").boundingBox())!;
        return Math.abs(outline.x - h1.x) + Math.abs(outline.width - h1.width);
      })
      .toBeLessThan(1);
  });
});

test.describe("the hover outline", () => {
  const hover = (page: Page) => page.locator('.vk-hover[data-view="Desktop"]');
  const rect = async (locator: ReturnType<Page["locator"]>) => {
    const { x, y, width, height } = (await locator.boundingBox())!;
    return [x, y, width, height].map(Math.round);
  };

  test("outlines the layer a click would select, and with ⌘ held, the deepest one", async ({ page }) => {
    await enterEditMode(page);
    const h1 = await pointOn(page, "h1");

    await page.mouse.move(h1.x, h1.y);
    const outermost = await rect(hover(page));
    await page.keyboard.down("Meta");
    await expect.poll(() => rect(hover(page))).toEqual(await rect(canvas(page).locator("h1")));
    await page.keyboard.up("Meta");
    await expect.poll(() => rect(hover(page))).toEqual(outermost);

    await page.mouse.click(h1.x, h1.y);
    expect(await rect(page.locator('.vk-selection[data-view="Desktop"]'))).toEqual(outermost);
  });

  test("is not drawn over the selected layer, and goes when the pointer leaves the canvas", async ({ page }) => {
    await enterEditMode(page);

    await clickOn(page, "h1", "Meta");
    await page.keyboard.down("Meta");
    await expect(hover(page)).toHaveCount(0);
    await page.keyboard.up("Meta");
    const text = await pointOn(page, "header + p");
    await page.mouse.move(text.x, text.y);
    await expect(hover(page)).toHaveCount(1);

    await layerTree(page).hover();
    await expect(hover(page)).toHaveCount(0);
  });
});
