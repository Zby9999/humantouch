import { InstallButton } from "@/components/InstallButton";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { HeroEditor } from "@/components/editor/HeroEditor";
import { CanvasDemo } from "@/components/demos/CanvasDemo";
import { DesignPanelDemo } from "@/components/demos/DesignPanelDemo";
import { ApplyDemo } from "@/components/demos/ApplyDemo";
import { MiniVideo } from "@/components/demos/MiniVideo";
import Link from "next/link";
import { Updates } from "@/components/Updates";

/**
 * The two install buttons, at the top and the foot (designer, 2026-11-11): 8px corners, #008FF0 flat, with the hairline
 * inside, the soft shadow under it and the darker blue when hovered of the product's count of changes beside its toggle
 * (.ht-toggle-count).
 */
const BUTTON_ACCENT =
  "rounded-lg bg-blue-500 text-neutral-50 shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.15)] hover:bg-blue-600";

export default function Home() {

  return (
    <main className="@container flex flex-col items-center gap-20 overflow-x-clip px-4 pt-[120px] pb-12 max-xl:pb-3.5 md:pt-[160px]">
      <section className="flex w-full max-w-[800px] flex-col gap-6">
        <div className="flex flex-col gap-3 px-1.5">
          <h1 className="label font-sans font-medium text-ink-strong normal-case tracking-[-0.005em]">Human Touch</h1>
          <div className="text-[16px] leading-[1.4] font-[440] tracking-[-0.04px] text-ink-strong">
            <p className="text-balance">An Agent native design layer, under 4 MB.</p>
            <p className="text-balance">Step in anytime, the way you&apos;ve always designed,</p>
            <p className="text-balance">then have your Agent write the changes into the code.</p>
          </div>
        </div>
        <InstallButton surface={BUTTON_ACCENT} />
      </section>

      <HeroEditor />

      <Feature
        side="left"
        backdrop="/backdrops/canvas.jpg"
        title="Edit the page itself"
        body="Click the toggle and your page becomes a canvas you edit like Figma."
      >
        <CanvasDemo />
      </Feature>
      <Feature
        side="right"
        backdrop="/backdrops/design-panel.jpg"
        title="One change, everywhere"
        body="Every view follows, and so can every use of the component."
      >
        <DesignPanelDemo />
      </Feature>
      <Feature
        side="left"
        backdrop="/backdrops/apply.jpg"
        title="Tell your Agent, then check"
        body="Your Agent writes your changes into the code, and the page checks every one."
      >
        <ApplyDemo />
      </Feature>

      <section className="grid w-full max-w-[800px] gap-5 min-[1100px]:max-w-[1200px] min-[1100px]:grid-cols-3">
        <Mini visual="top" title="Say what the panel can’t" body="Write on a layer what your Agent should achieve there.">
          <MiniVideo src="/videos/brief.mp4" poster="/videos/brief.jpg" />
        </Mini>
        <Mini visual="bottom" title="Set layers aside" body="Drag a layer off the canvas, and it waits there till you need it.">
          <MiniVideo src="/videos/off-canvas.mp4" poster="/videos/off-canvas.jpg" />
        </Mini>
        <Mini visual="top" title="Your project’s values" body="Your CSS variables and Tailwind theme, right in the Design panel.">
          <MiniVideo src="/videos/variables.mp4" poster="/videos/variables.jpg" />
        </Mini>
      </section>

      <section className="flex w-full max-w-[800px] flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="label font-sans text-base font-medium text-ink leading-normal normal-case tracking-[-0.005em]">Changelog</h2>
          <Link href="/changelog" className="text-[14px] leading-[1.4] font-[440] text-label transition-colors hover:text-ink">
            See all
          </Link>
        </div>
        <Updates count={3} />
      </section>

      <div className="flex flex-col items-center gap-40 self-stretch max-xl:gap-32">
        <section className="flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <h2 className="label font-sans font-medium text-ink leading-normal normal-case tracking-[-0.005em] text-balance">Try Human Touch now with your Agents</h2>
            <div className="flex flex-col items-center gap-0">
              <p className="text-balance">Design, apply and check, all in one place.</p>
              <p className="text-balance">Install and apply changes in seconds</p>
            </div>
          </div>
          <InstallButton surface={BUTTON_ACCENT} align="center" />
        </section>

        <footer className="flex w-full max-w-[800px] items-start justify-between">
          <ThemeSwitch />
          <p className="text-[12px] leading-[28px] text-muted">MIT · © 2026 Zby9999</p>
        </footer>
      </div>
    </main>
  );
}

/**
 * One of the three features (designer, 2026-11-11, for all three), its corners 8px; the demo's corners 4px, in a 1px
 * white edge (the raised color in dark mode). From 768px wide, an 800×500 card: the demo 500px wide on one side, 4px in
 * from the card's edges there; the words on the other, 16px in, from the top, the body 240px above the foot. Below, one
 * above the other: the demo 4px in all round; the words 16px in, 8px under the demo, 28px above the card's foot.
 */
function Feature({ side, backdrop, title, body, children }: { side: "left" | "right"; backdrop: string; title: string; body: string; children: React.ReactNode }) {
  const right = side === "right";
  return (
    <section className={`flex w-full max-w-[800px] flex-col gap-3 rounded-lg bg-surface p-1 md:h-[500px] ${right ? "md:flex-row-reverse md:pl-3" : "md:flex-row md:pr-3"}`}>
      <div className="relative aspect-square w-[500px] max-w-full shrink-0 overflow-hidden rounded-sm border border-neutral-0 bg-neutral-900 md:aspect-auto md:h-full dark:border-raised">
        {/* Below the hero: asked for as it nears the screen, so it does not take the network from the hero (designer, 2026-11-12). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={backdrop} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0">{children}</div>
      </div>
      <div className="flex flex-col justify-between gap-2 px-4 pt-2 pb-7 md:pt-6 md:pb-60">
        <h2 className="text-lg leading-[1.3] font-[500] tracking-[-0.2px] text-ink">{title}</h2>
        <p className="text-[14px] leading-[1.5] font-[440] text-label">{body}</p>
      </div>
    </section>
  );
}

/** One of the three small cards: a 300px visual at its top or bottom (`fill`, its color behind the demo), the words in the rest. Framed as the features are (designer, 2026-11-11): 4px round the visual, its hairline, 8px corners outside and 4px inside. One column below 1100px wide (designer, 2026-11-11): three would each be too narrow. */
function Mini({ visual, fill = "bg-sunk", title, body, children }: { visual: "top" | "bottom"; fill?: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-3 rounded-lg bg-surface p-1 ${visual === "bottom" ? "min-[1100px]:flex-col-reverse min-[1100px]:justify-between" : ""}`}>
      <div className={`relative h-[300px] shrink-0 overflow-hidden rounded-sm border border-neutral-0 dark:border-raised ${fill}`}>{children}</div>
      <div className={`flex flex-col gap-2 px-4 pt-2 pb-5 ${visual === "bottom" ? "min-[1100px]:pt-5 min-[1100px]:pb-2" : ""}`}>
        <h3 className="text-[18px] leading-[1.3] font-[500] tracking-[-0.2px] text-ink">{title}</h3>
        <p className="text-[14px] leading-[1.5] font-[440] text-label">{body}</p>
      </div>
    </div>
  );
}
