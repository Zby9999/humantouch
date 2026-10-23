import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
  sources: [] as object[],
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

/** Runs the command line in the project, as an Agent would: what it prints, and its errors apart. */
async function cli(...args: string[]) {
  let output = "";
  let errors = "";
  const code = await run(args, { cwd: project, write: (text) => (output += text), error: (text) => (errors += text) });
  return { code, output, errors };
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
    // Outside a git repository: no snapshot of the code.
    expect(state()).toEqual({ status: "claimed", done: [], claimedAt: expect.any(String), code: null });
    expect(output).toMatch(/^# Design changes to apply/);
    expect(section(output, 1)).toBe(`1. Fill

- **Kind:** Style
- **Layer:** Card, \`<article class="rounded-xl border bg-white p-5">\` (Page › Stack › Grid › Card)
- **Location:** \`src/components/Card.tsx:3:5\`
- **Scope:** This usage only: Card used at \`src/App.tsx:40:11\`, inside App used at \`src/main.tsx:8:5\`. It renders 3 instances, which change together. Other usages of Card stay as they are.
- **Design intent:** Change the fill from #FFFFFF to #FF0000 at 50% opacity.
- **Reference style:** \`background-color: rgb(255 0 0 / 0.5)\`
- **Currently set by:** unknown

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

  test("a layer the outermost component writes is changed where it is written, with no other usages to spare", async () => {
    const inApp = { ...cards, loc: "src/App.tsx:27:9", chain: [APP], component: "App", instances: 1 };
    saveRound({ ...redFill, target: inApp });

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain("- **Scope:** Change it where it is written, at Location. App, which writes it, is used at `src/main.tsx:8:5`, outside any other component.\n");
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

describe("claim, where each value comes from", () => {
  const rule = { kind: "rule", important: false, className: null };

  test("names the class, rule, CSS layer and file that set the value now, with paths from the project", async () => {
    const sources = [
      {
        ...rule,
        properties: ["background-color"],
        selector: ".bg-white",
        file: join(project, "src/index.css"),
        layer: "utilities",
        className: "bg-white",
        declaration: "background-color: var(--color-white)",
      },
    ];
    saveRound({ ...redFill, sources });

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain(
      "- **Currently set by:** class `bg-white`: rule `.bg-white` in CSS layer `utilities` of `src/index.css`, `background-color: var(--color-white)`\n",
    );
  });

  test("says when a rule is in no CSS layer, or important; an inline style; or nothing at all", async () => {
    const button = { ...rule, properties: ["background-color"], selector: "button", file: join(project, "src/index.css"), layer: null, declaration: "background: red" };
    const important = { ...rule, properties: ["border-top-left-radius"], selector: ".wide", file: null, layer: null, important: true, declaration: "border-top-left-radius: 2px" };
    const inline = { ...rule, kind: "inline", properties: ["border-top-right-radius"], selector: null, file: null, layer: null, declaration: "border-radius: 8px" };
    const none = { ...rule, kind: "none", properties: ["background-color"], selector: null, file: null, layer: null, declaration: null };
    saveRound({ ...redFill, sources: [button] }, { ...smallRadius, sources: [important, inline] }, { ...redFill, id: 3, sources: [none] });

    const notes = (await cli("claim")).output;

    expect(section(notes, 1)).toContain("- **Currently set by:** rule `button` in no CSS layer, of `src/index.css`, `background: red`\n");
    expect(section(notes, 2)).toContain(
      "- **Currently set by:** `border-top-left-radius`: rule `.wide` in no CSS layer, `border-top-left-radius: 2px !important`; `border-top-right-radius`: the element's style attribute, `border-radius: 8px`\n",
    );
    expect(section(notes, 3)).toContain("- **Currently set by:** nothing: the browser default applies\n");
  });
});

describe("done", () => {
  test("marks one change of the claimed round applied, and says how far the round is", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");

    const { code, output } = await cli("done", "2");

    expect(code).toBe(0);
    expect(state()).toMatchObject({ status: "claimed", done: [2] });
    expect(output).toBe("Change 2 done: 1 of 2 changes applied.\nNot checked on the page: no page with Vernier Kit is open.\n");
  });

  test("refuses a number that is not a change of the round, or a round not claimed", async () => {
    saveRound(redFill);
    expect(await cli("done", "1")).toEqual({ code: 1, output: "", errors: "The round is not claimed: run `npx vernierkit claim` first.\n" });
    await cli("claim");

    expect(await cli("done", "7")).toEqual({ code: 1, output: "", errors: "There is no change 7 in this round. Its changes are: 1.\n" });
    expect(state()).toEqual({ status: "claimed", done: [], claimedAt: expect.any(String), code: null });
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

/**
 * Stands in for an open page: answers each check `done` asks for with
 * `answer(id)`, as the editor layer does through the local service.
 */
function openPage(answer: (id: number) => object | null, pages = 1) {
  const dir = join(project, ".vernier");
  // The local service runs in this very process, as far as the command line can tell.
  const write = (results: object) => writeFileSync(join(dir, "checks.json"), JSON.stringify({ pages, service: process.pid, results }));
  let results: Record<string, object> = {};
  write(results);
  const timer = setInterval(() => {
    const check = state()?.check;
    const result = check && answer(check.id);
    if (!result) return;
    const next = { at: check.at, ...result };
    if (JSON.stringify(results[check.id]) === JSON.stringify(next)) return;
    results = { ...results, [check.id]: next };
    write(results);
  }, 20);
  return () => clearInterval(timer);
}

describe("done, checked on the page", () => {
  let closePage = () => {};
  afterEach(() => closePage());

  test("says when the page shows the change", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    closePage = openPage(() => ({ outcome: "shown" }));

    const { code, output } = await cli("done", "1");

    expect(code).toBe(0);
    expect(output).toBe("Change 1 done: 1 of 2 changes applied.\nChecked on the page: it shows the change.\n");
  });

  test("says when it does not, with what the page shows instead, and checks again on the next done", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    let fixed = false;
    closePage = openPage(() => (fixed ? { outcome: "shown" } : { outcome: "not shown", actual: { type: "solid", color: "#DC2626", opacity: 1 } }));

    const first = await cli("done", "1");
    fixed = true;
    const again = await cli("done", "1");

    expect(first.output).toBe(
      "Change 1 done: 1 of 2 changes applied.\n" +
        "Checked on the page: it does not show the change. The fill is #DC2626, not #FF0000 at 50% opacity. " +
        "Something overrides your change: see what sets the value in the notes (Currently set by), fix it, and run `npx vernierkit done 1` again.\n",
    );
    expect(again.output).toBe("Change 1 done: 1 of 2 changes applied.\nChecked on the page: it shows the change.\n");
  });

  test("says why when the page could not check it", async () => {
    saveRound(redFill);
    await cli("claim");
    closePage = openPage(() => ({ outcome: "unchecked", reason: "the layer is not on the page now" }));

    expect((await cli("done", "1")).output).toContain("\nNot checked on the page: the layer is not on the page now.\n");
  });

  test("of two pages, waits for the one that can check, while the other cannot", async () => {
    saveRound(redFill);
    await cli("claim");
    const since = Date.now();
    // The page that shows the layer needs a moment for the dev server; the other answers at once.
    closePage = openPage(() => (Date.now() - since > 300 ? { outcome: "shown" } : { outcome: "unchecked", reason: "the layer is not on the page now" }), 2);

    expect((await cli("done", "1")).output).toContain("Checked on the page: it shows the change.");
  });

  test("does not wait for pages of a local service that is no longer running", async () => {
    saveRound(redFill);
    await cli("claim");
    writeFileSync(join(project, ".vernier/checks.json"), JSON.stringify({ pages: 1, service: 999999, results: {} }));

    const started = Date.now();
    const { output } = await cli("done", "1");

    expect(output).toContain("Not checked on the page: no page with Vernier Kit is open.");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("a check left from an earlier round does not count in this one", async () => {
    saveRound(redFill);
    await cli("claim");
    // As if the service wrote it back just as the round before was archived.
    writeFileSync(
      join(project, ".vernier/checks.json"),
      JSON.stringify({ pages: 0, service: process.pid, results: { 1: { at: "2000-01-01T00:00:00.000Z", outcome: "not shown", actual: null } } }),
    );
    await cli("done", "1");

    expect((await cli("finish")).output).toBe("Round finished: 1 of 1 change applied.\n");
    expect(history()[0].result.checks).toEqual({});
  });

  test("finish names the changes the page did not show, and archives the checks", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    closePage = openPage((id) => (id === 2 ? { outcome: "not shown", actual: 12 } : { outcome: "shown" }));
    await cli("done", "1");
    await cli("done", "2");

    const { output } = await cli("finish");

    expect(output).toBe(
      "Round finished: 2 of 2 changes applied. The page did not show: 2. Report them as not applied 1:1, with why.\n",
    );
    expect(history()[0].result.checks).toMatchObject({ 1: { outcome: "shown" }, 2: { outcome: "not shown", actual: 12 } });
    expect(existsSync(join(project, ".vernier/checks.json"))).toBe(false);
  });
});

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
        result: { ended: "finished", done: [1, 2], at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/), checks: {}, code: null },
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

    expect(await cli("finish")).toEqual({ code: 1, output: "", errors: "The round is not claimed: run `npx vernierkit claim` first.\n" });
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
    expect(await cli("last")).toEqual({ code: 0, output: "No earlier round of design changes to undo.\n", errors: "" });
  });
});

describe("claim, again", () => {
  test("prints the notes once more, with the changes done so far, and keeps them done", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "1");

    const { output } = await cli("claim");

    expect(state()).toMatchObject({ status: "claimed", done: [1] });
    expect(section(output, 1)).toContain("- **Status:** Done\n");
    expect(section(output, 2)).toContain("- **Status:** Not done yet\n");
  });
});

describe("a claimed state left without its round", () => {
  // As when `done` writes the state back just after the designer unlocked the round.
  test("does not keep the round claimed", async () => {
    mkdirSync(join(project, ".vernier"), { recursive: true });
    writeFileSync(join(project, ".vernier/state.json"), JSON.stringify({ status: "claimed", done: [1] }));

    expect((await cli("done", "1")).code).toBe(1);
    expect((await cli("claim")).output).toMatch(/^No design changes to apply/);
    expect(state()).toBeNull();
  });
});

describe("undoing the last round, in a git repository", () => {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: project, encoding: "utf8" });

  test("last gives the exact code changes of the round, and the command that takes them back out; nothing is staged meanwhile", async () => {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    // `.vernier/` is not ignored here, and a binary file changes too.
    writeFileSync(join(project, "Card.tsx"), 'export const Card = () => <article className="bg-white" />;\n');
    writeFileSync(join(project, "icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
    git("add", "-A");
    git("commit", "-qm", "start");
    saveRound(redFill);
    await cli("claim");

    // The Agent applies the change, and adds a file.
    writeFileSync(join(project, "Card.tsx"), 'export const Card = () => <article className="bg-red-500/50" />;\n');
    writeFileSync(join(project, "fill.css"), ".x {}\n");
    writeFileSync(join(project, "icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 9, 9, 9]));
    await cli("done", "1");
    await cli("finish");
    expect(git("diff", "--cached", "--name-only")).toBe("");

    const { output } = await cli("last");
    const undo = /`(git -C [^`]+ apply)`/.exec(output)?.[1];
    expect(output).toMatch(/`git -C "[^`"]+" diff \w+ \w+`/);
    expect(undo).toBeDefined();
    execFileSync("sh", ["-c", undo!], { cwd: project });

    expect(readFileSync(join(project, "Card.tsx"), "utf8")).toContain('className="bg-white"');
    expect(existsSync(join(project, "fill.css"))).toBe(false);
    expect([...readFileSync(join(project, "icon.png"))]).toEqual([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
  });

  test("outside a git repository, last gives the notes only", async () => {
    saveRound(redFill);
    await cli("claim");
    await cli("finish");

    expect((await cli("last")).output).not.toContain("git ");
  });
});
