import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { STALL_MS } from "../../packages/03kind/src/client/agent-stall";
import { canvasUpdatedNotice, canvasUpdatedNoticesShown, pageChangedNotice, pageChangedNoticesShown, recordNotices, stalledNotice, stalledNoticesShown, unclaimedNotice, unclaimedNoticesShown } from "../bench/notices";
import { expect, test, type Locator, type Page } from "./fixtures";
import { clearThirdKindFolder, EXAMPLE, forTheLoopAlone, readThirdKindFile, THIRD_KIND_FOLDER, npx03kind, servesAsWritten } from "./project-files";

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

/** The round: the cards of the loop filled red, with 4px corners and a red stroke; each change, as an Agent writes it into the Card for the loop's cards alone (ticket 77: the fourth card stays as it was). */
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
  await expect.poll(async () => servesAsWritten(await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text(), original)).toBe(true);
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
  writeFileSync(CARD, forTheLoopAlone(text, from, to));
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
  await expect.poll(async () => servesAsWritten(await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text(), original)).toBe(true);
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
    // A read as the canvas is frozen afresh can land on the frame going away: not there yet (ticket 93).
    if (await test().catch((error: Error) => (/Frame was detached/.test(error.message) ? false : Promise.reject(error)))) return Date.now() - start;
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
  writeFileSync(CARD, forTheLoopAlone(original, CHANGES[0].from, CHANGES[0].to));
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

/**
 * Ticket 76: layers made this round (New Frame, New text), found on the live
 * page by the place their change records, and checked there, as are the
 * changes made to them since. The scripted Agent writes each into `App.tsx`
 * (or the Card), as the notes ask, and runs `done` after each. Measured
 * first on the code before 76, with these assertions left out: no check.
 */

const APP = `${EXAMPLE}src/App.tsx`;
const originalApp = readFileSync(APP, "utf8");
/** The intro paragraph's end in `App.tsx`: a layer drawn below the intro goes after it. */
const INTRO_END = "        </p>\n";
/** The end of the body text in the Card: a layer drawn below it goes after it. */
const CARD_BODY_END = '<p className="mt-2 text-sm text-stone-600">{body}</p>\n';

test.afterEach(async () => {
  // The Card is put back by the hook above; the next page must open on it as it was, with no new text in it.
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text()).includes("Fresh")).toBe(false);
  if (readFileSync(APP, "utf8") === originalApp) return;
  writeFileSync(APP, originalApp);
  await expect.poll(async () => servesAsWritten(await (await fetch(`${DEV_URL}/src/App.tsx`)).text(), originalApp)).toBe(true);
});

/** The round's checks: from its archive once it has ended, else so far. */
function roundChecks(): Record<string, { outcome: string; reason?: string }> {
  const history = `${THIRD_KIND_FOLDER}history/`;
  try {
    const last = readdirSync(history).sort().at(-1);
    if (last) return JSON.parse(readFileSync(`${history}${last}/result.json`, "utf8")).checks;
  } catch {
    // Not ended.
  }
  return readThirdKindFile("checks.json")?.results ?? {};
}

/** What the round's checks say of changes `ids`: how many have a result (shown or not), how many shown, and each one's outcome and reason. */
function checksOf(ids: number[]) {
  const checks = roundChecks();
  const outcomes = Object.fromEntries(ids.map((id) => [id, checks[id] ? `${checks[id].outcome}${checks[id].reason ? `: ${checks[id].reason}` : ""}` : "none"]));
  return {
    checkCoverage: ids.filter((id) => ["shown", "not shown"].includes(checks[id]?.outcome)).length / ids.length,
    shownByChecks: ids.filter((id) => checks[id]?.outcome === "shown").length / ids.length,
    outcomes,
  };
}

/** The applied changes of the round's archive. */
function appliedInArchive(): number[] {
  const history = `${THIRD_KIND_FOLDER}history/`;
  const last = readdirSync(history).sort().at(-1)!;
  return JSON.parse(readFileSync(`${history}${last}/result.json`, "utf8")).applied;
}

/** The changes `finish` lists under ✓ in the report it lays out. */
function tickedIn(finished: string): number[] {
  const ticked = /✓ Applied\n([\s\S]*?)(\n\n|\n```)/.exec(finished)?.[1] ?? "";
  return [...ticked.matchAll(/^- (\d+)\. /gm)].map((match) => Number(match[1]));
}

const zoomOf = (page: Page) => page.locator('iframe[title="Canvas"]').evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);

/** Draws with the tool `key` (F, T) from `from`, `size` canvas px down and to the right. */
async function drawWith(page: Page, key: "f" | "t", from: { x: number; y: number }, size: { width: number; height: number }) {
  const zoom = await zoomOf(page);
  await page.keyboard.press(key);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + size.width * zoom, from.y + size.height * zoom, { steps: 6 });
  await page.mouse.up();
}

/** In edit mode, a Frame drawn in the hero's layout, below the intro: 360 × 80px. Its change, once saved. */
async function drawAFrameBelowTheIntro(page: Page, size = { width: 360, height: 80 }) {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const intro = (await canvas(page).locator('[data-testid="hero"] > p').boundingBox())!;
  await drawWith(page, "f", { x: intro.x + 20, y: intro.y + intro.height - 2 }, size);
  await expect.poll(() => readThirdKindFile("changeset.json")?.changes.length).toBe(1);
  return readThirdKindFile("changeset.json").changes[0];
}

/** `html` written into the hero below the intro, as the Agent writes a new layer; once the page has it. */
async function writeBelowTheIntro(page: Page, html: string) {
  const text = readFileSync(APP, "utf8");
  expect(text).toContain(INTRO_END);
  writeFileSync(APP, text.replace(INTRO_END, `${INTRO_END}${html}`));
  await expect(page.locator('[data-testid="hero"] > p + *')).not.toHaveText(/Get started/);
}

/** `from` replaced with `to` in `App.tsx`, as the Agent edits; `shows`, once the page shows it. */
async function editApp(from: string, to: string, shows: () => Promise<boolean>) {
  const text = readFileSync(APP, "utf8");
  expect(text).toContain(from);
  writeFileSync(APP, text.replace(from, to));
  await expect.poll(shows).toBe(true);
}

/** The layer selected, a new Frame with no fill, filled red. */
async function fillRed(page: Page) {
  await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Add fill" }).click();
  await setField(page, "Fill color", "ff0000");
}

/** The element right after the intro on the live page, as the browser computes `property` for it. */
const belowTheIntro = (page: Page, property: string) => page.locator('[data-testid="hero"] > p + div').evaluate((el, name) => getComputedStyle(el)[name as "color"], property);

/**
 * A Frame drawn below the intro (1), filled red (2), with 4px corners (3).
 * Each applied as the Agent writes it, `done` run after each: `radius`, the
 * class it writes for the corners.
 */
async function makeAFrameFilledAndRounded(page: Page, radius = "rounded-[4px]") {
  const made = await drawAFrameBelowTheIntro(page);
  await fillRed(page);
  await setField(page, "Corner radius", "4");
  await expect.poll(() => changesNow().map((change) => [change.id, change.kind, change.property])).toEqual([
    [1, "create", made.property],
    [2, "style", "fill"],
    [3, "style", "radius"],
  ]);
  const { width, height } = made.after;
  await leaveEditMode(page);
  await npx03kind("claim");
  const dones: string[] = [];
  await writeBelowTheIntro(page, `        <div className="h-[${height}px] w-[${width}px]" />\n`);
  dones.push(await npx03kind("done", "1"));
  await editApp(`w-[${width}px]"`, `w-[${width}px] bg-[#ff0000]"`, async () => (await belowTheIntro(page, "backgroundColor")) === "rgb(255, 0, 0)");
  dones.push(await npx03kind("done", "2"));
  await editApp(`bg-[#ff0000]"`, `bg-[#ff0000] ${radius}"`, async () => (await belowTheIntro(page, "borderTopLeftRadius")) !== "0px");
  dones.push(await npx03kind("done", "3"));
  const finished = await npx03kind("finish");
  return { dones, finished, size: { width, height }, radius: await belowTheIntro(page, "borderTopLeftRadius") };
}

test("playbook: the designer draws a Frame, fills it and rounds its corners; the Agent applies all three, done after each (ticket 76)", async ({ page }) => {
  const { dones, finished, size } = await makeAFrameFilledAndRounded(page);
  const checks = checksOf([1, 2, 3]);
  record("makes-a-frame", {
    ...checks,
    applied: appliedInArchive(),
    ticked: tickedIn(finished),
    size,
    done: dones.map((output) => output.split("\n").slice(0, 2).join(" ")),
    finished: finished.split("\n")[0],
    unclaimedNoticesShown: (await unclaimedNoticesShown(page)).length,
  });
  // Ticket 76: the new Frame, its fill and its corners each get a check, and the page shows all three.
  expect(checks.checkCoverage).toBe(1);
  expect(checks.shownByChecks).toBe(1);
  expect(appliedInArchive()).toEqual([1, 2, 3]);
});

test("playbook: the same, the Agent writing 8px corners rather than 4px; the report it is given lists what it ticks (ticket 76)", async ({ page }) => {
  const { dones, finished, radius } = await makeAFrameFilledAndRounded(page, "rounded-[8px]");
  const checks = checksOf([1, 2, 3]);
  const ticked = tickedIn(finished);
  // Change 3 is not shown on the page (8px, not 4px): ticked, it is a false ✓.
  record("makes-a-frame-off", {
    ...checks,
    applied: appliedInArchive(),
    ticked,
    falseTicks: ticked.filter((id) => id === 3).length,
    radiusOnThePage: radius,
    done: dones.map((output) => output.split("\n").slice(0, 2).join(" ")),
    finished: finished.split("\n")[0],
  });
  // Ticket 76: the page sees the corners are not as asked; the report puts them under ⚠️, not ✓.
  expect(checks.outcomes[3]).toBe("not shown");
  expect(ticked).toEqual([1, 2]);
  expect(appliedInArchive()).toEqual([1, 2]);
});

test("playbook: a Frame drawn in a new Frame, filled; the Agent writes one in the other (ticket 76)", async ({ page }) => {
  const outer = await drawAFrameBelowTheIntro(page, { width: 300, height: 120 });
  const box = (await canvas(page).locator('[data-testid="hero"] > p + div').boundingBox())!;
  const zoom = await zoomOf(page);
  await page.keyboard.press("Escape");
  await drawWith(page, "f", { x: box.x + 20 * zoom, y: box.y + 20 * zoom }, { width: 100, height: 40 });
  await expect.poll(() => changesNow().length).toBe(2);
  await fillRed(page);
  await expect.poll(() => changesNow().map((change) => [change.id, change.kind])).toEqual([
    [1, "create"],
    [2, "create"],
    [3, "style"],
  ]);
  const inner = changesNow()[1] as unknown as { after: { width: number; height: number; place: { absolute: { x: number; y: number } } } };
  const { x, y } = inner.after.place.absolute;
  await leaveEditMode(page);
  await npx03kind("claim");
  await writeBelowTheIntro(
    page,
    `        <div className="relative h-[${outer.after.height}px] w-[${outer.after.width}px]">\n` +
      `          <div className="absolute left-[${x}px] top-[${y}px] h-[${inner.after.height}px] w-[${inner.after.width}px] bg-[#ff0000]" />\n` +
      "        </div>\n",
  );
  await expect(page.locator('[data-testid="hero"] > p + div > div')).toHaveCSS("background-color", "rgb(255, 0, 0)");
  const done = await npx03kind("done", "1", "2", "3");
  await npx03kind("finish");
  const checks = checksOf([1, 2, 3]);
  record("makes-a-frame-in-a-frame", { ...checks, applied: appliedInArchive(), inner: { x, y }, done: done.split("\n") });
  // Ticket 76: found a level in, too.
  expect(checks.shownByChecks).toBe(1);
});

/** In edit mode, text drawn in the first Card of the loop, below its body text, reading “Fresh”: in each of the loop's three cards. */
async function drawTextInTheCards(page: Page) {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const body = (await canvas(page).locator("article p").first().boundingBox())!;
  await drawWith(page, "t", { x: body.x + 10, y: body.y + body.height - 2 }, { width: 120, height: 12 });
  await page.keyboard.type("Fresh");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect.poll(() => changesNow().map((change) => change.kind)).toEqual(["create"]);
}

test("playbook: text drawn in a Card of the loop; the Agent writes it in the Card once, the page renders it in every card (ticket 76)", async ({ page }) => {
  await drawTextInTheCards(page);
  await leaveEditMode(page);
  await npx03kind("claim");
  writeFileSync(CARD, original.replace(CARD_BODY_END, `${CARD_BODY_END}      <p className="mt-2 text-sm">Fresh</p>\n`));
  await expect(page.locator("article").first().getByText("Fresh")).toBeVisible();
  const done = await npx03kind("done", "1");
  await npx03kind("finish");
  const checks = checksOf([1]);
  record("made-in-a-loop", { ...checks, applied: appliedInArchive(), done: done.split("\n") });
  // Ticket 76: three elements from one place in the source are one layer.
  expect(checks.outcomes[1]).toBe("shown");
});

test("playbook: text drawn in a Card of the loop; the Agent writes it in two places of the Card, one for the first card and one for the rest (ticket 76)", async ({ page }) => {
  await drawTextInTheCards(page);
  await leaveEditMode(page);
  await npx03kind("claim");
  const twice = `{title === "Freeze" ? (\n        <p className="mt-2 text-sm">Fresh</p>\n      ) : (\n        <p className="mt-2 text-sm">Fresh</p>\n      )}\n`;
  writeFileSync(CARD, original.replace(CARD_BODY_END, `${CARD_BODY_END}      ${twice}`));
  await expect(page.locator("article").first().getByText("Fresh")).toBeVisible();
  const done = await npx03kind("done", "1");
  await npx03kind("finish");
  const checks = checksOf([1]);
  record("made-in-two-places", { ...checks, applied: appliedInArchive(), done: done.split("\n") });
  // Ticket 76: from two places, the page does not guess, and names them.
  expect(checks.outcomes[1]).toMatch(/^unchecked: 3 elements at its place match it, written at 2 places in the source \(`src\/components\/Card\.tsx:\d+:\d+`, `src\/components\/Card\.tsx:\d+:\d+`\)/);
});

test("a page opened only once the round is claimed, in a browser of its own, finds new text below the intro, the intro moved off the canvas after it: before and after the intro goes (ticket 76)", async ({ page, browser }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const intro = (await canvas(page).locator('[data-testid="hero"] > p').boundingBox())!;
  await drawWith(page, "t", { x: intro.x + 20, y: intro.y + intro.height - 2 }, { width: 120, height: 12 });
  await page.keyboard.type("Fresh line");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const area = (await page.getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-400, 0);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "A Framer-style editor layer for any page.", exact: true }).click();
  const paragraph = (await canvas(page).locator('[data-testid="hero"] > p').first().boundingBox())!;
  const view = (await page.locator('iframe[title="Canvas"]').boundingBox())!;
  await page.mouse.move(paragraph.x + paragraph.width / 2, paragraph.y + paragraph.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, paragraph.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => changesNow().map((change) => change.kind)).toEqual(["create", "delete"]);
  await leaveEditMode(page);
  await npx03kind("claim");
  // The designer's page goes; another opens, in a browser context of its own, the round claimed already.
  await page.close();
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.goto(DEV_URL);
    await expect(other.getByRole("progressbar", { name: "Applying design changes" })).toBeVisible();
    writeFileSync(APP, readFileSync(APP, "utf8").replace(INTRO_END, `${INTRO_END}        <p className="mt-4">Fresh line</p>\n`));
    await expect(other.getByText("Fresh line")).toBeVisible();
    const whileThere = await npx03kind("done", "1");
    const text = readFileSync(APP, "utf8");
    const INTRO = '        <p className="mt-4 text-stone-600">\n          A Framer-style editor layer for <strong>any</strong> page.\n        </p>\n';
    expect(text).toContain(INTRO);
    writeFileSync(APP, text.replace(INTRO, ""));
    await expect(other.getByText("A Framer-style editor layer for")).toHaveCount(0);
    const once = await npx03kind("done", "1", "2");
    await npx03kind("finish");
    const checks = checksOf([1, 2]);
    record("made-found-by-a-page-opened-later", { ...checks, done: [whileThere.split("\n")[1], ...once.split("\n").slice(1, 3)] });
    expect(whileThere).toContain("Checked on the page: it shows the change.");
    expect(checks.outcomes).toEqual({ 1: "shown", 2: "shown" });
  } finally {
    await context.close();
  }
});

/**
 * Ticket 78, after the line's review: a Frame drawn in the hero between the
 * intro and the button, the round not claimed. The page tells whether the
 * Agent is applying the round unclaimed by the check itself, the new layer
 * found by where the saved canvas places it (ticket 76): code that leaves the
 * page as it was claims nothing, though the button is at the Frame's place
 * in the hero; the Frame written there claims the round. Measured first on
 * the code before the fix, with these assertions left out: the page took
 * the button for the Frame.
 */
test("playbook: a Frame drawn between the intro and the button, not claimed; the Card's code changes and the page draws the same: no claim (ticket 78, after review)", async ({ page }) => {
  await drawAFrameBelowTheIntro(page);
  const locBefore = await page.locator("article").first().getAttribute("data-tk-loc");
  writeFileSync(CARD, typedApart(original));
  await expect.poll(() => page.locator("article").first().getAttribute("data-tk-loc")).not.toBe(locBefore);
  // Past the second the code is to rest, and some.
  await page.waitForTimeout(3000);
  const claimed = existsSync(`${THIRD_KIND_FOLDER}state.json`) || (await ring(page).count()) > 0;
  const notices = await noticesSoFar(page);
  // Claimed, the editor has folded into the toggle: nothing to edit.
  const editable = !claimed && (await stillEditable(page));
  record("frame-drawn-code-same", { falseClaims: claimed ? 1 : 0, notices, editable });
  expect(claimed).toBe(false);
  expect(notices).toEqual({ unclaimed: 0, canvasUpdated: 0, pageChanged: 0 });
  expect(editable).toBe(true);
});

test("playbook: the same Frame, the Agent writing it at its place with no claim: the round is claimed (ticket 78, after review)", async ({ page }) => {
  const made = await drawAFrameBelowTheIntro(page);
  const { width, height } = made.after;
  await writeBelowTheIntro(page, `        <div className="h-[${height}px] w-[${width}px]" />\n`);
  const claimedAfterMs = await within(UNCLAIMED_WATCH_MS, async () => existsSync(`${THIRD_KIND_FOLDER}state.json`) && (await ring(page).count()) > 0);
  const notices = await noticesSoFar(page);
  record("frame-drawn-applied-unclaimed", { autoClaimed: claimedAfterMs !== null, claimedAfterMs, notices });
  expect(claimedAfterMs).not.toBeNull();
  expect(notices).toEqual({ unclaimed: 0, canvasUpdated: 0, pageChanged: 0 });
  await npx03kind("finish");
});

/**
 * Ticket 77: a change for one usage of the Card alone (the loop's, or the
 * fourth card's, "Your turn"), which the Agent may write into the Card
 * itself, so the Card's other usage changes with it. The page notes, as the
 * round is claimed, what the Card's other usages on the page show of the
 * change's property, and looks again as the code changes: changed there, the
 * change is not applied. The scripted Agent writes each change either into
 * the Card (a leak), or at its one usage, a prop passed there alone. And three
 * the page checks as before: a change promoted to the Card, one to a layer
 * in no component, and one to the loop's three instances, which are one
 * usage. Measured first on the code before 77, with its assertions left out.
 */
test.describe("a change for one usage of the Card (ticket 77)", () => {
  test.afterEach(async () => {
    // Run before the file's own hooks, which put the Card back: App.tsx is put back here, and the next page must open on it as it was.
    if (readFileSync(APP, "utf8") !== originalApp) writeFileSync(APP, originalApp);
    await expect.poll(async () => /gap: "gap-3"|flex flex-col gap-3|opacity-50|bg-\[#ff0000\]/.test(await (await fetch(`${DEV_URL}/src/App.tsx`)).text())).toBe(false);
  });

  /** The live page's four cards, the loop's three and "Your turn", as the browser computes `property` for each. */
  const cardsOnThePage = (page: Page, property: string) => page.locator("article").evaluateAll((cards, name) => cards.map((card) => getComputedStyle(card)[name as "color"]), property);
  /** The loop's usage of the Card in App.tsx, and the fourth card's. */
  const LOOP_USAGE = "<Card key={feature.title} title={feature.title} body={feature.body} />";
  const OWN_USAGE = '<Card title="Your turn" body="Open the editor and try it." />';
  const CARD_PROPS = "export function Card({ title, body }: { title: string; body: string }) {";

  /** In edit mode, the `nth` Card of the layer tree selected (0: the loop's first; 3: "Your turn"), and `fields` set on it; promoted, with `promote`. Back in preview mode, the change saved. */
  async function changeACard(page: Page, nth: number, fields: [string, string][], promote = false) {
    await recordNotices(page);
    await page.goto(DEV_URL);
    await page.getByRole("button", { name: TOGGLE_LABEL }).click();
    await expect(canvas(page).locator("h1")).toBeVisible();
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).nth(nth).click();
    for (const [field, value] of fields) await setField(page, field, value);
    if (promote) await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Promote" }).click();
    await expect.poll(() => changesNow().map((change) => `${change.kind} ${change.property}`)).toEqual(fields.map(([field]) => `style ${field === "Gap" ? "gap" : "fill"}`));
    await leaveEditMode(page);
  }

  /** `edits` made to the source, as the Agent writes the change; once `shows` says the page has them. */
  async function write(edits: [string, string, string][], shows: () => Promise<boolean>) {
    for (const [file, from, to] of edits) {
      const text = readFileSync(file, "utf8");
      expect(text).toContain(from);
      writeFileSync(file, text.replace(from, to));
    }
    await expect.poll(shows).toBe(true);
  }

  /** The round claimed, the change written by `edits`, `done 1`, the ring, and `finish`: what each said, and what the page shows. */
  async function applyTheChange(page: Page, edits: [string, string, string][], shows: () => Promise<boolean>) {
    await npx03kind("claim");
    // As a real Agent, which reads the notes before it edits: the page has begun to check, and has noted what the other usages show.
    await expect.poll(() => readThirdKindFile("checks.json")?.results?.[1]?.outcome).toBeTruthy();
    await write(edits, shows);
    const done = await npx03kind("done", "1");
    await expect(ring(page)).toBeVisible();
    const ringAfterDone = Number(await ring(page).getAttribute("aria-valuenow"));
    const finished = await npx03kind("finish");
    const checks = checksOf([1]);
    return { done, ringAfterDone, finished, checks, ticked: tickedIn(finished), applied: appliedInArchive() };
  }

  /** What a playbook keeps: the done line, the outcome, the ring, the report's ✓, the archive's applied. */
  const kept = ({ done, ringAfterDone, finished, checks, ticked, applied }: Awaited<ReturnType<typeof applyTheChange>>) => ({
    outcome: checks.outcomes[1],
    ringAfterDone,
    ticked,
    applied,
    done: done.split("\n").slice(0, 2).join(" "),
    finished: finished.split("\n")[0],
    warned: /⚠️ Not applied 1:1\n([\s\S]*?)(\n\n|\n```)/.exec(finished)?.[1] ?? "",
  });

  /** Whether `done` and `finish` tell a leak, as ticket 77 has them: not applied, the other usage named, the property from what to what; under ⚠️, not ✓. */
  const toldLeak = (result: Awaited<ReturnType<typeof applyTheChange>>, usage: RegExp) =>
    result.checks.outcomes[1] === "not shown" && usage.test(result.done) && !result.ticked.includes(1) && usage.test(result.finished);

  test("playbook: the loop's cards filled red, the Agent writing it into the Card itself: the fourth card is red too", async ({ page }) => {
    await changeACard(page, 0, [["Fill color", "ff0000"]]);
    const result = await applyTheChange(page, [[CARD, "bg-white", "bg-[#ff0000]"]], async () => (await cardsOnThePage(page, "backgroundColor")).every((fill) => fill === "rgb(255, 0, 0)"));
    const fourth = (await cardsOnThePage(page, "backgroundColor"))[3];
    const told = toldLeak(result, /src\/App\.tsx:\d+:\d+/);
    record("usage-leak-fill", { ...kept(result), fourthCard: fourth, told, found: told ? 1 : 0 });
    // Ticket 77: not applied, the fourth card named, its fill from white to red; under ⚠️, and the ring does not count it.
    expect(result.done).toMatch(/it shows the change, but on another usage of Card too: Card used at `src\/App\.tsx:\d+:\d+`.*its fill from #FFFFFF to #FF0000 since the round was claimed/);
    expect(told).toBe(true);
    expect(result.ringAfterDone).toBe(0);
    expect(result.applied).toEqual([]);
  });

  test("playbook: the loop's cards given a 12px gap, the Agent writing it into the Card with an 8px gap for every other usage (fill-gap-brief #3): the fourth card is a Stack with an 8px gap", async ({ page }) => {
    await changeACard(page, 0, [["Gap", "12"]]);
    const result = await applyTheChange(
      page,
      [
        [CARD, CARD_PROPS, 'export function Card({ title, body, gap = "gap-2" }: { title: string; body: string; gap?: string }) {'],
        [CARD, '<article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">', "<article className={`flex flex-col ${gap} rounded-xl border border-stone-200 bg-white p-5 shadow-sm`}>"],
        [CARD, '<p className="mt-2 text-sm', '<p className="text-sm'],
        [APP, LOOP_USAGE, '<Card key={feature.title} title={feature.title} body={feature.body} gap="gap-3" />'],
      ],
      async () => (await cardsOnThePage(page, "rowGap")).join() === "12px,12px,12px,8px",
    );
    const fourth = { display: (await cardsOnThePage(page, "display"))[3], rowGap: (await cardsOnThePage(page, "rowGap"))[3] };
    const told = toldLeak(result, /src\/App\.tsx:\d+:\d+/);
    record("usage-leak-gap", { ...kept(result), fourthCard: fourth, told, found: told ? 1 : 0 });
    // Ticket 77: the gap alone is looked at (the fourth card's display, flex now, is not), 0 to 8px.
    expect(result.done).toMatch(/its gap from 0px to 8px since the round was claimed/);
    expect(told).toBe(true);
    expect(result.ringAfterDone).toBe(0);
    expect(result.applied).toEqual([]);
  });

  test("playbook: the same gap, the Agent passing it to the loop's usage alone: its three instances change, the fourth card does not (no false leak)", async ({ page }) => {
    await changeACard(page, 0, [["Gap", "12"]]);
    const result = await applyTheChange(
      page,
      [
        [CARD, CARD_PROPS, 'export function Card({ title, body, className = "" }: { title: string; body: string; className?: string }) {'],
        [CARD, '<article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">', "<article className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>"],
        [APP, LOOP_USAGE, '<Card key={feature.title} title={feature.title} body={feature.body} className="flex flex-col gap-3" />'],
      ],
      async () => (await cardsOnThePage(page, "rowGap")).join() === "12px,12px,12px,normal",
    );
    const falseLeaks = result.checks.outcomes[1] === "shown" ? 0 : 1;
    record("usage-only-gap", { ...kept(result), falseLeaks });
    expect(falseLeaks).toBe(0);
    expect(result.ticked).toEqual([1]);
  });

  test("playbook: the fourth card filled red, the Agent passing the fill to its usage alone: the loop's cards stay white (no false leak)", async ({ page }) => {
    await changeACard(page, 3, [["Fill color", "ff0000"]]);
    const result = await applyTheChange(
      page,
      [
        [CARD, CARD_PROPS, 'export function Card({ title, body, fill = "bg-white" }: { title: string; body: string; fill?: string }) {'],
        [CARD, '<article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">', "<article className={`rounded-xl border border-stone-200 ${fill} p-5 shadow-sm`}>"],
        [APP, OWN_USAGE, '<Card title="Your turn" body="Open the editor and try it." fill="bg-[#ff0000]" />'],
      ],
      async () => (await cardsOnThePage(page, "backgroundColor")).join() === "rgb(255, 255, 255),rgb(255, 255, 255),rgb(255, 255, 255),rgb(255, 0, 0)",
    );
    const falseLeaks = result.checks.outcomes[1] === "shown" ? 0 : 1;
    record("usage-only-fill", { ...kept(result), falseLeaks });
    expect(falseLeaks).toBe(0);
    expect(result.ticked).toEqual([1]);
  });

  test("playbook: the loop's cards filled red, promoted to the Card itself; the Agent writes it into the Card: every card is red, as asked (as before 77)", async ({ page }) => {
    await changeACard(page, 0, [["Fill color", "ff0000"]], true);
    expect(changesNow()[0]).toMatchObject({ scope: "component" });
    const result = await applyTheChange(page, [[CARD, "bg-white", "bg-[#ff0000]"]], async () => (await cardsOnThePage(page, "backgroundColor")).every((fill) => fill === "rgb(255, 0, 0)"));
    record("usage-promoted", kept(result));
    expect(result.checks.outcomes[1]).toBe("shown");
    expect(result.ticked).toEqual([1]);
  });

  test("playbook: the intro, written in the App itself, in no component, made half opaque; the Agent writes it there (as before 77)", async ({ page }) => {
    await recordNotices(page);
    await page.goto(DEV_URL);
    await page.getByRole("button", { name: TOGGLE_LABEL }).click();
    await expect(canvas(page).locator("h1")).toBeVisible();
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "A Framer-style editor layer for any page.", exact: true }).click();
    await setField(page, "Opacity", "50");
    await expect.poll(() => changesNow().map((change) => `${change.kind} ${change.property}`)).toEqual(["style opacity"]);
    await leaveEditMode(page);
    const result = await applyTheChange(page, [[APP, '<p className="mt-4 text-stone-600">', '<p className="mt-4 text-stone-600 opacity-50">']], async () =>
      page.locator('[data-testid="hero"] > p').evaluate((el) => getComputedStyle(el).opacity === "0.5"),
    );
    record("usage-no-component", kept(result));
    expect(result.checks.outcomes[1]).toBe("shown");
    expect(result.ticked).toEqual([1]);
  });

  /**
   * Ticket 82: what the other usages showed as the round was claimed is kept
   * with the claim in `.03kind/`, so a page that checks the round anew (the
   * designer reloads it, or opens it again) still goes by it; a round the page
   * claims for an Agent that did not (ticket 78) goes by what they showed
   * before the code began to change. Before 82 the page noted them afresh
   * then, the leak on the page already: none of the three leaks was found.
   */
  test.describe("leaks the page noted too late before (ticket 82)", () => {
    const allRed = async (page: Page) => (await cardsOnThePage(page, "backgroundColor")).every((fill) => fill === "rgb(255, 0, 0)");
    const loopRed = async (page: Page) => (await cardsOnThePage(page, "backgroundColor")).join() === "rgb(255, 0, 0),rgb(255, 0, 0),rgb(255, 0, 0),rgb(255, 255, 255)";

    /** The page open again, `how`: reloaded, or opened anew after it was left; once it has looked at change 1 again. */
    async function openAgain(page: Page, how: "reload" | "reopen") {
      const since = new Date().toISOString();
      if (how === "reload") await page.reload();
      else await page.goto(DEV_URL);
      await expect(ring(page)).toBeVisible();
      await expect.poll(() => (readThirdKindFile("checks.json")?.results?.[1]?.at ?? "") >= since, { timeout: 20_000 }).toBe(true);
    }

    /** `done 1`, the ring, and `finish`: what each said, and what the page shows, as `applyTheChange` keeps them. */
    async function doneAndFinish(page: Page) {
      const done = await npx03kind("done", "1");
      await expect(ring(page)).toBeVisible();
      const ringAfterDone = Number(await ring(page).getAttribute("aria-valuenow"));
      const finished = await npx03kind("finish");
      const checks = checksOf([1]);
      return { done, ringAfterDone, finished, checks, ticked: tickedIn(finished), applied: appliedInArchive() };
    }

    /** The loop's first card filled red in edit mode, left there with no claim; the change saved. */
    async function fillTheLoopInEditMode(page: Page) {
      await recordNotices(page);
      await page.goto(DEV_URL);
      await page.getByRole("button", { name: TOGGLE_LABEL }).click();
      await expect(canvas(page).locator("h1")).toBeVisible();
      await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
      await setField(page, "Fill color", "ff0000");
      await expect.poll(() => changesNow().map((change) => `${change.kind} ${change.property}`)).toEqual(["style fill"]);
      // The canvas at rest, the edit saved: what the page notes as the code begins to change is the round's.
      await page.waitForTimeout(500);
    }

    /** The Agent writes `card` with no claim; the page claims the round for it: how long that took, or null. */
    async function writeUnclaimed(page: Page, card: string, shows: () => Promise<boolean>) {
      writeFileSync(CARD, card);
      await expect.poll(shows).toBe(true);
      return within(UNCLAIMED_WATCH_MS, async () => existsSync(`${THIRD_KIND_FOLDER}state.json`) && (await ring(page).count()) > 0);
    }

    for (const how of ["reload", "reopen"] as const) {
      test(`playbook: the loop's cards filled red and claimed; the Agent writes it into the Card itself, ${how === "reload" ? "the page open, then reloaded" : "the page left first and opened again after"}: the fourth card is red too`, async ({ page }) => {
        await changeACard(page, 0, [["Fill color", "ff0000"]]);
        await npx03kind("claim");
        await expect.poll(() => readThirdKindFile("checks.json")?.results?.[1]?.outcome).toBeTruthy();
        if (how === "reopen") await page.goto("about:blank");
        await write([[CARD, "bg-white", "bg-[#ff0000]"]], async () => (await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text()).includes("bg-[#ff0000]"));
        if (how === "reload") await expect.poll(() => allRed(page)).toBe(true);
        await openAgain(page, how);
        expect(await allRed(page)).toBe(true);
        const result = await doneAndFinish(page);
        const told = toldLeak(result, /src\/App\.tsx:\d+:\d+/);
        record(`usage-leak-${how}`, { ...kept(result), told, found: told ? 1 : 0 });
        expect(result.done).toMatch(/it shows the change, but on another usage of Card too: Card used at `src\/App\.tsx:\d+:\d+`.*its fill from #FFFFFF to #FF0000 since the round was claimed/);
        expect(told).toBe(true);
        expect(result.ringAfterDone).toBe(0);
        expect(result.applied).toEqual([]);
      });
    }

    test("playbook: the same, claimed; the Agent writes it for the loop alone, and the page is reloaded: no false leak", async ({ page }) => {
      await changeACard(page, 0, [["Fill color", "ff0000"]]);
      await npx03kind("claim");
      await expect.poll(() => readThirdKindFile("checks.json")?.results?.[1]?.outcome).toBeTruthy();
      writeFileSync(CARD, forTheLoopAlone(original, "bg-white", "bg-[#ff0000]"));
      await expect.poll(() => loopRed(page)).toBe(true);
      await openAgain(page, "reload");
      const result = await doneAndFinish(page);
      const falseLeaks = result.checks.outcomes[1] === "shown" ? 0 : 1;
      record("usage-only-reload", { ...kept(result), falseLeaks });
      expect(falseLeaks).toBe(0);
      expect(result.ticked).toEqual([1]);
    });

    test("playbook: the loop's cards filled red in edit mode; the Agent writes it into the Card itself with no claim, and the page claims the round for it: the fourth card is red too", async ({ page }) => {
      await fillTheLoopInEditMode(page);
      const claimedAfterMs = await writeUnclaimed(page, original.replace("bg-white", "bg-[#ff0000]"), () => allRed(page));
      expect(claimedAfterMs).not.toBeNull();
      const result = await doneAndFinish(page);
      const told = toldLeak(result, /src\/App\.tsx:\d+:\d+/);
      record("usage-leak-unclaimed", { ...kept(result), claimedAfterMs, told, found: told ? 1 : 0 });
      expect(result.done).toMatch(/it shows the change, but on another usage of Card too: Card used at `src\/App\.tsx:\d+:\d+`.*its fill from #FFFFFF to #FF0000 since the round was claimed/);
      expect(told).toBe(true);
      expect(result.ringAfterDone).toBe(0);
      expect(result.applied).toEqual([]);
    });

    /**
     * After the line's review: a second page open as the page claims the round
     * noted the other usages only once it heard of the claim, the leak in by
     * then, and said the change shows; kept by the service, that stood. It
     * goes by what the claiming page noted before the code changed, kept with
     * the claim.
     */
    test("playbook: the same in edit mode, a second page open in preview mode; the Agent writes it into the Card itself with no claim, and the first page claims the round for it: the fourth card is red too, by either page", async ({ page }) => {
      await fillTheLoopInEditMode(page);
      const other = await page.context().newPage();
      try {
        await other.goto(DEV_URL);
        // Its editor layer up, the saved round counted on its toggle: it checks the round as it is claimed.
        await expect(other.getByRole("button", { name: /not applied yet/ })).toHaveText("1");
        const claimedAfterMs = await writeUnclaimed(page, original.replace("bg-white", "bg-[#ff0000]"), () => allRed(page));
        expect(claimedAfterMs).not.toBeNull();
        await expect(ring(other)).toBeVisible();
        await expect.poll(() => allRed(other)).toBe(true);
        // Each page has had its look: the second's word, said as the code changed, stays if it says the change shows.
        await expect.poll(() => readThirdKindFile("checks.json")?.results?.[1]?.outcome, { timeout: 10_000 }).toBeTruthy();
        await other.waitForTimeout(1500);
        const saidUnasked = readThirdKindFile("checks.json")?.results?.[1]?.outcome;
        const result = await doneAndFinish(page);
        const told = toldLeak(result, /src\/App\.tsx:\d+:\d+/);
        record("usage-leak-unclaimed-two-pages", { ...kept(result), claimedAfterMs, saidUnasked, told, found: told ? 1 : 0 });
        expect(saidUnasked).toBe("not shown");
        expect(told).toBe(true);
        expect(result.ringAfterDone).toBe(0);
        expect(result.applied).toEqual([]);
      } finally {
        await other.close();
      }
    });

    test("playbook: the same, a second page open in preview mode; the Agent writes it for the loop alone with no claim, and the first page claims the round for it: no false leak", async ({ page }) => {
      await fillTheLoopInEditMode(page);
      const other = await page.context().newPage();
      try {
        await other.goto(DEV_URL);
        await expect(other.getByRole("button", { name: /not applied yet/ })).toHaveText("1");
        const claimedAfterMs = await writeUnclaimed(page, forTheLoopAlone(original, "bg-white", "bg-[#ff0000]"), () => loopRed(page));
        expect(claimedAfterMs).not.toBeNull();
        await expect(ring(other)).toBeVisible();
        await expect.poll(() => loopRed(other)).toBe(true);
        const result = await doneAndFinish(page);
        const falseLeaks = result.checks.outcomes[1] === "shown" ? 0 : 1;
        record("usage-only-unclaimed-two-pages", { ...kept(result), claimedAfterMs, falseLeaks });
        expect(falseLeaks).toBe(0);
        expect(result.ticked).toEqual([1]);
      } finally {
        await other.close();
      }
    });

    test("playbook: the same in edit mode; the Agent writes it for the loop alone with no claim, and the page claims the round for it: no false leak", async ({ page }) => {
      await fillTheLoopInEditMode(page);
      const claimedAfterMs = await writeUnclaimed(page, forTheLoopAlone(original, "bg-white", "bg-[#ff0000]"), () => loopRed(page));
      expect(claimedAfterMs).not.toBeNull();
      const result = await doneAndFinish(page);
      const falseLeaks = result.checks.outcomes[1] === "shown" ? 0 : 1;
      record("usage-only-unclaimed", { ...kept(result), claimedAfterMs, falseLeaks });
      expect(falseLeaks).toBe(0);
      expect(result.ticked).toEqual([1]);
    });
  });
});

/**
 * Ticket 90: a change to the words of a layer that is there (a text change),
 * which the page did not check before: `done` said it was a change to the
 * structure. The page finds the layer by its source marker and reads its
 * words, in every instance, as it reads new text's (ticket 76); for one usage
 * alone, its component's other usages are to read as they did (tickets 77,
 * 82). Where it cannot check, it says why.
 */
test.describe("a text change (ticket 90)", () => {
  /** What the Agent wrote, and what the next test's page must not open on. */
  const WRITTEN = /Third Kind Studio|Your move|Thaw|Start now/;
  test.afterEach(async () => {
    // Run before the file's own hooks, which wait on the classes alone: words put back are waited for here.
    if (readFileSync(APP, "utf8") !== originalApp) writeFileSync(APP, originalApp);
    if (readFileSync(CARD, "utf8") !== original) writeFileSync(CARD, original);
    for (const file of ["src/App.tsx", "src/components/Card.tsx"]) {
      await expect.poll(async () => WRITTEN.test(await (await fetch(`${DEV_URL}/${file}`)).text())).toBe(false);
    }
  });

  /** In edit mode, the words of each of `edits` typed in: what is double-clicked on the canvas, and the words. Back in preview mode, the changes saved. */
  async function changeWords(page: Page, edits: [(page: Page) => Locator, string][]) {
    await recordNotices(page);
    await page.goto(DEV_URL);
    await page.getByRole("button", { name: TOGGLE_LABEL }).click();
    await expect(canvas(page).locator("h1")).toBeVisible();
    for (const [where, words] of edits) {
      // Selected first, the deepest layer there (as a designer does with ⌘), then double-clicked to type in it.
      await page.keyboard.down("ControlOrMeta");
      await where(page).click();
      await page.keyboard.up("ControlOrMeta");
      await where(page).dblclick();
      // Typed once the caret is in its words: on a busy machine, keys pressed before would go nowhere.
      await expect
        .poll(() =>
          where(page).evaluate((el) => {
            const doc = el.ownerDocument;
            const at = doc.getSelection()?.anchorNode;
            return doc.hasFocus() && !!(doc.activeElement as HTMLElement | null)?.isContentEditable && !!at && el.contains(at);
          }),
        )
        .toBe(true);
      await page.keyboard.type(words);
      await page.keyboard.press("Enter");
      await expect(where(page)).toHaveText(words);
    }
    await expect.poll(() => changesNow().map((change) => change.kind)).toEqual(edits.map(() => "text"));
    await leaveEditMode(page);
  }

  /**
   * The round claimed, `edits` made to the source as the Agent writes it (once `shows` says the page has them), `done` for every change, and `finish`: what each said, and the round's checks.
   * Before it edits, as a real Agent that reads the notes first, it waits for the page to have begun to check (`first`: its first look at change 1; `note`: what the other usages read noted too, kept with the claim), or for nothing more than the claim (`none`: a change it cannot check it never looks at by itself).
   */
  async function applyTheWords(page: Page, waitFor: "first" | "note" | "none", edits: [string, string, string][], shows: () => Promise<boolean>) {
    const ids = changesNow().map((change) => change.id);
    const claim = await npx03kind("claim");
    await expect(ring(page)).toBeVisible();
    if (waitFor === "first") await expect.poll(() => readThirdKindFile("checks.json")?.results?.[ids[0]]?.outcome).toBeTruthy();
    if (waitFor === "note") await expect.poll(() => !!readThirdKindFile("other-usages.json")?.otherUsages?.[ids[0]]).toBe(true);
    for (const [file, from, to] of edits) {
      const text = readFileSync(file, "utf8");
      expect(text).toContain(from);
      writeFileSync(file, text.replace(from, to));
    }
    await expect.poll(shows).toBe(true);
    const done = await npx03kind("done", ...ids.map(String));
    const finished = await npx03kind("finish");
    return { claim, done, finished, checks: checksOf(ids), ticked: tickedIn(finished), applied: appliedInArchive() };
  }

  /** What a playbook keeps: the outcome, the report's ✓, the archive's applied, and what `claim`, `done` and `finish` said, word for word. */
  const kept = ({ claim, done, finished, checks, ticked, applied }: Awaited<ReturnType<typeof applyTheWords>>) => ({ outcome: checks.outcomes[1], ticked, applied, claim, done, finished });

  const title = (page: Page) => canvas(page).locator("h1");
  const fourthTitle = (page: Page) => canvas(page).locator("article h3").nth(3);
  const titlesOnThePage = (page: Page) => page.locator("article h3").allTextContents();

  test("playbook: the title's words changed; the Agent writes them right", async ({ page }) => {
    await changeWords(page, [[title, "Third Kind Studio"]]);
    const result = await applyTheWords(page, "first", [[APP, ">Third Kind</h1>", ">Third Kind Studio</h1>"]], async () => (await page.locator("h1").textContent()) === "Third Kind Studio");
    record("text-title-right", kept(result));
    expect(result.done).toBe("Change 1 done: 1 of 1 change applied.\nChecked on the page: it shows the change.\n");
    expect(result.checks.outcomes[1]).toBe("shown");
    expect(result.ticked).toEqual([1]);
    expect(result.applied).toEqual([1]);
  });

  test("playbook: the title's words changed; the Agent writes other words", async ({ page }) => {
    await changeWords(page, [[title, "Third Kind Studio"]]);
    const result = await applyTheWords(page, "first", [[APP, ">Third Kind</h1>", ">Third Kind Studios</h1>"]], async () => (await page.locator("h1").textContent()) === "Third Kind Studios");
    record("text-title-wrong", kept(result));
    expect(result.done).toBe(
      "Change 1 done: 0 of 1 change applied.\n" +
        "Checked on the page: it does not show the change. The layer reads “Third Kind Studios” on the page, not “Third Kind Studio” as on the canvas: change its words in the JSX, or where they are given when they come from a prop or a variable, and run `npx 03kind done 1` again.\n",
    );
    expect(result.finished).toMatch(/^Round finished: 0 of 1 change applied\. The page does not show: 1\./);
    expect(result.finished).toContain("- 1. Text: <the layer>\n  Why: the layer reads “Third Kind Studios” on the page, not “Third Kind Studio”: <what keeps it so>\n");
    expect(result.applied).toEqual([]);
  });

  test("playbook: the fourth card's title changed, that usage alone; the Agent writes it at the usage", async ({ page }) => {
    await changeWords(page, [[fourthTitle, "Your move"]]);
    const result = await applyTheWords(page, "note", [[APP, 'title="Your turn"', 'title="Your move"']], async () => (await titlesOnThePage(page))[3] === "Your move");
    record("text-usage-only", { ...kept(result), titles: await titlesOnThePage(page) });
    expect(await titlesOnThePage(page)).toEqual(["Freeze", "Arrange", "Apply", "Your move"]);
    expect(result.checks.outcomes[1]).toBe("shown");
    expect(result.ticked).toEqual([1]);
  });

  test("playbook: the same; the Agent writes the words into the Card itself, so every card reads them", async ({ page }) => {
    await changeWords(page, [[fourthTitle, "Your move"]]);
    const result = await applyTheWords(page, "note", [[CARD, "{title}</h3>", "Your move</h3>"]], async () => (await titlesOnThePage(page)).every((words) => words === "Your move"));
    record("text-usage-leak", { ...kept(result), titles: await titlesOnThePage(page) });
    expect(result.done).toMatch(
      /^Change 1 done: 0 of 1 change applied\.\nChecked on the page: it shows the change, but on another usage of Card too: Card used at `src\/App\.tsx:\d+:\d+`, inside App used at `src\/main\.tsx:\d+:\d+`, its words from “Freeze” to “Your move” since the round was claimed\. The change is for this usage only \(Scope\): make it at the usage, put the other usage back as it was, and run `npx 03kind done 1` again\.\n$/,
    );
    expect(result.finished).toMatch(/^Round finished: 0 of 1 change applied\. Shown at other usages of its component too: 1\./);
    expect(result.finished).toMatch(/\n {2}Why: the page shows it at another usage of Card too, Card used at `src\/App\.tsx:\d+:\d+`, its words from “Freeze” to “Your move”: <what keeps it so>\n/);
    expect(result.applied).toEqual([]);
  });

  test("playbook: a loop card's title and the button's words changed; the Agent writes both: the page says why it cannot check either", async ({ page }) => {
    await changeWords(page, [
      [(page) => canvas(page).locator("article h3").first(), "Thaw"],
      [(page) => canvas(page).locator('[data-testid="hero"] > button'), "Start now"],
    ]);
    const result = await applyTheWords(
      page,
      "none",
      [
        [APP, '{ title: "Freeze",', '{ title: "Thaw",'],
        [APP, "          Get started\n", "          Start now\n"],
      ],
      async () => (await titlesOnThePage(page))[0] === "Thaw" && (await page.locator("button").first().textContent())?.trim() === "Start now",
    );
    record("text-unchecked", { ...kept(result), outcomes: result.checks.outcomes });
    expect(result.done).toBe(
      "Changes 1 and 2 done: 2 of 2 changes applied.\n" +
        "Change 1: not checked on the page: the words come from the data the loop goes through, and the page cannot tell the loop's instances apart. That is no error: go on.\n" +
        "Change 2: not checked on the page: the text has no element of its own on the page. That is no error: go on.\n",
    );
  });
});
