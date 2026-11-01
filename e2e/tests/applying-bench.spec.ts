import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { STALL_MS } from "../../packages/03kind/src/client/agent-stall";
import { canvasUpdatedNotice, canvasUpdatedNoticesShown, pageChangedNotice, pageChangedNoticesShown, recordNotices, stalledNotice, stalledNoticesShown, unclaimedNotice, unclaimedNoticesShown } from "../bench/notices";
import { expect, test, type Locator, type Page } from "./fixtures";
import { clearThirdKindFolder, EXAMPLE, readThirdKindFile, THIRD_KIND_FOLDER, npx03kind } from "./project-files";

/**
 * The applying bench, scripted (docs/goals.md, Robust): a script plays the
 * Agent, the way real ones do or fail to, through a round of three changes to
 * the cards of the loop. Each playbook records the numbers of the mechanism it
 * tries, in `bench-results/playbooks/` and in the output; it asserts none of
 * them. Tickets 64–68 and 78 each add the assertion of their own goal; ticket 68's
 * own playbooks also measure the canvas edit mode comes back to.
 */

/** These tests save into the example project's `.03kind/` for real, and edit its source. */
test.use({ keepRoundInMemory: false });
test.setTimeout(120_000);

/**
 * The toggle says the Agent seems to have stopped once nothing has moved for
 * `STALL_MS` (ticket 67), about 9 minutes. The playbooks run the page's clock
 * on past most of it (Playwright's clock: nothing in the editor layer is set
 * apart for tests); `TK_BENCH_STALL_REAL=1` has the playbook of an Agent that
 * stops halfway wait it out in real time instead.
 */
const STALL_REAL = process.env.TK_BENCH_STALL_REAL === "1";
/** How late the notice may show, past the threshold (docs/goals.md, Robust). */
const NOTICE_LATE_MS = 5000;
/** How much longer than that a playbook watches for it, so a notice too late is measured rather than missed. */
const WATCH_PAST_MS = 5000;
/** How long the editor layer is watched for noticing code changed with no claim. */
const UNCLAIMED_WATCH_MS = Number(process.env.TK_BENCH_UNCLAIMED_WATCH_MS ?? 5_000);

const RESULTS = fileURLToPath(new URL("../../bench-results/playbooks/", import.meta.url));
const CARD = `${EXAMPLE}src/components/Card.tsx`;
const original = readFileSync(CARD, "utf8");

/** The round: the cards of the loop filled red, with 4px corners and a red stroke; each change, as an Agent writes it into the Card. */
const CHANGES = [
  { field: "Fill color", value: "ff0000", from: "bg-white", to: "bg-[#ff0000]", property: "backgroundColor", shown: "rgb(255, 0, 0)" },
  { field: "Corner radius", value: "4", from: "rounded-xl", to: "rounded-[4px]", property: "borderTopLeftRadius", shown: "4px" },
  { field: "Stroke color", value: "ff0000", from: "border-stone-200", to: "border-[#ff0000]", property: "borderTopColor", shown: "rgb(255, 0, 0)" },
] as const;
const IDS = [1, 2, 3];


test.beforeEach(() => clearThirdKindFolder(THIRD_KIND_FOLDER));
test.afterEach(async () => {
  if (readFileSync(CARD, "utf8") !== original) writeFileSync(CARD, original);
  // The next test's page must open on the Card as it was: wait for the dev server to serve it so.
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text()).includes("rounded-xl border border-stone-200 bg-white")).toBe(true);
});
test.afterAll(() => clearThirdKindFolder(THIRD_KIND_FOLDER));

const canvas = (page: Page) => page.locator('iframe[title="Canvas"]').contentFrame();
const ring = (page: Page) => page.getByRole("progressbar", { name: "Applying design changes" });

/** The designer makes the round in edit mode, and it is saved. Each time either notice shows is noted from here on. */
async function designTheRound(page: Page) {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  for (const { field, value } of CHANGES) {
    const box = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: field, exact: true });
    await box.fill(value);
    await box.press("Enter");
  }
  await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(CHANGES.length);
}

/** The scripted Agent writes change `id` into the code; the dev server brings it into the page. */
async function apply(page: Page, id: number) {
  const { from, to, property, shown } = CHANGES[id - 1];
  const text = readFileSync(CARD, "utf8");
  expect(text).toContain(from);
  writeFileSync(CARD, text.replace(from, to));
  await expect.poll(() => page.locator("article").first().evaluate((card, name) => getComputedStyle(card)[name as "color"], property)).toBe(shown);
}

/** How many of the changes the live page shows now. */
function shownOnPage(page: Page) {
  return page
    .locator("article")
    .first()
    .evaluate((card, changes) => changes.filter(({ property, shown }) => getComputedStyle(card)[property as "color"] === shown).length, CHANGES as unknown as { property: string; shown: string }[]);
}

/** The progress ring's count, and how far it is from what the page shows: the ring is to show what is on the page (goals: 0). */
async function progressGap(page: Page) {
  const count = Number((await ring(page).getAttribute("aria-valuenow")) ?? 0);
  return Math.abs(count - (await shownOnPage(page)));
}

/** Of the changes the page can check (all three), how many have a check result, shown or not. The round's archive when it ended, else its checks so far. */
function checkCoverage() {
  const history = `${THIRD_KIND_FOLDER}history/`;
  let results: Record<string, { outcome: string }> = readThirdKindFile("checks.json")?.results ?? {};
  try {
    const last = readdirSync(history).sort().at(-1);
    if (last) results = JSON.parse(readFileSync(`${history}${last}/result.json`, "utf8")).checks;
  } catch {
    // Not ended.
  }
  return IDS.filter((id) => ["shown", "not shown"].includes(results[id]?.outcome)).length / IDS.length;
}

/** Watches for `notice` for up to `ms`: how long it took to show, or null if it never did. */
async function watchFor(notice: ReturnType<typeof stalledNotice>, ms: number): Promise<number | null> {
  const start = Date.now();
  try {
    await notice.first().waitFor({ state: "visible", timeout: ms });
    return Date.now() - start;
  } catch {
    return null;
  }
}

/** Keeps a playbook's numbers: in `bench-results/playbooks/<id>.json`, and in the output. */
function record(id: string, metrics: Record<string, unknown>) {
  mkdirSync(RESULTS, { recursive: true });
  const entry = { playbook: id, date: new Date().toISOString(), ...metrics };
  writeFileSync(`${RESULTS}${id}.json`, `${JSON.stringify(entry, null, 2)}\n`);
  test.info().annotations.push({ type: "bench", description: JSON.stringify(metrics) });
  console.log(`bench ${id}: ${JSON.stringify(metrics)}`);
}

/** Whether either notice shows now: while the Agent works as it should, each one that does is a false one. `unclaimed`: ticket 66's notice, or since ticket 78 either toast of the code changing. */
async function falseNotices(page: Page) {
  const unclaimed = (await unclaimedNotice(page).count()) + (await canvasUpdatedNotice(page).count()) + (await pageChangedNotice(page).count());
  return { stalled: (await stalledNotice(page).count()) > 0, unclaimed: unclaimed > 0 };
}

test("playbook: the Agent follows the workflow, done after each change, then finish", async ({ page }) => {
  await designTheRound(page);
  await npx03kind("claim");
  const gaps: number[] = [];
  const notices: { stalled: boolean; unclaimed: boolean }[] = [];
  for (const id of IDS) {
    await apply(page, id);
    gaps.push(await progressGap(page));
    notices.push(await falseNotices(page));
    await npx03kind("done", String(id));
    await expect(ring(page)).toHaveAttribute("aria-valuenow", String(id));
    gaps.push(await progressGap(page));
    notices.push(await falseNotices(page));
  }
  const atEnd = await progressGap(page);
  await npx03kind("finish");
  record("follows-the-workflow", {
    checkCoverage: checkCoverage(),
    progressGapAtEnd: atEnd,
    progressGapMax: Math.max(...gaps),
    falseStallNotices: notices.filter((notice) => notice.stalled).length,
    falseUnclaimedNotices: notices.filter((notice) => notice.unclaimed).length,
    looked: notices.length,
    unclaimedNoticesShown: (await unclaimedNoticesShown(page)).length,
    stalledNoticesShown: (await stalledNoticesShown(page)).length,
  });
  // Ticket 66: an Agent that claims first never has the designer told the code changes unclaimed.
  expect((await unclaimedNoticesShown(page)).length).toBe(0);
  // Ticket 67: nor that it seems to have stopped.
  expect((await stalledNoticesShown(page)).length).toBe(0);
});

test("playbook: the Agent skips done, applies every change and finishes", async ({ page }) => {
  await designTheRound(page);
  await npx03kind("claim");
  await expect(ring(page)).toBeVisible();
  const gaps: number[] = [];
  for (const id of IDS) {
    await apply(page, id);
    gaps.push(await progressGap(page));
  }
  const atEnd = gaps.at(-1)!;
  await npx03kind("finish");
  const coverage = checkCoverage();
  const unclaimedShown = (await unclaimedNoticesShown(page)).length;
  record("skips-done", { checkCoverage: coverage, progressGapAtEnd: atEnd, progressGapMax: Math.max(...gaps), unclaimedNoticesShown: unclaimedShown });
  // Ticket 64: the page checks each change as the code changes, done or not, and the ring counts what it shows.
  expect(coverage).toBe(1);
  expect(atEnd).toBe(0);
  // Ticket 66: no false notice.
  expect(unclaimedShown).toBe(0);
});

test("playbook: the Agent applies every change first, then runs done for them all, then finish", async ({ page }) => {
  await designTheRound(page);
  await npx03kind("claim");
  await expect(ring(page)).toBeVisible();
  for (const id of IDS) await apply(page, id);
  const beforeDone = await progressGap(page);
  for (const id of IDS) await npx03kind("done", String(id));
  await expect(ring(page)).toHaveAttribute("aria-valuenow", String(IDS.length));
  const atEnd = await progressGap(page);
  await npx03kind("finish");
  const coverage = checkCoverage();
  const unclaimedShown = (await unclaimedNoticesShown(page)).length;
  record("done-all-at-the-end", { checkCoverage: coverage, progressGapAtEnd: atEnd, progressGapMax: Math.max(beforeDone, atEnd), unclaimedNoticesShown: unclaimedShown });
  // Ticket 64: no worse than before (100%), and the ring is the page's.
  expect(coverage).toBe(1);
  expect(atEnd).toBe(0);
  // Ticket 66: no false notice.
  expect(unclaimedShown).toBe(0);
});

/**
 * The Agent stops halfway: claims, applies change 1, runs done, and is gone.
 * When it was last seen moving, as the test can tell: once `done` has answered.
 */
async function stopHalfway(page: Page): Promise<number> {
  await designTheRound(page);
  await npx03kind("claim");
  await apply(page, 1);
  await npx03kind("done", "1");
  const stoppedAt = Date.now();
  await expect(ring(page)).toHaveAttribute("aria-valuenow", "1");
  return stoppedAt;
}

/**
 * Waits for the toggle to say the Agent seems to have stopped, from `stoppedAt`
 * on: in real time, or with the page's clock run on to 2 seconds short of the
 * threshold first. How long after the stop it showed, or null if it never did
 * by the threshold + 5 seconds and some.
 */
async function noticeAfterStop(page: Page, stoppedAt: number, real = STALL_REAL): Promise<number | null> {
  const ranOn = real ? 0 : STALL_MS - 2000;
  if (!real) {
    await expect(stalledNotice(page)).toHaveCount(0);
    await page.clock.fastForward(ranOn);
  }
  const shown = await watchFor(stalledNotice(page), stoppedAt + STALL_MS - ranOn + NOTICE_LATE_MS + WATCH_PAST_MS - Date.now());
  return shown === null ? null : ranOn + (Date.now() - stoppedAt);
}

test("playbook: the Agent stops halfway, with no finish; the toggle says so, and the designer ends the round and edits again", async ({ page }) => {
  test.setTimeout(STALL_REAL ? STALL_MS + 120_000 : 120_000);
  if (!STALL_REAL) await page.clock.install();
  const stoppedAt = await stopHalfway(page);
  const properties: { id: number; property: string }[] = readThirdKindFile("changeset.json").changes;
  const unapplied = properties.filter((change) => change.id !== 1).map((change) => change.property);
  const applied = properties.find((change) => change.id === 1)!.property;
  // The Agent is gone. The toggle is to say so, the stopping threshold (ticket 67) + 5 seconds after.
  const stalledNoticeAfterMs = await noticeAfterStop(page, stoppedAt);
  const gapWhenStopped = await progressGap(page);
  const coverageWhenStopped = checkCoverage();

  // The designer ends the round by hand, the notice up: pressing and holding the toggle, as before the notice. The notice goes with the round.
  await pressAndHold(page);
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  const noticeLeftAfterEnding = await stalledNotice(page).count();
  // Edit mode again: the two changes never applied are to be in the round still (ticket 68).
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const nextRound: { property: string }[] = readThirdKindFile("changeset.json")?.changes ?? [];
  const kept = nextRound.filter((change) => unapplied.includes(change.property)).length;
  record(STALL_REAL ? "stops-halfway-real-time" : "stops-halfway", {
    stalledNoticeAfterMs,
    stallMs: STALL_MS,
    clock: STALL_REAL ? "real time" : `run on ${STALL_MS - 2000} ms, then real time`,
    stalledNoticesShown: (await stalledNoticesShown(page)).length,
    noticeLeftAfterEnding: noticeLeftAfterEnding > 0,
    progressGapWhenStopped: gapWhenStopped,
    checkCoverageWhenStopped: coverageWhenStopped,
    unappliedKeptForNextRound: kept / unapplied.length,
    appliedBackInNextRound: nextRound.some((change) => change.property === applied),
    unclaimedNoticesShown: (await unclaimedNoticesShown(page)).length,
  });
  // Ticket 67: the notice shows once the threshold is past, no later than 5 seconds after; not well before. It goes with the round.
  expect(stalledNoticeAfterMs).not.toBeNull();
  expect(stalledNoticeAfterMs!).toBeLessThanOrEqual(STALL_MS + NOTICE_LATE_MS);
  expect(stalledNoticeAfterMs!).toBeGreaterThanOrEqual(STALL_MS - NOTICE_LATE_MS);
  expect(noticeLeftAfterEnding).toBe(0);
  // Ticket 68: the two changes not applied are in the round still, the one applied is not.
  expect(kept / unapplied.length).toBe(1);
  expect(nextRound.some((change) => change.property === applied)).toBe(false);
  // Ticket 66: the code the Agent changed while it had the round claimed asks nothing once the designer edits again.
  expect((await unclaimedNoticesShown(page)).length).toBe(0);
});

/** The designer ends the round by hand: pressing and holding the locked toggle. */
async function pressAndHold(page: Page) {
  await page.getByRole("button", { name: /^03Kind: applying design changes/ }).hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
}

/** How a round ended by hand left things: its archive, the project's `.03kind/`, the toggle and what edit mode opens on next; dates and code left out. */
async function endedRound(page: Page) {
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  const history = `${THIRD_KIND_FOLDER}history/`;
  await expect.poll(() => existsSync(history) && readdirSync(history).some((round) => existsSync(`${history}${round}/result.json`))).toBe(true);
  const last = readdirSync(history).sort().at(-1)!;
  const { ended, done, applied, checks } = JSON.parse(readFileSync(`${history}${last}/result.json`, "utf8"));
  const outcomes = Object.fromEntries(Object.entries(checks as Record<string, { outcome: string }>).map(([id, check]) => [id, check.outcome]));
  const files = readdirSync(THIRD_KIND_FOLDER).filter((name) => name !== "history" && name !== "checks.json").sort();
  const badge = await page.getByRole("button", { name: /not applied yet$/ }).count();
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const firstCardFill = await canvas(page).locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor);
  return { ended, done, applied, outcomes, files, badge, nextRound: readThirdKindFile("changeset.json")?.changes.length ?? 0, firstCardFill, notices: await stalledNotice(page).count() };
}

test("ending the round from the notice that the Agent seems to have stopped does what pressing and holding the toggle does; keep waiting has it go till the threshold has passed again", async ({ page }) => {
  await page.clock.install();
  expect(await noticeAfterStop(page, await stopHalfway(page), false)).not.toBeNull();
  // Keep waiting: the notice goes, and comes back once nothing has moved for the threshold again.
  await stalledNotice(page).getByRole("button", { name: "Keep waiting" }).click();
  await expect(stalledNotice(page)).toHaveCount(0);
  await page.clock.fastForward(STALL_MS - 5000);
  await expect(stalledNotice(page)).toHaveCount(0);
  await page.clock.fastForward(6000);
  await expect(stalledNotice(page)).toBeVisible();
  // End this round, from the notice.
  await stalledNotice(page).getByRole("button", { name: "End this round" }).click();
  const fromNotice = await endedRound(page);

  // The same round again, on the code as it was, ended by pressing and holding the toggle.
  writeFileSync(CARD, original);
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text()).includes("rounded-xl border border-stone-200 bg-white")).toBe(true);
  clearThirdKindFolder(THIRD_KIND_FOLDER);
  await stopHalfway(page);
  await pressAndHold(page);
  const byHolding = await endedRound(page);

  record("ends-round-from-notice", { fromNotice, byHolding, same: JSON.stringify(fromNotice) === JSON.stringify(byHolding) });
  expect(fromNotice).toEqual(byHolding);
  expect(fromNotice.ended).toBe("unlocked");
});

/**
 * Ticket 78: the code changing while the designer is in edit mode, with no
 * claim, does what the page shows it does. The Agent landing the designer's
 * changes unclaimed has the round claimed; code that leaves the page as it
 * was asks nothing; a page that changed has a canvas with no changes frozen
 * afresh, and one with changes says so at the canvas's bottom left. Each
 * playbook also counts ticket 66's notice, which pauses editing, so the
 * code before 78 is measured by the same playbook.
 */

/** Each notice that may show as the code changes in edit mode, how many times it has so far. */
async function noticesSoFar(page: Page) {
  return {
    unclaimed: (await unclaimedNoticesShown(page)).length,
    canvasUpdated: (await canvasUpdatedNoticesShown(page)).length,
    pageChanged: (await pageChangedNoticesShown(page)).length,
  };
}

/** Whether the designer can still edit: select the Button and find its corner radius field to type in, within 2 seconds. A notice over the shell takes the press. */
async function stillEditable(page: Page) {
  const button = page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true });
  await expect(button).toHaveCount(1);
  try {
    await button.click({ timeout: 2000 });
    const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Corner radius", exact: true });
    return (await field.count()) > 0 && (await field.isEditable());
  } catch (error) {
    // Not pressed: something else takes the press. Any other failure is the test's.
    if (!String(error).includes("intercepts pointer events")) throw error;
    return false;
  }
}

/** Where the camera has the canvas: the stage's transform. */
const cameraOf = (page: Page) => page.locator(".tk-stage").evaluate((stage) => (stage as HTMLElement).style.transform);

/** Pans the canvas a little, as the designer would, so a camera left where it was is told from one put back where edit mode starts. */
async function panCanvas(page: Page) {
  const before = await cameraOf(page);
  const box = (await page.locator(".tk-viewport").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(40, 120);
  await expect.poll(() => cameraOf(page)).not.toBe(before);
  // Out of the way of what the playbook does next.
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
}

/** Polls `test` every 100ms for up to `ms`: how long it took to hold, or null if it never did. */
async function within(ms: number, test: () => Promise<boolean>): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await test()) return Date.now() - start;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

/** The Card's code with its props typed apart and one of them renamed, its JSX two lines down: the page draws the same. */
const typedApart = (text: string) =>
  text
    .replace("export function Card({ title, body }: { title: string; body: string }) {", "type CardProps = { title: string; body: string };\n\nexport function Card({ title, body: text }: CardProps) {")
    .replace("{body}</p>", "{text}</p>");
/** The card titles a size up, and then their text: changes the page draws, none of them the designer's. */
const TITLE = { from: "text-lg font-semibold", to: "text-xl font-semibold", shows: "20px", was: "18px" };
const TEXT = { from: "mt-2 text-sm", to: "mt-2 text-base", shows: "16px", was: "14px" };
/** The first card's title and text size on the canvas, and its fill. */
const canvasCard = (page: Page) =>
  canvas(page)
    .locator("article")
    .first()
    .evaluate((card) => ({ title: getComputedStyle(card.querySelector("h3")!).fontSize, text: getComputedStyle(card.querySelector("p")!).fontSize, fill: getComputedStyle(card).backgroundColor }));

test("playbook: the Agent lands the designer's changes with no claim, while the designer is in edit mode", async ({ page }) => {
  await designTheRound(page);
  const changesBefore = readThirdKindFile("changeset.json").changes.map((change: { id: number }) => change.id);
  // Not claimed: the Agent goes by the chat, not the Skill.
  writeFileSync(CARD, original.replace(CHANGES[0].from, CHANGES[0].to));
  const claimedAfterMs = await within(UNCLAIMED_WATCH_MS, async () => existsSync(`${THIRD_KIND_FOLDER}state.json`) && (await ring(page).count()) > 0);
  const autoClaimed = claimedAfterMs !== null;
  const atClaim = await noticesSoFar(page);
  const changesKept = (readThirdKindFile("changeset.json")?.changes ?? []).filter((change: { id: number }) => changesBefore.includes(change.id)).length / CHANGES.length;
  // As if it had claimed: the ring fills as the page shows each change, `done` and `finish` work, and the round ends with all three applied.
  let ringAtEnd: number | null = null;
  let doneSays: string | null = null;
  let appliedAtFinish: number[] | null = null;
  if (autoClaimed) {
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "1");
    for (const id of [2, 3]) await apply(page, id);
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "3");
    ringAtEnd = Number(await ring(page).getAttribute("aria-valuenow"));
    doneSays = (await npx03kind("done", "1", "2", "3")).split("\n")[0];
    await npx03kind("finish");
    await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
    const history = `${THIRD_KIND_FOLDER}history/`;
    appliedAtFinish = JSON.parse(readFileSync(`${history}${readdirSync(history).sort().at(-1)}/result.json`, "utf8")).applied;
  }
  const notices = await noticesSoFar(page);
  record("changes-code-unclaimed", {
    autoClaimed,
    claimedAfterMs,
    watchedMs: UNCLAIMED_WATCH_MS,
    noticesAtClaim: atClaim,
    notices,
    prompts: notices.unclaimed + notices.canvasUpdated + notices.pageChanged,
    changesKept,
    ringAtEnd,
    doneSays,
    appliedAtFinish,
  });
  // Ticket 78: claimed as the page shows a change, with no notice; not a change lost; then as any claimed round.
  expect(autoClaimed).toBe(true);
  expect(notices).toEqual({ unclaimed: 0, canvasUpdated: 0, pageChanged: 0 });
  expect(changesKept).toBe(1);
  expect(ringAtEnd).toBe(3);
  expect(appliedAtFinish).toEqual([1, 2, 3]);
});

test("playbook: the code of a component the page uses changes, and the page draws the same", async ({ page }) => {
  await designTheRound(page);
  const canvasBefore = await canvasCard(page);
  const locBefore = await page.locator("article").first().getAttribute("data-tk-loc");
  writeFileSync(CARD, typedApart(original));
  // In: the card's JSX two lines down, as its source marker says.
  await expect.poll(() => page.locator("article").first().getAttribute("data-tk-loc")).not.toBe(locBefore);
  // Past the second the code is to rest, and some.
  await page.waitForTimeout(3000);
  const notices = await noticesSoFar(page);
  const editable = await stillEditable(page);
  if (editable) await setField(page, "Corner radius", "6");
  const changesAfter = editable ? await within(3000, async () => (readThirdKindFile("changeset.json")?.changes.length ?? 0) === CHANGES.length + 1) : null;
  const canvasAfter = await canvasCard(page);
  record("code-changes-page-same", {
    notices,
    prompts: notices.unclaimed + notices.canvasUpdated + notices.pageChanged,
    editable,
    anotherEditSaved: changesAfter !== null,
    canvasKept: JSON.stringify(canvasAfter) === JSON.stringify(canvasBefore),
    claimed: existsSync(`${THIRD_KIND_FOLDER}state.json`),
  });
  // Ticket 78: nothing at all; editing goes on, on the same canvas.
  expect(notices).toEqual({ unclaimed: 0, canvasUpdated: 0, pageChanged: 0 });
  expect(editable).toBe(true);
  expect(changesAfter).not.toBeNull();
  expect(canvasAfter).toEqual(canvasBefore);
});

test("playbook: the page changes as the code does, with no changes on the canvas", async ({ page }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await panCanvas(page);
  const cameraBefore = await cameraOf(page);
  const before = await canvasCard(page);
  writeFileSync(CARD, original.replace(TITLE.from, TITLE.to));
  const refrozenAfterMs = await within(6000, async () => (await canvasCard(page)).title === TITLE.shows);
  const toastAt = refrozenAfterMs === null ? null : await within(2000, async () => (await canvasUpdatedNotice(page).count()) > 0);
  const cameraAfter = await cameraOf(page);
  // The toast goes on its own: about 3 seconds, then its fade.
  const toastGoneAfterMs = toastAt === null ? null : await within(6000, async () => (await canvasUpdatedNotice(page).count()) === 0);
  const notices = await noticesSoFar(page);
  const editable = await stillEditable(page);
  record("page-changes-no-changes", {
    refrozen: refrozenAfterMs !== null,
    refrozenAfterMs,
    canvasBefore: before,
    canvasAfter: await canvasCard(page),
    cameraKept: cameraAfter === cameraBefore,
    toastShownForMs: toastGoneAfterMs,
    notices,
    otherPrompts: notices.unclaimed + notices.pageChanged,
    editable,
  });
  // Ticket 78: frozen afresh, the camera where it was, told once at the bottom left, and gone on its own.
  expect(refrozenAfterMs).not.toBeNull();
  expect(cameraAfter).toBe(cameraBefore);
  expect(notices).toEqual({ unclaimed: 0, canvasUpdated: 1, pageChanged: 0 });
  expect(toastGoneAfterMs).not.toBeNull();
  expect(editable).toBe(true);
});

test("playbook: the page changes as the code does, with changes on the canvas", async ({ page }) => {
  await designTheRound(page);
  await panCanvas(page);
  const cameraBefore = await cameraOf(page);
  const before = await canvasCard(page);
  writeFileSync(CARD, original.replace(TITLE.from, TITLE.to));
  const toast = pageChangedNotice(page);
  const toastAfterMs = await within(6000, async () => (await toast.count()) > 0);
  let result: Record<string, unknown> = { toldAfterMs: toastAfterMs };
  if (toastAfterMs !== null) {
    // The pointer on it, it stays.
    await toast.hover();
    const kept = await canvasCard(page);
    // The page changes again: the same staleness, told once.
    writeFileSync(CARD, original.replace(TITLE.from, TITLE.to).replace(TEXT.from, TEXT.to));
    await expect.poll(() => page.locator("article p").first().evaluate((p) => getComputedStyle(p).fontSize)).toBe(TEXT.shows);
    await page.waitForTimeout(3000);
    const toldAgain = (await pageChangedNoticesShown(page)).length - 1;
    await toast.getByRole("button", { name: "Update canvas" }).click();
    const asks = (await toast.textContent()) ?? "";
    await toast.getByRole("button", { name: "Cancel" }).click();
    const afterCancel = { canvas: await canvasCard(page), changes: readThirdKindFile("changeset.json")?.changes.length ?? 0, confirming: await toast.getByRole("button", { name: "Discard and update" }).count() };
    await toast.getByRole("button", { name: "Update canvas" }).click();
    await toast.getByRole("button", { name: "Discard and update" }).click();
    const updatedAfterMs = await within(6000, async () => (await canvasCard(page)).title === TITLE.shows);
    await expect.poll(() => readThirdKindFile("changeset.json")).toBeNull();
    result = {
      ...result,
      canvasKeptWhenTold: JSON.stringify(kept) === JSON.stringify(before),
      changesWhenTold: CHANGES.length,
      toldAgain,
      asks,
      afterCancel,
      updatedAfterMs,
      canvasAfterUpdate: await canvasCard(page),
      changesAfterUpdate: readThirdKindFile("changeset.json")?.changes.length ?? 0,
      cameraKept: (await cameraOf(page)) === cameraBefore,
    };
  }
  const notices = await noticesSoFar(page);
  record("page-changes-with-changes", { ...result, notices, editable: await stillEditable(page) });
  // Ticket 78: told once, at the bottom left, the canvas left as it was; on the designer's say, the changes discarded and the canvas frozen afresh.
  expect(toastAfterMs).not.toBeNull();
  expect(notices).toEqual({ unclaimed: 0, canvasUpdated: 0, pageChanged: 1 });
  expect(result.canvasKeptWhenTold).toBe(true);
  expect(result.asks).toContain("Discard your 3 changes and update?");
  expect(result.afterCancel).toEqual({ canvas: before, changes: CHANGES.length, confirming: 0 });
  expect(result.updatedAfterMs).not.toBeNull();
  expect(result.cameraKept).toBe(true);
});

test("playbook: the Agent sits still a long time between two changes, then goes on to finish", async ({ page }) => {
  await page.clock.install();
  await designTheRound(page);
  await npx03kind("claim");
  await apply(page, 1);
  await npx03kind("done", "1");
  // Working, though still, for 10 seconds short of the threshold (the page's clock run on): a notice here is a false one (ticket 67).
  const pauseMs = STALL_MS - 10_000;
  await page.clock.fastForward(pauseMs);
  const noticeDuringPauseAfterMs = await watchFor(stalledNotice(page), 5000);
  await apply(page, 2);
  await npx03kind("done", "2");
  // Still past the threshold, then on again: the notice shows, and goes as the code comes in.
  await page.clock.fastForward(STALL_MS);
  const noticePastThreshold = (await watchFor(stalledNotice(page), NOTICE_LATE_MS)) !== null;
  await apply(page, 3);
  const noticeAfterResuming = await stalledNotice(page).count();
  await npx03kind("done", "3");
  const atEnd = await progressGap(page);
  await npx03kind("finish");
  // Once the round is over, as the page hears, never.
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  await page.clock.fastForward(STALL_MS + 1000);
  const noticeAfterFinish = (await watchFor(stalledNotice(page), 2000)) !== null;
  record("pauses-then-goes-on", {
    pauseMs,
    noticeDuringPauseAfterMs,
    noticePastThreshold,
    noticeLeftAfterResuming: noticeAfterResuming > 0,
    noticeAfterFinish,
    stalledNoticesShown: (await stalledNoticesShown(page)).length,
    checkCoverage: checkCoverage(),
    progressGapAtEnd: atEnd,
    unclaimedNoticesShown: (await unclaimedNoticesShown(page)).length,
  });
  // Ticket 67: no notice while the Agent is still for less than the threshold; past it, one, gone as soon as it goes on, and none after the round.
  expect(noticeDuringPauseAfterMs).toBeNull();
  expect(noticePastThreshold).toBe(true);
  expect(noticeAfterResuming).toBe(0);
  expect(noticeAfterFinish).toBe(false);
  expect((await stalledNoticesShown(page)).length).toBe(1);
  // Ticket 66: an Agent that sits still and goes on, claimed all along, never has the designer told the code changes unclaimed.
  expect((await unclaimedNoticesShown(page)).length).toBe(0);
});

/** The views of the canvas, and the layers off it, by their iframes' titles. */
const VIEW_TITLES = ["Canvas", "Tablet 768", "Phone 390"];
/** What is compared of each element of the canvas, in each view and off it: where it is drawn, and how. */
const LOOKED_AT = [
  "display", "position", "left", "top", "width", "height", "margin-top", "margin-left", "padding-top", "padding-left",
  "background-color", "border-top-color", "border-top-width", "border-top-left-radius", "opacity", "color", "font-size",
  "font-weight", "flex-direction", "row-gap", "column-gap", "transform", "visibility",
];

/**
 * Every element of the canvas, in each view and in each layer off it, as it
 * is drawn: its box in its document and `LOOKED_AT`, by view, in page order.
 */
async function canvasLooks(page: Page): Promise<Record<string, string[]>> {
  const frames: [string, Locator][] = [
    ...VIEW_TITLES.map((title): [string, Locator] => [title, page.locator(`iframe[title="${title}"]`)]),
    ...(await page.locator('iframe[title="Off canvas"]:visible').all()).map((frame, i): [string, Locator] => [`Off canvas ${i + 1}`, frame]),
  ];
  const looks: Record<string, string[]> = {};
  for (const [title, frame] of frames) {
    looks[title] = await frame.contentFrame().locator("body").evaluate((body, names) => {
      const doc = body.ownerDocument;
      const view = doc.defaultView!;
      return [...body.querySelectorAll("*")].map((el) => {
        const box = el.getBoundingClientRect();
        const style = view.getComputedStyle(el);
        const at = [box.x + view.scrollX, box.y + view.scrollY, box.width, box.height].map((n) => n.toFixed(1)).join(" ");
        return [el.localName, at, ...names.map((name) => style.getPropertyValue(name))].join("|");
      });
    }, LOOKED_AT);
  }
  return looks;
}

/** Of two looks of the canvas, how many elements were compared, how many differ, and how many differ in the phone view and off the canvas. */
function compareLooks(before: Record<string, string[]>, after: Record<string, string[]>) {
  const views = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  let compared = 0;
  let differing = 0;
  const differingIn: Record<string, number> = {};
  for (const view of views) {
    const [a, b] = [before[view] ?? [], after[view] ?? []];
    const n = Math.max(a.length, b.length);
    const off = Array.from({ length: n }, (_, i) => a[i] !== b[i]).filter(Boolean).length;
    compared += n;
    differing += off;
    differingIn[view] = off;
  }
  return { views, compared, differing, differingIn };
}

/** Selects, in a view, the deepest layer just inside the top left of what `selector` finds: the view is the one worked in from then on. */
async function pickIn(page: Page, view: string, selector: string) {
  const box = (await page.locator(`iframe[title="${view}"]`).contentFrame().locator(selector).first().boundingBox())!;
  await page.keyboard.down("Meta");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Meta");
}

async function setField(page: Page, name: string, value: string) {
  const box = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });
  await box.fill(value);
  await box.press("Enter");
}

/**
 * The round of `designTheRound`, and two more changes: the cards' opacity in
 * the phone view, at its breakpoint only (4), and the title moved off the
 * canvas (5, a deletion). Still in edit mode.
 */
async function designTheRoundAcrossViews(page: Page) {
  await designTheRound(page);
  await pickIn(page, "Phone 390", "article");
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Opacity", "50");
  // Back to the desktop view.
  await pickIn(page, "Canvas", "article");
  const desktop = page.locator('iframe[title="Canvas"]');
  const area = (await page.getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-400, 0);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Third Kind", exact: true }).click();
  const title = (await desktop.contentFrame().locator("h1").boundingBox())!;
  const view = (await desktop.boundingBox())!;
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, title.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('iframe[title="Off canvas"]:visible')).toHaveCount(1);
  await expect.poll(() => readThirdKindFile("changeset.json")?.changes.map((change: { kind: string; breakpoint?: object }) => `${change.kind}${change.breakpoint ? " at a breakpoint" : ""}`)).toEqual([
    "style", "style", "style", "style at a breakpoint", "delete",
  ]);
}

/** Back to preview mode, the canvas gone: pressed while it grows back over the page, the toggle would turn back to it. */
async function leaveEditMode(page: Page) {
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
}

async function enterAgain(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("article").first()).toBeVisible();
  // Every view, and the layers off the canvas, up.
  for (const title of VIEW_TITLES) await expect(page.locator(`iframe[title="${title}"]`).contentFrame().locator("article").first()).toBeVisible();
}

/** The round's changes now, by their numbers and properties. */
const changesNow = (): { id: number; property: string; kind: string; carried?: true; before: unknown }[] => readThirdKindFile("changeset.json")?.changes ?? [];

/** Whether edit mode froze the page afresh: no element of the canvas carries an edit or a layer id of a round's. */
const frozenAfresh = (page: Page) => canvas(page).locator("[data-tk-layer], [data-tk-style]").count().then((n) => n === 0);

test("playbook: the Agent stops halfway; the designer ends the round, and edits again on the same canvas, the changes not applied there still (ticket 68)", async ({ page }) => {
  await designTheRoundAcrossViews(page);
  const before = await canvasLooks(page);
  const designed = changesNow();
  await leaveEditMode(page);
  await npx03kind("claim");
  await apply(page, 1);
  await npx03kind("done", "1");
  await expect(ring(page)).toHaveAttribute("aria-valuenow", "1");
  // The Agent is gone; the designer ends the round, as the notice that it seems to have stopped would (ticket 67).
  await pressAndHold(page);
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();

  // Between two rounds: the toggle counts what is left.
  const unapplied = designed.filter((change) => change.id !== 1).map((change) => change.property);
  await expect(page.getByRole("button", { name: /not applied yet$/ })).toHaveText(String(unapplied.length));
  const left = changesNow();
  const kept = left.filter((change) => unapplied.includes(change.property)).length;
  const appliedBack = left.some((change) => change.property === designed[0].property && !change.carried);

  // Edit mode again: the same canvas, as it was when the round was designed.
  await enterAgain(page);
  const after = await canvasLooks(page);
  const same = compareLooks(before, after);
  // ⌘Z has nothing of this edit mode to undo: what was applied stays.
  await page.getByRole("region", { name: "Canvas viewport" }).focus();
  await page.keyboard.press("Meta+z");
  const afterUndo = compareLooks(before, await canvasLooks(page));
  // A new edit: to the fill applied, from the red the code has now.
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Fill color", "0000ff");
  await expect.poll(() => changesNow().length).toBe(unapplied.length + 1);
  const newEdit = changesNow().at(-1)!;
  await leaveEditMode(page);

  // The next claim: the changes left, numbered from 1, then the new one.
  const notes = await npx03kind("claim");
  const sections = [...notes.matchAll(/^## (\d+)\. /gm)].map((match) => Number(match[1]));
  const opening = notes.split("\n")[2];
  const last = await npx03kind("last");
  // Ended by hand again, nothing applied: all of it is left.
  await pressAndHold(page);
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  const leftAgain = changesNow().map((change) => change.id);
  // Undone from the list with no canvas up: the corners, and the new fill. What was applied stays: the red fill.
  await page.getByRole("button", { name: /not applied yet$/ }).click();
  const changeList = page.getByRole("dialog", { name: "Changes" });
  const listed = await changeList.getByRole("listitem").count();
  await changeList.getByRole("button", { name: "Undo the corner radius of Card" }).click();
  await changeList.getByRole("button", { name: "Undo the fill of Card" }).click();
  await expect.poll(() => changesNow().length).toBe(leftAgain.length - 2);
  await page.keyboard.press("Escape");
  await enterAgain(page);
  const afterListUndo = await canvas(page).locator("article").first().evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopLeftRadius]);
  await leaveEditMode(page);
  // Then the rest discarded: edit mode freezes the page afresh.
  await page.getByRole("button", { name: /not applied yet$/ }).click();
  await changeList.getByRole("button", { name: "Discard all" }).click();
  await changeList.getByRole("button", { name: "Discard", exact: true }).click();
  await expect.poll(() => readThirdKindFile("changeset.json")).toBeNull();
  await enterAgain(page);
  const refrozen = await frozenAfresh(page);

  record("carries-over-what-is-left", {
    unappliedKeptForNextRound: kept / unapplied.length,
    appliedBackInNextRound: appliedBack,
    numberedFrom1: left.map((change) => change.id),
    canvasElementsCompared: same.compared,
    canvasElementsDiffering: same.differing,
    differingByView: same.differingIn,
    breakpointChangeKept: left.some((change) => change.property === "opacity"),
    offCanvasKept: left.some((change) => change.kind === "delete"),
    differingAfterUndoKey: afterUndo.differing,
    listed,
    afterListUndo,
    newEdit: { id: newEdit.id, before: newEdit.before },
    nextClaimSections: sections,
    nextClaimOpening: opening,
    lastHasTheRound: last.startsWith("# Last round of design changes") && last.includes("- **Status:** Applied"),
    leftWhenEndedAgain: leftAgain,
    frozenAfreshOnceDiscarded: refrozen,
    unclaimedNoticesShown: (await unclaimedNoticesShown(page)).length,
  });
  // Ticket 68: every change not applied is left, in its place on the same canvas, numbered from 1; none applied.
  expect(kept / unapplied.length).toBe(1);
  expect(appliedBack).toBe(false);
  expect(left.map((change) => change.id)).toEqual([1, 2, 3, 4]);
  expect(same.views).toEqual([...VIEW_TITLES, "Off canvas 1"]);
  expect(same.differing).toBe(0);
  expect(afterUndo.differing).toBe(0);
  expect(listed).toBe(5);
  expect(afterListUndo).toEqual(["rgb(255, 0, 0)", "12px"]);
  expect(newEdit).toMatchObject({ id: 5, before: { type: "solid", color: "#FF0000" } });
  expect(sections).toEqual([1, 2, 3, 4, 5]);
  expect(opening).toBe("This round carries 4 changes over from the round before, not applied then (1, 2, 3 and 4), and none of its 5 changes are applied yet. Left: 5 changes, made by the designer in 03Kind. Apply them to the source, in order: each section says what to change and where, and **How to write them**, after the last, how to write the kinds of change in this round and how the page checks them. The designer's page and its dev server are running already, and the page checks your edits as the code changes: start no dev server, and open no browser to look. After a change, or a group of related ones, run `npx 03kind done <number> …` with their numbers: it says whether the designer's page shows each. Run it at least once before `npx 03kind finish`, which ends the round once you are through them, and gives the form of the report to end your reply with.");
  expect(last.startsWith("# Last round of design changes") && last.includes("- **Status:** Applied")).toBe(true);
  expect(leftAgain).toEqual([1, 2, 3, 4, 5]);
  expect(refrozen).toBe(true);
  expect((await unclaimedNoticesShown(page)).length).toBe(0);
});

test("playbook: the Agent finishes with changes not applied (⚠️); they are left for the next round on the same canvas, and once all are applied, edit mode freezes the page afresh (ticket 68)", async ({ page }) => {
  await designTheRound(page);
  const before = await canvasLooks(page);
  await leaveEditMode(page);
  await npx03kind("claim");
  await apply(page, 1);
  await npx03kind("done", "1");
  const finished = (await npx03kind("finish")).split("\n")[0];
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  const left = changesNow();
  const unapplied = CHANGES.slice(1).length;

  await enterAgain(page);
  const same = compareLooks(before, await canvasLooks(page));
  await leaveEditMode(page);

  // The rest applied in the next round: then no change is left, and edit mode freezes the page afresh.
  const notes = await npx03kind("claim");
  await apply(page, 2);
  await apply(page, 3);
  await npx03kind("done", "1", "2");
  await npx03kind("finish");
  const leftAtLast = readThirdKindFile("changeset.json");
  await enterAgain(page);
  const refrozen = await frozenAfresh(page);
  const lastRound = await npx03kind("last");

  record("finishes-with-changes-left", {
    finished,
    unappliedKeptForNextRound: left.filter((change) => change.property !== "fill").length / unapplied,
    appliedBackInNextRound: left.some((change) => change.property === "fill"),
    numberedFrom1: left.map((change) => change.id),
    canvasElementsCompared: same.compared,
    canvasElementsDiffering: same.differing,
    nextClaimOpening: notes.split("\n")[2],
    leftOnceAllApplied: leftAtLast?.changes.length ?? 0,
    frozenAfreshOnceAllApplied: refrozen,
    lastIsTheNextRound: lastRound.includes("## 1. Corner radius") && !lastRound.includes("## 3."),
  });
  expect(finished).toBe("Round finished: 1 of 3 changes applied. The page does not show: 2, 3.");
  expect(left.map((change) => [change.id, change.property])).toEqual([
    [1, "radius"],
    [2, "stroke"],
  ]);
  expect(same.differing).toBe(0);
  expect(leftAtLast).toBeNull();
  expect(refrozen).toBe(true);
});

/** The padding top of the canvas's Cards, in page order: the three of the loop, then the one of its own. */
const cardPaddings = (page: Page) => canvas(page).locator("article").evaluateAll((cards) => cards.map((card) => getComputedStyle(card).paddingTop));

test("playbook: changes left over and under what was applied: a change to the Card itself left under one to its usage applied, and a move placed absolute in a Frame given a fill applied; on the same canvas each looks as it did, and each undone leaves the page's own (ticket 68, after review)", async ({ page }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  // A Frame of the page's (added by hand, outside React: not located, so the page cannot check what changes it).
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "height: 240px; margin: 16px 0; background: #eee";
    document.querySelector("main")!.append(board);
  });
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const tree = page.getByRole("tree", { name: "Layers" });
  // 1: the Card itself, its padding top 16px; 2: the Cards of the loop, 24px.
  await tree.getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Padding top", "16");
  await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Promote" }).click();
  await setField(page, "Padding top", "24");
  // 3: the board filled; 4: the Get started button dragged into it, absolute.
  await pickIn(page, "Canvas", "#board");
  await setField(page, "Fill color", "00ff00");
  await tree.getByRole("treeitem", { name: "Button", exact: true }).click();
  const button = canvas(page).locator('[data-testid="hero"] > button');
  const board = canvas(page).locator("#board");
  const from = (await button.boundingBox())!;
  const to = (await board.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 60 + from.width / 2, to.y + 40 + from.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => changesNow().map((change) => [change.id, change.kind, change.property, (change as { scope?: string }).scope]))
    .toEqual([
      [1, "style", "padding", "component"],
      [2, "style", "padding", "usage"],
      [3, "style", "fill", "usage"],
      [4, "move", "move", "usage"],
    ]);
  const before = await canvasLooks(page);
  const paddingsBefore = await cardPaddings(page);
  const boardBefore = await board.evaluate((el) => getComputedStyle(el).position);
  await leaveEditMode(page);

  // The Agent writes the loop's padding into the Card (the page shows 24px: change 2, and not change 1's 16px), reports the board's fill done (the page cannot check it), and stops.
  await npx03kind("claim");
  writeFileSync(CARD, original.replace("p-5", "p-5 pt-6"));
  await expect.poll(() => page.locator("article").first().evaluate((card) => getComputedStyle(card).paddingTop)).toBe("24px");
  await npx03kind("done", "3");
  await pressAndHold(page);
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  const left = changesNow().map((change) => [change.id, change.kind, change.property]);

  // Edit mode again: the same canvas, as it was.
  await enterAgain(page);
  const same = compareLooks(before, await canvasLooks(page));
  const paddingsAgain = await cardPaddings(page);
  await leaveEditMode(page);

  // The next claim: what the Agent reads of the Card's own padding left, the code changed since; the round then ended by hand again, nothing more applied.
  const claimed = await npx03kind("claim");
  const leftNotes = claimed.split(/^## /m).find((part) => part.startsWith("1. "))!;
  const paddingNotes = leftNotes.split("\n").filter((line) => /^- \*\*(Design intent|Currently set by)/.test(line));
  await pressAndHold(page);
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();

  // The move undone from the list with no canvas up: the board is no positioning reference any more.
  await page.getByRole("button", { name: /not applied yet$/ }).click();
  const changeList = page.getByRole("dialog", { name: "Changes" });
  await changeList.getByRole("button", { name: /^Undo the .* of Button$/ }).click();
  await expect.poll(() => changesNow().length).toBe(left.length - 1);
  await page.keyboard.press("Escape");
  await enterAgain(page);
  const boardOnceMoveUndone = await board.evaluate((el) => [getComputedStyle(el).position, getComputedStyle(el).backgroundColor, el.childElementCount]);
  // The change to the Card itself undone from the list, the canvas up: the Cards of the loop as the page has them, with the padding applied.
  await page.getByRole("button", { name: /not applied yet$/ }).click();
  await changeList.getByRole("button", { name: /^Undo the padding of / }).click();
  await expect.poll(() => changesNow().length).toBe(0);
  await page.keyboard.press("Escape");
  const paddingsOnceComponentUndone = await cardPaddings(page);

  record("carries-over-under-and-around", {
    left,
    canvasElementsCompared: same.compared,
    canvasElementsDiffering: same.differing,
    differingByView: same.differingIn,
    cardPaddingsBefore: paddingsBefore,
    cardPaddingsAgain: paddingsAgain,
    nextClaimOpening: claimed.split("\n")[2],
    nextClaimPadding: paddingNotes,
    boardPositionBefore: boardBefore,
    boardOnceMoveUndone,
    cardPaddingsOnceComponentUndone: paddingsOnceComponentUndone,
  });
  expect(left).toEqual([
    [1, "style", "padding"],
    [2, "move", "move"],
  ]);
  expect(paddingsBefore).toEqual(["24px", "24px", "24px", "16px"]);
  expect(same.differing).toBe(0);
  expect(paddingsAgain).toEqual(paddingsBefore);
  // From what the page shows now, set by the class the Agent wrote.
  expect(paddingNotes.join("\n")).toContain("pt-6");
  expect(boardBefore).toBe("relative");
  // As the page had it, with the fill applied.
  expect(boardOnceMoveUndone).toEqual(["static", "rgb(0, 255, 0)", 0]);
  // The page's own: the loop's padding applied; the Card of its own as the page was frozen.
  expect(paddingsOnceComponentUndone).toEqual(["24px", "24px", "24px", "20px"]);
});
