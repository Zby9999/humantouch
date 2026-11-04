/**
 * The bench's standard scenarios on the other two examples (ticket 87): the
 * Vite + React 18 + Tailwind v3 one, whose Variables come from its
 * `tailwind.config.js`, and the Next.js App Router + CSS Modules one, with a
 * Server Component and a `'use client'` one. Their changes fall on code
 * written as real projects write it: class names joined with `cn()`, a
 * component's variant picked by a prop, one component used several times and
 * one usage of it changed, a layer rendered on a condition.
 *
 * Each says how the round is applied right (`apply`, for `--scripted`), as the Skill's notes ask for it: the class or rule that
 * sets the value now, the project's Variable where one has the value, a
 * breakpoint written the project's way, one usage changed alone.
 */
import type { Locator, Page } from "@playwright/test";
import { SCENARIOS, boxOf, design, desktop, enterEditMode, layer, phone, pick, saved, setField, type Desk, type Scenario } from "./scenarios.ts";

/** Selects a layer from the Layers panel by its name, then its parent `up` times (Esc), as a designer climbs from a Text Layer to the Frame it is in. */
async function selectUp(desk: Desk, name: string, up: number) {
  await layer(desk.page, name).click();
  for (let i = 0; i < up; i++) await desk.page.keyboard.press("Escape");
}

/**
 * Selects, in a view, the Frame a short Text Layer is in (what `selector`
 * finds there): the Text Layer first, in its middle, then its parent (Esc).
 * The view is the one worked in from then on.
 */
async function pickFrameOfText(page: Page, view: Locator, selector: string) {
  const box = await boxOf(view.contentFrame().locator(selector).first());
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up("ControlOrMeta");
  await page.keyboard.press("Escape");
}

const PRICING = '[data-testid="pricing"]';
const STATS = '[data-testid="stats"]';
const BILLING = '[data-testid="billing"]';

// The tests below run in the page: each stands on its own, with no names from here.

export const OTHER_EXAMPLE_SCENARIOS: Scenario[] = [
  {
    id: "r18-style-variables",
    example: "vite-react18-tw3",
    title:
      "On the React 18 + Tailwind v3 page's Pricing section: the heading at 44px, the Save 20% yearly tag's corner radius 14px, the buttons' row a 22px gap, the Compare plans button (a secondary Button, as Talk to us is) filled #EEF4FF, and the line below the tag (its classes joined by `cn()`) at 19px. Each is a Variable of the project's `tailwind.config.js`: `display`, `card`, `gutter`, `brand-50`, `lead`.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Pricing").click();
      await setField(page, "Font size", "44");
      await selectUp(desk, "Save 20% yearly", 1);
      await setField(page, "Corner radius", "14");
      await selectUp(desk, "Start free", 2);
      await setField(page, "Gap", "22");
      await selectUp(desk, "Compare plans", 1);
      await setField(page, "Fill color", "eef4ff");
      await layer(page, "Free while in beta, then per seat.").click();
      await setField(page, "Font size", "19");
      await saved(desk, 5);
    },
    changes: [
      {
        kind: "style",
        expect: "The Pricing heading is 44px (with the project's `display` size, its line height and letter spacing come along: the Variable's own).",
        checkable: true,
        variable: ["text-display"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="pricing"] h2')!).fontSize === "44px",
      },
      {
        kind: "style",
        expect: "The Save 20% yearly tag has 14px corners.",
        checkable: true,
        variable: ["rounded-card"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="pricing"] > span')!).borderTopLeftRadius === "14px",
      },
      {
        kind: "style",
        expect: "The buttons' row has a 22px gap.",
        checkable: true,
        variable: ["gap-gutter", "gap-x-gutter"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="pricing"] button')!.parentElement!).columnGap === "22px",
      },
      {
        kind: "style",
        expect: "The Compare plans button is #EEF4FF; Talk to us, the other secondary Button, stays white, and Start free stays brand-500.",
        checkable: true,
        variable: ["bg-brand-50"],
        shows: () => {
          const fills = [...document.querySelectorAll('[data-testid="pricing"] button')].map((button) => getComputedStyle(button).backgroundColor);
          return fills.join() === ["rgb(61, 99, 245)", "rgb(238, 244, 255)", "rgb(255, 255, 255)"].join();
        },
      },
      {
        kind: "style",
        expect: "The line “Free while in beta, then per seat.” is 19px.",
        checkable: true,
        variable: ["text-lead"],
        shows: () => getComputedStyle(document.querySelector('[data-testid="pricing"] > p')!).fontSize === "19px",
      },
    ],
    async apply(desk) {
      await desk.edit("src/App.tsx", '<h2 className="text-xl font-semibold text-ink">Pricing</h2>', '<h2 className="text-display font-semibold text-ink">Pricing</h2>');
      await desk.edit("src/App.tsx", '"self-start rounded-pill bg-brand-50 px-2', '"self-start rounded-card bg-brand-50 px-2');
      await desk.edit("src/App.tsx", '<div className="flex flex-wrap gap-3">', '<div className="flex flex-wrap gap-gutter">');
      // This usage alone: a variant of its own, so Talk to us keeps the secondary one.
      await desk.edit(
        "src/components/Button.tsx",
        '  secondary: "border border-brand-100 bg-white text-ink hover:border-brand-500",\n',
        '  secondary: "border border-brand-100 bg-white text-ink hover:border-brand-500",\n  tinted: "border border-brand-100 bg-brand-50 text-ink hover:border-brand-500",\n',
      );
      await desk.edit("src/App.tsx", '<Button variant="secondary">Compare plans</Button>', '<Button variant="tinted">Compare plans</Button>');
      await desk.edit("src/App.tsx", 'cn("text-caption", yearlySaving', 'cn("text-lead", yearlySaving');
    },
  },
  {
    id: "r18-phone-and-stack",
    example: "vite-react18-tw3",
    title:
      "On the React 18 + Tailwind v3 page: in the phone view (below the project's `sm`, 560px, only), the Save 20% yearly tag filled #DBE6FF (the Variable `brand-100`); the Pricing heading and that tag, which shows only while there is a yearly saving, wrapped in a new Stack.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await pickFrameOfText(page, phone(page), `${PRICING} > span`);
      await setField(page, "Fill color", "dbe6ff");
      await selectUp(desk, "Save 20% yearly", 1);
      await layer(page, "Pricing").click({ modifiers: ["Shift"] });
      await page.keyboard.press("Shift+A");
      await saved(desk, 2);
    },
    changes: [
      {
        kind: "style",
        expect: "Below 560px the Save 20% yearly tag is #DBE6FF; at 560px and up it stays #EEF4FF.",
        checkable: true,
        variable: ["bg-brand-100"],
        widths: [390, 768, 1280],
        shows: ({ width }) => getComputedStyle(document.querySelector('[data-testid="pricing"] span')!).backgroundColor === (width < 560 ? "rgb(219, 230, 255)" : "rgb(238, 244, 255)"),
      },
      {
        kind: "stack",
        expect: "The Pricing heading and the Save 20% yearly tag are in a new vertical Stack of their own, with a 16px gap, in the Pricing section.",
        checkable: false,
        shows: () => {
          const heading = document.querySelector('[data-testid="pricing"] h2')!;
          const stack = heading.parentElement!;
          const style = getComputedStyle(stack);
          return (
            stack.matches('[data-testid="pricing"] > *') &&
            stack.contains(document.querySelector('[data-testid="pricing"] span')) &&
            style.display === "flex" &&
            style.flexDirection === "column" &&
            style.rowGap === "16px"
          );
        },
      },
    ],
    async apply(desk) {
      await desk.edit(
        "src/App.tsx",
        `        <h2 className="text-xl font-semibold text-ink">Pricing</h2>
        {yearlySaving > 0 && <span className="self-start rounded-pill bg-brand-50 px-2 py-0.5 text-caption text-brand-700">Save {yearlySaving}% yearly</span>}
`,
        `        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-ink">Pricing</h2>
          {yearlySaving > 0 && <span className="self-start rounded-pill bg-brand-50 px-2 py-0.5 text-caption text-brand-700 max-sm:bg-brand-100">Save {yearlySaving}% yearly</span>}
        </div>
`,
      );
    },
  },
  {
    id: "next-server-usage-text",
    example: "next-app-css-modules",
    title:
      "On the Next.js + CSS Modules page's stats, a Server Component used three times: the second Stat (5,000) filled #E8F0FF, that usage alone; the third one's label reads “bytes shipped to production”; and in the phone view (below 768px only) the stats in 1 column.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await layer(page, "Stat", 1).click();
      await setField(page, "Fill color", "e8f0ff");
      await layer(page, "bytes in production").click();
      await desktop(page).contentFrame().getByText("bytes in production").dblclick();
      await page.keyboard.type("bytes shipped to production");
      await page.keyboard.press("Enter");
      await pick(page, phone(page), `${STATS} > div`);
      await page.keyboard.press("Escape");
      await setField(page, "Columns", "1");
      await saved(desk, 3);
    },
    changes: [
      {
        kind: "style",
        expect: "The second stat (5,000) is #E8F0FF; the first and the third stay white. In `Stat.module.css` (for that usage alone, as by a prop), not Tailwind classes or inline styles.",
        checkable: true,
        shows: () => {
          const fills = [...document.querySelector('[data-testid="stats"]')!.children].map((stat) => getComputedStyle(stat).backgroundColor);
          return fills.join() === ["rgb(255, 255, 255)", "rgb(232, 240, 255)", "rgb(255, 255, 255)"].join();
        },
      },
      {
        kind: "text",
        expect: "The third stat's label reads “bytes shipped to production”.",
        checkable: false,
        shows: () => document.querySelector('[data-testid="stats"]')!.children[2]?.lastElementChild?.textContent === "bytes shipped to production",
      },
      {
        kind: "style",
        expect: "Below 768px the stats are in 1 column; at 768px and up in 3. In `page.module.css` (a media query, as the page writes its breakpoints), not Tailwind classes or inline styles.",
        checkable: true,
        widths: [390, 768, 1280],
        shows: ({ width }) => getComputedStyle(document.querySelector('[data-testid="stats"]')!).gridTemplateColumns.split(" ").length === (width < 768 ? 1 : 3),
      },
    ],
    async apply(desk) {
      // This usage alone: a prop the Stat takes, and a rule of its CSS Module for it.
      await desk.edit("components/Stat.tsx", "export function Stat({ value, label }: { value: string; label: string }) {", "export function Stat({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {");
      await desk.edit("components/Stat.tsx", "<div className={styles.stat}>", "<div className={highlight ? `${styles.stat} ${styles.highlight}` : styles.stat}>");
      await desk.edit("components/Stat.module.css", ".label {", ".highlight {\n  background: rgb(232, 240, 255);\n}\n\n.label {");
      await desk.edit("app/page.tsx", '<Stat value="5,000" label="layers at 60fps" />', '<Stat value="5,000" label="layers at 60fps" highlight />');
      await desk.edit("app/page.tsx", 'label="bytes in production"', 'label="bytes shipped to production"');
      // The page's own breakpoint, as its grid of cards has it.
      await desk.edit("app/page.module.css", "@media (max-width: 767px) {\n  .grid {\n    grid-template-columns: 1fr;\n  }\n", "@media (max-width: 767px) {\n  .grid {\n    grid-template-columns: 1fr;\n  }\n\n  .stats {\n    grid-template-columns: 1fr;\n  }\n");
    },
  },
  {
    id: "next-client-stack-breakpoint",
    example: "next-app-css-modules",
    title:
      "On the Next.js + CSS Modules page's billing picker, a `'use client'` component: the Yearly option, picked now, filled #DBEAFE; the Two months free note, shown only while yearly is picked, with 12px corners and, in the phone view (below 768px only), hidden; the Billing heading and the options wrapped in a new Stack.",
    async design(desk) {
      const { page } = desk;
      await enterEditMode(page);
      await selectUp(desk, "Yearly", 1);
      await setField(page, "Fill color", "dbeafe");
      await selectUp(desk, "Two months free", 1);
      await setField(page, "Corner radius", "12");
      await pickFrameOfText(page, phone(page), `${BILLING} > p`);
      await design(page).getByRole("checkbox", { name: "Visible" }).uncheck();
      await selectUp(desk, "Monthly", 2);
      await layer(page, "Billing").click({ modifiers: ["Shift"] });
      await page.keyboard.press("Shift+A");
      await saved(desk, 4);
    },
    changes: [
      {
        kind: "style",
        expect: "The Yearly option, picked as the round was made, is #DBEAFE, in the component's CSS Module (`BillingPicker.module.css`), not Tailwind classes or inline styles; Monthly stays white. Changing the picked option's own rule (`.selected`) or Yearly's alone both show it: the page is looked at with Yearly picked, as the designer saw it.",
        checkable: true,
        shows: () => {
          const [monthly, yearly] = [...document.querySelectorAll('[data-testid="billing"] button')].map((button) => getComputedStyle(button).backgroundColor);
          return monthly === "rgb(255, 255, 255)" && yearly === "rgb(219, 234, 254)";
        },
      },
      {
        kind: "style",
        expect: "The Two months free note has 12px corners, in `BillingPicker.module.css`, not Tailwind classes or inline styles.",
        checkable: true,
        // Hidden below 768px once the next change is applied: looked at where it shows.
        shows: () => getComputedStyle(document.querySelector('[data-testid="billing"] p')!).borderTopLeftRadius === "12px",
      },
      {
        kind: "style",
        expect: "Below 768px the Two months free note is hidden; at 768px and up it shows. In `BillingPicker.module.css` (a media query, as the page writes its breakpoints), not Tailwind classes or inline styles.",
        checkable: true,
        widths: [390, 768, 1280],
        shows: ({ width }) => (getComputedStyle(document.querySelector('[data-testid="billing"] p')!).display === "none") === width < 768,
      },
      {
        kind: "stack",
        expect: "The Billing heading and the options are in a new vertical Stack of their own, with a 12px gap, in the billing picker; its layout in `BillingPicker.module.css`, not Tailwind classes or inline styles.",
        checkable: false,
        shows: () => {
          const heading = document.querySelector('[data-testid="billing"] h2')!;
          const stack = heading.parentElement!;
          const style = getComputedStyle(stack);
          return (
            stack.matches('[data-testid="billing"] > *') &&
            stack.contains(document.querySelector('[data-testid="billing"] button')) &&
            style.display === "flex" &&
            style.flexDirection === "column" &&
            style.rowGap === "12px"
          );
        },
      },
    ],
    async apply(desk) {
      await desk.edit("components/BillingPicker.module.css", "  background: rgb(239, 246, 255);\n", "  background: rgb(219, 234, 254);\n");
      await desk.edit("components/BillingPicker.module.css", "  border-radius: 4px;\n", "  border-radius: 12px;\n");
      await desk.edit("components/BillingPicker.module.css", ".options {", ".top {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.options {");
      await desk.edit("components/BillingPicker.module.css", "  font-size: 14px;\n}\n", "  font-size: 14px;\n}\n\n@media (max-width: 767px) {\n  .saving {\n    display: none;\n  }\n}\n");
      await desk.edit("components/BillingPicker.tsx", '      <h2 className={styles.heading}>Billing</h2>\n      <div className={styles.options}>', '      <div className={styles.top}>\n      <h2 className={styles.heading}>Billing</h2>\n      <div className={styles.options}>');
      await desk.edit("components/BillingPicker.tsx", "        </button>\n      </div>\n", "        </button>\n      </div>\n      </div>\n");
    },
  },
];

/** Every standard scenario: the React 19 + Tailwind v4 example's, then these. */
export const STANDARD_SCENARIOS: Scenario[] = [...SCENARIOS, ...OTHER_EXAMPLE_SCENARIOS];
