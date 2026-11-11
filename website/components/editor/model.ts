/**
 * The page on the hero's canvas, as layers: Acme, a small magazine's landing page, quiet and editorial. Its three entries
 * are instances of one Entry component. In the hero it is only looked at: the Design panel takes nothing (designer,
 * 2026-11-11).
 */

export type Kind = "stack" | "grid" | "frame" | "text";

export type Key =
  | "page"
  | "nav"
  | "logo"
  | "links"
  | "hero"
  | "issue"
  | "title"
  | "lede"
  | "button"
  | "buttonText"
  | "cover"
  | "coverText"
  | "entries"
  | "entry"
  | "entryNumber"
  | "entryTitle"
  | "entryBody"
  | "quote"
  | "footer";

export type Prop = "fill" | "radius" | "gap" | "padding" | "fontSize" | "color" | "opacity" | "direction";

export type Value = string | number | number[];
export type Style = Partial<Record<Prop, Value>>;

export type ViewName = "Desktop" | "Tablet" | "Phone";

/** The views, as the editor names them, with the width each is drawn at and its range. */
export const VIEWS: { name: ViewName; width: number; range: string }[] = [
  { name: "Desktop", width: 1440, range: "≥ 1280" },
  { name: "Tablet", width: 768, range: "768–1279" },
  { name: "Phone", width: 390, range: "≤ 767" },
];

export type Layer = {
  name: string;
  kind: Kind;
  source: string;
  sizing: [string, string];
  weight?: "Regular" | "Medium" | "Semi Bold" | "Bold";
  font?: "Instrument Serif" | "Inter";
  /** An instance of a component, used where `usage` says. */
  instance?: { component: string; usage: string; count: number };
  /** In a component, so repeated in each of its instances. */
  inComponent?: { component: string; count: number };
  stroke?: { color: string; weight: number; sides: "All" | "Top" | "Bottom" };
};

export const LAYERS: Record<Key, Layer> = {
  page: { name: "Stack", kind: "stack", source: "src/App.tsx:8:5", sizing: ["Fill", "Hug"] },
  nav: { name: "Nav", kind: "stack", source: "src/App.tsx:9:7", sizing: ["Fill", "Hug"], stroke: { color: "#E4E2DC", weight: 1, sides: "Bottom" } },
  logo: { name: "Acme", kind: "text", source: "src/App.tsx:10:9", sizing: ["Hug", "Hug"], weight: "Regular", font: "Instrument Serif" },
  links: { name: "Work   Studio   Journal   Contact", kind: "text", source: "src/App.tsx:11:9", sizing: ["Hug", "Hug"], weight: "Regular", font: "Inter" },
  hero: { name: "Hero", kind: "stack", source: "src/App.tsx:14:7", sizing: ["Fill", "Hug"] },
  issue: { name: "Issue 12 — Spring 2026", kind: "text", source: "src/App.tsx:15:9", sizing: ["Hug", "Hug"], weight: "Medium", font: "Inter" },
  title: { name: "Fewer things, made with care.", kind: "text", source: "src/App.tsx:16:9", sizing: ["Fill", "Hug"], weight: "Regular", font: "Instrument Serif" },
  lede: { name: "Acme makes tools for the slow parts of work: notes, drafts and the quiet hours between.", kind: "text", source: "src/App.tsx:19:9", sizing: ["Fill", "Hug"], weight: "Regular", font: "Inter" },
  button: { name: "Button", kind: "frame", source: "src/App.tsx:22:9", sizing: ["Hug", "Hug"] },
  buttonText: { name: "Read the issue", kind: "text", source: "src/App.tsx:23:11", sizing: ["Hug", "Hug"], weight: "Medium", font: "Inter" },
  cover: { name: "Cover", kind: "frame", source: "src/App.tsx:27:7", sizing: ["Fill", "Fixed"] },
  coverText: { name: "No. 12", kind: "text", source: "src/App.tsx:28:9", sizing: ["Hug", "Hug"], weight: "Regular", font: "Instrument Serif" },
  entries: { name: "Grid", kind: "grid", source: "src/App.tsx:31:7", sizing: ["Fill", "Hug"] },
  entry: {
    name: "Entry",
    kind: "stack",
    source: "src/components/Entry.tsx:3:5",
    sizing: ["Fill", "Hug"],
    instance: { component: "Entry", usage: "src/App.tsx:33:11", count: 3 },
    stroke: { color: "#E4E2DC", weight: 1, sides: "Top" },
  },
  entryNumber: { name: "Number", kind: "text", source: "src/components/Entry.tsx:4:7", sizing: ["Hug", "Hug"], weight: "Regular", font: "Inter", inComponent: { component: "Entry", count: 3 } },
  entryTitle: { name: "Title", kind: "text", source: "src/components/Entry.tsx:5:7", sizing: ["Fill", "Hug"], weight: "Regular", font: "Instrument Serif", inComponent: { component: "Entry", count: 3 } },
  entryBody: { name: "Body", kind: "text", source: "src/components/Entry.tsx:6:7", sizing: ["Fill", "Hug"], weight: "Regular", font: "Inter", inComponent: { component: "Entry", count: 3 } },
  quote: { name: "“The best tools disappear into the work.”", kind: "text", source: "src/App.tsx:38:7", sizing: ["Fill", "Hug"], weight: "Regular", font: "Instrument Serif" },
  footer: { name: "© Acme 2026", kind: "text", source: "src/App.tsx:41:7", sizing: ["Fill", "Hug"], weight: "Regular", font: "Inter" },
};

/** The project's colors, as its Tailwind theme names them. */
export const ACME_COLORS: { name: string; value: string }[] = [
  { name: "ink", value: "#161614" },
  { name: "muted", value: "#6E6C66" },
  { name: "line", value: "#E4E2DC" },
  { name: "stone", value: "#E9E6DF" },
  { name: "paper", value: "#FAF9F6" },
  { name: "white", value: "#FFFFFF" },
];

/** Each layer's style, as the Design panel shows it, at Desktop. */
export const INITIAL: Record<Key, Style> = {
  page: { fill: "#FAF9F6", gap: 0, padding: [0, 80, 0, 80], direction: "column", opacity: 100 },
  nav: { gap: 32, padding: [28, 0, 28, 0], direction: "row", opacity: 100 },
  logo: { fontSize: 28, color: "#161614", opacity: 100 },
  links: { fontSize: 14, color: "#6E6C66", opacity: 100 },
  hero: { gap: 32, padding: [160, 0, 120, 0], direction: "column", opacity: 100 },
  issue: { fontSize: 12, color: "#6E6C66", opacity: 100 },
  title: { fontSize: 128, color: "#161614", opacity: 100 },
  lede: { fontSize: 20, color: "#6E6C66", opacity: 100 },
  button: { fill: "#161614", radius: 9999, padding: [14, 24, 14, 24], opacity: 100 },
  buttonText: { fontSize: 14, color: "#FAF9F6", opacity: 100 },
  cover: { fill: "#E9E6DF", radius: 0, padding: [32, 32, 32, 32], opacity: 100 },
  coverText: { fontSize: 48, color: "#161614", opacity: 100 },
  entries: { gap: 48, padding: [120, 0, 120, 0], opacity: 100 },
  entry: { gap: 16, padding: [24, 0, 0, 0], direction: "column", opacity: 100, radius: 0 },
  entryNumber: { fontSize: 12, color: "#6E6C66", opacity: 100 },
  entryTitle: { fontSize: 36, color: "#161614", opacity: 100 },
  entryBody: { fontSize: 16, color: "#6E6C66", opacity: 100 },
  quote: { fontSize: 64, color: "#161614", opacity: 100 },
  footer: { fontSize: 13, color: "#6E6C66", opacity: 100 },
};

/** A layer's style: the same in every view, as nothing on the site's canvas is changed. */
export const styleOf = (key: Key): Style => INITIAL[key];

export const ENTRIES = [
  { number: "01", title: "Notes", body: "A page that keeps up with your thinking, and keeps out of its way." },
  { number: "02", title: "Drafts", body: "Write long, cut hard. Every version kept, none of them in the way." },
  { number: "03", title: "Hours", body: "A calendar with room in it: the work first, the meetings around it." },
];

/** What the Layers call a layer: a text by its words, an entry's texts by their own. */
export function nameOf(key: Key, index?: number): string {
  if (index !== undefined && key === "entryNumber") return ENTRIES[index].number;
  if (index !== undefined && key === "entryTitle") return ENTRIES[index].title;
  if (index !== undefined && key === "entryBody") return ENTRIES[index].body;
  return LAYERS[key].name;
}

/** The tree the Layers panel lists, in page order; `parent` is the row index of the layer's parent. */
export type TreeRow = { key: Key; depth: number; index?: number; parent: number | null };
export const TREE: TreeRow[] = (() => {
  const rows: TreeRow[] = [];
  const add = (key: Key, depth: number, parent: number | null, index?: number) => rows.push({ key, depth, parent, index }) - 1;
  const page = add("page", 0, null);
  const nav = add("nav", 1, page);
  add("logo", 2, nav);
  add("links", 2, nav);
  const hero = add("hero", 1, page);
  add("issue", 2, hero);
  add("title", 2, hero);
  add("lede", 2, hero);
  const button = add("button", 2, hero);
  add("buttonText", 3, button);
  const cover = add("cover", 1, page);
  add("coverText", 2, cover);
  const entries = add("entries", 1, page);
  ENTRIES.forEach((_, index) => {
    const entry = add("entry", 2, entries, index);
    add("entryNumber", 3, entry, index);
    add("entryTitle", 3, entry, index);
    add("entryBody", 3, entry, index);
  });
  add("quote", 1, page);
  add("footer", 1, page);
  return rows;
})();

/** The Tailwind palette the small Variables card shows. */
export const COLOR_VARIABLES: { name: string; value: string }[] = [
  { name: "neutral-900", value: "#171716" },
  { name: "neutral-600", value: "#525351" },
  { name: "neutral-500", value: "#737472" },
  { name: "neutral-200", value: "#E5E5E4" },
  { name: "neutral-50", value: "#FAFAFA" },
  { name: "white", value: "#FFFFFF" },
  { name: "blue-500", value: "#008FF0" },
  { name: "blue-600", value: "#007DD2" },
  { name: "blue-100", value: "#DAECFF" },
  { name: "purple-600", value: "#9A3CEE" },
];
export const SPACING_VARIABLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20, 24, 30, 40].map((n) => ({ name: String(n), value: n * 4 }));
export const RADIUS_VARIABLES = [
  { name: "sm", value: 4 },
  { name: "md", value: 6 },
  { name: "lg", value: 8 },
  { name: "xl", value: 12 },
  { name: "2xl", value: 16 },
  { name: "full", value: 9999 },
];
export const TEXT_VARIABLES = [
  { name: "xs", value: 12 },
  { name: "sm", value: 14 },
  { name: "base", value: 16 },
  { name: "lg", value: 18 },
  { name: "xl", value: 20 },
  { name: "2xl", value: 24 },
  { name: "4xl", value: 36 },
  { name: "5xl", value: 48 },
  { name: "6xl", value: 60 },
  { name: "8xl", value: 96 },
  { name: "9xl", value: 128 },
];
