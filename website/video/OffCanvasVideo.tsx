import { CameraMotionBlur } from "@remotion/motion-blur";
import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, interpolateColors, useCurrentFrame, useVideoConfig } from "remotion";
import { PointerShape, TIP } from "@/components/demos/parts";
import { DemoPage } from "@/components/editor/DemoPage";
import { EDITOR_CSS } from "@/components/editor/editor-css.generated";
import { styleOf } from "@/components/editor/model";
import { FONT_VARS, geist } from "./fonts";

/*
 * The Off canvas card's video (designer, 2026-11-11): a 3D close-up of the canvas. Acme's button, selected at Phone, is
 * dragged off the view, and the page closes up under it; off the page, on its own, it is changed: its fill, its corners,
 * its words retyped; then it is dragged back in, the page opening for it, and the camera draws back to show the page with
 * the new button. Shallow depth of field and motion blur, as the Brief and Variables videos.
 * Render from website/: `npx remotion render OffCanvas public/videos/off-canvas.mp4`.
 */

const BACKDROP = "#a0a19f";
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const VIEW_WIDTH = 390;
/** The camera at its closest; the plane is laid out this much larger and only ever scaled down (see the Brief video). */
const CLOSEST = 3;
/** Where it is left off the page: this far left of the view, a little above where it was. */
const OFF_GAP = 64;
const OFF_RISE = 28;

const BUTTON = styleOf("button");
const WORDS = styleOf("buttonText");
const FROM = { fill: String(BUTTON.fill), text: "Read the issue" };
const TO = { fill: "#c2410c", radius: 6, text: "Subscribe" };

/** The video's moments, in frames. */
const T = {
  press: 20,
  out: [26, 62],
  fill: [72, 88],
  radius: [92, 108],
  pick: 116,
  type: [128, 156],
  grab: 166,
  back: [172, 206],
  pullBack: [208, 230],
} as const;

type Box = { x: number; y: number; width: number; height: number };

/**
 * The button's box on the page as it first is, in the page's own pixels: offsets, which the camera's transforms leave
 * alone. Measured on a copy of the page kept as it is, unseen, as a frame may be one where the button is off the page.
 */
function useButton(page: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState<Box | null>(null);
  const [handle] = useState(() => delayRender("Measuring the button"));
  useLayoutEffect(() => {
    const measure = () => {
      const root = page.current!;
      let el = root.querySelector<HTMLElement>('[data-ht="button"]');
      const b = { x: 0, y: 0, width: el!.offsetWidth, height: el!.offsetHeight };
      while (el && el !== root) {
        b.x += el.offsetLeft;
        b.y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      setBox(b);
      continueRender(handle);
    };
    document.fonts.ready.then(measure);
  }, [page, handle]);
  return box;
}

/** The selection's handles, at its corners, `px` a screen pixel on the plane. */
function Handles({ px, opacity }: { px: number; opacity: number }) {
  const size = 16 * px;
  return (
    <>
      {(["0 0", "1 0", "0 1", "1 1"] as const).map((corner) => {
        const [x, y] = corner.split(" ").map(Number);
        return (
          <div
            key={corner}
            style={{
              position: "absolute",
              left: `calc(${x * 100}% - ${size / 2}px)`,
              top: `calc(${y * 100}% - ${size / 2}px)`,
              width: size,
              height: size,
              boxSizing: "border-box",
              border: `${2.5 * px}px solid var(--ht-accent)`,
              background: "#fff",
              opacity,
            }}
          />
        );
      })}
    </>
  );
}

const Stage: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const page = useRef<HTMLDivElement>(null);
  const button = useButton(page);
  const b = button ?? { x: 24, y: 360, width: 150, height: 45 };
  const off = { x: -OFF_GAP - b.width, y: b.y - OFF_RISE };

  // The button: on the page, carried out, left off it, carried back, on the page again with its changes.
  const goOut = interpolate(frame, T.out, [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const goBack = interpolate(frame, T.back, [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const away = goOut * (1 - goBack);
  const outside = frame >= T.out[0] && frame < T.back[1];
  const carried = { x: b.x + (off.x - b.x) * away, y: b.y + (off.y - b.y) * away };
  const dragging = (frame >= T.out[0] && frame < T.out[1]) || (frame >= T.back[0] && frame < T.back[1]);
  // The page closes up as the button leaves and opens as it comes back, a little behind it.
  const room = Math.min(interpolate(frame, [T.out[0] + 4, T.out[1] - 4], [0, 1], { ...clamp, easing: EASE_IN_OUT }), 1 - interpolate(frame, [T.back[0] + 4, T.back[1] - 4], [0, 1], { ...clamp, easing: EASE_IN_OUT }));

  // Its changes, made off the page.
  const fill = interpolateColors(frame, T.fill, [FROM.fill, TO.fill]);
  const radius = interpolate(frame, T.radius, [b.height / 2, TO.radius], { ...clamp, easing: EASE_IN_OUT });
  const typed = Math.round(interpolate(frame, T.type, [0, TO.text.length], clamp));
  const editing = frame >= T.pick && frame < T.grab;
  const picked = frame >= T.pick && frame < T.type[0];
  const words = frame < T.type[0] ? FROM.text : TO.text.slice(0, typed);
  const caret = editing && !picked && Math.floor(frame / 12) % 2 === 0;
  const changed = frame >= T.back[1];

  // Where the camera looks and how close: the button; along with it, off the page; back; then drawn back to see the page.
  const atHome = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const atOff = { x: off.x + b.width / 2, y: off.y + b.height / 2 };
  const atPage = { x: VIEW_WIDTH / 2 - 30, y: b.y + 40 };
  const back = interpolate(frame, T.pullBack, [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const follow = interpolate(frame, [T.out[0] + 2, T.out[1] + 6], [0, 1], { ...clamp, easing: EASE_IN_OUT }) * (1 - interpolate(frame, [T.back[0] + 2, T.back[1] + 4], [0, 1], { ...clamp, easing: EASE_IN_OUT }));
  const look = {
    x: atHome.x + (atOff.x - atHome.x) * follow + (atPage.x - atHome.x) * back,
    y: atHome.y + (atOff.y - atHome.y) * follow + (atPage.y - atHome.y) * back,
  };
  const zoom = interpolate(frame, [0, T.out[0], T.out[1], T.back[1], T.pullBack[1]], [CLOSEST, 2.8, 2.6, 2.6, 1.55], { ...clamp, easing: EASE_IN_OUT });
  const px = 1 / zoom;
  const hair = 2.5 * px;

  // The pointer: comes to the button and presses it; carries it out; types; carries it back; then leaves, deselecting.
  // Held a third of the way in, inside the button with its old words and its new, shorter ones.
  const grip = (box: { x: number; y: number }, w: number) => ({ x: box.x + w * 0.32, y: box.y + b.height * 0.55 });
  const start = { x: b.x + b.width + 40, y: b.y + 110 };
  const pointerAt = (() => {
    const onHome = grip(b, b.width);
    if (frame < T.press) return { x: interpolate(frame, [4, T.press - 2], [start.x, onHome.x], { ...clamp, easing: EASE_OUT }), y: interpolate(frame, [4, T.press - 2], [start.y, onHome.y], { ...clamp, easing: EASE_OUT }) };
    const g = grip(carried, b.width);
    // Out of the way of the words while they are typed, back to the button to carry it home.
    const aside = Math.min(interpolate(frame, [T.pick + 9, T.type[0]], [0, 1], { ...clamp, easing: EASE_OUT }), 1 - interpolate(frame, [T.grab - 9, T.grab], [0, 1], { ...clamp, easing: EASE_IN_OUT }));
    if (frame < T.back[1] + 4) return { x: g.x + 40 * aside, y: g.y + 46 * aside };
    const leave = interpolate(frame, [T.back[1] + 4, T.back[1] + 22], [0, 1], { ...clamp, easing: EASE_OUT });
    return { x: g.x + 70 * leave, y: g.y + 90 * leave };
  })();
  const pressed = (frame >= T.press && frame < T.out[1]) || (frame >= T.grab && frame < T.back[1]) || (frame >= T.pick && frame < T.pick + 3) || (frame >= T.pick + 5 && frame < T.pick + 8);
  const pointerScale = pressed ? 0.88 : 1;

  const selected = frame >= T.press && frame < T.back[1];
  const selectionOpacity = interpolate(frame, [T.press, T.press + 6], [0, 1], clamp);
  const handles = selected && !dragging ? selectionOpacity : 0;

  return (
    <AbsoluteFill style={{ perspective: 2000 }}>
      <div
        className="ht-shell"
        style={{
          position: "absolute",
          inset: "auto",
          left: 0,
          top: 0,
          display: "block",
          background: "none",
          transformOrigin: "0 0",
          transform: `translate(${width / 2}px, ${height / 2}px) rotateX(30deg) rotateZ(${interpolate(frame, [0, 240], [-9, -6])}deg) scale(${zoom / CLOSEST})`,
          ["--ht-icon-size" as string]: "13.5px",
          ["--ht-icon-stroke" as string]: "1.05px",
          ...FONT_VARS,
        }}
      >
        <div style={{ position: "absolute", left: -look.x, top: -look.y, zoom: CLOSEST }}>
          {/* The view: its label, and Acme at Phone, closing up while the button is off it. */}
          <div className="ht-view-label" style={{ left: 0, top: -24, width: VIEW_WIDTH, color: "rgb(255 255 255 / 0.6)" }}>
            <span className="ht-view-title">
              <span className="ht-view-name is-active" style={{ color: "#fff" }}>
                Phone
              </span>
              <span className="ht-view-range">≤ 767</span>
            </span>
          </div>
          <div ref={page} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: VIEW_WIDTH, visibility: "hidden" }}>
            <DemoPage view="Phone" width={VIEW_WIDTH} onPick={() => {}} onHover={() => {}} hug />
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: VIEW_WIDTH, boxShadow: "0 0 0 0.5px rgb(0 0 0 / 0.2), 0 30px 80px -20px rgb(0 0 0 / 0.45)" }}>
            <DemoPage
              view="Phone"
              width={VIEW_WIDTH}
              onPick={() => {}}
              onHover={() => {}}
              hug
              leaving={outside ? room : undefined}
              styles={changed ? { button: { ...BUTTON, fill: TO.fill, radius: TO.radius } } : undefined}
              texts={changed ? { buttonText: TO.text } : undefined}
            />
          </div>

          {/* The button off the page: carried, or left on the canvas on its own, and changed there. */}
          {outside && (
            <div
              style={{
                position: "absolute",
                left: carried.x,
                top: carried.y,
                background: fill,
                borderRadius: radius,
                padding: "14px 24px",
                boxShadow: dragging ? "0 14px 30px -10px rgb(0 0 0 / 0.45)" : "0 6px 16px -8px rgb(0 0 0 / 0.35)",
              }}
            >
              <p style={{ margin: 0, whiteSpace: "pre", fontFamily: "var(--font-inter), sans-serif", fontSize: 14, fontWeight: 500, color: String(WORDS.color), letterSpacing: "0.01em", lineHeight: 1.2, WebkitFontSmoothing: "antialiased" }}>
                <span style={{ background: picked ? "rgb(0 143 240 / 0.45)" : "none" }}>{words}</span>
                {editing && !picked && <span style={{ display: "inline-block", width: hair, height: 15, marginLeft: 1, verticalAlign: -2, background: "#fff", opacity: caret ? 1 : 0 }} />}
                {/* Its height kept while its words are empty. */}
                {!words && "​"}
              </p>
              {selected && (
                <>
                  <div style={{ position: "absolute", inset: 0, border: `${hair}px solid var(--ht-accent)`, opacity: selectionOpacity }} />
                  <Handles px={px} opacity={handles} />
                </>
              )}
            </div>
          )}

          {/* Selected on the page before it is carried out; put back, it is let go. */}
          {selected && frame < T.out[0] && (
            <div style={{ position: "absolute", left: b.x, top: b.y, width: b.width, height: b.height }}>
              <div style={{ position: "absolute", inset: 0, border: `${hair}px solid var(--ht-accent)` }} />
              <Handles px={px} opacity={handles} />
            </div>
          )}

          {/* The pointer. */}
          <svg
            width={20}
            height={20}
            viewBox="0 0 20 20"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: pointerAt.x - TIP.x,
              top: pointerAt.y - TIP.y,
              overflow: "visible",
              transformOrigin: `${TIP.x}px ${TIP.y}px`,
              scale: `${1.3 * pointerScale}`,
              opacity: interpolate(frame, [4, 10, T.back[1] + 16, T.back[1] + 24], [0, 1, 1, 0], clamp),
            }}
          >
            <PointerShape />
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The stage at this frame, sharp round the middle and out of focus outside it, wider in the last shot; faded at the ends. */
const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const wide = interpolate(frame, T.pullBack, [0, 1], clamp);
  const focus = `radial-gradient(ellipse ${36 + 16 * wide}% ${42 + 8 * wide}% at 50% 50%, #000 45%, transparent 100%)`;
  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 10, durationInFrames - 8, durationInFrames - 1], [0, 1, 1, 0], clamp) }}>
      <AbsoluteFill style={{ filter: "blur(7px)" }}>
        <Stage frame={frame} />
      </AbsoluteFill>
      <AbsoluteFill style={{ maskImage: focus, WebkitMaskImage: focus }}>
        <Stage frame={frame} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const OffCanvasVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: geist }}>
      <style>{EDITOR_CSS}</style>
      <CameraMotionBlur samples={6} shutterAngle={180}>
        <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 40%, #aaabaa 0%, ${BACKDROP} 55%, #8e8f8d 100%)` }}>
          <Scene />
        </AbsoluteFill>
      </CameraMotionBlur>
    </AbsoluteFill>
  );
};
