/*
 * What the editor layer puts on the live page. None of it ever goes into a canvas.
 */

/** Tag of the element that hosts the editor layer's Shadow DOM. */
export const HOST_TAG = "vernier-kit";
/** On live elements the Change Preview shows changes on: the ids of their layers. */
export const PREVIEW_ATTR = "data-vk-preview";
/** On live elements the Change Preview shows in another order: their place in it. */
export const PREVIEW_ORDER_ATTR = "data-vk-preview-order";
/** On a live plain flow the Change Preview shows in another order: laid out as a flex column, so the order holds. */
export const PREVIEW_FLOW_ATTR = "data-vk-preview-flow";
/** On a live container the Change Preview makes the positioning reference of a layer placed absolute in it. */
export const PREVIEW_REFERENCE_ATTR = "data-vk-preview-reference";
/** On the Change Preview's stylesheet. */
export const PREVIEW_STYLES_ATTR = "data-vk-preview-styles";
