/**
 * Breakpoints (ADR 0008): the width range each view stands for. The desktop
 * view stands for none in particular: its edits apply at every width. The
 * project's own breakpoints (its Tailwind theme, or the media queries of its
 * stylesheets) cut the widths into ranges, as Framer's breakpoints do: the
 * desktop view's range and those above are the desktop view's, and a view in
 * them is the desktop view. Every other view stands for the range its width
 * is in, shared with any other view there, and those above with no view in
 * them, up to the next wider view's range; the narrowest view reaches down to
 * no width at all. So the ranges follow the views there are and the desktop
 * view's width, and no width between the views has the desktop view's edits
 * alone. With no breakpoints of the project's to go by, a view stands for the
 * widths from its own up to the next wider view's, the narrowest from none at
 * all. An edit made in it applies in that range only, as a media query does,
 * so every view, and the page played at any width, shows it where it belongs.
 * Edits recorded keep the range they were made at (ADR 0008).
 */

/** A range of widths, px: from `min` up to, but not including, `max`; null: no bound on that side. */
export interface Breakpoint {
  min: number | null;
  max: number | null;
  /**
   * How the project writes these widths, when its own breakpoints are their
   * edges: Tailwind's variants (`md:max-lg:`), or the media query of its
   * stylesheets at each edge, the lower first.
   */
  project?: { tailwind: string } | { queries: string[] };
}

/** One of the project's own breakpoints: the width a range starts at, and how the project names it. */
export interface ProjectBreakpoint {
  /** px. */
  width: number;
  /** Tailwind: the screen's name, `md`. CSS: the media query it was read from, `(min-width: 768px)`. */
  name: string;
}

/** The project's own breakpoints, narrowest first, one per width. */
export interface ProjectBreakpoints {
  /** `tailwind`: its Tailwind theme. `css`: the media queries of the page's stylesheets. */
  from: "tailwind" | "css";
  list: ProjectBreakpoint[];
}

/**
 * The breakpoint of a view `width` px wide, beside the desktop view and the
 * other views, all by width, and the project's own breakpoints. Null: the
 * desktop view's, every width; so is a view as wide as it or wider, or, with
 * the project's breakpoints, one in its range of them. Any other view takes
 * the range of the project's breakpoints its width is in, shared with any
 * other view there, and those above it with no view in them, up to the next
 * wider view's range or the desktop view's; the narrowest view reaches down
 * to no width at all.
 */
export function breakpointOf(width: number, desktop: number, others: number[], project: ProjectBreakpoints | null = null): Breakpoint | null {
  if (width === desktop) return null;
  if (project?.list.length) {
    /** The width the range of the project's breakpoints that `w` is in starts at; 0 for the first. */
    const startOf = (w: number) => project.list.filter((point) => point.width <= w).at(-1)?.width ?? 0;
    const top = startOf(desktop);
    if (width >= desktop || startOf(width) === top) return null;
    const starts = [...new Set([...others, width].filter((w) => w < desktop).map(startOf))].filter((start) => start !== top).sort((a, b) => a - b);
    const i = starts.indexOf(startOf(width));
    const range = { min: i === 0 ? null : starts[i], max: starts[i + 1] ?? top };
    return { ...range, ...writtenWith(range, project) };
  }
  const all = [...new Set([desktop, ...others, width])].sort((a, b) => a - b);
  const i = all.indexOf(width);
  return { min: i === 0 ? null : width, max: all[i + 1] ?? null };
}

/**
 * How the project writes the range, as `Breakpoint.project`: when each edge
 * it has is one of the project's own breakpoints. Nothing otherwise.
 */
export function writtenWith({ min, max }: Breakpoint, project: ProjectBreakpoints | null): Pick<Breakpoint, "project"> {
  const at = (width: number | null) => (width === null ? null : project?.list.find((point) => point.width === width));
  const [below, above] = [at(min), at(max)];
  if (!project || below === undefined || above === undefined || (!below && !above)) return {};
  if (project.from === "tailwind") return { project: { tailwind: `${below ? `${below.name}:` : ""}${above ? `max-${above.name}:` : ""}` } };
  return { project: { queries: [below, above].filter((point) => !!point).map((point) => point.name) } };
}

/** Tailwind's variants for the range, as the project writes it (`md:max-lg:`); null when it is not written with Tailwind's. */
export function tailwindOf(breakpoint: Breakpoint | null | undefined): string | null {
  const project = breakpoint?.project;
  return project && "tailwind" in project ? project.tailwind : null;
}

/** Whether `width` is in the range; null is every width. */
export function contains(breakpoint: Breakpoint | null | undefined, width: number): boolean {
  if (!breakpoint) return true;
  return (breakpoint.min === null || width >= breakpoint.min) && (breakpoint.max === null || width < breakpoint.max);
}

/**
 * The range a new edit at `breakpoint` takes, beside `taken`, the ranges the
 * property has of its own already, none of which holds at `width`, the width
 * the edit is made at: as much of `breakpoint` as no other range reaches
 * into, around `width`. Cut short, it is no longer written as the project
 * writes its breakpoints.
 */
export function clearOf(breakpoint: Breakpoint, width: number, taken: Breakpoint[]): Breakpoint {
  let { min, max } = breakpoint;
  for (const other of taken) {
    if (other.max !== null && other.max <= width && (min === null || other.max > min)) min = other.max;
    if (other.min !== null && other.min > width && (max === null || other.min < max)) max = other.min;
  }
  if (min === breakpoint.min && max === breakpoint.max) return breakpoint;
  return { min, max };
}

/** Whether every width of `inner` is in `outer`; null is every width. */
export function within(inner: Breakpoint | null, outer: Breakpoint | null): boolean {
  if (!outer) return true;
  const [min, max] = [inner?.min ?? null, inner?.max ?? null];
  return (outer.min === null || (min !== null && min >= outer.min)) && (outer.max === null || (max !== null && max <= outer.max));
}

/** What is left of `range` with the widths of `cut` taken out: none, one range or two, the lower first. */
export function outside(range: Breakpoint, cut: Breakpoint): Breakpoint[] {
  const left: Breakpoint[] = [];
  if (cut.min !== null && (range.min === null || range.min < cut.min)) left.push({ min: range.min, max: range.max === null ? cut.min : Math.min(range.max, cut.min) });
  if (cut.max !== null && (range.max === null || range.max > cut.max)) left.push({ min: range.min === null ? cut.max : Math.max(range.min, cut.max), max: range.max });
  return left.filter(({ min, max }) => min === null || max === null || min < max);
}

/** A width to see the range at, as a window that wide: its lower edge, or just under its upper one. */
export function widthIn({ min, max }: Breakpoint): number {
  return min ?? Math.max(0, (max ?? 0) - 1);
}

/** Whether two breakpoints are the same range; null is every width. */
export function sameBreakpoint(a: Breakpoint | null | undefined, b: Breakpoint | null | undefined): boolean {
  return breakpointKey(a) === breakpointKey(b);
}

/** What tells breakpoints apart, as text: `@-768`, `@768-1280`; empty for null, every width. */
export function breakpointKey(breakpoint: Breakpoint | null | undefined): string {
  return breakpoint ? `@${breakpoint.min ?? ""}-${breakpoint.max ?? ""}` : "";
}

/** The media condition that holds in the range, in range syntax: `(width < 768px)`, `(768px <= width < 1280px)`. */
export function mediaOf({ min, max }: Breakpoint): string {
  if (min === null) return `(width < ${max}px)`;
  if (max === null) return `(width >= ${min}px)`;
  return `(${min}px <= width < ${max}px)`;
}

/** The range in words, for the designer and the Agent: "below 768px", "768px to 1279px", "1440px and wider"; "all breakpoints" for null. */
export function breakpointName(breakpoint: Breakpoint | null | undefined): string {
  if (!breakpoint) return "all breakpoints";
  const { min, max } = breakpoint;
  if (min === null) return `below ${max}px`;
  if (max === null) return `${min}px and wider`;
  return `${min}px to ${max - 1}px`;
}

/** Narrower ranges after wider ones: where two overlap, the narrower one, more particular, wins. */
export function widestFirst(a: Breakpoint, b: Breakpoint): number {
  const span = ({ min, max }: Breakpoint) => (max ?? Infinity) - (min ?? 0);
  return span(b) - span(a) || (a.min ?? 0) - (b.min ?? 0);
}

/** A length in a media query or a theme, in px: px as they are, em and rem at 16px. */
export function lengthInPx(length: string): number | null {
  const match = /^\s*(-?(?:\d+\.?\d*|\.\d+))(px|r?em)\s*$/i.exec(length);
  if (!match) return null;
  const n = Number(match[1]);
  return match[2].toLowerCase() === "px" ? n : n * 16;
}

/**
 * The breakpoints of the media queries in `doc`'s stylesheets: each width a
 * query on the width starts or stops holding at, named by the first query
 * there. A `max-width` holds up to its width, inclusive: the range after it
 * starts at the next whole px. None when the page has none.
 */
export function readMediaBreakpoints(doc: Document): ProjectBreakpoints | null {
  const found = new Map<number, string>();
  // Told apart by what they have, not by class: the document may be another window's.
  const read = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if ("styleSheet" in rule) {
        const sheet = (rule as CSSImportRule).styleSheet;
        if (sheet && isProjects(sheet)) readSheet(sheet);
        continue;
      }
      if ("media" in rule && "cssRules" in rule) {
        for (const query of (rule as CSSMediaRule).media.mediaText.split(",")) for (const [width, name] of edgesOf(query)) if (!found.has(width)) found.set(width, name);
      }
      if ("cssRules" in rule) read((rule as CSSGroupingRule).cssRules);
    }
  };
  const readSheet = (sheet: CSSStyleSheet) => {
    try {
      read(sheet.cssRules);
    } catch {} // Another origin's: it cannot be read.
  };
  for (const sheet of doc.styleSheets) if (isProjects(sheet)) readSheet(sheet);
  const list = [...found].filter(([width]) => width > 0).sort(([a], [b]) => a - b).map(([width, name]) => ({ width, name }));
  return list.length ? { from: "css", list } : null;
}

/** Where a file of a dependency's is: in `node_modules`, however deep. */
const DEPENDENCY = /[\\/]node_modules[\\/]/;

/**
 * Whether a stylesheet's media queries are the project's breakpoints, as far
 * as its source tells: not a dependency's (loaded from `node_modules`, or so
 * named by Vite's dev server), nor one of the editor's own (marked
 * `data-vk-*`). One whose source cannot be told (a bundle, a plain `<style>`) is the project's.
 */
function isProjects(sheet: CSSStyleSheet): boolean {
  const owner = sheet.ownerNode as Element | null;
  // Told apart by what they have, not by class: the document may be another window's.
  const attributes = owner && "getAttributeNames" in owner ? owner.getAttributeNames() : [];
  const from = [sheet.href, owner && "getAttribute" in owner ? owner.getAttribute("data-vite-dev-id") : null];
  return !from.some((path) => !!path && DEPENDENCY.test(path)) && !attributes.some((name) => name.startsWith("data-vk-"));
}

/** The widths a media query on the width starts or stops holding at, each with the feature it is said by. */
function edgesOf(query: string): [number, string][] {
  const edges: [number, string][] = [];
  for (const [feature, inside] of query.matchAll(/\(([^()]*)\)/g)) {
    const plain = /^\s*(min-width|max-width)\s*:\s*([^]+?)\s*$/i.exec(inside);
    if (plain) {
      const px = lengthInPx(plain[2]);
      if (px !== null) edges.push([plain[1].toLowerCase() === "min-width" ? Math.ceil(px) : Math.floor(px) + 1, feature]);
      continue;
    }
    // Range syntax: `width >= 768px`, `768px <= width`, `640px < width <= 1024px`.
    const parts = inside.split(/(<=|>=|<|>)/).map((part) => part.trim());
    const at = parts.indexOf("width");
    if (at < 0) continue;
    for (const side of [-1, 1]) {
      const [op, length] = [parts[at + side], parts[at + 2 * side]];
      const px = op && length ? lengthInPx(length) : null;
      if (px === null) continue;
      // As if the width came first: `768px <= width` is `width >= 768px`.
      const facing = side === 1 ? op : ({ "<": ">", ">": "<", "<=": ">=", ">=": "<=" } as Record<string, string>)[op];
      const edge = facing === ">=" ? Math.ceil(px) : facing === ">" ? Math.floor(px) + 1 : facing === "<" ? Math.ceil(px) : Math.floor(px) + 1;
      edges.push([edge, feature]);
    }
  }
  return edges;
}
