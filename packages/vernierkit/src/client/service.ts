/** The editor layer's side of the local service: where the round is kept between page loads, and how it stands. */
import type { ProjectBreakpoints } from "./breakpoints";
import {
  BREAKPOINTS_PATH,
  CHECKS_PATH,
  OFF_CANVAS_PATH,
  TOKEN_HEADER,
  UNLOCK_PATH,
  VARIABLES_PATH,
  type CheckReport,
  type SavedOffCanvasLayer,
  type OffCanvasSaveAnswer,
  type SavedRound,
  type Variable,
} from "../service-protocol";
import { roundWatch, serviceConfig, serviceRequest, type RoundWatch } from "./round-watch";

export interface RoundStore extends RoundWatch {
  /** Saves the round; null drops it. */
  save(round: SavedRound | null): Promise<void>;
  /** Ends a claimed round as it is. */
  unlock(): Promise<void>;
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
    const response = await fetch(`${config.url}${VARIABLES_PATH}`, { headers: { [TOKEN_HEADER]: config.token } });
    return response.ok ? ((await response.json()) as Variable[]) : [];
  } catch (error) {
    console.warn("Vernier Kit: could not load the project's Variables:", error);
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
    async unlock() {
      await request("POST", { path: UNLOCK_PATH });
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
