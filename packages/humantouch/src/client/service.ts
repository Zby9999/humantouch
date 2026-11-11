/** The editor layer's side of the local service: where the round is kept between page loads, and how it stands. */
import type { ProjectBreakpoints } from "./breakpoints";
import {
  BREAKPOINTS_PATH,
  CHECKS_PATH,
  OFF_CANVAS_PATH,
  STATUS_PATH,
  UNLOCK_PATH,
  VARIABLES_PATH,
  type CheckReport,
  type OtherUsagesKept,
  type RoundStatus,
  type SavedOffCanvasLayer,
  type OffCanvasSaveAnswer,
  type SavedRound,
  type Variable,
} from "../service-protocol";
import { CLAIM_PATH, OTHER_USAGES_PATH } from "./code-changes";
import { KEEPALIVE_MAX_BYTES, roundWatch, serviceConfig, serviceRequest, type RoundWatch } from "./round-watch";

export interface RoundStore extends RoundWatch {
  /**
   * Saves the round; null drops it. `leaving`: the page is going (ticket 160):
   * sent at once, not after the saves before it, as a request the browser
   * sends on once the page has gone.
   */
  save(round: SavedRound | null, leaving?: boolean): Promise<void>;
  /** How the round stands now, read afresh: claimed the moment the Agent claims it, before `watch` says so. */
  status(): Promise<RoundStatus>;
  /** Ends a claimed round as it is. */
  unlock(): Promise<void>;
  /**
   * Claims the round being edited, once what is being saved is in: the page
   * saw one of its changes show, with no Agent having claimed it (ticket 78).
   * `since`: when the run of code changes it saw it in began (ms since the epoch).
   * `otherUsages`: what the other usages showed as that run began, kept with the claim (ticket 82).
   */
  claim(since: number, otherUsages?: OtherUsagesKept): Promise<void>;
  /** Keeps what the page noted of the other usages with the claim, those of a change noted already aside (ticket 82). `at`: when it noted them, to tell a round's from the round's before. */
  keepOtherUsages(otherUsages: OtherUsagesKept, at: string): Promise<void>;
  /** Answers the check `done` asked for. */
  report(check: CheckReport): Promise<void>;
  /** The project's own breakpoints from its Tailwind theme; null when it has none to be read. */
  breakpoints(): Promise<ProjectBreakpoints | null>;
  /** The layers off the canvas, kept apart from any round (ADR 0009). */
  loadOffCanvas(): Promise<SavedOffCanvasLayer[]>;
  /** Keeps the layers off the canvas, all of them. Answers with the JSX that writes each, as kept. */
  saveOffCanvas(layers: SavedOffCanvasLayer[], leaving?: boolean): Promise<OffCanvasSaveAnswer["snippets"]>;
}

/** Whether a body may go as a request the browser sends on as the page goes: within what such requests may carry together. */
function fitsKeepalive(bodies: (string | undefined)[]): boolean {
  return bodies.reduce((total, body) => total + (body ? new TextEncoder().encode(body).length : 0), 0) <= KEEPALIVE_MAX_BYTES;
}

/** The project's Variables, as the local service reads them; none when there is no service, or it cannot say. */
export async function loadVariables(): Promise<Variable[]> {
  const config = serviceConfig();
  if (!config) return [];
  try {
    const response = await serviceRequest(config)("GET", { path: VARIABLES_PATH });
    return (await response.json()) as Variable[];
  } catch (error) {
    console.warn("Human Touch: could not load the project's Variables:", error);
    return [];
  }
}

/** The store the dev server set up for this page, or null when it set up none. */
export function connectRoundStore(): RoundStore | null {
  const config = serviceConfig();
  if (!config) return null;
  const request = serviceRequest(config);
  // Saves go one after another, so the last one made is the one that stays.
  let saving: Promise<unknown> = Promise.resolve();
  let savingOffCanvas: Promise<unknown> = Promise.resolve();
  /** The bodies sent as the page goes, so far: together within what the browser carries on. */
  const leavingWith: (string | undefined)[] = [];
  /** `send` with `body`, at once, as the page goes; one the browser cannot carry on goes as an ordinary request. */
  const sendLeaving = (send: (keepalive: boolean) => Promise<Response>, body: string | undefined) => {
    const keepalive = fitsKeepalive([...leavingWith, body]);
    if (keepalive) leavingWith.push(body);
    return send(keepalive);
  };
  return {
    ...roundWatch(request),
    save(round, leaving) {
      const body = round ? JSON.stringify(round) : undefined;
      const send = (keepalive: boolean) => (body ? request("PUT", { body, keepalive }) : request("DELETE", { keepalive }));
      // The page going: no waiting for the save before, which went first and the service takes first.
      const next = leaving ? sendLeaving(send, body) : saving.then(() => send(false));
      saving = next.catch(() => {});
      return next.then(() => {});
    },
    async status() {
      return (await (await request("GET", { path: STATUS_PATH })).json()) as RoundStatus;
    },
    async unlock() {
      await request("POST", { path: UNLOCK_PATH });
    },
    async claim(since, otherUsages) {
      await saving;
      await request("POST", { path: CLAIM_PATH, body: JSON.stringify({ since, otherUsages }) });
    },
    async keepOtherUsages(otherUsages, at) {
      await request("POST", { path: OTHER_USAGES_PATH, body: JSON.stringify({ at, otherUsages }) });
    },
    async report(check) {
      await request("POST", { path: CHECKS_PATH, body: JSON.stringify(check) });
    },
    async breakpoints() {
      const response = await request("GET", { path: BREAKPOINTS_PATH });
      return response.status === 204 ? null : ((await response.json()) as ProjectBreakpoints);
    },
    async loadOffCanvas() {
      const response = await request("GET", { path: OFF_CANVAS_PATH });
      return response.status === 204 ? [] : ((await response.json()) as { layers: SavedOffCanvasLayer[] }).layers;
    },
    saveOffCanvas(layers, leaving) {
      const body = JSON.stringify({ layers });
      const send = (keepalive: boolean) => request("PUT", { path: OFF_CANVAS_PATH, body, keepalive });
      const next = leaving ? sendLeaving(send, body) : savingOffCanvas.then(() => send(false));
      savingOffCanvas = next.catch(() => {});
      return next.then(async (response) => (response.status === 200 ? ((await response.json()) as OffCanvasSaveAnswer).snippets : {}));
    },
  };
}
