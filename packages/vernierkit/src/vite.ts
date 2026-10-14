import type { Plugin } from "vite";
import { markSource } from "./source-marker";

/**
 * Vernier Kit for Vite. Development only: adds source markers so layers can be
 * traced back to code. Production builds are left untouched.
 */
export default function vernier(): Plugin {
  let root = process.cwd();

  return {
    name: "vernierkit",
    apply: "serve",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      return markSource(code, { id, root });
    },
  };
}
