"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

const CHOICES: { theme: Theme; label: string; icon: React.ReactNode }[] = [
  {
    theme: "system",
    label: "System theme",
    icon: (
      <>
        <rect x="2.25" y="3" width="11.5" height="8" rx="1.15" />
        <line x1="5.5" y1="13.5" x2="10.5" y2="13.5" />
      </>
    ),
  },
  {
    theme: "light",
    label: "Light theme",
    icon: (
      <>
        <circle cx="8" cy="8" r="2.75" />
        <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.06 1.06M11.34 11.34l1.06 1.06M3.6 12.4l1.06-1.06M11.34 4.66l1.06-1.06" />
      </>
    ),
  },
  {
    theme: "dark",
    label: "Dark theme",
    icon: <path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z" />,
  },
];

/** The footer's three buttons (Figma: Frame 40, three 44×24 in a 2px track): System, Light, Dark. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-1 rounded-[18px] bg-neutral-100 p-0.5 dark:bg-raised">
      {CHOICES.map((choice) => (
        <button
          key={choice.theme}
          type="button"
          role="radio"
          aria-checked={theme === choice.theme}
          aria-label={choice.label}
          title={choice.label}
          onClick={() => choose(choice.theme)}
          className={`flex h-6 w-11 items-center justify-center rounded-full transition-[background-color,box-shadow,color] duration-150 ${
            theme === choice.theme ? "bg-neutral-0 text-ink shadow-raised dark:bg-raised" : "text-muted hover:text-label"
          }`}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {choice.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
