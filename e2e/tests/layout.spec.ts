import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, expectSegmentedChanged, steadyBox, test, type Page } from "./fixtures";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

function rows(page: Page, name: string) {
  return page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

async function setField(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** A computed style of the first element matching `selector` on the canvas. */
function canvasStyle(page: Page, selector: string, property: string) {
  return canvas(page)
    .locator(selector)
    .first()
    .evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property);
}

function widthOf(page: Page, selector: string) {
  return canvas(page)
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
}

const HERO = '[data-testid="hero"]';

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("Fixed, Hug and Fill size a layer on the canvas; Fill is offered only in a Stack", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Button").click();
  const sizing = design(page).getByRole("combobox", { name: "Width sizing" });
  await expect(sizing).toHaveValue("hug");

  await sizing.selectOption("fill");
  await expect(async () => expect(await widthOf(page, `${HERO} > button`)).toBe(await widthOf(page, HERO))).toPass({ timeout: 5_000 });

  await setField(page, "Width", "200");
  await expect(sizing).toHaveValue("fixed");
  await expect.poll(() => widthOf(page, `${HERO} > button`)).toBe(200);

  // A card sits in a Grid: no Stack gives it room to fill.
  await rows(page, "Card").first().click();
  await expect(design(page).getByRole("combobox", { name: "Width sizing" }).getByRole("option", { name: "Fill" })).toBeDisabled();
  await expect(design(page).getByRole("textbox", { name: /margin/i })).toHaveCount(0);
});

test("Hug made Fixed marks its sizing, not its number, until the number changes too; the row's one reset puts Hug back (designer, 2026-11-08)", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Button").click();
  const sizing = design(page).getByRole("combobox", { name: "Width sizing" });
  const sizingField = design(page).locator(`.tk-size-row > .tk-select-field:has([aria-label="Width sizing"])`);
  const widthField = design(page).locator(`.tk-field:has([aria-label="Width"])`);
  const reset = design(page).getByRole("button", { name: /^Reset width/ });

  await sizing.selectOption("fixed");
  await expect(reset).toHaveCount(1);
  await expect(sizingField).toHaveClass(/\bis-changed\b/);
  await expect(widthField).not.toHaveClass(/\bis-changed\b/);

  await setField(page, "Width", "200");
  await expect(widthField).toHaveClass(/\bis-changed\b/);
  await expect(reset).toHaveCount(1);

  await reset.click();
  await expect(sizing).toHaveValue("hug");
  await expect(reset).toHaveCount(0);
  await expect(widthField).not.toHaveClass(/\bis-changed\b/);
  await expect(sizingField).not.toHaveClass(/\bis-changed\b/);
});

test("a size typed in stays as typed, though the browser lays it out to 1/64 px (139.74 is drawn 139.734)", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Button").click();
  const width = design(page).getByRole("textbox", { name: "Width", exact: true });

  await setField(page, "Width", "150");
  await expect(width).toHaveValue("150");
  await setField(page, "Width", "139.74");
  await expect(width).toHaveValue("139.74");
  await expect.poll(() => widthOf(page, `${HERO} > button`)).toBeCloseTo(139.734, 2);
});

test("Wrap alone brings no Stack reset, nor one of its own; Wrap and the gap bring the Stack's, which takes both back (designer, 2026-11-08)", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Header").click();
  const panel = design(page);
  const reset = panel.getByRole("button", { name: "Reset Stack" });
  const wrap = panel.getByRole("button", { name: "Wrap", exact: true });
  const gap = panel.getByRole("textbox", { name: "Gap" });
  await expect(wrap).toHaveAttribute("aria-pressed", "false");

  await wrap.click();
  await expect(wrap).toHaveAttribute("aria-pressed", "true");
  await expect(wrap).toHaveClass(/\bis-changed\b/);
  await expect(panel.getByRole("button", { name: /^Reset wrap/i })).toHaveCount(0);
  await expect(reset).toHaveCount(0);

  await setField(page, "Gap", "30");
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(wrap).toHaveAttribute("aria-pressed", "false");
  await expect(wrap).not.toHaveClass(/\bis-changed\b/);
  await expect(gap).toHaveValue("12");
  await expect(reset).toHaveCount(0);
  await expect.poll(() => canvasStyle(page, "header", "flex-wrap")).toBe("nowrap");
});

test("a Stack's direction changed: its track in the accent, the one chosen white, its reset at the track's end taking it back; undone, grey again; it counts for the Stack's reset (designer, 2026-11-08)", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Header").click();
  const panel = design(page);
  const direction = panel.getByRole("radiogroup", { name: "Direction" });
  const vertical = direction.getByRole("radio", { name: "Vertical" });
  const reset = direction.getByRole("button", { name: "Reset direction" });
  const stackReset = panel.getByRole("button", { name: "Reset Stack" });
  const track = () => direction.evaluate((el) => getComputedStyle(el).backgroundColor);
  const grey = await track();
  await expect(direction).not.toHaveClass(/\bis-changed\b/);
  await expect(reset).toHaveCount(0);

  await vertical.click();
  await expect.poll(() => canvasStyle(page, "header", "flex-direction")).toBe("column");
  await expectSegmentedChanged(direction, vertical, reset);
  await expect(stackReset).toHaveCount(0);

  // Its own reset takes it back; the track eases back to grey.
  await reset.click();
  await expect.poll(() => canvasStyle(page, "header", "flex-direction")).toBe("row");
  await expect(reset).toHaveCount(0);
  await expect.poll(track).toBe(grey);

  // Undone, the same.
  await vertical.click();
  await expectSegmentedChanged(direction, vertical, reset);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => canvasStyle(page, "header", "flex-direction")).toBe("row");
  await expect(direction).not.toHaveClass(/\bis-changed\b/);
  await expect(reset).toHaveCount(0);
  await expect.poll(track).toBe(grey);

  // With the gap, the Stack's reset, which takes both back.
  await vertical.click();
  await setField(page, "Gap", "30");
  await expect(stackReset).toBeVisible();
  await stackReset.click();
  await expect.poll(() => canvasStyle(page, "header", "flex-direction")).toBe("row");
  await expect(reset).toHaveCount(0);
  await expect.poll(track).toBe(grey);
});

test("a Stack's direction, gap, padding and alignment, in design language", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Header").click();
  const stack = design(page);
  await expect(stack.getByRole("textbox", { name: "Gap" })).toHaveValue("12");
  await expect(stack.getByRole("radio", { name: "Center left" })).toBeChecked();
  await expect(stack.getByRole("radio", { name: "Horizontal" })).toBeChecked();

  await stack.getByRole("radio", { name: "Bottom right" }).click();
  await expect.poll(() => canvasStyle(page, "header", "justify-content")).toBe("flex-end");
  await expect.poll(() => canvasStyle(page, "header", "align-items")).toBe("flex-end");
  await setField(page, "Gap", "24");
  const gap = await canvas(page)
    .locator("header")
    .evaluate((header) => header.children[1].getBoundingClientRect().left - header.children[0].getBoundingClientRect().right);
  expect(gap).toBe(24);
  await stack.getByRole("radio", { name: "Vertical" }).click();
  await expect.poll(() => canvasStyle(page, "header", "flex-direction")).toBe("column");
  // Distributed evenly: the gap's Auto, as Figma has it (designer, 2026-11-07).
  await stack.getByRole("combobox", { name: "Gap sizing" }).selectOption("auto");
  await expect.poll(() => canvasStyle(page, "header", "justify-content")).toBe("space-between");
  // Last: the Variables the padding field lists as it is typed into stay open over the rows above it.
  await setField(page, "Padding left", "10");
  await expect.poll(() => canvasStyle(page, "header", "padding-left")).toBe("10px");
});

test("the alignment grid: half the row, its point dark till it changes, then the accent with where it was drawn larger (designer, 2026-11-08)", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Header").click();
  const panel = design(page);
  const grid = panel.getByRole("radiogroup", { name: "Alignment" });

  // Half the row each, the grid's right edge at the left padding field's.
  const row = await steadyBox(panel.locator(".tk-align-row"));
  const box = await steadyBox(grid);
  const options = await steadyBox(panel.locator(".tk-align-options"));
  const top = await steadyBox(panel.getByRole("group", { name: "Padding" }).locator(":scope > *").first());
  expect(Math.abs(box.width - options.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - (row.width - 4) / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.x + box.width - (top.x + top.width))).toBeLessThanOrEqual(1);

  const point = (name: string) => grid.getByRole("radio", { name, exact: true });
  // Each point the whole of its third, to click on; its mark where the lines cross, at 5/24, half and 19/24 across and down (designer, 2026-11-08).
  const AT = [5 / 24, 1 / 2, 19 / 24];
  const NAMES = [
    ["Top left", "Top center", "Top right"],
    ["Center left", "Center", "Center right"],
    ["Bottom left", "Bottom center", "Bottom right"],
  ];
  // The lines: 0.5px wide, 6px in from the edges; each `calc(p% ± c px)` placed in that box, its middle at AT (across, then down).
  const lines = await grid.evaluate((el) => {
    const style = getComputedStyle(el, "::before");
    return { x: style.backgroundPositionX, y: style.backgroundPositionY };
  });
  const middles = (positions: string, size: number) =>
    positions.split(",").map((position) => {
      const percent = parseFloat(/(-?[\d.]+)%/.exec(position)?.[1] ?? "0");
      const px = parseFloat(/([-+]\s*[\d.]+)px/.exec(position)?.[1]?.replace(/\s/g, "") ?? "0");
      return 6 + ((size - 12 - 0.5) * percent) / 100 + px + 0.25;
    });
  const across = middles(lines.x, box.width).slice(0, 3);
  const down = middles(lines.y, box.height).slice(3);
  for (const [i, at] of AT.entries()) {
    expect(Math.abs(across[i]! - box.width * at)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(down[i]! - box.height * at)).toBeLessThanOrEqual(0.5);
  }
  for (const [row, names] of NAMES.entries()) {
    for (const [column, name] of names.entries()) {
      const third = await steadyBox(point(name));
      expect(Math.abs(third.width - box.width / 3)).toBeLessThanOrEqual(1);
      expect(Math.abs(third.height - box.height / 3)).toBeLessThanOrEqual(1);
      const offset = await point(name).evaluate((el) => {
        const style = getComputedStyle(el, "::before");
        return { x: parseFloat(style.left) || 0, y: parseFloat(style.top) || 0 };
      });
      const x = third.x + third.width / 2 + offset.x - box.x;
      const y = third.y + third.height / 2 + offset.y - box.y;
      expect(Math.abs(x - box.width * AT[column]!)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(y - box.height * AT[row]!)).toBeLessThanOrEqual(0.5);
    }
  }

  const mark = (name: string) =>
    point(name).evaluate((el) => {
      const style = getComputedStyle(el, "::before");
      return { color: style.backgroundColor, width: parseFloat(style.width) };
    });
  const DARK = "rgb(38, 38, 37)";
  await expect(point("Center left")).toBeChecked();
  await expect.poll(async () => (await mark("Center left")).color).toBe(DARK);

  await point("Bottom right").click();
  await expect(point("Bottom right")).toBeChecked();
  const accent = await panel.evaluate((el) => {
    const probe = el.appendChild(document.createElement("i"));
    probe.style.color = "var(--tk-accent)";
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect.poll(async () => (await mark("Bottom right")).color).toBe(accent);
  // Where it was: larger than the points around it.
  const before = await mark("Center left");
  const other = await mark("Top center");
  expect(before.width).toBeGreaterThan(other.width);

  await point("Bottom right").blur();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(point("Center left")).toBeChecked();
  await expect.poll(async () => (await mark("Center left")).color).toBe(DARK);
  await expect.poll(async () => (await mark("Bottom right")).width).toBe(other.width);
  expect((await mark("Top center")).width).toBe(other.width);
  await expect(grid.locator(".is-before")).toHaveCount(0);
});

test("a plain top-to-bottom flow shows as a vertical Stack, and becomes a real one once its gap changes", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  await expect(design(page).getByRole("radio", { name: "Vertical" })).toBeChecked();
  await expect.poll(() => canvasStyle(page, "article", "display")).toBe("block");

  await setField(page, "Gap", "8");

  await expect.poll(() => canvasStyle(page, "article", "display")).toBe("flex");
  await expect.poll(() => canvasStyle(page, "article", "flex-direction")).toBe("column");
  await expect.poll(() => canvasStyle(page, "article", "row-gap")).toBe("8px");
});

test("opacity, clipping, and a hidden layer that stays in the layer tree and the panel, to be shown again", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();

  await setField(page, "Opacity", "50");
  await expect.poll(() => canvasStyle(page, "article", "opacity")).toBe("0.5");
  await design(page).getByRole("checkbox", { name: "Clip content" }).check();
  await expect.poll(() => canvasStyle(page, "article", "overflow")).toBe("hidden");

  await design(page).getByRole("checkbox", { name: "Visible" }).uncheck();
  await expect.poll(() => canvasStyle(page, "article", "display")).toBe("none");
  await expect(rows(page, "Card")).toHaveCount(4);
  await expect(rows(page, "Card").first()).toHaveAttribute("aria-selected", "true");
  // Hidden, it stays selected and the panel stays as it was, Visible where it was, to be ticked again.
  await expect(design(page).getByRole("textbox", { name: "Opacity", exact: true })).toHaveValue("50%");
  await expect(design(page).getByRole("combobox", { name: "Width sizing" })).toBeVisible();

  await design(page).getByRole("checkbox", { name: "Visible" }).check();
  await expect.poll(() => canvasStyle(page, "article", "display")).toBe("block");
});

test("an absolute layer's X and Y are the page's own, even frozen scrolled down", async ({ page }) => {
  await page.evaluate(() => scrollTo(0, 120));
  await page.getByRole("button", { name: "Get started" }).click();
  await enterEditMode(page);
  // The dialog's dimmed backdrop: fixed, at the top of the window.
  await rows(page, "Dialog").first().click();
  await expect(design(page).getByRole("textbox", { name: "Y", exact: true })).toHaveValue("0");

  await setField(page, "Y", "10");
  const top = await canvas(page)
    .locator('[role="dialog"]')
    .evaluate((dialog) => dialog.parentElement!.getBoundingClientRect().top);
  expect(top).toBe(130);
});

test("a locked layer offers its size and nothing else", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Badge").click();

  await expect(design(page).getByText(/can only be moved and resized as a whole/)).toBeVisible();
  await expect(design(page).getByRole("combobox", { name: "Width sizing" })).toBeVisible();
  await expect(design(page).getByRole("textbox", { name: "Opacity", exact: true })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Min width" })).toHaveCount(0);
  await expect(design(page).getByRole("group", { name: "Fill" })).toHaveCount(0);
});

test("several layers: values they do not share show as Mixed, and one change sets them all, undone together", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  await setField(page, "Corner radius", "4");

  await rows(page, "Card").nth(3).click({ modifiers: ["Shift"] });
  await expect(design(page).getByRole("heading", { name: "2 layers" })).toBeVisible();
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveValue("Mixed");
  await expect(design(page).getByRole("textbox", { name: "Opacity", exact: true })).toHaveValue("100%");

  await setField(page, "Corner radius", "8");
  const radii = () => canvas(page).locator("article").evaluateAll((cards) => cards.map((card) => getComputedStyle(card).borderRadius));
  await expect.poll(() => radii()).toEqual(["8px", "8px", "8px", "8px"]);

  await design(page).getByRole("textbox", { name: "Corner radius" }).blur();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => radii()).toEqual(["4px", "4px", "4px", "12px"]);
});

test("⇧ + click on the canvas adds a layer to the selection", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  // The canvas takes no pointer input itself: the click goes to where the card is drawn.
  const box = (await canvas(page).locator("article").nth(3).boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Shift");

  await expect(design(page).getByRole("heading", { name: "2 layers" })).toBeVisible();
  await expect(page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { selected: true })).toHaveCount(2);
});

test("a new size and gap show when the canvas is played at full size", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Button").click();
  await design(page).getByRole("combobox", { name: "Width sizing" }).selectOption("fill");
  await rows(page, "Card").first().click();
  await setField(page, "Gap", "8");
  await page.getByRole("button", { name: "Full screen Desktop view", exact: true }).click();

  const button = canvas(page).locator(`${HERO} > button`);
  await expect(async () =>
    expect(await button.evaluate((el) => el.getBoundingClientRect().width)).toBe(await canvas(page).locator(HERO).evaluate((el) => el.getBoundingClientRect().width)),
  ).toPass({ timeout: 5_000 });
  await expect(canvas(page).locator("article").first()).toHaveCSS("display", "flex");
  await expect(canvas(page).locator("article").first()).toHaveCSS("row-gap", "8px");
});

test("a minimum or maximum size is added from its field's menu, the width's or the height's, as a row of its own, and taken off with its minus", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  // None set: none shown until one is added (designer, 2026-11-07).
  await expect(design(page).getByRole("textbox", { name: "Min width", exact: true })).toHaveCount(0);
  const widthMenu = page.getByRole("dialog", { name: "Add min or max width" });
  await design(page).getByRole("button", { name: "Add min or max width" }).click();
  await expect(widthMenu.getByRole("option")).toHaveText(["Min width", "Max width"]);
  await page.keyboard.press("Escape");
  const heightMenu = page.getByRole("dialog", { name: "Add min or max height" });
  await design(page).getByRole("button", { name: "Add min or max height" }).click();
  await expect(heightMenu.getByRole("option")).toHaveText(["Min height", "Max height"]);
  await heightMenu.getByRole("option", { name: "Max height", exact: true }).click();

  // That one alone comes in, and its menu no longer lists it.
  const maxHeight = design(page).getByRole("textbox", { name: "Max height", exact: true });
  await expect(maxHeight).toHaveValue("");
  await expect(design(page).getByRole("textbox", { name: /^(Min width|Max width|Min height)$/ })).toHaveCount(0);
  await design(page).getByRole("button", { name: "Add min or max height" }).click();
  await expect(heightMenu.getByRole("option")).toHaveText(["Min height"]);
  await page.keyboard.press("Escape");

  await maxHeight.fill("120");
  await maxHeight.press("Enter");
  await expect.poll(() => canvasStyle(page, "article", "max-height")).toBe("120px");

  await design(page).getByRole("button", { name: "Remove max height" }).click();
  await expect(maxHeight).toHaveCount(0);
  await expect.poll(() => canvasStyle(page, "article", "max-height")).toBe("none");
});

test("the width and height fields' menus show while the field is hovered", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  const add = design(page).getByRole("button", { name: "Add min or max width" });
  await page.mouse.move(0, 0);
  await expect(add).toHaveCSS("opacity", "0");
  await design(page).getByRole("textbox", { name: "Width", exact: true }).hover();
  await expect(add).toHaveCSS("opacity", "1");
});

test("dragging left and right on the opacity icon changes it, 1% per px", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  const opacity = design(page).getByRole("textbox", { name: "Opacity", exact: true });
  const icon = page.locator('.tk-field:has([aria-label="Opacity"]) .tk-scrub');
  const { x, y } = (await icon.boundingBox())!;

  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(x + 4 - i, y + 4);
  await page.mouse.up();

  await expect(opacity).toHaveValue("70%");
  await expect.poll(() => canvasStyle(page, "article", "opacity")).toBe("0.7");
  // It stops at 100%.
  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(x + 4 + i, y + 4);
  await page.mouse.up();
  await expect(opacity).toHaveValue("100%");
});
