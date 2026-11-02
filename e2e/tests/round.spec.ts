import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { CARD_EDITED, clearThirdKindFolder, EXAMPLE, forTheLoopAlone, readThirdKindFile, THIRD_KIND_FOLDER, npx03kind } from "./project-files";

/** These tests save into the example project's `.03kind/` for real. */
test.use({ keepRoundInMemory: false });

test.beforeEach(() => clearThirdKindFolder(THIRD_KIND_FOLDER));
test.afterAll(() => clearThirdKindFolder(THIRD_KIND_FOLDER));

const CARD = `${EXAMPLE}src/components/Card.tsx`;
const originalCard = readFileSync(CARD, "utf8");
test.afterEach(async () => {
  if (readFileSync(CARD, "utf8") === originalCard) return;
  writeFileSync(CARD, originalCard);
  // The next test's page must open on the Card as it was.
  await expect.poll(async () => ((text) => text.includes("rounded-xl border border-stone-200 bg-white") && !CARD_EDITED.test(text))(await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text())).toBe(true);
});

/** As the Agent does: one of the changes `changeTheCards` makes, written into the Card for the loop's cards alone (ticket 77). */
const CARD_EDITS = { fill: ["bg-white", "bg-[#ff0000]"], radius: ["rounded-xl", "rounded-[2px]"] } as const;
async function applyToCard(page: Page, which: keyof typeof CARD_EDITS) {
  const [from, to] = CARD_EDITS[which];
  writeFileSync(CARD, forTheLoopAlone(readFileSync(CARD, "utf8"), from, to));
  const [property, value] = which === "fill" ? (["backgroundColor", "rgb(255, 0, 0)"] as const) : (["borderTopLeftRadius", "2px"] as const);
  await expect.poll(() => page.locator("article").first().evaluate((card, name) => getComputedStyle(card)[name], property)).toBe(value);
}

const LOCKED_LABEL = /^03Kind: applying design changes/;

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
  await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(2);
}

/** The local service's round, as the page loads and saves it. */
const isRound = (url: URL) => url.hostname === "127.0.0.1" && url.pathname === "/round";

const progress = (page: Page) => page.getByRole("progressbar", { name: "Applying design changes" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });

/** How each archived round ended. */
function results() {
  const history = `${THIRD_KIND_FOLDER}history/`;
  return readdirSync(history)
    .sort()
    .map((round) => JSON.parse(readFileSync(`${history}${round}/result.json`, "utf8")));
}

test("claim folds the editor into a locked toggle; as the page shows each change the ring fills and the badge counts down, done or not; finish unlocks it", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);

  await npx03kind("claim");

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(progress(page)).toHaveAttribute("aria-valuemax", "2");
  await expect(badge(page)).toHaveText("2");
  await toggle.click({ force: true });
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  // Done before the code has it: the page does not show it, and it does not count.
  expect(await npx03kind("done", "1")).toContain("Change 1 done: 0 of 2 changes applied.");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");

  await applyToCard(page, "fill");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
  await expect(badge(page)).toHaveText("1");
  // No done for this one: the page shows it all the same.
  await applyToCard(page, "radius");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "2");
  await expect(badge(page)).toHaveCount(0);

  expect(await npx03kind("finish")).toMatch(/^Round finished: 2 of 2 changes applied.\n\nEnd your reply with this report\. Each change is under the heading/);
  await expect(progress(page)).toHaveCount(0);
  expect(results()).toMatchObject([{ ended: "finished", done: [1], applied: [1, 2], checks: { 1: { outcome: "shown" }, 2: { outcome: "shown" } } }]);
});

test("a change the page shows, undone by a later edit before any done: the ring goes back down", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npx03kind("claim");
  await applyToCard(page, "fill");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  // The Agent's next edit puts the fill back as it was.
  writeFileSync(CARD, originalCard);
  await expect.poll(() => page.locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor)).toBe("rgb(255, 255, 255)");

  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(badge(page)).toHaveText("2");
  expect(await npx03kind("finish")).toMatch(/^Round finished: 0 of 2 changes applied. The page does not show: 1, 2.\n\nEnd your reply with this report\. Each change is under the heading/);
});

/** The page, with React's drawing held (by the React plugin's own hook, before each Fast Refresh) till the test lets it. */
interface HeldDrawing {
  __tkDraw: Promise<void>;
  __tkLetDraw(): void;
  __registerBeforePerformReactRefresh(hold: () => Promise<void>): void;
}

test("an Agent that edits the code as it claims, with no done: the page draws the edit only after it began to check, and the ring fills all the same", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  // React draws the Card anew only once the test lets it: after the dev server has brought the code in, and the page has looked.
  await page.evaluate(() => {
    const win = window as unknown as HeldDrawing;
    win.__tkDraw = new Promise((resolve) => (win.__tkLetDraw = resolve));
    win.__registerBeforePerformReactRefresh(() => win.__tkDraw);
  });
  const code = () => page.evaluate(() => (window as unknown as { __THIRD_KIND_CODE__: { at: number; updating: number } }).__THIRD_KIND_CODE__);
  const codeAt = (await code()).at;
  // The round the page reads again as it hears of the claim: held till the dev server has brought the edit in.
  let letRound!: () => void;
  const roundHeld = new Promise<void>((resolve) => (letRound = resolve));
  await page.route(isRound, async (route) => {
    if (route.request().method() === "GET") await roundHeld;
    await route.continue();
  });
  /** When the page said what it saw of the fill. */
  const fillLooks: number[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/checks" && request.postDataJSON()?.id === 1) fillLooks.push(Date.now());
  });

  await npx03kind("claim");
  writeFileSync(CARD, forTheLoopAlone(readFileSync(CARD, "utf8"), ...CARD_EDITS.fill));
  // The Card's module and the stylesheet with its new class are both in; React has not drawn it yet.
  await expect.poll(async () => ((c) => c.at > codeAt && c.updating === 0)(await code())).toBe(true);
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("style")].some((style) => style.textContent?.includes("bg-\\[\\#ff0000\\]")))).toBe(true);
  const roundIn = page.waitForResponse((response) => isRound(new URL(response.url())) && response.request().method() === "GET");
  letRound();
  await roundIn;
  const roundAt = Date.now();
  // The page, with the round read again, has looked: the fill is not drawn yet.
  await expect.poll(() => fillLooks.some((at) => at >= roundAt)).toBe(true);
  expect(await page.locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor)).toBe("rgb(255, 255, 255)");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");

  await page.evaluate(() => (window as unknown as HeldDrawing).__tkLetDraw());

  await expect.poll(() => page.locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor)).toBe("rgb(255, 0, 0)");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
  await expect(badge(page)).toHaveText("1");
});

test("done for several changes at once: each with how the page checked it, those the page shows already at once", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npx03kind("claim");
  await applyToCard(page, "fill");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  const output = await npx03kind("done", "1", "2");

  expect(output).toContain("Changes 1 and 2 done: 1 of 2 changes applied.\n");
  expect(output).toContain("Change 1: checked on the page: it shows the change.\n");
  expect(output).toContain("Change 2: checked on the page: it does not show the change. The corner radius is 12px, not 2px, as the browser computes `border-radius` on the layer.");
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
    isRound,
    async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      saving();
      await claim;
      await route.continue();
    },
  );
  await setField(page, "Corner radius", "6");
  await saveSent;
  await npx03kind("claim");
  claimed();

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(progress(page)).toHaveAttribute("aria-valuemax", "2");
  expect(readThirdKindFile("changeset.json").changes[1].after).toBe(2);
});

test("while the round is being applied, the change list only shows what is left to do", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npx03kind("claim");
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
  await npx03kind("claim");
  await applyToCard(page, "radius");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  await page.reload();

  await expect(page.getByRole("button", { name: LOCKED_LABEL })).toHaveAttribute("aria-disabled", "true");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
});

test("pressing and holding the locked toggle unlocks it: changes the page shows are archived as applied, the others recorded and left for the next round, on the same canvas (ticket 68)", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npx03kind("claim");
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
  // The corners, not applied, are left, numbered 1; the fill applied goes with them apart, for the canvas to take in.
  expect(readThirdKindFile("changeset.json")).toMatchObject({ lastId: 1, changes: [{ id: 1, property: "radius", carried: true }], applied: [{ id: 1, property: "fill" }] });
  expect(readdirSync(THIRD_KIND_FOLDER).sort()).toEqual(["canvas.html", "changeset.json", "checks.json", "history"]);
  await expect(badge(page)).toHaveText("1");
  const last = await npx03kind("last");
  expect(last.split(/^## /m)[1]).toContain("- **Status:** Applied\n");
  expect(last.split(/^## /m)[2]).toContain("- **Status:** Not applied\n");
});

test("a short press on the locked toggle does nothing", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npx03kind("claim");
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });

  await toggle.click({ force: true });

  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  expect(readThirdKindFile("state.json")).toMatchObject({ status: "claimed", done: [] });
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

  await npx03kind("claim");
  await npx03kind("done", "1");
  expect(await cardStyles(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await npx03kind("finish");
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
    // The Card's changes are for the loop's cards alone (ticket 77): the fourth card stays as it was.
    writeFileSync(file, file === CARD ? forTheLoopAlone(text, from, to) : text.replace(from, to));
  }

  test("a change the code really makes is shown; one a page rule overrides is not, until it is fixed", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    await setField(page, "Fill color", "2563eb");
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(1);
    await npx03kind("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // A utility class: the example's own `button` rule, in no CSS layer, beats it.
    editSource(APP, 'className="mt-6 flex items-center gap-2 self-start px-4 py-2 text-white"', 'className="mt-6 flex items-center gap-2 self-start bg-[#2563eb] px-4 py-2 text-white"');
    const overridden = await npx03kind("done", "1");
    expect(overridden).toContain("Checked on the page: it does not show the change. The fill is #DC2626, not #2563EB, as the browser computes");

    editSource(CSS, "background: rgb(220, 38, 38);", "background: #2563eb;");
    const fixed = await npx03kind("done", "1");
    expect(fixed).toContain("Checked on the page: it shows the change.");

    expect(await npx03kind("finish")).toMatch(/^Round finished: 1 of 1 change applied.\n\nEnd your reply with this report\. Each change is under the heading/);
    expect(results()).toMatchObject([{ checks: { 1: { outcome: "shown" } } }]);
  });

  test("a stroke weight is checked as the code writes it: on a 1x screen, which draws 1px and 1.5px alike, the code's 1px is not 1.5px; 3px is not; 1.5px is", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
    await setField(page, "Stroke weight", "1.5");
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(1);
    await npx03kind("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // The code is not edited yet: its 1px draws as 1.5px would on this 1x screen, and is not 1.5px all the same.
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it does not show the change. The stroke is 1px solid #E7E5E4, not 1.5px solid #E7E5E4, as the browser computes");

    const drawn = () => page.locator("article").first().evaluate((card) => getComputedStyle(card).borderTopWidth);
    editSource(CARD, "rounded-xl border border-stone-200", "rounded-xl border-[3px] border-stone-200");
    await expect.poll(drawn).toBe("3px");
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it does not show the change. The stroke is 3px solid #E7E5E4, not 1.5px solid #E7E5E4, as the browser computes");

    editSource(CARD, "border-[3px]", "border-[1.5px]");
    await expect.poll(drawn).toBe("1px");
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a stroke's color changed alone leaves the weight to the code: the reference style has none", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
    await setField(page, "Stroke color", "ff0000");
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(1);
    expect(readThirdKindFile("changeset.json").changes[0].style).toEqual({ "border-style": "solid", "border-color": "rgb(255 0 0 / 1)" });
    await npx03kind("claim");

    editSource(CARD, "border border-stone-200", "border border-[#ff0000]");
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a layout change is checked in design language: the button fills its Stack once the code stretches it", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    await page.getByRole("complementary", { name: "Design" }).getByRole("combobox", { name: "Width sizing" }).selectOption("fill");
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(1);
    await npx03kind("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    editSource(APP, "flex items-center gap-2 self-start px-4", "flex items-center gap-2 self-stretch px-4");

    expect(await npx03kind("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a size dragged on the canvas by a handle is a change of size, as the Width field makes it, and checked on the page once the code has it", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    const edge = (await page.locator('.tk-handles[data-view="Desktop"] .tk-handle[data-handle="e"]').boundingBox())!;
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2 + 12, edge.y + edge.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(1);
    const [change] = readThirdKindFile("changeset.json").changes;
    expect(change).toMatchObject({ kind: "style", property: "width", before: { type: "hug" }, after: { type: "fixed" } });
    const width: number = change.after.value;
    await npx03kind("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    expect(await npx03kind("done", "1")).toContain("Checked on the page: it does not show the change.");
    editSource(APP, "flex items-center gap-2 self-start px-4", `flex w-[${width}px] items-center gap-2 self-start px-4`);
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it shows the change.");
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
    const corner = (await page.locator('.tk-handles[data-view="Desktop"] .tk-handle[data-handle="nw"]').boundingBox())!;
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x + corner.width / 2 - 10 * zoom, corner.y + corner.height / 2 - 10 * zoom, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(4);
    const changes: { id: number; property: string }[] = readThirdKindFile("changeset.json").changes;
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "style", property: "x", before: 40, after: 30 }),
        expect.objectContaining({ kind: "style", property: "y", before: 30, after: 20 }),
        expect.objectContaining({ kind: "style", property: "width", before: { type: "fixed", value: 80 }, after: { type: "fixed", value: 90 } }),
        expect.objectContaining({ kind: "style", property: "height", before: { type: "fixed", value: 40 }, after: { type: "fixed", value: 50 } }),
      ]),
    );
    await npx03kind("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "4");

    for (const { id } of changes) expect(await npx03kind("done", String(id))).toContain("Checked on the page: it does not show the change.");
    editSource(APP, "top-[30px] left-[40px] h-[40px] w-[80px]", "top-[20px] left-[30px] h-[50px] w-[90px]");
    for (const { id } of changes) expect(await npx03kind("done", String(id))).toContain("Checked on the page: it shows the change.");
  });

  /** Selects the layer of the element with test id `id` on the canvas, deepest first. */
  async function pickOnCanvas(page: Page, id: string) {
    const box = (await canvas(page).getByTestId(id).boundingBox())!;
    await page.keyboard.down("Meta");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.up("Meta");
  }

  /** Drags the right edge of the layer selected `by` px in the desktop view, in its px. */
  async function dragRightEdgeOf(page: Page, by: number) {
    const zoom = await page.locator('iframe[title="Canvas"]').evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
    const edge = (await page.locator('.tk-handles[data-view="Desktop"] .tk-handle[data-handle="e"]').boundingBox())!;
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2 + by * zoom, edge.y + edge.height / 2, { steps: 6 });
    await page.mouse.up();
  }

  test("layers placed from the right, from the bottom and centered, resized by a handle or in the panel: they stay placed so, the notes say which value changes, and each change is checked on the page once the code has it (ticket 75)", async ({ page }) => {
    // In the code, three layers placed freely in the hero: from its right, from its bottom, and centered across.
    editSource(
      APP,
      '<section className="flex h-screen flex-col justify-center" data-testid="hero">',
      '<section className="relative flex h-screen flex-col justify-center" data-testid="hero">\n' +
        '        <div data-testid="from-right" className="absolute top-[30px] right-[40px] h-[40px] w-[80px] bg-stone-300" />\n' +
        '        <div data-testid="from-bottom" className="absolute bottom-[60px] left-[40px] h-[40px] w-[80px] bg-stone-300" />\n' +
        '        <div data-testid="centered" className="absolute top-[120px] left-1/2 h-[40px] w-[80px] -translate-x-1/2 bg-stone-300" />',
    );
    await expect(async () => {
      await page.goto(DEV_URL);
      await expect(page.getByTestId("centered")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await enterEditMode(page);
    const pick = (id: string) => pickOnCanvas(page, id);
    const dragRightEdge = (by: number) => dragRightEdgeOf(page, by);

    // Its right edge 30 px in: the layer stays placed from the right, 70 px from it, its left edge where it was.
    await pick("from-right");
    await dragRightEdge(-30);
    // Its height typed: its top stays, its bottom 20 px nearer the hero's.
    await pick("from-bottom");
    await setField(page, "Height", "60");
    // Its right edge 30 px out: both sides alike, still centered.
    await pick("centered");
    await dragRightEdge(30);
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(5);
    const changes: { id: number; property: string; before: unknown; after: unknown; placedFrom?: unknown }[] = readThirdKindFile("changeset.json").changes;
    expect(changes.map(({ property, before, after, placedFrom }) => ({ property, before, after, placedFrom }))).toEqual([
      { property: "width", before: { type: "fixed", value: 80 }, after: { type: "fixed", value: 50 }, placedFrom: { edge: "end", centered: false } },
      { property: "right", before: 40, after: 70, placedFrom: undefined },
      { property: "height", before: { type: "fixed", value: 40 }, after: { type: "fixed", value: 60 }, placedFrom: { edge: "end", centered: false } },
      { property: "bottom", before: 60, after: 40, placedFrom: undefined },
      { property: "width", before: { type: "fixed", value: 80 }, after: { type: "fixed", value: 140 }, placedFrom: { edge: "start", centered: true } },
    ]);

    const notes = await npx03kind("claim");
    expect(notes).toContain("Change the right position from 40px to 70px: how far the layer's right edge is from its container's, its CSS `right`. It stays placed from that edge: do not place it by `left` instead.");
    expect(notes).toContain("- **Placement:** the layer is placed from its container's bottom edge (CSS `bottom`), and stays so: do not place it by `top` instead.");
    expect(notes).toContain("- **Placement:** the layer is centered across on where its `left` places it, by `translate: -50%` (Tailwind's `-translate-x-1/2`), and stays so: only its width changes, on both sides alike.");
    expect(notes).toMatch(/- \*\*Placed from the right or bottom:\*\* /);
    expect(notes).toMatch(/- \*\*Centered:\*\* /);
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "5");

    for (const { id } of changes) expect(await npx03kind("done", String(id))).toContain("Checked on the page: it does not show the change.");
    editSource(APP, "top-[30px] right-[40px] h-[40px] w-[80px]", "top-[30px] right-[70px] h-[40px] w-[50px]");
    editSource(APP, "bottom-[60px] left-[40px] h-[40px] w-[80px]", "bottom-[40px] left-[40px] h-[60px] w-[80px]");
    editSource(APP, "left-1/2 h-[40px] w-[80px] -translate-x-1/2", "left-1/2 h-[40px] w-[140px] -translate-x-1/2");
    for (const { id } of changes) expect(await npx03kind("done", String(id))).toContain("Checked on the page: it shows the change.");
    // Where the canvas drew them: the page places them so, at its own width as at the views'.
    const right = await page.getByTestId("from-right").evaluate((el) => el.parentElement!.getBoundingClientRect().right - el.getBoundingClientRect().right);
    expect(right).toBe(70);
  });

  test("a layer the canvas places from the right is checked by its `right` at every view's width: placed by its left instead, it shows only as wide as the window, and is not shown; one the project's breakpoints place by its left at the phone's width is not looked at there (ticket 75, line review)", async ({ page }) => {
    // In the code, two layers placed freely in the hero from its right: one at every width, one by its left below `md`.
    editSource(
      APP,
      '<section className="flex h-screen flex-col justify-center" data-testid="hero">',
      '<section className="relative flex h-screen flex-col justify-center" data-testid="hero">\n' +
        '        <div data-testid="from-right" className="absolute top-[30px] right-10 h-[40px] w-20 bg-stone-300" />\n' +
        '        <div data-testid="left-on-phones" className="absolute top-[90px] right-[100px] h-[40px] w-[80px] bg-stone-300 max-md:left-2 max-md:right-auto" />',
    );
    await expect(async () => {
      await page.goto(DEV_URL);
      await expect(page.getByTestId("left-on-phones")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    const hero = await page.getByTestId("hero").evaluate((el) => el.clientWidth);
    await enterEditMode(page);

    // The first's right edge 20 px out, the second's 40 px in, past the first's left edge, which it would snap to, in the desktop view.
    await pickOnCanvas(page, "from-right");
    await dragRightEdgeOf(page, 20);
    await pickOnCanvas(page, "left-on-phones");
    await dragRightEdgeOf(page, -40);
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(4);
    const changes: { id: number; property: string; before: unknown; after: unknown; placedOtherwiseAt?: { min: number | null; max: number | null }[] }[] = readThirdKindFile("changeset.json").changes;
    expect(changes.map(({ property, before, after, placedOtherwiseAt }) => [property, before, after, placedOtherwiseAt?.map(({ min, max }) => [min, max])])).toEqual([
      ["width", { type: "fixed", value: 80 }, { type: "fixed", value: 100 }, undefined],
      ["right", 40, 20, undefined],
      ["width", { type: "fixed", value: 80 }, { type: "fixed", value: 40 }, undefined],
      // On the canvas, the phone view places it by its left: its `right` places nothing below 768px.
      ["right", 100, 140, [[null, 768]]],
    ]);
    const [width, right, otherWidth, otherRight] = changes.map(({ id }) => String(id));
    await npx03kind("claim");

    // Not as the notes say: placed by its left, where the canvas draws it as wide as the window. The other, as they say.
    editSource(APP, "top-[30px] right-10 h-[40px] w-20", `top-[30px] left-[${hero - 20 - 100}px] right-auto h-[40px] w-[100px]`);
    editSource(APP, "right-[100px] h-[40px] w-[80px]", "right-[140px] h-[40px] w-[40px]");
    expect(await npx03kind("done", width)).toContain("Checked on the page: it shows the change.");
    expect(await npx03kind("done", right)).toContain("Checked on the page: it does not show the change. At 768px wide, the right position is drawn at");
    for (const id of [otherWidth, otherRight]) expect(await npx03kind("done", id)).toContain("Checked on the page: it shows the change.");

    // As the notes say: shown at every width.
    editSource(APP, `left-[${hero - 20 - 100}px] right-auto`, "right-[20px]");
    expect(await npx03kind("done", right)).toContain("Checked on the page: it shows the change.");
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
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes[0]?.breakpoint?.max).toBe(768);
    // Saved again once the page is read in each part of the range, below 640px and from 640px (ticket 65).
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes[0]?.parts?.length).toBe(2);
    await npx03kind("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // Not applied yet: the cards are white at the phone's width too, the first part's looked at first.
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it does not show the change. At 639px wide, the fill is #FFFFFF, not #FF0000, as the browser computes");
    // Applied below `md` only, as the notes say: the window, 1280px wide, still shows them white.
    editSource(CARD, "bg-white p-5", "bg-white p-5 max-md:bg-[#ff0000]");
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it shows the change.");
    await expect(page.locator("article").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    // The copy of the page at the phone's width is kept while the round is claimed, and goes with it.
    await npx03kind("finish");
    await expect(page.getByRole("progressbar", { name: "Applying design changes" })).toHaveCount(0);
    await expect(page.locator("iframe[data-tk-check]")).toHaveCount(0);
  });

  test("a change made in the desktop view is checked at every view's width too: the Grid's columns changed for `sm:` only do not show at the phone's", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Grid", exact: true }).click();
    await setField(page, "Columns", "2");
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(1);
    await npx03kind("claim");

    // As both Agents did on the bench (ticket 63): the phone still has one column.
    editSource(APP, "grid grid-cols-1 gap-4 pb-16 sm:grid-cols-3", "grid grid-cols-1 gap-4 pb-16 sm:grid-cols-2");
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it does not show the change. At 390px wide, the number of columns is 1, not 2, as the browser computes `grid-template-columns` on the layer.");
    await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");

    editSource(APP, "grid grid-cols-1 gap-4 pb-16 sm:grid-cols-2", "grid grid-cols-2 gap-4 pb-16");
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it shows the change.");
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
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(2);
    await npx03kind("claim");

    // Applying the button's fill, the Agent adds a line at the top of App.tsx: every marker below moves.
    editSource(CSS, "background: rgb(220, 38, 38);", "background: #2563eb;");
    editSource(APP, 'import { Badge, Surface } from "acme-ui";', '// Buttons are blue now.\nimport { Badge, Surface } from "acme-ui";');

    expect(await npx03kind("done", "2")).toContain("Checked on the page: it shows the change.");
  });
});
