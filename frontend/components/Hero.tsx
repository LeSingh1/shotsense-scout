"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Meta, RankingRow } from "@/lib/types";
import { formatGameDate, formatInt, formatSignedDelta } from "@/lib/format";
import { NumberDisplay } from "@/components/ui/NumberDisplay";

type Props = {
  meta: Meta;
  topPlayer: RankingRow;
};

export function Hero({ meta, topPlayer }: Props) {
  const reduce = useReducedMotion();

  return (
    <section
      id="home"
      className="relative flex min-h-[100svh] flex-col px-6 pt-24 pb-16 md:px-20 md:pt-32 md:pb-20"
      aria-labelledby="hero-heading"
    >
      <span className="num font-mono text-[13px] font-medium uppercase tracking-[0.08em] text-muted">
        01 / Overview
      </span>

      <div className="flex flex-1 items-end">
        <div className="grid w-full grid-cols-1 items-end gap-14 md:grid-cols-[1fr_auto] md:gap-14">
          {/* Headline */}
          <motion.h1
            id="hero-heading"
            className="font-display text-[56px] font-medium leading-[0.94] tracking-[-0.04em] md:text-[88px] lg:text-[104px]"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            Shot quality,
            <br />
            calibrated.
          </motion.h1>

          {/* Hero number block */}
          <div className="md:text-right">
            <NumberDisplay
              animateOnReveal
              className="block text-[96px] font-bold leading-[0.85] tracking-[-0.06em] text-accent md:text-[140px] lg:text-[168px]"
              ariaLabel={`${topPlayer.player_name}, shrunk FG percent over expected, plus ${topPlayer.shrunk_delta}`}
            >
              {formatSignedDelta(topPlayer.shrunk_delta)}
            </NumberDisplay>
            <div className="mt-6 font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
              Shrunk FG% over expected · top performer
            </div>
            <div className="mt-1 font-display text-2xl font-medium tracking-[-0.02em] md:text-[28px]">
              {topPlayer.player_name}
            </div>
          </div>
        </div>
      </div>

      {/* Metabar */}
      <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-border pt-6 md:mt-16 md:grid-cols-4">
        {[
          { k: "Season", v: meta.season },
          { k: "Shots", v: formatInt(meta.n_shots), isNum: true },
          { k: "Games", v: formatInt(meta.n_games), isNum: true },
          { k: "Updated", v: formatGameDate(meta.run_timestamp), isNum: true },
        ].map((cell, i) => (
          <div
            key={cell.k}
            className={`flex flex-col gap-2 ${
              i > 0 ? "md:border-l md:border-border md:pl-6" : ""
            }`}
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              {cell.k}
            </span>
            {cell.isNum ? (
              <NumberDisplay className="text-lg font-bold tracking-[-0.01em] text-text">
                {cell.v}
              </NumberDisplay>
            ) : (
              <span className="font-mono text-lg font-bold uppercase tracking-[-0.01em] text-text">
                {cell.v}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
