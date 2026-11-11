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
import { PAGE_PATH, type PageCode, type PagePrint } from "./page-print";
import { roundWatch, serviceConfig, serviceRequest, type RoundWatch } from "./round-watch";

export interface RoundStore extends RoundWatch {
  /** Saves the round; null drops it. */
  save(round: SavedRound | null): Promise<void>;
  /** Keeps the print of the page the canvas reflects (ticket 141), after what is being saved. */
  savePage(print: PagePrint): Promise<void>;
  /** Whether the code is the code the page the canvas reflects was printed on (ticket 141); null when that cannot be told. */
  pageCode(): Promise<boolean | null>;
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
  saveOffCanvas(layers: SavedOffCanvasLayer[]): Promise<OffCanvasSaveAnswer["snippets"]>;
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
  return {
    ...roundWatch(request),
    save(round) {
      const next = saving.then(() => (round ? request("PUT", { body: JSON.stringify(round) }) : request("DELETE")));
      saving = next.catch(() => {});
      return next.then(() => {});
    },
    savePage(print) {
      const next = saving.then(() => request("PUT", { path: PAGE_PATH, body: JSON.stringify(print) }));
      saving = next.catch(() => {});
      return next.then(() => {});
    },
    async pageCode() {
      await saving;
      return ((await (await request("GET", { path: PAGE_PATH })).json()) as PageCode).codeSame;
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
    saveOffCanvas(layers) {
      const next = savingOffCanvas.then(() => request("PUT", { path: OFF_CANVAS_PATH, body: JSON.stringify({ layers }) }));
      savingOffCanvas = next.catch(() => {});
      return next.then(async (response) => (response.status === 200 ? ((await response.json()) as OffCanvasSaveAnswer).snippets : {}));
    },
  };
}
