/** The editor layer's side of the local service: where the round is kept between page loads. */
import { ROUND_PATH, SERVICE_GLOBAL, TOKEN_HEADER, type SavedRound, type ServiceConfig } from "../service-protocol";

export interface RoundStore {
  /** The saved round; null when there is none. */
  load(): Promise<SavedRound | null>;
  /** Saves the round; null drops it. */
  save(round: SavedRound | null): Promise<void>;
}

/** The store the dev server set up for this page, or null when it set up none. */
export function connectRoundStore(): RoundStore | null {
  const config = (window as unknown as Record<string, ServiceConfig | undefined>)[SERVICE_GLOBAL];
  if (!config) return null;
  const request = async (method: string, body?: string) => {
    const headers: Record<string, string> = { [TOKEN_HEADER]: config.token };
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(`${config.url}${ROUND_PATH}`, { method, headers, body });
    if (!response.ok) throw new Error(`Vernier Kit: the local service answered ${response.status} to ${method} ${ROUND_PATH}`);
    return response;
  };
  // Saves go one after another, so the last one made is the one that stays.
  let saving: Promise<unknown> = Promise.resolve();
  return {
    async load() {
      const response = await request("GET");
      return response.status === 204 ? null : ((await response.json()) as SavedRound);
    },
    save(round) {
      const next = saving.then(() => (round ? request("PUT", JSON.stringify(round)) : request("DELETE")));
      saving = next.catch(() => {});
      return next.then(() => {});
    },
  };
}
