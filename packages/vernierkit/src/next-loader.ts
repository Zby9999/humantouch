import { markSource } from "./source-marker";

interface LoaderContext {
  resourcePath: string;
  resourceQuery?: string;
  getOptions?: () => { root?: string };
  query?: { root?: string } | string;
  callback(error: Error | null, code?: string, map?: unknown): void;
}

/** Spike: webpack-style loader so Turbopack can run the source marker transform. */
export default function vernierLoader(this: LoaderContext, source: string) {
  const options = this.getOptions?.() ?? (typeof this.query === "object" ? this.query : {});
  const root = options.root ?? process.cwd();
  const result = markSource(source, { id: this.resourcePath + (this.resourceQuery ?? ""), root });
  if (!result) return source;
  this.callback(null, result.code, result.map);
}
