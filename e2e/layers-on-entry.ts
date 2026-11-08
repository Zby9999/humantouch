import type { BrowserContext } from "@playwright/test";

/**
 * Shows the Layers panel each time edit mode is entered, as the designer would with its button: as the editor's shell
 * is put on the page, before it is first drawn. Pressed, the button hands focus to the one hiding the panel again;
 * focus is left where it was instead, as it was when the panel was shown from the start.
 */
export async function showLayersOnEntry(context: BrowserContext) {
  await context.addInitScript(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      const root = attach.call(this, init);
      if (this.localName !== "third-kind") return root;
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            const shell = node.matches(".tk-shell") ? node : node.querySelector(".tk-shell");
            const show = shell?.querySelector<HTMLButtonElement>(":scope > .tk-show-layers");
            if (!show) continue;
            const hide = (event: Event) => {
              const target = event.target as HTMLElement;
              if (target.getAttribute("aria-label") !== "Hide layers") return;
              root.removeEventListener("focusin", hide);
              target.blur();
            };
            root.addEventListener("focusin", hide);
            setTimeout(() => root.removeEventListener("focusin", hide), 1000);
            show.click();
          }
        }
      }).observe(root, { childList: true, subtree: true });
      return root;
    };
  });
}
