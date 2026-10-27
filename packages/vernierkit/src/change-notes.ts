/**
 * The change notes: the ChangeSet as Markdown written for the Agent, one
 * section per change with its kind, where it is in the source, its scope, the
 * design intent, the style that showed it on the canvas and what sets the
 * value now.
 */
import { isAbsolute, relative } from "node:path";
import { madeBy, type Change, type Composed, type Dissolved, type Place, type StackSettings, type Target } from "./client/changeset";
import type { StyleSource } from "./client/style-source";
import { changeTitle, kindTitle, moveKind, ordinal, propertyName, stackSettings, value } from "./design-values";

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
  const made = change.kind === "stack" ? (change.after as Composed).place : null;
  const lines = [
    ...(status ? [`**Status:** ${status}`] : []),
    `**Kind:** ${kindTitle(change)}`,
    `**Layer:** ${made ? `a new Stack, in ${container(made)}` : layer(target)}`,
    `**Location:** ${target.made ? newLayer(target.made, list) : target.loc ? `\`${target.loc}\`` : NOT_LOCATED}`,
    `**Scope:** ${scope(target)}`,
    `**Design intent:** ${intent(change)}`,
    ...(change.asStack ? [AS_STACK] : []),
    ...(change.data ? [dataChange(target)] : []),
    ...(change.wrap ? [WRAP] : []),
    ...(change.kind === "stack" ? joinLayout(change.after as Composed) : []),
    `**Reference style:** ${style.length ? style.join(", ") : "none: only its place changes"}`,
    ...(change.kind === "style" || change.kind === "unstack" ? [`**Currently set by:** ${target.made ? "nothing yet: the layer is new" : setBy(change.sources ?? [], root)}`] : []),
  ];
  return `## ${change.id}. ${changeTitle(change)}\n\n${lines.map((line) => `- ${line}\n`).join("")}\n`;
}

function intent(change: Change): string {
  switch (change.kind) {
    case "style":
      return `Change the ${propertyName(change.property)} from ${value(change.property, change.before)} to ${value(change.property, change.after)}.`;
    case "move":
      return moveIntent(change);
    case "stack":
      return stackIntent(change.after as Composed);
    case "unstack":
      return unstackIntent(change.before as StackSettings, change.after as Dissolved);
  }
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

function dataChange({ instances }: Target): string {
  return `**Data change:** the layer is one of the ${instances} instances a loop renders, so its place comes from the order of the data the loop goes through. Reorder the data where it is written in the code; if it comes from outside the code (an API, a CMS), say so in the report.`;
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
function scope({ chain, instances, locked }: Target): string {
  if (!chain.length) return "This layer only.";
  const [own, ...outer] = chain;
  if (!outer.length && own.usage) {
    return `Change it where it is written, at Location. ${own.component}, which writes it, is used at \`${own.usage}\`, outside any other component.${instances > 1 ? ` It renders ${instances} instances, which change together.` : ""}`;
  }
  if (own.usage === null && !own.thirdParty) {
    return `**Usage not determined.** ${own.component} is used from code Vernier Kit could not locate. Change only the usage the layer is in, found from its place on the page, and leave the other usages of ${own.component} as they are.`;
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
