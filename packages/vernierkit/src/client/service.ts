/** The editor layer's side of the local service: where the round is kept between page loads, and how it stands. */
import {
  CHECKS_PATH,
  EVENTS_PATH,
  ROUND_PATH,
  SERVICE_GLOBAL,
  TOKEN_HEADER,
  UNLOCK_PATH,
  type CheckReport,
  type RoundStatus,
  type SavedRound,
  type ServiceConfig,
} from "../service-protocol";

/** How long to wait before listening again, when the service went away (the dev server restarting, say). */
const RECONNECT_MS = 1000;

export interface RoundStore {
  /** The saved round; null when there is none. */
  load(): Promise<SavedRound | null>;
  /** Saves the round; null drops it. */
  save(round: SavedRound | null): Promise<void>;
  /** Calls `onStatus` with the round's status now, and each time it changes. Returns the way to stop. */
  watch(onStatus: (status: RoundStatus) => void): () => void;
  /** Ends a claimed round as it is. */
  unlock(): Promise<void>;
  /** Answers the check `done` asked for. */
  report(check: CheckReport): Promise<void>;
}

/** The store the dev server set up for this page, or null when it set up none. */
export function connectRoundStore(): RoundStore | null {
  const config = (window as unknown as Record<string, ServiceConfig | undefined>)[SERVICE_GLOBAL];
  if (!config) return null;
  const request = async (method: string, { path = ROUND_PATH, body, signal }: { path?: string; body?: string; signal?: AbortSignal } = {}) => {
    const headers: Record<string, string> = { [TOKEN_HEADER]: config.token };
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(`${config.url}${path}`, { method, headers, body, signal });
    if (!response.ok) throw new Error(`Vernier Kit: the local service answered ${response.status} to ${method} ${path}`);
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
      const next = saving.then(() => (round ? request("PUT", { body: JSON.stringify(round) }) : request("DELETE")));
      saving = next.catch(() => {});
      return next.then(() => {});
    },
    watch(onStatus) {
      const stop = new AbortController();
      const listen = async () => {
        const response = await request("GET", { path: EVENTS_PATH, signal: stop.signal });
        const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += value;
          const parts = buffer.split("\n");
          buffer = parts.pop()!;
          for (const line of parts) if (line) onStatus(JSON.parse(line) as RoundStatus);
        }
      };
      const reconnect = () => {
        if (!stop.signal.aborted) setTimeout(() => void listen().then(reconnect, reconnect), RECONNECT_MS);
      };
      void listen().then(reconnect, reconnect);
      return () => stop.abort();
    },
    async unlock() {
      await request("POST", { path: UNLOCK_PATH });
    },
    async report(check) {
      await request("POST", { path: CHECKS_PATH, body: JSON.stringify(check) });
    },
  };
}
