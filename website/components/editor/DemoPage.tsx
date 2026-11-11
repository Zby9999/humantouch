"use client";

import type { CSSProperties, ReactNode } from "react";
import { CARDS, LAYERS, styleIn, type Edits, type Key, type ViewName } from "./model";

export type Selection = { key: Key; index?: number } | null;

type Props = {
  view: ViewName;
  width: number;
  zoom: number;
  edits: Edits;
  selection: Selection;
  hover: Selection;
  onSelect: (selection: Selection, view: ViewName) => void;
  onHover: (selection: Selection) => void;
};

/** The page on one view of the canvas, at the view's width, drawn as the layers' styles in that view say. */
export function DemoPage({ view, width, zoom, edits, selection, hover, onSelect, onHover }: Props) {
  const s = (key: Key) => styleIn(edits, view, key);
  const phone = width < 768;
  const page = s("page");
  const pad = phone ? Math.round(Number(page.padding) * 0.45) : width < 1024 ? Math.round(Number(page.padding) * 0.7) : Number(page.padding);

  /** One layer: its box, and the selection or hover outline drawn on it, 1px on screen at any zoom. */
  const layer = (key: Key, index: number | undefined, style: CSSProperties, children: ReactNode, as: "div" | "p" | "h1" | "h3" = "div") => {
    const selected = selection?.key === key && (selection.index === undefined || selection.index === index);
    const sibling = !selected && selection?.key === key && selection.index !== undefined && index !== undefined;
    const hovered = !selected && hover?.key === key && (hover.index === undefined || hover.index === index);
    const color = LAYERS[key].instance ? "var(--color-purple-600)" : "var(--color-blue-500)";
    const line = 1 / zoom;
    const Tag = as;
    return (
      <Tag
        key={`${key}-${index ?? ""}`}
        style={{
          ...style,
          position: "relative",
          outline: selected || hovered ? `${line}px solid ${color}` : sibling ? `${line}px dashed ${color}` : undefined,
          outlineOffset: 0,
          cursor: "default",
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect({ key, index }, view);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover({ key, index });
        }}
      >
        {children}
        {selected && <Handles size={6 / zoom} color={color} line={line} />}
      </Tag>
    );
  };

  const title = s("title");
  const badge = s("badge");
  const badgeText = s("badgeText");
  const lede = s("lede");
  const button = s("button");
  const buttonText = s("buttonText");
  const cards = s("cards");
  const card = s("card");
  const cardTitle = s("cardTitle");
  const cardBody = s("cardBody");

  return (
    <div onPointerLeave={() => onHover(null)} style={{ width, fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.35 }}>
      {layer(
        "page",
        undefined,
        { background: String(page.fill), padding: pad, display: "flex", flexDirection: "column", gap: Number(page.gap), minHeight: phone ? 0 : 640 },
        <>
          {layer(
            "header",
            undefined,
            { display: "flex", alignItems: "center", gap: Number(s("header").gap), alignSelf: "flex-start" },
            <>
              {layer("title", undefined, { margin: 0, fontSize: phone ? Number(title.fontSize) * 0.75 : Number(title.fontSize), fontWeight: 700, letterSpacing: "-0.03em", color: String(title.color), lineHeight: 1.05 }, "Harbor", "h1")}
              {layer(
                "badge",
                undefined,
                { background: String(badge.fill), borderRadius: Number(badge.radius), padding: "4px 10px" },
                layer("badgeText", undefined, { margin: 0, fontSize: Number(badgeText.fontSize), fontWeight: 600, color: String(badgeText.color) }, "Beta", "p"),
              )}
            </>,
          )}
          {layer("lede", undefined, { margin: 0, maxWidth: 520, fontSize: Number(lede.fontSize), color: String(lede.color) }, "Plan trips with friends, on one shared map.", "p")}
          {layer(
            "button",
            undefined,
            { alignSelf: "flex-start", background: String(button.fill), borderRadius: Number(button.radius), padding: `${Number(button.padding) * 0.75}px ${Number(button.padding) * 1.4}px` },
            layer("buttonText", undefined, { margin: 0, fontSize: Number(buttonText.fontSize), fontWeight: 600, color: String(buttonText.color) }, "Get started", "p"),
          )}
          {layer(
            "cards",
            undefined,
            { display: "grid", gridTemplateColumns: phone ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: Number(cards.gap), marginTop: 12 },
            CARDS.map((c, index) =>
              layer(
                "card",
                index,
                {
                  background: String(card.fill),
                  borderRadius: Number(card.radius),
                  padding: Number(card.padding),
                  display: "flex",
                  flexDirection: "column",
                  gap: Number(card.gap),
                  boxShadow: "0 0 0 1px #e5e5e4, 0 1px 3px rgb(0 0 0 / 0.06)",
                },
                <>
                  {layer("cardTitle", index, { margin: 0, fontSize: Number(cardTitle.fontSize), fontWeight: 600, color: String(cardTitle.color) }, c.title, "h3")}
                  {layer("cardBody", index, { margin: 0, fontSize: Number(cardBody.fontSize), color: String(cardBody.color) }, c.body, "p")}
                </>,
              ),
            ),
          )}
        </>,
      )}
    </div>
  );
}

/** The four white squares at a selected layer's corners. */
function Handles({ size, color, line }: { size: number; color: string; line: number }) {
  const at = [
    { left: -size / 2, top: -size / 2 },
    { right: -size / 2, top: -size / 2 },
    { left: -size / 2, bottom: -size / 2 },
    { right: -size / 2, bottom: -size / 2 },
  ];
  return (
    <>
      {at.map((pos, i) => (
        <span key={i} aria-hidden="true" style={{ position: "absolute", ...pos, width: size, height: size, background: "#fff", border: `${line}px solid ${color}`, boxSizing: "border-box", pointerEvents: "none", zIndex: 1 }} />
      ))}
    </>
  );
}
