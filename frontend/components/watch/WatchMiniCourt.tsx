"use client";

import { motion, useReducedMotion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Half-court diagram with the shot location plotted as a glowing dot.
 *
 * Coordinate system follows the NBA shot-chart convention: origin at the
 * hoop, +x = right, +y = away from baseline, units = tenths of a foot.
 * The component maps that into a 500×360 viewBox cropped to the front court.
 *
 * Stripped of the usual court furniture (free-throw circle, lane boxes, mid-
 * court, etc.) so the geometry serves as a quiet backdrop and the shot dot
 * is the only thing the eye lands on.
 */
export function WatchMiniCourt({
  x,
  y,
  made,
  tone,
}: {
  /** Shot x in NBA shot-chart units (tenths of a foot, origin = hoop). */
  x: number;
  /** Shot y in NBA shot-chart units. */
  y: number;
  made: boolean;
  /** Accent color (CSS) used by the dot + glow. */
  tone: string;
}) {
  const reduce = useReducedMotion();

  // Geometry — tuned for ~32 ft of court depth, 50 ft wide.
  const VB_W = 500;
  const VB_H = 360;
  const TOP_MARGIN = 32;
  const HOOP_X = VB_W / 2;
  const HOOP_Y = TOP_MARGIN + 40;
  const BASELINE_Y = TOP_MARGIN;
  const THREE_RADIUS = 237.5;
  const CORNER_X = 220;
  const CORNER_ARC_DROP = Math.sqrt(
    THREE_RADIUS * THREE_RADIUS - CORNER_X * CORNER_X,
  );
  const PAINT_HALF_W = 80;
  const FT_LINE_Y = HOOP_Y + 150;
  const RESTRICTED_RADIUS = 40;
  const BACKBOARD_HALF_W = 30;
  const RIM_RADIUS = 7.5;
  const SIDELINE_X = 6;
  const FRONTCOURT_Y = VB_H - 10;

  const arcStartX = HOOP_X - CORNER_X;
  const arcEndX = HOOP_X + CORNER_X;
  const arcY = HOOP_Y + CORNER_ARC_DROP;

  // Plot shot — clamp far threes so the dot never falls outside the viewBox.
  const shotX = HOOP_X + x;
  const shotY = Math.min(HOOP_Y + y, VB_H - 22);

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block w-full h-auto"
      role="img"
      aria-label="Shot location on half court"
    >
      {/* Court geometry — quiet hairlines so the dot is the loudest thing. */}
      <g
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.2"
        strokeLinecap="square"
      >
        {/* Frame */}
        <line x1={SIDELINE_X} y1={BASELINE_Y} x2={VB_W - SIDELINE_X} y2={BASELINE_Y} />
        <line x1={SIDELINE_X} y1={BASELINE_Y} x2={SIDELINE_X} y2={FRONTCOURT_Y} />
        <line x1={VB_W - SIDELINE_X} y1={BASELINE_Y} x2={VB_W - SIDELINE_X} y2={FRONTCOURT_Y} />
        <line x1={SIDELINE_X} y1={FRONTCOURT_Y} x2={VB_W - SIDELINE_X} y2={FRONTCOURT_Y} />
        {/* Corner-3 verticals */}
        <line x1={arcStartX} y1={BASELINE_Y} x2={arcStartX} y2={arcY} />
        <line x1={arcEndX} y1={BASELINE_Y} x2={arcEndX} y2={arcY} />
        {/* 3-point arc — sweep-flag=0 bulges away from baseline (toward midcourt). */}
        <path
          d={`M ${arcStartX} ${arcY} A ${THREE_RADIUS} ${THREE_RADIUS} 0 0 0 ${arcEndX} ${arcY}`}
        />
        {/* Paint */}
        <rect
          x={HOOP_X - PAINT_HALF_W}
          y={BASELINE_Y}
          width={PAINT_HALF_W * 2}
          height={FT_LINE_Y - BASELINE_Y}
        />
        {/* Restricted area — sweep-flag=0 to bulge toward midcourt. */}
        <path
          d={`M ${HOOP_X - RESTRICTED_RADIUS} ${HOOP_Y} A ${RESTRICTED_RADIUS} ${RESTRICTED_RADIUS} 0 0 0 ${HOOP_X + RESTRICTED_RADIUS} ${HOOP_Y}`}
        />
      </g>

      {/* Backboard — slightly more emphasis than the court hairlines */}
      <line
        x1={HOOP_X - BACKBOARD_HALF_W}
        y1={HOOP_Y - 14}
        x2={HOOP_X + BACKBOARD_HALF_W}
        y2={HOOP_Y - 14}
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2.4"
      />
      {/* Rim */}
      <circle
        cx={HOOP_X}
        cy={HOOP_Y}
        r={RIM_RADIUS}
        fill="none"
        strokeWidth="1.8"
        stroke="rgba(255,255,255,0.6)"
      />

      {/* Shot pulse — soft outer halo, animated to draw the eye */}
      {!reduce && (
        <motion.circle
          cx={shotX}
          cy={shotY}
          r={28}
          fill={tone}
          fillOpacity="0.18"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 1.4, 1], opacity: [0, 0.55, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          style={{ transformOrigin: `${shotX}px ${shotY}px` }}
        />
      )}

      {/* Glow halo behind the dot */}
      <circle
        cx={shotX}
        cy={shotY}
        r={16}
        fill={tone}
        fillOpacity="0.22"
      />

      {/* Shot dot — filled for makes, hollow for misses */}
      {made ? (
        <motion.circle
          cx={shotX}
          cy={shotY}
          r={9}
          fill={tone}
          initial={reduce ? { opacity: 1 } : { scale: 0, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 240,
            damping: 14,
            delay: 0.25,
          }}
          style={{ transformOrigin: `${shotX}px ${shotY}px` }}
        />
      ) : (
        <motion.g
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.25, ease: EASE }}
        >
          <circle
            cx={shotX}
            cy={shotY}
            r={9}
            fill="rgba(10,10,10,0.65)"
            stroke={tone}
            strokeWidth="2.2"
          />
        </motion.g>
      )}
    </svg>
  );
}
