"use client";

/**
 * Accurate NBA half-court geometry in court coordinates (tenths of a foot).
 *
 *   Hoop is at (0, 0). Baseline is at y = -50 (5 ft behind hoop center).
 *   The corner 3-point line is at x = ±220 (22 ft from hoop laterally) and
 *   ends at y = 89.5 — the *exact* point where the 22 ft corner line meets
 *   the 23.75 ft arc:
 *
 *       sqrt(237.5² − 220²) = sqrt(8006.25) ≈ 89.5
 *
 *   That intersection is what fixes the "stretched corners" look.
 *
 * The SVG is drawn in court coords with stroke="currentColor" so callers
 * inherit color via Tailwind / CSS variables. Width/height are intentionally
 * unset — pass an explicit viewBox + size on the wrapping <svg>.
 */
export function CourtMarkings({ strokeOpacity = 0.18 }: { strokeOpacity?: number }) {
  const CORNER_Y = 89.5;
  return (
    <g
      stroke="currentColor"
      strokeOpacity={strokeOpacity}
      strokeWidth="1.5"
      fill="none"
      strokeLinejoin="round"
    >
      {/* Baseline */}
      <line x1={-260} y1={-50} x2={260} y2={-50} />

      {/* Three-point line: corner stubs (correct length 89.5) + arc */}
      <path
        d={`M -220 -50 L -220 ${CORNER_Y} A 237.5 237.5 0 0 1 220 ${CORNER_Y} L 220 -50`}
      />

      {/* Paint (key) — 16 ft wide × 19 ft deep */}
      <rect x={-80} y={-50} width={160} height={190} />

      {/* Free-throw line (top of paint) */}
      <line x1={-80} y1={140} x2={80} y2={140} />

      {/* Free-throw circle — top half solid, bottom half dashed (NBA convention) */}
      <path d="M -60 140 A 60 60 0 0 1 60 140" />
      <path d="M -60 140 A 60 60 0 0 0 60 140" strokeDasharray="6 4" />

      {/* Restricted area arc — 4 ft radius from hoop */}
      <path d={`M -40 -50 L -40 0 A 40 40 0 0 0 40 0 L 40 -50`} />

      {/* Backboard — 6 ft wide centered behind hoop */}
      <line x1={-30} y1={-12.5} x2={30} y2={-12.5} strokeWidth="2.5" />

      {/* Hoop — 7.5 inch radius */}
      <circle cx={0} cy={0} r={7.5} strokeWidth="1.8" />

      {/* Side lane markers (block + tick lines) */}
      <line x1={-80} y1={20} x2={-90} y2={20} />
      <line x1={ 80} y1={20} x2={ 90} y2={20} />
      <line x1={-80} y1={50} x2={-90} y2={50} />
      <line x1={ 80} y1={50} x2={ 90} y2={50} />
      <line x1={-80} y1={80} x2={-90} y2={80} />
      <line x1={ 80} y1={80} x2={ 90} y2={80} />
    </g>
  );
}

/** Standard court viewBox: x: -260..260, y: -50..430. */
export const COURT_VIEWBOX = "-260 -50 520 480";
