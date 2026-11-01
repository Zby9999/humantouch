import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { REACT18_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { clearThirdKindFolder } from "./project-files";

/** A round on the React 18 + Tailwind v3 example, saved into its `.03kind/` for real. */
test.use({ keepRoundInMemory: false });
test.describe.configure({ mode: "serial" });

const EXAMPLE = fileURLToPath(new URL("../../examples/vite-react18-tw3/", import.meta.url));
const THIRD_KIND_FOLDER = `${EXAMPLE}.03kind/`;
const CARD = `${EXAMPLE}src/components/Card.tsx`;
const CLI = fileURLToPath(new URL("../../packages/03kind/dist/cli.js", import.meta.url));

test.beforeEach(async () => {
  clearThirdKindFolder(THIRD_KIND_FOLDER);
  // A test that edits Card.tsx puts it back, but the dev server's watcher may see that late: till then a page loaded
  // would still get the edit, bg-brand-50, the very color the tablet view test sets, and its fill would change nothing.
  await expect.poll(async () => (await fetch(`${REACT18_URL}/src/components/Card.tsx`)).text()).toContain(" bg-white ");
});
test.afterAll(() => clearThirdKindFolder(THIRD_KIND_FOLDER));

/** `file:line:column` of the first occurrence of `snippet` in an example source file. */
function locate(file: string, snippet: string) {
  const lines = readFileSync(`${EXAMPLE}${file}`, "utf8").split("\n");
  const line = lines.findIndex((text) => text.includes(snippet));
  if (line < 0) throw new Error(`${snippet} not found in ${file}`);
  return `${file}:${line + 1}:${lines[line].indexOf(snippet) + 1}`;
}

async function npx03kind(...args: string[]) {
  const { stdout } = await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: EXAMPLE });
  return stdout;
}

function savedChanges() {
  const file = `${THIRD_KIND_FOLDER}changeset.json`;
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).changes : null;
}

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

async function setField(page: Page, name: string, value: string) {
  const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** Fills the three cards of the loop with the project's lightest brand color: one change, saved. */
async function fillTheCards(page: Page) {
  await page.goto(REACT18_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Fill color", "eef4ff");
  await expect.poll(() => savedChanges()?.length).toBe(1);
}

test("the project's own Variables and breakpoints from its Tailwind v3 config reach the page and the canvas", async ({ page }) => {
  const columns = () => page.getByTestId("features").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  const heroAlign = () => page.getByTestId("hero").evaluate((hero) => getComputedStyle(hero).textAlign);
  // The project's breakpoints, not Tailwind's: sm at 560px, md at 820px, lg at 1120px.
  await page.setViewportSize({ width: 540, height: 720 });
  await page.goto(REACT18_URL);
  expect(await columns()).toBe(1);
  await page.setViewportSize({ width: 580, height: 720 });
  expect(await columns()).toBe(2);
  await page.setViewportSize({ width: 800, height: 720 });
  expect(await heroAlign()).toBe("start");
  await page.setViewportSize({ width: 840, height: 720 });
  expect(await heroAlign()).toBe("center");
  await page.setViewportSize({ width: 1140, height: 720 });
  expect(await columns()).toBe(4);

  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  const card = canvas(page).locator("article").first();
  await expect(card).toHaveCSS("border-radius", "14px");
  await expect(card).toHaveCSS("padding-top", "22px");
  await expect(card).toHaveCSS("border-top-color", "rgb(219, 230, 255)");
  await expect(card).toHaveCSS("box-shadow", /rgba\(27, 29, 42, 0\.08\) 0px 4px 12px/);
  await expect(canvas(page).locator("h1")).toHaveCSS("font-size", "44px");
  await expect(canvas(page).getByRole("button", { name: "Get started" })).toHaveCSS("background-color", "rgb(61, 99, 245)");
});

test("on React 18, the usage chain is read as on React 19: App's own elements, the cards of the loop and the other, and both components from a dependency", async ({ page }) => {
  await page.goto(REACT18_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const chainOf = async (selector: string) => JSON.parse((await canvas(page).locator(selector).first().getAttribute("data-tk-chain"))!);
  const app = { component: "App", usage: locate("src/main.tsx", "<App"), thirdParty: false };

  expect(await chainOf("h1")).toEqual([app]);
  expect(await chainOf("article")).toEqual([{ component: "Card", usage: locate("src/App.tsx", "<Card key"), thirdParty: false }, app]);
  expect(await chainOf("article:last-child h3")).toEqual([{ component: "Card", usage: locate("src/App.tsx", '<Card title="Your turn"'), thirdParty: false }, app]);
  expect(await chainOf("[data-testid=acme-badge]")).toEqual([{ component: "Badge", usage: locate("src/App.tsx", "<Badge"), thirdParty: true }, app]);
  // Surface passes its props on, the usage marker with them.
  expect(await chainOf("[data-testid=features]")).toEqual([{ component: "Surface", usage: locate("src/App.tsx", "<Surface"), thirdParty: true }, app]);
});

test("on React 18, claim reads the usage chain as on React 19: the card's usage in App, App's in main.tsx", async ({ page }) => {
  await fillTheCards(page);

  const [, fill] = (await npx03kind("claim")).split(/^## /m);

  expect(fill).toMatch(/- \*\*Location:\*\* `src\/components\/Card\.tsx:\d+:\d+`\n/);
  expect(fill).toMatch(/- \*\*Scope:\*\* This usage only: Card used at `src\/App\.tsx:\d+:\d+`, inside App used at `src\/main\.tsx:\d+:\d+`\. It renders 3 instances/);
  // Typed as a hex value, it is exactly the project's lightest brand color: the notes name it.
  expect(fill).toContain("- **Variables:** the fill color is the Variable `brand-50`, from the Tailwind theme: use its class, `bg-brand-50`.\n");
  // Tailwind v3 writes its utilities in no CSS layer.
  expect(fill).toContain("- **Currently set by:** class `bg-white`: rule `.bg-white` in no CSS layer, of `src/index.css`");
});

test("a value typed close to a Variable, its hint left unused, is the exact value: the notes say no Variable has it", async ({ page }) => {
  await page.goto(REACT18_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  // #EEF3FF is a hair from the project's brand-50, #EEF4FF, and as near Tailwind's own indigo-50, #EEF2FF:
  // the field hints at the project's.
  await setField(page, "Fill color", "eef3ff");
  const design = page.getByRole("complementary", { name: "Design" });
  await expect(design.getByRole("button", { name: "Use variable brand-50" })).toBeVisible();
  await expect(design.getByRole("button", { name: "Use variable indigo-50" })).toHaveCount(0);
  await expect.poll(() => savedChanges()?.[0]?.variables).toEqual({ color: null });
  expect(savedChanges()[0].after).toEqual({ type: "solid", color: "#EEF3FF", opacity: 1 });

  const [, fill] = (await npx03kind("claim")).split(/^## /m);
  expect(fill).toContain(
    "- **Variables:** no Variable has the fill color's value: use the exact value (with Tailwind, an arbitrary value: `bg-[#EEF3FF]`), not a class or Variable whose value is close.\n",
  );
});

test("a value typed before the project's Variables are in is named by them once they are", async ({ page }) => {
  // The Variables held back till the edit is made and saved.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/variables", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(REACT18_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Fill color", "eef4ff");
  await expect.poll(() => savedChanges()?.length).toBe(1);
  expect(savedChanges()[0]).not.toHaveProperty("variables");

  release();
  await expect.poll(() => savedChanges()?.[0]?.variables?.color?.name).toBe("brand-50");
  const [, fill] = (await npx03kind("claim")).split(/^## /m);
  expect(fill).toContain("- **Variables:** the fill color is the Variable `brand-50`, from the Tailwind theme: use its class, `bg-brand-50`.\n");
});

test("a whole round: claim locks the editor, done checks the fill on the page once Card.tsx uses the project's color, finish ends the round", async ({ page }) => {
  await fillTheCards(page);
  await npx03kind("claim");
  const progress = page.getByRole("progressbar", { name: "Applying design changes" });
  await expect(page.getByRole("button", { name: /^03Kind: applying design changes/ })).toHaveAttribute("aria-disabled", "true");
  await expect(progress).toHaveAttribute("aria-valuemax", "1");
  const original = readFileSync(CARD, "utf8");
  try {
    expect(await npx03kind("done", "1")).toContain("Checked on the page: it does not show the change.");

    // As the Agent does: the project's Variable, not the hex value.
    writeFileSync(CARD, original.replace(" bg-white ", " bg-brand-50 "));

    expect(await npx03kind("done", "1")).toContain("Checked on the page: it shows the change.");
    await expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(await npx03kind("finish")).toMatch(/^Round finished: 1 of 1 change applied.\n\nEnd your reply with this report\. Each change is under the heading/);
  } finally {
    writeFileSync(CARD, original);
  }
});

test("a change made in the tablet view is at the range of the project's own Tailwind v3 screens the view is in and those above it up to the desktop view's, and noted with them", async ({ page }) => {
  await page.goto(REACT18_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  const tablet = page.locator('iframe[title="Tablet 768"]');
  await expect(tablet.contentFrame().locator("h1")).toBeVisible();
  // 768px is between the project's sm (560px) and md (820px); the desktop view, 1280px wide, is from lg (1120px) up.
  await expect(page.getByRole("group", { name: "Tablet view" })).toContainText("sm:max-lg:");
  const box = (await tablet.contentFrame().locator("article").first().boundingBox())!;
  await page.keyboard.down("Meta");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Meta");
  await expect(page.getByRole("region", { name: "Tablet breakpoint" })).toContainText("560px to 1119px");
  await setField(page, "Fill color", "eef4ff");
  await expect.poll(() => savedChanges()?.[0]?.breakpoint).toEqual({ min: 560, max: 1120, project: { tailwind: "sm:max-lg:" } });

  const notes = await npx03kind("claim");
  expect(notes).toContain("- **Breakpoint:** 560px to 1119px only (`@media (560px <= width < 1120px)`), as the designer changed it in a narrower view. The project writes these widths with Tailwind's `sm:max-lg:`");
});
