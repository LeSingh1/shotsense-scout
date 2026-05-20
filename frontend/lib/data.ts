// Server-side data loader. Reads the JSON files produced by the Python
// stats/pattern scripts and passes them down as typed props.
//
// In Next.js App Router these imports resolve at build time; the data
// is serialized into the static HTML payload with no runtime fetch.

import playerProfiles from "./data/player_profiles.json";
import teamProfiles from "./data/team_profiles.json";
import gameLogs from "./data/game_logs.json";
import patterns from "./data/patterns.json";
import shots from "./data/shots.json";
import meta from "./data/meta.json";

import type {
  AppData,
  GameLogEntry,
  Meta,
  Pattern,
  PlayerProfile,
  ShotsMap,
  TeamProfile,
} from "./types";

export function getAppData(): AppData {
  return {
    playerProfiles: playerProfiles as unknown as PlayerProfile[],
    teamProfiles: teamProfiles as unknown as TeamProfile[],
    gameLogs: gameLogs as unknown as GameLogEntry[],
    patterns: patterns as unknown as Pattern[],
    shots: shots as unknown as ShotsMap,
    meta: meta as unknown as Meta,
  };
}
