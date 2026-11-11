/**
 * Which module defines each custom element on the page (ticket 137, ADR
 * 0017), for the editor layer to tell a third-party Web Component by. Apart
 * from `service-protocol.ts`, which the toggle loads: none of this is its.
 */

/** Global the dev server sets on the page: for each custom element defined, by its name, the call stack it was defined from, the module that defines it first. */
export const DEFINED_GLOBAL = "__HUMAN_TOUCH_DEFINED__";

/** The script, run before any of the page's, that has `customElements.define` record into `DEFINED_GLOBAL`. */
export const DEFINITIONS_SCRIPT = `(()=>{const r=window.customElements;if(!r||window.${DEFINED_GLOBAL})return;const m=new Map(),d=r.define;window.${DEFINED_GLOBAL}=m;r.define=function(n,c,o){if(!m.has(n))m.set(n,String(new Error().stack));return d.call(this,n,c,o)}})();`;
