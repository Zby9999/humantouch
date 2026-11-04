/**
 * The report the Agent ends its reply with (ticket 65). The designer reads
 * only the exceptions, so every change is listed once, under one heading, and
 * each under ⚠️ says why and what was done instead. `finish` lays it out for
 * the round, each change already under the heading the page's checks put it
 * under (ADR 0013: the round's result is the page's, not the Agent's word);
 * the Skill gives its form, and its rules in the very words `finish` does.
 */
import type { Change } from "./client/changeset";
import type { OffsetInLayout } from "./client/check";
import { movedBy, PLACED_BY, SIDES, type InLayout } from "./client/checkable";
import type { Axis } from "./client/snap";
import type { CheckResult } from "./service-protocol";
import { changeTitle, otherUsagesWords, listed, otherUsagesWord, propertyName, quoted, value } from "./design-values";

/** The rules of the report, as `finish` and the Skill give them, word for word. */
export const REPORT_RULES =
  "- List every change once, under one heading only. One applied, but not exactly as asked, goes under ⚠️ alone, not under ✓ as well; more to say of one applied exactly goes on its ✓ line.\n" +
  "- Give each change under ⚠️ both lines, Why and Instead.\n" +
  "- Leave the ⚠️ section out only when every change was applied exactly. Keep each line short.\n";

/** The second line of each change under ⚠️, for the Agent to fill in. */
const INSTEAD = "  Instead: <what you did, or “left as it was”>";

/**
 * The report for a round, laid out: under ✓ the changes applied, under ⚠️
 * those the page does not show (why: what it shows instead) and those not
 * applied; the changes applied that the page cannot check stay under ✓ for
 * the Agent to move if it did not apply them exactly.
 */
export function reportFor(changes: Change[], applied: number[], checks: Record<number, CheckResult | undefined>): string {
  const line = (change: Change, what: string) => `- ${change.id}. ${changeTitle(change)}: ${what}`;
  const isApplied = (change: Change) => applied.includes(change.id);
  const notShown = (change: Change) => !isApplied(change) && checks[change.id]?.outcome === "not shown";
  // Applied, as they count once done: the page has no look at them to stand on.
  const appliedUnseen = changes.filter((change) => isApplied(change) && checks[change.id]?.outcome !== "shown");
  const ok = changes.filter(isApplied).map((change) => line(change, "<the layer, and what you changed>"));
  const warned = changes
    .filter((change) => !isApplied(change))
    .map((change) => [line(change, "<the layer>"), `  Why: ${notShown(change) ? `${pageShows(change, checks[change.id]!)}: <what keeps it so>` : "<why it is not applied>"}`, INSTEAD].join("\n"));
  const sections = [ok.length ? ["✓ Applied", ...ok].join("\n") : null, warned.length ? ["⚠️ Not applied 1:1", ...warned].join("\n") : null].filter((section) => section !== null);
  const ids = appliedUnseen.map((change) => change.id);
  const move = ids.length
    ? `- ${listed(ids)} the page cannot check: keep ${ids.length === 1 ? "it" : "each"} under ✓ if you applied it exactly as asked; if not, move it under ⚠️, with Why and Instead.\n`
    : "";
  return (
    "End your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.\n\n" +
    `\`\`\`\n${sections.join("\n\n")}\n\`\`\`\n\n${move}${REPORT_RULES}`
  );
}

/** What the page shows of a change it does not show, as the report's Why. */
function pageShows(change: Change, check: CheckResult): string {
  if (check.outcome !== "not shown") return "<why it is not applied>";
  // Shown on the layer, but at other usages of its component too (ticket 77).
  if (check.otherUsages?.length) return `the page shows it at ${otherUsagesWord(change, check.otherUsages)} too, ${otherUsagesWords(change.property, check.otherUsages, false)}`;
  const at = check.width ? `at ${check.width}px wide, ` : "";
  if (change.kind === "delete") return `${at}the layer is still on the page`;
  if (change.kind === "move") return `${at}the page does not have it where the change puts it`;
  // A new layer, not found where its change puts it, or found placed elsewhere (ticket 76).
  if (change.kind === "create") return `${at}the page does not have it where the change puts it`;
  // New words, what the layer reads on the page instead (ticket 90).
  if (change.kind === "text") return `${at}the layer reads ${quoted(check.actual as string)} on the page, not ${quoted(change.after as string)}`;
  // Where the canvas moves it in its container's layout still, by the value itself (ticket 84).
  if (PLACED_BY[change.property] && isOffsetInLayout(check.actual)) {
    const { toDo, how } = canvasOffset(change.property, change.after as number, check.actual.canvas);
    return `${at}the page does not ${toDo} the layer ${how}, as the canvas does`;
  }
  // Not placed absolute, the layer has no X, Y, right or bottom on the page to tell (ticket 80).
  if (PLACED_BY[change.property] && check.actual === null) return `${at}the layer is not placed absolute on the page`;
  if (check.actual !== null && typeof check.actual === "object" && change.margins) return `${at}the page does not draw it where the canvas does`;
  return `${at}the page shows the ${propertyName(change.property)} ${value(change.property, check.actual)}, not ${value(change.property, change.after)}`;
}

/** Whether the page's check answered how it has a layer in its container's layout, where the canvas moves it there (`OffsetInLayout`, ticket 84). */
export const isOffsetInLayout = (actual: unknown): actual is OffsetInLayout => actual !== null && typeof actual === "object" && "canvas" in actual;

/** Which way a layer placed relative is moved along each axis, as it is moved more across or down (first) or less: the way, and the way from where its container lays it out. */
const MOVED_WAY = { x: [["right", "right of"], ["left", "left of"]], y: [["down", "below"], ["up", "above"]] } as const;

/** How far a layer placed relative is moved, `moved` px across or down (`movedBy`), in words: `20px right`; `from` where its container lays it out, `20px right of` (ticket 84). */
export const movedWords = (axis: Axis, moved: number, from = false) => `${Math.abs(moved)}px ${MOVED_WAY[axis][moved > 0 ? 0 : 1][from ? 1 : 0]}`;

/**
 * What the canvas does with a layer by its X or Y, `right` or `bottom`, `to`
 * px, at a width where it has the layer in its container's layout still
 * (`canvas`, ticket 84), in words: the verb, with the layer to follow it
 * (`toDo`: "move"; `does`, said of the canvas: "moves"), and how far.
 * Relative, it moves it from where its container lays it out, a `right` or
 * `bottom` the other way, or, by 0px, leaves it unmoved there; sticky, keeps
 * it that far in from that edge of what it scrolls in.
 */
export function canvasOffset(property: string, to: number, canvas: InLayout): { toDo: string; does: string; how: string } {
  const { axis, edge } = PLACED_BY[property]!;
  if (canvas === "sticky") return { toDo: "keep", does: "keeps", how: `at least ${to}px from the ${SIDES[axis][edge]} of what it scrolls in` };
  const moved = movedBy(edge, to);
  if (!moved) return { toDo: "leave", does: "leaves", how: "unmoved in its container's layout" };
  return { toDo: "move", does: "moves", how: `${movedWords(axis, moved, true)} where its container lays it out` };
}
