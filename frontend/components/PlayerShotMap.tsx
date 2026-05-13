"use client";

import type { PlayerShots } from "@/lib/types";

type Props = {
  player: PlayerShots;
};

const VIEWBOX_X = 520; // -260..260
const VIEWBOX_Y = 480; // -50..430
const SHIFT_X = 260;   // to make all coords positive
const SHIFT_Y = 50;

export function PlayerShotMap({ player }: Props) {
  if (!player) return null;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_X} ${VIEWBOX_Y}`}
      className="h-full w-full max-w-[480px]"
      aria-label={`${player.name}'s playoff shot map`}
      role="img"
    >
      {/* Court outline — minimal: three-point arc, free-throw circle, hoop. */}
      <g stroke="currentColor" strokeWidth="0.6" fill="none" className="text-border">
        {/* Three-point line (NBA: 22ft corners, 23.75ft arc). Approximate path. */}
        <path
          d={`M ${SHIFT_X - 220} ${SHIFT_Y + 0} L ${SHIFT_X - 220} ${SHIFT_Y + 140} A 237.5 237.5 0 0 1 ${SHIFT_X + 220} ${SHIFT_Y + 140} L ${SHIFT_X + 220} ${SHIFT_Y + 0}`}
        />
        {/* Paint */}
        <rect x={SHIFT_X - 80} y={SHIFT_Y + 0} width={160} height={190} />
        {/* Free-throw circle */}
        <circle cx={SHIFT_X} cy={SHIFT_Y + 190} r="60" />
        {/* Hoop */}
        <circle cx={SHIFT_X} cy={SHIFT_Y + 0} r="7.5" />
      </g>

      {/* Shots */}
      {player.shots.map((shot, i) => (
        <circle
          key={i}
          cx={SHIFT_X + shot.x}
          cy={SHIFT_Y + shot.y}
          r="3"
          className={shot.made ? "fill-accent" : "fill-neg"}
          opacity="0.7"
        />
      ))}
    </svg>
  );
}
