import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter, Rajdhani } from "next/font/google";
import "./globals.css";
import { HumanTouch } from "humantouch/react";
import { Nav } from "@/components/Nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: "600", variable: "--font-rajdhani" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
/** The serif of Acme, the page on the hero's canvas. */
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif" });

export const metadata: Metadata = {
  title: "Human Touch",
  description: "An Agent native design layer inside your project's local dev server. Edit the page itself, visually, on a canvas, then have your Agent write the changes into the code.",
};

/** Sets the theme picked in the footer before the page paints, so it does not flash. */
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${rajdhani.variable} ${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Nav />
        {children}
        <HumanTouch />
      </body>
    </html>
  );
}
