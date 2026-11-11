/**
 * The local service: runs in the dev server process and keeps the round in
 * `.humantouch/`. It tells the editor layer how the round stands as the Agent
 * claims and applies it, has open pages check each change the Agent reports
 * done, ends the round when the designer unlocks it, and reads the project's
 * Variables for the Design panel. It
 * listens on 127.0.0.1 only and answers only requests that carry the random
 * token made at start, so other sites open in the browser cannot reach the
 * project's files.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, unwatchFile, watchFile } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { PutBack } from "./client/changeset";
import { CLAIM_PATH, CODE_QUIET_MS, OTHER_USAGES_PATH } from "./client/code-changes";
import { PAGE_PATH, type PagePrint } from "./client/page-print";
import { readProjectBreakpoints } from "./project-breakpoints";
import { snippetAt } from "./source-snippet";
import {
  BREAKPOINTS_PATH,
  CHECKS_PATH,
  EVENTS_PATH,
  OFF_CANVAS_PATH,
  ROUND_PATH,
  STATUS_PATH,
  TOKEN_HEADER,
  UNLOCK_PATH,
  VARIABLES_PATH,
  type CheckReport,
  type CodeSnapshot,
  type OtherUsagesKept,
  type SavedOffCanvasLayer,
  type OffCanvasSaveAnswer,
  type RoundStatus,
  type SavedRound,
  type ServiceConfig,
} from "./service-protocol";
import {
  archiveRound,
  claimFresh,
  keepOtherUsages,
  readChecks,
  readIfThere,
  readOffCanvas,
  readOtherUsages,
  readState,
  roundStatus,
  snapshotCode,
  humanTouchFolder,
  writeAtomically,
  writeChecks,
  writeOffCanvas,
  type Checks,
  type RoundState,
} from "./human-touch-folder";
import { readVariables } from "./variables";

/** A saved canvas carries the page's styles inline; this leaves plenty of room. */
const MAX_BODY = 64 * 1024 * 1024;
/** How often the state file is looked at: the command line changes it from another process. */
const WATCH_MS = 100;

/** The code as it rested, kept while a round is edited: how many it keeps. */
const RESTED_KEPT = 5;

export interface Service extends ServiceConfig {
  /** A file of the project changed, as the dev server's watcher says (`.humantouch/` aside). */
  codeChanged(): void;
  close(): Promise<void>;
}

/** `quietMs`: how long the code is to be still before it counts as at rest. */
export async function startService({ root, quietMs = CODE_QUIET_MS }: { root: string; quietMs?: number }): Promise<Service> {
  const files = humanTouchFolder(root);
  const token = randomBytes(32).toString("hex");

  /** What the editor layer is told: how the round stands, without what only the command line needs. */
  const status = (): Promise<RoundStatus> => roundStatus(files);

  /** Answers to `GET /events`, kept open: each gets a line when the status changes. */
  const listeners = new Set<ServerResponse>();
  let lastSent = "";
  // One read after another, so an older status never goes out after a newer one.
  let reading = Promise.resolve();
  const broadcast = () => {
    reading = reading.then(async () => {
      const line = `${JSON.stringify(await status())}\n`;
      if (line === lastSent) return;
      lastSent = line;
      for (const res of listeners) res.write(line);
    }).catch((error) => console.error("Human Touch:", error));
  };
  // The service never keeps a process alive by itself: it lives as long as its dev server.
  watchFile(files.state, { interval: WATCH_MS }, broadcast).unref();

  /** `checks.json`, with the pages open now: the command line asks them through it. Only beside a round. */
  const updateChecks = async (change: (checks: Checks) => void = () => {}) => {
    if (!existsSync(files.changeSet)) return;
    const checks = (await readChecks(files)) ?? { pages: 0, service: process.pid, results: {} };
    checks.pages = listeners.size;
    checks.service = process.pid;
    change(checks);
    await writeChecks(files, checks);
  };
  const countPages = () => {
    queue = queue.then(() => updateChecks()).catch((error) => console.error("Human Touch:", error));
  };

  /**
   * The code each time it rested while a round was edited, and not claimed:
   * a round the page claims (ticket 78) was claimed after the Agent began to
   * edit, so `last` goes back to the code as it was before the run of changes
   * the page saw a change of the round in. `at`: when it was read, the code
   * still since. Taken as the round is first saved, then each time the code
   * rests after a change, as long as the round is edited.
   */
  let rested: { at: number; code: CodeSnapshot | null }[] = [];
  /** Changes to the code seen so far, and as of the code rested last. */
  let edits = 0;
  let restedEdits = -1;
  let resting: ReturnType<typeof setTimeout> | undefined;
  const takeRested = async () => {
    if (restedEdits === edits || !existsSync(files.changeSet) || existsSync(files.state)) return;
    const [at, before] = [Date.now(), edits];
    const code = await snapshotCode(root);
    // Changed again while it was read: not the code at rest.
    if (edits !== before) return;
    restedEdits = before;
    rested = [...rested.slice(1 - RESTED_KEPT), { at, code }];
  };
  const codeChanged = () => {
    edits++;
    clearTimeout(resting);
    resting = setTimeout(() => void takeRested().catch((error) => console.error("Human Touch:", error)), quietMs);
    resting.unref();
  };

  /** `body`: read in full before the request takes its turn, so a slow one holds up no other. */
  const handle = async (req: IncomingMessage, res: ServerResponse, path: string, body: string) => {
    const route = `${req.method} ${path}`;
    switch (route) {
      case `GET ${ROUND_PATH}`: {
        // The ChangeSet is written last, so without it there is no whole round.
        const changeSet = await readIfThere(files.changeSet);
        const canvas = changeSet && (await readIfThere(files.canvas));
        if (!changeSet || !canvas) return send(res, 204);
        // Claimed: with what was noted of the other usages, for a page opened or reloaded since to go by (ticket 82).
        const state = await readState(files);
        const otherUsages = state && (await readOtherUsages(files, state));
        const page = await readIfThere(files.page);
        return send(res, 200, JSON.stringify({ canvas, changeSet: JSON.parse(changeSet), ...(otherUsages && { otherUsages }), ...(page && { page: JSON.parse(page) as PagePrint }) } satisfies SavedRound));
      }
      case `PUT ${ROUND_PATH}`: {
        // The Agent is applying the ChangeSet: it stays as claimed.
        if ((await status()).status === "claimed") return send(res, 409);
        const round = JSON.parse(body) as SavedRound;
        if (typeof round.canvas !== "string" || !Array.isArray(round.changeSet?.changes)) return send(res, 400);
        // A layer put back goes with the JSX that wrote it, as kept off the canvas, when the editor layer has not heard it yet.
        const unheard = round.changeSet.changes.filter((change) => change.kind === "putBack" && (change.after as PutBack).layer.origin.snippet === undefined);
        if (unheard.length) {
          const kept = new Map((await readOffCanvas(files)).flatMap(carriedIn).map((layer) => [layer.id, layer.origin.snippet]));
          for (const change of unheard) {
            const { origin, id } = (change.after as PutBack).layer;
            origin.snippet = kept.get(id) ?? (origin.written ? await snippetAt(root, origin.written) : null);
          }
        }
        await mkdir(files.dir, { recursive: true });
        await writeAtomically(files.canvas, round.canvas);
        await writeAtomically(files.changeSet, `${JSON.stringify(round.changeSet, null, 2)}\n`);
        // Not claimed: no checks yet, whatever an earlier round left.
        await updateChecks((checks) => void (checks.results = {}));
        // The code as it is now, unless it is at rest as read already: a round the page claims may go back to it.
        void takeRested().catch((error) => console.error("Human Touch:", error));
        return send(res, 204);
      }
      case `PUT ${PAGE_PATH}`: {
        // The page a canvas reflects (ticket 141): kept for the round being edited, or about to be, as edit mode put the canvas up.
        if ((await status()).status === "claimed") return send(res, 409);
        const print = JSON.parse(body || "null") as PagePrint | null;
        if (!print || typeof print.path !== "string" || typeof print.structure !== "string" || typeof print.styles !== "string") return send(res, 400);
        await mkdir(files.dir, { recursive: true });
        await writeAtomically(files.page, `${JSON.stringify({ path: print.path, structure: print.structure, styles: print.styles })}\n`);
        return send(res, 204);
      }
      case `DELETE ${ROUND_PATH}`:
        if ((await status()).status === "claimed") return send(res, 409);
        await rm(files.changeSet, { force: true });
        await rm(files.canvas, { force: true });
        return send(res, 204);
      case `GET ${EVENTS_PATH}`: {
        res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
        const now = await status();
        // Gone while the status was read (React's strict mode stops listening right after it starts): no page open here.
        if (res.destroyed) return;
        res.write(`${JSON.stringify(now)}\n`);
        listeners.add(res);
        countPages();
        res.on("close", () => {
          listeners.delete(res);
          countPages();
        });
        return;
      }
      case `GET ${STATUS_PATH}`:
        return send(res, 200, JSON.stringify(await status()));
      case `POST ${CHECKS_PATH}`: {
        const state = await readState(files);
        if (!state) return send(res, 409);
        const { id, undone, ...result } = JSON.parse(body) as CheckReport;
        if (typeof id !== "number" || typeof result.at !== "string" || !["string", "undefined"].includes(typeof result.answers)) return send(res, 400);
        // Asked by its key: what a page saw as the code changed carries none, though it may carry the ask's millisecond.
        const asked = !!result.answers && [state.opening, state.check, state.closing].some((ask) => ask?.key === result.answers);
        await updateChecks((checks) => {
          const earlier = checks.results[id];
          // Of two pages answering the same ask, the one that could check has the say.
          if (result.answers && earlier?.answers === result.answers && earlier.outcome !== "unchecked" && result.outcome === "unchecked") return;
          // Shown, a change is not shown again only as the page that showed it says, a later edit undoing it: what another says of it, unasked, is behind.
          if (earlier?.outcome === "shown" && result.outcome !== "shown" && !asked && !undone && (!state.claimedAt || earlier.at >= state.claimedAt)) return;
          checks.results[id] = result;
        });
        // The progress may have changed with it.
        broadcast();
        return send(res, 204);
      }
      case `GET ${BREAKPOINTS_PATH}`: {
        // Read afresh each time: the theme may have changed since.
        const breakpoints = await readProjectBreakpoints(root);
        return breakpoints ? send(res, 200, JSON.stringify(breakpoints)) : send(res, 204);
      }
      case `GET ${OFF_CANVAS_PATH}`: {
        const layers = await readOffCanvas(files);
        return layers.length ? send(res, 200, JSON.stringify({ layers })) : send(res, 204);
      }
      case `PUT ${OFF_CANVAS_PATH}`: {
        // No round's: saved whether or not one is claimed.
        const { layers } = JSON.parse(body) as { layers: SavedOffCanvasLayer[] };
        if (!Array.isArray(layers) || !layers.every((layer) => typeof layer?.id === "string" && typeof layer.look === "string" && typeof layer.origin === "object")) return send(res, 400);
        // Each, and each that came into one from elsewhere (ticket 108), kept with the change that brought it in.
        const kept = new Map((await readOffCanvas(files)).flatMap(carriedIn).map((layer) => [layer.id, layer]));
        const all = layers.flatMap(carriedIn);
        for (const layer of all) {
          // The JSX as the source had it when the layer first came: the Agent may delete it since.
          const snippet = kept.get(layer.id)?.origin.snippet;
          if (snippet !== undefined) layer.origin.snippet = snippet;
          else if (layer.origin.snippet === undefined) layer.origin.snippet = layer.origin.written ? await snippetAt(root, layer.origin.written) : null;
        }
        await writeOffCanvas(files, layers);
        // The editor layer keeps each with its layer: it goes with it when put back, and comes back with it when that is undone.
        return send(res, 200, JSON.stringify({ snippets: Object.fromEntries(all.map((layer) => [layer.id, layer.origin.snippet ?? null])) } satisfies OffCanvasSaveAnswer));
      }
      case `POST ${CLAIM_PATH}`: {
        // A page saw a change of the round show, the Agent applying it with no claim (ticket 78). Claimed already, it stays as it is.
        if (!existsSync(files.changeSet)) return send(res, 409);
        const { since, otherUsages } = JSON.parse(body || "{}") as { since?: number; otherUsages?: OtherUsagesKept };
        const noted = otherUsages && typeof otherUsages === "object" ? otherUsages : {};
        // What the other usages showed as the run began, kept with the claim (ticket 82); claimed already, as any page's notes.
        const claimed = await readState(files);
        if (claimed) {
          await keepOtherUsages(files, claimed, noted);
          return send(res, 204);
        }
        // The code as it rested before the run the page saw it in; failing that, as it is now.
        const before = typeof since === "number" ? rested.filter((one) => one.at <= since).at(-1) : undefined;
        const state: RoundState = { status: "claimed", done: [], claimedAt: new Date().toISOString(), code: before ? before.code : await snapshotCode(root) };
        await claimFresh(files, state);
        await keepOtherUsages(files, state, noted);
        rested = [];
        broadcast();
        return send(res, 204);
      }
      case `POST ${OTHER_USAGES_PATH}`: {
        // What a page noted of the other usages, kept with the claim (ticket 82): only while the round is claimed.
        const state = await readState(files);
        if (!state) return send(res, 409);
        const { at, otherUsages: noted } = (JSON.parse(body || "null") ?? {}) as { at?: string; otherUsages?: OtherUsagesKept };
        if (typeof at !== "string" || Number.isNaN(Date.parse(at)) || !noted || typeof noted !== "object" || Array.isArray(noted)) return send(res, 400);
        // Noted before this round was claimed: an earlier round's, by ids that may be this round's other changes now, come in late.
        if (state.claimedAt && at < state.claimedAt) return send(res, 409);
        await keepOtherUsages(files, state, noted);
        return send(res, 204);
      }
      case `POST ${UNLOCK_PATH}`:
        return send(res, (await archiveRound(files, "unlocked")) ? 204 : 409);
      default:
        return send(res, [ROUND_PATH, PAGE_PATH, EVENTS_PATH, STATUS_PATH, CLAIM_PATH, OTHER_USAGES_PATH, UNLOCK_PATH, CHECKS_PATH, VARIABLES_PATH, BREAKPOINTS_PATH, OFF_CANVAS_PATH].includes(path) ? 405 : 404);
    }
  };

  // One request at a time: a save never overtakes the one before it.
  let queue = Promise.resolve();
  const server = createServer((req, res) => {
    allowLocalPages(req, res);
    // A preflight carries no token, and gets nothing but the go-ahead.
    if (req.method === "OPTIONS") return send(res, 204);
    if (!hasToken(req, token)) return send(res, 401);
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const fail = (error: unknown) => {
      console.error("Human Touch:", error);
      if (!res.headersSent) send(res, 500);
    };
    // Reading the Variables touches no round: it waits for no save, nor holds one up. Read afresh each time edit mode asks.
    if (req.method === "GET" && path === VARIABLES_PATH) {
      readVariables(root).then((variables) => send(res, 200, JSON.stringify(variables)), fail);
      return;
    }
    readBody(req).then((body) => {
      queue = queue.then(() => handle(req, res, path, body).catch(fail));
    }, fail);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  server.unref();
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    token,
    codeChanged,
    close: () => {
      clearTimeout(resting);
      unwatchFile(files.state);
      for (const res of listeners) res.end();
      return new Promise((resolve) => server.close(() => resolve()));
    },
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
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, POST");
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
        reject(new Error("Human Touch: the round is too large to save"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** `layer`, and each layer that came into it from elsewhere (ticket 108), all the way down, as kept with the change that brought it in. */
function carriedIn(layer: SavedOffCanvasLayer): SavedOffCanvasLayer[] {
  const edits = [...(layer.origin.edits ?? []), ...(layer.edits?.changes ?? [])];
  return [layer, ...edits.flatMap((change) => (change.kind === "putBack" ? carriedIn((change.after as PutBack).layer) : []))];
}
