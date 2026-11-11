import type { Metadata } from "next";
import "./globals.css";
import { HumanTouch } from "humantouch/react";

export const metadata: Metadata = {
  title: "Human Touch",
  description: "An editor layer for your project's local dev server: edit the page itself, visually, on a canvas, then have your Agent write the changes into the code.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<HumanTouch /></body>
    </html>
  );
}
