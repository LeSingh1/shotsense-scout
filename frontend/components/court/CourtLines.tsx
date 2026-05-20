"use client";

// SVG half-court geometry. The coordinate system is 520x480 with
// shiftX=260, shiftY=50 to center the court in the viewBox.

const SX = 260; // horizontal center offset
const SY = 50;  // vertical offset from top

const STROKE = "var(--color-border)";
const STROKE_W = 1.2;

export function CourtLines() {
  return (
    <g>
      {/* Baseline */}
      <line
        x1={SX - 250}
        y1={SY}
        x2={SX + 250}
        y2={SY}
        stroke={STROKE}
        strokeWidth={STROKE_W}
      />

      {/* Sidelines */}
      <line
        x1={SX - 250}
        y1={SY}
        x2={SX - 250}
        y2={SY + 400}
        stroke={STROKE}
        strokeWidth={STROKE_W}
      />
      <line
        x1={SX + 250}
        y1={SY}
        x2={SX + 250}
        y2={SY + 400}
        stroke={STROKE}
        strokeWidth={STROKE_W}
      />

      {/* Paint / key (16ft wide = 80px each side) */}
      <rect
        x={SX - 80}
        y={SY}
        width={160}
        height={190}
        fill="none"
        stroke={STROKE}
        strokeWidth={STROKE_W}
      />

      {/* Free throw circle */}
      <circle
        cx={SX}
        cy={SY + 190}
        r={60}
        fill="none"
        stroke={STROKE}
        strokeWidth={STROKE_W}
        strokeDasharray="4 4"
      />

      {/* Restricted area arc */}
      <path
        d={`M ${SX - 40} ${SY} A 40 40 0 0 0 ${SX + 40} ${SY}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={STROKE_W}
        transform={`translate(0, 0)`}
      />

      {/* Hoop */}
      <circle
        cx={SX}
        cy={SY + 52}
        r={7.5}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.5}
      />

      {/* Backboard */}
      <line
        x1={SX - 30}
        y1={SY + 40}
        x2={SX + 30}
        y2={SY + 40}
        stroke={STROKE}
        strokeWidth={2}
      />

      {/* Three-point line */}
      {/* Corner segments (straight) */}
      <line
        x1={SX - 220}
        y1={SY}
        x2={SX - 220}
        y2={SY + 92}
        stroke={STROKE}
        strokeWidth={STROKE_W}
      />
      <line
        x1={SX + 220}
        y1={SY}
        x2={SX + 220}
        y2={SY + 92}
        stroke={STROKE}
        strokeWidth={STROKE_W}
      />

      {/* Three-point arc */}
      <path
        d={`M ${SX - 220} ${SY + 92} A 237.5 237.5 0 0 0 ${SX + 220} ${SY + 92}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={STROKE_W}
      />
    </g>
  );
}
