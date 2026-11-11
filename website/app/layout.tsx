import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter, Rajdhani } from "next/font/google";
import "./globals.css";
import { HumanTouch } from "humantouch/react";
import { Nav } from "@/components/Nav";
import { SITE_URL } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
/** Every weight Rajdhani has, for the labels to be tried at each (designer, 2026-11-11). */
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-rajdhani" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
/** The serif of Acme, the page on the hero's canvas. */
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Human Touch",
  description: "An Agent native design layer, under 4 MB. Step in anytime, the way you've always designed, then have your Agent write the changes into the code.",
};

/** Sets the theme picked in the footer before the page paints, so it does not flash. */
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
/**
 * On the home page, the hero's first frame in the theme the page shows, asked for at once and first (designer,
 * 2026-11-12): as the hero's background, the browser would ask for it only once the CSS is in.
 */
const heroFrameScript = `if(location.pathname==="/"){var t;try{t=localStorage.getItem("theme")}catch(e){}var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var l=document.createElement("link");l.rel="preload";l.as="image";l.fetchPriority="high";l.href=d?"/hero/first-dark.webp":"/hero/first-light.webp";document.head.appendChild(l)}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${rajdhani.variable} ${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: heroFrameScript }} />
      </head>
      <body>
        <Nav />
        {children}
        <HumanTouch />
      </body>
    </html>
  );
}
