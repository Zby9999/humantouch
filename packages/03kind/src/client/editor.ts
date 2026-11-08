/*
 * The editor layer but for the toggle: what `LazyEditorLayer` loads once it
 * is needed. A module of its own, so the build gives it a file of its own.
 */
import { registerEditorFont } from "./editor-font";

export { EditorLayer } from "./EditorLayer";
export { styles } from "./styles";

// The editor's typeface, as the editor layer loads: the toggle shows before it, in the system's.
registerEditorFont();
