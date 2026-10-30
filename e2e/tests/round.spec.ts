import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { clearVernier, EXAMPLE, readVernier, VERNIER, vernierkit } from "./project-files";

/** These tests save into the example project's `.vernier/` for real. */
test.use({ keepRoundInMemory: false });

test.beforeEach(() => clearVernier(VERNIER));
test.afterAll(() => clearVernier(VERNIER));

const CARD = `${EXAMPLE}src/components/Card.tsx`;
const originalCard = readFileSync(CARD, "utf8");
test.afterEach(async () => {
  if (readFileSync(CARD, "utf8") === originalCard) return;
  writeFileSync(CARD, originalCard);
  // The next test's page must open on the Card as it was.
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text()).includes("rounded-xl border border-stone-200 bg-white")).toBe(true);
});

/** As the Agent does: one of the changes `changeTheCards` makes, written into the Card. */
const CARD_EDITS = { fill: ["bg-white", "bg-[#ff0000]"], radius: ["rounded-xl", "rounded-[2px]"] } as const;
async function applyToCard(page: Page, which: keyof typeof CARD_EDITS) {
  const [from, to] = CARD_EDITS[which];
  writeFileSync(CARD, readFileSync(CARD, "utf8").replace(from, to));
  const [property, value] = which === "fill" ? (["backgroundColor", "rgb(255, 0, 0)"] as const) : (["borderTopLeftRadius", "2px"] as const);
  await expect.poll(() => page.locator("article").first().evaluate((card, name) => getComputedStyle(card)[name], property)).toBe(value);
}

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

test("claim folds the editor into a locked toggle; as the page shows each change the ring fills and the badge counts down, done or not; finish unlocks it", async ({ page }) => {
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

  // Done before the code has it: the page does not show it, and it does not count.
  expect(await vernierkit("done", "1")).toContain("Change 1 done: 0 of 2 changes applied.");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");

  await applyToCard(page, "fill");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
  await expect(badge(page)).toHaveText("1");
  // No done for this one: the page shows it all the same.
  await applyToCard(page, "radius");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "2");
  await expect(badge(page)).toHaveCount(0);

  expect(await vernierkit("finish")).toBe("Round finished: 2 of 2 changes applied.\n");
  await expect(progress(page)).toHaveCount(0);
  expect(results()).toMatchObject([{ ended: "finished", done: [1], applied: [1, 2], checks: { 1: { outcome: "shown" }, 2: { outcome: "shown" } } }]);
});

test("done for several changes at once: each with how the page checked it, those the page shows already at once", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await applyToCard(page, "fill");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  const output = await vernierkit("done", "1", "2");

  expect(output).toContain("Changes 1 and 2 done: 1 of 2 changes applied.\n");
  expect(output).toContain("Change 1: checked on the page: it shows the change.\n");
  expect(output).toContain("Change 2: checked on the page: it does not show the change. The corner radius is 12px, not 2px.");
});

test("an edit not yet saved when the Agent claims stays out of the round", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  // The edit's save is on its way when the Agent claims: held till then, however busy the machine is.
  let claimed!: () => void;
  const claim = new Promise<void>((resolve) => (claimed = resolve));
  let saving!: () => void;
  const saveSent = new Promise<void>((resolve) => (saving = resolve));
  await page.route(
    (url) => url.hostname === "127.0.0.1" && url.pathname === "/round",
    async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      saving();
      await claim;
      await route.continue();
    },
  );
  await setField(page, "Corner radius", "6");
  await saveSent;
  await vernierkit("claim");
  claimed();

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(progress(page)).toHaveAttribute("aria-valuemax", "2");
  expect(readVernier("changeset.json").changes[1].after).toBe(2);
});

test("while the round is being applied, the change list only shows what is left to do", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await applyToCard(page, "fill");
  await expect(badge(page)).toHaveText("1");

  await badge(page).click();
  const list = page.getByRole("dialog", { name: "Changes" });

  await expect(list.getByText("The Agent is applying these changes.")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveText([/Corner radius.*Card.*12px → 2px/]);
  await expect(list.getByRole("button")).toHaveCount(0);
});

test("a page loaded while the round is being applied shows it locked, with what the page shows so far", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await applyToCard(page, "radius");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  await page.reload();

  await expect(page.getByRole("button", { name: LOCKED_LABEL })).toHaveAttribute("aria-disabled", "true");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
});

test("pressing and holding the locked toggle unlocks it: changes the page shows are archived as applied, the others recorded, the canvas dropped", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await applyToCard(page, "fill");
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
  expect(results()).toMatchObject([{ ended: "unlocked", done: [], applied: [1] }]);
  expect(readVernier("changeset.json")).toBeNull();
  expect(readdirSync(VERNIER)).toEqual(["history"]);
  const last = await vernierkit("last");
  expect(last.split(/^## /m)[1]).toContain("- **Status:** Applied\n");
  expect(last.split(/^## /m)[2]).toContain("- **Status:** Not applied\n");
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
    // The copy of the page at the phone's width is kept while the round is claimed, and goes with it.
    await vernierkit("finish");
    await expect(page.getByRole("progressbar", { name: "Applying design changes" })).toHaveCount(0);
    await expect(page.locator("iframe[data-vk-check]")).toHaveCount(0);
  });

  test("a change made in the desktop view is checked at every view's width too: the Grid's columns changed for `sm:` only do not show at the phone's", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Grid", exact: true }).click();
    await setField(page, "Columns", "2");
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(1);
    await vernierkit("claim");

    // As both Agents did on the bench (ticket 63): the phone still has one column.
    editSource(APP, "grid grid-cols-1 gap-4 pb-16 sm:grid-cols-3", "grid grid-cols-1 gap-4 pb-16 sm:grid-cols-2");
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it does not show the change. At 390px wide, the number of columns is 1, not 2.");
    await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");

    editSource(APP, "grid grid-cols-1 gap-4 pb-16 sm:grid-cols-2", "grid grid-cols-2 gap-4 pb-16");
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it shows the change.");
    await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
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
