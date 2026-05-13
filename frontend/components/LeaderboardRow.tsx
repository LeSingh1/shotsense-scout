"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { RankingRow } from "@/lib/types";
import { cn, formatPercent, formatSignedDelta } from "@/lib/format";
import { NumberDisplay } from "@/components/ui/NumberDisplay";

type Props = {
  player: RankingRow;
  rank: number;
  /** Maximum |shrunk_delta| across the visible rows; used to scale the bar. */
  maxMagnitude: number;
  delayMs: number;
  /** True for the top-10 column (positive deltas). */
  positive: boolean;
  /** Click handler — pass the player into the explorer. */
  onSelect: (player: RankingRow) => void;
};

export function LeaderboardRow({
  player,
  rank,
  maxMagnitude,
  delayMs,
  positive,
  onSelect,
}: Props) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const widthPct = Math.min(
    100,
    Math.max(8, (Math.abs(player.shrunk_delta) / maxMagnitude) * 100),
  );

  return (
    <motion.button
      type="button"
      className={cn(
        "group relative grid w-full grid-cols-[28px_1fr_120px_72px] items-center gap-4 border-b border-border py-4 text-left",
        "focus-visible:bg-surface/50",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={() => onSelect(player)}
      initial={false}
    >
      <NumberDisplay className="text-[13px] text-muted">
        {String(rank).padStart(2, "0")}
      </NumberDisplay>

      <span className="font-body text-lg font-medium tracking-[-0.01em]">
        {player.player_name}
      </span>

      <div className="relative h-1 w-full bg-border">
        <motion.div
          layoutId={`player-${player.player_id}-bar`}
          className={cn(
            "absolute inset-y-0",
            positive ? "left-0 bg-accent" : "right-0 bg-neg",
          )}
          initial={reduce ? false : { width: 0 }}
          whileInView={{ width: `${widthPct}%` }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{
            duration: 0.6,
            delay: reduce ? 0 : delayMs / 1000,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      </div>

      <NumberDisplay
        className={cn(
          "text-right text-[17px] font-bold tracking-[-0.02em]",
          positive ? "text-accent" : "text-neg",
        )}
      >
        {formatSignedDelta(player.shrunk_delta)}
      </NumberDisplay>

      {/* Breakdown reveal on hover/focus */}
      <motion.div
        className="col-span-4 grid grid-cols-4 gap-6 overflow-hidden pl-12 pt-0 font-mono text-[11px] uppercase tracking-[0.08em] text-muted"
        animate={{
          height: hovered ? "auto" : 0,
          opacity: hovered ? 1 : 0,
          marginTop: hovered ? 16 : 0,
        }}
        initial={false}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <BreakdownCell k="n shots" v={String(player.n_shots)} />
        <BreakdownCell k="raw Δ" v={formatSignedDelta(player.raw_delta)} />
        <BreakdownCell k="weight" v={player.weight.toFixed(2)} />
        <BreakdownCell k="actual FG%" v={formatPercent(player.actual_fg)} />
      </motion.div>
    </motion.button>
  );
}

function BreakdownCell({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span>{k}</span>
      <NumberDisplay className="mt-1 block text-base font-bold tracking-[-0.02em] text-text">
        {v}
      </NumberDisplay>
    </div>
  );
}
