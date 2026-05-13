"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Frosted-glass HUD card. Used as the base for every floating overlay
 * around the centered player. Stagger their entrance with `delay`.
 */
export function HudCard({
  children,
  className,
  delay = 0,
  align = "left",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  align?: "left" | "right" | "center";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`relative rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/10 px-4 py-3 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className ?? ""}`}
      style={{
        boxShadow:
          "0 12px 38px color-mix(in srgb, var(--nike-accent) 18%, transparent), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Accent stripe — top for left/center align, right for right align */}
      <span
        aria-hidden
        className="absolute rounded-full"
        style={
          align === "right"
            ? { right: 8, top: 8, bottom: 8, width: 2, background: "var(--nike-accent)" }
            : { left: 8, top: 8, bottom: 8, width: 2, background: "var(--nike-accent)" }
        }
      />
      <div className={align === "right" ? "pr-3" : "pl-3"}>{children}</div>
    </motion.div>
  );
}

/** Tiny SVG sparkline for the SHOTS card. */
export function Sparkline({
  values,
  width = 96,
  height = 22,
  color = "var(--nike-accent)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) {
    return <div style={{ width, height }} className="opacity-30 text-[10px] uppercase tracking-wider">—</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.001, max - min);
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      <circle
        cx={(values.length - 1) * stepX}
        cy={height - ((values[values.length - 1] - min) / range) * height}
        r="2.2"
        fill={color}
      />
    </svg>
  );
}
