import { SERVICE_ENV, type ServiceConfig } from "./service-protocol";
import { startService, type Service } from "./service";

/** The parts of Next.js's config that Vernier Kit adds to; the rest passes through as it is. */
type NextConfig = {
  env?: Record<string, string | undefined>;
  turbopack?: { rules?: Record<string, unknown> };
  webpack?: ((config: WebpackConfig, options: { dev: boolean }) => WebpackConfig) | null;
};
type WebpackConfig = { module?: { rules?: unknown[] } };
/** As Next.js takes it: the config, or a function of the phase that gives it. */
type ConfigFunction<Config> = (phase: string, context: { defaultConfig: Config }) => Config | Promise<Config>;

const DEVELOPMENT_SERVER = "phase-development-server";
const LOADER = "vernierkit/next-loader";

let service: Promise<Service> | undefined;

/**
 * Vernier Kit for Next.js: wrap the config with it. Development only: adds
 * source markers (with Turbopack or webpack) so layers can be traced back to
 * code, and runs the local service that keeps the round in `.vernier/`.
 * Production builds are left untouched.
 */
export function withVernier<Config extends object>(config: Config | ConfigFunction<Config>): (phase: string, context: { defaultConfig: Config }) => Promise<Config> {
  return async (phase, context) => {
    const given = typeof config === "function" ? await config(phase, context) : config;
    if (phase !== DEVELOPMENT_SERVER) return given;
    const resolved = given as NextConfig;

    // `next dev` runs in the project's folder.
    const root = process.cwd();
    service ??= startService({ root });
    const { url, token } = await service;
    const serviceConfig: ServiceConfig = { url, token };
    const loader = { loader: LOADER, options: { root } };
    const rule = { condition: { not: "foreign" }, loaders: [loader] };
    const rules = { ...resolved.turbopack?.rules };
    for (const glob of ["*.jsx", "*.tsx"]) rules[glob] = rules[glob] ? [rules[glob], rule].flat() : rule;
    const webpack = resolved.webpack;

    const withMarkers: NextConfig = {
      ...resolved,
      // There is no index.html to put the global in: the editor layer reads it from the bundle instead.
      env: { ...resolved.env, [SERVICE_ENV]: JSON.stringify(serviceConfig) },
      turbopack: { ...resolved.turbopack, rules },
      webpack(webpackConfig, options) {
        const result = webpack ? webpack(webpackConfig, options) : webpackConfig;
        if (options.dev) {
          result.module ??= {};
          (result.module.rules ??= []).unshift({ test: /\.[jt]sx$/, exclude: /[\\/]node_modules[\\/]/, enforce: "pre", use: [loader] });
        }
        return result;
      },
    };
    return withMarkers as Config;
  };
}
