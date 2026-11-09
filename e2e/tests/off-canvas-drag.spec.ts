import { OFF_CANVAS_PATH, ROUND_PATH, SERVICE_GLOBAL, TOKEN_HEADER } from "../../packages/03kind/src/service-protocol";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";

/** Ticket 108: dragging layers into, out of and between the layers off the canvas. */

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const offCanvas = (page: Page) => page.locator('iframe[title="Off canvas"]:visible');
const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });
const layerTree = (page: Page) => page.getByRole("tree", { name: "Layers" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const mod = process.platform === "darwin" ? "Meta" : "Control";

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("article").first()).toBeVisible();
  await canvasInPlace(page);
}

/** The names of the round's changes, as the change list shows them; none with no badge. */
async function changeNames(page: Page): Promise<string[]> {
  if (!(await badge(page).count())) return [];
  await badge(page).click();
  const names = await page.getByRole("dialog", { name: "Changes" }).locator(".tk-change-name").allTextContents();
  await page.keyboard.press("Escape");
  return names;
}

/**
 * A Frame drawn with F in the blank space left of the views, 260 × 180 on
 * screen (ticket 106): returns it, once it is where it was drawn.
 */
async function drawFrame(page: Page): Promise<Locator> {
  const area = (await viewportArea(page).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-500, 0);
  const view = await steadyBox(desktop(page));
  const at = { x: area.x + 30, y: view.y + 20 };
  await page.keyboard.press("f");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 260, at.y + 180, { steps: 6 });
  await page.mouse.up();
  const frame = offCanvas(page).first();
  await expect(frame).toBeVisible();
  await steadyBox(frame);
  return frame;
}

/** Presses on the middle of `from`, and moves to `to` in steps, as a hand would: the drag under way, the pointer still down. */
async function pressAndMove(page: Page, from: Locator, to: { x: number; y: number }) {
  const box = await steadyBox(from);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
}

/** What the local service has saved now: the round's changes (none with no round), and the looks of the layers off the canvas. */
async function saved(page: Page): Promise<{ changes: number; offCanvas: string[] }> {
  return page.evaluate(
    async ({ global, header, paths }) => {
      const config = (window as unknown as Record<string, { url: string; token: string }>)[global];
      const read = async (path: string) => {
        const response = await fetch(`${config.url}${path}`, { headers: { [header]: config.token } });
        return response.status === 204 ? null : await response.json();
      };
      const [round, outside] = [await read(paths.round), await read(paths.offCanvas)];
      return { changes: round?.changeSet.changes.length ?? 0, offCanvas: (outside?.layers ?? []).map((layer: { look: string }) => layer.look) };
    },
    { global: SERVICE_GLOBAL, header: TOKEN_HEADER, paths: { round: ROUND_PATH, offCanvas: OFF_CANVAS_PATH } },
  );
}

/** The middle of what `locator` finds, on screen. */
async function middleOf(locator: Locator) {
  const box = await steadyBox(locator);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The title, dragged from the desktop view into the middle of `frame`, a layer off the canvas, and let go. */
async function titleInto(page: Page, frame: Locator, keys: { alt?: boolean } = {}) {
  await layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).first().click();
  const to = await middleOf(frame);
  await pressAndMove(page, desktop(page).contentFrame().locator("h1"), to);
  if (keys.alt) await page.keyboard.down("Alt");
  await page.mouse.up();
  if (keys.alt) await page.keyboard.up("Alt");
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("a layer of the canvas dragged into a Frame off it is in it, deleted on the page; while dragged, ⌘Z and Delete do nothing; one ⌘Z takes both back", async ({ page }) => {
  await enterEditMode(page);
  const frame = await drawFrame(page);
  await layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).first().click();

  await pressAndMove(page, desktop(page).contentFrame().locator("h1"), await middleOf(frame));
  // Where it would go is shown in the Frame: its outline, and the layer's ghost.
  await expect(page.locator(".tk-drag-ghost")).toBeVisible();
  await page.keyboard.press(`${mod}+z`);
  await page.keyboard.press("Delete");
  await page.mouse.up();

  await expect(frame.contentFrame().locator("h1")).toHaveText("Third Kind");
  await expect(desktop(page).contentFrame().locator("h1")).toBeHidden();
  await expect(phone(page).contentFrame().locator("h1")).toBeHidden();
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
  expect(await changeNames(page)).toEqual(["Delete · Third Kind"]);
  await expect(layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).first()).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press(`${mod}+z`);
  await expect(frame.contentFrame().locator("h1")).toHaveCount(0);
  await expect(desktop(page).contentFrame().locator("h1")).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(frame.contentFrame().locator("h1")).toHaveText("Third Kind");
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  // Its deletion taken back from the change list: back on the page, out of the Frame; as an edit, ⌘Z moves it in again.
  await badge(page).click();
  await page.getByRole("dialog", { name: "Changes" }).getByRole("button", { name: /^Undo the delet/ }).click();
  await expect(desktop(page).contentFrame().locator("h1")).toBeVisible();
  await expect(frame.contentFrame().locator("h1")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod}+z`);
  await expect(frame.contentFrame().locator("h1")).toHaveText("Third Kind");
  await expect(desktop(page).contentFrame().locator("h1")).toBeHidden();
});

test("Esc while dragging into a Frame off the canvas puts the layer back where it was; with ⌥, a copy goes in and the page stays as it is", async ({ page }) => {
  await enterEditMode(page);
  const frame = await drawFrame(page);
  await layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).first().click();

  await pressAndMove(page, desktop(page).contentFrame().locator("h1"), await middleOf(frame));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(frame.contentFrame().locator("h1")).toHaveCount(0);
  await expect(desktop(page).contentFrame().locator("h1")).toBeVisible();
  await expect(badge(page)).toHaveCount(0);

  await titleInto(page, frame, { alt: true });
  await expect(frame.contentFrame().locator("h1")).toHaveText("Third Kind");
  await expect(desktop(page).contentFrame().locator("h1")).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
});

test("the Frame put back onto a view is made there, the layer dragged into it moved into it: no deletion, no put back; kept after a reload", async ({ page }) => {
  await enterEditMode(page);
  const frame = await drawFrame(page);
  await titleInto(page, frame);
  await expect(frame.contentFrame().locator("h1")).toHaveText("Third Kind");

  // The Frame itself, by its blank part below the title, onto the hero.
  const box = await steadyBox(frame);
  await layerTree(page).getByRole("treeitem", { name: "Frame", exact: true }).first().click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 30);
  await page.mouse.down();
  const hero = await middleOf(desktop(page).contentFrame().getByTestId("hero"));
  await page.mouse.move(hero.x, hero.y, { steps: 12 });
  await page.mouse.up();

  await expect(offCanvas(page)).toHaveCount(0);
  const title = desktop(page).contentFrame().locator("h1");
  await expect(title).toBeVisible();
  await expect(title.locator("xpath=..")).toHaveAttribute("data-tk-new", "frame");
  const names = await changeNames(page);
  expect(names.some((name) => /Delete|Put back/.test(name))).toBe(false);
  expect(names.filter((name) => name.endsWith("· Third Kind"))).toHaveLength(1);

  // Saved, the Frame on the canvas and none off it, before the reload.
  await expect.poll(() => saved(page)).toEqual({ changes: names.length, offCanvas: [] });
  await page.reload();
  await enterEditMode(page);
  await expect(desktop(page).contentFrame().locator("h1").locator("xpath=..")).toHaveAttribute("data-tk-new", "frame");
  expect(await changeNames(page)).toEqual(names);
});

test("a layer dragged out of a Frame off the canvas into the blank space is a layer off it of its own, with no change; dragged onto a view, it is moved there", async ({ page }) => {
  await enterEditMode(page);
  const frame = await drawFrame(page);
  await titleInto(page, frame);
  const inFrame = frame.contentFrame().locator("h1");
  await expect(inFrame).toHaveText("Third Kind");

  // Out, below the Frame, in the blank space.
  const box = await steadyBox(frame);
  await pressAndMove(page, inFrame, { x: box.x + 60, y: box.y + box.height + 120 });
  await page.mouse.up();
  await expect(offCanvas(page)).toHaveCount(2);
  await expect(frame.contentFrame().locator("h1")).toHaveCount(0);
  expect(await changeNames(page)).toEqual(["Delete · Third Kind"]);

  // Back onto the canvas, at the start of the header, before the badge.
  const own = offCanvas(page).nth(1);
  const beta = await steadyBox(desktop(page).contentFrame().locator("header").getByText("Beta"));
  await pressAndMove(page, own.contentFrame().locator("h1"), { x: beta.x + 3, y: beta.y + beta.height / 2 });
  await page.mouse.up();
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(desktop(page).contentFrame().locator("h1")).toBeVisible();
  // Back where it was: neither change left.
  expect(await changeNames(page)).toEqual([]);
});

test("a Frame off the canvas with a layer dragged into it is there still after a reload; dragged whole into another, it goes in, with no change", async ({ page }) => {
  await enterEditMode(page);
  const frame = await drawFrame(page);
  await titleInto(page, frame);
  await expect(frame.contentFrame().locator("h1")).toHaveText("Third Kind");
  const where = await steadyBox(frame);

  // Saved, the title's deletion and the Frame with the title in it, before the reload.
  await expect
    .poll(async () => {
      const now = await saved(page);
      return { changes: now.changes, offCanvas: now.offCanvas.map((look) => look.includes("Third Kind")) };
    })
    .toEqual({ changes: 1, offCanvas: [true] });
  await page.reload();
  await enterEditMode(page);
  const area = (await viewportArea(page).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-500, 0);
  await expect(offCanvas(page).contentFrame().locator("h1")).toHaveText("Third Kind");
  await expect.poll(async () => Math.round((await steadyBox(offCanvas(page))).x)).toBe(Math.round(where.x));
  expect(await changeNames(page)).toEqual(["Delete · Third Kind"]);

  // Another Frame, below it; the first dragged into it whole, by its blank part.
  const box = await steadyBox(offCanvas(page).first());
  await page.keyboard.press("f");
  await page.mouse.move(box.x, box.y + box.height + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + box.height + 340, { steps: 6 });
  await page.mouse.up();
  await expect(offCanvas(page)).toHaveCount(2);
  const second = await steadyBox(offCanvas(page).nth(1));
  await layerTree(page).getByRole("treeitem", { name: "Frame", exact: true }).nth(1).click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(offCanvas(page)).toHaveCount(1);
  await expect(offCanvas(page).contentFrame().locator("h1")).toHaveText("Third Kind");
  expect(await changeNames(page)).toEqual(["Delete · Third Kind"]);
  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(2);
});
