/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { ENTER_MARK } from "./CanvasView";
import { Shell } from "./Shell";
import { Toggle } from "./Toggle";

/** Preview mode shows only the toggle; edit mode adds the shell around a fresh canvas. */
export function EditorLayer() {
  const [editing, setEditing] = useState(false);

  return (
    <>
      {editing && <Shell />}
      <Toggle
        editing={editing}
        onToggle={() => {
          if (!editing) performance.mark(ENTER_MARK);
          setEditing(!editing);
        }}
      />
    </>
  );
}
