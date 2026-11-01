import type { Plugin } from "vite";
import { CODE_EVENT, CODE_GLOBAL, SERVICE_GLOBAL, type ServiceConfig } from "./service-protocol";
import { startService, type Service } from "./service";
import { markSource } from "./source-marker";

/**
 * Keeps on the page when the dev server last brought code in, and whether it
 * is bringing some in now, as `CodeUpdates`: from Vite's own HMR events. The
 * page's code is as new as it loaded, until an update.
 */
const CODE_MODULE = "virtual:vernierkit/code-updates";
const RESOLVED_CODE_MODULE = `\0${CODE_MODULE}`;
const CODE_UPDATES = `const code = (window.${CODE_GLOBAL} = { at: Date.now(), updating: 0 });
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
 * Vernier Kit for Vite. Development only: adds source markers so layers can be
 * traced back to code, and runs the local service that keeps the round in
 * `.03kind/`. Production builds are left untouched.
 */
export default function thirdKind(): Plugin {
  let root = process.cwd();
  let base = "/";
  let service: Promise<Service> | undefined;

  return {
    name: "03kind",
    apply: "serve",
    enforce: "pre",
    config() {
      // Served as published: pre-bundled, the toggle would come again unminified, with a source map inlined in it,
      // more than the page is to load with it (docs/goals.md). The rest of the editor layer still loads only as needed.
      return { optimizeDeps: { exclude: ["03kind"] } };
    },
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    configureServer(server) {
      service = startService({ root });
      server.httpServer?.once("close", () => void service?.then((s) => s.close()));
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
      return id === RESOLVED_CODE_MODULE ? CODE_UPDATES : undefined;
    },
    transform(code, id) {
      return markSource(code, { id, root });
    },
  };
}
