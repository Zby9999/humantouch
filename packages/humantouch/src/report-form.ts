/**
 * The report the Agent ends its reply with (ticket 65). The designer reads
 * only the exceptions, so every change is listed once, under one of three
 * headings (ADR 0016, ticket 148): applied; done differently on purpose,
 * each saying why; not shown, each saying why and what was done instead.
 * `finish` lays it out for the round, each change already under the heading
 * the page's checks put it under (ADR 0013: the round's result is the
 * page's, not the Agent's word), or the Agent's `--differently`; the Skill
 * gives its form, with these headings, and its rules in the very words
 * `finish` does.
 */
import type { Change } from "./client/changeset";
import type { MarginsLeft, OffsetInLayout } from "./client/check";
import { movedBy, PLACED_BY, SIDES, type InLayout } from "./client/checkable";
import type { Axis } from "./client/snap";
import type { CheckResult } from "./service-protocol";
import { outsideIn } from "./outside-protocol";
import { adaptedIn, breaksIn } from "./widths-protocol";
import { adaptedAtWords, brokenWords, changeTitle, otherUsagesWords, listed, otherUsagesWord, outsideWords, propertyName, quoted, quotedWords, value } from "./design-values";

/** The report's headings, as `finish` and the Skill give them (ticket 148). */
export const REPORT_HEADINGS = { applied: "✓ Applied", differently: "↪ Done differently", notShown: "⚠️ Not shown" } as const;

/** The rules of the report, as `finish` and the Skill give them, word for word. */
export const REPORT_RULES =
  "- List every change once, under one heading only. One done differently on purpose (the designer asked for it otherwise, say, or it is adapted at a width) goes under ↪ alone; one applied, but not exactly as asked, under ⚠️ alone; more to say of one applied exactly goes on its ✓ line.\n" +
  "- Give each change under ↪ its Why, and each under ⚠️ both lines, Why and Instead.\n" +
  "- Leave out ↪ and ⚠️ when no change is under them. Keep each line short.\n";

/** The second line of each change under ⚠️, for the Agent to fill in. */
const INSTEAD = "  Instead: <what you did, or “left as it was”>";

/** Under ↪, the Agent's reason, for it to fill in where it gave none (`--differently`). */
const WHY_DIFFERENTLY = "<why you did it so>";

/** Where a change of the round goes in the report (ticket 148), by the page's checks and the Agent's `--differently`. */
export type ReportSection = "applied" | "differently" | "notShown";

/**
 * The section of the report `change` goes under: done differently, as the
 * Agent said (`differently`), or applied and adapted at a width (ticket
 * 147); else applied; else not shown. One whose layer breaks the layout is
 * not shown, said or not (ADR 0016: no width may break). `last` labels each
 * change by it too.
 */
export function sectionOf(id: number, applied: number[], checks: Record<number, CheckResult | undefined>, differently: Record<string, string> = {}): ReportSection {
  if (breaksIn(checks[id])?.length) return "notShown";
  if (differently[id] !== undefined) return "differently";
  if (!applied.includes(id)) return "notShown";
  return adaptedIn(checks[id])?.length ? "differently" : "applied";
}

/**
 * The report for a round, laid out: under ✓ the changes applied; under ↪
 * those done differently, why: what the page draws (at the widths it adapted
 * them at, or of those it does not show), and the Agent's reason; under ⚠️
 * the rest: those the page does not show (why: what it shows instead), and
 * those not applied. The changes applied that the page cannot check stay under ✓ for
 * the Agent to move if it did not apply them exactly.
 */
export function reportFor(changes: Change[], applied: number[], checks: Record<number, CheckResult | undefined>, differently: Record<string, string> = {}): string {
  const line = (change: Change, what: string) => `- ${change.id}. ${changeTitle(change)}: ${what}`;
  const section = (change: Change) => sectionOf(change.id, applied, checks, differently);
  const notShown = (change: Change) => checks[change.id]?.outcome === "not shown";
  // Applied, as they count once done: the page has no look at them to stand on.
  const appliedUnseen = changes.filter((change) => section(change) === "applied" && checks[change.id]?.outcome !== "shown");
  const ok = changes.filter((change) => section(change) === "applied").map((change) => line(change, "<the layer, and what you changed>"));
  const otherwise = changes
    .filter((change) => section(change) === "differently")
    .map((change) => {
      const check = checks[change.id];
      const adapted = adaptedIn(check);
      const drawn = adapted?.length ? adaptedAtWords(change, adapted, false) : notShown(change) ? pageShows(change, check!) : null;
      const why = differently[change.id] ?? WHY_DIFFERENTLY;
      return [line(change, "<the layer>"), `  Why: ${drawn ? `${drawn}: ${why}` : why}`].join("\n");
    });
  const warned = changes
    .filter((change) => section(change) === "notShown")
    .map((change) => [line(change, "<the layer>"), `  Why: ${notShown(change) ? `${pageShows(change, checks[change.id]!)}: <what keeps it so>` : "<why it is not applied>"}`, INSTEAD].join("\n"));
  const sections = ([
    [REPORT_HEADINGS.applied, ok],
    [REPORT_HEADINGS.differently, otherwise],
    [REPORT_HEADINGS.notShown, warned],
  ] as [string, string[]][])
    .filter(([, items]) => items.length)
    .map(([heading, items]) => [heading, ...items].join("\n"));
  const ids = appliedUnseen.map((change) => change.id);
  const move = ids.length
    ? `- ${listed(ids)} the page cannot check: keep ${ids.length === 1 ? "it" : "each"} under ✓ if you applied it exactly as asked; if you did it differently on purpose, move it under ↪, with Why; if you could not apply it as asked, move it under ⚠️, with Why and Instead.\n`
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
  // Shown at its breakpoint, but outside its range too (ticket 104).
  const outside = outsideIn(check);
  if (outside?.length) return `the page shows it outside its range too, ${outsideWords(change.property, outside)}`;
  // Not shown, its layer breaking the layout at a width (ticket 147, ADR 0016); at one noted late, maybe as it did before.
  const breaks = breaksIn(check);
  if (breaks?.length) {
    const late = breaks.some((one) => one.late) ? " (the page could not note every width before the code changed)" : "";
    return `the page does not show it: ${brokenWords(breaks, "the layer", false)}${late}`;
  }
  const at = check.width ? `at ${check.width}px wide, ` : "";
  if (change.kind === "delete") return `${at}the layer is still on the page`;
  if (change.kind === "move") return `${at}the page does not have it where the change puts it`;
  // A new layer, not found where its change puts it, or found placed elsewhere (ticket 76).
  if (change.kind === "create") return `${at}the page does not have it where the change puts it`;
  // New words, what the layer reads on the page instead (ticket 90).
  if (change.kind === "text") return `${at}the layer reads ${quotedWords(check.actual as string)} on the page, not ${quotedWords(change.after as string)}`;
  // Where the canvas moves it in its container's layout still, by the value itself (ticket 84).
  if (PLACED_BY[change.property] && isOffsetInLayout(check.actual)) {
    const { toDo, how } = canvasOffset(change.property, change.after as number, check.actual.canvas);
    return `${at}the page does not ${toDo} the layer ${how}, as the canvas does`;
  }
  // Not placed absolute, the layer has no X, Y, right or bottom on the page to tell (ticket 80).
  if (PLACED_BY[change.property] && check.actual === null) return `${at}the layer is not placed absolute on the page`;
  if (check.actual !== null && typeof check.actual === "object" && change.margins) return `${at}the page does not draw it where the canvas does`;
  // A gap, its layers with margins between them still (ticket 122): the room between them, those margins in it.
  if (change.property === "gap" && isMarginsLeft(check.actual)) return `${at}the room between the layers on the page is ${roomWords(check.actual)}, not ${value("gap", change.after)}: ${marginsLeftWords(check.actual)} still`;
  return `${at}the page shows the ${propertyName(change.property)} ${value(change.property, check.actual)}, not ${value(change.property, change.after)}`;
}

/** Whether a gap's check answered with margins left between its layers (`MarginsLeft`, ticket 122). */
export const isMarginsLeft = (actual: unknown): actual is MarginsLeft => actual !== null && typeof actual === "object" && "margins" in actual && "room" in actual;

/** The room between a Stack's layers its check read (`MarginsLeft`): "8px", or from the least to the most, "0px–8px". */
export const roomWords = ({ room: { min, max } }: MarginsLeft) => (min === max ? `${min}px` : `${min}px–${max}px`);

/** The margins left between a Stack's layers, in words: "Body has a margin between the layers (`margin-top: 8px`)". */
export function marginsLeftWords({ margins }: MarginsLeft): string {
  const layers = [...new Set(margins.map((margin) => margin.layer))];
  const items = layers.map((layer) => `${layer} (${margins.filter((margin) => margin.layer === layer).map(({ side, px }) => `\`${side}: ${px}px\``).join(", ")})`);
  return `${listed(items)} ${layers.length === 1 ? "has" : "have"} ${margins.length === 1 ? "a margin" : "margins"} between the layers`;
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
