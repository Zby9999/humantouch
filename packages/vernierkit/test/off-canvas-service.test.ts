import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startService, type Service } from "../src/service";
import { OFF_CANVAS_PATH, ROUND_PATH, TOKEN_HEADER, type OffCanvasLayer } from "../src/service-protocol";
import { archiveRound, vernierFolder, writeState } from "../src/vernier-folder";

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
  root = mkdtempSync(join(tmpdir(), "vernierkit-off-canvas-"));
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

function layer(id: string, written: string | null, x = 10): OffCanvasLayer {
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

const saved = () => JSON.parse(readFileSync(join(root, ".vernier/off-canvas.json"), "utf8")).layers as OffCanvasLayer[];

describe("layers off the canvas, in the local service", () => {
  test("are kept in .vernier/, each with the JSX that writes it as the source had it when first saved", async () => {
    expect((await call("GET", OFF_CANVAS_PATH)).status).toBe(204);
    expect((await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", "src/App.tsx:4:7")] })).status).toBe(204);

    expect(saved()[0].origin.snippet).toEqual({ loc: "src/App.tsx:4:7", code: '<h1 className="text-4xl">Hello</h1>' });
    // The Agent deletes it from the source; the snippet stays as it was.
    writeFileSync(join(root, "src/App.tsx"), APP.replace(/ *<h1.*\n/, ""));
    await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", "src/App.tsx:4:7", 50)] });
    const response = await call("GET", OFF_CANVAS_PATH);
    const { layers } = (await response.json()) as { layers: OffCanvasLayer[] };
    expect(layers).toMatchObject([{ id: "a", x: 50, origin: { snippet: { code: '<h1 className="text-4xl">Hello</h1>' } } }]);
  });

  test("a layer new this round has no snippet; none left, nothing is kept", async () => {
    await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", null)] });
    expect(saved()[0].origin.snippet).toBeNull();
    await call("PUT", OFF_CANVAS_PATH, { layers: [] });
    expect(existsSync(join(root, ".vernier/off-canvas.json"))).toBe(false);
    expect((await call("PUT", OFF_CANVAS_PATH, { layers: "no" })).status).toBe(400);
    expect((await call("PUT", OFF_CANVAS_PATH, { layers: [{ id: "a" }] })).status).toBe(400);
  });

  test("belong to no round: saved while a round is claimed, and kept when it ends", async () => {
    await call("PUT", ROUND_PATH, { canvas: "<html></html>", changeSet: { lastId: 1, changes: [] } });
    const folder = vernierFolder(root);
    await writeState(folder, { status: "claimed", done: [] });
    expect((await call("PUT", OFF_CANVAS_PATH, { layers: [layer("a", null)] })).status).toBe(204);

    await archiveRound(folder, "finished");

    expect(existsSync(folder.changeSet)).toBe(false);
    expect(saved().map((l) => l.id)).toEqual(["a"]);
  });
});
