import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ShotSense Scout — AI Basketball Intelligence",
  description:
    "AI-powered NBA shot quality analysis with pattern detection, scouting reports, and interactive court visualization for the 2025-26 playoffs.",
  authors: [{ name: "shaurya" }],
  openGraph: {
    title: "ShotSense Scout — AI Basketball Intelligence",
    description:
      "AI-powered NBA shot quality analysis with pattern detection and scouting reports.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetBrainsMono.variable}`}
    >
      <body className="bg-bg text-text antialiased" suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
