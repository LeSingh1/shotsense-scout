"use client";

import { useMemo, useState } from "react";
import type { RankingRow, ShotsMap } from "@/lib/types";
import {
  cn,
  formatPercent,
  formatSignedDelta,
} from "@/lib/format";
import { NumberDisplay } from "@/components/ui/NumberDisplay";
import { PlayerShotMap } from "./PlayerShotMap";

type Props = {
  ranking: RankingRow[];
  shots: ShotsMap;
  /** Player to display by default (passed from page; clicking a leaderboard row updates it). */
  selectedPlayerId: number;
  onPlayerSelect: (player: RankingRow) => void;
};

/**
 * §3 Explorer — search + per-player detail.
 *
 * State behavior (from /plan-design-review):
 *  - First render: shows the rank-1 player (pre-loaded from props, no dead state).
 *  - No-match query: keeps the last valid player visible; a muted note above the
 *    input explains the mismatch.
 *  - Search debounced 150ms.
 */
export function Explorer({ ranking, shots, selectedPlayerId, onPlayerSelect }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce input
  useMemo(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => clearTimeout(id);
  }, [query]);

  // Lookup map for fuzzy match — case-insensitive substring is enough here.
  const matched = useMemo(() => {
    if (!debouncedQuery) return null;
    const q = debouncedQuery.toLowerCase();
    return ranking.find((p) => p.player_name.toLowerCase().includes(q)) ?? null;
  }, [ranking, debouncedQuery]);

  // If we matched, update selected; otherwise keep last valid selectedPlayerId.
  // We avoid useEffect by lifting this to a derived value at render time.
  const effectivePlayer =
    matched ??
    ranking.find((p) => p.player_id === selectedPlayerId) ??
    ranking[0];

  if (matched && matched.player_id !== selectedPlayerId) {
    // Defer the parent update; React will re-render once after the click handler.
    queueMicrotask(() => onPlayerSelect(matched));
  }

  const playerShots = shots[String(effectivePlayer.player_id)];
  const noMatch = debouncedQuery.length > 0 && matched === null;

  return (
    <section
      id="explorer"
      className="px-6 py-24 md:px-20 md:py-40"
      aria-labelledby="explorer-heading"
    >
      <header className="mb-12 flex flex-col items-baseline gap-6 border-b border-border pb-6 md:flex-row md:gap-12">
        <span className="num font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
          03 / Explorer
        </span>
        <h2
          id="explorer-heading"
          className="font-display text-[40px] font-medium leading-none tracking-[-0.03em] md:text-[64px]"
        >
          Search any player.
        </h2>
      </header>

      {/* Muted no-match note */}
      {noMatch && (
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.08em] text-muted">
          No match for &lsquo;{debouncedQuery}&rsquo; — still showing{" "}
          {effectivePlayer.player_name}.
        </p>
      )}

      <div className="mb-12 border-b border-border pb-4">
        <input
          id="explorer-search"
          type="search"
          inputMode="search"
          placeholder="Type a player name..."
          aria-label="Search for a player"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(
            "num w-full bg-transparent font-mono text-2xl uppercase tracking-[0.04em] text-text placeholder:text-muted/60 md:text-4xl",
            "border-none outline-none",
          )}
        />
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          Press <span className="text-text">/</span> to focus from anywhere on the page
        </p>
      </div>

      {/* Player detail */}
      <div className="grid grid-cols-1 gap-12 md:grid-cols-[1fr_1fr]">
        {/* Stat block */}
        <div className="flex flex-col gap-8">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              {effectivePlayer.n_shots} shots · 2025-26 playoffs
            </div>
            <div className="mt-2 font-display text-4xl font-medium tracking-[-0.02em] md:text-6xl">
              {effectivePlayer.player_name}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-3">
            <StatCell
              label="Shrunk Δ"
              value={formatSignedDelta(effectivePlayer.shrunk_delta)}
              valueClass={
                effectivePlayer.shrunk_delta >= 0 ? "text-accent" : "text-neg"
              }
              big
            />
            <StatCell label="Raw Δ" value={formatSignedDelta(effectivePlayer.raw_delta)} />
            <StatCell label="Weight" value={effectivePlayer.weight.toFixed(2)} />
            <StatCell label="Actual FG%" value={formatPercent(effectivePlayer.actual_fg)} />
            <StatCell label="Mean xFG%" value={formatPercent(effectivePlayer.mean_xfg)} />
            <StatCell label="N shots" value={String(effectivePlayer.n_shots)} />
          </div>

          {effectivePlayer.ci_lo !== null && effectivePlayer.ci_hi !== null && (
            <div className="border-t border-border pt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              Bootstrap 95% CI: {" "}
              <NumberDisplay className="text-text">
                {`[${formatSignedDelta(effectivePlayer.ci_lo)}, ${formatSignedDelta(effectivePlayer.ci_hi)}]`}
              </NumberDisplay>
            </div>
          )}
        </div>

        {/* Shot map */}
        <div className="flex items-start justify-center text-muted">
          {playerShots ? (
            <PlayerShotMap player={playerShots} />
          ) : (
            <p className="font-mono text-xs uppercase tracking-[0.08em]">
              No shot data for this player.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function StatCell({
  label,
  value,
  valueClass,
  big,
}: {
  label: string;
  value: string;
  valueClass?: string;
  big?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.10em] text-muted">
        {label}
      </div>
      <NumberDisplay
        className={cn(
          "mt-1 block font-bold tracking-[-0.02em]",
          big ? "text-4xl md:text-5xl" : "text-2xl",
          valueClass ?? "text-text",
        )}
      >
        {value}
      </NumberDisplay>
    </div>
  );
}
