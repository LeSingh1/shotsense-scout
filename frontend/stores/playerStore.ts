"use client";

import { create } from "zustand";
import type { PlayerProfile, TeamProfile } from "@/lib/types";

type PlayerStore = {
  players: PlayerProfile[];
  teams: TeamProfile[];
  selectedPlayer: PlayerProfile | null;
  selectedTeam: TeamProfile | null;
  setPlayers: (players: PlayerProfile[]) => void;
  setTeams: (teams: TeamProfile[]) => void;
  setPlayer: (player: PlayerProfile) => void;
  setTeam: (team: TeamProfile | null) => void;
};

export const usePlayerStore = create<PlayerStore>((set) => ({
  players: [],
  teams: [],
  selectedPlayer: null,
  selectedTeam: null,
  setPlayers: (players) => set({ players }),
  setTeams: (teams) => set({ teams }),
  setPlayer: (player) =>
    set((state) => ({
      selectedPlayer: player,
      selectedTeam:
        state.teams.find((t) => t.team_abbr === player.team) ?? null,
    })),
  setTeam: (team) => set({ selectedTeam: team }),
}));
