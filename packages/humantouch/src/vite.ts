import type { Plugin } from "vite";
import { CODE_EVENT, CODE_GLOBAL, SERVICE_GLOBAL, type ServiceConfig } from "./service-protocol";
import { startService, type Service } from "./service";
import { markSource } from "./source-marker";
import { updatesInTurn, viteVersionFor } from "./vite-version";

/**
 * Keeps on the page when the dev server last brought code in, and whether it
 * is bringing some in now, as `CodeUpdates`: from Vite's own HMR events. The
 * page's code is as new as it loaded, until an update. `inTurn`, whether
 * the Vite serving it handles its updates one at a time, goes with them,
 * read from its version here on the server (ticket 125).
 */
const CODE_MODULE = "virtual:03kind/code-updates";
const RESOLVED_CODE_MODULE = `\0${CODE_MODULE}`;
const codeUpdates = (inTurn: boolean) => `const code = (window.${CODE_GLOBAL} = { at: Date.now(), updating: 0, inTurn: ${inTurn} });
const changed = () => dispatchEvent(new Event(${JSON.stringify(CODE_EVENT)}));
if (import.meta.hot) {
  import.meta.hot.on("vite:beforeUpdate", () => { code.updating++; changed(); });
  import.meta.hot.on("vite:afterUpdate", ({ updates }) => {
    code.updating = Math.max(0, code.updating - 1);
    for (const { timestamp } of updates) code.at = Math.max(code.at, timestamp);
    changed();
  });
  import.meta.hot.on("vite:error", () => { code.updating = 0; changed(); });
}`;

/**
 * Human Touch for Vite. Development only: adds source markers so layers can be
 * traced back to code, and runs the local service that keeps the round in
 * `.humantouch/`. Production builds are left untouched.
 */
export default function humanTouch(): Plugin {
  let root = process.cwd();
  let base = "/";
  let service: Promise<Service> | undefined;
  let inTurn = false;

  return {
    name: "humantouch",
    apply: "serve",
    enforce: "pre",
    config() {
      // Served as published: pre-bundled, the toggle would come again unminified, with a source map inlined in it,
      // more than the page is to load with it (docs/goals.md). The rest of the editor layer still loads only as needed.
      return { optimizeDeps: { exclude: ["humantouch"] } };
    },
    async configResolved(config) {
      root = config.root;
      base = config.base;
      // The Vite serving the page, not the one humantouch resolves: on Vite 7 on, it says; before, as the project resolves it.
      const told = (this as { meta?: { viteVersion?: string } } | undefined)?.meta?.viteVersion;
      inTurn = updatesInTurn(await viteVersionFor(root, told));
    },
    configureServer(server) {
      service = startService({ root });
      server.httpServer?.once("close", () => void service?.then((s) => s.close()));
      // The project's files changing, but the editor layer's own saves: a round the page claims goes back to the code as it rested before (ticket 78).
      server.watcher.on("all", (_event, file) => {
        if (!/[\\/]\.humantouch[\\/]/.test(file)) void service?.then((s) => s.codeChanged());
      });
    },
    async transformIndexHtml() {
      if (!service) return;
      const { url, token } = await service;
      const config: ServiceConfig = { url, token };
      return [
        // Before any module runs, so the editor layer finds it when it mounts.
        { tag: "script", children: `window.${SERVICE_GLOBAL} = ${JSON.stringify(config)};`, injectTo: "head-prepend" },
        // How the code the page has stands, for the check to wait for an edit to reach it (ADR 0013).
        // A module of its own, as Vite serves one by its id: an inline one gets no `import.meta.hot`, nor do tags added here have their imports resolved.
        { tag: "script", attrs: { type: "module", src: `${base}@id/__x00__${CODE_MODULE}` }, injectTo: "head-prepend" },
      ];
    },
    resolveId(id) {
      return id === CODE_MODULE ? RESOLVED_CODE_MODULE : undefined;
    },
    load(id) {
      return id === RESOLVED_CODE_MODULE ? codeUpdates(inTurn) : undefined;
    },
    transform(code, id) {
      return markSource(code, { id, root });
    },
  };
}
