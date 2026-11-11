/**
 * The marks on the editor's own style elements, in a canvas and in a frozen
 * look (`look.ts`): what tells them from the page's styles. Nothing imported,
 * so the change notes, written in Node, read a look by the same names.
 */

/** On the editor's own style elements in the canvas: the layer order, and each element's rules (`canvas-style.ts`). */
export const EDIT_STYLES_ATTR = "data-ht-edit-styles";
/** Its value on the one that puts the CSS layer of the edit styles first. */
export const EDIT_STYLES_ORDER = "order";
/** On the style elements of a frozen look. */
export const LOOK_STYLES_ATTR = "data-ht-look-styles";
/** Its value on the one that lays the look's document out around the layer. */
export const LOOK_STYLES_BASE = "base";
