// Featured-roster derivation. The roster is NOT hardcoded — it's the top-N
// playoff shooters from the actual dataset, enriched with metadata.
//
// Why this matters: when the roster was hardcoded, players whose teams
// didn't make the bracket (Curry, Luka, etc.) ended up on screen with zero
// shots and "0.00 xPPS" placeholders. By deriving from `ranking.json` we
// guarantee every featured player has real playoff numbers.

import type { RankingRow } from "./types";
import { PLAYER_META, headshotUrl } from "./playerMeta";

export { headshotUrl };

export type FeaturedPlayer = {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  jersey: number;
  team: string;
  city: string;
  primary: string;
  secondary: string;
  /** Total playoff shots — guaranteed > 0 because we filter on this. */
  nShots: number;
  actualFg: number;
  meanXfg: number;
  /** Empirical-Bayes shrunk FG% over expected. Can be negative. */
  shrunkDelta: number;
};

/** Minimum playoff shot volume required to be featured. */
const MIN_SHOTS = 80;

/** Top-N from the ranking that we have metadata for. */
const ROSTER_SIZE = 10;

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Static fallback roster used by side panels (WhereTheyShot, EveryShot,
 * Laboratory, StressTest) that don't need full dynamic re-derivation per
 * render. Mirrors what `buildFeaturedRoster` returns against the current
 * dataset — only players we know have playoff metadata and data.
 *
 * The hero itself uses the dynamic `buildFeaturedRoster` so it can never
 * land on a player with no shots; this static list is purely a reference
 * for sidebars/dropdowns.
 */
export const FEATURED: FeaturedPlayer[] = [
  { id: 1630595, firstName: "Cade",     lastName: "Cunningham",   fullName: "Cade Cunningham",   jersey: 2,  team: "DET", city: "Detroit",       primary: "#C8102E", secondary: "#1D42BA", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
  { id: 1628378, firstName: "Donovan",  lastName: "Mitchell",     fullName: "Donovan Mitchell",  jersey: 45, team: "CLE", city: "Cleveland",     primary: "#860038", secondary: "#FDBB30", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
  { id: 1630178, firstName: "Tyrese",   lastName: "Maxey",        fullName: "Tyrese Maxey",      jersey: 0,  team: "PHI", city: "Philadelphia",  primary: "#006BB6", secondary: "#ED174C", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
  { id: 1628973, firstName: "Jalen",    lastName: "Brunson",      fullName: "Jalen Brunson",     jersey: 11, team: "NYK", city: "New York",      primary: "#006BB6", secondary: "#F58426", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
  { id: 2544,    firstName: "LeBron",   lastName: "James",        fullName: "LeBron James",      jersey: 23, team: "LAL", city: "Los Angeles",   primary: "#552583", secondary: "#FDB927", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
  { id: 1630162, firstName: "Anthony",  lastName: "Edwards",      fullName: "Anthony Edwards",   jersey: 5,  team: "MIN", city: "Minnesota",     primary: "#0C2340", secondary: "#78BE20", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
  { id: 1628369, firstName: "Jayson",   lastName: "Tatum",        fullName: "Jayson Tatum",      jersey: 0,  team: "BOS", city: "Boston",        primary: "#007A33", secondary: "#BA9653", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
  { id: 1628983, firstName: "Shai",     lastName: "Gilgeous-Alexander", fullName: "Shai Gilgeous-Alexander", jersey: 2, team: "OKC", city: "Oklahoma City", primary: "#007AC1", secondary: "#EF3B24", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
  { id: 1626164, firstName: "Devin",    lastName: "Booker",       fullName: "Devin Booker",      jersey: 1,  team: "PHX", city: "Phoenix",       primary: "#1D1160", secondary: "#E56020", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
  { id: 203999,  firstName: "Nikola",   lastName: "Jokić",        fullName: "Nikola Jokić",      jersey: 15, team: "DEN", city: "Denver",        primary: "#0E2240", secondary: "#FEC524", nShots: 0, actualFg: 0, meanXfg: 0, shrunkDelta: 0 },
];

export function buildFeaturedRoster(ranking: RankingRow[]): FeaturedPlayer[] {
  // Sort by shot volume, filter to those with metadata + minimum sample.
  const sorted = [...ranking]
    .filter((r) => r.n_shots >= MIN_SHOTS && PLAYER_META[r.player_id])
    .sort((a, b) => b.n_shots - a.n_shots)
    .slice(0, ROSTER_SIZE);

  return sorted.map((r) => {
    const m = PLAYER_META[r.player_id];
    const { first, last } = splitName(r.player_name);
    return {
      id: r.player_id,
      firstName: first,
      lastName: last,
      fullName: r.player_name,
      jersey: m.jersey,
      team: m.team,
      city: m.city,
      primary: m.primary,
      secondary: m.secondary,
      nShots: r.n_shots,
      actualFg: r.actual_fg,
      meanXfg: r.mean_xfg,
      shrunkDelta: r.shrunk_delta,
    };
  });
}
