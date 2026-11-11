/**
 * How the install bench finds the toggle (ticket 91): on the pages of the
 * dev servers an Agent started, looked at again and again from its start.
 */
import type { Browser } from "@playwright/test";
import { TOGGLE_LABEL } from "../playwright.config.ts";
import type { Server } from "./install-servers.ts";

/** How often the bench looks for the Agent's dev servers, and at their pages. */
const LOOK_MS = 250;
/** How long the bench keeps looking for the toggle once the Agent has ended. */
const GRACE_MS = 15_000;
/** How long a page of the start's own port may take to load: long enough for a first compile (Next's webpack, on a busy machine). */
const START_PAGE_MS = 60_000;
/**
 * How long a page of another port may take (ticket 151): a server listens on
 * others too (next-server's internal port, a debugger's), which may take a
 * connection and never answer. A server the Agent moved to another port and
 * still compiling is looked at again on the next round, as long as it takes.
 */
const OTHER_PAGE_MS = 3_000;

/**
 * Looks for the toggle on the pages of the Agent's dev servers (`look` says
 * which listen now), from its start until it is found, or until the Agent
 * has ended and `GRACE_MS` more have gone by: a server it started just
 * before it ended may not listen yet. Each server seen goes into `seen`.
 * The start's own port is looked at alone while anything listens there;
 * the other ports only while nothing does, each for `OTHER_PAGE_MS`.
 */
export async function watchForToggle(browser: Browser, look: () => Promise<Server[]>, startPort: number, ended: () => number | null, seen: Map<string, Server>): Promise<{ at: number; server: Server } | null> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    for (;;) {
      const endedAt = ended();
      if (endedAt !== null && Date.now() > endedAt + GRACE_MS) return null;
      const up = await look();
      for (const server of up) seen.set(`${server.pid}:${server.port}`, server);
      const own = up.filter((server) => server.port === startPort);
      for (const server of own.length ? own : up) {
        try {
          await page.goto(server.url, { timeout: own.length ? START_PAGE_MS : OTHER_PAGE_MS });
          await page.getByRole("button", { name: TOGGLE_LABEL }).waitFor({ state: "visible", timeout: 3000 });
          return { at: Date.now(), server };
        } catch {
          // Not up yet, still compiling, or no toggle on it yet: looked at again.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, LOOK_MS));
    }
  } finally {
    await context.close().catch(() => {});
  }
}
