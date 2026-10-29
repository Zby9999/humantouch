/** How the editor layer and the local service talk. Shared by both sides. */
import type { SavedChangeSet } from "./client/changeset";

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
