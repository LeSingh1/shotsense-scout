"use client";

import { motion, useReducedMotion } from "motion/react";
import { CountUp } from "@/components/nike/CountUp";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Radial gauge for the model's xFG conclusion.
 *
 * A 280° sweep from 7-o'clock around to 5-o'clock. The track + value arc are
 * drawn with stroke-dasharray; the value arc grows from 0 → fraction using a
 * spring transition so the read of the number feels resolved, not snapped.
 *
 * Centered: percentage number with the MAKE/MISS verdict directly under it.
 */
export function XfgGauge({
  value,
  made,
  size = 196,
}: {
  /** 0..1 expected-FG fraction. */
  value: number;
  made: boolean;
  size?: number;
}) {
  const reduce = useReducedMotion();

  // Geometry
  const stroke = 10;
  const r = size / 2 - stroke / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  // 280° sweep so there's a visible "gap" at the bottom for the chip below.
  const SWEEP_DEG = 280;
  const startAngle = 90 + (360 - SWEEP_DEG) / 2; // start at 7 o'clock
  const circ = (2 * Math.PI * r * SWEEP_DEG) / 360;
  const offset = circ * (1 - Math.max(0, Math.min(1, value)));

  const pct = Math.round(value * 100);
  const tone = made ? "#34D399" : "var(--nike-accent)";

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-label={`Model xFG ${pct} percent · ${made ? "make" : "miss"}`}
      role="img"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: `rotate(${startAngle}deg)`, transformOrigin: "center" }}
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ} ${2 * Math.PI * r}`}
        />
        {/* Value arc */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ} ${2 * Math.PI * r}`}
          initial={reduce ? { strokeDashoffset: offset } : { strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: "spring", stiffness: 60, damping: 18, mass: 0.9 }}
        />
        {/* Tick marks every 25% */}
        {[0.25, 0.5, 0.75].map((t) => {
          const a = (t * SWEEP_DEG * Math.PI) / 180;
          const x1 = cx + Math.cos(a) * (r - stroke / 2 - 2);
          const y1 = cy + Math.sin(a) * (r - stroke / 2 - 2);
          const x2 = cx + Math.cos(a) * (r + stroke / 2 + 2);
          const y2 = cy + Math.sin(a) * (r + stroke / 2 + 2);
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
            />
          );
        })}
      </svg>

      {/* Center stack */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
          className="font-black tabular-nums leading-none"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: size * 0.32,
            color: "#fff",
            letterSpacing: "-0.04em",
          }}
        >
          <CountUp value={pct} decimals={0} />
          <span
            className="text-white/45 font-medium"
            style={{ fontSize: size * 0.13, marginLeft: 2 }}
          >
            %
          </span>
        </motion.div>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.32, ease: EASE }}
          className="mt-1.5 text-[10px] uppercase tracking-[0.24em] font-mono"
          style={{ color: tone }}
        >
          {made ? "Made it" : "Missed it"}
        </motion.div>
      </div>
    </div>
  );
}
