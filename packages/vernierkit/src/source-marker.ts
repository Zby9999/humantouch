import { parse } from "@babel/parser";
import MagicString from "magic-string";
import path from "node:path";
import { LOC_ATTR, USAGE_ATTR } from "./markers";

export interface MarkSourceOptions {
  /** Absolute path of the module (Vite module id; a query string is allowed). */
  id: string;
  /** Project root; marker paths are written relative to it. */
  root: string;
}

/**
 * Source marker transform: inserts location markers into a JSX/TSX module.
 * Only inserts attributes, never rewrites code, so every line keeps its number.
 * Returns null when the module is not ours to mark.
 */
export function markSource(code: string, options: MarkSourceOptions) {
  const filePath = options.id.replace(/[?#].*$/, "");
  if (!/\.[jt]sx$/.test(filePath) || /[\\/]node_modules[\\/]/.test(filePath)) return null;
  const file = path.relative(options.root, filePath).split(path.sep).join("/");
  let ast;
  try {
    ast = parse(code, { sourceType: "module", plugins: ["jsx", "typescript"] });
  } catch {
    // Leave syntax errors to the framework's own transform, which reports them better.
    return null;
  }
  const s = new MagicString(code);

  walk(ast.program, (node) => {
    if (node.type !== "JSXOpeningElement") return;
    const name = node.name;
    const tag = tagName(name);
    if (tag === "Fragment" || tag.endsWith(".Fragment")) return;
    const attr = name.type !== "JSXMemberExpression" && /^[a-z]/.test(tag) ? LOC_ATTR : USAGE_ATTR;
    const marked = node.attributes.some(
      (a: Node) => a.type === "JSXAttribute" && a.name.name === attr,
    );
    if (marked) return;
    const { line, column } = node.loc!.start;
    // Last, so spread props cannot override it; after any type arguments, which follow the name.
    const after = node.attributes.at(-1) ?? node.typeArguments ?? node.typeParameters ?? name;
    s.appendLeft(after.end!, ` ${attr}="${file}:${line}:${column + 1}"`);
  });

  return { code: s.toString(), map: s.generateMap({ source: filePath, hires: true }) };
}

function tagName(name: Node): string {
  switch (name.type) {
    case "JSXIdentifier":
      return name.name;
    case "JSXMemberExpression":
      return `${tagName(name.object)}.${name.property.name}`;
    case "JSXNamespacedName":
      return `${name.namespace.name}:${name.name.name}`;
    default:
      return "";
  }
}

type Node = { type: string; [key: string]: any };

function walk(node: Node, visit: (node: Node) => void) {
  visit(node);
  for (const key in node) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) walk(child, visit);
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}
