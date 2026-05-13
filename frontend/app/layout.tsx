import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shot quality, calibrated · nba_shot_quality",
  description:
    "Calibrated NBA expected field goal percentage (xFG%) on the 2025-26 playoffs. Methodology-first: GroupKFold cross-validation, target encoding in a sklearn Pipeline, empirical-Bayes shrinkage on player ranking.",
  authors: [{ name: "shaurya" }],
  openGraph: {
    title: "Shot quality, calibrated",
    description:
      "Free-data NBA xFG% with proper CV hygiene and shrunk player ranking.",
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
      className={`${spaceGrotesk.variable} ${interTight.variable} ${jetBrainsMono.variable}`}
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
