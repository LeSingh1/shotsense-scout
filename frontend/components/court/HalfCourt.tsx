"use client";

import { COURT } from "./court-dimensions";

/**
 * Flat, top-down NBA half-court drawn in NBA API native coordinates.
 *
 * To use:
 *
 *     <svg
 *       viewBox={`${COURT.X_MIN} ${COURT.Y_MIN} ${COURT.W} ${COURT.H}`}
 *       preserveAspectRatio="xMidYMid meet"
 *     >
 *       <HalfCourt />
 *       { ...plot shots as <circle cx={LOC_X} cy={LOC_Y} /> ... }
 *     </svg>
 *
 * Hoop is at (0, 0). Baseline at y = -52.5 (top of canvas).
 */
export function HalfCourt({
  stroke = "#3a3a3a",
  strokeWidth = 1.5,
}: {
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <g stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round">
      {/* Outer boundary */}
      {/* Baseline (top of canvas in render) */}
      <line x1={COURT.X_MIN} y1={COURT.BASELINE_Y} x2={-COURT.X_MIN} y2={COURT.BASELINE_Y} />
      {/* Sidelines */}
      <line x1={COURT.X_MIN} y1={COURT.BASELINE_Y} x2={COURT.X_MIN} y2={COURT.MIDCOURT_Y} />
      <line x1={-COURT.X_MIN} y1={COURT.BASELINE_Y} x2={-COURT.X_MIN} y2={COURT.MIDCOURT_Y} />
      {/* Half-court */}
      <line x1={COURT.X_MIN} y1={COURT.MIDCOURT_Y} x2={-COURT.X_MIN} y2={COURT.MIDCOURT_Y} />

      {/* Paint */}
      <rect
        x={-COURT.PAINT_HALF_W}
        y={COURT.BASELINE_Y}
        width={COURT.PAINT_HALF_W * 2}
        height={COURT.PAINT_TOP_Y - COURT.BASELINE_Y}
      />

      {/* Free-throw line */}
      <line x1={-COURT.PAINT_HALF_W} y1={COURT.FT_Y} x2={COURT.PAINT_HALF_W} y2={COURT.FT_Y} />

      {/* Free-throw circle — half dashed (toward hoop), half solid (toward midcourt). */}
      <path
        d={`M ${-COURT.FT_CIRCLE_R} ${COURT.FT_Y} A ${COURT.FT_CIRCLE_R} ${COURT.FT_CIRCLE_R} 0 0 1 ${COURT.FT_CIRCLE_R} ${COURT.FT_Y}`}
        strokeDasharray="6 5"
      />
      <path
        d={`M ${-COURT.FT_CIRCLE_R} ${COURT.FT_Y} A ${COURT.FT_CIRCLE_R} ${COURT.FT_CIRCLE_R} 0 0 0 ${COURT.FT_CIRCLE_R} ${COURT.FT_Y}`}
      />

      {/* Restricted area arc — bulges away from baseline (toward midcourt). */}
      <path
        d={`M ${-COURT.RA_R} ${COURT.HOOP_Y} A ${COURT.RA_R} ${COURT.RA_R} 0 0 0 ${COURT.RA_R} ${COURT.HOOP_Y}`}
      />

      {/* Backboard */}
      <line
        x1={-COURT.BACKBOARD_HALF_W}
        y1={COURT.BACKBOARD_Y}
        x2={COURT.BACKBOARD_HALF_W}
        y2={COURT.BACKBOARD_Y}
        strokeWidth={strokeWidth * 1.6}
      />

      {/* Rim */}
      <circle cx={COURT.HOOP_X} cy={COURT.HOOP_Y} r={COURT.RIM_R} />

      {/* Corner-3 straight lines — at x = ±220, from baseline to y=89.5
          (where they meet the arc). */}
      <line x1={-COURT.CORNER_X} y1={COURT.BASELINE_Y} x2={-COURT.CORNER_X} y2={COURT.CORNER_Y_END} />
      <line x1={ COURT.CORNER_X} y1={COURT.BASELINE_Y} x2={ COURT.CORNER_X} y2={COURT.CORNER_Y_END} />

      {/* Three-point arc — 23.75 ft radius from hoop. sweep-flag = 0 picks
          the arc that bulges AWAY from the baseline (toward midcourt). With
          y growing down in SVG, sweep=0 puts the center (hoop) ABOVE the
          chord on screen, so the arc bows downward = toward midcourt. */}
      <path
        d={`M ${-COURT.CORNER_X} ${COURT.CORNER_Y_END}
            A ${COURT.ARC_R} ${COURT.ARC_R} 0 0 0
            ${COURT.CORNER_X} ${COURT.CORNER_Y_END}`}
      />

      {/* Side-lane tick marks */}
      {[20, 50, 80].map((offset) => (
        <g key={offset}>
          <line x1={-COURT.PAINT_HALF_W - 12} y1={COURT.BASELINE_Y + offset} x2={-COURT.PAINT_HALF_W} y2={COURT.BASELINE_Y + offset} />
          <line x1={ COURT.PAINT_HALF_W} y1={COURT.BASELINE_Y + offset} x2={ COURT.PAINT_HALF_W + 12} y2={COURT.BASELINE_Y + offset} />
        </g>
      ))}
    </g>
  );
}
