"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";

/**
 * Scroll-triggered reveal wrapper. Children slide up and fade in once the
 * section enters the viewport. We trigger at -15% so the animation completes
 * comfortably above the fold rather than right at the edge.
 */
export function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
