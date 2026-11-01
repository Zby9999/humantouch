import { markSource } from "./source-marker";

interface LoaderContext {
  resourcePath: string;
  resourceQuery?: string;
  getOptions(): { root?: string };
  callback(error: Error | null, code?: string, map?: unknown): void;
}

/**
 * The source marker transform as a webpack loader, which Turbopack runs too:
 * `withThirdKind()` puts it before the project's own JSX and TSX in development.
 */
export default function thirdKindLoader(this: LoaderContext, source: string) {
  const { root = process.cwd() } = this.getOptions();
  const result = markSource(source, { id: this.resourcePath + (this.resourceQuery ?? ""), root });
  if (!result) return source;
  this.callback(null, result.code, result.map);
}
