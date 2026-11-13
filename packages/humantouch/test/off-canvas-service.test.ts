import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startService, type Service } from "../src/service";
import { CHECKS_PATH, EVENTS_PATH, OFF_CANVAS_PATH, ROUND_PATH, STATUS_PATH, TOKEN_HEADER, type SavedOffCanvasLayer } from "../src/service-protocol";
import { archiveRound, roundStatus, humanTouchFolder, writeState } from "../src/human-touch-folder";

const APP = `export function App() {
  return (
    <main>
      <h1 className="text-4xl">Hello</h1>
    </main>
  );
}
`;

let root: string;
let service: Service;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "humantouch-off-canvas-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/App.tsx"), APP);
  service = await startService({ root });
});
afterEach(async () => {
  await service.close();
  rmSync(root, { recursive: true, force: true });
});

const call = (method: string, path: string, body?: unknown) =>
  fetch(`${service.url}${path}`, { method, headers: { [TOKEN_HEADER]: service.token, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

function layer(id: string, written: string | null, x = 10): SavedOffCanvasLayer {
  return {
    id,
    x,
    y: 20,
    look: "<!DOCTYPE html><html><body><h1>Hello</h1></body></html>",
    origin: {
      target: { loc: "src/App.tsx:4:7", chain: [], component: null, instances: 1, locked: false, unlocated: false, context: { path: ["Page", "Hello"], element: "<h1>" } },
      place: null,
      written,
      at: "2026-10-29T00:00:00.000Z",
    },
    edits: { lastId: 0, changes: [] },
  };
}

const saved = () => JSON.parse(readFileSync(join(root, ".humantouch/off-canvas.json"), "utf8")).layers as SavedOffCanvasLayer[];

describe("layers off the canvas, in the local service", () => {
  test("are kept in .humantouch/, each with the JSX that writes it as the source had it when first saved", async () => {
    expect((await call("GET", OFF_CANVAS_PATH)).status).toBe(204);
    const answer = await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", "src/App.tsx:4:7")] });

    // The editor layer is told too, to keep it with the layer wherever it goes.
    expect(await answer.json()).toEqual({ snippets: { a: { loc: "src/App.tsx:4:7", code: '<h1 className="text-4xl">Hello</h1>' } } });
    expect(saved()[0].origin.snippet).toEqual({ loc: "src/App.tsx:4:7", code: '<h1 className="text-4xl">Hello</h1>' });
    // The Agent deletes it from the source; the snippet stays as it was.
    writeFileSync(join(root, "src/App.tsx"), APP.replace(/ *<h1.*\n/, ""));
    await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", "src/App.tsx:4:7", 50)] });
    const response = await call("GET", OFF_CANVAS_PATH);
    const { layers } = (await response.json()) as { layers: SavedOffCanvasLayer[] };
    expect(layers).toMatchObject([{ id: "a", x: 50, origin: { snippet: { code: '<h1 className="text-4xl">Hello</h1>' } } }]);
  });

  test("a layer moved into another off the canvas (ticket 108) is kept with its JSX too, read as it is first saved, and kept as it was", async () => {
    const into = (id: string) => ({ id: 1, kind: "putBack", layer: "1", property: "put back", before: null, after: { place: null, layer: layer(id, "src/App.tsx:4:7") } });
    const frame = { ...layer("f", null), edits: { lastId: 1, changes: [into("in")] } } as unknown as SavedOffCanvasLayer;

    const answer = await call("PUT", OFF_CANVAS_PATH, { layers: [frame] });

    const code = '<h1 className="text-4xl">Hello</h1>';
    expect(await answer.json()).toEqual({ snippets: { f: null, in: { loc: "src/App.tsx:4:7", code } } });
    expect((saved()[0].edits.changes[0].after as { layer: SavedOffCanvasLayer }).layer.origin.snippet).toEqual({ loc: "src/App.tsx:4:7", code });
    // Its code deleted since, and the layer gone on into another, it keeps it.
    writeFileSync(join(root, "src/App.tsx"), APP.replace(/ *<h1.*\n/, ""));
    const again = { ...layer("g", null), origin: { ...layer("g", null).origin, edits: [into("in")] } } as unknown as SavedOffCanvasLayer;
    expect(await (await call("PUT", OFF_CANVAS_PATH, { layers: [again] })).json()).toEqual({ snippets: { g: null, in: { loc: "src/App.tsx:4:7", code } } });
  });

  test("a layer new this round has no snippet; none left, nothing is kept", async () => {
    await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", null)] });
    expect(saved()[0].origin.snippet).toBeNull();
    await call("PUT", OFF_CANVAS_PATH, { layers: [] });
    expect(existsSync(join(root, ".humantouch/off-canvas.json"))).toBe(false);
    expect((await call("PUT", OFF_CANVAS_PATH, { layers: "no" })).status).toBe(400);
    expect((await call("PUT", OFF_CANVAS_PATH, { layers: [{ id: "a" }] })).status).toBe(400);
  });

  test("belong to no round: saved while a round is claimed, and kept when it ends", async () => {
    await call("PUT", ROUND_PATH, { canvas: "<html></html>", changeSet: { lastId: 1, changes: [] } });
    const folder = humanTouchFolder(root);
    await writeState(folder, { status: "claimed", done: [] });
    expect((await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", null)] })).status).toBe(200);

    await archiveRound(folder, "finished");

    expect(existsSync(folder.changeSet)).toBe(false);
    expect(saved().map((l) => l.id)).toEqual(["a"]);
  });

  test("a round finished with changes off the canvas not applied takes them back, as Discard all does: a layer moved out is on the page still, one put back is off it again (ADR 0019); ended by the designer, they are carried over and kept as they are", async () => {
    const moveOut = { id: 1, kind: "delete", layer: "2", property: "delete", before: null, after: null, offCanvas: "a" };
    const putBack = { id: 2, kind: "putBack", layer: "3", property: "put back", before: null, after: { place: null, layer: layer("b", null) } };
    const folder = humanTouchFolder(root);
    for (const ended of ["unlocked", "finished"] as const) {
      await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", null), layer("c", null)] });
      await call("PUT", ROUND_PATH, { canvas: "<html></html>", changeSet: { lastId: 2, changes: [moveOut, putBack] } });
      await writeState(folder, { status: "claimed", done: [] });

      await archiveRound(folder, ended);

      expect(saved().map((l) => l.id)).toEqual(ended === "unlocked" ? ["a", "c"] : ["c", "b"]);
    }
  });

  test("a layer put back carries its snippet into the round, as kept off the canvas when the editor layer had not heard it yet", async () => {
    await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", "src/App.tsx:4:7")] });
    writeFileSync(join(root, "src/App.tsx"), APP.replace(/ *<h1.*\n/, ""));
    const putBack = { id: 1, kind: "putBack", layer: "3", property: "put back", after: { place: null, layer: layer("a", "src/App.tsx:4:7") } };

    await call("PUT", ROUND_PATH, { canvas: "<html></html>", changeSet: { lastId: 1, changes: [putBack] } });

    const changes = JSON.parse(readFileSync(join(root, ".humantouch/changeset.json"), "utf8")).changes;
    expect(changes[0].after.layer.origin.snippet).toEqual({ loc: "src/App.tsx:4:7", code: '<h1 className="text-4xl">Hello</h1>' });
  });
});

describe("the pages open on the round", () => {
  test("a page that stops listening at once, as React's strict mode has it on mount, is not counted as open from then on", async () => {
    await call("PUT", ROUND_PATH, { canvas: "<html></html>", changeSet: { lastId: 0, changes: [] } });
    const folder = humanTouchFolder(root);
    for (let i = 0; i < 40; i++) {
      const stop = new AbortController();
      const listening = fetch(`${service.url}${EVENTS_PATH}`, { headers: { [TOKEN_HEADER]: service.token }, signal: stop.signal }).catch(() => {});
      setTimeout(() => stop.abort(), i % 4);
      await listening;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(JSON.parse(readFileSync(folder.checks, "utf8")).pages).toBe(0);
  });
});

describe("how the round stands, as the editor layer is told", () => {
  test("which changes count as applied: those the page shows, done or not, and those done that it cannot check; not one done that it does not show", async () => {
    const folder = humanTouchFolder(root);
    mkdirSync(folder.dir, { recursive: true });
    writeFileSync(folder.changeSet, JSON.stringify({ lastId: 3, changes: [] }));
    const claimedAt = new Date().toISOString();
    await writeState(folder, { status: "claimed", done: [2, 3], claimedAt });
    const at = new Date().toISOString();
    for (const [id, result] of [[1, { outcome: "shown" }], [2, { outcome: "not shown", actual: 12 }], [3, { outcome: "unchecked", reason: "the layer is not on the page now" }]] as const) {
      expect((await call("POST", CHECKS_PATH, { id, at, ...result })).status).toBe(204);
    }

    const events = await call("GET", EVENTS_PATH);
    const reader = events.body!.pipeThrough(new TextDecoderStream()).getReader();
    const { value } = await reader.read();
    await reader.cancel();

    expect(JSON.parse(value!.split("\n")[0])).toMatchObject({ status: "claimed", done: [2, 3], applied: [1, 3] });
  });

  test("a change shown, then not by a page behind the one that showed it, still counts; undone by a later edit, as the page that showed it says, it does not", async () => {
    const folder = humanTouchFolder(root);
    mkdirSync(folder.dir, { recursive: true });
    writeFileSync(folder.changeSet, JSON.stringify({ lastId: 1, changes: [] }));
    await writeState(folder, { status: "claimed", done: [], claimedAt: new Date().toISOString() });
    const report = (result: object) => call("POST", CHECKS_PATH, { id: 1, at: new Date().toISOString(), ...result });
    const applied = async () => ((await roundStatus(folder)) as { applied: number[] }).applied;

    await report({ outcome: "shown" });
    await report({ outcome: "not shown", actual: 12 });
    expect(await applied()).toEqual([1]);

    await report({ outcome: "not shown", actual: 12, undone: true });
    expect(await applied()).toEqual([]);
  });

  test("a page behind the one that showed a change, saying unasked it does not show, in the very millisecond done asks, is not taken for an answer; the answer to the ask is", async () => {
    const folder = humanTouchFolder(root);
    mkdirSync(folder.dir, { recursive: true });
    writeFileSync(folder.changeSet, JSON.stringify({ lastId: 1, changes: [] }));
    const at = "2026-10-31T02:06:21.127Z";
    await writeState(folder, { status: "claimed", done: [1], claimedAt: "2026-10-31T02:06:20.000Z", check: { ids: [1], at, key: "ask-1" } });
    const applied = async () => ((await roundStatus(folder)) as { applied: number[] }).applied;

    await call("POST", CHECKS_PATH, { id: 1, at, outcome: "shown" });
    await call("POST", CHECKS_PATH, { id: 1, at, outcome: "not shown", actual: 12 });
    expect(await applied()).toEqual([1]);

    await call("POST", CHECKS_PATH, { id: 1, at, answers: "ask-1", outcome: "not shown", actual: 12 });
    expect(await applied()).toEqual([]);
  });

  test("asked now, the status is read afresh: claimed the moment the command line claims, before any page is told (ticket 66)", async () => {
    const folder = humanTouchFolder(root);
    mkdirSync(folder.dir, { recursive: true });
    writeFileSync(folder.changeSet, JSON.stringify({ lastId: 1, changes: [] }));
    expect(await (await call("GET", STATUS_PATH)).json()).toEqual({ status: "editing" });

    await writeState(folder, { status: "claimed", done: [], claimedAt: new Date().toISOString() });

    expect(await (await call("GET", STATUS_PATH)).json()).toMatchObject({ status: "claimed", done: [], applied: [] });
  });
});
