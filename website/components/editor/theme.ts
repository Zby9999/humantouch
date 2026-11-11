/**
 * Keeps a shadow host's `data-theme` the page's (the footer's Light or Dark, none for the system's), so the product's
 * styles inside it take the theme the site shows (scripts/editor-css.mjs). Returns the stop.
 */
export function followSiteTheme(host: HTMLElement) {
  const root = document.documentElement;
  const sync = () => {
    const theme = root.dataset.theme;
    if (theme) host.dataset.theme = theme;
    else delete host.dataset.theme;
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
