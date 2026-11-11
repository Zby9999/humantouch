import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The site's install words come from the repository's README, read when the site is built, so the two never differ.
 * The dev server and `next build` both run in website/, the README one folder up.
 */
const README = readFileSync(join(process.cwd(), "..", "README.md"), "utf8");

/** A `## ` section of the README, without its heading. */
function section(heading: string): string {
  const start = README.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`README has no "## ${heading}" section`);
  const body = README.slice(start + heading.length + 5);
  const end = body.indexOf("\n## ");
  return (end < 0 ? body : body.slice(0, end)).trim();
}

/** The prompt the designer copies to their Agent: the README's For Agents block. */
export function installPrompt(): string {
  const block = /```text\n([\s\S]*?)\n```/.exec(section("For Agents"));
  if (!block) throw new Error("README's For Agents section has no ```text block");
  return block[1];
}

/** What `init` changes in the project: the paragraph after the prompt. */
function whatInitChanges(): string {
  return section("For Agents").split("```").at(-1)!.trim();
}

/** The For Agents page: Markdown written for an Agent, served at /agents and /agents.md. */
export function agentsMarkdown(): string {
  return `# Human Touch, for Agents

Human Touch is an editor layer for a project's local dev server. The designer edits the page itself on a canvas, and you write their changes into the code. It needs no account and runs only on the local dev server; a production build has none of it.

## Install

When the designer asks you to install Human Touch, do this in the project they want to edit:

${installPrompt()}

${whatInitChanges()}

## Projects it works with

${section("Projects it works with")}

## Apply the designer's changes

When the designer says "Apply my design changes", follow the Skill \`init\` added: \`.agents/skills/humantouch/SKILL.md\` (the same in \`.claude/skills/humantouch/SKILL.md\`). In short:

1. \`npx humantouch claim\` claims the round and prints a note for each change, and how to write them.
2. Apply the changes in order.
3. \`npx humantouch done <number> …\` after a change or a group of them: the designer's open page checks that each one shows.
4. \`npx humantouch finish\` ends the round and lays out the report.
5. End your reply with the report: ✓ Applied, and ⚠️ Not applied 1:1 with why and what you did instead.

If you stopped partway and the designer says "Continue applying my design changes", run \`npx humantouch claim\` again: it prints the changes not applied yet.

## Undo the last round

When the designer says "Undo the last round of design changes", run \`npx humantouch last\` and do as it says.

## Remove Human Touch

Run \`npx humantouch remove\` in the project's root folder. It takes back out everything \`init\` added, uninstalls the package and deletes \`.humantouch/\`, leaving \`git diff\` empty. It refuses while the designer has changes not applied yet: ask whether to apply them first or have the designer discard them.
`;
}
