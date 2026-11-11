/**
 * The page on the hero's canvas, as layers: a small made-up landing page. The three cards are instances of one Card
 * component, so a change to one is a change to all three, as in Human Touch.
 */

export type Kind = "stack" | "grid" | "frame" | "text";

export type Key = "page" | "header" | "title" | "badge" | "badgeText" | "lede" | "button" | "buttonText" | "cards" | "card" | "cardTitle" | "cardBody";

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
  props: Prop[];
  instance?: boolean;
  locked?: boolean;
  source: string;
  sizing: [string, string];
  weight?: "Regular" | "Semi Bold" | "Bold";
};

export const LAYERS: Record<Key, Layer> = {
  page: { name: "Stack", kind: "stack", props: ["fill", "gap", "padding", "direction"], source: "src/App.tsx:14:5", sizing: ["Fill", "Hug"] },
  header: { name: "Header", kind: "stack", props: ["gap", "direction"], source: "src/App.tsx:15:7", sizing: ["Hug", "Hug"] },
  title: { name: "Harbor", kind: "text", props: ["fontSize", "color"], source: "src/App.tsx:16:9", sizing: ["Hug", "Hug"], weight: "Bold" },
  badge: { name: "Badge", kind: "frame", props: ["fill", "radius"], source: "src/App.tsx:17:9", sizing: ["Hug", "Hug"] },
  badgeText: { name: "Beta", kind: "text", props: ["fontSize", "color"], source: "src/App.tsx:17:16", sizing: ["Hug", "Hug"], weight: "Semi Bold" },
  lede: { name: "Plan trips with friends, on one shared map.", kind: "text", props: ["fontSize", "color"], source: "src/App.tsx:19:7", sizing: ["Fill", "Hug"], weight: "Regular" },
  button: { name: "Button", kind: "frame", props: ["fill", "radius", "padding"], source: "src/App.tsx:22:7", sizing: ["Hug", "Hug"] },
  buttonText: { name: "Get started", kind: "text", props: ["fontSize", "color"], source: "src/App.tsx:23:9", sizing: ["Hug", "Hug"], weight: "Semi Bold" },
  cards: { name: "Grid", kind: "grid", props: ["gap"], source: "src/App.tsx:26:5", sizing: ["Fill", "Hug"] },
  card: { name: "Card", kind: "stack", props: ["fill", "radius", "padding", "gap", "direction"], instance: true, source: "src/components/Card.tsx:3:5", sizing: ["Fill", "Hug"] },
  cardTitle: { name: "Title", kind: "text", props: ["fontSize", "color"], source: "src/components/Card.tsx:4:7", sizing: ["Fill", "Hug"], weight: "Semi Bold" },
  cardBody: { name: "Body", kind: "text", props: ["fontSize", "color"], source: "src/components/Card.tsx:5:7", sizing: ["Fill", "Hug"], weight: "Regular" },
};

export const INITIAL: Record<Key, Style> = {
  page: { fill: "#FAFAFA", gap: 24, padding: [64, 64, 64, 64], direction: "column", opacity: 100 },
  header: { gap: 12, direction: "row", opacity: 100 },
  title: { fontSize: 48, color: "#171716", opacity: 100 },
  badge: { fill: "#DAECFF", radius: 9999, opacity: 100 },
  badgeText: { fontSize: 12, color: "#007DD2", opacity: 100 },
  lede: { fontSize: 18, color: "#525351", opacity: 100 },
  button: { fill: "#171716", radius: 8, padding: [12, 20, 12, 20], opacity: 100 },
  buttonText: { fontSize: 14, color: "#FFFFFF", opacity: 100 },
  cards: { gap: 16, opacity: 100 },
  card: { fill: "#FFFFFF", radius: 12, padding: [20, 20, 20, 20], gap: 8, direction: "column", opacity: 100 },
  cardTitle: { fontSize: 18, color: "#171716", opacity: 100 },
  cardBody: { fontSize: 14, color: "#737472", opacity: 100 },
};

export const CARDS = [
  { title: "Plan", body: "Pin places, add dates, share the list." },
  { title: "Vote", body: "Everyone picks what they want to see." },
  { title: "Go", body: "Offline maps and tickets in one place." },
];

/** The tree the Layers panel lists, in page order; `parent` is the row index of the layer's parent. */
export type TreeRow = { key: Key; depth: number; index?: number; parent: number | null };
export const TREE: TreeRow[] = (() => {
  const rows: TreeRow[] = [];
  const add = (key: Key, depth: number, parent: number | null, index?: number) => rows.push({ key, depth, parent, index }) - 1;
  const page = add("page", 0, null);
  const header = add("header", 1, page);
  add("title", 2, header);
  const badge = add("badge", 2, header);
  add("badgeText", 3, badge);
  add("lede", 1, page);
  const button = add("button", 1, page);
  add("buttonText", 2, button);
  const cards = add("cards", 1, page);
  CARDS.forEach((_, index) => {
    const card = add("card", 2, cards, index);
    add("cardTitle", 3, card, index);
    add("cardBody", 3, card, index);
  });
  return rows;
})();

/** The project's Variables, as Tailwind names them. */
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
export const SPACING_VARIABLES = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((n) => ({ name: String(n), value: n * 4 }));
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
];

/** Edits: made in the Desktop view they hold at every width; in the Tablet or Phone view, only at its breakpoint. */
export type Edits = Record<ViewName, Partial<Record<Key, Style>>>;

export const NO_EDITS: Edits = { Desktop: {}, Tablet: {}, Phone: {} };

export function styleIn(edits: Edits, view: ViewName, key: Key): Style {
  return { ...INITIAL[key], ...edits.Desktop[key], ...(view === "Desktop" ? {} : edits[view][key]) };
}

const same = (a: Value | undefined, b: Value | undefined) => JSON.stringify(a).toUpperCase() === JSON.stringify(b).toUpperCase();

/** The changes, one per property changed in a view, as the change list names them. */
export function listChanges(edits: Edits): { view: ViewName; key: Key; prop: Prop }[] {
  const list: { view: ViewName; key: Key; prop: Prop }[] = [];
  for (const view of Object.keys(edits) as ViewName[]) {
    for (const key of Object.keys(edits[view]) as Key[]) {
      for (const [prop, value] of Object.entries(edits[view][key] ?? {})) {
        const before = view === "Desktop" ? INITIAL[key][prop as Prop] : { ...INITIAL[key], ...edits.Desktop[key] }[prop as Prop];
        if (!same(value, before)) list.push({ view, key, prop: prop as Prop });
      }
    }
  }
  return list;
}

export function changedIn(edits: Edits, view: ViewName, key: Key, prop: Prop): boolean {
  return !same(styleIn(edits, view, key)[prop], INITIAL[key][prop]);
}

export const PROP_TITLES: Record<Prop, string> = {
  fill: "Fill",
  radius: "Corner radius",
  gap: "Gap",
  padding: "Padding",
  fontSize: "Font size",
  color: "Fill",
  opacity: "Opacity",
  direction: "Direction",
};
