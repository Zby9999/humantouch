/**
 * The edits `init` makes to the project's own files, and how `remove` takes
 * them back out. Each edit is kept as the lines it touched, before and after,
 * so undoing it is putting the lines back: exact, as long as nobody changed
 * those lines since.
 */
import { parse } from "@babel/parser";

/** Lines of `file` as `init` found them and as it left them. */
export interface Edit {
  /** Relative to the project root, with `/`. */
  file: string;
  before: string;
  after: string;
}

export interface Insertion {
  at: number;
  text: string;
}

/**
 * Inserts into `text`. Returns the new text, and one edit per run of lines
 * the insertions fall on. Insertions given together in a list make one edit
 * with all the lines between them, so it is undone whole (the two ends of a
 * wrapped expression, say).
 */
export function insert(file: string, text: string, insertions: (Insertion | Insertion[])[]): { text: string; edits: Edit[] } {
  const sorted = insertions.map((item) => (Array.isArray(item) ? item : [item])).sort((a, b) => a[0].at - b[0].at);
  // Insertions on the same lines make one edit, so its `after` is whole.
  const groups: Insertion[][] = [];
  for (const together of sorted) {
    const last = groups.at(-1);
    if (last && lineStart(text, together[0].at) <= lineEnd(text, last.at(-1)!.at)) last.push(...together);
    else groups.push([...together]);
  }
  let result = "";
  let from = 0;
  const edits: Edit[] = [];
  for (const group of groups) {
    const start = lineStart(text, group[0].at);
    const end = lineEnd(text, group.at(-1)!.at);
    let after = "";
    let at = start;
    for (const insertion of group) {
      after += text.slice(at, insertion.at) + insertion.text;
      at = insertion.at;
    }
    after += text.slice(at, end);
    result += text.slice(from, start) + after;
    from = end;
    edits.push({ file, before: text.slice(start, end), after });
  }
  return { text: result + text.slice(from), edits };
}

/** Puts the lines of `edit` back as they were; null when they are no longer there as `init` left them. */
export function undo(text: string, edit: Edit): string | null {
  for (let at = text.indexOf(edit.after); at !== -1; at = text.indexOf(edit.after, at + 1)) {
    const end = at + edit.after.length;
    const wholeLines = (at === 0 || text[at - 1] === "\n") && (end === text.length || text[end] === "\n" || edit.after.endsWith("\n"));
    if (wholeLines) return text.slice(0, at) + edit.before + text.slice(end);
  }
  return null;
}

function lineStart(text: string, at: number) {
  return text.lastIndexOf("\n", at - 1) + 1;
}

function lineEnd(text: string, at: number) {
  const end = text.indexOf("\n", at);
  return end === -1 ? text.length : end;
}

/** The indentation of the line `at` is on. */
function indentAt(text: string, at: number) {
  return /^[ \t]*/.exec(text.slice(lineStart(text, at)))![0];
}

type Node = { type: string; start: number; end: number; [key: string]: any };

function parseModule(code: string): Node | null {
  try {
    return parse(code, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as unknown as Node;
  } catch {
    return null;
  }
}

/**
 * An import line after the module's last import, written as that one is
 * (quotes, semicolon); first in the module when it has none.
 */
function importAfterLast(code: string, program: Node, names: string, from: string): Insertion {
  const imports = program.body.filter((node: Node) => node.type === "ImportDeclaration");
  const last: Node | undefined = imports.at(-1);
  const quote = last?.source.extra?.raw?.[0] ?? '"';
  const semicolon = !last || code[last.end - 1] === ";" ? ";" : "";
  const line = `import ${names} from ${quote}${from}${quote}${semicolon}`;
  return last ? { at: last.end, text: `\n${line}` } : { at: 0, text: `${line}\n` };
}

/** What adding 03Kind to one file came to: the new text, or why it could not be done. */
export type FileEdit = { text: string; edits: Edit[] } | { reason: string };

/**
 * Adds the Vite plugin to a Vite config: `thirdKind()` first in `plugins`, and
 * its import.
 */
export function addVitePlugin(file: string, code: string): FileEdit {
  const program = parseModule(code);
  const config = program && configObject(program);
  if (!config) return { reason: "its exported config object could not be found" };
  const plugins = config.properties.find((p: Node) => p.type === "ObjectProperty" && keyName(p.key) === "plugins");
  let insertion: Insertion;
  if (!plugins) {
    const first: Node | undefined = config.properties[0];
    if (!first) return { reason: "its config object is empty" };
    const separator = onSameLine(code, config.start, first.start) ? " " : `\n${indentAt(code, first.start)}`;
    insertion = { at: first.start, text: `plugins: [thirdKind()],${separator}` };
  } else if (plugins.value.type === "ArrayExpression") {
    const array = plugins.value;
    const first: Node | null = array.elements[0];
    if (!first) insertion = { at: array.start + 1, text: "thirdKind()" };
    else if (onSameLine(code, array.start, first.start)) insertion = { at: first.start, text: "thirdKind(), " };
    else insertion = { at: first.start, text: `thirdKind(),\n${indentAt(code, first.start)}` };
  } else {
    return { reason: "its `plugins` is not a list" };
  }
  return insert(file, code, [importAfterLast(code, program, "thirdKind", "03kind/vite"), insertion]);
}

/**
 * Wraps the config a Next.js config module exports with `withThirdKind()`, and
 * imports it (or requires it, in CommonJS).
 */
export function wrapNextConfig(file: string, code: string): FileEdit {
  const program = parseModule(code);
  if (!program) return { reason: "it could not be read" };
  const exported = program.body.find((node: Node) => node.type === "ExportDefaultDeclaration")?.declaration;
  if (exported && !/Declaration$/.test(exported.type)) {
    return insert(file, code, [importAfterLast(code, program, "{ withThirdKind }", "03kind/next"), ...wrap(exported)]);
  }
  const assigned = program.body.find(
    (node: Node) =>
      node.type === "ExpressionStatement" &&
      node.expression.type === "AssignmentExpression" &&
      node.expression.left.type === "MemberExpression" &&
      node.expression.left.object.name === "module" &&
      node.expression.left.property.name === "exports",
  )?.expression.right;
  if (!assigned) return { reason: "its exported config could not be found" };
  const requires = program.body.filter((node: Node) => node.type === "VariableDeclaration" && node.declarations[0]?.init?.callee?.name === "require");
  const last: Node | undefined = requires.at(-1);
  const line = 'const { withThirdKind } = require("03kind/next");';
  return insert(file, code, [last ? { at: last.end, text: `\n${line}` } : { at: 0, text: `${line}\n` }, ...wrap(assigned)]);
}

/** Both ends together: undone one at a time, a `)` could be put back on another line that ends the same. */
function wrap(expression: Node): Insertion[][] {
  return [
    [
      { at: expression.start, text: "withThirdKind(" },
      { at: expression.end, text: ")" },
    ],
  ];
}

/** Mounts `<ThirdKind />` at the end of the `<body>` a Next.js root layout renders. */
export function mountInLayout(file: string, code: string): FileEdit {
  const program = parseModule(code);
  let body: Node | null = null;
  if (program) {
    walk(program, (node) => {
      if (node.type === "JSXElement" && node.openingElement.name.name === "body" && node.closingElement) body ??= node;
    });
  }
  if (!program || !body) return { reason: "it renders no <body>" };
  return insert(file, code, [importAfterLast(code, program, "{ ThirdKind }", "03kind/react"), ...mountIn(code, body)]);
}

/**
 * Mounts `<ThirdKind />` in the JSX a Vite entry renders: beside the root's
 * children (`<StrictMode>`'s, say), or in a fragment with a lone root.
 */
export function mountInEntry(file: string, code: string): FileEdit {
  const program = parseModule(code);
  let tree: Node | null = null;
  if (program) {
    walk(program, (node) => {
      const isRender = node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.property.name === "render";
      const root = isRender && unwrap(node.arguments[0]);
      if (root && (root.type === "JSXElement" || root.type === "JSXFragment")) tree ??= root;
    });
  }
  if (!program || !tree) return { reason: "it renders no JSX with `render()`" };
  return insert(file, code, [importAfterLast(code, program, "{ ThirdKind }", "03kind/react"), ...mountIn(code, tree)]);
}

/** `<ThirdKind />` after the last child of `element`, or beside it in a fragment when it has none. */
function mountIn(code: string, element: Node): Insertion[] {
  if (element.type === "JSXElement" && !element.closingElement) {
    return [
      { at: element.start, text: "<>" },
      { at: element.end, text: "<ThirdKind /></>" },
    ];
  }
  const opening = element.type === "JSXElement" ? element.openingElement : element.openingFragment;
  const children = element.children.filter((child: Node) => child.type !== "JSXText" || child.value.trim());
  const last: Node | undefined = children.at(-1);
  if (!last) return [{ at: opening.end, text: "<ThirdKind />" }];
  if (onSameLine(code, opening.start, last.start)) return [{ at: last.end, text: "<ThirdKind />" }];
  return [{ at: last.end, text: `\n${indentAt(code, last.start)}<ThirdKind />` }];
}

/** The object a config module exports: `export default defineConfig({ … })`, a function returning one, or a name for one. */
function configObject(program: Node): Node | null {
  const exported = program.body.find((node: Node) => node.type === "ExportDefaultDeclaration");
  let node: Node | null | undefined = exported?.declaration;
  for (let depth = 0; depth < 8; depth++) {
    node = unwrap(node ?? undefined);
    if (!node) return null;
    switch (node.type) {
      case "ObjectExpression":
        return node;
      case "CallExpression":
        node = node.arguments[0] ?? null;
        break;
      case "ArrowFunctionExpression":
      case "FunctionExpression":
      case "FunctionDeclaration":
        node = node.body.type === "BlockStatement" ? (node.body.body.findLast((s: Node) => s.type === "ReturnStatement")?.argument ?? null) : node.body;
        break;
      case "Identifier":
        node = declared(program, node.name);
        break;
      default:
        return null;
    }
  }
  return null;
}

/** What a top-level `const name = …` is set to. */
function declared(program: Node, name: string): Node | null {
  for (const statement of program.body) {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    const declarator = declaration.declarations.find((d: Node) => d.id.type === "Identifier" && d.id.name === name);
    if (declarator) return declarator.init;
  }
  return null;
}

/** Past `as`, `satisfies` and `!`, to the expression itself. */
function unwrap(node: Node | undefined): Node | undefined {
  while (node && (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression" || node.type === "TSNonNullExpression")) node = node.expression;
  return node;
}

function keyName(key: Node): string | undefined {
  return key.type === "Identifier" ? key.name : key.type === "StringLiteral" ? key.value : undefined;
}

function onSameLine(code: string, a: number, b: number) {
  return !code.slice(a, b).includes("\n");
}

function walk(node: Node, visit: (node: Node) => void) {
  visit(node);
  for (const key in node) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "extra") continue;
    const value = node[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (typeof child === "object" && child !== null && typeof child.type === "string") walk(child, visit);
    }
  }
}
