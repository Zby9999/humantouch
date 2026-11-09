import { execFile } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, test, type Page } from "./fixtures";
import { EXAMPLE, readThirdKindFile, THIRD_KIND_FOLDER, npx03kind } from "./project-files";

/** These tests save into the example project's `.03kind/` for real. */
test.use({ keepRoundInMemory: false });

test.beforeEach(() => rmSync(THIRD_KIND_FOLDER, { recursive: true, force: true }));
test.afterAll(() => rmSync(THIRD_KIND_FOLDER, { recursive: true, force: true }));

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const offCanvas = (page: Page) => page.locator('iframe[title="Off canvas"]:visible');

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(desktop(page).contentFrame().locator("article").first()).toBeVisible();
  await canvasInPlace(page);
}

/** Where the layer off the canvas is in the workspace, in the desktop view's px from its top left. */
async function placeOff(page: Page) {
  const view = (await desktop(page).boundingBox())!;
  const off = (await offCanvas(page).boundingBox())!;
  const zoom = view.width / (await desktop(page).evaluate((frame: HTMLIFrameElement) => frame.offsetWidth));
  return { x: Math.round((off.x - view.x) / zoom), y: Math.round((off.y - view.y) / zoom) };
}

test("a layer moved off the canvas is deleted in the round the Agent applies, and stays off the canvas, where it was, once the page is frozen afresh", async ({ page }) => {
  const APP = `${EXAMPLE}src/App.tsx`;
  const original = readFileSync(APP, "utf8");
  try {
    await movedOffAndApplied(page, APP, original);
  } finally {
    writeFileSync(APP, original);
    // The next test's page must open on the title as it was: wait for the dev server to serve it so.
    await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/App.tsx`)).text()).includes("font-display text-4xl font-bold text-stone-900")).toBe(true);
  }
});

async function movedOffAndApplied(page: Page, APP: string, original: string) {
  await page.goto(DEV_URL);
  await enterEditMode(page);
  const area = (await page.getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-400, 0);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Third Kind", exact: true }).click();
  const title = (await desktop(page).contentFrame().locator("h1").boundingBox())!;
  const view = (await desktop(page).boundingBox())!;
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, title.y, { steps: 10 });
  await page.mouse.up();
  await expect(offCanvas(page)).toHaveCount(1);
  const where = await placeOff(page);

  // Kept in .03kind/, ignored by git, with the JSX as the source has it now; the round has it as a deletion.
  await expect.poll(() => readThirdKindFile("off-canvas.json")?.layers.length).toBe(1);
  const [kept] = readThirdKindFile("off-canvas.json").layers;
  expect(kept.origin).toMatchObject({ written: expect.stringMatching(/^src\/App\.tsx:\d+:\d+$/), target: { component: "App" }, place: { nth: 1 } });
  expect(kept.origin.snippet.code).toBe('<h1 className="font-display text-4xl font-bold text-stone-900">Third Kind</h1>');
  await expect(promisify(execFile)("git", ["check-ignore", "-q", `${THIRD_KIND_FOLDER}off-canvas.json`], { cwd: EXAMPLE })).resolves.toBeDefined();
  await expect.poll(() => readThirdKindFile("changeset.json")?.changes).toMatchObject([{ kind: "delete", offCanvas: kept.id }]);

  // The Agent applies the round: the notes say to delete it, and it does; the page shows it gone (ticket 68: else the deletion is left for the next round).
  const notes = await npx03kind("claim");
  expect(notes).toContain("Delete this layer");
  writeFileSync(APP, original.replace(`          ${kept.origin.snippet.code}\n`, ""));
  await expect(page.locator("h1")).toHaveCount(0);
  await npx03kind("done", "1");
  await npx03kind("finish");
  expect(readThirdKindFile("changeset.json")).toBeNull();

  // A new round, a canvas frozen afresh: the layer is off it still, where it was.
  await enterEditMode(page);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(offCanvas(page).contentFrame().locator("h1")).toHaveText("Third Kind");
  await expect.poll(() => placeOff(page)).toEqual(where);
  // Off the canvas, it is no part of the round.
  await expect(page.getByRole("button", { name: /not applied yet/ })).toHaveCount(0);
}

test("a layer the Agent deleted in an earlier round, put back in the next, is written back by the Agent from its source as it was kept", async ({ page }) => {
  const APP = `${EXAMPLE}src/App.tsx`;
  const original = readFileSync(APP, "utf8");
  const TITLE = '<h1 className="font-display text-4xl font-bold text-stone-900">Third Kind</h1>';
  try {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    const area = (await page.getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.wheel(-400, 0);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Third Kind", exact: true }).click();
    const title = (await desktop(page).contentFrame().locator("h1").boundingBox())!;
    const view = (await desktop(page).boundingBox())!;
    await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
    await page.mouse.down();
    await page.mouse.move(view.x - 200, title.y, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => readThirdKindFile("off-canvas.json")?.layers[0]?.origin.snippet?.code).toBe(TITLE);
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(1);

    // The Agent applies the round: it deletes the title from the code.
    await npx03kind("claim");
    writeFileSync(APP, original.replace(`          ${TITLE}\n`, ""));
    await expect(page.locator("h1")).toHaveCount(0);
    await npx03kind("done", "1");
    await npx03kind("finish");

    // The next round: the page frozen afresh, without it; it is put back at the start of the header.
    await enterEditMode(page);
    await expect(desktop(page).contentFrame().locator("h1")).toHaveCount(0);
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.wheel(-400, 0);
    const beta = (await desktop(page).contentFrame().locator("header").getByText("Beta").boundingBox())!;
    const moved = offCanvas(page).contentFrame().locator("h1");
    const off = (await moved.boundingBox())!;
    // Pressed clear of its handles, the layer selected (ticket 107).
    await page.mouse.move(off.x + Math.min(12, off.width / 2), off.y + off.height / 2);
    await page.mouse.down();
    await page.mouse.move(beta.x + 3, beta.y + beta.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(offCanvas(page)).toHaveCount(0);
    await expect(desktop(page).contentFrame().locator("header > h1")).toHaveText("Third Kind");
    await expect.poll(() => readThirdKindFile("changeset.json")?.changes.map((change: { kind: string }) => change.kind)).toEqual(["putBack"]);
    await expect.poll(() => readThirdKindFile("off-canvas.json")).toBeNull();

    // The notes give its source as it was kept, for the Agent to write back where it goes.
    const notes = await npx03kind("claim");
    expect(notes).toContain("1. Put back");
    expect(notes).toContain("moved off the canvas in an earlier round and deleted from the code then");
    expect(notes).toContain("as its 1st layer");
    expect(notes).toContain(`  ${TITLE}\n`);
    writeFileSync(APP, original);
    await expect(page.locator("header > h1")).toHaveText("Third Kind");
    await npx03kind("done", "1");
    await npx03kind("finish");
    expect(readThirdKindFile("changeset.json")).toBeNull();
    await enterEditMode(page);
    await expect(desktop(page).contentFrame().locator("header > h1")).toHaveText("Third Kind");
    await expect(offCanvas(page)).toHaveCount(0);
  } finally {
    writeFileSync(APP, original);
  }
});
