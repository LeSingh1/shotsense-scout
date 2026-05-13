"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { cn } from "@/lib/format";

type Props = {
  /** The text to render (already formatted; e.g. "+0.075"). */
  children: string;
  /** Animate each character in on viewport entry. (Hero use only — most numbers just render statically.) */
  animateOnReveal?: boolean;
  className?: string;
  /** Optional aria-label override (e.g. spell out the value for screen readers). */
  ariaLabel?: string;
};

/**
 * Single source of truth for numeric typography.
 *  - JetBrains Mono via the `--font-mono` CSS variable.
 *  - `font-feature-settings: 'tnum' 1` so digits are equal-width and don't wiggle.
 *  - Optional per-character entrance animation (M1 in the motion inventory).
 *
 * The `.num` utility from globals.css does the typography; this component owns
 * the animation reuse so consumers don't reimplement it.
 */
export function NumberDisplay({
  children,
  animateOnReveal = false,
  className,
  ariaLabel,
}: Props) {
  const reduce = useReducedMotion();
  const chars = useMemo(() => children.split(""), [children]);

  if (!animateOnReveal || reduce) {
    return (
      <span className={cn("num", className)} aria-label={ariaLabel}>
        {children}
      </span>
    );
  }

  return (
    <span className={cn("num", className)} aria-label={ariaLabel ?? children}>
      {chars.map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{
            duration: 0.5,
            delay: i * 0.04,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{ display: "inline-block" }}
        >
          {ch === " " ? " " : ch}
        </motion.span>
      ))}
    </span>
  );
}
