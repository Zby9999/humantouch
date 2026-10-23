/**
 * The ChangeSet: every change the designer made this round, in design
 * language, for the Agent to apply. Adjusting one property of one layer again
 * and again stays a single change, from the first value to the latest.
 */
import type { StyleSource } from "./style-source";
import type { UsageLevel } from "./usage-chain";

/** The layer a change is made to, as the Agent finds it in the source. */
export interface Target {
  /** `file:line:column` of the JSX that wrote the layer. Null: not located. */
  loc: string | null;
  /** Usage chain, innermost component first. */
  chain: UsageLevel[];
  component: string | null;
  /** How many instances of the usage the change shows up in. */
  instances: number;
  locked: boolean;
  unlocated: boolean;
  /** Where the layer is on the page, for the Agent to find it by when its source is not known. */
  context: {
    /** Layer names from the page down to the layer itself. */
    path: string[];
    /** The layer's element as an opening tag, with its id and classes. */
    element: string;
  };
}

export interface Change {
  id: number;
  kind: "style";
  /** Id of the layer on the canvas (`data-vk-layer`). */
  layer: string;
  target: Target;
  /** `usage`: this usage of the component only. */
  scope: "usage";
  property: string;
  before: unknown;
  after: unknown;
  /** Reference style: the CSS that shows `after` on the canvas. */
  style: Record<string, string>;
  /** What set the value before the change, in the page's styles. */
  sources: StyleSource[];
}

export interface ChangeSet {
  /**
   * Records `property` of the layer with id `layerId` going from `before` to
   * `after`. A property changed before keeps its first `before`; one that ends
   * up where it started is no longer a change.
   */
  record(layerId: string, change: Pick<Change, "target" | "scope" | "property" | "before" | "after" | "style" | "sources">): void;
  /** Takes change `id` out: the designer no longer wants it. */
  remove(id: number): void;
  /** Whether `property` of the layer with id `layerId` is changed already. */
  has(layerId: string, property: string): boolean;
  /** The changes, oldest first. */
  list(): Change[];
  /** The ChangeSet as plain data, to save with the canvas. */
  save(): SavedChangeSet;
}

/** A ChangeSet as saved in `.vernier/changeset.json`. */
export interface SavedChangeSet {
  /** The last id handed out, so a restored ChangeSet never hands it out again. */
  lastId: number;
  changes: Change[];
}

/** A new ChangeSet, or the one `saved` was saved from. */
export function createChangeSet(saved?: SavedChangeSet): ChangeSet {
  const changes = new Map<string, Change>(saved?.changes.map((change) => [keyOf(change.layer, change.property), change]));
  let lastId = saved?.lastId ?? 0;
  return {
    record(layerId, change) {
      const key = keyOf(layerId, change.property);
      const earlier = changes.get(key);
      const before = earlier ? earlier.before : change.before;
      // Back where it started, or never left: nothing for the Agent to do.
      if (same(before, change.after)) changes.delete(key);
      else if (earlier) Object.assign(earlier, { after: change.after, style: change.style });
      else changes.set(key, { id: ++lastId, kind: "style", layer: layerId, ...change });
    },
    remove(id) {
      for (const [key, change] of changes) if (change.id === id) changes.delete(key);
    },
    has: (layerId, property) => changes.has(keyOf(layerId, property)),
    list: () => [...changes.values()],
    save: () => structuredClone({ lastId, changes: [...changes.values()] }),
  };
}

/** One change per property of a layer. */
function keyOf(layerId: string, property: string): string {
  return `${layerId} ${property}`;
}

/** Values are plain data in design language. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
