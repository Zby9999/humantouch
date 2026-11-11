import { chromium, type Browser } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer, type Server as NetServer, type Socket } from "node:net";
import { after, before, test } from "node:test";
import { TOGGLE_LABEL } from "../playwright.config.ts";
import type { Server } from "./install-servers.ts";
import { watchForToggle } from "./toggle-watch.ts";

// Ports of ticket 151's own block (7100–7170).
const START = 7100;
const SILENT = 7101;
const SLOW_START = 7102;

const PAGE = `<!doctype html><title>start</title><button>${TOGGLE_LABEL}</button>`;
const server = (port: number): Server => ({ pid: process.pid, port, url: `http://127.0.0.1:${port}`, command: "test" });

let browser: Browser;
const closers: (() => void)[] = [];
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  for (const close of closers) close();
  await browser.close();
});

/** A port that takes connections and never answers, as the internal port next-server opened in pi's run (ticket 151). */
async function silentPort(port: number): Promise<NetServer> {
  const sockets: Socket[] = [];
  const silent = createServer((socket) => void sockets.push(socket));
  await new Promise<void>((resolve) => silent.listen(port, "127.0.0.1", resolve));
  closers.push(() => {
    for (const socket of sockets) socket.destroy();
    silent.close();
  });
  return silent;
}

/**
 * The start's dev server: its page has the toggle. As a first compile, no
 * request is answered until `compileMs` after the first one came in.
 */
async function startServer(port: number, compileMs = 0): Promise<HttpServer> {
  let compiled: number | null = null;
  const http = createHttpServer((_request, response) => {
    compiled ??= Date.now() + compileMs;
    setTimeout(() => response.writeHead(200, { "content-type": "text/html" }).end(PAGE), Math.max(0, compiled - Date.now()));
  });
  await new Promise<void>((resolve) => http.listen(port, "127.0.0.1", resolve));
  closers.push(() => {
    http.closeAllConnections();
    http.close();
  });
  return http;
}

/** Stops looking 90 s on, so a test that fails never hangs. */
const endsBy = (t0: number) => () => (Date.now() - t0 > 90_000 ? t0 : null);

test("a port that never answers does not hold the watcher: the toggle on the start's port, up a second later, is found in seconds", async () => {
  await silentPort(SILENT);
  const listening: Server[] = [server(SILENT)];
  const t0 = Date.now();
  setTimeout(() => void startServer(START).then(() => listening.push(server(START))), 1000);
  const found = await watchForToggle(browser, async () => [...listening], START, endsBy(t0), new Map());
  assert.equal(found?.server.port, START);
  const ms = found!.at - t0;
  assert.ok(ms < 10_000, `found ${(ms / 1000).toFixed(1)}s from the start`);
});

test("a start whose first compile takes over 20 s still shows its toggle", async () => {
  await startServer(SLOW_START, 21_000);
  const t0 = Date.now();
  const found = await watchForToggle(browser, async () => [server(SLOW_START)], SLOW_START, endsBy(t0), new Map());
  assert.equal(found?.server.port, SLOW_START);
  assert.ok(found!.at - t0 >= 21_000);
});
