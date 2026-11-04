/**
 * The command line, run by the Agent as the Skill tells it: `claim` takes the
 * round to apply and prints the change notes, `done <number> …` reports changes
 * applied and gives how the page checked them, `finish` ends the round, and
 * `last` prints the round before, to undo it by. `init`, `doctor` and
 * `remove` install 03Kind, check it, and take it back out.
 */
import { changes as changesWord, container as containerOf, describeChanges, shareWords, toApply, type NotesOptions } from "./change-notes";
import { breakpointName } from "./client/breakpoints";
import { otherUsagesWords, listed, ordinal, otherUsagesWord, propertyName, quoted, value } from "./design-values";
import type { MadeMissing, OffsetInLayout, PlacedOnPage } from "./client/check";
import { AUTO_MARGINS, AUTO_MARGINS_CLASS, AXIS_SIZE, CENTERING_SIGN, centeringSides, movedBy, PLACED_BY, shareCss, SIDES, type Edge, type Share } from "./client/checkable";
import type { Change, Created, Margins, Place, SavedChangeSet } from "./client/changeset";
import type { Axis } from "./client/snap";
import { defaultExec, doctor, init, remove, type Exec } from "./install";
import { canvasOffset, isOffsetInLayout, movedWords, reportFor } from "./report-form";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { BRIEF_UNCHECKED, CHECK_ARRIVE_MS, type CheckAsk, type CheckResult, type OtherUsageChanged } from "./service-protocol";
import {
  appliedOf,
  archiveRound,
  claimFresh,
  findProject,
  lastEdited,
  readChangeSet,
  readChecks,
  readLastRound,
  readState,
  snapshotCode,
  thirdKindFolder,
  writeAtomically,
  writeState,
  type RoundState,
  type ThirdKindFolder,
} from "./third-kind-folder";

export interface Io {
  cwd: string;
  write(text: string): void;
  /** For what went wrong: the command was not run. */
  error(text: string): void;
  /** Runs the package manager and the build, for `init`, `doctor` and `remove`. */
  exec?: Exec;
}

export type { Exec };

/** Runs one command; resolves with the exit code. */
export async function run(args: string[], io: Io): Promise<number> {
  const [command, ...rest] = args;
  const installIo = { write: io.write, error: io.error, exec: io.exec ?? defaultExec };
  if (command === "init") return init(io.cwd, installIo);
  if (command === "doctor") return doctor(io.cwd, installIo);
  if (command === "remove") return remove(io.cwd, installIo);
  const root = findProject(io.cwd);
  const folder = thirdKindFolder(root);
  switch (command) {
    case "claim":
      return claim(folder, root, io);
    case "done":
      return done(folder, rest, io);
    case "finish":
      return finish(folder, io);
    case "last":
      return last(folder, root, io);
    default:
      io.error(`Unknown command: ${command ?? "(none)"}\n`);
      return 1;
  }
}

async function claim(folder: ThirdKindFolder, root: string, io: Io): Promise<number> {
  // Claimed already: the Agent stopped, or lost the notes. What is applied so far stays applied; it gets the rest (ticket 67).
  const state = await readState(folder);
  // Not claimed yet: the open page may still be reading what it shows in each part of a change's range, the code as it is.
  const changeSet = state ? await readChangeSet(folder) : await waitForPartsRead(folder);
  if (!changeSet?.changes.length) {
    io.write("No design changes to apply: the designer has not changed anything in 03Kind since the last round.\n");
    return 0;
  }
  // The code as it was before the Agent changed anything, to undo the round by.
  const claimed: RoundState | null = state ? null : { status: "claimed", done: [], claimedAt: new Date().toISOString(), code: await snapshotCode(root) };
  if (claimed) await claimFresh(folder, claimed);
  const checks = await readChecks(folder);
  const pageOpen = !!checks?.pages && isRunning(checks.service);
  const notes = toApply(pageOpen);
  if (claimed && changeSet.changes.some((change) => change.carried)) return claimCarried(folder, root, io, claimed, changeSet, notes, pageOpen);
  if (!state) {
    io.write(describeChanges(changeSet.changes, root, notes));
    return 0;
  }
  // As the page counts them (ADR 0013): shown on the page, or done and not said not to show.
  io.write(
    claimedAgain(changeSet.changes, appliedOf(state, checks?.results), root, notes, {
      opening: "This round is claimed already",
      already: "",
      how: () => "as the designer's page shows them or as you reported them done",
    }),
  );
  return 0;
}

/**
 * What `claim` gives of a round some of whose changes, `applied`, are applied
 * already: what it says of them, then the notes of the others; all applied,
 * only to finish the round. Claim run again (ticket 67) and the claim of a
 * round changes were carried over to (ticket 68) say it alike, from their
 * own `opening`, with their own `already` and `how` (`one`: of one change).
 * `alone`: a round of one change is said to have one, not all 1 or none of
 * its 1 changes; claim run again says it as it always has.
 */
function claimedAgain(
  changes: Change[],
  applied: number[],
  root: string,
  notes: NotesOptions,
  { opening, already, how, alone = false }: { opening: string; already: string; how: (one: boolean) => string; alone?: boolean },
): string {
  const all = changes.length;
  const single = alone && all === 1;
  if (applied.length === all) {
    const these = single ? "its 1 change is" : `all ${all} of its changes are`;
    return `${opening}, and ${these} applied${already}, ${how(single)}: run \`npx 03kind finish\` to end it.\n`;
  }
  const one = applied.length === 1;
  const none = single ? "its 1 change is not applied yet" : `none of its ${all} changes are applied yet`;
  const so = applied.length ? `${applied.length} of its ${all} changes ${one ? "is" : "are"} applied${already} (${listed(applied)}), ${how(one)}` : none;
  const left = changes.filter((change) => !applied.includes(change.id));
  return describeChanges(changes, root, { ...notes, only: left, intro: (count) => `${opening}, and ${so}. Left: ${notes.intro(count)}` });
}

/**
 * Claims a round that changes were carried over to, from one that ended with
 * them not applied (ticket 68). An open page is asked first what it shows of
 * them now, the code as it is: those it shows are applied already, as in
 * claim run again (ticket 67); the others go from the value it shows now, and
 * are set by what sets it now (`readAgain`). Those values are kept in the
 * change, for claim run again and `last`.
 */
async function claimCarried(folder: ThirdKindFolder, root: string, io: Io, claimed: RoundState, changeSet: SavedChangeSet, notes: NotesOptions, pageOpen: boolean): Promise<number> {
  const carried = changeSet.changes.filter((change) => change.carried).map((change) => change.id);
  let applied: number[] = [];
  let results = new Map<number, CheckResult>();
  if (pageOpen) {
    // A brief has no value to check on the page.
    const asked = changeSet.changes.filter((change) => change.carried && change.kind !== "brief").map((change) => change.id);
    results = (await askPages(folder, claimed, "opening", asked)).results;
    applied = appliedOf(claimed, Object.fromEntries([...results].map(([id, result]) => [id, { ...result, at: claimed.claimedAt! }])));
  }
  const reread = changeSet.changes.map((change) => (change.carried ? readAgain(change, results.get(change.id)) : change));
  if (reread.some((change, i) => change !== changeSet.changes[i])) {
    changeSet = { ...changeSet, changes: reread };
    await writeAtomically(folder.changeSet, `${JSON.stringify(changeSet, null, 2)}\n`);
  }
  io.write(
    claimedAgain(changeSet.changes, applied, root, notes, {
      opening: `This round carries ${changesWord(carried.length)} over from the round before, not applied then (${listed(carried)})`,
      already: " already",
      how: (one) => (one ? "as the designer's page shows it" : "as the designer's page shows them"),
      alone: true,
    }),
  );
  return 0;
}

/**
 * A style change carried over from a round before, as the page shows it now,
 * the code as it is (ticket 68): from the value the page shows instead, as
 * its check read it (`result`, not shown), and set by what sets that value,
 * read with it; from the value each part of its range shows, when every part
 * shows the same (the page read them before the claim, ticket 65). As it is
 * where the page read none of that.
 */
function readAgain(change: Change, result: CheckResult | undefined): Change {
  if (change.kind !== "style") return change;
  let next = change;
  // Each part read again: one value in all of them is the change's before, as the notes say it once.
  const [first, ...others] = change.parts ?? [];
  if (first && others.every((part) => JSON.stringify(part.before) === JSON.stringify(first.before))) next = { ...next, before: first.before };
  // Shown on the layer, and at other usages too (ticket 77): its value there is its after.
  if (result?.outcome !== "not shown" || result.otherUsages || !readWhereMade(change, result.width)) return next;
  const before = change.parts ? undefined : beforeOf(change, result.actual);
  // Centered (ticket 79): what its side is written as now goes with it, so the notes say the code as it is twice alike.
  const share = before !== undefined && change.centeredOn ? (result.actual as { share?: Share }).share : undefined;
  return {
    ...next,
    ...(before !== undefined && { before }),
    ...(share && { centeredOn: { ...change.centeredOn!, before: share } }),
    ...(result.sources?.length && { sources: result.sources }),
  };
}

/**
 * Whether the page read a change, not shown, where it is made: a change at a
 * breakpoint, in its range (in one of its parts, for one in parts); one made
 * in the desktop view, as wide as the window (`width` none).
 */
function readWhereMade(change: Change, width: number | undefined): boolean {
  return change.breakpoint ? true : width === undefined;
}

/**
 * The value a change goes from, in design language, as the page's check read
 * what it shows instead (`actual`); undefined when that is no such value. A
 * layer placed by its X and Y, absolute but drawn elsewhere, is read as its
 * `left` and `top` with its margins apart (`lookPosition` in `check.ts`): its
 * X and Y are its `left` and `top`, and it keeps its margins (ticket 65).
 */
function beforeOf(change: Change, actual: unknown): unknown {
  if (PLACED_BY[change.property]) {
    // With its margins kept (`margins`), the page read it so: its `left` or `top` and its margin there. Not absolute, it read none (null, ticket 80).
    const placed = actual as { value?: unknown } | null;
    if (change.margins) return typeof placed?.value === "number" ? placed.value : undefined;
    return typeof actual === "number" ? actual : undefined;
  }
  if (change.property === "absolute" && actual !== null) {
    const { x, y } = actual as PlacedOnPage;
    return { x, y };
  }
  return actual;
}

/**
 * Asks the open pages to check changes `ids`, under the state's `field` (an
 * ask of its own that their answers carry: `opening`, `check` or `closing`),
 * and waits for their answers. Returns the state as asked, and the answers.
 * `opening` asks what sets the value a style change shows instead, too.
 */
async function askPages(folder: ThirdKindFolder, state: RoundState, field: "opening" | "check" | "closing", ids: number[]): Promise<{ asked: RoundState; results: Map<number, CheckResult> }> {
  const ask = await newAsk(folder, ids, field === "opening");
  const asked = { ...state, [field]: ask };
  await writeState(folder, asked);
  const results = ids.length ? await waitForChecks(folder, ask, state.claimedAt) : new Map<number, CheckResult>();
  return { asked, results };
}

/** The longest `claim` waits for an open page to read the parts of the changes' ranges it has yet to: it takes a page a moment. */
const PARTS_WAIT_MS = 5000;

/**
 * The round as saved once the open page has read what it shows in each part
 * of the range of every change it has yet to (`parts` null, ticket 65), and
 * saved it again; as it is, with no page open to read them, or once a while
 * has gone by. Read before the round is claimed: from then on the code changes.
 */
async function waitForPartsRead(folder: ThirdKindFolder) {
  const until = Date.now() + PARTS_WAIT_MS;
  for (;;) {
    const changeSet = await readChangeSet(folder);
    if (!changeSet?.changes.some((change) => change.parts === null)) return changeSet;
    const checks = await readChecks(folder);
    if (!checks?.pages || !isRunning(checks.service) || Date.now() > until) return changeSet;
    await new Promise((resolve) => setTimeout(resolve, CHECK_POLL_MS));
  }
}

const NOT_CLAIMED = "The round is not claimed: run `npx 03kind claim` first.\n";

async function done(folder: ThirdKindFolder, args: string[], io: Io): Promise<number> {
  const [state, changeSet] = await Promise.all([readState(folder), readChangeSet(folder)]);
  if (!state || !changeSet) {
    io.error(NOT_CLAIMED);
    return 1;
  }
  const ids = changeSet.changes.map((change) => change.id);
  const wrong = args.find((arg) => !ids.includes(Number(arg)));
  if (!args.length || wrong !== undefined) {
    const which = !args.length ? "Give the numbers of the changes you applied: `npx 03kind done <number> …`." : `There is no change ${wrong} in this round.`;
    io.error(`${which} Its changes are: ${ids.join(", ")}.\n`);
    return 1;
  }
  const reported = [...new Set(args.map(Number))];
  const changes = reported.map((id) => changeSet.changes.find((c) => c.id === id)!);
  const doneIds = [...new Set([...state.done, ...reported])];
  // A brief has no value to check on the page: what the Agent did is for its report.
  const asked = changes.filter((change) => change.kind !== "brief").map((change) => change.id);
  const { asked: claimed, results } = await askPages(folder, { ...state, done: doneIds }, "check", asked);
  const applied = appliedOf(claimed, (await readChecks(folder))?.results);
  const lines = changes.map((change) => checkLine(change, results.get(change.id)));
  const one = changes.length === 1;
  io.write(`${one ? "Change" : "Changes"} ${listed(reported)} done: ${applied.length} of ${changesWord(ids.length)} applied.\n`);
  io.write(one ? `${lines[0]}\n` : lines.map((line, i) => `Change ${reported[i]}: ${line[0].toLowerCase()}${line.slice(1)}\n`).join(""));
  return 0;
}

/** An ask for the open pages to check changes `ids`, under a key of its own that their answers carry: it goes out with the state. */
async function newAsk(folder: ThirdKindFolder, ids: number[], sources: boolean): Promise<CheckAsk> {
  return { ids, at: new Date().toISOString(), key: randomUUID(), codeAt: await lastEdited(dirname(folder.dir)), ...(sources && { sources: true as const }) };
}


/** What `done` says of a change, as the page checked it. */
function checkLine(change: Change, result: CheckResult | undefined): string {
  if (change.kind === "brief") return `Not checked on the page: ${BRIEF_UNCHECKED}. Say in your report how you achieved it: what you changed, and where.`;
  switch (result?.outcome) {
    case "shown":
      return "Checked on the page: it shows the change.";
    case "not shown":
      if (result.otherUsages?.length) return shownAtOtherUsages(change, result.otherUsages);
      return `Checked on the page: it does not show the change. ${notShown(change, result.actual, result.width)}`;
    default:
      return `Not checked on the page: ${result?.reason ?? "the page did not answer in time"}. That is no error: go on.`;
  }
}

/**
 * A change for one usage alone that the page shows on its layer, and on other
 * usages of its component too (ticket 77): which, what they show now that they
 * did not as the round was claimed, and to put them back.
 */
function shownAtOtherUsages(change: Change, usages: OtherUsageChanged[]): string {
  const one = usages.length === 1;
  return (
    `Checked on the page: it shows the change, but on ${otherUsagesWord(change, usages)} too: ${otherUsagesWords(change.property, usages)} since the round was claimed. ` +
    `The change is for this usage only (Scope): make it at the usage, put the other ${one ? "usage back as it was" : "usages back as they were"}, and run \`npx 03kind done ${change.id}\` again.`
  );
}

/** How a sentence of what the page shows opens: "At 390px wide, the", `width` px wide when not as wide as its window; else "The". */
const sentenceAt = (width?: number) => (width ? `At ${width}px wide, the` : "The");

/** What the page shows instead of change `id`, `width` px wide when not as wide as its window, what to look at, and to check again. */
function notShown(change: Change, actual: unknown, width?: number): string {
  const again = `run \`npx 03kind done ${change.id}\` again`;
  if (change.kind === "delete") {
    if (width) return `At ${width}px wide, the layer is still on the page: take it out at every width, and ${again}.`;
    return `The layer is still on the page: take it out of the code (for a data change, its item out of the data), and ${again}.`;
  }
  if (change.kind === "create") return madeNotShown(change, actual, again, width);
  // New words (ticket 90): what the layer reads on the page, and what on the canvas.
  if (change.kind === "text") {
    return `The layer reads ${quoted(actual as string)} on the page, not ${quoted(change.after as string)} as on the canvas: change its words in the JSX, or where they are given when they come from a prop or a variable, and ${again}.`;
  }
  if (change.kind === "move") {
    const { absolute, nth } = change.after as Place;
    if (!absolute) return `Its container's layers are in another order on the page: put it ${ordinal(nth)}, as the notes say, and ${again}.`;
    const at = sentenceAt(width);
    if (actual === "no reference") {
      return `${at} layer is placed absolute, but not from its container: make the container its positioning reference (\`position: relative\`), and ${again}.`;
    }
    // Not placed absolute at all: so, first, whatever else the notes give (ticket 80).
    if (actual === null) return movedNotAbsolute(absolute, again, width);
    // Placed from its container's right or bottom edge, or centered, along an axis (ticket 79): by the side the notes give.
    const placedOtherwise = absolute.placed;
    const centeredAxis = (["x", "y"] as const).find((axis) => placedOtherwise?.[axis]?.centered);
    if (centeredAxis && isUncentered(actual)) return notCentered(centeredAxis, placedOtherwise![centeredAxis]!.edge, again, width);
    if (placedOtherwise) {
      return `${at} layer is not where the notes place it: check its \`position\`, ${sidesToCheck(placedOtherwise)} as the notes give them, and that its container is its positioning reference, then ${again}.`;
    }
    if (change.margins) return offByMargins(absolute, change.margins, actual as PlacedOnPage, again, width);
    const placed = actual as { x: number; y: number };
    return `${at} layer is at X ${placed.x}px and Y ${placed.y}px, not absolute at X ${absolute.x}px and Y ${absolute.y}px: check its \`position\`, \`left\` and \`top\`, and that its container is its positioning reference, then ${again}.`;
  }
  if (PLACED_BY[change.property] && isOffsetInLayout(actual)) return offsetNotShown(change.property, change.after as number, actual, again, width);
  if (PLACED_BY[change.property] && actual === null) return notPlacedAbsolute(change.property, change.after as number, again, width);
  if (change.centeredOn && isUncentered(actual)) return notCentered(PLACED_BY[change.property]!.axis, PLACED_BY[change.property]!.edge, again, width);
  if (change.centeredOn && change.placedFrom?.margins && actual !== null && typeof actual === "object" && "side" in actual) return notAtSide(change, actual as unknown as { value: number; at: number }, again, width);
  if (change.centeredOn && change.placedFrom?.margins && actual !== null && typeof actual === "object" && "at" in actual) return notAtMiddle(change, actual as { value: number; at: number }, again, width);
  if (change.centeredOn && actual !== null && typeof actual === "object" && "at" in actual) return centeredOff(change, actual as { value: number; margin: number; at: number }, again, width);
  if (change.margins && actual !== null && typeof actual === "object") {
    if (change.property === "absolute") return offByMargins(change.after as { x: number; y: number }, change.margins, actual as PlacedOnPage, again, width);
    if (PLACED_BY[change.property]) return axisOffByMargins(change.property, change.after as number, change.margins, actual as { value: number; margin: number }, again, width);
  }
  // What the page read: the property as the browser computes it, which the reference style writes.
  const css = Object.keys(change.style);
  const read = css.length ? `, as the browser computes ${css.map((name) => `\`${name}\``).join(" and ")} on the layer` : "";
  const instead = `${propertyName(change.property)} is ${value(change.property, actual)}, not ${value(change.property, change.after)}${read}.`;
  if (width) {
    const applies = change.breakpoint ? `${breakpointName(change.breakpoint)} only, at that width too` : "at every width";
    return `At ${width}px wide, the ${instead} The change applies ${applies}: see what sets the value at that width (a breakpoint variant such as \`sm:\`, a media query), fix it, and ${again}.`;
  }
  return `The ${instead} Something overrides your change: see what sets the value in the notes (Currently set by), fix it, and ${again}.`;
}

/**
 * A new layer the page does not find at its place (ticket 76), or finds,
 * placed absolute, drawn elsewhere: what it looked for and what is there.
 */
function madeNotShown(change: Change, actual: unknown, again: string, width?: number): string {
  const container = containerOf((change.after as Created).place, false);
  if (actual && typeof actual === "object" && "type" in actual) {
    const { type, words, nth, there } = actual as MadeMissing;
    const what = type === "text" ? `the new text, reading \u201c${words}\u201d,` : "the new Frame";
    if (!nth) return `The page does not have ${what} placed absolute in ${container}: write the new layer there, as the notes say, and ${again}.`;
    // A range: the page may have layers there the round takes out, or not yet those it puts in.
    const which = nth[0] === nth[1] ? ordinal(nth[0]) : `${ordinal(nth[0])} ${nth[1] - nth[0] === 1 ? "or" : "to"} ${ordinal(nth[1])}`;
    const instead = there ? `it has ${there} there` : "it has no layer there";
    return `The page does not have ${what} as the ${which} layer of ${container}: ${instead}. Write the new layer there, as the notes say, and ${again}.`;
  }
  const at = sentenceAt(width);
  if (actual === "no reference") return `${at} new layer is placed absolute, but not from its container: make the container its positioning reference (\`position: relative\`), and ${again}.`;
  const placed = actual as PlacedOnPage | null;
  const where = placed ? `at X ${placed.x}px and Y ${placed.y}px` : "not placed absolute";
  return `${at} new layer is ${where}, not where the notes place it: check its \`position\`, \`left\` and \`top\`, and that its container is its positioning reference, then ${again}.`;
}

/** Margins in words: `2px left and 6px top`, `24px top`, `none`. */
function marginWords({ x, y }: Margins): string {
  const sides = [x ? `${x}px left` : "", y ? `${y}px top` : ""].filter(Boolean);
  return sides.length ? sides.join(" and ") : "none";
}

/**
 * A layer placed absolute that the page draws elsewhere than the canvas: the
 * canvas draws it past its X and Y (its `left` and `top`) by the margins it
 * keeps, so a `left` and `top` that are right with its margins taken off are
 * not. `width`: looked at that wide, where the canvas's margins are the
 * project's own at that width, known as they were in the desktop view only.
 */
function offByMargins(to: { x: number; y: number }, margins: Margins, placed: PlacedOnPage, again: string, width?: number): string {
  const drawn = `${sentenceAt(width)} layer is drawn at X ${placed.x + placed.margins.x}px and Y ${placed.y + placed.margins.y}px in its container (\`left\` ${placed.x}px and \`top\` ${placed.y}px, margins ${marginWords(placed.margins)}), `;
  const canvas = width
    ? `where the canvas places it at X ${to.x}px and Y ${to.y}px, its \`left\` and \`top\`, and keeps its margins (${marginWords(margins)} in the desktop view; at this width, the margins the project's breakpoints give it). `
    : `where the canvas draws it at X ${to.x + margins.x}px and Y ${to.y + margins.y}px (its X and Y are its \`left\` and \`top\`, ${to.x}px and ${to.y}px, and it keeps its margins, ${marginWords(margins)}). `;
  if (!width && placed.x === to.x && placed.y === to.y) {
    return `${drawn}${canvas}Its \`left\` and \`top\` are right, but not its margins: keep the margins it has on the canvas (what sets them, such as \`mt-6\` or \`margin-top\`), or add them to \`left\` and \`top\`, and ${again}.`;
  }
  return `${drawn}${canvas}Check its \`position\`, \`left\` and \`top\`, and that its container is its positioning reference, then ${again}.`;
}

/**
 * A layer moved to be placed absolute (`to`), that the page does not place
 * absolute (ticket 80): where the notes place it, along each axis by the side
 * that places it so (ticket 79), and those sides to check.
 */
function movedNotAbsolute(to: NonNullable<Place["absolute"]>, again: string, width?: number): string {
  const axes = (["x", "y"] as const).map((axis) => {
    const how = to.placed?.[axis];
    const side = SIDES[axis][how?.edge ?? "start"];
    if (how?.margins) {
      const sides = centeringSides(how);
      return { side, centeredOn: `\`${side}: ${shareCss(sides.start)}\` and \`${SIDES[axis].end}: ${shareCss(sides.end)}\` by its auto margins`, between: true };
    }
    if (how?.centered) return { side, centeredOn: `\`${side}: ${shareCss(how)}\`` };
    return { side, at: how ? `${how.px}px from its container's ${side} edge` : `${axis.toUpperCase()} ${to[axis]}px` };
  });
  // "at X 40px and Y 12px", as with no side but `left` and `top` it always was.
  const where = axes.some(({ centeredOn }) => centeredOn)
    ? axes.map(({ at, centeredOn, between }) => (centeredOn ? `centered ${between ? "between" : "on"} ${centeredOn}` : `at ${at}`)).join(" and ")
    : `at ${axes.map(({ at }) => at).join(" and ")}`;
  return `${sentenceAt(width)} layer is not placed absolute, not absolute ${where}: check its \`position\`, ${sidesToCheck(to.placed)}, and that its container is its positioning reference, then ${again}.`;
}

/**
 * The CSS that places a layer moved to be placed absolute, along each axis,
 * as `placed` has it (ticket 79): the side that places it; centered by its
 * auto margins, both, and those margins (ticket 96, review).
 */
function sidesToCheck(placed: NonNullable<Place["absolute"]>["placed"]): string {
  const [across, down] = (["x", "y"] as const).map((axis) => {
    const how = placed?.[axis];
    if (how?.margins) return `\`${SIDES[axis].start}\` and \`${SIDES[axis].end}\` with its \`${AUTO_MARGINS[axis]}\``;
    return `\`${SIDES[axis][how?.edge ?? "start"]}\``;
  });
  return placed?.x?.margins || placed?.y?.margins ? `${across}, and ${down}` : `${across} and ${down}`;
}

/**
 * A layer's X or Y, or its right or bottom position, that the page does not
 * place it by, as it does not place it absolute (ticket 80): said as a move
 * absolute says it (`notShown`), with the side to check along that axis.
 * `property`: one of `PLACED_BY`.
 */
function notPlacedAbsolute(property: string, to: number, again: string, width?: number): string {
  const { axis, edge } = PLACED_BY[property]!;
  const side = SIDES[axis][edge];
  const where = edge === "end" ? `${to}px from its container's ${side} edge` : `${axis.toUpperCase()} ${to}px`;
  return `${sentenceAt(width)} layer is not placed absolute, not absolute at ${where}: check its \`position\` and \`${side}\`, and that its container is its positioning reference, then ${again}.`;
}

/**
 * A layer's X or Y, or its right or bottom position, `to` px, at a width
 * where the canvas has the layer in its container's layout still, moved by
 * it, relative or sticky (ticket 84): what the page does there instead
 * (`OffsetInLayout`), and how far the canvas moves the layer, or keeps it
 * in, there (`canvasOffset`); to give its side the value there too, or, the
 * page placing it otherwise, to have its side move it so. Not a word of its
 * `position` to check, nor of its positioning reference: that would send the
 * Agent to change how the page lays it out there.
 * `property`: one of `PLACED_BY`.
 */
function offsetNotShown(property: string, to: number, { canvas, position, offset, written }: OffsetInLayout, again: string, width?: number): string {
  const { axis, edge } = PLACED_BY[property]!;
  const side = SIDES[axis][edge];
  const { toDo, does, how } = canvasOffset(property, to, canvas);
  const there = `where the canvas ${does} it ${how}`;
  const giveIt = `give it \`${side}\` ${to}px at this width too, then ${again}.`;
  const haveIt = `have its \`${side}\` ${toDo} it so at this width too, then ${again}.`;
  if (position === canvas && canvas === "relative") {
    const moved = movedBy(edge, offset ?? 0);
    return `${sentenceAt(width)} page ${moved ? `moves the layer ${movedWords(axis, moved)}` : "does not move the layer"}, ${there}: ${giveIt}`;
  }
  if (position === canvas) return `${sentenceAt(width)} layer's \`${side}\` is ${offset === null ? `\`${written ?? "auto"}\`` : `${offset}px`}, ${there}: ${giveIt}`;
  if (position === "static") return `${sentenceAt(width)} layer is laid out static, so its \`${side}\` moves nothing, ${there}: ${haveIt}`;
  if (position === "relative") return `${sentenceAt(width)} layer is placed relative, so its \`${side}\` moves it from where its container lays it out, not as the page scrolls, ${there}: ${haveIt}`;
  if (position === "sticky") return `${sentenceAt(width)} layer is placed sticky, so its \`${side}\` moves it only as the page scrolls, ${there}: ${haveIt}`;
  return `${sentenceAt(width)} layer is taken out of its container's layout, ${there}: keep it in its container's layout at this width, and have its \`${side}\` ${toDo} it so, then ${again}.`;
}

/**
 * An absolute layer's X or Y (or its right or bottom position, ticket 75)
 * the page draws elsewhere than the canvas, which draws it past its `left` or
 * `top` (`right`, `bottom`) by the margin it keeps (`offByMargins`).
 * `property`: one of `PLACED_BY`.
 */
function axisOffByMargins(property: string, to: number, margins: Margins, placed: { value: number; margin: number }, again: string, width?: number): string {
  const { axis, edge } = PLACED_BY[property]!;
  const side = SIDES[axis][edge];
  const where = edge === "end" ? `from its container's ${side} edge` : "in its container";
  const drawn = `${sentenceAt(width)} ${propertyName(property)} is drawn at ${placed.value + placed.margin}px ${where} (\`${side}\` ${placed.value}px, ${side} margin ${placed.margin}px), `;
  const placedBy = edge === "end" ? `it is placed by its \`${side}\`` : `its ${axis.toUpperCase()} is its \`${side}\``;
  const canvas = width
    ? `where the canvas places it at ${to}px, its \`${side}\`, and keeps its ${side} margin (${margins[axis]}px in the desktop view; at this width, the margin the project's breakpoints give it). `
    : `where the canvas draws it at ${to + margins[axis]}px (${placedBy}, ${to}px, and it keeps its ${margins[axis]}px ${side} margin). `;
  if (!width && placed.value === to) {
    return `${drawn}${canvas}Its \`${side}\` is right, but not its margin: keep the margin it has on the canvas (what sets it, such as \`m${side[0]}-6\` or \`margin-${side}\`), or add it to \`${side}\`, and ${again}.`;
  }
  return `${drawn}${canvas}Check its \`position\` and \`${side}\`, and that its container is its positioning reference, then ${again}.`;
}

/** Whether the page found a layer centered on the canvas not centered on its side now (`check.ts`): its translate gone, or turned over. */
const isUncentered = (actual: unknown) => actual !== null && typeof actual === "object" && (actual as { centered?: boolean }).centered === false;

/**
 * A layer centered along `axis` on where its side from `edge` places it
 * (ticket 79), that the page does not move back (forward) half its size,
 * so draws half its size aside whatever its side gives it (line review).
 */
function notCentered(axis: Axis, edge: Edge, again: string, width?: number): string {
  const [side, sign] = [SIDES[axis][edge], CENTERING_SIGN[edge]];
  return (
    `${sentenceAt(width)} layer is not centered on where its \`${side}\` places it: the page does not move it ${edge === "start" ? "back" : "forward"} half its ${AXIS_SIZE[axis]} ` +
    `by \`translate: ${sign}50%\` (Tailwind's \`${sign}translate-${axis}-1/2\`), or something else, such as another \`transform\` or \`rotate\`, takes its place. ` +
    `Keep its \`translate\`, as the notes say, and ${again}.`
  );
}

/**
 * The X or Y, or the `right` or `bottom`, of a layer centered on where that
 * side places it (ticket 79), the page placing it elsewhere than the share
 * of its container the side gives it on the canvas puts it, at that width (`at`).
 */
function centeredOff({ property, centeredOn }: Change, placed: { value: number; margin: number; at: number }, again: string, width?: number): string {
  const { axis, edge } = PLACED_BY[property]!;
  const side = SIDES[axis][edge];
  const share = centeredOn!.after;
  return (
    `${sentenceAt(width)} layer's \`${side}\` is ${placed.value}px (${side} margin ${placed.margin}px), ` +
    `where the canvas centers it at ${placed.at}px: ${shareWords(share, axis, edge, "its container", "there")} (\`${side}: ${shareCss(share)}\`), its margin kept. ` +
    `Write its \`${side}\` as that share of its container, not in px, keep its \`translate\`, and ${again}.`
  );
}

/**
 * The X or Y of a layer centered between its sides by its auto margins
 * (ticket 96), the page drawing it (`value`) elsewhere than where its middle,
 * as the canvas has it, puts it at that width (`at`).
 */
function notAtMiddle({ property, centeredOn, style }: Change, placed: { value: number; at: number }, again: string, width?: number): string {
  const { axis } = PLACED_BY[property]!;
  const { start, end } = SIDES[axis];
  return (
    `${sentenceAt(width)} layer is drawn at ${placed.value}px from its container's ${start} edge, where the canvas centers it by its auto margins at ${placed.at}px, ` +
    `its middle at ${shareWords(centeredOn!.after, axis, "start", "its container", "there")}. ` +
    `Keep it centered between its \`${start}\` and \`${end}\` by its auto margins (\`${AUTO_MARGINS[axis]}\`, Tailwind's \`${AUTO_MARGINS_CLASS[axis]}\`), ` +
    `its sides as the notes give them (\`${start}: ${style[start]}; ${end}: ${style[end]}\`), not a px value from one side, and ${again}.`
  );
}

/**
 * The X or Y of a layer centered by its auto margins on the canvas, at a
 * width it does not center it so (`Change.uncenteredAt`, ticket 96, review),
 * the page drawing it (`value`) elsewhere than its side from the start, as
 * the change writes it, puts it there (`at`).
 */
function notAtSide({ property }: Change, placed: { value: number; at: number }, again: string, width?: number): string {
  const side = SIDES[PLACED_BY[property]!.axis].start;
  return (
    `${sentenceAt(width)} layer is drawn at ${placed.value}px from its container's ${side} edge, where the canvas places it by its \`${side}\`, ${placed.at}px, as it does not center it by its auto margins there: ` +
    `give it that \`${side}\` at this width too, and ${again}.`
  );
}

/**
 * Longest wait for a page's answer: the page's own longest, and some, as a
 * page in a background tab is slow.
 */
const CHECK_WAIT_MS = CHECK_ARRIVE_MS + 6000;
const CHECK_POLL_MS = 50;

/**
 * The open pages' answers to `check`, through the local service's
 * `checks.json`, by change id. A page answers at once for a change it shows
 * already (it looks again, as a later edit may have undone it); with no page
 * to ask, what one saw this round stands. With several pages, one that cannot
 * check (it does not show the layer) does not stand in for one that can and is still at it.
 */
async function waitForChecks(folder: ThirdKindFolder, check: CheckAsk, claimedAt: string | undefined): Promise<Map<number, CheckResult>> {
  const until = Date.now() + CHECK_WAIT_MS;
  const answers = new Map<number, CheckResult>();
  const unchecked = new Map<number, CheckResult>();
  for (;;) {
    const checks = await readChecks(folder);
    const open = !!checks?.pages && isRunning(checks.service);
    for (const id of check.ids) {
      if (answers.has(id)) continue;
      const result = checks?.results[id];
      // An answer to this very ask: what a page saw as the code changed, even in the same millisecond, is not.
      if (result?.answers === check.key) {
        if (result.outcome !== "unchecked" || result.anyPage || checks!.pages === 1) answers.set(id, result);
        else unchecked.set(id, result);
      } else if (!open && result?.outcome === "shown" && (!claimedAt || result.at >= claimedAt)) answers.set(id, result);
    }
    const left = check.ids.filter((id) => !answers.has(id));
    if (!left.length) return answers;
    if (!open) {
      for (const id of left) answers.set(id, { outcome: "unchecked", reason: "no page with 03Kind is open" });
      return answers;
    }
    if (Date.now() > until) {
      for (const id of left) answers.set(id, unchecked.get(id) ?? { outcome: "unchecked", reason: "the page did not answer in time" });
      return answers;
    }
    await new Promise((resolve) => setTimeout(resolve, CHECK_POLL_MS));
  }
}

function isRunning(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function finish(folder: ThirdKindFolder, io: Io): Promise<number> {
  const [state, changeSet] = await Promise.all([readState(folder), readChangeSet(folder)]);
  // The round's result is the page's (ADR 0013): it looks at every change it can once more, once the last edit has reached it.
  if (state && changeSet) {
    await askPages(folder, state, "closing", changeSet.changes.filter((change) => change.kind !== "brief").map((change) => change.id));
  }
  const result = changeSet && (await archiveRound(folder, "finished"));
  if (!result) {
    io.error(NOT_CLAIMED);
    return 1;
  }
  const ids = changeSet.changes.map((change) => change.id);
  const applied = result.applied ?? result.done;
  const notShown = ids.filter((id) => !applied.includes(id) && result.checks[id]?.outcome === "not shown");
  const missing = ids.filter((id) => !applied.includes(id) && !notShown.includes(id));
  // Shown on the layer, but at other usages of its component too (ticket 77).
  const atOtherUsages = notShown.filter((id) => ((check) => check?.outcome === "not shown" && !!check.otherUsages?.length)(result.checks[id]));
  const unshown = notShown.filter((id) => !atOtherUsages.includes(id));
  let text = `Round finished: ${applied.length} of ${changesWord(ids.length)} applied.`;
  if (missing.length) text += ` Not marked done: ${missing.join(", ")}.`;
  if (unshown.length) text += ` The page does not show: ${unshown.join(", ")}.`;
  if (atOtherUsages.length) text += ` Shown at other usages of its component too: ${atOtherUsages.join(", ")}.`;
  io.write(`${text}\n\n${reportFor(changeSet.changes, applied, result.checks)}`);
  return 0;
}

async function last(folder: ThirdKindFolder, root: string, io: Io): Promise<number> {
  const round = await readLastRound(folder);
  if (!round) {
    io.write("No earlier round of design changes to undo.\n");
    return 0;
  }
  const { code } = round.result;
  const applied = round.result.applied ?? round.result.done;
  const intro = (count: string) => {
    const text = `${count} from the round before, as the designer asked for them.`;
    if (!code) return `${text} To undo the round, take the applied ones back out of the source; those not applied never went in.`;
    const git = `git -C "${code.repository}"`;
    return (
      `${text} The code changes made while it was applied: \`${git} diff ${code.before} ${code.after}\`. ` +
      `To undo the round, take them back out: \`${git} diff --binary ${code.after} ${code.before} | ${git} apply\`. ` +
      "Check the diff first: anything else edited meanwhile is in it too."
    );
  };
  io.write(
    describeChanges(round.changeSet.changes, root, {
      heading: "Last round of design changes",
      intro,
      status: (change) => (applied.includes(change.id) ? "Applied" : "Not applied"),
    }),
  );
  return 0;
}
