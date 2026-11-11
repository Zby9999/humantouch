"use client";

import type { CSSProperties, ReactNode } from "react";
import { ENTRIES, styleOf, type Key, type Style, type ViewName } from "./model";

export type Target = { key: Key; index?: number };
export type Selection = Target | null;

/** The data attribute a layer's element carries, for the editor to find it on each view and draw its selection. */
export const layerId = (t: Target) => `${t.key}${t.index === undefined ? "" : `-${t.index}`}`;

type Props = {
  view: ViewName;
  width: number;
  onPick: (path: Target[], view: ViewName) => void;
  onHover: (target: Target | null) => void;
  /** Styles in place of the model's, for a demo's changes. */
  styles?: Partial<Record<Key, Style>>;
  /** As tall as its content, its footer at its foot: not run on under an edge, as in the hero. */
  hug?: boolean;
};

const SERIF = "var(--font-instrument-serif), Georgia, serif";
const SANS = "var(--font-inter), sans-serif";
/** Tall enough to run on under the hero's bottom edge, as a page does past the canvas's; its footer is at its foot, out of sight. */
const PAGE_MIN_HEIGHT = 3400;

/**
 * Acme, on one view of the canvas, at the view's width: a quiet, editorial landing page. Its sizes step down at the
 * Tablet and Phone widths, as its breakpoints say. A pointer down reports the layers under it, outermost first, for the
 * editor to pick from as Figma does.
 */
export function DemoPage({ view, width, onPick, onHover, styles, hug = false }: Props) {
  const s = (key: Key): Style => ({ ...styleOf(key), ...styles?.[key] });
  const phone = width < 768;
  const tablet = !phone && width < 1280;
  /** A size at Desktop, Tablet and Phone. */
  const at = (desktop: number, tab: number, ph: number) => (phone ? ph : tablet ? tab : desktop);
  const side = at(80, 48, 24);

  const layer = (target: Target, path: Target[], style: CSSProperties, children: ReactNode, Tag: "div" | "p" | "h1" | "h2" | "h3" | "blockquote" | "nav" | "footer" = "div") => (
    <Tag
      key={layerId(target)}
      data-ht={layerId(target)}
      style={{ margin: 0, ...style, opacity: Number(s(target.key).opacity) / 100 }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button === 0) onPick([...path, target], view);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(target);
      }}
    >
      {children}
    </Tag>
  );

  const P: Target = { key: "page" };
  const N: Target = { key: "nav" };
  const HE: Target = { key: "hero" };
  const B: Target = { key: "button" };
  const C: Target = { key: "cover" };
  const G: Target = { key: "entries" };
  const color = (key: Key) => String(s(key).color);

  return (
    <div onPointerLeave={() => onHover(null)} style={{ width, fontFamily: SANS, color: "#161614", WebkitFontSmoothing: "antialiased" }}>
      {layer(
        P,
        [],
        { background: String(s("page").fill), padding: `0 ${side}px`, display: "flex", flexDirection: "column", minHeight: hug ? undefined : PAGE_MIN_HEIGHT },
        <>
          {layer(
            N,
            [P],
            { display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: `${at(28, 24, 20)}px 0`, borderBottom: "1px solid #E4E2DC" },
            <>
              {layer({ key: "logo" }, [P, N], { fontFamily: SERIF, fontSize: at(28, 26, 24), lineHeight: 1, letterSpacing: "-0.01em", color: color("logo") }, "Acme", "p")}
              {layer(
                { key: "links" },
                [P, N],
                { fontSize: 14, color: color("links"), display: "flex", gap: at(32, 24, 0), letterSpacing: "0.01em" },
                phone ? <span>Menu</span> : ["Work", "Studio", "Journal", "Contact"].map((l) => <span key={l}>{l}</span>),
                "p",
              )}
            </>,
            "nav",
          )}
          {layer(
            HE,
            [P],
            { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: at(32, 28, 20), padding: `${at(160, 112, 72)}px 0 ${at(120, 88, 56)}px` },
            <>
              {layer({ key: "issue" }, [P, HE], { fontSize: 12, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: color("issue") }, "Issue 12 — Spring 2026", "p")}
              {layer(
                { key: "title" },
                [P, HE],
                { fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, fontSize: at(96, 64, 44), lineHeight: 1.12, letterSpacing: "-0.02em", color: color("title"), maxWidth: at(1120, 640, 340) },
                <>
                  Fewer things,
                  <br />
                  made with care.
                </>,
                "h1",
              )}
              {layer({ key: "lede" }, [P, HE], { fontSize: styles?.lede?.fontSize === undefined ? at(20, 18, 16) : Number(styles.lede.fontSize), lineHeight: 1.5, color: color("lede"), maxWidth: at(520, 460, 340) }, "Acme makes tools for the slow parts of work: notes, drafts and the quiet hours between.", "p")}
              {layer(
                B,
                [P, HE],
                { marginTop: at(8, 4, 4), background: String(s("button").fill), borderRadius: Number(s("button").radius), padding: "14px 24px" },
                layer({ key: "buttonText" }, [P, HE, B], { fontSize: 14, fontWeight: 500, color: color("buttonText"), letterSpacing: "0.01em", lineHeight: 1.2 }, "Read the issue", "p"),
              )}
            </>,
          )}
          {layer(
            C,
            [P],
            { position: "relative", boxSizing: "border-box", height: at(560, 380, 260), background: String(s("cover").fill), borderRadius: Number(s("cover").radius), transition: "background-color 200ms cubic-bezier(0.23, 1, 0.32, 1)", padding: at(32, 28, 20), display: "flex", alignItems: "flex-end", overflow: "hidden" },
            <>
              {/* The cover's art: a ring and a rule, drawn thin. */}
              <span aria-hidden="true" style={{ position: "absolute", right: "14%", top: "50%", width: at(360, 240, 150), aspectRatio: "1", translate: "0 -50%", borderRadius: "50%", border: "1px solid rgb(22 22 20 / 0.35)" }} />
              <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "rgb(22 22 20 / 0.15)" }} />
              {layer({ key: "coverText" }, [P, C], { position: "relative", fontFamily: SERIF, fontSize: at(48, 40, 32), lineHeight: 1, color: color("coverText") }, "No. 12", "p")}
            </>,
          )}
          {layer(
            G,
            [P],
            { display: "grid", gridTemplateColumns: phone ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: at(48, 24, 40), padding: `${at(120, 88, 72)}px 0` },
            ENTRIES.map((entry, index) => {
              const E: Target = { key: "entry", index };
              return layer(
                E,
                [P, G],
                { display: "flex", flexDirection: "column", gap: at(16, 12, 12), paddingTop: 24, borderTop: "1px solid #E4E2DC" },
                <>
                  {layer({ key: "entryNumber", index }, [P, G, E], { fontSize: 12, letterSpacing: "0.08em", color: color("entryNumber"), fontVariantNumeric: "tabular-nums" }, entry.number, "p")}
                  {layer({ key: "entryTitle", index }, [P, G, E], { fontFamily: SERIF, fontWeight: 400, fontSize: at(36, 28, 30), lineHeight: 1.1, color: color("entryTitle") }, entry.title, "h3")}
                  {layer({ key: "entryBody", index }, [P, G, E], { fontSize: at(16, 14, 15), lineHeight: 1.55, color: color("entryBody") }, entry.body, "p")}
                </>,
              );
            }),
          )}
          {layer(
            { key: "quote" },
            [P],
            { fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, fontSize: at(64, 44, 34), lineHeight: 1.1, letterSpacing: "-0.015em", color: color("quote"), maxWidth: at(900, 600, 340), padding: `${at(40, 24, 8)}px 0 ${at(160, 112, 80)}px` },
            "“The best tools disappear into the work.”",
            "blockquote",
          )}
          {layer(
            { key: "footer" },
            [P],
            { display: "flex", justifyContent: "space-between", marginTop: "auto", padding: "28px 0", borderTop: "1px solid #E4E2DC", fontSize: 13, color: color("footer"), whiteSpace: "pre" },
            <>
              <span>© Acme 2026</span>
              <span>{phone ? "Newsletter" : "Newsletter  ·  Instagram  ·  Colophon"}</span>
            </>,
            "footer",
          )}
        </>,
      )}
    </div>
  );
}
