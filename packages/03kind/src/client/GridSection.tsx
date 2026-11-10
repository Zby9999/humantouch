/** @jsxImportSource preact */
import type { ArrangeAs } from "./arrangement";
import type { Editor } from "./edit-commands";
import type { Layer } from "./layers";
import { ChangeMarksProvider, NO_MARKS, useChangeMarks } from "./ChangeMarks";
import { arrangements, NumberField, RemoveButton, SectionReset, Segmented, stepOptions, type SlotOf } from "./Properties";
import { VariableSlot } from "./VariablePicker";

interface Props {
  editor: Editor;
  /** The selected layers: the section shows when each is a Grid. */
  layers: Layer[];
  /** Called after each edit, so the panel shows the new values. */
  onEdit(): void;
  /** A gap as a field that can be a spacing Variable; undefined when the project has none. */
  variable: SlotOf;
  /** Makes the Grids Stacks (ticket 109), one that places its layers itself too, its layers then in the order they are written (its follow-up); null when they cannot be. */
  arrange: ((as: ArrangeAs) => void) | null;
  /** What dissolves the Grids, as ⌥⇧A does (ticket 110's follow-up); null when they cannot be. Asked once the section shows. */
  dissolvable(): (() => void) | null;
}

/** What the section edits. */
type GridProperty = "columns" | "rowGap" | "columnGap";

/**
 * A Grid the page has: how many columns it lays its layers out in, and the
 * space between its rows and between its columns, as the view worked in shows
 * them; each gap can be a spacing Variable. Columns are set as that many equal
 * columns. With several Grids selected, a value they do not share shows as
 * Mixed, and a change goes to each. As in Figma's auto layout, it is made a
 * horizontal or vertical Stack where the Stack section makes a Stack a Grid (ticket 109).
 */
export function GridSection({ editor, layers, onEdit, variable, arrange, dissolvable }: Props) {
  const marks = useChangeMarks();
  if (!layers.every((layer) => editor.can(layer, "columns"))) return null;
  // Made a Grid by ⇧A in this round: as the Stack section, its fields unmarked, with no resets, and its −, alone in the accent,
  // takes the Grid back out (designer, 2026-11-08).
  const added = marks.stacked();
  const dissolve = added ? null : dissolvable();
  /** The value the Grids share; null when they do not: Mixed. */
  const shown = (property: GridProperty) => {
    const [first, ...rest] = layers.map((layer) => editor.read(layer, property));
    return rest.every((value) => value === first) ? first : null;
  };
  const set = (property: GridProperty) => (value: number, continues = false) => {
    // A whole number of columns, at least one, as a drag on the field goes through any number.
    const next = property === "columns" ? Math.max(1, Math.round(value)) : Math.max(0, value);
    editor.batch(() => {
      for (const layer of layers) editor.set(layer, property, next);
    }, stepOptions(continues));
    onEdit();
  };
  return (
    <ChangeMarksProvider value={added ? NO_MARKS : marks}>
    <section class="tk-section" aria-labelledby="tk-grid">
      <div class="tk-section-header">
        <h3 id="tk-grid" class="tk-section-title">
          Grid
        </h3>
        {/* As every section's: shown for two changes or more (designer, 2026-11-08). */}
        <SectionReset title="Grid" properties={["columns", "rowGap", "columnGap", "arrangement"]} />
        {added ? (
          <RemoveButton label="Dissolve Grid" added onClick={() => marks.unstack()} />
        ) : (
          dissolve && <RemoveButton label="Dissolve Grid" title="Dissolve Grid (⌥⇧A)" onClick={dissolve} />
        )}
      </div>
      {arrange && (
        <div class="tk-row">
          <Segmented<ArrangeAs> label="Direction" property="arrangement" value="grid" options={arrangements(true)} onChange={(as) => as !== "grid" && arrange(as)} />
        </div>
      )}
      <div class="tk-grid-2">
        <NumberField label="Columns" icon="grid" property="columns" value={shown("columns")} min={1} onChange={set("columns")} />
      </div>
      <div class="tk-grid-2">
        <VariableSlot label="Row gap" slot={variable("rowGap")} property="rowGap">
          <NumberField label="Row gap" icon="row-gap" property="rowGap" value={shown("rowGap")} min={0} onChange={set("rowGap")} />
        </VariableSlot>
        <VariableSlot label="Column gap" slot={variable("columnGap")} property="columnGap">
          <NumberField label="Column gap" icon="gap" property="columnGap" value={shown("columnGap")} min={0} onChange={set("columnGap")} />
        </VariableSlot>
      </div>
    </section>
    </ChangeMarksProvider>
  );
}
