import { afterEach, expect, test } from "vitest";
import { watchStall } from "../src/client/agent-stall";
import { CODE_EVENT, CODE_GLOBAL, type CodeUpdates } from "../src/service-protocol";

/** What the Vite plugin's module keeps on the page (`vite.ts`), and an update as it brings code in. */
const code = () => (window as unknown as Record<string, CodeUpdates | undefined>)[CODE_GLOBAL]!;
function update() {
  code().updating++;
  window.dispatchEvent(new Event(CODE_EVENT));
  code().updating--;
  code().at = Date.now();
  window.dispatchEvent(new Event(CODE_EVENT));
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const STALL_MS = 120;
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  delete (window as unknown as Record<string, unknown>)[CODE_GLOBAL];
});
/** Watches with a short threshold; what it said, in order. */
function watch() {
  (window as unknown as Record<string, CodeUpdates>)[CODE_GLOBAL] = { at: Date.now(), updating: 0, inTurn: true };
  const said: boolean[] = [];
  const watcher = watchStall(window, (stalled) => said.push(stalled), { ms: STALL_MS });
  stop = watcher.stop;
  return { said, watcher };
}

test("with nothing moving for the threshold from the start, the Agent has stopped; not before", async () => {
  const { said } = watch();
  await wait(STALL_MS * 0.6);
  expect(said).toEqual([]);
  await wait(STALL_MS * 0.8);
  expect(said).toEqual([true]);
});

test("the dev server bringing code in is the Agent working: the threshold starts again, and a notice goes", async () => {
  const { said } = watch();
  await wait(STALL_MS * 0.6);
  update();
  await wait(STALL_MS * 0.6);
  expect(said).toEqual([]);
  await wait(STALL_MS * 0.8);
  expect(said).toEqual([true]);
  update();
  expect(said).toEqual([true, false]);
});

test("progress or a done seen on the page is the Agent working too; so is the designer choosing to keep waiting", async () => {
  const { said, watcher } = watch();
  await wait(STALL_MS * 0.6);
  watcher.moved();
  await wait(STALL_MS * 0.6);
  expect(said).toEqual([]);
  await wait(STALL_MS * 0.8);
  expect(said).toEqual([true]);
  watcher.moved();
  expect(said).toEqual([true, false]);
  await wait(STALL_MS * 1.4);
  expect(said).toEqual([true, false, true]);
});

test("stopped, it says nothing more", async () => {
  const { said, watcher } = watch();
  watcher.stop();
  update();
  await wait(STALL_MS * 1.4);
  expect(said).toEqual([]);
});
