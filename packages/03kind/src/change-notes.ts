/**
 * The change notes: the ChangeSet as Markdown written for the Agent, one
 * section per change with its kind, where it is in the source, its scope, the
 * design intent and the Variables it is, the style that showed it on the
 * canvas and what sets the value now.
 */
import { isAbsolute, relative } from "node:path";
import {
  drawnIn,
  madeBy,
  movedOffBy,
  placedAt,
  putBackOf,
  type Change,
  type Composed,
  type CopiedBreakpoint,
  type Created,
  type Dissolved,
  type Place,
  type PutBack,
  type StackSettings,
  type Target,
} from "./client/changeset";
import { breakpointName, mediaOf, tailwindOf, type Breakpoint } from "./client/breakpoints";
import { AUTO_MARGINS, AUTO_MARGINS_CLASS, AXIS_SIZE, AXIS_WAY, CENTERING_SIGN, centeringSides, isEndOffset, PLACED_BY, shareCss, SIDES, SIZE_AXIS, type Edge, type Share } from "./client/checkable";
import { equalColumns } from "./client/grid-tracks";
import { EDIT_STYLES_ATTR, EDIT_STYLES_ORDER, LOOK_STYLES_ATTR, LOOK_STYLES_BASE } from "./client/style-marks";
import type { StyleSource } from "./client/style-source";
import type { Size } from "./client/property-table";
import type { Axis } from "./client/snap";
import type { UsageLevel } from "./client/usage-chain";
import { variablesLine } from "./variable-notes";
import { writingRules } from "./writing-rules";
import { changeTitle, kindTitle, layerName, listed, moveKind, ordinal, propertyName, quoted, stackSettings, usagePlace, usedAt, value } from "./design-values";
import type { WhereToLook } from "./where-to-look";

export interface NotesOptions {
  /** The notes' title. */
  heading: string;
  /** What the Agent is to do with them; `count` is "1 change", "3 changes". */
  intro(count: string): string;
  /** A status line for each change, when there is one to give. */
  status?(change: Change): string;
  /** What the notes end with, after the last change, of the changes given (`list`) of the round (`round`). */
  end?(list: Change[], round: Change[]): string;
  /** The changes to give, when not all of the round: the others are only referred to (a layer one of them made, say). */
  only?: Change[];
  /** What the notes name from the project, so the Agent need not search it (ticket 101); not given, they name none of it. */
  look?: WhereToLook;
}

/** The sentence that says the designer's page is up, and checks the edits: no dev server to start, no browser to open (ticket 65). */
const PAGE_OPEN = "The designer's page and its dev server are running already, and the page checks your edits as the code changes: start no dev server, and open no browser to look. ";

/** For a round to apply; `pageOpen`: a page with 03Kind is open now, to check it; `look`: what to name from the project (ticket 101). */
export function toApply(pageOpen: boolean, look?: WhereToLook): NotesOptions {
  return {
    look,
    heading: "Design changes to apply",
    intro: (count) =>
      `${count}, made by the designer in 03Kind. Apply them to the source, in order: each section says what to change and where, and **How to write them**, after the last, how to write the kinds of change in this round and how the page checks them. ` +
      (pageOpen ? PAGE_OPEN : "") +
      "After a change, or a group of related ones, run `npx 03kind done <number> …` with their numbers: it says whether the designer's page shows each. " +
      "Run it at least once before `npx 03kind finish`, which ends the round once you are through them, and gives the form of the report to end your reply with.",
    end: (list, round) => writingRules(list, round, look),
  };
}

/** "1 change", "3 changes". */
export function changes(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}

/** `root`: the project's folder, which file paths are given from. */
export function describeChanges(list: Change[], root: string, options: NotesOptions = toApply(false)): string {
  const given = options.only ?? list;
  let notes = `# ${options.heading}\n\n${options.intro(changes(given.length))}\n\n`;
  for (const change of given) notes += section(change, list, root, options.status?.(change), options.look);
  return notes + (options.end?.(given, list) ?? "");
}

function section(change: Change, list: Change[], root: string, status: string | undefined, look: WhereToLook | undefined): string {
  const { target } = change;
  const style = Object.entries(change.style).map(([name, css]) => `\`${name}: ${css}\``);
  const lines = [
    ...(status ? [`**Status:** ${status}`] : []),
    `**Kind:** ${kindTitle(change)}`,
    `**Layer:** ${newLayerIn(change) ?? layer(target)}`,
    `**Location:** ${target.made ? (madeBefore(target, list) ? MADE_BEFORE : newLayer(target.made, list)) : target.loc ? `\`${target.loc}\`` : NOT_LOCATED}`,
    `**Scope:** ${change.scope === "component" ? componentScope(target) : scope(target, look)}`,
    `**Breakpoint:** ${breakpoint(change)}`,
    `**Design intent:** ${intent(change, list, look)}`,
    ...(change.kind === "style" ? [variablesLine(change)].filter((line) => line !== null) : []),
    ...(change.copiedBreakpoints?.length ? [copiedBreakpoints(change.copiedBreakpoints, list)] : []),
    ...(change.asStack ? [AS_STACK] : []),
    ...(change.kind === "style" ? gridNotes(change) : []),
    ...(change.data ? [dataChange(change)] : []),
    ...(change.wrap ? [change.kind === "move" ? WRAP : WRAP_TO_PLACE] : []),
    ...(change.kind === "style" && target.onlyText ? [onlyTextLine(target)] : []),
    ...(change.placedFrom ? [placementLine(change)] : []),
    ...(change.keeps ? [fragments(change)] : []),
    ...(change.kind === "stack" ? [...joinLayout(change.after as Composed), ...dropMargins(change)] : []),
    ...(change.kind === "create" ? sketch(change, list) : []),
    ...(change.kind === "brief" ? [briefLine(change, list)] : []),
    ...(change.kind === "duplicate" && change.brief ? [`**Brief:** ${quoted(change.brief)}, as the Frame it copies has it. Make what it asks for in the copy too, as in that Frame.`] : []),
    ...(change.kind === "putBack" ? putBackFrom(change.after as PutBack) : []),
    ...(change.kind === "delete" ? putBackIn(change, list) : []),
    `**Reference style:** ${change.kind === "delete" ? "none: the layer goes" : style.length ? style.join(", ") : NO_STYLE[change.kind]}`,
    ...(change.kind === "style" || change.kind === "unstack" ? [`**Currently set by:** ${madeBefore(target, list) ? "unknown: the layer was made in a round before" : target.made ? "nothing yet: the layer is new" : setBy(change.sources ?? [], root)}`] : []),
    ...(change.kind === "stack" && change.sources?.length ? [`**Currently set by** (the margins): ${setBy(change.sources, root)}`] : []),
  ];
  return `## ${change.id}. ${changeTitle(change)}\n\n${lines.map((line) => `- ${line}\n`).join("")}\n`;
}

/**
 * The widths a change applies at (ADR 0008): all of them, or the range of the
 * view it was made in, to be written with the project's own breakpoints:
 * those it was recorded with, when its edges are the project's.
 */
function breakpoint(change: Change): string {
  if (!change.breakpoint) return "all breakpoints.";
  const written = writtenAs(change.breakpoint);
  const how = written
    ? `The project writes these widths with ${written}: make the change apply at these widths only that way`
    : "Make it apply at these widths only, the way the project already writes breakpoints (Tailwind's responsive prefixes, its media queries)";
  const valueBefore = partsDiffer(change) ? "" : " Its value before is what it showed at these widths.";
  return `${breakpointName(change.breakpoint)} only (\`@media ${mediaOf(change.breakpoint)}\`), as the designer changed it in a narrower view. ${how}, and leave the layer as it is at every other width.${valueBefore}`;
}

/** Whether the page showed the layer otherwise in some part of the change's range than in another before it (ticket 65). */
function partsDiffer({ parts }: Change): boolean {
  return !!parts && new Set(parts.map((part) => JSON.stringify(part.before))).size > 1;
}

/** A change at a range whose parts showed different values: from what each showed, to the one value. */
function partByPart({ property, parts, after }: Change): string {
  const each = parts!.map(({ breakpoint, before }) => {
    const variant = tailwindOf(breakpoint);
    const written = variant ? ` (\`${variant}\`)` : "";
    return `${breakpointName(breakpoint)}${written}, from ${value(property, before)} to ${value(property, after)}`;
  });
  return `Change the ${propertyName(property)} at each part of these widths, as the page shows it now: ${each.join("; ")}.`;
}

/**
 * How the project writes a range of its own breakpoints: "Tailwind's
 * `md:max-lg:`", "its own media queries, at 768px (`(min-width: 768px)`)";
 * null for a range whose edges are not the project's.
 */
function writtenAs({ min, max, project }: Breakpoint): string | null {
  if (!project) return null;
  if ("tailwind" in project) return `Tailwind's \`${project.tailwind}\``;
  const edges = [min, max].filter((edge) => edge !== null);
  if (edges.length !== project.queries.length) return null;
  return `its own media queries, whose edges these are: ${project.queries.map((query, i) => `${edges[i]}px, where \`${query}\` starts or stops holding`).join(", and ")}`;
}

/**
 * What a copy keeps of the layer it copies at breakpoints of their own, the
 * layers in it included: each value, with the change that gave it, while that
 * change is still in the round.
 */
function copiedBreakpoints(copied: CopiedBreakpoint[], list: Change[]): string {
  const items = copied.map((copy) => {
    const on = copy.inside ? `in ${copy.inside.name} (\`${copy.inside.element}\`), ` : "";
    const stack = copy.asStack ? ", made a real Stack (a flex column) there" : "";
    const from = list.some((change) => change.id === copy.change) ? ` (change ${copy.change})` : "";
    const written = writtenAs(copy.breakpoint);
    return `\n  - ${breakpointName(copy.breakpoint)} (\`@media ${mediaOf(copy.breakpoint)}\`${written ? `, ${written}` : ""}): ${on}${propertyName(copy.property)} ${value(copy.property, copy.value)}${stack}${from}`;
  });
  return (
    "**Copied breakpoints:** the layer has values of its own at narrower breakpoints, and the copy keeps them, as the layer had them when copied. " +
    `Give the copy the same at those widths, the way the project already writes breakpoints, so it looks as the layer did in every view:${items.join("")}`
  );
}

/**
 * A brief's words; on a copy of a new Frame, with the brief it was copied
 * with, which they take the place of ("": taken off); on a usage of a
 * component given a brief as a whole, with that one, which they take the place of there.
 */
function briefLine({ before, after, target, scope }: Change, list: Change[]): string {
  const brief = after ? quoted(after as string) : "none: taken off";
  if (!before || scope === "component") return `**Brief:** ${brief}`;
  if (target.made) return `**Brief:** ${brief}, in place of the brief the copy was made with, ${quoted(before as string)}`;
  const whole = list.find((change) => change.scope === "component" && change.kind === "brief" && change.target.loc === target.loc);
  return `**Brief:** ${brief}, in place of the brief ${target.component} has as a whole${whole ? ` (change ${whole.id})` : ""}, ${quoted(before as string)}, at this usage.`;
}

/** What the designer wants of the change, in design language. */
function intent(change: Change, list: Change[], look?: WhereToLook): string {
  switch (change.kind) {
    case "style":
      if (change.property === "absolute" && change.after) return placedFreely(change);
      if (change.centeredOn) return change.placedFrom?.margins ? marginsCenteredIntent(change) : centeredIntent(change);
      if (isEndOffset(change.property)) return endOffsetIntent(change);
      if (partsDiffer(change)) return partByPart(change);
      return `Change the ${propertyName(change.property)} from ${value(change.property, change.before)} to ${value(change.property, change.after)}.`;
    case "move":
      return moveIntent(change);
    case "stack":
      return stackIntent(change.after as Composed);
    case "unstack":
      return unstackIntent(change.before as StackSettings, change.after as Dissolved);
    case "create": {
      const { type, place, width, height, text } = change.after as Created;
      if (type === "frame") return `Add a Frame, Fixed ${width} × ${height}px, with no fill, ${placement(place, placeOnceApplied(change, list))}.`;
      const wide = width === null ? "" : `, ${width}px wide`;
      return `Add text that reads ${quoted(text ?? "")}${wide}, ${placement(place, placeOnceApplied(change, list))}. Give it the page's body text style, as the reference style shows, from what the page already uses for body text${bodyText(look)}.`;
    }
    case "text":
      return `Change the text from ${quoted(change.before as string)} to ${quoted(change.after as string)}.`;
    case "brief":
      if (!change.after) return "Make this copy without what the brief it was copied with asks for: leave it a Frame as the designer drew it.";
      return (
        "Achieve what the brief asks of this layer: something the Design panel cannot set. " +
        "Do it the way the project already writes such things, within the scope given, and say in your report what you did."
      );
    case "delete": {
      const from = change.before as Place;
      // Its layers moved out first (it is ungrouped): only the layer itself goes.
      const out = list.filter((c) => c.kind === "move" && (c.before as Place).container.layer === change.layer && c.id < change.id).map((c) => c.id);
      const what = out.length ? `, once its layers are out of it (${out.length === 1 ? "change" : "changes"} ${out.join(", ")}): only the layer itself goes, not what was in it` : ", and all in it";
      return `Delete this layer${what}, from ${container(from)}, where it is ${ordinal(from.nth)}.`;
    }
    case "duplicate": {
      const to = change.after as Place;
      return `Copy this layer, with all in it, and ${to.absolute ? "place" : "put"} the copy ${placement(to)}.`;
    }
    case "putBack": {
      const { place, layer } = change.after as PutBack;
      const deletion = movedOffBy(list, layer.id);
      const how = layer.origin.snippet ? "write it as its source below has it" : "write it as its look below shows it";
      if (layer.origin.copy) {
        return (
          `Put a copy of this layer here: the off-canvas layer put back is a copy of it, so the layer it copies stays where it is. ` +
          `${capitalized(how)}, ${placement(place)}, as a copy of its own.`
        );
      }
      if (deletion) {
        return (
          `Put this layer back, moved off the canvas this round (change ${deletion.id}): its code is still where it was. ` +
          `Move that code here rather than deleting it and writing it again, ${placement(place)}.`
        );
      }
      return (
        `Put this layer back, moved off the canvas in an earlier round and deleted from the code then: ${how}, ${placement(place)}. ` +
        "Keep the source as it is; adjust it only where the code around it has changed (its props, what it imports)."
      );
    }
  }
}

/** A change to a layer's `right` or `bottom`, which it is placed from and stays placed from (ticket 75). */
function endOffsetIntent({ property, before, after }: Change): string {
  const { axis } = PLACED_BY[property]!;
  const side = SIDES[axis].end;
  return (
    `Change the ${propertyName(property)} from ${value(property, before)} to ${value(property, after)}: how far the layer's ${side} edge is from its container's, its CSS \`${side}\`. ` +
    `It stays placed from that edge: ${notByStart(axis)}.`
  );
}

/**
 * A change to where the side that places a layer centered on it does
 * (ticket 79): the share of its container it gives it, kept, and how far past
 * that, which changes, as CSS and Tailwind write it.
 */
function centeredIntent({ property, before, after, centeredOn }: Change): string {
  const { axis, edge } = PLACED_BY[property]!;
  const side = SIDES[axis][edge];
  const [from, to] = [shareCss(centeredOn!.before), shareCss(centeredOn!.after)];
  return (
    `Change where its \`${side}\` places it from \`${from}\` to \`${to}\`: ${shareWords(centeredOn!.after, axis, edge, "its container")} (Tailwind's \`${side}-[${to.replace(/ /g, "")}]\`). ` +
    `Its ${propertyName(property)} goes from ${value(property, before)} to ${value(property, after)} as the designer saw it, but write the share, not a px value: as its container grows or shrinks, it stays as far past that share of it.`
  );
}

/**
 * A change to where a layer centered between its sides by its auto margins
 * is (ticket 96): where its middle is, a share of its container and px past
 * it, which changes, and its sides, as much more and less, as CSS and
 * Tailwind write them.
 */
function marginsCenteredIntent({ property, before, after, centeredOn, style, uncenteredAt }: Change): string {
  const { axis } = PLACED_BY[property]!;
  const { start, end } = SIDES[axis];
  const [from, to] = [shareWords(centeredOn!.before, axis, "start", "its container"), shareWords(centeredOn!.after, axis, "start", "its container")];
  const written = [start, end].filter((side) => style[side]);
  const tailwind = written.map((side) => `${side}-[${style[side].replace(/ /g, "")}]`).join(" ");
  // Where a view beside does not center it so (review): its start side alone, its end side as each width has it.
  const give = uncenteredAt?.length
    ? `Give its \`${start}\` twice as much more, \`${start}: ${style[start]}\` (Tailwind's \`${tailwind}\`), keeping its \`${end}\` and its auto margins as the page has them at each width: ` +
      `where the page does not center it so, ${uncenteredAt.map(breakpointName).join(", ")}, it is placed by that \`${start}\`. `
    : `Give its \`${start}\` and \`${end}\` as much more and less, \`${start}: ${style[start]}; ${end}: ${style[end]}\` (Tailwind's \`${tailwind}\`), keeping both and its auto margins. `;
  return (
    `Move it ${AXIS_WAY[axis]}, centered between its \`${start}\` and \`${end}\` by its auto margins as it is: its middle from ${from} to ${to}. ` +
    give +
    `Its ${propertyName(property)} goes from ${value(property, before)} to ${value(property, after)} as the designer saw it, but do not write that px value with the other side \`auto\`: as its container grows or shrinks, it stays centered, as far past its middle.`
  );
}

/**
 * What a share a side gives a layer is, in words, of `container` ("its
 * container", "the Frame"): "50% of its container's width from its left
 * edge, and 20px past that", "…, less 20px".
 */
export function shareWords({ percent, px }: Share, axis: Axis, edge: Edge, container: string, where?: "there"): string {
  const past = !px ? "" : px > 0 ? `, and ${px}px past that` : `, less ${-px}px`;
  // `there`: as large as its container is at some width, said rather than its edge.
  return `${percent}% of ${container}'s ${AXIS_SIZE[axis]} ${where ?? `from its ${SIDES[axis][edge]} edge`}${past}`;
}

/** What keeps a layer placed from its container's right or bottom edge along `axis` so: its `left` or `top` left alone. */
const notByStart = (axis: Axis) => `do not place it by \`${SIDES[axis].start}\` instead`;

/**
 * How a layer whose width or height changes is placed that way, when not from
 * its container's left or top edge (ticket 75): it stays placed so.
 */
function placementLine({ property, placedFrom }: Change): string {
  const sized = SIZE_AXIS[property];
  const axis = sized ?? PLACED_BY[property]!.axis;
  if (placedFrom!.margins) {
    // Between its sides, by its auto margins (ticket 96): moved, its sides change as much one way as the other.
    const { start, end } = SIDES[axis];
    const only = sized ? `only its ${property} changes, on both sides alike` : "keep both sides and the auto margins, only how far past the middle it is changes";
    return `**Placement:** the layer is centered ${AXIS_WAY[axis]} between its \`${start}\` and \`${end}\` by its auto margins (\`${AUTO_MARGINS[axis]}\`, Tailwind's \`${AUTO_MARGINS_CLASS[axis]}\`), and stays so: ${only}.`;
  }
  if (placedFrom!.centered) {
    // On where the side it is placed by places it: moved back half its size from a `left` or `top`, forward from a `right` or `bottom`.
    const [side, back] = [SIDES[axis][placedFrom!.edge], CENTERING_SIGN[placedFrom!.edge]];
    // Moved (ticket 79): the side keeps its share of the container.
    const only = sized ? `only its ${property} changes, on both sides alike` : "keep the translate and the share, only how far past it changes";
    return `**Placement:** the layer is centered ${AXIS_WAY[axis]} on where its \`${side}\` places it, by \`translate: ${back}50%\` (Tailwind's \`${back}translate-${axis}-1/2\`), and stays so: ${only}.`;
  }
  const side = SIDES[axis].end;
  return `**Placement:** the layer is placed from its container's ${side} edge (CSS \`${side}\`), and stays so: ${notByStart(axis)}.`;
}

/**
 * A layer in its container's layout placed freely in a narrower view, at
 * that breakpoint only (the `absolute` property): absolute where it was put,
 * at the size it had in the layout there, which keeps it as large.
 */
function placedFreely({ after, style }: Change): string {
  const { x, y } = after as { x: number; y: number };
  const [width, height] = [style.width, style.height].map((size) => Math.round(parseFloat(size ?? "")));
  const size = Number.isFinite(width) && Number.isFinite(height) ? ` (Fixed ${width} × ${height}px, as the reference style shows)` : "";
  return (
    `Take this layer out of its container's layout and place it absolute in it, at X ${x}px and Y ${y}px from its top left (CSS \`left\` and \`top\`), ` +
    `at the size it has there now${size}. Make the container its positioning reference at these widths (\`position: relative\`) if it is not one already.`
  );
}

/**
 * What a change to a Grid's columns or gaps asks besides its value: columns
 * of equal shares, and the gap between rows and the one between columns set apart.
 */
function gridNotes({ property, after }: Change): string[] {
  if (property === "columns") {
    return [
      `**Equal columns:** each column takes an equal share of the Grid's width, as \`grid-template-columns: ${equalColumns(after as number)}\` does (Tailwind's \`grid-cols-${after}\`). ` +
        "Where its columns are sized some other way now, they become equal.",
    ];
  }
  if (property !== "rowGap" && property !== "columnGap") return [];
  const [these, those] = property === "rowGap" ? ["rows", "columns"] : ["columns", "rows"];
  return [
    `**Gap apart:** only the space between the Grid's ${these} changes, not the space between its ${those}. ` +
      "Where one value sets both now (Tailwind's `gap-*`, CSS `gap`), set them apart: `gap-y-*` and `gap-x-*` in Tailwind, `row-gap` and `column-gap` in CSS.",
  ];
}

/** The reference style of a change that declares none, by kind. */
const NO_STYLE: Record<Change["kind"], string> = {
  style: "none",
  move: "none: only its place changes",
  stack: "none",
  unstack: "none",
  create: "none",
  text: "none: only its words change",
  delete: "none: the layer goes",
  duplicate: "none: the copy is as the layer is",
  putBack: "none: it is to look as its look shows",
  brief: "none: a brief is the designer's words, not a style",
};

/**
 * Where a layer put back comes from (ADR 0009): its source as it was written
 * when moved off the canvas, its look there, and what was edited there.
 */
function putBackFrom({ layer }: PutBack): string[] {
  const { snippet } = layer.origin;
  const source = snippet
    ? `**Source**, as written at \`${snippet.loc}\` when it was moved off the canvas:\n\n${fenced(snippet.code, /\.([cm]?[jt]sx?)$/.exec(snippet.loc.replace(/:\d+:\d+$/, ""))?.[1] ?? "tsx")}`
    : layer.origin.written
      ? `**Source:** not kept: it could not be read at \`${layer.origin.written}\` when the layer was moved off the canvas. Write it from its look, below, as the project writes markup and styles.`
      : "**Source:** not kept: the layer had no source of its own when moved off the canvas. Write it from its look, below, as the project writes markup and styles.";
  const look =
    "**Look**, as it was off the canvas, every style it had written onto it (its classes as they were, in `data-tk-class`). " +
    "Where its classes no longer give it this look, their rules gone with its code, give it the styles that do, as the project writes styles:\n\n" +
    fenced(lookOf(layer.look), "html");
  const edits = layer.edits.changes.map((edit) => `\n  - ${changeTitle(edit)} of ${layerName(edit)} (\`${edit.target.context.element}\`): ${intent(edit, layer.edits.changes)}`);
  return [source, look, ...(edits.length ? [`**Edited off the canvas:** give it these too, as the designer made them there:${edits.join("")}`] : [])];
}

/** A deletion that moved a layer off the canvas this round, and put it back this round too: the code moves, rather than going. */
function putBackIn(change: Change, list: Change[]): string[] {
  const back = change.offCanvas && putBackOf(list, change.offCanvas);
  return back ? [`**Put back:** the layer was moved off the canvas and is put back in change ${back.id}. Do not delete its code: move it to where change ${back.id} puts it.`] : [];
}

/**
 * A frozen look as the notes give it: its markup and its own styles, not the
 * page's stylesheets and fonts it loaded only to look as the page does.
 */
function lookOf(look: string): string {
  return (
    look
      .replace(/^<!DOCTYPE[^>]*>/i, "")
      // What lays the document out around it, and orders the editor's own styles.
      .replace(new RegExp(`<style (${LOOK_STYLES_ATTR}="${LOOK_STYLES_BASE}"|${EDIT_STYLES_ATTR}="${EDIT_STYLES_ORDER}")>[^<]*</style>`, "g"), "")
      .replace(/@import url\("(?:[^"\\]|\\.)*"\) layer\(page\);/g, "")
      .replace(/@font-face\s*\{[^}]*\}/g, "")
      .trim()
  );
}

/** `code` as a fenced block, inside a list item. */
function fenced(code: string, language: string): string {
  return ["```" + language, ...code.split("\n"), "```"].map((line) => `  ${line}`).join("\n");
}

/** A layer a change makes, as its Layer line names it; null for a change to a layer that is there. */
function newLayerIn(change: Change): string | null {
  if (change.kind === "putBack") {
    const { place, layer } = change.after as PutBack;
    const { context } = layer.origin.target;
    return `${context.path.at(-1)}, \`${context.element}\`, moved off the canvas, put back in ${container(place)}`;
  }
  if (change.kind === "stack" && (change.after as Composed).place) return `a new Stack, in ${container((change.after as Composed).place!)}`;
  if (change.kind !== "create") return null;
  const { type, place } = change.after as Created;
  return `a new ${type === "text" ? "text layer" : "Frame"}, in ${container(place)}`;
}

/** In a Grid, the cell a place in its layout is: its cells are filled in the order of its layers. */
function cell(place: Place): string {
  return place.container.grid ? `: the Grid's ${ordinal(place.nth)} cell` : "";
}

/**
 * Where a layer goes in a container: a place in its layout, or absolute in it.
 * `onceApplied`: a new layer's place in the layout once the round is applied,
 * when that is known (`placeOnceApplied`), else its place as made.
 */
function placement(place: Place, onceApplied: PlaceOnceApplied | null = null): string {
  if (!place.absolute) {
    const nth = onceApplied?.nth ?? place.nth;
    const asApplied = onceApplied?.others ? ", once all of this round's changes are applied" : "";
    return `in the layout of ${container(place)}, as its ${ordinal(nth)} layer${cell({ ...place, nth })}${asApplied}`;
  }
  // The container is the positioning reference, not the layer: "which is to be" read as the layer was taken for both (ticket 76).
  return (
    `absolute in ${container(place)}, at ${absoluteWhere(place.absolute, "container")}; ` +
    "the container, not this layer, is the positioning reference: give the container `position: relative` if it has none"
  );
}

/**
 * A new layer's place in its container's layout once all of its round is
 * applied (ticket 81), and whether another change of the round puts a layer
 * into that layout, takes one out or moves one in it (`others`), so that the
 * place with the round applied or not could differ: the notes then say which
 * it is, and the Agent need not work it out. An Agent left to count went
 * looking in the package for how the page counts.
 */
interface PlaceOnceApplied {
  nth: number;
  others: boolean;
}

/**
 * Where the layer `maker` makes in its container's layout is once the round
 * is applied: its place as made, moved along by each later change that takes
 * a layer before it out of the container or puts one in before it. Null for
 * a layer placed absolute, and for one a later change takes elsewhere itself
 * (a move of it, a Stack made of it), or whose container a later change
 * dissolves: its own change says where it goes then.
 */
function placeOnceApplied(maker: Change, list: Change[]): PlaceOnceApplied | null {
  const { place } = maker.after as Created;
  if (place.absolute) return null;
  const id = place.container.layer;
  const into = ({ place: at }: Placed) => !!at && at.container.layer === id;
  let nth = place.nth;
  let others = false;
  for (const change of list) {
    if (change === maker) continue;
    const { takenOut, putIn } = layoutChanges(change);
    if (takenOut.some(into) || putIn.some(into)) others = true;
    if (change.id < maker.id) continue;
    const members = change.kind === "stack" ? (change.after as Composed).layers.map((member) => member.layer) : [];
    if ((change.kind === "move" || change.kind === "delete") && change.layer === maker.layer) return null;
    if (members.includes(maker.layer) || (change.kind === "unstack" && change.layer === id)) return null;
    nth -= takenOut.filter((one) => into(one) && one.place.nth < nth).length;
    nth += putIn.filter((one) => into(one) && one.place.nth <= nth).length;
  }
  return { nth, others };
}

/**
 * The layers in the layout of `frame`, a Frame made this round, once the
 * round is applied, in order: each change that puts a layer in it or takes
 * one out, in the order of the ChangeSet, at the place it records. With
 * nothing in it to begin with, every layer drawn, put back, copied or moved
 * into it has a place of its own, the sketch saying them all as one round
 * applied (ticket 81). A layer moved twice is recorded once, by the id of its
 * first move, at the place of its last: counted where that id comes, it may
 * be a place off.
 */
function layoutOnceApplied(frame: string, list: Change[]): string[] {
  const layers: string[] = [];
  for (const change of list) {
    const { takenOut, putIn } = layoutChanges(change);
    for (const { layer, place } of takenOut) if (place?.container.layer === frame && layers.includes(layer)) layers.splice(layers.indexOf(layer), 1);
    for (const { layer, place } of putIn) if (place.container.layer === frame) layers.splice(Math.min(place.nth - 1, layers.length), 0, layer);
  }
  return layers;
}

/** A layer a change takes out of a place, or puts in one. */
interface Placed {
  layer: string;
  place: Place;
}

/**
 * The layers a change takes out of their places (`takenOut`) and puts in
 * places (`putIn`, where `placedAt` says), as it records them: each counted
 * on the canvas as it was then, those it takes out gone before it puts one in.
 */
function layoutChanges(change: Change): { takenOut: Placed[]; putIn: Placed[] } {
  const put = placedAt(change);
  const putIn = put ? [{ layer: change.layer, place: put }] : [];
  if (change.kind === "delete" || change.kind === "move") return { takenOut: [{ layer: change.layer, place: change.before as Place }], putIn };
  // A Stack made where its layers were takes them out of their places; one made of a Frame's own layers puts none in.
  if (change.kind === "stack" && put) return { takenOut: (change.after as Composed).layers.map((member) => ({ layer: member.layer, place: member.from })), putIn };
  return { takenOut: [], putIn };
}

/**
 * Where a layer placed absolute is: its X and Y from its container's top
 * left (`whose`: the container, or the Frame). Placed otherwise along an axis
 * (ticket 79), by the side that places it so, as the layer is placed now.
 */
function absoluteWhere({ x, y, placed }: NonNullable<Place["absolute"]>, whose: string): string {
  if (!placed) return `X ${x}px and Y ${y}px from the ${whose}'s top left (CSS \`left\` and \`top\`)`;
  // The container named on each axis, as for both at once: "its" would read as the layer's (ticket 76).
  const whereOnAxis = (axis: Axis, at: number) => {
    const how = placed[axis];
    const { start, end } = SIDES[axis];
    if (!how) return `${axis.toUpperCase()} ${at}px from the ${whose}'s ${start} edge (CSS \`${start}\`)`;
    if (!how.centered) return `${how.px}px from the ${whose}'s ${end} edge (CSS \`${end}\`, placed from that edge as the layer is now: not by \`${start}\`)`;
    if (how.margins) {
      const sides = centeringSides(how);
      return (
        `centered ${AXIS_WAY[axis]} between \`${start}: ${shareCss(sides.start)}\` and \`${end}: ${shareCss(sides.end)}\` by its auto margins ` +
        `(its middle at ${shareWords(how, axis, "start", `the ${whose}`)}, with its \`${AUTO_MARGINS[axis]}\` kept, as the layer is now)`
      );
    }
    const side = SIDES[axis][how.edge];
    return (
      `centered ${AXIS_WAY[axis]} on \`${side}: ${shareCss(how)}\` ` +
      `(${shareWords(how, axis, how.edge, `the ${whose}`)}, with its \`translate: ${CENTERING_SIGN[how.edge]}50%\` kept, as the layer is now)`
    );
  };
  return `${whereOnAxis("x", x)} and ${whereOnAxis("y", y)}`;
}

/**
 * A new Frame's brief, and the layers drawn in it as a sketch of the layout;
 * or, for a layer drawn in a new Frame with a brief, that it is part of that sketch.
 */
function sketch(change: Change, list: Change[]): string[] {
  const created = change.after as Created;
  const frame = list.find((c) => c.kind === "create" && c.layer === created.place.container.layer);
  if (frame && (frame.after as Created).brief) {
    return [`**Sketch:** this layer is drawn in the Frame of change ${frame.id} as part of its sketch: follow the brief, with it as a guide to the layout, rather than writing it as it is.`];
  }
  if (!created.brief) return [];
  // Each layer as it is now: moved or resized since it was drawn, it is where the later changes put it.
  const latest = <T>(layer: string, property: string, then: T) =>
    (list.find((c) => c.kind === "style" && c.layer === layer && c.property === property && !c.breakpoint)?.after as T) ?? then;
  // Where each is in the layout once the round is applied, as a new layer's place is said (ticket 81); one taken out again, where it was put.
  const laidOut = layoutOnceApplied(change.layer, list);
  const items = drawnIn(change.layer, list).map((c) => {
    const place = placedAt(c)!;
    const made = c.kind === "create" ? (c.after as Created) : null;
    const what = made ? (made.type === "text" ? `Text ${quoted(made.text ?? "")}` : "Frame") : `${layerName(c)} (${c.kind === "move" ? "moved in" : c.kind === "putBack" ? "put back" : "a copy"})`;
    const at = laidOut.indexOf(c.layer);
    let where = `${ordinal(at === -1 ? place.nth : at + 1)} in its layout`;
    if (place.absolute) where = `X ${latest(c.layer, "x", place.absolute.x)}px, Y ${latest(c.layer, "y", place.absolute.y)}px`;
    const fixed = (size: Size | undefined) => (size?.type === "fixed" ? size.value : null);
    const width = fixed(latest<Size | undefined>(c.layer, "width", undefined)) ?? made?.width ?? null;
    const height = fixed(latest<Size | undefined>(c.layer, "height", undefined)) ?? made?.height ?? null;
    const size = width === null ? "" : height === null ? `, ${width}px wide` : `, ${width} × ${height}px`;
    return `\n  - ${what}: ${where}${size} (change ${c.id})`;
  });
  // With nothing drawn in the Frame, no sketch is named: an Agent told of one went looking for it (ticket 65).
  const layout = items.length ? "laid out as the sketch shows." : "laid out within its size as the brief says: the designer drew nothing in it.";
  return [
    `**Brief:** ${quoted(created.brief)}. Make what it asks for in this Frame, from the project's own components and styles, ${layout}`,
    ...(items.length ? [`**Sketch:** what the designer drew in the Frame, from its top left, shows the layout they have in mind:${items.join("")}`] : []),
  ];
}

/** The layers a Stack is made of, in order, how it lays them out, and where it goes. */
function stackIntent(composed: Composed): string {
  const { place, layers } = composed;
  const items = layers.map(({ target }, i) => `\n  ${i + 1}. ${member(target)}`).join("");
  if (!place) {
    const count = layers.length === 1 ? "1 layer goes" : `${layers.length} layers go`;
    return `Make this Frame a Stack: ${stackSettings(composed)}. Its ${count} in its layout, in this order:${items}`;
  }
  const these = layers.length === 1 ? "this layer" : `these ${layers.length} layers, in this order,`;
  const where = place.absolute
    ? `Place it absolute in ${container(place)}, at X ${place.absolute.x}px and Y ${place.absolute.y}px from the Frame's top left (CSS \`left\` and \`top\`).`
    : `Put it in the layout of ${container(place)}, as its ${ordinal(place.nth)} layer, where the first of them was.`;
  return `Wrap ${these} in a new Stack: ${stackSettings(composed)}. ${where}${items}`;
}

/** The layers of a new Stack that are absolute now, and lose it. */
function joinLayout({ layers }: Composed): string[] {
  const absolute = layers.filter(({ from }) => from.absolute).length;
  if (!absolute) return [];
  const which = absolute === layers.length ? "the layers are" : `${absolute} of the layers are`;
  return [`**Join the layout:** ${which} placed absolute now. In the Stack, they are laid out by it: take their absolute positioning off.`];
}

/** The layers of a Stack that have margins now, and lose them: its gap and padding hold that room, the Stack none. */
function dropMargins(change: Change): string[] {
  const { layers, place } = change.after as Composed;
  const margined = layers.filter((member) => member.unmargined).map(({ target }) => target.context.path.at(-1));
  if (!margined.length) return [];
  const room = place ? "the room between them is its gap, and the Stack has no margin" : "the room between them is its gap, and the room around them its padding";
  return [`**Drop the margins:** ${margined.join(", ")} ${margined.length === 1 ? "has" : "have"} margins now. In the Stack, ${room}: take their margins off.`];
}

/** The Stack as it was, the Frame it becomes, and where each of its layers is placed. */
function unstackIntent(before: StackSettings, { width, height, layers }: Dissolved): string {
  const items = layers.map(({ target, x, y, width, height }, i) => `\n  ${i + 1}. ${member(target)}: X ${x}px, Y ${y}px, ${width} × ${height}px`).join("");
  return (
    `Dissolve this Stack (${stackSettings(before)}): make it a Frame, Fixed ${width} × ${height}px, that is the positioning reference of its layers (\`position: relative\`), ` +
    `and place each of its layers absolute where it is, at its size (CSS \`left\` and \`top\` from the Frame's top left):${items}`
  );
}

/** A layer a Stack is made of or dissolved into, as the Agent finds it. */
function member(target: Target): string {
  return `${target.context.path.at(-1)} (\`${target.context.element}\`, ${target.loc ? `at \`${target.loc}\`` : "not located"})`;
}

/**
 * A layer made by no change of this round, so by one of a round before,
 * applied then (ticket 68): the canvas came back with it, as a round ended
 * with changes left, and still has it once they are all discarded. The code
 * has it now; the canvas has no marker of the source for it. A layer made
 * this round always has its maker in the round: a change to it goes when the
 * change that makes it goes (`withDependents`).
 */
function madeBefore(target: Target, list: Change[]): boolean {
  return !!target.made && !list.some((change) => madeBy(change) === target.made);
}

const MADE_BEFORE =
  "**Made in a round before.** The layer was made by a change of an earlier round, applied then: it is in the source now, but the canvas has no source marker for it. Find it in the source from its place on the page, above.";

/** Where a layer made this round is: in the change that makes it, which the round has (`madeBefore`). */
function newLayer(made: string, list: Change[]): string {
  const maker = list.find((change) => madeBy(change) === made)!;
  return `**New:** the layer is made in change ${maker.id}, and is not in the source yet. Apply that change first, then change it there.`;
}

/** Where a move takes the layer from, and to. */
function moveIntent(change: Change): string {
  const [before, after] = [change.before, change.after] as Place[];
  const kind = moveKind(change);
  if (kind === "Reorder" && after.container.grid) {
    return (
      `Move it from the ${ordinal(before.nth)} to the ${ordinal(after.nth)} cell of its container, ${container(after)}: ` +
      `the Grid fills its cells in the order its layers are written, so it is ${ordinal(after.nth)} among them; the layers between move a cell along.`
    );
  }
  if (kind === "Reorder") {
    return `Move it from ${ordinal(before.nth)} to ${ordinal(after.nth)} place among the layers of its container, ${container(after)}.`;
  }
  const from = before.absolute ? `out of where it is placed in ${container(before)}` : `out of the layout of ${container(before)}, where it is ${ordinal(before.nth)}`;
  if (kind === "Move") return `Move it ${from}, into the layout of ${container(after)}, as its ${ordinal(after.nth)} layer${cell(after)}.`;
  const into = after.container.layer === before.container.layer ? "in the same Frame" : `in ${container(after)}`;
  return `Take it ${from}, and place it absolute ${into}, at ${absoluteWhere(after.absolute!, "Frame")}. Make the Frame its positioning reference (\`position: relative\`) if it is not one already.`;
}

/**
 * A Stack or Frame a move takes a layer from or to, or a layer is made in, as
 * the Agent finds it: its name and element, and, `located`, where it is
 * written, and in which usage.
 */
export function container({ container: { target } }: Place, located = true): string {
  if (!located) return `${target.context.path.at(-1)} (\`${target.context.element}\`)`;
  const where = target.loc ? `at \`${target.loc}\`` : `not located, at ${target.context.path.join(" › ")} on the page`;
  const [own] = target.chain;
  const usage = own?.usage && target.chain.length > 1 ? `, in ${own.component} used at \`${own.usage}\`` : "";
  return `${target.context.path.at(-1)} (\`${target.context.element}\`, ${where}${usage})`;
}

/** What a change to one of a loop's instances alone asks of the data the loop goes through. */
function dataChange({ kind, target: { instances }, instance }: Change): string {
  const which = instance ? `, the ${ordinal(instance.nth)} of them${instance.words ? `, which reads ${quoted(instance.words)}` : ""}` : "";
  const one = `**Data change:** the layer is one of the ${instances} instances a loop renders${which}`;
  const outside = "if the data comes from outside the code (an API, a CMS), say so in the report.";
  if (kind === "text") return `${one}, each with words of its own: they come from the data the loop goes through. Change them there; ${outside}`;
  if (kind === "delete") return `${one}: take its item out of the data the loop goes through. ${capitalized(outside)}`;
  if (kind === "duplicate") return `${one}: add an item to the data the loop goes through, a copy of this one's, at the place given. ${capitalized(outside)}`;
  return `${one}, so its place comes from the order of the data the loop goes through. Reorder the data where it is written in the code; ${outside}`;
}

/** A sentence's first letter in capitals. */
function capitalized(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}

/** A change to a text layer whose inline fragments do not all follow it: those that keep a value of their own. */
function fragments({ property, keeps }: Change): string {
  const kept = keeps!.map(({ element, text, value: own }) => `${quoted(text)} (\`${element}\`, ${value(property, own)})`);
  return `**Inline fragments:** make the change on the text layer as a whole: the bold runs, links and other fragments in it follow it. These have a ${propertyName(property)} of their own, which they keep: ${kept.join(", ")}.`;
}

const WRAP = "**Wrap it:** the text has no element of its own: it runs on beside other layers in its container. Wrap it in a `<span>` and move that.";
/** Loose text placed freely at a breakpoint: it needs an element to place. */
const WRAP_TO_PLACE = "**Wrap it:** the text has no element of its own: it runs on beside other layers in its container. Wrap it in a `<span>`, at every width, and place that.";

const AS_STACK =
  "**Make it a Stack:** the layer lays its children out as plain blocks, top to bottom, which the editor shows as a vertical Stack. Make it a real Stack, a flex column (as the reference style shows), so the change applies.";

const NOT_LOCATED =
  "**Not located.** The layer carries no source marker: it may be markup outside the components (such as `index.html`) or code written without JSX. Find it in the source from its place on the page, above.";

function layer({ context, onlyText }: Target): string {
  const name = context.path.at(-1);
  // The only text of a Frame, as a button's words are, is written in the Frame's element.
  return `${onlyText ? `${name}, the text in ${context.path.at(-2)}, ` : `${name}, `}\`${context.element}\` (${context.path.join(" › ")})`;
}

/** The styles of a Frame's only text are the Frame's element's, which the text inherits. */
function onlyTextLine({ context }: Target): string {
  const frame = context.path.at(-2);
  return `**The Frame's only text:** the text is all ${frame} draws inside it, and has no element of its own: write its text styles on ${frame}'s element itself, whose words inherit them, with no element around the text.`;
}

/**
 * Where the page's body text style is set, as `look` found it (ticket 101):
 * the rules and the `className` of `<body>` that set it, or nothing; not
 * looked for, nothing said.
 */
function bodyText(look: WhereToLook | undefined): string {
  const places = look?.bodyText;
  if (!places) return "";
  if (!places.length) return ": nothing in the project's source sets it, on `body` or `html`";
  return `: ${listed(places.map(({ selector, at }) => (selector === null ? `the \`className\` of \`<body>\` at \`${at}\`` : `the rule \`${selector}\` at \`${at}\``)))}`;
}

/** How many other usages of a component the notes name, at most; the rest are counted, by file (ticket 101). */
const USAGES_NAMED = 3;

/**
 * That the other usages of `component` stay as they are, and, as `look` found
 * them in the source (ticket 101), where they are: none, when `usage` is the
 * only one. Not named when the source does not have `usage` itself, as the
 * page names it: the source is not as the page has it, or uses the component
 * by another name.
 */
function otherUsages({ component, usage }: UsageLevel, look: WhereToLook | undefined): string {
  const said = `Other usages of ${component} stay as they are`;
  const all = look?.usages[component];
  if (!all || !usage || !all.includes(usage)) return `${said}.`;
  const others = all.filter((place) => place !== usage);
  if (!others.length) return `${component} has no other usage in the source.`;
  const code = (text: string) => `\`${text}\``;
  if (others.length <= USAGES_NAMED) return `${said}: ${listed(others.map(code))}.`;
  const rest = others.slice(USAGES_NAMED);
  const files = [...new Set(rest.map((place) => place.replace(/(:\d+)+$/, "")))];
  const where = files.length <= USAGES_NAMED ? listed(files.map(code)) : `${files.length} files`;
  return `${said}: ${others.slice(0, USAGES_NAMED).map(code).join(", ")} and ${rest.length} more, in ${where}.`;
}

/** Which instances the change is for: those of the usage the layer sits in. */
function scope({ chain, instances, locked, context }: Target, look?: WhereToLook): string {
  if (!chain.length) return "This layer only.";
  const [own, ...outer] = chain;
  if (!outer.length && own.usage) {
    return `Change it where it is written, at Location. ${own.component}, which writes it, is used at \`${own.usage}\`, outside any other component.${instances > 1 ? ` It renders ${instances} instances, which change together.` : ""}`;
  }
  if (own.usage === null && !own.thirdParty) {
    return `**Usage not determined.** ${own.component} is used from code 03Kind could not locate. Change only the usage the layer is in, found from its place on the page${context.page ? ` at \`${context.page}\`` : ""} (Layer, above), and leave the other usages of ${own.component} as they are.`;
  }
  const where = chain.map(usedAt);
  let text = `This usage only: ${where[0]}${outer.length ? `, inside ${where.slice(1).join(", inside ")}` : ""}.`;
  if (instances > 1) text += ` It renders ${instances} instances, which change together.`;
  text += ` ${otherUsages(own, look)}`;
  if (locked) text += " The layer is drawn by a dependency: change it from the usage, never inside the dependency.";
  return text;
}

/**
 * A change promoted to the component itself: its name and where it writes
 * the layer, to be changed there, for every usage; and the usage it was made on.
 */
function componentScope({ chain, loc }: Target): string {
  const [own, ...outer] = chain;
  const where = [usagePlace(own.usage), ...outer.map(usedAt)];
  return (
    `The component itself: ${own.component}. Change ${own.component} where it writes the layer, at Location (\`${loc}\`), so every usage of ${own.component} shows it, ` +
    `not only the usage the designer made it on (${where.join(", inside ")}). Changes listed for one usage only stay with that usage.`
  );
}

/** What sets the value now, so the Agent knows which class or rule to change; per property when it differs. */
function setBy(sources: StyleSource[], root: string): string {
  if (!sources.length) return "unknown";
  const one = (source: StyleSource) => {
    if (source.kind === "none") return "nothing: the browser default applies";
    if (source.kind === "unknown") return "unknown: no readable style sets it, but a stylesheet from another origin may";
    const declaration = source.declaration && `\`${source.declaration}${source.important ? " !important" : ""}\``;
    if (source.kind === "inline") return `the element's style attribute, ${declaration}`;
    let text = `rule \`${source.selector}\` ${source.layer ? `in CSS layer \`${source.layer}\`` : "in no CSS layer"}`;
    if (source.file) text += `${source.layer ? "" : ","} of \`${projectPath(source.file, root)}\``;
    if (source.className) text = `class \`${source.className}\`: ${text}`;
    return `${text}, ${declaration}`;
  };
  if (sources.length === 1) return one(sources[0]);
  return sources.map((source) => `${source.properties.map((p) => `\`${p}\``).join(", ")}: ${one(source)}`).join("; ");
}

/** A stylesheet's file as the dev server names it (a path, or a URL), from the project's folder. */
function projectPath(file: string, root: string): string {
  const path = file.replace(/[?#].*$/, "");
  if (/^[a-z]+:\/\//i.test(path)) return new URL(path).pathname.replace(/^\//, "");
  return isAbsolute(path) && !relative(root, path).startsWith("..") ? relative(root, path) : path;
}
