import { gunzipSync, strFromU8 } from "fflate";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { KEEPALIVE_MAX_BYTES } from "../src/client/round-watch";
import { connectRoundStore } from "../src/client/service";
import { SERVICE_GLOBAL, type SavedRound } from "../src/service-protocol";

/**
 * Saves made as the page goes (ticket 160): sent at once, not after the save
 * before, gzipped, as requests the browser sends on once the page has gone,
 * as far as such requests may carry; a save still waiting for its turn when a
 * newer one is made is not sent.
 */

const round = (canvas: string): SavedRound => ({ canvas, changeSet: { lastId: 1, changes: [] } }) as unknown as SavedRound;

interface Sent {
  method: string;
  path: string;
  keepalive: boolean;
  /** The body as the service reads it: unzipped, when it came gzipped. */
  body?: string;
  gzip: boolean;
}
let sent: Sent[];
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
    const gzip = (init.headers as Record<string, string>)["Content-Encoding"] === "gzip";
    const body = init.body === undefined ? undefined : gzip ? strFromU8(gunzipSync(init.body as Uint8Array)) : (init.body as string);
    sent.push({ method: init.method!, path: new URL(url).pathname, keepalive: init.keepalive === true, body, gzip });
    return new Promise<Response>((resolve) => held.push(() => resolve(new Response(null, { status: 204 }))));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>)[SERVICE_GLOBAL];
});

/** Words that do not pack: `bytes` of them, gzipped, take about as many bytes. */
function unpackable(bytes: number): string {
  const random = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(random, (byte) => String.fromCharCode(33 + (byte % 90))).join("");
}

test("a save as the page goes is sent at once, the save before it not yet answered, gzipped, as a request the browser sends on", async () => {
  const store = connectRoundStore()!;
  void store.save(round("<html>before</html>"));
  await Promise.resolve();
  void store.save(round("<html>now</html>"), true);
  void store.saveOffCanvas([], true);
  expect(sent.map(({ method, path, keepalive, gzip }) => ({ method, path, keepalive, gzip }))).toEqual([
    { method: "PUT", path: "/round", keepalive: false, gzip: false },
    { method: "PUT", path: "/round", keepalive: true, gzip: true },
    { method: "PUT", path: "/off-canvas", keepalive: true, gzip: true },
  ]);
  expect(JSON.parse(sent[1].body!).canvas).toBe("<html>now</html>");
  expect(JSON.parse(sent[2].body!)).toEqual({ layers: [] });
  answer();
});

test("a canvas of a page of any size goes within what the browser carries on, gzipped", () => {
  void connectRoundStore()!.save(round(`<html>${"<article class='card'>A card, as a page has many</article>".repeat(4000)}</html>`), true);
  expect(sent[0]).toMatchObject({ keepalive: true, gzip: true });
  expect(sent[0].body!.length).toBeGreaterThan(KEEPALIVE_MAX_BYTES * 3);
  answer();
});

test("a round dropped as the page goes is dropped the same way", () => {
  void connectRoundStore()!.save(null, true);
  expect(sent).toEqual([{ method: "DELETE", path: "/round", keepalive: true, body: undefined, gzip: false }]);
  answer();
});

test("one too large for what is in flight already goes as an ordinary request; once answered, the room is there again", async () => {
  const store = connectRoundStore()!;
  void store.save(round(unpackable(KEEPALIVE_MAX_BYTES * 0.6)), true);
  const second = store.save(round(unpackable(KEEPALIVE_MAX_BYTES * 0.6)), true);
  expect(sent.map((request) => request.keepalive)).toEqual([true, false]);
  answer();
  await second;
  void store.save(round(unpackable(KEEPALIVE_MAX_BYTES * 0.6)), true);
  expect(sent.map((request) => request.keepalive)).toEqual([true, false, true]);
  answer();
});

test("saves made as edit mode goes on wait for the one before; one still waiting when a newer one is made is not sent", async () => {
  const store = connectRoundStore()!;
  void store.save(round("<html>1</html>"));
  // Sent: the save before it has had its turn.
  await Promise.resolve();
  void store.save(round("<html>2</html>"));
  void store.save(round("<html>3</html>"));
  await Promise.resolve();
  expect(sent).toHaveLength(1);
  answer();
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  expect(sent.map((request) => JSON.parse(request.body!).canvas)).toEqual(["<html>1</html>", "<html>3</html>"]);
  expect(sent.every((request) => !request.keepalive && !request.gzip)).toBe(true);
  answer();
});

test("one still waiting when the page goes is not sent after the save made as it went, should the page come back", async () => {
  const store = connectRoundStore()!;
  void store.save(round("<html>1</html>"));
  // Sent: the save before it has had its turn.
  await Promise.resolve();
  void store.save(round("<html>2</html>"));
  void store.save(round("<html>going</html>"), true);
  answer();
  await new Promise((resolve) => setTimeout(resolve, 10));
  answer();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(sent.map((request) => JSON.parse(request.body!).canvas)).toEqual(["<html>1</html>", "<html>going</html>"]);
});
