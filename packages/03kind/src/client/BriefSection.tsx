/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import type { Editor } from "./edit-commands";
import { Icon } from "./icons";
import { nodeOf, type Layer } from "./layers";

interface Props {
  editor: Editor;
  /** The layer selected, alone. */
  layer: Layer;
  /** Gives the layer the brief, or takes it off (""): one edit. */
  onChange(brief: string): void;
}

/**
 * At the end of the Design panel, for one layer selected: its brief, what
 * the designer wants achieved in it that the panel cannot set. Added, it is
 * typed in freely (⌘Z there is the field's own) and set once left or on
 * ⌘Enter; Esc leaves it as it was.
 * A new Frame's brief is written beside it on the canvas instead.
 */
export function BriefSection({ editor, layer, onChange }: Props) {
  if (editor.isNewFrame(layer)) return null;
  const brief = editor.brief(layer);
  // Anew when the layer or its brief changes elsewhere, as with undo.
  return <BriefField key={`${keyOf(layer)} ${brief}`} brief={brief} onChange={onChange} />;
}

const nodeKeys = new WeakMap<Node, number>();
let lastKey = 0;

/** A key of the layer's own: by its element, or the text of loose text, so no two layers share one. */
function keyOf(layer: Layer): number {
  const node = nodeOf(layer);
  if (!nodeKeys.has(node)) nodeKeys.set(node, ++lastKey);
  return nodeKeys.get(node)!;
}

/** The section's header, with the button that adds or removes the brief, and the field it is typed in. */
function BriefField({ brief, onChange }: { brief: string; onChange(brief: string): void }) {
  /** Added, and not written yet: the field shows, empty. */
  const [adding, setAdding] = useState(false);
  /** Typed since the brief was last set: what is in the field, else null. */
  const typed = useRef<string | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  /** Sets what is typed as the brief, when it differs: words around it trimmed. */
  const set = (text: string) => {
    typed.current = null;
    if (text.trim() !== brief) latest.current(text.trim());
  };
  // Gone before it was left (another layer pressed on the canvas, which re-renders the panel first): what was typed is set still, on the layer it was typed for.
  useEffect(() => () => {
    if (typed.current !== null) set(typed.current);
  }, []);
  return (
    <section class="vk-section" role="group" aria-label="Brief">
      <div class="vk-section-header">
        <h3 class="vk-section-title">Brief</h3>
        {brief ? (
          <button type="button" class="vk-icon-button" aria-label="Remove brief" onClick={() => onChange("")}>
            <Icon name="minus" />
          </button>
        ) : (
          !adding && (
            <button type="button" class="vk-icon-button" aria-label="Add brief" title="What the Design panel cannot set, for the Agent to achieve" onClick={() => setAdding(true)}>
              <Icon name="plus" />
            </button>
          )
        )}
      </div>
      {(brief || adding) && (
        <textarea
          class="vk-textarea"
          aria-label="Brief"
          placeholder="What should the Agent achieve here?"
          defaultValue={brief}
          ref={(el) => {
            if (adding && el && el.ownerDocument.activeElement !== el) el.focus();
          }}
          onInput={(event) => (typed.current = event.currentTarget.value)}
          onBlur={(event) => {
            setAdding(false);
            set(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // Left as it was: the field shows the brief again, and nothing is set.
              event.stopPropagation();
              event.currentTarget.value = brief;
              typed.current = null;
              event.currentTarget.blur();
            } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      )}
    </section>
  );
}
