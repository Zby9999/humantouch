import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { clearVernier, EXAMPLE, readVernier, VERNIER, vernierkit } from "./project-files";

/** These tests save into the example project's `.vernier/` for real. */
test.use({ keepRoundInMemory: false });

test.beforeEach(() => clearVernier(VERNIER));
test.afterAll(() => clearVernier(VERNIER));

const LOCKED_LABEL = /^Vernier Kit: applying design changes/;

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function setField(page: Page, name: string, value: string) {
  const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** Fills the three cards of the loop red and rounds their corners to 2px: two changes, saved. */
async function changeTheCards(page: Page) {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "2");
  await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(2);
}

const progress = (page: Page) => page.getByRole("progressbar", { name: "Applying design changes" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });

/** How each archived round ended. */
function results() {
  const history = `${VERNIER}history/`;
  return readdirSync(history)
    .sort()
    .map((round) => JSON.parse(readFileSync(`${history}${round}/result.json`, "utf8")));
}

test("claim folds the editor into a locked toggle; each done fills the ring and counts the badge down; finish unlocks it", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);

  await vernierkit("claim");

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(progress(page)).toHaveAttribute("aria-valuemax", "2");
  await expect(badge(page)).toHaveText("2");
  await toggle.click({ force: true });
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  await vernierkit("done", "1");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
  await expect(badge(page)).toHaveText("1");

  await vernierkit("done", "2");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "2");
  await expect(badge(page)).toHaveCount(0);

  await vernierkit("finish");
  await expect(progress(page)).toHaveCount(0);
  // A new round: edit mode freezes the page afresh.
  await enterEditMode(page);
  await expect(canvas(page).locator("article").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(results()).toMatchObject([{ ended: "finished", done: [1, 2] }]);
});

test("an edit not yet saved when the Agent claims stays out of the round", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  // Claimed well within the autosave delay of this edit.
  await setField(page, "Corner radius", "6");
  await vernierkit("claim");

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(progress(page)).toHaveAttribute("aria-valuemax", "2");
  expect(readVernier("changeset.json").changes[1].after).toBe(2);
});

test("while the round is being applied, the change list only shows what is left to do", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await vernierkit("done", "1");
  await expect(badge(page)).toHaveText("1");

  await badge(page).click();
  const list = page.getByRole("dialog", { name: "Changes" });

  await expect(list.getByText("The Agent is applying these changes.")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveText([/Corner radius.*Card.*12px → 2px/]);
  await expect(list.getByRole("button")).toHaveCount(0);
});

test("a page loaded while the round is being applied shows it locked", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await vernierkit("done", "2");

  await page.reload();

  await expect(page.getByRole("button", { name: LOCKED_LABEL })).toHaveAttribute("aria-disabled", "true");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
});

test("pressing and holding the locked toggle unlocks it: done changes are archived, the others recorded, the canvas dropped", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await vernierkit("done", "1");
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  await toggle.hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();

  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  await expect(progress(page)).toHaveCount(0);
  // Letting go was not a click on the toggle.
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  expect(results()).toMatchObject([{ ended: "unlocked", done: [1] }]);
  expect(readVernier("changeset.json")).toBeNull();
  expect(readdirSync(VERNIER)).toEqual(["history"]);
  expect(await vernierkit("last")).toContain("- **Status:** Not applied\n");
});

test("a short press on the locked toggle does nothing", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });

  await toggle.click({ force: true });

  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  expect(readVernier("state.json")).toMatchObject({ status: "claimed", done: [] });
});

/** A computed style of every card on the live page, in page order. */
function cardStyles(page: Page, property: "backgroundColor" | "borderRadius") {
  return page.locator("article").evaluateAll((cards, property) => cards.map((card) => getComputedStyle(card)[property]), property);
}

const WHITE = "rgb(255, 255, 255)";

test("the page shows the code all along: before the claim, while the round is applied, and after it", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  expect(await cardStyles(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, WHITE]);

  await vernierkit("claim");
  await vernierkit("done", "1");
  expect(await cardStyles(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await vernierkit("finish");
  expect(await cardStyles(page, "borderRadius")).toEqual(["12px", "12px", "12px", "12px"]);
});


test.describe("done checks the change on the page", () => {
  const APP = `${EXAMPLE}src/App.tsx`;
  const CSS = `${EXAMPLE}src/index.css`;
  const CARD = `${EXAMPLE}src/components/Card.tsx`;
  const originals = { [APP]: readFileSync(APP, "utf8"), [CSS]: readFileSync(CSS, "utf8"), [CARD]: readFileSync(CARD, "utf8") };
  /**
   * The three files as the dev server serves them to the page, `?t=` stamps on
   * the imports of modules it has hot-updated left out. Of the CSS, what the
   * file itself writes: Tailwind keeps every class it has seen in a source, one
   * written back out too, so the layers and properties it generates are left out.
   */
  const served = () =>
    Promise.all(
      Object.keys(originals).map(async (file) => {
        const text = (await (await fetch(`${DEV_URL}/${file.slice(EXAMPLE.length)}`)).text()).replace(/[?&]t=\d+/g, "");
        if (file !== CSS) return text;
        const css: string = JSON.parse(/^const __vite__css = (".*")$/m.exec(text)![1]);
        return css.replace(/^(@layer (theme|utilities|properties)|@property) [^\n]*\{\n[\s\S]*?^\}\n/gm, "");
      }),
    );
  let servedOriginals: string[];
  test.beforeAll(async () => {
    servedOriginals = await served();
  });
  test.afterEach(async () => {
    for (const [file, text] of Object.entries(originals)) if (readFileSync(file, "utf8") !== text) writeFileSync(file, text);
    // The dev server serves the edited code until its watcher sees the files written back: the next test's page would open on it.
    await expect.poll(served).toEqual(servedOriginals);
  });

  /** As the Agent does: an edit to the example's source, which the dev server brings into the page. */
  function editSource(file: string, from: string, to: string) {
    const text = readFileSync(file, "utf8");
    expect(text).toContain(from);
    writeFileSync(file, text.replace(from, to));
  }

  test("a change the code really makes is shown; one a page rule overrides is not, until it is fixed", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    await setField(page, "Fill color", "2563eb");
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(1);
    await vernierkit("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // A utility class: the example's own `button` rule, in no CSS layer, beats it.
    editSource(APP, 'className="mt-6 flex items-center gap-2 self-start px-4 py-2 text-white"', 'className="mt-6 flex items-center gap-2 self-start bg-[#2563eb] px-4 py-2 text-white"');
    const overridden = await vernierkit("done", "1");
    expect(overridden).toContain("Checked on the page: it does not show the change. The fill is #DC2626, not #2563EB.");

    editSource(CSS, "background: rgb(220, 38, 38);", "background: #2563eb;");
    const fixed = await vernierkit("done", "1");
    expect(fixed).toContain("Checked on the page: it shows the change.");

    expect(await vernierkit("finish")).toBe("Round finished: 1 of 1 change applied.\n");
    expect(results()).toMatchObject([{ checks: { 1: { outcome: "shown" } } }]);
  });

  test("a stroke weight is checked as the code writes it: on a 1x screen, which draws 1px and 1.5px alike, the code's 1px is not 1.5px; 3px is not; 1.5px is", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
    await setField(page, "Stroke weight", "1.5");
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(1);
    await vernierkit("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // The code is not edited yet: its 1px draws as 1.5px would on this 1x screen, and is not 1.5px all the same.
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it does not show the change. The stroke is 1px solid #E7E5E4, not 1.5px solid #E7E5E4.");

    const drawn = () => page.locator("article").first().evaluate((card) => getComputedStyle(card).borderTopWidth);
    editSource(CARD, "rounded-xl border border-stone-200", "rounded-xl border-[3px] border-stone-200");
    await expect.poll(drawn).toBe("3px");
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it does not show the change. The stroke is 3px solid #E7E5E4, not 1.5px solid #E7E5E4.");

    editSource(CARD, "border-[3px]", "border-[1.5px]");
    await expect.poll(drawn).toBe("1px");
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a stroke's color changed alone leaves the weight to the code: the reference style has none", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
    await setField(page, "Stroke color", "ff0000");
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(1);
    expect(readVernier("changeset.json").changes[0].style).toEqual({ "border-style": "solid", "border-color": "rgb(255 0 0 / 1)" });
    await vernierkit("claim");

    editSource(CARD, "border border-stone-200", "border border-[#ff0000]");
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a layout change is checked in design language: the button fills its Stack once the code stretches it", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    await page.getByRole("complementary", { name: "Design" }).getByRole("combobox", { name: "Width sizing" }).selectOption("fill");
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(1);
    await vernierkit("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    editSource(APP, "flex items-center gap-2 self-start px-4", "flex items-center gap-2 self-stretch px-4");

    expect(await vernierkit("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a size dragged on the canvas by a handle is a change of size, as the Width field makes it, and checked on the page once the code has it", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    const edge = (await page.locator('.vk-handles[data-view="Desktop"] .vk-handle[data-handle="e"]').boundingBox())!;
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2 + 12, edge.y + edge.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(1);
    const [change] = readVernier("changeset.json").changes;
    expect(change).toMatchObject({ kind: "style", property: "width", before: { type: "hug" }, after: { type: "fixed" } });
    const width: number = change.after.value;
    await vernierkit("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    expect(await vernierkit("done", "1")).toContain("Checked on the page: it does not show the change.");
    editSource(APP, "flex items-center gap-2 self-start px-4", `flex w-[${width}px] items-center gap-2 self-start px-4`);
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a layer placed freely, dragged by its top left corner: its X, Y, width and height are changes as the fields make them, each checked on the page once the code has it", async ({ page }) => {
    // In the code, a layer placed freely in the hero.
    editSource(
      APP,
      '<section className="flex h-screen flex-col justify-center" data-testid="hero">',
      '<section className="relative flex h-screen flex-col justify-center" data-testid="hero">\n        <div data-testid="pin" className="absolute top-[30px] left-[40px] h-[40px] w-[80px] bg-stone-300" />',
    );
    // Once the dev server has seen the file written.
    await expect(async () => {
      await page.goto(DEV_URL);
      await expect(page.getByTestId("pin")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await enterEditMode(page);
    const view = page.locator('iframe[title="Canvas"]');
    const zoom = await view.evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
    const pin = (await canvas(page).getByTestId("pin").boundingBox())!;
    await page.keyboard.down("Meta");
    await page.mouse.click(pin.x + pin.width / 2, pin.y + pin.height / 2);
    await page.keyboard.up("Meta");

    // Its top left corner 10 px out each way: the edges across stay.
    const corner = (await page.locator('.vk-handles[data-view="Desktop"] .vk-handle[data-handle="nw"]').boundingBox())!;
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x + corner.width / 2 - 10 * zoom, corner.y + corner.height / 2 - 10 * zoom, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(4);
    const changes: { id: number; property: string }[] = readVernier("changeset.json").changes;
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "style", property: "x", before: 40, after: 30 }),
        expect.objectContaining({ kind: "style", property: "y", before: 30, after: 20 }),
        expect.objectContaining({ kind: "style", property: "width", before: { type: "fixed", value: 80 }, after: { type: "fixed", value: 90 } }),
        expect.objectContaining({ kind: "style", property: "height", before: { type: "fixed", value: 40 }, after: { type: "fixed", value: 50 } }),
      ]),
    );
    await vernierkit("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "4");

    for (const { id } of changes) expect(await vernierkit("done", String(id))).toContain("Checked on the page: it does not show the change.");
    editSource(APP, "top-[30px] left-[40px] h-[40px] w-[80px]", "top-[20px] left-[30px] h-[50px] w-[90px]");
    for (const { id } of changes) expect(await vernierkit("done", String(id))).toContain("Checked on the page: it shows the change.");
  });

  test("a change made in the phone view is checked at the phone's width, though the window is wider", async ({ page }) => {
    await page.goto(DEV_URL);
    await page.getByRole("button", { name: TOGGLE_LABEL }).click();
    const phone = page.locator('iframe[title="Phone 390"]');
    await expect(phone.contentFrame().locator("h1")).toBeVisible();
    const box = (await phone.contentFrame().locator("article").first().boundingBox())!;
    await page.keyboard.down("Meta");
    await page.mouse.click(box.x + 4, box.y + 4);
    await page.keyboard.up("Meta");
    await setField(page, "Fill color", "ff0000");
    await expect.poll(() => readVernier("changeset.json")?.changes[0]?.breakpoint?.max).toBe(768);
    await vernierkit("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // Not applied yet: the cards are white at the phone's width too.
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it does not show the change. The fill is #FFFFFF, not #FF0000.");
    // Applied below `md` only, as the notes say: the window, 1280px wide, still shows them white.
    editSource(CARD, "bg-white p-5", "bg-white p-5 max-md:bg-[#ff0000]");
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it shows the change.");
    await expect(page.locator("article").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    // Only the page itself is left: the one loaded at the phone's width is gone.
    await expect(page.locator("iframe[data-vk-check]")).toHaveCount(0);
  });

  test("an edit that moves the layer's lines in its file: the check still finds it", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    const layers = page.getByRole("tree", { name: "Layers" });
    await layers.getByRole("treeitem", { name: "Header", exact: true }).click();
    await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Add fill" }).click();
    await setField(page, "Fill color", "e8f0ff");
    await layers.getByRole("treeitem", { name: "Button", exact: true }).click();
    await setField(page, "Fill color", "2563eb");
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(2);
    await vernierkit("claim");

    // Applying the button's fill, the Agent adds a line at the top of App.tsx: every marker below moves.
    editSource(CSS, "background: rgb(220, 38, 38);", "background: #2563eb;");
    editSource(APP, 'import { Badge, Surface } from "acme-ui";', '// Buttons are blue now.\nimport { Badge, Surface } from "acme-ui";');

    expect(await vernierkit("done", "2")).toContain("Checked on the page: it shows the change.");
  });
});
