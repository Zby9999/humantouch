import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { run } from "../src/cli";

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "vernierkit-cli-"));
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

const APP = { component: "App", usage: "src/main.tsx:8:5", thirdParty: false };
const CARD_IN_LOOP = { component: "Card", usage: "src/App.tsx:40:11", thirdParty: false };

/** The three cards of the loop, as the edit commands record them. */
const cards = {
  loc: "src/components/Card.tsx:3:5",
  chain: [CARD_IN_LOOP, APP],
  component: "Card",
  instances: 3,
  locked: false,
  unlocated: false,
  context: { path: ["Page", "Stack", "Grid", "Card"], element: '<article class="rounded-xl border bg-white p-5">' },
};

const redFill = {
  id: 1,
  kind: "style",
  layer: "1",
  target: cards,
  scope: "usage",
  property: "fill",
  before: { type: "solid", color: "#FFFFFF", opacity: 1 },
  after: { type: "solid", color: "#FF0000", opacity: 0.5 },
  style: { "background-color": "rgb(255 0 0 / 0.5)" },
};

const smallRadius = {
  ...redFill,
  id: 2,
  property: "radius",
  before: 12,
  after: 4,
  style: { "border-radius": "4px" },
};

/** Saves a round with these changes into the project, as the editor layer does. */
function saveRound(...changes: object[]) {
  mkdirSync(join(project, ".vernier"), { recursive: true });
  writeFileSync(join(project, ".vernier/canvas.html"), "<!DOCTYPE html><html></html>");
  writeFileSync(join(project, ".vernier/changeset.json"), JSON.stringify({ lastId: changes.length, changes }));
}

function state() {
  const file = join(project, ".vernier/state.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

/** The section of the change notes about change `id`. */
function section(notes: string, id: number) {
  return notes.split(/^## /m).find((part) => part.startsWith(`${id}. `)) ?? "";
}

/** Runs the command line in the project, as an Agent would. */
async function cli(...args: string[]) {
  let output = "";
  const code = await run(args, { cwd: project, write: (text) => (output += text) });
  return { code, output };
}

describe("claim", () => {
  test("with no changes, says there is nothing to apply and claims nothing", async () => {
    const { code, output } = await cli("claim");

    expect(code).toBe(0);
    expect(output).toMatch(/no design changes to apply/i);
    expect(existsSync(join(project, ".vernier"))).toBe(false);
  });

  test("claims the round and prints, for each change, its kind, location, scope, design intent and reference style", async () => {
    saveRound(redFill, smallRadius);

    const { code, output } = await cli("claim");

    expect(code).toBe(0);
    expect(state()).toEqual({ status: "claimed", done: [] });
    expect(output).toMatch(/^# Design changes to apply/);
    expect(section(output, 1)).toBe(`1. Fill

- **Kind:** Style
- **Layer:** Card, \`<article class="rounded-xl border bg-white p-5">\` (Page › Stack › Grid › Card)
- **Location:** \`src/components/Card.tsx:3:5\`
- **Scope:** This usage only: Card used at \`src/App.tsx:40:11\`, inside App used at \`src/main.tsx:8:5\`. It renders 3 instances, which change together. Other usages of Card stay as they are.
- **Design intent:** Change the fill from #FFFFFF to #FF0000 at 50% opacity.
- **Reference style:** \`background-color: rgb(255 0 0 / 0.5)\`

`);
    expect(section(output, 2)).toContain("- **Design intent:** Change the corner radius from 12px to 4px.\n");
    expect(section(output, 2)).toContain("- **Reference style:** `border-radius: 4px`\n");
  });

  test("marks a change with no source marker as not located, and gives its place on the page", async () => {
    const root = {
      ...cards,
      loc: null,
      chain: [],
      component: null,
      instances: 1,
      unlocated: true,
      context: { path: ["Page", "Stack"], element: '<div id="root">' },
    };
    saveRound({ ...redFill, target: root });

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain("- **Location:** **Not located.**");
    expect(notes).toContain('- **Layer:** Stack, `<div id="root">` (Page › Stack)');
  });

  test("marks a change in a component whose usage could not be located as usage not determined", async () => {
    // A server component, say: the element is known, the JSX that uses its component is not.
    const inServerComponent = { ...cards, chain: [{ component: "Card", usage: null, thirdParty: false }] };
    saveRound({ ...redFill, target: inServerComponent });

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain("- **Location:** `src/components/Card.tsx:3:5`");
    expect(notes).toContain("- **Scope:** **Usage not determined.**");
  });
});
