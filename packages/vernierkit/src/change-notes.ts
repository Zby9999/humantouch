/**
 * The change notes: the ChangeSet as Markdown written for the Agent, one
 * section per change with its kind, where it is in the source, its scope, the
 * design intent, the style that showed it on the canvas and what sets the
 * value now.
 */
import { isAbsolute, relative } from "node:path";
import { madeBy, placedAt, type Change, type Composed, type Created, type Dissolved, type Place, type StackSettings, type Target } from "./client/changeset";
import { breakpointName, mediaOf } from "./client/breakpoints";
import type { StyleSource } from "./client/style-source";
import type { Size } from "./client/edits";
import { changeTitle, kindTitle, layerName, moveKind, ordinal, propertyName, quoted, stackSettings, value } from "./design-values";

export interface NotesOptions {
  /** The notes' title. */
  heading: string;
  /** What the Agent is to do with them; `count` is "1 change", "3 changes". */
  intro(count: string): string;
  /** A status line for each change, when there is one to give. */
  status?(change: Change): string;
}

/** For a round to apply. */
export const TO_APPLY: NotesOptions = {
  heading: "Design changes to apply",
  intro: (count) =>
    `${count}, made by the designer in Vernier Kit. Apply each one to the source as the project already writes styles, and run \`npx vernierkit done <number>\` after each. When you are through them, run \`npx vernierkit finish\`.`,
};

/** "1 change", "3 changes". */
export function changes(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}

/** `root`: the project's folder, which file paths are given from. */
export function describeChanges(list: Change[], root: string, options: NotesOptions = TO_APPLY): string {
  const count = changes(list.length);
  let notes = `# ${options.heading}\n\n${options.intro(count)}\n\n`;
  for (const change of list) notes += section(change, list, root, options.status?.(change));
  return notes;
}

function section(change: Change, list: Change[], root: string, status: string | undefined): string {
  const { target } = change;
  const style = Object.entries(change.style).map(([name, css]) => `\`${name}: ${css}\``);
  const lines = [
    ...(status ? [`**Status:** ${status}`] : []),
    `**Kind:** ${kindTitle(change)}`,
    `**Layer:** ${newLayerIn(change) ?? layer(target)}`,
    `**Location:** ${target.made ? newLayer(target.made, list) : target.loc ? `\`${target.loc}\`` : NOT_LOCATED}`,
    `**Scope:** ${scope(target)}`,
    `**Breakpoint:** ${breakpoint(change)}`,
    `**Design intent:** ${intent(change, list)}`,
    ...(change.asStack ? [AS_STACK] : []),
    ...(change.data ? [dataChange(change)] : []),
    ...(change.wrap ? [WRAP] : []),
    ...(change.kind === "stack" ? [...joinLayout(change.after as Composed), ...dropMargins(change)] : []),
    ...(change.kind === "create" ? sketch(change, list) : []),
    `**Reference style:** ${change.kind === "delete" ? "none: the layer goes" : style.length ? style.join(", ") : NO_STYLE[change.kind]}`,
    ...(change.kind === "style" || change.kind === "unstack" ? [`**Currently set by:** ${target.made ? "nothing yet: the layer is new" : setBy(change.sources ?? [], root)}`] : []),
    ...(change.kind === "stack" && change.sources?.length ? [`**Currently set by** (the margins): ${setBy(change.sources, root)}`] : []),
  ];
  return `## ${change.id}. ${changeTitle(change)}\n\n${lines.map((line) => `- ${line}\n`).join("")}\n`;
}

/**
 * The widths a change applies at (ADR 0008): all of them, or the range of the
 * view it was made in, to be written with the project's own breakpoints.
 */
function breakpoint(change: Change): string {
  if (!change.breakpoint) return "all breakpoints.";
  return `${breakpointName(change.breakpoint)} only (\`@media ${mediaOf(change.breakpoint)}\`), as the designer changed it in a narrower view. Make it apply at these widths only, the way the project already writes breakpoints (Tailwind's responsive prefixes, its media queries), and leave the layer as it is at every other width. Its value before is what it showed at these widths.`;
}

/** What the designer wants of the change, in design language. */
function intent(change: Change, list: Change[]): string {
  switch (change.kind) {
    case "style":
      return `Change the ${propertyName(change.property)} from ${value(change.property, change.before)} to ${value(change.property, change.after)}.`;
    case "move":
      return moveIntent(change);
    case "stack":
      return stackIntent(change.after as Composed);
    case "unstack":
      return unstackIntent(change.before as StackSettings, change.after as Dissolved);
    case "create": {
      const { type, place, width, height, text } = change.after as Created;
      if (type === "frame") return `Add a Frame, Fixed ${width} × ${height}px, with no fill, ${placement(place)}.`;
      const wide = width === null ? "" : `, ${width}px wide`;
      return `Add text that reads ${quoted(text ?? "")}${wide}, ${placement(place)}. Give it the page's body text style, as the reference style shows, from what the page already uses for body text.`;
    }
    case "text":
      return `Change the text from ${quoted(change.before as string)} to ${quoted(change.after as string)}.`;
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
  }
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
};

/** A layer a change makes, as its Layer line names it; null for a change to a layer that is there. */
function newLayerIn(change: Change): string | null {
  if (change.kind === "stack" && (change.after as Composed).place) return `a new Stack, in ${container((change.after as Composed).place!)}`;
  if (change.kind !== "create") return null;
  const { type, place } = change.after as Created;
  return `a new ${type === "text" ? "text layer" : "Frame"}, in ${container(place)}`;
}

/** Where a layer goes in a container: a place in its layout, or absolute in it. */
function placement(place: Place): string {
  if (!place.absolute) return `in the layout of ${container(place)}, as its ${ordinal(place.nth)} layer`;
  const { x, y } = place.absolute;
  return `absolute in ${container(place)}, at X ${x}px and Y ${y}px from its top left (CSS \`left\` and \`top\`), which is to be its positioning reference (\`position: relative\`)`;
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
  const items = list.flatMap((c) => {
    const place = placedAt(c);
    if (c.kind === "stack" || place?.container.layer !== change.layer) return [];
    const made = c.kind === "create" ? (c.after as Created) : null;
    const what = made ? (made.type === "text" ? `Text ${quoted(made.text ?? "")}` : "Frame") : `${layerName(c)} (${c.kind === "move" ? "moved in" : "a copy"})`;
    let where = `${ordinal(place.nth)} in its layout`;
    if (place.absolute) where = `X ${latest(c.layer, "x", place.absolute.x)}px, Y ${latest(c.layer, "y", place.absolute.y)}px`;
    const fixed = (size: Size | undefined) => (size?.type === "fixed" ? size.value : null);
    const width = fixed(latest<Size | undefined>(c.layer, "width", undefined)) ?? made?.width ?? null;
    const height = fixed(latest<Size | undefined>(c.layer, "height", undefined)) ?? made?.height ?? null;
    const size = width === null ? "" : height === null ? `, ${width}px wide` : `, ${width} × ${height}px`;
    return [`\n  - ${what}: ${where}${size} (change ${c.id})`];
  });
  return [
    `**Brief:** ${quoted(created.brief)}. Make what it asks for in this Frame, from the project's own components and styles, laid out as the sketch shows.`,
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

/** Where a layer made this round is: in the change that makes it. */
function newLayer(made: string, list: Change[]): string {
  const maker = list.find((change) => madeBy(change) === made);
  const which = maker ? `in change ${maker.id}` : "earlier this round";
  return `**New:** the layer is made ${which}, and is not in the source yet. Apply that change first, then change it there.`;
}

/** Where a move takes the layer from, and to. */
function moveIntent(change: Change): string {
  const [before, after] = [change.before, change.after] as Place[];
  const kind = moveKind(change);
  if (kind === "Reorder") {
    return `Move it from ${ordinal(before.nth)} to ${ordinal(after.nth)} place among the layers of its container, ${container(after)}.`;
  }
  const from = before.absolute ? `out of where it is placed in ${container(before)}` : `out of the layout of ${container(before)}, where it is ${ordinal(before.nth)}`;
  if (kind === "Move") return `Move it ${from}, into the layout of ${container(after)}, as its ${ordinal(after.nth)} layer.`;
  const { x, y } = after.absolute!;
  const into = after.container.layer === before.container.layer ? "in the same Frame" : `in ${container(after)}`;
  return `Take it ${from}, and place it absolute ${into}, at X ${x}px and Y ${y}px from the Frame's top left (CSS \`left\` and \`top\`). Make the Frame its positioning reference (\`position: relative\`) if it is not one already.`;
}

/** A Stack or Frame a move takes a layer from or to, as the Agent finds it: its name and element, where it is written, and in which usage. */
function container({ container: { target } }: Place): string {
  const where = target.loc ? `at \`${target.loc}\`` : `not located, at ${target.context.path.join(" › ")} on the page`;
  const [own] = target.chain;
  const usage = own?.usage && target.chain.length > 1 ? `, in ${own.component} used at \`${own.usage}\`` : "";
  return `${target.context.path.at(-1)} (\`${target.context.element}\`, ${where}${usage})`;
}

/** What a change to one of a loop's instances alone asks of the data the loop goes through. */
function dataChange({ kind, target: { instances } }: Change): string {
  const one = `**Data change:** the layer is one of the ${instances} instances a loop renders`;
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

const WRAP = "**Wrap it:** the text has no element of its own: it runs on beside other layers in its container. Wrap it in a `<span>` and move that.";

const AS_STACK =
  "**Make it a Stack:** the layer lays its children out as plain blocks, top to bottom, which the editor shows as a vertical Stack. Make it a real Stack, a flex column (as the reference style shows), so the change applies.";

const NOT_LOCATED =
  "**Not located.** The layer carries no source marker: it may be markup outside the components (such as `index.html`) or code written without JSX. Find it in the source from its place on the page, above.";

function layer({ context }: Target): string {
  return `${context.path.at(-1)}, \`${context.element}\` (${context.path.join(" › ")})`;
}

/** Which instances the change is for: those of the usage the layer sits in. */
function scope({ chain, instances, locked, context }: Target): string {
  if (!chain.length) return "This layer only.";
  const [own, ...outer] = chain;
  if (!outer.length && own.usage) {
    return `Change it where it is written, at Location. ${own.component}, which writes it, is used at \`${own.usage}\`, outside any other component.${instances > 1 ? ` It renders ${instances} instances, which change together.` : ""}`;
  }
  if (own.usage === null && !own.thirdParty) {
    return `**Usage not determined.** ${own.component} is used from code Vernier Kit could not locate. Change only the usage the layer is in, found from its place on the page${context.page ? ` at \`${context.page}\`` : ""} (Layer, above), and leave the other usages of ${own.component} as they are.`;
  }
  const where = chain.map((level) => `${level.component} used at ${level.usage ? `\`${level.usage}\`` : "an undetermined place"}`);
  let text = `This usage only: ${where[0]}${outer.length ? `, inside ${where.slice(1).join(", inside ")}` : ""}.`;
  if (instances > 1) text += ` It renders ${instances} instances, which change together.`;
  text += ` Other usages of ${own.component} stay as they are.`;
  if (locked) text += " The layer is drawn by a dependency: change it from the usage, never inside the dependency.";
  return text;
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
