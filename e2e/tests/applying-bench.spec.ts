import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { recordUnclaimedNotices, unclaimedNotice, unclaimedNoticesShown } from "../bench/notices";
import { expect, test, type Page } from "./fixtures";
import { clearVernier, EXAMPLE, readVernier, VERNIER, vernierkit } from "./project-files";

/**
 * The applying bench, scripted (docs/goals.md, Robust): a script plays the
 * Agent, the way real ones do or fail to, through a round of three changes to
 * the cards of the loop. Each playbook records the numbers of the mechanism it
 * tries, in `bench-results/playbooks/` and in the output; it asserts none of
 * them. Tickets 64–68 each add the assertion of their own goal.
 */

/** These tests save into the example project's `.vernier/` for real, and edit its source. */
test.use({ keepRoundInMemory: false });
test.setTimeout(120_000);

/** How long the scripted Agent sits still before it goes on, and how long a stopped one is watched for the toggle's notice. */
const PAUSE_MS = Number(process.env.VK_BENCH_PAUSE_MS ?? 15_000);
const STALL_WATCH_MS = Number(process.env.VK_BENCH_STALL_WATCH_MS ?? 15_000);
/** How long the editor layer is watched for noticing code changed with no claim. */
const UNCLAIMED_WATCH_MS = Number(process.env.VK_BENCH_UNCLAIMED_WATCH_MS ?? 5_000);

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

/**
 * The toggle's notice that the Agent seems to have stopped (ticket 67): not
 * there yet, that ticket makes this find it. The editor layer's that the code
 * changes with no Agent claiming the changes (ticket 66) is `unclaimedNotice`,
 * found as the bench finds it on the designer's page.
 */
const stallNotice = (page: Page) => page.getByRole("alert").filter({ hasText: /Agent/ });

test.beforeEach(() => clearVernier(VERNIER));
test.afterEach(async () => {
  if (readFileSync(CARD, "utf8") !== original) writeFileSync(CARD, original);
  // The next test's page must open on the Card as it was: wait for the dev server to serve it so.
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text()).includes("rounded-xl border border-stone-200 bg-white")).toBe(true);
});
test.afterAll(() => clearVernier(VERNIER));

const canvas = (page: Page) => page.locator('iframe[title="Canvas"]').contentFrame();
const ring = (page: Page) => page.getByRole("progressbar", { name: "Applying design changes" });

/** The designer makes the round in edit mode, and it is saved. Each time the notice that no Agent claimed the changes shows is noted from here on. */
async function designTheRound(page: Page) {
  await recordUnclaimedNotices(page);
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  for (const { field, value } of CHANGES) {
    const box = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: field, exact: true });
    await box.fill(value);
    await box.press("Enter");
  }
  await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(CHANGES.length);
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
  const history = `${VERNIER}history/`;
  let results: Record<string, { outcome: string }> = readVernier("checks.json")?.results ?? {};
  try {
    const last = readdirSync(history).sort().at(-1);
    if (last) results = JSON.parse(readFileSync(`${history}${last}/result.json`, "utf8")).checks;
  } catch {
    // Not ended.
  }
  return IDS.filter((id) => ["shown", "not shown"].includes(results[id]?.outcome)).length / IDS.length;
}

/** Watches for `notice` for up to `ms`: how long it took to show, or null if it never did. */
async function watchFor(notice: ReturnType<typeof stallNotice>, ms: number): Promise<number | null> {
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

/** Whether either notice shows now: while the Agent works as it should, each one that does is a false one. */
async function falseNotices(page: Page) {
  return { stalled: (await stallNotice(page).count()) > 0, unclaimed: (await unclaimedNotice(page).count()) > 0 };
}

test("playbook: the Agent follows the workflow, done after each change, then finish", async ({ page }) => {
  await designTheRound(page);
  await vernierkit("claim");
  const gaps: number[] = [];
  const notices: { stalled: boolean; unclaimed: boolean }[] = [];
  for (const id of IDS) {
    await apply(page, id);
    gaps.push(await progressGap(page));
    notices.push(await falseNotices(page));
    await vernierkit("done", String(id));
    await expect(ring(page)).toHaveAttribute("aria-valuenow", String(id));
    gaps.push(await progressGap(page));
    notices.push(await falseNotices(page));
  }
  const atEnd = await progressGap(page);
  await vernierkit("finish");
  record("follows-the-workflow", {
    checkCoverage: checkCoverage(),
    progressGapAtEnd: atEnd,
    progressGapMax: Math.max(...gaps),
    falseStallNotices: notices.filter((notice) => notice.stalled).length,
    falseUnclaimedNotices: notices.filter((notice) => notice.unclaimed).length,
    looked: notices.length,
    unclaimedNoticesShown: (await unclaimedNoticesShown(page)).length,
  });
  // Ticket 66: an Agent that claims first never has the designer told the code changes unclaimed.
  expect((await unclaimedNoticesShown(page)).length).toBe(0);
});

test("playbook: the Agent skips done, applies every change and finishes", async ({ page }) => {
  await designTheRound(page);
  await vernierkit("claim");
  await expect(ring(page)).toBeVisible();
  const gaps: number[] = [];
  for (const id of IDS) {
    await apply(page, id);
    gaps.push(await progressGap(page));
  }
  const atEnd = gaps.at(-1)!;
  await vernierkit("finish");
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
  await vernierkit("claim");
  await expect(ring(page)).toBeVisible();
  for (const id of IDS) await apply(page, id);
  const beforeDone = await progressGap(page);
  for (const id of IDS) await vernierkit("done", String(id));
  await expect(ring(page)).toHaveAttribute("aria-valuenow", String(IDS.length));
  const atEnd = await progressGap(page);
  await vernierkit("finish");
  const coverage = checkCoverage();
  const unclaimedShown = (await unclaimedNoticesShown(page)).length;
  record("done-all-at-the-end", { checkCoverage: coverage, progressGapAtEnd: atEnd, progressGapMax: Math.max(beforeDone, atEnd), unclaimedNoticesShown: unclaimedShown });
  // Ticket 64: no worse than before (100%), and the ring is the page's.
  expect(coverage).toBe(1);
  expect(atEnd).toBe(0);
  // Ticket 66: no false notice.
  expect(unclaimedShown).toBe(0);
});

test("playbook: the Agent stops halfway, with no finish; the designer ends the round and edits again", async ({ page }) => {
  await designTheRound(page);
  await vernierkit("claim");
  const properties: { id: number; property: string }[] = readVernier("changeset.json").changes;
  const unapplied = properties.filter((change) => change.id !== 1).map((change) => change.property);
  const applied = properties.find((change) => change.id === 1)!.property;
  await apply(page, 1);
  await vernierkit("done", "1");
  await expect(ring(page)).toHaveAttribute("aria-valuenow", "1");
  // The Agent is gone. The toggle is to say so, the stopping threshold (ticket 67) + 5 seconds after.
  const stallNoticeAfterMs = await watchFor(stallNotice(page), STALL_WATCH_MS);
  const gapWhenStopped = await progressGap(page);
  const coverageWhenStopped = checkCoverage();

  // The designer ends the round by hand: pressing and holding the toggle.
  const toggle = page.getByRole("button", { name: /^Vernier Kit: applying design changes/ });
  await toggle.hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  // Edit mode again: the two changes never applied are to be in the round still (ticket 68).
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const nextRound: { property: string }[] = readVernier("changeset.json")?.changes ?? [];
  const kept = nextRound.filter((change) => unapplied.includes(change.property)).length;
  record("stops-halfway", {
    stallNoticeAfterMs,
    stallWatchedMs: STALL_WATCH_MS,
    progressGapWhenStopped: gapWhenStopped,
    checkCoverageWhenStopped: coverageWhenStopped,
    unappliedKeptForNextRound: kept / unapplied.length,
    appliedBackInNextRound: nextRound.some((change) => change.property === applied),
    unclaimedNoticesShown: (await unclaimedNoticesShown(page)).length,
  });
  // Ticket 66: the code the Agent changed while it had the round claimed asks nothing once the designer edits again.
  expect((await unclaimedNoticesShown(page)).length).toBe(0);
});

test("playbook: the Agent changes the code with no claim, while the designer is in edit mode", async ({ page }) => {
  await designTheRound(page);
  // Not claimed: the Agent goes by the chat, not the Skill.
  writeFileSync(CARD, original.replace(CHANGES[0].from, CHANGES[0].to));
  const noticeAfterMs = await watchFor(unclaimedNotice(page), UNCLAIMED_WATCH_MS);
  // Can the designer still edit, on a canvas the code has moved on from? Asked as the notice shows. Paused, nothing behind it takes the press.
  const button = page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true });
  await expect(button).toHaveCount(1);
  let editable = false;
  try {
    await button.click({ timeout: 2000 });
    const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Corner radius", exact: true });
    editable = (await field.count()) > 0 && (await field.isEditable());
  } catch (error) {
    // Not pressed: something else takes the press. Any other failure is the test's.
    if (!String(error).includes("intercepts pointer events")) throw error;
  }
  const changesKept = (readVernier("changeset.json")?.changes.length ?? 0) / CHANGES.length;
  record("changes-code-unclaimed", {
    detected: noticeAfterMs !== null,
    noticeAfterMs,
    watchedMs: UNCLAIMED_WATCH_MS,
    editingPaused: !editable,
    changesKept,
    unclaimedNoticesShown: (await unclaimedNoticesShown(page)).length,
  });
  // Ticket 66: found, with editing paused as the notice shows, and not a change of the canvas's lost.
  expect(noticeAfterMs).not.toBeNull();
  expect(editable).toBe(false);
  expect(changesKept).toBe(1);
});

test("playbook: the Agent sits still a long time between two changes, then goes on to finish", async ({ page }) => {
  await designTheRound(page);
  await vernierkit("claim");
  await apply(page, 1);
  await vernierkit("done", "1");
  // Working, though still: a notice here is a false one, unless the pause is past the threshold (ticket 67).
  const noticeDuringPauseAfterMs = await watchFor(stallNotice(page), PAUSE_MS);
  await page.waitForTimeout(Math.max(0, PAUSE_MS - (noticeDuringPauseAfterMs ?? PAUSE_MS)));
  await apply(page, 2);
  await vernierkit("done", "2");
  const noticeAfterResuming = await stallNotice(page).count();
  await apply(page, 3);
  await vernierkit("done", "3");
  const atEnd = await progressGap(page);
  await vernierkit("finish");
  record("pauses-then-goes-on", {
    pauseMs: PAUSE_MS,
    noticeDuringPauseAfterMs,
    noticeLeftAfterResuming: noticeAfterResuming > 0,
    checkCoverage: checkCoverage(),
    progressGapAtEnd: atEnd,
    unclaimedNoticesShown: (await unclaimedNoticesShown(page)).length,
  });
  // Ticket 66: an Agent that sits still and goes on, claimed all along, never has the designer told the code changes unclaimed.
  expect((await unclaimedNoticesShown(page)).length).toBe(0);
});
