import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { run } from "../src/cli";
import { CLAIM_PATH } from "../src/client/code-changes";
import { startService, type Service } from "../src/service";
import { ROUND_PATH, STATUS_PATH, TOKEN_HEADER, type SavedRound } from "../src/service-protocol";

/**
 * Ticket 78: the page claims the round when it sees one of its changes show
 * with no Agent having claimed it. From then on the round is claimed as by
 * the command line; `last` takes it back to the code as it was before the
 * run of code changes the page saw the change in.
 */

let root: string;
let service: Service;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "03kind-page-claim-"));
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
  const state = readFileSync(join(root, ".03kind/state.json"), "utf8");
  expect((await call("POST", CLAIM_PATH, { since: Date.now() })).status).toBe(204);
  expect(readFileSync(join(root, ".03kind/state.json"), "utf8")).toBe(state);
  expect((await cli("done", "1")).code).toBe(0);
  expect((await cli("finish")).code).toBe(0);
  expect(existsSync(join(root, ".03kind/state.json"))).toBe(false);
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
