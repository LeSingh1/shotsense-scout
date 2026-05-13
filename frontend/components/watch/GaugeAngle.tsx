"use client";

import { motion } from "motion/react";

/**
 * Inclinometer-style gauge. Quarter-arc from 0° (right, 3 o'clock) to 90°
 * (top, 12 o'clock). Hub sits at the bottom-center of the SVG, the big value
 * label sits to the right of the hub on the same baseline.
 *
 * All sizing is driven from a single `size` (width); the viewBox height is
 * computed so nothing clips. Use width: 100% on the parent to scale fluidly.
 */
export function GaugeAngle({
  valueDeg,
  accent = "#FF2D6F",
  size = 240,
}: {
  valueDeg: number;
  accent?: string;
  size?: number;
}) {
  const v = Math.max(0, Math.min(90, valueDeg));

  // Layout — all derived from `size` so nothing clips.
  const W = size;
  const PAD_TOP = 14;
  const PAD_BOTTOM = 8;
  const r = size * 0.34;
  const cx = size * 0.42;          // shift hub left to leave room for value text
  const cy = PAD_TOP + r + 4;       // hub baseline
  const H = cy + PAD_BOTTOM;

  const valueRad = (v * Math.PI) / 180;
  const needleX = cx + Math.cos(-valueRad) * r;
  const needleY = cy + Math.sin(-valueRad) * r;

  const bgPath = describeArc(cx, cy, r, 0, Math.PI / 2);
  const idealPath = describeArc(cx, cy, r, (45 * Math.PI) / 180, (52 * Math.PI) / 180);
  const valuePath = describeArc(cx, cy, r, 0, valueRad);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Release angle ${Math.round(v)} degrees`}
      style={{ display: "block" }}
    >
      {/* Background track */}
      <path
        d={bgPath}
        stroke="rgba(255,255,255,0.10)"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />

      {/* Ideal zone wedge */}
      <path
        d={idealPath}
        stroke={accent}
        strokeOpacity="0.35"
        strokeWidth="10"
        fill="none"
        strokeLinecap="butt"
      />

      {/* Tick marks every 15° */}
      {[0, 15, 30, 45, 60, 75, 90].map((t) => {
        const rad = (t * Math.PI) / 180;
        const inner = r - 9;
        const outer = r - 2;
        const x1 = cx + Math.cos(-rad) * inner;
        const y1 = cy + Math.sin(-rad) * inner;
        const x2 = cx + Math.cos(-rad) * outer;
        const y2 = cy + Math.sin(-rad) * outer;
        return (
          <line
            key={t}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="1"
          />
        );
      })}

      {/* Filled portion up to current value */}
      {v > 0 && (
        <motion.path
          key={Math.round(v)}
          d={valuePath}
          stroke={accent}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      )}

      {/* Needle */}
      <motion.line
        x1={cx}
        y1={cy}
        x2={needleX}
        y2={needleY}
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        initial={{ opacity: 0, pathLength: 0 }}
        animate={{ opacity: v > 0 ? 1 : 0.3, pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      />

      {/* Hub */}
      <circle cx={cx} cy={cy} r="3.5" fill="#fff" />

      {/* Big value text — sits right of the hub on the same baseline */}
      <motion.text
        x={W - 6}
        y={cy + 4}
        fontSize={r * 0.62}
        textAnchor="end"
        fill="#fff"
        fontWeight="900"
        fontFamily="var(--font-display)"
        style={{ letterSpacing: "-0.02em" }}
        initial={{ opacity: 0, y: cy + 14 }}
        animate={{ opacity: 1, y: cy + 4 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      >
        {Math.round(v)}°
      </motion.text>
    </svg>
  );
}

function describeArc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(-a0);
  const y0 = cy + r * Math.sin(-a0);
  const x1 = cx + r * Math.cos(-a1);
  const y1 = cy + r * Math.sin(-a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 0 : 1;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}
