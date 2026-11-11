"use client";

import type { CSSProperties, ReactNode } from "react";
import { CARDS, styleOf, type Key, type ViewName } from "./model";

export type Target = { key: Key; index?: number };
export type Selection = Target | null;

/** The data attribute a layer's element carries, for the editor to find it on each view and draw its selection. */
export const layerId = (t: Target) => `${t.key}${t.index === undefined ? "" : `-${t.index}`}`;

type Props = {
  view: ViewName;
  width: number;
  onPick: (path: Target[], view: ViewName) => void;
  onHover: (target: Target | null) => void;
};

/**
 * The page on one view of the canvas, at the view's width, drawn as the layers' styles say. A pointer
 * down reports the layers under it, outermost first, for the editor to pick from as Figma does.
 */
export function DemoPage({ view, width, onPick, onHover }: Props) {
  const s = styleOf;
  const phone = width < 768;
  const narrow = width < 1280;
  const pad = (key: Key, factor = 1) => (s(key).padding as number[]).map((n) => `${Math.round(n * factor)}px`).join(" ");
  const opacity = (key: Key) => Number(s(key).opacity) / 100;

  const layer = (target: Target, path: Target[], style: CSSProperties, children: ReactNode, Tag: "div" | "p" | "h1" | "h3" = "div") => (
    <Tag
      key={layerId(target)}
      data-ht={layerId(target)}
      style={{ ...style, opacity: opacity(target.key), margin: 0 }}
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

  const page = s("page");
  const header = s("header");
  const title = s("title");
  const badge = s("badge");
  const badgeText = s("badgeText");
  const lede = s("lede");
  const button = s("button");
  const buttonText = s("buttonText");
  const card = s("card");
  const cardTitle = s("cardTitle");
  const cardBody = s("cardBody");

  const P: Target = { key: "page" };
  const H: Target = { key: "header" };
  const B: Target = { key: "badge" };
  const BT: Target = { key: "button" };
  const G: Target = { key: "cards" };

  return (
    <div onPointerLeave={() => onHover(null)} style={{ width, fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.35, color: "#171716" }}>
      {layer(
        P,
        [],
        { background: String(page.fill), padding: pad("page", phone ? 0.4 : narrow ? 0.7 : 1), display: "flex", flexDirection: page.direction as "row" | "column", gap: Number(page.gap), minHeight: phone ? 0 : 860, justifyContent: "center" },
        <>
          {layer(
            H,
            [P],
            { display: "flex", flexDirection: header.direction as "row" | "column", alignItems: header.direction === "row" ? "center" : "flex-start", gap: Number(header.gap), alignSelf: "flex-start" },
            <>
              {layer({ key: "title" }, [P, H], { fontSize: phone ? Number(title.fontSize) * 0.75 : Number(title.fontSize), fontWeight: 700, letterSpacing: "-0.03em", color: String(title.color), lineHeight: 1.05 }, "Harbor", "h1")}
              {layer(B, [P, H], { background: String(badge.fill), borderRadius: Number(badge.radius), padding: "4px 10px" }, layer({ key: "badgeText" }, [P, H, B], { fontSize: Number(badgeText.fontSize), fontWeight: 600, color: String(badgeText.color) }, "Beta", "p"))}
            </>,
          )}
          {layer({ key: "lede" }, [P], { maxWidth: 520, fontSize: Number(lede.fontSize), color: String(lede.color) }, "Plan trips with friends, on one shared map.", "p")}
          {layer(BT, [P], { alignSelf: "flex-start", background: String(button.fill), borderRadius: Number(button.radius), padding: pad("button") }, layer({ key: "buttonText" }, [P, BT], { fontSize: Number(buttonText.fontSize), fontWeight: 600, color: String(buttonText.color) }, "Get started", "p"))}
          {layer(
            G,
            [P],
            { display: "grid", gridTemplateColumns: phone ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: Number(s("cards").gap), marginTop: 24, maxWidth: 960 },
            CARDS.map((c, index) => {
              const C: Target = { key: "card", index };
              return layer(
                C,
                [P, G],
                {
                  background: String(card.fill),
                  borderRadius: Number(card.radius),
                  padding: pad("card"),
                  display: "flex",
                  flexDirection: card.direction as "row" | "column",
                  gap: Number(card.gap),
                  border: "1px solid #E5E5E4",
                  boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
                },
                <>
                  {layer({ key: "cardTitle", index }, [P, G, C], { fontSize: Number(cardTitle.fontSize), fontWeight: 600, color: String(cardTitle.color) }, c.title, "h3")}
                  {layer({ key: "cardBody", index }, [P, G, C], { fontSize: Number(cardBody.fontSize), color: String(cardBody.color) }, c.body, "p")}
                </>,
              );
            }),
          )}
        </>,
      )}
    </div>
  );
}
