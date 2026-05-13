"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Lightweight odometer-style number animation. Avoids a heavy external dep.
 * Animates from previous value to next over `duration` ms using easeOutCubic.
 */
export function CountUp({
  value,
  duration = 900,
  decimals = 2,
}: {
  value: number;
  duration?: number;
  decimals?: number;
}) {
  // Start at 0 so the very first mount animates UP to the target value.
  // On subsequent value changes, prev holds the last terminal value so the
  // animation ramps from the current display to the new target naturally.
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prev.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span className="tabular-nums">{display.toFixed(decimals)}</span>;
}
