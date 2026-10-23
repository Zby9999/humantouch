import { test as base, type BrowserContext } from "@playwright/test";

export { expect } from "@playwright/test";
export type { CDPSession, Frame, Locator, Page } from "@playwright/test";

/**
 * Tests share one dev server, and so one `.vernier/` folder. Unless a test
 * opts out with `keepRoundInMemory: false`, the round it saves stays in its
 * own browser context, so tests running side by side never see each other's.
 */
export const test = base.extend<{ keepRoundInMemory: boolean }>({
  keepRoundInMemory: [true, { option: true }],
  context: async ({ context, keepRoundInMemory }, use) => {
    if (keepRoundInMemory) await keepRoundIn(context);
    await use(context);
  },
});

/** Stands in for the local service, in memory: a round that is only ever edited, never claimed. */
async function keepRoundIn(context: BrowserContext) {
  let saved: string | null = null;
  await context.route(
    (url) => url.hostname === "127.0.0.1" && ["/round", "/events", "/unlock", "/checks"].includes(url.pathname),
    (route) => {
      const request = route.request();
      const headers = {
        "Access-Control-Allow-Origin": request.headers().origin ?? "*",
        "Access-Control-Allow-Methods": "GET, PUT, DELETE, POST",
        "Access-Control-Allow-Headers": "X-Vernier-Token, Content-Type",
      };
      const { pathname } = new URL(request.url());
      if (pathname === "/events") {
        return route.fulfill({ status: 200, headers, contentType: "application/x-ndjson", body: `${JSON.stringify({ status: "editing" })}\n` });
      }
      if (pathname === "/unlock" || pathname === "/checks") return route.fulfill({ status: 409, headers });
      if (request.method() === "GET" && saved) {
        return route.fulfill({ status: 200, headers, contentType: "application/json", body: saved });
      }
      if (request.method() === "PUT") saved = request.postData();
      if (request.method() === "DELETE") saved = null;
      return route.fulfill({ status: 204, headers });
    },
  );
}
