"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "For Human" },
  { href: "/agents", label: "For Agents" },
];

/**
 * The two tabs at the top of the 800px column, and GitHub at its right. The tab shown has a notch hanging from the
 * window's top edge over it (Figma: "Union", 70×18 at y −13).
 */
export function Nav() {
  const pathname = usePathname();
  const onAgents = pathname.startsWith("/agents");
  const active = onAgents ? 1 : 0;

  return (
    <header className="absolute inset-x-0 top-0 z-10">
      <div className="relative mx-auto flex max-w-[832px] items-center justify-between px-4 pt-3">
        <nav className="relative flex items-center gap-5 text-[14px] leading-[1.4] font-[440] tracking-[-0.04px]">
          <svg
            aria-hidden="true"
            width="70"
            height="18"
            viewBox="0 0 70 18"
            className="absolute -top-[25px] transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
            style={{ left: 2, transform: `translateX(${active ? 92 : 0}px)`, color: onAgents ? "#d4d4d3" : "var(--notch)" }}
          >
            <path
              fill="currentColor"
              d="M51.7578 16.2422C50.6326 17.3674 49.1059 18 47.5146 18H19.4854C17.8941 18 16.3674 17.3674 15.2422 16.2422L14.0503 15.0503C12.7375 13.7375 10.957 13 9.1005 13H0V0H70V13H57.8995C56.043 13 54.2625 13.7375 52.9497 15.0503L51.7578 16.2422Z"
            />
          </svg>
          {TABS.map((tab, i) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={i === active ? "page" : undefined}
              className={`w-[72px] whitespace-nowrap transition-colors ${
                i === active ? (onAgents ? "text-neutral-100" : "text-ink") : onAgents ? "text-neutral-500 hover:text-neutral-300" : "text-muted hover:text-label"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <a
          href="https://github.com/Zby9999/humantouch"
          className={`text-[14px] leading-[1.4] font-[440] tracking-[-0.04px] transition-colors ${onAgents ? "text-neutral-100" : "text-ink hover:text-label"}`}
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
