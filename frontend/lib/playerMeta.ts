// Static metadata lookup keyed by NBA stats player ID. Used to enrich
// dynamically-derived rosters with team / colors / jersey / city.
//
// Coverage: the high-volume playoff scorers we expect to see in the top-N.
// If a player ends up in the dynamic roster but isn't in this map, we still
// fall back to readable defaults — the build never breaks.

export type PlayerMeta = {
  jersey: number;
  team: string;
  city: string;
  primary: string;
  secondary: string;
};

export const PLAYER_META: Record<number, PlayerMeta> = {
  // 2025-26 playoff top-volume scorers (verified to be in our dataset)
  1630595: { jersey: 2,  team: "DET", city: "Detroit",        primary: "#C8102E", secondary: "#1D42BA" }, // Cade Cunningham
  1628378: { jersey: 45, team: "CLE", city: "Cleveland",      primary: "#860038", secondary: "#FDBB30" }, // Donovan Mitchell
  1630178: { jersey: 0,  team: "PHI", city: "Philadelphia",   primary: "#006BB6", secondary: "#ED174C" }, // Tyrese Maxey
  1628973: { jersey: 11, team: "NYK", city: "New York",       primary: "#006BB6", secondary: "#F58426" }, // Jalen Brunson
  2544:    { jersey: 23, team: "LAL", city: "Los Angeles",    primary: "#552583", secondary: "#FDB927" }, // LeBron James
  202699:  { jersey: 12, team: "DET", city: "Detroit",        primary: "#C8102E", secondary: "#1D42BA" }, // Tobias Harris
  1630183: { jersey: 3,  team: "MIN", city: "Minnesota",      primary: "#0C2340", secondary: "#78BE20" }, // Jaden McDaniels
  203944:  { jersey: 30, team: "MIN", city: "Minnesota",      primary: "#0C2340", secondary: "#78BE20" }, // Julius Randle
  1642845: { jersey: 77, team: "PHI", city: "Philadelphia",   primary: "#006BB6", secondary: "#ED174C" }, // VJ Edgecombe
  1628368: { jersey: 4,  team: "SAS", city: "San Antonio",    primary: "#C4CED4", secondary: "#000000" }, // De'Aaron Fox
  1630162: { jersey: 5,  team: "MIN", city: "Minnesota",      primary: "#0C2340", secondary: "#78BE20" }, // Anthony Edwards
  201935:  { jersey: 1,  team: "LAC", city: "Los Angeles",    primary: "#C8102E", secondary: "#1D428A" }, // James Harden
  1628369: { jersey: 0,  team: "BOS", city: "Boston",         primary: "#007A33", secondary: "#BA9653" }, // Jayson Tatum
  1628983: { jersey: 2,  team: "OKC", city: "Oklahoma City",  primary: "#007AC1", secondary: "#EF3B24" }, // Shai Gilgeous-Alexander
  1626164: { jersey: 1,  team: "PHX", city: "Phoenix",        primary: "#1D1160", secondary: "#E56020" }, // Devin Booker
  203999:  { jersey: 15, team: "DEN", city: "Denver",         primary: "#0E2240", secondary: "#FEC524" }, // Nikola Jokić
  1627759: { jersey: 7,  team: "BOS", city: "Boston",         primary: "#007A33", secondary: "#BA9653" }, // Jaylen Brown
  1631094: { jersey: 5,  team: "ORL", city: "Orlando",        primary: "#0077C0", secondary: "#000000" }, // Paolo Banchero
  202331:  { jersey: 8,  team: "PHI", city: "Philadelphia",   primary: "#006BB6", secondary: "#ED174C" }, // Paul George
  1629060: { jersey: 28, team: "LAL", city: "Los Angeles",    primary: "#552583", secondary: "#FDB927" }, // Rui Hachimura
  1628392: { jersey: 55, team: "OKC", city: "Oklahoma City",  primary: "#007AC1", secondary: "#EF3B24" }, // Isaiah Hartenstein
  1628969: { jersey: 25, team: "NYK", city: "New York",       primary: "#006BB6", secondary: "#F58426" }, // Mikal Bridges
};

/** Fallback metadata for any player who's missing from the table. */
export const DEFAULT_META: PlayerMeta = {
  jersey: 0,
  team: "NBA",
  city: "—",
  primary: "#FF2D6F",
  secondary: "#A1A1A1",
};

export function metaFor(id: number): PlayerMeta {
  return PLAYER_META[id] ?? DEFAULT_META;
}

export function headshotUrl(playerId: number): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png`;
}
