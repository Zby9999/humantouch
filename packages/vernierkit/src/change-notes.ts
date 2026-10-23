/**
 * The change notes: the ChangeSet as Markdown written for the Agent, one
 * section per change with its kind, where it is in the source, its scope, the
 * design intent and the style that showed it on the canvas.
 */
import type { Change, Target } from "./client/changeset";
import type { Fill, Radius } from "./client/edits";

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

export function describeChanges(changes: Change[], options: NotesOptions = TO_APPLY): string {
  const count = changes.length === 1 ? "1 change" : `${changes.length} changes`;
  let notes = `# ${options.heading}\n\n${options.intro(count)}\n\n`;
  for (const change of changes) notes += section(change, options.status?.(change));
  return notes;
}

const KINDS: Record<Change["kind"], string> = { style: "Style" };
const PROPERTIES: Record<string, string> = { fill: "Fill", radius: "Corner radius" };

function section(change: Change, status: string | undefined): string {
  const { target } = change;
  const property = PROPERTIES[change.property] ?? change.property;
  const lines = [
    ...(status ? [`**Status:** ${status}`] : []),
    `**Kind:** ${KINDS[change.kind]}`,
    `**Layer:** ${layer(target)}`,
    `**Location:** ${target.loc ? `\`${target.loc}\`` : NOT_LOCATED}`,
    `**Scope:** ${scope(target)}`,
    `**Design intent:** Change the ${property.toLowerCase()} from ${value(change.property, change.before)} to ${value(change.property, change.after)}.`,
    `**Reference style:** ${Object.entries(change.style).map(([name, css]) => `\`${name}: ${css}\``).join(", ")}`,
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
  if (!chain.length) return "This element only.";
  const [own, ...outer] = chain;
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

function value(property: string, v: unknown): string {
  switch (property) {
    case "fill": {
      const fill = v as Fill | null;
      if (!fill) return "no fill";
      return fill.opacity === 1 ? fill.color : `${fill.color} at ${Math.round(fill.opacity * 100)}% opacity`;
    }
    case "radius": {
      const radius = v as Radius;
      if (typeof radius === "number") return `${radius}px`;
      const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
      return radius.map((r, i) => `${corners[i]} ${r}px`).join(", ");
    }
    default:
      return JSON.stringify(v);
  }
}
