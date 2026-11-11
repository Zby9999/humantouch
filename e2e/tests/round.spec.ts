import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, test, type Locator, type Page } from "./fixtures";
import { clearHumanTouchFolder, EXAMPLE, forTheLoopAlone, readHumanTouchFile, HUMAN_TOUCH_FOLDER, npxHumanTouch, servesAsWritten } from "./project-files";

/** These tests save into the example project's `.humantouch/` for real. */
test.use({ keepRoundInMemory: false });

test.beforeEach(() => clearHumanTouchFolder(HUMAN_TOUCH_FOLDER));
test.afterAll(() => clearHumanTouchFolder(HUMAN_TOUCH_FOLDER));

const CARD = `${EXAMPLE}src/components/Card.tsx`;
const originalCard = readFileSync(CARD, "utf8");
test.afterEach(async () => {
  if (readFileSync(CARD, "utf8") === originalCard) return;
  writeFileSync(CARD, originalCard);
  // The next test's page must open on the Card as it was.
  await expect.poll(async () => servesAsWritten(await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text(), originalCard)).toBe(true);
});

/** As the Agent does: one of the changes `changeTheCards` makes, written into the Card for the loop's cards alone (ticket 77). */
const CARD_EDITS = { fill: ["bg-white", "bg-[#ff0000]"], radius: ["rounded-xl", "rounded-[2px]"] } as const;
async function applyToCard(page: Page, which: keyof typeof CARD_EDITS) {
  const [from, to] = CARD_EDITS[which];
  writeFileSync(CARD, forTheLoopAlone(readFileSync(CARD, "utf8"), from, to));
  const [property, value] = which === "fill" ? (["backgroundColor", "rgb(255, 0, 0)"] as const) : (["borderTopLeftRadius", "2px"] as const);
  await expect.poll(() => page.locator("article").first().evaluate((card, name) => getComputedStyle(card)[name], property)).toBe(value);
}

const LOCKED_LABEL = /^Human Touch: applying design changes/;

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
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
  await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(2);
}

/** The local service's round, as the page loads and saves it. */
const isRound = (url: URL) => url.hostname === "127.0.0.1" && url.pathname === "/round";

const progress = (page: Page) => page.getByRole("progressbar", { name: "Applying design changes" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });

/** How each archived round ended. */
function results() {
  const history = `${HUMAN_TOUCH_FOLDER}history/`;
  return readdirSync(history)
    .sort()
    .map((round) => JSON.parse(readFileSync(`${history}${round}/result.json`, "utf8")));
}

test("claim folds the editor into a locked toggle; as the page shows each change the ring fills and the badge counts down, done or not; finish unlocks it", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);

  await npxHumanTouch("claim");

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(progress(page)).toHaveAttribute("aria-valuemax", "2");
  await expect(badge(page)).toHaveText("2");
  // Its 1.5px line right round the toggle's rounded square, nothing between, its corners round the toggle's 6px (designer, 2026-11-09).
  const ringBox = await progress(page).boundingBox();
  const toggleBox = await toggle.boundingBox();
  expect([ringBox!.x - toggleBox!.x, ringBox!.y - toggleBox!.y, ringBox!.width, ringBox!.height]).toEqual([-4, -4, 36, 36]);
  const line = await progress(page).locator("rect").first().evaluate((rect: SVGRectElement) => {
    const { x, y, width, height } = rect.getBBox();
    const { strokeWidth, rx } = getComputedStyle(rect);
    const inner = parseFloat(strokeWidth) / 2;
    return { strokeWidth, rx, inside: [x + inner, y + inner, width - 2 * inner, height - 2 * inner] };
  });
  // Its inside edge on the toggle's edges: 4px into the ring, as wide as the toggle.
  expect(line).toEqual({ strokeWidth: "1.5px", rx: "6.75px", inside: [4, 4, toggleBox!.width, toggleBox!.height] });
  await toggle.click({ force: true });
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  // Done before the code has it: the page does not show it, and it does not count.
  expect(await npxHumanTouch("done", "1")).toContain("Change 1 done: 0 of 2 changes applied.");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");

  await applyToCard(page, "fill");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
  await expect(badge(page)).toHaveText("1");
  // No done for this one: the page shows it all the same.
  await applyToCard(page, "radius");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "2");
  await expect(badge(page)).toHaveCount(0);

  expect(await npxHumanTouch("finish")).toMatch(/^Round finished: 2 of 2 changes applied.\n\nEnd your reply with this report\. Each change is under the heading/);
  await expect(progress(page)).toHaveCount(0);
  expect(results()).toMatchObject([{ ended: "finished", done: [1], applied: [1, 2], checks: { 1: { outcome: "shown" }, 2: { outcome: "shown" } } }]);
});

test("a change the page shows, undone by a later edit before any done: the ring goes back down", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npxHumanTouch("claim");
  await applyToCard(page, "fill");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  // The Agent's next edit puts the fill back as it was.
  writeFileSync(CARD, originalCard);
  await expect.poll(() => page.locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor)).toBe("rgb(255, 255, 255)");

  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(badge(page)).toHaveText("2");
  expect(await npxHumanTouch("finish")).toMatch(/^Round finished: 0 of 2 changes applied. The page does not show: 1, 2.\n\nEnd your reply with this report\. Each change is under the heading/);
});

/** The page, with React's drawing held (by the React plugin's own hook, before each Fast Refresh) till the test lets it. */
interface HeldDrawing {
  __htDraw: Promise<void>;
  __htLetDraw(): void;
  __registerBeforePerformReactRefresh(hold: () => Promise<void>): void;
}

test("an Agent that edits the code as it claims, with no done: the page draws the edit only after it began to check, and the ring fills all the same", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  // React draws the Card anew only once the test lets it: after the dev server has brought the code in, and the page has looked.
  await page.evaluate(() => {
    const win = window as unknown as HeldDrawing;
    win.__htDraw = new Promise((resolve) => (win.__htLetDraw = resolve));
    win.__registerBeforePerformReactRefresh(() => win.__htDraw);
  });
  const code = () => page.evaluate(() => (window as unknown as { __HUMAN_TOUCH_CODE__: { at: number; updating: number } }).__HUMAN_TOUCH_CODE__);
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

  await npxHumanTouch("claim");
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
  await expect.poll(() => page.locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor)).toBe("rgb(255, 255, 255)");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");

  await page.evaluate(() => (window as unknown as HeldDrawing).__htLetDraw());

  await expect.poll(() => page.locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor)).toBe("rgb(255, 0, 0)");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
  await expect(badge(page)).toHaveText("1");
});

test("done for several changes at once: each with how the page checked it, those the page shows already at once", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npxHumanTouch("claim");
  await applyToCard(page, "fill");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  const output = await npxHumanTouch("done", "1", "2");

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
  await npxHumanTouch("claim");
  claimed();

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(progress(page)).toHaveAttribute("aria-valuemax", "2");
  expect(readHumanTouchFile("changeset.json").changes[1].after).toBe(2);
});

test("while the round is being applied, the change list only shows what is left to do", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npxHumanTouch("claim");
  await applyToCard(page, "fill");
  await expect(badge(page)).toHaveText("1");

  // Open by itself as the round is claimed (designer, 2026-11-09).
  const list = page.getByRole("dialog", { name: "Changes" });

  await expect(list.getByText("The Agent is applying these changes.")).toBeVisible();
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card.*12px → 2px/]);
  await expect(list.getByRole("button")).toHaveCount(0);
});

test("a page loaded while the round is being applied shows it locked, with what the page shows so far", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npxHumanTouch("claim");
  await applyToCard(page, "radius");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  await page.reload();

  await expect(page.getByRole("button", { name: LOCKED_LABEL })).toHaveAttribute("aria-disabled", "true");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
});

test("pressing and holding the locked toggle unlocks it: changes the page shows are archived as applied, the others recorded and left for the next round, on the same canvas (ticket 68)", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npxHumanTouch("claim");
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
  expect(readHumanTouchFile("changeset.json")).toMatchObject({ lastId: 1, changes: [{ id: 1, property: "radius", carried: true }], applied: [{ id: 1, property: "fill" }] });
  expect(readdirSync(HUMAN_TOUCH_FOLDER).sort()).toEqual(["canvas.html", "changeset.json", "checks.json", "history"]);
  await expect(badge(page)).toHaveText("1");
  const last = await npxHumanTouch("last");
  expect(last.split(/^## /m)[1]).toContain("- **Status:** Applied\n");
  expect(last.split(/^## /m)[2]).toContain("- **Status:** Not applied\n");
});

test("a short press on the locked toggle does nothing", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await npxHumanTouch("claim");
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });

  await toggle.click({ force: true });

  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  expect(readHumanTouchFile("state.json")).toMatchObject({ status: "claimed", done: [] });
});

/** A computed style of every card on the live page, in page order. */
function cardStyles(page: Page, property: "backgroundColor" | "borderRadius") {
  return page.locator("article").evaluateAll((cards, property) => cards.map((card) => getComputedStyle(card)[property]), property);
}

const WHITE = "rgb(255, 255, 255)";

test("the page shows the code all along: before the claim, while the round is applied, and after it", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await expect.poll(() => cardStyles(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, WHITE]);

  await npxHumanTouch("claim");
  await npxHumanTouch("done", "1");
  await expect.poll(() => cardStyles(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await npxHumanTouch("finish");
  await expect.poll(() => cardStyles(page, "borderRadius")).toEqual(["12px", "12px", "12px", "12px"]);
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

  /**
   * Once the page draws `layer` as the edited code writes it: with each of
   * `classes`, and each with its rule in the page's styles. The dev server
   * brings an edit in a while after it is written: a `done` run before reads
   * the page as it was, or asks it while the edit is coming in (ticket 102).
   */
  async function drawnWith(layer: Locator, ...classes: string[]) {
    await expect
      .poll(() =>
        layer.evaluate(
          (el, names) => names.every((name) => el.classList.contains(name) && [...document.querySelectorAll("style")].some((style) => style.textContent?.includes(`.${window.CSS.escape(name)}`))),
          classes,
        ),
      )
      .toBe(true);
  }

  /** The example's button, on the page. */
  const button = (page: Page) => page.locator("main button", { hasText: "Get started" });

  test("a change the code really makes is shown; one a page rule overrides is not, until it is fixed", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    await setField(page, "Fill color", "2563eb");
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    await npxHumanTouch("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // A utility class: the example's own `button` rule, in no CSS layer, beats it.
    editSource(APP, 'className="mt-6 flex items-center gap-2 self-start px-4 py-2 text-white"', 'className="mt-6 flex items-center gap-2 self-start bg-[#2563eb] px-4 py-2 text-white"');
    await drawnWith(button(page), "bg-[#2563eb]");
    const overridden = await npxHumanTouch("done", "1");
    expect(overridden).toContain("Checked on the page: it does not show the change. The fill is #DC2626, not #2563EB, as the browser computes");

    editSource(CSS, "background: rgb(220, 38, 38);", "background: #2563eb;");
    await expect(button(page)).toHaveCSS("background-color", "rgb(37, 99, 235)");
    const fixed = await npxHumanTouch("done", "1");
    expect(fixed).toContain("Checked on the page: it shows the change.");

    expect(await npxHumanTouch("finish")).toMatch(/^Round finished: 1 of 1 change applied.\n\nEnd your reply with this report\. Each change is under the heading/);
    expect(results()).toMatchObject([{ checks: { 1: { outcome: "shown" } } }]);
  });

  test("a stroke weight is checked as the code writes it: on a 1x screen, which draws 1px and 1.5px alike, the code's 1px is not 1.5px; 3px is not; 1.5px is", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
    await setField(page, "Stroke weight", "1.5");
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    await npxHumanTouch("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // The code is not edited yet: its 1px draws as 1.5px would on this 1x screen, and is not 1.5px all the same.
    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it does not show the change. The stroke is 1px solid #E7E5E4, not 1.5px solid #E7E5E4, as the browser computes");

    const drawn = () => page.locator("article").first().evaluate((card) => getComputedStyle(card).borderTopWidth);
    editSource(CARD, "rounded-xl border border-stone-200", "rounded-xl border-[3px] border-stone-200");
    await expect.poll(drawn).toBe("3px");
    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it does not show the change. The stroke is 3px solid #E7E5E4, not 1.5px solid #E7E5E4, as the browser computes");

    editSource(CARD, "border-[3px]", "border-[1.5px]");
    await expect.poll(drawn).toBe("1px");
    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a stroke's color changed alone leaves the weight to the code: the reference style has none", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
    await setField(page, "Stroke color", "ff0000");
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    expect(readHumanTouchFile("changeset.json").changes[0].style).toEqual({ "border-style": "solid", "border-color": "rgb(255 0 0 / 1)" });
    await npxHumanTouch("claim");

    editSource(CARD, "border border-stone-200", "border border-[#ff0000]");
    await drawnWith(page.locator("article").first(), "border-[#ff0000]");
    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a layout change is checked in design language: the button fills its Stack once the code stretches it", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    await page.getByRole("complementary", { name: "Design" }).getByRole("combobox", { name: "Width sizing" }).selectOption("fill");
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    await npxHumanTouch("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    editSource(APP, "flex items-center gap-2 self-start px-4", "flex items-center gap-2 self-stretch px-4");
    await drawnWith(button(page), "self-stretch");

    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a size dragged on the canvas by a handle is a change of size, as the Width field makes it, and checked on the page once the code has it", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    const edge = (await page.locator('.ht-handles[data-view="Desktop"] .ht-handle[data-handle="e"]').boundingBox())!;
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2 + 12, edge.y + edge.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    const [change] = readHumanTouchFile("changeset.json").changes;
    expect(change).toMatchObject({ kind: "style", property: "width", before: { type: "hug" }, after: { type: "fixed" } });
    const width: number = change.after.value;
    await npxHumanTouch("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it does not show the change.");
    editSource(APP, "flex items-center gap-2 self-start px-4", `flex w-[${width}px] items-center gap-2 self-start px-4`);
    await drawnWith(button(page), `w-[${width}px]`);
    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it shows the change.");
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
    const corner = (await page.locator('.ht-handles[data-view="Desktop"] .ht-handle[data-handle="nw"]').boundingBox())!;
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x + corner.width / 2 - 10 * zoom, corner.y + corner.height / 2 - 10 * zoom, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(4);
    const changes: { id: number; property: string }[] = readHumanTouchFile("changeset.json").changes;
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "style", property: "x", before: 40, after: 30 }),
        expect.objectContaining({ kind: "style", property: "y", before: 30, after: 20 }),
        expect.objectContaining({ kind: "style", property: "width", before: { type: "fixed", value: 80 }, after: { type: "fixed", value: 90 } }),
        expect.objectContaining({ kind: "style", property: "height", before: { type: "fixed", value: 40 }, after: { type: "fixed", value: 50 } }),
      ]),
    );
    await npxHumanTouch("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "4");

    for (const { id } of changes) expect(await npxHumanTouch("done", String(id))).toContain("Checked on the page: it does not show the change.");
    editSource(APP, "top-[30px] left-[40px] h-[40px] w-[80px]", "top-[20px] left-[30px] h-[50px] w-[90px]");
    await drawnWith(page.getByTestId("pin"), "top-[20px]", "left-[30px]", "h-[50px]", "w-[90px]");
    for (const { id } of changes) expect(await npxHumanTouch("done", String(id))).toContain("Checked on the page: it shows the change.");
  });

  test("a layer's Y written in the code, the layer not placed absolute there: done and finish say it is not placed absolute, and what to check, not a value read off it (ticket 80)", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    const layers = page.getByRole("tree", { name: "Layers" });
    // The header's Stack dissolved: on the canvas, its title is absolute where it was, and moved 20px lower.
    await layers.getByRole("treeitem", { name: "Header", exact: true }).click();
    await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Dissolve Stack" }).click();
    await layers.getByRole("treeitem", { name: "Third Kind", exact: true }).click();
    const y = Number(await page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Y", exact: true }).inputValue()) + 20;
    await setField(page, "Y", String(y));
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(2);
    expect(readHumanTouchFile("changeset.json").changes[1]).toMatchObject({ id: 2, kind: "style", property: "y", after: y });
    await npxHumanTouch("claim");
    const notPlaced = `Checked on the page: it does not show the change. The layer is not placed absolute, not absolute at Y ${y}px: check its \`position\` and \`top\`, and that its container is its positioning reference, then run \`npx humantouch done 2\` again.\n`;

    // As an Agent that has written neither yet: the title is in its header's layout, with no Y to read.
    const unwritten = await npxHumanTouch("done", "2");
    expect(unwritten).toContain(notPlaced);
    // Then writes the title's `top`, but not the dissolved Stack: the title is in its header's layout still, its `top` drawing it nowhere.
    editSource(APP, 'className="font-display text-4xl', `className="top-[${y}px] font-display text-4xl`);
    await expect(page.locator("h1")).toHaveClass(/top-\[/);
    const written = await npxHumanTouch("done", "2");
    expect(written).toContain(notPlaced);
    const finish = await npxHumanTouch("finish");
    expect(finish).toMatch(/\n- 2\. Y: <the layer>\n {2}Why: the layer is not placed absolute on the page: <what keeps it so>\n/);
    for (const output of [unwritten, written, finish]) expect(output).not.toContain("null");
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
    const edge = (await page.locator('.ht-handles[data-view="Desktop"] .ht-handle[data-handle="e"]').boundingBox())!;
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
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(5);
    const changes: { id: number; property: string; before: unknown; after: unknown; placedFrom?: unknown }[] = readHumanTouchFile("changeset.json").changes;
    expect(changes.map(({ property, before, after, placedFrom }) => ({ property, before, after, placedFrom }))).toEqual([
      { property: "width", before: { type: "fixed", value: 80 }, after: { type: "fixed", value: 50 }, placedFrom: { edge: "end", centered: false } },
      { property: "right", before: 40, after: 70, placedFrom: undefined },
      { property: "height", before: { type: "fixed", value: 40 }, after: { type: "fixed", value: 60 }, placedFrom: { edge: "end", centered: false } },
      { property: "bottom", before: 60, after: 40, placedFrom: undefined },
      { property: "width", before: { type: "fixed", value: 80 }, after: { type: "fixed", value: 140 }, placedFrom: { edge: "start", centered: true } },
    ]);

    const notes = await npxHumanTouch("claim");
    expect(notes).toContain("Change the right position from 40px to 70px: how far the layer's right edge is from its container's, its CSS `right`. It stays placed from that edge: do not place it by `left` instead.");
    expect(notes).toContain("- **Placement:** the layer is placed from its container's bottom edge (CSS `bottom`), and stays so: do not place it by `top` instead.");
    expect(notes).toContain("- **Placement:** the layer is centered across on where its `left` places it, by `translate: -50%` (Tailwind's `-translate-x-1/2`), and stays so: only its width changes, on both sides alike.");
    expect(notes).toMatch(/- \*\*Placed from the right or bottom:\*\* /);
    expect(notes).toMatch(/- \*\*Centered:\*\* /);
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "5");

    for (const { id } of changes) expect(await npxHumanTouch("done", String(id))).toContain("Checked on the page: it does not show the change.");
    editSource(APP, "top-[30px] right-[40px] h-[40px] w-[80px]", "top-[30px] right-[70px] h-[40px] w-[50px]");
    editSource(APP, "bottom-[60px] left-[40px] h-[40px] w-[80px]", "bottom-[40px] left-[40px] h-[60px] w-[80px]");
    editSource(APP, "left-1/2 h-[40px] w-[80px] -translate-x-1/2", "left-1/2 h-[40px] w-[140px] -translate-x-1/2");
    await drawnWith(page.getByTestId("from-right"), "right-[70px]", "w-[50px]");
    await drawnWith(page.getByTestId("from-bottom"), "bottom-[40px]", "h-[60px]");
    await drawnWith(page.getByTestId("centered"), "w-[140px]");
    for (const { id } of changes) expect(await npxHumanTouch("done", String(id))).toContain("Checked on the page: it shows the change.");
    // Where the canvas drew them: the page places them so, at its own width as at the views'.
    const right = await page.getByTestId("from-right").evaluate((el) => el.parentElement!.getBoundingClientRect().right - el.getBoundingClientRect().right);
    expect(right).toBe(70);
  });

  test("a layer the canvas places from the right is checked by its `right` at every view's width: placed by its left instead, it shows only as wide as the window, and past the views' screens it makes the page wider, so it is not shown (ADR 0016); one the project's breakpoints place by its left at the phone's width is not looked at there (ticket 75, line review)", async ({ page }) => {
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
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(4);
    const changes: { id: number; property: string; before: unknown; after: unknown; placedOtherwiseAt?: { min: number | null; max: number | null }[] }[] = readHumanTouchFile("changeset.json").changes;
    expect(changes.map(({ property, before, after, placedOtherwiseAt }) => [property, before, after, placedOtherwiseAt?.map(({ min, max }) => [min, max])])).toEqual([
      ["width", { type: "fixed", value: 80 }, { type: "fixed", value: 100 }, undefined],
      ["right", 40, 20, undefined],
      ["width", { type: "fixed", value: 80 }, { type: "fixed", value: 40 }, undefined],
      // On the canvas, the phone view places it by its left: its `right` places nothing below 768px.
      ["right", 100, 140, [[null, 768]]],
    ]);
    const [width, right, otherWidth, otherRight] = changes.map(({ id }) => String(id));
    await npxHumanTouch("claim");
    // What breaks of the layout the layers made at the views' widths, noted before the code changes: else noted late, and said so (ticket 147's review).
    const notedAt = (id: string) => (readHumanTouchFile("other-usages.json")?.otherUsages?.[id]?.breaks ?? []).filter((one: { late?: true }) => !one.late).map((one: { width: number }) => one.width);
    for (const id of [width, right]) await expect.poll(() => notedAt(id).sort()).toEqual(expect.arrayContaining([390, 768]));

    // Not as the notes say: placed by its left, where the canvas draws it as wide as the window. The other, as they say.
    editSource(APP, "top-[30px] right-10 h-[40px] w-20", `top-[30px] left-[${hero - 20 - 100}px] right-auto h-[40px] w-[100px]`);
    editSource(APP, "right-[100px] h-[40px] w-[80px]", "right-[140px] h-[40px] w-[40px]");
    await drawnWith(page.getByTestId("from-right"), `left-[${hero - 20 - 100}px]`, "right-auto", "w-[100px]");
    await drawnWith(page.getByTestId("left-on-phones"), "right-[140px]", "w-[40px]");
    // Its left as wide as the window is past the screen at the views' widths: the page wider than the screen there, which it was not when the round was claimed (ADR 0016, ticket 147).
    // Its width and its right both on the layer, either may do it: said as the layer of both (ticket 147's review).
    for (const id of [width, right]) {
      expect(await npxHumanTouch("done", id)).toContain(
        `Checked on the page: it does not show the change. At Tablet (768px) the layer of changes ${width} and ${right} makes the page wider than the screen (it scrolls sideways); at Phone (390px) it makes the page wider than the screen (it scrolls sideways), which it did not when the round was claimed; any of those changes may be what does it: `,
      );
    }
    for (const id of [otherWidth, otherRight]) expect(await npxHumanTouch("done", id)).toContain("Checked on the page: it shows the change.");

    // As the notes say: shown at every width.
    editSource(APP, `left-[${hero - 20 - 100}px] right-auto`, "right-[20px]");
    await drawnWith(page.getByTestId("from-right"), "right-[20px]");
    for (const id of [width, right]) expect(await npxHumanTouch("done", id)).toContain("Checked on the page: it shows the change.");
  });

  test("a layer the canvas places absolute from `md` up is not looked at at the phone's width, where the canvas lays it out in its container: its X and Y written as the notes say show; one placed absolute at every width is looked at there, and laid out there is adapted there (ticket 83; ADR 0016)", async ({ page }) => {
    // In the code, two layers in the hero: one placed freely from `md` up, in the hero's layout below; one placed freely at every width.
    editSource(
      APP,
      '<section className="flex h-screen flex-col justify-center" data-testid="hero">',
      '<section className="relative flex h-screen flex-col justify-center" data-testid="hero">\n' +
        '        <div data-testid="from-md" className="h-[40px] w-[80px] bg-stone-300 md:absolute md:top-[30px] md:left-[40px]" />\n' +
        '        <div data-testid="everywhere" className="absolute top-[90px] left-[40px] h-[40px] w-[80px] bg-stone-300" />',
    );
    await expect(async () => {
      await page.goto(DEV_URL);
      await expect(page.getByTestId("everywhere")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await enterEditMode(page);
    const field = (name: string) => page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });

    // In the desktop view: the first 20px right and 10px lower, at every width; the second 20px right.
    await pickOnCanvas(page, "from-md");
    await setField(page, "X", String(Number(await field("X").inputValue()) + 20));
    await setField(page, "Y", String(Number(await field("Y").inputValue()) + 10));
    await pickOnCanvas(page, "everywhere");
    await setField(page, "X", String(Number(await field("X").inputValue()) + 20));
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(3);
    const changes: { id: number; property: string; before: unknown; after: unknown; placedOtherwiseAt?: { min: number | null; max: number | null }[] }[] = readHumanTouchFile("changeset.json").changes;
    expect(changes.map(({ property, before, after, placedOtherwiseAt }) => [property, before, after, placedOtherwiseAt?.map(({ min, max }) => [min, max])])).toEqual([
      // On the canvas, the phone view lays the first out in the hero: its X and Y place nothing below 768px.
      ["x", 40, 60, [[null, 768]]],
      ["y", 30, 40, [[null, 768]]],
      ["x", 40, 60, undefined],
    ]);
    const [x, y, other] = changes.map(({ id }) => String(id));
    await npxHumanTouch("claim");
    for (const id of [x, y, other]) expect(await npxHumanTouch("done", id)).toContain("Checked on the page: it does not show the change.");

    // As the notes say for the first; the second written placed freely from `md` up only, in the hero's layout on phones, unlike the canvas.
    editSource(APP, "md:top-[30px] md:left-[40px]", "md:top-[40px] md:left-[60px]");
    editSource(APP, 'className="absolute top-[90px] left-[40px]', 'className="md:absolute md:top-[90px] md:left-[60px]');
    await drawnWith(page.getByTestId("from-md"), "md:top-[40px]", "md:left-[60px]");
    await drawnWith(page.getByTestId("everywhere"), "md:absolute", "md:top-[90px]", "md:left-[60px]");
    for (const id of [x, y]) expect(await npxHumanTouch("done", id)).toContain("Checked on the page: it shows the change.");
    expect(await npxHumanTouch("done", other)).toContain("Checked on the page: it shows the change. At Phone (390px) the layer is drawn elsewhere than on the canvas: if you adapted it there on purpose, say so in the report.");
  });

  test("a layer the canvas places relative on phones, absolute from `md` up: its X moves it on phones too, so the phone's width is looked at, and its `left` written from `md` up only is adapted there (ticket 83, review; ADR 0016)", async ({ page }) => {
    editSource(
      APP,
      '<section className="flex h-screen flex-col justify-center" data-testid="hero">',
      '<section className="relative flex h-screen flex-col justify-center" data-testid="hero">\n' +
        '        <div data-testid="relative-below-md" className="relative h-[40px] w-[80px] bg-stone-300 md:absolute md:top-[30px] md:left-[40px]" />',
    );
    await expect(async () => {
      await page.goto(DEV_URL);
      await expect(page.getByTestId("relative-below-md")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await enterEditMode(page);
    const field = (name: string) => page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });

    // In the desktop view, 20px right, at every width: on the canvas, the phone view moves it 60px from where the hero lays it out.
    await pickOnCanvas(page, "relative-below-md");
    await setField(page, "X", String(Number(await field("X").inputValue()) + 20));
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    const [change] = readHumanTouchFile("changeset.json").changes;
    expect([change.property, change.before, change.after, change.placedOtherwiseAt]).toEqual(["x", 40, 60, undefined]);
    await npxHumanTouch("claim");

    // Written from `md` up only: on phones, the page does not move it.
    editSource(APP, "md:top-[30px] md:left-[40px]", "md:top-[30px] md:left-[60px]");
    await drawnWith(page.getByTestId("relative-below-md"), "md:left-[60px]");
    expect(await npxHumanTouch("done", String(change.id))).toContain("Checked on the page: it shows the change. At Phone (390px) the layer is drawn elsewhere than on the canvas: if you adapted it there on purpose, say so in the report.");
  });

  /** A change's ranges as the changeset records them: where the canvas places the layer otherwise, and where it moves it in its container's layout (ticket 84). */
  type Ranges = { placedOtherwiseAt?: { min: number | null; max: number | null }[]; offsetInLayoutAt?: { breakpoint: { min: number | null; max: number | null }; position: string }[] };
  const rangesOf = ({ placedOtherwiseAt, offsetInLayoutAt }: Ranges) => [
    placedOtherwiseAt?.map(({ min, max }) => [min, max]),
    offsetInLayoutAt?.map(({ breakpoint: { min, max }, position }) => [min, max, position]),
  ];

  test("a layer the canvas places relative on phones, absolute from `md` up: at the phone's width, done compares its `left` itself; written from `md` up only, it is adapted there, and done says so; written at every width, it shows (ticket 84; ADR 0016)", async ({ page }) => {
    editSource(
      APP,
      '<section className="flex h-screen flex-col justify-center" data-testid="hero">',
      '<section className="relative flex h-screen flex-col justify-center" data-testid="hero">\n' +
        '        <div data-testid="relative-below-md" className="relative h-[40px] w-[80px] bg-stone-300 md:absolute md:top-[30px] md:left-[40px]" />',
    );
    await expect(async () => {
      await page.goto(DEV_URL);
      await expect(page.getByTestId("relative-below-md")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await enterEditMode(page);
    const field = (name: string) => page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });

    // In the desktop view, 20px right, at every width: on the canvas, the phone view moves it 60px from where the hero lays it out.
    await pickOnCanvas(page, "relative-below-md");
    await setField(page, "X", String(Number(await field("X").inputValue()) + 20));
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    const [change] = readHumanTouchFile("changeset.json").changes;
    expect([change.property, change.before, change.after, ...rangesOf(change)]).toEqual(["x", 40, 60, undefined, [[null, 768, "relative"]]]);
    const id = String(change.id);
    await npxHumanTouch("claim");

    // Written from `md` up only: on phones, the page does not move it from where the hero lays it out.
    editSource(APP, "md:top-[30px] md:left-[40px]", "md:top-[30px] md:left-[60px]");
    await drawnWith(page.getByTestId("relative-below-md"), "md:left-[60px]");
    expect(await npxHumanTouch("done", id)).toBe(
      "Change 1 done: 1 of 1 change applied.\nChecked on the page: it shows the change. At Phone (390px) the layer is drawn elsewhere than on the canvas: if you adapted it there on purpose, say so in the report.\n",
    );
    // Written at every width, as the notes say.
    editSource(APP, "md:left-[60px]", "left-[60px]");
    await drawnWith(page.getByTestId("relative-below-md"), "left-[60px]");
    expect(await npxHumanTouch("done", id)).toBe("Change 1 done: 1 of 1 change applied.\nChecked on the page: it shows the change.\n");
    expect(await npxHumanTouch("finish")).toContain("Round finished: 1 of 1 change applied.\n\nEnd your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.\n\n```\n✓ Applied\n- 1. X: <the layer, and what you changed>\n```\n");
  });

  test("a layer the canvas places relative on phones, from the right from `md` up, moved: at the phone's width its `right` moves it too, as it has no `left`, so done compares it there; written from `md` up only, it is adapted there, applied, and listed under ✓ (ticket 84; ADR 0016)", async ({ page }) => {
    editSource(
      APP,
      '<section className="flex h-screen flex-col justify-center" data-testid="hero">',
      '<section className="relative flex h-screen flex-col justify-center" data-testid="hero">\n' +
        '        <div data-testid="right-from-md" className="relative h-[40px] w-[80px] bg-stone-300 md:absolute md:top-[30px] md:right-[40px]" />',
    );
    await expect(async () => {
      await page.goto(DEV_URL);
      await expect(page.getByTestId("right-from-md")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await enterEditMode(page);
    const field = (name: string) => page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });

    // In the desktop view, 20px right, at every width: placed from the right, its `right` 20px less (ADR 0014); on the canvas, the phone view moves it 20px left of where the hero lays it out.
    await pickOnCanvas(page, "right-from-md");
    await setField(page, "X", String(Number(await field("X").inputValue()) + 20));
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    const [change] = readHumanTouchFile("changeset.json").changes;
    expect([change.property, change.before, change.after, ...rangesOf(change)]).toEqual(["right", 40, 20, undefined, [[null, 768, "relative"]]]);
    const id = String(change.id);
    await npxHumanTouch("claim");

    // Written from `md` up only: on phones, the page does not move it from where the hero lays it out.
    editSource(APP, "md:right-[40px]", "md:right-[20px]");
    await drawnWith(page.getByTestId("right-from-md"), "md:right-[20px]");
    expect(await npxHumanTouch("done", id)).toBe(
      "Change 1 done: 1 of 1 change applied.\nChecked on the page: it shows the change. At Phone (390px) the layer is drawn elsewhere than on the canvas: if you adapted it there on purpose, say so in the report.\n",
    );
    expect(await npxHumanTouch("finish")).toContain(
      "Round finished: 1 of 1 change applied.\n\nEnd your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.\n\n```\n✓ Applied\n- 1. Right: <the layer, and what you changed>\n```\n",
    );
  });

  test("on a page laid out right to left, a layer the canvas places relative on phones by its `left` and its `right` both, from the right from `md` up, moved: at the phone's width its `right` is what moves it, so done compares it there; written from `md` up only, it is adapted there; written at every width, it shows (ticket 89; ADR 0016)", async ({ page }) => {
    editSource(
      APP,
      '<section className="flex h-screen flex-col justify-center" data-testid="hero">',
      '<section dir="rtl" className="relative flex h-screen flex-col justify-center" data-testid="hero">\n' +
        '        <div data-testid="both-sides" className="relative left-[8px] right-[40px] h-[40px] w-[80px] bg-stone-300 md:absolute md:top-[30px] md:left-auto md:right-[40px]" />',
    );
    await expect(async () => {
      await page.goto(DEV_URL);
      await expect(page.getByTestId("both-sides")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await enterEditMode(page);
    const field = (name: string) => page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });

    // In the desktop view, 20px right, at every width: placed from the right, its `right` 20px less (ADR 0014); on the canvas, the phone view goes by its `right`, right to left, and moves it 20px left of where the hero lays it out.
    await pickOnCanvas(page, "both-sides");
    await setField(page, "X", String(Number(await field("X").inputValue()) + 20));
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    const [change] = readHumanTouchFile("changeset.json").changes;
    expect([change.property, change.before, change.after, ...rangesOf(change)]).toEqual(["right", 40, 20, undefined, [[null, 768, "relative"]]]);
    const id = String(change.id);
    await npxHumanTouch("claim");

    // Written from `md` up only: on phones, the page moves it by its `right` as it was.
    editSource(APP, "md:right-[40px]", "md:right-[20px]");
    await drawnWith(page.getByTestId("both-sides"), "md:right-[20px]");
    expect(await npxHumanTouch("done", id)).toBe(
      "Change 1 done: 1 of 1 change applied.\nChecked on the page: it shows the change. At Phone (390px) the layer is drawn elsewhere than on the canvas: if you adapted it there on purpose, say so in the report.\n",
    );
    // Written at every width, as the notes say: its `left` there moves it nothing, right to left.
    editSource(APP, "right-[40px] h-[40px]", "right-[20px] h-[40px]");
    await drawnWith(page.getByTestId("both-sides"), "right-[20px]");
    expect(await npxHumanTouch("done", id)).toBe("Change 1 done: 1 of 1 change applied.\nChecked on the page: it shows the change.\n");
    expect(await npxHumanTouch("finish")).toContain("Round finished: 1 of 1 change applied.\n\nEnd your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.\n\n```\n✓ Applied\n- 1. Right: <the layer, and what you changed>\n```\n");
  });

  test("layers placed from the right, from the bottom and centered, moved, one resized first: they stay placed so, the notes say which value changes and how to write it, and done checks each, a centered one at every view's width (ticket 79)", async ({ page }) => {
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
    const hero = await page.getByTestId("hero").evaluate((el) => el.clientWidth);
    await enterEditMode(page);
    const x = () => page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "X", exact: true }).inputValue();

    // Its right edge 20 px out, then the layer 10 px left: 30 px from the right, 100 wide.
    await pickOnCanvas(page, "from-right");
    await dragRightEdgeOf(page, 20);
    await page.keyboard.press("Shift+ArrowLeft");
    // 20 px up: 80 px from the bottom.
    await pickOnCanvas(page, "from-bottom");
    await setField(page, "Y", String(Number(await page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Y", exact: true }).inputValue()) - 20));
    // 40 px right of the middle, still centered.
    await pickOnCanvas(page, "centered");
    await setField(page, "X", String(Number(await x()) + 40));
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(4);
    const changes: { id: number; property: string; before: unknown; after: unknown; centeredOn?: unknown }[] = readHumanTouchFile("changeset.json").changes;
    expect(changes.map(({ property, before, after, centeredOn }) => ({ property, before, after, centeredOn }))).toEqual([
      { property: "width", before: { type: "fixed", value: 80 }, after: { type: "fixed", value: 100 }, centeredOn: undefined },
      { property: "right", before: 40, after: 30, centeredOn: undefined },
      { property: "bottom", before: 60, after: 80, centeredOn: undefined },
      { property: "x", before: hero / 2, after: hero / 2 + 40, centeredOn: { before: { percent: 50, px: 0 }, after: { percent: 50, px: 40 } } },
    ]);

    const notes = await npxHumanTouch("claim");
    expect(notes).toContain("Change the right position from 40px to 30px: how far the layer's right edge is from its container's, its CSS `right`. It stays placed from that edge: do not place it by `left` instead.");
    expect(notes).toContain("Change the bottom position from 60px to 80px");
    expect(notes).toContain("Change where its `left` places it from `50%` to `calc(50% + 40px)`: 50% of its container's width from its left edge, and 40px past that (Tailwind's `left-[calc(50%+40px)]`).");
    expect(notes).toMatch(/- \*\*Centered:\*\* .*moved, only how far past the share of its container it is centered on changes/);
    expect(notes).not.toMatch(/Change the X position/);

    for (const { id } of changes) expect(await npxHumanTouch("done", String(id))).toContain("Checked on the page: it does not show the change.");
    editSource(APP, "top-[30px] right-[40px] h-[40px] w-[80px]", "top-[30px] right-[30px] h-[40px] w-[100px]");
    editSource(APP, "bottom-[60px] left-[40px]", "bottom-[80px] left-[40px]");
    // Not as the notes say: in px, right as wide as the window only.
    editSource(APP, "left-1/2 h-[40px] w-[80px]", `left-[${hero / 2 + 40}px] h-[40px] w-[80px]`);
    await drawnWith(page.getByTestId("from-right"), "right-[30px]", "w-[100px]");
    await drawnWith(page.getByTestId("from-bottom"), "bottom-[80px]");
    await drawnWith(page.getByTestId("centered"), `left-[${hero / 2 + 40}px]`);
    for (const { id } of changes.slice(0, 3)) expect(await npxHumanTouch("done", String(id))).toContain("Checked on the page: it shows the change.");
    const centered = String(changes[3].id);
    // Right as wide as the window, past the phone's screen there: the page wider than the screen (ADR 0016, ticket 147).
    expect(await npxHumanTouch("done", centered)).toContain(
      `Checked on the page: it does not show the change. At Phone (390px) change ${centered} makes the page wider than the screen (it scrolls sideways), which it did not when the round was claimed: give it this place only from a breakpoint up where it fits (a variant such as \`md:\`), or place the layer within its container, and run \`npx humantouch done ${centered}\` again.`,
    );
    editSource(APP, `left-[${hero / 2 + 40}px] h-[40px] w-[80px]`, "left-[calc(50%+40px)] h-[40px] w-[80px]");
    await drawnWith(page.getByTestId("centered"), "left-[calc(50%+40px)]");
    expect(await npxHumanTouch("done", centered)).toContain("Checked on the page: it shows the change.");
  });

  test("a layer centered by its auto margins, moved: it stays centered so, the notes say to give its sides as much more and less, and done checks where its middle is at every view's width, not a px from one side (ticket 96)", async ({ page }) => {
    editSource(
      APP,
      '<section className="flex h-screen flex-col justify-center" data-testid="hero">',
      '<section className="relative flex h-screen flex-col justify-center" data-testid="hero">\n' +
        '        <div data-testid="by-margins" className="absolute inset-x-0 top-[120px] mx-auto h-[40px] w-[80px] bg-stone-300" />',
    );
    await expect(async () => {
      await page.goto(DEV_URL);
      await expect(page.getByTestId("by-margins")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    const hero = await page.getByTestId("hero").evaluate((el) => el.clientWidth);
    await enterEditMode(page);
    const x = () => page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "X", exact: true }).inputValue();

    // Its X where it is drawn, half its width left of the middle; 40 px right, still centered.
    await pickOnCanvas(page, "by-margins");
    expect(Number(await x())).toBe(hero / 2 - 40);
    await setField(page, "X", String(Number(await x()) + 40));
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    const [change] = readHumanTouchFile("changeset.json").changes;
    expect([change.property, change.before, change.after, change.placedFrom, change.centeredOn, change.style]).toEqual([
      "x",
      hero / 2 - 40,
      hero / 2,
      { edge: "start", centered: true, margins: true },
      { before: { percent: 50, px: 0 }, after: { percent: 50, px: 40 } },
      { left: "40px", right: "-40px" },
    ]);

    const notes = await npxHumanTouch("claim");
    expect(notes).toContain("Give its `left` and `right` as much more and less, `left: 40px; right: -40px` (Tailwind's `left-[40px] right-[-40px]`), keeping both and its auto margins.");
    expect(notes).toContain("- **Placement:** the layer is centered across between its `left` and `right` by its auto margins (`margin-inline: auto`, Tailwind's `mx-auto`)");
    expect(notes).toMatch(/- \*\*Centered by auto margins:\*\* .*moved, keep both sides and the auto margins/);
    expect(notes).not.toMatch(/- \*\*Centered:\*\*/);

    const id = String(change.id);
    expect(await npxHumanTouch("done", id)).toContain("Checked on the page: it does not show the change. The layer is drawn at");
    // Not as the notes say: in px from its left, right as wide as the window only.
    const layer = page.getByTestId("by-margins");
    editSource(APP, "absolute inset-x-0 top-[120px] mx-auto", `absolute left-[${hero / 2}px] top-[120px] mx-auto`);
    await drawnWith(layer, `left-[${hero / 2}px]`);
    // Right as wide as the window, past the phone's screen there: the page wider than the screen (ADR 0016, ticket 147).
    expect(await npxHumanTouch("done", id)).toContain(`Checked on the page: it does not show the change. At Phone (390px) change ${id} makes the page wider than the screen (it scrolls sideways), which it did not when the round was claimed: `);
    editSource(APP, `absolute left-[${hero / 2}px] top-[120px] mx-auto`, "absolute left-[40px] right-[-40px] top-[120px] mx-auto");
    await drawnWith(layer, "left-[40px]", "right-[-40px]");
    expect(await npxHumanTouch("done", id)).toContain("Checked on the page: it shows the change.");
    // Its auto margins gone: drawn at its `left`.
    editSource(APP, "right-[-40px] top-[120px] mx-auto", "right-[-40px] top-[120px]");
    await expect(layer).not.toHaveClass(/(^|\s)mx-auto(\s|$)/);
    expect(await npxHumanTouch("done", id)).toContain("Checked on the page: it does not show the change. The layer is drawn at 40px");
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
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes[0]?.breakpoint?.max).toBe(768);
    // Saved again once the page is read in each part of the range, below 640px and from 640px (ticket 65).
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes[0]?.parts?.length).toBe(2);
    await npxHumanTouch("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // Not applied yet: the cards are white at the phone's width too, the first part's looked at first.
    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it does not show the change. At 639px wide, the fill is #FFFFFF, not #FF0000, as the browser computes");
    // Applied below `md` only, as the notes say: the window, 1280px wide, still shows them white.
    editSource(CARD, "bg-white p-5", "bg-white p-5 max-md:bg-[#ff0000]");
    await drawnWith(page.locator("article").first(), "max-md:bg-[#ff0000]");
    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it shows the change.");
    await expect(page.locator("article").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    // The copy of the page at the phone's width is kept while the round is claimed, and goes with it.
    await npxHumanTouch("finish");
    await expect(page.getByRole("progressbar", { name: "Applying design changes" })).toHaveCount(0);
    await expect(page.locator("iframe[data-ht-check]")).toHaveCount(0);
  });

  test("a change made in the desktop view is checked at every view's width too: the Grid's columns changed for `sm:` only are adapted at the phone's, and done says what is drawn there (ADR 0016)", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Grid", exact: true }).click();
    await setField(page, "Columns", "2");
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(1);
    await npxHumanTouch("claim");

    // As both Agents did on the bench (ticket 63): the phone still has one column.
    const grid = page.locator("main").locator('[class~="pb-16"]');
    editSource(APP, "grid grid-cols-1 gap-4 pb-16 sm:grid-cols-3", "grid grid-cols-1 gap-4 pb-16 sm:grid-cols-2");
    await drawnWith(grid, "sm:grid-cols-2");
    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it shows the change. At Phone (390px) its number of columns is 1, not 2: if you adapted it there on purpose, say so in the report.");
    await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

    editSource(APP, "grid grid-cols-1 gap-4 pb-16 sm:grid-cols-2", "grid grid-cols-2 gap-4 pb-16");
    await drawnWith(grid, "grid-cols-2");
    expect(await npxHumanTouch("done", "1")).toContain("Checked on the page: it shows the change.");
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
    await expect.poll(() => readHumanTouchFile("changeset.json")?.changes.length).toBe(2);
    await npxHumanTouch("claim");

    // Applying the button's fill, the Agent adds a line at the top of App.tsx: every marker below moves.
    const at = await button(page).getAttribute("data-ht-loc");
    editSource(CSS, "background: rgb(220, 38, 38);", "background: #2563eb;");
    editSource(APP, 'import { Badge, Surface } from "acme-ui";', '// Buttons are blue now.\nimport { Badge, Surface } from "acme-ui";');
    await expect(button(page)).toHaveCSS("background-color", "rgb(37, 99, 235)");
    // Its marker a line lower.
    await expect(button(page)).not.toHaveAttribute("data-ht-loc", at!);

    expect(await npxHumanTouch("done", "2")).toContain("Checked on the page: it shows the change.");
  });
});
