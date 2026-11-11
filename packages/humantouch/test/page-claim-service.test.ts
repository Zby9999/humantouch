import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { run } from "../src/cli";
import { CLAIM_PATH, OTHER_USAGES_PATH } from "../src/client/code-changes";
import { startService, type Service } from "../src/service";
import { ROUND_PATH, STATUS_PATH, TOKEN_HEADER, type OtherUsagesKept, type SavedRound } from "../src/service-protocol";

/**
 * Ticket 78: the page claims the round when it sees one of its changes show
 * with no Agent having claimed it. From then on the round is claimed as by
 * the command line; `last` takes it back to the code as it was before the
 * run of code changes the page saw the change in.
 */

let root: string;
let service: Service;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "humantouch-page-claim-"));
  service = await startService({ root, quietMs: 50 });
});
afterEach(async () => {
  await service.close();
  rmSync(root, { recursive: true, force: true });
});

const call = (method: string, path: string, body?: unknown) =>
  fetch(`${service.url}${path}`, { method, headers: { [TOKEN_HEADER]: service.token, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ROUND: SavedRound = {
  canvas: "<!DOCTYPE html><html><body><article></article></body></html>",
  changeSet: {
    lastId: 1,
    changes: [
      {
        id: 1,
        kind: "style",
        property: "fill",
        target: { loc: "Card.tsx:1:27", chain: [], component: "Card", instances: 1, locked: false, unlocated: false, context: { path: ["Card"], element: "<article>" } },
        layer: "1",
        scope: "usage",
        before: { type: "solid", color: "#FFFFFF", opacity: 1 },
        after: { type: "solid", color: "#FF0000", opacity: 1 },
        style: { "background-color": "rgb(255 0 0)" },
        sources: [],
      },
    ],
  },
} as unknown as SavedRound;

const cli = async (...args: string[]) => {
  let output = "";
  const code = await run(args, { cwd: root, write: (text) => (output += text), error: (text) => (output += text) });
  return { code, output };
};

test("the page claims a round being edited: claimed then as by the command line; claimed already, it stays so; with no round, there is none to claim", async () => {
  expect((await call("POST", CLAIM_PATH, { since: Date.now() })).status).toBe(409);
  await call("PUT", ROUND_PATH, ROUND);
  expect((await call("POST", CLAIM_PATH, { since: Date.now() })).status).toBe(204);
  expect(await (await call("GET", STATUS_PATH)).json()).toEqual({ status: "claimed", done: [], applied: [] });
  const state = readFileSync(join(root, ".humantouch/state.json"), "utf8");
  expect((await call("POST", CLAIM_PATH, { since: Date.now() })).status).toBe(204);
  expect(readFileSync(join(root, ".humantouch/state.json"), "utf8")).toBe(state);
  expect((await cli("done", "1")).code).toBe(0);
  expect((await cli("finish")).code).toBe(0);
  expect(existsSync(join(root, ".humantouch/state.json"))).toBe(false);
});

test("in a git repository, last takes a round the page claimed back to the code as it was before the run of changes it saw a change in", async () => {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(join(root, "Card.tsx"), 'export const Card = () => <article className="bg-white" />;\n');
  await call("PUT", ROUND_PATH, ROUND);
  // The code as it rests, while the round is edited.
  await wait(500);

  // The Agent goes by the chat: it edits the code, which the dev server says; the page sees the change and claims.
  const since = Date.now();
  writeFileSync(join(root, "Card.tsx"), 'export const Card = () => <article className="bg-[#ff0000]" />;\n');
  service.codeChanged();
  await wait(100);
  expect((await call("POST", CLAIM_PATH, { since })).status).toBe(204);
  await cli("finish");

  const undo = /`(git -C [^`]+ apply)`/.exec((await cli("last")).output)?.[1];
  expect(undo).toBeDefined();
  execFileSync("sh", ["-c", undo!], { cwd: root });
  expect(readFileSync(join(root, "Card.tsx"), "utf8")).toContain('className="bg-white"');
});

test("a round with a change carried over, claimed by the page, keeps the change's before as the round before had it: the page reads nothing anew", async () => {
  const carried = { ...ROUND, changeSet: { ...ROUND.changeSet, changes: [{ ...ROUND.changeSet.changes[0], carried: true as const }] } };
  await call("PUT", ROUND_PATH, carried);
  const saved = readFileSync(join(root, ".humantouch/changeset.json"), "utf8");
  expect((await call("POST", CLAIM_PATH, { since: Date.now() })).status).toBe(204);
  // No ask of the page (`claim`'s `opening`): the Agent's code is on the page already, and a change carried over not shown yet may show its edit underway.
  expect(JSON.parse(readFileSync(join(root, ".humantouch/state.json"), "utf8")).opening).toBeUndefined();
  expect(readFileSync(join(root, ".humantouch/changeset.json"), "utf8")).toBe(saved);
});

/**
 * Ticket 82: what a page noted of the other usages of the round's changes for
 * one usage alone is kept with the claim, and comes with the round while it
 * is claimed, for a page opened or reloaded since to go by. It belongs to the
 * round claimed: the round ended, or claimed afresh, it is gone.
 */
describe("what the other usages showed, kept with the claim (ticket 82)", () => {
  const WHITE = { type: "solid", color: "#FFFFFF", opacity: 1 };
  const RED = { type: "solid", color: "#FF0000", opacity: 1 };
  const noted = (value: unknown): OtherUsagesKept => ({ 1: { width: 1280, seen: [{ key: "Card.tsx:1:27 App.tsx:8:7", chain: [{ component: "Card", usage: "App.tsx:8:7", thirdParty: false }], value }] } });
  const loaded = async () => ((await (await call("GET", ROUND_PATH)).json()) as SavedRound).otherUsages;
  /** A page keeping what it noted at `at`. */
  const keep = (otherUsages: unknown, at = new Date().toISOString()) => call("POST", OTHER_USAGES_PATH, { at, otherUsages });

  test("claimed by the command line, a page's notes are kept, the first page's to note a change; the round loaded comes with them; not claimed, there is nowhere to keep them", async () => {
    await call("PUT", ROUND_PATH, ROUND);
    expect((await keep(noted(WHITE))).status).toBe(409);
    expect(await loaded()).toBeUndefined();
    expect((await cli("claim")).code).toBe(0);
    expect(await loaded()).toEqual({});
    expect((await keep(noted(WHITE))).status).toBe(204);
    // Another page, noting later: the leak may be on the page by then.
    expect((await keep({ ...noted(RED), 2: null })).status).toBe(204);
    expect(await loaded()).toEqual({ ...noted(WHITE), 2: null });
    expect((await keep([])).status).toBe(400);
    // `claim` again: the same round, the notes kept.
    expect((await cli("claim")).code).toBe(0);
    expect(await loaded()).toEqual({ ...noted(WHITE), 2: null });
  });

  test("claimed by the page, its notes from before the code changed go with the claim; claimed already, they are kept as any page's", async () => {
    await call("PUT", ROUND_PATH, ROUND);
    expect((await call("POST", CLAIM_PATH, { since: Date.now(), otherUsages: noted(WHITE) })).status).toBe(204);
    expect(await loaded()).toEqual(noted(WHITE));
    expect((await call("POST", CLAIM_PATH, { since: Date.now(), otherUsages: { ...noted(RED), 2: null } })).status).toBe(204);
    expect(await loaded()).toEqual({ ...noted(WHITE), 2: null });
  });

  test("the round's alone: finished, unlocked, or claimed afresh, what was noted is gone", async () => {
    const kept = join(root, ".humantouch/other-usages.json");
    await call("PUT", ROUND_PATH, ROUND);
    expect((await call("POST", CLAIM_PATH, { since: Date.now(), otherUsages: noted(WHITE) })).status).toBe(204);
    expect(existsSync(kept)).toBe(true);
    // Not done: carried over to the next round, on the same canvas.
    expect((await cli("finish")).code).toBe(0);
    expect(existsSync(kept)).toBe(false);
    expect(await loaded()).toBeUndefined();
    expect((await cli("claim")).code).toBe(0);
    expect(await loaded()).toEqual({});
    await keep(noted(RED));
    expect((await call("POST", "/unlock")).status).toBe(204);
    expect(existsSync(kept)).toBe(false);
    // A file left behind (written back as the round ended, say) is no claim's: claimed afresh, it goes.
    writeFileSync(kept, JSON.stringify(noted(RED)));
    expect((await cli("claim")).code).toBe(0);
    expect(await loaded()).toEqual({});
    await cli("finish");
    writeFileSync(kept, JSON.stringify(noted(RED)));
    expect((await call("POST", CLAIM_PATH, { since: Date.now() })).status).toBe(204);
    expect(await loaded()).toEqual({});
  });

  test("a page's notes of the round before, coming in once the next is claimed, are not this round's: not kept, and what this round's page notes is", async () => {
    await call("PUT", ROUND_PATH, ROUND);
    expect((await cli("claim")).code).toBe(0);
    const before = new Date().toISOString();
    // Not done: carried over, renumbered from 1, and claimed again.
    expect((await cli("finish")).code).toBe(0);
    await wait(5);
    expect((await cli("claim")).code).toBe(0);
    // Noted as the round before was claimed, its page's word comes in late.
    expect((await keep(noted(RED), before)).status).toBe(409);
    expect((await keep(noted(RED), "not a time")).status).toBe(400);
    expect(await loaded()).toEqual({});
    expect((await keep(noted(WHITE))).status).toBe(204);
    expect(await loaded()).toEqual(noted(WHITE));
  });

  test("written back once the round ended (`finish` takes no turn with the pages), the file is read as no claim's, and gives way to this round's notes", async () => {
    const kept = join(root, ".humantouch/other-usages.json");
    await call("PUT", ROUND_PATH, ROUND);
    expect((await call("POST", CLAIM_PATH, { since: Date.now(), otherUsages: noted(RED) })).status).toBe(204);
    const written = readFileSync(kept, "utf8");
    expect((await cli("finish")).code).toBe(0);
    await wait(5);
    expect((await cli("claim")).code).toBe(0);
    // A page's note of the round before, kept as `finish` took the round away.
    writeFileSync(kept, written);
    expect(await loaded()).toEqual({});
    expect((await keep(noted(WHITE))).status).toBe(204);
    expect(await loaded()).toEqual(noted(WHITE));
  });

  test("the file unreadable: as if nothing were kept, the round still loaded; a page's notes kept afresh", async () => {
    const kept = join(root, ".humantouch/other-usages.json");
    await call("PUT", ROUND_PATH, ROUND);
    expect((await cli("claim")).code).toBe(0);
    for (const broken of ["{\"claimedAt\":", "null", "[]", "{\"claimedAt\":1,\"otherUsages\":3}"]) {
      writeFileSync(kept, broken);
      const answer = await call("GET", ROUND_PATH);
      expect(answer.status).toBe(200);
      expect(((await answer.json()) as SavedRound).otherUsages).toEqual({});
    }
    expect((await keep(noted(WHITE))).status).toBe(204);
    expect(await loaded()).toEqual(noted(WHITE));
  });
});
