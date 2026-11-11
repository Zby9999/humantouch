/**
 * The page on the hero's canvas, as layers: a small made-up landing page. The three cards are instances of one Card
 * component, so a change to one is a change to all three, as in Human Touch.
 */

export type Kind = "stack" | "stack-horizontal" | "grid" | "frame" | "text";

export type Key = "page" | "header" | "title" | "badge" | "badgeText" | "lede" | "button" | "buttonText" | "cards" | "card" | "cardTitle" | "cardBody";

export type Prop = "fill" | "radius" | "gap" | "padding" | "fontSize" | "color";

export type Style = Partial<Record<Prop, string | number>>;

export type ViewName = "Desktop" | "Tablet" | "Phone";

export const VIEWS: { name: ViewName; width: number; note?: string }[] = [
  { name: "Desktop", width: 1280 },
  { name: "Tablet", width: 768, note: "md:max-xl:" },
  { name: "Phone", width: 390, note: "max-md:" },
];

export const LAYERS: Record<Key, { name: string; kind: Kind; props: Prop[]; instance?: boolean }> = {
  page: { name: "Page", kind: "stack", props: ["fill", "gap", "padding"] },
  header: { name: "Header", kind: "stack-horizontal", props: ["gap"] },
  title: { name: "Harbor", kind: "text", props: ["fontSize", "color"] },
  badge: { name: "Badge", kind: "frame", props: ["fill", "radius"] },
  badgeText: { name: "Beta", kind: "text", props: ["fontSize", "color"] },
  lede: { name: "Plan trips with friends, on one shared map.", kind: "text", props: ["fontSize", "color"] },
  button: { name: "Button", kind: "frame", props: ["fill", "radius", "padding"] },
  buttonText: { name: "Get started", kind: "text", props: ["fontSize", "color"] },
  cards: { name: "Grid", kind: "grid", props: ["gap"] },
  card: { name: "Card", kind: "stack", props: ["fill", "radius", "padding", "gap"], instance: true },
  cardTitle: { name: "Title", kind: "text", props: ["fontSize", "color"] },
  cardBody: { name: "Body", kind: "text", props: ["fontSize", "color"] },
};

export const INITIAL: Record<Key, Style> = {
  page: { fill: "#FAFAFA", gap: 28, padding: 56 },
  header: { gap: 12 },
  title: { fontSize: 52, color: "#171716" },
  badge: { fill: "#DAECFF", radius: 999 },
  badgeText: { fontSize: 13, color: "#007DD2" },
  lede: { fontSize: 19, color: "#525351" },
  button: { fill: "#171716", radius: 10, padding: 14 },
  buttonText: { fontSize: 15, color: "#FFFFFF" },
  cards: { gap: 16 },
  card: { fill: "#FFFFFF", radius: 14, padding: 22, gap: 8 },
  cardTitle: { fontSize: 18, color: "#171716" },
  cardBody: { fontSize: 14, color: "#737472" },
};

export const CARDS = [
  { title: "Plan", body: "Pin places, add dates, share the list." },
  { title: "Vote", body: "Everyone picks what they want to see." },
  { title: "Go", body: "Offline maps and tickets in one place." },
];

/** The tree the Layers panel lists, in page order. */
export type TreeRow = { key: Key; depth: number; index?: number };
export const TREE: TreeRow[] = [
  { key: "page", depth: 0 },
  { key: "header", depth: 1 },
  { key: "title", depth: 2 },
  { key: "badge", depth: 2 },
  { key: "badgeText", depth: 3 },
  { key: "lede", depth: 1 },
  { key: "button", depth: 1 },
  { key: "buttonText", depth: 2 },
  { key: "cards", depth: 1 },
  ...CARDS.flatMap((_, index): TreeRow[] => [
    { key: "card", depth: 2, index },
    { key: "cardTitle", depth: 3, index },
    { key: "cardBody", depth: 3, index },
  ]),
];

/** The project's Variables, offered for a Fill or a text color. */
export const COLOR_VARIABLES: { name: string; value: string }[] = [
  { name: "neutral-900", value: "#171716" },
  { name: "neutral-600", value: "#525351" },
  { name: "neutral-500", value: "#737472" },
  { name: "neutral-50", value: "#FAFAFA" },
  { name: "white", value: "#FFFFFF" },
  { name: "blue-500", value: "#008FF0" },
  { name: "blue-100", value: "#DAECFF" },
  { name: "purple-600", value: "#9A3CEE" },
];

/** Edits: made in the Desktop view they hold at every width; in the Tablet or Phone view, only at its breakpoint. */
export type Edits = Record<ViewName, Partial<Record<Key, Style>>>;

export const NO_EDITS: Edits = { Desktop: {}, Tablet: {}, Phone: {} };

export function styleIn(edits: Edits, view: ViewName, key: Key): Style {
  return { ...INITIAL[key], ...edits.Desktop[key], ...(view === "Desktop" ? {} : edits[view][key]) };
}

/** The number of changes: each property changed, once per view it was changed in. */
export function countChanges(edits: Edits): number {
  let count = 0;
  for (const view of Object.keys(edits) as ViewName[]) {
    for (const key of Object.keys(edits[view]) as Key[]) {
      for (const [prop, value] of Object.entries(edits[view][key] ?? {})) {
        const before = view === "Desktop" ? INITIAL[key][prop as Prop] : { ...INITIAL[key], ...edits.Desktop[key] }[prop as Prop];
        if (String(value).toUpperCase() !== String(before).toUpperCase()) count++;
      }
    }
  }
  return count;
}
