/**
 * The theme a real Tailwind v3 project would have: its own colors, spacing,
 * radii, shadows, font sizes and breakpoints, all used on the page.
 *
 * @type {import("tailwindcss").Config}
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./vendor/**/*.jsx"],
  theme: {
    // Not Tailwind's defaults (640, 768, 1024, 1280, 1536px): the project's own.
    screens: {
      sm: "560px",
      md: "820px",
      lg: "1120px",
    },
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6ff",
          500: "#3d63f5",
          700: "#2440c4",
        },
        ink: "#1b1d2a",
        muted: "#5b6075",
      },
      spacing: {
        // Unlike any of Tailwind's own steps, so a value names one Variable only.
        gutter: "1.375rem",
        section: "4.5rem",
      },
      borderRadius: {
        card: "14px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(27 29 42 / 0.06), 0 4px 12px rgb(27 29 42 / 0.08)",
      },
      fontSize: {
        display: ["2.75rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        lead: ["1.1875rem", "1.75rem"],
        caption: ["0.8125rem", "1.25rem"],
      },
    },
  },
  plugins: [],
};
