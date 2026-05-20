"use client";

import { usePlayerStore } from "@/stores/playerStore";
import { ShotMap } from "./ShotMap";
import { formatPct } from "@/lib/format";
import type { ShotsMap } from "@/lib/types";

type Props = {
  shots: ShotsMap;
};

export function CourtPanel({ shots }: Props) {
  const { selectedPlayer } = usePlayerStore();

  if (!selectedPlayer) {
    return (
      <div className="flex items-center justify-center h-full text-dim text-sm">
        Select a player to view their shot chart.
      </div>
    );
  }

  const playerShots = shots[String(selectedPlayer.player_id)];
  const shotDots = playerShots?.shots ?? [];

  return (
    <div className="p-6">
      {/* Player header */}
      <div className="mb-4">
        <div className="flex items-baseline gap-3 mb-1">
          <h2 className="text-xl font-semibold text-text">
            {selectedPlayer.player_name}
          </h2>
          <span className="text-xs text-dim font-mono uppercase">
            {selectedPlayer.team}
          </span>
        </div>
        <div className="flex gap-6 text-sm">
          <Stat label="FG%" value={formatPct(selectedPlayer.overall_fg_pct)} />
          <Stat label="xFG%" value={formatPct(selectedPlayer.overall_xfg)} />
          <Stat
            label="Shots"
            value={String(selectedPlayer.total_shots)}
            mono
          />
          <Stat
            label="Games"
            value={String(selectedPlayer.games_played)}
            mono
          />
        </div>
      </div>

      {/* Shot map */}
      <div className="bg-surface rounded-lg border border-border p-4">
        {shotDots.length > 0 ? (
          <ShotMap shots={shotDots} />
        ) : (
          <div className="py-20 text-center text-dim text-sm">
            No shot data available for this player.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-[10px] text-dim font-mono uppercase tracking-wider">
        {label}
      </span>
      <span className={`ml-1.5 ${mono ? "font-mono" : ""} text-text`}>
        {value}
      </span>
    </div>
  );
}
