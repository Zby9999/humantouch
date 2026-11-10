/**
 * The bench's standard scenarios on the Vite + React 19 + Tailwind v4
 * example (`SCENARIOS`; with those on the other examples, `STANDARD_SCENARIOS`
 * in `scenarios-other-examples.ts`): rounds a designer makes in the editor
 * layer, for an Agent to apply. Every
 * kind of change is in one at least, breakpoint changes and layers moved off
 * the canvas and put back included. Each change says what the page shows once
 * it is applied, in words (for a person running the round by hand, ticket 24)
 * and as a test the bench runs on the page.
 *
 * The scenarios drive the editor layer as a designer does; the e2e test
 * `bench-scenarios.spec.ts` checks they still make the changes they name.
 * The scenarios on the other examples are in `scenarios-other-examples.ts`,
 * with the helpers here.
 */
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import type { Bindings, Change } from "../../packages/03kind/src/client/changeset.ts";
import { checkable as pageChecks, PLACING } from "../../packages/03kind/src/client/checkable.ts";
import { TOGGLE_LABEL } from "../playwright.config.ts";
import type { VariableNames } from "./metrics.ts";

/** What a scenario's designer works with: the page, and the project behind it. */
export interface Desk {
  /** The page, at 1280 × 720, with the editor layer and its Layers panel shown. */
  page: Page;
  /** Runs `npx 03kind …` in the project, as an Agent would. */
  cli(...args: string[]): Promise<string>;
  /** Replaces `from` with `to` in a file of the project (path from its root), as an Agent would; throws when `from` is not there. */
  edit(file: string, from: string, to: string): Promise<void>;
  /** Makes what is in the project now the code a round starts from (a commit, in the bench's copy). */
  settle(message: string): Promise<void>;
  /** The round's ChangeSet as saved in `.03kind/`, or null. */
  changeSet(): { changes: SavedChange[] } | null;
  /** Runs a shell command line in the project, as an Agent would: the bench's copy only (the e2e test has none), for `apply`. */
  shell?(command: string): Promise<string>;
}

/** A change as the ChangeSet saves it; the bench reads only these. */
export interface SavedChange {
  id: number;
  kind: Change["kind"];
  property?: string;
  after?: any;
  /** A layer placed by its X and Y: the margins the canvas draws it past them by. */
  margins?: { x: number; y: number };
  /** A change at a breakpoint: its range, and the parts of it the page was read in (null: yet to be read; none: the range is one part). */
  breakpoint?: object;
  parts?: object[] | null;
  /** Which part of its value is which Variable (null: none has it), for a value that is or could be one. */
  variables?: Bindings;
}

/**
 * Whether the page shows the change: run in the page, at each of `widths`.
 * Self-contained (it is sent to the page as its source); `change` is the
 * change as saved.
 */
export type Shows = (arg: { change: SavedChange; width: number }) => boolean;

export interface ScenarioChange {
  /** As the ChangeSet has it. */
  kind: Change["kind"];
  /** What the page shows once it is applied, in words. */
  expect: string;
  /** Whether the editor layer's page check can tell it (the Skill's list): not a Stack made or dissolved, a move into another container, a copy, a layer put back, a brief; a new layer is, by its place (ticket 76), and new words, by what the layer reads (ticket 90). */
  checkable: boolean;
  /**
   * The Variable the notes name for it, as the code may write it (its Tailwind class, or its CSS variable): the bench looks for one of these
   * in the lines the Agent added. For a value of several parts each its own Variable (a padding of four sides), a list of parts, each one of
   * its own names, all of them to be written (`VariableNames`).
   */
  variable?: VariableNames;
  /**
   * In place of `variable`, for a value that is a Variable the code writes already and is to keep (a Stack's gap, its Grid's now,
   * ticket 118): its names, as `variable`'s are. With nothing of it to write, the Agent's diff counts as using it unless it takes
   * the name out and writes none of them in (`keepsVariable`: `gap-3` rewritten as `gap-[12px]` is a miss).
   */
  variableKept?: VariableNames;
  /** The page widths `shows` runs at; 1280 when not given. */
  widths?: number[];
  /** None for a brief: what it takes is the Agent's to work out, and the report's to say. A change `notOneToOne` has one: an Agent that finds a way after all is right to list it under ✓, and one that lists it there with the page not showing it gives a false ✓. */
  shows?: Shows;
  /**
   * Why the change cannot be applied 1:1 (ticket 86), in words: an Agent
   * applying the round right lists it under ⚠️ in its report, with why and
   * what instead, or under ✓ only when the page shows it all the same. The
   * bench counts how often it is (`reportedAsExpected`), and leaves it out of
   * the 1:1 rates.
   */
  notOneToOne?: string;
}

/**
 * What holds of the scenario as a whole once the Agent is through, apart from
 * its changes (ticket 86): what an earlier round applied staying applied, or
 * a round undone. One the page tests (`shows`), the project's source, or both.
 */
export interface ScenarioExpectation {
  /** What holds, in words. */
  expect: string;
  /** Whether it holds before the Agent starts too (what the Agent must leave as it is); else it must not hold yet. */
  kept?: true;
  /** The page widths `shows` runs at; 1280 when not given. */
  widths?: number[];
  /** Whether the page shows it: run in the page as a change's `shows` is, self-contained. */
  shows?: (arg: { width: number }) => boolean;
  /**
   * Whether the project's source, `.03kind/` aside, is as at the commit the
   * round starts from (`git diff` shows nothing, and no file is new). The
   * bench's copy only: the e2e test checks the page alone.
   */
  sourceAsAtStart?: true;
}

/** The example projects a scenario can run on: folders of `examples/`. */
export type Example = "vite-react19-tw4" | "vite-react18-tw3" | "next-app-css-modules";

export interface Scenario {
  id: string;
  /** The example project it runs on; the Vite + React 19 + Tailwind v4 one when not given. */
  example?: Example;
  /** What the designer does, in words. */
  title: string;
  /** Makes the round in the editor layer, and waits until it is saved. */
  design(desk: Desk): Promise<void>;
  /** The changes the Agent is to apply; none for a scenario whose ask is other than applying a round (an undo). */
  changes: ScenarioChange[];
  /** What the designer says to the Agent, when not the bench's own ask to apply the round (`PROMPT`): in the designer's words. */
  prompt?: string;
  /** What holds of the scenario as a whole at the end, apart from its changes: its own expectations, not the page's checks (核对). */
  expectations?: ScenarioExpectation[];
  /**
   * Writes the round into the code as an Agent applying it right would,
   * once it is claimed (`desk.edit`), for the bench's scripted pass
   * (`pnpm bench:agents --scripted`): every change shows by its own test then,
   * so a test that cannot hold is found before an Agent is measured by it.
   * Changes `notOneToOne` are left as they were.
   */
  apply?(desk: Desk): Promise<void>;
}

/** The example project a scenario runs on. */
export const exampleOf = (scenario: Scenario): Example => scenario.example ?? "vite-react19-tw4";

export const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
export const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
export const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
export const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
export const layer = (page: Page, name: string, nth = 0) => page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth);

export async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await desktop(page).contentFrame().locator("article").first().waitFor();
  await phone(page).contentFrame().locator("article").first().waitFor();
}

/**
 * A field of the Design panel to type into. A value the code writes with a
 * Variable shows it by name (ticket 119): detached, as in Figma, the field is
 * there. Gone already, it may be: a test page detaches the code's Variables itself (`detachCodeVariables`).
 */
async function typeInto(page: Page, name: string) {
  const detach = design(page).getByRole("button", { name: `Detach ${name.toLowerCase()} variable`, exact: true });
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.or(detach).first().waitFor();
  if (await detach.isVisible()) await detach.click({ timeout: 2000 }).catch(() => {});
  return field;
}

export async function setField(page: Page, name: string, value: string) {
  const field = await typeInto(page, name);
  await field.fill(value);
  await field.press("Enter");
}

/** What a field of the Design panel has in it now, as a number. */
async function numberIn(page: Page, name: string) {
  return Number(await design(page).getByRole("textbox", { name, exact: true }).inputValue());
}

/** Picks the color Variable `name` for a color field (`Fill color`), as a designer finds it by typing its name in the field. */
async function pickColorVariable(page: Page, field: string, name: string) {
  const hex = await typeInto(page, field);
  await hex.click();
  await hex.press("ControlOrMeta+a");
  await hex.pressSequentially(name);
  await page.getByRole("listbox", { name: "Matching variables" }).getByRole("option", { selected: true, name, exact: true }).waitFor();
  await hex.press("Enter");
}

export async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Not on screen: ${locator}`);
  return box;
}

/**
 * Selects, in a view, the deepest layer just inside the top left of what `selector` finds there: the view is the one worked in from then on.
 * Pressed 14px in, in the page's px whatever the canvas's zoom: where 4px on screen was at the zoom the bench had before tuning round 1, whose
 * wider panels leave the canvas less room in the bench's 1280px window, and so a smaller zoom, where 4px reached the text inside a button.
 */
export async function pick(page: Page, view: Locator, selector: string) {
  const box = await boxOf(view.contentFrame().locator(selector).first());
  const zoom = await view.evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(box.x + 14 * zoom, box.y + 14 * zoom);
  await page.keyboard.up("ControlOrMeta");
}

/** Selects the cards' Grid in a view, a level up from its first card. */
async function pickGrid(page: Page, view: Locator) {
  await pick(page, view, "article");
  await page.keyboard.press("Escape");
}

/** Presses on the middle of `from` and lets go at the point `to` gives, in steps, as a hand would. */
async function drag(page: Page, from: Locator, to: () => Promise<{ x: number; y: number }>) {
  const start = await boxOf(from);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  const end = await to();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
}

/** Scrolls the workspace so there is room on the left of the views, where layers moved off the canvas go. */
async function roomOnTheLeft(page: Page) {
  const area = await boxOf(page.getByRole("region", { name: "Canvas viewport" }));
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-400, 0);
}

/** Drags a layer, selected from the Layers panel by `name`, out of the desktop view to its left; `onCanvas` finds it on the canvas. */
async function moveOffTheCanvas(page: Page, name: string, onCanvas: Locator) {
  await layer(page, name).click();
  const view = await boxOf(desktop(page));
  const box = await boxOf(onCanvas);
  await drag(page, onCanvas, async () => ({ x: view.x - 200, y: box.y }));
}

/** Waits until the round has `count` changes saved. */
export async function saved(desk: Desk, count: number) {
  for (let tries = 0; desk.changeSet()?.changes.length !== count; tries++) {
    if (tries > 100) throw new Error(`The round has ${desk.changeSet()?.changes.length ?? 0} changes saved, not ${count}`);
    await desk.page.waitForTimeout(100);
  }
  // A style change at a breakpoint the project's breakpoints cut into parts is saved again once the page is read in each part of its range (ticket 65): till then its `parts` is null.
  const unread = () => desk.changeSet()!.changes.filter((change) => change.kind === "style" && change.breakpoint && !(PLACING as readonly string[]).includes(change.property ?? "") && change.parts === null);
  for (let tries = 0; unread().length; tries++) {
    if (tries > 100) throw new Error(`Changes ${unread().map((change) => change.id).join(", ")} are saved with no parts of their range read`);
    await desk.page.waitForTimeout(100);
  }
}

const HERO = '[data-testid="hero"]';
/** The intro paragraph's layer, by its words. */
const INTRO = "A Framer-style editor layer for any page.";

/** Selects the hero, in the desktop view, by its empty space below the button: the deepest layer there. */
async function pickHero(page: Page) {
  const hero = await boxOf(desktop(page).contentFrame().getByTestId("hero"));
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(hero.x + hero.width / 2, hero.y + hero.height - 20);
  await page.keyboard.up("ControlOrMeta");
}

/**
 * Ends the round being applied as a designer does, the Agent stopped halfway:
 * presses and holds the locked toggle (ticket 68). What the page shows is
 * archived as applied; the rest is left to the next round.
 */
async function endTheRound(page: Page) {
  await page.getByRole("button", { name: /^03Kind: applying design changes/ }).hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await page.getByRole("button", { name: TOGGLE_LABEL }).waitFor();
}

/** Waits until the designer's page, out of edit mode, shows the title at `size` (the dev server has brought an edit in). */
async function titleAt(page: Page, size: string) {
  await page.waitForFunction((px) => getComputedStyle(document.querySelector("main h1")!).fontSize === px, size);
}

/** Picks how the selected layer is arranged, in the Design panel's Stack or Grid section (ticket 109): `Horizontal`, `Vertical` or `Grid`. */
async function arrangeAs(page: Page, section: "Stack" | "Grid", option: "Horizontal" | "Vertical" | "Grid") {
  await design(page).getByRole("region", { name: section }).getByRole("radiogroup", { name: "Direction" }).getByRole("radio", { name: option }).click();
}

/** The cards' Grid as the example writes it. */
const CARDS_GRID_TAG = '<Surface className="grid grid-cols-1 gap-4 pb-16 sm:grid-cols-3">';
/** Its classes that place the cards by areas from 640px, the last card first: what a round before wrote (ticket 109's follow-up). */
const AREAS = "sm:[grid-template-areas:'d_c_b'_'a_._.'] " + [..."abcd"].map((area, n) => `sm:[&>*:nth-child(${n + 1})]:[grid-area:${area}]`).join(" ");
/** Four tiles, 100 × 40px, 24px apart across and 16px down, placed absolute in a Frame below the cards: what a round before drew (ticket 110). */
const TILES = [
  [20, 30],
  [144, 30],
  [20, 86],
  [144, 86],
].map(([left, top]) => `        <div className="absolute left-[${left}px] top-[${top}px] h-10 w-[100px] bg-stone-300" />\n`);
const TILES_FRAME = `      <div className="relative h-60">\n${TILES.join("")}      </div>\n`;

// The tests below run in the page: each stands on its own, with no names from here.

export const SCENARIOS: Scenario[] = [
  {
    id: "cards-style",
    title: "The cards of the feature loop (the first Card's usage): fill red, corner radius 4px, stroke red.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Card").click();
      await setField(page, "Fill color", "ff0000");
      await setField(page, "Corner radius", "4");
      await setField(page, "Stroke color", "ff0000");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "style",
        expect: "The three cards of the loop are red; the fourth card (Your turn, another usage) stays white.",
        checkable: true,
        shows: () => {
          const fills = [...document.querySelectorAll("article")].map((card) => getComputedStyle(card).backgroundColor);
          return fills.join() === ["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 255, 255)"].join();
        },
      },
      {
        kind: "style",
        expect: "The three cards of the loop have 4px corners; the fourth keeps 12px.",
        checkable: true,
        variable: ["rounded-sm", "--radius-sm"],
        shows: () => [...document.querySelectorAll("article")].map((card) => getComputedStyle(card).borderTopLeftRadius).join() === "4px,4px,4px,12px",
      },
      {
        kind: "style",
        expect: "The three cards of the loop have a red border; the fourth keeps its stone one.",
        checkable: true,
        shows: () => {
          // Tailwind v4's stone is an oklch() color: the fourth is only to be not red.
          const strokes = [...document.querySelectorAll("article")].map((card) => getComputedStyle(card).borderTopColor);
          return strokes.length === 4 && strokes.slice(0, 3).every((stroke) => stroke === "rgb(255, 0, 0)") && strokes[3] !== "rgb(255, 0, 0)";
        },
      },
    ],
  },
  {
    id: "button-over-rule",
    title: "The Get started button: fill blue (#2563EB), corner radius 8px. The page's own `button` rule, in no CSS layer, sets both now.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Button").click();
      await setField(page, "Fill color", "2563eb");
      await setField(page, "Corner radius", "8");
      await saved(desk, 2);
    },
    changes: [
      {
        kind: "style",
        expect: "The Get started button is blue (#2563EB).",
        checkable: true,
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] button')!).backgroundColor === "rgb(37, 99, 235)",
      },
      {
        kind: "style",
        expect: "The Get started button has 8px corners.",
        checkable: true,
        variable: ["rounded-lg", "--radius-lg"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] button')!).borderTopLeftRadius === "8px",
      },
    ],
  },
  {
    id: "type-and-stack",
    title: "The title at 48px (Tailwind's text-5xl), the intro paragraph's text stone-900 (#1C1917), and the title and the Beta badge wrapped in a new horizontal Stack.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Third Kind").click();
      await setField(page, "Font size", "48");
      await pick(page, desktop(page), `${HERO} > p`);
      await setField(page, "Fill color", "1c1917");
      await layer(page, "Third Kind").click();
      await layer(page, "Badge").click({ modifiers: ["Shift"] });
      await page.keyboard.press("Shift+A");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "style",
        expect: "The title is 48px.",
        checkable: true,
        variable: ["text-5xl", "--text-5xl"],
        shows: () => getComputedStyle(document.querySelector("h1")!).fontSize === "48px",
      },
      {
        kind: "style",
        expect: "The intro paragraph's text is #1C1917.",
        checkable: true,
        variable: ["text-stone-900", "--color-stone-900"],
        shows: () => {
          // Through a pixel: Tailwind v4's stone-900 is an oklch() color, #1C1917 in sRGB, give or take rounding.
          const context = document.createElement("canvas").getContext("2d")!;
          context.fillStyle = getComputedStyle(document.querySelector('[data-testid="hero"] p')!).color;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return Math.abs(r - 28) <= 2 && Math.abs(g - 25) <= 2 && Math.abs(b - 23) <= 2;
        },
      },
      {
        kind: "stack",
        expect: "The title and the Beta badge are in a new horizontal Stack of their own, with a 12px gap, in the header.",
        checkable: false,
        shows: () => {
          const title = document.querySelector("h1")!;
          const stack = title.parentElement!;
          const style = getComputedStyle(stack);
          return (
            stack.localName !== "header" &&
            stack.parentElement?.localName === "header" &&
            stack.contains(document.querySelector('[data-testid="acme-badge"]')) &&
            style.display === "flex" &&
            style.flexDirection === "row" &&
            style.columnGap === "12px"
          );
        },
      },
    ],
  },
  {
    id: "fill-gap-brief",
    title: "The Get started button fills its Stack's width; the cards of the loop get a 12px gap (a plain flow made a real Stack); a brief on the button: it springs back when pressed.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Button").click();
      await design(page).getByRole("combobox", { name: "Width sizing" }).selectOption("fill");
      await layer(page, "Card").click();
      await setField(page, "Gap", "12");
      await layer(page, "Button").click();
      // The Brief tool, and a click on the button selected: its card opens beside the views (ticket 121).
      await page.keyboard.press("b");
      const button = await boxOf(desktop(page).contentFrame().locator(`${HERO} > button`));
      await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
      await page.getByRole("textbox", { name: "Brief" }).waitFor();
      await page.keyboard.type("When pressed, it shrinks a little and springs back");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "style",
        expect: "The Get started button is as wide as the hero.",
        checkable: true,
        shows: () => {
          const button = document.querySelector('[data-testid="hero"] button')!.getBoundingClientRect();
          const hero = document.querySelector('[data-testid="hero"]')!.getBoundingClientRect();
          return Math.abs(button.width - hero.width) <= 1;
        },
      },
      {
        kind: "style",
        expect: "The three cards of the loop are flex columns with a 12px gap, the body's margin taken off, so 12px is all the room between title and body (ticket 122); the fourth card is as it was.",
        checkable: true,
        variable: ["gap-3", "gap-y-3"],
        shows: () => {
          const articles = [...document.querySelectorAll("article")];
          const cards = articles.map((card) => getComputedStyle(card));
          const room = (card: Element) => card.querySelector("p")!.getBoundingClientRect().top - card.querySelector("h3")!.getBoundingClientRect().bottom;
          const stack = (style: CSSStyleDeclaration, i: number) => style.display === "flex" && style.flexDirection === "column" && style.rowGap === "12px" && Math.abs(room(articles[i]) - 12) < 0.5;
          return cards.length === 4 && cards.slice(0, 3).every(stack) && cards[3].display === "block";
        },
      },
      { kind: "brief", expect: "Pressed, the button shrinks a little and springs back (a transition or animation on :active); the report says what was done.", checkable: false },
    ],
  },
  {
    id: "promote-and-grid",
    title: "A card's corner radius set to 2px and promoted to the Card component (all four cards); the cards' Grid made 2 columns with a 24px row gap.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Card").click();
      await setField(page, "Corner radius", "2");
      await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Promote" }).click();
      await pickGrid(page, desktop(page));
      await setField(page, "Columns", "2");
      await setField(page, "Row gap", "24");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "style",
        expect: "All four cards have 2px corners.",
        checkable: true,
        variable: ["rounded-xs", "--radius-xs"],
        shows: () => [...document.querySelectorAll("article")].map((card) => getComputedStyle(card).borderTopLeftRadius).join() === "2px,2px,2px,2px",
      },
      {
        kind: "style",
        expect: "The cards' Grid has 2 columns, at every width.",
        checkable: true,
        widths: [1280, 390],
        shows: () => getComputedStyle(document.querySelector("article")!.parentElement!).gridTemplateColumns.split(" ").length === 2,
      },
      {
        kind: "style",
        expect: "The cards' Grid has a 24px row gap; its column gap stays 16px.",
        checkable: true,
        variable: ["gap-y-6"],
        shows: () => {
          const grid = getComputedStyle(document.querySelector("article")!.parentElement!);
          return grid.rowGap === "24px" && grid.columnGap === "16px";
        },
      },
    ],
  },
  {
    id: "reorder-and-move",
    title: "The header (title and badge) moved below the intro paragraph; the Get started button moved into the header, after the badge.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      const hero = desktop(page).contentFrame().getByTestId("hero");
      await layer(page, "Header").click();
      await drag(page, hero.locator("> header"), async () => {
        const paragraph = await boxOf(hero.locator("> p"));
        return { x: paragraph.x + paragraph.width / 2, y: paragraph.y + paragraph.height - 2 };
      });
      await saved(desk, 1);
      await layer(page, "Button").click();
      await drag(page, hero.locator("button").first(), async () => {
        const badge = await boxOf(hero.getByTestId("acme-badge"));
        return { x: badge.x + badge.width / 2 + 1, y: badge.y + badge.height / 2 };
      });
      await saved(desk, 2);
    },
    changes: [
      {
        kind: "move",
        expect: "In the hero, the intro paragraph comes before the header.",
        checkable: true,
        shows: () => {
          const children = [...document.querySelector('[data-testid="hero"]')!.children].map((child) => child.localName);
          return children.indexOf("p") >= 0 && children.indexOf("p") < children.indexOf("header");
        },
      },
      {
        kind: "move",
        expect: "The Get started button is in the header, after the Beta badge; the hero has no button of its own.",
        checkable: false,
        shows: () => {
          const header = document.querySelector('[data-testid="hero"] header')!;
          const children = [...header.children];
          const badge = children.findIndex((child) => child.matches('[data-testid="acme-badge"]') || !!child.querySelector('[data-testid="acme-badge"]'));
          const button = children.findIndex((child) => child.localName === "button");
          return button > badge && badge >= 0 && !document.querySelector('[data-testid="hero"] > button');
        },
      },
    ],
  },
  {
    id: "data-and-text",
    title: "The Arrange card deleted, the Freeze card copied beside it (both from the features data), and the title's words changed to “Third Kind Studio”.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Card", 1).click();
      await page.keyboard.press("Delete");
      await layer(page, "Card", 0).click();
      await page.keyboard.press("ControlOrMeta+d");
      await layer(page, "Third Kind").click();
      await desktop(page).contentFrame().locator("h1").dblclick();
      await page.keyboard.type("Third Kind Studio");
      await page.keyboard.press("Enter");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "delete",
        expect: "There is no Arrange card.",
        // A data change: the page cannot tell which of the loop's cards went.
        checkable: false,
        shows: () => ![...document.querySelectorAll("article h3")].some((title) => title.textContent === "Arrange"),
      },
      {
        kind: "duplicate",
        expect: "The cards read Freeze, Freeze, Apply, Your turn.",
        checkable: false,
        shows: () => [...document.querySelectorAll("article h3")].map((title) => title.textContent).join() === "Freeze,Freeze,Apply,Your turn",
      },
      {
        kind: "text",
        expect: "The title reads “Third Kind Studio”.",
        // Found by its source marker, the title's words are checked (ticket 90).
        checkable: true,
        shows: () => document.querySelector("h1")?.textContent === "Third Kind Studio",
      },
    ],
    async apply(desk) {
      // The cards' data: the Arrange item out, a copy of the Freeze one after it, each card keyed by its place now that two share a title.
      const freeze = '{ title: "Freeze", body: "Turn the current page into a canvas." },';
      await desk.edit("src/App.tsx", '  { title: "Arrange", body: "Drag layers, build Stacks, tune spacing." },\n', "");
      await desk.edit("src/App.tsx", freeze, `${freeze}\n  ${freeze}`);
      await desk.edit("src/App.tsx", "{features.map((feature) => (\n          <Card key={feature.title}", "{features.map((feature, i) => (\n          <Card key={i}");
      await desk.edit("src/App.tsx", ">Third Kind</h1>", ">Third Kind Studio</h1>");
    },
  },
  {
    id: "put-back-and-new-text",
    title:
      "Set up by a round before: the title moved off the canvas and deleted from the code. Now the title is put back at the start of the header, new text “Works with any Agent.” is added below the intro paragraph, and the paragraph is moved off the canvas.",
    async design(desk) {
      const { page } = desk;
      // The round before, applied as the Skill says: the title moved off the canvas, deleted from the code.
      await enterEditMode(page);
      await roomOnTheLeft(page);
      await moveOffTheCanvas(page, "Third Kind", desktop(page).contentFrame().locator("h1"));
      await saved(desk, 1);
      await desk.cli("claim");
      await desk.edit("src/App.tsx", '          <h1 className="font-display text-4xl font-bold text-stone-900">Third Kind</h1>\n', "");
      await page.locator("h1").waitFor({ state: "detached" });
      await desk.cli("done", "1");
      await desk.cli("finish");
      await desk.settle("The round before: the title moved off the canvas");

      // This round.
      await enterEditMode(page);
      await roomOnTheLeft(page);
      const canvas = desktop(page).contentFrame();
      const offCanvas = page.locator('iframe[title="Off canvas"]:visible').contentFrame().locator("h1");
      await drag(page, offCanvas, async () => {
        const badge = await boxOf(canvas.locator("header").getByText("Beta"));
        return { x: badge.x + 3, y: badge.y + badge.height / 2 };
      });
      await saved(desk, 1);
      const paragraph = await boxOf(canvas.locator(`${HERO} > p`));
      // In the page's px, whatever the canvas's zoom: the text as wide as before tuning round 1 left the canvas less room (649.5px).
      const zoom = await desktop(page).evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
      await page.keyboard.press("t");
      await page.mouse.move(paragraph.x + 72 * zoom, paragraph.y + paragraph.height - 7 * zoom);
      await page.mouse.down();
      await page.mouse.move(paragraph.x + 721.5 * zoom, paragraph.y + paragraph.height + 36 * zoom, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.type("Works with any Agent.");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      await saved(desk, 2);
      await moveOffTheCanvas(page, "A Framer-style editor layer for any page.", canvas.locator(`${HERO} > p`).first());
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "putBack",
        expect: "The header starts with the title, “Third Kind”, as it was written before.",
        checkable: false,
        shows: () => {
          const first = document.querySelector('[data-testid="hero"] header')?.firstElementChild;
          return first?.localName === "h1" && first.textContent === "Third Kind";
        },
      },
      {
        kind: "create",
        expect: "The hero has the words “Works with any Agent.” below where the intro paragraph was.",
        checkable: true,
        shows: () => [...document.querySelectorAll('[data-testid="hero"] *')].some((el) => el.textContent?.trim() === "Works with any Agent." && el.children.length === 0),
      },
      {
        kind: "delete",
        expect: "The intro paragraph (“A Framer-style editor layer for any page.”) is gone.",
        checkable: true,
        shows: () => !document.body.textContent!.includes("A Framer-style editor layer for"),
      },
    ],
  },
  {
    id: "phone-breakpoints",
    title: "In the phone view (below 768px only): the cards of the loop red, the Get started button hidden, the cards' Grid 2 columns.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await pick(page, phone(page), "article");
      await setField(page, "Fill color", "ff0000");
      await pick(page, phone(page), `${HERO} > button`);
      await design(page).getByRole("checkbox", { name: "Visible" }).uncheck();
      await pickGrid(page, phone(page));
      await setField(page, "Columns", "2");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "style",
        expect: "Below 768px the three cards of the loop are red (the fourth stays white); at 768px and up all four are white.",
        checkable: true,
        widths: [390, 1280],
        shows: ({ width }) => {
          const fills = [...document.querySelectorAll("article")].map((card) => getComputedStyle(card).backgroundColor);
          const red = width < 768 ? "rgb(255, 0, 0)" : "rgb(255, 255, 255)";
          return fills.join() === [red, red, red, "rgb(255, 255, 255)"].join();
        },
      },
      {
        kind: "style",
        expect: "Below 768px the Get started button is hidden; at 768px and up it shows.",
        checkable: true,
        widths: [390, 1280],
        shows: ({ width }) => (getComputedStyle(document.querySelector('[data-testid="hero"] button')!).display === "none") === width < 768,
      },
      {
        kind: "style",
        expect: "Below 768px the cards' Grid has 2 columns; at 1280px it keeps 3.",
        checkable: true,
        widths: [390, 1280],
        shows: ({ width }) => getComputedStyle(document.querySelector("article")!.parentElement!).gridTemplateColumns.split(" ").length === (width < 768 ? 2 : 3),
      },
    ],
  },
  {
    id: "dissolve-place-frame",
    title: "The hero's Stack dissolved into a Frame (its layers absolute where they were); the Get started button, absolute now, dragged 120px lower in it; a new Frame drawn in its empty space above the header, with the brief “A row of three partner logos”.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      const canvas = desktop(page).contentFrame();
      const hero = await boxOf(canvas.getByTestId("hero"));
      // Its empty space, below the button: the deepest layer there is the hero.
      await page.keyboard.down("ControlOrMeta");
      await page.mouse.click(hero.x + hero.width / 2, hero.y + hero.height - 20);
      await page.keyboard.up("ControlOrMeta");
      await design(page).getByRole("button", { name: "Dissolve Stack" }).click();
      await saved(desk, 1);
      const zoom = await desktop(page).evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
      await layer(page, "Button").click();
      const button = await boxOf(canvas.locator(`${HERO} > button`));
      await drag(page, canvas.locator(`${HERO} > button`), async () => ({ x: button.x + button.width / 2, y: button.y + button.height / 2 + 120 * zoom }));
      await saved(desk, 2);
      await page.keyboard.press("Escape");
      await page.keyboard.press("f");
      const from = { x: hero.x + 40 * zoom, y: hero.y + 60 * zoom };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 360 * zoom, from.y + 80 * zoom, { steps: 6 });
      await page.mouse.up();
      // The Brief tool, and a click on the Frame drawn: its card opens beside the views (ticket 121).
      await page.keyboard.press("b");
      await page.mouse.click(from.x + 180 * zoom, from.y + 40 * zoom);
      const brief = page.getByRole("textbox", { name: "Brief" });
      await brief.fill("A row of three partner logos");
      await brief.press("Enter");
      await page.keyboard.press("Escape");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "unstack",
        expect: "The hero is no flex container; its header and intro paragraph are absolute, where they were (as the canvas draws them: X and Y are their `left` and `top`, and they keep their margins, the paragraph's 16px top margin).",
        checkable: false,
        shows: ({ change }) => {
          const hero = document.querySelector('[data-testid="hero"]')!;
          const box = hero.getBoundingClientRect();
          const at = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { x: r.left - box.left, y: r.top - box.top };
          };
          // Where the canvas draws each: past its X and Y by the margins it keeps.
          const placed = (selector: string, nth: number) => {
            const el = hero.querySelector(selector);
            const where = change.after.layers[nth];
            const margins = where.margins ?? { x: 0, y: 0 };
            return !!el && getComputedStyle(el).position === "absolute" && Math.abs(at(el).x - where.x - margins.x) <= 2 && Math.abs(at(el).y - where.y - margins.y) <= 2;
          };
          return getComputedStyle(hero).display !== "flex" && placed(":scope > header", 0) && placed(":scope > p", 1);
        },
      },
      {
        kind: "style",
        expect: "The Get started button is absolute in the hero, 120px lower than it was (its Y, its `top`, from 368px to 488px; drawn 24px lower still, by the top margin it keeps, as on the canvas).",
        checkable: true,
        shows: ({ change }) => {
          const hero = document.querySelector('[data-testid="hero"]')!.getBoundingClientRect();
          const button = document.querySelector('[data-testid="hero"] button')!;
          // Where the canvas draws it: past its Y by the top margin it keeps.
          const margin = change.margins?.y ?? 0;
          return getComputedStyle(button).position === "absolute" && Math.abs(button.getBoundingClientRect().top - hero.top - change.after - margin) <= 2;
        },
      },
      {
        kind: "create",
        expect: "The hero has a new Frame where it was drawn (360 × 80px, within 4px), with a row of three partner logos in it.",
        checkable: true,
        shows: ({ change }) => {
          const hero = document.querySelector('[data-testid="hero"]')!;
          const box = hero.getBoundingClientRect();
          const { x, y } = change.after.place.absolute;
          const { width, height } = change.after;
          return [...hero.querySelectorAll("*")].some((el) => {
            const r = el.getBoundingClientRect();
            const placed = Math.abs(r.left - box.left - x) <= 4 && Math.abs(r.top - box.top - y) <= 4 && Math.abs(r.width - width) <= 4 && Math.abs(r.height - height) <= 4;
            // Three logos at least: an empty Frame is not what the brief asks for.
            return placed && el.querySelectorAll("*").length >= 3;
          });
        },
      },
    ],
  },
  // Ticket 86: the common cases the scenarios above leave out, each scenario a category of change of its own.
  {
    id: "panel-padding-effects-opacity",
    title: "The Get started button's padding made 12px top, 24px right, 4px bottom, 8px left, and a drop shadow added to it (8px down, 16px blur, black at 25%); the title at 60% opacity.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Button").click();
      await setField(page, "Padding top", "12");
      await setField(page, "Padding right", "24");
      await setField(page, "Padding bottom", "4");
      await setField(page, "Padding left", "8");
      const effects = design(page).getByRole("group", { name: "Effects" });
      await effects.getByRole("button", { name: "Add effect" }).click();
      await page.getByRole("dialog", { name: "Add effect" }).getByRole("option", { name: "Drop shadow", exact: true }).click();
      await setField(page, "Shadow 1 Y", "8");
      await setField(page, "Shadow 1 blur", "16");
      await layer(page, "Third Kind").click();
      await setField(page, "Opacity", "60");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "style",
        expect: "The Get started button's padding is 12px top, 24px right, 4px bottom, 8px left.",
        checkable: true,
        // Four sides, each its own Variable: all four written.
        variable: [["pt-3"], ["pr-6"], ["pb-1"], ["pl-2"]],
        shows: () => {
          const style = getComputedStyle(document.querySelector('[data-testid="hero"] button')!);
          return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join() === "12px,24px,4px,8px";
        },
      },
      {
        kind: "style",
        expect: "The Get started button casts one drop shadow, 8px down with a 16px blur, black at 25%.",
        checkable: true,
        shows: () => {
          const shadow = getComputedStyle(document.querySelector('[data-testid="hero"] button')!).boxShadow;
          // Each shadow's color through a pixel: `shadow-black/25` is a color-mix() in oklab, computed as an oklab() color.
          const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
          const shadows = (shadow === "none" ? [] : shadow.split(/,(?![^(]*\))/)).map((one) => {
            const [, color, lengths] = /^(.*?)\s*((?:-?[\d.]+px\s*){2,4}(?:inset)?)$/.exec(one.trim()) ?? [];
            context.clearRect(0, 0, 1, 1);
            // A color the canvas cannot read leaves the one before: none, then.
            context.fillStyle = "transparent";
            context.fillStyle = color ?? "transparent";
            context.fillRect(0, 0, 1, 1);
            return { pixel: [...context.getImageData(0, 0, 1, 1).data], lengths: lengths?.trim() };
          });
          // Tailwind writes transparent shadows of its own beside one: those are none.
          const drawn = shadows.filter(({ pixel }) => pixel[3] > 0);
          // Black at 25%: an alpha of 64 of 255, give or take rounding.
          return drawn.length === 1 && drawn[0].lengths === "0px 8px 16px 0px" && drawn[0].pixel.slice(0, 3).every((channel) => channel <= 2) && Math.abs(drawn[0].pixel[3] - 64) <= 2;
        },
      },
      {
        kind: "style",
        expect: "The title is at 60% opacity.",
        checkable: true,
        shows: () => getComputedStyle(document.querySelector("h1")!).opacity === "0.6",
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", "self-start px-4 py-2 text-white", "self-start pt-3 pr-6 pb-1 pl-2 text-white shadow-[0_8px_16px_rgba(0,0,0,0.25)]");
      await desk.edit("src/App.tsx", "font-bold text-stone-900", "font-bold text-stone-900 opacity-60");
    },
  },
  {
    id: "panel-text",
    title: "The intro paragraph's text: bold, line height 24px, letter spacing 1px, centered.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, INTRO).click();
      const text = design(page).getByRole("group", { name: "Text" });
      await text.getByRole("combobox", { name: "Font weight" }).selectOption("700");
      await setField(page, "Line height", "24px");
      await setField(page, "Letter spacing", "1px");
      await text.getByRole("radio", { name: "Align center" }).click();
      await saved(desk, 4);
    },
    changes: [
      {
        kind: "style",
        expect: "The intro paragraph is bold (700).",
        checkable: true,
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] > p')!).fontWeight === "700",
      },
      {
        kind: "style",
        expect: "The intro paragraph's line height is 24px (the page's body sets 1.8).",
        checkable: true,
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] > p')!).lineHeight === "24px",
      },
      {
        kind: "style",
        expect: "The intro paragraph's letter spacing is 1px (the page's body sets 0.02em).",
        checkable: true,
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] > p')!).letterSpacing === "1px",
      },
      {
        kind: "style",
        expect: "The intro paragraph's text is centered.",
        checkable: true,
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] > p')!).textAlign === "center",
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", '<p className="mt-4 text-stone-600">', '<p className="mt-4 text-center font-bold leading-6 tracking-[1px] text-stone-600">');
    },
  },
  {
    id: "panel-size",
    title: "The Get started button made Fixed, 200px wide and 40px tall; the intro paragraph's width made Hug (it fills the hero's width now).",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Button").click();
      await setField(page, "Width", "200");
      await setField(page, "Height", "40");
      await layer(page, INTRO).click();
      await design(page).getByRole("combobox", { name: "Width sizing" }).selectOption("hug");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "style",
        expect: "The Get started button is 200px wide.",
        checkable: true,
        shows: () => Math.abs(document.querySelector('[data-testid="hero"] button')!.getBoundingClientRect().width - 200) <= 0.5,
      },
      {
        kind: "style",
        expect: "The Get started button is 40px tall.",
        checkable: true,
        variable: ["h-10"],
        shows: () => Math.abs(document.querySelector('[data-testid="hero"] button')!.getBoundingClientRect().height - 40) <= 0.5,
      },
      {
        kind: "style",
        expect: "The intro paragraph is as wide as its words, no wider (it stays on one line, at the hero's left).",
        checkable: true,
        shows: () => {
          const paragraph = document.querySelector('[data-testid="hero"] > p')!;
          const words = document.createRange();
          words.selectNodeContents(paragraph);
          const width = paragraph.getBoundingClientRect().width;
          return width < document.querySelector('[data-testid="hero"]')!.getBoundingClientRect().width - 20 && Math.abs(width - words.getBoundingClientRect().width) <= 2;
        },
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", "self-start px-4 py-2 text-white", "h-10 w-[200px] self-start px-4 py-2 text-white");
      await desk.edit("src/App.tsx", '<p className="mt-4 text-stone-600">', '<p className="mt-4 w-fit text-stone-600">');
    },
  },
  {
    id: "variables",
    title:
      "Set up by a round before: the project's own color brand (#2563EB) in its `@theme`. Now: the intro paragraph's text brand (picked as the Variable), the header's gap 20px, the hero's corners 16px, the title 30px: each a Variable's value; the intro paragraph 17px, which no Variable has.",
    async design(desk) {
      const { page } = desk;
      // The page takes the edit in by a hot update of the stylesheet, or reloads for it (Tailwind's plugin, at times): the editor layer opened before that would be gone.
      const takenIn = Promise.race([page.waitForEvent("load"), page.waitForEvent("console", (message) => /hot updated: \/src\/index\.css/.test(message.text()))]);
      await desk.edit("src/index.css", '  --font-display: "Space Grotesk", sans-serif;\n', '  --font-display: "Space Grotesk", sans-serif;\n  --color-brand: #2563eb;\n');
      await desk.settle("The round before: the project's own brand color");
      await takenIn;
      await page.locator("main").waitFor();

      await enterEditMode(page);
      await layer(page, INTRO).click();
      await pickColorVariable(page, "Fill color", "brand");
      await layer(page, "Header").click();
      await setField(page, "Gap", "20");
      await pickHero(page);
      await setField(page, "Corner radius", "16");
      await layer(page, "Third Kind").click();
      await setField(page, "Font size", "30");
      await layer(page, INTRO).click();
      await setField(page, "Font size", "17");
      await saved(desk, 5);
    },
    changes: [
      {
        kind: "style",
        expect: "The intro paragraph's text is the project's brand color, #2563EB.",
        checkable: true,
        variable: ["text-brand", "--color-brand"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] > p')!).color === "rgb(37, 99, 235)",
      },
      {
        kind: "style",
        expect: "The header's gap, between the title and the badge, is 20px.",
        checkable: true,
        variable: ["gap-5", "gap-x-5"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] header')!).columnGap === "20px",
      },
      {
        kind: "style",
        expect: "The hero has 16px corners.",
        checkable: true,
        variable: ["rounded-2xl", "--radius-2xl"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"]')!).borderTopLeftRadius === "16px",
      },
      {
        kind: "style",
        expect: "The title is 30px.",
        checkable: true,
        variable: ["text-3xl", "--text-3xl"],
        shows: () => getComputedStyle(document.querySelector("h1")!).fontSize === "30px",
      },
      {
        kind: "style",
        // No Variable has 17px: written as it is, not as a size close to it.
        expect: "The intro paragraph is 17px.",
        checkable: true,
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] > p')!).fontSize === "17px",
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", '<p className="mt-4 text-stone-600">', '<p className="mt-4 text-[17px] text-brand">');
      await desk.edit("src/App.tsx", '<header className="flex items-center gap-3">', '<header className="flex items-center gap-5">');
      await desk.edit("src/App.tsx", '<section className="flex h-screen', '<section className="flex h-screen rounded-2xl');
      await desk.edit("src/App.tsx", "font-display text-4xl", "font-display text-3xl");
    },
  },
  {
    id: "tablet-breakpoint",
    title: "In the tablet view (768px up to the desktop's 1280px): the cards' Grid 2 columns, and the title 30px.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await pickGrid(page, tablet(page));
      await setField(page, "Columns", "2");
      await pick(page, tablet(page), "h1");
      await setField(page, "Font size", "30");
      await saved(desk, 2);
    },
    changes: [
      {
        kind: "style",
        expect: "From 768px to 1279px the cards' Grid has 2 columns; below, 1 (and 3 from 640px to 767px, as before); at 1280px, 3.",
        checkable: true,
        widths: [390, 700, 800, 1100, 1280],
        shows: ({ width }) => getComputedStyle(document.querySelector("article")!.parentElement!).gridTemplateColumns.split(" ").length === (width < 640 ? 1 : width < 768 ? 3 : width < 1280 ? 2 : 3),
      },
      {
        kind: "style",
        expect: "From 768px to 1279px the title is 30px; below, and at 1280px, it stays 36px.",
        checkable: true,
        variable: ["text-3xl", "--text-3xl"],
        // 700: between Tailwind's `sm` (640) and `md` (768), where a breakpoint one off shows.
        widths: [390, 700, 800, 1100, 1280],
        shows: ({ width }) => getComputedStyle(document.querySelector("h1")!).fontSize === (width >= 768 && width < 1280 ? "30px" : "36px"),
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", "sm:grid-cols-3", "sm:grid-cols-3 md:max-xl:grid-cols-2");
      await desk.edit("src/App.tsx", "font-display text-4xl", "font-display text-4xl md:max-xl:text-3xl");
    },
  },
  {
    id: "breakpoint-kept",
    title: "The title 24px in the phone view (below 768px only); then 48px in the desktop view, at all breakpoints but the phone's, which keeps its own (ADR 0008).",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await pick(page, phone(page), "h1");
      await setField(page, "Font size", "24");
      await pick(page, desktop(page), "h1");
      await setField(page, "Font size", "48");
      await saved(desk, 2);
    },
    changes: [
      {
        kind: "style",
        expect: "Below 768px the title is 24px.",
        checkable: true,
        variable: ["text-2xl", "--text-2xl"],
        // 700: between Tailwind's `sm` (640) and `md` (768), where a breakpoint one off shows.
        widths: [390, 700, 1280],
        shows: ({ width }) => (getComputedStyle(document.querySelector("h1")!).fontSize === "24px") === width < 768,
      },
      {
        kind: "style",
        expect: "From 768px up the title is 48px; below 768px it is not (the phone's 24px holds there).",
        checkable: true,
        variable: ["text-5xl", "--text-5xl"],
        widths: [390, 700, 800, 1280],
        shows: ({ width }) => (getComputedStyle(document.querySelector("h1")!).fontSize === "48px") === width >= 768,
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", "font-display text-4xl", "font-display text-5xl max-md:text-2xl");
    },
  },
  {
    id: "placement-kept",
    title:
      "Set up by a round before: three tags placed absolute in the hero, one from its top right corner, one from its bottom left, one centered across it. Now the top right one is moved 40px left and made 120px wide, the bottom left one moved 40px up and made 64px tall, in the panel (X, Y, then W, H: a size typed keeps the layer's left and top edges, so its `right` or `bottom` changes with it); the centered one moved 40px right. Each stays placed as it was (ADR 0014).",
    async design(desk) {
      const { page } = desk;
      // The round before, as an Agent applied it: the tags are in the code, and the hero is their positioning reference.
      await desk.edit("src/App.tsx", '<section className="flex h-screen', '<section className="relative flex h-screen');
      await desk.edit(
        "src/App.tsx",
        "        </button>\n      </section>\n",
        "        </button>\n" +
          '        <div className="absolute top-6 right-6 h-10 w-24 rounded-lg bg-amber-200" data-testid="corner-tag" />\n' +
          '        <div className="absolute bottom-8 left-6 h-10 w-24 rounded-lg bg-stone-200" data-testid="foot-tag" />\n' +
          '        <div className="absolute bottom-24 left-1/2 h-10 w-24 -translate-x-1/2 rounded-lg bg-sky-200" data-testid="center-tag" />\n' +
          "      </section>\n",
      );
      await desk.settle("The round before: three tags in the hero");
      await page.getByTestId("center-tag").waitFor();

      await enterEditMode(page);
      await pick(page, desktop(page), '[data-testid="corner-tag"]');
      await setField(page, "X", String((await numberIn(page, "X")) - 40));
      await setField(page, "Width", "120");
      await pick(page, desktop(page), '[data-testid="foot-tag"]');
      await setField(page, "Y", String((await numberIn(page, "Y")) - 40));
      await setField(page, "Height", "64");
      await pick(page, desktop(page), '[data-testid="center-tag"]');
      await setField(page, "X", String((await numberIn(page, "X")) + 40));
      await saved(desk, 5);
    },
    // The round saves the move as the `right` or `bottom` it ends at (the size typed after it moved that edge back: 64px, then 40px),
    // and the size alone: so each test holds after its own change, the other left out.
    changes: [
      {
        kind: "style",
        expect: "The top right tag is 40px from the hero's right edge (24px before), at every width: still placed from the right.",
        checkable: true,
        widths: [390, 1280],
        shows: () => {
          const tag = document.querySelector('[data-testid="corner-tag"]')!.getBoundingClientRect();
          return Math.abs(document.querySelector('[data-testid="hero"]')!.getBoundingClientRect().right - tag.right - 40) <= 1;
        },
      },
      {
        kind: "style",
        expect: "The top right tag is 120px wide, and still placed from the right: its right edge 24px from the hero's (or 40px, its `right` changed too), at every width.",
        checkable: true,
        widths: [390, 1280],
        shows: () => {
          const tag = document.querySelector('[data-testid="corner-tag"]')!.getBoundingClientRect();
          const right = document.querySelector('[data-testid="hero"]')!.getBoundingClientRect().right - tag.right;
          return Math.abs(tag.width - 120) <= 1 && (Math.abs(right - 24) <= 1 || Math.abs(right - 40) <= 1);
        },
      },
      {
        kind: "style",
        expect: "The bottom left tag is 48px from the hero's bottom edge (32px before), at every width: still placed from the bottom.",
        checkable: true,
        widths: [390, 1280],
        shows: () => {
          const tag = document.querySelector('[data-testid="foot-tag"]')!.getBoundingClientRect();
          return Math.abs(document.querySelector('[data-testid="hero"]')!.getBoundingClientRect().bottom - tag.bottom - 48) <= 1;
        },
      },
      {
        kind: "style",
        expect: "The bottom left tag is 64px tall, and still placed from the bottom: its bottom edge 32px from the hero's (or 48px, its `bottom` changed too), at every width.",
        checkable: true,
        variable: ["h-16"],
        widths: [390, 1280],
        shows: () => {
          const tag = document.querySelector('[data-testid="foot-tag"]')!.getBoundingClientRect();
          const bottom = document.querySelector('[data-testid="hero"]')!.getBoundingClientRect().bottom - tag.bottom;
          return Math.abs(tag.height - 64) <= 1 && (Math.abs(bottom - 32) <= 1 || Math.abs(bottom - 48) <= 1);
        },
      },
      {
        kind: "style",
        expect: "The centered tag's middle is 40px right of the hero's middle, at every width: still centered, 40px off (`calc(50% + 40px)`).",
        checkable: true,
        widths: [390, 1280],
        shows: () => {
          const tag = document.querySelector('[data-testid="center-tag"]')!.getBoundingClientRect();
          const hero = document.querySelector('[data-testid="hero"]')!.getBoundingClientRect();
          return Math.abs((tag.left + tag.right) / 2 - (hero.left + hero.right) / 2 - 40) <= 1;
        },
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", "absolute top-6 right-6 h-10 w-24", "absolute top-6 right-10 h-10 w-[120px]");
      await desk.edit("src/App.tsx", "absolute bottom-8 left-6 h-10 w-24", "absolute bottom-12 left-6 h-16 w-24");
      await desk.edit("src/App.tsx", "absolute bottom-24 left-1/2", "absolute bottom-24 left-[calc(50%+40px)]");
    },
  },
  {
    id: "third-party",
    title: "The cards' Grid, acme-ui's Surface (it passes its props on), filled stone-100 (picked as the Variable); the Beta badge, acme-ui's Badge (it takes no class or style), made 90px wide.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await pickGrid(page, desktop(page));
      await design(page).getByRole("button", { name: "Add fill" }).click();
      await pickColorVariable(page, "Fill color", "stone-100");
      await layer(page, "Badge").click();
      await setField(page, "Width", "90");
      await saved(desk, 2);
    },
    changes: [
      {
        kind: "style",
        expect: "The cards' Grid is filled stone-100 (#F5F5F4, give or take rounding).",
        checkable: true,
        variable: ["bg-stone-100", "--color-stone-100"],
        shows: () => {
          // Through a pixel: Tailwind v4's stone-100 is an oklch() color.
          const context = document.createElement("canvas").getContext("2d")!;
          const fill = getComputedStyle(document.querySelector("article")!.parentElement!).backgroundColor;
          if (fill === "rgba(0, 0, 0, 0)") return false;
          context.fillStyle = fill;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return Math.abs(r - 245) <= 2 && Math.abs(g - 245) <= 2 && Math.abs(b - 244) <= 2;
        },
      },
      {
        kind: "style",
        expect: "The Beta badge stays as it was; the report lists the change under ⚠️, why (acme-ui's Badge sets its own size and takes no class or style from its usage) and what instead.",
        // A Locked Layer: drawn by a dependency, it has no source marker of its own, so the page cannot find it to check.
        checkable: false,
        notOneToOne: "acme-ui's Badge sets its size itself and passes no class or style on from its usage; the dependency is never changed.",
        // Not shown when left as it was; an Agent that makes it 90px all the same (from the header, say) is right to list it under ✓.
        widths: [390, 1280],
        shows: () => Math.abs(document.querySelector('[data-testid="acme-badge"]')!.getBoundingClientRect().width - 90) <= 0.5,
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", '<Surface className="grid', '<Surface className="bg-stone-100 grid');
    },
  },
  // Ticket 86, the flow: rounds over more than one turn of the Agent's.
  {
    id: "flow-end-halfway",
    title:
      "Set up by a round before, ended halfway: the designer made the title 48px, the hero's corners 16px and the header's gap 20px; an Agent applied the title alone, and the designer ended the round by pressing and holding the toggle. Now the Agent is asked to apply the round again: the two changes left over.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Third Kind").click();
      await setField(page, "Font size", "48");
      await pickHero(page);
      await setField(page, "Corner radius", "16");
      await layer(page, "Header").click();
      await setField(page, "Gap", "20");
      await saved(desk, 3);
      // The round before, applied as far as the title, as the Skill says; then the Agent stops.
      await desk.cli("claim");
      await desk.edit("src/App.tsx", "font-display text-4xl", "font-display text-5xl");
      await titleAt(page, "48px");
      await desk.cli("done", "1");
      await endTheRound(page);
      // Left over: the corners and the gap, numbered 1 and 2.
      await saved(desk, 2);
      await desk.settle("The round before, ended halfway: the title at 48px");
    },
    changes: [
      {
        kind: "style",
        expect: "The hero has 16px corners.",
        checkable: true,
        variable: ["rounded-2xl", "--radius-2xl"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"]')!).borderTopLeftRadius === "16px",
      },
      {
        kind: "style",
        expect: "The header's gap, between the title and the badge, is 20px.",
        checkable: true,
        variable: ["gap-5", "gap-x-5"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="hero"] header')!).columnGap === "20px",
      },
    ],
    expectations: [
      {
        expect: "The title stays 48px, as the round before applied it.",
        kept: true,
        shows: () => getComputedStyle(document.querySelector("h1")!).fontSize === "48px",
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", '<section className="flex h-screen', '<section className="flex h-screen rounded-2xl');
      await desk.edit("src/App.tsx", '<header className="flex items-center gap-3">', '<header className="flex items-center gap-5">');
    },
  },
  {
    id: "flow-undo-last",
    title:
      "Set up by a round before, applied and finished, not committed: the title 48px and the header's gap 20px. Now the designer asks the Agent to undo that round (`npx 03kind last`).",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Third Kind").click();
      await setField(page, "Font size", "48");
      await layer(page, "Header").click();
      await setField(page, "Gap", "20");
      await saved(desk, 2);
      // The round before, applied in full as the Skill says, and finished; its code left uncommitted, as `git diff` shows it.
      await desk.cli("claim");
      await desk.edit("src/App.tsx", "font-display text-4xl", "font-display text-5xl");
      await desk.edit("src/App.tsx", '<header className="flex items-center gap-3">', '<header className="flex items-center gap-5">');
      await titleAt(page, "48px");
      await desk.cli("done", "1", "2");
      await desk.cli("finish");
      await page.getByRole("button", { name: TOGGLE_LABEL }).waitFor();
    },
    changes: [],
    // The designer's words for the Skill's undo ("undo the last round of design changes").
    prompt: "撤销上一轮的设计改动",
    expectations: [
      {
        expect: "The title is 36px again and the header's gap 12px, as before the round.",
        shows: () => getComputedStyle(document.querySelector("h1")!).fontSize === "36px" && getComputedStyle(document.querySelector('[data-testid="hero"] header')!).columnGap === "12px",
      },
      {
        expect: "The project's source is as before the round: `git diff` shows nothing of it (`.03kind/` aside).",
        sourceAsAtStart: true,
      },
    ],
    async apply(desk) {
      // As the Skill says: `last` prints the round before and the command that takes its code back out.
      const last = await desk.cli("last");
      const command = /To undo the round, take them back out: `([^`]+)`/.exec(last)?.[1];
      if (!command) throw new Error(`\`last\` gives no command to undo the round by:\n${last}`);
      await desk.shell!(command);
    },
  },
  // Ticket 108: a layer of the canvas dragged into a Frame off it, the Frame put back.
  {
    id: "off-canvas-frame",
    title:
      "A Frame drawn in the blank space beside the views (320 × 160px, white), the intro paragraph dragged from the hero into it, and the Frame dragged back into the hero, below the Get started button: a new white Frame there, the paragraph moved into it.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await roomOnTheLeft(page);
      const canvas = desktop(page).contentFrame();
      const view = await boxOf(desktop(page));
      const zoom = await desktop(page).evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
      // Drawn left of the desktop view, in the canvas's px whatever the zoom.
      await page.keyboard.press("f");
      const from = { x: view.x - 360 * zoom, y: view.y + 40 * zoom };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 320 * zoom, from.y + 160 * zoom, { steps: 6 });
      await page.mouse.up();
      const frame = page.locator('iframe[title="Off canvas"]:visible');
      await frame.waitFor();
      await layer(page, INTRO).click();
      // Pressed 100px in from its left, clear of its handles; let go in the Frame with its left 24px in.
      const intro = await boxOf(canvas.locator(`${HERO} > p`));
      await page.mouse.move(intro.x + 100 * zoom, intro.y + intro.height / 2);
      await page.mouse.down();
      const into = await boxOf(frame);
      await page.mouse.move(into.x + 124 * zoom, into.y + 60 * zoom, { steps: 12 });
      await page.mouse.up();
      await frame.contentFrame().locator("p").waitFor();
      await saved(desk, 1);
      // The Frame itself, by its blank part below the paragraph, clear of its handles, into the hero below the button.
      await layer(page, "Frame").click();
      const box = await boxOf(frame);
      await page.mouse.move(box.x + 40 * zoom, box.y + 130 * zoom);
      await page.mouse.down();
      const button = await boxOf(canvas.locator(`${HERO} > button`));
      await page.mouse.move(button.x + button.width / 2, button.y + button.height + 8 * zoom, { steps: 12 });
      await page.mouse.up();
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "create",
        expect: "The hero has a new Frame after the Get started button, 320 × 160px (within 4px).",
        checkable: true,
        shows: ({ change }) => {
          const hero = document.querySelector('[data-testid="hero"]')!;
          const children = [...hero.children];
          const button = children.findIndex((child) => child.localName === "button");
          const frame = children[button + 1];
          const r = frame?.getBoundingClientRect();
          return !!r && Math.abs(r.width - change.after.width) <= 4 && Math.abs(r.height - change.after.height) <= 4;
        },
      },
      {
        kind: "style",
        expect: "The new Frame is white (the Variable white, Tailwind’s `bg-white`).",
        variable: ["bg-white", "--color-white"],
        checkable: true,
        shows: () => {
          const hero = document.querySelector('[data-testid="hero"]')!;
          const frame = [...hero.children].find((child) => child.previousElementSibling?.localName === "button");
          return !!frame && getComputedStyle(frame).backgroundColor === "rgb(255, 255, 255)";
        },
      },
      {
        kind: "move",
        expect: "The intro paragraph (“A Framer-style editor layer for any page.”) is in the new Frame, absolute where it was let go there (its X and Y its `left` and `top`, drawn past them by the 16px top margin it keeps); the hero has no paragraph of its own.",
        checkable: false,
        shows: ({ change }) => {
          const hero = document.querySelector('[data-testid="hero"]')!;
          const frame = [...hero.children].find((child) => child.previousElementSibling?.localName === "button");
          const paragraph = [...(frame?.children ?? [])].find((child) => child.textContent?.includes("A Framer-style editor layer for"));
          if (!frame || !paragraph || hero.querySelector(":scope > p")) return false;
          const [box, r] = [frame.getBoundingClientRect(), paragraph.getBoundingClientRect()];
          const margins = change.margins ?? { x: 0, y: 0 };
          const { x, y } = change.after.absolute;
          return getComputedStyle(paragraph).position === "absolute" && Math.abs(r.left - box.left - x - margins.x) <= 2 && Math.abs(r.top - box.top - y - margins.y) <= 2;
        },
      },
    ],
    async apply(desk) {
      // As the notes say: a new white Frame after the button, the paragraph's code moved into it, absolute at its X and Y.
      const changes = desk.changeSet()!.changes;
      const { width, height } = changes.find((change) => change.kind === "create")!.after;
      const { x, y } = changes.find((change) => change.kind === "move")!.after.absolute;
      const paragraph = '        <p className="mt-4 text-stone-600">\n          A Framer-style editor layer for <strong>any</strong> page.\n        </p>\n';
      await desk.edit("src/App.tsx", paragraph, "");
      await desk.edit(
        "src/App.tsx",
        "        </button>\n",
        `        </button>\n        <div className="relative bg-white" style={{ width: ${width}, height: ${height} }}>\n          <p className="absolute mt-4 text-stone-600" style={{ left: ${x}, top: ${y} }}>\n            A Framer-style editor layer for <strong>any</strong> page.\n          </p>\n        </div>\n`,
      );
    },
  },
  // Ticket 118: Stacks and Grids (tickets 109, 110 and 109's follow-up), each change as the editor layer makes it.
  {
    id: "stack-to-grid-and-cell-fill",
    title:
      "Set up by a round before: the cards fit their content in their cells (`w-fit` on the Card). Now, in the desktop view: the header, a horizontal Stack, made a Grid, then given 3 columns; the cards of the loop (the first Card's usage), Hug in the cards' Grid, made Fill.",
    async design(desk) {
      const { page } = desk;
      // The round before, as an Agent applied it: every card fits its content.
      await desk.edit("src/components/Card.tsx", "p-5 shadow-sm", "p-5 shadow-sm w-fit");
      await desk.settle("The round before: the cards fit their content");
      // The card has the class, and the stylesheet has the rule for it: a box of nothing with `w-fit` is 0px wide.
      await page.waitForFunction(() => {
        if (!document.querySelector("article")?.className.includes("w-fit")) return false;
        const probe = document.createElement("div");
        probe.className = "w-fit";
        document.body.append(probe);
        const fits = probe.getBoundingClientRect().width === 0;
        probe.remove();
        return fits;
      });

      await enterEditMode(page);
      await layer(page, "Header").click();
      await arrangeAs(page, "Stack", "Grid");
      await setField(page, "Columns", "3");
      await layer(page, "Card").click();
      await design(page).getByRole("combobox", { name: "Width sizing" }).selectOption("fill");
      await saved(desk, 2);
    },
    changes: [
      {
        kind: "style",
        expect: "The header is a Grid of 3 equal columns, with a 12px row gap and a 12px column gap, the title and the Beta badge in it as before.",
        checkable: true,
        // Its gaps the Variable 3, as the header's `gap-3` has them now: kept, or written row and column apart.
        variableKept: [
          ["gap-3", "gap-y-3"],
          ["gap-3", "gap-x-3"],
        ],
        // Made in the desktop view: at every width, the phone's too.
        widths: [390, 1280],
        shows: () => {
          const header = document.querySelector('[data-testid="hero"] header')!;
          const style = getComputedStyle(header);
          // Equal columns, however written (`grid-cols-3`, `grid-cols-[repeat(3,minmax(0,1fr))]`): the tracks the browser computes, within 1px.
          const tracks = style.gridTemplateColumns.split(" ").map(parseFloat);
          return (
            style.display === "grid" &&
            tracks.length === 3 &&
            Math.max(...tracks) - Math.min(...tracks) <= 1 &&
            style.rowGap === "12px" &&
            style.columnGap === "12px" &&
            header.firstElementChild?.localName === "h1" &&
            header.contains(document.querySelector('[data-testid="acme-badge"]'))
          );
        },
      },
      {
        kind: "style",
        expect: "The three cards of the loop fill their cells' width: at 390px, as wide as the cards' Grid; the fourth card (Your turn, another usage) still fits its content, narrower.",
        checkable: true,
        // At 390px the cell is wider than a card's content; at 1280px, as wide as the longer cards' text. Applied right, the fourth card
        // is more than 40px narrower than its cell at both (`--scripted` with 40 in place of 16): 16 tells Hug from Fill with room to spare.
        widths: [390, 1280],
        shows: () => {
          const cards = [...document.querySelectorAll("article")].map((card) => card.getBoundingClientRect().width);
          const cell = parseFloat(getComputedStyle(document.querySelector("article")!.parentElement!).gridTemplateColumns.split(" ")[0]);
          return cards.length === 4 && cards.slice(0, 3).every((width) => Math.abs(width - cell) <= 1) && cards[3] < cell - 16;
        },
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", '<header className="flex items-center gap-3">', '<header className="grid grid-cols-3 items-center gap-3">');
      // For the loop alone: the fourth card, a usage of its own, keeps fitting its content.
      await desk.edit(
        "src/components/Card.tsx",
        'className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm w-fit"',
        'className={title === "Your turn" ? "rounded-xl border border-stone-200 bg-white p-5 shadow-sm w-fit" : "rounded-xl border border-stone-200 bg-white p-5 shadow-sm w-full"}',
      );
    },
  },
  {
    id: "make-grid-and-phone-stack",
    title:
      "Set up by a round before: four tiles placed absolute in a Frame below the cards, in two rows of two. Now: the four selected and made a Grid with ⇧A (2 columns, a 16px row gap, a 24px column gap); in the phone view (below 768px only), the cards' Grid made a vertical Stack.",
    async design(desk) {
      const { page } = desk;
      // The round before, as an Agent applied it: the tiles are in the code.
      await desk.edit("src/App.tsx", "      </Surface>\n", `      </Surface>\n${TILES_FRAME}`);
      await desk.settle("The round before: four tiles below the cards");
      await page.waitForFunction(() => {
        const tile = document.querySelector(".bg-stone-300");
        return !!tile && getComputedStyle(tile).position === "absolute" && getComputedStyle(tile).width === "100px";
      });

      await enterEditMode(page);
      // The four tiles in the Layers panel, as grid.spec.ts selects them: the Frame is the page's last layer (the last row, opened by
      // the click), its tiles the last four rows named Frame. Checked: four selected, and ⇧A makes a Grid of them, not a Stack.
      const tree = page.getByRole("tree", { name: "Layers" });
      const frames = tree.getByRole("treeitem").filter({ hasText: /^Frame$/ });
      await tree.getByRole("treeitem").last().click();
      await frames.nth(4).waitFor();
      const rows = await frames.count();
      await frames.nth(rows - 4).click();
      for (const n of [3, 2, 1]) await frames.nth(rows - n).click({ modifiers: ["Shift"] });
      const selected = await tree.getByRole("treeitem", { selected: true }).allTextContents();
      if (selected.join() !== "Frame,Frame,Frame,Frame") throw new Error(`The tiles are not the four layers selected: ${selected.join(", ")}`);
      await page.keyboard.press("Shift+A");
      await design(page).getByRole("region", { name: "Grid" }).waitFor();
      await saved(desk, 1);
      await pickGrid(page, phone(page));
      await arrangeAs(page, "Grid", "Vertical");
      await saved(desk, 2);
    },
    changes: [
      {
        kind: "stack",
        expect: "The four tiles are in a new Grid of their own in the Frame, in their order: 2 columns, a 16px row gap, a 24px column gap; none placed absolute now, each where it was in the Frame (within 1px).",
        checkable: true,
        widths: [390, 1280],
        shows: () => {
          const tiles = [...document.querySelectorAll(".bg-stone-300")];
          const grid = tiles[0]?.parentElement;
          const frame = grid?.parentElement;
          if (tiles.length !== 4 || !grid || !frame) return false;
          const style = getComputedStyle(grid);
          const origin = frame.getBoundingClientRect();
          // Where each tile was in the Frame, as the round before placed it: `TILES`.
          const where = [
            [20, 30],
            [144, 30],
            [20, 86],
            [144, 86],
          ];
          return (
            style.display === "grid" &&
            style.gridTemplateColumns.split(" ").length === 2 &&
            style.rowGap === "16px" &&
            style.columnGap === "24px" &&
            grid.children.length === 4 &&
            tiles.every((tile, i) => {
              const r = tile.getBoundingClientRect();
              return tile.parentElement === grid && getComputedStyle(tile).position !== "absolute" && Math.abs(r.left - origin.left - where[i][0]) <= 1 && Math.abs(r.top - origin.top - where[i][1]) <= 1;
            })
          );
        },
      },
      {
        kind: "style",
        expect: "Below 768px the cards are a vertical Stack with a 16px gap; at 768px and up the cards' Grid keeps 3 columns.",
        checkable: true,
        // Its gap the Variable 4, as the Grid's `gap-4` has it now.
        variableKept: ["gap-4", "gap-y-4"],
        // 700: between Tailwind's `sm` (640) and `md` (768), where a breakpoint one off shows; 800 and 1100, where one too wide (`max-lg:`, `max-xl:`) does.
        widths: [390, 700, 800, 1100, 1280],
        shows: ({ width }) => {
          const style = getComputedStyle(document.querySelector("article")!.parentElement!);
          return width < 768 ? style.display === "flex" && style.flexDirection === "column" && style.rowGap === "16px" : style.display === "grid" && style.gridTemplateColumns.split(" ").length === 3;
        },
      },
    ],
    async apply(desk) {
      // As the notes say: a new Grid where the first tile was, the tiles' absolute placement taken off.
      const grid =
        '        <div className="absolute left-[20px] top-[30px] grid grid-cols-2 gap-x-6 gap-y-4">\n' +
        TILES.map((tile) => `  ${tile.replace(/absolute left-\[\d+px\] top-\[\d+px\] /, "")}`).join("") +
        "        </div>\n";
      await desk.edit("src/App.tsx", TILES.join(""), grid);
      await desk.edit("src/App.tsx", CARDS_GRID_TAG, '<Surface className="grid grid-cols-1 gap-4 pb-16 sm:grid-cols-3 max-md:flex max-md:flex-col">');
    },
  },
  {
    id: "areas-grid-phone-stack",
    title:
      "Set up by a round before: from 640px the cards' Grid places the cards by areas, the last card first (`grid-template-areas`, each card's `grid-area`). Now, in the phone view (below 768px only): the cards' Grid made a vertical Stack, the cards in the order they are written.",
    async design(desk) {
      const { page } = desk;
      // The round before, as an Agent applied it: the areas, in Tailwind's arbitrary values.
      await desk.edit("src/App.tsx", CARDS_GRID_TAG, `<Surface className="grid grid-cols-1 gap-4 pb-16 sm:grid-cols-3 ${AREAS}">`);
      await desk.settle("The round before: the cards placed by areas");
      await page.waitForFunction(() => getComputedStyle(document.querySelector("article")!).gridColumnStart === "a");

      await enterEditMode(page);
      await pickGrid(page, phone(page));
      await arrangeAs(page, "Grid", "Vertical");
      await saved(desk, 1);
    },
    changes: [
      {
        kind: "style",
        expect:
          "Below 768px the cards are a vertical Stack with a 16px gap, in the order they are written (Freeze, Arrange, Apply, Your turn, top to bottom); at 768px and up the cards' Grid still places them by its areas, Your turn first.",
        checkable: true,
        // Its gap the Variable 4, as the Grid's `gap-4` has it now.
        variableKept: ["gap-4", "gap-y-4"],
        // 700: between Tailwind's `sm` (640) and `md` (768), where a breakpoint one off shows, and the areas place the cards when the Grid is kept;
        // 800 and 1100, where one too wide (`max-lg:`, `max-xl:`) does.
        widths: [390, 700, 800, 1100, 1280],
        shows: ({ width }) => {
          const cards = [...document.querySelectorAll("article")];
          const style = getComputedStyle(cards[0].parentElement!);
          const tops = cards.map((card) => card.getBoundingClientRect().top);
          if (width < 768) return style.display === "flex" && style.flexDirection === "column" && style.rowGap === "16px" && tops.every((top, i) => i === 0 || top > tops[i - 1]);
          return style.display === "grid" && style.gridTemplateAreas.replace(/\s+/g, " ") === '"d c b" "a . ."' && getComputedStyle(cards[0]).gridColumnStart === "a" && tops[0] > tops[3];
        },
      },
    ],
    async apply(desk) {
      // As the notes say: the Stack below 768px, the areas left as they are, for the widths where it stays a Grid.
      await desk.edit("src/App.tsx", `sm:grid-cols-3 ${AREAS}">`, `sm:grid-cols-3 ${AREAS} max-md:flex max-md:flex-col">`);
    },
  },
];

/**
 * What is wrong with a scenario as designed, by the round it saved: changes
 * not of the kinds it names; one the page's check can tell, or cannot,
 * otherwise than its `checkable` says; one whose value is a Variable its
 * `variable` does not name, or one that names a Variable its value is not.
 */
export function designProblems(scenario: Scenario, saved: SavedChange[]): string[] {
  const kinds = saved.map((change) => change.kind).join(", ");
  const named = scenario.changes.map((change) => change.kind).join(", ");
  if (kinds !== named) return [`changes are ${kinds}, not ${named}`];
  const problems: string[] = [];
  scenario.changes.forEach((change, i) => {
    const checks = pageChecks(saved[i] as unknown as Change, saved as unknown as Change[]);
    if (checks !== change.checkable) problems.push(`change ${i + 1}: the page ${checks ? "can" : "cannot"} check it, but \`checkable\` says otherwise`);
    // Not applied, it writes no Variable either.
    if (change.notOneToOne) return;
    const bound = Object.values(saved[i].variables ?? {}).some(Boolean);
    if (change.variable && change.variableKept) problems.push(`change ${i + 1}: it names both \`variable\` and \`variableKept\``);
    if (bound && !change.variable && !change.variableKept) problems.push(`change ${i + 1}: its value is a Variable, ${Object.values(saved[i].variables!).filter(Boolean).map((v) => v!.name).join(", ")}, which \`variable\` does not name`);
    if (!bound && change.variable) problems.push(`change ${i + 1}: \`variable\` names a Variable, but its value is none`);
    if (!bound && change.variableKept) problems.push(`change ${i + 1}: \`variableKept\` names a Variable, but its value is none`);
  });
  return problems;
}

/** Whether a test holds on the page of each of `widths` (1280 when none): `run` gives the test, and what it is run with, at a width. */
async function showsAtEach<Arg extends object>(pages: Map<number, Page>, widths: number[] | undefined, run: (width: number) => [(arg: Arg) => boolean, Arg]): Promise<boolean> {
  for (const width of widths ?? [1280]) {
    const [test, arg] = run(width);
    const shows = await pages
      .get(width)!
      .evaluate(test as (arg: unknown) => boolean, arg)
      .catch(() => false);
    if (!shows) return false;
  }
  return true;
}

/** Whether the page shows each change, by the scenario's tests, on a page of each width they run at; null for a change with none. */
export async function shown(pages: Map<number, Page>, scenario: Scenario, saved: SavedChange[]): Promise<(boolean | null)[]> {
  return Promise.all(
    scenario.changes.map((change, i) => (change.shows ? showsAtEach(pages, change.widths, (width) => [change.shows!, { change: saved[i], width }]) : null)),
  );
}

/** Whether the page shows each of the scenario's own expectations (`expectations`), at each width they run at; null for one the page does not test. */
export async function held(pages: Map<number, Page>, scenario: Scenario): Promise<(boolean | null)[]> {
  return Promise.all(
    (scenario.expectations ?? []).map((expectation) => (expectation.shows ? showsAtEach(pages, expectation.widths, (width) => [expectation.shows!, { width }]) : null)),
  );
}

/** The widths a scenario's tests run at, its changes' and its own expectations'. */
export function widthsOf(scenario: Scenario): number[] {
  return [...new Set([...scenario.changes, ...(scenario.expectations ?? [])].flatMap((test) => (test.shows ? (test.widths ?? [1280]) : [])))];
}

/**
 * Pages that only look: one at each width the scenario's tests run at, with
 * the editor layer kept from the local service, so they are no pages of the
 * designer's for the round's checks.
 */
export async function openObservers(browser: Browser, scenario: Scenario, url: string) {
  const contexts: BrowserContext[] = [];
  const pages = new Map<number, Page>();
  const close = () => Promise.all(contexts.map((context) => context.close()));
  try {
    for (const width of widthsOf(scenario)) {
      const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 720 }, reducedMotion: "reduce" });
      contexts.push(context);
      await context.route((target) => target.hostname === "127.0.0.1", (route) => route.abort());
      const page = await context.newPage();
      await page.goto(url);
      await page.locator("main").waitFor();
      pages.set(width, page);
    }
  } catch (error) {
    await close();
    throw error;
  }
  return { pages, close };
}
