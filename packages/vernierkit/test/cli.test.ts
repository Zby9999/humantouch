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
      { color: "#FF0000", opacity: 1, position: 0 },
      { color: "#0000FF", opacity: 0.5, position: 100 },
    ];
    saveRound(
      change(1, "fill", { type: "solid", color: "#FFFFFF", opacity: 1 }, { type: "linear", angle: 90, stops }, {
        "background-color": "transparent",
        "background-image": "linear-gradient(90deg, rgb(255 0 0 / 1) 0%, rgb(0 0 255 / 0.5) 100%)",
      }),
      change(2, "fill", { type: "linear", angle: 30, stops }, { type: "radial", shape: "circle at 30% 20%", stops }, {}),
      change(3, "fill", { type: "radial", shape: "", stops }, { type: "linear", angle: 45, stops }, {}),
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
      "Change the fill from a linear gradient at 30°: #FF0000 at 0%, #0000FF at 50% opacity at 100% to a radial gradient shaped and centered as the page has it (`circle at 30% 20%`): #FF0000 at 0%, #0000FF at 50% opacity at 100%.\n",
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
      "it does not show the change. The layer is still on the page: take it out of the code (for a data change, its item out of the data), and run `npx vernierkit done 1` again.\n",
    );
    expect((await cli("done", "2")).output).toContain("Its container's layers are in another order on the page: put it 1st, as the notes say, and run `npx vernierkit done 2` again.\n");
    expect((await cli("done", "3")).output).toContain("The layer is at X 0px and Y 0px, not absolute at X 40px and Y 12px: check its `position`, `left` and `top`");
    closePage();
    closePage = openPage(() => ({ outcome: "not shown", actual: "no reference" }));
    expect((await cli("done", "3")).output).toContain("The layer is placed absolute, but not from its container: make the container its positioning reference (`position: relative`)");
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
