import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { KEEPALIVE_MAX_BYTES } from "../src/client/round-watch";
import { connectRoundStore } from "../src/client/service";
import { SERVICE_GLOBAL, type SavedRound } from "../src/service-protocol";

/**
 * Saves made as the page goes (ticket 160): sent at once, not after the save
 * before, as requests the browser sends on once the page has gone, as far as
 * such requests may carry.
 */

const round = (canvas: string): SavedRound => ({ canvas, changeSet: { lastId: 1, changes: [] } }) as unknown as SavedRound;

let sent: { method: string; path: string; keepalive: boolean }[];
/** The answer to each request, held till `answer` lets them go. */
let answer: () => void;

beforeEach(() => {
  sent = [];
  let held: (() => void)[] = [];
  answer = () => {
    for (const go of held) go();
    held = [];
  };
  (window as unknown as Record<string, unknown>)[SERVICE_GLOBAL] = { url: "http://127.0.0.1:1", token: "t" };
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    sent.push({ method: init.method!, path: new URL(url).pathname, keepalive: init.keepalive === true });
    return new Promise<Response>((resolve) => held.push(() => resolve(new Response(null, { status: 204 }))));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>)[SERVICE_GLOBAL];
});

test("a save as the page goes is sent at once, the save before it not yet answered, as a request the browser sends on", async () => {
  const store = connectRoundStore()!;
  void store.save(round("<html>before</html>"));
  await Promise.resolve();
  void store.save(round("<html>now</html>"), true);
  void store.saveOffCanvas([], true);
  expect(sent).toEqual([
    { method: "PUT", path: "/round", keepalive: false },
    { method: "PUT", path: "/round", keepalive: true },
    { method: "PUT", path: "/off-canvas", keepalive: true },
  ]);
  answer();
});

test("a round dropped as the page goes is dropped the same way", async () => {
  void connectRoundStore()!.save(null, true);
  expect(sent).toEqual([{ method: "DELETE", path: "/round", keepalive: true }]);
  answer();
});

test("a save too large for what the browser carries on goes as an ordinary request, and leaves the room to those after it", async () => {
  const store = connectRoundStore()!;
  void store.save(round("x".repeat(KEEPALIVE_MAX_BYTES)), true);
  void store.saveOffCanvas([], true);
  expect(sent.map((request) => request.keepalive)).toEqual([false, true]);
  answer();
});

test("saves made as edit mode goes on wait for the one before, as ever", async () => {
  const store = connectRoundStore()!;
  void store.save(round("<html>1</html>"));
  void store.save(round("<html>2</html>"));
  await Promise.resolve();
  expect(sent).toHaveLength(1);
  answer();
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  expect(sent.every((request) => !request.keepalive)).toBe(true);
  answer();
});
