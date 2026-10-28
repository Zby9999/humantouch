/**
 * The JSX that writes a layer, as the source has it: kept with a layer moved
 * off the canvas (ADR 0009), for the Agent to put it back by once its code
 * may be gone.
 */
import { parse } from "@babel/parser";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

/** A piece of the source: where it starts (`file:line:column`), and its code. */
export interface Snippet {
  loc: string;
  code: string;
}

/** The JSX element that starts at `line` and `column` (from 1) of `code`, the module `file`, as written; null when none does. */
export function jsxAt(code: string, file: string, line: number, column: number): string | null {
  let ast;
  try {
    ast = parse(code, { sourceType: "module", errorRecovery: false, plugins: file.endsWith(".js") || file.endsWith(".jsx") ? ["jsx"] : ["jsx", "typescript"] });
  } catch {
    return null;
  }
  let found: Node | null = null;
  walk(ast.program as unknown as Node, (node) => {
    if (found || node.type !== "JSXElement") return;
    const start = node.loc?.start;
    if (start?.line === line && start.column + 1 === column) found = node;
  });
  const element = found as Node | null;
  return element ? code.slice(element.start!, element.end!) : null;
}

/** The JSX at `loc` (`file:line:column`, from the project's folder `root`), read from its file now; null when it cannot be read. */
export async function snippetAt(root: string, loc: string): Promise<Snippet | null> {
  const match = /^(.+):(\d+):(\d+)$/.exec(loc);
  if (!match) return null;
  const [, file, line, column] = match;
  // Only the project's own source.
  const path = resolve(root, file);
  const inside = relative(root, path);
  if (!/\.[cm]?[jt]sx?$/.test(file) || inside.startsWith("..") || isAbsolute(inside)) return null;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return null;
  }
  const code = jsxAt(text, file, Number(line), Number(column));
  return code === null ? null : { loc, code };
}

type Node = { type: string; start?: number; end?: number; loc?: { start: { line: number; column: number } }; [key: string]: unknown };

function walk(node: Node, visit: (node: Node) => void) {
  visit(node);
  for (const key in node) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) walk(child, visit);
    } else if (isNode(value)) walk(value, visit);
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}
