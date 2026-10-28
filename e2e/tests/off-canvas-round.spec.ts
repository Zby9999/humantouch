import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import { promisify } from "node:util";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { EXAMPLE, readVernier, VERNIER, vernierkit } from "./project-files";

/** These tests save into the example project's `.vernier/` for real. */
test.use({ keepRoundInMemory: false });

test.beforeEach(() => rmSync(VERNIER, { recursive: true, force: true }));
test.afterAll(() => rmSync(VERNIER, { recursive: true, force: true }));

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const offCanvas = (page: Page) => page.locator('iframe[title="Off canvas"]:visible');

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(desktop(page).contentFrame().locator("article").first()).toBeVisible();
}

/** Where the layer off the canvas is in the workspace, in the desktop view's px from its top left. */
async function placeOff(page: Page) {
  const view = (await desktop(page).boundingBox())!;
  const off = (await offCanvas(page).boundingBox())!;
  const zoom = view.width / (await desktop(page).evaluate((frame: HTMLIFrameElement) => frame.offsetWidth));
  return { x: Math.round((off.x - view.x) / zoom), y: Math.round((off.y - view.y) / zoom) };
}

test("a layer moved off the canvas is deleted in the round the Agent applies, and stays off the canvas, where it was, once the page is frozen afresh", async ({ page }) => {
  await page.goto(DEV_URL);
  await enterEditMode(page);
  const area = (await page.getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-400, 0);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Vernier Kit", exact: true }).click();
  const title = (await desktop(page).contentFrame().locator("h1").boundingBox())!;
  const view = (await desktop(page).boundingBox())!;
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, title.y, { steps: 10 });
  await page.mouse.up();
  await expect(offCanvas(page)).toHaveCount(1);
  const where = await placeOff(page);

  // Kept in .vernier/, ignored by git, with the JSX as the source has it now; the round has it as a deletion.
  await expect.poll(() => readVernier("off-canvas.json")?.layers.length).toBe(1);
  const [kept] = readVernier("off-canvas.json").layers;
  expect(kept.origin).toMatchObject({ written: expect.stringMatching(/^src\/App\.tsx:\d+:\d+$/), target: { component: "App" }, place: { nth: 1 } });
  expect(kept.origin.snippet.code).toBe('<h1 className="font-display text-4xl font-bold text-stone-900">Vernier Kit</h1>');
  await expect(promisify(execFile)("git", ["check-ignore", "-q", `${VERNIER}off-canvas.json`], { cwd: EXAMPLE })).resolves.toBeDefined();
  await expect.poll(() => readVernier("changeset.json")?.changes).toMatchObject([{ kind: "delete", offCanvas: kept.id }]);

  // The Agent applies the round: the notes say to delete it.
  const notes = await vernierkit("claim");
  expect(notes).toContain("Delete this layer");
  await vernierkit("done", "1");
  await vernierkit("finish");
  expect(readVernier("changeset.json")).toBeNull();

  // A new round, a canvas frozen afresh: the layer is off it still, where it was.
  await enterEditMode(page);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(offCanvas(page).contentFrame().locator("h1")).toHaveText("Vernier Kit");
  expect(await placeOff(page)).toEqual(where);
  // Off the canvas, it is no part of the round.
  await expect(page.getByRole("button", { name: /not applied yet/ })).toHaveCount(0);
});
