/** How the editor layer and the local service talk. Shared by both sides. */
import type { Place, SavedChangeSet, Target } from "./client/changeset";
import type { Snippet } from "./source-snippet";

/** Global the dev server sets on the page: where the local service is, and its token. */
export const SERVICE_GLOBAL = "__VERNIERKIT__";
/** Next.js has no `index.html` for the global: `withVernier()` puts the same, as JSON, in the bundle's `process.env` under this name. */
export const SERVICE_ENV = "VERNIERKIT_SERVICE";
/** Header that carries the token. A request without the right one is turned away. */
export const TOKEN_HEADER = "X-Vernier-Token";
/** Where the round is, on the local service. */
export const ROUND_PATH = "/round";
/**
 * `GET`: the round's status as it changes, one `RoundStatus` as JSON per
 * line, the current one first. The answer stays open.
 */
export const EVENTS_PATH = "/events";
/** `POST`: the designer unlocks a claimed round by hand. It ends as it is. */
export const UNLOCK_PATH = "/unlock";
/** `POST`: a page reports a `CheckReport`, the answer to the check `done` asked for. */
export const CHECKS_PATH = "/checks";
/** `GET`: the project's own breakpoints from its Tailwind theme, as `ProjectBreakpoints` (204: none to be read). */
export const BREAKPOINTS_PATH = "/breakpoints";

/**
 * `GET`: the layers off the canvas, as `{ layers: SavedOffCanvasLayer[] }` (204:
 * none). `PUT` saves them all, and answers with their snippets, as
 * `OffCanvasSaveAnswer`. They belong to no round (ADR 0009): saved while a round
 * is claimed too, and kept when it ends.
 */
export const OFF_CANVAS_PATH = "/off-canvas";

/** `done` asking the page to check change `id`; `at` tells one ask from the next. */
export interface CheckAsk {
  id: number;
  at: string;
}

/**
 * Edited by the designer, or claimed and being applied by the Agent, with the
 * ids of the changes done so far, and the check the last `done` asks for.
 */
export type RoundStatus = { status: "editing" } | { status: "claimed"; done: number[]; check?: CheckAsk };

/** How long a page waits for the dev server to bring an edit in before it says a change does not show. */
export const CHECK_SETTLE_MS = 3000;

/** The project's code at one moment, as a git tree, to take a round's changes back out by. */
export interface CodeSnapshot {
  /** The git repository's top folder. */
  repository: string;
  /** The tree, as `git write-tree` gives it. */
  tree: string;
}

/** Whether the live page shows a change the Agent has done: its value there is the value the change sets. */
export type CheckResult =
  | { outcome: "shown" }
  /** `actual`: the value the page shows instead, in design language. */
  | { outcome: "not shown"; actual: unknown }
  | { outcome: "unchecked"; reason: string };

/** A page's answer to a check. */
export type CheckReport = CheckAsk & CheckResult;

export interface ServiceConfig {
  /** `http://127.0.0.1:<port>` */
  url: string;
  token: string;
}

/**
 * The round being edited, as saved in `.vernier/`: the canvas and the
 * ChangeSet. `GET /round` answers with it (204: no round), `PUT /round` saves
 * it, `DELETE /round` drops it. While the round is claimed it cannot be
 * saved or dropped (409).
 */
export interface SavedRound {
  /** The edited canvas, as an HTML document. */
  canvas: string;
  changeSet: SavedChangeSet;
}

/**
 * An Off-canvas Layer (ADR 0009) as saved in `.vernier/off-canvas.json`: where
 * it is in the workspace, how it looked, frozen, where it came from, and what
 * was done to it off the canvas.
 */
export interface SavedOffCanvasLayer {
  id: string;
  /** Its top left in the workspace, in the desktop view's px from its top left. */
  x: number;
  y: number;
  /**
   * The layer as an HTML document of its own: every style it had frozen into
   * it, as it looked when moved out, with what was edited off the canvas over it.
   */
  look: string;
  origin: OffCanvasOrigin;
  /** The edits made to it off the canvas: no changes of the round's, but kept, to go with it when it is put back. */
  edits: SavedChangeSet;
}

/** The answer to saving the layers off the canvas: the JSX that writes each, by its id, as kept. */
export interface OffCanvasSaveAnswer {
  snippets: Record<string, Snippet | null>;
}

/** Where a layer off the canvas came from, as it was when moved out. */
export interface OffCanvasOrigin {
  /** How the Agent finds it in the source, its component and usage chain included. */
  target: Target;
  /** Where it was: its container and its place there. Null for a layer with none (new this round, say). */
  place: Place | null;
  /** `file:line:column` of the JSX that writes it (an instance's: its usage); null when not in the source (new this round). */
  written: string | null;
  /**
   * That JSX as the source had it, read by the local service when the layer
   * is first saved; null when it could not be read. Missing until then.
   */
  snippet?: Snippet | null;
  /** Moved out as a copy: the layer it copies stayed on the canvas, and its code in the source. */
  copy?: true;
  /** When it was moved out, as an ISO date. */
  at: string;
}
