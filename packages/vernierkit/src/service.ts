/**
 * The local service: runs in the dev server process and keeps the round in
 * `.vernier/`. It listens on 127.0.0.1 only and answers only requests that
 * carry the random token made at start, so other sites open in the browser
 * cannot reach the project's files.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ROUND_PATH, TOKEN_HEADER, type SavedRound, type ServiceConfig } from "./service-protocol";
import { readIfThere, vernierFolder, writeAtomically } from "./vernier-folder";
/** A saved canvas carries the page's styles inline; this leaves plenty of room. */
const MAX_BODY = 64 * 1024 * 1024;

export interface Service extends ServiceConfig {
  close(): Promise<void>;
}

export async function startService({ root }: { root: string }): Promise<Service> {
  const files = vernierFolder(root);
  const token = randomBytes(32).toString("hex");

  /** `body`: read in full before the request takes its turn, so a slow one holds up no other. */
  const handle = async (req: IncomingMessage, res: ServerResponse, body: string) => {
    switch (req.method) {
      case "GET": {
        // The ChangeSet is written last, so without it there is no whole round.
        const changeSet = await readIfThere(files.changeSet);
        const canvas = changeSet && (await readIfThere(files.canvas));
        if (!changeSet || !canvas) return send(res, 204);
        return send(res, 200, JSON.stringify({ canvas, changeSet: JSON.parse(changeSet) } satisfies SavedRound));
      }
      case "PUT": {
        const round = JSON.parse(body) as SavedRound;
        if (typeof round.canvas !== "string" || !Array.isArray(round.changeSet?.changes)) return send(res, 400);
        await mkdir(files.dir, { recursive: true });
        await writeAtomically(files.canvas, round.canvas);
        await writeAtomically(files.changeSet, `${JSON.stringify(round.changeSet, null, 2)}\n`);
        return send(res, 204);
      }
      case "DELETE":
        await rm(files.changeSet, { force: true });
        await rm(files.canvas, { force: true });
        return send(res, 204);
      default:
        return send(res, 405);
    }
  };

  // One request at a time: a save never overtakes the one before it.
  let queue = Promise.resolve();
  const server = createServer((req, res) => {
    allowLocalPages(req, res);
    // A preflight carries no token, and gets nothing but the go-ahead.
    if (req.method === "OPTIONS") return send(res, 204);
    if (!hasToken(req, token)) return send(res, 401);
    if (new URL(req.url ?? "/", "http://127.0.0.1").pathname !== ROUND_PATH) return send(res, 404);
    const fail = (error: unknown) => {
      console.error("Vernier Kit:", error);
      if (!res.headersSent) send(res, 500);
    };
    readBody(req).then((body) => {
      queue = queue.then(() => handle(req, res, body).catch(fail));
    }, fail);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    token,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function hasToken(req: IncomingMessage, token: string): boolean {
  const given = req.headers[TOKEN_HEADER.toLowerCase()];
  if (typeof given !== "string") return false;
  const [a, b] = [Buffer.from(given), Buffer.from(token)];
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The editor layer runs on the dev server's page, a different origin. Only local pages may read the answers. */
function allowLocalPages(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (!origin || !isLocal(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", `${TOKEN_HEADER}, Content-Type`);
  res.setHeader("Vary", "Origin");
}

function isLocal(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function send(res: ServerResponse, status: number, json?: string) {
  if (json !== undefined) res.setHeader("Content-Type", "application/json");
  res.writeHead(status).end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Vernier Kit: the round is too large to save"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
