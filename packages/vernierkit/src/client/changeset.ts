/**
 * The ChangeSet: every change the designer made this round, in design
 * language, for the Agent to apply. Adjusting one property of one layer again
 * and again stays a single change, from the first value to the latest.
 */
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
}

export interface Change {
  id: number;
  kind: "style";
  target: Target;
  /** `usage`: this usage of the component only. */
  scope: "usage";
  property: string;
  before: unknown;
  after: unknown;
}

export interface ChangeSet {
  /**
   * Records `property` of the layer with id `layerId` going from `before` to
   * `after`. A property changed before keeps its first `before`; one that ends
   * up where it started is no longer a change.
   */
  record(layerId: string, change: Pick<Change, "target" | "scope" | "property" | "before" | "after">): void;
  /** The changes, oldest first. */
  list(): Change[];
}

export function createChangeSet(): ChangeSet {
  const changes = new Map<string, Change>();
  let lastId = 0;
  return {
    record(layerId, change) {
      const key = `${layerId} ${change.property}`;
      const earlier = changes.get(key);
      const before = earlier ? earlier.before : change.before;
      // Back where it started, or never left: nothing for the Agent to do.
      if (same(before, change.after)) changes.delete(key);
      else if (earlier) earlier.after = change.after;
      else changes.set(key, { id: ++lastId, kind: "style", ...change });
    },
    list: () => [...changes.values()],
  };
}

/** Values are plain data in design language. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
