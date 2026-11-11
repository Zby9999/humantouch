/**
 * What the toggle asks of the local service before the rest of the editor
 * layer has loaded: the saved round, and how it stands. Apart from the rest of
 * the service (`./service`), which the page does not load with the toggle.
 */
import { EVENTS_PATH, ROUND_PATH, SERVICE_GLOBAL, TOKEN_HEADER, type RoundStatus, type SavedRound, type ServiceConfig } from "../service-protocol";

/** How long to wait before listening again, when the service went away (the dev server restarting, say). */
const RECONNECT_MS = 1000;

export interface RoundWatch {
  /** The saved round; null when there is none. */
  load(): Promise<SavedRound | null>;
  /** Calls `onStatus` with the round's status now, and each time it changes. Returns the way to stop. */
  watch(onStatus: (status: RoundStatus) => void): () => void;
}

/** A request to the local service; it throws on any answer but a 2xx. */
export type ServiceRequest = (method: string, options?: { path?: string; body?: string; signal?: AbortSignal; keepalive?: boolean }) => Promise<Response>;

/**
 * The most a request the browser sends on as the page goes (`keepalive`) may
 * carry: 64 KiB for all of them in flight together. Over it, a body goes as an
 * ordinary request, which the page going may cut off.
 */
export const KEEPALIVE_MAX_BYTES = 64 * 1024;

/** Where the dev server said the local service is, if it did. */
export function serviceConfig(): ServiceConfig | undefined {
  return (window as unknown as Record<string, ServiceConfig | undefined>)[SERVICE_GLOBAL];
}

export function serviceRequest(config: ServiceConfig): ServiceRequest {
  return async (method, { path = ROUND_PATH, body, signal, keepalive } = {}) => {
    const headers: Record<string, string> = { [TOKEN_HEADER]: config.token };
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(`${config.url}${path}`, { method, headers, body, signal, ...(keepalive && { keepalive }) });
    if (!response.ok) throw new Error(`Human Touch: the local service answered ${response.status} to ${method} ${path}`);
    return response;
  };
}

/** The round's load and watch over `request`. */
export function roundWatch(request: ServiceRequest): RoundWatch {
  return {
    async load() {
      const response = await request("GET");
      return response.status === 204 ? null : ((await response.json()) as SavedRound);
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
  };
}

/** The round as the dev server set up the local service for this page, or null when it set up none. */
export function connectRoundWatch(): RoundWatch | null {
  const config = serviceConfig();
  return config ? roundWatch(serviceRequest(config)) : null;
}
