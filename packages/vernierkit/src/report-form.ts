/**
 * The report the Agent ends its reply with (ticket 65). The designer reads
 * only the exceptions, so every change is listed once, under one heading, and
 * each under ⚠️ says why and what was done instead. `finish` lays it out for
 * the round, each change already under the heading the page's checks put it
 * under (ADR 0013: the round's result is the page's, not the Agent's word);
 * the Skill gives its form, and its rules in the very words `finish` does.
 */
import type { Change } from "./client/changeset";
import type { CheckResult } from "./service-protocol";
import { changeTitle, listed, propertyName, value } from "./design-values";

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
  const at = check.width ? `at ${check.width}px wide, ` : "";
  if (change.kind === "delete") return `${at}the layer is still on the page`;
  if (change.kind === "move") return `${at}the page does not have it where the change puts it`;
  if (check.actual !== null && typeof check.actual === "object" && change.margins) return `${at}the page does not draw it where the canvas does`;
  return `${at}the page shows the ${propertyName(change.property)} ${value(change.property, check.actual)}, not ${value(change.property, change.after)}`;
}
