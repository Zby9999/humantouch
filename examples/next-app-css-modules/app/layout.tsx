import type { Metadata } from "next";
import { HumanTouch } from "humantouch/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Human Touch example: Next.js App Router + CSS Modules",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <HumanTouch />
      </body>
    </html>
  );
}
