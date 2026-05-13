"use client";

import { memo } from "react";
import { motion } from "motion/react";
import type { HexCell } from "@/lib/types";

type Mode = "volume" | "fg" | "xfg";

type Props = {
  cell: HexCell;
  size: number;
  mode: Mode;
  /** League-wide max for the current mode (used to normalize color intensity). */
  domain: { min: number; max: number };
};

const HEX_PATH_RATIO = Math.sqrt(3) / 2;

function colorFor(value: number, domain: { min: number; max: number }): string {
  // Normalize 0..1
  const span = domain.max - domain.min || 1;
  const t = Math.min(1, Math.max(0, (value - domain.min) / span));
  // Two-stop gradient: muted at t=0, accent lime at t=1.
  // We do this as alpha-blended lime against a neutral muted base.
  const alpha = 0.15 + t * 0.85;
  return `rgba(159, 255, 107, ${alpha.toFixed(3)})`;
}

export const HexBin = memo(function HexBin({ cell, size, mode, domain }: Props) {
  const value = mode === "volume" ? cell.n : mode === "fg" ? cell.fg : cell.xfg;
  const h = size * HEX_PATH_RATIO;
  // Pointy-top hex centered at (cell.cx, cell.cy)
  const path = `M ${cell.cx} ${cell.cy - h} L ${cell.cx + size / 2} ${cell.cy - h / 2} L ${cell.cx + size / 2} ${cell.cy + h / 2} L ${cell.cx} ${cell.cy + h} L ${cell.cx - size / 2} ${cell.cy + h / 2} L ${cell.cx - size / 2} ${cell.cy - h / 2} Z`;

  return (
    <motion.path
      d={path}
      animate={{ fill: colorFor(value, domain) }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      stroke="rgba(10,10,10,0.85)"
      strokeWidth={0.5}
    />
  );
});
