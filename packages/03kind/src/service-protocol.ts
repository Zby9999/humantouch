/** How the editor layer and the local service talk. Shared by both sides. */
import type { Place, SavedChangeSet, Target } from "./client/changeset";
import type { Snippet } from "./source-snippet";
import type { StyleSource } from "./client/style-source";
import type { UsageLevel } from "./client/usage-chain";

/** Global the dev server sets on the page: where the local service is, and its token. */
export const SERVICE_GLOBAL = "__THIRD_KIND__";
/** Next.js has no `index.html` for the global: `withThirdKind()` puts the same, as JSON, in the bundle's `process.env` under this name. */
export const SERVICE_ENV = "TK_SERVICE";
/** Header that carries the token. A request without the right one is turned away. */
export const TOKEN_HEADER = "X-03Kind-Token";
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
 * says a change does not show; null when it cannot tell. `sources`: of a
 * style change the page does not show, it says what sets the value it shows
 * instead too, as `claim` asks of the changes carried over from the round
 * before (ticket 68).
 */
export interface CheckAsk {
  ids: number[];
  at: string;
  key: string;
  codeAt?: number | null;
  sources?: true;
}

/**
 * Edited by the designer, or claimed and being applied by the Agent: with the
 * ids of the changes the Agent reported done, those that count as applied (as
 * the page shows them, ADR 0013), the check `claim` asks for of the changes
 * carried over from the round before (ticket 68), the check the last `done`
 * asks for, and the one `finish` asks for before it ends the round.
 */
export type RoundStatus = { status: "editing" } | { status: "claimed"; done: number[]; applied: number[]; opening?: CheckAsk; check?: CheckAsk; closing?: CheckAsk };

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
export const CODE_GLOBAL = "__THIRD_KIND_CODE__";
export const CODE_EVENT = "03kind:code";
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
  /**
   * `actual`: the value the page shows instead, in design language. `width`:
   * shown that wide, when not as wide as the page's window. `sources`: of a
   * style change carried over from a round before, what sets that value on
   * the page, read where `actual` is, as `claim` asks (ticket 68).
   * `otherUsages`: the layer shows the change, but other usages of its
   * component do too, the change being for one usage alone (ticket 77);
   * `actual` is then the layer's own value.
   */
  | { outcome: "not shown"; actual: unknown; width?: number; sources?: StyleSource[]; otherUsages?: OtherUsageChanged[] }
  /** `anyPage`: no page could check it either (a brief, a copy made this round): not worth waiting for another. */
  | { outcome: "unchecked"; reason: string; anyPage?: true };

/**
 * Another usage of a component on the page whose value of a change's property
 * is not what it was as the round was claimed, the change being for one usage
 * of the component alone (ticket 77): the usage, by its usage chain, innermost
 * first; its value then (`was`) and now (`is`), in design language.
 */
export interface OtherUsageChanged {
  chain: UsageLevel[];
  was: unknown;
  is: unknown;
}

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
 * The round being edited, as saved in `.03kind/`: the canvas and the
 * ChangeSet. `GET /round` answers with it (204: no round), `PUT /round` saves
 * it, `DELETE /round` drops it. While the round is claimed it cannot be
 * saved or dropped (409).
 */
export interface SavedRound {
  /** The edited canvas, as an HTML document. */
  canvas: string;
  changeSet: SavedChangeSet;
  /**
   * While the round is claimed, as `GET /round` answers, always (empty when
   * nothing is kept): what the other usages of each change for one usage
   * alone showed of its property as the page began to check the round, by
   * the change's id (ticket 77), kept with the claim (ticket 82), so a page
   * opened or reloaded since goes by it. A round without it was read while
   * not claimed. Never saved with the round: the service ignores it in
   * `PUT /round`.
   */
  otherUsages?: OtherUsagesKept;
}

/**
 * What a page noted of the other usages of the component of a change for one
 * usage alone (ticket 77): how wide the window was, and each element noted,
 * in the order noted: its usage's key, its usage chain, and its value of the
 * change's property then, in design language. `More`: what the page keeps of
 * each besides, as long as it knows the element.
 */
export interface OtherUsagesNote<More = unknown> {
  width: number;
  seen: (More & { key: string; chain: UsageLevel[]; value: unknown })[];
}

/**
 * What pages noted of the other usages of a claimed round's changes for one
 * usage alone, as kept in `.03kind/` with the claim (ticket 82), by change id;
 * null for a change whose other usages the page does not look at. It belongs
 * to the round claimed: dropped as it ends, and as the next is claimed.
 */
export type OtherUsagesKept = Record<string, OtherUsagesNote | null>;

/**
 * An Off-canvas Layer (ADR 0009) as saved in `.03kind/off-canvas.json`: where
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
