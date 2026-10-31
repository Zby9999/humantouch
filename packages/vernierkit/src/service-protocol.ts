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
/**
 * `GET`: the round's status now, one `RoundStatus`, read afresh: claimed the
 * moment the command line claims it, before `EVENTS_PATH` tells the pages.
 * The editor layer asks it as the code changes in edit mode (ticket 66).
 */
export const STATUS_PATH = "/status";
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

/** `GET`: the project's Variables, as a `Variable[]`; none when it has none, or they cannot be read. */
export const VARIABLES_PATH = "/variables";

/** The groups the Design panel offers Variables in. */
export type VariableGroup = "color" | "spacing" | "radius" | "fontSize" | "shadow";

/**
 * A Variable: a value the project defines once and reuses, from its Tailwind
 * theme (v3 config or v4 `@theme`) or a CSS custom property of its own.
 */
export interface Variable {
  /** As the designer sees it and the code names it: a Tailwind theme key (`brand-500`, `4`, `DEFAULT`), or a CSS variable (`--space-md`). */
  name: string;
  group: VariableGroup;
  /** Its CSS value, with the Variables it is made of put in. */
  value: string;
  /** `tailwind`: used through Tailwind's classes (`bg-brand-500`). `css`: through `var()`. */
  from: "tailwind" | "css";
  /** How CSS refers to it, when it is a CSS variable too: `var(--color-brand-500)`, `calc(var(--spacing) * 4)`. */
  css?: string;
  /** Defined by the project; false: one of Tailwind's own defaults. */
  own: boolean;
}

/**
 * `done` asking the page to check changes `ids`, at `at` (an ISO date).
 * `key`: this ask's own, made afresh each time, that the page's answers carry
 * (`CheckReport.answers`): what the page saw as the code changed may carry
 * the same millisecond as the ask, but never its key. `codeAt`: when the
 * project's code was last edited, as far as the command line can tell (ms
 * since the epoch), so the page waits for that edit to reach it before it
 * says a change does not show; null when it cannot tell.
 */
export interface CheckAsk {
  ids: number[];
  at: string;
  key: string;
  codeAt?: number | null;
}

/**
 * Edited by the designer, or claimed and being applied by the Agent: with the
 * ids of the changes the Agent reported done, those that count as applied (as
 * the page shows them, ADR 0013), the check the last `done` asks for, and
 * the one `finish` asks for before it ends the round.
 */
export type RoundStatus = { status: "editing" } | { status: "claimed"; done: number[]; applied: number[]; check?: CheckAsk; closing?: CheckAsk };

/** How long a page waits for the dev server to bring an edit in before it says a change does not show, when it cannot tell whether one is on its way. */
export const CHECK_SETTLE_MS = 3000;

/** The longest a page takes to answer `done`: waiting for an edit the dev server is bringing in, then for the change to show; then it says it does not show all the same. */
export const CHECK_ARRIVE_MS = 20_000;

/**
 * Global the dev server's code updates are kept in on the page, when it can
 * say (Vite): `at`, when the code the page has was last brought in (ms since
 * the epoch, the dev server's clock); `updating`, updates under way. A
 * `CODE_EVENT` on the window follows each change.
 */
export const CODE_GLOBAL = "__VERNIERKIT_CODE__";
export const CODE_EVENT = "vernierkit:code";
export interface CodeUpdates {
  at: number;
  updating: number;
}

/** Why a brief is never checked on the page: it asks for what no value of a property shows. */
export const BRIEF_UNCHECKED = "a brief asks for what the Design panel cannot set, so the page has no value to check it by";

/** The project's code at one moment, as a git tree, to take a round's changes back out by. */
export interface CodeSnapshot {
  /** The git repository's top folder. */
  repository: string;
  /** The tree, as `git write-tree` gives it. */
  tree: string;
}

/** Whether the live page shows a change: its value there is the value the change sets. */
export type CheckResult =
  | { outcome: "shown" }
  /** `actual`: the value the page shows instead, in design language. `width`: shown that wide, when not as wide as the page's window. */
  | { outcome: "not shown"; actual: unknown; width?: number }
  /** `anyPage`: no page could check it either (a brief, a layer new this round): not worth waiting for another. */
  | { outcome: "unchecked"; reason: string; anyPage?: true };

/**
 * How a page checked change `id`, at `at` (an ISO date). `answers`: the key
 * of the ask it answers; none when the page checked as the code changed.
 * `undone`: the page showed it, and shows it no more: a later edit undid it.
 */
export type CheckReport = { id: number; at: string; answers?: string; undone?: true } & CheckResult;

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
