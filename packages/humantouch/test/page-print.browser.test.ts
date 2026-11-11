import { afterEach, describe, expect, test } from "vitest";
import { createChangeSet } from "../src/client/changeset";
import { createEditor } from "../src/client/edits";
import { freeze, restore, restyle, serializeCanvas } from "../src/client/freezer";
import { compare, printOf } from "../src/client/page-print";
import { createHistory } from "../src/client/undo-steps";
import { createViews } from "../src/client/views";

/**
 * Ticket 141: as edit mode comes back to a round's canvas, the page as it is
 * now is told from the page the canvas reflects by their prints. Loaded
 * again, the code the same, the page prints the same, whatever moves on it
 * or comes in another order; its styles alone changed, the canvas takes the
 * page's stylesheets in, its edits staying; its elements, class names or
 * words changed, it says so.
 */

const made: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const iframe of made.splice(0)) iframe.remove();
});

function iframe(width = 800, height = 600): HTMLIFrameElement {
  const el = document.createElement("iframe");
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.border = "0";
  document.body.append(el);
  made.push(el);
  return el;
}

/** `html` live in a window 800 × 600, at `path`. */
function livePage(html: string, path = "/"): Window {
  const doc = iframe().contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  doc.defaultView!.history.replaceState(null, "", path);
  return doc.defaultView!;
}

const STYLES = `<style data-vite-dev-id="/src/index.css">body { margin: 0 } .card { width: 200px; height: 40px; background-color: rgb(255, 255, 255); font-weight: 400 }</style>`;
const page = ({ styles = STYLES, title = "Plans", card = "card", items = ["One", "Two", "Three"], clock = "12:03:45", style = "" } = {}) => `<!DOCTYPE html>
<html><head>${styles}</head>
<body>
  <main data-ht-loc="src/App.tsx:2:5">
    <h1 data-ht-loc="src/App.tsx:3:7">${title}</h1>
    <div class="${card}" data-ht-loc="src/App.tsx:4:7" style="${style}">Card</div>
    <ul>${items.map((item) => `<li class="item">${item}</li>`).join("")}</ul>
    <time>${clock}</time>
  </main>
</body></html>`;

describe("the page's print", () => {
  test("the same code loaded again prints the same: what moves, the time, the order of its parts, source markers and attributes but class aside", () => {
    const then = printOf(livePage(page()));
    const again = printOf(livePage(page({ items: ["Three", "One", "Two"], clock: "18:59:01", style: "transform: translateX(12px); opacity: 0.4" }).replace(/src\/App\.tsx:\d+/g, "src/App.tsx:9")));
    expect(again).toEqual(then);
    expect(compare(then, again)).toBe("same");
  });

  test("styles alone: a stylesheet's text, an `@font-face` in it, a theme's variables", () => {
    const then = printOf(livePage(page()));
    for (const styles of [
      STYLES.replace("font-weight: 400", "font-weight: 600"),
      STYLES.replace("</style>", `@font-face { font-family: "Grotesk"; font-weight: 500; src: local("Arial") }</style>`),
      `${STYLES}<style>:root { --brand: rgb(0, 0, 255) }</style>`,
    ]) {
      const now = printOf(livePage(page({ styles })));
      expect(now.structure).toBe(then.structure);
      expect(compare(then, now)).toBe("styles");
    }
  });

  test("its structure: a class name, a word, an element; its styles changed too, still its structure", () => {
    const then = printOf(livePage(page()));
    expect(compare(then, printOf(livePage(page({ card: "card is-wide" }))))).toBe("structure");
    expect(compare(then, printOf(livePage(page({ title: "Pricing" }))))).toBe("structure");
    expect(compare(then, printOf(livePage(page({ items: ["One", "Two"] }))))).toBe("structure");
    expect(compare(then, printOf(livePage(page({ card: "card shadow", styles: STYLES.replace("}</style>", "} .shadow { box-shadow: 0 1px 2px black }</style>") }))))).toBe("structure");
  });

  test("a print of another page says nothing of this one", () => {
    const then = printOf(livePage(page(), "/pricing"));
    const now = printOf(livePage(page({ title: "About" }), "/about"));
    expect(compare(then, now)).toBe("other");
  });
});

describe("a saved canvas taking in the page's styles", () => {
  test("the page's stylesheets as they are now in place of those it was frozen with; the edits, and the breakpoint's, stay, in every view; saved, it has them", async () => {
    const live = livePage(page());
    const canvas = await freeze(live, iframe());
    const views = createViews(canvas);
    await views.add(iframe(390), 390);
    const editor = createEditor(views, createChangeSet(), null, { history: createHistory() });
    const card = editor.tree().layerOf(canvas.document.querySelector(".card")!)!;
    editor.set(card, "fill", { type: "solid", color: "#FF0000", opacity: 1 });
    editor.at(views.list()[1]);
    editor.set(card, "opacity", 0.5);
    editor.at(null);
    const saved = serializeCanvas(canvas);

    // The designer's CSS: the card's weight and width, a web font declared.
    const now = livePage(page({ styles: STYLES.replace("font-weight: 400", "font-weight: 600").replace("width: 200px", "width: 300px").replace("</style>", `@font-face { font-family: "Grotesk"; src: local("Arial") }</style>`) }));
    const back = await restore(saved, iframe(), (doc, windowHeight) => restyle(doc, now, windowHeight));
    const el = back.document.querySelector(".card")!;
    const look = getComputedStyle(el);
    expect(look.fontWeight).toBe("600");
    expect(look.width).toBe("300px");
    expect(look.backgroundColor).toBe("rgb(255, 0, 0)");
    expect([...back.document.fonts].map((font) => font.family)).toContain("Grotesk");
    const phone = await createViews(back).add(iframe(390), 390);
    expect(getComputedStyle(phone.document.querySelector(".card")!).opacity).toBe("0.5");
    expect(getComputedStyle(phone.document.querySelector(".card")!).fontWeight).toBe("600");
    // The page's sheet once, by the file it came from, as frozen.
    expect(back.document.querySelectorAll('style[data-vite-dev-id="/src/index.css"]')).toHaveLength(1);

    const again = await restore(serializeCanvas(back), iframe());
    const kept = getComputedStyle(again.document.querySelector(".card")!);
    expect([kept.fontWeight, kept.width, kept.backgroundColor]).toEqual(["600", "300px", "rgb(255, 0, 0)"]);
  });
});
