/**
 * Undo and redo: the edits an editor makes, each a step, and the rules that
 * make several of them one. The steps of one adjustment (a drag on a number,
 * a color being picked) are one step; so are those of a batch, and those of a
 * run of nudges. Editors that work side by side (the canvas's, and those of
 * the layers off it) share one History, each with Steps of its own.
 */
import { LAYER_ID_ATTR } from "./canvas-style";
import { framedText, type Layer } from "./layers";
import type { Views } from "./views";

/**
 * The edits made, in order, to undo and redo, shared by editors that work
 * side by side (the canvas's, and those of the layers off it): undo goes
 * back through all of them, in the order they were made.
 */
export interface History {
  readonly past: Entry[];
  readonly future: Entry[];
}

/** A step in a history, and the own ways of the editor that made it to find its layers and show it, undone or redone. */
interface Entry {
  step: Step;
  found(ids: string[]): Layer[];
  /** Shows it in every view now, though they wait for a value changed. */
  showNow(): void;
}

export function createHistory(): History {
  return { past: [], future: [] };
}

/**
 * Makes `edits`, of several editors sharing `history` (the canvas's and those
 * of the layers off it), one step: a layer dragged from one to another, taken
 * out of one and put into the other (ticket 108). Undone, the layers the
 * first of them was made to are found again; redone, those of the last.
 */
export function together(history: History, edits: () => void): void {
  const from = history.past.length;
  edits();
  const entries = history.past.splice(from);
  if (entries.length < 2) {
    history.past.push(...entries);
    return;
  }
  const [first, last] = [entries[0], entries.at(-1)!];
  let undone = false;
  history.past.push({
    step: {
      layers: [],
      key: "together",
      undo() {
        undone = true;
        for (const entry of [...entries].reverse()) {
          entry.step.undo();
          entry.showNow();
        }
      },
      redo() {
        undone = false;
        for (const entry of entries) {
          entry.step.redo();
          entry.showNow();
        }
      },
    },
    found: () => (undone ? first.found(first.step.back ?? first.step.layers) : last.found(last.step.layers)),
    showNow: () => {},
  });
}

/**
 * Takes back what editors sharing `history` have put into it since it held
 * `from` steps, as if none of it was made: undone, the latest first, with
 * nothing to redo (a drag between them that could not be made, ticket 108).
 */
export function takeBackSince(history: History, from: number): void {
  for (const entry of history.past.splice(from).reverse()) {
    entry.step.undo();
    entry.showNow();
  }
}

/**
 * One edit, as undo and redo replay it: the layers it was made to, by id, so
 * they are found again however the layer tree changes meanwhile.
 */
export interface Step {
  layers: string[];
  /** The layers undoing it leaves, when not the same: those a Stack was made of, say. */
  back?: string[];
  /** Steps of one adjustment are one step: the same edit to the same layers, as this tells. */
  key: string;
  /** One of a run of steps that may each change something else (nudges, a resize; see `Run`): one step with those before it, undone back through each. */
  run?: boolean;
  /** Of `layers`, those whose only text it was made to: a Frame's only text, which has the Frame's id. */
  texts?: string[];
  /** Done first each time the step is redone, whichever later steps of the same adjustment are made one with it: cutting back a change it made way for. */
  first?(): void;
  undo(): void;
  redo(): void;
}

/** The runs of steps that may each change something else of the same layers: arrow keys nudging them, a handle resizing one. */
export type Run = "nudge" | "resize";

/**
 * One editor's steps, in the History it shares.
 *
 * An adjustment (a drag on a number, a run of nudges, a handle dragged) is
 * one step: its first edit does not continue (`continues` false), each later
 * one does. Its steps are made one with what the adjustment itself has put
 * into the History, and nothing else: an edit of it that changes nothing puts
 * nothing there, and the next one that does is its first step, though the
 * same edit of an adjustment before it is the latest step in the History.
 */
export interface Steps {
  /**
   * Records a step just made. `continues`: one more step of the adjustment
   * under way, made one with the step it made before when that is the latest
   * in the History and the same edit (the same key): undone back to before
   * the first, redone to after the last. A run (`run`) is undone back through
   * each of its steps. In a group, the step is one of the group's. `found`:
   * what undoing or redoing it leaves, as the layers are then; by default,
   * those of its layer ids.
   */
  push(step: Step, continues: boolean, found?: (ids: string[]) => Layer[]): void;
  /**
   * Makes the steps `edits` makes one step, undone last first; none, when
   * they make none. Not continuing (`continues` false), it begins an
   * adjustment, though it makes no step. `run`: the run such steps are of,
   * made one step with those before it of the same run, not with those of
   * another run right before it. A group in a group is one with it.
   */
  group(edits: () => void, continues: boolean, run?: Run): void;
  /**
   * Begins a new adjustment, though its first edit may change nothing and so
   * push no step: no later step of it is made one with what an earlier
   * adjustment put into the History. An edit that does not continue begins
   * one this way before it finds whether it changes anything. In a group,
   * nothing: the group began it.
   */
  begin(): void;
  /** What the canvas has now, shown in every view at once: once an edit is made, not at each step of a group. */
  show(): void;
  /**
   * Takes back the latest step in the History not yet undone, whichever
   * editor made it, shown in every view of that editor at once: though the
   * views beside wait for a value changed, as any other change to the canvas
   * (ADR 0011). Returns the layers it leaves.
   */
  undo(): Layer[];
  /** Makes again the latest step undone, shown in every view at once as `undo` is. Returns the layers it leaves. */
  redo(): Layer[];
  /**
   * Takes back what the adjustment under way has put into the History, as if
   * it was never made, as Esc cancels it: undone as `undo` does, with nothing
   * to redo. Nothing, when it has changed nothing.
   */
  takeBack(): void;
}

/**
 * Steps of an editor, going into `history`, made to the canvas `views` show:
 * an edit shows in them as `sync` has it, an undo or a redo as `catchUp`
 * does. `layersOf` finds the layers a step was made to, by id, as they are now.
 */
export function createSteps(history: History, views: Pick<Views, "sync" | "catchUp">, layersOf: (ids: string[]) => Layer[]): Steps {
  /** Steps of the group under way, if any. */
  let batching: Step[] | null = null;
  /** What the adjustment under way has put into the History, once it has: its later steps are made one with this, and with nothing else. */
  let adjusting: Entry | null = null;
  const show = () => {
    if (!batching) views.sync();
  };
  const showNow = () => views.catchUp();
  const push = (step: Step, continues: boolean, found: (ids: string[]) => Layer[] = layersOf) => {
    if (batching) {
      batching.push(step);
      return;
    }
    history.future.length = 0;
    const last = history.past.at(-1);
    // One adjustment is one step: the same edit to the same layers, made one with what this adjustment put there.
    if (continues && last && last === adjusting && last.step.key === step.key) {
      if (step.run) {
        const { undo, redo } = last.step;
        last.step.undo = () => {
          step.undo();
          undo();
        };
        last.step.redo = () => {
          redo();
          step.redo();
        };
        // Undone, the run leaves the layers as they were before it; redone, as they are after its last step.
        last.step.back ??= last.step.layers;
        last.step.layers = step.layers;
      } else {
        const { first } = last.step;
        last.step.redo = first
          ? () => {
              first();
              step.redo();
            }
          : step.redo;
      }
    } else {
      adjusting = { step, found, showNow };
      history.past.push(adjusting);
    }
    show();
  };
  const begin = () => {
    if (!batching) adjusting = null;
  };
  const group = (edits: () => void, continues: boolean, run?: Run) => {
    if (batching) return edits();
    if (!continues) begin();
    const steps: Step[] = [];
    batching = steps;
    try {
      edits();
    } finally {
      batching = null;
    }
    if (!steps.length) return;
    push(
      {
        layers: steps.flatMap((step) => step.layers),
        back: steps.flatMap((step) => step.back ?? step.layers),
        texts: steps.flatMap((step) => step.texts ?? []),
        key: run ? `${run} ${[...new Set(steps.flatMap((step) => step.layers))].sort().join(" ")}` : steps.map((step) => step.key).join(", "),
        ...(run && { run: true }),
        undo: () => [...steps].reverse().forEach((step) => step.undo()),
        redo: () => steps.forEach((step) => step.redo()),
      },
      continues,
    );
  };
  const ownSteps: Steps = {
    push,
    group,
    begin,
    show,
    undo() {
      adjusting = null;
      const entry = history.past.pop();
      if (!entry) return [];
      history.future.push(entry);
      entry.step.undo();
      entry.showNow();
      return textsIn(entry.step, entry.found(entry.step.back ?? entry.step.layers));
    },
    redo() {
      adjusting = null;
      const entry = history.future.pop();
      if (!entry) return [];
      history.past.push(entry);
      entry.step.redo();
      entry.showNow();
      return textsIn(entry.step, entry.found(entry.step.layers));
    },
    takeBack() {
      const entry = adjusting;
      adjusting = null;
      // Nothing put there, or already undone: nothing of it to take back.
      if (!entry || history.past.at(-1) !== entry) return;
      history.past.pop();
      entry.step.undo();
      entry.showNow();
    },
  };
  return ownSteps;
}

/** Those of `layers` whose text the step was made to, as that text. */
function textsIn(step: Step, layers: Layer[]): Layer[] {
  return layers.map((layer) => (step.texts?.includes(layer.el.getAttribute(LAYER_ID_ATTR)!) && framedText(layer)) || layer);
}
