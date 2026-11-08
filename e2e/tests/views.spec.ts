import { canvasInPlace, steadyBox, expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

/** How many columns the cards are laid out in, in a view. */
function cardColumns(view: Locator) {
  return view.evaluate((frame: HTMLIFrameElement) => {
    const cards = [...frame.contentDocument!.querySelectorAll("article")];
    return new Set(cards.map((card) => card.getBoundingClientRect().left)).size;
  });
}

/** The middle of an element in a view, in page coordinates. */
async function pointOn(view: Locator, selector: string) {
  const box = (await view.contentFrame().locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where the selection box is drawn, in page coordinates, one per view. */
function selectionBoxes(page: Page) {
  return page.locator(".tk-selection").evaluateAll((boxes) =>
    boxes.map((box) => {
      const r = box.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
}

/** Once the views have been fitted and painted, a couple of frames on. */
const painted = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

async function boxOf(view: Locator, selector: string) {
  return (await view.contentFrame().locator(selector).first().boundingBox())!;
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("edit mode shows the page as desktop, tablet and phone side by side, each with the CSS breakpoints of its width", async ({ page }) => {
  const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
  await enterEditMode(page);

  await expect(desktop(page)).toHaveCSS("width", `${pageWidth}px`);
  await expect(tablet(page)).toHaveCSS("width", "768px");
  await expect(phone(page)).toHaveCSS("width", "390px");
  // Side by side, left to right, all in view.
  const area = (await viewportArea(page).boundingBox())!;
  const boxes = [await desktop(page).boundingBox(), await tablet(page).boundingBox(), await phone(page).boundingBox()].map((b) => b!);
  expect(boxes[0].x + boxes[0].width).toBeLessThan(boxes[1].x);
  expect(boxes[1].x + boxes[1].width).toBeLessThan(boxes[2].x);
  expect(boxes[0].x).toBeGreaterThan(area.x);
  expect(boxes[2].x + boxes[2].width).toBeLessThan(area.x + area.width);

  // `sm:grid-cols-3`: three columns from 640px up, one below.
  await expect.poll(() => cardColumns(desktop(page))).toBe(3);
  await expect.poll(() => cardColumns(tablet(page))).toBe(3);
  await expect.poll(() => cardColumns(phone(page))).toBe(1);
  // `h-screen`: as tall as the window the page was frozen in, in every view.
  const height = await page.evaluate(() => innerHeight);
  for (const view of [desktop(page), tablet(page), phone(page)]) {
    await expect(view.contentFrame().getByTestId("hero")).toHaveCSS("height", `${height}px`);
  }

  // Each view is named, with the widths it covers (designer, 2026-11-08): the example's `md` is 768px and `xl` 1280px.
  // That it shows only what CSS does at its width is in their title; the label's text is the name and the widths alone.
  const covers = { Desktop: "≥ 1280", Tablet: "768–1279", Phone: "≤ 767" };
  for (const [name, widths] of Object.entries(covers)) {
    const label = page.getByRole("group", { name: `${name} view` });
    await expect(label).toHaveText(`${name}${widths}`);
    await expect(label.locator(".tk-view-range")).toHaveText(widths);
    await expect(label.locator(".tk-view-range")).toHaveAttribute("title", /what the page's CSS does at this width/);
    await expect(label.getByRole("button", { name: `Full screen ${name} view`, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Delete Desktop view" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Phone view" })).toBeVisible();
});

test("selecting in one view selects the same layer in every view; an edit shows in every view", async ({ page }) => {
  await enterEditMode(page);

  const point = await pointOn(phone(page), "article:last-child h3");
  // ⌘-click: the deepest layer under the pointer.
  await page.keyboard.down("Meta");
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up("Meta");
  await expect(page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { selected: true })).toHaveText("Your turn");

  // One box round the layer in each view.
  await expect.poll(async () => (await selectionBoxes(page)).length).toBe(3);
  const boxes = await selectionBoxes(page);
  const views = [desktop(page), tablet(page), phone(page)];
  for (let i = 0; i < views.length; i++) {
    const at = await boxOf(views[i], "article:last-child h3");
    expect(boxes[i].x).toBeCloseTo(at.x, 0);
    expect(boxes[i].width).toBeCloseTo(at.width, 0);
  }

  // Edited in the desktop view, at every width (in the phone view, it would apply at its breakpoint only).
  const desktopPoint = await pointOn(desktop(page), "article:last-child h3");
  await page.keyboard.down("Meta");
  await page.mouse.click(desktopPoint.x, desktopPoint.y);
  await page.keyboard.up("Meta");
  const opacity = design(page).getByRole("textbox", { name: "Opacity", exact: true });
  await opacity.fill("50");
  await opacity.press("Enter");
  for (const view of views) {
    await expect(view.contentFrame().locator("article:last-child h3")).toHaveCSS("opacity", "0.5");
  }
});

/**
 * Watches, from now on, for the first card in the tablet view to show `value`
 * for the CSS property `property`: what it settles with, once it does, tells
 * how many frames had been drawn since the last of the events `after` (the one
 * that sets the value), and how long after it that was, ms. Watched in the page
 * itself, frame by frame.
 */
async function watchTablet(page: Page, property: string, value: string, after: string) {
  await tablet(page).evaluate(
    (iframe: HTMLIFrameElement, [property, value, after]) => {
      const card = iframe.contentDocument!.querySelector("article")!;
      (window as Watched).tabletShows = new Promise((done) => {
        let at = 0;
        let frames = 0;
        const startCounting = () => {
          at = performance.now();
          frames = 0;
        };
        addEventListener(after, startCounting, true);
        const look = () => {
          if (at) frames++;
          if (at && getComputedStyle(card).getPropertyValue(property) === value) {
            removeEventListener(after, startCounting, true);
            done({ frames, ms: performance.now() - at });
          } else requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      });
    },
    [property, value, after],
  );
  return () => page.evaluate(() => (window as Watched).tabletShows!);
}

/** What `watchTablet` keeps in the page. */
type Watched = { tabletShows?: Promise<{ frames: number; ms: number }> };

test("a value set once in the Design panel shows in the views beside the frame after; stepped with ↑ or dragged on its icon, once the steps pause", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  const clip = design(page).getByRole("checkbox", { name: "Clip content" });
  // The first change to each property makes the card's edit styles, which every view shows at once.
  await radius.fill("3");
  await radius.press("Enter");
  await clip.check();
  await expect(tablet(page).contentFrame().locator("article").first()).toHaveCSS("overflow", "hidden");

  // Typed, applied on Enter: the views beside show it within the two frames after the one that draws it in the desktop view (ADR 0011), far sooner than the steps pause.
  let shown = await watchTablet(page, "border-radius", "5px", "keydown");
  await radius.fill("5");
  await radius.press("Enter");
  await expect.poll(async () => (await shown()).frames).toBeLessThanOrEqual(3);
  // Toggled: the same.
  shown = await watchTablet(page, "overflow", "visible", "click");
  await clip.uncheck();
  await expect.poll(async () => (await shown()).frames).toBeLessThanOrEqual(3);

  // ↑: one step of a run of them, which the views beside show once the steps pause (ADR 0011).
  shown = await watchTablet(page, "border-radius", "6px", "keydown");
  await radius.press("ArrowUp");
  await expect.poll(async () => (await shown()).ms).toBeGreaterThanOrEqual(100);
  // Dragged on the icon: so is each px.
  const { x, y } = (await page.locator('.tk-field:has([aria-label="Corner radius"]) .tk-scrub').boundingBox())!;
  shown = await watchTablet(page, "border-radius", "9px", "pointermove");
  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 3; i++) await page.mouse.move(x + 4 + i, y + 4);
  await page.mouse.up();
  await expect.poll(async () => (await shown()).ms).toBeGreaterThanOrEqual(100);
  await expect(radius).toHaveValue("9");
});

test("⌘Z and ⇧⌘Z right after steps of a value, while the views beside wait for them to pause, show in every view in the same frame (ADR 0011)", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  const cards = [desktop(page), tablet(page), phone(page)].map((view) => view.contentFrame().locator("article").first());
  await radius.fill("3");
  await radius.press("Enter");
  for (const card of cards) await expect(card).toHaveCSS("border-radius", "3px");
  // In the frame after each ⌘Z or ⇧⌘Z: the first card's corner radius in each view.
  await page.evaluate(() => {
    const w = window as unknown as { framesAfter: string[][] };
    w.framesAfter = [];
    const frames = [...document.querySelectorAll("third-kind")].flatMap((host) => [...(host.shadowRoot ?? host).querySelectorAll("iframe")]);
    addEventListener(
      "keydown",
      (event) => {
        if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey)) return;
        requestAnimationFrame(() => {
          const shown = frames.filter((frame) => /Canvas|Tablet|Phone/.test(frame.title));
          w.framesAfter.push(shown.map((frame) => getComputedStyle(frame.contentDocument!.querySelector("article")!).borderRadius));
        });
      },
      true,
    );
  });
  const framesAfter = () => page.evaluate(() => (window as unknown as { framesAfter: string[][] }).framesAfter);

  // Stepped with ↑ from 3 to 6: the views beside catch up with 4 as the steps pause, then wait again, at 4.
  await radius.press("ArrowUp");
  for (const card of cards) await expect(card).toHaveCSS("border-radius", "4px");
  await radius.press("ArrowUp");
  await radius.press("ArrowUp");
  // Each press of ↑ is a step of its own: undone, 5, redone, 6, in every view at once.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(framesAfter).toEqual([["5px", "5px", "5px"]]);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(framesAfter).toEqual([
    ["5px", "5px", "5px"],
    ["6px", "6px", "6px"],
  ]);
  await expect(radius).toHaveValue("6");
});

test("a layer dragged in the phone view goes where it is let go there, and moves in every view; the layers making room go there at once, in the views beside once the pointer pauses", async ({ page }) => {
  // With motion not reduced, too.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
  const hero = '[data-testid="hero"]';
  const button = phone(page).contentFrame().locator(`${hero} > button`);
  const paragraph = phone(page).contentFrame().locator(`${hero} > p`);

  const start = (await button.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  // What each view shows as the paragraph first makes room: read as the move of the pointer that made it is handled.
  await page.locator("iframe.tk-canvas").evaluateAll((frames: HTMLIFrameElement[], hero) => {
    const shifted = (frame: HTMLIFrameElement) => getComputedStyle(frame.contentDocument!.querySelector(`${hero} > p`)!).translate;
    const phone = frames.find((frame) => frame.title === "Phone 390")!;
    const onMove = () => {
      if (shifted(phone) === "none") return;
      (window as Window & { firstRoom?: Record<string, string> }).firstRoom = Object.fromEntries(frames.map((frame) => [frame.title, shifted(frame)]));
      removeEventListener("pointermove", onMove);
    };
    addEventListener("pointermove", onMove);
  }, hero);
  const p = (await paragraph.boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + 1, { steps: 8 });
  // The line where it would go is drawn in the phone view.
  const line = (await page.locator(".tk-drop-line").boundingBox())!;
  expect(line.x).toBeGreaterThanOrEqual(p.x - 1);
  expect(line.x + line.width).toBeLessThanOrEqual(p.x + p.width + 1);
  // The paragraph makes room in the phone view at once; the desktop and tablet views do not follow the pointer as it moves.
  const first = await page.evaluate(() => (window as Window & { firstRoom?: Record<string, string> }).firstRoom);
  expect(first?.["Phone 390"]).not.toBe("none");
  expect(first?.["Canvas"]).toBe("none");
  expect(first?.["Tablet 768"]).toBe("none");
  // The pointer paused: every view has it make room, going straight to its place: no view slides it there.
  for (const view of [desktop(page), tablet(page), phone(page)]) {
    const making = view.contentFrame().locator(`${hero} > p`);
    await expect(making).not.toHaveCSS("translate", "none");
    await expect.poll(() => making.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  }
  await page.mouse.up();

  for (const view of [desktop(page), tablet(page), phone(page)]) {
    const order = await view.contentFrame().locator(hero).evaluate((el) => [...el.children].map((child) => child.localName));
    expect(order).toEqual(["header", "button", "p"]);
    await expect(view.contentFrame().locator(`${hero} > p`)).toHaveCSS("translate", "none");
  }
});

test("while dragging in the phone view, ⌘Z and ⇧⌘Z do nothing in any view; let go, one ⌘Z takes the drag back, and the one before it the edit made before", async ({ page }) => {
  await enterEditMode(page);
  const tree = page.getByRole("tree", { name: "Layers" });
  const badge = page.getByRole("button", { name: /not applied yet/ });
  // Something to undo, the title deleted, and something to redo, the Beta badge deleted and that undone.
  await tree.getByRole("treeitem", { name: "Third Kind", exact: true }).click();
  await page.keyboard.press("Delete");
  await tree.getByRole("treeitem", { name: "Badge", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(badge).toHaveAccessibleName("2 changes not applied yet");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge).toHaveAccessibleName("1 change not applied yet");
  const beta = (view: Locator) => view.contentFrame().getByTestId("acme-badge");
  await tree.getByRole("treeitem", { name: "Button", exact: true }).click();
  const hero = '[data-testid="hero"]';
  const views = [desktop(page), tablet(page), phone(page)];
  const orders = () => Promise.all(views.map((view) => view.contentFrame().locator(hero).evaluate((el) => [...el.children].map((child) => child.localName))));
  const paragraphStyles = () => Promise.all(views.map((view) => view.contentFrame().locator(`${hero} > p`).evaluate((el) => el.getAttribute("style"))));
  const before = await paragraphStyles();
  const rows = await tree.getByRole("treeitem").allTextContents();

  const button = phone(page).contentFrame().locator(`${hero} > button`);
  const start = (await button.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  const p = (await phone(page).contentFrame().locator(`${hero} > p`).boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + 1, { steps: 8 });
  // Once the pointer pauses, every view has the paragraph make room.
  for (const view of views) await expect(view.contentFrame().locator(`${hero} > p`)).not.toHaveCSS("translate", "none");
  for (const key of ["ControlOrMeta+z", "ControlOrMeta+Shift+z"]) {
    await page.keyboard.press(key);
    for (const view of views) {
      await expect(view.contentFrame().locator("h1")).toBeHidden();
      await expect(beta(view)).toBeVisible();
      await expect(view.contentFrame().locator(`${hero} > p`)).not.toHaveCSS("translate", "none");
    }
  }
  await expect.poll(() => orders()).toEqual([0, 1, 2].map(() => ["header", "p", "button"]));
  await expect(badge).toHaveAccessibleName("1 change not applied yet");
  await expect.poll(() => tree.getByRole("treeitem").allTextContents()).toEqual(rows);
  await page.mouse.up();

  await expect.poll(() => orders()).toEqual([0, 1, 2].map(() => ["header", "button", "p"]));
  await expect.poll(() => paragraphStyles()).toEqual(before);
  await expect(badge).toHaveAccessibleName("2 changes not applied yet");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => orders()).toEqual([0, 1, 2].map(() => ["header", "p", "button"]));
  for (const view of views) await expect(view.contentFrame().locator("h1")).toBeHidden();
  await page.keyboard.press("ControlOrMeta+z");
  for (const view of views) await expect(view.contentFrame().locator("h1")).toBeVisible();
  await expect(badge).toHaveCount(0);
});

test("while dragging in the phone view, ⌘D, Delete and the other keys that edit do nothing in any view; let go, no view keeps a style of the drag, nor a copy of the layer", async ({ page }) => {
  await enterEditMode(page);
  const tree = page.getByRole("tree", { name: "Layers" });
  const badge = page.getByRole("button", { name: /not applied yet/ });
  await tree.getByRole("treeitem", { name: "Button", exact: true }).click();
  const hero = '[data-testid="hero"]';
  const views = [desktop(page), tablet(page), phone(page)];
  const orders = () => Promise.all(views.map((view) => view.contentFrame().locator(hero).evaluate((el) => [...el.children].map((child) => child.localName))));
  /** In each view, the elements of the hero with a style left of a drag: not taking the pointer, over the others, or shifted. */
  const dragStyled = () =>
    Promise.all(views.map((view) => view.contentFrame().locator(`${hero} [style*="pointer-events"], ${hero} [style*="z-index"], ${hero} [style*="translate"]`).count()));
  await expect.poll(() => dragStyled()).toEqual([0, 0, 0]);
  const rows = await tree.getByRole("treeitem").allTextContents();

  const button = phone(page).contentFrame().locator(`${hero} > button`);
  const start = (await button.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  const p = (await phone(page).contentFrame().locator(`${hero} > p`).boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + 1, { steps: 8 });
  for (const view of views) await expect(view.contentFrame().locator(`${hero} > p`)).not.toHaveCSS("translate", "none");
  for (const key of ["ControlOrMeta+d", "Delete", "Backspace", "ControlOrMeta+x", "Shift+A", "Alt+Shift+A", "ControlOrMeta+Shift+g", "ArrowDown"]) {
    await page.keyboard.press(key);
    await expect.poll(() => orders(), key).toEqual([0, 1, 2].map(() => ["header", "p", "button"]));
    for (const view of views) await expect(view.contentFrame().locator(`${hero} > p`), key).not.toHaveCSS("translate", "none");
  }
  await expect(badge).toHaveCount(0);
  await expect.poll(() => tree.getByRole("treeitem").allTextContents()).toEqual(rows);
  await page.mouse.up();

  await expect.poll(() => orders()).toEqual([0, 1, 2].map(() => ["header", "button", "p"]));
  await expect.poll(() => dragStyled()).toEqual([0, 0, 0]);
  await expect(badge).toHaveAccessibleName("1 change not applied yet");
});

test("a view of another width can be added and the tablet view deleted; the views stay so after a reload; the desktop view stays", async ({ page }) => {
  await enterEditMode(page);

  await page.getByRole("button", { name: "Add view" }).click();
  const width = page.getByRole("spinbutton", { name: "New view width" });
  await width.fill("1024");
  await width.press("Enter");
  const custom = page.locator('iframe[title="Custom 1024"]');
  await expect(custom).toHaveCSS("width", "1024px");
  await expect(custom.contentFrame().locator("h1")).toBeVisible();

  await page.getByRole("button", { name: "Delete Tablet view" }).click();
  await expect(tablet(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Desktop view" })).toHaveCount(0);

  await page.reload();
  await enterEditMode(page);
  await expect(custom).toHaveCSS("width", "1024px");
  await expect(tablet(page)).toHaveCount(0);
  const order = await page.locator("iframe.tk-canvas").evaluateAll((frames) => frames.map((frame) => frame.getAttribute("title")));
  expect(order).toEqual(["Canvas", "Custom 1024", "Phone 390"]);
});

test("a dialog open when the page was frozen is open in every view, laid out at each view's width", async ({ page }) => {
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await enterEditMode(page);

  for (const view of [desktop(page), tablet(page), phone(page)]) {
    const dialog = view.contentFrame().getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Centered across the view, as the page centers it in a window that wide.
    const [left, right, width] = await view.contentFrame().locator("[role=dialog]").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [r.left, el.ownerDocument.documentElement.clientWidth - r.right, el.ownerDocument.documentElement.clientWidth];
    });
    expect(left).toBeCloseTo(right, 0);
    expect(width).toBe(Number(await view.evaluate((frame: HTMLIFrameElement) => frame.offsetWidth)));
  }
});

test("the camera moved while typing in a view, and then at rest, the words go on where the caret was; once typing ends nothing shown changes", async ({ page }) => {
  await enterEditMode(page);
  const layers = page.getByRole("tree", { name: "Layers" });
  await layers.getByRole("treeitem", { name: "Third Kind", exact: true }).click();
  const titles = [desktop(page), tablet(page), phone(page)].map((view) => view.contentFrame().locator("h1"));
  const title = phone(page).contentFrame().locator("h1");
  const point = await pointOn(phone(page), "h1");
  await page.mouse.dblclick(point.x, point.y);
  await page.keyboard.type("Third ");
  const caret = () =>
    title.evaluate((el) => {
      const doc = el.ownerDocument;
      return doc.hasFocus() && doc.activeElement === el ? doc.getSelection()!.anchorOffset : null;
    });
  await expect.poll(caret).toBe("Third ".length);

  // Panned and zoomed by the wheel, then left at rest well past the 100ms the stage waits for.
  await page.mouse.wheel(0, 40);
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.wheel(0, -20);
  await page.keyboard.up("ControlOrMeta");
  await page.waitForTimeout(400);
  await expect.poll(() => caret()).toBe("Third ".length);
  await page.keyboard.type("Edit");
  for (const h1 of titles) await expect(h1).toHaveText("Third Edit");

  await page.keyboard.press("Escape");
  const boxes = await selectionBoxes(page);
  await page.waitForTimeout(400);
  for (const h1 of titles) await expect(h1).toHaveText("Third Edit");
  await expect(layers.getByRole("treeitem", { selected: true })).toHaveText("Third Edit");
  await expect.poll(() => selectionBoxes(page)).toEqual(boxes);
});

test("the camera moved while a number's icon or a layer is pressed: the stage is drawn again only once the mouse is let go", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  // The stage in place, its animation into edit mode over, and drawn again at its end.
  await expect.poll(() => page.locator(".tk-stage").evaluate((stage) => stage.getAnimations().length)).toBe(0);
  // And at rest well past the 100ms it waits for, whatever moved the camera as the views were laid out.
  await page.waitForTimeout(400);
  // Each time the stage is drawn only as far as it shows (`drawOnlyWhatShows`), it is taken out of the layout for a moment.
  await page.locator(".tk-stage").evaluate((stage) => {
    const w = window as unknown as { redrawn: number };
    w.redrawn = 0;
    new MutationObserver((records) => {
      for (const record of records) if (record.oldValue?.includes("display: none")) w.redrawn++;
    }).observe(stage, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
  });
  const redrawn = () => page.evaluate(() => (window as unknown as { redrawn: number }).redrawn);
  const icon = page.locator('.tk-field:has([aria-label="Corner radius"]) .tk-scrub');
  const onIcon = async () => {
    const box = await steadyBox(icon);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  for (const pressAt of [onIcon, () => pointOn(desktop(page), "article")]) {
    const before = await redrawn();
    const at = await pressAt();
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    // Pressed, not moved, the camera moved by ⇧1 (which goes on while pressed): well past the 100ms the stage waits for, it is not drawn again meanwhile.
    await page.keyboard.press("Shift+Digit1");
    await page.waitForTimeout(400);
    await expect.poll(() => redrawn()).toBe(before);
    await page.mouse.up();
    await expect.poll(redrawn).toBe(before + 1);
  }
});

/**
 * Counts each time the stage is drawn only as far as it shows (`drawOnlyWhatShows`): it is taken out of the layout
 * for a moment. Once edit mode is up and the stage at rest well past the 100ms it waits for.
 */
async function countRedraws(page: Page) {
  await expect.poll(() => page.locator(".tk-stage").evaluate((stage) => stage.getAnimations().length)).toBe(0);
  await page.waitForTimeout(400);
  await page.locator(".tk-stage").evaluate((stage) => {
    const w = window as unknown as { redrawn: number };
    w.redrawn = 0;
    new MutationObserver((records) => {
      for (const record of records) if (record.oldValue?.includes("display: none")) w.redrawn++;
    }).observe(stage, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
  });
  return () => page.evaluate(() => (window as unknown as { redrawn: number }).redrawn);
}

/** Where each view's bottom and right edge are, and the viewport's, in page px; and the camera's transform. */
function viewEdges(page: Page) {
  return viewportArea(page).evaluate((area) => {
    const box = area.getBoundingClientRect();
    const views = [...area.querySelectorAll<HTMLIFrameElement>(".tk-stage iframe.tk-canvas")].map((frame) => {
      const r = frame.getBoundingClientRect();
      return { title: frame.title, bottom: r.bottom, right: r.right };
    });
    return { top: box.top, bottom: box.bottom, right: box.right, views, transform: area.querySelector<HTMLElement>(".tk-stage")!.style.transform };
  });
}

test("the window made shorter, then taller till every view shows whole, then shorter again: each time, the stage is drawn again only as far as it shows, the camera where it was", async ({ page }) => {
  await enterEditMode(page);
  const redrawn = await countRedraws(page);
  const at = await viewEdges(page);
  const lowest = Math.max(...at.views.map((view) => view.bottom));
  expect(lowest, "every view shows whole at first").toBeLessThanOrEqual(at.bottom);
  const { width, height } = page.viewportSize()!;
  const shorter = Math.floor(height - (at.bottom - lowest)) - 60;

  // Shorter: the views reach below the viewport. Drawn again, as it may have been drawn whole.
  await page.setViewportSize({ width, height: shorter });
  await expect.poll(async () => (await viewEdges(page)).bottom).toBeLessThan(lowest);
  await expect.poll(redrawn).toBe(1);
  // Taller, as it was: every view shows whole.
  await page.setViewportSize({ width, height });
  await expect.poll(redrawn).toBe(2);
  // Shorter again: drawn whole meanwhile, it is drawn again.
  await page.setViewportSize({ width, height: shorter });
  await expect.poll(redrawn).toBe(3);
  await expect.poll(async () => (await viewEdges(page)).transform).toBe(at.transform);

  // Drawn with views out of sight: a value changed, which makes the views taller, does not draw the stage again.
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await design(page).getByRole("textbox", { name: "Gap", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  await expect.poll(() => redrawn()).toBe(3);
});

test("a view deleted, the others then showing whole, and added back: each time, the stage is drawn again only as far as it shows; a window change with views out of sight does not", async ({ page }) => {
  await enterEditMode(page);
  const redrawn = await countRedraws(page);
  const at = await viewEdges(page);
  expect(Math.max(...at.views.map((view) => view.bottom)), "every view shows whole at first").toBeLessThanOrEqual(at.bottom);
  const bottomOf = (title: string) => at.views.find((view) => view.title === title)!.bottom;
  const others = Math.max(bottomOf("Canvas"), bottomOf("Tablet 768"));
  expect(bottomOf("Phone 390"), "the phone view is the tallest").toBeGreaterThan(others + 40);

  // A shorter window, its bottom below the desktop and tablet views, above the phone view's: drawn again, as it may have been drawn whole.
  const { width, height } = page.viewportSize()!;
  const shorter = Math.ceil(height - (at.bottom - others)) + 30;
  await page.setViewportSize({ width, height: shorter });
  await expect.poll(redrawn).toBe(1);
  // Shorter still: not drawn whole since, it is not drawn again.
  await page.setViewportSize({ width, height: shorter - 10 });
  await page.waitForTimeout(400);
  await expect.poll(() => redrawn()).toBe(1);

  await page.getByRole("button", { name: "Delete Phone view" }).click();
  await expect(phone(page)).toHaveCount(0);
  await expect.poll(redrawn).toBe(2);

  await page.getByRole("button", { name: "Add view" }).click();
  const newWidth = page.getByRole("spinbutton", { name: "New view width" });
  await newWidth.fill("390");
  await newWidth.press("Enter");
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
  // The phone view out of sight again, once it is as tall as what it shows.
  await expect(async () => {
    const edges = await viewEdges(page);
    expect(edges.views.find((view) => view.title === "Phone 390")!.bottom).toBeGreaterThan(edges.bottom);
  }).toPass({ timeout: 5_000 });
  await expect.poll(redrawn).toBeGreaterThanOrEqual(3);
  const settled = await redrawn();
  await page.waitForTimeout(400);
  await expect.poll(() => redrawn()).toBe(settled);
});

test("a double click on text in the phone view types in it there, the caret in that view; the words show in every view as they are typed", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Third Kind", exact: true }).click();
  const titles = [desktop(page), tablet(page), phone(page)].map((view) => view.contentFrame().locator("h1"));
  const title = phone(page).contentFrame().locator("h1");
  const point = await pointOn(phone(page), "h1");
  await page.mouse.dblclick(point.x, point.y);

  /** Whether the caret is in the title, in the view the title is in. */
  const caretIn = (h1: Locator) =>
    h1.evaluate((el) => {
      const doc = el.ownerDocument;
      const at = doc.getSelection()?.anchorNode;
      return doc.hasFocus() && doc.activeElement === el && (el as HTMLElement).isContentEditable && !!at && el.contains(at);
    });
  await expect.poll(() => caretIn(title)).toBe(true);
  await expect.poll(() => caretIn(titles[0])).toBe(false);
  await expect.poll(() => caretIn(titles[1])).toBe(false);

  await page.keyboard.type("Third ");
  for (const h1 of titles) await expect(h1).toHaveText("Third ");
  // Words composed with an input method show as they are composed, and stay composed in the phone view.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "ji", selectionStart: 2, selectionEnd: 2 });
  for (const h1 of titles) await expect(h1).toHaveText("Third ji");
  await cdp.send("Input.insertText", { text: "基" });
  for (const h1 of titles) await expect(h1).toHaveText("Third 基");
  await expect.poll(() => caretIn(title)).toBe(true);
  await expect.poll(() => title.evaluate((el) => el.ownerDocument.getSelection()!.anchorOffset)).toBe("Third 基".length);

  // Esc ends it, as in the desktop view.
  await page.keyboard.press("Escape");
  for (const h1 of titles) await expect(h1).toHaveText("Third 基");
  await expect.poll(() => caretIn(title)).toBe(false);
  await expect(page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Third 基", exact: true })).toBeVisible();
  // The same change as typed in the desktop view: words for every width.
  await page.getByRole("button", { name: /not applied yet/ }).click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveText([/Text.*“Third Kind” → “Third 基”/]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+z");
  for (const h1 of titles) await expect(h1).toHaveText("Third Kind");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  for (const h1 of titles) await expect(h1).toHaveText("Third 基");

  // Typed in the tablet view, a click outside it ends it there.
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Third 基", exact: true }).click();
  const there = await pointOn(tablet(page), "h1");
  await page.mouse.dblclick(there.x, there.y);
  await expect.poll(() => caretIn(titles[1])).toBe(true);
  await page.keyboard.type("Kit");
  for (const h1 of titles) await expect(h1).toHaveText("Kit");
  const area = (await viewportArea(page).boundingBox())!;
  await page.mouse.click(area.x + 4, area.y + area.height - 4);
  await expect.poll(() => caretIn(titles[1])).toBe(false);
  for (const h1 of titles) await expect(h1).toHaveText("Kit");
  await expect(page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Kit", exact: true })).toBeVisible();
});

test("every view grows with what it shows and shrinks back, nothing cut off; the labels, the selection and ⇧1 follow", async ({ page }) => {
  await enterEditMode(page);
  const views = [desktop(page), tablet(page), phone(page)];
  /** How tall each view is, and how tall what it shows is. */
  const heights = () =>
    Promise.all(
      views.map((view) =>
        view.evaluate((frame: HTMLIFrameElement) => {
          const doc = frame.contentDocument!;
          const cards = doc.querySelectorAll("article");
          return { view: frame.offsetHeight, page: doc.documentElement.scrollHeight, lastCard: cards[cards.length - 1].getBoundingClientRect().bottom };
        }),
      ),
    );
  const before = await heights();

  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).last().click();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ControlOrMeta+d");
  await expect(phone(page).contentFrame().locator("article")).toHaveCount(10);
  await expect.poll(async () => (await heights())[2].view).toBeGreaterThan(before[2].view + 6 * 100);
  for (const [i, now] of (await heights()).entries()) {
    expect(now.view).toBeGreaterThan(before[i].view);
    expect(now.view).toBe(now.page);
    expect(now.lastCard).toBeLessThanOrEqual(now.view);
  }
  // `h-screen` is as tall as the window still, in views far taller than it.
  const windowHeight = await page.evaluate(() => innerHeight);
  for (const view of views) await expect(view.contentFrame().getByTestId("hero")).toHaveCSS("height", `${windowHeight}px`);

  // ⇧1 fits every view, all of it, with its label above it.
  await page.keyboard.press("Shift+Digit1");
  const area = (await viewportArea(page).boundingBox())!;
  for (const [i, view] of views.entries()) {
    const box = (await view.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(area.y);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height + 1);
    const label = (await page.getByRole("group", { name: `${["Desktop", "Tablet", "Phone"][i]} view` }).boundingBox())!;
    expect(label.y + label.height).toBeLessThanOrEqual(box.y);
  }
  // The selection, the last card made, is outlined where it is in each view, at the bottom of the phone view.
  const boxes = await selectionBoxes(page);
  const lastCard = await boxOf(phone(page), "article:last-child");
  expect(boxes[2].y).toBeCloseTo(lastCard.y, 0);
  expect(boxes[2].height).toBeCloseTo(lastCard.height, 0);
  // Pointed at, the bottom of the phone view is found there: the view takes the pointer all the way down.
  await page.mouse.click(area.x + 4, area.y + area.height - 4);
  await expect(page.locator(".tk-selection")).toHaveCount(0);
  await page.mouse.move(lastCard.x + lastCard.width / 2, lastCard.y + lastCard.height - 2);
  await expect(page.locator('.tk-hover[data-view="Phone"]')).toHaveCount(1);

  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).last().click();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ControlOrMeta+z");
  await expect(phone(page).contentFrame().locator("article")).toHaveCount(4);
  await expect.poll(async () => (await heights()).map((h) => h.view)).toEqual(before.map((h) => h.view));
});

test("a layer dragged below the bottom of a view leaves every view as tall as it was while dragged; let go there, it goes off the canvas", async ({ page }) => {
  await enterEditMode(page);
  const views = [desktop(page), tablet(page), phone(page)];
  const heights = () => Promise.all(views.map((view) => view.evaluate((frame: HTMLIFrameElement) => frame.offsetHeight)));
  // ⇧1: every view in sight, with room below the desktop view, the shortest.
  await page.keyboard.press("Shift+Digit1");
  const before = await heights();

  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).last().click();
  const card = await boxOf(desktop(page), "article:last-child");
  const view = (await desktop(page).boundingBox())!;
  const area = (await viewportArea(page).boundingBox())!;
  const below = Math.min(area.y + area.height - 4, view.y + view.height + 150);
  expect(below).toBeGreaterThan(view.y + view.height + 20);
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2, below, { steps: 8 });
  // A few frames on, the card is far past the bottom of the desktop view, and no view has grown with it.
  await painted(page);
  const past = await desktop(page).evaluate((frame: HTMLIFrameElement) => {
    const cards = frame.contentDocument!.querySelectorAll("article");
    return cards[cards.length - 1].getBoundingClientRect().bottom - frame.offsetHeight;
  });
  expect(past).toBeGreaterThan(0);
  await expect.poll(() => heights()).toEqual(before);

  // Let go outside every view, it goes off the canvas (ADR 0009): gone from every view, there beside them.
  await page.mouse.up();
  await expect(page.locator('iframe[title="Off canvas"]:visible')).toHaveCount(1);
  for (const view of views) await expect(view.contentFrame().locator("article:last-child")).toBeHidden();
});
