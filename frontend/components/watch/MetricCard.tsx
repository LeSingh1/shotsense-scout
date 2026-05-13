"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

export function MetricCard({
  label,
  children,
  delay = 0,
  highlight = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  delay?: number;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-lg bg-white/[0.025] border border-white/8 p-5 ${className}`}
      style={
        highlight
          ? {
              borderColor: "color-mix(in srgb, var(--nike-accent) 45%, transparent)",
            }
          : undefined
      }
    >
      <div className="text-[10px] uppercase tracking-[0.24em] text-white/45 mb-3 font-mono">
        {label}
      </div>
      {children}
    </motion.div>
  );
}
