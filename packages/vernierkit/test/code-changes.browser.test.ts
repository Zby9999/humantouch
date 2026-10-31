import { afterEach, expect, test } from "vitest";
import { watchCodeChanges } from "../src/client/code-changes";
import { CODE_EVENT, CODE_GLOBAL, type CodeUpdates } from "../src/service-protocol";

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
function update() {
  beforeUpdate();
  afterUpdate();
}
function viteError() {
  code().updating = 0;
  changed();
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const QUIET_MS = 60;
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  delete (window as unknown as Record<string, unknown>)[CODE_GLOBAL];
});
function watch() {
  (window as unknown as Record<string, CodeUpdates>)[CODE_GLOBAL] = { at: Date.now(), updating: 0 };
  let changes = 0;
  stop = watchCodeChanges(window, () => changes++, { quietMs: QUIET_MS });
  return () => changes;
}

test("the dev server bringing code into the page is a change, once, as the update begins", () => {
  const changes = watch();
  beforeUpdate();
  expect(changes()).toBe(1);
  afterUpdate();
  expect(changes()).toBe(1);
});

test("updates that follow each other closely, as several files saved together, are one change; one after a quiet while is another", async () => {
  const changes = watch();
  update();
  await wait(QUIET_MS / 3);
  update();
  await wait(QUIET_MS / 3);
  update();
  expect(changes()).toBe(1);

  await wait(QUIET_MS * 2);
  update();
  expect(changes()).toBe(2);
});

test("an error from the dev server brings no code in: no change", () => {
  const changes = watch();
  viteError();
  expect(changes()).toBe(0);
});

test("once stopped, no more changes; with no word from the dev server (Next.js), none at all", () => {
  const changes = watch();
  stop!();
  update();
  expect(changes()).toBe(0);

  delete (window as unknown as Record<string, unknown>)[CODE_GLOBAL];
  let none = 0;
  stop = watchCodeChanges(window, () => none++, { quietMs: QUIET_MS });
  changed();
  expect(none).toBe(0);
});
