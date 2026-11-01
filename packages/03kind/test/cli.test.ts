import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { run } from "../src/cli";
import type { Change } from "../src/client/changeset";
import { uncheckable } from "../src/client/check";
import { REPORT_RULES } from "../src/report-form";

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "03kind-cli-"));
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
  mkdirSync(join(project, ".03kind"), { recursive: true });
  writeFileSync(join(project, ".03kind/canvas.html"), "<!DOCTYPE html><html></html>");
  writeFileSync(join(project, ".03kind/changeset.json"), JSON.stringify({ lastId: changes.length, changes }));
}

function state() {
  const file = join(project, ".03kind/state.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

/** The section of the change notes about change `id`. */
function section(notes: string, id: number) {
  return notes.split(/^## /m).find((part) => part.startsWith(`${id}. `)) ?? "";
}

/** The change notes' sections of the changes, one after another: what is said around them left out. */
function changeSections(notes: string) {
  return notes
    .split(/^## /m)
    .filter((part) => /^\d+\. /.test(part))
    .join("## ");
}

/** What `finish` says of the round: its first line, before the form of the report. */
function finished(output: string) {
  return output.slice(0, output.indexOf("\n") + 1);
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
    expect(existsSync(join(project, ".03kind"))).toBe(false);
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
- **Breakpoint:** all breakpoints.
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

  test("with the usage not determined, gives the address of the page and the layer's place on it", async () => {
    // A Next.js page: the framework renders it, from no JSX of the project's.
    const inPage = {
      ...cards,
      loc: "app/pricing/page.tsx:12:7",
      chain: [{ component: "Pricing", usage: null, thirdParty: false }],
      component: "Pricing",
      instances: 1,
      context: { path: ["Page", "Pricing", "Heading"], element: '<h1 class="page-module__title">', page: "/pricing?plan=team" },
    };
    saveRound({ ...redFill, target: inPage });

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain("- **Layer:** Heading, `<h1 class=\"page-module__title\">` (Page › Pricing › Heading)");
    expect(notes).toContain(
      "- **Scope:** **Usage not determined.** Pricing is used from code Vernier Kit could not locate. Change only the usage the layer is in, found from its place on the page at `/pricing?plan=team` (Layer, above), and leave the other usages of Pricing as they are.\n",
    );
  });
});

describe("claim, the way through a round (ticket 65)", () => {
  test("opens with the way through the round: done after a change or a group of related ones, at least once before finish, then the report", async () => {
    saveRound(redFill, smallRadius);

    const { output } = await cli("claim");

    const intro = output.split(/^## /m)[0];
    expect(intro).not.toMatch(/after each/);
    expect(intro).toContain("After a change, or a group of related ones, run `npx 03kind done <number> …` with their numbers");
    expect(intro).toContain("at least once before `npx 03kind finish`");
    expect(intro).toContain("report");
  });

  test("with the designer's page open, says it and its dev server are running, and the page checks the edits: no dev server to start, no browser to open; with none, says nothing of it", async () => {
    const sentence = "The designer's page and its dev server are running already, and the page checks your edits as the code changes: start no dev server, and open no browser to look.";
    saveRound(redFill);
    expect((await cli("claim")).output.split(/^## /m)[0]).not.toContain(sentence);

    const closePage = openPage(() => ({ outcome: "shown" }));
    try {
      expect((await cli("claim")).output.split(/^## /m)[0]).toContain(sentence);
    } finally {
      closePage();
    }
  });
});

describe("claim, how to write the changes (ticket 65)", () => {
  /** The rules the notes end with, by name: each `- **Name:** text` line of **How to write them**. */
  function rules(notes: string) {
    const [, section = ""] = notes.split(/^## How to write them\n/m);
    return section.split("\n").flatMap((line) => {
      const [, name, text] = /^- \*\*(.+?):\*\* (.*)$/.exec(line) ?? [];
      return name ? [{ name, text }] : [];
    });
  }
  const names = (notes: string) => rules(notes).map((rule) => rule.name);
  const rule = (notes: string, name: string) => rules(notes).find((r) => r.name === name)?.text ?? "";

  const inApp = { ...cards, loc: "src/App.tsx:27:9", chain: [APP], component: "App", instances: 1 };
  const container = { ...inApp, loc: "src/App.tsx:20:7", context: { path: ["Page", "App", "Stack"], element: '<ul class="flex flex-col">' } };
  const place = (nth: number, more: object = {}) => ({ container: { layer: "4", target: container, ...more }, nth, slot: nth - 1, absolute: null });
  const style = (property: string, more: object = {}) => ({ ...redFill, target: inApp, property, ...more });
  const change = (kind: string, more: object = {}) => ({ ...redFill, kind, property: kind, target: inApp, before: place(1), after: place(2), style: {}, sources: [], ...more });
  const settings = { direction: "vertical", gap: 8, padding: [0, 0, 0, 0], align: { x: "start", y: "start", distribute: false } };
  const ruleSource = (selector: string, layer: string | null, file = "src/index.css") => ({ properties: ["background-color"], kind: "rule", selector, file, layer, important: false, className: null, declaration: "background-color: white" });

  test("end with how to write them, after the last change: the rules for every round, and those for the kinds of change in this one only, each once", async () => {
    saveRound(style("fill"), { ...style("radius"), id: 2, before: 12, after: 4 });

    const { output } = await cli("claim");

    expect(output.indexOf("## How to write them")).toBeGreaterThan(output.indexOf("## 2. "));
    expect(names(output)).toEqual(["Every change", "What sets the value now", "All breakpoints", "How the page checks"]);
    expect(rule(output, "Every change")).toContain("the reference style is the CSS that showed it on the canvas, to understand it by, not code to paste");
    expect(rule(output, "Every change")).toContain("Never change third-party code");
    expect(rule(output, "Every change")).toContain("apply the closest you can and still run `done` for it, or leave it out and do not");
  });

  test.each([
    ["a rule in no CSS layer sets the value", "A rule in no CSS layer", [style("fill", { sources: [ruleSource("button", null)] })]],
    ["a CSS Module sets the value", "CSS Modules", [style("fill", { sources: [ruleSource(".card", null, "src/components/Card.module.css")] })]],
    ["a change at a breakpoint", "Breakpoints", [style("fill", { breakpoint: { min: null, max: 640, project: { tailwind: "max-sm:" } } })]],
    [
      "a layer placed freely at a breakpoint",
      "Absolute at a breakpoint",
      [style("absolute", { before: null, after: { x: 12, y: 40 }, breakpoint: { min: null, max: 768 }, style: { position: "absolute", left: "12px", top: "40px" } })],
    ],
    ["a change for one usage of a component", "This usage only", [redFill]],
    ["a change promoted to the component", "The component itself", [{ ...redFill, scope: "component" }]],
    ["a move", "Moves", [change("move")]],
    ["a move to another cell of a Grid", "Cells of a Grid", [change("move", { before: place(1, { grid: true }), after: place(3, { grid: true }) })]],
    ["a Grid's columns", "Grids", [style("columns", { before: 3, after: 2 })]],
    ["a Grid's row gap", "Grids", [style("rowGap", { before: 16, after: 24 })]],
    ["a Stack made", "Making a Stack", [change("stack", { before: null, after: { ...settings, place: place(1), layers: [{ layer: "5", target: inApp, from: place(1) }] } })]],
    ["a plain flow made a real Stack", "Make it a Stack", [style("gap", { before: 0, after: 16, asStack: true })]],
    [
      "a Stack dissolved",
      "Dissolving a Stack",
      [change("unstack", { before: settings, after: { width: 200, height: 100, layers: [{ layer: "5", target: inApp, x: 0, y: 0, width: 200, height: 40 }] } })],
    ],
    ["a size", "Sizes", [style("width", { before: { type: "hug" }, after: { type: "fill" } })]],
    ["a new Frame with a brief", "New Frame with a brief", [change("create", { before: null, after: { type: "frame", place: place(2), width: 200, height: 120, brief: "A pricing table" } })]],
    ["a brief", "Brief", [change("brief", { before: null, after: "Bounce back harder when pressed" })]],
    ["new words", "Text", [change("text", { before: "Vernier Kit", after: "Vernier Studio" })]],
    [
      "a copy with values of its own at breakpoints",
      "Copies",
      [change("duplicate", { copiedBreakpoints: [{ change: 9, inside: null, breakpoint: { min: null, max: 768 }, property: "radius", value: 4 }] })],
    ],
    ["a loop's instance deleted", "Data changes", [change("delete", { data: true, target: { ...inApp, instances: 3 }, after: null })]],
    ["a new Frame, Fixed as drawn", "Sizes", [change("create", { before: null, after: { type: "frame", place: place(2), width: 200, height: 120 } })]],
    [
      "a Stack dissolved into a Frame of a Fixed size",
      "Sizes",
      [change("unstack", { before: settings, after: { width: 200, height: 100, layers: [{ layer: "5", target: inApp, x: 0, y: 0, width: 200, height: 40 }] } })],
    ],
    [
      "a layer placed freely at a breakpoint, at its size",
      "Sizes",
      [style("absolute", { before: null, after: { x: 12, y: 40 }, breakpoint: { min: null, max: 768 }, style: { position: "absolute", left: "12px", top: "40px" } })],
    ],
    [
      "a copy whose layer is a real Stack at a breakpoint",
      "Make it a Stack",
      [change("duplicate", { copiedBreakpoints: [{ change: 9, inside: null, breakpoint: { min: null, max: 768 }, property: "gap", value: 16, asStack: true }] })],
    ],
    [
      "a Stack made of layers with margins",
      "What sets the value now",
      [
        change("stack", {
          before: null,
          after: { ...settings, place: place(1), layers: [{ layer: "5", target: inApp, from: place(1), unmargined: true }] },
          sources: [{ ...ruleSource(".mt-4", "utilities"), properties: ["margin-top"] }],
        }),
      ],
    ],
  ])("%s: the notes say how to write it (%s)", async (_, name, round) => {
    saveRound(...round.map((c, i) => ({ ...c, id: i + 1 })));

    const output = (await cli("claim")).output;

    expect(names(output)).toContain(name);
  });

  test("a rule is said once, however many changes call for it; none a change of the round does not call for", async () => {
    saveRound({ ...change("move"), id: 1 }, { ...change("move", { before: place(2), after: place(1) }), id: 2 }, { ...change("text", { before: "A", after: "B" }), id: 3 });

    const all = names((await cli("claim")).output);

    expect(all).toEqual(["Every change", "Moves", "Text", "How the page checks"]);
  });

  test("how the page checks says what it reads, and at which widths, for the kinds of change in this round only (ticket 65)", async () => {
    const PHONE = { min: null, max: 768, project: { tailwind: "max-md:" } };
    const order = { signs: ["li A", "li B"], self: 1, others: [] };
    saveRound(style("fill"), { ...style("radius", { before: 12, after: 4, breakpoint: PHONE }), id: 2 }, { ...change("move", { before: place(2), after: place(1), order }), id: 3 });

    const checks = rule((await cli("claim")).output, "How the page checks");

    expect(checks).toContain("the value the browser computes (`getComputedStyle`) for the CSS its reference style names, on the layer in every instance");
    expect(checks).toContain("at the page's own width and at each of the designer's views' widths");
    expect(checks).toContain("a change at a breakpoint in each part the project's breakpoints cut its range into");
    expect(checks).toContain("a reorder by the order of its container's layers");
    expect(checks).not.toContain("deletion");
    expect(checks).not.toContain("Not checked");
    expect(checks).toContain("Where it does not show, `done` says what the page shows instead, and at which width: you need not look further for how it checks.");
    // Said here, not in All breakpoints as well.
    expect(rule((await cli("claim")).output, "All breakpoints")).not.toContain("`done`");
  });

  test("a rule that styles elements outside the scope too is left as it is and overridden for this layer: past a rule in no CSS layer, with the class's important form; a round with no such rule says nothing of it (ticket 65)", async () => {
    saveRound(style("fill", { sources: [ruleSource("button", null)] }));

    const notes = (await cli("claim")).output;

    expect(rule(notes, "What sets the value now")).toContain("change it only when every element it styles is in the scope");
    expect(rule(notes, "What sets the value now")).toContain("when it styles elements outside the scope too, leave it as it is and override it for this layer only");
    expect(rule(notes, "A rule in no CSS layer")).toContain("important form (`bg-[#2563EB]!`, `rounded-lg!`)");
    expect(notes).not.toContain("last resort");
    expect(notes).not.toContain("narrow it");

    saveRound(style("fill", { sources: [ruleSource(".bg-white", "utilities")] }));
    expect((await cli("claim")).output).not.toContain("important form");
  });

  test("how the page checks says it reads a style change on the layer alone: an edit that changes elements outside the scope too is wrong, though done says it shows; a round with no style change says nothing of it (ticket 65)", async () => {
    saveRound(style("fill"));

    const checks = rule((await cli("claim")).output, "How the page checks");

    expect(checks).toContain("on the layer in every instance, whatever class or rule gives it, and on nothing else");
    expect(checks).toContain("an edit that also changes elements outside the scope is wrong, though `done` says it shows");

    saveRound(change("move", { before: place(2), after: place(1), order: { signs: ["li A", "li B"], self: 1, others: [] } }));
    expect(rule((await cli("claim")).output, "How the page checks")).not.toContain("outside the scope");
  });

  test("how the page checks names the kinds of change in this round it cannot check: done says so, and the report says what was done", async () => {
    saveRound({ ...change("text", { before: "A", after: "B" }), id: 1 }, { ...change("brief", { before: null, after: "Bounce" }), id: 2 });

    const checks = rule((await cli("claim")).output, "How the page checks");

    expect(checks).toContain("new words and a brief, not at all: `done` says Not checked, which is no error; say in the report what you did");
    expect(checks).not.toContain("getComputedStyle");
  });

  describe("how the page checks says a change is checked exactly when the page checks it (`uncheckable` in check.ts)", () => {
    const order = { signs: ["li A", "li B"], self: 1, others: [] };
    const elsewhere = { ...container, loc: "src/App.tsx:30:7" };
    const at = (x: number, y: number) => ({ x, y });
    const placeIn = (target: object, nth: number, absolute: object | null = null) => ({ ...place(nth, { target }), absolute });
    test.each([
      ["a style change", style("fill")],
      ["a style change to a layer made this round", style("fill", { target: { ...inApp, loc: null, made: "9" } })],
      ["a style change to a layer with no source marker", style("fill", { target: { ...inApp, loc: null } })],
      ["a style change to a run of text", style("fill", { target: { ...inApp, run: 0 } })],
      ["a deletion", change("delete", { after: null })],
      ["a deletion of a loop's instance", change("delete", { data: true, after: null })],
      ["a reorder", change("move", { before: place(2), after: place(1), order })],
      ["a reorder among loose text", change("move", { before: place(2), after: place(1) })],
      ["a reorder wrapped", change("move", { before: place(2), after: place(1), order, wrap: true })],
      ["a placement absolute in the same container", change("move", { before: place(2), after: { ...place(2), absolute: at(10, 20) } })],
      ["a move into another container", change("move", { before: place(2), after: placeIn(elsewhere, 1), order })],
      ["a move into a layout from a place of its own", change("move", { before: { ...place(2), absolute: at(10, 20) }, after: place(1), order })],
      ["a reorder in a container made this round", change("move", { before: placeIn({ ...container, loc: null, made: "9" }, 2), after: placeIn({ ...container, loc: null, made: "9" }, 1), order })],
      ["a placement absolute in a container with no source marker", change("move", { before: placeIn({ ...container, loc: null }, 2), after: placeIn({ ...container, loc: null }, 2, at(10, 20)) })],
      ["new words", change("text", { before: "A", after: "B" })],
      ["a brief", change("brief", { before: null, after: "Bounce" })],
    ])("%s", async (_, round) => {
      saveRound(round);

      const checks = rule((await cli("claim")).output, "How the page checks");

      const checked = uncheckable(round as unknown as Change) === null;
      expect(checks.includes("not at all")).toBe(!checked);
      expect(checks.includes("Where it does not show")).toBe(checked);
    });

    test("a move in the same container, one the page has no marker for, is named as such: not as one into another container", async () => {
      const made = { ...container, loc: null, made: "9" };
      saveRound(change("move", { before: placeIn(made, 2), after: placeIn(made, 1), order }));

      const checks = rule((await cli("claim")).output, "How the page checks");

      expect(checks).toContain("a move in a container made this round, or one the page cannot find, not at all");
      expect(checks).not.toContain("another container");
    });
  });

  test("a layer placed absolute: how the page checks says its `left` and `top` are the X and Y given, its margins kept, not taken off; a round with none says nothing of margins (ticket 65)", async () => {
    saveRound(style("y", { before: 368, after: 488, margins: { x: 0, y: 24 }, style: { top: "488px", bottom: "auto" } }));

    const checks = rule((await cli("claim")).output, "How the page checks");

    expect(checks).toContain("its `left` and `top` the X and Y given, its margins kept, not taken off");
    expect(checks).toContain("drawn at `left` and `top` plus its margins");

    saveRound(style("fill"));
    expect(rule((await cli("claim")).output, "How the page checks")).not.toContain("margins");
  });

  test("the rule for breakpoints names no class of its own: a part of the range the layer shows another value in now is changed too (ticket 65)", async () => {
    saveRound(style("columns", { before: 1, after: 2, breakpoint: { min: null, max: 768, project: { tailwind: "max-md:" } } }));

    const breakpoints = rule((await cli("claim")).output, "Breakpoints");

    expect(breakpoints).not.toMatch(/grid-cols|max-sm:|md:max-lg:|max-md:/);
    expect(breakpoints).toContain("Where the design intent gives the range part by part, the layer shows another value in each now");
  });

  test("the rule for breakpoints says which Tailwind class shows where several hold, as Tailwind orders them; a round with no breakpoint says nothing of it (ticket 65)", async () => {
    saveRound(style("columns", { before: 1, after: 2, breakpoint: { min: null, max: 768, project: { tailwind: "max-md:" } } }));

    const breakpoints = rule((await cli("claim")).output, "Breakpoints");

    expect(breakpoints).toContain("With Tailwind, of the classes for a property that hold at a width, the one latest in the stylesheet shows, whatever their order in `class`");
    expect(breakpoints).toContain("those with no breakpoint variant come first, then the `max-*` ones from the widest, then `sm:`, `md:` and on up, each directly followed by the ranges that start there");

    saveRound(style("columns", { before: 1, after: 2 }));
    expect((await cli("claim")).output).not.toContain("latest in the stylesheet");
  });

  test("the notes of the last round, to undo it by, say none", async () => {
    saveRound(redFill);
    await cli("claim");
    await cli("finish");

    expect((await cli("last")).output).not.toContain("How to write them");
  });

  test("a change made in the desktop view applies at every width: what the project writes for that property at its breakpoints is covered too", async () => {
    saveRound(redFill);

    const all = rule((await cli("claim")).output, "All breakpoints");

    expect(all).toContain("applies at every width");
    expect(all).toContain("a breakpoint variant such as `sm:` or `md:`");
    expect(all).toContain("change those too");
  });
});

describe("claim, breakpoints", () => {
  test("a change made in a narrower view says the widths it applies at, to be written with the project's own breakpoints; any other, all breakpoints", async () => {
    saveRound(redFill, { ...smallRadius, breakpoint: { min: null, max: 768 } }, { ...smallRadius, id: 3, breakpoint: { min: 768, max: 1280 } });

    const { output } = await cli("claim");

    expect(section(output, 1)).toContain("- **Breakpoint:** all breakpoints.\n");
    expect(section(output, 2)).toContain("- **Breakpoint:** below 768px only (`@media (width < 768px)`), as the designer changed it in a narrower view.");
    expect(section(output, 2)).toContain("the way the project already writes breakpoints");
    expect(section(output, 3)).toContain("- **Breakpoint:** 768px to 1279px only (`@media (768px <= width < 1280px)`)");
    expect(section(output, 2)).toContain("- **Design intent:** Change the corner radius from 12px to 4px.\n");
  });

  test("a layer in a Frame's flow placed freely in a narrower view is to be placed absolute at those widths only, at its size, its Frame the reference", async () => {
    saveRound({
      ...redFill,
      property: "absolute",
      before: null,
      after: { x: 12, y: 40 },
      breakpoint: { min: null, max: 768 },
      style: { position: "absolute", left: "12px", top: "40px", right: "auto", bottom: "auto", width: "120px", height: "32px" },
    });

    const { output } = await cli("claim");

    expect(section(output, 1)).toMatch(/^1\. Absolute\n/);
    expect(section(output, 1)).toContain("- **Breakpoint:** below 768px only (`@media (width < 768px)`)");
    expect(section(output, 1)).toContain(
      "- **Design intent:** Take this layer out of its container's layout and place it absolute in it, at X 12px and Y 40px from its top left (CSS `left` and `top`), " +
        "at the size it has there now (Fixed 120 × 32px, as the reference style shows). Make the container its positioning reference at these widths (`position: relative`) if it is not one already.\n",
    );
  });

  test("a change at a range of the project's own breakpoints says how the project writes it: Tailwind's variants, or its media queries at the edges", async () => {
    saveRound(
      { ...redFill, breakpoint: { min: null, max: 640, project: { tailwind: "max-sm:" } } },
      { ...smallRadius, breakpoint: { min: 768, max: 1024, project: { tailwind: "md:max-lg:" } } },
      { ...smallRadius, id: 3, breakpoint: { min: 600, max: 1000, project: { queries: ["(max-width: 599px)", "(min-width: 1000px)"] } } },
    );

    const { output } = await cli("claim");

    expect(section(output, 1)).toContain(
      "- **Breakpoint:** below 640px only (`@media (width < 640px)`), as the designer changed it in a narrower view. The project writes these widths with Tailwind's `max-sm:`: make the change apply at these widths only that way, and leave the layer as it is at every other width.",
    );
    expect(section(output, 2)).toContain("The project writes these widths with Tailwind's `md:max-lg:`");
    expect(section(output, 3)).toContain(
      "The project writes these widths with its own media queries, whose edges these are: 600px, where `(max-width: 599px)` starts or stops holding, and 1000px, where `(min-width: 1000px)` starts or stops holding: make the change apply at these widths only that way",
    );
  });

  test("a change at a range the project's breakpoints cut into parts says, part by part, what the page shows there now and what it is to show (ticket 65)", async () => {
    const PHONE = { min: null, max: 768, project: { tailwind: "max-md:" } };
    const parts = [
      { breakpoint: { min: null, max: 640, project: { tailwind: "max-sm:" } }, before: 1 },
      { breakpoint: { min: 640, max: 768, project: { tailwind: "sm:max-md:" } }, before: 3 },
    ];
    const columns = { ...redFill, property: "columns", before: 1, after: 2, style: { "grid-template-columns": "repeat(2, minmax(0, 1fr))" }, breakpoint: PHONE };
    const sameEverywhere = [
      { breakpoint: parts[0].breakpoint, before: 12 },
      { breakpoint: parts[1].breakpoint, before: 12 },
    ];
    saveRound({ ...columns, parts }, { ...smallRadius, breakpoint: PHONE, parts: sameEverywhere });

    const { output } = await cli("claim");

    expect(section(output, 1)).toContain(
      "- **Design intent:** Change the number of columns at each part of these widths, as the page shows it now: below 640px (`max-sm:`), from 1 to 2; 640px to 767px (`sm:max-md:`), from 3 to 2.\n",
    );
    expect(section(output, 1)).not.toContain("Its value before is what it showed at these widths.");
    // The same value at every part: said once.
    expect(section(output, 2)).toContain("- **Design intent:** Change the corner radius from 12px to 4px.\n");
  });

  describe("a change whose range's parts the page has yet to read (ticket 65)", () => {
    const PHONE = { min: null, max: 768, project: { tailwind: "max-md:" } };
    const parts = [
      { breakpoint: { min: null, max: 640, project: { tailwind: "max-sm:" } }, before: 1 },
      { breakpoint: { min: 640, max: 768, project: { tailwind: "sm:max-md:" } }, before: 3 },
    ];
    const columns = { ...redFill, property: "columns", before: 1, after: 2, style: { "grid-template-columns": "repeat(2, minmax(0, 1fr))" }, breakpoint: PHONE };
    const PART_BY_PART = "Change the number of columns at each part of these widths, as the page shows it now: below 640px (`max-sm:`), from 1 to 2; 640px to 767px (`sm:max-md:`), from 3 to 2.";

    test("with a page open, claim waits till the page has read them and saved the round again, and gives them part by part; claimed only then", async () => {
      saveRound({ ...columns, parts: null });
      pageSaw({});
      const claimedBefore: unknown[] = [];
      const reads = setTimeout(() => {
        claimedBefore.push(state());
        saveRound({ ...columns, parts });
      }, 300);
      try {
        const { output } = await cli("claim");

        expect(section(output, 1)).toContain(PART_BY_PART);
        expect(claimedBefore).toEqual([null]);
        expect(state().status).toBe("claimed");
      } finally {
        clearTimeout(reads);
      }
    });

    test("read as none (the page does not show the layer in one of them), the change is given as before", async () => {
      saveRound({ ...columns, parts: null });
      pageSaw({});
      const reads = setTimeout(() => saveRound(columns), 100);
      try {
        const { output } = await cli("claim");

        expect(section(output, 1)).toContain("- **Design intent:** Change the number of columns from 1 to 2.\n");
      } finally {
        clearTimeout(reads);
      }
    });

    test("with no page open, claim waits for none, and gives the value the view showed", async () => {
      saveRound({ ...columns, parts: null });
      const started = Date.now();

      const { output } = await cli("claim");

      expect(Date.now() - started).toBeLessThan(1000);
      expect(section(output, 1)).toContain("- **Design intent:** Change the number of columns from 1 to 2.\n");
    });

    test("with a page open that does not read them in time, claim waits no longer, and gives the value the view showed", async () => {
      saveRound({ ...columns, parts: null });
      pageSaw({});
      const started = Date.now();

      const { output } = await cli("claim");

      expect(Date.now() - started).toBeGreaterThanOrEqual(5000);
      expect(section(output, 1)).toContain("- **Design intent:** Change the number of columns from 1 to 2.\n");
    }, 15_000);
  });

  test("a copy of a layer with values of its own at breakpoints lists them, for the copy to have them there too; a copy of one with none says nothing of it", async () => {
    const PHONE = { min: null, max: 768 };
    const place = (nth: number) => ({ container: { layer: "9", target: cards }, nth, slot: nth - 1, absolute: null });
    const copy = { ...redFill, kind: "duplicate", property: "copy", before: place(1), after: place(2), style: {} };
    saveRound(
      { ...smallRadius, id: 1, breakpoint: PHONE },
      {
        ...copy,
        id: 2,
        layer: "2",
        copiedBreakpoints: [
          { change: 1, inside: null, breakpoint: { ...PHONE, project: { tailwind: "max-md:" } }, property: "radius", value: 4 },
          { change: 8, inside: null, breakpoint: PHONE, property: "gap", value: 16, asStack: true },
          { change: 7, inside: { name: "Title", element: '<h2 class="text-lg">' }, breakpoint: { min: 768, max: 1280 }, property: "visible", value: false },
        ],
      },
      { ...copy, id: 3, layer: "3" },
    );

    const output = (await cli("claim")).output;

    expect(section(output, 2)).toContain("- **Breakpoint:** all breakpoints.\n");
    expect(section(output, 2)).toContain(
      "- **Copied breakpoints:** the layer has values of its own at narrower breakpoints, and the copy keeps them, as the layer had them when copied. " +
        "Give the copy the same at those widths, the way the project already writes breakpoints, so it looks as the layer did in every view:\n" +
        "  - below 768px (`@media (width < 768px)`, Tailwind's `max-md:`): corner radius 4px (change 1)\n" +
        "  - below 768px (`@media (width < 768px)`): gap 16px, made a real Stack (a flex column) there\n" +
        "  - 768px to 1279px (`@media (768px <= width < 1280px)`): in Title (`<h2 class=\"text-lg\">`), visibility hidden\n",
    );
    expect(section(output, 3)).not.toContain("Copied breakpoints");
  });
});

describe("claim, layout changes", () => {
  test("say sizes, spacing and alignment in design language", async () => {
    const change = (id: number, property: string, before: unknown, after: unknown) => ({ ...redFill, id, property, before, after, style: {} });
    saveRound(
      change(1, "width", { type: "hug" }, { type: "fixed", value: 120 }),
      change(2, "height", { type: "fixed", value: 40 }, { type: "fill" }),
      change(3, "padding", [8, 8, 8, 8], [0, 16, 0, 16]),
      change(4, "align", { x: "start", y: "start", distribute: false }, { x: "center", y: "end", distribute: true }),
      change(5, "maxWidth", null, 480),
      change(6, "visible", true, false),
      change(7, "x", 12, 40),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain("- **Design intent:** Change the width from Hug to Fixed 120px.\n");
    expect(section(output, 2)).toContain("- **Design intent:** Change the height from Fixed 40px to Fill.\n");
    expect(section(output, 3)).toContain("- **Design intent:** Change the padding from 8px to 0px top and bottom, 16px left and right.\n");
    expect(section(output, 4)).toContain("- **Design intent:** Change the alignment from top left to bottom center, spread evenly.\n");
    expect(section(output, 5)).toContain("- **Design intent:** Change the max width from none to 480px.\n");
    expect(section(output, 6)).toMatch(/^6\. Visibility\n[^]*- \*\*Design intent:\*\* Change the visibility from shown to hidden\.\n/);
    expect(section(output, 7)).toContain("- **Design intent:** Change the X position from 12px to 40px.\n");
  });

  test("a plain top-to-bottom flow whose gap changes is to be made a real Stack", async () => {
    saveRound({
      ...redFill,
      property: "gap",
      before: 0,
      after: 16,
      style: { display: "flex", "flex-direction": "column", gap: "16px" },
      asStack: true,
    });

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain("- **Design intent:** Change the gap from 0px to 16px.\n- **Make it a Stack:** the layer lays its children out as plain blocks, top to bottom");
    expect(notes).toContain("- **Reference style:** `display: flex`, `flex-direction: column`, `gap: 16px`\n");
  });
});

describe("claim, fills and strokes", () => {
  test("say gradients and strokes in design language, with the reference style that draws them", async () => {
    const change = (id: number, property: string, before: unknown, after: unknown, style: object) => ({ ...redFill, id, property, before, after, style });
    const stops = [
      { color: "#FF0000", opacity: 1, position: 0, unit: "%" },
      { color: "#0000FF", opacity: 0.5, position: 100, unit: "%" },
    ];
    const pc = (value: number) => ({ value, unit: "%" });
    const px = (value: number) => ({ value, unit: "px" });
    const middle = { x: pc(50), y: pc(50) };
    const spot = { center: { x: pc(30), y: pc(20) }, size: { x: px(20), y: px(20) } };
    saveRound(
      change(1, "fill", { type: "solid", color: "#FFFFFF", opacity: 1 }, { type: "linear", angle: 90, stops }, {
        "background-color": "transparent",
        "background-image": "linear-gradient(90deg, rgb(255 0 0 / 1) 0%, rgb(0 0 255 / 0.5) 100%)",
      }),
      change(2, "fill", { type: "linear", angle: 30, stops }, { type: "radial", ...spot, stops: [{ ...stops[0], position: 10, unit: "px" }, stops[1]] }, {}),
      change(3, "fill", { type: "radial", center: middle, size: { extent: "farthest-corner", circle: false }, stops }, { type: "linear", angle: 45, stops }, {}),
      change(4, "stroke", null, { color: "#E5E7EB", opacity: 1, weight: 1, style: "solid" }, {
        "border-width": "1px",
        "border-style": "solid",
        "border-color": "rgb(229 231 235 / 1)",
      }),
      change(5, "stroke", { color: "#E5E7EB", opacity: 1, weight: 1, style: "solid" }, { color: "#FF0000", opacity: 0.5, weight: [0, 0, 1, 4], style: "dashed" }, {}),
      change(6, "stroke", { color: "#E5E7EB", opacity: 1, weight: 2, style: "dashed" }, null, {}),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain(
      "- **Design intent:** Change the fill from #FFFFFF to a linear gradient at 90° (left to right): #FF0000 at 0%, #0000FF at 50% opacity at 100%.\n",
    );
    expect(section(output, 1)).toContain(
      "- **Reference style:** `background-color: transparent`, `background-image: linear-gradient(90deg, rgb(255 0 0 / 1) 0%, rgb(0 0 255 / 0.5) 100%)`\n",
    );
    expect(section(output, 2)).toContain(
      "Change the fill from a linear gradient at 30°: #FF0000 at 0%, #0000FF at 50% opacity at 100% to a radial gradient centered 30% across and 20% down, 20px out: #FF0000 at 10px, #0000FF at 50% opacity at 100%.\n",
    );
    expect(section(output, 3)).toContain(
      "Change the fill from a radial gradient from the middle out: #FF0000 at 0%, #0000FF at 50% opacity at 100% to a linear gradient at 45°: #FF0000 at 0%, #0000FF at 50% opacity at 100%.\n",
    );
    expect(section(output, 4)).toMatch(/^4\. Stroke\n[^]*- \*\*Design intent:\*\* Change the stroke from no stroke to 1px solid #E5E7EB\.\n/);
    expect(section(output, 4)).toContain("- **Reference style:** `border-width: 1px`, `border-style: solid`, `border-color: rgb(229 231 235 / 1)`\n");
    expect(section(output, 5)).toContain(
      "Change the stroke from 1px solid #E5E7EB to dashed #FF0000 at 50% opacity, on some sides: top 0px, right 0px, bottom 1px, left 4px.\n",
    );
    expect(section(output, 6)).toContain("Change the stroke from 2px dashed #E5E7EB to no stroke.\n");
  });

  test("say a radial gradient's center and size in design language, by keyword or across and down, or as the page has them", async () => {
    const pc = (value: number) => ({ value, unit: "%" });
    const px = (value: number) => ({ value, unit: "px" });
    const stops = [
      { color: "#FF0000", opacity: 1, position: 0, unit: "%" },
      { color: "#0000FF", opacity: 1, position: 100, unit: "%" },
    ];
    const radial = (center: object, size: object) => ({ type: "radial", center, size, stops });
    const solid = { type: "solid", color: "#FFFFFF", opacity: 1 };
    const change = (id: number, after: unknown) => ({ ...redFill, id, property: "fill", before: solid, after, style: {} });
    saveRound(
      change(1, radial({ x: pc(50), y: pc(50) }, { extent: "closest-side", circle: true })),
      change(2, radial({ x: px(40), y: pc(50) }, { extent: "farthest-corner", circle: false })),
      change(3, radial({ x: pc(0), y: pc(0) }, { x: pc(50), y: px(30) })),
      // Centered by calc(): kept as the page has it.
      change(4, { type: "radial", shape: "circle farthest-side at calc(100% - 10px) calc(100% - 20px)", stops }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain("to a radial gradient from the middle, a circle out to the closest side: #FF0000 at 0%, #0000FF at 100%.\n");
    expect(section(output, 2)).toContain("to a radial gradient centered 40px across and 50% down, an ellipse out to the farthest corner: #FF0000 at 0%, #0000FF at 100%.\n");
    expect(section(output, 3)).toContain("to a radial gradient centered 0% across and 0% down, out 50% across and 30px down: #FF0000 at 0%, #0000FF at 100%.\n");
    expect(section(output, 4)).toContain("to a radial gradient centered and sized as the page has it: #FF0000 at 0%, #0000FF at 100%.\n");
  });
});

describe("claim, corners and effects", () => {
  test("say corners, shadows and blurs in design language, with the reference style that draws them", async () => {
    const change = (id: number, property: string, before: unknown, after: unknown, style: object) => ({ ...redFill, id, property, before, after, style });
    const drop = { type: "drop", x: 0, y: 4, blur: 4, spread: 0, color: "#000000", opacity: 0.25 };
    const inner = { type: "inner", x: 0, y: -2, blur: 6, spread: 1, color: "#FF0000", opacity: 1 };
    saveRound(
      change(1, "radius", 12, [12, 12, 0, 0], { "border-radius": "12px 12px 0px 0px" }),
      change(2, "shadows", [], [drop, inner], { "box-shadow": "0px 4px 4px 0px rgb(0 0 0 / 0.25), inset 0px -2px 6px 1px rgb(255 0 0 / 1)" }),
      change(3, "shadows", [drop], [], { "box-shadow": "none" }),
      change(4, "layerBlur", null, 4, { filter: "blur(4px)" }),
      change(5, "backgroundBlur", 12, null, { "backdrop-filter": "none" }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain(
      "- **Design intent:** Change the corner radius from 12px to top-left 12px, top-right 12px, bottom-right 0px, bottom-left 0px.\n",
    );
    expect(section(output, 1)).toContain("- **Reference style:** `border-radius: 12px 12px 0px 0px`\n");
    expect(section(output, 2)).toMatch(/^2\. Shadows\n/);
    expect(section(output, 2)).toContain(
      "- **Design intent:** Change the shadows from no shadow to a drop shadow (x 0px, y 4px, blur 4px, spread 0px, #000000 at 25% opacity) and an inner shadow (x 0px, y -2px, blur 6px, spread 1px, #FF0000), the first on top.\n",
    );
    expect(section(output, 2)).toContain("- **Reference style:** `box-shadow: 0px 4px 4px 0px rgb(0 0 0 / 0.25), inset 0px -2px 6px 1px rgb(255 0 0 / 1)`\n");
    expect(section(output, 3)).toContain("Change the shadows from a drop shadow (x 0px, y 4px, blur 4px, spread 0px, #000000 at 25% opacity) to no shadow.\n");
    expect(section(output, 4)).toMatch(/^4\. Layer blur\n[^]*- \*\*Design intent:\*\* Change the layer blur from none to 4px\.\n/);
    expect(section(output, 4)).toContain("- **Reference style:** `filter: blur(4px)`\n");
    expect(section(output, 5)).toMatch(/^5\. Background blur\n[^]*- \*\*Design intent:\*\* Change the background blur from 12px to none\.\n/);
    expect(section(output, 5)).toContain("- **Reference style:** `backdrop-filter: none`\n");
  });

  test("say a text layer's drop shadows as shadows, with no spread, and text-shadow as the reference style", async () => {
    const change = (id: number, property: string, before: unknown, after: unknown, style: object) => ({ ...redFill, id, property, before, after, style });
    const drop = { type: "drop", x: 0, y: 4, blur: 4, spread: 0, color: "#000000", opacity: 0.25 };
    const red = { type: "drop", x: 2, y: -1, blur: 0, spread: 0, color: "#FF0000", opacity: 1 };
    saveRound(
      change(1, "textShadows", [], [drop, red], { "text-shadow": "0px 4px 4px rgb(0 0 0 / 0.25), 2px -1px 0px rgb(255 0 0 / 1)" }),
      change(2, "textShadows", [drop], [], { "text-shadow": "none" }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toMatch(/^1\. Shadows\n/);
    expect(section(output, 1)).toContain(
      "- **Design intent:** Change the shadows from no shadow to a drop shadow (x 0px, y 4px, blur 4px, #000000 at 25% opacity) and a drop shadow (x 2px, y -1px, blur 0px, #FF0000), the first on top.\n",
    );
    expect(section(output, 1)).toContain("- **Reference style:** `text-shadow: 0px 4px 4px rgb(0 0 0 / 0.25), 2px -1px 0px rgb(255 0 0 / 1)`\n");
    expect(section(output, 2)).toContain("Change the shadows from a drop shadow (x 0px, y 4px, blur 4px, #000000 at 25% opacity) to no shadow.\n");
  });
});

describe("claim, text", () => {
  const change = (id: number, property: string, before: unknown, after: unknown, style: object, more: object = {}) => ({ ...redFill, id, property, before, after, style, ...more });

  test("say each text style in design language, with the CSS that shows it as the reference style", async () => {
    saveRound(
      change(1, "fontFamily", "Georgia", "Space Grotesk", { "font-family": '"Space Grotesk", sans-serif' }),
      change(2, "fontWeight", 400, 600, { "font-weight": "600" }),
      change(3, "fontSize", 14, 18, { "font-size": "18px" }),
      change(4, "lineHeight", { value: 180, unit: "%" }, { value: 24, unit: "px" }, { "line-height": "24px" }),
      change(5, "lineHeight", "auto", { value: 150, unit: "%" }, { "line-height": "1.5" }),
      change(6, "letterSpacing", { value: 2, unit: "%" }, { value: -0.5, unit: "px" }, { "letter-spacing": "-0.5px" }),
      change(7, "textAlign", "left", "justify", { "text-align": "justify" }),
      change(8, "textColor", { color: "#57534D", opacity: 1 }, { color: "#FF0000", opacity: 0.5 }, { color: "rgb(255 0 0 / 0.5)" }),
      change(9, "textCase", "none", "upper", { "text-transform": "uppercase" }),
      change(10, "textDecoration", "none", "strikethrough", { "text-decoration-line": "line-through" }),
    );

    const output = (await cli("claim")).output;
    const intent = (id: number) => /- \*\*Design intent:\*\* (.*)\n/.exec(section(output, id))?.[1];

    expect([1, 2, 3, 4, 6, 7, 8, 9, 10].map((id) => /^\d+\. (.*)\n/.exec(section(output, id))?.[1])).toEqual([
      "Font",
      "Font weight",
      "Font size",
      "Line height",
      "Letter spacing",
      "Text alignment",
      "Text color",
      "Case",
      "Decoration",
    ]);
    expect(intent(1)).toBe("Change the font from Georgia to Space Grotesk.");
    expect(intent(2)).toBe("Change the font weight from Regular (400) to Semi Bold (600).");
    expect(intent(3)).toBe("Change the font size from 14px to 18px.");
    expect(intent(4)).toBe("Change the line height from 180% of the font size to 24px.");
    expect(intent(5)).toBe("Change the line height from Auto (the font's own) to 150% of the font size.");
    expect(intent(6)).toBe("Change the letter spacing from 2% of the font size to -0.5px.");
    expect(intent(7)).toBe("Change the text alignment from left to justified.");
    expect(intent(8)).toBe("Change the text color from #57534D to #FF0000 at 50% opacity.");
    expect(intent(9)).toBe("Change the case from as typed to upper case.");
    expect(intent(10)).toBe("Change the decoration from none to strikethrough.");
    expect(section(output, 1)).toContain('- **Reference style:** `font-family: "Space Grotesk", sans-serif`\n');
    expect(section(output, 5)).toContain("- **Reference style:** `line-height: 1.5`\n");
    expect(section(output, 10)).toContain("- **Reference style:** `text-decoration-line: line-through`\n");
  });

  test("say that the change is made on the text layer as a whole, and which inline fragments keep a value of their own", async () => {
    const keeps = [
      { element: '<a class="text-blue-600">', text: "a link", value: { color: "#2563EB", opacity: 1 } },
      { element: "<code>", text: "npm i", value: { color: "#000000", opacity: 1 } },
    ];
    saveRound(
      change(1, "textColor", { color: "#57534D", opacity: 1 }, { color: "#FF0000", opacity: 1 }, { color: "rgb(255 0 0 / 1)" }, { keeps }),
      change(2, "fontWeight", 400, 300, { "font-weight": "300" }, { keeps: [{ element: "<strong>", text: "any", value: 400 }] }),
      change(3, "fontSize", 14, 18, { "font-size": "18px" }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain(
      "- **Inline fragments:** make the change on the text layer as a whole: the bold runs, links and other fragments in it follow it. " +
        "These have a text color of their own, which they keep: “a link” (`<a class=\"text-blue-600\">`, #2563EB), “npm i” (`<code>`, #000000).\n",
    );
    expect(section(output, 2)).toContain("These have a font weight of their own, which they keep: “any” (`<strong>`, Regular (400)).\n");
    expect(section(output, 3)).not.toContain("Inline fragments");
  });
});

describe("claim, a Frame's only text", () => {
  /** The words of a button that draws a box around them and nothing else: a text layer in a Frame, written on the button's own element. */
  const close = { ...cards, loc: "src/components/Dialog.tsx:9:9", chain: [APP], component: "Dialog", instances: 1, onlyText: true, context: { path: ["Page", "Dialog", "Button", "Close"], element: '<button type="button" class="mt-4 px-3 py-1.5 text-sm text-white">', text: "Close" } };

  test("say the change is to the text in its Frame, written on the Frame's own element, which its words inherit it from", async () => {
    saveRound(
      { ...redFill, id: 1, target: close, property: "fontSize", before: 14, after: 18, style: { "font-size": "18px" } },
      { ...redFill, id: 2, kind: "text", target: close, property: "text", before: "Close", after: "Done", style: {} },
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain('- **Layer:** Close, the text in Button, `<button type="button" class="mt-4 px-3 py-1.5 text-sm text-white">` (Page › Dialog › Button › Close)\n');
    expect(section(output, 1)).toContain(
      "- **The Frame's only text:** the text is all Button draws inside it, and has no element of its own: write its text styles on Button's element itself, whose words inherit them, with no element around the text.\n",
    );
    expect(section(output, 2)).toContain('- **Layer:** Close, the text in Button, `<button type="button" class="mt-4 px-3 py-1.5 text-sm text-white">`');
    expect(section(output, 2)).not.toContain("The Frame's only text");
  });
});

describe("claim, Grids", () => {
  const grid = { ...cards, loc: "src/App.tsx:38:7", chain: [APP], component: "App", instances: 1, context: { path: ["Page", "Stack", "Grid"], element: '<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">' } };
  const list = { ...grid, loc: "src/App.tsx:20:7", context: { path: ["Page", "App", "Stack"], element: '<ul class="flex flex-col">' } };
  const style = (id: number, property: string, before: unknown, after: unknown, css: Record<string, string>) => ({ ...redFill, id, target: grid, property, before, after, style: css });
  const place = (container: object, layer: string, nth: number, isGrid: boolean) => ({ container: { layer, target: container, ...(isGrid && { grid: true }) }, nth, slot: nth - 1, absolute: null });
  const move = (id: number, before: object, after: object) => ({ ...redFill, id, kind: "move", property: "move", before, after, style: {}, sources: [] });

  test("columns are as many equal columns; the row gap and the column gap each change apart from the other", async () => {
    saveRound(
      style(1, "columns", 3, 2, { "grid-template-columns": "repeat(2, minmax(0, 1fr))" }),
      style(2, "rowGap", 16, 24, { "row-gap": "24px" }),
      style(3, "columnGap", 16, 8, { "column-gap": "8px" }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toMatch(/^1\. Columns\n/);
    expect(section(output, 1)).toContain(
      "- **Design intent:** Change the number of columns from 3 to 2.\n- **Equal columns:** each column takes an equal share of the Grid's width, as `grid-template-columns: repeat(2, minmax(0, 1fr))` does (Tailwind's `grid-cols-2`). Where its columns are sized some other way now, they become equal.\n",
    );
    expect(section(output, 2)).toMatch(/^2\. Row gap\n/);
    expect(section(output, 2)).toContain(
      "- **Design intent:** Change the row gap from 16px to 24px.\n- **Gap apart:** only the space between the Grid's rows changes, not the space between its columns. Where one value sets both now (Tailwind's `gap-*`, CSS `gap`), set them apart: `gap-y-*` and `gap-x-*` in Tailwind, `row-gap` and `column-gap` in CSS.\n",
    );
    expect(section(output, 3)).toContain("- **Design intent:** Change the column gap from 16px to 8px.\n- **Gap apart:** only the space between the Grid's columns changes, not the space between its rows.");
  });

  test("a layer reordered in a Grid takes another cell; one moved into a Grid, a cell of it", async () => {
    saveRound(move(1, place(grid, "4", 1, true), place(grid, "4", 3, true)), move(2, place(list, "5", 2, false), place(grid, "4", 2, true)));

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toMatch(/^1\. Reorder\n/);
    expect(section(output, 1)).toContain(
      "- **Design intent:** Move it from the 1st to the 3rd cell of its container, Grid (`<div class=\"grid grid-cols-1 gap-4 sm:grid-cols-3\">`, at `src/App.tsx:38:7`): the Grid fills its cells in the order its layers are written, so it is 3rd among them; the layers between move a cell along.\n",
    );
    expect(section(output, 2)).toContain("into the layout of Grid (`<div class=\"grid grid-cols-1 gap-4 sm:grid-cols-3\">`, at `src/App.tsx:38:7`), as its 2nd layer: the Grid's 2nd cell.\n");
  });
});

describe("claim, moves", () => {
  const list = { ...cards, loc: "src/App.tsx:20:7", chain: [APP], component: "App", instances: 1, context: { path: ["Page", "App", "Stack"], element: '<ul class="flex flex-col">' } };
  const board = { ...list, loc: "src/App.tsx:30:7", context: { path: ["Page", "App", "Frame"], element: '<div class="h-64">' } };
  const place = (container: object, layer: string, nth: number, absolute: object | null = null) => ({ container: { layer, target: container }, nth, slot: nth - 1, absolute });
  const move = (id: number, before: object, after: object, more: object = {}) => ({ ...redFill, id, kind: "move", property: "move", before, after, style: {}, sources: [], ...more });

  test("tell a reorder, a move into another container and an absolute placement apart, with where it goes", async () => {
    saveRound(
      move(1, place(list, "4", 3), place(list, "4", 1)),
      move(2, place(list, "4", 2), place(board, "9", 1)),
      move(3, place(list, "4", 1), place(board, "9", 2, { x: 40, y: 12 }), { style: { position: "absolute", left: "40px", top: "12px" } }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toMatch(/^1\. Reorder\n/);
    expect(section(output, 1)).toContain("- **Kind:** Reorder\n");
    expect(section(output, 1)).toContain(
      "- **Design intent:** Move it from 3rd to 1st place among the layers of its container, Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`).\n",
    );
    expect(section(output, 1)).toContain("- **Reference style:** none: only its place changes\n");
    expect(section(output, 1)).not.toContain("Currently set by");
    expect(section(output, 2)).toContain(
      "- **Design intent:** Move it out of the layout of Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`), where it is 2nd, into the layout of Frame (`<div class=\"h-64\">`, at `src/App.tsx:30:7`), as its 1st layer.\n",
    );
    expect(section(output, 3)).toMatch(/^3\. Absolute\n/);
    expect(section(output, 3)).toContain("place it absolute in Frame (`<div class=\"h-64\">`, at `src/App.tsx:30:7`), at X 40px and Y 12px from the Frame's top left");
    expect(section(output, 3)).toContain("Make the Frame its positioning reference (`position: relative`)");
  });

  test("a container inside a component says which usage of it", async () => {
    const inCard = { ...list, chain: [CARD_IN_LOOP, APP], component: "Card" };
    saveRound(move(1, place(inCard, "4", 2), place(inCard, "4", 1)));

    expect(section((await cli("claim")).output, 1)).toContain("at `src/App.tsx:20:7`, in Card used at `src/App.tsx:40:11`).");
  });

  test("a loop's instance moved is a data change; loose text moved is to be wrapped", async () => {
    saveRound(move(1, place(list, "4", 2), place(list, "4", 1), { data: true }), move(2, place(list, "4", 3), place(board, "9", 1), { wrap: true }));

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain("- **Data change:** the layer is one of the 3 instances a loop renders");
    expect(section(output, 2)).toContain("- **Wrap it:** the text has no element of its own");
  });
});

describe("claim, Stacks made and dissolved", () => {
  const board = { ...cards, loc: "src/App.tsx:30:7", chain: [APP], component: "App", instances: 1, context: { path: ["Page", "App", "Frame"], element: '<div class="relative h-64">' } };
  const layer = (name: string, loc: string, element: string) => ({ ...board, loc, context: { path: ["Page", "App", "Frame", name], element } });
  const title = layer("Freeze", "src/App.tsx:31:9", '<h3 class="font-bold">');
  const body = layer("Turn the page into a canvas.", "src/App.tsx:32:9", '<p class="text-sm">');
  const place = (nth: number, absolute: object | null = null) => ({ container: { layer: "4", target: board }, nth, slot: nth - 1, absolute });
  const settings = { direction: "horizontal", gap: 24, padding: [0, 0, 0, 0], align: { x: "start", y: "center", distribute: false } };
  const stack = (more: object) => ({ ...redFill, kind: "stack", property: "stack", target: board, before: null, sources: [], ...more });

  test("a new Stack: the layers it holds, in order, how it lays them out, and where it goes", async () => {
    saveRound(
      stack({
        layer: "7",
        after: { ...settings, place: place(1, { x: 20, y: 30 }), layers: [{ layer: "5", target: title, from: place(2, { x: 20, y: 30 }) }, { layer: "6", target: body, from: place(1, { x: 144, y: 30 }) }] },
        style: { display: "flex", "flex-direction": "row", gap: "24px", "align-items": "center", position: "absolute", left: "20px", top: "30px" },
      }),
    );

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toMatch(/^1\. Make Stack\n/);
    expect(notes).toContain("- **Layer:** a new Stack, in Frame (`<div class=\"relative h-64\">`, at `src/App.tsx:30:7`)\n");
    expect(notes).toContain("- **Location:** `src/App.tsx:30:7`\n");
    expect(notes).toContain(
      "- **Design intent:** Wrap these 2 layers, in this order, in a new Stack: horizontal, with a gap of 24px, no padding, aligned center left. " +
        "Place it absolute in Frame (`<div class=\"relative h-64\">`, at `src/App.tsx:30:7`), at X 20px and Y 30px from the Frame's top left (CSS `left` and `top`).\n" +
        "  1. Freeze (`<h3 class=\"font-bold\">`, at `src/App.tsx:31:9`)\n" +
        "  2. Turn the page into a canvas. (`<p class=\"text-sm\">`, at `src/App.tsx:32:9`)\n",
    );
    expect(notes).toContain("- **Join the layout:** the layers are placed absolute now. In the Stack, they are laid out by it: take their absolute positioning off.\n");
    expect(notes).toContain("- **Reference style:** `display: flex`, `flex-direction: row`, `gap: 24px`, `align-items: center`, `position: absolute`, `left: 20px`, `top: 30px`\n");
    expect(notes).not.toContain("Currently set by");
  });

  test("a Stack made in the layout, or of a Frame", async () => {
    saveRound(
      stack({ layer: "7", after: { ...settings, place: place(2), layers: [{ layer: "5", target: title, from: place(2) }] } }),
      stack({ id: 2, layer: "4", after: { ...settings, padding: [8, 16, 8, 16], place: null, layers: [{ layer: "5", target: title, from: place(1) }] } }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain("Put it in the layout of Frame (`<div class=\"relative h-64\">`, at `src/App.tsx:30:7`), as its 2nd layer, where the first of them was.\n");
    expect(section(output, 1)).not.toContain("Join the layout");
    expect(section(output, 2)).toContain("- **Layer:** Frame, `<div class=\"relative h-64\">` (Page › App › Frame)\n");
    expect(section(output, 2)).toContain(
      "- **Design intent:** Make this Frame a Stack: horizontal, with a gap of 24px, padding 8px top and bottom, 16px left and right, aligned center left. Its 1 layer goes in its layout, in this order:\n  1. Freeze",
    );
  });

  test("a dissolved Stack: what it was, the Frame it becomes, and where each of its layers is placed", async () => {
    saveRound({
      ...redFill,
      kind: "unstack",
      property: "unstack",
      layer: "4",
      target: board,
      before: { ...settings, direction: "vertical", gap: 10 },
      after: {
        width: 200,
        height: 80,
        layers: [
          { layer: "5", target: title, x: 0, y: 0, width: 200, height: 20, style: {} },
          { layer: "6", target: body, x: 0, y: 30, width: 180, height: 50, style: {} },
        ],
      },
      style: { display: "block", width: "200px", height: "80px", position: "relative" },
      sources: [{ properties: ["display", "flex-direction"], kind: "rule", selector: ".flex", file: null, layer: "utilities", important: false, className: "flex", declaration: "display: flex" }],
    });

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toMatch(/^1\. Dissolve Stack\n/);
    expect(notes).toContain(
      "- **Design intent:** Dissolve this Stack (vertical, with a gap of 10px, no padding, aligned center left): make it a Frame, Fixed 200 × 80px, " +
        "that is the positioning reference of its layers (`position: relative`), and place each of its layers absolute where it is, at its size (CSS `left` and `top` from the Frame's top left):\n" +
        "  1. Freeze (`<h3 class=\"font-bold\">`, at `src/App.tsx:31:9`): X 0px, Y 0px, 200 × 20px\n" +
        "  2. Turn the page into a canvas. (`<p class=\"text-sm\">`, at `src/App.tsx:32:9`): X 0px, Y 30px, 180 × 50px\n",
    );
    expect(notes).toContain("- **Currently set by:** class `flex`");
  });

  test("a change to a layer made this round says which change made it", async () => {
    const made = { ...board, loc: null, unlocated: false, made: "7", context: { path: ["Page", "App", "Frame", "Stack"], element: "<div>" } };
    saveRound(
      stack({ layer: "7", after: { ...settings, place: place(1), layers: [{ layer: "5", target: title, from: place(1) }] } }),
      { ...smallRadius, layer: "7", target: made },
    );

    const notes = section((await cli("claim")).output, 2);

    expect(notes).toContain("- **Location:** **New:** the layer is made in change 1, and is not in the source yet. Apply that change first, then change it there.\n");
    expect(notes).toContain("- **Currently set by:** nothing yet: the layer is new\n");
  });

  test("a change left to a layer made in a round before, its making applied then, says it is in the source now, to be found by its place on the page (ticket 68)", async () => {
    const made = { ...board, loc: null, unlocated: false, made: "7", context: { path: ["Page", "App", "Frame", "Stack"], element: "<div>" } };
    saveRound(
      stack({ layer: "7", after: { ...settings, place: place(1), layers: [{ layer: "5", target: title, from: place(1) }] } }),
      { ...smallRadius, layer: "7", target: made },
    );
    await cli("claim");
    await cli("done", "1");
    await cli("finish");

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain("- **Layer:** Stack, `<div>` (Page › App › Frame › Stack)\n");
    expect(notes).toContain(
      "- **Location:** **Made in a round before.** The layer was made by a change of an earlier round, applied then: it is in the source now, but the canvas has no source marker for it. Find it in the source from its place on the page, above.\n",
    );
    expect(notes).toContain("- **Currently set by:** unknown: the layer was made in a round before\n");
    // The round archived holds its own changes alone: not what the round before applied.
    await cli("finish");
    expect(history()[1].changeSet).not.toHaveProperty("applied");
  });

  test("a change made since to a layer made in a round before, every change left of that one discarded, says the same", async () => {
    const made = { ...board, loc: null, unlocated: false, made: "7", context: { path: ["Page", "App", "Frame", "Stack"], element: "<div>" } };
    saveRound(
      stack({ layer: "7", after: { ...settings, place: place(1), layers: [{ layer: "5", target: title, from: place(1) }] } }),
      { ...smallRadius, layer: "7", target: made },
    );
    await cli("claim");
    await cli("done", "1");
    await cli("finish");
    // The change left discarded, then the layer edited again: nothing of this round is carried over.
    writeFileSync(join(project, ".03kind/changeset.json"), JSON.stringify({ lastId: 1, changes: [{ ...smallRadius, id: 1, layer: "7", target: made, property: "opacity", before: 1, after: 0.5, style: { opacity: "0.5" } }] }));

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain("- **Location:** **Made in a round before.** ");
    expect(notes).not.toContain("not in the source yet");
    expect(notes).toContain("- **Currently set by:** unknown: the layer was made in a round before\n");
  });
});

describe("claim, new layers, words, deleting and copying", () => {
  const list = { ...cards, loc: "src/App.tsx:20:7", chain: [APP], component: "App", instances: 1, context: { path: ["Page", "App", "Stack"], element: '<ul class="flex flex-col">' } };
  const place = (nth: number, absolute: object | null = null, layer = "4", target: object = list) => ({ container: { layer, target }, nth, slot: nth - 1, absolute });
  const change = (id: number, kind: string, more: object) => ({ ...redFill, id, kind, layer: String(10 + id), target: list, before: null, style: {}, sources: [], ...more });
  const frameTarget = { ...list, loc: null, made: "11", context: { path: ["Page", "App", "Stack", "Frame"], element: "<div>" } };

  test("new text and a new Frame: what they are, where they go, and in what style; a brief and the sketch drawn in the Frame", async () => {
    saveRound(
      change(1, "create", {
        property: "new",
        after: { type: "frame", place: place(4), width: 200, height: 120, brief: "A pricing table with three plans" },
        style: { width: "200px", height: "120px" },
      }),
      change(2, "create", {
        property: "new",
        target: frameTarget,
        after: { type: "text", place: place(1, { x: 10, y: 12 }, "11", frameTarget), width: 160, height: null, text: "Plans" },
        style: { "font-size": "16px", width: "160px", position: "absolute", left: "10px", top: "12px" },
      }),
      change(3, "create", { property: "new", after: { type: "text", place: place(2), width: null, height: null, text: "Hello" }, style: { "font-size": "16px", margin: "0px" } }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toMatch(/^1\. New Frame\n/);
    expect(section(output, 1)).toContain("- **Layer:** a new Frame, in Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`)\n");
    expect(section(output, 1)).toContain("- **Design intent:** Add a Frame, Fixed 200 × 120px, with no fill, in the layout of Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`), as its 4th layer.\n");
    expect(section(output, 1)).toContain(
      "- **Brief:** “A pricing table with three plans”. Make what it asks for in this Frame, from the project's own components and styles, laid out as the sketch shows.\n",
    );
    expect(section(output, 1)).toContain("- **Sketch:** what the designer drew in the Frame, from its top left, shows the layout they have in mind:\n  - Text “Plans”: X 10px, Y 12px, 160px wide (change 2)\n");
    expect(section(output, 2)).toContain("- **Location:** **New:** the layer is made in change 1");
    expect(section(output, 2)).toContain("- **Sketch:** this layer is drawn in the Frame of change 1 as part of its sketch: follow the brief, with it as a guide to the layout, rather than writing it as it is.\n");
    expect(section(output, 3)).toMatch(/^3\. New text\n/);
    expect(section(output, 3)).toContain(
      "- **Design intent:** Add text that reads “Hello”, in the layout of Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`), as its 2nd layer. Give it the page's body text style, as the reference style shows, from what the page already uses for body text.\n",
    );
    expect(section(output, 3)).not.toContain("Sketch");
  });

  /** What How to write them says of a new Frame with a brief. */
  const briefRule = (notes: string) => /^- \*\*New Frame with a brief:\*\* (.*)$/m.exec(notes)?.[1] ?? "";
  const sketched = change(2, "create", {
    property: "new",
    target: frameTarget,
    after: { type: "text", place: place(1, { x: 10, y: 12 }, "11", frameTarget), width: 160, height: null, text: "Plans" },
  });

  test("a new Frame with a brief and nothing drawn in it: the notes say to lay it out within its size as the brief says, and name no sketch (ticket 65)", async () => {
    saveRound(change(1, "create", { property: "new", after: { type: "frame", place: place(4), width: 360, height: 80, brief: "A row of three partner logos" } }));

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain(
      "- **Brief:** “A row of three partner logos”. Make what it asks for in this Frame, from the project's own components and styles, laid out within its size as the brief says: the designer drew nothing in it.\n",
    );
    expect(briefRule(output)).toContain("laid out within the Frame's size as the brief says");
    expect(output).not.toMatch(/sketch/i);
  });

  test("a new Frame with a brief and a sketch: the notes say to lay it out as the sketch shows, as before; with another Frame of the round drawn in, that one is laid out within its size (ticket 65)", async () => {
    saveRound(change(1, "create", { property: "new", after: { type: "frame", place: place(4), width: 200, height: 120, brief: "Plans" } }), sketched);

    const rule = briefRule((await cli("claim")).output);

    expect(rule).toBe(
      "build what the brief asks for from the components and styles the project already has (its buttons, cards, type and colors), laid out as the sketch shows: the sketch is a guide to the layout, not words and boxes to copy. Say in the report what you made.",
    );

    saveRound(
      change(1, "create", { property: "new", after: { type: "frame", place: place(4), width: 200, height: 120, brief: "Plans" } }),
      sketched,
      change(3, "create", { property: "new", after: { type: "frame", place: place(5), width: 360, height: 80, brief: "Logos" } }),
    );
    const mixed = (await cli("claim")).output;

    expect(briefRule(mixed)).toContain("laid out as the sketch shows");
    expect(briefRule(mixed)).toContain("A Frame with nothing drawn in it is laid out within its size as the brief says.");
    expect(section(mixed, 1)).toContain("laid out as the sketch shows.\n");
    expect(section(mixed, 3)).toContain("laid out within its size as the brief says: the designer drew nothing in it.\n");
  });

  test("the sketch is as the designer left it: moved or resized since, and moved or copied into the Frame", async () => {
    saveRound(
      change(1, "create", { property: "new", after: { type: "frame", place: place(4), width: 200, height: 120, brief: "Plans" } }),
      change(2, "create", {
        property: "new",
        target: frameTarget,
        after: { type: "text", place: place(1, { x: 10, y: 12 }, "11", frameTarget), width: 160, height: null, text: "Plans" },
      }),
      change(3, "style", { layer: "12", property: "y", before: 12, after: 40 }),
      change(4, "move", { layer: "30", property: "move", before: place(1), after: place(2, { x: 0, y: 80 }, "11", frameTarget), target: { ...list, context: { path: ["Page", "Button"], element: "<button>" } } }),
    );

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain("\n  - Text “Plans”: X 10px, Y 40px, 160px wide (change 2)\n  - Button (moved in): X 0px, Y 80px (change 4)\n");
  });

  test("a copy of a new Frame is made by its brief too; a brief written anew on the copy takes the place of the one it was copied with", async () => {
    const copyTarget = { ...frameTarget, made: "13" };
    saveRound(
      change(1, "create", { property: "new", after: { type: "frame", place: place(4), width: 200, height: 120, brief: "A pricing table with three plans" } }),
      change(2, "duplicate", { property: "copy", target: frameTarget, before: place(4), after: place(5), brief: "A pricing table with three plans" }),
      change(3, "duplicate", { property: "copy", before: place(1), after: place(2) }),
      change(4, "brief", { layer: "13", property: "brief", target: copyTarget, before: "A pricing table with three plans", after: "A pricing table with two plans" }),
      change(5, "brief", { layer: "14", property: "brief", target: { ...copyTarget, made: "14" }, before: "A pricing table with three plans", after: "" }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 2)).toContain("- **Brief:** “A pricing table with three plans”, as the Frame it copies has it. Make what it asks for in the copy too, as in that Frame.\n");
    expect(section(output, 3)).not.toContain("Brief");
    expect(section(output, 4)).toContain("- **Brief:** “A pricing table with two plans”, in place of the brief the copy was made with, “A pricing table with three plans”\n");
    expect(section(output, 5)).toContain("- **Design intent:** Make this copy without what the brief it was copied with asks for: leave it a Frame as the designer drew it.\n");
    expect(section(output, 5)).toContain("- **Brief:** none: taken off, in place of the brief the copy was made with, “A pricing table with three plans”\n");
  });

  test("new words, and in a loop, new words that come from data", async () => {
    saveRound(
      change(1, "text", { property: "text", before: "Get started", after: "Start now" }),
      change(2, "text", { property: "text-1", before: "Card 2", after: "Second", target: cards, data: true }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toMatch(/^1\. Text\n/);
    expect(section(output, 1)).toContain("- **Design intent:** Change the text from “Get started” to “Start now”.\n");
    expect(section(output, 1)).toContain("- **Reference style:** none: only its words change\n");
    expect(section(output, 2)).toContain(
      "- **Data change:** the layer is one of the 3 instances a loop renders, each with words of its own: they come from the data the loop goes through. Change them there; if the data comes from outside the code (an API, a CMS), say so in the report.\n",
    );
  });

  test("an ungrouped layer: its layers moved out of it, then it alone deleted", async () => {
    saveRound(
      change(1, "move", { property: "move", before: place(1, null, "13"), after: place(2), kind: "move" }),
      change(2, "move", { property: "move", before: place(2, null, "13"), after: place(3), kind: "move" }),
      change(3, "delete", { property: "delete", before: place(2), after: null, style: { display: "none" } }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 3)).toContain(
      "- **Design intent:** Delete this layer, once its layers are out of it (changes 1, 2): only the layer itself goes, not what was in it, from Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`), where it is 2nd.\n",
    );
  });

  test("deleting and copying, and in a loop, as data changes", async () => {
    saveRound(
      change(1, "delete", { property: "delete", before: place(2), after: null, style: { display: "none" } }),
      change(2, "delete", { property: "delete-1", before: place(2), after: null, target: cards, data: true, style: { display: "none" } }),
      change(3, "duplicate", { property: "copy", before: place(1), after: place(2) }),
      change(4, "duplicate", { property: "copy", before: place(1), after: place(3, { x: 12, y: 8 }), style: { position: "absolute", left: "12px", top: "8px" } }),
      change(5, "duplicate", { property: "copy", before: place(2), after: place(3), target: cards, data: true }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toMatch(/^1\. Delete\n/);
    expect(section(output, 1)).toContain("- **Design intent:** Delete this layer, and all in it, from Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`), where it is 2nd.\n");
    expect(section(output, 1)).toContain("- **Reference style:** none: the layer goes\n");
    expect(section(output, 2)).toContain("- **Data change:** the layer is one of the 3 instances a loop renders: take its item out of the data the loop goes through.");
    expect(section(output, 3)).toMatch(/^3\. Duplicate\n/);
    expect(section(output, 3)).toContain("- **Design intent:** Copy this layer, with all in it, and put the copy in the layout of Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`), as its 2nd layer.\n");
    expect(section(output, 3)).toContain("- **Reference style:** none: the copy is as the layer is\n");
    expect(section(output, 4)).toContain("and place the copy absolute in Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`), at X 12px and Y 8px from its top left");
    expect(section(output, 5)).toContain("- **Data change:** the layer is one of the 3 instances a loop renders: add an item to the data the loop goes through, a copy of this one's, at the place given.");
  });

  test("a loop's instance copied, deleted or changed alone says which of the instances it is, and its words, as the page renders them (ticket 65)", async () => {
    const instance = { nth: 1, words: "Freeze Turn the current page into a canvas." };
    saveRound(
      change(1, "delete", { property: "delete-1", before: place(2), after: null, target: cards, data: true, style: { display: "none" }, instance: { nth: 2, words: "Arrange Drag layers." } }),
      change(2, "duplicate", { property: "copy", before: place(1), after: place(2), target: cards, data: true, instance }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain(
      "- **Data change:** the layer is one of the 3 instances a loop renders, the 2nd of them, which reads “Arrange Drag layers.”: take its item out of the data the loop goes through.",
    );
    expect(section(output, 2)).toContain(
      "- **Data change:** the layer is one of the 3 instances a loop renders, the 1st of them, which reads “Freeze Turn the current page into a canvas.”: add an item to the data the loop goes through, a copy of this one's, at the place given.",
    );
  });
});

describe("claim and done, a brief on a layer", () => {
  const brief = { ...redFill, id: 2, kind: "brief", property: "brief", before: null, after: "Bounce back harder when pressed", style: {} };

  test("a section of its own: the layer, where it is in the source, its scope, and the brief in the designer's words", async () => {
    saveRound(redFill, brief);

    const output = (await cli("claim")).output;

    expect(section(output, 2)).toBe(`2. Brief

- **Kind:** Brief
- **Layer:** Card, \`<article class="rounded-xl border bg-white p-5">\` (Page › Stack › Grid › Card)
- **Location:** \`src/components/Card.tsx:3:5\`
- **Scope:** This usage only: Card used at \`src/App.tsx:40:11\`, inside App used at \`src/main.tsx:8:5\`. It renders 3 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Achieve what the brief asks of this layer: something the Design panel cannot set. Do it the way the project already writes such things, within the scope given, and say in your report what you did.
- **Brief:** “Bounce back harder when pressed”
- **Reference style:** none: a brief is the designer's words, not a style

`);
  });

  test("done: not checked on the page, which has no value to check it by; the report is to say how it was achieved", async () => {
    saveRound(redFill, brief);
    await cli("claim");

    const { code, output } = await cli("done", "2");

    expect(code).toBe(0);
    expect(state()).toMatchObject({ done: [2] });
    expect(output).toBe(
      "Change 2 done: 1 of 2 changes applied.\n" +
        "Not checked on the page: a brief asks for what the Design panel cannot set, so the page has no value to check it by. " +
        "Say in your report how you achieved it: what you changed, and where.\n",
    );
  });
});

describe("claim, changes promoted to a component", () => {
  const promoted = { ...redFill, layer: "component src/components/Card.tsx:3:5", scope: "component", target: { ...cards, instances: 4 } };

  test("the scope is the component itself: its name and where it writes the layer, to change there for every usage", async () => {
    saveRound(promoted);

    const notes = section((await cli("claim")).output, 1);

    expect(notes).toContain(
      "- **Scope:** The component itself: Card. Change Card where it writes the layer, at Location (`src/components/Card.tsx:3:5`), so every usage of Card shows it, " +
        "not only the usage the designer made it on (`src/App.tsx:40:11`, inside App used at `src/main.tsx:8:5`). Changes listed for one usage only stay with that usage.\n",
    );
  });

  test("a brief written on a usage in place of the component's brief says so", async () => {
    const own = { ...redFill, id: 2, kind: "brief", property: "brief", before: "Lift on hover", after: "Lift higher", style: {} };
    saveRound({ ...promoted, kind: "brief", property: "brief", before: null, after: "Lift on hover", style: {} }, own);

    const notes = section((await cli("claim")).output, 2);

    expect(notes).toContain("- **Brief:** “Lift higher”, in place of the brief Card has as a whole (change 1), “Lift on hover”, at this usage.\n");
  });
});

describe("claim, layers off the canvas put back", () => {
  const list = { ...cards, loc: "src/App.tsx:20:7", chain: [APP], component: "App", instances: 1, context: { path: ["Page", "App", "Stack"], element: '<ul class="flex flex-col">' } };
  const place = (nth: number, absolute: object | null = null) => ({ container: { layer: "4", target: list }, nth, slot: nth - 1, absolute });
  const title = { ...list, loc: "src/App.tsx:21:9", context: { path: ["Page", "App", "Stack", "Title"], element: '<h1 class="text-4xl font-bold">' } };
  const snippet = { loc: "src/App.tsx:21:9", code: '<h1 className="text-4xl font-bold">\n  Vernier Kit\n</h1>' };
  const look =
    '<!DOCTYPE html><html><head><style data-vk-edit-styles="order">@layer vernierkit-edits;</style><style data-vk-look-styles="base">html,body{margin:0}</style>' +
    '<style data-vk-look-styles="">@import url("http://localhost:5173/src/index.css") layer(page);@font-face{font-family:"Inter";src:url("data:font/woff2;base64,AAAA")}' +
    '@font-face { font-family: "Space Grotesk"; src: url("http://localhost:5173/space-grotesk.woff2") format("woff2"); }[data-vk-look="0"]{font-size:36px;font-weight:700}</style></head>' +
    '<body><h1 data-vk-loc="src/App.tsx:21:9" data-vk-class="text-4xl font-bold" data-vk-look="0">Vernier Kit</h1></body></html>';
  const opacity = { ...redFill, id: 1, layer: "1", target: { ...title, context: { path: ["Title"], element: '<h1 class="text-4xl font-bold">' } }, property: "opacity", before: 1, after: 0.5, style: { opacity: "0.5" } };
  const kept = (more: object = {}) => ({
    id: "a1",
    x: -400,
    y: 0,
    look,
    origin: { target: title, place: place(1), written: "src/App.tsx:21:9", snippet, at: "2026-10-29T00:00:00.000Z" },
    edits: { lastId: 1, changes: [opacity] },
    ...more,
  });
  const putBack = (id: number, after: object) => ({ ...redFill, id, kind: "putBack", layer: String(10 + id), target: list, property: "put back", before: null, after, style: {}, sources: [] });

  test("a layer put back is written back from its source as it was, where it goes, with its look and what was edited off the canvas", async () => {
    saveRound(putBack(1, { place: place(3), layer: kept() }));

    const output = section((await cli("claim")).output, 1);

    expect(output).toMatch(/^1\. Put back\n/);
    expect(output).toContain("- **Layer:** Title, `<h1 class=\"text-4xl font-bold\">`, moved off the canvas, put back in Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`)\n");
    expect(output).toContain(
      "- **Design intent:** Put this layer back, moved off the canvas in an earlier round and deleted from the code then: write it as its source below has it, in the layout of Stack (`<ul class=\"flex flex-col\">`, at `src/App.tsx:20:7`), as its 3rd layer. Keep the source as it is; adjust it only where the code around it has changed (its props, what it imports).\n",
    );
    expect(output).toContain("- **Source**, as written at `src/App.tsx:21:9` when it was moved off the canvas:\n\n  ```tsx\n  <h1 className=\"text-4xl font-bold\">\n    Vernier Kit\n  </h1>\n  ```\n");
    expect(output).toContain("- **Look**, as it was off the canvas, every style it had written onto it");
    expect(output).toContain('[data-vk-look="0"]{font-size:36px;font-weight:700}');
    // Not the page's stylesheets and fonts, which it only loaded from.
    expect(output).not.toMatch(/@import|@font-face|base64|vernierkit-edits;|margin:0/);
    expect(output).toContain("- **Reference style:** none: it is to look as its look shows\n");
    expect(output).toContain("- **Edited off the canvas:** give it these too, as the designer made them there:\n  - Opacity of Title (`<h1 class=\"text-4xl font-bold\">`): Change the opacity from 100% to 50%.\n");
  });

  test("moved off and put back in the same round, its code is there still: it is moved, not deleted and written again; a layer whose source was not kept is written from its look", async () => {
    saveRound(
      { ...redFill, id: 1, kind: "delete", layer: "9", target: title, property: "delete", before: place(1), after: null, style: { display: "none" }, offCanvas: "a1" },
      putBack(2, { place: place(3, { x: 12, y: 8 }), layer: kept() }),
      putBack(3, { place: place(2), layer: kept({ id: "b2", origin: { target: title, place: null, written: null, snippet: null, at: "2026-10-29T00:00:00.000Z" }, edits: { lastId: 0, changes: [] } }) }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain("- **Put back:** the layer was moved off the canvas and is put back in change 2. Do not delete its code: move it to where change 2 puts it.\n");
    expect(section(output, 2)).toContain("moved off the canvas this round (change 1): its code is still where it was. Move that code here rather than deleting it and writing it again, absolute in Stack");
    expect(section(output, 3)).toContain("- **Source:** not kept: the layer had no source of its own when moved off the canvas. Write it from its look, below, as the project writes markup and styles.\n");
    expect(section(output, 3)).not.toContain("Edited off the canvas");
  });

  test("an off-canvas layer moved off as a copy, put back, is written as a copy: the layer it copies stays", async () => {
    saveRound(putBack(1, { place: place(2), layer: kept({ origin: { target: title, place: place(1), written: "src/App.tsx:21:9", snippet, copy: true, at: "2026-10-29T00:00:00.000Z" } }) }));

    const output = section((await cli("claim")).output, 1);

    expect(output).toContain(
      "- **Design intent:** Put a copy of this layer here: the off-canvas layer put back is a copy of it, so the layer it copies stays where it is. Write it as its source below has it, in the layout of Stack",
    );
    expect(output).not.toContain("deleted");
    expect(output).not.toMatch(/set aside|aside (beside|off)/i);
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
    expect(output).toBe("Change 2 done: 1 of 2 changes applied.\nNot checked on the page: no page with Vernier Kit is open. That is no error: go on.\n");
  });

  test("refuses a number that is not a change of the round, or a round not claimed", async () => {
    saveRound(redFill);
    expect(await cli("done", "1")).toEqual({ code: 1, output: "", errors: "The round is not claimed: run `npx 03kind claim` first.\n" });
    await cli("claim");

    expect(await cli("done", "7")).toEqual({ code: 1, output: "", errors: "There is no change 7 in this round. Its changes are: 1.\n" });
    expect(state()).toEqual({ status: "claimed", done: [], claimedAt: expect.any(String), code: null });
  });
});

/** The rounds archived in `.03kind/history/`, oldest first: their ChangeSets and how each ended. */
function history() {
  const dir = join(project, ".03kind/history");
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
 * `answer(id)`, as the editor layer does through the local service. `saw`:
 * what the page says it saw as the code changed, the moment an ask comes,
 * before it answers (`answerAfter` ms later).
 */
function openPage(answer: (id: number) => object | null, pages = 1, { saw, answerAfter = 0 }: { saw?: (id: number) => object; answerAfter?: number } = {}) {
  const dir = join(project, ".03kind");
  // The local service runs in this very process, as far as the command line can tell.
  // Written whole, as the service writes it: `done` reads the file in several steps, and must never see half of it.
  const write = (results: object) => {
    writeFileSync(join(dir, "checks.json.tmp"), JSON.stringify({ pages, service: process.pid, results }));
    renameSync(join(dir, "checks.json.tmp"), join(dir, "checks.json"));
  };
  let results: Record<string, object> = {};
  write(results);
  const heard = new Map<string, number>();
  /** What was last written in answer to each ask, by its key and change id: written again only when it changes, as a page does. */
  const given = new Map<string, string>();
  const timer = setInterval(() => {
    let round;
    try {
      round = state();
    } catch {
      return; // `finish` taking it away as it was read.
    }
    // What `claim` asks of a round carried over, `done` asks, and `finish` before it ends the round.
    for (const check of [round?.opening, round?.check, round?.closing]) {
      if (!check) continue;
      if (!heard.has(check.key)) {
        heard.set(check.key, performance.now() + answerAfter);
        if (saw) {
          results = { ...results, ...Object.fromEntries(check.ids.map((id: number) => [id, { at: new Date().toISOString(), ...saw(id) }])) };
          write(results);
        }
      }
      if (performance.now() < heard.get(check.key)!) continue;
      for (const id of check.ids) {
        const result = answer(id);
        if (!result) continue;
        // Not again and again, as `done` and `finish` both ask for the change: written after `finish` has archived the round, it would come back.
        const answered = JSON.stringify(result);
        if (given.get(`${check.key} ${id}`) === answered) continue;
        given.set(`${check.key} ${id}`, answered);
        results = { ...results, [id]: { at: new Date().toISOString(), answers: check.key, ...result } };
        write(results);
      }
    }
  }, 20);
  return () => clearInterval(timer);
}

/** As the open page writes what it saw as the code changed, with no `done` asking: `results` by change id, checked now. */
function pageSaw(results: Record<number, object>, pages = 1) {
  const at = new Date().toISOString();
  writeFileSync(
    join(project, ".03kind/checks.json"),
    JSON.stringify({ pages, service: process.pid, results: Object.fromEntries(Object.entries(results).map(([id, result]) => [id, { at, ...result }])) }),
  );
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

    // Done, but not shown: it does not count as applied.
    expect(first.output).toBe(
      "Change 1 done: 0 of 2 changes applied.\n" +
        "Checked on the page: it does not show the change. The fill is #DC2626, not #FF0000 at 50% opacity, as the browser computes `background-color` on the layer. " +
        "Something overrides your change: see what sets the value in the notes (Currently set by), fix it, and run `npx 03kind done 1` again.\n",
    );
    expect(again.output).toBe("Change 1 done: 1 of 2 changes applied.\nChecked on the page: it shows the change.\n");
  });

  test("for a deletion, a reorder and an absolute placement, says what the page shows instead", async () => {
    const list = { ...cards, loc: "src/App.tsx:20:7", instances: 1 };
    const place = (nth: number, absolute: object | null = null) => ({ container: { layer: "4", target: list }, nth, slot: nth - 1, absolute });
    saveRound(
      { ...redFill, kind: "delete", property: "delete", before: place(2), after: null, style: { display: "none" } },
      { ...redFill, id: 2, kind: "move", property: "move", before: place(3), after: place(1), style: {} },
      { ...redFill, id: 3, layer: "5", kind: "move", property: "move", before: place(2), after: place(3, { x: 40, y: 12 }), style: {} },
    );
    await cli("claim");
    closePage = openPage((id) => ({ outcome: "not shown", actual: id === 3 ? { x: 0, y: 0 } : null }));

    expect((await cli("done", "1")).output).toContain(
      "it does not show the change. The layer is still on the page: take it out of the code (for a data change, its item out of the data), and run `npx 03kind done 1` again.\n",
    );
    expect((await cli("done", "2")).output).toContain("Its container's layers are in another order on the page: put it 1st, as the notes say, and run `npx 03kind done 2` again.\n");
    expect((await cli("done", "3")).output).toContain("The layer is at X 0px and Y 0px, not absolute at X 40px and Y 12px: check its `position`, `left` and `top`");
    closePage();
    closePage = openPage(() => ({ outcome: "not shown", actual: "no reference" }));
    expect((await cli("done", "3")).output).toContain("The layer is placed absolute, but not from its container: make the container its positioning reference (`position: relative`)");
  });

  test("for a layer placed absolute, and its Y, the page drawing it off the canvas by its margins: says so, and what to keep", async () => {
    const hero = { ...cards, loc: "src/App.tsx:19:7", instances: 1 };
    const place = (nth: number, absolute: object | null = null) => ({ container: { layer: "4", target: hero }, nth, slot: nth - 1, absolute });
    saveRound(
      { ...redFill, layer: "5", kind: "move", property: "move", before: place(2), after: place(2, { x: 0, y: 488 }), style: {}, margins: { x: 0, y: 24 } },
      { ...redFill, id: 2, layer: "6", property: "y", before: 368, after: 488, style: { top: "488px" }, margins: { x: 0, y: 24 } },
      { ...redFill, id: 3, layer: "7", kind: "move", property: "move", before: place(3), after: place(3, { x: 40, y: 12 }), style: {}, margins: { x: 2, y: 6 } },
    );
    await cli("claim");
    closePage = openPage((id) => ({
      outcome: "not shown",
      actual: id === 1 ? { x: 0, y: 488, margins: { x: 0, y: 0 } } : id === 2 ? { value: 488, margin: 0 } : { x: 0, y: 0, margins: { x: 2, y: 6 } },
    }));

    expect((await cli("done", "1")).output).toContain(
      "it does not show the change. The layer is drawn at X 0px and Y 488px in its container (`left` 0px and `top` 488px, margins none), " +
        "where the canvas draws it at X 0px and Y 512px (its X and Y are its `left` and `top`, 0px and 488px, and it keeps its margins, 24px top). " +
        "Its `left` and `top` are right, but not its margins: keep the margins it has on the canvas (what sets them, such as `mt-6` or `margin-top`), or add them to `left` and `top`, and run `npx 03kind done 1` again.\n",
    );
    expect((await cli("done", "2")).output).toContain(
      "it does not show the change. The Y position is drawn at 488px in its container (`top` 488px, top margin 0px), " +
        "where the canvas draws it at 512px (its Y is its `top`, 488px, and it keeps its 24px top margin). " +
        "Its `top` is right, but not its margin: keep the margin it has on the canvas (what sets it, such as `mt-6` or `margin-top`), or add it to `top`, and run `npx 03kind done 2` again.\n",
    );
    closePage();
    closePage = openPage((id) => ({ outcome: "not shown", width: 390, actual: id === 2 ? { value: 470, margin: 0 } : { x: 0, y: 470, margins: { x: 0, y: 0 } } }));
    expect((await cli("done", "1")).output).toContain(
      "it does not show the change. At 390px wide, the layer is drawn at X 0px and Y 470px in its container (`left` 0px and `top` 470px, margins none), " +
        "where the canvas places it at X 0px and Y 488px, its `left` and `top`, and keeps its margins (24px top in the desktop view; at this width, the margins the project's breakpoints give it). " +
        "Check its `position`, `left` and `top`, and that its container is its positioning reference, then run `npx 03kind done 1` again.\n",
    );
    expect((await cli("done", "2")).output).toContain(
      "it does not show the change. At 390px wide, the Y position is drawn at 470px in its container (`top` 470px, top margin 0px), " +
        "where the canvas places it at 488px, its `top`, and keeps its top margin (24px in the desktop view; at this width, the margin the project's breakpoints give it). " +
        "Check its `position` and `top`, and that its container is its positioning reference, then run `npx 03kind done 2` again.\n",
    );
    closePage();
    closePage = openPage((id) => ({ outcome: "not shown", actual: id === 1 ? { x: 0, y: 488, margins: { x: 0, y: 0 } } : id === 2 ? { value: 488, margin: 0 } : { x: 0, y: 0, margins: { x: 2, y: 6 } } }));
    expect((await cli("done", "3")).output).toContain(
      "The layer is drawn at X 2px and Y 6px in its container (`left` 0px and `top` 0px, margins 2px left and 6px top), " +
        "where the canvas draws it at X 42px and Y 18px (its X and Y are its `left` and `top`, 40px and 12px, and it keeps its margins, 2px left and 6px top). " +
        "Check its `position`, `left` and `top`, and that its container is its positioning reference, then run `npx 03kind done 3` again.\n",
    );
  });

  test("several changes at once: each marked done, each with how the page checked it", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    closePage = openPage((id) => (id === 2 ? { outcome: "not shown", actual: 12 } : { outcome: "shown" }));

    const { code, output } = await cli("done", "1", "2");

    expect(code).toBe(0);
    expect(state()).toMatchObject({ done: [1, 2] });
    expect(output).toBe(
      "Changes 1 and 2 done: 1 of 2 changes applied.\n" +
        "Change 1: checked on the page: it shows the change.\n" +
        "Change 2: checked on the page: it does not show the change. The corner radius is 12px, not 4px, as the browser computes `border-radius` on the layer. " +
        "Something overrides your change: see what sets the value in the notes (Currently set by), fix it, and run `npx 03kind done 2` again.\n",
    );
  });

  test("what the page saw as the code changed, in the very millisecond done asks, is no answer to it: done waits for the page's answer", async () => {
    // One clock that never moves: the page's look and the ask, both at the same millisecond.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-31T02:06:21.127Z") });
    try {
      saveRound(redFill, smallRadius);
      await cli("claim");
      closePage = openPage(() => ({ outcome: "shown" }), 1, { saw: () => ({ outcome: "not shown", actual: { type: "solid", color: "#FFFFFF", opacity: 1 } }), answerAfter: 300 });

      const { output } = await cli("done", "1");

      expect(output).toBe("Change 1 done: 1 of 2 changes applied.\nChecked on the page: it shows the change.\n");
    } finally {
      vi.useRealTimers();
    }
  });

  test("with no page open now, a change a page showed this round, as the code changed, is shown", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    pageSaw({ 1: { outcome: "shown" } }, 0);

    const started = Date.now();
    const { output } = await cli("done", "1");

    expect(output).toBe("Change 1 done: 1 of 2 changes applied.\nChecked on the page: it shows the change.\n");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("a change not shown at another width says at which, and what to look at", async () => {
    saveRound(redFill);
    await cli("claim");
    closePage = openPage(() => ({ outcome: "not shown", actual: { type: "solid", color: "#FFFFFF", opacity: 1 }, width: 390 }));

    expect((await cli("done", "1")).output).toContain(
      "Checked on the page: it does not show the change. At 390px wide, the fill is #FFFFFF, not #FF0000 at 50% opacity, as the browser computes `background-color` on the layer. " +
        "The change applies at every width: see what sets the value at that width (a breakpoint variant such as `sm:`, a media query), fix it, and run `npx 03kind done 1` again.\n",
    );
  });

  test("a change at a range in parts, not shown in one of them, says at which width, and that the change applies there too (ticket 65)", async () => {
    const PHONE = { min: null, max: 768, project: { tailwind: "max-md:" } };
    const parts = [
      { breakpoint: { min: null, max: 640, project: { tailwind: "max-sm:" } }, before: 1 },
      { breakpoint: { min: 640, max: 768, project: { tailwind: "sm:max-md:" } }, before: 3 },
    ];
    saveRound({ ...redFill, property: "columns", before: 1, after: 2, style: { "grid-template-columns": "repeat(2, minmax(0, 1fr))" }, breakpoint: PHONE, parts });
    await cli("claim");
    closePage = openPage(() => ({ outcome: "not shown", actual: 3, width: 640 }));

    expect((await cli("done", "1")).output).toContain(
      "Checked on the page: it does not show the change. At 640px wide, the number of columns is 3, not 2, as the browser computes `grid-template-columns` on the layer. " +
        "The change applies below 768px only, at that width too: see what sets the value at that width (a breakpoint variant such as `sm:`, a media query), fix it, and run `npx 03kind done 1` again.\n",
    );
  });

  test("says why when the page could not check it", async () => {
    saveRound(redFill);
    await cli("claim");
    closePage = openPage(() => ({ outcome: "unchecked", reason: "the layer is not on the page now" }));

    expect((await cli("done", "1")).output).toContain("\nNot checked on the page: the layer is not on the page now. That is no error: go on.\n");
  });

  test("of two pages, waits for the one that can check, while the other cannot", async () => {
    saveRound(redFill);
    await cli("claim");
    const since = Date.now();
    // The page that shows the layer needs a moment for the dev server; the other answers at once.
    closePage = openPage(() => (Date.now() - since > 300 ? { outcome: "shown" } : { outcome: "unchecked", reason: "the layer is not on the page now" }), 2);

    expect((await cli("done", "1")).output).toContain("Checked on the page: it shows the change.");
  });

  test("of two pages, does not wait for the other when the change is one no page can check", async () => {
    saveRound(redFill);
    await cli("claim");
    closePage = openPage(() => ({ outcome: "unchecked", reason: "the layer is new this round, so the page has no marker to find it by", anyPage: true }), 2);

    const started = Date.now();
    expect((await cli("done", "1")).output).toContain("Not checked on the page: the layer is new this round");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("does not wait for pages of a local service that is no longer running", async () => {
    saveRound(redFill);
    await cli("claim");
    writeFileSync(join(project, ".03kind/checks.json"), JSON.stringify({ pages: 1, service: 999999, results: {} }));

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
      join(project, ".03kind/checks.json"),
      JSON.stringify({ pages: 0, service: process.pid, results: { 1: { at: "2000-01-01T00:00:00.000Z", outcome: "not shown", actual: null } } }),
    );
    await cli("done", "1");

    expect(finished((await cli("finish")).output)).toBe("Round finished: 1 of 1 change applied.\n");
    expect(history()[0].result.checks).toEqual({});
  });

  test("finish names the changes the page did not show, and archives the checks", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    closePage = openPage((id) => (id === 2 ? { outcome: "not shown", actual: 12 } : { outcome: "shown" }));
    await cli("done", "1");
    await cli("done", "2");

    const { output } = await cli("finish");

    expect(finished(output)).toBe("Round finished: 1 of 2 changes applied. The page does not show: 2.\n",
    );
    expect(history()[0].result.checks).toMatchObject({ 1: { outcome: "shown" }, 2: { outcome: "not shown", actual: 12 } });
    // Change 2 is carried over to the next round (ticket 68): the open page is still counted, with none of this round's checks.
    expect(JSON.parse(readFileSync(join(project, ".03kind/checks.json"), "utf8"))).toMatchObject({ pages: 1, results: {} });
  });
});

describe("progress, as the page shows it", () => {
  let closePage = () => {};
  afterEach(() => closePage());

  test("a change the page shows counts as applied, done or not; one marked done that it does not show does not; one it cannot check counts once done", async () => {
    const brief = { ...redFill, id: 3, kind: "brief", property: "brief", before: null, after: "Lift on hover", style: {} };
    saveRound(redFill, smallRadius, brief);
    await cli("claim");
    await cli("done", "2", "3");
    // The page that saw them is closed now: what it saw stands.
    pageSaw({ 1: { outcome: "shown" }, 2: { outcome: "not shown", actual: 12 } }, 0);

    const { output } = await cli("finish");

    expect(finished(output)).toBe("Round finished: 2 of 3 changes applied. The page does not show: 2.\n");
    expect(history()[0].result).toMatchObject({ done: [2, 3], applied: [1, 3] });
    expect(section((await cli("last")).output, 1)).toContain("- **Status:** Applied\n");
    expect(section((await cli("last")).output, 2)).toContain("- **Status:** Not applied\n");
  });

  test("finish has the open page look at every change it can once more, and its answer is the round's result: a change undone by a later edit is not applied", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    pageSaw({ 1: { outcome: "shown" }, 2: { outcome: "shown" } });
    let closing = false;
    closePage = openPage((id) => (state()?.closing ? ((closing = true), id === 1 ? { outcome: "not shown", actual: { type: "solid", color: "#FFFFFF", opacity: 1 } } : { outcome: "shown" }) : null));

    const { output } = await cli("finish");

    expect(closing).toBe(true);
    expect(finished(output)).toBe("Round finished: 1 of 2 changes applied. The page does not show: 1.\n");
    expect(history()[0].result).toMatchObject({ applied: [2] });
  });
});

describe("finish", () => {
  let closePage = () => {};
  afterEach(() => closePage());

  test("archives the round with what was done, and leaves no round behind, so the designer can start the next", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "1");
    await cli("done", "2");

    const { code, output } = await cli("finish");

    expect(code).toBe(0);
    expect(finished(output)).toBe("Round finished: 2 of 2 changes applied.\n");
    expect(readdirSync(join(project, ".03kind"))).toEqual(["history"]);
    expect(history()).toEqual([
      {
        changeSet: { lastId: 2, changes: [redFill, smallRadius] },
        result: { ended: "finished", done: [1, 2], applied: [1, 2], at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/), checks: {}, code: null },
      },
    ]);
  });

  test("names the changes not marked done, for the report", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "2");

    const { output } = await cli("finish");

    expect(finished(output)).toBe("Round finished: 1 of 2 changes applied. Not marked done: 1.\n");
    expect(history()[0].result.done).toEqual([2]);
  });

  test("ends with the round's report laid out: each change under the heading the page's checks put it under, those under ⚠️ with why and instead (ticket 65)", async () => {
    const words = { ...redFill, id: 3, kind: "text", property: "text", before: "Vernier Kit", after: "Vernier Studio", style: {}, target: { ...cards, instances: 1 } };
    const brief = { ...redFill, id: 4, kind: "brief", property: "brief", before: null, after: "Bounce back harder", style: {} };
    saveRound(redFill, smallRadius, words, brief);
    await cli("claim");
    closePage = openPage((id) => (id === 2 ? { outcome: "not shown", actual: 12, width: 390 } : id === 3 ? { outcome: "unchecked", reason: "the text has no element of its own on the page" } : { outcome: "shown" }));
    await cli("done", "1", "2", "4");

    const { output } = await cli("finish");

    const [first, ...rest] = output.split("\n");
    expect(first).toBe("Round finished: 2 of 4 changes applied. Not marked done: 3. The page does not show: 2.");
    expect(rest.join("\n")).toBe(
      "\nEnd your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.\n\n" +
        "```\n" +
        "✓ Applied\n" +
        "- 1. Fill: <the layer, and what you changed>\n" +
        "- 4. Brief: <the layer, and what you changed>\n" +
        "\n" +
        "⚠️ Not applied 1:1\n" +
        "- 2. Corner radius: <the layer>\n" +
        "  Why: at 390px wide, the page shows the corner radius 12px, not 4px: <what keeps it so>\n" +
        "  Instead: <what you did, or “left as it was”>\n" +
        "- 3. Text: <the layer>\n" +
        "  Why: <why it is not applied>\n" +
        "  Instead: <what you did, or “left as it was”>\n" +
        "```\n\n" +
        "- 4 the page cannot check: keep it under ✓ if you applied it exactly as asked; if not, move it under ⚠️, with Why and Instead.\n" +
        REPORT_RULES,
    );
  });

  test("with every change shown on the page, the report has no ⚠️ section", async () => {
    saveRound(redFill);
    await cli("claim");
    closePage = openPage(() => ({ outcome: "shown" }));
    await cli("done", "1");

    const form = (await cli("finish")).output;

    expect(form).toContain("```\n✓ Applied\n- 1. Fill: <the layer, and what you changed>\n```\n");
    expect(form).not.toContain("⚠️ Not applied");
  });

  test("the Skill is the way through a round and the report only: a third as long as before ticket 65 at most (146 lines, 24935 characters)", () => {
    const skill = readFileSync(join(import.meta.dirname, "../skill/SKILL.md"), "utf8");

    expect(skill.split("\n").length).toBeLessThanOrEqual(146 / 3);
    expect(skill.length).toBeLessThanOrEqual(24935 / 3);
  });

  test("the Skill gives the report's rules in the very words finish does", () => {
    expect(readFileSync(join(import.meta.dirname, "../skill/SKILL.md"), "utf8")).toContain(REPORT_RULES);
  });

  test("refuses a round that is not claimed", async () => {
    saveRound(redFill);

    expect(await cli("finish")).toEqual({ code: 1, output: "", errors: "The round is not claimed: run `npx 03kind claim` first.\n" });
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

describe("changes not applied, carried over to the next round on the same canvas (ticket 68)", () => {
  let closePage = () => {};
  afterEach(() => closePage());
  const halfOpacity = { ...redFill, id: 3, property: "opacity", before: 1, after: 0.5, style: { opacity: "0.5" } };
  const changeSet = () => JSON.parse(readFileSync(join(project, ".03kind/changeset.json"), "utf8"));

  test("finish with changes not applied keeps them, numbered from 1 in their order, and the canvas; the applied ones are archived and kept apart, for the canvas to take in", async () => {
    saveRound(redFill, smallRadius, halfOpacity);
    await cli("claim");
    await cli("done", "2");

    const { output } = await cli("finish");

    expect(finished(output)).toBe("Round finished: 1 of 3 changes applied. Not marked done: 1, 3.\n");
    expect(readdirSync(join(project, ".03kind")).sort()).toEqual(["canvas.html", "changeset.json", "history"]);
    // The archive keeps the whole round, as before: `last` is as it was.
    expect(history()[0].changeSet).toEqual({ lastId: 3, changes: [redFill, smallRadius, halfOpacity] });
    expect(changeSet()).toEqual({
      lastId: 2,
      changes: [
        { ...redFill, id: 1, carried: true },
        { ...halfOpacity, id: 2, carried: true },
      ],
      applied: [smallRadius],
    });
  });

  test("with every change applied, nothing is kept and the canvas goes, as before", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "1", "2");
    await cli("finish");
    expect(readdirSync(join(project, ".03kind"))).toEqual(["history"]);
  });

  /** A round that ended with changes 1 and 3 of three not applied; the designer then made one more, numbered after them. */
  async function carriedRound() {
    saveRound(redFill, smallRadius, halfOpacity);
    await cli("claim");
    await cli("done", "2");
    await cli("finish");
    const next = changeSet();
    const shadow = { ...redFill, id: 3, property: "blur", before: 0, after: 4, style: { filter: "blur(4px)" } };
    writeFileSync(join(project, ".03kind/changeset.json"), JSON.stringify({ ...next, lastId: 3, changes: [...next.changes, shadow] }));
    return shadow;
  }

  test("the next claim gives the changes left and those made since, numbered on from 1, and says which were left, as claim run again says what is applied (ticket 67)", async () => {
    const shadow = await carriedRound();

    const { output } = await cli("claim");

    expect(output).toMatch(/^# Design changes to apply\n\nThis round carries 2 changes over from the round before, not applied then \(1 and 2\), and none of its 3 changes are applied yet\. Left: 3 changes, made by the designer in Vernier Kit\. Apply them/);
    expect(changeSections(output)).toBe(changeSections((await describeOnly({ ...redFill, id: 1 }, { ...halfOpacity, id: 2 }, shadow)).output));
  });

  test("with a page open, the claim asks it what it shows now: a change it shows is applied already, the others go from the value it shows now to theirs", async () => {
    await carriedRound();
    closePage = openPage((id) => (id === 2 ? { outcome: "shown" } : { outcome: "not shown", actual: { type: "solid", color: "#DC2626", opacity: 1 } }));

    const { output } = await cli("claim");

    expect(state().opening.ids).toEqual([1, 2]);
    expect(output).toContain(
      "This round carries 2 changes over from the round before, not applied then (1 and 2), and 1 of its 3 changes is applied already (2), as the designer's page shows it. Left: 2 changes, made by the designer in Vernier Kit.",
    );
    expect(section(output, 2)).toBe("");
    expect(section(output, 1)).toContain("- **Design intent:** Change the fill from #DC2626 to #FF0000 at 50% opacity.\n");
    // As read, it stays: claim run again, and `last` once the round is over, say the same.
    expect(changeSet().changes[0].before).toEqual({ type: "solid", color: "#DC2626", opacity: 1 });
    expect((await cli("done", "2")).output).toBe("Change 2 done: 1 of 3 changes applied.\nChecked on the page: it shows the change.\n");
  });

  /** A round of `changes` ended with change 1 applied alone: the others carried over, from 1. */
  async function carriedOver(...changes: object[]) {
    saveRound(...changes);
    await cli("claim");
    await cli("done", "1");
    await cli("finish");
  }

  test("an X carried over goes from the X the page shows now: its `left`, the margin kept apart", async () => {
    const x = { ...redFill, id: 2, property: "x", before: 10, after: 40, style: { left: "40px", right: "auto" }, margins: { x: 8, y: 0 } };
    const placed = { ...redFill, id: 3, property: "absolute", before: null, after: { x: 40, y: 50 }, style: { position: "absolute", left: "40px", top: "50px" }, margins: { x: 8, y: 0 } };
    await carriedOver({ ...smallRadius, id: 1 }, x, placed);
    closePage = openPage((id) => (id === 1 ? { outcome: "not shown", actual: { value: 32, margin: 8 } } : { outcome: "not shown", actual: { x: 5, y: 6, margins: { x: 8, y: 0 } } }));

    const { output } = await cli("claim");

    expect(section(output, 1)).toContain("- **Design intent:** Change the X position from 32px to 40px.\n");
    expect(output).not.toContain("[object Object]");
    expect(changeSet().changes.map((change: { before: unknown }) => change.before)).toEqual([32, { x: 5, y: 6 }]);
  });

  test("an X the page does not place absolute now keeps the X it went from", async () => {
    const x = { ...redFill, id: 2, property: "x", before: 10, after: 40, style: { left: "40px", right: "auto" }, margins: { x: 8, y: 0 } };
    await carriedOver({ ...smallRadius, id: 1 }, x);
    // In the layout: what the page reads is its `left` as CSS sets it, no X (null when \`auto\`).
    closePage = openPage(() => ({ outcome: "not shown", actual: 0 }));

    const { output } = await cli("claim");

    expect(section(output, 1)).toContain("- **Design intent:** Change the X position from 10px to 40px.\n");
    // A round of one change says so.
    expect(output).toContain("not applied then (1), and its 1 change is not applied yet. Left: 1 change");
  });

  test("a change at a range in parts carried over goes from what the page shows in them now, the same in every part too", async () => {
    const PHONE = { min: null, max: 768, project: { tailwind: "max-md:" } };
    const parts = (before: number) => [
      { breakpoint: { min: null, max: 640, project: { tailwind: "max-sm:" } }, before },
      { breakpoint: { min: 640, max: 768, project: { tailwind: "sm:max-md:" } }, before },
    ];
    await carriedOver(redFill, { ...smallRadius, breakpoint: PHONE, parts: parts(12) });
    // As the page read the parts again, the code as it is, before the claim.
    const next = changeSet();
    writeFileSync(join(project, ".03kind/changeset.json"), JSON.stringify({ ...next, changes: [{ ...next.changes[0], parts: parts(8) }] }));
    closePage = openPage(() => ({ outcome: "not shown", actual: 8 }));

    const { output } = await cli("claim");

    expect(section(output, 1)).toContain("- **Design intent:** Change the corner radius from 8px to 4px.\n");
    expect(changeSet().changes[0].before).toBe(8);
  });

  test("what sets a change's value carried over is read again from the page with the value, in the same ask; with no page open, it is as it was", async () => {
    const was = { properties: ["border-top-left-radius"], kind: "rule", selector: ".rounded-xl", file: "src/index.css", layer: null, important: false, className: "rounded-xl", declaration: null };
    const now = { ...was, selector: ".rounded-lg", className: "rounded-lg" };
    await carriedOver(redFill, { ...smallRadius, sources: [was] });
    expect(section((await describeClaimOf(changeSet())), 1)).toContain("class `rounded-xl`");
    closePage = openPage(() => ({ outcome: "not shown", actual: 8, sources: [now] }));

    const { output } = await cli("claim");

    expect(state().opening.ids).toEqual([1]);
    expect(section(output, 1)).toContain("class `rounded-lg`");
    expect(section(output, 1)).not.toContain("class `rounded-xl`");
    expect(changeSet().changes[0].sources).toEqual([now]);
  });

  test("with every change left shown on the page now, says to finish the round", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "2");
    await cli("finish");
    closePage = openPage(() => ({ outcome: "shown" }));

    const { output } = await cli("claim");

    expect(output).toBe(
      "This round carries 1 change over from the round before, not applied then (1), and its 1 change is applied already, as the designer's page shows it: run `npx 03kind finish` to end it.\n",
    );
  });
});

describe("claim, again", () => {
  // The designer tells an Agent that stopped to go on (ticket 67): it gets what is left, as the page counts it (ADR 0013).
  const halfOpacity = { ...redFill, id: 3, property: "opacity", before: 1, after: 0.5, style: { opacity: "0.5" } };

  test("gives only the changes not applied yet: those neither shown on the page nor done; the round stays as it was", async () => {
    saveRound(redFill, smallRadius, halfOpacity);
    await cli("claim");
    await cli("done", "1");
    pageSaw({ 2: { outcome: "shown" } });

    const { code, output } = await cli("claim");

    expect(code).toBe(0);
    expect(state()).toMatchObject({ status: "claimed", done: [1] });
    expect(changeSections(output)).toBe(changeSections((await describeOnly(halfOpacity)).output));
    expect(output).toContain("This round is claimed already, and 2 of its 3 changes are applied (1 and 2), as the designer's page shows them or as you reported them done. Left: 1 change, made by the designer");
    expect(output).not.toContain("**Status:**");
  });

  test("says of one change applied that it is", async () => {
    saveRound(redFill, smallRadius, halfOpacity);
    await cli("claim");
    await cli("done", "1");

    const { output } = await cli("claim");

    expect(output).toContain("This round is claimed already, and 1 of its 3 changes is applied (1), as the designer's page shows them or as you reported them done. Left: 2 changes, made by the designer");
  });

  test("gives again a change done that the page does not show", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "1");
    pageSaw({ 1: { outcome: "not shown", actual: null } });

    const { output } = await cli("claim");

    expect(section(output, 1)).not.toBe("");
    expect(section(output, 2)).not.toBe("");
    expect(output).toContain("This round is claimed already, and none of its 2 changes are applied yet. Left: 2 changes, made by the designer");
  });

  test("with every change applied, says to finish the round", async () => {
    saveRound(redFill, smallRadius);
    await cli("claim");
    await cli("done", "1", "2");

    const { code, output } = await cli("claim");

    expect(code).toBe(0);
    expect(output).toBe("This round is claimed already, and all 2 of its changes are applied, as the designer's page shows them or as you reported them done: run `npx 03kind finish` to end it.\n");
  });
});

/** What `claim` gives for a round saved as `changeSet`, in another project, with no page open. */
async function describeClaimOf(changeSet: { changes: object[] }) {
  return (await describeOnly(...changeSet.changes)).output;
}

/** What `claim` gives for a round of these changes alone, in another project. */
async function describeOnly(...changes: object[]) {
  const other = project;
  project = mkdtempSync(join(tmpdir(), "03kind-cli-"));
  try {
    saveRound(...changes);
    return await cli("claim");
  } finally {
    rmSync(project, { recursive: true, force: true });
    project = other;
  }
}

describe("a claimed state left without its round", () => {
  // As when `done` writes the state back just after the designer unlocked the round.
  test("does not keep the round claimed", async () => {
    mkdirSync(join(project, ".03kind"), { recursive: true });
    writeFileSync(join(project, ".03kind/state.json"), JSON.stringify({ status: "claimed", done: [1] }));

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
    // `.03kind/` is not ignored here, and a binary file changes too.
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

  test("done tells the page when the code was last edited, so it waits for that edit to reach it", async () => {
    git("init", "-q");
    writeFileSync(join(project, "Card.tsx"), "export const Card = () => null;\n");
    saveRound(redFill);
    await cli("claim");
    writeFileSync(join(project, "Card.tsx"), 'export const Card = () => <article className="bg-red-500/50" />;\n');
    const edited = Math.floor(statSync(join(project, "Card.tsx")).mtimeMs);

    await cli("done", "1");

    expect(state().check).toMatchObject({ ids: [1], codeAt: edited });
  });

  test("outside a git repository, last gives the notes only", async () => {
    saveRound(redFill);
    await cli("claim");
    await cli("finish");

    expect((await cli("last")).output).not.toContain("git ");
  });
});

describe("claim, Variables", () => {
  const change = (id: number, property: string, before: unknown, after: unknown, variables: object) => ({ ...redFill, id, property, before, after, style: {}, variables });
  const gutter = { name: "gutter", group: "spacing", value: "1.375rem", from: "tailwind", own: true };
  const brand = { name: "brand-500", group: "color", value: "oklch(55% 0.2 265)", from: "tailwind", css: "var(--color-brand-500)", own: true };
  const danger = { name: "--danger", group: "color", value: "#FF0000", from: "css", css: "var(--danger)", own: true };
  const rounded = { name: "DEFAULT", group: "radius", value: "0.25rem", from: "tailwind", own: false };

  test("name the Variable a value is, picked or typed, and how the code uses it: a Tailwind class, or var()", async () => {
    saveRound(
      change(1, "gap", 8, 22, { "": { ...gutter, picked: true } }),
      change(2, "fill", { type: "solid", color: "#FFFFFF", opacity: 1 }, { type: "solid", color: "#3D63F5", opacity: 1 }, { color: brand }),
      change(3, "textColor", { color: "#000000", opacity: 1 }, { color: "#FF0000", opacity: 1 }, { "": { ...danger, picked: true } }),
      change(4, "radius", 12, 4, { "": rounded }),
      change(5, "rowGap", 8, 22, { "": gutter }),
      change(6, "columnGap", 8, 23, { "": null }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain(
      "- **Design intent:** Change the gap from 8px to 22px.\n- **Variables:** the gap is the Variable `gutter`, from the Tailwind theme: use its class, `gap-gutter`.\n",
    );
    expect(section(output, 2)).toContain(
      "- **Variables:** the fill color is the Variable `brand-500`, from the Tailwind theme: use its class, `bg-brand-500` (in CSS, `var(--color-brand-500)`).\n",
    );
    expect(section(output, 3)).toContain("- **Variables:** the text color is the Variable `--danger`, a CSS variable: use `var(--danger)`.\n");
    expect(section(output, 4)).toContain("- **Variables:** the corner radius is the Variable `DEFAULT`, from the Tailwind theme: use its class, `rounded`.\n");
    // A Grid's gaps, each its own way.
    expect(section(output, 5)).toContain("- **Variables:** the row gap is the Variable `gutter`, from the Tailwind theme: use its class, `gap-y-gutter`.\n");
    expect(section(output, 6)).toContain("- **Variables:** no Variable has the column gap's value: use the exact value (with Tailwind, an arbitrary value: `gap-x-[23px]`)");
  });

  test("say so when no Variable has the value: the exact value, never a class close to it; part by part", async () => {
    saveRound(
      change(1, "gap", 8, 23, { "": null }),
      change(2, "padding", [0, 0, 0, 0], [22, 23, 0, 0], { top: gutter, right: null, bottom: null, left: null }),
      change(4, "stroke", null, { color: "#3D63F5", opacity: 0.5, weight: 1, style: "solid" }, { color: null }),
      change(3, "fill", null, { type: "linear", angle: 90, stops: [
        { color: "#FF0000", opacity: 1, position: 0, unit: "%" },
        { color: "#123456", opacity: 1, position: 100, unit: "%" },
      ] }, { "stop 1": danger, "stop 2": null }),
      change(5, "shadows", [], [
        { type: "drop", x: 0, y: 4, blur: 4, spread: 0, color: "#3D63F5", opacity: 1 },
        { type: "drop", x: 0, y: 1, blur: 2, spread: 0, color: "#000000", opacity: 0.25 },
      ], { "": null, "shadow 1": brand, "shadow 2": null }),
      change(6, "textShadows", [], [{ type: "drop", x: 0, y: 1, blur: 2, spread: 0, color: "#FF0000", opacity: 1 }], { "shadow 1": danger }),
    );

    const output = (await cli("claim")).output;

    expect(section(output, 1)).toContain(
      "- **Variables:** no Variable has the gap's value: use the exact value (with Tailwind, an arbitrary value: `gap-[23px]`), not a class or Variable whose value is close.\n",
    );
    expect(section(output, 2)).toContain(
      "- **Variables:** the top padding is the Variable `gutter`, from the Tailwind theme: use its class, `pt-gutter`. No Variable has the right padding's value: use the exact value (with Tailwind, an arbitrary value: `pr-[23px]`), not a class or Variable whose value is close. No Variable has the bottom padding's value: use the exact value (with Tailwind, an arbitrary value: `pb-[0px]`), not a class or Variable whose value is close. No Variable has the left padding's value: use the exact value (with Tailwind, an arbitrary value: `pl-[0px]`), not a class or Variable whose value is close.\n",
    );
    // A see-through color, with its opacity.
    expect(section(output, 4)).toContain("- **Variables:** no Variable has the stroke color's value: use the exact value (with Tailwind, an arbitrary value: `border-[#3D63F5]/50`)");
    expect(section(output, 3)).toContain(
      "- **Variables:** stop 1 of the fill is the Variable `--danger`, a CSS variable: use `var(--danger)`. No Variable has stop 2 of the fill's value: use the exact value (with Tailwind, an arbitrary value: `to-[#123456]`), not a class or Variable whose value is close.\n",
    );
    // A shadow's color, shadow by shadow, a text layer's too.
    expect(section(output, 5)).toContain(
      "The color of shadow 1 is the Variable `brand-500`, from the Tailwind theme: use its class, `shadow-brand-500` (in CSS, `var(--color-brand-500)`). No Variable has the color of shadow 2's value: use the exact value (with Tailwind, an arbitrary value: `shadow-[#000000]/25`), not a class or Variable whose value is close.\n",
    );
    expect(section(output, 6)).toContain("- **Variables:** the color of shadow 1 is the Variable `--danger`, a CSS variable: use `var(--danger)`.\n");
  });
});

describe("claim, a round saved before the instances of a layer shared their edit styles", () => {
  /** Saved by the code of then (ticket 60): `saved-round.browser.test.ts`. */
  const FIXTURE = join(import.meta.dirname, "fixtures/round-before-60");

  test("prints the notes of each change as it did then, word for word", async () => {
    mkdirSync(join(project, ".03kind"), { recursive: true });
    for (const file of ["canvas.html", "changeset.json", "off-canvas.json"]) writeFileSync(join(project, ".03kind", file), readFileSync(join(FIXTURE, file)));

    const { code, output } = await cli("claim");

    expect(code).toBe(0);
    // Written once, by the code of then: never over the one kept.
    if (process.env.VK_WRITE_FIXTURE && !existsSync(join(FIXTURE, "claim.md"))) writeFileSync(join(FIXTURE, "claim.md"), output);
    // What goes around the changes, the way through the round and how to write them, is of the notes of now (ticket 65).
    expect(changeSections(output)).toBe(changeSections(readFileSync(join(FIXTURE, "claim.md"), "utf8")));
  });
});
