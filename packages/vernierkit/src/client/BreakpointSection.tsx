/** @jsxImportSource preact */
import { propertyTitle } from "../design-values";
import { breakpointName, tailwindOf } from "./breakpoints";
import { breakpointMarks } from "./BreakpointMark";
import type { Editor, Property } from "./edits";
import { Icon } from "./icons";
import type { Layer } from "./layers";

interface Props {
  editor: Editor;
  /** The selected layers. */
  layers: Layer[];
  /** What the view worked in is called: "Phone". */
  view: string;
  /** Called after a property is set back to inherit, so the panel shows the values it inherits. */
  onEdit(): void;
}

/**
 * At the top of the Design panel, in a view other than the desktop view: the
 * breakpoint edits there apply at (ADR 0008), and the properties of the
 * selected layers changed there on their own, each of which can be set back
 * to inherit what the layer shows at every width. The rows of those
 * properties are marked and reset too (`BreakpointMark`), from the same
 * changes; the list also holds those whose row the panel does not show, as
 * for several layers that do not all offer the property.
 */
export function BreakpointSection({ editor, layers, view, onEdit }: Props) {
  const breakpoint = editor.breakpoint();
  const changed: Property[] = [];
  for (const layer of layers) for (const property of editor.changesHere(layer)) if (!changed.includes(property)) changed.push(property);
  // A view in the desktop view's range edits every width, as it does; only what a narrower range recorded before holds there is shown.
  if (!breakpoint && !changed.length) return null;
  const tailwind = tailwindOf(breakpoint);
  // Reset as its row resets it.
  const inherit = (property: Property) => breakpointMarks(editor, layers, onEdit).reset([property]);
  return (
    <section class="vk-section vk-breakpoint" aria-labelledby="vk-breakpoint">
      <div class="vk-section-header">
        <h3 id="vk-breakpoint" class="vk-section-title">
          {view} breakpoint
        </h3>
        <span class="vk-breakpoint-range">{breakpointName(breakpoint)}</span>
      </div>
      <p class="vk-layer-note">
        {breakpoint ? (
          <>
            Style and layout changed here apply {breakpointName(breakpoint)} only
            {tailwind && (
              <>
                {" "}
                (<code class="vk-breakpoint-code">{tailwind}</code>)
              </>
            )}
            .
          </>
        ) : (
          "This view is in the desktop view's range: style and layout changed here apply at every width, but where these were changed on their own."
        )}
      </p>
      {changed.length > 0 && (
        <ul class="vk-breakpoint-changes" aria-label={`Changed at the ${view.toLowerCase()} breakpoint`}>
          {changed.map((property) => (
            <li key={property} class="vk-breakpoint-change" data-vk-property={property}>
              <span class="vk-breakpoint-mark" aria-hidden="true" />
              <span class="vk-breakpoint-name">{propertyTitle(property)}</span>
              <button
                type="button"
                class="vk-icon-button"
                aria-label={`Reset ${propertyTitle(property)} to inherit`}
                title="Reset to inherit from every width"
                onClick={() => inherit(property)}
              >
                <Icon name="undo" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
