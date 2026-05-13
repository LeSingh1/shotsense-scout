"use client";

import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { CountUp } from "@/components/nike/CountUp";
import { XfgGauge } from "./XfgGauge";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Unified right-rail "release profile" panel. Replaces the previous stack of
 * four identical boxed metric cards with one cohesive editorial column:
 *
 *   1. xFG hero — the model's conclusion as a radial gauge, with the MAKE/MISS
 *      verdict in the same eye-line. This is the answer; everything below
 *      explains how the answer was reached.
 *   2. Four input rows — dense label / number / context lines separated by
 *      hairlines. Each row reveals on a stagger when the clip changes.
 *
 * Motion guidelines (per ui-ux-pro-max §7):
 *   - Spring physics on the gauge arc; cubic-out elsewhere.
 *   - Children stagger 35ms apart on enter; exit at ~65% of enter duration.
 *   - All animations gate on prefers-reduced-motion.
 */
export function ReleaseProfile({
  keyId,
  xfg,
  made,
  releaseAngleDeg,
  releaseHeightFt,
  bodyLeanDeg,
  timeToReleaseMs,
}: {
  /** Identifier that changes when the underlying clip/locked metrics change. */
  keyId: string;
  xfg: number;
  made: boolean;
  releaseAngleDeg: number;
  releaseHeightFt: number;
  bodyLeanDeg: number;
  timeToReleaseMs: number;
}) {
  const reduce = useReducedMotion();

  // Angle zone — calm cyan when in ideal, accent otherwise (avoids fighting
  // the make/miss semantic colors).
  const angleInZone = releaseAngleDeg >= 45 && releaseAngleDeg <= 52;
  // Body lean — "ideal" is <5°.
  const leanIdeal = Math.abs(bodyLeanDeg) <= 5;
  // Time to release — quicker than 600ms NBA-average is desirable.
  const releaseFast = timeToReleaseMs < 600;
  const releasePct = Math.max(0, Math.min(1, timeToReleaseMs / 1200));

  const rows: Row[] = [
    {
      label: "Release angle",
      value: <NumberValue value={releaseAngleDeg} decimals={0} unit="°" />,
      context: angleInZone ? "In ideal zone" : `Ideal 45–52°`,
      contextTone: angleInZone ? "good" : "muted",
      viz: <AngleBar valueDeg={releaseAngleDeg} highlighted={angleInZone} />,
    },
    {
      label: "Release height",
      value: <NumberValue value={releaseHeightFt} decimals={1} unit="ft" />,
      context: "NBA avg 9.8 ft",
      contextTone: "muted",
    },
    {
      label: "Body lean",
      value: <NumberValue value={Math.abs(bodyLeanDeg)} decimals={0} unit="°" />,
      context: leanIdeal ? "Square base" : "Off-balance",
      contextTone: leanIdeal ? "good" : "warn",
    },
    {
      label: "Time to release",
      value: <NumberValue value={timeToReleaseMs} decimals={0} unit="ms" />,
      context: releaseFast ? "Quick · avg 600 ms" : "Slow · avg 600 ms",
      contextTone: releaseFast ? "good" : "warn",
      viz: <TimeBar fraction={releasePct} good={releaseFast} />,
    },
  ];

  return (
    <aside
      aria-label="Release profile"
      className="
        relative rounded-2xl overflow-hidden
        border border-white/8
        bg-white/[0.025]
      "
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={keyId}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          {/* Eyebrow */}
          <div className="flex items-center justify-between px-5 pt-5">
            <span className="text-[10px] uppercase tracking-[0.28em] font-mono text-white/45">
              Release profile
            </span>
            <span className="text-[9px] uppercase tracking-[0.22em] font-mono text-white/30">
              Locked at frame
            </span>
          </div>

          {/* Hero gauge */}
          <div className="px-5 pt-5 pb-6 flex flex-col items-center">
            <XfgGauge value={xfg} made={made} />
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
              className="mt-4 text-[11px] uppercase tracking-[0.22em] font-mono text-white/50 text-center"
            >
              Model xFG · expected to fall
            </motion.div>
          </div>

          {/* Divider */}
          <div className="mx-5 h-px bg-white/8" />

          {/* Rows */}
          <ul className="px-5 py-4 space-y-1">
            {rows.map((row, i) => (
              <MetricRow
                key={row.label}
                row={row}
                delay={reduce ? 0 : 0.42 + i * 0.06}
              />
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────── primitives */

type ContextTone = "good" | "warn" | "muted";

type Row = {
  label: string;
  value: React.ReactNode;
  context: string;
  contextTone: ContextTone;
  viz?: React.ReactNode;
};

function MetricRow({ row, delay }: { row: Row; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      whileHover={reduce ? undefined : { x: -1 }}
      className="
        group relative rounded-lg
        px-3 py-3 -mx-1
        hover:bg-white/[0.025]
        transition-colors
      "
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-white/50">
          {row.label}
        </span>
        <span className="font-bold tabular-nums leading-none text-white">
          {row.value}
        </span>
      </div>
      {row.viz && <div className="mt-2.5">{row.viz}</div>}
      <div
        className={[
          "mt-1.5 text-[10px] uppercase tracking-[0.18em] font-mono",
          row.contextTone === "good"
            ? "text-emerald-400/80"
            : row.contextTone === "warn"
              ? "text-white/60"
              : "text-white/35",
        ].join(" ")}
      >
        {row.context}
      </div>
    </motion.li>
  );
}

function NumberValue({
  value,
  decimals,
  unit,
}: {
  value: number;
  decimals: number;
  unit: string;
}) {
  return (
    <span
      className="font-black tabular-nums leading-none"
      style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: "-0.02em" }}
    >
      <CountUp value={value} decimals={decimals} />
      <span className="text-white/40 text-[14px] font-medium ml-1">{unit}</span>
    </span>
  );
}

/**
 * Inline arc-on-a-line for release angle. Shows the 45–52° ideal zone tinted
 * and a dot at the actual value, so you can read calibration without reading
 * the number.
 */
function AngleBar({
  valueDeg,
  highlighted,
}: {
  valueDeg: number;
  highlighted: boolean;
}) {
  const reduce = useReducedMotion();
  // Map 0..90° to 0..1 along the bar
  const v = Math.max(0, Math.min(90, valueDeg)) / 90;
  const lo = 45 / 90;
  const hi = 52 / 90;
  return (
    <div className="relative h-[6px] w-full rounded-full bg-white/[0.06]">
      {/* Ideal zone */}
      <div
        className="absolute top-0 bottom-0 rounded-full"
        style={{
          left: `${lo * 100}%`,
          width: `${(hi - lo) * 100}%`,
          background: "rgba(52,211,153,0.25)",
          boxShadow: "inset 0 0 0 1px rgba(52,211,153,0.35)",
        }}
      />
      {/* Indicator dot */}
      <motion.div
        initial={reduce ? { left: `${v * 100}%` } : { left: "0%" }}
        animate={{ left: `${v * 100}%` }}
        transition={{ type: "spring", stiffness: 110, damping: 16 }}
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full"
        style={{
          background: highlighted ? "#34D399" : "#fff",
          boxShadow: highlighted
            ? "0 0 12px rgba(52,211,153,0.65)"
            : "0 0 8px rgba(255,255,255,0.45)",
        }}
      />
    </div>
  );
}

function TimeBar({ fraction, good }: { fraction: number; good: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative h-[6px] w-full rounded-full bg-white/[0.06] overflow-hidden">
      <motion.div
        initial={reduce ? { width: `${fraction * 100}%` } : { width: 0 }}
        animate={{ width: `${fraction * 100}%` }}
        transition={{ duration: 0.75, ease: EASE, delay: 0.1 }}
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          background: good ? "#34D399" : "var(--nike-accent)",
        }}
      />
      {/* 600ms NBA-average tick */}
      <div
        aria-hidden
        className="absolute top-0 bottom-0 w-px bg-white/35"
        style={{ left: `${(600 / 1200) * 100}%` }}
      />
    </div>
  );
}
