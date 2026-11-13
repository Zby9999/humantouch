import { CopyButton } from "@/components/CopyButton";
import { SITE_URL } from "@/lib/site";

/**
 * The install prompt (designer, 2026-11-11): short, a pointer to the For Agents page, which has the steps, at the site's
 * own address, the same wherever the page is open (the dev server's included), as the Agent installs somewhere else.
 */
export const INSTALL_PROMPT = `Install Human Touch, an editor layer for this project's dev server, so I can edit the page and hand you the changes. Follow the Install section of ${SITE_URL}/agents.md. If you cannot open it, run \`npx -y humantouch-dev@latest init\` in the project's root folder and do what it prints.`;

/**
 * "Copy prompt to install", with the prompt it copies shown in a card under it while the pointer rests on it, or the
 * button has the keyboard's focus. `align`: the card's side, the button's left edge or its middle.
 */
export function InstallButton({ surface, align = "start" }: { surface: string; align?: "start" | "center" }) {
  const text = INSTALL_PROMPT;
  return (
    <div className={`group relative inline-flex ${align === "start" ? "self-start" : ""}`}>
      <CopyButton text={text} label="Copy prompt to install" size="h-8 px-4" font="text-sm" surface={surface} />
      {/*
       * Its top padding bridges the gap, so the pointer can go down into the card to read or select it. It opens after the
       * pointer rests 500ms, as the product's tips do (Tips.tsx), so passing over the button on the way to it does not open
       * it; it closes at once and faster than it opens. Hidden (`invisible`), not only see-through, so the wait does not leave
       * an unseen card under the pointer. From the keyboard (focus-visible), at once: no wait on a key.
       * Scaled in from the button's side, a strong ease-out.
       */}
      <div
        role="tooltip"
        className={`invisible absolute top-full z-10 w-[min(400px,calc(100vw-32px))] pt-2 opacity-0 translate-y-1 scale-[0.98] transition-[opacity,translate,scale,visibility] duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:duration-200 group-hover:delay-500 group-has-[:focus-visible]:visible group-has-[:focus-visible]:translate-y-0 group-has-[:focus-visible]:scale-100 group-has-[:focus-visible]:opacity-100 group-has-[:focus-visible]:duration-200 ${
          align === "start" ? "left-0 origin-top-left" : "left-1/2 -translate-x-1/2 origin-top"
        }`}
      >
        <p className="rounded-xl bg-neutral-0 px-3.5 py-3 text-left font-mono text-[12px] leading-[1.6] text-ink shadow-[var(--raised-shadow),0_8px_24px_-8px_rgb(0_0_0/0.18)] dark:bg-raised">
          {text}
        </p>
      </div>
    </div>
  );
}
