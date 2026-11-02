import { afterEach, beforeEach, expect, test } from "vitest";
import { watchCodeRuns, type CodeRun } from "../src/client/code-changes";
import { CODE_EVENT, CODE_GLOBAL, type CodeUpdates } from "../src/service-protocol";

/**
 * Ticket 78: as the code changes in edit mode, the page waits for it to rest,
 * then tells whether anything it draws changed: elements put in or taken
 * out, attributes, text, stylesheets. Source markers moving, as code edited
 * above them moves them, are no change; nor is React drawing the same anew.
 */

/** What the Vite plugin's module keeps on the page (`vite.ts`), and what it does on Vite's HMR events. */
const code = () => (window as unknown as Record<string, CodeUpdates | undefined>)[CODE_GLOBAL]!;
const changed = () => window.dispatchEvent(new Event(CODE_EVENT));
function beforeUpdate() {
  code().updating++;
  changed();
}
function afterUpdate() {
  code().updating = Math.max(0, code().updating - 1);
  code().at = Date.now();
  changed();
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const QUIET_MS = 60;
let root: HTMLElement;
let stop: (() => void) | undefined;
let busy = false;
let runs: CodeRun[] = [];

beforeEach(() => {
  (window as unknown as Record<string, CodeUpdates>)[CODE_GLOBAL] = { at: Date.now(), updating: 0 };
  root = document.createElement("main");
  root.innerHTML = `<style>.card { color: red; }</style><article class="card" data-tk-loc="src/Card.tsx:3:5"><h3 data-tk-loc="src/Card.tsx:4:7">Freeze</h3><p data-tk-loc="src/Card.tsx:5:7">Turn the page into a canvas.</p></article>`;
  document.body.append(root);
  busy = false;
  runs = [];
  stop = watchCodeRuns(window, (run) => runs.push(run), { quietMs: QUIET_MS, busy: () => busy });
});
afterEach(() => {
  stop?.();
  root.remove();
  delete (window as unknown as Record<string, unknown>)[CODE_GLOBAL];
});

/** One hot update: `edit` is what it does to the page, as the update is applied. Resolves once the code has rested and the run is told. */
async function hotUpdate(edit: () => void) {
  beforeUpdate();
  await wait(5);
  edit();
  afterUpdate();
  await expect.poll(() => runs.length, { timeout: QUIET_MS * 20 }).toBeGreaterThan(0);
  return runs.at(-1)!.pageChanged();
}

const card = () => root.querySelector("article")!;

test("source markers moving, attributes set to what they were, and text put back as it was, are no change", async () => {
  expect(
    await hotUpdate(() => {
      for (const el of root.querySelectorAll("[data-tk-loc]")) el.setAttribute("data-tk-loc", el.getAttribute("data-tk-loc")!.replace(/:(\d+):/, (_, line) => `:${Number(line) + 2}:`));
      card().setAttribute("class", "card");
      card().querySelector("h3")!.firstChild!.textContent = "Freeze";
    }),
  ).toBe(false);
});

test("a text, an attribute, or a style the page draws otherwise is a change", async () => {
  expect(await hotUpdate(() => (card().querySelector("h3")!.firstChild!.textContent = "Frozen"))).toBe(true);
  expect(await hotUpdate(() => card().setAttribute("class", "card is-wide"))).toBe(true);
  expect(await hotUpdate(() => (root.querySelector("style")!.textContent = ".card { color: blue; }"))).toBe(true);
});

test("React drawing the same anew, elements and stylesheet alike, is no change; the same elements in another order are one", async () => {
  expect(
    await hotUpdate(() => {
      const again = card().cloneNode(true) as Element;
      for (const el of [again, ...again.querySelectorAll("*")]) if (el.hasAttribute("data-tk-loc")) el.setAttribute("data-tk-loc", "src/Card.tsx:9:9");
      card().replaceWith(again);
      root.querySelector("style")!.textContent = ".card { color: red; }";
    }),
  ).toBe(false);
  expect(await hotUpdate(() => card().append(card().querySelector("h3")!))).toBe(true);
});

test("an element put in and changed within the run is told as a whole: the same as one gone, no change; otherwise, one", async () => {
  expect(
    await hotUpdate(() => {
      const again = document.createElement("article");
      card().replaceWith(again);
      again.className = "card";
      again.setAttribute("data-tk-loc", "src/Card.tsx:3:5");
      again.innerHTML = `<h3>Freeze</h3><p>Turn the page into a canvas.</p>`;
    }),
  ).toBe(false);
  expect(
    await hotUpdate(() => {
      const again = card().cloneNode(true) as Element;
      card().replaceWith(again);
      again.querySelector("p")!.textContent = "Something else.";
    }),
  ).toBe(true);
});

// Vite's overlay for an error is left out alike: it cannot be made here, where Vite's own client defines it for the test page.
test("the editor layer's own host is not the page's: no change", async () => {
  expect(
    await hotUpdate(() => {
      const host = document.querySelector("third-kind") ?? document.documentElement.appendChild(document.createElement("third-kind"));
      host.setAttribute("data-anything", "1");
    }),
  ).toBe(false);
});

test("one run for updates close together; it rests only once nothing is being brought in and the designer is done", async () => {
  beforeUpdate();
  afterUpdate();
  await wait(QUIET_MS / 3);
  beforeUpdate();
  await wait(QUIET_MS * 2);
  // Still bringing the second one in.
  expect(runs).toHaveLength(0);
  busy = true;
  afterUpdate();
  await wait(QUIET_MS * 2);
  expect(runs).toHaveLength(0);
  busy = false;
  await expect.poll(() => runs.length).toBe(1);
  await wait(QUIET_MS * 3);
  expect(runs).toHaveLength(1);
});

test("an error from the dev server brings no code in, and once stopped, nothing is told; with no word from the dev server (Next.js), nothing at all", async () => {
  code().updating = 0;
  changed();
  await wait(QUIET_MS * 2);
  expect(runs).toHaveLength(0);
  stop!();
  beforeUpdate();
  afterUpdate();
  await wait(QUIET_MS * 2);
  expect(runs).toHaveLength(0);
  delete (window as unknown as Record<string, unknown>)[CODE_GLOBAL];
  stop = watchCodeRuns(window, (run) => runs.push(run), { quietMs: QUIET_MS });
  changed();
  await wait(QUIET_MS * 2);
  expect(runs).toHaveLength(0);
});

test("what is to be taken as a run begins is taken once for the run, as the dev server begins to bring its code in, the page as it was before it (ticket 82)", async () => {
  stop!();
  const taken: string[] = [];
  const told: CodeRun<string>[] = [];
  stop = watchCodeRuns(window, (run) => told.push(run), { quietMs: QUIET_MS, before: () => (taken.push(card().className), card().className) });
  beforeUpdate();
  await wait(5);
  card().className = "card is-red";
  afterUpdate();
  // Another file of the same run: nothing taken again.
  beforeUpdate();
  card().className = "card is-red is-wide";
  afterUpdate();
  await expect.poll(() => told.length, { timeout: QUIET_MS * 20 }).toBe(1);
  expect(taken).toEqual(["card"]);
  expect(told[0].before).toBe("card");
  // The next run: taken afresh, as the page is then.
  beforeUpdate();
  card().className = "card";
  afterUpdate();
  await expect.poll(() => told.length, { timeout: QUIET_MS * 20 }).toBe(2);
  expect(told.map((run) => run.before)).toEqual(["card", "card is-red is-wide"]);
});
