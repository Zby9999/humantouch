import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { run } from "../src/cli";
import { PAGE_PATH, type PageCode, type PagePrint } from "../src/client/page-print";
import { startService, type Service } from "../src/service";
import { ROUND_PATH, TOKEN_HEADER, type SavedRound } from "../src/service-protocol";

/**
 * Ticket 141: the page a round's canvas reflects, printed, kept apart from
 * the round as `page.json`; `GET /round` answers with it. A round that ends
 * with changes left takes it away: the page then has the Agent's code in,
 * and is printed afresh as edit mode comes back to the canvas.
 */

let root: string;
let service: Service;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "humantouch-page-"));
  service = await startService({ root, quietMs: 50 });
});
afterEach(async () => {
  await service.close();
  rmSync(root, { recursive: true, force: true });
});

const call = (method: string, path: string, body?: unknown) =>
  fetch(`${service.url}${path}`, { method, headers: { [TOKEN_HEADER]: service.token, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const cli = (...args: string[]) => run(args, { cwd: root, write: () => {}, error: () => {} });

const PRINT: PagePrint = { path: "/", structure: "1a2b", styles: "3c4d" };
const change = (id: number) => ({
  id,
  kind: "style",
  property: "radius",
  target: { loc: `Card.tsx:${id}:3`, chain: [], component: "Card", instances: 1, locked: false, unlocated: false, context: { path: ["Card"], element: "<article>" } },
  layer: String(id),
  scope: "usage",
  before: 0,
  after: 4,
  style: { "border-radius": "4px" },
  sources: [],
});
const ROUND = { canvas: "<!DOCTYPE html><html><body><article></article></body></html>", changeSet: { lastId: 2, changes: [change(1), change(2)] } } as unknown as SavedRound;
const round = async () => (await call("GET", ROUND_PATH)).json() as Promise<SavedRound>;

test("kept as the page prints it, and answered with the round; not saved with it, nor taken by a save of it", async () => {
  expect((await call("PUT", PAGE_PATH, PRINT)).status).toBe(204);
  // Before the round's first save, as a canvas frozen afresh prints the page: none to answer with yet.
  expect((await call("GET", ROUND_PATH)).status).toBe(204);
  await call("PUT", ROUND_PATH, { ...ROUND, page: { path: "/", structure: "x", styles: "y" } });
  expect((await round()).page).toEqual(PRINT);
  expect(JSON.parse(readFileSync(join(root, ".humantouch/changeset.json"), "utf8"))).toEqual(ROUND.changeSet);
  expect((await call("PUT", PAGE_PATH, { path: "/" })).status).toBe(400);
  // The round dropped, the page its canvas reflected goes with it.
  await call("DELETE", ROUND_PATH);
  expect(existsSync(join(root, ".humantouch/page.json"))).toBe(false);
});

test("a round that ends with changes left takes it away; claimed, none is kept", async () => {
  await call("PUT", ROUND_PATH, ROUND);
  await call("PUT", PAGE_PATH, PRINT);
  expect(await cli("claim")).toBe(0);
  expect((await call("PUT", PAGE_PATH, PRINT)).status).toBe(409);
  expect(await cli("finish")).toBe(0);
  const carried = await round();
  expect(carried.changeSet.changes).toHaveLength(2);
  expect(carried.page).toBeUndefined();
  expect(existsSync(join(root, ".humantouch/page.json"))).toBe(false);
});

const codeSame = async () => ((await (await call("GET", PAGE_PATH)).json()) as PageCode).codeSame;

test("a page.json that cannot be read is left out: the round is answered without it", async () => {
  await call("PUT", ROUND_PATH, ROUND);
  mkdirSync(join(root, ".humantouch"), { recursive: true });
  for (const corrupt of ["{\"path\": \"/\", \"struc", "null", JSON.stringify({ path: "/", structure: 1, styles: "x" })]) {
    writeFileSync(join(root, ".humantouch/page.json"), corrupt);
    const answered = await call("GET", ROUND_PATH);
    expect(answered.status).toBe(200);
    const saved = (await answered.json()) as SavedRound;
    expect(saved.changeSet).toEqual(ROUND.changeSet);
    expect(saved.page).toBeUndefined();
    expect(await codeSame()).toBeNull();
  }
});

test("kept with the code it was printed on: the same till a file changes; not known outside git", async () => {
  // No git: not known, the page is compared as it draws.
  await call("PUT", PAGE_PATH, PRINT);
  expect(await codeSame()).toBeNull();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  writeFileSync(join(root, "Card.tsx"), "export const Card = 1;\n");
  expect(await codeSame()).toBeNull(); // Printed before git: not known.
  await call("PUT", PAGE_PATH, PRINT);
  expect(JSON.parse(readFileSync(join(root, ".humantouch/page.json"), "utf8")).code).toMatch(/^[0-9a-f]{40}$/);
  expect(await codeSame()).toBe(true);
  // The round saved, and `.humantouch/` with it, is no change of the code; nor is the print kept again.
  await call("PUT", ROUND_PATH, ROUND);
  expect(await codeSame()).toBe(true);
  writeFileSync(join(root, "Card.tsx"), "export const Card = 2;\n");
  expect(await codeSame()).toBe(false);
  // Back as it was: the same again, as across a restart of the dev server.
  writeFileSync(join(root, "Card.tsx"), "export const Card = 1;\n");
  await service.close();
  service = await startService({ root, quietMs: 50 });
  expect(await codeSame()).toBe(true);
  expect((await round()).page).toEqual(PRINT);
});
