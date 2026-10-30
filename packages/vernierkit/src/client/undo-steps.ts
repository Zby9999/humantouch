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

/** A step in a history, the editor that made it, and that editor's own ways to find its layers and show it, undone or redone. */
interface Entry {
  step: Step;
  by: Steps;
  found(ids: string[]): Layer[];
  /** Shows it in every view now, though they wait for a value changed. */
  showNow(): void;
}

export function createHistory(): History {
  return { past: [], future: [] };
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
  /** One of a run of steps that may each change something else (nudges): one step with those before it, undone back through each. */
  run?: boolean;
  /** Of `layers`, those whose only text it was made to: a Frame's only text, which has the Frame's id. */
  texts?: string[];
  /** Done first each time the step is redone, whichever later steps of the same adjustment are made one with it: cutting back a change it made way for. */
  first?(): void;
  undo(): void;
  redo(): void;
}

/** One editor's steps, in the History it shares. */
export interface Steps {
  /**
   * Records a step just made. `continues`: one more step of the adjustment
   * under way, made one with the step before it when that is the same edit
   * (the same key) by this editor: undone back to before the first, redone to
   * after the last. A run (`run`) is undone back through each of its steps.
   * In a group, the step is one of the group's. `found`: what undoing or
   * redoing it leaves, as the layers are then; by default, those of its layer ids.
   */
  push(step: Step, continues: boolean, found?: (ids: string[]) => Layer[]): void;
  /**
   * Makes the steps `edits` makes one step, undone last first. `run`: the
   * name of a run of such steps that may each change something else of the
   * same layers (nudges, a resize), made one step with those before it of the
   * same run, not with those of a run of another name right before it. A
   * group in a group is one with it.
   */
  group(edits: () => void, continues: boolean, run?: string): void;
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
  /** Takes back the latest step as if it was never made, as Esc cancels an adjustment under way: undone as `undo` does, with nothing to redo. */
  drop(): void;
}

/**
 * Steps of an editor, going into `history`, made to the canvas `views` show:
 * an edit shows in them as `sync` has it, an undo or a redo as `catchUp`
 * does. `layersOf` finds the layers a step was made to, by id, as they are now.
 */
export function createSteps(history: History, views: Pick<Views, "sync" | "catchUp">, layersOf: (ids: string[]) => Layer[]): Steps {
  /** Steps of the group under way, if any. */
  let batching: Step[] | null = null;
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
    // One adjustment is one step: the same edit to the same layers, in this editor.
    if (continues && last?.by === ownSteps && last.step.key === step.key) {
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
    } else history.past.push({ step, by: ownSteps, found, showNow });
    show();
  };
  const group = (edits: () => void, continues: boolean, run?: string) => {
    if (batching) return edits();
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
    show,
    undo() {
      const entry = history.past.pop();
      if (!entry) return [];
      history.future.push(entry);
      entry.step.undo();
      entry.showNow();
      return textsIn(entry.step, entry.found(entry.step.back ?? entry.step.layers));
    },
    redo() {
      const entry = history.future.pop();
      if (!entry) return [];
      history.past.push(entry);
      entry.step.redo();
      entry.showNow();
      return textsIn(entry.step, entry.found(entry.step.layers));
    },
    drop() {
      const entry = history.past.pop();
      if (!entry) return;
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
