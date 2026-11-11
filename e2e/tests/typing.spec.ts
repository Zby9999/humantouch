import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { DOUBLE_CLICK_MS } from "../../packages/humantouch/src/client/selection";
import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";

/** Typing in a text layer on the canvas (ticket 144): the I-beam over it, the caret where pressed, Return a line break. */

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });
const layerTree = (page: Page) => page.getByRole("tree", { name: "Layers" });
const cursor = (page: Page) => viewportArea(page).evaluate((el) => getComputedStyle(el).cursor);

/** How wheel turns zoom (camera.ts `ZOOM_SPEED`, `MAX_ZOOM_STEP`). */
const ZOOM_SPEED = 0.01;
const MAX_ZOOM_STEP = 30;
/** The caret to the end of all the words typed in. */
const TO_END = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
});

/** How much a view is scaled on the screen: the camera's zoom. */
function zoomOf(view: Locator) {
  return view.evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
}

/** Zooms with ⌘ + wheel about `at` till the camera's zoom is `zoom`. */
async function zoomTo(page: Page, view: Locator, zoom: number, at: { x: number; y: number }) {
  let dy = -Math.log(zoom / (await zoomOf(view))) / ZOOM_SPEED;
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down("ControlOrMeta");
  while (Math.abs(dy) > 1e-6) {
    const step = Math.max(-MAX_ZOOM_STEP, Math.min(MAX_ZOOM_STEP, dy));
    await page.mouse.wheel(0, step);
    dy -= step;
  }
  await page.keyboard.up("ControlOrMeta");
  await expect.poll(() => zoomOf(view)).toBeCloseTo(zoom, 3);
}

/** Pans with the wheel till `el` starts `left` px in from the viewport's left edge, and its top is `fromBottom` px above its bottom edge. */
async function panTo(page: Page, el: Locator, left: number, fromBottom: number) {
  const area = (await viewportArea(page).boundingBox())!;
  const box = (await el.boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(box.x - (area.x + left), box.y - (area.y + area.height - fromBottom));
  return steadyBox(el);
}

/** Types in the h1 "Third Kind" of `view`, double-clicked once selected at `at`; then waits, so the next press makes no double click with it. */
async function typeInHeading(page: Page, view: Locator, at?: { x: number; y: number }) {
  const h1 = view.contentFrame().locator("h1");
  await layerTree(page).getByRole("treeitem", { name: /^Third Kind/ }).click();
  if (at) await page.mouse.dblclick(at.x, at.y);
  else await h1.dblclick();
  await expect(h1).toHaveAttribute("contenteditable", "plaintext-only");
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  return h1;
}

/** Each character of `el`'s words, where it is on the screen. */
function charBoxes(el: Locator, scale: number, origin: { x: number; y: number }) {
  return el.evaluate(
    (e, { scale, origin }) => {
      const box = e.getBoundingClientRect();
      const doc = e.ownerDocument;
      const walker = doc.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      const chars: { char: string; x: number; y: number; width: number; height: number }[] = [];
      for (let text = walker.nextNode() as Text | null; text; text = walker.nextNode() as Text | null) {
        for (let i = 0; i < text.data.length; i++) {
          const range = doc.createRange();
          range.setStart(text, i);
          range.setEnd(text, i + 1);
          const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
          chars.push({ char: text.data[i], x: origin.x + (r.left - box.left) * scale, y: origin.y + (r.top - box.top) * scale, width: r.width * scale, height: r.height * scale });
        }
      }
      return chars;
    },
    { scale, origin },
  );
}

/** Where the caret is in `el`'s words, and what is selected. */
function caretIn(el: Locator) {
  return el.evaluate((e) => {
    const selection = e.ownerDocument.getSelection()!;
    const range = e.ownerDocument.createRange();
    range.setStart(e, 0);
    range.setEnd(selection.focusNode!, selection.focusOffset);
    return { at: range.toString().length, selected: selection.toString() };
  });
}

/** Whether a point on the screen is on the canvas itself, nothing of the editor's drawn over it. */
function onCanvas(page: Page, { x, y }: { x: number; y: number }) {
  return page.evaluate(({ x, y }) => {
    const hit = document.querySelector("human-touch")!.shadowRoot!.elementFromPoint(x, y);
    return !!hit && (hit.classList.contains("ht-stage") || hit.classList.contains("ht-viewport"));
  }, { x, y });
}

test("while text is typed in, the pointer over it is an I-beam; elsewhere, and once typing ends, the arrow", async ({ page }) => {
  const h1 = await typeInHeading(page, desktop(page));
  const box = await steadyBox(h1);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => cursor(page)).toBe("text");
  // Off the words, below them in the view: the arrow.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 40);
  await expect.poll(() => cursor(page)).toBe("auto");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => cursor(page)).toBe("text");

  await page.keyboard.press("Escape");
  await expect(h1).not.toHaveAttribute("contenteditable");
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
  await expect.poll(() => cursor(page)).toBe("auto");
});

test("in another view than the one typed in, the pointer over the same words is the arrow", async ({ page }) => {
  await typeInHeading(page, desktop(page));
  const box = await steadyBox(tablet(page).contentFrame().locator("h1"));

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => cursor(page)).toBe("auto");
});

for (const [name, view] of [
  ["desktop", desktop],
  ["phone", phone],
] as const) {
  for (const zoom of [1, 2]) {
    test(`in the ${name} view at ${zoom * 100}%, a press, a ⇧press and a drag land where they are made, after typing ran past the viewport's edge`, async ({ page }) => {
      const h1 = view(page).contentFrame().locator("h1");
      const area = (await viewportArea(page).boundingBox())!;
      const start = (await h1.boundingBox())!;
      await zoomTo(page, view(page), zoom, { x: Math.min(Math.max(start.x, area.x + 8), area.x + area.width - 8), y: Math.min(Math.max(start.y, area.y + 8), area.y + area.height - 8) });
      // Near the viewport's bottom left corner: what is typed runs past its right edge, or, wrapping in the phone view, its bottom.
      const box = await panTo(page, h1, 40, 80);
      await typeInHeading(page, view(page), { x: box.x + 10, y: box.y + box.height / 4 });
      await page.keyboard.press("ArrowRight");
      await page.keyboard.type(" and a long line typed on past the edge of the view");
      await expect(h1).toHaveText("Third Kind and a long line typed on past the edge of the view");

      const now = await steadyBox(h1);
      const scale = await zoomOf(view(page));
      const chars = await charBoxes(h1, scale, now);
      const shown: number[] = [];
      for (const [i, c] of chars.entries()) {
        if (c.char === " " || c.x < area.x + 4 || c.x + c.width > area.x + area.width - 4 || c.y < area.y + 4 || c.y + c.height > area.y + area.height - 4) continue;
        if (await onCanvas(page, { x: c.x + c.width / 4, y: c.y + c.height / 2 })) shown.push(i);
      }
      expect(shown.length).toBeGreaterThan(8);

      // On a character's left half, the caret goes before it.
      const press = (i: number) => ({ x: chars[i].x + chars[i].width / 4, y: chars[i].y + chars[i].height / 2 });
      const [first, second] = [shown[1], shown.at(-2)!];
      await page.mouse.click(press(first).x, press(first).y);
      await expect.poll(() => caretIn(h1)).toEqual({ at: first, selected: "" });
      // ⇧ and a press: the words selected reach there.
      await page.waitForTimeout(DOUBLE_CLICK_MS);
      await page.keyboard.down("Shift");
      await page.mouse.click(press(second).x, press(second).y);
      await page.keyboard.up("Shift");
      const text = chars.map((c) => c.char).join("");
      await expect.poll(() => caretIn(h1)).toEqual({ at: second, selected: text.slice(first, second) });

      // Dragged over a word, from its first character's left half to its last one's right half: that word.
      const words = [...text.matchAll(/\w{3,}/g)].filter((m) => [...m[0]].every((_, k) => shown.includes(m.index + k)));
      const word = words[Math.floor(words.length / 2)];
      expect(word).toBeDefined();
      const last = chars[word.index + word[0].length - 1];
      await page.waitForTimeout(DOUBLE_CLICK_MS);
      await page.mouse.move(press(word.index).x, press(word.index).y);
      await page.mouse.down();
      await page.mouse.move(last.x + (last.width * 3) / 4, last.y + last.height / 2, { steps: 6 });
      await page.mouse.up();
      await expect.poll(() => caretIn(h1)).toEqual({ at: word.index + word[0].length, selected: word[0] });
      await expect(h1).toHaveAttribute("contenteditable", "plaintext-only");
    });
  }
}

/** The rows of the change list, opened from the count beside the Design title. */
async function changeRows(page: Page) {
  await page.getByRole("button", { name: /not applied yet/ }).click();
  return page.getByRole("dialog", { name: "Changes" }).getByRole("listitem");
}

/** What each view's h1 reads, line by line, as it is drawn. */
function headings(page: Page) {
  return Promise.all([desktop, tablet, phone].map((view) => view(page).contentFrame().locator("h1").evaluate((h1) => (h1 as HTMLElement).innerText)));
}

test("Return and ⇧Return break the line at the caret; Esc ends typing and keeps the lines, in every view; ⌘Z takes them back", async ({ page }) => {
  const h1 = await typeInHeading(page, desktop(page));
  await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < "Third".length; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(h1).toHaveAttribute("contenteditable", "plaintext-only");
  await page.keyboard.press(TO_END);
  await page.keyboard.press("Shift+Enter");
  // A run of spaces on a line is one space, as ever.
  await page.keyboard.type("Studio   One");
  await page.keyboard.press("Escape");

  await expect(h1).not.toHaveAttribute("contenteditable");
  await expect.poll(() => headings(page)).toEqual(["Third\nKind\nStudio One", "Third\nKind\nStudio One", "Third\nKind\nStudio One"]);
  await expect(h1.locator("br")).toHaveCount(2);
  await expect(await changeRows(page)).toReadAs([/Text.*“Third Kind” → “Third↵Kind↵Studio One”/]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => headings(page)).toEqual(["Third Kind", "Third Kind", "Third Kind"]);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => headings(page)).toEqual(["Third\nKind\nStudio One", "Third\nKind\nStudio One", "Third\nKind\nStudio One"]);
});

test("⌘Return ends typing, as does a press elsewhere; the line breaks typed are kept, those at the end are not", async ({ page }) => {
  const h1 = await typeInHeading(page, phone(page));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Studio");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+Enter");

  await expect(h1).not.toHaveAttribute("contenteditable");
  await expect.poll(() => headings(page)).toEqual(["Third Kind\nStudio", "Third Kind\nStudio", "Third Kind\nStudio"]);

  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await typeInHeading(page, desktop(page));
  const box = await steadyBox(desktop(page).contentFrame().locator("h1"));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Works");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height + 60);

  await expect(desktop(page).contentFrame().locator("h1")).not.toHaveAttribute("contenteditable");
  await expect.poll(() => headings(page)).toEqual(["Third Kind\nStudio\nWorks", "Third Kind\nStudio\nWorks", "Third Kind\nStudio\nWorks"]);
  await expect(await changeRows(page)).toReadAs([/Text.*“Third Kind” → “Third Kind↵Studio↵Works”/]);
});
