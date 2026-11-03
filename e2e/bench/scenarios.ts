/**
 * The bench's standard scenarios: rounds a designer makes in the editor layer
 * on the Vite + React 19 + Tailwind v4 example, for an Agent to apply. Every
 * kind of change is in one at least, breakpoint changes and layers moved off
 * the canvas and put back included. Each change says what the page shows once
 * it is applied, in words (for a person running the round by hand, ticket 24)
 * and as a test the bench runs on the page.
 *
 * The scenarios drive the editor layer as a designer does; the e2e test
 * `bench-scenarios.spec.ts` checks they still make the changes they name.
 */
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import type { Bindings, Change } from "../../packages/03kind/src/client/changeset.ts";
import { checkable as pageChecks, PLACING } from "../../packages/03kind/src/client/checkable.ts";
import { TOGGLE_LABEL } from "../playwright.config.ts";

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
}

/** A change as the ChangeSet saves it; the bench reads only these. */
export interface SavedChange {
  id: number;
  kind: Change["kind"];
  property?: string;
  after?: any;
  /** A layer placed by its X and Y: the margins the canvas draws it past them by. */
  margins?: { x: number; y: number };
  /** A change at a breakpoint: its range, and the parts of it the page was read in. */
  breakpoint?: object;
  parts?: object[];
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
  /** Whether the editor layer's page check can tell it (the Skill's list): not a Stack made or dissolved, a move into another container, a copy, a layer put back, new words, a brief; a new layer is, by its place (ticket 76). */
  checkable: boolean;
  /** The Variable the notes name for it, as the code may write it (its Tailwind class, or its CSS variable): the bench looks for one of these in the lines the Agent added. */
  variable?: string[];
  /** The page widths `shows` runs at; 1280 when not given. */
  widths?: number[];
  /** None for a brief: what it takes is the Agent's to work out, and the report's to say. None for a change `notOneToOne` either. */
  shows?: Shows;
  /**
   * Why the change cannot be applied 1:1 (ticket 86), in words: an Agent
   * applying the round right lists it under ⚠️ in its report, with why and
   * what instead, and never under ✓. The bench counts how often it is
   * (`reportedAsExpected`).
   */
  notOneToOne?: string;
}

export interface Scenario {
  id: string;
  /** What the designer does, in words. */
  title: string;
  /** Makes the round in the editor layer, and waits until it is saved. */
  design(desk: Desk): Promise<void>;
  changes: ScenarioChange[];
  /**
   * Writes the round into the code as an Agent applying it right would,
   * once it is claimed (`desk.edit`), for the bench's scripted pass
   * (`pnpm bench:agents --scripted`): every change shows by its own test then,
   * so a test that cannot hold is found before an Agent is measured by it.
   * Changes `notOneToOne` are left as they were.
   */
  apply?(desk: Desk): Promise<void>;
}

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const layer = (page: Page, name: string, nth = 0) => page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth);

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await desktop(page).contentFrame().locator("article").first().waitFor();
  await phone(page).contentFrame().locator("article").first().waitFor();
}

async function setField(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** What a field of the Design panel has in it now, as a number. */
async function numberIn(page: Page, name: string) {
  return Number(await design(page).getByRole("textbox", { name, exact: true }).inputValue());
}

/** Picks the color Variable `name` for a color field (`Fill color`), as a designer finds it by typing its name in the field. */
async function pickColorVariable(page: Page, field: string, name: string) {
  const hex = design(page).getByRole("textbox", { name: field, exact: true });
  await hex.click();
  await hex.press("ControlOrMeta+a");
  await hex.pressSequentially(name);
  await page.getByRole("listbox", { name: "Matching variables" }).getByRole("option", { selected: true, name, exact: true }).waitFor();
  await hex.press("Enter");
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Not on screen: ${locator}`);
  return box;
}

/** Selects, in a view, the deepest layer just inside the top left of what `selector` finds there: the view is the one worked in from then on. */
async function pick(page: Page, view: Locator, selector: string) {
  const box = await boxOf(view.contentFrame().locator(selector).first());
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(box.x + 4, box.y + 4);
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
async function saved(desk: Desk, count: number) {
  for (let tries = 0; desk.changeSet()?.changes.length !== count; tries++) {
    if (tries > 100) throw new Error(`The round has ${desk.changeSet()?.changes.length ?? 0} changes saved, not ${count}`);
    await desk.page.waitForTimeout(100);
  }
  // A style change at a breakpoint is saved again once the page is read in each part of its range (ticket 65): the example's ranges all have parts.
  const unread = () => desk.changeSet()!.changes.filter((change) => change.kind === "style" && change.breakpoint && !(PLACING as readonly string[]).includes(change.property ?? "") && !change.parts);
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
      await design(page).getByRole("group", { name: "Brief" }).getByRole("button", { name: "Add brief" }).click();
      await page.keyboard.type("When pressed, it shrinks a little and springs back");
      await page.keyboard.press("ControlOrMeta+Enter");
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
        expect: "The three cards of the loop are flex columns with a 12px gap; the fourth card is as it was.",
        checkable: true,
        variable: ["gap-3", "gap-y-3"],
        shows: () => {
          const cards = [...document.querySelectorAll("article")].map((card) => getComputedStyle(card));
          const stack = (style: CSSStyleDeclaration) => style.display === "flex" && style.flexDirection === "column" && style.rowGap === "12px";
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
        checkable: false,
        shows: () => document.querySelector("h1")?.textContent === "Third Kind Studio",
      },
    ],
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
      await page.keyboard.press("t");
      await page.mouse.move(paragraph.x + 20, paragraph.y + paragraph.height - 2);
      await page.mouse.down();
      await page.mouse.move(paragraph.x + 200, paragraph.y + paragraph.height + 10, { steps: 6 });
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
      await page.getByRole("button", { name: "Add brief" }).click();
      const brief = page.getByRole("textbox", { name: "Brief" });
      await brief.fill("A row of three partner logos");
      await brief.press("Enter");
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
        variable: ["pt-3", "pr-6", "pb-1", "pl-2"],
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
          // Tailwind writes transparent shadows of its own beside one: those are none.
          const shadows = shadow === "none" ? [] : shadow.split(/,(?![^(]*\))/).map((one) => one.trim()).filter((one) => one !== "rgba(0, 0, 0, 0) 0px 0px 0px 0px");
          return shadows.join() === "rgba(0, 0, 0, 0.25) 0px 8px 16px 0px";
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
      await desk.edit("src/index.css", '  --font-display: "Space Grotesk", sans-serif;\n', '  --font-display: "Space Grotesk", sans-serif;\n  --color-brand: #2563eb;\n');
      await desk.settle("The round before: the project's own brand color");

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
        widths: [390, 800, 1100, 1280],
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
        widths: [390, 1280],
        shows: ({ width }) => (getComputedStyle(document.querySelector("h1")!).fontSize === "24px") === width < 768,
      },
      {
        kind: "style",
        expect: "From 768px up the title is 48px; below 768px it is not (the phone's 24px holds there).",
        checkable: true,
        variable: ["text-5xl", "--text-5xl"],
        widths: [390, 800, 1280],
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
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", '<Surface className="grid', '<Surface className="bg-stone-100 grid');
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
    if (bound && !change.variable) problems.push(`change ${i + 1}: its value is a Variable, ${Object.values(saved[i].variables!).filter(Boolean).map((v) => v!.name).join(", ")}, which \`variable\` does not name`);
    if (!bound && change.variable) problems.push(`change ${i + 1}: \`variable\` names a Variable, but its value is none`);
  });
  return problems;
}

/** Whether the page shows each change, by the scenario's tests, on a page of each width they run at; null for a change with none. */
export async function shown(pages: Map<number, Page>, scenario: Scenario, saved: SavedChange[]): Promise<(boolean | null)[]> {
  return Promise.all(
    scenario.changes.map(async (change, i) => {
      if (!change.shows) return null;
      for (const width of change.widths ?? [1280]) {
        const shows = await pages
          .get(width)!
          .evaluate(change.shows, { change: saved[i], width })
          .catch(() => false);
        if (!shows) return false;
      }
      return true;
    }),
  );
}

/** The widths a scenario's tests run at. */
export function widthsOf(scenario: Scenario): number[] {
  return [...new Set(scenario.changes.flatMap((change) => (change.shows ? (change.widths ?? [1280]) : [])))];
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
