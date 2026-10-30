import { afterEach, expect, test } from "vitest";
import { drawOnlyWhatShows } from "../src/client/camera";

const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done)));

afterEach(() => document.body.replaceChildren());

/** A stage, as the canvas's: positioned, moved and scaled by the camera, a view in it. */
async function stage() {
  const el = document.createElement("div");
  el.setAttribute("style", "position: absolute; top: 0; left: 0; transform: translate(10px, 20px) scale(0.5); visibility: visible");
  const view = document.createElement("iframe");
  view.setAttribute("sandbox", "allow-same-origin");
  view.setAttribute("scrolling", "no");
  el.append(view);
  document.body.append(el);
  view.contentDocument!.body.innerHTML = "<p id=written>written in after loading</p>";
  await frame();
  return { el, view };
}

test("after a camera move, the stage looks and is as it was: its style, where it is, and the view in it with what it shows", async () => {
  const { el, view } = await stage();
  const style = el.getAttribute("style");
  const box = view.getBoundingClientRect().toJSON();
  const doc = view.contentDocument;
  let loads = 0;
  view.addEventListener("load", () => loads++);

  drawOnlyWhatShows(el);
  await frame();
  await frame();

  expect(el.getAttribute("style")).toBe(style);
  expect(view.getBoundingClientRect().toJSON()).toEqual(box);
  // Not loaded again: the same document, what was written in after loading still there.
  expect(loads).toBe(0);
  expect(view.contentDocument).toBe(doc);
  expect(view.contentDocument!.getElementById("written")?.textContent).toBe("written in after loading");
});

test("what has focus on the stage keeps it, as text typed in, in a view", async () => {
  const { el, view } = await stage();
  const field = document.createElement("input");
  el.append(field);
  field.focus();
  drawOnlyWhatShows(el);
  await frame();
  expect(document.activeElement).toBe(field);

  const text = view.contentDocument!.getElementById("written")!;
  text.contentEditable = "true";
  text.focus();
  view.contentWindow!.getSelection()!.collapse(text.firstChild, 7);
  drawOnlyWhatShows(el);
  await frame();
  expect(document.activeElement).toBe(view);
  expect(view.contentDocument!.activeElement).toBe(text);
  const selection = view.contentWindow!.getSelection()!;
  expect([selection.anchorNode, selection.anchorOffset]).toEqual([text.firstChild, 7]);
});
