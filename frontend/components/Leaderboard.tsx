"use client";

import { useState } from "react";
import type { RankingRow } from "@/lib/types";
import { cn } from "@/lib/format";
import { LeaderboardRow } from "./LeaderboardRow";

type Props = {
  top: RankingRow[];
  bottom: RankingRow[];
  onSelectPlayer: (player: RankingRow) => void;
};

type Mode = "top" | "bottom" | "all";

export function Leaderboard({ top, bottom, onSelectPlayer }: Props) {
  const [mode, setMode] = useState<Mode>("top");
  const topMax = Math.max(...top.map((r) => Math.abs(r.shrunk_delta)));
  const bottomMax = Math.max(...bottom.map((r) => Math.abs(r.shrunk_delta)));

  return (
    <section
      id="leaderboard"
      className="px-6 py-24 md:px-20 md:py-40"
      aria-labelledby="leaderboard-heading"
    >
      <header className="mb-14 grid grid-cols-1 items-end gap-6 border-b border-border pb-6 md:grid-cols-[auto_1fr_auto] md:gap-12">
        <span className="num font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
          02 / Leaderboard
        </span>
        <h2
          id="leaderboard-heading"
          className="font-display text-[40px] font-medium leading-none tracking-[-0.03em] md:text-[64px]"
        >
          FG% over expected,
          <br className="hidden md:block" /> shrunk.
        </h2>
        <div className="grid gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted md:text-right">
          <span>shrunk Δ · bar length = magnitude</span>
          <span>
            <span className="text-accent">+ positive</span> · {" "}
            <span className="text-neg">− negative</span>
          </span>
        </div>
      </header>

      {/* Mode toggle */}
      <div className="mb-8 inline-flex border border-border" role="tablist">
        {(["top", "bottom", "all"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "num font-mono text-xs uppercase tracking-[0.10em] px-5 py-2.5 transition-colors",
              mode === m ? "bg-text text-bg" : "bg-transparent text-muted hover:text-text",
            )}
          >
            {m === "top" ? "Top 10" : m === "bottom" ? "Bottom 10" : "All players"}
          </button>
        ))}
      </div>

      {/* Boards */}
      {mode === "all" ? (
        <div className="grid grid-cols-1 gap-x-24 gap-y-0 md:grid-cols-2">
          <Column
            heading="Top 10 — outperformed expected"
            rows={top}
            maxMagnitude={topMax}
            positive
            onSelectPlayer={onSelectPlayer}
          />
          <Column
            heading="Bottom 10 — underperformed expected"
            rows={bottom}
            maxMagnitude={bottomMax}
            positive={false}
            onSelectPlayer={onSelectPlayer}
          />
        </div>
      ) : mode === "top" ? (
        <div className="grid grid-cols-1 gap-x-24 md:grid-cols-2">
          <Column
            heading="Top 10 — outperformed expected"
            rows={top}
            maxMagnitude={topMax}
            positive
            onSelectPlayer={onSelectPlayer}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-24 md:grid-cols-2">
          <div className="md:col-start-2">
            <Column
              heading="Bottom 10 — underperformed expected"
              rows={bottom}
              maxMagnitude={bottomMax}
              positive={false}
              onSelectPlayer={onSelectPlayer}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function Column({
  heading,
  rows,
  maxMagnitude,
  positive,
  onSelectPlayer,
}: {
  heading: string;
  rows: RankingRow[];
  maxMagnitude: number;
  positive: boolean;
  onSelectPlayer: (player: RankingRow) => void;
}) {
  return (
    <div>
      <h3 className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.12em] text-muted">
        {heading}
      </h3>
      {rows.map((player, i) => (
        <LeaderboardRow
          key={player.player_id}
          player={player}
          rank={i + 1}
          maxMagnitude={maxMagnitude}
          delayMs={i * 40}
          positive={positive}
          onSelect={onSelectPlayer}
        />
      ))}
    </div>
  );
}
