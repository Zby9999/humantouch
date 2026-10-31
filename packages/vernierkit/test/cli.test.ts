import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

  test("a copy set aside off the canvas, put back, is written as a copy: the layer it copies stays", async () => {
    saveRound(putBack(1, { place: place(2), layer: kept({ origin: { target: title, place: place(1), written: "src/App.tsx:21:9", snippet, copy: true, at: "2026-10-29T00:00:00.000Z" } }) }));

    const output = section((await cli("claim")).output, 1);

    expect(output).toContain(
      "- **Design intent:** Put a copy of this layer here, set aside off the canvas as a copy: the layer it copies stays where it is. Write it as its source below has it, in the layout of Stack",
    );
    expect(output).not.toContain("deleted");
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
 * `answer(id)`, as the editor layer does through the local service. `saw`:
 * what the page says it saw as the code changed, the moment an ask comes,
 * before it answers (`answerAfter` ms later).
 */
function openPage(answer: (id: number) => object | null, pages = 1, { saw, answerAfter = 0 }: { saw?: (id: number) => object; answerAfter?: number } = {}) {
  const dir = join(project, ".vernier");
  // The local service runs in this very process, as far as the command line can tell.
  // Written whole, as the service writes it: `done` reads the file in several steps, and must never see half of it.
  const write = (results: object) => {
    writeFileSync(join(dir, "checks.json.tmp"), JSON.stringify({ pages, service: process.pid, results }));
    renameSync(join(dir, "checks.json.tmp"), join(dir, "checks.json"));
  };
  let results: Record<string, object> = {};
  write(results);
  const heard = new Map<string, number>();
  const timer = setInterval(() => {
    // What `done` asks, and `finish` before it ends the round.
    for (const check of [state()?.check, state()?.closing]) {
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
        const next = { at: new Date().toISOString(), answers: check.key, ...result };
        if (JSON.stringify(results[id]) === JSON.stringify(next)) continue;
        results = { ...results, [id]: next };
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
    join(project, ".vernier/checks.json"),
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
        "Its `left` and `top` are right, but not its margins: keep the margins it has on the canvas (what sets them, such as `mt-6` or `margin-top`), or add them to `left` and `top`, and run `npx vernierkit done 1` again.\n",
    );
    expect((await cli("done", "2")).output).toContain(
      "it does not show the change. The Y position is drawn at 488px in its container (`top` 488px, top margin 0px), " +
        "where the canvas draws it at 512px (its Y is its `top`, 488px, and it keeps its 24px top margin). " +
        "Its `top` is right, but not its margin: keep the margin it has on the canvas (what sets it, such as `mt-6` or `margin-top`), or add it to `top`, and run `npx vernierkit done 2` again.\n",
    );
    closePage();
    closePage = openPage((id) => ({ outcome: "not shown", width: 390, actual: id === 2 ? { value: 470, margin: 0 } : { x: 0, y: 470, margins: { x: 0, y: 0 } } }));
    expect((await cli("done", "1")).output).toContain(
      "it does not show the change. At 390px wide, the layer is drawn at X 0px and Y 470px in its container (`left` 0px and `top` 470px, margins none), " +
        "where the canvas places it at X 0px and Y 488px, its `left` and `top`, and keeps its margins (24px top in the desktop view; at this width, the margins the project's breakpoints give it). " +
        "Check its `position`, `left` and `top`, and that its container is its positioning reference, then run `npx vernierkit done 1` again.\n",
    );
    expect((await cli("done", "2")).output).toContain(
      "it does not show the change. At 390px wide, the Y position is drawn at 470px in its container (`top` 470px, top margin 0px), " +
        "where the canvas places it at 488px, its `top`, and keeps its top margin (24px in the desktop view; at this width, the margin the project's breakpoints give it). " +
        "Check its `position` and `top`, and that its container is its positioning reference, then run `npx vernierkit done 2` again.\n",
    );
    closePage();
    closePage = openPage((id) => ({ outcome: "not shown", actual: id === 1 ? { x: 0, y: 488, margins: { x: 0, y: 0 } } : id === 2 ? { value: 488, margin: 0 } : { x: 0, y: 0, margins: { x: 2, y: 6 } } }));
    expect((await cli("done", "3")).output).toContain(
      "The layer is drawn at X 2px and Y 6px in its container (`left` 0px and `top` 0px, margins 2px left and 6px top), " +
        "where the canvas draws it at X 42px and Y 18px (its X and Y are its `left` and `top`, 40px and 12px, and it keeps its margins, 2px left and 6px top). " +
        "Check its `position`, `left` and `top`, and that its container is its positioning reference, then run `npx vernierkit done 3` again.\n",
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
        "Change 2: checked on the page: it does not show the change. The corner radius is 12px, not 4px. " +
        "Something overrides your change: see what sets the value in the notes (Currently set by), fix it, and run `npx vernierkit done 2` again.\n",
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
      "Checked on the page: it does not show the change. At 390px wide, the fill is #FFFFFF, not #FF0000 at 50% opacity. " +
        "The change applies at every width: see what sets the value at that width (a breakpoint variant such as `sm:`, a media query), fix it, and run `npx vernierkit done 1` again.\n",
    );
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
      "Round finished: 1 of 2 changes applied. The page does not show: 2. Report them as not applied 1:1, with why.\n",
    );
    expect(history()[0].result.checks).toMatchObject({ 1: { outcome: "shown" }, 2: { outcome: "not shown", actual: 12 } });
    expect(existsSync(join(project, ".vernier/checks.json"))).toBe(false);
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

    expect(output).toBe("Round finished: 2 of 3 changes applied. The page does not show: 2. Report them as not applied 1:1, with why.\n");
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
    expect(output).toBe("Round finished: 1 of 2 changes applied. The page does not show: 1. Report them as not applied 1:1, with why.\n");
    expect(history()[0].result).toMatchObject({ applied: [2] });
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
        result: { ended: "finished", done: [1, 2], applied: [1, 2], at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/), checks: {}, code: null },
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

  test("prints the change notes as it did then, word for word", async () => {
    mkdirSync(join(project, ".vernier"), { recursive: true });
    for (const file of ["canvas.html", "changeset.json", "off-canvas.json"]) writeFileSync(join(project, ".vernier", file), readFileSync(join(FIXTURE, file)));

    const { code, output } = await cli("claim");

    expect(code).toBe(0);
    // Written once, by the code of then: never over the one kept.
    if (process.env.VK_WRITE_FIXTURE && !existsSync(join(FIXTURE, "claim.md"))) writeFileSync(join(FIXTURE, "claim.md"), output);
    expect(output).toBe(readFileSync(join(FIXTURE, "claim.md"), "utf8"));
  });
});
