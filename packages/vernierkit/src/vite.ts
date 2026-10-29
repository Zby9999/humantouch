import type { Plugin } from "vite";
import { SERVICE_GLOBAL, type ServiceConfig } from "./service-protocol";
import { startService, type Service } from "./service";
import { markSource } from "./source-marker";

/**
 * Vernier Kit for Vite. Development only: adds source markers so layers can be
 * traced back to code, and runs the local service that keeps the round in
 * `.vernier/`. Production builds are left untouched.
 */
export default function vernier(): Plugin {
  let root = process.cwd();
  let service: Promise<Service> | undefined;

  return {
    name: "vernierkit",
    apply: "serve",
    enforce: "pre",
    config() {
      // Served as published: pre-bundled, the toggle would come again unminified, with a source map inlined in it,
      // more than the page is to load with it (docs/goals.md). The rest of the editor layer still loads only as needed.
      return { optimizeDeps: { exclude: ["vernierkit"] } };
    },
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      service = startService({ root });
      server.httpServer?.once("close", () => void service?.then((s) => s.close()));
    },
    async transformIndexHtml() {
      if (!service) return;
      const { url, token } = await service;
      const config: ServiceConfig = { url, token };
      // Before any module runs, so the editor layer finds it when it mounts.
      return [{ tag: "script", children: `window.${SERVICE_GLOBAL} = ${JSON.stringify(config)};`, injectTo: "head-prepend" }];
    },
    transform(code, id) {
      return markSource(code, { id, root });
    },
  };
}
