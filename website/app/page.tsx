import { CopyButton } from "@/components/CopyButton";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { HeroEditor } from "@/components/editor/HeroEditor";
import { CanvasDemo } from "@/components/demos/CanvasDemo";
import { DesignPanelDemo } from "@/components/demos/DesignPanelDemo";
import { ApplyDemo } from "@/components/demos/ApplyDemo";
import { BriefMini, OffCanvasMini, VariablesMini } from "@/components/demos/Minis";
import { installPrompt } from "@/lib/readme";
import { UPDATES } from "@/lib/updates";

export default function Home() {
  const prompt = installPrompt();

  return (
    <main className="flex flex-col items-center gap-20 px-4 pt-[120px] pb-[184px] md:pt-[160px]">
      <section className="flex w-full max-w-[800px] flex-col gap-6">
        <div className="flex flex-col gap-3 px-1.5">
          <h1 className="label">Human Touch</h1>
          <div className="text-[16px] leading-[1.4] font-[440] tracking-[-0.04px] text-ink">
            <p className="text-balance">An Agent native design layer inside your project&apos;s local dev server.</p>
            <p className="text-balance">Edit the page itself, visually, on a canvas, then have your Agent write the changes into the code.</p>
          </div>
        </div>
        <CopyButton text={prompt} label="Copy prompt to install" className="self-start" />
      </section>

      <HeroEditor />

      <Feature
        side="left"
        backdrop="/backdrops/canvas.jpg"
        label="Canvas"
        title="Edit the page itself"
        body="Click the toggle and the page freezes into a canvas. Drag layers to move them, select a few and press ⇧A to make a Stack, the way you would in Figma."
      >
        <CanvasDemo />
      </Feature>
      <Feature
        side="right"
        backdrop="/backdrops/design-panel.jpg"
        label="Views"
        title="Every width at once"
        body="Desktop, Tablet and Phone, side by side. Change a Fill or a corner radius in the Design panel and all three follow; a change made in the Phone view stays at its breakpoint."
      >
        <DesignPanelDemo />
      </Feature>
      <Feature
        side="left"
        backdrop="/backdrops/apply.jpg"
        label="Apply"
        title="Tell your Agent, then check"
        body="Say “Apply my design changes”. Your Agent writes them into the code, the ring on the toggle fills as each one shows on the page, and the report says which it could not apply 1:1."
      >
        <ApplyDemo />
      </Feature>

      <section className="grid w-full max-w-[800px] gap-5 xl:max-w-[1200px] xl:grid-cols-3">
        <Mini visual="top" label="Brief" title="Say what the panel can’t" body="Pick the Brief tool, click a layer, and write on its card what your Agent should achieve there.">
          <BriefMini />
        </Mini>
        <Mini visual="bottom" label="Off canvas" title="Set layers aside" body="Drag a layer off the canvas to keep it beside the views, across rounds, until you put it back.">
          <OffCanvasMini />
        </Mini>
        <Mini visual="top" label="Variables" title="Your project’s values" body="Colors, spacing and type sizes from your CSS variables or Tailwind theme, offered in the Design panel.">
          <VariablesMini />
        </Mini>
      </section>

      <section className="flex w-full max-w-[800px] flex-col gap-3">
        <h2 className="label">Recent update</h2>
        <ul className="flex flex-col gap-3">
          {UPDATES.map((update) => (
            <li key={update.title} className="flex h-[120px] flex-col justify-between rounded-[4px] bg-surface p-5">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-[16px] leading-[1.4] font-[500] tracking-[-0.04px] text-ink">{update.title}</h3>
                <time dateTime={update.date} className="font-mono text-[12px] text-label">
                  {update.date}
                </time>
              </div>
              <p className="truncate text-[14px] leading-[1.4] font-[440] text-label" title={update.body}>
                {update.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col items-center gap-3 text-center">
        <h2 className="label leading-normal">Try Human Touch now with your Agents</h2>
        <CopyButton text={prompt} label="Copy prompt to install" />
      </section>

      <footer className="flex w-full max-w-[800px] items-start justify-between">
        <ThemeSwitch />
        <p className="text-[12px] leading-[28px] text-muted">MIT · © 2026 Zby9999</p>
      </footer>
    </main>
  );
}

/** One of the three features: an 800×500 card, the demo on its backdrop on one side, the words on the other. */
function Feature({ side, backdrop, label, title, body, children }: { side: "left" | "right"; backdrop: string; label: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <section className={`flex w-full max-w-[800px] flex-col gap-3 rounded-[4px] bg-surface p-3 md:h-[500px] ${side === "right" ? "md:flex-row-reverse" : "md:flex-row"}`}>
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-[4px] bg-neutral-900 md:aspect-auto md:h-full md:w-[480px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={backdrop} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0">{children}</div>
      </div>
      <div className="flex flex-col gap-2 p-3 md:justify-end md:p-5">
        <p className="label text-[16px] leading-[18px]">{label}</p>
        <h2 className="text-[20px] leading-[1.3] font-[500] tracking-[-0.2px] text-ink">{title}</h2>
        <p className="text-[14px] leading-[1.5] font-[440] text-label">{body}</p>
      </div>
    </section>
  );
}

/** One of the three small cards: a 300px visual at its top or bottom, the words in the rest. One column below 1280px wide: three would each be too narrow. */
function Mini({ visual, label, title, body, children }: { visual: "top" | "bottom"; label: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-3 rounded-[4px] bg-surface p-3 xl:h-[500px] ${visual === "bottom" ? "xl:flex-col-reverse xl:justify-between" : ""}`}>
      <div className="relative h-[300px] shrink-0 overflow-hidden rounded-[4px] bg-sunk">{children}</div>
      <div className="flex flex-col gap-2 p-3">
        <p className="label text-[16px] leading-[18px]">{label}</p>
        <h3 className="text-[18px] leading-[1.3] font-[500] tracking-[-0.2px] text-ink">{title}</h3>
        <p className="text-[14px] leading-[1.5] font-[440] text-label">{body}</p>
      </div>
    </div>
  );
}
