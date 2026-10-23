import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("done", () => {
  test("marks one change of the claimed round applied, and says how far the round is", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");

    const { code, output } = await cli("done", "2");

    expect(code).toBe(0);
    expect(state()).toEqual({ status: "claimed", done: [2] });
    expect(output).toBe("Change 2 done: 1 of 2 changes applied.\n");
  });

  test("refuses a number that is not a change of the round, or a round not claimed", async () => {
    saveRound(redFill);
    expect(await cli("done", "1")).toEqual({ code: 1, output: "The round is not claimed: run `npx vernierkit claim` first.\n" });
    await cli("claim");

    expect(await cli("done", "7")).toEqual({ code: 1, output: "There is no change 7 in this round. Its changes are: 1.\n" });
    expect(state()).toEqual({ status: "claimed", done: [] });
  });
});

/** The rounds archived in `.vernier/history/`, oldest first: their ChangeSets and how each ended. */
function history() {
  const dir = join(project, ".vernier/history");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .map((round) => ({
      changeSet: JSON.parse(readFileSync(join(dir, round, "changeset.json"), "utf8")),
      result: JSON.parse(readFileSync(join(dir, round, "result.json"), "utf8")),
    }));
}

describe("finish", () => {
  test("archives the round with what was done, and leaves no round behind, so the designer can start the next", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "1");
    await cli("done", "2");

    const { code, output } = await cli("finish");

    expect(code).toBe(0);
    expect(output).toBe("Round finished: 2 of 2 changes applied.\n");
    expect(readdirSync(join(project, ".vernier"))).toEqual(["history"]);
    expect(history()).toEqual([
      {
        changeSet: { lastId: 2, changes: [redFill, smallRadius] },
        result: { ended: "finished", done: [1, 2], at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) },
      },
    ]);
  });

  test("names the changes not marked done, for the report", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "2");

    const { output } = await cli("finish");

    expect(output).toBe("Round finished: 1 of 2 changes applied. Not marked done: 1. Report why in your reply.\n");
    expect(history()[0].result.done).toEqual([2]);
  });

  test("refuses a round that is not claimed", async () => {
    saveRound(redFill);

    expect(await cli("finish")).toEqual({ code: 1, output: "The round is not claimed: run `npx vernierkit claim` first.\n" });
    expect(history()).toEqual([]);
  });
});

describe("last", () => {
  test("prints the change notes of the last round, with which changes were applied, to undo it by", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "1");
    await cli("finish");

    const { code, output } = await cli("last");

    expect(code).toBe(0);
    expect(output).toMatch(/^# Last round of design changes\n/);
    expect(section(output, 1)).toContain("- **Status:** Applied\n");
    expect(section(output, 1)).toContain("- **Design intent:** Change the fill from #FFFFFF to #FF0000 at 50% opacity.\n");
    expect(section(output, 2)).toContain("- **Status:** Not applied\n");
  });

  test("of two rounds, the later one", async () => {
    saveRound(redFill);
    await cli("claim");
    await cli("finish");
    saveRound(smallRadius);
    await cli("claim");
    await cli("finish");

    const { output } = await cli("last");

    expect(section(output, 2)).toContain("Corner radius");
    expect(section(output, 1)).toBe("");
  });

  test("with no round before, says so", async () => {
    expect(await cli("last")).toEqual({ code: 0, output: "No earlier round of design changes to undo.\n" });
  });
});

describe("claim, again", () => {
  test("prints the notes once more, with the changes done so far, and keeps them done", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "1");

    const { output } = await cli("claim");

    expect(state()).toEqual({ status: "claimed", done: [1] });
    expect(section(output, 1)).toContain("- **Status:** Done\n");
    expect(section(output, 2)).toContain("- **Status:** Not done yet\n");
  });
});
