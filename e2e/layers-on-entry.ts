import type { BrowserContext } from "@playwright/test";

/**
 * Shows the Layers panel each time edit mode is entered, as the designer would with its button: as the editor's shell
 * is put on the page, in the same task, before the canvas's camera is first worked out. Pressed any later (a
 * MutationObserver's callback, say), a page with no fonts to wait for has its canvas framed in the room the hidden panel
 * leaves, and stays so once it shows: views end up under the Design panel. Pressed, the button hands focus to the one
 * hiding the panel again; focus is left where it was instead, as it was when the panel was shown from the start.
 */
export async function showLayersOnEntry(context: BrowserContext) {
  await context.addInitScript(() => {
    const roots = new WeakSet<Node>();
    /** Each shell once: one put on the page anew is another entry. */
    const shells = new WeakSet<Element>();
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      const root = attach.call(this, init);
      if (this.localName === "third-kind") roots.add(root);
      return root;
    };
    const press = (node: Node, parent: Node) => {
      if (!(node instanceof Element) || !roots.has(parent.getRootNode())) return;
      const shell = node.matches(".tk-shell") ? node : node.querySelector(".tk-shell");
      const show = shell?.querySelector<HTMLButtonElement>(":scope > .tk-show-layers");
      if (!show || shells.has(shell!)) return;
      shells.add(shell!);
      const root = parent.getRootNode();
      const hide = (event: Event) => {
        const target = event.target as HTMLElement;
        if (target.getAttribute("aria-label") !== "Hide layers") return;
        root.removeEventListener("focusin", hide);
        target.blur();
      };
      root.addEventListener("focusin", hide);
      setTimeout(() => root.removeEventListener("focusin", hide), 1000);
      show.click();
    };
    const insertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, child: Node | null): T {
      const inserted = insertBefore.call(this, node, child) as T;
      press(node, this);
      return inserted;
    };
    const appendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(this: Node, node: T): T {
      const appended = appendChild.call(this, node) as T;
      press(node, this);
      return appended;
    };
  });
}
