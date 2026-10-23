/**
 * The change notes: the ChangeSet as Markdown written for the Agent, one
 * section per change with its kind, where it is in the source, its scope, the
 * design intent, the style that showed it on the canvas and what sets the
 * value now.
 */
import { isAbsolute, relative } from "node:path";
import type { Change, Target } from "./client/changeset";
import type { StyleSource } from "./client/style-source";
import { propertyTitle, value } from "./design-values";

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
  for (const change of list) notes += section(change, root, options.status?.(change));
  return notes;
}

const KINDS: Record<Change["kind"], string> = { style: "Style" };

function section(change: Change, root: string, status: string | undefined): string {
  const { target } = change;
  const property = propertyTitle(change.property);
  const lines = [
    ...(status ? [`**Status:** ${status}`] : []),
    `**Kind:** ${KINDS[change.kind]}`,
    `**Layer:** ${layer(target)}`,
    `**Location:** ${target.loc ? `\`${target.loc}\`` : NOT_LOCATED}`,
    `**Scope:** ${scope(target)}`,
    `**Design intent:** Change the ${property.toLowerCase()} from ${value(change.property, change.before)} to ${value(change.property, change.after)}.`,
    `**Reference style:** ${Object.entries(change.style).map(([name, css]) => `\`${name}: ${css}\``).join(", ")}`,
    `**Currently set by:** ${setBy(change.sources ?? [], root)}`,
  ];
  return `## ${change.id}. ${property}\n\n${lines.map((line) => `- ${line}\n`).join("")}\n`;
}

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
