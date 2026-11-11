import { HumanTouch } from "humantouch/react";
import { useEffect, useRef, useState } from "react";

const SLIDES = ["Plan", "Build", "Ship"];
const STEPS = ["Sketch", "Prototype", "Review", "Polish"];

/**
 * A page that moves, as many do (ticket 141): a CSS animation, a script
 * animation and one that writes the style attribute each frame, a clock, a
 * carousel turning by a class, and a list in another order on each load.
 * With the code the same, it prints the same, loaded again.
 */
export function MotionPage() {
  const [now, setNow] = useState(() => new Date());
  const [slide, setSlide] = useState(0);
  const [steps] = useState(() => [...STEPS].sort(() => Math.random() - 0.5));
  const pulse = useRef<HTMLParagraphElement>(null);
  const drift = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ticking = setInterval(() => setNow(new Date()), 250);
    const turning = setInterval(() => setSlide((n) => (n + 1) % SLIDES.length), 400);
    const pulsing = pulse.current!.animate([{ opacity: 1 }, { opacity: 0.3 }], { duration: 600, iterations: Infinity, direction: "alternate" });
    let frame = requestAnimationFrame(function move(at) {
      drift.current!.style.transform = `translateX(${Math.round((Math.sin(at / 300) + 1) * 40)}px)`;
      frame = requestAnimationFrame(move);
    });
    return () => {
      clearInterval(ticking);
      clearInterval(turning);
      pulsing.cancel();
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <main className="motion-page">
      <h1>Always moving</h1>
      <div className="spinner" />
      <p ref={pulse}>Pulsing</p>
      <div ref={drift}>Drifting</div>
      <time>{now.toLocaleTimeString("en-GB")}</time>
      <section>
        {SLIDES.map((name, i) => (
          <div key={name} className={i === slide ? "slide is-active" : "slide"}>
            {name}
          </div>
        ))}
      </section>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <HumanTouch />
    </main>
  );
}
