import { afterEach, describe, expect, test } from "vitest";
import type { Variable } from "../src/service-protocol";
import { createChangeSet } from "../src/client/changeset";
import { variablesInCode } from "../src/client/code-variables";
import { createEditor } from "../src/client/edits";
import type { Layer } from "../src/client/layers";
import { copyStyle, pasteStyle } from "../src/client/style-copy";
import { bind, resolveVariables } from "../src/client/variables";
import { createViews } from "../src/client/views";

const APP = [{ component: "App", usage: null, thirdParty: false }];
const chain = `data-tk-chain='${JSON.stringify(APP)}'`;
let line = 4;
const at = () => `data-tk-loc="src/App.tsx:${line++}:5" ${chain}`;

/** Two colors of one value, `brand-1` listed first; the spacing scale and a spacing of its own of 16px, listed first. */
const VARIABLES: Variable[] = [
  { name: "brand-1", group: "color", value: "#2f6bff", from: "tailwind", css: "var(--color-brand-1)", own: true },
  { name: "brand-2", group: "color", value: "#2f6bff", from: "tailwind", css: "var(--color-brand-2)", own: true },
  { name: "ink", group: "color", value: "#111111", from: "tailwind", css: "var(--color-ink)", own: true },
  { name: "--line", group: "color", value: "#2f6bff", from: "css", css: "var(--line)", own: true },
  { name: "gutter", group: "spacing", value: "16px", from: "tailwind", css: "var(--spacing-gutter)", own: true },
  { name: "lg", group: "radius", value: "8px", from: "tailwind", css: "var(--radius-lg)", own: true },
  { name: "primary", group: "color", value: "#ff0000", from: "tailwind", own: true },
  ...["2", "4", "6"].map((step): Variable => ({ name: step, group: "spacing", value: `calc(4px * ${step})`, from: "tailwind", css: `calc(var(--spacing) * ${step})`, own: false })),
];

const CSS = `
  :root { --color-brand-1: #2f6bff; --color-brand-2: #2f6bff; --color-ink: #111; --line: #2f6bff; --spacing: 4px; --spacing-gutter: 16px; --radius-lg: 8px }
  .bg-brand-2 { background-color: var(--color-brand-2) }
  .bg-brand-1 { background-color: var(--color-brand-1) }
  .bg-literal { background-color: #2f6bff }
  .bg-brand-2\\/50 { background-color: color-mix(in oklab, var(--color-brand-2) 50%, transparent) }
  .bg-primary { --tw-bg-opacity: 1; background-color: rgb(255 0 0 / var(--tw-bg-opacity, 1)) }
  .p-4 { padding: calc(var(--spacing) * 4) }
  .px-6 { padding-inline: calc(var(--spacing) * 6) }
  .rounded-lg { border-radius: var(--radius-lg) }
  .card { border: 1px solid var(--line) }
  .text-ink { color: var(--color-ink) }
  @media (max-width: 500px) { .bg-brand-2 { background-color: var(--color-brand-1) } }
`;

const PAGE = `<!DOCTYPE html>
<head><style>${CSS}</style></head>
<body style="margin: 0">
  <main ${at()} style="display: flex; flex-direction: column; gap: 4px">
    <div id="brand-2" ${at()} class="bg-brand-2 p-4 rounded-lg" style="display: flex; width: 100px; height: 40px"></div>
    <div id="brand-1" ${at()} class="bg-brand-1" style="width: 100px; height: 40px"></div>
    <div id="literal" ${at()} class="bg-literal px-6 p-4" style="width: 100px; height: 40px"></div>
    <div id="half" ${at()} class="bg-brand-2/50" style="width: 100px; height: 40px"></div>
    <div id="v3" ${at()} class="bg-primary" style="width: 100px; height: 40px"></div>
    <div id="card" ${at()} class="card" style="width: 100px; height: 40px; border-left-color: #111"></div>
    <div id="line" ${at()} class="card" style="width: 100px; height: 40px"></div>
    <div id="inked" ${at()} class="text-ink" style="width: 100px"><p id="inherits" ${at()} style="margin: 0">Hi</p></div>
    <div id="plain" ${at()} style="width: 100px; height: 40px; background-color: #ffffff"></div>
  </main>
</body>`;

let frames: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const frame of frames) frame.remove();
  frames = [];
});

const frame = (width: number) => {
  const iframe = document.createElement("iframe");
  iframe.style.width = `${width}px`;
  document.body.append(iframe);
  frames.push(iframe);
  return iframe;
};

function openCanvas() {
  const iframe = frame(800);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(PAGE);
  doc.close();
  const views = createViews({ document: doc, width: 800, height: 600, windowHeight: 600, scrollY: 0 });
  const changes = createChangeSet();
  const catalog = resolveVariables(VARIABLES, doc);
  const editor = createEditor(views, changes, null, {
    bind: (...args) => bind(catalog, ...args),
    inCode: (...args) => variablesInCode(catalog, ...args),
  });
  const layer = (selector: string) => find(editor.tree().root, (l) => l.el === doc.querySelector(selector) && !l.text)!;
  return { doc, views, changes, editor, layer };
}

function find(layer: Layer, match: (layer: Layer) => boolean): Layer | undefined {
  if (match(layer)) return layer;
  for (const child of layer.children) {
    const found = find(child, match);
    if (found) return found;
  }
}

const names = (bindings: Record<string, { name: string } | null> | undefined) =>
  bindings && Object.fromEntries(Object.entries(bindings).map(([part, bound]) => [part, bound?.name ?? null]));

describe("the Variables the code uses (ticket 119)", () => {
  test("the Variable a Tailwind v4 class writes the value with, not the first of its value", () => {
    const { editor, layer, changes } = openCanvas();
    expect(names(editor.inCode(layer("#brand-2"), "fill"))).toEqual({ color: "brand-2" });
    expect(names(editor.inCode(layer("#brand-1"), "fill"))).toEqual({ color: "brand-1" });
    expect(names(editor.inCode(layer("#brand-2"), "padding"))).toEqual({ top: "4", right: "4", bottom: "4", left: "4" });
    expect(names(editor.inCode(layer("#brand-2"), "radius"))).toEqual({ "": "lg" });
    // Only read: nothing is recorded.
    expect(changes.list()).toEqual([]);
  });

  test("a value written as is, mixed with another, inherited or of no Variable is none", () => {
    const { editor, layer } = openCanvas();
    expect(editor.inCode(layer("#literal"), "fill")).toBeUndefined();
    expect(editor.inCode(layer("#half"), "fill")).toBeUndefined();
    expect(editor.inCode(layer("#plain"), "fill")).toBeUndefined();
    expect(editor.inCode(layer("#inherits"), "textColor")).toBeUndefined();
    expect(names(editor.inCode(layer("#inked"), "textColor"))).toEqual({ "": "ink" });
  });

  test("the winner among physical and logical sides: px-6 over p-4 on the left and right", () => {
    const { editor, layer } = openCanvas();
    expect(names(editor.inCode(layer("#literal"), "padding"))).toEqual({ top: "4", right: "6", bottom: "4", left: "6" });
  });

  test("a Tailwind v3 class names the Variable it writes out", () => {
    const { editor, layer } = openCanvas();
    expect(names(editor.inCode(layer("#v3"), "fill"))).toEqual({ color: "primary" });
  });

  test("a stroke is the Variable when every side is, from a shorthand's var()", () => {
    const { editor, layer } = openCanvas();
    expect(names(editor.inCode(layer("#line"), "stroke"))).toEqual({ color: "--line" });
    expect(editor.inCode(layer("#card"), "stroke")).toBeUndefined();
  });

  test("a value changed this round is the code's Variable no longer", () => {
    const { editor, layer } = openCanvas();
    editor.set(layer("#brand-2"), "fill", { type: "solid", color: "#111111", opacity: 1 });
    expect(editor.inCode(layer("#brand-2"), "fill")).toBeUndefined();
  });

  test("in a narrower view, the rule that holds at its width", async () => {
    const { editor, layer, views } = openCanvas();
    const phone = await views.add(frame(375), 375);
    editor.at(phone);
    expect(names(editor.inCode(layer("#brand-2"), "fill"))).toEqual({ color: "brand-1" });
    editor.at(null);
    expect(names(editor.inCode(layer("#brand-2"), "fill"))).toEqual({ color: "brand-2" });
  });

  test("a change names the parts left as they were by the code's Variable, over the first of their value", () => {
    const { editor, layer, changes } = openCanvas();
    const card = layer("#brand-2");
    editor.set(card, "padding", [24, 16, 16, 16]);
    expect(names(changes.list()[0].variables)).toEqual({ top: "6", right: "4", bottom: "4", left: "4" });
  });

  test("⌥⌘C carries the code's Variable, ⌥⌘V sets it; on one with that Variable, no change", () => {
    const { editor, layer, changes } = openCanvas();
    const style = copyStyle(editor, layer("#brand-2"))!;
    expect(names(style.fill!.picked)).toEqual({ color: "brand-2" });
    // The same Variable already: nothing.
    expect(pasteStyle(editor, [layer("#brand-2")], style)).toEqual([]);
    pasteStyle(editor, [layer("#plain")], style);
    const fill = changes.list().find((change) => change.property === "fill")!;
    expect(fill.variables).toEqual({ color: expect.objectContaining({ name: "brand-2", picked: true }) });
  });
});
