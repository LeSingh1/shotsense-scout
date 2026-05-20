"use client";

import { useEffect } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { usePatternStore } from "@/stores/patternStore";
import { PlayerSelect } from "./PlayerSelect";
import { PatternList } from "@/components/Patterns/PatternList";
import type { AppData } from "@/lib/types";

type Props = {
  data: AppData;
};

export function FilterPanel({ data }: Props) {
  const { setPlayers, setTeams, setPlayer, selectedPlayer } = usePlayerStore();
  const { setPatterns } = usePatternStore();

  // Initialize stores on mount
  useEffect(() => {
    setPlayers(data.playerProfiles);
    setTeams(data.teamProfiles);
    // Select the player with the most shots by default
    const sorted = [...data.playerProfiles].sort(
      (a, b) => b.total_shots - a.total_shots,
    );
    if (sorted.length > 0) {
      setPlayer(sorted[0]);
    }
  }, [data, setPlayers, setTeams, setPlayer]);

  // Update patterns when player changes
  useEffect(() => {
    if (!selectedPlayer) {
      setPatterns([]);
      return;
    }
    const playerPatterns = data.patterns.filter(
      (p) => p.player_id === selectedPlayer.player_id,
    );
    setPatterns(playerPatterns);
  }, [selectedPlayer, data.patterns, setPatterns]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2">
          Player
        </div>
        <PlayerSelect />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
            Patterns Detected
          </div>
          <PatternList />
        </div>
      </div>
    </div>
  );
}
