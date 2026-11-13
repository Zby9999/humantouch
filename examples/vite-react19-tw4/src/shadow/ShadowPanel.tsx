import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Its own styles, in its shadow root: the page's CSS does not reach in. */
const STYLES = `
.panel { padding: 16px; border-radius: 16px; background: #fde68a; }
.title { margin: 0; font: 700 24px/32px sans-serif; color: #1c1917; }
.body { margin: 8px 0 0; font: 16px/24px sans-serif; color: #57534e; }
`;

/**
 * A panel rendered into an open shadow root of its own, its styles a style
 * element there, as the website's hero is (ticket 137): for the bench's
 * scenario of a style change inside a shadow root, on the page `/shadow`.
 */
export function ShadowPanel() {
  const host = useRef<HTMLElement>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  useLayoutEffect(() => {
    const el = host.current!;
    setShadow(el.shadowRoot ?? el.attachShadow({ mode: "open" }));
  }, []);

  return (
    <section ref={host} data-testid="shadow-panel" className="mx-auto max-w-4xl px-6 pt-6">
      {shadow &&
        createPortal(
          <>
            <style>{STYLES}</style>
            <div className="panel">
              <h2 className="title">In a shadow root</h2>
              <p className="body">Styled by its own styles, which the page's CSS does not reach.</p>
            </div>
          </>,
          shadow,
        )}
    </section>
  );
}
