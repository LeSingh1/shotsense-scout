// Single source of truth for NBA half-court geometry — in NBA API native
// coordinates (tenths of a foot) with the HOOP at the origin (0, 0).
//
// Coordinate system (matches `LOC_X` / `LOC_Y` from `shotchartdetail`):
//   - x ∈ [-250, +250]  → ±25 ft from the hoop laterally
//   - y ∈ [-52.5, +417.5] → −5.25 ft (baseline, behind hoop) to 41.75 ft
//     (half-court line). Hoop is at y=0, 5.25 ft from the baseline.
//
// When rendered with `viewBox="-250 -52.5 500 470"` and SVG y growing down,
// the baseline sits at the TOP of the canvas and shots fan out below. A shot
// with `LOC_X=120, LOC_Y=240` plots at SVG coords (120, 240) directly — NO
// flips, NO shifts. That one-to-one mapping is the entire point of this
// rewrite: every dot lands where the API says, every arc lands where the
// official dimensions say.

export const COURT = {
  // viewBox geometry
  X_MIN: -250,
  Y_MIN: -52.5,
  W: 500,
  H: 470,

  // Hoop center is the origin.
  HOOP_X: 0,
  HOOP_Y: 0,

  RIM_R: 7.5,             // 9 in rim radius

  // Baseline is BEHIND the hoop. The 5.25 ft offset is why y=-52.5.
  BASELINE_Y: -52.5,

  // Backboard sits 4 ft from the baseline → 40 units in front of baseline.
  BACKBOARD_Y: -12.5,     // baseline + 40 = -52.5 + 40
  BACKBOARD_HALF_W: 30,   // 6 ft wide

  // Paint (key) — 16 ft wide × 19 ft deep (from baseline)
  PAINT_HALF_W: 80,
  // Paint extends from y = -52.5 (baseline) to y = 137.5 (19 ft in front)
  PAINT_TOP_Y: 137.5,

  // Free-throw line at top of the paint
  FT_Y: 137.5,
  FT_CIRCLE_R: 60,        // 6 ft radius

  // Restricted area — 4 ft from hoop
  RA_R: 40,

  // Three-point geometry
  // - corner-3 line at x = ±220 (22 ft from hoop)
  // - arc radius 237.5 (23.75 ft) centered on the hoop
  // - the corner line ends where it MATHEMATICALLY meets the arc:
  //     y = sqrt(237.5² - 220²) = sqrt(8006.25) = 89.5
  //   The NBA rulebook nominal length is 14 ft (y = 140 − baseline-offset),
  //   but we use the exact intersection so the arc closes cleanly with no
  //   visible gap.
  CORNER_X: 220,
  CORNER_Y_END: 89.5,
  ARC_R: 237.5,

  // Half-court line
  MIDCOURT_Y: 417.5,
} as const;

/** Distance from hoop in feet (input is tenths of a foot). */
export function shotDistFt(x: number, y: number): number {
  return Math.hypot(x, y) / 10;
}

/**
 * Classify a shot as 2PT vs 3PT from its (x, y) alone. Used by the debug
 * overlay to verify the arc/coordinate mapping is correct.
 *
 *   3PT iff |x| ≥ 220 (corner-3 zone) OR sqrt(x²+y²) ≥ 237.5 (arc zone)
 */
export function isThreePointer(x: number, y: number): boolean {
  if (Math.abs(x) >= COURT.CORNER_X) return true;
  return Math.hypot(x, y) >= COURT.ARC_R;
}
