/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import type { SavedRound } from "../service-protocol";
import { ENTER_MARK } from "./host";
import { connectRoundWatch } from "./round-watch";
import { Toggle } from "./Toggle";

type Editor = typeof import("./editor");

/**
 * The rest of the editor layer has been asked for (null until it is), and
 * how it opens once loaded: in edit mode when that was asked for, `enter`;
 * else in preview mode, showing the saved round on the toggle.
 */
interface Wanted {
  enter?: { animate: boolean };
}

let loading: Promise<Editor> | undefined;
/** Once loaded, so it shows at once, in the same render as the press that asks for it. */
let loaded: Editor | undefined;
/** The rest of the editor layer, loaded once for the page. */
function loadEditor(): Promise<Editor> {
  loading ??= import("./editor").then(
    (editor) => (loaded = editor),
    (error: unknown) => {
      // Asked for again, it is tried again: the dev server may have been restarting.
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

/**
 * The editor layer as the page loads it: the toggle alone, so the page loads
 * little of it (docs/goals.md). The rest loads once it is needed: as edit
 * mode is first asked for, the toggle busy until the canvas is up; or at once
 * when there is a saved round, whose changes the count beside the toggle shows and
 * lists, or once a round is claimed, which locks the toggle while each change
 * is checked on the page.
 */
export function LazyEditorLayer({ onStyles }: { onStyles(css: string): void }) {
  const [roundWatch] = useState(connectRoundWatch);
  /** The saved round, once loaded, handed on so the editor layer does not load it again. */
  const [saved, setSaved] = useState<SavedRound | null | undefined>(undefined);
  const [wanted, setWanted] = useState<Wanted | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const styled = useRef(false);
  const show = (editor: Editor) => {
    if (!styled.current) onStyles(editor.styles);
    styled.current = true;
    setEditor(editor);
  };
  /**
   * Asks for the rest of the editor layer: with `enter`, to open in edit
   * mode; without, to open in preview mode, unless edit mode was asked for already.
   */
  const want = (enter?: Wanted["enter"]) => {
    setWanted((current) => (enter ? { enter } : (current ?? {})));
    if (loaded) show(loaded);
    else
      loadEditor().then(show, (error: unknown) => {
        console.error("03Kind: could not load the editor layer:", error);
        setWanted(null);
      });
  };

  useEffect(() => {
    roundWatch?.load().then(
      (round) => {
        setSaved(round);
        if (round) want();
      },
      // Nothing to show, as far as the toggle knows: the editor layer loads it again in edit mode, and says what went wrong.
      () => {},
    );
  }, []);
  // Until the editor layer is on its way: it watches the round itself from then on.
  useEffect(() => {
    if (wanted) return;
    return roundWatch?.watch((status) => {
      if (status.status === "claimed") want();
    });
  }, [wanted === null]);

  if (editor) return <editor.EditorLayer enter={wanted?.enter} saved={saved} />;
  return (
    <Toggle
      onToggle={(animate) => {
        performance.mark(ENTER_MARK);
        want({ animate });
      }}
      busy={!!wanted?.enter}
      // Loaded as the designer reaches for the toggle, it is often there by the press (see ticket 34).
      onReady={() => void loadEditor().catch(() => {})}
    />
  );
}
